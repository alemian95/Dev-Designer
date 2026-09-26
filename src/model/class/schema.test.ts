import { describe, expect, it } from "vitest"
import { createDocument, DocumentSchema } from "../document"
import { SCHEMA_VERSION } from "../shared"
import { ClassDiagramSchema, ClassRelationSchema } from "./schema"

/** Un diagramma di classi minimo con due classi e una relazione fra loro.
 *  `patch` sovrascrive campi della relazione, per provare i casi rifiutati. */
function diagrammaConRelazione(patch: Record<string, unknown>) {
  return {
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
    },
    view: { nodes: {} },
  }
}

describe("schema del class diagram", () => {
  it("un documento appena creato valida contro DocumentSchema", () => {
    expect(DocumentSchema.safeParse(createDocument("prova")).success).toBe(true)
  })

  it("la chiave di una classe è il suo nome, e il modello non la ricontrolla", () => {
    const doc = createDocument("prova")
    doc.diagram.class.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("uno stereotipo fuori dai quattro è rifiutato", () => {
    const r = ClassDiagramSchema.safeParse({
      model: { classes: { X: { name: "X", stereotype: "trait", attributes: [], methods: [] } }, relations: {} },
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
    const doc = createDocument("prova")
    doc.diagram.class.model.classes["Stato"] = {
      name: "Stato", stereotype: "enum",
      attributes: [{ name: "IN_CORSO", type: "", visibility: "public", isStatic: false }],
      methods: [],
    }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("classi ed entità nello stesso documento validano insieme: ogni parte ha il suo schema", () => {
    const doc = createDocument("prova")
    doc.diagram.class.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
    doc.diagram.er.model.entities["clienti"] = { name: "clienti", attributes: [] }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
    // La versione è quella corrente: la 6 → 7 porta le note nella loro famiglia.
    expect(SCHEMA_VERSION).toBe(7)
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe("navigabilità", () => {
  it("navigable è opzionale: una relazione senza il campo resta valida", () => {
    const rel = { kind: "association", source: { class: "A", multiplicity: "", role: "" }, target: { class: "B", multiplicity: "", role: "" } }
    const parsed = ClassRelationSchema.parse(rel)
    expect(parsed.navigable).toBeUndefined()
    expect(ClassRelationSchema.parse({ ...rel, navigable: true }).navigable).toBe(true)
  })
})
