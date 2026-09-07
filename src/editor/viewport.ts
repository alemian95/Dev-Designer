import type { Point, Rect, Size } from "./er-geometry"

/** screen = world × scale + (x, y). */
export interface Viewport { x: number; y: number; scale: number }

export const IDENTITY: Viewport = { x: 0, y: 0, scale: 1 }
export const MIN_SCALE = 0.1
export const MAX_SCALE = 4

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

/** Zoom attorno a un punto dello schermo: il punto del mondo sotto il cursore resta fermo. */
export function zoomAt(vp: Viewport, screen: Point, factor: number): Viewport {
  const scale = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE)
  const world = screenToWorld(vp, screen)
  return { scale, x: screen.x - world.x * scale, y: screen.y - world.y * scale }
}

/** Inquadra `bounds` nel canvas. Non ingrandisce oltre 1: un diagramma piccolo resta a grandezza naturale. */
export function fitToRect(bounds: Rect | null, size: Size, padding = 40): Viewport {
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) return IDENTITY
  const scale = clamp(Math.min((size.w - 2 * padding) / bounds.w, (size.h - 2 * padding) / bounds.h), MIN_SCALE, 1)
  return {
    scale,
    x: (size.w - bounds.w * scale) / 2 - bounds.x * scale,
    y: (size.h - bounds.h * scale) / 2 - bounds.y * scale,
  }
}

export function transformAttr(vp: Viewport): string {
  return `translate(${vp.x} ${vp.y}) scale(${vp.scale})`
}

/**
 * Il rettangolo di mondo inquadrato. Oggi nessuno lo chiama: è il punto d'ingresso del culling del
 * viewport (Task 12), che la misura di prestazioni ha fatto **rinviare** — non è codice rimasto qui
 * per dimenticanza, è una decisione a verbale. Lo scenario che fallisce il criterio è lo zoom, e il
 * suo costo dipende dal numero di nodi nel DOM, non da quanti ne sono inquadrati: il culling non lo
 * tocca. Vedi `docs/perf/2026-09-06-fps-frame-dipinti.md` §7.
 */
export function visibleWorldRect(vp: Viewport, size: Size): Rect {
  const tl = screenToWorld(vp, { x: 0, y: 0 })
  return { x: tl.x, y: tl.y, w: size.w / vp.scale, h: size.h / vp.scale }
}
