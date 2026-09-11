import { validateClass } from "@/model/class/validate"
import type { DevDocument } from "@/model/document"
import type { Issue } from "@/model/issue"
import type { LayoutGraph } from "@/model/layout"
import { classDiagram } from "../class-access"
import {
  addClass,
  addRelation,
  classLayoutGraph,
  deleteClassItems,
  duplicateClasses,
} from "../class/commands"
import { classEdgeGeometry, classRect, noteRect } from "../class/geometry"
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
      const rel = diagram().model.relations[key]
      return rel ? classEdgeGeometry(a, b, rel) : null
    },

    addNode: (at) => addClass(diagram().model.classes, at),

    addEdge: (source, target) => addRelation(diagram().model.relations, source, target),

    deleteItems: (nodeKeys, edgeKeys) => {
      const notes = diagram().model.notes
      const noteKeys = nodeKeys.filter((k) => k in notes)
      const classKeys = nodeKeys.filter((k) => !(k in notes))
      return deleteClassItems(classKeys, edgeKeys, noteKeys)
    },

    duplicateNodes: (keys) => duplicateClasses(diagram().model, keys),

    // Le note restano fuori dal grafo: non hanno archi, e ELK le piazzerebbe lontano da ciò che
    // annotano. «Disponi» le lascia dove sono — il prezzo dichiarato di non averle ancorate (§4).
    layoutGraph: (): LayoutGraph => classLayoutGraph(diagram()),

    validate: (): Issue[] => validateClass(diagram().model),
  }
}
