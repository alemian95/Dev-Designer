import { describe, expect, it } from "vitest"
import { createDocument } from "./document"
import { migrateDocument } from "./migrations"
import { parseDocument, toJson } from "./serialize"

describe("migrazione 1 → 2", () => {
  const v1Class = {
    schemaVersion: 1,
    id: "a",
    name: "Prova",
    diagram: { type: "class", model: { classes: {}, relations: {} }, view: { nodes: {} } },
  }
  const v1Er = {
    schemaVersion: 1,
    id: "b",
    name: "Prova",
    diagram: { type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } },
  }

  // Le migrazioni si concatenano: un v1 arriva alla versione corrente passando anche dalla 2 → 3,
  // quindi il diagramma di classi migrato si legge nella sua parte, `diagram.class`.
  it("aggiunge notes a un diagramma di classi", () => {
    const out = migrateDocument(v1Class)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(5)
    expect((doc.diagram as { class: { model: { notes: unknown } } }).class.model.notes).toEqual({})
  })

  it("non tocca il modello di un ER, che non ha notes nel suo schema", () => {
    const out = migrateDocument(v1Er)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(5)
    expect((doc.diagram as { er: { model: Record<string, unknown> } }).er.model).toEqual({ entities: {}, relationships: {} })
  })

  it("non muta l'input: le migrazioni copiano, non scrivono sull'originale", () => {
    const before = structuredClone(v1Class)
    migrateDocument(v1Class)
    expect(v1Class).toEqual(before)
  })

  it("un documento già alla versione corrente (5) passa senza toccare niente", () => {
    const v3 = createDocument("Prova", "a")
    expect(migrateDocument(v3)).toEqual({ ok: true, value: v3 })
  })
})

/** Un documento v2 com'era su disco: un tipo solo. */
const v2 = (diagram: unknown) => JSON.stringify({ schemaVersion: 2, id: "d1", name: "vecchio", diagram })

describe("migrazione 2 → 3", () => {
  it("un ER v2 diventa la parte er, con le altre due vuote", () => {
    const r = parseDocument(v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(5)
    expect(r.document.diagram.class.model.classes).toEqual({})
    expect(r.document.diagram.flow.model.lanes).toHaveLength(1)
  })

  it("un class diagram v2 conserva le sue classi", () => {
    const cls = { name: "Ordine", stereotype: "class", attributes: [], methods: [] }
    const r = parseDocument(v2({ type: "class", model: { classes: { Ordine: cls }, relations: {}, notes: {} }, view: { nodes: { Ordine: { x: 0, y: 0, collapsed: false } } } }))
    expect(r.ok && Object.keys(r.document.diagram.class.model.classes)).toEqual(["Ordine"])
  })

  it("un flowchart v2 conserva corsie e nodi", () => {
    const flow = {
      type: "flow",
      model: { lanes: [{ id: "l1", name: "A" }], nodes: { n1: { label: "x", shape: "process", lane: "l1" } }, edges: {} },
      view: { nodes: { n1: { x: 0, y: 0, collapsed: false } }, lanes: { l1: { y: 0, h: 160 } } },
    }
    const r = parseDocument(v2(flow))
    expect(r.ok && r.document.diagram.flow.model.lanes.map((l) => l.name)).toEqual(["A"])
    expect(r.ok && Object.keys(r.document.diagram.er.model.entities)).toEqual([])
  })

  it("la migrazione è pura: due esecuzioni danno lo stesso documento", () => {
    const text = v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } })
    expect(parseDocument(text)).toEqual(parseDocument(text))
  })
})

/** Un documento v3 com'era su disco: le tre famiglie, senza la parte dei collegamenti. */
function v3Text(): string {
  const doc = JSON.parse(toJson(createDocument("Prova", "v3doc"))) as { schemaVersion: number; diagram: Record<string, unknown> }
  delete doc.diagram.links
  return JSON.stringify({ ...doc, schemaVersion: 3 })
}

describe("migrazione 3 → 4", () => {
  it("un documento v3 prende la parte dei collegamenti, vuota", () => {
    const r = parseDocument(v3Text())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(5)
    expect(r.document.diagram.links).toEqual({})
  })

  it("un documento v2 arriva alla 4 passando dalla 3", () => {
    const r = parseDocument(v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } }))
    expect(r.ok && r.document.diagram.links).toEqual({})
  })
})

describe("migrazione 4 → 5", () => {
  it("un documento v4 con un «mappa su» passa intatto, alla versione 5", () => {
    const doc = JSON.parse(toJson(createDocument("Prova", "v4doc"))) as { schemaVersion: number; diagram: { links: Record<string, unknown> } }
    doc.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
    const r = parseDocument(JSON.stringify({ ...doc, schemaVersion: 4 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(5)
    expect(r.document.diagram.links).toEqual({ l1: { kind: "maps-to", source: "class/Ordine", target: "er/ordini" } })
  })
})
