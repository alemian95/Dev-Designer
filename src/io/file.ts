export const FILE_EXTENSION = ".dd.json"
const MIME = "application/json"

/** Tipo accettato dai picker: `.dd.json`, JSON. */
export const FILE_TYPES: FilePickerAcceptType[] = [{ description: "Documento Dev Designer", accept: { [MIME]: [FILE_EXTENSION] } }]

export interface FileCapabilities {
  /** File System Access API disponibile: picker, handle, scrittura in place. Altrimenti upload e download. */
  pickers: boolean
}

type PickerWindow = Pick<Window, "showOpenFilePicker" | "showSaveFilePicker">

/**
 * Rilevamento a runtime, non da una tabella di browser. `?fallback=1` forza upload/download anche
 * dove i picker esistono: serve all'e2e (Playwright non pilota i dialoghi nativi) e alla prova manuale.
 */
export function detectCapabilities(win: PickerWindow = window, search: string = location.search): FileCapabilities {
  const forced = new URLSearchParams(search).get("fallback") === "1"
  const pickers = !forced && typeof win.showOpenFilePicker === "function" && typeof win.showSaveFilePicker === "function"
  return { pickers }
}

export type SavePath = "handle" | "picker" | "download"

/** Politica del salvataggio (spec §5, "Salva"): handle se c'è e non è un "salva con nome", altrimenti picker, altrimenti download. */
export function chooseSavePath(caps: FileCapabilities, hasHandle: boolean, forceNew = false): SavePath {
  if (!caps.pickers) return "download"
  return hasHandle && !forceNew ? "handle" : "picker"
}

export function suggestedFileName(docName: string): string {
  const slug = docName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return `${slug || "diagramma"}${FILE_EXTENSION}`
}

export interface OpenedFile {
  name: string
  text: string
  /** null nel fallback upload: non c'è un handle su cui riscrivere. */
  handle: FileSystemFileHandle | null
}

export async function readFile(file: File, handle: FileSystemFileHandle | null = null): Promise<OpenedFile> {
  return { name: file.name, text: await file.text(), handle }
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError"

/** null se l'utente annulla. Va chiamata da un gesto dell'utente. */
export async function pickOpen(): Promise<OpenedFile | null> {
  try {
    const [handle] = await window.showOpenFilePicker!({ types: FILE_TYPES, multiple: false })
    return await readFile(await handle.getFile(), handle)
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** null se l'utente annulla. Va chiamata da un gesto dell'utente. */
export async function pickSave(suggested: string): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker!({ types: FILE_TYPES, suggestedName: suggested })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** Il permesso di scrittura non sopravvive al ricaricamento: si interroga, e se serve si richiede (da un gesto). */
export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const opts = { mode: "readwrite" as const }
  if ((await handle.queryPermission?.(opts)) === "granted") return true
  return (await handle.requestPermission?.(opts)) === "granted"
}

export async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Fallback dove la File System Access API manca: un link `download` cliccato via script. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: MIME }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
