import { entityKey, type Attribute, type Entity, type Relationship } from "@/model/er/schema"
import type { NodeView } from "@/model/shared"
import { edgeOffsets, memoOnIdentity } from "../edge-routing"
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

/**
 * Gli scarti di fascio del diagramma, dal modello: `edgeOffsets` lavora su estremi nudi e non sa
 * che una relazione ER tiene le proprie entità in `source.entity`/`target.entity`.
 *
 * Una sola funzione per tutti gli archi, e non una per arco: i tre percorsi che disegnano lo stesso
 * diagramma — il canvas, l'anteprima del drag e l'export SVG — devono partire dalla stessa mappa,
 * altrimenti un arco salterebbe di posto appena lo si trascina. Memoizzata sull'identità della
 * mappa delle relazioni: il preview del drag la richiede per ogni arco a ogni frame.
 */
export const erEdgeOffsets = memoOnIdentity((relationships: Readonly<Record<string, Relationship>>) =>
  edgeOffsets(
    Object.entries(relationships).map(([key, r]) => ({ key, source: r.source.entity, target: r.target.entity })),
  ),
)
