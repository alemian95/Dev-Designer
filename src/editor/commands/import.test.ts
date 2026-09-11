import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument, type Entity, type ErDocument, type Relationship } from "@/model/er/schema"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { importEr, placeNew } from "./import"

const entity = (name: string, attributes: string[] = ["id"]): Entity => ({
  name,
  attributes: attributes.map((n) => ({ name: n, type: "int", primaryKey: n === "id", foreignKey: false, nullable: false, unique: false })),
})

const derived = (source: string, target: string): Relationship => ({
  source: { entity: source, attributes: ["parent_id"], cardinality: "zero-or-many" },
  target: { entity: target, attributes: ["id"], cardinality: "one" },
  identifying: false,
})

/** Una relazione disegnata a mano: estremi senza attributi, come documenta RelationshipEndSchema. */
const byHand = (source: string, target: string): Relationship => ({
  source: { entity: source, attributes: [], cardinality: "zero-or-many" },
  target: { entity: target, attributes: [], cardinality: "one" },
  identifying: false,
})

const doc = (): ErDocument => createErDocument("prova", "doc-1")
const diagram = () => erDiagram(documentStore.getState().doc)

beforeEach(() => {
  documentStore.getState().load(doc())
})

describe("importEr", () => {
  it("crea le entità nuove con una posizione e le relazioni con la convenzione delle chiavi", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")]))
    const d = diagram()
    expect(Object.keys(d.model.entities).sort()).toEqual(["a", "b"])
    expect(Object.keys(d.view.nodes).sort()).toEqual(["a", "b"])
    expect(Object.keys(d.model.relationships)).toEqual(["a_b"])
  })

  it("un import è un solo comando: un undo lo annulla tutto", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")]))
    expect(documentStore.getState().past).toHaveLength(1)
    documentStore.getState().undo()
    expect(diagram().model.entities).toEqual({})
    expect(diagram().model.relationships).toEqual({})
    expect(diagram().view.nodes).toEqual({})
  })

  it("una tabella che c'è già viene sostituita e tiene la posizione", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a") }, []))
    const before = { ...diagram().view.nodes["a"] }
    documentStore.getState().dispatch(importEr({ a: entity("a", ["id", "nuovo"]) }, []))
    expect(diagram().model.entities["a"].attributes.map((x) => x.name)).toEqual(["id", "nuovo"])
    expect(diagram().view.nodes["a"]).toEqual(before)
  })

  it("il re-import non duplica le relazioni derivate", () => {
    const payload = () => importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")])
    documentStore.getState().dispatch(payload())
    documentStore.getState().dispatch(payload())
    expect(Object.keys(diagram().model.relationships)).toEqual(["a_b"])
  })

  it("una relazione disegnata a mano sopravvive al re-import", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, []))
    documentStore.getState().dispatch((draft) => {
      erDiagram(draft).model.relationships["manuale"] = byHand("a", "b")
    })
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")]))
    expect(Object.keys(diagram().model.relationships).sort()).toEqual(["a_b", "manuale"])
  })

  it("una relazione derivata verso un'entità in arrivo, ma da un'entità che resta, non si tocca", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")]))
    documentStore.getState().dispatch(importEr({ b: entity("b") }, []))
    expect(Object.keys(diagram().model.relationships)).toEqual(["a_b"])
  })
})

describe("placeNew", () => {
  it("dà una posizione solo alle entità nuove", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a") }, []))
    expect(Object.keys(placeNew({ a: entity("a"), b: entity("b") }, diagram()))).toEqual(["b"])
  })

  it("è deterministico a parità di ingresso", () => {
    const entities = { a: entity("a"), b: entity("b"), c: entity("c") }
    expect(placeNew(entities, diagram())).toEqual(placeNew(entities, diagram()))
  })

  it("non sovrappone le entità nuove a quelle già sul canvas", () => {
    documentStore.getState().dispatch(importEr({ vecchia: entity("vecchia") }, []))
    const placed = placeNew({ nuova: entity("nuova") }, diagram())
    expect(placed["nuova"].y).toBeGreaterThan(diagram().view.nodes["vecchia"].y)
  })

  it("dispone in griglia, quindi la seconda entità non finisce sopra la prima", () => {
    const placed = placeNew({ a: entity("a"), b: entity("b") }, diagram())
    expect(placed["a"]).not.toEqual(placed["b"])
  })
})
