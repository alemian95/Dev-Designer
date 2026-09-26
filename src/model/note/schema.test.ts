import { describe, expect, it } from "vitest"
import { createDocument, DocumentSchema } from "../document"
import { NoteSchema } from "./schema"

describe("NoteSchema", () => {
  it("una nota libera e una ancorata a un elemento di qualunque altra famiglia passano", () => {
    for (const anchor of [null, "er/ordini", "class/Ordine", "flow/n1", "flow/pool-1"]) {
      expect(NoteSchema.safeParse({ text: "x", anchor }).success).toBe(true)
    }
  })

  it("un'àncora nella famiglia delle note, o senza famiglia, rende la nota non valida", () => {
    expect(NoteSchema.safeParse({ text: "x", anchor: "note/n2" }).success).toBe(false)
    expect(NoteSchema.safeParse({ text: "x", anchor: "ordini" }).success).toBe(false)
    expect(NoteSchema.safeParse({ text: "x", anchor: "er/" }).success).toBe(false)
  })

  it("un'àncora pendente passa: la segnala la validazione, non lo schema", () => {
    const doc = createDocument("t", "t")
    doc.diagram.note.model.notes["n1"] = { text: "", anchor: "er/fantasma" }
    doc.diagram.note.view.nodes["n1"] = { x: 0, y: 0, collapsed: false }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("un documento nuovo nasce con la parte delle note vuota", () => {
    expect(createDocument("t", "t").diagram.note).toEqual({ model: { notes: {} }, view: { nodes: {} } })
  })
})
