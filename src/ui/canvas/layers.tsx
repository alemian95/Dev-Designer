import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { EntityNode } from "./EntityNode"
import { RelationshipEdge } from "./RelationshipEdge"

export function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(erDiagram(s.doc).model.entities)))
  return (
    <g data-layer="nodes">
      {keys.map((key) => <EntityNode key={key} nodeKey={key} />)}
    </g>
  )
}

export function EdgesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(erDiagram(s.doc).model.relationships)))
  return (
    <g data-layer="edges">
      {keys.map((key) => <RelationshipEdge key={key} edgeKey={key} />)}
    </g>
  )
}
