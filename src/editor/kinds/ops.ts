import type { DevDocument } from "@/model/document"
import type { Issue } from "@/model/issue"
import type { LayoutGraph } from "@/model/layout"
import type { Recipe } from "../document-store"
import type { EdgeGeometry } from "../edge-routing"
import type { Point, Rect } from "../geometry"
import { classOps } from "./class"
import { erOps } from "./er"

export interface EdgeEnds {
  key: string
  source: string
  target: string
}

/**
 * Contratto che ogni tipo di diagramma rispetta. Il canvas e le azioni condivise ci parlano
 * attraverso: non sanno cos'è un nodo o un arco per un tipo specifico, solo questi metodi.
 * `addNote` è l'unico opzionale: l'ER non ha note e non lo implementa.
 */
export interface DiagramOps {
  nodeKeys(): string[]
  /** `at` sovrascrive la posizione: serve all'anteprima del drag. */
  rectOf(key: string, at?: Point): Rect | null
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
  addNode(at: Point): { key: string; recipe: Recipe }
  /** Terza specie di nodo, oggi solo nel class diagram. Assente dove il tipo non ha note. */
  addNote?(at: Point): { key: string; recipe: Recipe }
  /** `null` quando un estremo non può ricevere una relazione — oggi solo una nota (§4 della spec:
   *  una nota non ha un `..` verso l'elemento che commenta, e uno strumento relazione che la
   *  collegasse produrrebbe un arco che nessun validatore né render sa più trattare). L'ER non ha
   *  note e continua a tornare sempre un valore. */
  addEdge(source: string, target: string): { key: string; recipe: Recipe } | null
  deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
  duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
  layoutGraph(): LayoutGraph
  validate(): Issue[]
}

/** Chiuso sullo snapshot: il chiamante lo ricrea a ogni lettura dello store. */
export function opsFor(doc: DevDocument): DiagramOps {
  switch (doc.diagram.type) {
    case "er":
      return erOps(doc)
    case "class":
      return classOps(doc)
  }
}
