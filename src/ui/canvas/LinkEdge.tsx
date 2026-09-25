import { memo } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { linkKey } from "@/editor/families"
import type { Rect } from "@/editor/geometry"
import { canvasOps } from "@/editor/kinds/canvas-ops"
import { linkGeometry } from "@/editor/links/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { linkLabel } from "@/model/links/labels"
import type { Link } from "@/model/links/schema"
import { registerEdge } from "./dom-registry"

interface Props {
  id: string
  link: Link
  source: Rect
  target: Rect
  selected: boolean
}

/**
 * Vista pura di un collegamento fra famiglie, sulla forma di `FlowEdgeView`: tratteggiata, freccia
 * aperta verso il target, etichetta sul primo segmento. Gli attributi `data-edge-*` sono quelli
 * degli archi, quindi l'anteprima del drag la aggiorna senza codice nuovo (spec 4a §6).
 */
export const LinkEdgeView = memo(function LinkEdgeView({ id, link, source, target, selected }: Props) {
  const key = linkKey(id)
  const geo = linkGeometry(source, target)
  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  return (
    <g
      data-edge-id={key}
      ref={(el) => {
        registerEdge(key, el)
        return () => registerEdge(key, null)
      }}
    >
      <path data-edge-hit d={geo.d} fill="none" stroke="transparent" strokeWidth={12} />
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray="6 4" />
      <path data-edge-target d={geo.targetMarker} fill="none" stroke={stroke} strokeWidth={1.5} />
      <text data-edge-label x={geo.label.x} y={geo.label.y - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
        {linkLabel(link)}
      </text>
    </g>
  )
})

/** Il rettangolo di un estremo, di qualunque famiglia: `useShallow` per la stessa ragione di `ClassEdge`. */
function useNodeRect(key: string | undefined): Rect | null {
  return useStore(documentStore, useShallow((s) => (key ? canvasOps(s.doc).rectOf(key) : null)))
}

function LinkEdge({ id }: { id: string }) {
  const link = useStore(documentStore, (s) => s.doc.diagram.links[id])
  const source = useNodeRect(link?.source)
  const target = useNodeRect(link?.target)
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", linkKey(id))))
  // Un collegamento pendente non si disegna: lo segnala la validazione, e dal pannello Problemi si seleziona.
  if (!link || !source || !target) return null
  return <LinkEdgeView id={id} link={link} source={source} target={target} selected={selected} />
}

/** I collegamenti, sopra gli archi di famiglia e sotto ogni nodo (spec 4a §6). */
export function LinksLayer() {
  const ids = useStore(documentStore, useShallow((s) => Object.keys(s.doc.diagram.links)))
  return (
    <g data-layer="links">
      {ids.map((id) => (
        <LinkEdge key={id} id={id} />
      ))}
    </g>
  )
}
