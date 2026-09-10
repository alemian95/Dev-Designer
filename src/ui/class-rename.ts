import { renameClass } from "@/editor/class/commands"
import { documentStore } from "@/editor/document-store"
import { selId, sessionStore } from "@/editor/session-store"
import { documentSession } from "@/io/document-session"

/**
 * Rinomina una classe e, se non riesce, lo dice. Stessa forma di `renameEntityWithNotice`
 * (`entity-rename.ts`): qui però la chiave della classe *è* il nome, quindi il confronto per
 * «nessun cambiamento» è diretto sulla chiave invece di passare da un accessore composto come
 * `entityKey`.
 *
 * Torna `false` se la rinomina non è avvenuta, così `CommitInput` ripristina il campo.
 */
export function renameClassWithNotice(key: string, name: string): boolean {
  const newName = name.trim()
  const recipe = renameClass(key, newName)
  if (!recipe) {
    documentSession.getState().patch({ notice: "Il nome della classe non può essere vuoto." })
    return false
  }
  if (newName === key) return true
  if (documentStore.getState().dispatch(recipe)) {
    sessionStore.getState().setSelection([selId("node", newName)])
    return true
  }
  documentSession.getState().patch({ notice: `Esiste già una classe "${newName}": il nome non è stato cambiato.` })
  return false
}
