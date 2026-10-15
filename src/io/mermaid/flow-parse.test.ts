import { describe, expect, it } from "vitest"
import { MermaidSyntaxError } from "./common"
import { FLOW_VALID } from "./flow-fixtures"
import { parseFlow } from "./flow-parse"

const flow = (body: string) => parseFlow(`flowchart LR\n  ${body}\n`)
const edges = (body: string) => flow(body).ast.edges.map(({ source, target, head, double, stroke, label }) => ({ source, target, head, double, stroke, label }))
const node = (body: string) => flow(body).ast.nodes[0]!
const syntaxError = (text: string): { message: string; at: number } => {
  try {
    parseFlow(text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { message: e.message, at: e.at }
    throw e
  }
  throw new Error("nessun errore")
}

describe("parseFlow: nodi", () => {
  it("legge le forme fra parentesi col tipo di flowDb", () => {
    const shapes = parseFlow(FLOW_VALID.shapes!).ast.nodes.map((n) => [n.id, n.shape])
    expect(shapes).toEqual([
      ["a1", "round"], ["a2", "circle"], ["a3", "doublecircle"], ["a4", "lean_right"], ["a5", "lean_left"], ["a6", "cylinder"],
      ["a7", "hexagon"], ["a8", "odd"], ["a9", "trapezoid"], ["a10", "inv_trapezoid"], ["a11", "ellipse"], ["a12", "lean-r"],
      ["a13", "cyl"], ["a14", "square"],
    ])
  })

  it("legge testo fra virgolette, markdown, entità e <br>", () => {
    expect(node('A["Testo #quot;citato#quot;<br>a capo"]').text).toEqual({ text: 'Testo "citato"\na capo', markdown: false })
    expect(node('A["`**md**`"]').text).toEqual({ text: "**md**", markdown: true })
    expect(node("A[ due parole ]").text).toEqual({ text: "due parole", markdown: false })
    expect(node("A").text).toBeNull()
    expect(node('A["x; y"]').text?.text).toBe("x; y")
  })

  it("legge @{ shape, label } e scarta gli altri attributi con un avviso", () => {
    expect(node('A@{ shape: diam, label: "Va?" }')).toMatchObject({ shape: "diam", text: { text: "Va?" } })
    const { warnings } = flow("A@{ shape: rect, icon: fa:car, pos: t }")
    expect(warnings.map((w) => w.message)).toEqual(["Attributi dei nodi scartati (icon, img, pos, w, h…), restano forma ed etichetta (riga 2)"])
  })

  it("ricorda il subgraph aperto più interno", () => {
    const { ast } = parseFlow("flowchart LR\n  a\n  subgraph p\n    b\n    subgraph c\n      d\n    end\n  end\n")
    expect(ast.nodes.map((n) => [n.id, n.subgraph])).toEqual([["a", null], ["b", "p"], ["d", "c"]])
    expect(ast.subgraphs.map((s) => [s.id, s.parent])).toEqual([["c", "p"], ["p", null]])
  })
})

describe("parseFlow: archi", () => {
  it("espande catene e & in un arco per coppia, nell'ordine di flowDb", () => {
    expect(edges("A --> B & C --> D").map((e) => `${e.source}${e.target}`)).toEqual(["AB", "AC", "BD", "CD"])
    expect(edges("A & B --> C & D").map((e) => `${e.source}${e.target}`)).toEqual(["AC", "AD", "BC", "BD"])
    expect(edges("A&B --> C").map((e) => `${e.source}>${e.target}`)).toEqual(["A&B>C"])
  })

  it("legge testa e tratto con la regola di destructLink", () => {
    const kinds = parseFlow(FLOW_VALID.links!).ast.edges.map((e) => [e.head, e.double, e.stroke])
    expect(kinds).toEqual([
      ["point", false, "normal"], ["point", false, "normal"], ["point", false, "normal"], ["point", false, "normal"],
      ["point", false, "normal"], ["point", false, "dotted"], ["point", false, "thick"], ["open", false, "normal"],
      ["point", true, "normal"], ["circle", false, "normal"], ["cross", false, "normal"], ["open", false, "invisible"],
      ["point", false, "dotted"], ["point", false, "thick"], ["point", false, "normal"],
    ])
  })

  it("legge le etichette fra | e in mezzo alla freccia, con o senza spazi", () => {
    expect(edges("A-->|sì|B")[0]!.label).toEqual({ text: "sì", markdown: false })
    expect(edges('A --> |"a | b"| B')[0]!.label?.text).toBe("a | b")
    expect(edges("A -- due parole --> B")[0]!.label?.text).toBe("due parole")
    expect(edges("A -. t .-> B")[0]).toMatchObject({ stroke: "dotted", label: { text: "t" } })
    expect(edges("A == t ==> B")[0]).toMatchObject({ stroke: "thick", label: { text: "t" } })
    expect(edges("A --> B")[0]!.label).toBeNull()
  })

  it("non scambia per una freccia il trattino di un nome, né per una testa la o di un nome", () => {
    expect(edges("my-node-->B")[0]).toMatchObject({ source: "my-node", target: "B" })
    expect(edges("Ao--oB")[0]).toMatchObject({ source: "Ao", target: "B", head: "circle" })
    expect(edges("order --> other")[0]).toMatchObject({ source: "order", target: "other", head: "point" })
  })

  it("scarta id e animazioni degli archi con un avviso, senza crearne un nodo", () => {
    const { ast, warnings } = flow("A e1@--> B\n  e1@{ animate: true }")
    expect(ast.nodes.map((n) => n.id)).toEqual(["A", "B"])
    expect(warnings.map((w) => w.message)).toEqual(["Id e animazioni degli archi scartati (righe 2, 3)"])
  })
})

describe("parseFlow: il resto", () => {
  it("legge i tre modi di scrivere un subgraph, e dà a quello con spazi l'id di flowDb", () => {
    const { ast } = parseFlow("flowchart LR\n  subgraph a [Uno]\n  end\n  subgraph b[\"Due\"]\n  end\n  subgraph Tre parole\n  end\n  subgraph c\n  end\n")
    expect(ast.subgraphs.map((s) => [s.id, s.title?.text ?? null])).toEqual([["a", "Uno"], ["b", "Due"], ["subGraph2", "Tre parole"], ["c", "c"]])
  })

  it("dà l'id subGraphN anche alle menzioni e ai figli di un subgraph con spazi", () => {
    const { ast } = parseFlow("flowchart LR\n  subgraph Due parole\n    A\n    subgraph c\n      B\n    end\n  end\n")
    expect(ast.nodes.map((n) => [n.id, n.subgraph])).toEqual([["A", "subGraph1"], ["B", "c"]])
    expect(ast.subgraphs.map((s) => [s.id, s.parent])).toEqual([["c", "subGraph1"], ["subGraph1", null]])
  })

  it("non dà a un subgraph con spazi l'id di un subgraph ancora aperto", () => {
    const { ast } = parseFlow("flowchart LR\n  subgraph subGraph0\n    subgraph Due parole\n      x\n    end\n  end\n")
    expect(ast.subgraphs.map((s) => [s.id, s.parent])).toEqual([["subGraph1", "subGraph0"], ["subGraph0", null]])
    expect(ast.nodes.map((n) => [n.id, n.subgraph])).toEqual([["x", "subGraph1"]])
  })

  it("legge un subgraph riaperto dentro sé stesso come lo stesso subgraph", () => {
    const self = parseFlow(FLOW_VALID.selfNested!).ast
    expect(self.subgraphs.map((s) => [s.id, s.parent])).toEqual([["A", null]])
    expect(self.nodes.map((n) => [n.id, n.subgraph])).toEqual([["x", "A"]])
    const cycle = parseFlow(FLOW_VALID.cycleNested!).ast
    expect(cycle.subgraphs.map((s) => [s.id, s.parent])).toEqual([["B", "A"], ["A", null]])
    expect(cycle.nodes.map((n) => [n.id, n.subgraph])).toEqual([["x", "A"]])
  })

  it("legge `@{…}` e `accDescr {…}` su più righe", () => {
    const { ast, warnings } = parseFlow('flowchart LR\n  A@{\n    shape: diam\n    label: "Va?"\n  }\n  accDescr {\n    riga uno\n    riga due\n  }\n  A --> B\n')
    expect(ast.nodes[0]).toMatchObject({ id: "A", shape: "diam", text: { text: "Va?" } })
    expect(ast.edges.map((e) => [e.source, e.target])).toEqual([["A", "B"]])
    expect(warnings.filter((w) => w.message.startsWith("Titolo e descrizione di accessibilità"))).toHaveLength(1)
  })

  it("separa le istruzioni sul ;, e legge `graph` e le direzioni", () => {
    const { ast, warnings } = parseFlow("graph TD; A-->B; B-->C")
    expect(ast.direction).toBe("TD")
    expect(ast.edges).toHaveLength(2)
    expect(warnings.map((w) => w.message)).toEqual(["Direzione ignorata: il flusso si dispone da sinistra a destra (riga 1)"])
    expect(parseFlow("flowchart\n  A").ast.direction).toBe("TB")
    expect(parseFlow("flowchart LR\n  subgraph s\n    direction LR\n  end\n").warnings).toEqual([])
  })

  it("non fa assorbire le righe dopo a una parentesi aperta nel testo", () => {
    const { ast } = flow("A[Costo (euro] --> B\n  B --> C")
    expect(ast.edges.map((e) => `${e.source}${e.target}`)).toEqual(["AB", "BC"])
    expect(ast.nodes[0]!.text?.text).toBe("Costo (euro")
  })

  it("scarta stili, interazioni e accessibilità con un avviso per categoria", () => {
    expect(parseFlow(FLOW_VALID.styled!).warnings.map((w) => w.message)).toEqual([
      "Stili scartati (style, linkStyle, classDef, class, :::), il diagramma usa i suoi (righe 2, 3, 4, 5, 6)",
      "Interazioni scartate (click) (riga 7)",
      "Titolo e descrizione di accessibilità scartati (righe 8, 9)",
    ])
  })

  it("ignora commenti e front-matter senza avviso, e legge gli a capo di Windows", () => {
    const { ast, warnings } = parseFlow("---\ntitle: x\n---\r\nflowchart LR\r\n  %% commento\r\n  A --> B\r\n")
    expect(warnings).toEqual([])
    expect(ast.edges.map((e) => [e.source, e.target])).toEqual([["A", "B"]])
  })

  it("si ferma agli errori strutturali, con l'offset", () => {
    expect(syntaxError("sequenceDiagram\n")).toEqual({ message: "Il testo non comincia con flowchart o graph", at: 0 })
    expect(syntaxError("flowchart LR\n  subgraph s\n  A\n")).toEqual({ message: "Subgraph senza «end»", at: 15 })
    expect(syntaxError("flowchart LR\n  end\n")).toEqual({ message: "«end» senza un subgraph aperto", at: 15 })
    expect(syntaxError("flowchart LR\n  A[x --> B\n")).toEqual({ message: "Forma «[» senza chiusura", at: 16 })
    expect(syntaxError('flowchart LR\n  A["x] --> B\n')).toMatchObject({ message: "Virgolette senza chiusura" })
    expect(syntaxError("flowchart LR\n  A -- testo B\n")).toEqual({ message: "Freccia con testo senza chiusura", at: 16 })
    expect(syntaxError("flowchart LR\n  A -- t ==> B\n")).toMatchObject({ message: "Freccia con testo senza chiusura" })
    expect(syntaxError("flowchart LR\n  A --> B C\n")).toEqual({ message: "Testo inatteso: «C»", at: 22 })
  })

  it("resta lineare su un testo grande", () => {
    const lines = ["flowchart LR", "  subgraph p [Pool]"]
    for (let i = 0; i < 5000; i++) lines.push(`    n${i}["Passo ${i}"] -->|ok| n${i + 1}{"Va?"}`)
    lines.push("  end")
    const started = performance.now()
    const { ast } = parseFlow(lines.join("\n"))
    expect(ast.edges).toHaveLength(5000)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
