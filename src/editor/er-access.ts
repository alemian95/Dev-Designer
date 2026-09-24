import type { DevDocument } from "@/model/document"
import type { ErDiagram } from "@/model/er/schema"

/** La parte ER del documento: c'è sempre, vuota se il documento non ha entità. */
export function erDiagram(doc: DevDocument): ErDiagram {
  return doc.diagram.er
}
