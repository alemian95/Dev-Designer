import { validateClass } from "@/model/class/validate"
import type { DevDocument } from "@/model/document"
import type { Issue } from "@/model/issue"
import type { LayoutGraph } from "@/model/layout"
import { classDiagram } from "../class-access"
import {
  addClass,
  addNote,
  addNoteLink,
  addRelation,
  classLayoutGraph,
  deleteClassItems,
  duplicateClasses,
} from "../class/commands"
import { classEdgeGeometry, classEdgeOffsets, classRect, noteRect } from "../class/geometry"
import type { EdgeGeometry } from "../edge-routing"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * `DiagramOps` per il diagramma di classi: cablaggio verso i comandi in `class/commands.ts` e la
 * geometria in `class/geometry.ts`. Nessuna logica nuova qui: anche `edgeGeometry` è solo un
 * passamano verso `classEdgeGeometry` (`class/geometry.ts`), che compone la stessa geometria usata
 * dal render statico in `ClassEdgeView`.
 */
export function classOps(doc: DevDocument): DiagramOps {
  const diagram = () => classDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),

    rectOf: (key, at) => {
      const view = diagram().view.nodes[key]
      if (!view) return null
      const at_ = at ? { ...view, ...at } : view
      const cls = diagram().model.classes[key]
      if (cls) return classRect(cls, at_)
      // `view.nodes` è lo spazio di chiavi condiviso fra classi e note (§4 della spec): una chiave
      // che non è una classe può essere una nota, e solo qui si sa quale delle due.
      const note = diagram().model.notes[key]
      return note ? noteRect(note, at_) : null
    },

    edgesTouching: (keys): EdgeEnds[] =>
      Object.entries(diagram().model.relations)
        .filter(([, rel]) => keys.has(rel.source.class) || keys.has(rel.target.class))
        .map(([key, rel]) => ({ key, source: rel.source.class, target: rel.target.class })),

    edgeGeometry: (key, a, b): EdgeGeometry | null => {
      const model = diagram().model
      const rel = model.relations[key]
      return rel ? classEdgeGeometry(a, b, rel, classEdgeOffsets(model.relations).get(key) ?? 0) : null
    },

    addNode: (at, variant) =>
      variant === "note"
        ? { ...addNote(at), edit: "body" }
        : { ...addClass(diagram().model.classes, at), edit: "name" },

    // Una nota non può essere estremo di una relazione fra classi, ma può esserlo di un
    // **ancoraggio**: è il gesto con cui si dichiara la classe che commenta. `addNoteLink`
    // normalizza la direzione e torna `null` per nota → nota, che resta senza effetto come prima.
    addEdge: (source, target) => {
      const model = diagram().model
      if (source in model.notes || target in model.notes) return addNoteLink(model, source, target)
      return addRelation(model.relations, source, target)
    },

    // Ciascuna delle due specie si riconosce dalla propria mappa, non per esclusione dall'altra:
    // `rectOf` qui sopra usa già il pattern giusto, e una chiave che non fosse né classe né nota
    // finirebbe altrimenti fra le classi. Oggi non può succedere — le chiavi vengono da `nodeKeys()`,
    // che enumera `view.nodes` — ma dedurre per esclusione è vero solo finché le specie restano due.
    deleteItems: (nodeKeys, edgeKeys) => {
      const { classes, notes } = diagram().model
      const noteKeys = nodeKeys.filter((k) => k in notes)
      const classKeys = nodeKeys.filter((k) => k in classes)
      return deleteClassItems(classKeys, edgeKeys, noteKeys)
    },

    duplicateNodes: (keys) => duplicateClasses(diagram().model, keys),

    // Il grafo da disporre — classi, note e i loro archi — è tutto in `classLayoutGraph`, che ha
    // già il docblock per il perché.
    layoutGraph: (): LayoutGraph => classLayoutGraph(diagram()),

    validate: (): Issue[] => validateClass(diagram().model),
  }
}
