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
