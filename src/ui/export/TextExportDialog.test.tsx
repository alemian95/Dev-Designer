// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
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
})
