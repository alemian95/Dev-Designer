import type { DevDocument } from "@/model/document"
import type { FlowDiagram } from "@/model/flow/schema"

/**
 * La parte di flusso del documento: c'è sempre, con almeno una corsia anche quando non ha nodi
 * (`lanes` è `.min(1)`). Nessun guard: la presenza la garantisce lo schema, non chi chiama.
 */
export function flowDiagram(doc: DevDocument): FlowDiagram {
  return doc.diagram.flow
}
