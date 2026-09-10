import { entityKey, type Attribute, type Entity, type ErModel, type Relationship } from "@/model/er/schema"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { snap, type Point } from "../geometry"

export const DEFAULT_ATTRIBUTE: Attribute = {
  name: "id",
  type: "int",
  primaryKey: true,
  foreignKey: false,
  nullable: false,
  unique: false,
}
const NEW_ATTRIBUTE: Attribute = {
  name: "attribute",
  type: "varchar",
  primaryKey: false,
  foreignKey: false,
  nullable: false,
  unique: false,
}
const DUPLICATE_OFFSET = 20

/** `base` se libera, altrimenti `base_2`, `base_3`, … */
export function uniqueKey(existing: Record<string, unknown>, base: string): string {
  if (!(base in existing)) return base
  let i = 2
  while (`${base}_${i}` in existing) i++
  return `${base}_${i}`
}

function uniqueAttributeName(attributes: readonly Attribute[], base: string): string {
  return uniqueKey(Object.fromEntries(attributes.map((a) => [a.name, true])), base)
}

export function addEntity(entities: Record<string, unknown>, at: Point): { key: string; recipe: Recipe } {
  const key = uniqueKey(entities, "entity")
  return {
    key,
    recipe: (draft) => {
      const d = erDiagram(draft)
      d.model.entities[key] = { name: key, attributes: [{ ...DEFAULT_ATTRIBUTE }] }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

/** Rinomina: la chiave naturale cambia, quindi si spostano entità, view e riferimenti delle relazioni. Collisione = no-op. */
export function renameEntity(key: string, name: string, schema?: string): Recipe | null {
  const newName = name.trim()
  if (!newName) return null
  const newSchema = schema?.trim() || undefined
  return (draft) => {
    const d = erDiagram(draft)
    const entity = d.model.entities[key]
    if (!entity) return
    const newKey = entityKey({ name: newName, schema: newSchema })
    if (newKey !== key && newKey in d.model.entities) return
    if (newKey === key) {
      // Assegnare comunque produrrebbe una patch anche a valore identico: su un'entità senza schema
      // `entity.schema = undefined` crea una chiave che nel base non c'è, e Immer la conta come modifica.
      // Il risultato sarebbe una voce di undo fantasma per una rinomina che non rinomina niente.
      if (entity.name !== newName) entity.name = newName
      if (entity.schema !== newSchema) entity.schema = newSchema
      return
    }
    const moved: Entity = { ...entity, name: newName, schema: newSchema }
    delete d.model.entities[key]
    d.model.entities[newKey] = moved
    const view = d.view.nodes[key]
    if (view) {
      delete d.view.nodes[key]
      d.view.nodes[newKey] = { ...view }
    }
    for (const rel of Object.values(d.model.relationships)) {
      if (rel.source.entity === key) rel.source.entity = newKey
      if (rel.target.entity === key) rel.target.entity = newKey
    }
  }
}

export function moveNodes(keys: readonly string[], dx: number, dy: number): Recipe | null {
  if (dx === 0 && dy === 0) return null
  return (draft) => {
    const d = erDiagram(draft)
    for (const key of keys) {
      const node = d.view.nodes[key]
      if (!node) continue
      node.x = snap(node.x + dx)
      node.y = snap(node.y + dy)
    }
  }
}

export function setCollapsed(key: string, collapsed: boolean): Recipe {
  return (draft) => {
    const node = erDiagram(draft).view.nodes[key]
    if (node) node.collapsed = collapsed
  }
}

export function addAttribute(key: string): Recipe {
  return (draft) => {
    const entity = erDiagram(draft).model.entities[key]
    if (!entity) return
    entity.attributes.push({
      ...NEW_ATTRIBUTE,
      name: uniqueAttributeName(entity.attributes, NEW_ATTRIBUTE.name),
    })
  }
}

export function updateAttribute(key: string, index: number, patch: Partial<Attribute>): Recipe | null {
  const name = patch.name?.trim()
  if (patch.name !== undefined && !name) return null
  return (draft) => {
    const attribute = erDiagram(draft).model.entities[key]?.attributes[index]
    if (!attribute) return
    Object.assign(attribute, patch, name !== undefined ? { name } : {})
  }
}

export function removeAttribute(key: string, index: number): Recipe {
  return (draft) => {
    const d = erDiagram(draft)
    const [removed] = d.model.entities[key]?.attributes.splice(index, 1) ?? []
    if (!removed) return
    // Il nome resterebbe dentro `RelationshipEnd.attributes`, dove `validateEr` lo segnala come
    // `dangling-relationship` di gravità error: si pota qui, dov'è che l'attributo scompare. Il
    // confronto include l'entità, o due attributi omonimi di entità diverse si poterebbero a vicenda.
    // Se l'estremo resta vuoto la relazione diventa «disegnata a mano» (ADR 0003) e un re-import non
    // la poterà più: è preferibile a un riferimento pendente, e meglio che cancellarla di nascosto.
    for (const rel of Object.values(d.model.relationships)) {
      for (const end of [rel.source, rel.target]) {
        if (end.entity !== key) continue
        const at = end.attributes.indexOf(removed.name)
        if (at >= 0) end.attributes.splice(at, 1)
      }
    }
  }
}

export function moveAttribute(key: string, from: number, to: number): Recipe | null {
  if (from === to) return null
  return (draft) => {
    const attributes = erDiagram(draft).model.entities[key]?.attributes
    if (!attributes || from < 0 || to < 0 || from >= attributes.length || to >= attributes.length) return
    const [item] = attributes.splice(from, 1)
    attributes.splice(to, 0, item!)
  }
}

export function addRelationship(
  relationships: Record<string, unknown>,
  sourceKey: string,
  targetKey: string,
): { key: string; recipe: Recipe } {
  const key = uniqueKey(relationships, `${sourceKey}_${targetKey}`)
  return {
    key,
    recipe: (draft) => {
      erDiagram(draft).model.relationships[key] = {
        source: { entity: sourceKey, attributes: [], cardinality: "many" },
        target: { entity: targetKey, attributes: [], cardinality: "one" },
        identifying: false,
      }
    },
  }
}

export function updateRelationship(key: string, mutate: (rel: Relationship) => void): Recipe {
  return (draft) => {
    const rel = erDiagram(draft).model.relationships[key]
    if (rel) mutate(rel)
  }
}

export function deleteItems(entityKeys: readonly string[], relationshipKeys: readonly string[]): Recipe | null {
  if (entityKeys.length === 0 && relationshipKeys.length === 0) return null
  const entities = new Set(entityKeys)
  return (draft) => {
    const d = erDiagram(draft)
    for (const key of relationshipKeys) delete d.model.relationships[key]
    for (const [key, rel] of Object.entries(d.model.relationships)) {
      if (entities.has(rel.source.entity) || entities.has(rel.target.entity)) delete d.model.relationships[key]
    }
    for (const key of entityKeys) {
      delete d.model.entities[key]
      delete d.view.nodes[key]
    }
  }
}

/** Copia le entità con suffisso `_copy` e offset; le relazioni non si duplicano. */
export function duplicateEntities(model: ErModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const taken: Record<string, true> = Object.fromEntries(Object.keys(model.entities).map((k) => [k, true]))
  const plan: { from: string; to: string; name: string }[] = []
  for (const from of keys) {
    const entity = model.entities[from]
    if (!entity) continue
    let i = 1
    let name = `${entity.name}_copy`
    while (entityKey({ name, schema: entity.schema }) in taken) name = `${entity.name}_copy${++i}`
    const to = entityKey({ name, schema: entity.schema })
    taken[to] = true
    plan.push({ from, to, name })
  }
  return {
    keys: plan.map((p) => p.to),
    recipe: (draft) => {
      const d = erDiagram(draft)
      for (const { from, to, name } of plan) {
        const entity = d.model.entities[from]
        const view = d.view.nodes[from]
        if (!entity) continue
        d.model.entities[to] = { ...entity, name, attributes: entity.attributes.map((a) => ({ ...a })) }
        d.view.nodes[to] = {
          x: (view?.x ?? 0) + DUPLICATE_OFFSET,
          y: (view?.y ?? 0) + DUPLICATE_OFFSET,
          collapsed: view?.collapsed ?? false,
        }
      }
    },
  }
}
