import * as z from "zod"
import { FAMILIES, inFamily } from "../family"
import { Identifier, NodeViewSchema } from "../shared"

/** `true` se `anchor` è la chiave con prefisso di un elemento di una famiglia che non è `note`. */
const anchorsElsewhere = (anchor: string): boolean => FAMILIES.some((f) => f !== "note" && inFamily(anchor, f))

/**
 * Una nota (spec 3a §3): testo libero, libera (`anchor: null`) o ancorata a **un solo** elemento.
 * `anchor` è la chiave con prefisso dell'elemento (`er/ordini`, `class/Ordine`, `flow/n3`,
 * `flow/<pool>`), come gli estremi di un collegamento: l'àncora attraversa le famiglie per
 * definizione. Lo schema rifiuta un'àncora senza famiglia o nella famiglia `note`, e **non**
 * controlla che l'elemento esista: un'àncora pendente è un problema di validazione
 * (`note-dangling-anchor`), non un file illeggibile.
 */
export const NoteSchema = z.object({
  text: z.string(),
  anchor: Identifier.nullable().refine((a) => a === null || anchorsElsewhere(a), {
    message: "l'àncora di una nota è la chiave con prefisso di un elemento di un'altra famiglia",
  }),
})
export type Note = z.infer<typeof NoteSchema>

/** Chiave = uuid: una nota non ha nome, e il testo cambia a ogni battitura. */
export const NoteModelSchema = z.object({ notes: z.record(z.string(), NoteSchema) })
export type NoteModel = z.infer<typeof NoteModelSchema>

/**
 * La `view` riusa `NodeViewSchema` come le altre famiglie: `collapsed` a una nota non si applica e
 * resta `false`, ma `moveNodes`, `applyLayout` e l'export leggono `view.nodes` con la stessa forma
 * in ogni famiglia, senza un ramo per le note.
 */
export const NoteDiagramSchema = z.object({
  model: NoteModelSchema,
  view: z.object({ nodes: z.record(z.string(), NodeViewSchema) }),
})
export type NoteDiagram = z.infer<typeof NoteDiagramSchema>

/** Una parte di note vuota: la forma di una famiglia senza elementi. */
export function emptyNoteDiagram(): NoteDiagram {
  return { model: { notes: {} }, view: { nodes: {} } }
}
