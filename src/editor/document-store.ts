import { applyPatches, enablePatches, freeze, produceWithPatches, type Patch } from "immer"
import { createStore } from "zustand/vanilla"
import { createErDocument, type DevDocument } from "@/model/document"

enablePatches()

/** Un comando è una recipe Immer sul documento. Produce patch e patch inverse: l'undo non usa snapshot. */
export type Recipe = (draft: DevDocument) => void

interface HistoryEntry {
  patches: Patch[]
  inverse: Patch[]
}

export const HISTORY_LIMIT = 200

/**
 * Congela in profondità un documento che non proviene da Immer, così l'invariante
 * "il documento è immutabile dall'esterno" vale già prima del primo dispatch.
 */
const freezeDoc = (doc: DevDocument): DevDocument => freeze(doc, true)

export interface DocumentState {
  doc: DevDocument
  past: HistoryEntry[]
  future: HistoryEntry[]
  /** Applica il comando. Ritorna false se non ha prodotto patch (no-op). */
  dispatch: (recipe: Recipe) => boolean
  undo: () => void
  redo: () => void
  /** Sostituisce il documento e azzera la storia (apertura, nuovo, stress). */
  load: (doc: DevDocument) => void
}

export const documentStore = createStore<DocumentState>()((set, get) => ({
  doc: freezeDoc(createErDocument("Senza titolo")),
  past: [],
  future: [],
  dispatch: (recipe) => {
    const [doc, patches, inverse] = produceWithPatches(get().doc, recipe)
    if (patches.length === 0) return false
    set((s) => ({ doc, past: [...s.past.slice(-(HISTORY_LIMIT - 1)), { patches, inverse }], future: [] }))
    return true
  },
  undo: () => {
    const { doc, past, future } = get()
    const entry = past[past.length - 1]
    if (!entry) return
    set({ doc: applyPatches(doc, entry.inverse), past: past.slice(0, -1), future: [entry, ...future] })
  },
  redo: () => {
    const { doc, past, future } = get()
    const [entry, ...rest] = future
    if (!entry) return
    set({ doc: applyPatches(doc, entry.patches), past: [...past, entry], future: rest })
  },
  load: (doc) => {
    set({ doc: freezeDoc(doc), past: [], future: [] })
  },
}))
