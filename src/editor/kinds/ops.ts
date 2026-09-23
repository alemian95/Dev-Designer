import type { DevDocument } from "@/model/document"
import type { Issue } from "@/model/issue"
import type { LayoutGraph, LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import type { EdgeEnds, EdgeGeometry } from "../edge-routing"
import type { Point, Rect } from "../geometry"
import { classOps } from "./class"
import { erOps } from "./er"
import { flowOps } from "./flow"

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
  /** `at` sovrascrive la posizione: serve all'anteprima del drag. */
  rectOf(key: string, at?: Point): Rect | null
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
  /**
   * Crea un nodo. `variant` è una stringa opaca per la giuntura: la dichiara `DiagramView.tools` e
   * la interpreta solo il modulo `kinds/` del tipo che l'ha dichiarata. `edit` dice dove va il
   * fuoco: sostituisce il caso speciale che `addNote` era prima di questo cambiamento.
   */
  addNode(at: Point, variant?: string): { key: string; recipe: Recipe; edit: EditTarget }
  /** `null` quando i due estremi non possono essere collegati: due note (un ancoraggio ha senso
   *  solo verso una classe), o una classe che non esiste. Una nota **e** una classe producono
   *  invece un ancoraggio (`note-link`, spec note ancorate §4). L'ER non ha note e continua a
   *  tornare sempre un valore. */
  addEdge(source: string, target: string): { key: string; recipe: Recipe } | null
  /**
   * Sostituisce la dispatch predefinita `moveNodes(keys, dx, dy)` al rilascio del drag, quando c'è.
   * Serve al flowchart, che al commit scrive anche la corsia (spec §6): posizione e corsia in una
   * sola recipe, un solo passo di undo. Durante il gesto non cambia niente — questo non è nel
   * percorso di `pointermove`, solo in quello di rilascio (`interaction-runner.ts`, `commit-drag`).
   */
  commitDrag?(keys: readonly string[], dx: number, dy: number): Recipe | null
  deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
  duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
  layoutGraph(): LayoutGraph
  /**
   * Sostituisce la dispatch predefinita `applyLayout(positions)` quando c'è. Serve al flowchart,
   * che col layout riscrive anche le bande: due dispatch darebbero due passi di undo.
   */
  layoutRecipe?(positions: LayoutPositions): Recipe
  validate(): Issue[]
}

/** Chiuso sullo snapshot: il chiamante lo ricrea a ogni lettura dello store. */
export function opsFor(doc: DevDocument): DiagramOps {
  switch (doc.diagram.type) {
    case "er":
      return erOps(doc)
    case "class":
      return classOps(doc)
    case "flow":
      return flowOps(doc)
  }
}
