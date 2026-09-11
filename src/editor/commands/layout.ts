import type { ErDiagram } from "@/model/er/schema"
import type { LayoutEdge, LayoutGraph, LayoutNode } from "@/model/layout"
import { entitySize } from "../er/geometry"

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
