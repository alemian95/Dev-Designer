import { StereotypeSchema } from "@/model/class/schema"
import { validateClass } from "@/model/class/validate"
import type { DevDocument } from "@/model/document"
import type { Issue } from "@/model/issue"
import type { LayoutGraph } from "@/model/layout"
import { classDiagram } from "../class-access"
import { addClass, addRelation, classLayoutGraph, deleteClassItems, duplicateClasses } from "../class/commands"
import { classEdgeGeometry, classEdgeOffsets, classRect } from "../class/geometry"
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
      return cls ? classRect(cls, at_) : null
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

    addNode: (at, variant) => ({ ...addClass(diagram().model.classes, at, StereotypeSchema.catch("class").parse(variant)), edit: "name" }),

    addEdge: (source, target) => addRelation(diagram().model.relations, source, target),

    deleteItems: (nodeKeys, edgeKeys) => deleteClassItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateClasses(diagram().model, keys),

    layoutGraph: (): LayoutGraph => classLayoutGraph(diagram()),

    validate: (): Issue[] => validateClass(diagram().model),
  }
}
