import { describe, expect, it } from "vitest"
import { parseState } from "./state-parse"
import { mapState } from "./state-map"

const map = (body: string) => {
  const text = `stateDiagram-v2\n  ${body}\n`
  return mapState(parseState(text).ast, text)
}

describe("mapState: radice", () => {
  it("fonde i [*] in un solo inizio e una sola fine", () => {
    const { model } = map("[*] --> A\n  [*] --> B\n  A --> [*]\n  B --> [*]")
    expect(model.nodes.root_start).toEqual({ label: "Inizio", shape: "terminal", lane: null })
    expect(model.nodes.root_end).toEqual({ label: "Fine", shape: "terminal", lane: null })
    expect(Object.keys(model.nodes).sort()).toEqual(["A", "B", "root_end", "root_start"])
    expect(Object.values(model.edges)).toHaveLength(4)
    expect(model.edges["0"]).toEqual({ source: "root_start", target: "A", label: "" })
  })

  it("non crea l'inizio senza un [*] di partenza", () => {
    expect(Object.keys(map("A --> [*]").model.nodes).sort()).toEqual(["A", "root_end"])
  })

  it("porta l'etichetta della transizione, vuota se manca", () => {
    const { edges } = map("A --> B : t\n  B --> C").model
    expect(edges["0"]).toEqual({ source: "A", target: "B", label: "t" })
    expect(edges["1"]!.label).toBe("")
  })
})

describe("mapState: stati", () => {
  it("dà l'id come etichetta a uno stato semplice", () => {
    expect(map("A --> B").model.nodes.A).toEqual({ label: "A", shape: "process", lane: null })
  })

  it("mette le descrizioni in ordine di testo, una per riga", () => {
    expect(map("A : prima\n  A : seconda").model.nodes.A!.label).toBe("prima\nseconda")
    expect(map('state "Nome" as L\n  L : descr').model.nodes.L!.label).toBe("Nome\ndescr")
  })

  it("legge choice come decisione senza etichetta", () => {
    expect(map("state c <<choice>>\n  A --> c").model.nodes.c).toEqual({ label: "", shape: "decision", lane: null })
  })

  it("legge fork e join come processo, con un avviso aggregato", () => {
    const { model, warnings } = map("state f <<fork>>\n  state j <<join>>\n  f --> j")
    expect(model.nodes.f).toEqual({ label: "f", shape: "process", lane: null })
    expect(model.nodes.j!.shape).toBe("process")
    expect(warnings.map((w) => w.message)).toEqual(["Fork e join letti come processo: f, j (righe 2, 3)"])
  })

  it("tiene l'ultimo genere dato, e id come __proto__ non sporcano il prototipo", () => {
    const choiceThenJoin = map("state a <<choice>>\n  state a <<join>>")
    expect(choiceThenJoin.model.nodes.a).toEqual({ label: "a", shape: "process", lane: null })
    expect(choiceThenJoin.warnings.map((w) => w.message)).toEqual(["Fork e join letti come processo: a (riga 3)"])
    const joinThenChoice = map("state a <<join>>\n  state a <<choice>>")
    expect(joinThenChoice.model.nodes.a).toEqual({ label: "", shape: "decision", lane: null })
    expect(joinThenChoice.warnings).toEqual([])
    expect(map("__proto__ --> constructor").model.nodes.constructor).toBeDefined()
    expect(({} as Record<string, unknown>).label).toBeUndefined()
  })

  it("dà prima gli avvisi del parser, poi quelli del map", () => {
    const text = "stateDiagram-v2\n  direction TB\n  state f <<fork>>\n"
    const { ast, warnings } = parseState(text)
    const all = [...warnings, ...mapState(ast, text).warnings].map((w) => w.message)
    expect(all).toEqual(["Direzione ignorata: il flusso si dispone da sinistra a destra (riga 2)", "Fork e join letti come processo: f (riga 3)"])
  })
})

describe("mapState: composti", () => {
  const lanes = (body: string) => Object.fromEntries(Object.entries(map(body).model.nodes).map(([id, n]) => [id, n.lane]))
  const messages = (body: string) => map(body).warnings.map((w) => w.message)

  it("fa di un composto di primo livello un pool, con il nome dell'alias o dell'id e la corsia implicita", () => {
    const { model } = map('state "Ufficio" as U {\n    A\n  }\n  state V {\n    B\n  }\n  C')
    expect(model.pools.U).toEqual({ name: "Ufficio", lanes: [{ id: "U", name: "Ufficio" }] })
    expect(model.pools.V).toEqual({ name: "V", lanes: [{ id: "V", name: "V" }] })
    expect(Object.keys(model.nodes)).toEqual(["A", "B", "C"])
    expect(lanes("state U {\n    A\n  }\n  C")).toEqual({ A: "U", C: null })
  })

  it("fa di un composto figlio di un pool una corsia, nell'ordine del testo, e la corsia implicita solo se serve", () => {
    const { model } = map('state P {\n    state "Uno" as Q { A }\n    state R { B }\n  }')
    expect(model.pools.P!.lanes).toEqual([{ id: "Q", name: "Uno" }, { id: "R", name: "R" }])
    expect(lanes("state P {\n    state Q { A }\n    state R { B }\n  }")).toEqual({ A: "Q", B: "R" })
    expect(map("state P {\n    C\n    state Q { A }\n  }").model.pools.P!.lanes).toEqual([{ id: "P", name: "P" }, { id: "Q", name: "Q" }])
  })

  it("dal terzo livello mette gli stati nella corsia antenata, con avviso", () => {
    const body = "state P {\n    state Q {\n      state S {\n        X --> Y\n      }\n    }\n  }"
    expect(lanes(body)).toEqual({ X: "Q", Y: "Q" })
    expect(messages(body)).toEqual(["Stati composti oltre il secondo livello: gli stati vanno nella corsia antenata: X, Y (riga 4)"])
  })

  it("mette [*] di un composto in C_start e C_end, nella corsia del composto", () => {
    const { model } = map("state P {\n    [*] --> A\n    state Q {\n      [*] --> B\n      B --> [*]\n    }\n  }")
    expect(model.nodes.P_start).toEqual({ label: "Inizio", shape: "terminal", lane: "P" })
    expect(model.nodes.Q_start).toEqual({ label: "Inizio", shape: "terminal", lane: "Q" })
    expect(model.nodes.Q_end).toEqual({ label: "Fine", shape: "terminal", lane: "Q" })
    expect(model.nodes.root_start).toBeUndefined()
    expect(model.pools.P!.lanes.map((l) => l.id)).toEqual(["P", "Q"])
  })

  it("porta le transizioni verso un composto sul suo inizio e quelle da un composto dalla sua fine", () => {
    const { model, warnings } = map("A --> C\n  state C {\n    [*] --> X\n    X --> [*]\n  }\n  C --> B")
    expect(Object.values(model.edges)).toEqual([
      { source: "A", target: "C_start", label: "" },
      { source: "C_start", target: "X", label: "" },
      { source: "X", target: "C_end", label: "" },
      { source: "C_end", target: "B", label: "" },
    ])
    expect(model.nodes.C).toBeUndefined()
    expect(warnings).toEqual([])
  })

  it("scarta le transizioni verso o da un composto senza il terminale interno, con avviso", () => {
    const { model, warnings } = map("A --> C\n  state C {\n    X\n  }\n  C --> [*]")
    expect(Object.values(model.edges)).toEqual([])
    expect(model.nodes.root_end).toBeDefined()
    expect(warnings.map((w) => w.message)).toEqual([
      "Transizioni verso o da uno stato composto senza inizio o fine interni, scartate: A → C, C → [*] (righe 2, 6)",
    ])
  })

  it("fa una corsia per regione di un pool, con i composti figli subito dopo la loro regione", () => {
    const { model } = map("state P {\n    A\n    state Q { B }\n    --\n    C\n    --\n    state R { D }\n  }")
    expect(model.pools.P!.lanes).toEqual([
      { id: "P#1", name: "Regione 1" },
      { id: "Q", name: "Q" },
      { id: "P#2", name: "Regione 2" },
      { id: "P#3", name: "Regione 3" },
      { id: "R", name: "R" },
    ])
    expect(lanes("state P {\n    A\n    --\n    [*] --> C\n  }")).toEqual({ A: "P#1", C: "P#2", P_start: "P#2" })
  })

  it("dà a un composto riaperto le regioni di tutte le aperture, senza corsie sospese", () => {
    const { model, warnings } = map("state P {\n    A\n    --\n    B\n  }\n  state P {\n    C\n    --\n    D\n    --\n    E\n  }")
    expect(model.pools.P!.lanes.map((l) => l.id)).toEqual(["P#1", "P#2", "P#3", "P#4", "P#5"])
    expect(Object.fromEntries(Object.entries(model.nodes).map(([id, n]) => [id, n.lane]))).toEqual({ A: "P#1", B: "P#2", C: "P#3", D: "P#4", E: "P#5" })
    expect(warnings).toEqual([])
    const after = map("state P {\n    A\n  }\n  state P {\n    B\n    --\n    C\n  }")
    expect(after.model.pools.P!.lanes.map((l) => l.id)).toEqual(["P#1", "P#2", "P#3"])
    expect(lanes("state P {\n    A\n  }\n  state P {\n    B\n    --\n    C\n  }")).toEqual({ A: "P#1", B: "P#2", C: "P#3" })
  })

  it("fonde le regioni di un composto che è già una corsia, con avviso", () => {
    const body = "state P {\n    state Q {\n      A\n      --\n      B\n    }\n  }"
    expect(lanes(body)).toEqual({ A: "Q", B: "Q" })
    expect(map(body).model.pools.P!.lanes).toEqual([{ id: "Q", name: "Q" }])
    expect(messages(body)).toEqual(["Regioni concorrenti dentro un composto di secondo livello, fuse nella sua corsia: Q (riga 3)"])
  })

  it("fa un nodo solo di uno stato citato alla radice e in un composto, nell'ultimo composto che lo cita, come Mermaid", () => {
    expect(lanes("A --> X\n  state P {\n    X --> Y\n  }\n  Y --> Z")).toEqual({ A: null, X: "P", Y: "P", Z: null })
    expect(lanes("state P {\n    X\n  }\n  state Q {\n    X\n  }")).toEqual({ X: "Q" })
    expect(lanes("state P {\n    state Q { X }\n    X --> W\n  }")).toEqual({ X: "P", W: "P" })
  })
})

describe("mapState: note", () => {
  it("ancora una nota allo stato, e a sinistra come a destra", () => {
    const { model, notes, warnings } = map("A --> B\n  note right of A : uno\n  note left of B\n    due\n  end note")
    expect(notes).toEqual([{ text: "uno", anchor: "flow/A" }, { text: "due", anchor: "flow/B" }])
    expect(Object.keys(model.nodes)).toEqual(["A", "B"])
    expect(warnings).toEqual([])
  })

  it("crea lo stato di una nota che nessun altro cita", () => {
    expect(map("note right of A : t").model.nodes.A).toEqual({ label: "A", shape: "process", lane: null })
  })

  it("ancora la nota su un composto al pool che lo contiene, a ogni livello e senza avvisi suoi", () => {
    const body = "state P {\n    state Q {\n      state S { X }\n    }\n  }\n  note right of P : p\n  note right of Q : q\n  note right of S : s"
    const { notes, warnings } = map(body)
    expect(notes.map((n) => n.anchor)).toEqual(["flow/P", "flow/P", "flow/P"])
    expect(warnings.map((w) => w.message)).toEqual(["Stati composti oltre il secondo livello: gli stati vanno nella corsia antenata: X (riga 4)"])
  })

  it("scarta le note flottanti, con avviso", () => {
    const { notes, warnings } = map('A\n  note "t" as N\n  note "u" as M')
    expect(notes).toEqual([])
    expect(warnings.map((w) => w.message)).toEqual(["Note flottanti scartate (righe 3, 4)"])
  })
})
