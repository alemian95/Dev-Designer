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
