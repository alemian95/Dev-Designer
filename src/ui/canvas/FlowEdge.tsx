import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { flowEdgeGeometry } from "@/editor/flow/geometry"
import type { EdgePorts } from "@/editor/ports"
import { selId, sessionStore } from "@/editor/session-store"
import type { FlowEdge as FlowEdgeModel } from "@/model/flow/schema"
import { registerEdge } from "./dom-registry"
import { useEdgePorts } from "./use-edge-ports"

interface Props {
  edgeKey: string
  edge: FlowEdgeModel
  ports: EdgePorts
  selected: boolean
}

/**
 * Sulla forma di `ClassEdgeView` (`ClassEdge.tsx`): `routePorts` (via `flowEdgeGeometry`) per il
 * percorso, una freccia piena in punta — un solo marker per arco, sempre sul target, a differenza
 * del crow's foot a due capi dell'ER — e l'etichetta sul primo segmento, che eredita gratis la
 * separazione del fascio per lato (spec §8, vedi il docblock di `flowEdgeGeometry`).
 */
export const FlowEdgeView = memo(function FlowEdgeView({ edgeKey, edge, ports, selected }: Props) {
  const id = qualify("flow", edgeKey)
  const geo = flowEdgeGeometry(ports, edge)
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
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
      <path data-edge-target d={geo.targetMarker} fill={stroke} stroke={stroke} strokeWidth={1.5} />
      {edge.label && (
        <text data-edge-label x={geo.label.x} y={geo.label.y - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {edge.label}
        </text>
      )}
    </g>
  )
})

export function FlowEdge({ edgeKey }: { edgeKey: string }) {
  const edge = useStore(documentStore, (s) => flowDiagram(s.doc).model.edges[edgeKey])
  const ports = useEdgePorts(qualify("flow", edgeKey))
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", qualify("flow", edgeKey))))
  if (!edge || !ports) return null
  return <FlowEdgeView edgeKey={edgeKey} edge={edge} ports={ports} selected={selected} />
}
