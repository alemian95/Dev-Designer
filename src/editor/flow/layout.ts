import { LANE_MIN_H, type FlowDiagram, type FlowNode, type LaneView } from "@/model/flow/schema"
import type { LayoutEdge, LayoutGraph, LayoutNode, LayoutPositions } from "@/model/layout"

export const LANE_PAD = 20
export const ROW_GAP = 24
export const COL_GAP = 24

// ponytail: misura provvisoria in attesa del Task 6, che introduce `flowNodeSize` sulla vera
// geometria per forma (spec §7). Fino ad allora ogni nodo occupa lo stesso rettangolo: i test di
// questo file dipendono solo dal fatto che un nodo abbia una dimensione, mai dal suo valore.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `_node` resta nella firma per il Task 6, che la userà davvero.
function flowNodeSize(_node: FlowNode): { w: number; h: number } {
  return { w: 160, h: 60 }
}

/**
 * Traduce il diagramma nel grafo da disporre, sulla forma di `commands/layout.ts` (ER): i nodi
 * senza voce in `view.nodes` sono esclusi, gli archi con un estremo fuori dal grafo sono saltati —
 * a ELK un arco monco fa rifiutare l'intero grafo.
 *
 * Gli archi **non** si invertono: a differenza dell'ER, dove `source` è la figlia e la convenzione
 * vuole i padri in alto (ADR 0006), qui `source` è già il verso del flusso.
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

/**
 * Le posizioni di ELK corrette per le corsie (spec §5).
 *
 * La **x** resta quella di ELK: è l'asse del flusso. La **y** la decide la corsia — ma la y di ELK
 * non si butta, si degrada a **ordinamento**: dentro la corsia i nodi si dispongono in righe, e a
 * parità di colonna vince l'ordine che ELK aveva scelto per ridurre gli incroci.
 *
 * Le righe sono colorazione di intervalli: un nodo entra nella prima riga già libera alla sua x,
 * altrimenti ne apre una. Così due nodi lontani nel flusso restano affiancati invece di impilarsi,
 * e solo quelli che si accavallano davvero scendono di riga.
 */
export function placeInLanes(
  diagram: FlowDiagram,
  positions: LayoutPositions,
): { positions: LayoutPositions; lanes: Record<string, LaneView> } {
  const out: LayoutPositions = {}
  const lanes: Record<string, LaneView> = {}
  let cursor = 0

  for (const lane of diagram.model.lanes) {
    const members = Object.entries(diagram.model.nodes)
      .flatMap(([key, node]) => {
        const pos = positions[key]
        return node.lane === lane.id && pos ? [{ key, pos, size: flowNodeSize(node), row: 0 }] : []
      })
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y)

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

    const tops: number[] = []
    let y = cursor + LANE_PAD
    for (const row of rows) {
      tops.push(y)
      y += row.h + ROW_GAP
    }
    for (const m of members) {
      // `m.row` indicizza `rows`, e `tops` ha un elemento per riga: la stessa garanzia di sopra.
      out[m.key] = { x: m.pos.x, y: tops[m.row]! }
    }

    const used = rows.length === 0 ? 0 : y - ROW_GAP + LANE_PAD - cursor
    const h = Math.max(LANE_MIN_H, used)
    lanes[lane.id] = { y: cursor, h }
    cursor += h
  }

  return { positions: out, lanes }
}
