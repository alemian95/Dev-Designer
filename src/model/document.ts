import * as z from "zod"
import { ClassDiagramSchema, emptyClassDiagram } from "./class/schema"
import { emptyErDiagram, ErDiagramSchema } from "./er/schema"
import { emptyFlowDiagram, FlowDiagramSchema } from "./flow/schema"
import { Identifier, SCHEMA_VERSION } from "./shared"

/**
 * Il contenuto di un documento: una parte per famiglia, sempre presenti (spec §3). Una famiglia
 * senza elementi ha la sua parte vuota, non un campo mancante.
 */
export const DiagramSchema = z.object({ er: ErDiagramSchema, class: ClassDiagramSchema, flow: FlowDiagramSchema })
export type Diagram = z.infer<typeof DiagramSchema>

export const DocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Identifier,
  name: z.string(),
  diagram: DiagramSchema,
})
/** "Document" collide con il DOM: il documento dell'app si chiama DevDocument. */
export type DevDocument = z.infer<typeof DocumentSchema>

/** Il solo modo di creare un documento: tre parti vuote. */
export function createDocument(name: string, id: string = crypto.randomUUID()): DevDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: { er: emptyErDiagram(), class: emptyClassDiagram(), flow: emptyFlowDiagram() },
  }
}
