import { StickyNote } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { noteDiagram } from "@/editor/note-access"
import type { Note } from "@/model/note/schema"
import { NoteProperties } from "@/ui/panels/NoteProperties"
import { NoteNode, NoteView as NotePureView } from "../Note"
import { AnchorEdge, AnchorEdgeView } from "../NoteAnchor"
import type { DiagramView, EdgeViewProps, NodeViewProps } from "./registry"

function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(noteDiagram(s.doc).model.notes)))
  return (
    <g data-layer="nodes">
      {keys.map((key) => <NoteNode key={key} nodeKey={key} />)}
    </g>
  )
}

/** Le linee delle note ancorate: stanno con gli archi, sotto ogni nodo (spec 3a §3). */
function EdgesLayer() {
  const anchored = useStore(
    documentStore,
    useShallow((s) => Object.entries(noteDiagram(s.doc).model.notes).flatMap(([key, note]) => (note.anchor ? [key] : []))),
  )
  return (
    <g data-layer="edges">
      {anchored.map((key) => <AnchorEdge key={key} noteKey={key} />)}
    </g>
  )
}

/** Adattatori verso le viste pure, dietro la forma generica di `DiagramView`: `node` arriva `unknown` da `buildSvg`. */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  return <NotePureView id={qualify("note", nodeKey)} note={node as Note} view={view} selected={selected} />
}

function EdgeView({ edgeKey, source, target, selected }: EdgeViewProps) {
  return <AnchorEdgeView noteKey={edgeKey} source={source} target={target} selected={selected} />
}

/** `DiagramView` per le note: uno strumento solo, «Nota» (spec 3a §5). */
export const noteView: DiagramView = {
  NodesLayer,
  EdgesLayer,
  NodeView,
  EdgeView,
  Properties: NoteProperties,
  tools: [{ label: "Nota", key: "n", Icon: StickyNote, tool: "node", family: "note" }],
}
