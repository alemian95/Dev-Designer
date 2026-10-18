// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { documentStore } from "@/editor/document-store"
import { createDocument } from "@/model/document"
import { TextExportDialog } from "./TextExportDialog"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = () => act(() => root.render(<TextExportDialog open={true} onOpenChange={() => {}} />))

describe("TextExportDialog (F2)", () => {
  it("con sole note libere dice che servono le classi, non che il documento è vuoto", () => {
    const doc = createDocument("t", "t")
    doc.diagram.note.model.notes["a"] = { text: "una nota", anchor: null }
    doc.diagram.note.view.nodes["a"] = { x: 0, y: 0, collapsed: false }
    documentStore.getState().load(doc)
    render()
    const dialog = document.querySelector("[data-text-export-dialog]")!
    expect(dialog.textContent).not.toContain("Il documento è vuoto")
    expect(dialog.textContent).toContain("almeno una classe")
  })

  it("un documento davvero vuoto dice ancora che non c'è niente da esportare", () => {
    documentStore.getState().load(createDocument("t", "t"))
    render()
    const dialog = document.querySelector("[data-text-export-dialog]")!
    expect(dialog.textContent).toContain("Il documento è vuoto")
  })

  it("con sole forme dice che escono solo come immagine, non che il documento è vuoto", () => {
    const doc = createDocument("t", "t")
    doc.diagram.shape.model.shapes["a"] = { kind: "rect", label: "API" }
    doc.diagram.shape.view.nodes["a"] = { x: 0, y: 0, collapsed: false, w: null, h: null }
    documentStore.getState().load(doc)
    render()
    const dialog = document.querySelector("[data-text-export-dialog]")!
    expect(dialog.textContent).toContain("Le forme escono solo come immagine")
    expect(dialog.textContent).not.toContain("Il documento è vuoto")
  })

  it("con una nota ancorata a una forma dice che esce solo come immagine, non che serve una classe", () => {
    const doc = createDocument("t", "t")
    doc.diagram.shape.model.shapes["a"] = { kind: "rect", label: "API" }
    doc.diagram.shape.view.nodes["a"] = { x: 0, y: 0, collapsed: false, w: null, h: null }
    doc.diagram.note.model.notes["n"] = { text: "da rivedere", anchor: "shape/a" }
    doc.diagram.note.view.nodes["n"] = { x: 0, y: 200, collapsed: false }
    documentStore.getState().load(doc)
    render()
    const dialog = document.querySelector("[data-text-export-dialog]")!
    expect(dialog.textContent).toContain("le note ancorate a una forma")
    expect(dialog.textContent).not.toContain("almeno una classe")
  })

  it("una nota ancorata a una forma non conta come nota libera con solo forme e nessuna classe", () => {
    const doc = createDocument("t", "t")
    doc.diagram.shape.model.shapes["a"] = { kind: "rect", label: "API" }
    doc.diagram.shape.view.nodes["a"] = { x: 0, y: 0, collapsed: false, w: null, h: null }
    doc.diagram.note.model.notes["n"] = { text: "da rivedere", anchor: "shape/a" }
    doc.diagram.note.view.nodes["n"] = { x: 0, y: 200, collapsed: false }
    documentStore.getState().load(doc)
    render()
    const dialog = document.querySelector("[data-text-export-dialog]")!
    expect(dialog.textContent).not.toContain("Le note libere")
  })

  const withSequences = (count: number) => {
    const doc = createDocument("t", "t")
    for (let i = 1; i <= count; i++) {
      doc.diagram.sequence.model.sequences[`s${i}`] = { title: "", autonumber: false, participants: [], steps: [] }
      doc.diagram.sequence.view.nodes[`s${i}`] = { x: 0, y: 0, collapsed: false }
    }
    return doc
  }

  it("il formato delle sequenze compare solo con sequenze presenti", () => {
    documentStore.getState().load(createDocument("t", "t"))
    render()
    expect(document.querySelector("[data-text-export-dialog]")!.textContent).not.toContain("Mermaid sequenze")
    documentStore.getState().load(withSequences(1))
    render()
    const dialog = document.querySelector("[data-text-export-dialog]")!
    expect(dialog.textContent).toContain("Le Note ancorate non escono")
    expect(dialog.querySelector("[data-export-preview]")!.textContent).toContain("sequenceDiagram")
  })

  it("con due sequenze scarica un file .md", () => {
    documentStore.getState().load(withSequences(2))
    render()
    const downloaded = vi.fn()
    const create = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded(this.download)
    })
    const scarica = [...document.querySelectorAll("button")].find((b) => b.textContent === "Scarica")!
    act(() => scarica.click())
    create.mockRestore()
    expect(downloaded).toHaveBeenCalledWith(expect.stringMatching(/\.md$/))
  })
})
