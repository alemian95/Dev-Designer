import type { DevDocument } from "@/model/document"
import { FAMILIES, splitKey, type Family } from "@/model/family"
import type { LayoutGraph, LayoutNode, LayoutPositions } from "@/model/layout"
import { applyLayout } from "./commands/view"
import type { Recipe } from "./document-store"
import { rectsBounds, type Point, type Rect } from "./geometry"
import { familyHasContent } from "./kinds/canvas-ops"
import { familyOps, type DiagramOps } from "./kinds/ops"
import { noteSize } from "./note/geometry"
import { anchorPlan, followAnchors } from "./note/layout"
import { noteDiagram } from "./note-access"

/** Distanza dall'origine del risultato: un diagramma appiccicato al bordo (0, 0) si legge male. */
export const LAYOUT_MARGIN = 40

/** Spazio fra il blocco di una famiglia e il successivo. */
export const LAYOUT_FAMILY_GAP = 120

/** Il risultato del layout di una famiglia, ridotto a quel che serve per impacchettarlo: il suo ingombro. */
export interface Block {
  family: Family
  /** L'ingombro del blocco dopo il layout, nel sistema delle posizioni di ELK; `null` se è vuoto. */
  bounds: Rect | null
}

/** L'ingombro dei nodi alle posizioni date: la larghezza conta, non solo la posizione. `null` senza nodi posizionati. */
export function nodesBounds(nodes: readonly LayoutNode[], positions: LayoutPositions): Rect | null {
  return rectsBounds(
    nodes.flatMap((n) => {
      const p = positions[n.id]
      return p ? [{ ...p, w: n.w, h: n.h }] : []
    }),
  )
}

/**
 * Mette i blocchi in fila da sinistra a destra, nell'ordine dato, allineati in alto (spec §7), e
 * torna la traslazione di ognuno: il suo angolo in alto a sinistra cade al punto che gli spetta, il
 * primo in `(LAYOUT_MARGIN, LAYOUT_MARGIN)`, i successivi dopo il bordo destro del precedente più
 * `LAYOUT_FAMILY_GAP`. Un blocco vuoto non occupa posto e non ha traslazione. Funzione pura: le
 * posizioni non si allineano alla griglia, lo fa chi le scrive.
 */
export function packBlocks(blocks: readonly Block[]): Map<Family, Point> {
  const out = new Map<Family, Point>()
  let left = LAYOUT_MARGIN
  for (const { family, bounds } of blocks) {
    if (!bounds) continue
    out.set(family, { x: left - bounds.x, y: LAYOUT_MARGIN - bounds.y })
    left += bounds.w + LAYOUT_FAMILY_GAP
  }
  return out
}

const translate = (positions: LayoutPositions, by: Point): LayoutPositions =>
  Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, { x: p.x + by.x, y: p.y + by.y }]))

/**
 * Il rettangolo che l'elemento `key` (senza prefisso) di questa famiglia avrà dopo il layout, nel
 * sistema locale di `positions`: da `ops.layoutRectOf` se la famiglia lo definisce (i pool del
 * flusso), altrimenti dal nodo di `layoutGraph()` con la stessa posizione — la stessa regola di
 * `nodesBounds`, ristretta a un solo id.
 */
function elementRect(ops: DiagramOps, graph: LayoutGraph, positions: LayoutPositions, key: string): Rect | null {
  return ops.layoutRectOf ? ops.layoutRectOf(positions, key) : nodesBounds(graph.nodes.filter((n) => n.id === key), positions)
}

/**
 * Il layout di tutte le famiglie con contenuto, in una recipe sola (spec §7). Ogni famiglia va al
 * motore con la sua direzione (ADR 0007); una famiglia di un nodo solo non ci va, e il nodo viene
 * solo traslato. Il blocco di una famiglia si misura con `layoutBounds` quando la famiglia disegna
 * più dei suoi nodi (i pool del flowchart, spec 2b §6), altrimenti dai nodi — **più** il rettangolo
 * che ogni nota ancorata a un suo elemento avrà dopo Disponi (`anchorPlan`, `note/layout.ts`): senza
 * quel margine `packBlocks` potrebbe accostare il blocco successivo sopra una nota che sporge dal suo
 * elemento (spec 3a §10, F1 della review finale — vedi DT-29). La sovrapposizione **dentro** la
 * stessa famiglia resta possibile: ELK non vede le note. Le chiamate partono in parallelo e **tutto o
 * niente**: se una fallisce, la promise rifiuta e non si applica niente. Il motore è iniettato:
 * `editor` non può importare `io`. Per ultime, le note ancorate seguono il loro elemento
 * (`followAnchors`).
 */
export async function layoutAll(doc: DevDocument, layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<Recipe | null> {
  const families = FAMILIES.filter((f) => familyHasContent(doc, f))
  const plan = anchorPlan(doc)
  const notes = noteDiagram(doc).model.notes
  const blocks = await Promise.all(
    families.map(async (family) => {
      const ops = familyOps(doc, family)
      const graph = ops.layoutGraph()
      const positions = graph.nodes.length > 1 ? await layout(graph) : Object.fromEntries(graph.nodes.map((n) => [n.id, { x: 0, y: 0 }]))
      const base = ops.layoutBounds ? ops.layoutBounds(positions) : nodesBounds(graph.nodes, positions)
      const anchored = plan.flatMap(({ key, anchor, dx, dy }) => {
        const split = splitKey(anchor)
        if (split.family !== family) return []
        const rect = elementRect(ops, graph, positions, split.key)
        const note = notes[key]
        return rect && note ? [{ x: rect.x + dx, y: rect.y + dy, ...noteSize(note) }] : []
      })
      const bounds = rectsBounds([...(base ? [base] : []), ...anchored])
      return { family, ops, positions, bounds }
    }),
  )
  const offsets = packBlocks(blocks)
  const recipes = blocks.flatMap(({ family, ops, positions }) => {
    const offset = offsets.get(family)
    if (!offset) return []
    return [ops.layoutRecipe ? ops.layoutRecipe(positions, offset) : applyLayout(family, translate(positions, offset))]
  })
  // Le note ancorate seguono i loro elementi, dopo che tutte le famiglie hanno scritto (spec 3a §6).
  const follow = followAnchors(doc)
  if (follow) recipes.push(follow)
  if (recipes.length === 0) return null
  return (draft) => {
    for (const recipe of recipes) recipe(draft)
  }
}
