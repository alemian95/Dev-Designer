import { Circle, RectangleHorizontal, Type } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { arrowOffsets, shapeDrawOrder } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import type { Arrow, Shape, ShapeView } from "@/model/shape/schema"
import { ShapeProperties } from "@/ui/panels/ShapeProperties"
import { ArrowEdge, ArrowEdgeView } from "../ShapeArrow"
import { ShapeNode, ShapeNodeView } from "../Shape"
import type { DiagramView, EdgeViewProps, NodeViewProps } from "./registry"

/** Le forme nell'ordine di disegno, dalla più grande (spec 3b §5): lo stesso di `shapeOps.nodeKeys`. */
function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => shapeDrawOrder(shapeDiagram(s.doc))))
  return (
    <g data-layer="shapes">
      {keys.map((key) => <ShapeNode key={key} nodeKey={key} />)}
    </g>
  )
}

/** Gli scarti di fascio si leggono qui, non in `ArrowEdge`: dipendono da tutte le frecce. */
function EdgesLayer() {
  const arrows = useStore(documentStore, (s) => shapeDiagram(s.doc).model.arrows)
  const offsets = arrowOffsets(arrows)
  return (
    <g data-layer="edges">
      {Object.keys(arrows).map((key) => <ArrowEdge key={key} arrowKey={key} offset={offsets.get(key) ?? 0} />)}
    </g>
  )
}

/** Adattatore verso la vista pura, dietro la forma generica di `DiagramView`: `node` e `view` arrivano generici da `buildSvg`. */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  return <ShapeNodeView id={qualify("shape", nodeKey)} shape={node as Shape} view={view as ShapeView} selected={selected} />
}

function EdgeView({ edgeKey, relation, source, target, selected, offset }: EdgeViewProps) {
  return <ArrowEdgeView arrowKey={edgeKey} arrow={relation as Arrow} source={source} target={target} selected={selected} offset={offset} />
}

/**
 * `DiagramView` per le forme (spec 3b): tre strumenti, e i nodi disegnati sotto tutto (`backdrop`).
 * Un testo vuoto non esce nell'export: sul canvas mostra il segnaposto, in un file sarebbe solo spazio.
 */
export const shapeView: DiagramView = {
  NodesLayer,
  EdgesLayer,
  NodeView,
  EdgeView,
  Properties: ShapeProperties,
  backdrop: true,
  hiddenInExport: (node) => {
    const shape = node as Shape
    return shape.kind === "text" && shape.label === ""
  },
  tools: [
    { label: "Rettangolo", key: "q", Icon: RectangleHorizontal, tool: "node", family: "shape", variant: "rect" },
    { label: "Ellisse", key: "o", Icon: Circle, tool: "node", family: "shape", variant: "ellipse" },
    { label: "Testo", key: "t", Icon: Type, tool: "node", family: "shape", variant: "text" },
  ],
}
