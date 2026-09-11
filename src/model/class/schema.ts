import * as z from "zod"
import { Identifier, NodeViewSchema, SCHEMA_VERSION } from "../shared"
import type { DevDocument } from "../document"

export const VisibilitySchema = z.enum(["public", "private", "protected", "package"])
export type Visibility = z.infer<typeof VisibilitySchema>

export const StereotypeSchema = z.enum(["class", "interface", "abstract", "enum"])
export type Stereotype = z.infer<typeof StereotypeSchema>

export const ClassAttributeSchema = z.object({
  name: Identifier,
  /** Tipo nel linguaggio di chi scrive, come stringa. Nessun sistema di tipi
   *  unificato: la stessa scelta dell'ER. Vuoto è legale (valori di enum). */
  type: z.string(),
  visibility: VisibilitySchema,
  isStatic: z.boolean(),
})
export type ClassAttribute = z.infer<typeof ClassAttributeSchema>

export const ParameterSchema = z.object({ name: Identifier, type: z.string() })
export type Parameter = z.infer<typeof ParameterSchema>

export const ClassMethodSchema = z.object({
  name: Identifier,
  /** Tipo di ritorno; vuoto per un costruttore. */
  type: z.string(),
  visibility: VisibilitySchema,
  isStatic: z.boolean(),
  isAbstract: z.boolean(),
  parameters: z.array(ParameterSchema),
})
export type ClassMethod = z.infer<typeof ClassMethodSchema>

export const ClassNodeSchema = z.object({
  name: Identifier,
  stereotype: StereotypeSchema,
  attributes: z.array(ClassAttributeSchema),
  methods: z.array(ClassMethodSchema),
})
export type ClassNode = z.infer<typeof ClassNodeSchema>

// **Due array e non uno.** UML ha due scomparti sotto l'header e due array li
// rendono direttamente. L'alternativa — un array solo di membri con
// `parameters: null` a distinguere attributo da metodo — è un tipo che mente sulla
// propria forma, e ogni consumatore paga il ramo.

// **`isStatic` e `isAbstract`, non `static` e `abstract`.** Legali come nomi di
// proprietà, ma `const { static } = m` è un errore di sintassi: la mina non entra
// nel renderer.

export const RelationKindSchema = z.enum([
  "association", "generalization", "realization", "composition", "aggregation", "dependency",
])
export type RelationKind = z.infer<typeof RelationKindSchema>

export const ClassEndSchema = z.object({
  /** Chiave della classe, cioè il suo nome. */
  class: Identifier,
  /** "1", "0..*", "1..n": testo libero, nessuna grammatica da validare. */
  multiplicity: z.string(),
  role: z.string(),
})
export type ClassEnd = z.infer<typeof ClassEndSchema>

export const ClassRelationSchema = z.object({
  kind: RelationKindSchema,
  name: z.string().optional(),
  /** Solo per `association`: il `target` è raggiungibile dal `source`. Assente = non navigabile,
   *  che è il comportamento di sempre — per questo è opzionale e non richiede una migrazione. */
  navigable: z.boolean().optional(),
  /** Il figlio: sottoclasse, implementatore, parte, dipendente. */
  source: ClassEndSchema,
  /** Il padre: superclasse, interfaccia, tutto, dipendenza. */
  target: ClassEndSchema,
})
export type ClassRelation = z.infer<typeof ClassRelationSchema>

// **La convenzione `source`/`target` è deliberatamente la stessa dell'ER**, dove
// `source` è il lato della foreign key (la figlia) e `target` il referenziato (il
// padre). Due conseguenze, entrambe volute:
//
// - `layoutGraph` inverte gli archi esattamente come già fa per l'ER, e le
//   superclassi finiscono in alto senza una riga in più: la convenzione «padri in
//   alto» dell'ADR 0006 vale già per la generalizzazione UML.
// - Il rombo della composizione va sul *tutto*, che è il `target`. È l'errore che
//   si fa di solito, e la convenzione lo risolve prima che si presenti (§7).

/**
 * Una nota è testo libero appoggiato sul canvas. Nessun campo di ancoraggio: §2 della spec taglia
 * `note for Cliente`, che sembra una riga tratteggiata e invece è un arco.
 */
export const ClassNoteSchema = z.object({ text: z.string() })
export type ClassNote = z.infer<typeof ClassNoteSchema>

// Nessun `.refine` sulla coerenza fra chiave e nome: qui la chiave è il nome, e
// un refine sarebbe una tautologia che costa un errore di validazione a ogni
// rinomina in corso (l'ER ce l'ha perché la sua chiave è composta, `schema.nome`).
export const ClassModelSchema = z.object({
  classes: z.record(z.string(), ClassNodeSchema),
  relations: z.record(z.string(), ClassRelationSchema),
  /** Chiave = uuid, non il testo: una nota non ha nome, e il testo cambia a ogni battitura. */
  notes: z.record(z.string(), ClassNoteSchema),
})
export type ClassModel = z.infer<typeof ClassModelSchema>

// La `view` riusa `NodeViewSchema` così com'è: `{x, y, collapsed}`, dove
// `collapsed` mostra il solo header. Nessun terzo stato «solo attributi».
export const ClassDiagramSchema = z.object({
  type: z.literal("class"),
  model: ClassModelSchema, // { classes: Record<string, ClassNode>, relations: Record<string, ClassRelation> }
  view: z.object({ nodes: z.record(z.string(), NodeViewSchema) }),
})
export type ClassDiagram = z.infer<typeof ClassDiagramSchema>

export type ClassDocument = DevDocument & { diagram: ClassDiagram }

export function createClassDocument(name: string, id: string = crypto.randomUUID()): ClassDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: { type: "class", model: { classes: {}, relations: {}, notes: {} }, view: { nodes: {} } },
  }
}
