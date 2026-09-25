import { describe, expect, it } from "vitest"
import { createDocument, DocumentSchema } from "../document"
import { SCHEMA_VERSION } from "../shared"
import {
  CLASS_RELATION_KINDS, ClassDiagramSchema, ClassModelSchema, ClassRelationSchema,
  isClassRelation, RelationKindSchema,
} from "./schema"

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
      notes: {},
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
    // La versione è quella corrente: la 4 → 5 non cambia forma, alza la versione per i collegamenti del flusso.
    expect(SCHEMA_VERSION).toBe(5)
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
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

  it("createDocument nasce con le note di classe vuote e alla versione corrente", () => {
    const doc = createDocument("Prova", "id-fisso")
    expect(doc.diagram.class.model.notes).toEqual({})
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe("note-link", () => {
  const end = (c: string) => ({ class: c, multiplicity: "", role: "" })

  it("è una specie di relazione valida", () => {
    expect(RelationKindSchema.parse("note-link")).toBe("note-link")
  })

  it("non è una relazione fra classi: isClassRelation la esclude", () => {
    expect(isClassRelation({ kind: "note-link", source: end("n1"), target: end("Cliente") })).toBe(false)
    expect(isClassRelation({ kind: "association", source: end("A"), target: end("B") })).toBe(true)
  })

  it("non compare fra le specie che il selettore offre: si crea col gesto, non si sceglie", () => {
    expect(CLASS_RELATION_KINDS).toEqual([
      "association", "generalization", "realization", "composition", "aggregation", "dependency",
    ])
  })
})
