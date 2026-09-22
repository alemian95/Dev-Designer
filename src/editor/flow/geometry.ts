import type { FlowDiagram, FlowNode, FlowShape } from "@/model/flow/schema"
import type { NodeView } from "@/model/shared"
import { notePath } from "../class/geometry"
import { CHAR_W, PAD_X, ROW_H, type Rect, type Size } from "../geometry"

/**
 * Un rombo che deve contenere il rettangolo `w × h` del testo di un processo omologo ha bisogno di
 * `2w × 2h` (spec §7): il punto medio di ogni lato del rombo è a metà della sua diagonale, quindi
 * dimezzare il fattore vorrebbe dire che il rettangolo di testo esce dai lati obliqui. Non è una
 * scelta di stile — è la ragione per cui nei flowchart le decisioni si scrivono corte.
 */
export const DECISION_FACTOR = 2

/** Dimensione minima di un nodo appena creato, con etichetta vuota: deve restare afferrabile, non
 *  sparire in un punto. */
const MIN_NODE_W = 60
const MIN_NODE_H = 40

/**
 * Dimensione di un nodo dalla sua etichetta, sulla falsariga di `noteSize` (`class/geometry.ts`):
 * larghezza dalla riga più lunga, altezza dal numero di righe. `decision` raddoppia entrambe le
 * misure con `DECISION_FACTOR` **dopo** aver applicato i minimi, così anche un rombo vuoto resta
 * un rombo — non un punto — e non solo il rettangolo che conterrebbe.
 */
export function flowNodeSize(node: FlowNode): Size {
  const lines = node.label.split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  const w = Math.max(MIN_NODE_W, Math.ceil(chars * CHAR_W + 2 * PAD_X))
  const h = Math.max(MIN_NODE_H, lines.length * ROW_H)
  return node.shape === "decision" ? { w: w * DECISION_FACTOR, h: h * DECISION_FACTOR } : { w, h }
}

export function flowNodeRect(node: FlowNode, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...flowNodeSize(node) }
}

/** Inclinazione fissa del parallelogramma dell'`io`: non proporzionale a `w`, altrimenti un nodo
 *  largo diventerebbe più obliquo di uno stretto invece di restare la stessa forma ingrandita. */
const IO_SKEW = 16

/** Scarto delle due barre verticali del `subprocess` dai lati del rettangolo. */
const SUBPROCESS_BAR_OFFSET = 8

/**
 * L'attributo `d` di un `<path>` per una forma, in coordinate locali (origine in alto a sinistra,
 * come `notePath`): chi disegna applica `translate(x y)` sul nodo, non su questo path.
 *
 * `subprocess` e `note` tornano più di un sottopercorso nello stesso `d` — due barre verticali
 * aperte, o il contorno con l'angolo tagliato: un sottopercorso aperto non riempie nulla (area
 * nulla), quindi convive nello stesso path di uno chiuso senza sporcare il riempimento.
 */
export function shapePath(shape: FlowShape, w: number, h: number): string {
  switch (shape) {
    case "terminal": {
      // Stadio: rettangolo a estremi arrotondati. Il raggio è mezza altezza — o mezza larghezza,
      // se il nodo è più stretto che alto — altrimenti i due archi si accavallerebbero.
      const r = Math.min(w, h) / 2
      return `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 ${r} 0 Z`
    }
    case "process":
      return `M0 0 H${w} V${h} H0 Z`
    case "decision":
      // Il rombo: la punta di ogni lato cade sul punto medio del rettangolo di ingombro — è la
      // proprietà che la spec §8 sfrutta per l'aggancio degli archi senza codice in più.
      return `M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`
    case "io":
      return `M${IO_SKEW} 0 L${w} 0 L${w - IO_SKEW} ${h} L0 ${h} Z`
    case "subprocess": {
      const o = SUBPROCESS_BAR_OFFSET
      return `M0 0 H${w} V${h} H0 Z M${o} 0 V${h} M${w - o} 0 V${h}`
    }
    case "note":
      // Solo il contorno (`body`): il taglio diagonale dell'angolo è già nel perimetro, quindi la
      // forma «riquadro con angolo ripiegato» non serve il triangolo di `fold` separato — quello
      // è un dettaglio di resa a due tinte che spetta al componente che disegna, non alla geometria.
      return notePath(w, h).body
  }
}

/**
 * La corsia che contiene `y`, o `null` fuori da ogni banda.
 *
 * Il confronto è chiuso sopra e aperto sotto, così il confine fra due bande appartiene a quella di
 * sotto e non a entrambe: nessun buco, nessuna doppia appartenenza. Fuori da ogni banda torna
 * `null` invece di agganciare alla più vicina — indovinare qui vorrebbe dire decidere al posto di
 * chi chiama, che sa se sta creando un nodo (allora la prima corsia) o trascinandone uno (allora
 * quella di partenza).
 */
export function laneAt(diagram: FlowDiagram, y: number): string | null {
  for (const lane of diagram.model.lanes) {
    const band = diagram.view.lanes[lane.id]
    if (band && y >= band.y && y < band.y + band.h) return lane.id
  }
  return null
}
