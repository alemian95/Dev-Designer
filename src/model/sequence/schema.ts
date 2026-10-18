import * as z from "zod"
import { Identifier, NodeViewSchema } from "../shared"

/** Il tratto di un messaggio: pieno (chiamata) o tratteggiato (risposta). */
export const LineSchema = z.enum(["solid", "dashed"])
export type Line = z.infer<typeof LineSchema>

/** La punta di un messaggio, una per ogni freccia di Mermaid che il formato distingue. */
export const HeadSchema = z.enum(["none", "filled", "cross", "open", "double"])
export type Head = z.infer<typeof HeadSchema>

/** Dove sta una nota di sequenza rispetto ai suoi partecipanti. */
export const PlacementSchema = z.enum(["left", "right", "over"])
export type Placement = z.infer<typeof PlacementSchema>

export const OperatorSchema = z.enum(["loop", "alt", "opt", "par", "critical", "break"])
export type Operator = z.infer<typeof OperatorSchema>

/** Gli operatori che hanno esattamente una sezione; gli altri ne hanno almeno una (spec §3.3). */
export const SINGLE_SECTION: ReadonlySet<Operator> = new Set(["loop", "opt", "break"])

export const ParticipantKindSchema = z.enum(["participant", "actor"])
export type ParticipantKind = z.infer<typeof ParticipantKindSchema>

/** I caratteri che Mermaid non accetta in un nome di partecipante (spec §3.3, §8.1). */
export const INVALID_NAME = /[<>:,;+()\\/]/

/**
 * Un partecipante (spec §3.1): `id` stabile, a cui puntano passi e àncore; `name` è il nome Mermaid,
 * unico nella sequenza, e rinominare cambia solo lui. `label` è l'alias mostrato, se c'è.
 */
export const ParticipantSchema = z.object({
  id: Identifier,
  name: z.string(),
  label: z.string().nullable(),
  kind: ParticipantKindSchema,
})
export type Participant = z.infer<typeof ParticipantSchema>

export const MessageStepSchema = z.object({
  kind: z.literal("message"),
  id: Identifier,
  from: Identifier,
  to: Identifier,
  text: z.string(),
  line: LineSchema,
  head: HeadSchema,
})
export type MessageStep = z.infer<typeof MessageStepSchema>

/**
 * Una nota di sequenza: uno o due partecipanti. Che due valgano solo con `over`, e diversi, è
 * un'invariante del validatore (`sequence-note-participants`), non dello schema.
 */
export const NoteStepSchema = z.object({
  kind: z.literal("note"),
  id: Identifier,
  placement: PlacementSchema,
  participants: z.union([z.tuple([Identifier]), z.tuple([Identifier, Identifier])]),
  text: z.string(),
})
export type NoteStep = z.infer<typeof NoteStepSchema>

export interface Section {
  id: string
  condition: string
  steps: Step[]
}

export interface BlockStep {
  kind: "block"
  id: string
  operator: Operator
  sections: Section[]
}

export type Step = MessageStep | NoteStep | BlockStep

/** Un passo: i blocchi contengono sezioni, che contengono passi, quindi lo schema è ricorsivo. */
export const StepSchema: z.ZodType<Step> = z.lazy(() => z.discriminatedUnion("kind", [MessageStepSchema, NoteStepSchema, BlockStepSchema]))

export const SectionSchema: z.ZodType<Section> = z.object({
  id: Identifier,
  condition: z.string(),
  steps: z.array(StepSchema),
})

/** Il numero di sezioni per operatore è un'invariante del validatore (`sequence-block-sections`). */
export const BlockStepSchema = z.object({
  kind: z.literal("block"),
  id: Identifier,
  operator: OperatorSchema,
  sections: z.array(SectionSchema),
})

/**
 * Una sequenza (spec §3.1): l'ordine di `participants` e `steps` è il significato, colonne da sinistra
 * e passi dall'alto. Lo schema **non** controlla i riferimenti ai partecipanti: un riferimento
 * pendente è un problema di validazione, non un file illeggibile.
 */
export const SequenceSchema = z.object({
  title: z.string(),
  autonumber: z.boolean(),
  participants: z.array(ParticipantSchema),
  steps: z.array(StepSchema),
})
export type Sequence = z.infer<typeof SequenceSchema>

/** Chiave = uuid: il titolo può essere vuoto e non è unico. */
export const SequenceModelSchema = z.object({ sequences: z.record(z.string(), SequenceSchema) })
export type SequenceModel = z.infer<typeof SequenceModelSchema>

/** La view tiene solo la posizione: la misura si ricava dal contenuto, e `collapsed` resta `false`. */
export const SequenceDiagramSchema = z.object({
  model: SequenceModelSchema,
  view: z.object({ nodes: z.record(z.string(), NodeViewSchema) }),
})
export type SequenceDiagram = z.infer<typeof SequenceDiagramSchema>

/** Una parte di sequenze vuota: la forma di una famiglia senza elementi. */
export function emptySequenceDiagram(): SequenceDiagram {
  return { model: { sequences: {} }, view: { nodes: {} } }
}
