import type { DevDocument } from "@/model/document"
import type { LayoutPositions } from "@/model/layout"
import type { NodeView } from "@/model/shared"
import type { Recipe } from "../document-store"
import { snap } from "../geometry"

/** Distanza dall'origine del risultato: un diagramma appiccicato al bordo (0, 0) si legge male. */
const MARGIN = 40

/** La view del diagramma, qualunque sia il tipo: `view.nodes` è la proprietà comune della union e ha la stessa forma nei due membri. */
export function diagramView(doc: DevDocument): { nodes: Record<string, NodeView> } {
  return doc.diagram.view
}

export function moveNodes(keys: readonly string[], dx: number, dy: number): Recipe | null {
  if (dx === 0 && dy === 0) return null
  return (draft) => {
    const d = diagramView(draft)
    for (const key of keys) {
      const node = d.nodes[key]
      if (!node) continue
      node.x = snap(node.x + dx)
      node.y = snap(node.y + dy)
    }
  }
}

export function setCollapsed(key: string, collapsed: boolean): Recipe {
  return (draft) => {
    const node = diagramView(draft).nodes[key]
    if (node) node.collapsed = collapsed
  }
}

/**
 * Scrive le posizioni calcolate nella view, in una sola recipe: un ⌘Z rimette tutte quelle di prima.
 *
 * Le coordinate di ELK partono dalla sua origine e sono float. Qui si traslano perché il risultato
 * parta da `MARGIN` e si allineano alla griglia, come ogni altra posizione dell'app — una posizione
 * fuori griglia si nota al primo trascinamento, che riallinea il nodo di qualche pixel.
 *
 * Le chiavi che nella view non esistono più (l'entità è stata cancellata mentre il worker
 * calcolava) si ignorano: il nodo non si ricrea. Riscrivere lo stesso valore non genera patch —
 * Immer confronta i primitivi — quindi un secondo layout identico non aggiunge una voce di undo.
 */
export function applyLayout(positions: LayoutPositions): Recipe {
  return (draft) => {
    const d = diagramView(draft)
    const entries = Object.entries(positions).filter(([key]) => key in d.nodes)
    if (entries.length === 0) return

    const minX = Math.min(...entries.map(([, p]) => p.x))
    const minY = Math.min(...entries.map(([, p]) => p.y))
    for (const [key, p] of entries) {
      const node = d.nodes[key]
      node.x = snap(p.x - minX + MARGIN)
      node.y = snap(p.y - minY + MARGIN)
    }
  }
}
