import type { DevDocument } from "@/model/document"
import type { FlowDiagram, FlowShape } from "@/model/flow/schema"
import { addFlowEdge, addFlowNode, deleteFlowItems, duplicateFlowNodes } from "../flow/commands"
import { flowDiagram } from "../flow-access"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * Corsia sotto la coordinata y del rilascio. Stub: la geometria delle bande arriva nel Task 6
 * (`editor/flow/geometry.ts`), che sostituisce questo corpo. Finché non c'è, ogni punto risolve
 * sempre alla prima corsia — il test che vuole il comportamento vero è già scritto, `it.todo`, in
 * `kinds/flow.test.ts`, così il Task 6 lo trova rosso e lo accende. `null` è il caso che oggi non
 * può succedere (`FlowModelSchema` impone almeno una corsia) ma che la firma vera dichiarerà
 * comunque, per il punto y fuori da ogni banda: `addNode` lo gestisce già.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `_y` resta nella firma per il Task 6, che la userà davvero.
function laneAt(d: FlowDiagram, _y: number): string | null {
  return d.model.lanes[0]?.id ?? null
}

/**
 * `DiagramOps` per il flowchart: cablaggio verso i comandi di `flow/commands.ts`, sulla forma di
 * `kinds/er.ts` e `kinds/class.ts`. `rectOf`, `edgeGeometry`, `layoutGraph` e `validate` restano
 * stub — servono rispettivamente la geometria per forma (Task 6), il grafo da disporre (Task 5) e
 * le regole di validazione (Task 9), nessuna delle quali esiste ancora — e nessun chiamante li
 * raggiunge prima che quei task colleghino il flowchart al resto dell'editor.
 */
export function flowOps(doc: DevDocument): DiagramOps {
  const diagram = () => flowDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),

    rectOf: () => {
      // ponytail: rimosso nel Task 6
      throw new Error("flowchart: geometria dei nodi non ancora implementata")
    },

    edgesTouching: (keys): EdgeEnds[] =>
      Object.entries(diagram().model.edges)
        .filter(([, edge]) => keys.has(edge.source) || keys.has(edge.target))
        .map(([key, edge]) => ({ key, source: edge.source, target: edge.target })),

    edgeGeometry: () => {
      // ponytail: rimosso nel Task 6
      throw new Error("flowchart: geometria degli archi non ancora implementata")
    },

    addNode: (at, variant) => {
      const d = diagram()
      const shape = (variant ?? "process") as FlowShape
      const lane = laneAt(d, at.y)
      if (lane === null) throw new Error("flowchart: il documento non ha nessuna corsia")
      return { ...addFlowNode(at, shape, lane), edit: "body" }
    },

    addEdge: (source, target) => addFlowEdge(diagram().model, source, target),

    deleteItems: (nodeKeys, edgeKeys) => deleteFlowItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateFlowNodes(diagram().model, keys),

    layoutGraph: () => {
      // ponytail: rimosso nel Task 5
      throw new Error("flowchart: layout non ancora implementato")
    },

    validate: () => {
      // ponytail: rimosso nel Task 9
      throw new Error("flowchart: validazione non ancora implementata")
    },
  }
}
