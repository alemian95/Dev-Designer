import type { DevDocument } from "@/model/document"
import { splitSequenceKey } from "@/model/sequence/schema"
import { validateSequences } from "@/model/sequence/validate"
import { sequenceRect, subRect } from "../sequence/geometry"
import { sequenceLayout } from "../sequence/layout"
import { sequenceDiagram } from "../sequence-access"
import type { DiagramOps } from "./ops"

/**
 * `DiagramOps` per le sequenze: si disegnano e si dispongono, ma non si modificano ancora. I comandi
 * arrivano coi task successivi del piano. Un messaggio non è un arco di canvas: niente archi.
 */
export function sequenceOps(doc: DevDocument): DiagramOps {
  const diagram = () => sequenceDiagram(doc)
  const nodeKeys = () => Object.keys(diagram().view.nodes).filter((key) => diagram().model.sequences[key])

  return {
    nodeKeys,

    // `<seq>` è la sequenza, `<seq>/<sub>` un suo sotto-elemento; `at` sposta la sequenza intera.
    rectOf: (key, at) => {
      const parts = splitSequenceKey(key)
      const seq = parts && diagram().model.sequences[parts.sequence]
      const view = parts && diagram().view.nodes[parts.sequence]
      if (!parts || !seq || !view) return null
      const origin = at ?? view
      return parts.participant === null ? sequenceRect(seq, origin) : subRect(seq, origin, parts.participant)
    },

    edgesTouching: () => [],
    edgeGeometry: () => null,
    addNode: () => {
      throw new Error("sequenze: creazione non ancora disponibile")
    },
    addEdge: () => null,
    deleteItems: () => null,
    duplicateNodes: () => ({ keys: [], recipe: () => {} }),

    // L'interno non passa da ELK (spec §4.3): ogni sequenza è un blocco della misura che il contenuto le dà.
    layoutGraph: () => ({
      nodes: nodeKeys().flatMap((id) => {
        const seq = diagram().model.sequences[id]
        if (!seq) return []
        const { width, height } = sequenceLayout(seq)
        return [{ id, w: width, h: height }]
      }),
      edges: [],
      direction: "DOWN",
    }),

    validate: () => validateSequences(diagram().model),
  }
}
