import { describe, expect, it } from "vitest"
import type { FlowModel, FlowShape } from "@/model/flow/schema"
import { emitFlowMermaid } from "./flow-mermaid"

/** Un pool `p1` con una corsia sola di default; il chiamante può sostituire `pools` quando il caso vuole più corsie o più pool. */
const lane = { id: "l1", name: "corsia" }
const model = (over: Partial<FlowModel>): FlowModel => ({ pools: { p1: { name: "pool", lanes: [lane] } }, nodes: {}, edges: {}, ...over })
const n = (label: string, shape: FlowShape, l: string | null = "l1") => ({ label, shape, lane: l })
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

  it("due corsie escono come due subgraph, nell'ordine del pool", () => {
    const m = model({
      pools: { p1: { name: "pool", lanes: [{ id: "l1", name: "prima" }, { id: "l2", name: "seconda" }] } },
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
      pools: { p1: { name: "pool", lanes: [{ id: "l1", name: "piena" }, { id: "l2", name: "vuota" }] } },
      nodes: { a: n("A", "process", "l1") },
      edges: {},
    })
    const { text } = emitFlowMermaid(m)
    expect(text).not.toContain("vuota")
  })

  it("un pool esce come subgraph che contiene quelle delle sue corsie", () => {
    const { text } = emitFlowMermaid(model({ nodes: { a: n("x", "process") } }))
    expect(text).toContain('  subgraph p1["pool"]\n    subgraph l1["corsia"]\n      n1["x"]\n    end\n  end\n')
  })

  it("i nodi liberi escono fuori da ogni subgraph, e senza pool non c'è l'avviso sulle corsie", () => {
    const { text, warnings } = emitFlowMermaid(model({ pools: {}, nodes: { a: n("A", "process", null) } }))
    expect(text).toBe('flowchart LR\n  n1["A"]\n')
    expect(warnings).toEqual([])
  })

  it("i liberi vengono prima dei pool", () => {
    const { text } = emitFlowMermaid(model({ nodes: { a: n("dentro", "process"), b: n("fuori", "process", null) } }))
    expect(text.indexOf('"fuori"')).toBeLessThan(text.indexOf("subgraph p1"))
  })

  it("i pool escono per nome, non per id né per posizione", () => {
    const { text } = emitFlowMermaid(
      model({
        pools: { z: { name: "A", lanes: [{ id: "l1", name: "uno" }] }, a: { name: "B", lanes: [{ id: "l2", name: "due" }] } },
        nodes: { x: n("X", "process", "l1"), y: n("Y", "process", "l2") },
      }),
    )
    expect(text.indexOf('["A"]')).toBeLessThan(text.indexOf('["B"]'))
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

describe("emitFlowMermaid: le note ancorate al flusso", () => {
  const model = { pools: {}, nodes: { n1: { label: "Ordina", shape: "process" as const, lane: null } }, edges: {} }

  it("non escono, e l'avviso le conta al singolare", () => {
    const { text, warnings } = emitFlowMermaid(model, { a: { text: "x", anchor: "flow/n1" } })
    expect(text).not.toContain("x")
    expect(warnings).toContain("1 nota ancorata al flusso non è uscita: i flowchart di Mermaid non hanno note.")
  })

  it("al plurale, contando anche quelle ancorate a un pool, e ignorando le altre", () => {
    const { warnings } = emitFlowMermaid(model, {
      a: { text: "", anchor: "flow/n1" },
      b: { text: "", anchor: "flow/p1" },
      c: { text: "", anchor: "class/Ordine" },
      d: { text: "", anchor: null },
    })
    expect(warnings).toContain("2 note ancorate al flusso non sono uscite: i flowchart di Mermaid non hanno note.")
  })

  it("senza note ancorate al flusso non c'è nessun avviso sulle note", () => {
    expect(emitFlowMermaid(model).warnings.some((w) => w.includes("nota") || w.includes("note"))).toBe(false)
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
      pools: { p1: { name: "pool", lanes: [{ id: "l1", name: 'corsia "1"\nbis' }] } },
      nodes: { a: n("x", "process") },
      edges: {},
    })
    const { text } = emitFlowMermaid(m)
    expect(text).toContain('subgraph l1["corsia #quot;1#quot;<br/>bis"]')
  })
})
