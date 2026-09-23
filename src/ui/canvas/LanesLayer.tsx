import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { flowDiagram } from "@/editor/flow-access"
import { flowNodeRect } from "@/editor/flow/geometry"
import { PAD_X, rectsBounds, type Rect } from "@/editor/geometry"

/** Margine oltre l'ingombro dei nodi: una banda che finisse esattamente al bordo dell'ultimo nodo
 *  lo toccherebbe, e un nodo appena creato sul bordo sinistro sembrerebbe a cavallo del contorno. */
const LANE_MARGIN = 40

/**
 * Layer di sfondo per le corsie, montato **prima** di nodi e archi (`Canvas.tsx`), sotto senza
 * z-index. Le bande non sono nodi (spec §5): nessun `data-node-id`, non entrano nell'hit test del
 * canvas, non si selezionano, non si ridisegnano durante il trascinamento di un nodo — il drag
 * scrive solo il DOM dei nodi e degli archi toccati (`dom-registry.ts`), mai questo layer.
 *
 * **La larghezza viene dai limiti dei nodi (`rectsBounds`), non dal viewport.** Il viewport dipende
 * da dove sta guardando chi disegna in questo momento, e l'export (`buildSvg`) non ne ha uno
 * affatto: dev'essere la stessa banda nell'app e nell'export (Task 11).
 */
export function LanesLayer() {
  const lanes = useStore(documentStore, (s) => flowDiagram(s.doc).model.lanes)
  const bands = useStore(documentStore, (s) => flowDiagram(s.doc).view.lanes)
  // `useShallow`: `rectsBounds` costruisce un rettangolo nuovo a ogni chiamata, come `rectOf`
  // (`ClassEdge.tsx`) — senza, ogni cambiamento nel documento, anche fuori dalle corsie,
  // ridisegnerebbe le bande.
  const bounds = useStore(
    documentStore,
    useShallow((s): Rect | null => {
      const d = flowDiagram(s.doc)
      const rects: Rect[] = []
      for (const [key, node] of Object.entries(d.model.nodes)) {
        const view = d.view.nodes[key]
        if (view) rects.push(flowNodeRect(node, view))
      }
      return rectsBounds(rects)
    }),
  )
  const x = (bounds?.x ?? 0) - LANE_MARGIN
  const w = (bounds?.w ?? 0) + 2 * LANE_MARGIN

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
