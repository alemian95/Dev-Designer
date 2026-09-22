import type { DevDocument } from "@/model/document"
import type { FlowDiagram } from "@/model/flow/schema"

/** Il diagramma come flowchart. Chi chiama sa già che lo è: lo garantisce `opsFor`. */
export function flowDiagram(doc: DevDocument): FlowDiagram {
  if (doc.diagram.type !== "flow") throw new Error("il documento non è un flowchart")
  return doc.diagram
}
