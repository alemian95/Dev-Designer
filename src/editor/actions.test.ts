import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument } from "@/model/document"
import { deleteSelection, duplicateSelection, fitToContent, selectAllEntities, zoomBy } from "./actions"
import { documentStore } from "./document-store"
import { erDiagram } from "./er-access"
import { selId, sessionStore } from "./session-store"
import { IDENTITY } from "./viewport"

describe("actions", () => {
  beforeEach(() => {
    const doc = createErDocument("t", "t")
    for (const [key, x] of [["a", 0], ["b", 300]] as const) {
      doc.diagram.model.entities[key] = { name: key, attributes: [] }
      doc.diagram.view.nodes[key] = { x, y: 0, collapsed: true }
    }
    doc.diagram.model.relationships.r = {
      source: { entity: "a", attributes: [], cardinality: "many" },
      target: { entity: "b", attributes: [], cardinality: "one" },
      identifying: false,
    }
    documentStore.getState().load(doc)
    sessionStore.setState({ selection: new Set(), viewport: IDENTITY, canvasSize: { w: 1000, h: 800 } })
  })

  it("selectAllEntities seleziona solo le entità", () => {
    selectAllEntities()
    expect([...sessionStore.getState().selection].sort()).toEqual([selId("entity", "a"), selId("entity", "b")])
  })

  it("deleteSelection elimina e svuota la selezione", () => {
    sessionStore.getState().setSelection([selId("entity", "a")])
    deleteSelection()
    expect(erDiagram(documentStore.getState().doc).model.entities.a).toBeUndefined()
    expect(erDiagram(documentStore.getState().doc).model.relationships.r).toBeUndefined()
    expect(sessionStore.getState().selection.size).toBe(0)
  })

  it("duplicateSelection seleziona le copie", () => {
    sessionStore.getState().setSelection([selId("entity", "a"), selId("relationship", "r")])
    duplicateSelection()
    expect([...sessionStore.getState().selection]).toEqual([selId("entity", "a_copy")])
  })

  it("fitToContent inquadra le entità; zoomBy scala attorno al centro", () => {
    fitToContent()
    expect(sessionStore.getState().viewport.scale).toBe(1)
    expect(sessionStore.getState().viewport.x).toBe((1000 - 460) / 2)
    zoomBy(2)
    expect(sessionStore.getState().viewport.scale).toBe(2)
  })
})
