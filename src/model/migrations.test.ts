import { describe, expect, it } from "vitest"
import { migrateDocument } from "./migrations"

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

  it("aggiunge notes a un diagramma di classi", () => {
    const out = migrateDocument(v1Class)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(2)
    expect((doc.diagram as { model: { notes: unknown } }).model.notes).toEqual({})
  })

  it("non tocca il modello di un ER, che non ha notes nel suo schema", () => {
    const out = migrateDocument(v1Er)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(2)
    expect((doc.diagram as { model: Record<string, unknown> }).model).toEqual({ entities: {}, relationships: {} })
  })

  it("un documento già alla 2 passa senza toccare niente", () => {
    const v2 = { ...v1Class, schemaVersion: 2, diagram: { ...v1Class.diagram, model: { classes: {}, relations: {}, notes: {} } } }
    expect(migrateDocument(v2)).toEqual({ ok: true, value: v2 })
  })
})
