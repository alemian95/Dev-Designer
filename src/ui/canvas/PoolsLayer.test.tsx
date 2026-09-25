// @vitest-environment jsdom
//
// jsdom e non l'ambiente di default (node): `PoolsLayer` sotto monta il componente connesso allo
// store con `react-dom/client`, che ha bisogno di un DOM.
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { withPool } from "@/editor/flow/pool-fixture"
import { createDocument } from "@/model/document"
import { POOL_HEADER_W } from "@/model/flow/schema"
import { PoolsLayer, PoolsLayerView } from "./PoolsLayer"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("PoolsLayerView", () => {
  const part = {
    model: { pools: { p1: { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Negozio" }] } } },
    view: { pools: { p1: { x: 10, y: 20, w: 400 } }, lanes: { l1: { h: 100 }, l2: { h: 150 } } },
  }

  it("disegna il pool con il nome sulla striscia e una banda per corsia, impilate", () => {
    const html = renderToStaticMarkup(<PoolsLayerView part={part} />)
    expect(html).toContain('data-layer="pools"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain(">Processo<")
    expect(html).toContain(">Cliente<")
    expect(html).toContain(">Negozio<")
    // In coordinate del pool: la seconda corsia parte dove finisce la prima.
    expect(html).toContain('y="100"')
    expect(html).toContain('height="150"')
    // Le bande saltano la striscia, e ne tolgono la larghezza.
    expect(html).toContain(`x="${POOL_HEADER_W}"`)
    expect(html).toContain(`width="${400 - POOL_HEADER_W}"`)
  })

  it("senza pool il layer è vuoto", () => {
    const html = renderToStaticMarkup(<PoolsLayerView part={{ model: { pools: {} }, view: { pools: {}, lanes: {} } }} />)
    expect(html).toBe('<g data-layer="pools"></g>')
  })
})

describe("PoolsLayer — connesso allo store", () => {
  function monta(): { html: () => string; smonta: () => void } {
    const container = document.createElement("div")
    const root = createRoot(container)
    act(() => root.render(<PoolsLayer />))
    return { html: () => container.innerHTML, smonta: () => act(() => root.unmount()) }
  }

  it("un flowchart senza pool non ha bande, anche con dei nodi", () => {
    const doc = createDocument("t")
    doc.diagram.flow.model.nodes["n1"] = { label: "avvio", shape: "terminal", lane: null }
    doc.diagram.flow.view.nodes["n1"] = { x: 200, y: 10, collapsed: false }
    documentStore.getState().load(doc)
    const { html, smonta } = monta()
    expect(html()).not.toContain("<rect")
    smonta()
  })

  it("un pool si vede anche senza nodi", () => {
    documentStore.getState().load(withPool(createDocument("t")))
    const { html, smonta } = monta()
    expect(html()).toContain(">Pool 1<")
    smonta()
  })
})
