import { entityKey, type Attribute, type Entity } from "@/model/er/schema"
import type { NodeView } from "@/model/shared"

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

export function attributeMarker(a: Attribute): string {
  if (a.primaryKey && a.foreignKey) return "PF"
  if (a.primaryKey) return "PK"
  if (a.foreignKey) return "FK"
  return "  "
}

export function attributeTypeText(a: Attribute): string {
  return `${a.type}${a.nullable ? "?" : ""}${a.unique ? " U" : ""}`
}

/** Una riga per attributo, colonne allineate con spazi: il font è monospace, il layout è deterministico. */
export function attributeLines(attributes: readonly Attribute[]): string[] {
  const nameW = Math.max(0, ...attributes.map((a) => a.name.length))
  return attributes.map((a) => `${attributeMarker(a)} ${a.name.padEnd(nameW)}  ${attributeTypeText(a)}`)
}

export function entitySize(entity: Entity, collapsed: boolean): Size {
  const lines = collapsed ? [] : attributeLines(entity.attributes)
  const chars = Math.max(entityKey(entity).length, ...lines.map((l) => l.length))
  const w = Math.max(MIN_W, Math.ceil((chars * CHAR_W + 2 * PAD_X) / GRID) * GRID)
  const h = HEADER_H + lines.length * ROW_H + (lines.length ? 6 : 0)
  return { w, h }
}

export function entityRect(entity: Entity, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...entitySize(entity, view.collapsed) }
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
