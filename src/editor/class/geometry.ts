import { memberLines } from "@/model/class/members"
import type { ClassNode, RelationKind } from "@/model/class/schema"
import type { NodeView } from "@/model/shared"
import { pathFromPoints, type Dir } from "../edge-routing"
import { CHAR_W, GRID, HEADER_H, MIN_W, PAD_X, ROW_H, type Point, type Rect, type Size } from "../geometry"

/** Altezza della riga «stereotipo» dentro l'header, per interface ed enum. */
export const STEREO_H = 16

/** `true` per interface ed enum: hanno una riga ««nome»» dentro l'header. */
export function hasStereotypeLine(node: ClassNode): boolean {
  return node.stereotype === "interface" || node.stereotype === "enum"
}

/** Testo della riga stereotipo, come lo rende UML: `«interface»`. */
function stereotypeText(node: ClassNode): string {
  return `«${node.stereotype}»`
}

export function classSize(node: ClassNode, collapsed: boolean): Size {
  const lines = collapsed ? [] : memberLines(node)
  const attrCount = collapsed ? 0 : node.attributes.length
  const methodCount = collapsed ? 0 : node.methods.length
  const stereo = hasStereotypeLine(node)

  const chars = Math.max(node.name.length, stereo ? stereotypeText(node).length : 0, ...lines.map((l) => l.length))
  const w = Math.max(MIN_W, Math.ceil((chars * CHAR_W + 2 * PAD_X) / GRID) * GRID)
  const h =
    HEADER_H +
    (stereo ? STEREO_H : 0) +
    attrCount * ROW_H + (attrCount ? 6 : 0) +
    methodCount * ROW_H + (methodCount ? 6 : 0)
  return { w, h }
}

export function classRect(node: ClassNode, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...classSize(node, view.collapsed) }
}

/** Lunghezza e semi-larghezza del triangolo vuoto (generalizzazione, realizzazione). */
const TRIANGLE_LEN = 14
const TRIANGLE_HALF_W = 6

/** Lunghezza e semi-larghezza del rombo (composizione, aggregazione). */
const DIAMOND_LEN = 16
const DIAMOND_HALF_W = 5

/** Lunghezza e semi-larghezza della freccia aperta (dipendenza). */
const ARROW_LEN = 10
const ARROW_HALF_W = 5

/**
 * Punta UML sul capo dell'arco. Un solo marker per arco: cade sempre sul
 * target. `at` sta sul bordo del target, `dir` è il versore che ne esce
 * lungo l'edge — stessa convenzione di `crowsFootPath`: l'apice della punta
 * tocca `at` (d=0) e il resto si allunga lungo `dir`, verso il source.
 */
export function umlMarkerPath(at: Point, dir: Dir, kind: RelationKind): string {
  if (kind === "association") return ""

  const px = -dir.y
  const py = dir.x
  const p = (d: number, s: number): Point => ({ x: at.x + dir.x * d + px * s, y: at.y + dir.y * d + py * s })

  if (kind === "generalization" || kind === "realization") {
    return `${pathFromPoints([at, p(TRIANGLE_LEN, -TRIANGLE_HALF_W), p(TRIANGLE_LEN, TRIANGLE_HALF_W)])} Z`
  }

  if (kind === "composition" || kind === "aggregation") {
    return `${pathFromPoints([at, p(DIAMOND_LEN / 2, -DIAMOND_HALF_W), p(DIAMOND_LEN, 0), p(DIAMOND_LEN / 2, DIAMOND_HALF_W)])} Z`
  }

  // dependency: freccia aperta, due segmenti che convergono su `at`.
  return `${pathFromPoints([p(ARROW_LEN, -ARROW_HALF_W), at])} ${pathFromPoints([at, p(ARROW_LEN, ARROW_HALF_W)])}`
}

/** `true` se la linea dell'arco va tratteggiata: realizzazione e dipendenza. */
export function isDashed(kind: RelationKind): boolean {
  return kind === "realization" || kind === "dependency"
}

/** `true` se la punta va riempita: solo la composizione. */
export function isFilled(kind: RelationKind): boolean {
  return kind === "composition"
}
