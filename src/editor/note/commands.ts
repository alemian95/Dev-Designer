import type { DevDocument } from "@/model/document"
import type { LayoutGraph, LayoutNode } from "@/model/layout"
import type { NoteModel } from "@/model/note/schema"
import type { Recipe } from "../document-store"
import { snap, type Point } from "../geometry"
import { isAnchored, noteDiagram } from "../note-access"
import { noteSize } from "./geometry"

const DUPLICATE_OFFSET = 20

/**
 * Nuova nota vuota e libera. La chiave è un uuid e non deriva dal testo: il testo cambia a ogni
 * battitura, e una chiave che lo segue farebbe di ogni carattere una rinomina.
 */
export function addNote(at: Point): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const d = noteDiagram(draft)
      d.model.notes[key] = { text: "", anchor: null }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

export function setNoteText(key: string, text: string): Recipe {
  return (draft) => {
    const note = noteDiagram(draft).model.notes[key]
    // Si scrive solo se cambia davvero: riaprire e richiudere l'editor senza toccare niente
    // lascerebbe altrimenti una voce di undo fantasma.
    if (note && note.text !== text) note.text = text
  }
}

/** Stacca le note dal loro elemento: restano dove sono, libere (spec 3a §5). Una nota già libera, o che non c'è, non scrive niente. */
export function detachNotes(keys: readonly string[]): Recipe {
  return (draft) => {
    const notes = noteDiagram(draft).model.notes
    for (const key of keys) {
      const note = notes[key]
      if (note && note.anchor !== null) note.anchor = null
    }
  }
}

/**
 * Elimina le note in `nodeKeys` e stacca quelle in `edgeKeys`: la linea di ancoraggio ha la chiave
 * della sua nota, e cancellare la linea vuol dire staccare la nota, non eliminarla (spec 3a §5).
 */
export function deleteNoteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null {
  if (nodeKeys.length === 0 && edgeKeys.length === 0) return null
  const detach = detachNotes(edgeKeys)
  return (draft) => {
    detach(draft)
    const d = noteDiagram(draft)
    for (const key of nodeKeys) {
      delete d.model.notes[key]
      delete d.view.nodes[key]
    }
  }
}

/** Copia le note con un uuid nuovo e lo scarto di sempre. La copia tiene l'àncora dell'originale (spec 3a §10). */
export function duplicateNotes(model: NoteModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const plan = keys.filter((k) => k in model.notes).map((from) => ({ from, to: crypto.randomUUID() }))
  return {
    keys: plan.map((p) => p.to),
    recipe: (draft) => {
      const d = noteDiagram(draft)
      for (const { from, to } of plan) {
        const note = d.model.notes[from]
        const view = d.view.nodes[from]
        if (!note) continue
        d.model.notes[to] = { ...note }
        d.view.nodes[to] = { x: (view?.x ?? 0) + DUPLICATE_OFFSET, y: (view?.y ?? 0) + DUPLICATE_OFFSET, collapsed: false }
      }
    },
  }
}

/**
 * Il grafo da disporre: solo le note libere, e quelle con l'àncora pendente, che per Disponi valgono
 * come libere (spec 3a §6). Nessun arco: le note libere non sono legate fra loro. Le note ancorate
 * restano fuori: seguono il loro elemento.
 */
export function noteLayoutGraph(doc: DevDocument): LayoutGraph {
  const d = noteDiagram(doc)
  const nodes: LayoutNode[] = Object.entries(d.model.notes).flatMap(([key, note]) =>
    d.view.nodes[key] && !isAnchored(doc, note) ? [{ id: key, ...noteSize(note) }] : [],
  )
  return { nodes, edges: [], direction: "DOWN" }
}
