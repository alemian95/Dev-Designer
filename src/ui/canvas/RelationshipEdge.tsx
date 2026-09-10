import { memo } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { edgeGeometry } from "@/editor/edge-routing"
import { erDiagram } from "@/editor/er-access"
import { entityRect } from "@/editor/er/geometry"
import type { Rect } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import type { Relationship } from "@/model/er/schema"
import { registerEdge } from "./dom-registry"

interface Props {
  edgeKey: string
  relationship: Relationship
  source: Rect
  target: Rect
  selected: boolean
}

export const RelationshipEdgeView = memo(function RelationshipEdgeView({ edgeKey, relationship, source, target, selected }: Props) {
  const geo = edgeGeometry(source, target, relationship)
  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  return (
    <g
      data-edge-id={edgeKey}
      ref={(el) => {
        registerEdge(edgeKey, el)
        return () => registerEdge(edgeKey, null)
      }}
    >
      <path data-edge-hit d={geo.d} fill="none" stroke="transparent" strokeWidth={12} />
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray={relationship.identifying ? undefined : "6 4"} />
      <path data-edge-source d={geo.sourceMarker} fill="none" stroke={stroke} strokeWidth={1.5} />
      <path data-edge-target d={geo.targetMarker} fill="none" stroke={stroke} strokeWidth={1.5} />
      {relationship.name && (
        <text data-edge-label x={geo.label.x} y={geo.label.y - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {relationship.name}
        </text>
      )}
    </g>
  )
})

/** Rect di un'entità dallo store; useShallow evita un riferimento nuovo a ogni chiamata. */
function useEntityRect(key: string | undefined): Rect | null {
  return useStore(
    documentStore,
    useShallow((s) => {
      if (!key) return null
      const d = erDiagram(s.doc)
      const entity = d.model.entities[key]
      const view = d.view.nodes[key]
      return entity && view ? entityRect(entity, view) : null
    }),
  )
}

export function RelationshipEdge({ edgeKey }: { edgeKey: string }) {
  const relationship = useStore(documentStore, (s) => erDiagram(s.doc).model.relationships[edgeKey])
  const source = useEntityRect(relationship?.source.entity)
  const target = useEntityRect(relationship?.target.entity)
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("relationship", edgeKey)))
  if (!relationship || !source || !target) return null
  return <RelationshipEdgeView edgeKey={edgeKey} relationship={relationship} source={source} target={target} selected={selected} />
}
