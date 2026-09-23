import { describe, expect, it } from "vitest"
import type { FlowModel, FlowShape } from "@/model/flow/schema"
import { emitFlowMermaid } from "./flow-mermaid"

/** Stessa forma del `model()` di `validate.test.ts`: una corsia sola di default, chiamante libero
 *  di sovrascriverla con `lanes` quando il caso vuole più corsie. */
const lane = { id: "l1", name: "corsia" }
const model = (over: Partial<FlowModel>): FlowModel => ({ lanes: [lane], nodes: {}, edges: {}, ...over })
const n = (label: string, shape: FlowShape, l = "l1") => ({ label, shape, lane: l })
const e = (source: string, target: string, label = "") => ({ source, target, label })

describe("emitFlowMermaid: apertura e struttura", () => {
  it("la prima riga è flowchart LR", () => {
    const m = model({ nodes: { a: n("x", "process") }, edges: {} })
    expect(emitFlowMermaid(m).text.split("\n")[0]).toBe("flowchart LR")
  })

  it("modello vuoto: documento valido, warnings vuoto", () => {
    const { text, warnings } = emitFlowMermaid(model({}))
    expect(text).toBe("flowchart LR\n")
    expect(warnings).toEqual([])
  })

  it("due corsie escono come due subgraph, nell'ordine di model.lanes", () => {
    const m = model({
      lanes: [{ id: "l1", name: "prima" }, { id: "l2", name: "seconda" }],
      nodes: { a: n("A", "process", "l1"), b: n("B", "process", "l2") },
      edges: {},
    })
    const { text } = emitFlowMermaid(m)
    const iPrima = text.indexOf('subgraph l1["prima"]')
    const iSeconda = text.indexOf('subgraph l2["seconda"]')
    expect(iPrima).toBeGreaterThanOrEqual(0)
    expect(iSeconda).toBeGreaterThan(iPrima)
  })

  it("almeno una subgraph produce sempre un avviso sulle corsie", () => {
    const m = model({ nodes: { a: n("x", "process") }, edges: {} })
    const { warnings } = emitFlowMermaid(m)
    expect(warnings.some((w) => w.includes("corsi"))).toBe(true)
  })

  it("una corsia senza nodi visibili non emette una subgraph vuota", () => {
    const m = model({
      lanes: [{ id: "l1", name: "piena" }, { id: "l2", name: "vuota" }],
      nodes: { a: n("A", "process", "l1") },
      edges: {},
    })
    const { text } = emitFlowMermaid(m)
    expect(text).not.toContain("vuota")
  })
})

describe("emitFlowMermaid: le cinque forme", () => {
  it("process", () => {
    const m = model({ nodes: { a: n("x", "process") } })
    expect(emitFlowMermaid(m).text).toContain('n1["x"]')
  })

  it("decision", () => {
    const m = model({ nodes: { a: n("x", "decision") } })
    expect(emitFlowMermaid(m).text).toContain('n1{"x"}')
  })

  it("terminal", () => {
    const m = model({ nodes: { a: n("x", "terminal") } })
    expect(emitFlowMermaid(m).text).toContain('n1(["x"])')
  })

  it("io", () => {
    const m = model({ nodes: { a: n("x", "io") } })
    expect(emitFlowMermaid(m).text).toContain('n1[/"x"/]')
  })

  it("subprocess", () => {
    const m = model({ nodes: { a: n("x", "subprocess") } })
    expect(emitFlowMermaid(m).text).toContain('n1[["x"]]')
  })
})

describe("emitFlowMermaid: archi", () => {
  it("arco con etichetta: n1 -->|\"sì\"| n2", () => {
    const m = model({ nodes: { a: n("A", "process"), b: n("B", "process") }, edges: { e1: e("a", "b", "sì") } })
    expect(emitFlowMermaid(m).text).toContain('n1 -->|"sì"| n2')
  })

  it("arco senza etichetta: n1 --> n2, senza pipe vuote", () => {
    const m = model({ nodes: { a: n("A", "process"), b: n("B", "process") }, edges: { e1: e("a", "b") } })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain("n1 --> n2")
    expect(text).not.toContain("|")
  })
})

describe("emitFlowMermaid: id rigenerati", () => {
  it("gli id sono n1..nN e non gli uuid del modello", () => {
    const m = model({ nodes: { "0f9e-uuid-lungo": n("x", "process") }, edges: {} })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain("n1[")
    expect(text).not.toContain("0f9e-uuid-lungo")
  })
})

describe("emitFlowMermaid: note omesse", () => {
  it("le note non escono, e l'avviso dice quante — una volta sola, non una per nota", () => {
    const m = model({
      nodes: { a: n("x", "process"), n1: n("nota", "note"), n2: n("altra", "note") },
      edges: {},
    })
    const { text, warnings } = emitFlowMermaid(m)
    expect(text).not.toContain("nota")
    expect(warnings.filter((w) => w.includes("nota") || w.includes("note"))).toHaveLength(1)
    expect(warnings.join(" ")).toContain("2")
  })

  it("una corsia con solo note non emette una subgraph, ma le conta comunque nell'avviso", () => {
    const m = model({
      lanes: [{ id: "l1", name: "vera" }, { id: "l2", name: "solo-note" }],
      nodes: { a: n("A", "process", "l1"), x: n("nota", "note", "l2") },
      edges: {},
    })
    const { text, warnings } = emitFlowMermaid(m)
    expect(text).not.toContain("solo-note")
    expect(warnings.join(" ")).toContain("1")
  })

  it("un arco che tocca una nota non esce, ed è contato in un avviso — non è già coperto da flow-dangling-edge: la nota è un nodo vero del modello", () => {
    const m = model({
      nodes: { a: n("A", "process"), x: n("nota", "note") },
      edges: { e1: e("a", "x") },
    })
    const { text, warnings } = emitFlowMermaid(m)
    expect(text).not.toContain("-->")
    const edgeWarnings = warnings.filter((w) => w.includes("arch") && (w.includes("nota") || w.includes("note")))
    expect(edgeWarnings).toHaveLength(1)
    expect(edgeWarnings[0]).toContain("1")
  })

  it("più archi verso note si aggregano in un solo avviso col conteggio, non uno a riga", () => {
    const m = model({
      nodes: { a: n("A", "process"), b: n("B", "process"), x: n("nota", "note"), y: n("altra", "note") },
      edges: { e1: e("a", "x"), e2: e("b", "y") },
    })
    const { text, warnings } = emitFlowMermaid(m)
    expect(text).not.toContain("-->")
    const edgeWarnings = warnings.filter((w) => w.includes("arch") && (w.includes("nota") || w.includes("note")))
    expect(edgeWarnings).toHaveLength(1)
    expect(edgeWarnings[0]).toContain("2")
  })
})

describe("emitFlowMermaid: escaping", () => {
  it("l'etichetta va sempre fra virgolette, e le parentesi quadre non rompono l'uscita", () => {
    const m = model({ nodes: { a: n("array[0]", "process") }, edges: {} })
    expect(emitFlowMermaid(m).text).toContain('n1["array[0]"]')
  })

  it("gli a capo diventano <br/>, non restano a capo dentro le virgolette", () => {
    const m = model({ nodes: { a: n("prima\nseconda", "process") }, edges: {} })
    expect(emitFlowMermaid(m).text).toContain('n1["prima<br/>seconda"]')
    expect(emitFlowMermaid(m).text).not.toContain('"prima\nseconda"')
  })

  it("più a capo diventano tutti <br/>, non solo il primo", () => {
    const m = model({ nodes: { a: n("uno\ndue\ntre", "process") }, edges: {} })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain('n1["uno<br/>due<br/>tre"]')
    expect(text).not.toContain("\n\n") // nessun a capo vero sopravvive dentro l'etichetta
    expect(text.includes("due\ntre")).toBe(false)
  })

  it('una virgoletta nell\'etichetta esce come entità, non rompe le virgolette Mermaid', () => {
    const m = model({ nodes: { a: n('disse "ciao"', "process") }, edges: {} })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain('n1["disse #quot;ciao#quot;"]')
    expect(text).not.toContain('"disse "ciao""')
  })

  it("la stessa escape vale sull'etichetta di un arco, non solo sui nodi", () => {
    const m = model({
      nodes: { a: n("A", "process"), b: n("B", "process") },
      edges: { e1: e("a", "b", 'passo "due"') },
    })
    expect(emitFlowMermaid(m).text).toContain('n1 -->|"passo #quot;due#quot;"| n2')
  })

  it("un | nell'etichetta di un arco esce come entità: senza mermaid installato non si può verificare se il lexer legge il | come delimitatore, un'entità rende la domanda superflua", () => {
    const m = model({
      nodes: { a: n("A", "process"), b: n("B", "process") },
      edges: { e1: e("a", "b", "uno|due") },
    })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain('n1 -->|"uno#124;due"| n2')
    expect(text).not.toContain('"uno|due"')
  })

  it("un | nell'etichetta di un nodo esce come entità con la stessa regola", () => {
    const m = model({ nodes: { a: n("uno|due", "process") }, edges: {} })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain('n1["uno#124;due"]')
  })

  it("più | in un'etichetta diventano tutti #124;, non solo il primo", () => {
    const m = model({ nodes: { a: n("a|b|c", "process") }, edges: {} })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain('n1["a#124;b#124;c"]')
    expect(text).not.toContain("|")
  })

  it("un'etichetta vuota esce come stringa vuota fra virgolette, non rompe il nodo", () => {
    const m = model({ nodes: { a: n("", "process") }, edges: {} })
    expect(emitFlowMermaid(m).text).toContain('n1[""]')
  })

  it("un nome di corsia con virgolette e a capo è scappato come le etichette dei nodi", () => {
    const m = model({
      lanes: [{ id: "l1", name: 'corsia "1"\nbis' }],
      nodes: { a: n("x", "process") },
      edges: {},
    })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain('subgraph l1["corsia #quot;1#quot;<br/>bis"]')
  })
})
