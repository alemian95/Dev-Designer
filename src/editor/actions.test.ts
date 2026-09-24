import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument } from "@/model/er/schema"
import { deleteSelection, duplicateSelection, fitToContent, selectAllNodes, zoomBy } from "./actions"
import { documentStore } from "./document-store"
import { erDiagram } from "./er-access"
import { qualify } from "./families"
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

  it("selectAllNodes seleziona solo i nodi", () => {
    selectAllNodes()
    expect([...sessionStore.getState().selection].sort()).toEqual([selId("node", qualify("er", "a")), selId("node", qualify("er", "b"))])
  })

  it("deleteSelection elimina e svuota la selezione", () => {
    sessionStore.getState().setSelection([selId("node", qualify("er", "a"))])
    deleteSelection()
    expect(erDiagram(documentStore.getState().doc).model.entities.a).toBeUndefined()
    expect(erDiagram(documentStore.getState().doc).model.relationships.r).toBeUndefined()
    expect(sessionStore.getState().selection.size).toBe(0)
  })

  it("duplicateSelection seleziona le copie", () => {
    sessionStore.getState().setSelection([selId("node", qualify("er", "a")), selId("edge", qualify("er", "r"))])
    duplicateSelection()
    expect([...sessionStore.getState().selection]).toEqual([selId("node", qualify("er", "a_copy"))])
  })

  it("fitToContent inquadra le entità; zoomBy scala attorno al centro", () => {
    fitToContent()
    expect(sessionStore.getState().viewport.scale).toBe(1)
    expect(sessionStore.getState().viewport.x).toBe((1000 - 460) / 2)
    zoomBy(2)
    expect(sessionStore.getState().viewport.scale).toBe(2)
  })
})
