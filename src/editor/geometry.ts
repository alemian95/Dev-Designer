import { GRID } from "@/model/metrics"

// Le metriche del testo vivono nel modello (spec 2b §3): qui si riesportano, così nessun chiamante
// cambia import.
export { CHAR_W, FONT_SIZE, GRID, MIN_NODE_H, MIN_NODE_W, PAD_X, ROW_H } from "@/model/metrics"

export const HEADER_H = 28
export const MIN_W = 160

/** Scostamento di un duplicato dall'originale, in x e y: uguale in ogni famiglia (SSOT, una sola definizione). */
export const DUPLICATE_OFFSET = 20

export interface Point { x: number; y: number }
export interface Size { w: number; h: number }
export interface Rect extends Point, Size {}

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}

/** I quattro spigoli di un riquadro: le maniglie di ridimensionamento di un nodo. */
export type Corner = "nw" | "ne" | "se" | "sw"
export const CORNERS: readonly Corner[] = ["nw", "ne", "se", "sw"]

/**
 * Il riquadro `r` trascinato dallo spigolo `corner` di (`dx`, `dy`): la misura si allinea alla griglia
 * e non scende sotto `min`, e lo spigolo opposto resta fermo.
 */
export function resizeFromCorner(r: Rect, min: Size, corner: Corner, dx: number, dy: number): Rect {
  const west = corner === "nw" || corner === "sw"
  const north = corner === "nw" || corner === "ne"
  const w = Math.max(min.w, snap(r.w + (west ? -dx : dx)))
  const h = Math.max(min.h, snap(r.h + (north ? -dy : dy)))
  return { x: west ? r.x + r.w - w : r.x, y: north ? r.y + r.h - h : r.y, w, h }
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
