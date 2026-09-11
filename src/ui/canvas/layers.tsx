import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { EntityNode } from "./EntityNode"
import { RelationshipEdge } from "./RelationshipEdge"

/**
 * `NodesLayer` ed `EdgesLayer` sono già solo il contenitore che itera le chiavi del modello e
 * monta un renderer per ognuna: `erDiagram` resta qui invece di scendere in `EntityNode` /
 * `RelationshipEdge`, perché spostarlo aggiungerebbe una prop a ogni renderer senza eliminare
 * nessuna conoscenza dell'ER — quella conoscenza si sposterebbe, non sparirebbe. Questi due
 * componenti sono esattamente `erView.NodesLayer` / `erView.EdgesLayer` (`kinds/er.tsx`).
 */
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
