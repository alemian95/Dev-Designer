# Persistenza dei documenti — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare ai documenti una vita oltre il ricaricamento: autosave in IndexedDB come rete di sicurezza, file `.dd.json` su disco come artefatto, ritorno all'ultimo documento, una sola scheda che scrive.

**Architecture:** Nasce lo strato `src/io` (`model → editor → io → ui`). `db.ts` parla con IndexedDB via `idb`; `file.ts` con la File System Access API e il suo fallback upload/download; `lock.ts` governa la proprietà del documento con Web Locks e `BroadcastChannel`; `autosave.ts` scrive il documento intero con debounce; `document-io.ts` è l'orchestrazione con le politiche, costruita con dipendenze iniettate così da essere testata senza browser; `app-io.ts` è la radice di composizione. Lato UI un menu documento in toolbar e una barra di avviso. Il buffer in IndexedDB è la **stringa** di `toJson`, così al ritorno passa da `parseDocument` come un file da disco.

**Tech Stack:** TypeScript 6 strict, Vite 8, React 19, Zustand 5 (vanilla), zod 4, `idb` 8.0.3, `fake-indexeddb` 6.2.5 (test), Playwright 1.63 con Chrome di sistema, shadcn `dropdown-menu`.

**Spec:** `docs/superpowers/specs/2026-09-07-persistenza-design.md` (e, per il contesto di progetto, `docs/superpowers/specs/2026-09-06-dev-designer-design.md`).

## Global Constraints

- TypeScript `strict`, nessun `any` non motivato; `pnpm build` (`tsc -b && vite build`), `pnpm lint`, `pnpm test` verdi a ogni commit. Lint senza `eslint-disable`.
- Strati con dipendenze verso il basso: `model → editor → io → ui`. `src/io` importa `model`, `editor`, `zustand`, `idb`; **mai** `react`, `react-dom`, `src/ui`. La regola è imposta da `no-restricted-imports` in `eslint.config.js` (Task 1).
- Nuove dipendenze ammesse in questo piano: `idb` (dependencies), `fake-indexeddb` (devDependencies). Nessun'altra.
- Componenti shadcn ammessi in aggiunta a quelli esistenti: `dropdown-menu`. I file generati in `src/components/ui/` non si modificano. `cn` si importa dal pacchetto `cn`, non da `@/lib/utils`.
- Il buffer in IndexedDB è la stringa prodotta da `toJson`; al ritorno passa da `parseDocument` (validazione zod e migrazioni). Nessun secondo formato, nessun secondo percorso di caricamento.
- Il file da disco è un confine di fiducia: se `parseDocument` lo rifiuta non si carica niente e si mostra l'errore.
- Estensione dei file: `.dd.json`. MIME `application/json`.
- Autosave con debounce di `400` ms; scrive solo la scheda che possiede il lock; `load` non è un comando e non sporca il documento.
- Un lock Web Locks non si può rubare: "prendi il controllo" è una richiesta di cessione via `BroadcastChannel`; la proprietaria fa un ultimo autosave **prima** di rilasciare; la richiedente attende con timeout `5000` ms.
- `dirty` si accende a ogni comando e si spegne solo con un salvataggio su file.
- Nessun avviso `beforeunload`.
- Rilevamento delle capacità a runtime (`typeof window.showSaveFilePicker === "function"`, `"locks" in navigator`); `?fallback=1` forza upload/download.
- Selettori Zustand che restituiscono oggetti o array nuovi vanno avvolti in `useShallow`. `useEffect(() => setState(x), [x])` è bocciato da `react-hooks/set-state-in-effect`: usare `key` o un'altra struttura.
- Ogni `addEventListener` ha il suo `removeEventListener` con la stessa referenza.
- Accessibilità: ogni controllo interattivo ha un nome accessibile (`aria-label` o testo); un'icona lucide da sola è `aria-hidden`.
- Testi UI, commenti, docstring e commit in **italiano**; identificatori in inglese. Commit in stile `feat: …`, `test: …`, `docs: …`, `chore: …`, `fix: …`.
- Identità git: prima del primo commit verificare `git config --local user.email` = `alessandromian95@gmail.com` (altrimenti eseguire `git-config-personal`).
- Per API di librerie non riportate qui, leggere i tipi installati in `node_modules` o la documentazione ufficiale, non andare a memoria. I tipi di `showOpenFilePicker`, `showSaveFilePicker`, `queryPermission` e `requestPermission` **non** stanno in `lib.dom` di TS 6: li dichiara `src/io/file-system-access.d.ts` (Task 1).
- Vitest gira in ambiente Node (nessun jsdom): i test esercitano funzioni pure e store; IndexedDB arriva da `fake-indexeddb/auto`; `BroadcastChannel`, `structuredClone` e `AbortSignal.timeout` sono globali di Node 22. `navigator.locks` **non** esiste in Node: `lock.ts` riceve il gestore dei lock per iniezione.
- Playwright non pilota i dialoghi nativi della File System Access API: l'e2e usa `?fallback=1`, intercetta il download con `page.waitForEvent("download")` e carica con `locator.setInputFiles` su `<input type="file">`.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/io/file-system-access.d.ts` | Tipi ambient della File System Access API assenti da `lib.dom` |
| `src/io/db.ts` | `createDocumentDb(name)`: record dei documenti in IndexedDB, recenti, potatura, `lastOpenedId` |
| `src/io/document-session.ts` | Store dei metadati del documento aperto: file, `dirty`, `readOnly`, avvisi |
| `src/io/file.ts` | Capacità del browser, scelta del percorso di salvataggio, picker, permessi, scrittura, download, lettura |
| `src/io/lock.ts` | `tryOwn`, `takeOver`: proprietà del documento con Web Locks e richiesta di cessione via `BroadcastChannel` |
| `src/io/autosave.ts` | `startAutosave`: iscrizione allo store, debounce, scrittura, `flush` |
| `src/io/document-io.ts` | `createDocumentIo(deps)`: nuovo, apri, salva, salva con nome, ripristina, recenti, prendi il controllo |
| `src/io/app-io.ts` | Radice di composizione: istanze reali di db, autosave, io |
| `src/ui/document-actions.ts` | `requestOpen`, `UPLOAD_INPUT_ID`: l'apertura decisa dalle capacità, condivisa fra menu e scorciatoie |
| `src/ui/DocumentMenu.tsx` | Menu documento in toolbar e input file nascosto |
| `src/ui/NoticeBar.tsx` | Barra di sola lettura e avvisi |
| `scripts/e2e/persistenza.mjs` | End-to-end: disegna, ricarica, ritrova, salva, riapri; due schede |

Modificati: `eslint.config.js`, `package.json`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/Toolbar.tsx`, `src/ui/use-keyboard-shortcuts.ts`, `README.md`.

---

### Task 1: Dipendenze, componente shadcn, regola ESLint dello strato io, tipi ambient

**Files:**
- Modify: `package.json`, `eslint.config.js`
- Create: `src/components/ui/dropdown-menu.tsx` (generato), `src/io/file-system-access.d.ts`

**Interfaces:**
- Produces: la regola `no-restricted-imports` per `src/io/**`; i tipi globali `FilePickerAcceptType`, `Window.showOpenFilePicker?`, `Window.showSaveFilePicker?`, `FileSystemHandle.queryPermission?`, `FileSystemHandle.requestPermission?`; i componenti `DropdownMenu*`.

- [ ] **Step 1: Installare le dipendenze**

```bash
pnpm add idb@8.0.3
pnpm add -D fake-indexeddb@6.2.5
```

Verificare in `package.json` che `idb` stia in `dependencies` e `fake-indexeddb` in `devDependencies`.

- [ ] **Step 2: Generare il componente shadcn**

```bash
pnpm dlx shadcn@latest add dropdown-menu -y
```

Deve comparire solo `src/components/ui/dropdown-menu.tsx`. **Leggere il file generato** e annotare nel report i nomi esportati che i Task 7 userà: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`. Se la CLI genera anche altri file (dipendenze del componente), riportarlo: sono ammessi solo se la CLI li impone.

- [ ] **Step 3: Regola ESLint per lo strato io**

In `eslint.config.js`, dopo il blocco dello strato editor, aggiungere:

```js
  {
    // Strato io: conosce model, editor, zustand e idb. Mai React né ui.
    files: ['src/io/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', 'react/*', 'react-dom/*', '@/ui/**', '**/ui/**'],
          message: 'src/io non conosce React né src/ui.',
        }],
      }],
    },
  },
```

- [ ] **Step 4: Verificare la regola con un probe**

Creare `src/io/_probe.ts` con `import "react"` e `import "@/ui/App"`, eseguire `pnpm lint`: devono comparire **due** errori `no-restricted-imports`. Poi cancellare il probe.

- [ ] **Step 5: Tipi ambient della File System Access API**

`src/io/file-system-access.d.ts` (file di script globale: **nessun** `import`/`export`, altrimenti le dichiarazioni non si fondono con `Window`):

```ts
// Tipi della File System Access API che lib.dom di TypeScript 6 non dichiara: picker e permessi.
// `FileSystemFileHandle`, `createWritable`, `LockManager` e `BroadcastChannel` ci sono già.

interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string[]>
}

interface FilePickerOptions {
  types?: FilePickerAcceptType[]
  excludeAcceptAllOption?: boolean
  id?: string
}

interface OpenFilePickerOptions extends FilePickerOptions {
  multiple?: boolean
}

interface SaveFilePickerOptions extends FilePickerOptions {
  suggestedName?: string
}

interface Window {
  /** Opzionale: assente dove l'API non esiste. Il rilevamento è `typeof window.showOpenFilePicker === "function"`. */
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite"
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  /** Richiede un gesto dell'utente: chiamarla fuori da un click lancia SecurityError. */
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}
```

- [ ] **Step 6: Verificare che i tipi siano visti**

Creare `src/io/_types-probe.ts`:

```ts
const ok: boolean = typeof window.showSaveFilePicker === "function"
export { ok }
```

`pnpm build` deve passare. Cancellare il probe.

- [ ] **Step 7: Lint, test, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add package.json pnpm-lock.yaml eslint.config.js src/components/ui/dropdown-menu.tsx src/io/file-system-access.d.ts
git commit -m "chore: idb, fake-indexeddb, dropdown-menu, regola ESLint dello strato io e tipi della File System Access API"
```

---

### Task 2: Record dei documenti in IndexedDB

**Files:**
- Create: `src/io/db.ts`
- Test: `src/io/db.test.ts`

**Interfaces:**
- Produces: `DocumentRecord { id, name, json, fileName, handle, updatedAt, savedToFileAt }`, `RecentEntry`, `RECENT_LIMIT = 20`, `DB_NAME = "dev-designer"`, `DocumentDb { put, get, remove, listRecent, getLastOpenedId, setLastOpenedId }`, `createDocumentDb(name?)`.

- [ ] **Step 1: Test**

`src/io/db.test.ts`:

```ts
import "fake-indexeddb/auto"
import { describe, expect, it } from "vitest"
import { createDocumentDb, RECENT_LIMIT, type DocumentRecord } from "./db"

// Un database per test: l'isolamento sta nel nome, non in un reset globale.
let n = 0
const fresh = () => createDocumentDb(`test-${++n}`)

const rec = (id: string, updatedAt: number, over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id, name: id, json: "{}", fileName: null, handle: null, updatedAt, savedToFileAt: null, ...over,
})

describe("createDocumentDb", () => {
  it("scrive e rilegge un record", async () => {
    const db = fresh()
    await db.put(rec("a", 1, { json: '{"x":1}' }))
    expect(await db.get("a")).toMatchObject({ id: "a", json: '{"x":1}', updatedAt: 1 })
  })

  it("get di un id assente è undefined", async () => {
    expect(await fresh().get("nope")).toBeUndefined()
  })

  it("put sullo stesso id sovrascrive", async () => {
    const db = fresh()
    await db.put(rec("a", 1))
    await db.put(rec("a", 2, { name: "rinominato" }))
    expect(await db.get("a")).toMatchObject({ name: "rinominato", updatedAt: 2 })
    expect(await db.listRecent()).toHaveLength(1)
  })

  it("i recenti sono ordinati dal più recente e non portano il json", async () => {
    const db = fresh()
    await db.put(rec("a", 1))
    await db.put(rec("b", 3))
    await db.put(rec("c", 2))
    const recent = await db.listRecent()
    expect(recent.map((r) => r.id)).toEqual(["b", "c", "a"])
    expect(recent[0]).not.toHaveProperty("json")
  })

  it("la potatura tiene solo RECENT_LIMIT record, i più recenti", async () => {
    const db = fresh()
    const total = RECENT_LIMIT + 5
    for (let i = 0; i < total; i++) await db.put(rec(`d${i}`, i))
    expect(await db.listRecent()).toHaveLength(RECENT_LIMIT)
    expect(await db.get("d0")).toBeUndefined()
    expect(await db.get("d4")).toBeUndefined()
    expect(await db.get("d5")).toBeDefined()
    expect(await db.get(`d${total - 1}`)).toBeDefined()
  })

  it("remove elimina il record", async () => {
    const db = fresh()
    await db.put(rec("a", 1))
    await db.remove("a")
    expect(await db.get("a")).toBeUndefined()
  })

  it("lastOpenedId è null finché non viene impostato", async () => {
    const db = fresh()
    expect(await db.getLastOpenedId()).toBeNull()
    await db.setLastOpenedId("a")
    expect(await db.getLastOpenedId()).toBe("a")
    await db.setLastOpenedId("b")
    expect(await db.getLastOpenedId()).toBe("b")
  })
})
```

- [ ] **Step 2: Eseguire il test, deve fallire**

Run: `pnpm vitest run src/io/db.test.ts`
Expected: FAIL, `Cannot find module './db'`.

- [ ] **Step 3: Implementazione**

`src/io/db.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb"

/**
 * Il buffer di un documento in IndexedDB. `json` è la stringa di `toJson`, non l'oggetto: al ritorno
 * passa da `parseDocument` come un file da disco, migrazioni comprese (spec §4).
 * `handle` è memorizzato per structured clone dove l'API esiste; il permesso non sopravvive al ricaricamento.
 */
export interface DocumentRecord {
  id: string
  name: string
  json: string
  fileName: string | null
  handle: FileSystemFileHandle | null
  updatedAt: number
  savedToFileAt: number | null
}

export type RecentEntry = Pick<DocumentRecord, "id" | "name" | "fileName" | "updatedAt" | "savedToFileAt">

export const RECENT_LIMIT = 20
export const DB_NAME = "dev-designer"

interface Schema extends DBSchema {
  documents: { key: string; value: DocumentRecord; indexes: { "by-updated": number } }
  meta: { key: string; value: { key: string; value: string } }
}

export interface DocumentDb {
  /** Scrive il record e pota i meno recenti oltre RECENT_LIMIT. */
  put(record: DocumentRecord): Promise<void>
  get(id: string): Promise<DocumentRecord | undefined>
  remove(id: string): Promise<void>
  /** Dal più recente, al massimo RECENT_LIMIT, senza il json. */
  listRecent(): Promise<RecentEntry[]>
  getLastOpenedId(): Promise<string | null>
  setLastOpenedId(id: string): Promise<void>
}

const toEntry = ({ id, name, fileName, updatedAt, savedToFileAt }: DocumentRecord): RecentEntry => ({
  id, name, fileName, updatedAt, savedToFileAt,
})

export function createDocumentDb(name: string = DB_NAME): DocumentDb {
  // Apertura pigra dentro una promise: se `indexedDB` manca, l'errore diventa un rifiuto gestibile
  // dai chiamanti invece di un'eccezione all'import del modulo.
  const dbp: Promise<IDBPDatabase<Schema>> = (async () =>
    openDB<Schema>(name, 1, {
      upgrade(db) {
        const store = db.createObjectStore("documents", { keyPath: "id" })
        store.createIndex("by-updated", "updatedAt")
        db.createObjectStore("meta", { keyPath: "key" })
      },
    }))()
  dbp.catch(() => {}) // il rifiuto lo vede chi usa il db; qui evita solo l'"unhandled rejection"

  return {
    async put(record) {
      const db = await dbp
      await db.put("documents", record)
      const all = await db.getAllFromIndex("documents", "by-updated") // crescente per updatedAt
      const excess = all.slice(0, Math.max(0, all.length - RECENT_LIMIT))
      if (excess.length === 0) return
      const tx = db.transaction("documents", "readwrite")
      await Promise.all([...excess.map((r) => tx.store.delete(r.id)), tx.done])
    },
    async get(id) {
      return (await dbp).get("documents", id)
    },
    async remove(id) {
      await (await dbp).delete("documents", id)
    },
    async listRecent() {
      const all = await (await dbp).getAllFromIndex("documents", "by-updated")
      return all.reverse().slice(0, RECENT_LIMIT).map(toEntry)
    },
    async getLastOpenedId() {
      return (await (await dbp).get("meta", "lastOpenedId"))?.value ?? null
    },
    async setLastOpenedId(id) {
      await (await dbp).put("meta", { key: "lastOpenedId", value: id })
    },
  }
}
```

- [ ] **Step 4: Eseguire il test, deve passare**

Run: `pnpm vitest run src/io/db.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Lint, suite completa, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/io/db.ts src/io/db.test.ts
git commit -m "feat(io): record dei documenti in IndexedDB con recenti e potatura"
```

---

### Task 3: Sessione del documento e operazioni su file

**Files:**
- Create: `src/io/document-session.ts`, `src/io/file.ts`
- Test: `src/io/file.test.ts`

**Interfaces:**
- Produces: `documentSession` (zustand vanilla) con `{ docId, fileName, handle, dirty, readOnly, lastSavedAt, persistence, notice, patch }`; da `file.ts`: `FILE_EXTENSION`, `FileCapabilities`, `detectCapabilities(win?, search?)`, `SavePath`, `chooseSavePath(caps, hasHandle, forceNew?)`, `suggestedFileName(docName)`, `OpenedFile`, `readFile(file, handle?)`, `pickOpen()`, `pickSave(suggested)`, `ensureWritePermission(handle)`, `writeHandle(handle, text)`, `download(name, text)`.

- [ ] **Step 1: Store di sessione**

`src/io/document-session.ts`:

```ts
import { createStore } from "zustand/vanilla"

export type PersistenceStatus = "ok" | "unavailable"

/**
 * Metadati del documento aperto: non appartengono al documento (non finiscono nel file né nell'undo)
 * e non sono transitori come il viewport. Non stanno in `sessionStore` perché `handle` è un oggetto
 * del DOM e lo strato editor non deve conoscerlo (spec §3).
 */
export interface DocumentSessionState {
  docId: string
  fileName: string | null
  handle: FileSystemFileHandle | null
  /** Il buffer differisce dal file. Si accende a ogni comando, si spegne solo salvando su file. */
  dirty: boolean
  /** Il documento è posseduto da un'altra scheda. */
  readOnly: boolean
  lastSavedAt: number | null
  /** "unavailable" quando IndexedDB manca o la quota è esaurita: si lavora senza rete di sicurezza. */
  persistence: PersistenceStatus
  /** Avviso da mostrare nella barra; null = nessuno. */
  notice: string | null
  patch: (p: Partial<Omit<DocumentSessionState, "patch">>) => void
}

export const documentSession = createStore<DocumentSessionState>()((set) => ({
  docId: "",
  fileName: null,
  handle: null,
  dirty: false,
  readOnly: false,
  lastSavedAt: null,
  persistence: "ok",
  notice: null,
  patch: (p) => set(p),
}))
```

- [ ] **Step 2: Test delle funzioni pure di `file.ts`**

`src/io/file.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { chooseSavePath, detectCapabilities, FILE_EXTENSION, suggestedFileName } from "./file"

const withPickers = { showOpenFilePicker: async () => [], showSaveFilePicker: async () => ({}) } as unknown as Window
const without = {} as Window

describe("detectCapabilities", () => {
  it("rileva i picker quando entrambi esistono", () => {
    expect(detectCapabilities(withPickers, "")).toEqual({ pickers: true })
  })
  it("non li rileva se ne manca uno", () => {
    expect(detectCapabilities({ showOpenFilePicker: async () => [] } as unknown as Window, "")).toEqual({ pickers: false })
    expect(detectCapabilities(without, "")).toEqual({ pickers: false })
  })
  it("?fallback=1 forza il fallback anche con i picker", () => {
    expect(detectCapabilities(withPickers, "?fallback=1")).toEqual({ pickers: false })
    expect(detectCapabilities(withPickers, "?stress=3&fallback=1")).toEqual({ pickers: false })
    expect(detectCapabilities(withPickers, "?fallback=0")).toEqual({ pickers: true })
  })
})

describe("chooseSavePath", () => {
  it("senza picker è sempre download", () => {
    expect(chooseSavePath({ pickers: false }, true)).toBe("download")
    expect(chooseSavePath({ pickers: false }, false)).toBe("download")
    expect(chooseSavePath({ pickers: false }, true, true)).toBe("download")
  })
  it("con handle scrive sull'handle, salvo 'salva con nome'", () => {
    expect(chooseSavePath({ pickers: true }, true)).toBe("handle")
    expect(chooseSavePath({ pickers: true }, true, true)).toBe("picker")
  })
  it("senza handle apre il picker", () => {
    expect(chooseSavePath({ pickers: true }, false)).toBe("picker")
  })
})

describe("suggestedFileName", () => {
  it("normalizza il nome e aggiunge l'estensione", () => {
    expect(suggestedFileName("Ordini & Clienti")).toBe(`ordini-clienti${FILE_EXTENSION}`)
    expect(suggestedFileName("  Senza titolo ")).toBe(`senza-titolo${FILE_EXTENSION}`)
  })
  it("un nome vuoto o solo simboli diventa 'diagramma'", () => {
    expect(suggestedFileName("")).toBe(`diagramma${FILE_EXTENSION}`)
    expect(suggestedFileName("***")).toBe(`diagramma${FILE_EXTENSION}`)
  })
})
```

- [ ] **Step 3: Eseguire il test, deve fallire**

Run: `pnpm vitest run src/io/file.test.ts`
Expected: FAIL, `Cannot find module './file'`.

- [ ] **Step 4: Implementazione di `file.ts`**

`src/io/file.ts`:

```ts
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
```

- [ ] **Step 5: Eseguire il test, deve passare**

Run: `pnpm vitest run src/io/file.test.ts`
Expected: 9 passed.

- [ ] **Step 6: Lint, suite completa, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/io/document-session.ts src/io/file.ts src/io/file.test.ts
git commit -m "feat(io): sessione del documento e operazioni su file con fallback"
```

---

### Task 4: Proprietà del documento fra schede

**Files:**
- Create: `src/io/lock.ts`
- Test: `src/io/lock.test.ts`

**Interfaces:**
- Produces: `LockRequester`, `LockDeps { locks, openChannel }`, `defaultLockDeps()`, `Ownership { docId, release(), lost: Promise<void> }`, `tryOwn(docId, onCede, deps)`, `takeOver(docId, onCede, deps, timeoutMs?)`, `CEDE_TIMEOUT_MS = 5000`.

Il protocollo, dalla spec §5 "Sola lettura":

- **Web Locks** decide chi possiede il documento. La proprietaria tiene un lock `doc:<id>` con una promessa che si risolve solo quando cede.
- **`BroadcastChannel`** porta la richiesta. La scheda in sola lettura manda `{ type: "request", docId }`; la proprietaria riceve, esegue `onCede` (l'ultimo autosave), rilascia; la richiedente, in attesa su `locks.request`, lo ottiene.
- Un lock non si può rubare (`steal` è escluso di proposito: lascerebbe l'altra scheda in esecuzione dentro il lock).

- [ ] **Step 1: Test con un gestore di lock finto e il `BroadcastChannel` di Node**

`src/io/lock.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { takeOver, tryOwn, type LockDeps, type LockRequester, type Ownership } from "./lock"

/** Emula navigator.locks: esclusivo, coda FIFO, ifAvailable, abort via signal. */
class FakeLocks implements LockRequester {
  private held = new Set<string>()
  private queues = new Map<string, Array<() => void>>()

  async request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<unknown>): Promise<unknown> {
    if (this.held.has(name)) {
      if (options.ifAvailable) return callback(null)
      await new Promise<void>((resolve, reject) => {
        const queue = this.queues.get(name) ?? []
        queue.push(resolve)
        this.queues.set(name, queue)
        options.signal?.addEventListener("abort", () => {
          this.queues.set(name, queue.filter((r) => r !== resolve))
          reject(options.signal!.reason)
        })
      })
    }
    this.held.add(name)
    try {
      return await callback({ name, mode: "exclusive" })
    } finally {
      this.held.delete(name)
      this.queues.get(name)?.shift()?.()
    }
  }
}

let channelName = 0
const deps = (locks: LockRequester, name = `lock-test-${++channelName}`): LockDeps => ({
  locks,
  openChannel: () => new BroadcastChannel(name),
})

const owned: Ownership[] = []
afterEach(() => {
  // I BroadcastChannel di Node tengono vivo il processo: ogni proprietà va rilasciata.
  for (const o of owned.splice(0)) o.release()
})

describe("tryOwn", () => {
  it("la prima scheda ottiene la proprietà, la seconda no", async () => {
    const locks = new FakeLocks()
    const a = await tryOwn("d1", async () => {}, deps(locks))
    expect(a).not.toBeNull()
    owned.push(a!)
    expect(await tryOwn("d1", async () => {}, deps(locks))).toBeNull()
  })

  it("documenti diversi hanno lock diversi", async () => {
    const locks = new FakeLocks()
    const a = await tryOwn("d1", async () => {}, deps(locks))
    const b = await tryOwn("d2", async () => {}, deps(locks))
    owned.push(a!, b!)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
  })

  it("release libera il lock e risolve lost", async () => {
    const locks = new FakeLocks()
    const a = (await tryOwn("d1", async () => {}, deps(locks)))!
    a.release()
    await a.lost
    const again = await tryOwn("d1", async () => {}, deps(locks))
    expect(again).not.toBeNull()
    owned.push(again!)
  })
})

describe("takeOver", () => {
  it("la proprietaria cede dopo onCede, la richiedente ottiene la proprietà", async () => {
    const locks = new FakeLocks()
    const name = `lock-test-${++channelName}`
    const cedeA = vi.fn(async () => {})
    const a = (await tryOwn("d1", cedeA, deps(locks, name)))!
    const b = await takeOver("d1", async () => {}, deps(locks, name))
    expect(b).not.toBeNull()
    owned.push(b!)
    expect(cedeA).toHaveBeenCalledTimes(1)
    await a.lost // la proprietaria ha perso il lock
    expect(await tryOwn("d1", async () => {}, deps(locks, name))).toBeNull() // lo tiene b
  })

  it("onCede viene atteso prima del rilascio", async () => {
    const locks = new FakeLocks()
    const name = `lock-test-${++channelName}`
    const order: string[] = []
    const a = (await tryOwn("d1", async () => { await new Promise((r) => setTimeout(r, 20)); order.push("cede") }, deps(locks, name)))!
    void a.lost.then(() => order.push("lost"))
    const b = await takeOver("d1", async () => {}, deps(locks, name))
    owned.push(b!)
    await a.lost
    expect(order).toEqual(["cede", "lost"])
  })

  it("senza una proprietaria che risponde va in timeout e ritorna null", async () => {
    const locks = new FakeLocks()
    // La proprietaria ascolta su un altro canale: la richiesta non la raggiunge.
    const a = (await tryOwn("d1", async () => {}, deps(locks, "altro-canale")))!
    owned.push(a)
    const b = await takeOver("d1", async () => {}, deps(locks, "canale-richiedente"), 50)
    expect(b).toBeNull()
  })
})
```

- [ ] **Step 2: Eseguire il test, deve fallire**

Run: `pnpm vitest run src/io/lock.test.ts`
Expected: FAIL, `Cannot find module './lock'`.

- [ ] **Step 3: Implementazione**

`src/io/lock.ts`:

```ts
/** Il sottoinsieme di `LockManager` che serve; `navigator.locks` lo soddisfa, e i test iniettano un finto. */
export interface LockRequester {
  request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<unknown>): Promise<unknown>
}

export interface LockDeps {
  locks: LockRequester
  openChannel: () => BroadcastChannel
}

export interface Ownership {
  readonly docId: string
  /** Rilascio volontario (cambio documento). */
  release: () => void
  /** Si risolve quando il lock non è più nostro: rilascio volontario o cessione. */
  lost: Promise<void>
}

interface LockMessage {
  type: "request"
  docId: string
}

export const CEDE_TIMEOUT_MS = 5000
const CHANNEL = "dev-designer-lock"
const lockName = (docId: string) => `doc:${docId}`

/** Senza Web Locks (browser molto vecchi) si concede sempre: non c'è protezione, ma l'app funziona. */
const alwaysGrant: LockRequester = {
  request: (name, _options, callback) => callback({ name, mode: "exclusive" }),
}

export const defaultLockDeps = (): LockDeps => ({
  locks: "locks" in navigator ? navigator.locks : alwaysGrant,
  openChannel: () => new BroadcastChannel(CHANNEL),
})

/**
 * Tiene il lock del documento finché non si rilascia o non arriva una richiesta di cessione dal canale.
 * Alla richiesta esegue `onCede` (l'ultimo autosave) e poi rilascia: l'ordine impedisce alla scheda
 * che prende il controllo di ripartire da un buffer vecchio.
 */
function own(docId: string, onCede: () => Promise<void>, deps: LockDeps, options: LockOptions): Promise<Ownership | null> {
  return new Promise((resolveOwnership) => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    deps.locks
      .request(lockName(docId), options, async (lock) => {
        if (!lock) {
          resolveOwnership(null)
          return
        }
        const channel = deps.openChannel()
        let ceding = false
        const onMessage = (e: MessageEvent<LockMessage>) => {
          if (ceding || e.data.type !== "request" || e.data.docId !== docId) return
          ceding = true
          void onCede().finally(release)
        }
        channel.addEventListener("message", onMessage)
        resolveOwnership({ docId, release, lost: held })
        await held
        channel.removeEventListener("message", onMessage)
        channel.close()
      })
      // Richiesta abortita (timeout) o rifiutata: nessuna proprietà.
      .catch(() => resolveOwnership(null))
  })
}

/** Proprietà se il lock è libero, altrimenti null subito. */
export function tryOwn(docId: string, onCede: () => Promise<void>, deps: LockDeps): Promise<Ownership | null> {
  return own(docId, onCede, deps, { ifAvailable: true })
}

/**
 * Chiede alla proprietaria di cedere e attende il lock. null se nessuno risponde entro il timeout:
 * la proprietaria è chiusa a metà o sospesa dal sistema; il lock si libererà da solo alla sua chiusura.
 */
export function takeOver(docId: string, onCede: () => Promise<void>, deps: LockDeps, timeoutMs: number = CEDE_TIMEOUT_MS): Promise<Ownership | null> {
  const channel = deps.openChannel()
  const pending = own(docId, onCede, deps, { signal: AbortSignal.timeout(timeoutMs) })
  channel.postMessage({ type: "request", docId } satisfies LockMessage)
  channel.close()
  return pending
}
```

Nota sull'ordine in `takeOver`: la richiesta di lock viene messa in coda **prima** di inviare il messaggio, così quando la proprietaria rilascia la richiedente è già in attesa e nessun'altra scheda può infilarsi in mezzo.

- [ ] **Step 4: Eseguire il test, deve passare**

Run: `pnpm vitest run src/io/lock.test.ts`
Expected: 6 passed, e il processo di Vitest termina (nessun canale lasciato aperto).

- [ ] **Step 5: Lint, suite completa, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/io/lock.ts src/io/lock.test.ts
git commit -m "feat(io): proprietà del documento fra schede con Web Locks e richiesta di cessione"
```

---

### Task 5: Autosave

**Files:**
- Create: `src/io/autosave.ts`
- Test: `src/io/autosave.test.ts`

**Interfaces:**
- Consumes: `documentStore` (Task 5 del piano precedente), `toJson`, `DocumentDb` (Task 2), `documentSession` (Task 3).
- Produces: `AUTOSAVE_DELAY_MS = 400`, `Autosave { flush(): Promise<void>; stop(): void }`, `startAutosave({ db, delay?, now? })`.

- [ ] **Step 1: Test con timer finti e un db in memoria**

`src/io/autosave.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createErDocument } from "@/model/document"
import { addEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { startAutosave, AUTOSAVE_DELAY_MS, type Autosave } from "./autosave"
import type { DocumentDb, DocumentRecord } from "./db"
import { documentSession } from "./document-session"

function fakeDb(): DocumentDb & { records: DocumentRecord[] } {
  const records: DocumentRecord[] = []
  return {
    records,
    put: vi.fn(async (r: DocumentRecord) => { records.push(r) }),
    get: async () => undefined,
    remove: async () => {},
    listRecent: async () => [],
    getLastOpenedId: async () => null,
    setLastOpenedId: async () => {},
  }
}

const command = () => {
  const { recipe } = addEntity(erDiagram(documentStore.getState().doc).model.entities, { x: 0, y: 0 })
  documentStore.getState().dispatch(recipe)
}

let autosave: Autosave | null = null

beforeEach(() => {
  vi.useFakeTimers()
  documentStore.getState().load(createErDocument("t", "doc-1"))
  documentSession.getState().patch({ docId: "doc-1", fileName: "t.dd.json", handle: null, dirty: false, readOnly: false, lastSavedAt: 100, persistence: "ok", notice: null })
})

afterEach(() => {
  autosave?.stop()
  autosave = null
  vi.useRealTimers()
})

describe("startAutosave", () => {
  it("un comando sporca il documento e scrive dopo il debounce", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db, now: () => 500 })
    command()
    expect(documentSession.getState().dirty).toBe(true)
    expect(db.put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).toHaveBeenCalledTimes(1)
    const rec = db.records[0]
    expect(rec).toMatchObject({ id: "doc-1", name: "t", fileName: "t.dd.json", updatedAt: 500, savedToFileAt: 100 })
    expect(rec.json).toContain('"entity"')
  })

  it("comandi ravvicinati producono una scrittura sola", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2)
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2)
    expect(db.put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2)
    expect(db.put).toHaveBeenCalledTimes(1)
  })

  it("load non è un comando: non sporca e non scrive", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    documentStore.getState().load(createErDocument("altro", "doc-2"))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(documentSession.getState().dirty).toBe(false)
    expect(db.put).not.toHaveBeenCalled()
  })

  it("undo e redo sono comandi", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    documentStore.getState().undo()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).toHaveBeenCalledTimes(2)
  })

  it("flush scrive subito e annulla il timer", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    command()
    await autosave.flush()
    expect(db.put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).toHaveBeenCalledTimes(1)
  })

  it("flush senza modifiche non scrive", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    await autosave.flush()
    expect(db.put).not.toHaveBeenCalled()
  })

  it("in sola lettura non scrive", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    documentSession.getState().patch({ readOnly: true })
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).not.toHaveBeenCalled()
  })

  it("se la scrittura fallisce, avvisa una volta e smette", async () => {
    const db = fakeDb()
    db.put = vi.fn(async () => { throw new DOMException("quota", "QuotaExceededError") })
    autosave = startAutosave({ db })
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    const s = documentSession.getState()
    expect(s.persistence).toBe("unavailable")
    expect(s.notice).toContain("quota")
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).toHaveBeenCalledTimes(1)
  })

  it("stop disiscrive", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    autosave.stop()
    autosave = null
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Eseguire il test, deve fallire**

Run: `pnpm vitest run src/io/autosave.test.ts`
Expected: FAIL, `Cannot find module './autosave'`.

- [ ] **Step 3: Implementazione**

`src/io/autosave.ts`:

```ts
import { documentStore } from "@/editor/document-store"
import { toJson } from "@/model/serialize"
import type { DocumentDb } from "./db"
import { documentSession } from "./document-session"

export const AUTOSAVE_DELAY_MS = 400

export interface Autosave {
  /** Scrive subito se c'è qualcosa da scrivere. Usato prima di cedere il lock. */
  flush(): Promise<void>
  stop(): void
}

export interface AutosaveDeps {
  db: DocumentDb
  delay?: number
  now?: () => number
}

/**
 * Autosave a documento intero (spec §2): a ogni comando segna `dirty` e riparte il debounce; alla
 * scadenza scrive `toJson` nel record. `load` azzera la storia e non è un comando. Scrive solo la scheda
 * proprietaria. Al primo errore (quota, IndexedDB assente) avvisa una volta e smette: si lavora senza
 * rete di sicurezza, dicendolo.
 */
export function startAutosave({ db, delay = AUTOSAVE_DELAY_MS, now = Date.now }: AutosaveDeps): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null
  let disabled = false

  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const flush = async (): Promise<void> => {
    clear()
    const s = documentSession.getState()
    if (disabled || s.readOnly || !s.dirty) return
    const doc = documentStore.getState().doc
    try {
      await db.put({
        id: doc.id,
        name: doc.name,
        json: toJson(doc),
        fileName: s.fileName,
        handle: s.handle,
        updatedAt: now(),
        savedToFileAt: s.lastSavedAt,
      })
    } catch (e) {
      disabled = true
      const reason = e instanceof Error ? e.message : String(e)
      documentSession.getState().patch({
        persistence: "unavailable",
        notice: `Salvataggio automatico non disponibile (${reason}): salva su file per non perdere il lavoro.`,
      })
    }
  }

  const unsubscribe = documentStore.subscribe((state, prev) => {
    if (state.doc === prev.doc) return
    // `load` sostituisce il documento e azzera past e future: non è un comando.
    if (state.past.length + state.future.length === 0) return
    documentSession.getState().patch({ dirty: true })
    clear()
    timer = setTimeout(() => void flush(), delay)
  })

  return {
    flush,
    stop: () => {
      unsubscribe()
      clear()
    },
  }
}
```

- [ ] **Step 4: Eseguire il test, deve passare**

Run: `pnpm vitest run src/io/autosave.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Lint, suite completa, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/io/autosave.ts src/io/autosave.test.ts
git commit -m "feat(io): autosave a documento intero con debounce"
```

---

### Task 6: Orchestrazione — nuovo, apri, salva, ripristina, recenti, prendi il controllo

**Files:**
- Create: `src/io/document-io.ts`, `src/io/app-io.ts`
- Test: `src/io/document-io.test.ts`

**Interfaces:**
- Consumes: `documentStore`, `sessionStore` (`setSelection`, `setEditing`), `createErDocument`, `parseDocument`, `toJson`; `DocumentDb`, `DocumentRecord` (Task 2); `documentSession`, `chooseSavePath`, `suggestedFileName`, `FileCapabilities`, `OpenedFile`, e le funzioni di `file.ts` (Task 3); `tryOwn`, `takeOver`, `LockDeps`, `Ownership`, `defaultLockDeps` (Task 4); `Autosave`, `startAutosave` (Task 5).
- Produces: `FileOps`, `DocumentIoDeps`, `DocumentIo { restoreLast, newDocument, openWithPicker, openFile, openRecent, save, saveAs, takeControl }`, `createDocumentIo(deps)`; da `app-io.ts`: `documentDb`, `fileCapabilities`, `autosave`, `documentIo`.

- [ ] **Step 1: Test con dipendenze finte**

`src/io/document-io.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createErDocument, type DevDocument } from "@/model/document"
import { parseDocument, toJson } from "@/model/serialize"
import { addEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
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
```

- [ ] **Step 2: Eseguire il test, deve fallire**

Run: `pnpm vitest run src/io/document-io.test.ts`
Expected: FAIL, `Cannot find module './document-io'`.

- [ ] **Step 3: Implementazione di `document-io.ts`**

```ts
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
```

- [ ] **Step 4: Eseguire il test, deve passare**

Run: `pnpm vitest run src/io/document-io.test.ts`
Expected: 21 passed.

Se il test "se il db fallisce si lavora comunque" non passa perché `newDocument` a sua volta chiama il db: è previsto — `safe` assorbe anche quel fallimento; il documento nuovo deve esistere comunque nello store.

- [ ] **Step 5: Radice di composizione**

`src/io/app-io.ts`:

```ts
import { startAutosave } from "./autosave"
import { createDocumentDb } from "./db"
import { createDocumentIo } from "./document-io"
import { detectCapabilities, download, ensureWritePermission, pickOpen, pickSave, writeHandle } from "./file"
import { defaultLockDeps } from "./lock"

/** Le istanze reali. È l'unico modulo di `io` che decide "con cosa" invece di "come". */
export const documentDb = createDocumentDb()
export const fileCapabilities = detectCapabilities()
export const autosave = startAutosave({ db: documentDb })
export const documentIo = createDocumentIo({
  db: documentDb,
  files: { pickOpen, pickSave, ensureWritePermission, writeHandle, download },
  caps: fileCapabilities,
  autosave,
  lock: defaultLockDeps(),
  confirm: (m) => window.confirm(m),
})
```

- [ ] **Step 6: Lint, suite completa, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/io/document-io.ts src/io/document-io.test.ts src/io/app-io.ts
git commit -m "feat(io): orchestrazione dei documenti — nuovo, apri, salva, ripristino, recenti, controllo fra schede"
```

---

### Task 7: Menu documento, barra di avviso, scorciatoie, avvio

**Files:**
- Create: `src/ui/document-actions.ts`, `src/ui/DocumentMenu.tsx`, `src/ui/NoticeBar.tsx`
- Modify: `src/ui/Toolbar.tsx`, `src/ui/App.tsx`, `src/ui/use-keyboard-shortcuts.ts`, `src/main.tsx`

**Interfaces:**
- Consumes: `documentIo`, `documentDb`, `fileCapabilities`, `autosave` (Task 6), `documentSession` (Task 3), `readFile` (Task 3), `RecentEntry` (Task 2), componenti `DropdownMenu*` (Task 1).
- Produces: `UPLOAD_INPUT_ID = "upload-input"`, `requestOpen()`, componenti `DocumentMenu`, `NoticeBar`; attributi DOM `data-document-menu`, `data-notice-bar`, `data-take-control` per l'e2e.

- [ ] **Step 1: Azioni condivise fra menu e scorciatoie**

`src/ui/document-actions.ts` (separato dal componente per la regola `react-refresh/only-export-components`):

```ts
import { documentIo, fileCapabilities } from "@/io/app-io"

export const UPLOAD_INPUT_ID = "upload-input"

/** Apri: picker dove c'è, altrimenti l'input file nascosto del menu. Usato dal menu e da ⌘O. */
export function requestOpen(): void {
  if (fileCapabilities.pickers) void documentIo.openWithPicker()
  else document.getElementById(UPLOAD_INPUT_ID)?.click()
}
```

- [ ] **Step 2: Menu documento**

`src/ui/DocumentMenu.tsx`. Prima di scriverlo, **leggere `src/components/ui/dropdown-menu.tsx`** e adeguare i nomi se il file generato differisce da quelli qui sotto.

```tsx
import { ChevronDown, FilePlus2, FolderOpen, Save, SaveAll } from "lucide-react"
import { useState, type ChangeEvent } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { documentStore } from "@/editor/document-store"
import { documentDb, documentIo } from "@/io/app-io"
import type { RecentEntry } from "@/io/db"
import { documentSession } from "@/io/document-session"
import { readFile } from "@/io/file"
import { requestOpen, UPLOAD_INPUT_ID } from "./document-actions"

const when = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" })

/** Nome del documento, pallino delle modifiche non salvate, e il menu: nuovo, apri, salva, salva con nome, recenti. */
export function DocumentMenu() {
  const name = useStore(documentStore, (s) => s.doc.name)
  const docId = useStore(documentSession, (s) => s.docId)
  const dirty = useStore(documentSession, (s) => s.dirty)
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const [recent, setRecent] = useState<RecentEntry[]>([])

  // I recenti si leggono all'apertura del menu, non a ogni render.
  const onOpenChange = (open: boolean) => {
    if (open) void documentDb.listRecent().then(setRecent, () => setRecent([]))
  }

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) await documentIo.openFile(await readFile(file))
  }

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Documento" data-document-menu className="gap-1 font-medium">
            <span className="max-w-48 truncate">{name}</span>
            {dirty && <span aria-label="Modifiche non salvate" title="Modifiche non salvate" className="text-primary">●</span>}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuItem onSelect={() => void documentIo.newDocument()}><FilePlus2 /> Nuovo</DropdownMenuItem>
          <DropdownMenuItem onSelect={requestOpen}><FolderOpen /> Apri… <DropdownMenuShortcut>⌘O</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly} onSelect={() => void documentIo.save()}><Save /> Salva <DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly} onSelect={() => void documentIo.saveAs()}><SaveAll /> Salva con nome… <DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut></DropdownMenuItem>
          {recent.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Recenti</DropdownMenuLabel>
              {recent.map((r) => (
                <DropdownMenuItem key={r.id} disabled={r.id === docId} onSelect={() => void documentIo.openRecent(r.id)}>
                  <span className="truncate">{r.name}</span>
                  <span className="ml-auto pl-3 text-xs text-muted-foreground">{when.format(r.updatedAt)}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Fallback senza File System Access API: l'e2e lo riempie con setInputFiles. */}
      <input id={UPLOAD_INPUT_ID} type="file" accept=".dd.json,application/json" hidden aria-label="Carica documento" onChange={(e) => void onUpload(e)} />
    </>
  )
}
```

- [ ] **Step 3: Barra di sola lettura e avvisi**

`src/ui/NoticeBar.tsx`:

```tsx
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { documentIo } from "@/io/app-io"
import { documentSession } from "@/io/document-session"

/** Sotto la toolbar: la sola lettura (con "prendi il controllo") e gli avvisi da chiudere. Nulla se non c'è niente da dire. */
export function NoticeBar() {
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const notice = useStore(documentSession, (s) => s.notice)
  const patch = useStore(documentSession, (s) => s.patch)
  if (!readOnly && !notice) return null
  return (
    <div role="status" data-notice-bar className="flex flex-col gap-1 border-b bg-muted/60 px-3 py-1.5 text-sm">
      {readOnly && (
        <div className="flex items-center gap-3">
          <span>Questo documento è aperto in un'altra scheda: qui è in sola lettura.</span>
          <Button size="sm" variant="outline" data-take-control onClick={() => void documentIo.takeControl()}>Prendi il controllo</Button>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-3">
          <span>{notice}</span>
          <Button size="sm" variant="ghost" aria-label="Chiudi avviso" onClick={() => patch({ notice: null })}>×</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Toolbar e App**

In `src/ui/Toolbar.tsx` sostituire `<span className="mr-2 text-sm font-semibold">Dev Designer</span>` con:

```tsx
      <span className="text-sm font-semibold">Dev Designer</span>
      <DocumentMenu />
      <Separator orientation="vertical" className="h-6" />
```

e aggiungere `import { DocumentMenu } from "./DocumentMenu"`.

`src/ui/App.tsx`:

```tsx
import { useStore } from "zustand"
import { cn } from "cn"
import { TooltipProvider } from "@/components/ui/tooltip"
import { documentSession } from "@/io/document-session"
import { Canvas } from "./canvas/Canvas"
import { NoticeBar } from "./NoticeBar"
import { IssuesPanel } from "./panels/IssuesPanel"
import { PropertiesPanel } from "./panels/PropertiesPanel"
import { Toolbar } from "./Toolbar"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

export default function App() {
  useKeyboardShortcuts()
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[auto_auto_1fr] bg-background text-foreground">
        <Toolbar />
        <NoticeBar />
        {/* Sola lettura: un velo sul contenuto, la barra sopra resta cliccabile (spec §5). */}
        <div className={cn("grid min-h-0 grid-cols-[1fr_320px]", readOnly && "pointer-events-none select-none opacity-70")}>
          <Canvas />
          <aside className="flex min-h-0 flex-col border-l">
            <div className="min-h-0 flex-1 overflow-auto"><PropertiesPanel /></div>
            <IssuesPanel />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  )
}
```

Verificare che `cn` sia importato come negli altri componenti del progetto (`import { cn } from "cn"`).

- [ ] **Step 5: Scorciatoie**

In `src/ui/use-keyboard-shortcuts.ts`:

```ts
import { documentIo } from "@/io/app-io"
import { documentSession } from "@/io/document-session"
import { requestOpen } from "./document-actions"
```

e in `onKeyDown`, subito dopo `if (inTextInput(e.target)) return`:

```ts
  // In sola lettura nessuna scorciatoia agisce sul documento; il controllo si prende dalla barra.
  if (documentSession.getState().readOnly) return
```

poi, come **primi** rami della catena (prima di `mod && key === "z"`):

```ts
  if (mod && key === "s" && e.shiftKey) void documentIo.saveAs()
  else if (mod && key === "s") void documentIo.save()
  else if (mod && key === "o") requestOpen()
  else if (mod && key === "z" && e.shiftKey) doc.redo()
```

Aggiornare il commento in testa alla funzione esportata con `mod+s salva · mod+shift+s salva con nome · mod+o apri`.

- [ ] **Step 6: Avvio**

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { documentStore } from '@/editor/document-store'
import { autosave, documentIo } from '@/io/app-io'
import { buildStressDocument } from '@/perf/stress'
import App from '@/ui/App'

async function bootstrap(): Promise<void> {
  // `?stress=N` carica un documento sintetico per la misura FPS: non passa dall'archivio e non lo sporca.
  const stress = Number(new URLSearchParams(location.search).get('stress'))
  if (Number.isInteger(stress) && stress > 0) {
    autosave.stop()
    documentStore.getState().load(buildStressDocument(stress))
  } else {
    await documentIo.restoreLast()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
```

- [ ] **Step 7: Prova manuale**

`pnpm dev` e nel browser (Chrome):

1. Disegna un'entità, aspetta un secondo, ricarica: l'entità c'è, il pallino è acceso.
2. ⌘S: picker, salva `senza-titolo.dd.json`; il pallino si spegne. Modifica: si riaccende. ⌘S: si spegne senza picker.
3. Ricarica, ⌘S: il browser chiede il permesso (una volta), poi salva.
4. Menu → Nuovo → Recenti mostra il precedente; aprirlo lo ripristina.
5. Menu → Apri…: scegli il file salvato; se il buffer ha modifiche più recenti compare la conferma.
6. Apri un file con contenuto `{}`: avviso "File non valido", documento invariato.
7. Seconda scheda sullo stesso URL: barra "aperto in un'altra scheda", canvas inerte; "Prendi il controllo": la prima scheda passa in sola lettura; le modifiche fatte prima nella prima scheda sono presenti nella seconda.
8. `?fallback=1`: Salva scarica il file, Apri… apre il selettore di upload.
9. Console senza errori in tutti i passi.

- [ ] **Step 8: Lint, test, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/ui/document-actions.ts src/ui/DocumentMenu.tsx src/ui/NoticeBar.tsx src/ui/Toolbar.tsx src/ui/App.tsx src/ui/use-keyboard-shortcuts.ts src/main.tsx
git commit -m "feat(ui): menu documento, barra di avviso, scorciatoie di salvataggio e ripristino all'avvio"
```

---

### Task 8: End-to-end — disegna, ricarica, ritrova, salva, riapri, due schede

**Files:**
- Create: `scripts/e2e/persistenza.mjs`
- Modify: `package.json` (script `e2e`)

**Interfaces:**
- Consumes: `?fallback=1` (Task 3), `data-document-menu`, `#upload-input`, `data-notice-bar`, `data-take-control` (Task 7), `data-node-id`, `data-canvas`, `[aria-label="Nome entità"]` (piano precedente), strumento `e` e Invio per creare e nominare un'entità.
- Produces: `pnpm e2e`, exit code 1 in caso di fallimento.

- [ ] **Step 1: Script**

`scripts/e2e/persistenza.mjs`:

```js
/**
 * End-to-end della persistenza (spec §7): build di produzione servita da `vite preview`, Chrome di
 * sistema headless, `?fallback=1` perché Playwright non pilota i dialoghi nativi della File System
 * Access API. Copre: disegna → autosave → ricarica → ritrova; salva (download) → nuovo → carica il
 * file → ritrova; seconda scheda in sola lettura → prendi il controllo.
 *
 * Uso: `pnpm e2e`. `HEADLESS=0` per vedere il browser.
 */
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { chromium } from "playwright"

const PORT = 4174
const BASE = `http://localhost:${PORT}/?fallback=1`
const ENTITY = "utenti"

const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
/** Errori della pagina raccolti dai listener: si controllano alla fine di ogni passo, perché lanciare dentro un listener non arriva al try/catch. */
const pageErrors = []
let failed = false
try {
  await waitFor(BASE)
  const browser = await launch()
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  watch(page)

  await step("disegna un'entità e la nomina", async () => {
    await page.goto(BASE)
    await page.waitForSelector("[data-canvas]")
    await page.keyboard.press("e")
    const canvas = await page.locator("[data-canvas]").boundingBox()
    await page.mouse.click(canvas.x + 300, canvas.y + 200)
    const input = page.locator('[aria-label="Nome entità"]')
    await input.waitFor()
    await input.fill(ENTITY)
    await input.press("Enter")
    await expectNodes(page, 1)
    await expectText(page, "[data-node-id]", ENTITY)
    await expectDirty(page, true)
  })

  await step("dopo il ricaricamento l'entità è ancora lì", async () => {
    await page.waitForTimeout(800) // oltre il debounce dell'autosave (400 ms)
    await page.reload()
    await page.waitForSelector("[data-canvas]")
    await expectNodes(page, 1)
    await expectText(page, "[data-node-id]", ENTITY)
    await expectDirty(page, true)
  })

  let saved
  await step("salva scarica un .dd.json valido e spegne il pallino", async () => {
    const download = page.waitForEvent("download")
    await page.locator("[data-document-menu]").click()
    await page.getByRole("menuitem", { name: /^Salva$/ }).click()
    const d = await download
    if (!d.suggestedFilename().endsWith(".dd.json")) throw new Error(`nome inatteso: ${d.suggestedFilename()}`)
    saved = await readFile(await d.path(), "utf8")
    const parsed = JSON.parse(saved)
    if (!parsed.diagram?.model?.entities?.[ENTITY]) throw new Error("il file non contiene l'entità")
    await expectDirty(page, false)
  })

  await step("nuovo documento: canvas vuoto", async () => {
    await page.locator("[data-document-menu]").click()
    await page.getByRole("menuitem", { name: "Nuovo" }).click()
    await expectNodes(page, 0)
  })

  await step("caricare il file salvato ritrova l'entità", async () => {
    await page.locator("#upload-input").setInputFiles({ name: `${ENTITY}.dd.json`, mimeType: "application/json", buffer: Buffer.from(saved) })
    await expectNodes(page, 1)
    await expectText(page, "[data-node-id]", ENTITY)
    await expectDirty(page, false)
  })

  await step("un file non valido non carica niente e avvisa", async () => {
    await page.locator("#upload-input").setInputFiles({ name: "rotto.dd.json", mimeType: "application/json", buffer: Buffer.from("{}") })
    await page.waitForSelector("[data-notice-bar]")
    await expectText(page, "[data-notice-bar]", "File non valido")
    await expectNodes(page, 1)
  })

  await step("una seconda scheda apre in sola lettura e può prendere il controllo", async () => {
    const second = await context.newPage()
    watch(second)
    await second.goto(BASE)
    await second.waitForSelector("[data-canvas]")
    await second.waitForSelector("[data-take-control]")
    await expectNodes(second, 1)
    await second.locator("[data-take-control]").click()
    await second.waitForSelector("[data-take-control]", { state: "detached" })
    await page.waitForSelector("[data-take-control]")
    await second.close()
  })

  await browser.close()
} catch (e) {
  failed = true
  console.error(`\nFALLITO: ${e.message}`)
} finally {
  preview.kill()
}
process.exitCode = failed ? 1 : 0
console.log(failed ? "\ne2e persistenza: FAIL" : "\ne2e persistenza: PASS")

// ————— infrastruttura —————

async function step(name, fn) {
  process.stdout.write(`• ${name} … `)
  await fn()
  if (pageErrors.length > 0) throw new Error(`durante "${name}": ${pageErrors.splice(0).join(" | ")}`)
  console.log("ok")
}

function watch(page) {
  page.on("pageerror", (err) => pageErrors.push(`errore nella pagina: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`) })
}

async function launch() {
  const headless = process.env.HEADLESS !== "0"
  try {
    return await chromium.launch({ channel: "chrome", headless })
  } catch {
    console.warn("Chrome di sistema non trovato: uso il Chromium di Playwright (pnpm exec playwright install chromium)")
    return chromium.launch({ headless })
  }
}

async function waitFor(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch { /* il server non è ancora su */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`vite preview non risponde su ${url}`)
}

async function expectNodes(page, n) {
  await page.waitForFunction((n) => document.querySelectorAll("[data-node-id]").length === n, n, { timeout: 5000 })
}

async function expectText(page, selector, text) {
  await page.waitForFunction(([s, t]) => [...document.querySelectorAll(s)].some((el) => el.textContent.includes(t)), [selector, text], { timeout: 5000 })
}

async function expectDirty(page, dirty) {
  const sel = '[data-document-menu] [aria-label="Modifiche non salvate"]'
  await page.waitForSelector(sel, { state: dirty ? "attached" : "detached", timeout: 5000 })
}
```

- [ ] **Step 2: Script npm**

In `package.json`, dopo `perf`:

```json
    "e2e": "vite build && node scripts/e2e/persistenza.mjs",
```

- [ ] **Step 3: Eseguire**

Run: `pnpm e2e`
Expected: sette passi con `ok`, riga finale `e2e persistenza: PASS`, exit code 0 (`echo $?`).

Se il passo "seconda scheda" fallisce con la barra che non compare: verificare che entrambe le pagine stiano nello stesso `context` (stesso origin, stesso IndexedDB, stesso spazio dei lock) e che `restoreLast` nella seconda pagina trovi `lastOpenedId`.

- [ ] **Step 4: Verificare che l'e2e fallisca quando deve**

Modificare temporaneamente `AUTOSAVE_DELAY_MS` in `src/io/autosave.ts` a `60000`, eseguire `pnpm e2e`: il passo "dopo il ricaricamento" deve fallire e l'exit code essere 1. Ripristinare `400`.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm test && pnpm build
git add scripts/e2e/persistenza.mjs package.json
git commit -m "test: end-to-end della persistenza — disegna, ricarica, ritrova, salva, riapri, due schede"
```

---

### Task 9: Documentazione

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-06-dev-designer-design.md`

- [ ] **Step 1: README**

Nella sezione "Stato" del `README.md` aggiungere, in coda a ciò che c'è: autosave in IndexedDB, ritorno all'ultimo documento, apri/salva su file `.dd.json` (File System Access API con fallback upload/download), sola lettura fra schede con "prendi il controllo". Togliere "persistenza" e "apri/salva file" dall'elenco di ciò che manca. Aggiungere una sezione:

```markdown
## Test end-to-end

`pnpm e2e` compila, serve la build con `vite preview` e pilota il Chrome di sistema in headless:
disegna un'entità, ricarica e la ritrova dal buffer IndexedDB, salva come download, apre un documento
nuovo, ricarica il file e la ritrova, apre una seconda scheda in sola lettura e prende il controllo.
Usa `?fallback=1` perché i dialoghi della File System Access API non sono pilotabili. `HEADLESS=0`
per vedere il browser. Exit code 1 in caso di fallimento.
```

- [ ] **Step 2: Spec di progetto**

In `docs/superpowers/specs/2026-09-06-dev-designer-design.md`, §4.5, la riga «Un solo e2e Playwright: apri, disegna un'entità, salva, ricarica, ritrova.» diventa:

```markdown
- Un solo e2e Playwright (`pnpm e2e`): disegna un'entità, ricarica, ritrova; salva, riapri, ritrova;
  due schede. Sul percorso di fallback, perché i dialoghi nativi non sono pilotabili — vedi la spec
  della persistenza, §7.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-06-dev-designer-design.md
git commit -m "docs: stato della persistenza nel README e nota sull'e2e nella spec"
```

---

## Self-review

**Copertura della spec** (`2026-09-07-persistenza-design.md`):

| Sezione | Task |
|---|---|
| §2 file come verità, IndexedDB rete di sicurezza | 2, 5, 6 |
| §2 apri/salva sempre, anche senza API | 3 (`chooseSavePath`, `download`, `readFile`), 6, 7 (input nascosto) |
| §2 ritorno all'ultimo documento | 6 (`restoreLast`), 7 (`bootstrap`) |
| §2 una sola scheda scrive | 4, 5 (`readOnly` in `flush`), 6 (`own`), 7 (velo, guardia scorciatoie) |
| §2 autosave a documento intero con debounce | 5 |
| §3 strato io, regola ESLint, `document-session` fuori da `sessionStore` | 1, 3 |
| §3 `document-io` unico posto delle politiche | 6 |
| §4 record, chiave = id, `json` stringa, `meta.lastOpenedId`, recenti a 20 | 2 |
| §4 handle e permesso non persistente | 3 (`ensureWritePermission`), 6 (`write`) |
| §4 `.dd.json`, JSON a chiavi ordinate | 3 (`FILE_EXTENSION`), `toJson` esistente |
| §5 avvio, lock, record illeggibile → nuovo | 6 |
| §5 autosave 400 ms, solo proprietaria | 5 |
| §5 sola lettura, due guardie, velo | 5, 7 |
| §5 cessione: `BroadcastChannel`, autosave finale prima del rilascio, timeout | 4, 6 (`cede = autosave.flush`) |
| §5 salva: handle → permesso → picker → download | 3, 6 |
| §5 apri: confine di fiducia, recupero con conferma | 6 |
| §5 nuovo, chiusura senza `beforeunload`, semantica di `dirty` | 6, 5 |
| §6 errori: quota, IndexedDB assente, file non valido, permesso negato, handle non valido, lock occupato | 5, 6 |
| §7 test puri, `fake-indexeddb`, e2e sul fallback, forzatura `?fallback=1` | 2, 3, 4, 5, 6, 8 |
| §8 `idb`, `fake-indexeddb`, `dropdown-menu`, rilevamento a runtime | 1, 3, 4 (`"locks" in navigator`) |

Nessun requisito senza task. Il rilevamento che il file sia cambiato fuori dall'app è fuori scope per la spec (§9) e non compare.

**Segnaposto:** nessun "TBD", nessun "gestire i casi limite", ogni step con codice ha il codice.

**Coerenza dei nomi fra task:** `DocumentRecord`/`RecentEntry`/`DocumentDb` (T2) usati in T5, T6, T7; `documentSession.patch` (T3) in T5, T6, T7; `OpenedFile`, `chooseSavePath(caps, hasHandle, forceNew)`, `suggestedFileName`, `readFile` (T3) in T6, T7; `tryOwn(docId, onCede, deps)`, `takeOver(docId, onCede, deps, timeoutMs?)`, `Ownership.lost/release` (T4) in T6; `Autosave.flush/stop`, `startAutosave({ db })` (T5) in T6, T7; `DocumentIo` con `restoreLast, newDocument, openWithPicker, openFile, openRecent, save, saveAs, takeControl` (T6) in T7; `UPLOAD_INPUT_ID`, `requestOpen` (T7) nell'e2e come `#upload-input`; `data-document-menu`, `data-notice-bar`, `data-take-control` (T7) nell'e2e (T8).
