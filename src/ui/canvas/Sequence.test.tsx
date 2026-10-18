// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { selId, sessionStore } from "@/editor/session-store"
import { createDocument } from "@/model/document"
import type { Sequence, Step } from "@/model/sequence/schema"
import { sequenceLayout } from "@/editor/sequence/layout"
import { SequenceDropLine, SequenceNode, SequenceNodeView } from "./Sequence"
import { hitTest } from "./use-canvas-interaction"

const view = { x: 0, y: 0, collapsed: false }
const msg = (id: string, from: string, to: string, extra: Partial<Extract<Step, { kind: "message" }>> = {}): Step => ({
  kind: "message", id, from, to, text: id, line: "solid", head: "filled", ...extra,
})
const seq = (over: Partial<Sequence> = {}): Sequence => ({
  title: "Ordine",
  autonumber: false,
  participants: [
    { id: "u", name: "Utente", label: null, kind: "actor" },
    { id: "api", name: "API", label: "Server", kind: "participant" },
  ],
  steps: [
    msg("m1", "u", "api"),
    msg("m2", "api", "api", { line: "dashed", head: "open" }),
    { kind: "note", id: "n1", placement: "left", participants: ["u"], text: "attenzione" },
    { kind: "block", id: "k", operator: "alt", sections: [{ id: "s1", condition: "ok", steps: [msg("m3", "api", "u", { head: "cross" })] }, { id: "s2", condition: "ko", steps: [] }] },
  ],
  ...over,
})
const html = (s: Sequence = seq()) => renderToStaticMarkup(<SequenceNodeView id="sequence/s" sequence={s} view={view} selected={false} />)

describe("SequenceNodeView", () => {
  it("la cornice e ogni partecipante, riga ed etichetta di blocco hanno il loro data-node-id", () => {
    const out = html()
    for (const id of ["", "/u", "/api", "/m1", "/m2", "/m3", "/n1", "/k"]) expect(out).toContain(`data-node-id="sequence/s${id}"`)
    expect(out).toContain('data-lifeline="sequence/s/u"')
    expect(out).toContain('data-lifeline="sequence/s/api"')
  })

  it("disegna etichette, testi, operatore e condizioni, coi testi modificabili marcati", () => {
    const out = html()
    for (const t of [">sd Ordine<", ">Server<", ">Utente<", ">attenzione<", ">alt<", ">ko<"]) expect(out).toContain(t)
    expect(out).toContain('data-sequence-text="m1"')
    expect(out).toMatch(/>\[<tspan data-sequence-text="s1">ok<\/tspan>\]</)
  })

  it("una condizione vuota lascia il suo tspan, vuoto, senza parentesi", () => {
    const s = seq({ steps: [{ kind: "block", id: "k", operator: "loop", sections: [{ id: "s1", condition: "", steps: [] }] }] })
    expect(html(s)).toMatch(/>\s*<tspan data-sequence-text="s1"><\/tspan><\/text>/)
    expect(html(s)).not.toContain("[")
  })

  it("un sotto-elemento selezionato ha il contorno sul suo rettangolo", () => {
    const head = sequenceLayout(seq()).columns.api!.head
    const out = renderToStaticMarkup(<SequenceNodeView id="sequence/s" sequence={seq()} view={view} selected={false} selectedSubs={["api"]} />)
    expect(out).toContain(`<rect x="${head.x}" y="${head.y}" width="${head.w}" height="${head.h}" fill="none" stroke="var(--primary)"`)
    expect(html()).not.toContain('stroke="var(--primary)"')
  })

  it("un messaggio a sé stesso `double` ha la punta di partenza rivolta verso la linea di vita", () => {
    const s = seq({ steps: [msg("m", "api", "api", { head: "double" })] })
    const l = sequenceLayout(s)
    const x = l.columns.api!.x
    const y = l.rows.m!.y + l.rows.m!.h - 10 - 22
    expect(html(s)).toContain(`d="M${x} ${y} L${x + 10} ${y - 5} L${x + 10} ${y + 5} Z"`)
  })

  it("il titolo vuoto lascia «sd» da solo", () => {
    expect(html(seq({ title: "" }))).toContain(">sd<")
  })

  it("autonumber mette il numero davanti al testo, in ordine anche dentro i blocchi", () => {
    const out = html(seq({ autonumber: true }))
    expect(out).toMatch(/>1\. <\/tspan><tspan[^>]*>m1</)
    expect(out).toMatch(/>3\. <\/tspan><tspan[^>]*>m3</)
    expect(html()).not.toContain("1. ")
  })

  it("una risposta è tratteggiata", () => {
    expect(html()).toContain('stroke-dasharray="6 4"')
  })

  it("sulla testa del primo partecipante vince la testa, non l'etichetta «sd» che la copre", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.innerHTML = html()
    const head = svg.querySelector('[data-node-id="sequence/s/u"] rect')!
    expect(hitTest(head)).toEqual({ kind: "node", key: "sequence/s/u", backdrop: false })
    // L'intestazione «sd» sta prima delle teste nel DOM, quindi sotto: dove non c'è testa, colpisce la cornice.
    const all = [...svg.querySelectorAll("[data-node-id]")].map((el) => el.getAttribute("data-node-id"))
    expect(all[0]).toBe("sequence/s")
    const tab = svg.querySelector("[data-sequence-header]")!
    expect(hitTest(tab)).toEqual({ kind: "node", key: "sequence/s", backdrop: false })
    expect(tab.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("l'etichetta di un blocco sta sopra le fasce di presa delle linee di vita", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.innerHTML = html()
    const label = svg.querySelector('[data-node-id="sequence/s/k"] path')!
    expect(hitTest(label)).toEqual({ kind: "node", key: "sequence/s/k", backdrop: false })
    // L'ordine del DOM è l'ordine di disegno: `elementFromPoint` trova per prima l'etichetta.
    for (const life of svg.querySelectorAll("[data-lifeline]")) {
      expect(life.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it("l'omino segue la y della testa", () => {
    const head = sequenceLayout(seq()).columns.u!.head
    expect(html()).toContain(`<circle cx="${sequenceLayout(seq()).columns.u!.x}" cy="${head.y + 6}"`)
  })
})

describe("SequenceDropLine", () => {
  const line = (stepId: string, dy: number) =>
    renderToStaticMarkup(<SequenceDropLine sequence={seq()} view={{ x: 100, y: 50 }} stepId={stepId} dy={dy} />)

  it("disegna lo slot di stepDrop (scendendo conta il bordo basso), largo quanto la sezione che lo contiene", () => {
    const l = sequenceLayout(seq())
    const m1 = l.rows.m1!
    const slot = l.slots.find((x) => x.container === "s2" && x.index === 0)!
    const sec = l.blocks.k!.sections.s2!
    const y = 50 + slot.y - 3
    expect(line("m1", slot.y - (m1.y + m1.h))).toContain(`x1="${100 + sec.x}" x2="${100 + sec.x + sec.w}" y1="${y}" y2="${y}"`)
  })

  it("in cima alla sequenza è larga quanto la sequenza", () => {
    const l = sequenceLayout(seq())
    expect(line("m2", -1000)).toContain(`x1="100" x2="${100 + l.width}"`)
  })

  it("niente per un partecipante", () => {
    expect(line("api", 0)).toBe("")
  })
})

describe("SequenceNode", () => {
  it("contorna un sotto-elemento selezionato come arco, come il messaggio appena creato con Collega", () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const doc = createDocument("t", "t")
    doc.diagram.sequence.model.sequences["s"] = seq()
    doc.diagram.sequence.view.nodes["s"] = view
    documentStore.getState().load(doc)
    sessionStore.getState().setSelection([selId("edge", "sequence/s/m1")])
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    document.body.append(svg)
    const root = createRoot(svg)
    act(() => root.render(<SequenceNode nodeKey="s" />))
    const row = sequenceLayout(seq()).rows.m1!
    expect(svg.innerHTML).toContain(`<rect x="${row.x}" y="${row.y}" width="${row.w}" height="${row.h}" fill="none" stroke="var(--primary)"`)
    act(() => root.unmount())
    svg.remove()
    sessionStore.getState().setSelection([])
  })
})
