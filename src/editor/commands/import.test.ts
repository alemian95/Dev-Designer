import { beforeEach, describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import type { Entity, Relationship } from "@/model/er/schema"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { entityRect, entitySize } from "../er/geometry"
import { rectsIntersect } from "../geometry"
import { canvasOps, nodeRects } from "../kinds/canvas-ops"
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

const doc = (): DevDocument => createDocument("prova", "doc-1")
const diagram = () => erDiagram(documentStore.getState().doc)
/** Lo spazio occupato dal documento corrente, di tutte le famiglie: ciò che passa il dialog di import. */
const occupied = () => nodeRects(documentStore.getState().doc)

beforeEach(() => {
  documentStore.getState().load(doc())
})

describe("importEr", () => {
  it("crea le entità nuove con una posizione e le relazioni con la convenzione delle chiavi", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")], occupied()))
    const d = diagram()
    expect(Object.keys(d.model.entities).sort()).toEqual(["a", "b"])
    expect(Object.keys(d.view.nodes).sort()).toEqual(["a", "b"])
    expect(Object.keys(d.model.relationships)).toEqual(["a_b"])
  })

  it("un import è un solo comando: un undo lo annulla tutto", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")], occupied()))
    expect(documentStore.getState().past).toHaveLength(1)
    documentStore.getState().undo()
    expect(diagram().model.entities).toEqual({})
    expect(diagram().model.relationships).toEqual({})
    expect(diagram().view.nodes).toEqual({})
  })

  it("una tabella che c'è già viene sostituita e tiene la posizione", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a") }, [], occupied()))
    const before = { ...diagram().view.nodes["a"] }
    documentStore.getState().dispatch(importEr({ a: entity("a", ["id", "nuovo"]) }, [], occupied()))
    expect(diagram().model.entities["a"]?.attributes.map((x) => x.name)).toEqual(["id", "nuovo"])
    expect(diagram().view.nodes["a"]).toEqual(before)
  })

  it("il re-import non duplica le relazioni derivate", () => {
    const payload = () => importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")], occupied())
    documentStore.getState().dispatch(payload())
    documentStore.getState().dispatch(payload())
    expect(Object.keys(diagram().model.relationships)).toEqual(["a_b"])
  })

  it("una relazione disegnata a mano sopravvive al re-import", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [], occupied()))
    documentStore.getState().dispatch((draft) => {
      erDiagram(draft).model.relationships["manuale"] = byHand("a", "b")
    })
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")], occupied()))
    expect(Object.keys(diagram().model.relationships).sort()).toEqual(["a_b", "manuale"])
  })

  it("una relazione derivata verso un'entità in arrivo, ma da un'entità che resta, non si tocca", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")], occupied()))
    documentStore.getState().dispatch(importEr({ b: entity("b") }, [], occupied()))
    expect(Object.keys(diagram().model.relationships)).toEqual(["a_b"])
  })

  it("senza entità, le entità importate non coprono una classe già sul canvas", () => {
    const cls = canvasOps(documentStore.getState().doc).addNode({ x: 40, y: 40 }, "class")
    documentStore.getState().dispatch(cls.recipe)
    const clsRect = canvasOps(documentStore.getState().doc).rectOf(cls.key)!
    const entities = { a: entity("a"), b: entity("b"), c: entity("c") }
    documentStore.getState().dispatch(importEr(entities, [], occupied()))
    const d = diagram()
    for (const [key, e] of Object.entries(entities)) {
      expect(rectsIntersect(entityRect(e, d.view.nodes[key]!), clsRect)).toBe(false)
    }
  })
})

describe("placeNew", () => {
  it("dà una posizione solo alle entità nuove", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a") }, [], occupied()))
    expect(Object.keys(placeNew({ a: entity("a"), b: entity("b") }, diagram(), occupied()))).toEqual(["b"])
  })

  it("è deterministico a parità di ingresso", () => {
    const entities = { a: entity("a"), b: entity("b"), c: entity("c") }
    expect(placeNew(entities, diagram(), occupied())).toEqual(placeNew(entities, diagram(), occupied()))
  })

  it("non sovrappone le entità nuove a quelle già sul canvas", () => {
    documentStore.getState().dispatch(importEr({ vecchia: entity("vecchia") }, [], occupied()))
    const placed = placeNew({ nuova: entity("nuova") }, diagram(), occupied())
    const vecchia = diagram().view.nodes["vecchia"]
    expect(vecchia).toBeDefined()
    expect(placed["nuova"]?.y).toBeGreaterThan(vecchia!.y)
  })

  it("dispone in griglia, quindi la seconda entità non finisce sopra la prima", () => {
    const placed = placeNew({ a: entity("a"), b: entity("b") }, diagram(), occupied())
    expect(placed["a"]).not.toEqual(placed["b"])
  })

  it("una sola entità alta non abbassa la riga di tutte le altre", () => {
    const alta = entity("alta", Array.from({ length: 40 }, (_, i) => `c${i}`))
    // Quattro entità → due colonne: `c` sta sotto `alta`, `d` sotto `b`. Se il passo verticale fosse
    // uniforme, `d` scenderebbe quanto `c` pur avendo sopra di sé un'entità da un attributo.
    const placed = placeNew({ alta, b: entity("b"), c: entity("c"), d: entity("d") }, diagram(), occupied())
    expect(placed["c"]!.y).toBeGreaterThan(placed["d"]!.y)
  })

  it("dentro una colonna le entità non si sovrappongono", () => {
    const entities = { a: entity("a", ["id", "x", "y"]), b: entity("b"), c: entity("c"), d: entity("d") }
    const placed = placeNew(entities, diagram(), occupied())
    expect(placed["c"]!.y).toBeGreaterThanOrEqual(placed["a"]!.y + entitySize(entities.a, false).h)
  })
})
