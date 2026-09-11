import * as z from "zod"

/** Versione del formato su disco. Incrementare insieme a una migrazione in migrations.ts. */
export const SCHEMA_VERSION = 2

export const Identifier = z.string().min(1)

export const NodeViewSchema = z.object({ x: z.number(), y: z.number(), collapsed: z.boolean() })
export type NodeView = z.infer<typeof NodeViewSchema>
