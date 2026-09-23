import { memo } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { flowDiagram } from "@/editor/flow-access"
import { flowEdgeGeometry } from "@/editor/flow/geometry"
import type { Rect } from "@/editor/geometry"
import { opsFor } from "@/editor/kinds/ops"
import { selId, sessionStore } from "@/editor/session-store"
import type { FlowEdge as FlowEdgeModel } from "@/model/flow/schema"
import { registerEdge } from "./dom-registry"

interface Props {
  edgeKey: string
  edge: FlowEdgeModel
  source: Rect
  target: Rect
  selected: boolean
  /** Scarto del fascio: arriva dal layer, che è l'unico a vedere tutti gli archi. */
  offset: number
}

/**
 * Sulla forma di `ClassEdgeView` (`ClassEdge.tsx`): `routeEdge` (via `flowEdgeGeometry`) per il
 * percorso, una freccia piena in punta — un solo marker per arco, sempre sul target, a differenza
 * del crow's foot a due capi dell'ER — e l'etichetta sul primo segmento, che eredita gratis la
 * separazione del fascio (spec §8, vedi il docblock di `flowEdgeGeometry`).
 */
export const FlowEdgeView = memo(function FlowEdgeView({ edgeKey, edge, source, target, selected, offset }: Props) {
  const geo = flowEdgeGeometry(source, target, edge, offset)
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

/** Gemella di `useNodeRect` in `ClassEdge.tsx`: stesso seam (`opsFor(doc).rectOf`), stessa ragione
 *  per `useShallow` — `rectOf` costruisce un oggetto piatto nuovo a ogni chiamata. */
function useNodeRect(key: string | undefined): Rect | null {
  return useStore(
    documentStore,
    useShallow((s) => (key ? opsFor(s.doc).rectOf(key) : null)),
  )
}

export function FlowEdge({ edgeKey, offset }: { edgeKey: string; offset: number }) {
  const edge = useStore(documentStore, (s) => flowDiagram(s.doc).model.edges[edgeKey])
  const source = useNodeRect(edge?.source)
  const target = useNodeRect(edge?.target)
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", edgeKey)))
  if (!edge || !source || !target) return null
  return <FlowEdgeView edgeKey={edgeKey} edge={edge} source={source} target={target} selected={selected} offset={offset} />
}
