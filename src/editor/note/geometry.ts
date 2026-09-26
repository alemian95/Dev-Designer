import type { Note } from "@/model/note/schema"
import type { NodeView } from "@/model/shared"
import { pathFromPoints, routeEdge, type EdgeGeometry } from "../edge-routing"
import { CHAR_W, GRID, MIN_W, PAD_X, ROW_H, type Rect, type Size } from "../geometry"

/** Lato del triangolo piegato nell'angolo in alto a destra della nota. Nessun consumatore fuori da
 *  questo modulo: `noteSize` e `notePath` lo usano entrambi, ma solo qui dentro. */
const NOTE_FOLD = 12

/** Margine interno verticale della nota, sopra e sotto il blocco di righe. */
const NOTE_PAD_Y = 6

/**
 * Dimensione di una nota, sulla falsariga di `classSize` (§6 del documento madre): larghezza dal
 * carattere più lungo arrotondata alla griglia, altezza dal numero di righe. A differenza di
 * `classSize`, la larghezza aggiunge `NOTE_FOLD`: senza quello spazio la piega dell'angolo
 * morderebbe l'ultimo carattere della riga più lunga. Il minimo è metà di quello di una classe —
 * una nota vuota deve restare cliccabile, non larga quanto una classe.
 */
export function noteSize(note: Pick<Note, "text">): Size {
  const lines = note.text.split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  const w = Math.max(MIN_W / 2, Math.ceil((chars * CHAR_W + 2 * PAD_X + NOTE_FOLD) / GRID) * GRID)
  return { w, h: lines.length * ROW_H + 2 * NOTE_PAD_Y }
}

export function noteRect(note: Pick<Note, "text">, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...noteSize(note) }
}

/**
 * I due path della forma UML della nota: `body` è il contorno con l'angolo in alto a destra
 * tagliato, `fold` il triangolino che lo chiude. Due path e non uno perché il triangolo va
 * riempito di un colore diverso dal corpo, e un path solo non può avere due riempimenti.
 */
export function notePath(w: number, h: number): { body: string; fold: string } {
  const f = NOTE_FOLD
  return {
    body: `M0 0 L${w - f} 0 L${w} ${f} L${w} ${h} L0 ${h} Z`,
    fold: `M${w - f} 0 L${w} ${f} L${w - f} ${f} Z`,
  }
}

/**
 * La linea di ancoraggio (spec 3a §5): lo stesso instradamento ortogonale dei collegamenti, con
 * scarto 0 perché una nota ha una linea sola, e **nessun marker** a nessuno dei due capi — un
 * ancoraggio non ha verso, come il `note-link` di prima. Tratteggiata la rende chi disegna.
 */
export function anchorGeometry(source: Rect, target: Rect): EdgeGeometry {
  const route = routeEdge(source, target, false)
  const pts = route.points
  const p0 = pts[0]!
  const p1 = pts[1]!
  return { d: pathFromPoints(pts), sourceMarker: "", targetMarker: "", label: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 } }
}
