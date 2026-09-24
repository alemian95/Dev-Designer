import type { DevDocument } from "@/model/document"
import { FAMILIES, type Family } from "@/model/family"
import type { LayoutGraph, LayoutNode, LayoutPositions } from "@/model/layout"
import { applyLayout } from "./commands/view"
import type { Recipe } from "./document-store"
import { familyHasContent } from "./kinds/canvas-ops"
import { familyOps } from "./kinds/ops"

/** Distanza dall'origine del risultato: un diagramma appiccicato al bordo (0, 0) si legge male. */
export const LAYOUT_MARGIN = 40

/** Spazio fra il blocco di una famiglia e il successivo. */
export const LAYOUT_FAMILY_GAP = 120

/** Il risultato del layout di una famiglia: le sue posizioni, e gli ingombri che danno la larghezza del blocco. */
export interface Block {
  family: Family
  nodes: LayoutNode[]
  positions: LayoutPositions
}

/**
 * Mette i blocchi in fila da sinistra a destra, nell'ordine dato, allineati in alto (spec §7).
 * Ogni blocco si trasla in modo che il suo angolo in alto a sinistra cada al punto che gli spetta:
 * il primo in `(LAYOUT_MARGIN, LAYOUT_MARGIN)`, i successivi dopo il bordo destro del precedente più
 * `LAYOUT_FAMILY_GAP`. Funzione pura: le posizioni non si allineano alla griglia, lo fa chi le scrive.
 */
export function packBlocks(blocks: readonly Block[]): Map<Family, LayoutPositions> {
  const out = new Map<Family, LayoutPositions>()
  let left = LAYOUT_MARGIN
  for (const block of blocks) {
    const placed = block.nodes.flatMap((n) => {
      const p = block.positions[n.id]
      return p ? [{ id: n.id, p, w: n.w }] : []
    })
    if (placed.length === 0) continue
    const minX = Math.min(...placed.map((n) => n.p.x))
    const minY = Math.min(...placed.map((n) => n.p.y))
    const maxX = Math.max(...placed.map((n) => n.p.x + n.w))
    out.set(block.family, Object.fromEntries(placed.map((n) => [n.id, { x: n.p.x - minX + left, y: n.p.y - minY + LAYOUT_MARGIN }])))
    left += maxX - minX + LAYOUT_FAMILY_GAP
  }
  return out
}

/**
 * Il layout di tutte le famiglie con contenuto, in una recipe sola (spec §7). Ogni famiglia va al
 * motore con la sua direzione (ADR 0007); una famiglia di un nodo solo non ci va, e il nodo viene
 * solo traslato. Le chiamate partono in parallelo e **tutto o niente**: se una fallisce, la promise
 * rifiuta e non si applica niente. Il motore è iniettato: `editor` non può importare `io`.
 */
export async function layoutAll(doc: DevDocument, layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<Recipe | null> {
  const families = FAMILIES.filter((f) => familyHasContent(doc, f))
  const blocks: Block[] = await Promise.all(
    families.map(async (family) => {
      const graph = familyOps(doc, family).layoutGraph()
      const positions = graph.nodes.length > 1 ? await layout(graph) : Object.fromEntries(graph.nodes.map((n) => [n.id, { x: 0, y: 0 }]))
      return { family, nodes: graph.nodes, positions }
    }),
  )
  const recipes = [...packBlocks(blocks)].map(([family, positions]) => {
    const ops = familyOps(doc, family)
    return ops.layoutRecipe ? ops.layoutRecipe(positions) : applyLayout(family, positions)
  })
  if (recipes.length === 0) return null
  return (draft) => {
    for (const recipe of recipes) recipe(draft)
  }
}
