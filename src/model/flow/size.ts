import { CHAR_W, GRID, MIN_NODE_H, MIN_NODE_W, PAD_X, ROW_H } from "../metrics"
import type { FlowNode } from "./schema"

/**
 * Un rombo che deve contenere il rettangolo `w × h` del testo di un processo omologo ha bisogno di
 * `2w × 2h` (spec §7): il punto medio di ogni lato del rombo è a metà della sua diagonale, quindi
 * dimezzare il fattore vorrebbe dire che il rettangolo di testo esce dai lati obliqui. Non è una
 * scelta di stile — è la ragione per cui nei flowchart le decisioni si scrivono corte.
 */
export const DECISION_FACTOR = 2

/**
 * Dimensione di un nodo dalla sua etichetta, sulla falsariga di `noteSize` (`class/geometry.ts`):
 * larghezza dalla riga più lunga, altezza dal numero di righe. `decision` raddoppia entrambe le
 * misure con `DECISION_FACTOR` **dopo** aver applicato i minimi, così anche un rombo vuoto resta
 * un rombo — non un punto — e non solo il rettangolo che conterrebbe.
 *
 * Sta nel modello (spec 2b §3) perché la usa la migrazione 5 → 6; `editor/flow/geometry.ts` la
 * riesporta. Prende solo etichetta e forma: la corsia non cambia la misura.
 */
export function flowNodeSize(node: Pick<FlowNode, "label" | "shape">): { w: number; h: number } {
  const lines = node.label.split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  // Arrotondata alla griglia come `entitySize`, `classSize` e `noteSize`: il bordo sinistro di un
  // nodo è già sulla griglia (`snap`, alla creazione e al drag), e senza questo arrotondamento
  // quello destro non lo sarebbe.
  const w = Math.max(MIN_NODE_W, Math.ceil((chars * CHAR_W + 2 * PAD_X) / GRID) * GRID)
  const h = Math.max(MIN_NODE_H, lines.length * ROW_H)
  return node.shape === "decision" ? { w: w * DECISION_FACTOR, h: h * DECISION_FACTOR } : { w, h }
}
