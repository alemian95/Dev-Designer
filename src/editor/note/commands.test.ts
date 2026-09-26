import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { documentStore } from "../document-store"
import { noteDiagram } from "../note-access"
import { addNote, deleteNoteItems, detachNotes, duplicateNotes, noteLayoutGraph, setNoteText } from "./commands"

const state = () => documentStore.getState()
const notes = () => noteDiagram(state().doc).model.notes

/** Una nota ancorata all'entità `ordini`, che esiste. */
function notaAncorata(): string {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.note.model.notes["n1"] = { text: "ciao", anchor: "er/ordini" }
  doc.diagram.note.view.nodes["n1"] = { x: 0, y: 200, collapsed: false }
  state().load(doc)
  return "n1"
}

beforeEach(() => state().load(createDocument("t", "t")))

describe("comandi delle note", () => {
  it("addNote crea una nota libera e vuota, con la view allineata alla griglia", () => {
    const { key, recipe } = addNote({ x: 13, y: 27 })
    state().dispatch(recipe)
    expect(notes()[key]).toEqual({ text: "", anchor: null })
    expect(noteDiagram(state().doc).view.nodes[key]).toEqual({ x: 10, y: 30, collapsed: false })
  })

  it("setNoteText con lo stesso testo non aggiunge una voce di annulla", () => {
    const key = notaAncorata()
    expect(state().dispatch(setNoteText(key, "ciao"))).toBe(false)
    expect(state().dispatch(setNoteText(key, "addio"))).toBe(true)
    expect(notes()[key]!.text).toBe("addio")
  })

  it("detachNotes stacca la nota e la lascia dov'è; su una nota libera non scrive niente", () => {
    const key = notaAncorata()
    state().dispatch(detachNotes([key]))
    expect(notes()[key]!.anchor).toBeNull()
    expect(noteDiagram(state().doc).view.nodes[key]).toEqual({ x: 0, y: 200, collapsed: false })
    expect(state().dispatch(detachNotes([key]))).toBe(false)
  })

  it("deleteNoteItems elimina le note fra i nodi e stacca quelle fra gli archi", () => {
    const key = notaAncorata()
    state().dispatch(deleteNoteItems([], [key])!)
    expect(notes()[key]).toEqual({ text: "ciao", anchor: null })
    state().dispatch(deleteNoteItems([key], [])!)
    expect(notes()[key]).toBeUndefined()
    expect(noteDiagram(state().doc).view.nodes[key]).toBeUndefined()
    expect(deleteNoteItems([], [])).toBeNull()
  })

  it("duplicateNotes copia testo e àncora, con una chiave nuova e lo scarto", () => {
    const key = notaAncorata()
    const dup = duplicateNotes(noteDiagram(state().doc).model, [key])
    state().dispatch(dup.recipe)
    const copy = dup.keys[0]!
    expect(copy).not.toBe(key)
    expect(notes()[copy]).toEqual({ text: "ciao", anchor: "er/ordini" })
    expect(noteDiagram(state().doc).view.nodes[copy]).toEqual({ x: 20, y: 220, collapsed: false })
  })

  it("il grafo di layout ha solo le note libere e quelle con l'àncora pendente", () => {
    notaAncorata()
    const libera = addNote({ x: 0, y: 400 })
    state().dispatch(libera.recipe)
    const pendente = addNote({ x: 0, y: 600 })
    state().dispatch(pendente.recipe)
    state().dispatch((draft) => {
      noteDiagram(draft).model.notes[pendente.key]!.anchor = "er/fantasma"
    })
    expect(noteLayoutGraph(state().doc).nodes.map((n) => n.id).sort()).toEqual([libera.key, pendente.key].sort())
    expect(noteLayoutGraph(state().doc).edges).toEqual([])
  })
})
