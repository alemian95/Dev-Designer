import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { documentFamilies } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
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

const EMPTY_LANES: Lane[] = []
const EMPTY_BANDS: Record<string, LaneView> = {}

/**
 * Componente connesso: monta `LanesLayerView` con le corsie dello store, sotto senza z-index,
 * **prima** di nodi e archi (`Canvas.tsx`) — le bande non si ridisegnano durante il trascinamento
 * di un nodo, il drag scrive solo il DOM dei nodi e degli archi toccati (`dom-registry.ts`).
 *
 * `null` sui documenti non-flow: il controllo stava in `Canvas.tsx` (Task 7), che ora legge solo
 * `DiagramView` e non sa più che tipo di diagramma sta disegnando — ogni componente che ha bisogno
 * del tipo lo verifica per conto proprio, come già fanno `NoteEditor`/`FlowNodeEditor`.
 *
 * Ogni selettore verifica il tipo per primo e torna un valore stabile senza leggere `model.nodes`
 * come se fosse un flowchart: su un ER o un class diagram, `flowDiagram(s.doc)` lancerebbe, e
 * iterare `model.nodes` di un altro tipo per calcolare bande non ha senso. Così un documento
 * non-flow non paga il giro su `laneBandExtent` a ogni cambiamento dello store.
 */
export function LanesLayer() {
  const hasFlow = useStore(documentStore, (s) => documentFamilies(s.doc).includes("flow"))
  const lanes = useStore(documentStore, (s) => (documentFamilies(s.doc).includes("flow") ? flowDiagram(s.doc).model.lanes : EMPTY_LANES))
  const bands = useStore(documentStore, (s) => (documentFamilies(s.doc).includes("flow") ? flowDiagram(s.doc).view.lanes : EMPTY_BANDS))
  // `useShallow`: `laneBandExtent` costruisce un oggetto nuovo a ogni chiamata, come `rectOf`
  // (`ClassEdge.tsx`) — senza, ogni cambiamento nel documento, anche fuori dalle corsie,
  // ridisegnerebbe le bande.
  const extent = useStore(
    documentStore,
    useShallow((s) => (documentFamilies(s.doc).includes("flow") ? laneBandExtent(flowDiagram(s.doc)) : { x: 0, w: 0 })),
  )

  if (!hasFlow) return null
  return <LanesLayerView lanes={lanes} bands={bands} x={extent.x} w={extent.w} />
}
