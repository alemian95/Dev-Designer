import type { DevDocument } from "@/model/document"
import type { Entity, ErDiagram, Relationship } from "@/model/er/schema"
import type { LayoutGraph, LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { rectsBounds, snap, type Point } from "../geometry"
import { nodeRects } from "../kinds/canvas-ops"
import { nodesBounds } from "../layout-pack"
import { uniqueKey } from "./er"
import { GUTTER, placeNew } from "./import"
import { layoutGraph } from "./layout"

/** Cosa succede a un'entità in arrivo, rispetto al documento (spec §7): lo mostra il dialog. */
export type ImportFate = "nuovo" | "sostituisce" | "identico"

/** Uguaglianza campo per campo: `JSON.stringify` dipenderebbe dall'ordine delle chiavi, che il DDL e Mermaid producono diverso. */
export function sameEntity(a: Entity, b: Entity): boolean {
  return (
    a.name === b.name &&
    a.schema === b.schema &&
    a.attributes.length === b.attributes.length &&
    a.attributes.every((x, i) => {
      const y = b.attributes[i]!
      return x.name === y.name && x.type === y.type && x.primaryKey === y.primaryKey && x.foreignKey === y.foreignKey &&
        x.nullable === y.nullable && x.unique === y.unique
    })
  )
}

/** Due relazioni dicono la stessa cosa (spec §5): estremi, colonne, cardinalità, nome e `identifying`. Gli agganci non contano. */
export function sameRelationship(a: Relationship, b: Relationship): boolean {
  const sameEnd = (x: Relationship["source"], y: Relationship["source"]) =>
    x.entity === y.entity && x.cardinality === y.cardinality && x.attributes.join() === y.attributes.join()
  return sameEnd(a.source, b.source) && sameEnd(a.target, b.target) && a.name === b.name && a.identifying === b.identifying
}

export function erImportFates(doc: DevDocument, entities: Readonly<Record<string, Entity>>): Record<string, ImportFate> {
  const present = erDiagram(doc).model.entities
  return Object.fromEntries(
    Object.entries(entities).map(([key, e]) => {
      const old = present[key]
      return [key, old === undefined ? "nuovo" : sameEntity(old, e) ? "identico" : "sostituisce"]
    }),
  )
}

/**
 * Le sole entità scelte e le relazioni i cui estremi sono tutti scelti o già nel documento
 * (spec §7): una relazione verso un'entità né importata né presente sarebbe pendente.
 */
export function selectErFragment(
  entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[], chosen: ReadonlySet<string>,
  present: ReadonlySet<string>,
): { entities: Record<string, Entity>; relationships: Relationship[] } {
  const picked = Object.fromEntries(Object.entries(entities).filter(([key]) => chosen.has(key)))
  const reachable = (key: string) => key in picked || present.has(key)
  return { entities: picked, relationships: relationships.filter((r) => reachable(r.source.entity) && reachable(r.target.entity)) }
}

export interface ErPlacement {
  positions: Record<string, Point>
  /** Il messaggio del ripiego sulla griglia, se c'è stato. */
  fallback: string | null
}

/**
 * Le posizioni delle entità **nuove** (spec §6): ELK sul solo frammento, con il grafo di «Disponi»,
 * poi il blocco sotto tutto ciò che è già sul canvas, con l'origine di `placeNew`. Se il motore
 * fallisce si ripiega sulla griglia di `placeNew`. Il motore è iniettato: `editor` non importa `io`.
 */
export async function placeErImport(
  doc: DevDocument, entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[],
  layout: (g: LayoutGraph) => Promise<LayoutPositions>,
): Promise<ErPlacement> {
  const diagram = erDiagram(doc)
  const fresh = Object.keys(entities).filter((key) => !(key in diagram.view.nodes))
  if (fresh.length === 0) return { positions: {}, fallback: null }
  const freshSet = new Set(fresh)

  const temporary: ErDiagram = {
    model: {
      entities: Object.fromEntries(fresh.map((key) => [key, entities[key]!])),
      relationships: Object.fromEntries(
        relationships.filter((r) => freshSet.has(r.source.entity) && freshSet.has(r.target.entity)).map((r, i) => [String(i), r]),
      ),
    },
    view: { nodes: Object.fromEntries(fresh.map((key) => [key, { x: 0, y: 0, collapsed: false }])) },
  }
  const graph = layoutGraph(temporary)
  const occupied = nodeRects(doc)

  let raw: LayoutPositions
  try {
    raw = graph.nodes.length > 1 ? await layout(graph) : { [fresh[0]!]: { x: 0, y: 0 } }
  } catch {
    return {
      positions: placeNew(temporary.model.entities, diagram, occupied),
      fallback: "La disposizione automatica non è riuscita: le entità nuove sono in griglia.",
    }
  }
  const block = nodesBounds(graph.nodes, raw)!
  const bounds = rectsBounds(occupied)
  const origin = bounds ? { x: bounds.x, y: bounds.y + bounds.h + GUTTER } : { x: GUTTER, y: GUTTER }
  const positions = Object.fromEntries(
    Object.entries(raw).map(([key, p]) => [key, { x: snap(origin.x + p.x - block.x), y: snap(origin.y + p.y - block.y) }]),
  )
  return { positions, fallback: null }
}

/**
 * Innesta un frammento ER letto da Mermaid (spec §5), in un solo comando. Un'entità presente viene
 * sostituita e tiene il suo nodo; una nuova prende la posizione da `positions`. Una relazione
 * uguale a una già presente si salta, e nessuna si pota: a differenza di `importEr`, qui le
 * relazioni non vengono da una FK e non ce n'è una derivata da rimpiazzare (ADR 0003).
 */
export function importMermaidEr(
  entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[], positions: Readonly<Record<string, Point>>,
): Recipe {
  return (draft) => {
    const d = erDiagram(draft)
    for (const [key, entity] of Object.entries(entities)) {
      d.model.entities[key] = entity
      const pos = positions[key]
      if (pos && !(key in d.view.nodes)) d.view.nodes[key] = { ...pos, collapsed: false }
    }
    for (const rel of relationships) {
      if (Object.values(d.model.relationships).some((old) => sameRelationship(old, rel))) continue
      d.model.relationships[uniqueKey(d.model.relationships, `${rel.source.entity}_${rel.target.entity}`)] = rel
    }
  }
}
