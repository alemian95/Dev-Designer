import type { DevDocument } from "@/model/document"
import { anchorExists } from "@/model/note/validate"
import type { Recipe } from "../document-store"
import { snap } from "../geometry"
import { canvasOps } from "../kinds/canvas-ops"
import { noteDiagram } from "../note-access"

/**
 * Le note ancorate seguono il loro elemento con lo scarto che avevano prima di Disponi (spec 3a §6).
 * Lo scarto si misura sul documento di partenza, `doc`; la posizione nuova dell'elemento si legge sul
 * draft, **dopo** le recipe di tutte le famiglie: per questo il passo è l'ultimo di `layoutAll`, e non
 * dipende dall'ordine di `FAMILIES`. Una nota con l'àncora pendente è libera: la dispone il suo blocco.
 * `null` se nessuna nota è ancorata a un elemento che c'è.
 */
export function followAnchors(doc: DevDocument): Recipe | null {
  const before = canvasOps(doc)
  const d = noteDiagram(doc)
  const plan = Object.entries(d.model.notes).flatMap(([key, note]) => {
    const view = d.view.nodes[key]
    if (note.anchor === null || !view || !anchorExists(doc, note.anchor)) return []
    const anchor = before.rectOf(note.anchor)
    return anchor ? [{ key, anchor: note.anchor, dx: view.x - anchor.x, dy: view.y - anchor.y }] : []
  })
  if (plan.length === 0) return null
  return (draft) => {
    const after = canvasOps(draft)
    const views = noteDiagram(draft).view.nodes
    for (const { key, anchor, dx, dy } of plan) {
      const rect = after.rectOf(anchor)
      const view = views[key]
      if (!rect || !view) continue
      view.x = snap(rect.x + dx)
      view.y = snap(rect.y + dy)
    }
  }
}
