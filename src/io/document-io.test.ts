import { beforeEach, describe, expect, it, vi } from "vitest"
import { createErDocument, type DevDocument } from "@/model/document"
import { parseDocument, toJson } from "@/model/serialize"
import { addEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { sessionStore } from "@/editor/session-store"
import type { DocumentDb, DocumentRecord } from "./db"
import { createDocumentIo, type DocumentIoDeps, type FileOps } from "./document-io"
import { documentSession } from "./document-session"
import type { LockDeps, LockRequester } from "./lock"

/** Un db in memoria con la stessa interfaccia del vero. */
function memoryDb(): DocumentDb & { records: Map<string, DocumentRecord>; last: string | null } {
  const records = new Map<string, DocumentRecord>()
  const db = {
    records,
    last: null as string | null,
    put: async (r: DocumentRecord) => { records.set(r.id, r) },
    get: async (id: string) => records.get(id),
    remove: async (id: string) => { records.delete(id) },
    listRecent: async () => [...records.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    getLastOpenedId: async () => db.last,
    setLastOpenedId: async (id: string) => { db.last = id },
  }
  return db
}

/** Lock sempre libero: la concorrenza fra schede è coperta da lock.test.ts. */
const freeLocks: LockRequester = { request: (name, _o, cb) => cb({ name, mode: "exclusive" }) }
let channel = 0
/** I canali restano aperti finché la proprietà non viene rilasciata: `unref` evita che tengano vivo il processo di Vitest. */
const lock = (): LockDeps => ({
  locks: freeLocks,
  openChannel: () => {
    const c = new BroadcastChannel(`io-test-${++channel}`)
    ;(c as unknown as { unref(): void }).unref()
    return c
  },
})

const handle = { name: "h.dd.json" } as unknown as FileSystemFileHandle

function files(over: Partial<FileOps> = {}): FileOps {
  return {
    pickOpen: vi.fn(async () => null),
    pickSave: vi.fn(async () => handle),
    ensureWritePermission: vi.fn(async () => true),
    writeHandle: vi.fn(async () => {}),
    download: vi.fn(),
    ...over,
  }
}

function deps(over: Partial<DocumentIoDeps> = {}): DocumentIoDeps & { db: ReturnType<typeof memoryDb>; files: FileOps } {
  return {
    db: memoryDb(),
    files: files(),
    caps: { pickers: true },
    autosave: { flush: vi.fn(async () => {}), stop: () => {} },
    lock: lock(),
    confirm: vi.fn(() => true),
    now: () => 1000,
    ...over,
  } as DocumentIoDeps & { db: ReturnType<typeof memoryDb>; files: FileOps }
}

const withEntity = (name: string, id: string): DevDocument => {
  const doc = createErDocument(name, id)
  const { recipe } = addEntity({}, { x: 0, y: 0 })
  documentStore.getState().load(doc)
  documentStore.getState().dispatch(recipe)
  return documentStore.getState().doc
}

const record = (doc: DevDocument, over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: doc.id, name: doc.name, json: toJson(doc), fileName: null, handle: null, updatedAt: 500, savedToFileAt: null, ...over,
})

beforeEach(() => {
  documentStore.getState().load(createErDocument("iniziale", "init"))
  sessionStore.getState().setSelection(["entity:x"])
  documentSession.getState().patch({ docId: "", fileName: null, handle: null, dirty: false, readOnly: false, lastSavedAt: null, persistence: "ok", notice: null })
})

describe("restoreLast", () => {
  it("senza record crea un documento nuovo, lo registra e lo rende proprietà della scheda", async () => {
    const d = deps()
    await createDocumentIo(d).restoreLast()
    const doc = documentStore.getState().doc
    expect(doc.id).not.toBe("init")
    expect(d.db.last).toBe(doc.id)
    expect(d.db.records.get(doc.id)?.json).toBe(toJson(doc))
    expect(documentSession.getState()).toMatchObject({ docId: doc.id, dirty: false, readOnly: false, fileName: null })
  })

  it("con un record riapre il documento com'era e la selezione si azzera", async () => {
    const d = deps()
    const saved = withEntity("salvato", "s1")
    d.db.records.set("s1", record(saved, { fileName: "s1.dd.json", updatedAt: 900, savedToFileAt: 800 }))
    d.db.last = "s1"
    await createDocumentIo(d).restoreLast()
    expect(documentStore.getState().doc).toEqual(saved)
    expect(documentStore.getState().past).toHaveLength(0)
    expect(sessionStore.getState().selection.size).toBe(0)
    expect(documentSession.getState()).toMatchObject({ docId: "s1", fileName: "s1.dd.json", lastSavedAt: 800, dirty: true })
  })

  it("un record mai salvato su file è sporco solo se ha contenuto", async () => {
    const d = deps()
    const empty = createErDocument("vuoto", "e1")
    d.db.records.set("e1", record(empty))
    d.db.last = "e1"
    await createDocumentIo(d).restoreLast()
    expect(documentSession.getState().dirty).toBe(false)
  })

  it("un record illeggibile produce un documento nuovo e un avviso", async () => {
    const d = deps()
    d.db.records.set("bad", { ...record(createErDocument("x", "bad")), json: "{ non json" })
    d.db.last = "bad"
    await createDocumentIo(d).restoreLast()
    expect(documentStore.getState().doc.id).not.toBe("bad")
    expect(documentSession.getState().notice).toContain("non è leggibile")
  })

  it("se il db fallisce si lavora comunque, con persistenza non disponibile", async () => {
    const d = deps()
    d.db.getLastOpenedId = async () => { throw new Error("indexedDB is not defined") }
    await createDocumentIo(d).restoreLast()
    expect(documentStore.getState().doc.id).not.toBe("init")
    expect(documentSession.getState().persistence).toBe("unavailable")
  })
})

describe("openFile", () => {
  it("carica un file valido come salvato e lo registra", async () => {
    const d = deps()
    const io = createDocumentIo(d)
    const doc = withEntity("da file", "f1")
    await io.openFile({ name: "da-file.dd.json", text: toJson(doc), handle })
    expect(documentStore.getState().doc).toEqual(doc)
    expect(documentSession.getState()).toMatchObject({ docId: "f1", fileName: "da-file.dd.json", handle, dirty: false, lastSavedAt: 1000 })
    expect(d.db.records.get("f1")).toMatchObject({ savedToFileAt: 1000, fileName: "da-file.dd.json" })
    expect(d.db.last).toBe("f1")
  })

  it("un file non valido non carica niente e avvisa", async () => {
    const d = deps()
    await createDocumentIo(d).openFile({ name: "x.dd.json", text: '{"schemaVersion":1}', handle: null })
    expect(documentStore.getState().doc.id).toBe("init")
    expect(documentSession.getState().notice).toContain("File non valido")
  })

  it("con un buffer più recente e conferma, ripristina il buffer e resta sporco", async () => {
    const d = deps()
    const fromFile = createErDocument("doc", "b1")
    const buffered = withEntity("doc", "b1")
    d.db.records.set("b1", record(buffered, { updatedAt: 900, savedToFileAt: 800 }))
    await createDocumentIo(d).openFile({ name: "doc.dd.json", text: toJson(fromFile), handle: null })
    expect(d.confirm).toHaveBeenCalledTimes(1)
    expect(documentStore.getState().doc).toEqual(buffered)
    expect(documentSession.getState()).toMatchObject({ dirty: true, lastSavedAt: 800 })
  })

  it("con un buffer più recente e rifiuto, apre il file", async () => {
    const d = deps({ confirm: vi.fn(() => false) })
    const fromFile = createErDocument("doc", "b2")
    d.db.records.set("b2", record(withEntity("doc", "b2"), { updatedAt: 900, savedToFileAt: 800 }))
    await createDocumentIo(d).openFile({ name: "doc.dd.json", text: toJson(fromFile), handle: null })
    expect(documentStore.getState().doc).toEqual(fromFile)
    expect(documentSession.getState().dirty).toBe(false)
  })

  it("un buffer identico al file non chiede niente", async () => {
    const d = deps()
    const doc = withEntity("doc", "b3")
    d.db.records.set("b3", record(doc, { updatedAt: 900, savedToFileAt: 800 }))
    await createDocumentIo(d).openFile({ name: "doc.dd.json", text: toJson(doc), handle: null })
    expect(d.confirm).not.toHaveBeenCalled()
  })
})

describe("save", () => {
  it("con handle e permesso scrive sull'handle e spegne dirty", async () => {
    const d = deps()
    const io = createDocumentIo(d)
    await io.newDocument()
    documentSession.getState().patch({ handle, fileName: "h.dd.json", dirty: true })
    await io.save()
    const doc = documentStore.getState().doc
    expect(d.files.writeHandle).toHaveBeenCalledWith(handle, toJson(doc))
    expect(d.files.pickSave).not.toHaveBeenCalled()
    expect(documentSession.getState()).toMatchObject({ dirty: false, lastSavedAt: 1000 })
    expect(d.db.records.get(doc.id)).toMatchObject({ savedToFileAt: 1000, updatedAt: 1000 })
  })

  it("senza handle apre il picker e adotta il file scelto", async () => {
    const d = deps()
    const io = createDocumentIo(d)
    await io.newDocument()
    await io.save()
    expect(d.files.pickSave).toHaveBeenCalledWith("senza-titolo.dd.json")
    expect(d.files.writeHandle).toHaveBeenCalledWith(handle, expect.any(String))
    expect(documentSession.getState()).toMatchObject({ handle, fileName: "h.dd.json" })
  })

  it("picker annullato: niente scritto, dirty resta", async () => {
    const d = deps({ files: files({ pickSave: vi.fn(async () => null) }) })
    const io = createDocumentIo(d)
    await io.newDocument()
    documentSession.getState().patch({ dirty: true })
    await io.save()
    expect(d.files.writeHandle).not.toHaveBeenCalled()
    expect(documentSession.getState().dirty).toBe(true)
  })

  it("permesso negato ricade sul picker", async () => {
    const d = deps({ files: files({ ensureWritePermission: vi.fn(async () => false) }) })
    const io = createDocumentIo(d)
    await io.newDocument()
    documentSession.getState().patch({ handle, fileName: "h.dd.json" })
    await io.save()
    expect(d.files.pickSave).toHaveBeenCalledTimes(1)
    expect(d.files.writeHandle).toHaveBeenCalledTimes(1)
  })

  it("senza picker scarica", async () => {
    const d = deps({ caps: { pickers: false } })
    const io = createDocumentIo(d)
    await io.newDocument()
    await io.save()
    expect(d.files.download).toHaveBeenCalledWith("senza-titolo.dd.json", expect.stringContaining('"schemaVersion"'))
    expect(documentSession.getState().dirty).toBe(false)
  })

  it("saveAs con handle apre comunque il picker", async () => {
    const d = deps()
    const io = createDocumentIo(d)
    await io.newDocument()
    documentSession.getState().patch({ handle, fileName: "h.dd.json" })
    await io.saveAs()
    expect(d.files.pickSave).toHaveBeenCalledTimes(1)
  })

  it("handle non più valido torna a 'salva con nome' con avviso", async () => {
    const d = deps({ files: files({ writeHandle: vi.fn(async () => { throw new DOMException("gone", "NotFoundError") }) }) })
    const io = createDocumentIo(d)
    await io.newDocument()
    documentSession.getState().patch({ handle, fileName: "h.dd.json", dirty: true })
    await io.save()
    expect(documentSession.getState()).toMatchObject({ handle: null, dirty: true })
    expect(documentSession.getState().notice).toContain("non esiste più")
  })

  it("in sola lettura non salva", async () => {
    const d = deps()
    const io = createDocumentIo(d)
    await io.newDocument()
    documentSession.getState().patch({ readOnly: true, handle })
    await io.save()
    expect(d.files.writeHandle).not.toHaveBeenCalled()
  })
})

describe("openRecent e newDocument", () => {
  it("openRecent carica dal buffer e aggiorna lastOpenedId", async () => {
    const d = deps()
    const io = createDocumentIo(d)
    const saved = withEntity("recente", "r1")
    d.db.records.set("r1", record(saved, { updatedAt: 900, savedToFileAt: 900, fileName: "r.dd.json" }))
    await io.newDocument()
    await io.openRecent("r1")
    expect(documentStore.getState().doc).toEqual(saved)
    expect(d.db.last).toBe("r1")
    expect(documentSession.getState()).toMatchObject({ docId: "r1", fileName: "r.dd.json", dirty: false })
  })

  it("newDocument lascia il precedente in biblioteca", async () => {
    const d = deps()
    const io = createDocumentIo(d)
    await io.newDocument()
    const first = documentStore.getState().doc.id
    await io.newDocument()
    expect(documentStore.getState().doc.id).not.toBe(first)
    expect(d.db.records.has(first)).toBe(true)
    expect(d.db.records.size).toBe(2)
  })
})

describe("seconda scheda", () => {
  it("se il lock è occupato il documento si apre in sola lettura", async () => {
    const d = deps()
    const busy: LockRequester = { request: (_n, o, cb) => (o.ifAvailable ? cb(null) : cb({ name: _n, mode: "exclusive" })) }
    d.lock = { ...lock(), locks: busy }
    d.db.records.set("s1", record(withEntity("x", "s1"), { updatedAt: 1, savedToFileAt: 1 }))
    d.db.last = "s1"
    await createDocumentIo(d).restoreLast()
    expect(documentSession.getState().readOnly).toBe(true)
  })
})

// Sanity: il round trip toJson → parseDocument regge un documento con entità (spec §7).
it("round trip toJson/parseDocument", () => {
  const doc = withEntity("rt", "rt1")
  const back = parseDocument(toJson(doc))
  expect(back.ok && back.document).toEqual(doc)
})
