import { Circle, RectangleHorizontal, Type } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { shapeDrawOrder } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import type { Shape, ShapeView } from "@/model/shape/schema"
import { ShapeProperties } from "@/ui/panels/ShapeProperties"
import { ShapeNode, ShapeNodeView } from "../Shape"
import type { DiagramView, NodeViewProps } from "./registry"

/** Le forme nell'ordine di disegno, dalla più grande (spec 3b §5): lo stesso di `shapeOps.nodeKeys`. */
function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => shapeDrawOrder(shapeDiagram(s.doc))))
  return (
    <g data-layer="shapes">
      {keys.map((key) => <ShapeNode key={key} nodeKey={key} />)}
    </g>
  )
}

/** Le frecce arrivano col Task 2 del piano: fino ad allora il layer è vuoto. */
function EdgesLayer() {
  return <g data-layer="edges" />
}

/** Adattatore verso la vista pura, dietro la forma generica di `DiagramView`: `node` e `view` arrivano generici da `buildSvg`. */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  return <ShapeNodeView id={qualify("shape", nodeKey)} shape={node as Shape} view={view as ShapeView} selected={selected} />
}

/** Le frecce arrivano col Task 2 del piano. */
function EdgeView() {
  return null
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
