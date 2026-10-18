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
    expect(map("state a <<choice>>\n  state a <<join>>").model.nodes.a!.shape).toBe("process")
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
