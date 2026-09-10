import * as z from "zod"
import { Identifier, SCHEMA_VERSION } from "./shared"
import { ErDiagramSchema } from "./er/schema"
import { ClassDiagramSchema } from "./class/schema"

/** Flowchart e sequence si aggiungono qui nei piani successivi. */
export const DiagramSchema = z.discriminatedUnion("type", [ErDiagramSchema, ClassDiagramSchema])
export type Diagram = z.infer<typeof DiagramSchema>

export const DocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Identifier,
  name: z.string(),
  diagram: DiagramSchema,
})
/** "Document" collide con il DOM: il documento dell'app si chiama DevDocument. */
export type DevDocument = z.infer<typeof DocumentSchema>
