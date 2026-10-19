import type { Sequence } from "@/model/sequence/schema"
import type { ChosenSize } from "@/model/shared"
import type { Point, Rect } from "../geometry"
import { sequenceLayout } from "./layout"

const at = (r: Rect, origin: Point): Rect => ({ ...r, x: r.x + origin.x, y: r.y + origin.y })

/** Il rettangolo della sequenza sul canvas: la posizione è della view, la misura del contenuto o quella scelta. */
export function sequenceRect(seq: Sequence, view: Point & ChosenSize): Rect {
  const { width, height } = sequenceLayout(seq, view)
  return { x: view.x, y: view.y, w: width, h: height }
}

/**
 * Il rettangolo di un sotto-elemento sul canvas: l'intestazione di un partecipante, la riga di un
 * messaggio o di una nota di sequenza, l'etichetta di un blocco. `null` se `subId` non c'è.
 */
export function subRect(seq: Sequence, view: Point, subId: string): Rect | null {
  const l = sequenceLayout(seq)
  const r = l.columns[subId]?.head ?? l.rows[subId] ?? l.blocks[subId]?.label
  return r ? at(r, view) : null
}
