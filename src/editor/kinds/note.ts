import type { DevDocument } from "@/model/document"
import { validateNotes } from "@/model/note/validate"
import { addNote, deleteNoteItems, duplicateNotes, noteLayoutGraph } from "../note/commands"
import { anchorGeometry, noteRect } from "../note/geometry"
import { noteDiagram } from "../note-access"
import type { DiagramOps } from "./ops"

/**
 * `DiagramOps` per le note (spec 3a §3). Una nota è un nodo come gli altri; la sola cosa che la
 * distingue è la linea di ancoraggio, un «arco» con l'altro capo in un'altra famiglia. Qui se ne
 * conosce solo la geometria: quali linee toccano un insieme di chiavi, il gesto Collega e lo stacco a
 * cascata li decide `CanvasOps` con `note/anchor.ts`, perché vede tutte le famiglie.
 */
export function noteOps(doc: DevDocument): DiagramOps {
  const diagram = () => noteDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),

    rectOf: (key, at) => {
      const note = diagram().model.notes[key]
      const view = diagram().view.nodes[key]
      if (!note || !view) return null
      return noteRect(note, at ? { ...view, ...at } : view)
    },

    // L'altro capo di ogni linea sta in un'altra famiglia: le linee le trova `CanvasOps` (`anchorsTouching`).
    edgesTouching: () => [],

    // La linea ha la chiave della sua nota: una nota ne ha al più una (spec 3a §5).
    edgeGeometry: (key, a, b) => (diagram().model.notes[key]?.anchor ? anchorGeometry(a, b) : null),

    addNode: (at) => ({ ...addNote(at), edit: "body" }),

    // Due note non si collegano, e l'ancoraggio passa da `CanvasOps.addEdge` (`anchorNote`).
    addEdge: () => null,

    deleteItems: (nodeKeys, edgeKeys) => deleteNoteItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateNotes(diagram().model, keys),

    layoutGraph: () => noteLayoutGraph(doc),

    validate: () => validateNotes(doc),
  }
}
