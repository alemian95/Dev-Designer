import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { addClass } from "@/editor/class/commands"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { renameClassWithNotice } from "./class-rename"

beforeEach(() => documentStore.getState().load(createDocument("t", "t")))

describe("renameClassWithNotice", () => {
  it("il collegamento segue la classe rinominata, e l'annulla lo riporta indietro", () => {
    const { key, recipe } = addClass({}, { x: 0, y: 0 })
    documentStore.getState().dispatch(recipe)
    documentStore.getState().dispatch((draft) => {
      draft.diagram.links["l1"] = { kind: "maps-to", source: qualify("class", key), target: "er/ordini" }
    })
    expect(renameClassWithNotice(key, "Ordine")).toBe(true)
    expect(documentStore.getState().doc.diagram.links["l1"]!.source).toBe("class/Ordine")
    documentStore.getState().undo()
    expect(documentStore.getState().doc.diagram.links["l1"]!.source).toBe(qualify("class", key))
  })
})
