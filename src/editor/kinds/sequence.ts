import type { DevDocument } from "@/model/document"
import { validateSequences } from "@/model/sequence/validate"
import { sequenceDiagram } from "../sequence-access"
import type { DiagramOps } from "./ops"

/**
 * `DiagramOps` per le sequenze, nella versione minima: la famiglia c'è, ma non si disegna né si
 * modifica ancora. Geometria, comandi e layout arrivano coi task successivi del piano.
 */
export function sequenceOps(doc: DevDocument): DiagramOps {
  const diagram = () => sequenceDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),
    rectOf: () => null,
    edgesTouching: () => [],
    edgeGeometry: () => null,
    addNode: () => {
      throw new Error("sequenze: creazione non ancora disponibile")
    },
    addEdge: () => null,
    deleteItems: () => null,
    duplicateNodes: () => ({ keys: [], recipe: () => {} }),
    layoutGraph: () => ({ nodes: [], edges: [], direction: "DOWN" }),
    validate: () => validateSequences(diagram().model),
  }
}
