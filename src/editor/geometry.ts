import { GRID } from "@/model/metrics"

// Le metriche del testo vivono nel modello (spec 2b §3): qui si riesportano, così nessun chiamante
// cambia import.
export { CHAR_W, FONT_SIZE, GRID, PAD_X, ROW_H } from "@/model/metrics"

export const HEADER_H = 28
export const MIN_W = 160

export interface Point { x: number; y: number }
export interface Size { w: number; h: number }
export interface Rect extends Point, Size {}

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}

export function rectsBounds(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const x1 = Math.min(...rects.map((r) => r.x))
  const y1 = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.w))
  const y2 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}
