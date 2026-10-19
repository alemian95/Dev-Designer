// @vitest-environment jsdom
//
// jsdom e un root vero: il render statico leggerebbe lo stato iniziale degli store, non quello caricato.
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { withPool } from "@/editor/flow/pool-fixture"
import { selId, sessionStore } from "@/editor/session-store"
import { createDocument } from "@/model/document"
import { noteSheet, sequenceLayout } from "@/editor/sequence/layout"
import { ResizeHandlesLayer } from "./ResizeHandlesLayer"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const container = document.createElement("div")
let root: ReturnType<typeof createRoot> | null = null
const html = () => container.innerHTML
const select = (...keys: string[]) => act(() => sessionStore.getState().setSelection(keys.map((k) => selId("node", k))))

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

beforeEach(() => {
  const doc = withPool(createDocument("t", "t"))
  doc.diagram.er.model.entities["clienti"] = { name: "clienti", attributes: [] }
  doc.diagram.er.view.nodes["clienti"] = { x: 100, y: 200, collapsed: false }
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.er.view.nodes["ordini"] = { x: 400, y: 200, collapsed: false }
  doc.diagram.sequence.model.sequences["s"] = {
    title: "",
    autonumber: false,
    participants: [{ id: "a", name: "A", label: null, kind: "participant" }],
    steps: [
      { kind: "note", id: "n", placement: "right", participants: ["a"], text: "nota" },
      { kind: "block", id: "k", operator: "opt", sections: [{ id: "x", condition: "", steps: [] }] },
    ],
  }
  doc.diagram.sequence.view.nodes["s"] = { x: 0, y: 0, collapsed: false }
  documentStore.getState().load(doc)
  sessionStore.getState().setViewport({ x: 0, y: 0, scale: 1 })
  sessionStore.getState().setSelection([])
  root = createRoot(container)
  act(() => root!.render(<svg><ResizeHandlesLayer /></svg>))
})

describe("ResizeHandlesLayer", () => {
  it("un nodo selezionato da solo ha una maniglia per spigolo, con la sua chiave", () => {
    select(qualify("er", "clienti"))
    const out = html()
    expect(out.match(/data-resize="er\/clienti"/g)).toHaveLength(4)
    for (const c of ["nw", "ne", "se", "sw"]) expect(out).toContain(`data-resize-handle="${c}"`)
    // La maniglia nw è centrata sullo spigolo in alto a sinistra: 8 px a scala 1.
    const nw = container.querySelector('[data-resize-handle="nw"]')!
    expect(["x", "y", "width", "height"].map((a) => nw.getAttribute(a))).toEqual(["96", "196", "8", "8"])
  })

  it("a scala 2 la maniglia resta di 8 px sullo schermo", () => {
    act(() => sessionStore.getState().setViewport({ x: 0, y: 0, scale: 2 }))
    select(qualify("er", "clienti"))
    expect(container.querySelector("[data-resize]")!.getAttribute("width")).toBe("4")
  })

  it("niente maniglie con due nodi selezionati, per un pool o per un blocco di sequenza", () => {
    select(qualify("er", "clienti"), qualify("er", "ordini"))
    expect(html()).toBe("<svg></svg>")
    select(qualify("flow", "p1"))
    expect(html()).toBe("<svg></svg>")
    select(qualify("sequence", "s/k"))
    expect(html()).toBe("<svg></svg>")
  })

  it("una sequenza e il foglio di una sua nota hanno le loro maniglie", () => {
    select(qualify("sequence", "s"))
    expect(container.querySelectorAll('[data-resize="sequence/s"]')).toHaveLength(4)
    select(qualify("sequence", "s/n"))
    const se = container.querySelector('[data-resize="sequence/s/n"][data-resize-handle="se"]')!
    const sheet = noteSheet(sequenceLayout(documentStore.getState().doc.diagram.sequence.model.sequences["s"]!), {
      kind: "note", id: "n", placement: "right", participants: ["a"], text: "nota",
    })!
    expect(Number(se.getAttribute("x")) + 4).toBe(sheet.x + sheet.w)
  })
})
