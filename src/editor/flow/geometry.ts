import { LANE_MIN_H, POOL_HEADER_W, type FlowDiagram, type FlowEdge, type FlowNode, type FlowShape, type LaneView, type Pool, type PoolView } from "@/model/flow/schema"
import { flowNodeSize } from "@/model/flow/size"
import type { NodeView } from "@/model/shared"
import { edgeOffsets, filledArrowPath, memoOnIdentity, pathFromPoints, routeEdge, type EdgeGeometry } from "../edge-routing"
import type { Point, Rect } from "../geometry"

// La misura dei nodi vive nel modello (spec 2b §3): qui si riesporta.
export { DECISION_FACTOR, flowNodeSize } from "@/model/flow/size"

export function flowNodeRect(node: FlowNode, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...flowNodeSize(node) }
}

/** Inclinazione fissa del parallelogramma dell'`io`: non proporzionale a `w`, altrimenti un nodo
 *  largo diventerebbe più obliquo di uno stretto invece di restare la stessa forma ingrandita. */
const IO_SKEW = 16

/** Scarto delle due barre verticali del `subprocess` dai lati del rettangolo. */
const SUBPROCESS_BAR_OFFSET = 8

/**
 * L'attributo `d` di un `<path>` per una forma, in coordinate locali (origine in alto a sinistra):
 * chi disegna applica `translate(x y)` sul nodo, non su questo path.
 *
 * `subprocess` torna più di un sottopercorso nello stesso `d`: due barre verticali aperte — un
 * sottopercorso aperto non riempie nulla (area nulla), quindi convive nello stesso path di uno
 * chiuso senza sporcare il riempimento.
 */
export function shapePath(shape: FlowShape, w: number, h: number): string {
  switch (shape) {
    case "terminal": {
      // Stadio: rettangolo a estremi arrotondati. Il raggio è mezza altezza — o mezza larghezza,
      // se il nodo è più stretto che alto — altrimenti i due archi si accavallerebbero.
      const r = Math.min(w, h) / 2
      return `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 ${r} 0 Z`
    }
    case "process":
      return `M0 0 H${w} V${h} H0 Z`
    case "decision":
      // Il rombo: la punta di ogni lato cade sul punto medio del rettangolo di ingombro — è la
      // proprietà che la spec §8 sfrutta per l'aggancio degli archi senza codice in più.
      return `M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`
    case "io":
      return `M${IO_SKEW} 0 L${w} 0 L${w - IO_SKEW} ${h} L0 ${h} Z`
    case "subprocess": {
      const o = SUBPROCESS_BAR_OFFSET
      return `M0 0 H${w} V${h} H0 Z M${o} 0 V${h} M${w - o} 0 V${h}`
    }
  }
}

/** La parte del diagramma che descrive i pool: basta questa per ricavarne la geometria. `FlowDiagram` la soddisfa. */
export interface PoolsPart {
  model: { pools: Readonly<Record<string, Pool>> }
  view: { pools: Readonly<Record<string, PoolView>>; lanes: Readonly<Record<string, LaneView>> }
}

/** Il rettangolo assoluto di una corsia, con il pool a cui appartiene. */
export interface LaneRect extends Rect {
  id: string
  poolId: string
}

/**
 * Gli id dei pool nell'ordine di disegno: per id. Un `Record` non ha un ordine suo che sopravviva a
 * un giro per il file, e l'ordine serve due volte: chi sta sopra quando due pool si sovrappongono
 * (l'ultimo, spec 2b §10) e l'ordine in cui canvas ed export li disegnano.
 */
export function poolIds(part: PoolsPart): string[] {
  return Object.keys(part.model.pools).sort()
}

/** Le corsie di un pool, dall'alto in basso: la `y` di ognuna è la `y` del pool più le altezze delle
 *  precedenti, la `x` salta la striscia (spec 2b §3). */
export function poolLaneRects(part: PoolsPart, poolId: string): LaneRect[] {
  const pool = part.model.pools[poolId]
  const view = part.view.pools[poolId]
  if (!pool || !view) return []
  let y = view.y
  return pool.lanes.map((lane) => {
    const h = part.view.lanes[lane.id]?.h ?? LANE_MIN_H
    const rect = { id: lane.id, poolId, x: view.x + POOL_HEADER_W, y, w: view.w - POOL_HEADER_W, h }
    y += h
    return rect
  })
}

/**
 * Le corsie di tutti i pool, nell'ordine di disegno. **L'unico posto** che ricava i rettangoli delle
 * corsie: canvas, hit test, comandi, layout ed export passano di qui, e nessuno salva una `y`.
 */
export function laneRects(part: PoolsPart): LaneRect[] {
  return poolIds(part).flatMap((id) => poolLaneRects(part, id))
}

/** Il rettangolo della corsia `laneId`, o `null`. */
export function laneRect(part: PoolsPart, laneId: string): LaneRect | null {
  return laneRects(part).find((r) => r.id === laneId) ?? null
}

/** Il rettangolo di un pool, striscia compresa: alto quanto le sue corsie. `at` sostituisce la
 *  posizione, per l'anteprima del drag. `null` se il pool non c'è. */
export function poolRect(part: PoolsPart, poolId: string, at?: Point): Rect | null {
  const pool = part.model.pools[poolId]
  const view = part.view.pools[poolId]
  if (!pool || !view) return null
  const h = pool.lanes.reduce((sum, lane) => sum + (part.view.lanes[lane.id]?.h ?? LANE_MIN_H), 0)
  return { x: at?.x ?? view.x, y: at?.y ?? view.y, w: view.w, h }
}

/** Chiuso a sinistra e in alto, aperto a destra e in basso: il confine fra due corsie appartiene a
 *  quella di sotto, senza buchi né doppie appartenenze. */
function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
}

/** Il pool disegnato più in alto che contiene `p`, o `null`. */
export function poolAt(part: PoolsPart, p: Point): string | null {
  for (const id of poolIds(part).reverse()) {
    const r = poolRect(part, id)
    if (r && contains(r, p)) return id
  }
  return null
}

/**
 * La corsia che contiene `p`, o `null` fuori da ogni pool o sulla striscia di intestazione. Decide
 * il pool disegnato più in alto (spec 2b §10): un punto nella zona comune a due pool va a quello
 * sopra. `null` non indovina: chi crea o trascina un nodo lo rende libero.
 */
export function laneAt(part: PoolsPart, p: Point): string | null {
  const poolId = poolAt(part, p)
  if (poolId === null) return null
  return poolLaneRects(part, poolId).find((r) => contains(r, p))?.id ?? null
}

/** Il pool che contiene la corsia, o `null`. */
export function laneOwner(part: PoolsPart, laneId: string): string | null {
  for (const [id, pool] of Object.entries(part.model.pools)) {
    if (pool.lanes.some((l) => l.id === laneId)) return id
  }
  return null
}

/** I nodi di un pool: quelli la cui corsia sta nel pool. */
export function poolMembers(d: FlowDiagram, poolId: string): string[] {
  const lanes = new Set(d.model.pools[poolId]?.lanes.map((l) => l.id) ?? [])
  return Object.entries(d.model.nodes)
    .filter(([, n]) => n.lane !== null && lanes.has(n.lane))
    .map(([key]) => key)
}

/**
 * Tutta la geometria di un arco di flowchart, da due rettangoli e l'arco — stesso ruolo di
 * `classEdgeGeometry` (`class/geometry.ts`) e di `edgeGeometry` (`edge-routing.ts`) per l'ER: un
 * solo posto che compone `routeEdge` e il marker, perché sia il render statico (`FlowEdgeView`)
 * sia l'anteprima del drag (`flowOps.edgeGeometry`, via `dom-registry.setEdgeGeometry`) devono
 * disegnare lo stesso arco.
 *
 * **L'etichetta sta sul primo segmento, non su quello centrale come per ER e classi.** Con
 * flusso a destra gli archi entranti arrivano tutti dal lato sinistro del bersaglio: il primo
 * segmento parte dall'attacco che `routeEdge` ha già spostato dell'`offset` di fascio, quindi
 * l'etichetta eredita gratis la separazione che il fascio ha calcolato, invece di chiederne una
 * propria (spec §8).
 */
export function flowEdgeGeometry(source: Rect, target: Rect, edge: FlowEdge, offset = 0): EdgeGeometry {
  const route = routeEdge(source, target, edge.source === edge.target, offset)
  const pts = route.points
  const p0 = pts[0]!
  const p1 = pts[1]!
  return {
    d: pathFromPoints(pts),
    sourceMarker: "",
    targetMarker: filledArrowPath(pts[pts.length - 1]!, route.targetDir),
    label: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
  }
}

/** Gemella di `erEdgeOffsets`/`classEdgeOffsets`: stessa ragione, `source`/`target` già piatti e
 *  non annidati in un capo come nell'ER o nelle classi. */
export const flowEdgeOffsets = memoOnIdentity((edges: Readonly<Record<string, FlowEdge>>) =>
  edgeOffsets(Object.entries(edges).map(([key, e]) => ({ key, source: e.source, target: e.target }))),
)
