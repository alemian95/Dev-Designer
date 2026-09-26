// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { selId, sessionStore } from "@/editor/session-store"
import { shapeDiagram } from "@/editor/shape-access"
import { createDocument } from "@/model/document"
import { ShapeProperties } from "./ShapeProperties"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const arrow = () => shapeDiagram(documentStore.getState().doc).model.arrows["f"]!

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.shape.model.shapes = { a: { kind: "rect", label: "A" }, b: { kind: "ellipse", label: "B" } }
  doc.diagram.shape.model.arrows = { f: { source: "a", target: "b", head: "end", dashed: false } }
  doc.diagram.shape.view.nodes = { a: { x: 0, y: 0, collapsed: false, w: null, h: null }, b: { x: 300, y: 0, collapsed: false, w: null, h: null } }
  documentStore.getState().load(doc)
  sessionStore.getState().setSelection([selId("edge", qualify("shape", "f"))])
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(<ShapeProperties />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("pannello della freccia", () => {
  it("«Punte» ha le tre voci e cambia la punta", () => {
    const select = container.querySelector<HTMLSelectElement>("#arrow-head")!
    expect([...select.options].map((o) => o.textContent)).toEqual(["Nessuna", "Alla fine", "Entrambe"])
    act(() => {
      select.value = "both"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(arrow().head).toBe("both")
  })

  it("«Tratteggiata» e «Inverti» cambiano la freccia", () => {
    act(() => container.querySelector<HTMLInputElement>("#arrow-dashed")!.click())
    expect(arrow().dashed).toBe(true)
    const inverti = [...container.querySelectorAll("button")].find((b) => b.textContent === "Inverti")!
    act(() => inverti.click())
    expect(arrow()).toMatchObject({ source: "b", target: "a" })
  })
})
