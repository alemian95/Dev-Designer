// @vitest-environment jsdom
//
// jsdom e non l'ambiente di default (node): `LanesLayer` sotto monta il componente connesso allo
// store con `react-dom/client`, che ha bisogno di un DOM per esistere — stessa ragione di
// `class-render.test.tsx`. `renderToStaticMarkup` (per `LanesLayerView`) funziona comunque sotto
// jsdom, quindi il cambio d'ambiente non lo riguarda.
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { laneBandExtent } from "@/editor/flow/geometry"
import { createErDocument } from "@/model/er/schema"
import { createFlowDocument, type FlowDocument } from "@/model/flow/schema"
import { LanesLayer, LanesLayerView } from "./LanesLayer"

describe("LanesLayerView", () => {
  const lanes = [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Backoffice" }]
  const bands = { l1: { y: 0, h: 100 }, l2: { y: 100, h: 150 } }

  it("disegna un rettangolo e un'etichetta per corsia, sull'estensione data", () => {
    const html = renderToStaticMarkup(<LanesLayerView lanes={lanes} bands={bands} x={-40} w={300} />)
    expect(html).toContain('data-layer="lanes"')
    expect(html).toContain(">Cliente<")
    expect(html).toContain(">Backoffice<")
    // La banda di l2 usa y/h della propria vista, non quella di l1.
    expect(html).toContain('y="100"')
    expect(html).toContain('height="150"')
    // x e larghezza vengono dalle prop, non ricalcolate: la stessa estensione per ogni corsia.
    expect((html.match(/x="-40"/g) ?? []).length).toBe(2)
    expect((html.match(/width="300"/g) ?? []).length).toBe(2)
  })

  it("una corsia senza banda nella vista non produce nulla, invece di rompersi", () => {
    const html = renderToStaticMarkup(<LanesLayerView lanes={lanes} bands={{ l1: { y: 0, h: 100 } }} x={0} w={100} />)
    expect(html).toContain(">Cliente<")
    expect(html).not.toContain(">Backoffice<")
  })
})

describe("LanesLayer — connesso allo store", () => {
  it("un documento non-flow non monta nessun layer di corsie", () => {
    documentStore.getState().load(createErDocument("t"))
    const container = document.createElement("div")
    const root = createRoot(container)
    try {
      act(() => {
        root.render(<LanesLayer />)
      })
      expect(container.innerHTML).toBe("")
    } finally {
      root.unmount()
    }
  })

  it("un flowchart monta le bande con la stessa estensione di laneBandExtent", () => {
    const doc: FlowDocument = createFlowDocument("t")
    const laneId = doc.diagram.model.lanes[0]!.id
    doc.diagram.model.nodes["n1"] = { label: "avvio", shape: "terminal", lane: laneId }
    doc.diagram.view.nodes["n1"] = { x: 200, y: 10, collapsed: false }
    documentStore.getState().load(doc)

    const container = document.createElement("div")
    const root = createRoot(container)
    try {
      act(() => {
        root.render(<LanesLayer />)
      })
      expect(container.innerHTML).toContain('data-layer="lanes"')
      expect(container.innerHTML).toContain(">Corsia 1<")
      const { x, w } = laneBandExtent(doc.diagram)
      expect(container.innerHTML).toContain(`x="${x}"`)
      expect(container.innerHTML).toContain(`width="${w}"`)
    } finally {
      root.unmount()
    }
  })
})
