import { createErDocument, type DevDocument } from "@/model/document"
import { parseDocument, toJson } from "@/model/serialize"
import { documentStore } from "@/editor/document-store"
import { sessionStore } from "@/editor/session-store"
import type { Autosave } from "./autosave"
import type { DocumentDb, DocumentRecord } from "./db"
import { documentSession, type DocumentSessionState } from "./document-session"
import { chooseSavePath, suggestedFileName, type FileCapabilities, type OpenedFile } from "./file"
import { takeOver, tryOwn, type LockDeps, type Ownership } from "./lock"

/** Le operazioni su file che l'orchestrazione usa; in produzione vengono da `file.ts`, nei test sono finte. */
export interface FileOps {
  pickOpen(): Promise<OpenedFile | null>
  pickSave(suggested: string): Promise<FileSystemFileHandle | null>
  ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean>
  writeHandle(handle: FileSystemFileHandle, text: string): Promise<void>
  download(name: string, text: string): void
}

export interface DocumentIoDeps {
  db: DocumentDb
  files: FileOps
  caps: FileCapabilities
  autosave: Autosave
  lock: LockDeps
  /** Domanda sì/no all'utente (recupero di un buffer più recente del file). */
  confirm: (message: string) => boolean
  now?: () => number
}

export interface DocumentIo {
  /** All'avvio: riapre l'ultimo documento dal buffer, o ne crea uno nuovo. */
  restoreLast(): Promise<void>
  newDocument(): Promise<void>
  openWithPicker(): Promise<void>
  /** Da picker o da upload: il testo passa da `parseDocument`, che è il confine di fiducia. */
  openFile(opened: OpenedFile): Promise<void>
  openRecent(id: string): Promise<void>
  save(): Promise<void>
  saveAs(): Promise<void>
  /** Chiede all'altra scheda di cedere e riparte dal suo ultimo autosave. */
  takeControl(): Promise<void>
}

type SessionPatch = Partial<Omit<DocumentSessionState, "patch">>
type Mounted = Pick<DocumentSessionState, "fileName" | "handle" | "lastSavedAt" | "dirty">

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isNotFound = (e: unknown): boolean => e instanceof DOMException && e.name === "NotFoundError"

function hasContent(doc: DevDocument): boolean {
  switch (doc.diagram.type) {
    case "er":
      return Object.keys(doc.diagram.model.entities).length > 0
  }
}

/** Il record ha lavoro non ancora scritto su file. Un documento mai salvato è "sporco" solo se ha contenuto. */
function hasUnsaved(rec: DocumentRecord, doc: DevDocument): boolean {
  return rec.savedToFileAt === null ? hasContent(doc) : rec.updatedAt > rec.savedToFileAt
}

export function createDocumentIo(deps: DocumentIoDeps): DocumentIo {
  const { db, files, caps, autosave, lock, confirm, now = Date.now } = deps
  const session = () => documentSession.getState()
  const patch = (p: SessionPatch) => session().patch(p)
  const notice = (text: string) => patch({ notice: text })
  let ownership: Ownership | null = null

  /** Operazioni sul db: un fallimento non ferma l'app, la lascia senza rete di sicurezza e lo dice. */
  async function safe<T>(op: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await op()
    } catch (e) {
      patch({ persistence: "unavailable", notice: `Archivio locale non disponibile (${message(e)}): il lavoro non viene salvato automaticamente.` })
      return fallback
    }
  }

  function record(doc: DevDocument, over: Partial<DocumentRecord> = {}): DocumentRecord {
    const s = session()
    return { id: doc.id, name: doc.name, json: toJson(doc), fileName: s.fileName, handle: s.handle, updatedAt: now(), savedToFileAt: s.lastSavedAt, ...over }
  }

  function releaseOwnership(): void {
    const current = ownership
    ownership = null
    current?.release()
  }

  /** Prende la proprietà del documento; se la perde per cessione, la scheda passa in sola lettura. */
  async function own(docId: string, mode: "try" | "take"): Promise<boolean> {
    releaseOwnership()
    const cede = () => autosave.flush()
    const next = mode === "try" ? await tryOwn(docId, cede, lock) : await takeOver(docId, cede, lock)
    ownership = next
    if (next) {
      void next.lost.then(() => {
        if (ownership !== next) return // rilascio volontario: abbiamo già cambiato documento
        ownership = null
        patch({ readOnly: true })
      })
    }
    patch({ readOnly: next === null })
    return next !== null
  }

  /** Mette il documento negli store. La selezione e l'editing si azzerano: le chiavi erano di un altro documento. */
  function mount(doc: DevDocument, s: Mounted): void {
    documentStore.getState().load(doc)
    sessionStore.getState().setSelection([])
    sessionStore.getState().setEditing(null)
    patch({ docId: doc.id, ...s, notice: null })
  }

  function mountRecord(rec: DocumentRecord, doc: DevDocument): void {
    mount(doc, { fileName: rec.fileName, handle: rec.handle, lastSavedAt: rec.savedToFileAt, dirty: hasUnsaved(rec, doc) })
  }

  async function activate(doc: DevDocument, s: Mounted, over: Partial<DocumentRecord>): Promise<void> {
    mount(doc, s)
    await own(doc.id, "try")
    await safe(async () => {
      await db.put(record(doc, over))
      await db.setLastOpenedId(doc.id)
    }, undefined)
  }

  async function newDocument(): Promise<void> {
    const doc = createErDocument("Senza titolo")
    await activate(doc, { fileName: null, handle: null, lastSavedAt: null, dirty: false }, { savedToFileAt: null })
  }

  async function restoreLast(): Promise<void> {
    const id = await safe(() => db.getLastOpenedId(), null)
    const rec = id ? await safe(() => db.get(id), undefined) : undefined
    if (!rec) {
      await newDocument()
      return
    }
    const parsed = parseDocument(rec.json)
    if (!parsed.ok) {
      // Un buffer illeggibile è un difetto dell'app, non un errore dell'utente: non blocca l'avvio.
      await newDocument()
      notice(`Il documento salvato nel browser non è leggibile (${parsed.error}): ne è stato creato uno nuovo.`)
      return
    }
    mountRecord(rec, parsed.document)
    await own(rec.id, "try")
  }

  async function openFile(opened: OpenedFile): Promise<void> {
    const parsed = parseDocument(opened.text)
    if (!parsed.ok) {
      notice(`File non valido: ${parsed.error}`)
      return
    }
    let doc = parsed.document
    let lastSavedAt: number | null = now()
    let dirty = false
    // Stesso id già in biblioteca con lavoro non salvato: è il recupero dopo un crash, e decide l'utente.
    const existing = await safe(() => db.get(doc.id), undefined)
    if (existing && existing.json !== opened.text) {
      const buffered = parseDocument(existing.json)
      if (buffered.ok && hasUnsaved(existing, buffered.document)) {
        const restore = confirm(`"${doc.name}" ha modifiche non salvate nel browser, più recenti del file. Ripristinarle?\n\nAnnulla per aprire il file com'è.`)
        if (restore) {
          doc = buffered.document
          lastSavedAt = existing.savedToFileAt
          dirty = true
        }
      }
    }
    await activate(doc, { fileName: opened.name, handle: opened.handle, lastSavedAt, dirty }, { savedToFileAt: lastSavedAt })
  }

  async function openWithPicker(): Promise<void> {
    const opened = await files.pickOpen()
    if (opened) await openFile(opened)
  }

  async function openRecent(id: string): Promise<void> {
    const rec = await safe(() => db.get(id), undefined)
    if (!rec) {
      notice("Documento non trovato nell'archivio locale.")
      return
    }
    const parsed = parseDocument(rec.json)
    if (!parsed.ok) {
      notice(`Documento non leggibile: ${parsed.error}`)
      return
    }
    mountRecord(rec, parsed.document)
    await own(rec.id, "try")
    await safe(() => db.setLastOpenedId(rec.id), undefined)
  }

  async function write(forceNew: boolean): Promise<void> {
    const s = session()
    if (s.readOnly) return
    const doc = documentStore.getState().doc
    const json = toJson(doc)
    let handle = s.handle
    let fileName = s.fileName ?? suggestedFileName(doc.name)
    let path = chooseSavePath(caps, handle !== null, forceNew)
    if (path === "handle" && !(await files.ensureWritePermission(handle!))) path = "picker"
    if (path === "picker") {
      const picked = await files.pickSave(fileName)
      if (!picked) return
      handle = picked
      fileName = picked.name
    }
    try {
      if (path === "download") files.download(fileName, json)
      else await files.writeHandle(handle!, json)
    } catch (e) {
      if (isNotFound(e)) {
        // File spostato o cancellato: l'handle non serve più, si ricomincia da "salva con nome".
        patch({ handle: null })
        notice("Il file non esiste più: scegli dove salvarlo.")
        return
      }
      notice(`Salvataggio fallito: ${message(e)}`)
      return
    }
    const at = now()
    patch({ handle, fileName, lastSavedAt: at, dirty: false })
    await safe(() => db.put(record(doc, { handle, fileName, savedToFileAt: at, updatedAt: at })), undefined)
  }

  async function takeControl(): Promise<void> {
    const docId = session().docId
    const ok = await own(docId, "take")
    if (!ok) {
      notice("L'altra scheda non risponde: riprova, oppure chiudila.")
      return
    }
    // L'altra scheda ha scritto il suo ultimo stato prima di cedere: si riparte da quello.
    const rec = await safe(() => db.get(docId), undefined)
    if (rec) {
      const parsed = parseDocument(rec.json)
      if (parsed.ok) mountRecord(rec, parsed.document)
    }
  }

  return {
    restoreLast,
    newDocument,
    openWithPicker,
    openFile,
    openRecent,
    save: () => write(false),
    saveAs: () => write(true),
    takeControl,
  }
}
