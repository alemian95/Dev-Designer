import type { Recipe } from "../document-store"

/**
 * Rinomina il documento: è un comando come gli altri, quindi va nell'undo, accende `dirty` e l'autosave
 * lo scrive nel buffer senza passare dal file. Nome vuoto = nessuna recipe; nome identico = nessuna patch.
 */
export function renameDocument(name: string): Recipe | null {
  const newName = name.trim()
  if (!newName) return null
  return (draft) => {
    if (draft.name !== newName) draft.name = newName
  }
}
