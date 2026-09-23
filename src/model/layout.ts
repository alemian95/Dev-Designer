/**
 * Vocabolario del layout automatico: rettangoli e archi, nient'altro.
 *
 * Sta in `model` perché lo usano due strati che non si vedono fra loro —
 * `editor/commands/layout.ts` lo produce e `io/layout` lo consuma, e ESLint
 * vieta a `editor` di importare `io`. Non descrive nulla che finisca su disco:
 * il documento non memorizza grafi, li ricalcola.
 */

/** Un nodo da disporre: la chiave dell'entità e l'ingombro che ha sul canvas. */
export interface LayoutNode {
  id: string
  w: number
  h: number
}

/** Un arco **già nel verso del layout**: `source` viene prima di `target` lungo la direzione del grafo. */
export interface LayoutEdge {
  id: string
  source: string
  target: string
}

/**
 * Direzione del flusso. Non è una costante del progetto ma una proprietà del tipo di diagramma
 * (ADR 0007): ER e class scendono, il flowchart con corsie va a destra perché le corsie occupano
 * l'asse verticale.
 */
export type LayoutDirection = "DOWN" | "RIGHT"

export interface LayoutGraph {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  direction: LayoutDirection
}

/** Posizioni calcolate, per chiave di entità. Sono le coordinate di ELK, non ancora quelle del canvas. */
export type LayoutPositions = Record<string, { x: number; y: number }>
