import { anchorsOf, type Anchor } from "@/model/shared"
import { DOWN, LEFT, RIGHT, UP, type Dir, type EdgeEnds } from "./edge-routing"
import type { Point, Rect } from "./geometry"

/**
 * Il contorno vero di un nodo (spec agganci §4): dove cade un aggancio che sul riquadro sarebbe nel
 * vuoto. `{ skew }` è il parallelogramma dell'`io`, con la sua inclinazione fissa.
 */
export type Outline = "rect" | "diamond" | "ellipse" | "stadium" | { skew: number }

/** Dove un capo d'arco tocca il suo nodo, e il versore con cui ne esce. */
export interface Port {
  point: Point
  dir: Dir
}

/** I due porti di un arco, e quanto il percorso si allontana dal nodo prima di piegare (spec §5). */
export interface EdgePorts {
  source: Port
  target: Port
  stub: number
}

/** Il tratto d'uscita di un arco che non può piegare subito. */
export const STUB = 16
/** Il tratto del primo cappio su un nodo: quanto il cappio di oggi. */
export const SELF_LOOP_OFFSET = 30
/** Quanto cresce il tratto di ogni cappio successivo sullo stesso nodo. */
export const LOOP_GAP = 14
/** Quanto un capo automatico resta lontano dallo spigolo, dove il marker si confonderebbe col profilo. */
export const EDGE_INSET = 6

export type Side = "n" | "e" | "s" | "w"

export const SIDE_DIR: Readonly<Record<Side, Dir>> = { n: UP, e: RIGHT, s: DOWN, w: LEFT }

const SIDE_ANCHORS: readonly Anchor[] = ["n1", "n2", "n3", "e1", "e2", "e3", "s1", "s2", "s3", "w1", "w2", "w3"]
const ALL_ANCHORS: readonly Anchor[] = [...SIDE_ANCHORS, "nw", "ne", "se", "sw"]

type Corner = "nw" | "ne" | "se" | "sw"
const isCorner = (a: Anchor): a is Corner => a === "nw" || a === "ne" || a === "se" || a === "sw"

/** Gli agganci che un contorno mostra: gli spigoli solo dove esistono davvero (spec §4). */
export function offeredAnchors(outline: Outline): readonly Anchor[] {
  return outline === "rect" || typeof outline === "object" ? ALL_ANCHORS : SIDE_ANCHORS
}

/** Il lato che un versore d'uscita indica. */
export function sideOf(dir: Dir): Side {
  if (dir.x > 0) return "e"
  if (dir.x < 0) return "w"
  return dir.y < 0 ? "n" : "s"
}

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** La coordinata lungo il lato di un punto: `x` per `n`/`s`, `y` per `e`/`w`. */
export const alongSide = (side: Side, p: Point): number => (side === "n" || side === "s" ? p.x : p.y)

/** Gli estremi utili di un lato, rientrati di `EDGE_INSET` (mai oltre la metà: un nodo basso resta usabile). */
export function sideSpan(r: Rect, side: Side): [number, number] {
  const horizontal = side === "n" || side === "s"
  const [min, size] = horizontal ? [r.x, r.w] : [r.y, r.h]
  const inset = Math.min(EDGE_INSET, size / 2)
  return [min + inset, min + size - inset]
}

/** La coordinata nominale del punto `k`/4 di un lato, in senso orario. */
function sideCoord(r: Rect, side: Side, k: number): number {
  const f = k / 4
  switch (side) {
    case "n":
      return r.x + r.w * f
    case "e":
      return r.y + r.h * f
    case "s":
      return r.x + r.w * (1 - f)
    case "w":
      return r.y + r.h * (1 - f)
  }
}

/** Il parallelogramma dell'`io`: vertici (skew, 0), (w, 0), (w − skew, h), (0, h), come `shapePath`. */
function skewPoint(r: Rect, skew: number, side: Side, t: number): Point {
  if (side === "n") {
    const lx = t - r.x
    return { x: t, y: r.y + (lx >= skew ? 0 : (r.h * (skew - lx)) / skew) }
  }
  if (side === "s") {
    const lx = t - r.x
    return { x: t, y: r.y + (lx <= r.w - skew ? r.h : (r.h * (r.w - lx)) / skew) }
  }
  const ly = t - r.y
  return side === "e" ? { x: r.x + r.w - (skew * ly) / r.h, y: t } : { x: r.x + skew * (1 - ly / r.h), y: t }
}

/**
 * Il punto del contorno sul lato `side` alla coordinata `t` (una `x` per `n`/`s`, una `y` per
 * `e`/`w`): dal riquadro si scende verso l'interno, perpendicolari al lato, finché si incontra la
 * forma vera.
 */
export function sidePoint(r: Rect, outline: Outline, side: Side, t: number): Point {
  if (typeof outline === "object") return outline.skew > 0 ? skewPoint(r, outline.skew, side, t) : sidePoint(r, "rect", side, t)
  const c = center(r)
  const hw = r.w / 2
  const hh = r.h / 2
  const horizontal = side === "n" || side === "s"
  const sign = side === "n" || side === "w" ? -1 : 1
  // `half` è la semi-misura lungo la normale, `u` la distanza dal centro lungo il lato, in unità della semi-misura del lato.
  const half = horizontal ? hh : hw
  const offset = horizontal ? t - c.x : t - c.y
  const u = offset / (horizontal ? hw : hh)
  let reach: number
  switch (outline) {
    case "rect":
      reach = half
      break
    case "diamond":
      reach = half * Math.max(0, 1 - Math.abs(u))
      break
    case "ellipse":
      reach = half * Math.sqrt(Math.max(0, 1 - u * u))
      break
    case "stadium": {
      const rad = Math.min(hw, hh)
      const d = Math.max(0, Math.abs(offset) - ((horizontal ? hw : hh) - rad))
      reach = half - rad + Math.sqrt(Math.max(0, rad * rad - d * d))
      break
    }
  }
  return horizontal ? { x: t, y: c.y + sign * reach } : { x: c.x + sign * reach, y: t }
}

/** Uno spigolo sul contorno: l'angolo del rettangolo, il vertice del parallelogramma, o la diagonale verso il centro. */
function cornerPoint(r: Rect, outline: Outline, corner: Corner): Point {
  const sx = corner === "ne" || corner === "se" ? 1 : -1
  const sy = corner === "se" || corner === "sw" ? 1 : -1
  const c = center(r)
  const hw = r.w / 2
  const hh = r.h / 2
  if (typeof outline === "object") {
    if (sy < 0) return { x: sx < 0 ? r.x + outline.skew : r.x + r.w, y: r.y }
    return { x: sx < 0 ? r.x : r.x + r.w - outline.skew, y: r.y + r.h }
  }
  switch (outline) {
    case "rect":
      return { x: c.x + sx * hw, y: c.y + sy * hh }
    case "diamond":
      return { x: c.x + (sx * hw) / 2, y: c.y + (sy * hh) / 2 }
    case "ellipse":
      return { x: c.x + sx * hw * Math.SQRT1_2, y: c.y + sy * hh * Math.SQRT1_2 }
    case "stadium": {
      const rad = Math.min(hw, hh)
      return { x: c.x + sx * (hw - rad + rad * Math.SQRT1_2), y: c.y + sy * (hh - rad + rad * Math.SQRT1_2) }
    }
  }
}

/** Fra le due normali uscenti dello spigolo, quella che guarda di più verso `toward`; a parità, l'orizzontale. */
function cornerDir(corner: Corner, point: Point, toward: Point | undefined): Dir {
  const horizontal: Dir = corner === "ne" || corner === "se" ? RIGHT : LEFT
  const vertical: Dir = corner === "se" || corner === "sw" ? DOWN : UP
  if (!toward) return horizontal
  const vx = (toward.x - point.x) * horizontal.x
  const vy = (toward.y - point.y) * vertical.y
  return vx >= vy ? horizontal : vertical
}

/**
 * Il porto di un aggancio fissato (spec §4): il punto nominale sul riquadro portato sul contorno vero,
 * con la normale uscente del suo lato. `toward` — il centro del nodo all'altro capo — decide solo da
 * che parte esce uno spigolo.
 */
export function anchorPort(rect: Rect, outline: Outline, anchor: Anchor, toward?: Point): Port {
  if (isCorner(anchor)) {
    const point = cornerPoint(rect, outline, anchor)
    return { point, dir: cornerDir(anchor, point, toward) }
  }
  const side = anchor[0] as Side
  return { point: sidePoint(rect, outline, side, sideCoord(rect, side, Number(anchor[1]))), dir: SIDE_DIR[side] }
}

const OPPOSITE: Readonly<Record<Side, Side>> = { n: "s", s: "n", e: "w", w: "e" }
export const opposite = (side: Side): Side => OPPOSITE[side]

/** Il lato di `a` rivolto verso `b`: l'asse dominante fra i due centri, la regola di sempre. */
export function autoSide(a: Rect, b: Rect): Side {
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "e" : "w"
  return dy >= 0 ? "s" : "n"
}

/**
 * I porti senza fascio né agganci: il centro dei due lati che si guardano, sul riquadro. È la
 * geometria di prima degli agganci, e resta quella delle linee delle note (spec §2).
 */
export function autoPorts(a: Rect, b: Rect): EdgePorts {
  const sa = autoSide(a, b)
  const sb = opposite(sa)
  const mid = (r: Rect, side: Side) => {
    const c = center(r)
    return sidePoint(r, "rect", side, alongSide(side, c))
  }
  return { source: { point: mid(a, sa), dir: SIDE_DIR[sa] }, target: { point: mid(b, sb), dir: SIDE_DIR[sb] }, stub: STUB }
}

const samePort = (a: Port, b: Port): boolean =>
  a.point.x === b.point.x && a.point.y === b.point.y && a.dir.x === b.dir.x && a.dir.y === b.dir.y

/** Due coppie di porti con gli stessi numeri: serve a `canvasPorts` per riusare l'oggetto di prima. */
export function samePorts(a: EdgePorts, b: EdgePorts): boolean {
  return a.stub === b.stub && samePort(a.source, b.source) && samePort(a.target, b.target)
}

/** Un capo d'arco in attesa del suo punto: il lato su cui cade, e da dove l'altro capo lo tira. */
interface PendingEnd {
  edge: string
  end: "source" | "target"
  rect: Rect
  outline: Outline
  side: Side
  /** Il punto già deciso di un capo fissato, `null` per un capo automatico. */
  fixed: Point | null
  /** La coordinata lungo il lato che ordina i capi: del punto per un fissato, del centro all'altro capo per un automatico. */
  along: number
}

/**
 * I porti di tutti gli archi dati (spec agganci §4): una sola passata che decide dove ogni capo tocca
 * il suo nodo, fra tutte le famiglie insieme — un link e un arco di flowchart sullo stesso lato si
 * separano fra loro.
 *
 * 1. Un capo fissato va al suo aggancio (`anchorPort`).
 * 2. Un capo automatico va sul lato rivolto verso l'altro estremo (`autoSide`); fra due capi
 *    automatici il bersaglio prende il lato opposto, esattamente come prima degli agganci.
 * 3. Per ogni coppia (nodo, lato) i capi fissati spezzano il lato in intervalli, e ogni capo
 *    automatico cade in quello che contiene il centro del nodo all'altro capo; dentro un intervallo i
 *    capi si ordinano per quella coordinata (a parità, per chiave) e si distribuiscono a passo uniforme.
 *
 * **L'ordine usa il centro dell'altro nodo, non il suo porto:** così il porto su un nodo dipende solo
 * dai rettangoli suoi e dei vicini diretti, e l'anteprima del drag sa quali archi riscrivere.
 *
 * Un arco con un estremo senza rettangolo non riceve porti: non si disegna, come prima.
 */
export function assignPorts(
  edges: readonly EdgeEnds[],
  rectOf: (key: string) => Rect | null,
  outlineOf: (key: string) => Outline,
): Map<string, EdgePorts> {
  const stubs = new Map<string, number>()
  const loops = new Map<string, number>()
  const groups = new Map<string, PendingEnd[]>()
  const push = (node: string, pending: PendingEnd) => {
    const k = `${node}\u0000${pending.side}`
    const list = groups.get(k)
    if (list) list.push(pending)
    else groups.set(k, [pending])
  }

  for (const e of edges) {
    const a = rectOf(e.source)
    const b = rectOf(e.target)
    if (!a || !b) continue
    const loop = e.source === e.target
    let stub = STUB
    if (loop) {
      const i = loops.get(e.source) ?? 0
      loops.set(e.source, i + 1)
      stub = SELF_LOOP_OFFSET + i * LOOP_GAP
    }
    stubs.set(e.key, stub)
    const anchors = anchorsOf(e)
    const autoSource: Side = loop ? "e" : autoSide(a, b)
    const autoTarget: Side = loop ? "n" : opposite(autoSource)
    const ends = [
      { end: "source" as const, node: e.source, rect: a, anchor: anchors.source, auto: autoSource, toward: center(b) },
      { end: "target" as const, node: e.target, rect: b, anchor: anchors.target, auto: autoTarget, toward: center(a) },
    ]
    for (const { end, node, rect, anchor, auto, toward } of ends) {
      const outline = outlineOf(node)
      if (anchor !== null) {
        const port = anchorPort(rect, outline, anchor, toward)
        const side = sideOf(port.dir)
        push(node, { edge: e.key, end, rect, outline, side, fixed: port.point, along: alongSide(side, port.point) })
      } else {
        push(node, { edge: e.key, end, rect, outline, side: auto, fixed: null, along: alongSide(auto, toward) })
      }
    }
  }

  const found = new Map<string, Partial<Record<"source" | "target", Port>>>()
  const place = (p: PendingEnd, point: Point) => {
    const ports = found.get(p.edge) ?? {}
    ports[p.end] = { point, dir: SIDE_DIR[p.side] }
    found.set(p.edge, ports)
  }

  for (const group of groups.values()) {
    const { rect, outline, side } = group[0]!
    const [lo, hi] = sideSpan(rect, side)
    const clampSide = (v: number) => Math.min(hi, Math.max(lo, v))
    const fixed = group.filter((p) => p.fixed !== null)
    for (const p of fixed) place(p, p.fixed!)
    const bounds = [lo, ...fixed.map((p) => clampSide(p.along)).sort((x, y) => x - y), hi]
    const buckets: PendingEnd[][] = bounds.slice(1).map(() => [])
    for (const p of group) {
      if (p.fixed !== null) continue
      const at = clampSide(p.along)
      // L'intervallo è quello dopo l'ultimo capo fissato che sta prima (o esattamente su) questo capo.
      const i = bounds.slice(1, -1).filter((b) => b <= at).length
      buckets[i]!.push(p)
    }
    buckets.forEach((bucket, i) => {
      const a = bounds[i]!
      const b = bounds[i + 1]!
      bucket
        .sort((x, y) => x.along - y.along || (x.edge < y.edge ? -1 : x.edge > y.edge ? 1 : 0))
        .forEach((p, j) => place(p, sidePoint(rect, outline, side, a + ((j + 1) * (b - a)) / (bucket.length + 1))))
    })
  }

  const out = new Map<string, EdgePorts>()
  for (const [key, ports] of found) {
    if (ports.source && ports.target) out.set(key, { source: ports.source, target: ports.target, stub: stubs.get(key)! })
  }
  return out
}
