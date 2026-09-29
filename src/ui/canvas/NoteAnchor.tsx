import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import type { EdgePorts } from "@/editor/ports"
import { anchorGeometry } from "@/editor/note/geometry"
import { noteDiagram } from "@/editor/note-access"
import { selId, sessionStore } from "@/editor/session-store"
import { registerEdge } from "./dom-registry"
import { useEdgePorts } from "./use-edge-ports"

interface Props {
  noteKey: string
  ports: EdgePorts
  selected: boolean
}

/**
 * Vista pura della linea di ancoraggio (spec 3a §5): tratteggiata, senza marker, con la chiave della
 * sua nota. Gli attributi `data-edge-*` sono quelli degli archi, quindi l'anteprima del drag la
 * aggiorna senza codice nuovo, come i collegamenti.
 */
export const AnchorEdgeView = memo(function AnchorEdgeView({ noteKey, ports, selected }: Props) {
  const id = qualify("note", noteKey)
  const geo = anchorGeometry(ports)
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
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray="6 4" />
    </g>
  )
})

/** La linea di una nota ancorata. Un'àncora pendente non si disegna: la segnala la validazione. */
export function AnchorEdge({ noteKey }: { noteKey: string }) {
  const id = qualify("note", noteKey)
  const anchor = useStore(documentStore, (s) => noteDiagram(s.doc).model.notes[noteKey]?.anchor ?? undefined)
  const ports = useEdgePorts(id)
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", id)))
  if (!anchor || !ports) return null
  return <AnchorEdgeView noteKey={noteKey} ports={ports} selected={selected} />
}
