import { Circle, Diamond, Layers, Parentheses, Spline, Square, StickyNote } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { flowDiagram } from "@/editor/flow-access"
import { flowEdgeOffsets } from "@/editor/flow/geometry"
import type { FlowEdge as FlowEdgeModel, FlowNode as FlowNodeModel } from "@/model/flow/schema"
import { FlowEdge, FlowEdgeView } from "../FlowEdge"
import { FlowNode, FlowNodeView } from "../FlowNode"
import type { DiagramView, EdgeViewProps, NodeViewProps } from "./registry"

/** `NodesLayer`/`EdgesLayer` per il flowchart: stessa forma di quelli in `kinds/class.tsx` —
 *  iterano le chiavi del modello e montano un renderer per ognuna. */
function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(flowDiagram(s.doc).model.nodes)))
  return (
    <g data-layer="nodes">
      {keys.map((key) => <FlowNode key={key} nodeKey={key} />)}
    </g>
  )
}

/** Gli scarti di fascio si leggono qui, non in `FlowEdge`: dipendono da tutti gli archi, sulla
 *  stessa forma di `EdgesLayer` in `kinds/class.tsx` e in `../layers.tsx`. */
function EdgesLayer() {
  const edges = useStore(documentStore, (s) => flowDiagram(s.doc).model.edges)
  const offsets = flowEdgeOffsets(edges)
  return (
    <g data-layer="edges">
      {Object.keys(edges).map((key) => <FlowEdge key={key} edgeKey={key} offset={offsets.get(key) ?? 0} />)}
    </g>
  )
}

/** Punta a `null`: `FlowProperties` arriva nel Task 12. */
function FlowProperties() {
  return null
}

/**
 * Adattatori verso le viste pure del flowchart (`FlowNodeView`/`FlowEdgeView`), dietro la forma
 * generica di `DiagramView.NodeView`/`EdgeView` — stessa ragione di `NodeView`/`EdgeView` in
 * `kinds/er.tsx` e `kinds/class.tsx`: `node`/`relation` arrivano come `unknown` da `buildSvg` e si
 * restringono solo qui, l'unico punto che conosce il tipo concreto.
 */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  return <FlowNodeView nodeKey={nodeKey} node={node as FlowNodeModel} view={view} selected={selected} />
}

function EdgeView({ edgeKey, relation, source, target, selected, offset }: EdgeViewProps) {
  return <FlowEdgeView edgeKey={edgeKey} edge={relation as FlowEdgeModel} source={source} target={target} selected={selected} offset={offset} />
}

/**
 * `DiagramView` per il flowchart: cablaggio verso i componenti di questo task, più gli strumenti
 * — sei varianti dello strumento nodo, una per forma, e l'arco. `textFormats` elenca
 * `flow-mermaid` da questo task in poi: `emitFlowMermaid` esiste (`@/io/emit/flow-mermaid.ts`),
 * quindi il formato può comparire nel dialogo di export testo (docblock di `TextFormat`,
 * `registry.ts`).
 */
export const flowView: DiagramView = {
  NodesLayer,
  EdgesLayer,
  NodeView,
  EdgeView,
  Properties: FlowProperties,
  tools: [
    { label: "Terminale", key: "1", Icon: Circle, tool: "node", variant: "terminal" },
    { label: "Processo", key: "2", Icon: Square, tool: "node", variant: "process" },
    { label: "Decisione", key: "3", Icon: Diamond, tool: "node", variant: "decision" },
    { label: "Input/Output", key: "4", Icon: Parentheses, tool: "node", variant: "io" },
    { label: "Sottoprocesso", key: "5", Icon: Layers, tool: "node", variant: "subprocess" },
    { label: "Nota", key: "6", Icon: StickyNote, tool: "node", variant: "note" },
    { label: "Arco", key: "r", Icon: Spline, tool: "edge" },
  ],
  textFormats: ["flow-mermaid"],
}
