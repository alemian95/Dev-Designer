import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { edgeGeometry } from "@/editor/edge-routing"
import { erDiagram } from "@/editor/er-access"
import { qualify } from "@/editor/families"
import type { EdgePorts } from "@/editor/ports"
import { selId, sessionStore } from "@/editor/session-store"
import type { Relationship } from "@/model/er/schema"
import { registerEdge } from "./dom-registry"
import { useEdgePorts } from "./use-edge-ports"

interface Props {
  edgeKey: string
  relationship: Relationship
  ports: EdgePorts
  selected: boolean
}

export const RelationshipEdgeView = memo(function RelationshipEdgeView({ edgeKey, relationship, ports, selected }: Props) {
  const id = qualify("er", edgeKey)
  const geo = edgeGeometry(ports, relationship)
  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  return (
    <g
      data-edge-id={id}
      ref={(el) => {
        registerEdge(id, el)
        return () => registerEdge(id, null)
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

export function RelationshipEdge({ edgeKey }: { edgeKey: string }) {
  const relationship = useStore(documentStore, (s) => erDiagram(s.doc).model.relationships[edgeKey])
  const ports = useEdgePorts(qualify("er", edgeKey))
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", qualify("er", edgeKey))))
  if (!relationship || !ports) return null
  return <RelationshipEdgeView edgeKey={edgeKey} relationship={relationship} ports={ports} selected={selected} />
}
