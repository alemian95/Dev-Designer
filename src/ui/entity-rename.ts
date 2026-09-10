import { renameEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { selId, sessionStore } from "@/editor/session-store"
import { documentSession } from "@/io/document-session"
import { entityKey } from "@/model/er/schema"

/**
 * Rinomina un'entità e, se non riesce, lo dice.
 *
 * Il comando risponde a una collisione o a un nome vuoto non producendo patch, quindi `dispatch`
 * torna `false`. Chi chiamava si limitava a ignorarlo: la rinomina non avveniva e l'input
 * continuava a mostrare il testo appena scritto, come se fosse stato accettato. L'avviso passa da
 * `NoticeBar`, lo stesso canale della sola lettura e degli errori di I/O.
 *
 * Il caso «nessun cambiamento» non è un fallimento e non produce alcun avviso: si riconosce dalla
 * chiave, che è funzione di nome e schema, quindi resta identica solo se entrambi lo sono.
 *
 * Torna `false` se la rinomina non è avvenuta, così `CommitInput` ripristina il campo.
 */
export function renameEntityWithNotice(key: string, name: string, schema?: string): boolean {
  const newName = name.trim()
  const newSchema = schema?.trim() || undefined
  const recipe = renameEntity(key, newName, newSchema)
  if (!recipe) {
    documentSession.getState().patch({ notice: "Il nome dell'entità non può essere vuoto." })
    return false
  }

  const newKey = entityKey({ name: newName, schema: newSchema })
  if (newKey === key) return true

  if (documentStore.getState().dispatch(recipe)) {
    sessionStore.getState().setSelection([selId("entity", newKey)])
    return true
  }
  documentSession.getState().patch({ notice: `Esiste già un'entità "${newKey}": il nome non è stato cambiato.` })
  return false
}
