import type { ErDiagram } from "@/model/er/schema"
import type { LayoutEdge, LayoutGraph, LayoutNode, LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { entitySize, snap } from "../er-geometry"

/** Distanza dall'origine del risultato: un diagramma appiccicato al bordo (0, 0) si legge male. */
const MARGIN = 40

/**
 * Traduce il diagramma nel grafo da disporre.
 *
 * Le entità senza nodo nella view sono escluse: non sono sul canvas, e dargli una posizione le
 * farebbe comparire dal nulla. Le relazioni con un estremo fuori dal grafo sono saltate, come già
 * fanno i due emettitori — a ELK un arco senza uno dei due estremi fa rifiutare l'intero grafo.
 */
export function layoutGraph(diagram: ErDiagram): LayoutGraph {
  const nodes: LayoutNode[] = []
  for (const [key, entity] of Object.entries(diagram.model.entities)) {
    const view = diagram.view.nodes[key]
    // Un nodo collassato occupa lo spazio che occupa davvero, non quello che occuperebbe aperto.
    if (view) nodes.push({ id: key, ...entitySize(entity, view.collapsed) })
  }

  const present = new Set(nodes.map((n) => n.id))
  const edges: LayoutEdge[] = []
  for (const [key, rel] of Object.entries(diagram.model.relationships)) {
    // Invertito rispetto al modello: là `source` è la figlia (lato della foreign key), e con
    // `direction: DOWN` ELK mette la sorgente sopra. La convenzione scelta vuole i padri in alto
    // (ADR 0006), quindi la sorgente del grafo è il `target` del modello.
    const source = rel.target.entity
    const target = rel.source.entity
    if (present.has(source) && present.has(target)) edges.push({ id: key, source, target })
  }

  // Le relazioni disegnate a mano (`attributes` vuoto, ADR 0003) non sono distinte: sono archi come
  // gli altri, e ignorarle disporrebbe il diagramma senza connessioni che l'utente vede.
  return { nodes, edges }
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
    const d = erDiagram(draft)
    const entries = Object.entries(positions).filter(([key]) => key in d.view.nodes)
    if (entries.length === 0) return

    const minX = Math.min(...entries.map(([, p]) => p.x))
    const minY = Math.min(...entries.map(([, p]) => p.y))
    for (const [key, p] of entries) {
      const node = d.view.nodes[key]
      node.x = snap(p.x - minX + MARGIN)
      node.y = snap(p.y - minY + MARGIN)
    }
  }
}
