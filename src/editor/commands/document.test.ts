import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { documentStore } from "../document-store"
import { renameDocument } from "./document"

const state = () => documentStore.getState()

beforeEach(() => state().load(createDocument("Senza titolo")))

describe("renameDocument", () => {
  it("rinomina togliendo gli spazi agli estremi, e l'undo lo riporta indietro", () => {
    expect(state().dispatch(renameDocument("  Ordini  ")!)).toBe(true)
    expect(state().doc.name).toBe("Ordini")
    state().undo()
    expect(state().doc.name).toBe("Senza titolo")
    state().redo()
    expect(state().doc.name).toBe("Ordini")
  })

  it("un nome vuoto o di soli spazi non produce recipe", () => {
    expect(renameDocument("")).toBeNull()
    expect(renameDocument("   ")).toBeNull()
  })

  it("lo stesso nome non produce una voce di undo", () => {
    expect(state().dispatch(renameDocument("Senza titolo ")!)).toBe(false)
    expect(state().past).toHaveLength(0)
  })
})
