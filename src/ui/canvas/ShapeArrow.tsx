import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import type { EdgePorts } from "@/editor/ports"
import { selId, sessionStore } from "@/editor/session-store"
import { arrowGeometry } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import type { Arrow } from "@/model/shape/schema"
import { registerEdge } from "./dom-registry"
import { useEdgePorts } from "./use-edge-ports"

interface Props {
  arrowKey: string
  arrow: Arrow
  ports: EdgePorts
  selected: boolean
}

/**
 * Sulla forma di `FlowEdgeView`: il percorso di `arrowGeometry`, una punta piena per ogni capo che
 * `head` chiede, e la linea tratteggiata se `dashed`, con lo stesso `6 4` delle altre linee
 * tratteggiate del canvas. Nessuna etichetta: una freccia non ne ha (spec 3b §2).
 */
export const ArrowEdgeView = memo(function ArrowEdgeView({ arrowKey, arrow, ports, selected }: Props) {
  const id = qualify("shape", arrowKey)
  const geo = arrowGeometry(ports, arrow)
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
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray={arrow.dashed ? "6 4" : undefined} />
      <path data-edge-source d={geo.sourceMarker} fill={stroke} stroke={stroke} strokeWidth={1.5} />
      <path data-edge-target d={geo.targetMarker} fill={stroke} stroke={stroke} strokeWidth={1.5} />
    </g>
  )
})

export function ArrowEdge({ arrowKey }: { arrowKey: string }) {
  const arrow = useStore(documentStore, (s) => shapeDiagram(s.doc).model.arrows[arrowKey])
  const ports = useEdgePorts(qualify("shape", arrowKey))
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", qualify("shape", arrowKey))))
  // Una freccia pendente non si disegna, come un collegamento pendente (spec 3b §9).
  if (!arrow || !ports) return null
  return <ArrowEdgeView arrowKey={arrowKey} arrow={arrow} ports={ports} selected={selected} />
}
