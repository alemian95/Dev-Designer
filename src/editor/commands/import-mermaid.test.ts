import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import type { Entity, Relationship } from "@/model/er/schema"
import type { LayoutGraph } from "@/model/layout"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { importEr } from "./import"
import { erImportFates, importMermaidEr, placeErImport, selectErFragment } from "./import-mermaid"

const entity = (name: string, attributes: string[] = ["id"]): Entity => ({
  name,
  attributes: attributes.map((n) => ({ name: n, type: "int", primaryKey: n === "id", foreignKey: false, nullable: n !== "id", unique: false })),
})

/** Una relazione come la produce `mapEr`: senza colonne. */
const rel = (source: string, target: string, name?: string): Relationship => ({
  ...(name === undefined ? {} : { name }),
  source: { entity: source, attributes: [], cardinality: "zero-or-many" },
  target: { entity: target, attributes: [], cardinality: "one" },
  identifying: false,
})

const doc = () => documentStore.getState().doc
const diagram = () => erDiagram(doc())
/** Un motore finto: dispone i nodi in fila, a 300 px l'uno dall'altro, partendo da (500, 700). */
const fakeLayout = async (g: LayoutGraph) => Object.fromEntries(g.nodes.map((n, i) => [n.id, { x: 500 + i * 300, y: 700 }]))

beforeEach(() => {
  documentStore.getState().load(createDocument("prova", "doc-1"))
})

describe("importMermaidEr", () => {
  it("crea le entità nuove alle posizioni date e le relazioni", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a")], { a: { x: 40, y: 40 }, b: { x: 340, y: 40 } }))
    expect(Object.keys(diagram().model.entities)).toEqual(["a", "b"])
    expect(diagram().view.nodes.b).toEqual({ x: 340, y: 40, collapsed: false })
    expect(Object.values(diagram().model.relationships)).toEqual([rel("b", "a")])
  })

  it("sostituisce un'entità presente e le lascia la posizione", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a") }, [], { a: { x: 40, y: 40 } }))
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a", ["id", "nome"]) }, [], { a: { x: 999, y: 999 } }))
    expect(diagram().model.entities.a!.attributes.map((x) => x.name)).toEqual(["id", "nome"])
    expect(diagram().view.nodes.a).toMatchObject({ x: 40, y: 40 })
  })

  it("re-importare lo stesso testo non duplica le relazioni, una relazione diversa si aggiunge", () => {
    const pos = { a: { x: 40, y: 40 }, b: { x: 340, y: 40 } }
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a", "ha")], pos))
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a", "ha")], pos))
    expect(Object.keys(diagram().model.relationships)).toHaveLength(1)
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a", "possiede")], pos))
    expect(Object.keys(diagram().model.relationships)).toHaveLength(2)
  })

  it("non pota le relazioni derivate da una FK delle entità in arrivo", () => {
    const derived: Relationship = { ...rel("b", "a"), source: { entity: "b", attributes: ["a_id"], cardinality: "zero-or-many" } }
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived], []))
    documentStore.getState().dispatch(importMermaidEr({ b: entity("b") }, [], {}))
    expect(Object.values(diagram().model.relationships)).toEqual([derived])
  })

  it("si annulla con un solo undo", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a")], { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }))
    documentStore.getState().undo()
    expect(diagram().model.entities).toEqual({})
    expect(diagram().model.relationships).toEqual({})
  })
})

describe("erImportFates e selectErFragment", () => {
  it("distinguono nuovo, sostituisce e identico", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [], { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }))
    expect(erImportFates(doc(), { a: entity("a"), b: entity("b", ["id", "x"]), c: entity("c") })).toEqual({ a: "identico", b: "sostituisce", c: "nuovo" })
  })

  it("tiene solo le relazioni con estremi scelti o già presenti", () => {
    const out = selectErFragment({ a: entity("a"), b: entity("b"), c: entity("c") }, [rel("b", "a"), rel("c", "a"), rel("b", "z")], new Set(["a", "b"]), new Set(["z"]))
    expect(Object.keys(out.entities)).toEqual(["a", "b"])
    expect(out.relationships).toEqual([rel("b", "a"), rel("b", "z")])
  })
})

describe("placeErImport", () => {
  it("dispone con il motore le sole entità nuove, in un blocco sotto il contenuto esistente", async () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a") }, [], { a: { x: 40, y: 40 } }))
    const seen: string[][] = []
    const { positions, fallback } = await placeErImport(doc(), { a: entity("a"), b: entity("b"), c: entity("c") }, [rel("c", "b"), rel("b", "a")], async (g) => {
      seen.push(g.nodes.map((n) => n.id))
      expect(g.edges.map((e) => [e.source, e.target])).toEqual([["b", "c"]])
      return fakeLayout(g)
    })
    expect(fallback).toBeNull()
    expect(seen).toEqual([["b", "c"]])
    expect(Object.keys(positions)).toEqual(["b", "c"])
    const below = diagram().view.nodes.a!.y
    expect(positions.b!.x).toBe(40)
    expect(positions.b!.y).toBeGreaterThan(below)
    expect(positions.c!.x - positions.b!.x).toBe(300)
  })

  it("con una sola entità nuova non chiama il motore", async () => {
    const { positions } = await placeErImport(doc(), { a: entity("a") }, [], async () => {
      throw new Error("non doveva essere chiamato")
    })
    expect(positions.a).toEqual({ x: 40, y: 40 })
  })

  it("se il motore fallisce ripiega sulla griglia, con un messaggio", async () => {
    const { positions, fallback } = await placeErImport(doc(), { a: entity("a"), b: entity("b") }, [], async () => {
      throw new Error("timeout")
    })
    expect(Object.keys(positions)).toEqual(["a", "b"])
    expect(fallback).toMatch(/griglia/)
  })
})
