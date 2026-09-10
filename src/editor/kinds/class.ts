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
import { classRect, umlMarkerPath } from "../class/geometry"
import { pathFromPoints, routeEdge, type EdgeGeometry } from "../edge-routing"
import type { DiagramOps, EdgeEnds } from "./ops"

/** Offset dal bordo lungo l'edge a cui piazzare l'etichetta di molteplicità, sullo stesso lato del marker. */
const END_LABEL_OFFSET = 14

/**
 * `DiagramOps` per il diagramma di classi: cablaggio verso i comandi in `class/commands.ts` e la
 * geometria in `class/geometry.ts`. L'unica logica scritta qui è `edgeGeometry`, perché per l'ER
 * quella composizione vive già in `edge-routing.ts` (crow's foot) e qui serve una punta diversa
 * (`umlMarkerPath`) più le etichette di molteplicità, che l'ER non ha.
 */
export function classOps(doc: DevDocument): DiagramOps {
  const diagram = () => classDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),

    rectOf: (key, at) => {
      const cls = diagram().model.classes[key]
      const view = diagram().view.nodes[key]
      if (!cls || !view) return null
      return classRect(cls, at ? { ...view, ...at } : view)
    },

    edgesTouching: (keys): EdgeEnds[] =>
      Object.entries(diagram().model.relations)
        .filter(([, rel]) => keys.has(rel.source.class) || keys.has(rel.target.class))
        .map(([key, rel]) => ({ key, source: rel.source.class, target: rel.target.class })),

    edgeGeometry: (key, a, b): EdgeGeometry | null => {
      const rel = diagram().model.relations[key]
      if (!rel) return null
      const route = routeEdge(a, b)
      const pts = route.points
      const mid = Math.floor((pts.length - 1) / 2)
      const p1 = pts[mid]!
      const p2 = pts[mid + 1]!
      const source = pts[0]!
      const target = pts[pts.length - 1]!
      const geo: EdgeGeometry = {
        d: pathFromPoints(pts),
        // Un solo marker per arco, e cade sempre sul target (schema.ts): la sorgente non ne ha.
        sourceMarker: "",
        targetMarker: umlMarkerPath(target, route.targetDir, rel.kind),
        label: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
      }
      // Solo se almeno una molteplicità non è vuota: altrimenti un'etichetta invisibile finirebbe
      // per essere inseguita a ogni frame del drag da `setEdgeGeometry` (dom-registry) senza motivo.
      if (rel.source.multiplicity || rel.target.multiplicity) {
        geo.sourceEnd = { x: source.x + route.sourceDir.x * END_LABEL_OFFSET, y: source.y + route.sourceDir.y * END_LABEL_OFFSET }
        geo.targetEnd = { x: target.x + route.targetDir.x * END_LABEL_OFFSET, y: target.y + route.targetDir.y * END_LABEL_OFFSET }
      }
      return geo
    },

    addNode: (at) => addClass(diagram().model.classes, at),

    addEdge: (source, target) => addRelation(diagram().model.relations, source, target),

    deleteItems: (nodeKeys, edgeKeys) => deleteClassItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateClasses(diagram().model, keys),

    layoutGraph: (): LayoutGraph => classLayoutGraph(diagram()),

    validate: (): Issue[] => validateClass(diagram().model),
  }
}
