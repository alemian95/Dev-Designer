import type { DevDocument } from "@/model/document"
import type { FlowShape } from "@/model/flow/schema"
import { addFlowEdge, addFlowNode, applyFlowLayout, deleteFlowItems, duplicateFlowNodes } from "../flow/commands"
import { laneAt } from "../flow/geometry"
import { flowDiagram } from "../flow-access"
import { flowLayoutGraph } from "../flow/layout"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * `DiagramOps` per il flowchart: cablaggio verso i comandi di `flow/commands.ts` e `flow/layout.ts`,
 * sulla forma di `kinds/er.ts` e `kinds/class.ts`. `rectOf` ed `edgeGeometry` restano stub: la
 * geometria per forma esiste da `flow/geometry.ts` (Task 6), ma il piano non ne assegna il
 * cablaggio qui a nessun task — resta per quando un chiamante reale (selezione, drag, export) la
 * raggiungerà. `validate` resta stub per un motivo diverso: aspetta le regole di validazione del
 * Task 9, non la geometria.
 */
export function flowOps(doc: DevDocument): DiagramOps {
  const diagram = () => flowDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),

    rectOf: () => {
      // ponytail: non ancora cablato a `flowNodeRect` (`flow/geometry.ts`, Task 6) — il piano non
      // assegna questo cablaggio a nessun task. Va risolto quando un chiamante vero (selezione,
      // drag, export) raggiunge il flowchart.
      throw new Error("flowchart: geometria dei nodi non ancora implementata")
    },

    edgesTouching: (keys): EdgeEnds[] =>
      Object.entries(diagram().model.edges)
        .filter(([, edge]) => keys.has(edge.source) || keys.has(edge.target))
        .map(([key, edge]) => ({ key, source: edge.source, target: edge.target })),

    edgeGeometry: () => {
      // ponytail: non ancora cablato — la geometria degli archi (routing, frecce) non è ancora
      // stata composta per il flowchart e il piano non assegna questo cablaggio a nessun task.
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

    layoutGraph: () => flowLayoutGraph(diagram()),

    layoutRecipe: (positions) => applyFlowLayout(positions),

    validate: () => {
      // ponytail: rimosso nel Task 9
      throw new Error("flowchart: validazione non ancora implementata")
    },
  }
}
