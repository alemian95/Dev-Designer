import type { DevDocument } from "@/model/document"
import { nextName, type FlowShape } from "@/model/flow/schema"
import { validateFlow } from "@/model/flow/validate"
import { addFlowEdge, addFlowNode, addPool, applyFlowLayout, clampLaneH, clampPoolW, deleteFlowItems, duplicateFlowNodes, moveFlowNodes, resizeLane, resizePool } from "../flow/commands"
import { flowEdgeGeometry, flowEdgeOffsets, flowNodeRect, flowNodeSize, laneAt, laneRect, poolAt, poolMembers, poolRect } from "../flow/geometry"
import { flowDiagram } from "../flow-access"
import { flowLayoutGraph, keepInSpan, placedBounds, placedRectOf } from "../flow/layout"
import type { DiagramOps, EdgeEnds } from "./ops"

/** La variante dello strumento nodo che crea un pool invece di un nodo (spec 2b §5). */
export const POOL_VARIANT = "pool"

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

    frameKeys: () => Object.keys(diagram().model.pools),

    withFollowers: (keys) => {
      const d = diagram()
      return [...new Set([...keys, ...keys.flatMap((k) => (k in d.model.pools ? poolMembers(d, k) : []))])]
    },

    refuseNode: (at, variant) => (variant === POOL_VARIANT && poolAt(diagram(), at) !== null ? "Un pool non sta dentro un altro pool." : null),

    rectOf: (key, at) => {
      const d = diagram()
      if (key in d.model.pools) return poolRect(d, key, at)
      const node = d.model.nodes[key]
      const view = d.view.nodes[key]
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

    /**
     * Dentro una corsia il nodo nasce in quella corsia e rientra nei suoi margini su entrambi gli
     * assi: un clic vicino al bordo non deve creare un nodo a cavallo della corsia accanto o del
     * bordo del pool. Fuori da ogni pool, o sulla sua striscia, nasce libero dove si è cliccato
     * (spec 2b §5).
     */
    addNode: (at, variant) => {
      const d = diagram()
      if (variant === POOL_VARIANT) return { ...addPool(at, nextName("Pool", Object.values(d.model.pools))), edit: null }
      const shape = (variant ?? "process") as FlowShape
      const lane = laneAt(d, at)
      const rect = lane === null ? null : laneRect(d, lane)
      if (!rect) return { ...addFlowNode(at, shape, null), edit: "body" }
      const { w, h } = flowNodeSize({ label: "", shape })
      const inLane = { x: keepInSpan(rect.x, rect.w, w, at.x), y: keepInSpan(rect.y, rect.h, h, at.y) }
      return { ...addFlowNode(inLane, shape, rect.id), edit: "body" }
    },

    addEdge: (source, target) => addFlowEdge(diagram().model, source, target),

    commitDrag: (keys, dx, dy) => moveFlowNodes(keys, dx, dy),

    deleteItems: (nodeKeys, edgeKeys) => deleteFlowItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateFlowNodes(diagram().model, keys),

    layoutGraph: () => flowLayoutGraph(diagram()),

    layoutBounds: (positions) => placedBounds(diagram(), positions),

    layoutRectOf: (positions, key) => placedRectOf(diagram(), positions, key),

    layoutRecipe: (positions, offset) => applyFlowLayout(positions, offset),

    resize: (key, lane, dx, dy) => {
      const d = diagram()
      if (lane === null) {
        const view = d.view.pools[key]
        const rect = poolRect(d, key)
        if (!view || !rect) return null
        const w = clampPoolW(d, key, view.w + dx)
        return { rect: { ...rect, w }, recipe: resizePool(key, w) }
      }
      const rect = laneRect(d, lane)
      if (!rect || rect.poolId !== key) return null
      const h = clampLaneH(d, lane, rect.h + dy)
      return { rect: { ...rect, h }, recipe: resizeLane(lane, h) }
    },

    validate: () => validateFlow(diagram().model),
  }
}
