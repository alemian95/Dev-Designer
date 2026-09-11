import { describe, expect, it } from "vitest"
import { DocumentSchema } from "../document"
import { createErDocument } from "../er/schema"
import { SCHEMA_VERSION } from "../shared"
import { ClassDiagramSchema, ClassModelSchema, ClassRelationSchema, createClassDocument } from "./schema"

/** Un diagramma di classi minimo con due classi e una relazione fra loro.
 *  `patch` sovrascrive campi della relazione, per provare i casi rifiutati. */
function diagrammaConRelazione(patch: Record<string, unknown>) {
  return {
    type: "class",
    model: {
      classes: {
        Ordine: { name: "Ordine", stereotype: "class", attributes: [], methods: [] },
        Cliente: { name: "Cliente", stereotype: "class", attributes: [], methods: [] },
      },
      relations: {
        r1: {
          kind: "association",
          source: { class: "Ordine", multiplicity: "*", role: "" },
          target: { class: "Cliente", multiplicity: "1", role: "cliente" },
          ...patch,
        },
      },
      notes: {},
    },
    view: { nodes: {} },
  }
}

describe("schema del class diagram", () => {
  it("un documento classe appena creato valida contro DocumentSchema", () => {
    expect(DocumentSchema.safeParse(createClassDocument("prova")).success).toBe(true)
  })

  it("la chiave di una classe è il suo nome, e il modello non la ricontrolla", () => {
    const doc = createClassDocument("prova")
    doc.diagram.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("uno stereotipo fuori dai quattro è rifiutato", () => {
    const r = ClassDiagramSchema.safeParse({
      type: "class",
      model: { classes: { X: { name: "X", stereotype: "trait", attributes: [], methods: [] } }, relations: {}, notes: {} },
      view: { nodes: {} },
    })
    expect(r.success).toBe(false)
  })

  it("un tipo di relazione fuori dai sei è rifiutato, e uno dei sei è accettato", () => {
    // Il verso positivo non è ridondante: un negativo da solo passerebbe anche se
    // fosse la forma dell'oggetto a essere sbagliata, non l'enum a rifiutare.
    expect(ClassDiagramSchema.safeParse(diagrammaConRelazione({})).success).toBe(true)
    expect(ClassDiagramSchema.safeParse(diagrammaConRelazione({ kind: "friendship" })).success).toBe(false)
  })

  it("un attributo con tipo vuoto è legale: è così che si scrive un valore di enum", () => {
    const doc = createClassDocument("prova")
    doc.diagram.model.classes["Stato"] = {
      name: "Stato", stereotype: "enum",
      attributes: [{ name: "IN_CORSO", type: "", visibility: "public", isStatic: false }],
      methods: [],
    }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("i documenti ER continuano a validare: la union è allargata, non cambiata", () => {
    const er = createErDocument("prova")
    expect(DocumentSchema.safeParse(er).success).toBe(true)
    // La versione è quella corrente: la migrazione 1 → 2 tocca solo il class diagram.
    expect(SCHEMA_VERSION).toBe(2)
    expect(er.schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe("note e navigabilità", () => {
  it("un modello senza notes non passa più", () => {
    const senza = { classes: {}, relations: {} }
    expect(ClassModelSchema.safeParse(senza).success).toBe(false)
  })

  it("una nota è testo libero, anche vuoto e multiriga", () => {
    const modello = { classes: {}, relations: {}, notes: { n1: { text: "" }, n2: { text: "prima\nseconda" } } }
    expect(ClassModelSchema.parse(modello).notes.n2!.text).toBe("prima\nseconda")
  })

  it("navigable è opzionale: una relazione senza il campo resta valida", () => {
    const rel = { kind: "association", source: { class: "A", multiplicity: "", role: "" }, target: { class: "B", multiplicity: "", role: "" } }
    const parsed = ClassRelationSchema.parse(rel)
    expect(parsed.navigable).toBeUndefined()
    expect(ClassRelationSchema.parse({ ...rel, navigable: true }).navigable).toBe(true)
  })

  it("createClassDocument nasce con notes vuoto e alla versione corrente", () => {
    const doc = createClassDocument("Prova", "id-fisso")
    expect(doc.diagram.model.notes).toEqual({})
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
  })
})
