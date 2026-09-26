import type { DevDocument } from "@/model/document"
import { ShapeKindSchema } from "@/model/shape/schema"
import { validateShapes } from "@/model/shape/validate"
import { addShape, deleteShapeItems, duplicateShapes, shapeLayoutGraph } from "../shape/commands"
import { shapeDrawOrder, shapeRect } from "../shape/geometry"
import { shapeDiagram } from "../shape-access"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * `DiagramOps` per le forme (spec 3b): cablaggio verso `shape/commands.ts` e `shape/geometry.ts`.
 * `nodeKeys` è nell'ordine di disegno, dalla forma più grande: lo legge anche l'export SVG.
 * La geometria e il gesto delle frecce arrivano col Task 2 del piano (scostamento 4): fino ad allora
 * `edgeGeometry` e `addEdge` tornano `null`.
 */
export function shapeOps(doc: DevDocument): DiagramOps {
  const diagram = () => shapeDiagram(doc)

  return {
    nodeKeys: () => shapeDrawOrder(diagram()),

    rectOf: (key, at) => {
      const shape = diagram().model.shapes[key]
      const view = diagram().view.nodes[key]
      if (!shape || !view) return null
      return shapeRect(shape, at ? { ...view, ...at } : view)
    },

    edgesTouching: (keys): EdgeEnds[] =>
      Object.entries(diagram().model.arrows)
        .filter(([, arrow]) => keys.has(arrow.source) || keys.has(arrow.target))
        .map(([key, arrow]) => ({ key, source: arrow.source, target: arrow.target })),

    edgeGeometry: () => null,

    addNode: (at, variant) => ({ ...addShape(at, ShapeKindSchema.safeParse(variant).data ?? "rect"), edit: "body" }),

    addEdge: () => null,

    deleteItems: (nodeKeys, edgeKeys) => deleteShapeItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateShapes(diagram().model, keys),

    layoutGraph: () => shapeLayoutGraph(diagram()),

    validate: () => validateShapes(diagram().model),
  }
}
