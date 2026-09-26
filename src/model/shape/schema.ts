import * as z from "zod"
import { Identifier, NodeViewSchema } from "../shared"

/** Le tre forme (spec 3b §3). `kind` non cambia dopo la creazione. */
export const ShapeKindSchema = z.enum(["rect", "ellipse", "text"])
export type ShapeKind = z.infer<typeof ShapeKindSchema>

/** Una forma: un tipo e un'etichetta, anche su più righe. Nessuna semantica, nessuna validazione di dominio. */
export const ShapeSchema = z.object({ kind: ShapeKindSchema, label: z.string() })
export type Shape = z.infer<typeof ShapeSchema>

/** Dove una freccia ha la punta: in nessun capo, alla fine (`target`), o a entrambi. */
export const ArrowHeadSchema = z.enum(["none", "end", "both"])
export type ArrowHead = z.infer<typeof ArrowHeadSchema>

/**
 * Una freccia fra due forme (spec 3b §3): gli estremi sono chiavi di forme **senza** prefisso, perché
 * gli archi stanno dentro la famiglia. Lo schema rifiuta una freccia da una forma verso sé stessa, e
 * **non** controlla che le forme esistano: una freccia pendente è un problema di validazione
 * (`shape-dangling-arrow`), non un file illeggibile.
 */
export const ArrowSchema = z
  .object({ source: Identifier, target: Identifier, head: ArrowHeadSchema, dashed: z.boolean() })
  .refine((a) => a.source !== a.target, { message: "una freccia non collega una forma a sé stessa" })
export type Arrow = z.infer<typeof ArrowSchema>

/** Un lato scelto a mano: positivo, o `null` finché la forma segue la misura del testo. */
const ChosenSide = z.number().positive().nullable()

/**
 * La view di una forma: la `NodeViewSchema` comune più la misura minima scelta a mano (spec 3b §3).
 * `collapsed` a una forma non si applica e resta `false`. Chi legge solo `x`/`y` (spostamento,
 * Disponi, export) la tratta come la view di ogni altra famiglia.
 */
export const ShapeViewSchema = NodeViewSchema.extend({ w: ChosenSide, h: ChosenSide })
export type ShapeView = z.infer<typeof ShapeViewSchema>

/** Chiavi = uuid, per le forme e per le frecce: l'etichetta cambia a ogni battitura. */
export const ShapeModelSchema = z.object({
  shapes: z.record(z.string(), ShapeSchema),
  arrows: z.record(z.string(), ArrowSchema),
})
export type ShapeModel = z.infer<typeof ShapeModelSchema>

export const ShapeDiagramSchema = z.object({
  model: ShapeModelSchema,
  view: z.object({ nodes: z.record(z.string(), ShapeViewSchema) }),
})
export type ShapeDiagram = z.infer<typeof ShapeDiagramSchema>

/** Una parte di forme vuota: la forma di una famiglia senza elementi. */
export function emptyShapeDiagram(): ShapeDiagram {
  return { model: { shapes: {}, arrows: {} }, view: { nodes: {} } }
}
