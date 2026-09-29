import { memo } from "react"
import { useStore } from "zustand"
import { classDiagram } from "@/editor/class-access"
import { classEdgeGeometry, endLabel, isDashed, isFilled } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import type { EdgePorts } from "@/editor/ports"
import { selId, sessionStore } from "@/editor/session-store"
import type { ClassRelation } from "@/model/class/schema"
import { registerEdge } from "./dom-registry"
import { useEdgePorts } from "./use-edge-ports"

interface Props {
  edgeKey: string
  relation: ClassRelation
  ports: EdgePorts
  selected: boolean
}

export const ClassEdgeView = memo(function ClassEdgeView({ edgeKey, relation, ports, selected }: Props) {
  const id = qualify("class", edgeKey)
  const geo = classEdgeGeometry(ports, relation)
  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  // Molteplicità e ruolo nella stessa etichetta, una per capo: `endLabel` è la stessa funzione su
  // cui `classEdgeGeometry` decide se popolare i punti, così render e geometria non divergono.
  const sourceLabel = endLabel(relation.source)
  const targetLabel = endLabel(relation.target)
  return (
    <g
      data-edge-id={id}
      ref={(el) => {
        registerEdge(id, el)
        return () => registerEdge(id, null)
      }}
    >
      <path data-edge-hit d={geo.d} fill="none" stroke="transparent" strokeWidth={12} />
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray={isDashed(relation.kind) ? "6 4" : undefined} />
      <path data-edge-source d={geo.sourceMarker} fill="none" stroke={stroke} strokeWidth={1.5} />
      <path data-edge-target d={geo.targetMarker} fill={isFilled(relation.kind) ? stroke : "none"} stroke={stroke} strokeWidth={1.5} />
      {sourceLabel && geo.sourceEnd && (
        <text data-edge-source-label x={geo.sourceEnd.x} y={geo.sourceEnd.y} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {sourceLabel}
        </text>
      )}
      {targetLabel && geo.targetEnd && (
        <text data-edge-target-label x={geo.targetEnd.x} y={geo.targetEnd.y} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {targetLabel}
        </text>
      )}
      {relation.name && (
        <text data-edge-label x={geo.label.x} y={geo.label.y - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {relation.name}
        </text>
      )}
    </g>
  )
})

export function ClassEdge({ edgeKey }: { edgeKey: string }) {
  const relation = useStore(documentStore, (s) => classDiagram(s.doc).model.relations[edgeKey])
  const ports = useEdgePorts(qualify("class", edgeKey))
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", qualify("class", edgeKey))))
  if (!relation || !ports) return null
  return <ClassEdgeView edgeKey={edgeKey} relation={relation} ports={ports} selected={selected} />
}
