import type { DevDocument } from "../document"
import { splitKey } from "../family"
import type { Issue } from "../issue"

/**
 * `true` se l'àncora nomina un elemento che c'è: un'entità, una classe, un nodo di flusso, un pool o
 * una forma (spec 3a §2, spec 3b §3). È la sola definizione: la usano la validazione qui sotto, il
 * gesto Collega (`editor/note/anchor.ts`) e Disponi, che tratta come libera una nota con l'àncora
 * pendente. `anchor` ha già il prefisso di una famiglia: lo garantisce `NoteSchema`, quindi
 * `splitKey` non lancia.
 */
export function anchorExists(doc: DevDocument, anchor: string): boolean {
  const { family, key } = splitKey(anchor)
  const d = doc.diagram
  switch (family) {
    case "er":
      return d.er.model.entities[key] !== undefined
    case "class":
      return d.class.model.classes[key] !== undefined
    case "flow":
      return d.flow.model.nodes[key] !== undefined || d.flow.model.pools[key] !== undefined
    case "shape":
      return d.shape.model.shapes[key] !== undefined
    case "note":
      return false
  }
}

/** I problemi delle note: solo l'àncora pendente (spec 3a §9). `node` è la chiave della nota, senza prefisso. */
export function validateNotes(doc: DevDocument): Issue[] {
  return Object.entries(doc.diagram.note.model.notes).flatMap(([key, note]): Issue[] =>
    note.anchor !== null && !anchorExists(doc, note.anchor)
      ? [{ code: "note-dangling-anchor", severity: "error", node: key, message: "La nota è ancorata a un elemento che non c'è." }]
      : [],
  )
}
