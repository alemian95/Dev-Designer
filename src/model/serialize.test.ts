import { describe, expect, it } from "vitest"
import { createErDocument, SCHEMA_VERSION } from "./document"
import { migrateDocument } from "./migrations"
import { parseDocument, toJson } from "./serialize"

describe("toJson", () => {
  it("ordina le chiavi in modo stabile e termina con newline", () => {
    const doc = createErDocument("Prova", "doc-1")
    doc.diagram.model.entities.zeta = { name: "zeta", attributes: [] }
    doc.diagram.model.entities.alpha = { name: "alpha", attributes: [] }
    const json = toJson(doc)
    expect(json.indexOf('"alpha"')).toBeLessThan(json.indexOf('"zeta"'))
    expect(json.indexOf('"diagram"')).toBeLessThan(json.indexOf('"id"'))
    expect(json.endsWith("\n")).toBe(true)
  })

  it("il round trip restituisce un documento uguale", () => {
    const doc = createErDocument("Prova", "doc-1")
    doc.diagram.model.entities.users = {
      name: "users",
      attributes: [{ name: "id", type: "int", primaryKey: true, foreignKey: false, nullable: false, unique: false }],
    }
    doc.diagram.view.nodes.users = { x: 10, y: 20, collapsed: false }
    const result = parseDocument(toJson(doc))
    expect(result).toEqual({ ok: true, document: doc })
  })
})

describe("parseDocument", () => {
  it("segnala JSON non valido", () => {
    expect(parseDocument("{").ok).toBe(false)
  })

  it("rifiuta una versione più recente di quella supportata", () => {
    const doc = { ...createErDocument("x", "id"), schemaVersion: SCHEMA_VERSION + 1 }
    const result = parseDocument(JSON.stringify(doc))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/più recente/)
  })

  it("rifiuta un documento che non rispetta lo schema", () => {
    const result = parseDocument(JSON.stringify({ schemaVersion: 1, id: "x", name: "n", diagram: { type: "er" } }))
    expect(result.ok).toBe(false)
  })
})

describe("migrateDocument", () => {
  it("non tocca un documento già alla versione corrente", () => {
    const doc = createErDocument("x", "id")
    expect(migrateDocument(doc)).toEqual({ ok: true, value: doc })
  })

  it("rifiuta schemaVersion mancante", () => {
    expect(migrateDocument({ id: "x" }).ok).toBe(false)
  })
})
