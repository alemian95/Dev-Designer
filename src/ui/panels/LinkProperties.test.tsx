// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { documentStore } from "@/editor/document-store"
import { selId, sessionStore } from "@/editor/session-store"
import { PropertiesPanel } from "./PropertiesPanel"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.class.model.classes["Ordine"] = {
    name: "Ordine",
    stereotype: "class",
    attributes: [{ name: "note", type: "string", visibility: "public", isStatic: false }],
    methods: [],
  }
  doc.diagram.class.view.nodes["Ordine"] = { x: 400, y: 0, collapsed: false }
  doc.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
  documentStore.getState().load(doc)
  sessionStore.getState().setSelection([selId("edge", "link/l1")])
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(<PropertiesPanel />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  sessionStore.getState().setSelection([])
})

describe("pannello del collegamento", () => {
  it("mostra il tipo, gli estremi e i problemi del collegamento", () => {
    expect(container.textContent).toContain("mappa su")
    expect(container.textContent).toContain("Ordine → ordini")
    expect(container.textContent).toContain("«Ordine.note» non ha una colonna in «ordini»")
  })

  it("mostra anche l'errore della classe («class-maps-multiple») aprendo uno dei due collegamenti", () => {
    // F2 (review finale): il filtro dei problemi include anche quelli sulla classe sorgente.
    act(() => {
      documentStore.getState().dispatch((draft) => {
        draft.diagram.er.model.entities["righe"] = { name: "righe", attributes: [] }
        draft.diagram.er.view.nodes["righe"] = { x: 800, y: 0, collapsed: false }
        draft.diagram.links["l2"] = { kind: "maps-to", source: "class/Ordine", target: "er/righe" }
      })
    })
    expect(container.textContent).toContain("«Ordine» mappa su 2 tabelle: una classe si mappa su una tabella sola")
  })

  it("«Elimina collegamento» lo toglie dal documento e svuota la selezione", () => {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Elimina collegamento")!
    act(() => button.click())
    expect(documentStore.getState().doc.diagram.links).toEqual({})
    expect(sessionStore.getState().selection.size).toBe(0)
  })
})
