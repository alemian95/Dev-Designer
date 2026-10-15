import { beforeEach, describe, expect, it } from "vitest"
import type { ClassNode, ClassRelation } from "@/model/class/schema"
import { createDocument } from "@/model/document"
import type { Entity, Relationship } from "@/model/er/schema"
import type { LayoutGraph } from "@/model/layout"
import { classDiagram } from "../class-access"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { noteDiagram } from "../note-access"
import { importEr } from "./import"
import {
  classImportFates, erImportFates, importMermaidClass, importMermaidEr, placeClassImport, placeErImport, sameClassRelation,
  selectClassFragment, selectErFragment, type ClassImport,
} from "./import-mermaid"

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

  it("lasciano stare un'entità presente che il testo nomina solo in una relazione", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a") }, [], { a: { x: 0, y: 0 } }))
    expect(erImportFates(doc(), { a: entity("a", []), c: entity("c", []) }, new Set(["a", "c"]))).toEqual({ a: "identico", c: "nuovo" })
  })

  it("tiene solo le relazioni con estremi scelti o già presenti", () => {
    const out = selectErFragment({ a: entity("a"), b: entity("b"), c: entity("c") }, [rel("b", "a"), rel("c", "a"), rel("b", "z")], new Set(["a", "b"]), new Set(["z"]))
    expect(Object.keys(out.entities)).toEqual(["a", "b"])
    expect(out.relationships).toEqual([rel("b", "a"), rel("b", "z")])
  })
})

describe("import di un'entità che si chiama come una chiave del prototipo", () => {
  it("la vede nuova, la dispone, la sceglie e la innesta con il suo nodo", async () => {
    const entities = { constructor: entity("constructor"), toString: entity("toString") }
    expect(erImportFates(doc(), entities)).toEqual({ constructor: "nuovo", toString: "nuovo" })
    const { positions } = await placeErImport(doc(), entities, [], fakeLayout)
    expect(Object.keys(positions)).toEqual(["constructor", "toString"])
    const picked = selectErFragment(entities, [rel("toString", "constructor")], new Set(["toString"]), new Set())
    expect(picked.relationships).toEqual([])
    documentStore.getState().dispatch(importMermaidEr(entities, [], positions))
    expect(Object.keys(diagram().view.nodes)).toEqual(["constructor", "toString"])
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

const cls = (name: string, attributes: string[] = []): ClassNode => ({
  name,
  stereotype: "class",
  attributes: attributes.map((n) => ({ name: n, type: "int", visibility: "public", isStatic: false })),
  methods: [],
})

/** Una relazione come la produce `mapClass`: ruoli vuoti. */
const classRel = (source: string, target: string, kind: ClassRelation["kind"] = "generalization"): ClassRelation => ({
  kind,
  source: { class: source, multiplicity: "", role: "" },
  target: { class: target, multiplicity: "", role: "" },
})

const classes = () => classDiagram(doc())
const notes = () => Object.values(noteDiagram(doc()).model.notes)
const at = (x: number, y: number) => ({ x, y })

describe("importMermaidClass", () => {
  it("crea classi, relazioni e note alle posizioni date", () => {
    const fragment: ClassImport = { classes: { A: cls("A"), B: cls("B") }, relations: [classRel("B", "A")], notes: { n1: { text: "ciao", anchor: "class/A" } } }
    documentStore.getState().dispatch(importMermaidClass(fragment, { classes: { A: at(40, 40), B: at(340, 40) }, notes: { n1: at(40, 300) } }))
    expect(Object.keys(classes().model.classes)).toEqual(["A", "B"])
    expect(classes().view.nodes.B).toEqual({ x: 340, y: 40, collapsed: false })
    expect(Object.values(classes().model.relations)).toEqual([classRel("B", "A")])
    expect(noteDiagram(doc()).model.notes.n1).toEqual({ text: "ciao", anchor: "class/A" })
    expect(noteDiagram(doc()).view.nodes.n1).toEqual({ x: 40, y: 300, collapsed: false })
  })

  it("sostituisce una classe presente, le lascia la posizione e le tiene la nota ancorata", () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A") }, relations: [], notes: { n1: { text: "x", anchor: "class/A" } } }, { classes: { A: at(40, 40) }, notes: { n1: at(0, 300) } }))
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A", ["id"]) }, relations: [], notes: {} }, { classes: { A: at(999, 999) }, notes: {} }))
    expect(classes().model.classes.A!.attributes.map((a) => a.name)).toEqual(["id"])
    expect(classes().view.nodes.A).toMatchObject({ x: 40, y: 40 })
    expect(notes()).toEqual([{ text: "x", anchor: "class/A" }])
  })

  it("re-importare lo stesso testo non duplica relazioni e note, una relazione diversa si aggiunge", () => {
    const run = (kind: ClassRelation["kind"], noteKey: string) =>
      documentStore.getState().dispatch(importMermaidClass(
        { classes: { A: cls("A"), B: cls("B") }, relations: [classRel("B", "A", kind)], notes: { [noteKey]: { text: "nota", anchor: null } } },
        { classes: { A: at(40, 40), B: at(340, 40) }, notes: { [noteKey]: at(40, 300) } },
      ))
    run("generalization", "n1")
    run("generalization", "n2")
    expect(Object.keys(classes().model.relations)).toHaveLength(1)
    expect(notes()).toHaveLength(1)
    run("realization", "n3")
    expect(Object.keys(classes().model.relations)).toHaveLength(2)
  })

  it("si annulla con un solo undo", () => {
    documentStore.getState().dispatch(importMermaidClass(
      { classes: { A: cls("A"), B: cls("B") }, relations: [classRel("B", "A")], notes: { n1: { text: "x", anchor: null } } },
      { classes: { A: at(0, 0), B: at(0, 0) }, notes: { n1: at(0, 0) } },
    ))
    documentStore.getState().undo()
    expect(classes().model.classes).toEqual({})
    expect(classes().model.relations).toEqual({})
    expect(notes()).toEqual([])
  })
})

describe("classImportFates, sameClassRelation e selectClassFragment", () => {
  it("distinguono nuovo, sostituisce e identico", () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A"), B: cls("B") }, relations: [], notes: {} }, { classes: { A: at(0, 0), B: at(0, 0) }, notes: {} }))
    expect(classImportFates(doc(), { A: cls("A"), B: cls("B", ["x"]), C: cls("C") })).toEqual({ A: "identico", B: "sostituisce", C: "nuovo" })
  })

  it("lasciano stare una classe presente che il testo nomina solo in una relazione", () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A", ["x"]) }, relations: [], notes: {} }, { classes: { A: at(0, 0) }, notes: {} }))
    expect(classImportFates(doc(), { A: cls("A"), C: cls("C") }, new Set(["A", "C"]))).toEqual({ A: "identico", C: "nuovo" })
  })

  it("considerano uguali una navigabilità assente e una falsa, e diverse due molteplicità", () => {
    expect(sameClassRelation(classRel("B", "A", "association"), { ...classRel("B", "A", "association"), navigable: false })).toBe(true)
    expect(sameClassRelation(classRel("B", "A"), { ...classRel("B", "A"), target: { class: "A", multiplicity: "1", role: "" } })).toBe(false)
  })

  it("ignorano il ruolo, che Mermaid non porta: il re-import del proprio export non duplica", () => {
    const withRole: ClassRelation = { ...classRel("B", "A"), source: { class: "B", multiplicity: "", role: "cliente" } }
    expect(sameClassRelation(withRole, classRel("B", "A"))).toBe(true)
  })

  it("tengono solo relazioni e note ancorate con estremi scelti o già presenti, e danno una chiave alle note", () => {
    const out = selectClassFragment(
      { A: cls("A"), B: cls("B"), C: cls("C") },
      [classRel("B", "A"), classRel("C", "A"), classRel("B", "Z")],
      [{ text: "libera", anchor: null }, { text: "su C", anchor: "class/C" }, { text: "su Z", anchor: "class/Z" }],
      new Set(["A", "B"]), new Set(["Z"]),
    )
    expect(Object.keys(out.classes)).toEqual(["A", "B"])
    expect(out.relations).toEqual([classRel("B", "A"), classRel("B", "Z")])
    expect(Object.values(out.notes)).toEqual([{ text: "libera", anchor: null }, { text: "su Z", anchor: "class/Z" }])
    expect(Object.keys(out.notes).every((k) => /^[0-9a-f-]{36}$/.test(k))).toBe(true)
  })
})

describe("placeClassImport", () => {
  it("dispone con il motore le sole classi nuove e le note, con l'arco dalla classe alla sua nota", async () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A") }, relations: [], notes: {} }, { classes: { A: at(40, 40) }, notes: {} }))
    const fragment: ClassImport = {
      classes: { A: cls("A"), B: cls("B"), C: cls("C") },
      relations: [classRel("C", "B"), classRel("B", "A")],
      notes: { n1: { text: "su C", anchor: "class/C" } },
    }
    const { classes: placed, notes: placedNotes, fallback } = await placeClassImport(doc(), fragment, async (g) => {
      expect(g.nodes.map((n) => n.id)).toEqual(["B", "C", "n1"])
      expect(g.edges.map((e) => [e.source, e.target])).toEqual([["B", "C"], ["C", "n1"]])
      return fakeLayout(g)
    })
    expect(fallback).toBeNull()
    expect(Object.keys(placed)).toEqual(["B", "C"])
    expect(Object.keys(placedNotes)).toEqual(["n1"])
    expect(placed.B!.x).toBe(40)
    expect(placed.B!.y).toBeGreaterThan(classes().view.nodes.A!.y)
  })

  it("non dispone una nota identica a una presente", async () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: {}, relations: [], notes: { n1: { text: "x", anchor: null } } }, { classes: {}, notes: { n1: at(40, 40) } }))
    const placement = await placeClassImport(doc(), { classes: {}, relations: [], notes: { n2: { text: "x", anchor: null } } }, async () => {
      throw new Error("non doveva essere chiamato")
    })
    expect(placement).toEqual({ classes: {}, notes: {}, fallback: null })
  })

  it("se il motore fallisce ripiega sulla griglia, con un messaggio", async () => {
    const placement = await placeClassImport(doc(), { classes: { A: cls("A"), B: cls("B") }, relations: [], notes: { n1: { text: "x", anchor: null } } }, async () => {
      throw new Error("timeout")
    })
    expect(Object.keys(placement.classes)).toEqual(["A", "B"])
    expect(Object.keys(placement.notes)).toEqual(["n1"])
    expect(placement.fallback).toMatch(/griglia/)
  })
})
