import { describe, expect, it } from "vitest"
import { FLOW_VALID } from "./flow-fixtures"
import { mapFlow } from "./flow-map"
import { parseFlow } from "./flow-parse"

const map = (text: string) => mapFlow(parseFlow(text).ast, text)
const flow = (body: string) => map(`flowchart LR\n  ${body}\n`)

describe("mapFlow: nodi", () => {
  it("dà a ogni forma la sua figura, e il processo con avviso alle altre", () => {
    const { model, warnings } = map(FLOW_VALID.shapes!)
    expect(Object.values(model.nodes).map((n) => n.shape)).toEqual([
      "terminal", "terminal", "terminal", "io", "io", "process", "process", "process", "process", "process", "process", "io", "process", "process",
    ])
    expect(warnings.map((w) => w.message)).toEqual([
      "Forme senza equivalente, lette come processo: a6 (cylinder), a7 (hexagon), a8 (odd), a9 (trapezoid), a10 (inv_trapezoid), a11 (ellipse), a13 (cyl) (righe 7, 8, 9, 10, 11, 12, 14)",
    ])
  })

  it("legge i nomi di @{ shape } della spec, alias compresi", () => {
    const names = { stadium: "terminal", terminal: "terminal", rect: "process", proc: "process", diamond: "decision", decision: "decision",
      "lean-r": "io", "lean-l": "io", "in-out": "io", subproc: "subprocess", "fr-rect": "subprocess" }
    for (const [name, shape] of Object.entries(names)) expect([name, flow(`A@{ shape: ${name} }`).model.nodes.A!.shape]).toEqual([name, shape])
  })

  it("prende l'id come etichetta di un nodo senza testo, e tiene l'ultima forma ed etichetta date", () => {
    expect(flow("A --> B").model.nodes.B).toEqual({ label: "B", shape: "process", lane: null })
    expect(flow("A[Uno]\n  A --> B\n  A{Due}").model.nodes.A).toEqual({ label: "Due", shape: "decision", lane: null })
  })

  it("toglie i backtick alle stringhe markdown, con un avviso, e lascia fa:fa- come testo", () => {
    const { model, warnings } = map(FLOW_VALID.text!)
    expect(model.nodes.A!.label).toBe("**grassetto**")
    expect(model.nodes.B!.label).toBe("fa:fa-car Auto")
    expect(warnings.map((w) => w.message)).toEqual(["Stringhe markdown lette come testo semplice (riga 2)"])
  })

  it("legge come nodi qualunque gli id che sono nomi del prototipo, senza toccarlo", () => {
    const { model, warnings } = flow("constructor[Uno] --> toString\n  __proto__[X] --> B\n  A@{ shape: toString }\n  subgraph __proto__2\n    hasOwnProperty\n  end")
    expect(Object.keys(model.nodes)).toEqual(["constructor", "toString", "__proto__", "B", "A", "hasOwnProperty"])
    expect(model.nodes.constructor).toEqual({ label: "Uno", shape: "process", lane: null })
    expect(model.nodes.A!.shape).toBe("process")
    expect(warnings.map((w) => w.message)).toEqual(["Forme senza equivalente, lette come processo: A (toString) (riga 4)"])
    expect(({} as Record<string, unknown>).label).toBeUndefined()
  })
})

describe("mapFlow: archi", () => {
  it("tiene il verso scritto, perde stile e teste con un avviso, e scarta ~~~ in silenzio", () => {
    const { model, warnings } = map(FLOW_VALID.links!)
    expect(Object.values(model.edges).map((e) => `${e.source}${e.target}`)).toEqual([
      "AB", "AC", "BD", "CD", "EF", "GH", "IJ", "KL", "MN", "OP", "QR", "UV", "WX", "YZ",
    ])
    expect(warnings.map((w) => w.message)).toEqual([
      "Stile di linea perso (tratteggiata, spessa): l'arco è una linea continua (righe 4, 5, 11, 12)",
      "Archi senza freccia, con cerchio, croce o due teste, letti come una freccia nel verso scritto (righe 6, 7, 8, 9)",
    ])
  })

  it("porta l'etichetta, vuota quando manca", () => {
    expect(Object.values(flow("A -->|sì| B --> C").model.edges).map((e) => e.label)).toEqual(["sì", ""])
  })
})

describe("mapFlow: subgraph", () => {
  const { model, warnings } = map(FLOW_VALID.subgraphs!)

  it("fa dei subgraph di primo livello i pool e dei figli le corsie, con la corsia implicita in testa", () => {
    expect(model.pools).toEqual({
      p1: { name: "Ufficio", lanes: [{ id: "p1", name: "Ufficio" }, { id: "c1", name: "Contabilità" }, { id: "c2", name: "c2" }] },
      subGraph4: { name: "Pool con spazi", lanes: [{ id: "subGraph4", name: "Pool con spazi" }] },
      vuoto: { name: "vuoto", lanes: [{ id: "vuoto", name: "vuoto" }] },
    })
    expect(Object.fromEntries(Object.entries(model.nodes).map(([k, n]) => [k, n.lane]))).toEqual({
      inizio: null, a: "p1", b: "p1", c: "c1", d: "c2", e: "c2", f: "c2", g: "subGraph4",
    })
  })

  it("termina su un subgraph riaperto dentro sé stesso, e lo tratta come uno", () => {
    expect(map(FLOW_VALID.selfNested!).model.pools).toEqual({ A: { name: "A", lanes: [{ id: "A", name: "A" }] } })
    const { model } = map(FLOW_VALID.cycleNested!)
    expect(model.pools).toEqual({ A: { name: "A", lanes: [{ id: "A", name: "A" }, { id: "B", name: "B" }] } })
    expect(model.nodes.x!.lane).toBe("A")
  })

  it("non dà la corsia implicita a un pool che ha solo figli", () => {
    expect(flow("subgraph p\n    subgraph l\n      A\n    end\n  end").model.pools.p!.lanes).toEqual([{ id: "l", name: "l" }])
  })

  it("avvisa dei livelli in più e scarta gli archi verso un subgraph", () => {
    expect(warnings.map((w) => w.message)).toEqual([
      "Subgraph oltre il secondo livello: i nodi vanno nella corsia antenata: f (riga 10)",
      "Archi da o verso un subgraph scartati: b → c1 (riga 20)",
    ])
    expect(Object.values(model.edges).some((e) => e.target === "c1")).toBe(false)
    expect(model.nodes.c1).toBeUndefined()
  })

  it("unisce i membri di un subgraph ripetuto nel primo, come flowDb", () => {
    const { model } = map(FLOW_VALID.repeatedSubgraph!)
    expect(model.pools).toEqual({ s: { name: "s", lanes: [{ id: "s", name: "s" }] } })
    expect([model.nodes.A!.lane, model.nodes.B!.lane]).toEqual(["s", "s"])
  })

  it("tiene nel primo subgraph un nodo nominato in due fratelli, con avviso; dentro e fuori da una corsia non avvisa", () => {
    const twice = flow("subgraph p\n    A\n  end\n  subgraph q\n    A\n  end")
    expect(twice.model.nodes.A!.lane).toBe("p")
    expect(twice.warnings.map((w) => w.message)).toEqual(["Nodi in più subgraph: restano nel primo: A (riga 6)"])
    const nested = flow("subgraph p\n    A\n    subgraph l\n      A\n    end\n  end")
    expect(nested.model.nodes.A!.lane).toBe("l")
    expect(nested.warnings).toEqual([])
  })

  it("termina anche con un subgraph esplicito che si chiama come un id automatico", () => {
    const { model } = map("flowchart LR\n  subgraph subGraph0\n    subgraph Due parole\n      x\n    end\n  end\n")
    expect(model.pools).toEqual({ subGraph0: { name: "subGraph0", lanes: [{ id: "subGraph1", name: "Due parole" }] } })
    expect(model.nodes.x!.lane).toBe("subGraph1")
  })
})
