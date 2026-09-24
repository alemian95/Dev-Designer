import type { DevDocument } from "@/model/document"
import type { Family } from "@/model/family"
import type { LayoutPositions } from "@/model/layout"
import type { NodeView } from "@/model/shared"
import type { Recipe } from "../document-store"
import { snap } from "../geometry"

/** La view di una famiglia: `view.nodes` ha la stessa forma in tutte. */
export function diagramView(doc: DevDocument, family: Family): { nodes: Record<string, NodeView> } {
  return doc.diagram[family].view
}

export function moveNodes(family: Family, keys: readonly string[], dx: number, dy: number): Recipe | null {
  if (dx === 0 && dy === 0) return null
  return (draft) => {
    const d = diagramView(draft, family)
    for (const key of keys) {
      const node = d.nodes[key]
      if (!node) continue
      node.x = snap(node.x + dx)
      node.y = snap(node.y + dy)
    }
  }
}

export function setCollapsed(family: Family, key: string, collapsed: boolean): Recipe {
  return (draft) => {
    const node = diagramView(draft, family).nodes[key]
    if (node) node.collapsed = collapsed
  }
}

/**
 * Scrive le posizioni ricevute nella view della famiglia, in una sola recipe: un ⌘Z rimette tutte quelle di prima.
 *
 * Le coordinate arrivano già nel punto in cui devono cadere — l'origine la decide `packBlocks`
 * (`layout-pack.ts`), che impacchetta i blocchi delle famiglie in fila — qui si scrivono e si
 * allineano alla griglia, come ogni altra posizione dell'app: una posizione fuori griglia si nota al
 * primo trascinamento, che riallinea il nodo di qualche pixel.
 *
 * Le chiavi che nella view non esistono più (l'entità è stata cancellata mentre il worker
 * calcolava) si ignorano: il nodo non si ricrea. Riscrivere lo stesso valore non genera patch —
 * Immer confronta i primitivi — quindi un secondo layout identico non aggiunge una voce di undo.
 */
export function applyLayout(family: Family, positions: LayoutPositions): Recipe {
  return (draft) => {
    const d = diagramView(draft, family)
    // Il nodo si prende qui e non nel ciclo: il filtro «la chiave esiste» e la lettura del nodo sono
    // la stessa domanda, e tenerle insieme la fa rispondere al tipo invece che a un commento.
    const entries = Object.entries(positions).flatMap(([key, p]) => {
      const node = d.nodes[key]
      return node ? [{ node, p }] : []
    })
    if (entries.length === 0) return

    for (const { node, p } of entries) {
      node.x = snap(p.x)
      node.y = snap(p.y)
    }
  }
}
