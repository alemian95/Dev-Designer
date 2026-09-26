import type { DevDocument } from "@/model/document"
import { ShapeKindSchema } from "@/model/shape/schema"
import { validateShapes } from "@/model/shape/validate"
import { addArrow, addShape, deleteShapeItems, duplicateShapes, resizeShape, shapeLayoutGraph } from "../shape/commands"
import { arrowGeometry, arrowOffsets, resizedShape, shapeDrawOrder, shapeRect } from "../shape/geometry"
import { shapeDiagram } from "../shape-access"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * `DiagramOps` per le forme (spec 3b): cablaggio verso `shape/commands.ts` e `shape/geometry.ts`.
 * `nodeKeys` è nell'ordine di disegno, dalla forma più grande: lo legge anche l'export SVG.
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

    edgeGeometry: (key, a, b) => {
      const model = diagram().model
      const arrow = model.arrows[key]
      return arrow ? arrowGeometry(a, b, arrow, arrowOffsets(model.arrows).get(key) ?? 0) : null
    },

    addNode: (at, variant) => ({ ...addShape(at, ShapeKindSchema.safeParse(variant).data ?? "rect"), edit: "body" }),

    addEdge: (source, target) => addArrow(diagram().model, source, target),

    deleteItems: (nodeKeys, edgeKeys) => deleteShapeItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateShapes(diagram().model, keys),

    layoutGraph: () => shapeLayoutGraph(diagram()),

    // Una forma ha una maniglia sola, nell'angolo in basso a destra: `lane` non si usa (spec 3b §5).
    resize: (key, _lane, dx, dy) => {
      const d = diagram()
      const shape = d.model.shapes[key]
      const view = d.view.nodes[key]
      if (!shape || !view) return null
      const next = resizedShape(shape, view, dx, dy)
      return { rect: { x: view.x, y: view.y, ...next.size }, recipe: resizeShape(key, next.w, next.h) }
    },

    validate: () => validateShapes(diagram().model),
  }
}
