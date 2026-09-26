import type { DevDocument } from "@/model/document"
import type { ShapeDiagram } from "@/model/shape/schema"

/** La parte delle forme del documento: c'è sempre, vuota se non ci sono forme. */
export function shapeDiagram(doc: DevDocument): ShapeDiagram {
  return doc.diagram.shape
}
