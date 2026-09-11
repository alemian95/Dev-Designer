import { Box, Spline } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { classDiagram } from "@/editor/class-access"
import { documentStore } from "@/editor/document-store"
import type { ClassNode as ClassNodeModel, ClassRelation } from "@/model/class/schema"
import { ClassProperties } from "@/ui/panels/ClassProperties"
import { ClassEdge, ClassEdgeView } from "../ClassEdge"
import { ClassNode, ClassNodeView } from "../ClassNode"
import type { DiagramView, EdgeViewProps, NodeViewProps } from "./registry"

/**
 * `NodesLayer`/`EdgesLayer` per il class diagram: stesso ruolo di quelli in `../layers.tsx` per
 * l'ER — iterano le chiavi del modello e montano un renderer per ognuna — ma vivono qui, non lì:
 * `layers.tsx` resta ER-specifico (Task 6), e questi due sono `classView.NodesLayer`/`EdgesLayer`.
 */
function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(classDiagram(s.doc).model.classes)))
  return (
    <g data-layer="nodes">
      {keys.map((key) => <ClassNode key={key} nodeKey={key} />)}
    </g>
  )
}

function EdgesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(classDiagram(s.doc).model.relations)))
  return (
    <g data-layer="edges">
      {keys.map((key) => <ClassEdge key={key} edgeKey={key} />)}
    </g>
  )
}

/**
 * Adattatori verso le viste pure delle classi (`ClassNodeView`/`ClassEdgeView`), dietro la forma
 * generica di `DiagramView.NodeView`/`EdgeView`: stessa ragione di `NodeView`/`EdgeView` in
 * `kinds/er.tsx` — `node`/`relation` arrivano come `unknown` e si restringono qui, l'unico punto
 * che conosce il tipo concreto.
 */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  return <ClassNodeView nodeKey={nodeKey} node={node as ClassNodeModel} view={view} selected={selected} />
}

function EdgeView({ edgeKey, relation, source, target, selected }: EdgeViewProps) {
  return <ClassEdgeView edgeKey={edgeKey} relation={relation as ClassRelation} source={source} target={target} selected={selected} />
}

/** `DiagramView` per il class diagram: cablaggio verso i componenti già scritti nei Task 11-12,
 *  più il pannello (`ClassProperties.tsx`) e gli strumenti di questo task. Nessuna logica nuova qui. */
export const classView: DiagramView = {
  NodesLayer,
  EdgesLayer,
  NodeView,
  EdgeView,
  Properties: ClassProperties,
  tools: {
    node: { label: "Classe", key: "c", Icon: Box },
    edge: { label: "Relazione", key: "r", Icon: Spline },
  },
  textFormats: ["class-mermaid"],
}
