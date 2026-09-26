import type { DevDocument } from "@/model/document"
import type { Family } from "@/model/family"
import type { Issue } from "@/model/issue"
import type { LayoutGraph, LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import type { EdgeEnds, EdgeGeometry } from "../edge-routing"
import type { Point, Rect } from "../geometry"
import { classOps } from "./class"
import { erOps } from "./er"
import { flowOps } from "./flow"
import { noteOps } from "./note"

// `EdgeEnds` sta in `edge-routing.ts`, dove `edgeOffsets` lo consuma; qui si ri-esporta perché è
// il tipo di ritorno di `edgesTouching` e i chiamanti lo importano dal contratto.
export type { EdgeEnds }

/** Dove va il fuoco dopo la creazione: l'header (`name`) o l'editor di testo sul corpo (`body`). */
export type EditTarget = "name" | "body"

/**
 * Contratto che ogni tipo di diagramma rispetta. Il canvas e le azioni condivise ci parlano
 * attraverso: non sanno cos'è un nodo o un arco per un tipo specifico, solo questi metodi.
 */
export interface DiagramOps {
  nodeKeys(): string[]
  /**
   * Chiavi di elementi che contengono nodi ma non sono nodi: i pool del flowchart (spec 2b §5). Si
   * selezionano, si trascinano e si eliminano come nodi, `rectOf` ne dà il rettangolo, ma non
   * entrano nella selezione a riquadro, in «Seleziona tutto» né nei collegamenti. Assente: nessuno.
   */
  frameKeys?(): string[]
  /** Le chiavi date più i nodi che un drag delle chiavi porta con sé (i nodi di un pool). Assente: le chiavi date. */
  withFollowers?(keys: readonly string[]): string[]
  /**
   * Il motivo per cui `addNode` non va chiamato in quel punto, o `null`. Si chiede **prima** di
   * creare, come `connectAcross` prima di collegare: un pool non nasce dentro un altro pool.
   * Assente: niente è mai rifiutato.
   */
  refuseNode?(at: Point, variant?: string): string | null
  /** `at` sovrascrive la posizione: serve all'anteprima del drag. */
  rectOf(key: string, at?: Point): Rect | null
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
  /**
   * Crea un nodo. `variant` è una stringa opaca per la giuntura: la dichiara `DiagramView.tools` e
   * la interpreta solo il modulo `kinds/` del tipo che l'ha dichiarata. `edit` dice dove va il
   * fuoco: sostituisce il caso speciale che `addNote` era prima di questo cambiamento. `edit` è
   * `null` quando non c'è niente da scrivere: un pool appena creato si rinomina dal pannello.
   */
  addNode(at: Point, variant?: string): { key: string; recipe: Recipe; edit: EditTarget | null }
  /** `null` quando i due estremi non possono essere collegati. */
  addEdge(source: string, target: string): { key: string; recipe: Recipe } | null
  /**
   * Sostituisce la dispatch predefinita `moveNodes(family, keys, dx, dy)` al rilascio del drag, quando c'è.
   * Serve al flowchart, che al commit scrive anche la corsia (spec §6): posizione e corsia in una
   * sola recipe, un solo passo di undo. Durante il gesto non cambia niente — questo non è nel
   * percorso di `pointermove`, solo in quello di rilascio (`interaction-runner.ts`, `commit-drag`).
   */
  commitDrag?(keys: readonly string[], dx: number, dy: number): Recipe | null
  deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
  duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
  layoutGraph(): LayoutGraph
  /**
   * L'ingombro che il blocco avrà dopo `layoutRecipe(positions, …)`, nel sistema di `positions`, per
   * una famiglia che col layout disegna più dei suoi nodi: il flowchart ci mette i pool, anche vuoti
   * (spec 2b §6). `null` se non c'è niente da disporre. Assente: l'ingombro dei nodi.
   */
  layoutBounds?(positions: LayoutPositions): Rect | null
  /**
   * Il rettangolo che l'elemento `key` (un nodo o un frame di questa famiglia, senza prefisso) avrà
   * dopo `layoutRecipe(positions, …)`, nel sistema di `positions`: usato da `layoutAll` per prevedere
   * dove cadrà una nota ancorata a quell'elemento, e includerla nell'ingombro del blocco (spec 3a
   * §10, F1 della review finale — vedi DT-29). `null` se `key` non è nel layout. Assente: il
   * rettangolo si legge dal nodo di `layoutGraph()` con la stessa posizione, come `nodesBounds` —
   * basta per una famiglia senza frame.
   */
  layoutRectOf?(positions: LayoutPositions, key: string): Rect | null
  /**
   * Sostituisce la dispatch predefinita `applyLayout(family, positions + offset)` quando c'è. Serve al
   * flowchart, che col layout riscrive anche pool e corsie: due dispatch darebbero due passi di undo.
   * `offset` è la traslazione che l'impacchettamento dà al blocco (`packBlocks`): vale per tutto ciò
   * che la recipe dispone, pool compresi, anche quando non c'è nessun nodo da cui ricavarla.
   */
  layoutRecipe?(positions: LayoutPositions, offset: Point): Recipe
  /**
   * Il ridimensionamento di un frame da una sua maniglia (spec 2b §5): `lane` è `null` per il bordo
   * destro del pool, l'id di una corsia per il suo bordo inferiore. Torna il rettangolo da mostrare
   * come guida durante il gesto e la recipe da applicare al rilascio, calcolati con la stessa regola;
   * `null` se la maniglia non appartiene al frame. Assente: niente si ridimensiona.
   */
  resize?(key: string, lane: string | null, dx: number, dy: number): { rect: Rect; recipe: Recipe } | null
  validate(): Issue[]
}

/** Le `DiagramOps` di una famiglia del documento, chiuse sullo snapshot. Chiavi senza prefisso. */
export function familyOps(doc: DevDocument, family: Family): DiagramOps {
  switch (family) {
    case "er":
      return erOps(doc)
    case "class":
      return classOps(doc)
    case "flow":
      return flowOps(doc)
    case "note":
      return noteOps(doc)
  }
}
