import type { DevDocument } from "@/model/document"
import type { Recipe } from "../document-store"
import { canvasOps } from "../kinds/canvas-ops"
import { isAnchored, noteDiagram } from "../note-access"

/** Lo scarto misurato fra una nota e il suo elemento: quanto la nota segue dopo Disponi. */
export interface AnchorFollow {
  key: string
  anchor: string
  dx: number
  dy: number
}

/**
 * Lo scarto fra ogni nota ancorata e il suo elemento, misurato su `doc`: la stessa regola serve a
 * `followAnchors` qui sotto, che la applica dopo Disponi, e al calcolo dell'ingombro di ogni blocco
 * (`layout-pack.ts`), che deve prevedere dove cadrà la nota per non farci atterrare sopra il blocco
 * di un'**altra** famiglia (spec 3a §6, §10, F1 della review finale). Una nota con l'àncora pendente
 * non compare: per Disponi vale come libera.
 */
export function anchorPlan(doc: DevDocument): AnchorFollow[] {
  const before = canvasOps(doc)
  const d = noteDiagram(doc)
  return Object.entries(d.model.notes).flatMap(([key, note]) => {
    const view = d.view.nodes[key]
    if (!view || !isAnchored(doc, note)) return []
    const anchor = before.rectOf(note.anchor)
    return anchor ? [{ key, anchor: note.anchor, dx: view.x - anchor.x, dy: view.y - anchor.y }] : []
  })
}

/**
 * Le note ancorate seguono il loro elemento con lo scarto che avevano prima di Disponi (spec 3a §6).
 * Lo scarto (`anchorPlan`) si misura sul documento di partenza, `doc`; la posizione nuova
 * dell'elemento si legge sul draft, **dopo** le recipe di tutte le famiglie: per questo il passo è
 * l'ultimo di `layoutAll`, e non dipende dall'ordine di `FAMILIES`. `null` se nessuna nota è ancorata
 * a un elemento che c'è.
 *
 * Niente `snap`: l'elemento ancorato (un pool, in particolare) può uscire dalla griglia dopo Disponi
 * — `applyFlowLayout` non arrotonda (debito tecnico) — e arrotondare la nota qui romperebbe lo
 * scarto esatto che questa funzione promette, spostandolo fino a metà griglia (review finale, F7).
 */
export function followAnchors(doc: DevDocument): Recipe | null {
  const plan = anchorPlan(doc)
  if (plan.length === 0) return null
  return (draft) => {
    const after = canvasOps(draft)
    const views = noteDiagram(draft).view.nodes
    for (const { key, anchor, dx, dy } of plan) {
      const rect = after.rectOf(anchor)
      const view = views[key]
      if (!rect || !view) continue
      view.x = rect.x + dx
      view.y = rect.y + dy
    }
  }
}
