import type { DevDocument } from "@/model/document"
import type { FlowShape } from "@/model/flow/schema"
import { validateFlow } from "@/model/flow/validate"
import { addFlowEdge, addFlowNode, applyFlowLayout, deleteFlowItems, duplicateFlowNodes, moveFlowNodes } from "../flow/commands"
import { flowEdgeGeometry, flowEdgeOffsets, flowNodeRect, laneAt } from "../flow/geometry"
import { flowDiagram } from "../flow-access"
import { flowLayoutGraph } from "../flow/layout"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * `DiagramOps` per il flowchart: cablaggio verso i comandi di `flow/commands.ts` e `flow/layout.ts`,
 * sulla forma di `kinds/er.ts` e `kinds/class.ts`. `edgeGeometry` è cablato su `flowEdgeGeometry`
 * (`flow/geometry.ts`), sulla stessa forma di `erOps.edgeGeometry` (`kinds/er.ts:34-38`): lo scarto
 * di fascio si legge dal modello intero, non si passa dal chiamante, perché dipende da *tutti* gli
 * archi. `commitDrag` è l'unico tipo di diagramma che lo implementa (spec §6): ER e class restano
 * senza, e il runner cade su `moveNodes` per loro esattamente come prima. `validate` è cablato su
 * `validateFlow` (`model/flow/validate.ts`, spec §9).
 */
export function flowOps(doc: DevDocument): DiagramOps {
  const diagram = () => flowDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),

    rectOf: (key, at) => {
      const node = diagram().model.nodes[key]
      const view = diagram().view.nodes[key]
      if (!node || !view) return null
      return flowNodeRect(node, at ? { ...view, ...at } : view)
    },

    edgesTouching: (keys): EdgeEnds[] =>
      Object.entries(diagram().model.edges)
        .filter(([, edge]) => keys.has(edge.source) || keys.has(edge.target))
        .map(([key, edge]) => ({ key, source: edge.source, target: edge.target })),

    edgeGeometry: (key, a, b) => {
      const model = diagram().model
      const edge = model.edges[key]
      return edge ? flowEdgeGeometry(a, b, edge, flowEdgeOffsets(model.edges).get(key) ?? 0) : null
    },

    addNode: (at, variant) => {
      const d = diagram()
      const shape = (variant ?? "process") as FlowShape
      const lane = laneAt(d, at.y)
      if (lane === null) throw new Error("flowchart: il documento non ha nessuna corsia")
      return { ...addFlowNode(at, shape, lane), edit: "body" }
    },

    addEdge: (source, target) => addFlowEdge(diagram().model, source, target),

    commitDrag: (keys, dx, dy) => moveFlowNodes(keys, dx, dy),

    deleteItems: (nodeKeys, edgeKeys) => deleteFlowItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateFlowNodes(diagram().model, keys),

    layoutGraph: () => flowLayoutGraph(diagram()),

    layoutRecipe: (positions) => applyFlowLayout(positions),

    validate: () => validateFlow(diagram().model),
  }
}
