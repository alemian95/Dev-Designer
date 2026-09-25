import { LANE_MARGIN, LANE_MIN_H, POOL_HEADER_W, POOL_MIN_W, type FlowDiagram, type LaneView, type PoolView } from "@/model/flow/schema"
import type { LayoutEdge, LayoutGraph, LayoutNode, LayoutPositions } from "@/model/layout"
import { snap, type Point, type Size } from "../geometry"
import { flowNodeSize } from "./geometry"

export const LANE_PAD = 20
export const ROW_GAP = 24
export const COL_GAP = 24

/**
 * Riporta `v` dentro l'intervallo `[start, start + length]`, lasciando `LANE_PAD` fra ogni bordo e un
 * ingombro di misura `size`: **l'unico posto** che scrive questa formula. Vale su un asse solo — la
 * `y` di un nodo dentro una corsia, e la `x` quando un nodo entra in una corsia alla creazione o dal
 * pannello — ed è usata da ogni comando che porta un nodo dentro una corsia scelta.
 *
 * Se l'intervallo è troppo corto per l'ingombro con i due margini — una corsia minuscola con un nodo
 * enorme — `[min, max]` si inverte: si ripiega sul centro invece di tornare un valore fuori da
 * qualunque intervallo sensato.
 */
export function keepInSpan(start: number, length: number, size: number, v: number): number {
  const min = start + LANE_PAD
  const max = start + length - LANE_PAD - size
  if (max < min) return snap(start + (length - size) / 2)
  return snap(Math.min(Math.max(v, min), max))
}

/**
 * Traduce il diagramma nel grafo da disporre, sulla forma di `commands/layout.ts` (ER): i nodi
 * senza voce in `view.nodes` sono esclusi, gli archi con un estremo fuori dal grafo sono saltati —
 * a ELK un arco monco fa rifiutare l'intero grafo.
 *
 * Gli archi **non** si invertono: a differenza dell'ER, dove `source` è la figlia e la convenzione
 * vuole i padri in alto (ADR 0006), qui `source` è già il verso del flusso. I pool non entrano nel
 * grafo: ELK dà l'asse del flusso, e i pool li impila `placeInLanes` (spec 2b §6).
 */
export function flowLayoutGraph(diagram: FlowDiagram): LayoutGraph {
  const nodes: LayoutNode[] = []
  for (const [key, node] of Object.entries(diagram.model.nodes)) {
    if (diagram.view.nodes[key]) nodes.push({ id: key, ...flowNodeSize(node) })
  }

  const present = new Set(nodes.map((n) => n.id))
  const edges: LayoutEdge[] = []
  for (const [key, edge] of Object.entries(diagram.model.edges)) {
    if (present.has(edge.source) && present.has(edge.target)) {
      edges.push({ id: key, source: edge.source, target: edge.target })
    }
  }

  return { nodes, edges, direction: "RIGHT" }
}

interface Member {
  key: string
  pos: Point
  size: Size
  row: number
}

/** I nodi con posizione da ELK che stanno nella corsia `lane` (o liberi, con `null`), da sinistra a
 *  destra e, a parità di colonna, nell'ordine che ELK aveva dato con la y. */
function membersOf(diagram: FlowDiagram, positions: LayoutPositions, lane: string | null): Member[] {
  return Object.entries(diagram.model.nodes)
    .flatMap(([key, node]) => {
      const pos = positions[key]
      return node.lane === lane && pos ? [{ key, pos, size: flowNodeSize(node), row: 0 }] : []
    })
    .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y)
}

/**
 * Dispone un gruppo di nodi in righe a partire da `top`, scrive le loro posizioni in `out` e torna
 * l'altezza usata, margini compresi (`0` per un gruppo vuoto).
 *
 * Le righe sono colorazione di intervalli: un nodo entra nella prima riga già libera alla sua x,
 * altrimenti ne apre una. Così due nodi lontani nel flusso restano affiancati invece di impilarsi,
 * e solo quelli che si accavallano davvero scendono di riga.
 */
function placeRows(members: Member[], top: number, out: LayoutPositions): number {
  const rows: { end: number; h: number }[] = []
  for (const m of members) {
    let i = rows.findIndex((r) => r.end + COL_GAP <= m.pos.x)
    if (i === -1) i = rows.push({ end: Number.NEGATIVE_INFINITY, h: 0 }) - 1
    const row = rows[i]!
    row.end = m.pos.x + m.size.w
    row.h = Math.max(row.h, m.size.h)
    // `i` è l'indice appena trovato o appena spinto due righe sopra, non un'incognita.
    m.row = i
  }
  if (rows.length === 0) return 0

  const tops: number[] = []
  let y = top + LANE_PAD
  for (const row of rows) {
    tops.push(y)
    y += row.h + ROW_GAP
  }
  for (const m of members) {
    // `m.row` indicizza `rows`, e `tops` ha un elemento per riga: la stessa garanzia di sopra.
    out[m.key] = { x: m.pos.x, y: tops[m.row]! }
  }
  return y - ROW_GAP + LANE_PAD - top
}

/** `x` e larghezza comuni a tutti i pool dopo Disponi: l'ingombro dei nodi di flusso più
 *  `LANE_MARGIN` per lato, più la striscia, mai sotto `POOL_MIN_W` (spec 2b §6). */
function poolExtent(diagram: FlowDiagram, positions: LayoutPositions): { x: number; w: number } {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (const [key, node] of Object.entries(diagram.model.nodes)) {
    const p = positions[key]
    if (!p) continue
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x + flowNodeSize(node).w)
  }
  if (minX > maxX) return { x: 0, w: POOL_MIN_W }
  return { x: minX - LANE_MARGIN - POOL_HEADER_W, w: Math.max(POOL_MIN_W, maxX - minX + 2 * LANE_MARGIN + POOL_HEADER_W) }
}

/**
 * Le posizioni di ELK corrette per i pool (spec 2b §6).
 *
 * La **x** resta quella di ELK: è l'asse del flusso. La **y** la decide la banda — ma la y di ELK non
 * si butta, si degrada a **ordinamento** dentro la banda. Le bande, dall'alto:
 *
 * 1. i nodi liberi, in una banda senza nome che non si disegna;
 * 2. i pool, nell'ordine della loro `y` attuale (a parità, per id), ognuno con le sue corsie; ogni
 *    corsia è alta quanto le sue righe, mai sotto `LANE_MIN_H`. Tutti i pool prendono la stessa `x`
 *    e la stessa larghezza, così un flusso che li attraversa resta allineato.
 *
 * Un nodo la cui corsia non esiste non entra in nessuna banda e resta fuori dal risultato.
 */
export function placeInLanes(
  diagram: FlowDiagram,
  positions: LayoutPositions,
): { positions: LayoutPositions; pools: Record<string, PoolView>; lanes: Record<string, LaneView> } {
  const out: LayoutPositions = {}
  const pools: Record<string, PoolView> = {}
  const lanes: Record<string, LaneView> = {}

  let cursor = placeRows(membersOf(diagram, positions, null), 0, out)

  const extent = poolExtent(diagram, positions)
  const y = (id: string) => diagram.view.pools[id]?.y ?? 0
  const order = Object.keys(diagram.model.pools).sort((a, b) => y(a) - y(b) || (a < b ? -1 : 1))
  for (const poolId of order) {
    const top = cursor
    // `order` viene dalle chiavi di `model.pools`: il pool c'è.
    for (const lane of diagram.model.pools[poolId]!.lanes) {
      const h = Math.max(LANE_MIN_H, placeRows(membersOf(diagram, positions, lane.id), cursor, out))
      lanes[lane.id] = { h }
      cursor += h
    }
    pools[poolId] = { x: extent.x, y: top, w: extent.w }
  }

  return { positions: out, pools, lanes }
}
