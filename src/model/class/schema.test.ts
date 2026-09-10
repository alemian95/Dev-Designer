import { describe, expect, it } from "vitest"
import { DocumentSchema } from "../document"
import { createErDocument } from "../er/schema"
import { SCHEMA_VERSION } from "../shared"
import { ClassDiagramSchema, createClassDocument } from "./schema"

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
    // Nessuna migrazione: se questa riga cambia, ogni file già salvato va migrato.
    expect(SCHEMA_VERSION).toBe(1)
    expect(er.schemaVersion).toBe(SCHEMA_VERSION)
  })
})
