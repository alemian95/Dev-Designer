import type { DevDocument } from "@/model/document"
import type { FlowDiagram, FlowShape } from "@/model/flow/schema"
import { validateFlow } from "@/model/flow/validate"
import { addFlowEdge, addFlowNode, applyFlowLayout, deleteFlowItems, duplicateFlowNodes, moveFlowNodes } from "../flow/commands"
import { flowEdgeGeometry, flowEdgeOffsets, flowNodeRect, flowNodeSize, laneAt } from "../flow/geometry"
import { flowDiagram } from "../flow-access"
import { flowLayoutGraph, keepNodeInBand } from "../flow/layout"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * Corsia da assegnare a un click fuori da ogni banda — sopra la prima o sotto l'ultima. `laneAt`
 * non indovina apposta (il suo stesso docblock, `flow/geometry.ts`): decide chi chiama, e chi crea
 * un nodo sa che l'intenzione è "la corsia più vicina", non "nessuna corsia". Le bande sono
 * contigue dall'origine (`restackLanes`, `flow/commands.ts`), quindi basta guardare la prima e
 * l'ultima: sopra l'una o sotto l'altra sono gli unici due modi di restare fuori da ogni banda.
 * `null` resta per il solo caso che lo schema rende impossibile — un documento senza corsie
 * (`FlowModelSchema.lanes` è `.min(1)`) — e qui è un ripiego difensivo, non un percorso atteso.
 */
function nearestLane(d: FlowDiagram, y: number): string | null {
  const lanes = d.model.lanes
  const first = lanes[0]
  const last = lanes[lanes.length - 1]
  if (!first || !last) return null
  const firstBand = d.view.lanes[first.id]
  const lastBand = d.view.lanes[last.id]
  if (firstBand && y < firstBand.y) return first.id
  if (lastBand && y >= lastBand.y + lastBand.h) return last.id
  return null
}

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

    /**
     * C1: `laneAt(d, at.y)` torna `null` anche per un click sopra la prima banda o sotto
     * l'ultima — il caso normale in un documento con poche corsie, non più un errore da quando
     * `laneAt` è reale (`flow/geometry.ts`). La corsia si decide dal punto del click (è
     * l'intenzione di chi disegna: `nearestLane` sopra), poi il nodo rientra in quella banda con
     * `keepNodeInBand` — altrimenti un click vicino al bordo di una banda creerebbe un nodo a
     * cavallo di quella successiva pur appartenendo a questa.
     */
    addNode: (at, variant) => {
      const d = diagram()
      const shape = (variant ?? "process") as FlowShape
      const lane = laneAt(d, at.y) ?? nearestLane(d, at.y)
      if (lane === null) throw new Error("flowchart: il documento non ha nessuna corsia")
      const band = d.view.lanes[lane]
      const size = flowNodeSize({ label: "", shape, lane })
      const y = band ? keepNodeInBand(band, size.h, at.y) : at.y
      return { ...addFlowNode({ x: at.x, y }, shape, lane), edit: "body" }
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
