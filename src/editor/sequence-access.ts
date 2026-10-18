import type { DevDocument } from "@/model/document"
import type { SequenceDiagram } from "@/model/sequence/schema"

/** La parte delle sequenze del documento: c'è sempre, vuota se non ci sono sequenze. */
export function sequenceDiagram(doc: DevDocument): SequenceDiagram {
  return doc.diagram.sequence
}
