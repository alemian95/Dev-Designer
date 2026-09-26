// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { selId, sessionStore } from "@/editor/session-store"
import { createDocument } from "@/model/document"
import { NoteProperties } from "./NoteProperties"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.note.model.notes["a"] = { text: "ancorata", anchor: "er/ordini" }
  doc.diagram.note.view.nodes["a"] = { x: 0, y: 200, collapsed: false }
  doc.diagram.note.model.notes["l"] = { text: "libera", anchor: null }
  doc.diagram.note.view.nodes["l"] = { x: 0, y: 400, collapsed: false }
  documentStore.getState().load(doc)
  container = document.createElement("div")
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  sessionStore.getState().setSelection([])
})

const render = () => act(() => root.render(<NoteProperties />))

describe("NoteProperties", () => {
  it("una nota libera mostra il testo e «Libera»", () => {
    sessionStore.getState().setSelection([selId("node", "note/l")])
    render()
    expect(container.querySelector<HTMLTextAreaElement>("#note-text")?.value).toBe("libera")
    expect(container.textContent).toContain("Libera")
  })

  it("una nota ancorata dice a cosa, e «Stacca» la libera", () => {
    sessionStore.getState().setSelection([selId("node", "note/a")])
    render()
    expect(container.textContent).toContain("Ancorata a: ordini")
    const stacca = [...container.querySelectorAll("button")].find((b) => b.textContent === "Stacca")!
    act(() => stacca.click())
    expect(documentStore.getState().doc.diagram.note.model.notes["a"]!.anchor).toBeNull()
    expect(container.textContent).toContain("Libera")
  })

  it("con la linea di ancoraggio selezionata mostra la stessa nota", () => {
    sessionStore.getState().setSelection([selId("edge", "note/a")])
    render()
    expect(container.textContent).toContain("Ancorata a: ordini")
  })
})
