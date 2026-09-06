import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument } from "@/model/document"
import { documentStore, HISTORY_LIMIT } from "./document-store"
import { erDiagram } from "./er-access"

const addEntity = (key: string) => (draft: Parameters<typeof erDiagram>[0]) => {
  const d = erDiagram(draft)
  d.model.entities[key] = { name: key, attributes: [] }
  d.view.nodes[key] = { x: 0, y: 0, collapsed: false }
}

/** Catturato al caricamento del modulo, quindi prima che il beforeEach chiami load(): è lo stato iniziale dello store. */
const initialDoc = documentStore.getState().doc

describe("documentStore", () => {
  beforeEach(() => documentStore.getState().load(createErDocument("t", "t")))

  it("dispatch applica la modifica e la mette nella pila undo", () => {
    expect(documentStore.getState().dispatch(addEntity("a"))).toBe(true)
    expect(Object.keys(erDiagram(documentStore.getState().doc).model.entities)).toEqual(["a"])
    expect(documentStore.getState().past).toHaveLength(1)
  })

  it("un comando senza effetto non entra nella storia", () => {
    expect(documentStore.getState().dispatch(() => {})).toBe(false)
    expect(documentStore.getState().past).toHaveLength(0)
  })

  it("undo e redo ripristinano il documento", () => {
    const initial = documentStore.getState().doc
    documentStore.getState().dispatch(addEntity("a"))
    const afterA = documentStore.getState().doc
    documentStore.getState().dispatch(addEntity("b"))
    documentStore.getState().undo()
    expect(documentStore.getState().doc).toEqual(afterA)
    documentStore.getState().undo()
    expect(documentStore.getState().doc).toEqual(initial)
    documentStore.getState().redo()
    expect(documentStore.getState().doc).toEqual(afterA)
  })

  it("un nuovo comando svuota il redo", () => {
    documentStore.getState().dispatch(addEntity("a"))
    documentStore.getState().undo()
    documentStore.getState().dispatch(addEntity("c"))
    expect(documentStore.getState().future).toHaveLength(0)
  })

  it("la storia è limitata", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) documentStore.getState().dispatch(addEntity(`e${i}`))
    expect(documentStore.getState().past).toHaveLength(HISTORY_LIMIT)
  })

  it("il documento iniziale non è mutabile, anche senza load", () => {
    expect(() => {
      ;(initialDoc as { name: string }).name = "x"
    }).toThrow()
    expect(() => {
      erDiagram(initialDoc).model.entities["a"] = { name: "a", attributes: [] }
    }).toThrow()
  })

  it("il documento non è mutabile dall'esterno", () => {
    documentStore.getState().dispatch(addEntity("a"))
    const doc = documentStore.getState().doc
    expect(() => {
      ;(doc as { name: string }).name = "x"
    }).toThrow()
  })
})
