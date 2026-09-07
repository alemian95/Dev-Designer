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
