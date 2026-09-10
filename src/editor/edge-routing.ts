import type { Cardinality, Relationship } from "@/model/er/schema"
import type { Point, Rect } from "./geometry"

export interface Dir { x: -1 | 0 | 1; y: -1 | 0 | 1 }
export interface EdgeRoute { points: Point[]; sourceDir: Dir; targetDir: Dir }

const RIGHT: Dir = { x: 1, y: 0 }
const LEFT: Dir = { x: -1, y: 0 }
const UP: Dir = { x: 0, y: -1 }
const DOWN: Dir = { x: 0, y: 1 }
const SELF_LOOP_OFFSET = 30

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** Routing ortogonale con al più due pieghe, senza evitamento ostacoli (spec §4.3). */
export function routeEdge(a: Rect, b: Rect): EdgeRoute {
  if (sameRect(a, b)) return selfLoop(a)
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const p0 = { x: dx >= 0 ? a.x + a.w : a.x, y: ca.y }
    const p3 = { x: dx >= 0 ? b.x : b.x + b.w, y: cb.y }
    const midX = (p0.x + p3.x) / 2
    const points = p0.y === p3.y ? [p0, p3] : [p0, { x: midX, y: p0.y }, { x: midX, y: p3.y }, p3]
    return { points, sourceDir: dx >= 0 ? RIGHT : LEFT, targetDir: dx >= 0 ? LEFT : RIGHT }
  }
  const p0 = { x: ca.x, y: dy >= 0 ? a.y + a.h : a.y }
  const p3 = { x: cb.x, y: dy >= 0 ? b.y : b.y + b.h }
  const midY = (p0.y + p3.y) / 2
  const points = p0.x === p3.x ? [p0, p3] : [p0, { x: p0.x, y: midY }, { x: p3.x, y: midY }, p3]
  return { points, sourceDir: dy >= 0 ? DOWN : UP, targetDir: dy >= 0 ? UP : DOWN }
}

function selfLoop(a: Rect): EdgeRoute {
  const o = SELF_LOOP_OFFSET
  const right = a.x + a.w
  const midY = a.y + a.h / 2
  const midX = a.x + a.w / 2
  return {
    points: [{ x: right, y: midY }, { x: right + o, y: midY }, { x: right + o, y: a.y - o }, { x: midX, y: a.y - o }, { x: midX, y: a.y }],
    sourceDir: RIGHT,
    targetDir: UP,
  }
}

export function pathFromPoints(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
}

/**
 * Marker crow's foot. `point` sta sul bordo dell'entità, `dir` è il versore che esce dall'entità lungo l'edge.
 * Distanze lungo l'edge: barra a 12, punta del piede a 16, seconda barra a 20, cerchio a 24.
 */
export function crowsFootPath(point: Point, dir: Dir, cardinality: Cardinality): string {
  const px = -dir.y
  const py = dir.x
  const at = (d: number, s: number): Point => ({ x: point.x + dir.x * d + px * s, y: point.y + dir.y * d + py * s })
  const seg = (a: Point, b: Point): string => `M${a.x} ${a.y} L${b.x} ${b.y}`
  const many = cardinality === "many" || cardinality === "zero-or-many"
  const optional = cardinality.startsWith("zero")
  const parts: string[] = []
  if (many) {
    const tip = at(16, 0)
    for (const s of [-6, 0, 6]) parts.push(seg(tip, at(0, s)))
  } else {
    parts.push(seg(at(12, -6), at(12, 6)))
  }
  if (optional) {
    const c = at(24, 0)
    const r = 4
    parts.push(`M${c.x - r} ${c.y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`)
  } else if (many) {
    parts.push(seg(at(20, -6), at(20, 6)))
  }
  return parts.join(" ")
}

export interface EdgeGeometry {
  d: string
  sourceMarker: string
  targetMarker: string
  /** Punto medio del segmento centrale, per l'etichetta. */
  label: Point
  /** Capi per le molteplicità testuali: solo nei class diagram, l'ER non li popola. */
  sourceEnd?: Point
  targetEnd?: Point
}

/** Tutta la geometria di un edge da due rettangoli e la relazione. Usata sia da React sia dagli aggiornamenti imperativi. */
export function edgeGeometry(source: Rect, target: Rect, rel: Relationship): EdgeGeometry {
  const route = routeEdge(source, target)
  const pts = route.points
  const mid = Math.floor((pts.length - 1) / 2)
  const a = pts[mid]!
  const b = pts[mid + 1]!
  return {
    d: pathFromPoints(pts),
    sourceMarker: crowsFootPath(pts[0]!, route.sourceDir, rel.source.cardinality),
    targetMarker: crowsFootPath(pts[pts.length - 1]!, route.targetDir, rel.target.cardinality),
    label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  }
}
