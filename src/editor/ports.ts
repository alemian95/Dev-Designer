import type { Anchor } from "@/model/shared"
import { DOWN, LEFT, RIGHT, UP, type Dir } from "./edge-routing"
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
