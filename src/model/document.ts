import * as z from "zod"

/** Versione del formato su disco. Incrementare insieme a una migrazione in migrations.ts. */
export const SCHEMA_VERSION = 1

const Identifier = z.string().min(1)

export const CardinalitySchema = z.enum(["one", "zero-or-one", "many", "zero-or-many"])
export type Cardinality = z.infer<typeof CardinalitySchema>

export const AttributeSchema = z.object({
  name: Identifier,
  /** Tipo nel dialetto d'origine, come stringa. Nessun sistema di tipi unificato. */
  type: z.string(),
  primaryKey: z.boolean(),
  foreignKey: z.boolean(),
  nullable: z.boolean(),
  unique: z.boolean(),
})
export type Attribute = z.infer<typeof AttributeSchema>

export const EntitySchema = z.object({
  name: Identifier,
  schema: Identifier.optional(),
  attributes: z.array(AttributeSchema),
})
export type Entity = z.infer<typeof EntitySchema>

/** Chiave naturale dell'entità: `schema.nome`, o solo `nome`. È la chiave dei record model e view. */
export function entityKey(entity: Pick<Entity, "name" | "schema">): string {
  return entity.schema ? `${entity.schema}.${entity.name}` : entity.name
}

export const RelationshipEndSchema = z.object({
  /** Chiave dell'entità (entityKey). */
  entity: Identifier,
  /** Nomi degli attributi coinvolti; vuoto per relazioni disegnate a mano. */
  attributes: z.array(Identifier),
  cardinality: CardinalitySchema,
})
export type RelationshipEnd = z.infer<typeof RelationshipEndSchema>

export const RelationshipSchema = z.object({
  name: z.string().optional(),
  /** Lato della FK (figlia). */
  source: RelationshipEndSchema,
  /** Lato referenziato (padre). */
  target: RelationshipEndSchema,
  identifying: z.boolean(),
})
export type Relationship = z.infer<typeof RelationshipSchema>

export const ErModelSchema = z
  .object({
    entities: z.record(z.string(), EntitySchema),
    relationships: z.record(z.string(), RelationshipSchema),
  })
  .refine((m) => Object.entries(m.entities).every(([key, e]) => key === entityKey(e)), {
    message: "la chiave di ogni entità deve essere schema.nome",
    path: ["entities"],
  })
export type ErModel = z.infer<typeof ErModelSchema>

export const NodeViewSchema = z.object({ x: z.number(), y: z.number(), collapsed: z.boolean() })
export type NodeView = z.infer<typeof NodeViewSchema>

export const ErViewSchema = z.object({ nodes: z.record(z.string(), NodeViewSchema) })
export type ErView = z.infer<typeof ErViewSchema>

export const ErDiagramSchema = z.object({
  type: z.literal("er"),
  model: ErModelSchema,
  view: ErViewSchema,
})
export type ErDiagram = z.infer<typeof ErDiagramSchema>

/** Flowchart, class e sequence si aggiungono qui nei piani successivi. */
export const DiagramSchema = z.discriminatedUnion("type", [ErDiagramSchema])
export type Diagram = z.infer<typeof DiagramSchema>

export const DocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Identifier,
  name: z.string(),
  diagram: DiagramSchema,
})
/** "Document" collide con il DOM: il documento dell'app si chiama DevDocument. */
export type DevDocument = z.infer<typeof DocumentSchema>
export type ErDocument = DevDocument & { diagram: ErDiagram }

export function createErDocument(name: string, id: string = crypto.randomUUID()): ErDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: { type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } },
  }
}
