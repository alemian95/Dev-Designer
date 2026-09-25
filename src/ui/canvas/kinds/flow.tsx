import { Rows3 } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { flowDiagram } from "@/editor/flow-access"
import { flowEdgeOffsets } from "@/editor/flow/geometry"
import { POOL_VARIANT } from "@/editor/kinds/flow"
import type { FlowEdge as FlowEdgeModel, FlowNode as FlowNodeModel } from "@/model/flow/schema"
import { FLOW_SHAPE_ICON, FLOW_SHAPE_LABEL, FLOW_SHAPES } from "@/ui/flow-shapes"
import { FlowProperties } from "@/ui/panels/FlowProperties"
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
 * — sei varianti dello strumento nodo, una per forma. Collega è comune a tutte le famiglie
 * (`LINK_TOOL`, `registry.ts`) e non compare qui. Il pannello delle corsie, che si mostra senza
 * selezione, non passa di qui: lo monta `PropertiesPanel` quando il flusso ha nodi.
 */
export const flowView: DiagramView = {
  NodesLayer,
  EdgesLayer,
  NodeView,
  EdgeView,
  Properties: FlowProperties,
  // Sei varianti, una per forma: l'ordine e il tasto (`1`..`6`, spec §11) seguono `FLOW_SHAPES`,
  // cioè l'ordine di `FlowShapeSchema`. Etichetta e icona vengono da `flow-shapes.ts`, non
  // ridichiarate qui — è la stessa fonte che usa il select del pannello proprietà.
  tools: [
    ...FLOW_SHAPES.map((shape, i) => ({
      // La nota ha un'etichetta sua solo qui: il select delle forme nel pannello resta «Nota».
      label: shape === "note" ? "Nota di flusso" : FLOW_SHAPE_LABEL[shape],
      key: String(i + 1),
      Icon: FLOW_SHAPE_ICON[shape],
      tool: "node" as const,
      family: "flow" as const,
      variant: shape,
    })),
    // Il pool è una variante dello strumento nodo che crea un contenitore (spec 2b §5).
    { label: "Pool", key: "p", Icon: Rows3, tool: "node" as const, family: "flow" as const, variant: POOL_VARIANT },
  ],
}
