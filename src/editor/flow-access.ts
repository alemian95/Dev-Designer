import type { DevDocument } from "@/model/document"
import type { FlowDiagram } from "@/model/flow/schema"

/** La parte di flusso del documento: c'è sempre, anche senza pool e senza nodi. Nessun guard: la
 *  presenza la garantisce lo schema, non chi chiama. */
export function flowDiagram(doc: DevDocument): FlowDiagram {
  return doc.diagram.flow
}
