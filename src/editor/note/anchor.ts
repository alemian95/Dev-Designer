import type { DevDocument } from "@/model/document"
import { anchorExists } from "@/model/note/validate"
import type { Recipe } from "../document-store"
import type { EdgeEnds } from "../edge-routing"
import { qualify, splitKey } from "../families"
import type { ConnectResult } from "../links/commands"
import { noteDiagram } from "../note-access"

/**
 * Le funzioni della linea di ancoraggio che hanno bisogno di vedere più famiglie: l'altro capo di
 * una linea sta sempre fuori dalla famiglia `note`. Le chiama `CanvasOps` (e `followRename`), come
 * fa con i collegamenti. Tutte le chiavi qui sono **con prefisso**.
 */

/**
 * Collega fra una nota e un altro elemento (spec 3a §5), in qualunque verso: l'àncora va sulla nota.
 * `null` quando nessuno o entrambi gli estremi sono note, o quando l'altro estremo non è un'àncora
 * possibile. La chiave del risultato è quella della nota, cioè della sua linea: il runner la
 * seleziona come un arco. Verso l'àncora che la nota ha già torna `existing`, così il gesto non
 * lascia una voce di annulla vuota.
 */
export function anchorNote(doc: DevDocument, from: string, to: string): ConnectResult | null {
  const a = splitKey(from)
  const b = splitKey(to)
  const aIsNote = a.family === "note"
  if (aIsNote === (b.family === "note")) return null
  const [noteKey, anchor] = aIsNote ? [a.key, to] : [b.key, from]
  const note = noteDiagram(doc).model.notes[noteKey]
  if (!note || !anchorExists(doc, anchor)) return null
  const key = qualify("note", noteKey)
  if (note.anchor === anchor) return { type: "existing", key }
  return {
    type: "created",
    key,
    recipe: (draft) => {
      const target = noteDiagram(draft).model.notes[noteKey]
      if (target) target.anchor = anchor
    },
  }
}

/**
 * Le linee di ancoraggio che toccano `keys`: quelle delle note fra le chiavi e quelle delle note
 * ancorate a un elemento fra le chiavi. Servono all'anteprima del drag, che ridisegna le linee
 * mentre la nota o il suo elemento si spostano, come `linksTouching` per i collegamenti.
 */
export function anchorsTouching(doc: DevDocument, keys: ReadonlySet<string>): EdgeEnds[] {
  return Object.entries(noteDiagram(doc).model.notes).flatMap(([key, note]) => {
    if (note.anchor === null) return []
    const source = qualify("note", key)
    return keys.has(source) || keys.has(note.anchor) ? [{ key: source, source, target: note.anchor }] : []
  })
}

/** Le note con un'àncora che esiste: le sole che un'eliminazione può staccare. */
export function liveAnchored(doc: DevDocument): Set<string> {
  return new Set(Object.entries(noteDiagram(doc).model.notes).flatMap(([key, note]) => (note.anchor !== null && anchorExists(doc, note.anchor) ? [key] : [])))
}

/**
 * Stacca, fra le note `live` (`liveAnchored` prima dell'eliminazione), quelle la cui àncora non
 * esiste più. Va dopo le recipe di un'eliminazione, sullo stesso draft (spec 3a §5): vale per ogni
 * elemento e sotto-elemento tolto senza una regola per famiglia, e un'àncora già pendente resta
 * com'era, col suo `note-dangling-anchor`.
 */
export function detachDangling(live: ReadonlySet<string>): Recipe {
  return (draft) => {
    for (const [key, note] of Object.entries(noteDiagram(draft).model.notes)) {
      if (live.has(key) && note.anchor !== null && !anchorExists(draft, note.anchor)) note.anchor = null
    }
  }
}

/** Le àncore che nominano `oldKey` passano a `newKey`: la rinomina di un'entità o di una classe ne cambia la chiave. */
export function retargetAnchors(oldKey: string, newKey: string): Recipe {
  return (draft) => {
    for (const note of Object.values(noteDiagram(draft).model.notes)) {
      if (note.anchor === oldKey) note.anchor = newKey
    }
  }
}
