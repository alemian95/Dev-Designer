import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { flowDiagram } from "@/editor/flow-access"
import { familyHasContent } from "@/editor/kinds/canvas-ops"
import { laneBandExtent } from "@/editor/flow/geometry"
import { PAD_X } from "@/editor/geometry"
import type { Lane, LaneView } from "@/model/flow/schema"

interface Props {
  lanes: Lane[]
  bands: Record<string, LaneView>
  /** Estensione orizzontale comune a ogni banda: da `laneBandExtent`, non ricalcolata qui — vedi
   *  il docblock di quella funzione per la ragione (Task 11, spec §5). */
  x: number
  w: number
}

/**
 * Vista pura delle corsie, guidata dalle prop e senza store: sulla forma di `FlowNodeView`
 * (`FlowNode.tsx`). Un rettangolo e un'etichetta per corsia (spec §5), nessun `data-node-id` — le
 * bande non sono nodi, non entrano nell'hit test del canvas e non si selezionano.
 *
 * La usano sia `LanesLayer` sotto (il canvas) sia `buildSvg` (`@/ui/export/svg.tsx`, Task 11): è
 * la ragione per cui esiste come componente separato invece di restare inline nel connesso.
 */
export function LanesLayerView({ lanes, bands, x, w }: Props) {
  return (
    <g data-layer="lanes">
      {lanes.map((lane) => {
        const band = bands[lane.id]
        if (!band) return null
        return (
          <g key={lane.id}>
            <rect x={x} y={band.y} width={w} height={band.h} fill="var(--muted)" fillOpacity={0.35} stroke="var(--border)" />
            <text x={x + PAD_X} y={band.y + PAD_X} dominantBaseline="hanging" fontSize={11} fill="var(--muted-foreground)">
              {lane.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/**
 * Componente connesso: monta `LanesLayerView` con le corsie dello store, sotto senza z-index,
 * **prima** di nodi e archi (`Canvas.tsx`) — le bande non si ridisegnano durante il trascinamento
 * di un nodo, il drag scrive solo il DOM dei nodi e degli archi toccati (`dom-registry.ts`).
 *
 * Le corsie esistono sempre nel modello, ma si vedono solo quando c'è un nodo di flusso (spec §5):
 * un documento senza flusso non mostra una banda vuota. La stessa regola decide il pannello delle
 * corsie (`PropertiesPanel`) e le bande dell'export (`buildSvg`), tutte da `familyHasContent`.
 */
export function LanesLayer() {
  const hasFlowNodes = useStore(documentStore, (s) => familyHasContent(s.doc, "flow"))
  const lanes = useStore(documentStore, (s) => flowDiagram(s.doc).model.lanes)
  const bands = useStore(documentStore, (s) => flowDiagram(s.doc).view.lanes)
  // `useShallow`: `laneBandExtent` costruisce un oggetto nuovo a ogni chiamata, come `rectOf`
  // (`ClassEdge.tsx`) — senza, ogni cambiamento nel documento, anche fuori dalle corsie,
  // ridisegnerebbe le bande.
  const extent = useStore(documentStore, useShallow((s) => laneBandExtent(flowDiagram(s.doc))))
  if (!hasFlowNodes) return null
  return <LanesLayerView lanes={lanes} bands={bands} x={extent.x} w={extent.w} />
}
