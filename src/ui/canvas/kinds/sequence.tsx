import { ArrowRightLeft } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { familyOps } from "@/editor/kinds/ops"
import type { Sequence } from "@/model/sequence/schema"
import { SequenceNode, SequenceNodeView } from "../Sequence"
import type { DiagramView, NodeViewProps } from "./registry"

/** Le chiavi sono quelle di `sequenceOps.nodeKeys`: una view senza sequenza non si disegna. */
function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => familyOps(s.doc, "sequence").nodeKeys()))
  return (
    <g data-layer="nodes">
      {keys.map((key) => <SequenceNode key={key} nodeKey={key} />)}
    </g>
  )
}

/** Adattatore verso la vista pura, dietro la forma generica di `DiagramView`: `node` arriva `unknown` da `buildSvg`. */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  return <SequenceNodeView id={qualify("sequence", nodeKey)} sequence={node as Sequence} view={view} selected={selected} />
}

/** Niente archi né pannello, per ora: i messaggi si disegnano dentro la sequenza. */
const Nothing = () => null

/** `DiagramView` per le sequenze: lo strumento Sequenza, nessun pannello ancora. */
export const sequenceView: DiagramView = {
  NodesLayer,
  EdgesLayer: Nothing,
  NodeView,
  EdgeView: Nothing,
  Properties: Nothing,
  tools: [{ label: "Sequenza", key: "s", Icon: ArrowRightLeft, tool: "node", family: "sequence" }],
}
