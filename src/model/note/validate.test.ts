import { describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "../document"
import { anchorExists, validateNotes } from "./validate"

/** Un'entità, una classe, un nodo di flusso e un pool. */
function documento(): DevDocument {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.class.model.classes["Ordine"] = { name: "Ordine", stereotype: "class", attributes: [], methods: [] }
  doc.diagram.flow.model.nodes["n1"] = { label: "Ordina", shape: "process", lane: null }
  doc.diagram.flow.model.pools["p1"] = { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] }
  return doc
}

describe("anchorExists", () => {
  it("riconosce entità, classi, nodi di flusso e pool", () => {
    const doc = documento()
    for (const anchor of ["er/ordini", "class/Ordine", "flow/n1", "flow/p1"]) expect(anchorExists(doc, anchor)).toBe(true)
  })

  it("un elemento che non c'è non è un'àncora, e nemmeno una nota", () => {
    const doc = documento()
    doc.diagram.note.model.notes["n2"] = { text: "", anchor: null }
    for (const anchor of ["er/clienti", "class/Cliente", "flow/n9", "note/n2"]) expect(anchorExists(doc, anchor)).toBe(false)
  })
})

describe("validateNotes", () => {
  it("una nota libera o ancorata a un elemento che c'è non ha problemi", () => {
    const doc = documento()
    doc.diagram.note.model.notes["a"] = { text: "", anchor: null }
    doc.diagram.note.model.notes["b"] = { text: "", anchor: "flow/p1" }
    expect(validateNotes(doc)).toEqual([])
  })

  it("un'àncora pendente dà note-dangling-anchor sulla nota", () => {
    const doc = documento()
    doc.diagram.note.model.notes["a"] = { text: "", anchor: "er/clienti" }
    expect(validateNotes(doc)).toEqual([
      { code: "note-dangling-anchor", severity: "error", node: "a", message: "La nota è ancorata a un elemento che non c'è." },
    ])
  })
})
