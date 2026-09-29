import { entityKey, type Attribute, type Entity } from "@/model/er/schema"
import type { NodeView } from "@/model/shared"
import { CHAR_W, GRID, HEADER_H, MIN_W, PAD_X, ROW_H, type Rect, type Size } from "../geometry"

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
