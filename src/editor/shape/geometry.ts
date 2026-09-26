import type { Arrow, Shape, ShapeDiagram, ShapeView } from "@/model/shape/schema"
import { edgeOffsets, filledArrowPath, memoOnIdentity, pathFromPoints, routeEdge, type EdgeGeometry } from "../edge-routing"
import { CHAR_W, GRID, PAD_X, ROW_H, snap, type Rect, type Size } from "../geometry"

/** Quello che un testo vuoto mostra sul canvas (spec 3b §5): senza, sarebbe invisibile e impossibile da afferrare. */
export const TEXT_PLACEHOLDER = "Testo"

/** Minimo di rettangolo ed ellisse con l'etichetta vuota: gli stessi di un nodo di flusso, afferrabili. */
const MIN_SHAPE_W = 60
const MIN_SHAPE_H = 40

/**
 * Un'ellisse che contiene il rettangolo `w × h` del testo ha gli assi √2 volte i suoi lati: con quel
 * fattore gli angoli del rettangolo cadono esattamente sull'ellisse.
 */
const ELLIPSE_FACTOR = Math.SQRT2

const toGrid = (v: number): number => Math.ceil(v / GRID) * GRID

/** Il testo che la forma mostra: l'etichetta, o il segnaposto per un testo vuoto (scostamento 2 del piano). */
export function shapeText(shape: Pick<Shape, "kind" | "label">): string {
  return shape.kind === "text" && shape.label === "" ? TEXT_PLACEHOLDER : shape.label
}

/**
 * La misura che il testo chiede, senza quella scelta a mano: larghezza dalla riga più lunga, altezza
 * dal numero di righe, entrambe arrotondate alla griglia, così il bordo destro e quello inferiore
 * restano sulla griglia come il sinistro e il superiore. Rettangolo ed ellisse hanno un minimo
 * afferrabile; l'ellisse è √2 volte il rettangolo del testo; il testo non ha minimo oltre al segnaposto.
 */
export function shapeTextSize(shape: Pick<Shape, "kind" | "label">): Size {
  const lines = shapeText(shape).split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  const w = chars * CHAR_W + 2 * PAD_X
  const h = lines.length * ROW_H
  switch (shape.kind) {
    case "text":
      return { w: toGrid(w), h: toGrid(h) }
    case "rect":
      return { w: Math.max(MIN_SHAPE_W, toGrid(w)), h: Math.max(MIN_SHAPE_H, toGrid(h)) }
    case "ellipse":
      return { w: Math.max(MIN_SHAPE_W, toGrid(w * ELLIPSE_FACTOR)), h: Math.max(MIN_SHAPE_H, toGrid(h * ELLIPSE_FACTOR)) }
  }
}

/** La misura vera (spec 3b §3): lato per lato, la più grande fra quella del testo e quella scelta a mano. */
export function shapeSize(shape: Pick<Shape, "kind" | "label">, view: Pick<ShapeView, "w" | "h">): Size {
  const text = shapeTextSize(shape)
  return { w: Math.max(text.w, view.w ?? 0), h: Math.max(text.h, view.h ?? 0) }
}

export function shapeRect(shape: Pick<Shape, "kind" | "label">, view: ShapeView): Rect {
  return { x: view.x, y: view.y, ...shapeSize(shape, view) }
}

/**
 * L'ordine di disegno (spec 3b §5): dalla forma più grande alla più piccola, per area, così una zona
 * creata dopo non copre mai una forma più piccola che le sta sopra. A parità d'area vale l'ordine
 * delle chiavi (`sort` è stabile). Solo le forme che hanno sia il modello sia la view. È la sola
 * definizione: la usano il layer del canvas e `shapeOps.nodeKeys`, quindi anche l'export SVG.
 */
export function shapeDrawOrder(d: ShapeDiagram): string[] {
  const area = (key: string): number => {
    const { w, h } = shapeSize(d.model.shapes[key]!, d.view.nodes[key]!)
    return w * h
  }
  // ponytail: l'area si ricalcola a ogni confronto, O(n log n) misure; una mappa se servisse su lavagne enormi.
  return Object.keys(d.view.nodes)
    .filter((key) => key in d.model.shapes)
    .sort((a, b) => area(b) - area(a))
}

/**
 * Tutta la geometria di una freccia (spec 3b §5): il percorso ortogonale di tutti gli archi
 * (`routeEdge`, mai un cappio: lo schema rifiuta una freccia verso sé stessa), una punta piena a ogni
 * capo che `head` chiede, e l'etichetta — che una freccia non ha — sul segmento centrale, perché
 * `EdgeGeometry` la vuole. Serve al disegno statico e all'anteprima del drag.
 */
export function arrowGeometry(source: Rect, target: Rect, arrow: Pick<Arrow, "head">, offset = 0): EdgeGeometry {
  const route = routeEdge(source, target, false, offset)
  const pts = route.points
  const mid = Math.floor((pts.length - 1) / 2)
  const a = pts[mid]!
  const b = pts[mid + 1]!
  return {
    d: pathFromPoints(pts),
    sourceMarker: arrow.head === "both" ? filledArrowPath(pts[0]!, route.sourceDir) : "",
    targetMarker: arrow.head === "none" ? "" : filledArrowPath(pts[pts.length - 1]!, route.targetDir),
    label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  }
}

/** Gli scarti di fascio delle frecce: più frecce fra le stesse due forme si affiancano (spec 3b §3). Gemella di `flowEdgeOffsets`. */
export const arrowOffsets = memoOnIdentity((arrows: Readonly<Record<string, Arrow>>) =>
  edgeOffsets(Object.entries(arrows).map(([key, a]) => ({ key, source: a.source, target: a.target }))),
)

/**
 * Il ridimensionamento dall'angolo (spec 3b §5): la misura vera più il trascinamento, allineata alla
 * griglia e mai sotto quella del testo. `w`/`h` sono le misure scelte da scrivere nella view: `null`
 * dove la misura nuova non supera quella del testo, così portare la maniglia fino al testo riporta la
 * forma alla misura automatica (scostamento 3 del piano). `size` è il rettangolo da mostrare come guida.
 */
export function resizedShape(
  shape: Pick<Shape, "kind" | "label">,
  view: Pick<ShapeView, "w" | "h">,
  dx: number,
  dy: number,
): { size: Size; w: number | null; h: number | null } {
  const text = shapeTextSize(shape)
  const now = shapeSize(shape, view)
  const w = Math.max(text.w, snap(now.w + dx))
  const h = Math.max(text.h, snap(now.h + dy))
  return { size: { w, h }, w: w > text.w ? w : null, h: h > text.h ? h : null }
}
