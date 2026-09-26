import type { ClassDiagram } from "@/model/class/schema"
import type { DevDocument } from "@/model/document"

/** La parte di classi del documento: c'è sempre, vuota se il documento non ha classi. */
export function classDiagram(doc: DevDocument): ClassDiagram {
  return doc.diagram.class
}
