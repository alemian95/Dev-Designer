import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import type { Rect } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { arrowGeometry } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import type { Arrow } from "@/model/shape/schema"
import { registerEdge } from "./dom-registry"
import { useNodeRect } from "./use-node-rect"

interface Props {
  arrowKey: string
  arrow: Arrow
  source: Rect
  target: Rect
  selected: boolean
  /** Scarto del fascio: arriva dal layer, che è l'unico a vedere tutte le frecce. */
  offset: number
}

/**
 * Sulla forma di `FlowEdgeView`: il percorso di `arrowGeometry`, una punta piena per ogni capo che
 * `head` chiede, e la linea tratteggiata se `dashed`, con lo stesso `6 4` delle altre linee
 * tratteggiate del canvas. Nessuna etichetta: una freccia non ne ha (spec 3b §2).
 */
export const ArrowEdgeView = memo(function ArrowEdgeView({ arrowKey, arrow, source, target, selected, offset }: Props) {
  const id = qualify("shape", arrowKey)
  const geo = arrowGeometry(source, target, arrow, offset)
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

export function ArrowEdge({ arrowKey, offset }: { arrowKey: string; offset: number }) {
  const arrow = useStore(documentStore, (s) => shapeDiagram(s.doc).model.arrows[arrowKey])
  const source = useNodeRect(arrow && qualify("shape", arrow.source))
  const target = useNodeRect(arrow && qualify("shape", arrow.target))
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", qualify("shape", arrowKey))))
  // Una freccia pendente non si disegna, come un collegamento pendente (spec 3b §9).
  if (!arrow || !source || !target) return null
  return <ArrowEdgeView arrowKey={arrowKey} arrow={arrow} source={source} target={target} selected={selected} offset={offset} />
}
