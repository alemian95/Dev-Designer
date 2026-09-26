import type { LayoutEdge, LayoutGraph, LayoutNode } from "@/model/layout"
import type { Arrow, ArrowHead, ShapeDiagram, ShapeKind, ShapeModel } from "@/model/shape/schema"
import type { Recipe } from "../document-store"
import { DUPLICATE_OFFSET, snap, type Point } from "../geometry"
import { shapeDiagram } from "../shape-access"
import { shapeSize } from "./geometry"

/** Una forma nuova, con l'etichetta vuota e la misura del testo (`w`/`h` a `null`). La chiave è un uuid. */
export function addShape(at: Point, kind: ShapeKind): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const d = shapeDiagram(draft)
      d.model.shapes[key] = { kind, label: "" }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false, w: null, h: null }
    },
  }
}

export function setShapeLabel(key: string, label: string): Recipe {
  return (draft) => {
    const shape = shapeDiagram(draft).model.shapes[key]
    // Si scrive solo se cambia davvero: riaprire e richiudere l'editor senza toccare niente
    // lascerebbe altrimenti una voce di annulla fantasma.
    if (shape && shape.label !== label) shape.label = label
  }
}

/** Elimina le forme e le frecce date, e le frecce che toccano una forma eliminata (spec 3b §5). */
export function deleteShapeItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null {
  if (nodeKeys.length === 0 && edgeKeys.length === 0) return null
  const nodes = new Set(nodeKeys)
  return (draft) => {
    const d = shapeDiagram(draft)
    for (const key of edgeKeys) delete d.model.arrows[key]
    for (const [key, arrow] of Object.entries(d.model.arrows)) {
      if (nodes.has(arrow.source) || nodes.has(arrow.target)) delete d.model.arrows[key]
    }
    for (const key of nodeKeys) {
      delete d.model.shapes[key]
      delete d.view.nodes[key]
    }
  }
}

/**
 * Copia le forme con un uuid nuovo e lo scarto di sempre, misura scelta compresa, e copia le frecce
 * che collegano **due** forme copiate, sulle copie (spec 3b §5). Una freccia verso una forma non
 * copiata resta solo sull'originale.
 */
export function duplicateShapes(model: ShapeModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const copies = new Map(keys.filter((k) => k in model.shapes).map((from) => [from, crypto.randomUUID()] as const))
  const arrows: [string, Arrow][] = Object.values(model.arrows).flatMap((arrow): [string, Arrow][] => {
    const source = copies.get(arrow.source)
    const target = copies.get(arrow.target)
    return source && target ? [[crypto.randomUUID(), { ...arrow, source, target }]] : []
  })
  return {
    keys: [...copies.values()],
    recipe: (draft) => {
      const d = shapeDiagram(draft)
      for (const [from, to] of copies) {
        const shape = d.model.shapes[from]
        const view = d.view.nodes[from]
        if (!shape || !view) continue
        d.model.shapes[to] = { ...shape }
        d.view.nodes[to] = { ...view, x: view.x + DUPLICATE_OFFSET, y: view.y + DUPLICATE_OFFSET }
      }
      for (const [key, arrow] of arrows) d.model.arrows[key] = arrow
    },
  }
}

/**
 * Il grafo da disporre (spec 3b §6): ogni forma sul canvas con la sua misura vera, allargata
 * compresa, e le frecce come archi, nel loro verso. Le frecce con un estremo fuori dal grafo si
 * saltano: a ELK un arco senza uno dei due estremi fa rifiutare l'intero grafo.
 */
export function shapeLayoutGraph(d: ShapeDiagram): LayoutGraph {
  const nodes: LayoutNode[] = Object.entries(d.model.shapes).flatMap(([key, shape]) => {
    const view = d.view.nodes[key]
    return view ? [{ id: key, ...shapeSize(shape, view) }] : []
  })
  const present = new Set(nodes.map((n) => n.id))
  const edges: LayoutEdge[] = Object.entries(d.model.arrows).flatMap(([id, arrow]) =>
    present.has(arrow.source) && present.has(arrow.target) ? [{ id, source: arrow.source, target: arrow.target }] : [],
  )
  return { nodes, edges, direction: "DOWN" }
}

/**
 * Una freccia nuova dal gesto Collega (spec 3b §5): con la punta alla fine e la linea continua.
 * `null` fra una forma e sé stessa, o se un estremo non è una forma. Due frecce fra le stesse forme
 * sono ammesse: si affiancano.
 */
export function addArrow(model: ShapeModel, source: string, target: string): { key: string; recipe: Recipe } | null {
  if (source === target || !(source in model.shapes) || !(target in model.shapes)) return null
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      shapeDiagram(draft).model.arrows[key] = { source, target, head: "end", dashed: false }
    },
  }
}

export function setArrowHead(key: string, head: ArrowHead): Recipe {
  return (draft) => {
    const arrow = shapeDiagram(draft).model.arrows[key]
    if (arrow && arrow.head !== head) arrow.head = head
  }
}

export function setArrowDashed(key: string, dashed: boolean): Recipe {
  return (draft) => {
    const arrow = shapeDiagram(draft).model.arrows[key]
    if (arrow && arrow.dashed !== dashed) arrow.dashed = dashed
  }
}

/** Scambia i capi: la punta «alla fine» passa all'altra forma senza cancellare e rifare la freccia (spec 3b §7). */
export function invertArrow(key: string): Recipe {
  return (draft) => {
    const arrow = shapeDiagram(draft).model.arrows[key]
    if (arrow) [arrow.source, arrow.target] = [arrow.target, arrow.source]
  }
}

/** Scrive la misura scelta a mano di una forma: un solo passo di annulla, e niente se non cambia. */
export function resizeShape(key: string, w: number | null, h: number | null): Recipe {
  return (draft) => {
    const view = shapeDiagram(draft).view.nodes[key]
    if (!view) return
    if (view.w !== w) view.w = w
    if (view.h !== h) view.h = h
  }
}
