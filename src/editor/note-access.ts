import type { DevDocument } from "@/model/document"
import type { NoteDiagram } from "@/model/note/schema"

/** La parte delle note del documento: c'è sempre, vuota se non ci sono note. */
export function noteDiagram(doc: DevDocument): NoteDiagram {
  return doc.diagram.note
}
