import type { DevDocument } from "@/model/document"
import type { Note, NoteDiagram } from "@/model/note/schema"
import { anchorExists } from "@/model/note/validate"

/** La parte delle note del documento: c'è sempre, vuota se non ci sono note. */
export function noteDiagram(doc: DevDocument): NoteDiagram {
  return doc.diagram.note
}

/**
 * `true` se la nota è ancorata a un elemento che c'è: la sola definizione di «ancorata» (spec 3a §6),
 * usata da Disponi (`noteLayoutGraph`, `note/layout.ts`) e dal calcolo dell'ingombro dei blocchi
 * (`layout-pack.ts`). Una nota con l'àncora pendente vale come libera. Predicato di tipo: dopo il
 * controllo, `note.anchor` è ristretto a `string`, senza bisogno di una non-null assertion a valle.
 */
export function isAnchored<T extends Pick<Note, "anchor">>(doc: DevDocument, note: T): note is T & { anchor: string } {
  return note.anchor !== null && anchorExists(doc, note.anchor)
}
