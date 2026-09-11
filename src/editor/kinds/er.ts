import { validateEr } from "@/model/er/validate"
import type { DevDocument } from "@/model/document"
import type { Issue } from "@/model/issue"
import type { LayoutGraph } from "@/model/layout"
import { addEntity, addRelationship, deleteItems, duplicateEntities } from "../commands/er"
import { layoutGraph } from "../commands/layout"
import { edgeGeometry } from "../edge-routing"
import { erDiagram } from "../er-access"
import { entityRect } from "../er/geometry"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * `DiagramOps` per il diagramma ER: cablaggio verso i comandi che esistono già in
 * `commands/er.ts` e `commands/layout.ts`. Nessuna logica nuova qui.
 */
export function erOps(doc: DevDocument): DiagramOps {
  const diagram = () => erDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),

    rectOf: (key, at) => {
      const entity = diagram().model.entities[key]
      const view = diagram().view.nodes[key]
      if (!entity || !view) return null
      return entityRect(entity, at ? { ...view, ...at } : view)
    },

    edgesTouching: (keys): EdgeEnds[] =>
      Object.entries(diagram().model.relationships)
        .filter(([, rel]) => keys.has(rel.source.entity) || keys.has(rel.target.entity))
        .map(([key, rel]) => ({ key, source: rel.source.entity, target: rel.target.entity })),

    edgeGeometry: (key, a, b) => {
      const rel = diagram().model.relationships[key]
      return rel ? edgeGeometry(a, b, rel) : null
    },

    addNode: (at) => addEntity(diagram().model.entities, at),

    addEdge: (source, target) => addRelationship(diagram().model.relationships, source, target),

    deleteItems: (nodeKeys, edgeKeys) => deleteItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateEntities(diagram().model, keys),

    layoutGraph: (): LayoutGraph => layoutGraph(diagram()),

    validate: (): Issue[] => validateEr(diagram().model),
  }
}
