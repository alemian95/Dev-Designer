import type { FlowDiagram, FlowEdge, FlowNode, FlowShape } from "@/model/flow/schema"
import { flowNodeSize } from "@/model/flow/size"
import type { NodeView } from "@/model/shared"
import { notePath } from "../class/geometry"
import { edgeOffsets, memoOnIdentity, pathFromPoints, routeEdge, type Dir, type EdgeGeometry } from "../edge-routing"
import { rectsBounds, type Point, type Rect } from "../geometry"

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
 * L'attributo `d` di un `<path>` per una forma, in coordinate locali (origine in alto a sinistra,
 * come `notePath`): chi disegna applica `translate(x y)` sul nodo, non su questo path.
 *
 * `subprocess` e `note` tornano più di un sottopercorso nello stesso `d` — due barre verticali
 * aperte, o il contorno con l'angolo tagliato: un sottopercorso aperto non riempie nulla (area
 * nulla), quindi convive nello stesso path di uno chiuso senza sporcare il riempimento.
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
    case "note":
      // Solo il contorno (`body`): il taglio diagonale dell'angolo è già nel perimetro, quindi la
      // forma «riquadro con angolo ripiegato» non serve il triangolo di `fold` separato — quello
      // è un dettaglio di resa a due tinte che spetta al componente che disegna, non alla geometria.
      return notePath(w, h).body
  }
}

/**
 * La corsia che contiene `y`, o `null` fuori da ogni banda.
 *
 * Il confronto è chiuso sopra e aperto sotto, così il confine fra due bande appartiene a quella di
 * sotto e non a entrambe: nessun buco, nessuna doppia appartenenza. Fuori da ogni banda torna
 * `null` invece di agganciare alla più vicina — indovinare qui vorrebbe dire decidere al posto di
 * chi chiama, che sa se sta creando un nodo (allora la prima corsia) o trascinandone uno (allora
 * quella di partenza).
 */
export function laneAt(diagram: FlowDiagram, y: number): string | null {
  for (const lane of diagram.model.lanes) {
    const band = diagram.view.lanes[lane.id]
    if (band && y >= band.y && y < band.y + band.h) return lane.id
  }
  return null
}

/** Margine oltre l'ingombro dei nodi: una banda che finisse esattamente al bordo dell'ultimo nodo
 *  lo toccherebbe, e un nodo appena creato sul bordo sinistro sembrerebbe a cavallo del contorno. */
export const LANE_MARGIN = 40

/**
 * Larghezza minima di una banda (I1 della correzione finale): senza nodi `rectsBounds` torna
 * `null` e la banda si riduceva a `2 × LANE_MARGIN` (80px) — visibilmente uno stelo, non una
 * corsia, per un flowchart appena creato o con una corsia ancora vuota. Accanto a `LANE_MARGIN` e
 * non altrove: sono le due misure che governano `laneBandExtent`, e tenerle vicine è la ragione
 * per cui la seconda esiste in questo file e non duplicata in `LanesLayer.tsx`/`svg.tsx`.
 */
export const LANE_MIN_W = 640

/**
 * Estensione orizzontale comune a ogni banda: x e larghezza dai limiti dei nodi (`rectsBounds`)
 * più `LANE_MARGIN`, non dal viewport — il viewport dipende da dove sta guardando chi disegna in
 * questo momento, e l'export (`buildSvg`) non ne ha uno affatto (Task 11, spec §5: «la stessa
 * banda nell'app e nell'export»). La larghezza non scende mai sotto `LANE_MIN_W`: sotto quella
 * soglia segue comunque i nodi, mai il contrario.
 *
 * **Unico posto che fa questo calcolo**: `LanesLayerView` (canvas, `ui/canvas/LanesLayer.tsx`) e
 * `buildSvg` (export, `ui/export/svg.tsx`) lo chiamano entrambi invece di ricavare ciascuno la
 * propria versione — due copie della stessa formula divergono il giorno che una delle due cambia.
 */
export function laneBandExtent(diagram: FlowDiagram): { x: number; w: number } {
  const rects: Rect[] = []
  for (const [key, node] of Object.entries(diagram.model.nodes)) {
    const view = diagram.view.nodes[key]
    if (view) rects.push(flowNodeRect(node, view))
  }
  const bounds = rectsBounds(rects)
  const x = (bounds?.x ?? 0) - LANE_MARGIN
  const w = Math.max(LANE_MIN_W, (bounds?.w ?? 0) + 2 * LANE_MARGIN)
  return { x, w }
}

/** Lunghezza e semilarghezza della freccia piena: l'unico marker dell'arco di flowchart, sempre
 *  sul target. A differenza del crow's foot dell'ER e della punta UML delle classi, un flowchart
 *  non distingue specie di arco — una sola forma basta. */
const FLOW_ARROW_LEN = 10
const FLOW_ARROW_HALF_W = 5

function filledArrowPath(at: Point, dir: Dir): string {
  const px = -dir.y
  const py = dir.x
  const p = (d: number, s: number): Point => ({ x: at.x + dir.x * d + px * s, y: at.y + dir.y * d + py * s })
  return `${pathFromPoints([at, p(FLOW_ARROW_LEN, -FLOW_ARROW_HALF_W), p(FLOW_ARROW_LEN, FLOW_ARROW_HALF_W)])} Z`
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
