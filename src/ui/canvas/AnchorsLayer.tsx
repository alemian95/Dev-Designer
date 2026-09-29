import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { canvasOps, canvasPorts } from "@/editor/kinds/canvas-ops"
import { parseSelId, selId, sessionStore } from "@/editor/session-store"
import { inFamily } from "@/model/family"

/** Raggio del punto e dell'area di clic, in pixel dello schermo: si dividono per la scala. */
const DOT_R = 4
const HIT_R = 8

/** L'unico arco selezionato, se la selezione è esattamente un arco che si aggancia (non la linea di una nota). */
function singleEdge(selection: ReadonlySet<string>): string | null {
  if (selection.size !== 1) return null
  const { kind, key } = parseSelId([...selection][0]!)
  return kind === "edge" && !inFamily(key, "note") ? key : null
}

/**
 * I punti di aggancio di un nodo solo, e le maniglie dei capi dell'arco selezionato (spec agganci
 * §6). Sopra i nodi, con i propri eventi puntatore: `hitTest` li riconosce dai `data-*` prima di ogni
 * altra cosa. Si sottoscrive al documento intero, e va bene: è un layer, non uno per nodo, e disegna
 * al più 16 punti e due maniglie.
 */
export function AnchorsLayer() {
  const node = useStore(sessionStore, (s) => s.anchorsFor)
  const scale = useStore(sessionStore, (s) => s.viewport.scale)
  const edge = useStore(sessionStore, (s) => singleEdge(s.selection))
  const dragging = useStore(sessionStore, (s) => s.dragging)
  // La forma selezionata da sola mostra la maniglia di ridimensionamento nello spigolo `se`: l'aggancio
  // lì sopra la coprirebbe e ne impedirebbe il trascinamento.
  const resizing = useStore(sessionStore, (s) => node !== null && inFamily(node, "shape") && s.selection.size === 1 && s.selection.has(selId("node", node)))
  const doc = useStore(documentStore, (s) => s.doc)
  if (dragging || (node === null && edge === null)) return null
  const ops = canvasOps(doc)
  const dot = DOT_R / scale
  const hit = HIT_R / scale
  const points = node !== null ? ops.anchorPoints(node).filter((p) => !(resizing && p.anchor === "se")) : []
  const ends = edge !== null ? ops.allEdges().find((e) => e.key === edge) : undefined
  const ports = edge !== null ? canvasPorts(doc).get(edge) : undefined
  return (
    <g data-layer="attach-points">
      {points.map(({ anchor, point }) => (
        <g key={anchor} data-anchor={anchor} data-anchor-node={node!} cursor="crosshair">
          <circle cx={point.x} cy={point.y} r={hit} fill="transparent" />
          <circle cx={point.x} cy={point.y} r={dot} fill="var(--background)" stroke="var(--primary)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {ends && ports &&
        (["source", "target"] as const).map((end) => {
          const p = ports[end].point
          return (
            <g key={end} data-edge-end={end} data-edge-end-edge={edge!} data-edge-end-node={ends[end]} cursor="move">
              <circle cx={p.x} cy={p.y} r={hit} fill="transparent" />
              <rect x={p.x - dot} y={p.y - dot} width={2 * dot} height={2 * dot} fill="var(--primary)" />
            </g>
          )
        })}
    </g>
  )
}
