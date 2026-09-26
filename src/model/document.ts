import * as z from "zod"
import { ClassDiagramSchema, emptyClassDiagram } from "./class/schema"
import { emptyErDiagram, ErDiagramSchema } from "./er/schema"
import { emptyFlowDiagram, FlowDiagramSchema } from "./flow/schema"
import { LinksSchema } from "./links/schema"
import { emptyNoteDiagram, NoteDiagramSchema } from "./note/schema"
import { emptyShapeDiagram, ShapeDiagramSchema } from "./shape/schema"
import { Identifier, SCHEMA_VERSION } from "./shared"

/**
 * Il contenuto di un documento: una parte per famiglia e la parte dei collegamenti fra famiglie,
 * sempre presenti (spec 2a §3, spec 4a §3). Una parte senza elementi è vuota, non un campo mancante.
 */
export const DiagramSchema = z.object({
  shape: ShapeDiagramSchema,
  er: ErDiagramSchema,
  class: ClassDiagramSchema,
  flow: FlowDiagramSchema,
  note: NoteDiagramSchema,
  links: LinksSchema,
})
export type Diagram = z.infer<typeof DiagramSchema>

export const DocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Identifier,
  name: z.string(),
  diagram: DiagramSchema,
})
/** "Document" collide con il DOM: il documento dell'app si chiama DevDocument. */
export type DevDocument = z.infer<typeof DocumentSchema>

/** Il solo modo di creare un documento: cinque famiglie vuote e nessun collegamento. */
export function createDocument(name: string, id: string = crypto.randomUUID()): DevDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: { shape: emptyShapeDiagram(), er: emptyErDiagram(), class: emptyClassDiagram(), flow: emptyFlowDiagram(), note: emptyNoteDiagram(), links: {} },
  }
}
