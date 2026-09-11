export const FONT_SIZE = 13
/** JetBrains Mono ha avanzamento 600/1000 em: larghezza carattere = 0,6 × font size. Nessuna misura nel DOM. */
export const CHAR_W = FONT_SIZE * 0.6
export const HEADER_H = 28
export const ROW_H = 22
export const PAD_X = 10
export const MIN_W = 160
export const GRID = 10

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
