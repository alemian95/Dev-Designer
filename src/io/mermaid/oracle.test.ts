// @vitest-environment jsdom
import mermaid from "mermaid"
import { describe, expect, it } from "vitest"
import { emitClassMermaid } from "@/io/emit/class-mermaid"
import { emitMermaid } from "@/io/emit/er-mermaid"
import { emitFlowMermaid } from "@/io/emit/flow-mermaid"
import type { ClassModel } from "@/model/class/schema"
import type { ErModel } from "@/model/er/schema"
import type { FlowModel } from "@/model/flow/schema"
import { CLASS_VALID } from "./class-fixtures"
import { parseClass } from "./class-parse"
import { ER_VALID } from "./er-fixtures"
import { parseEr } from "./er-parse"
import { FLOW_VALID } from "./flow-fixtures"
import { mapFlow } from "./flow-map"
import { parseFlow } from "./flow-parse"

/**
 * Mermaid stesso come oracolo (spec §8): ciò che il nostro parser accetta come valido lo deve
 * accettare anche `mermaid.parse()`, e ciò che l'export produce lo deve leggere Mermaid. `mermaid`
 * è solo una devDependency: non entra nel bundle.
 */
const mermaidAccepts = async (text: string): Promise<boolean> => (await mermaid.parse(text, { suppressErrors: true })) !== false

describe("oracolo Mermaid: erDiagram", () => {
  it.each(Object.entries(ER_VALID))("la fixture %s piace a entrambi i parser", async (_, text) => {
    expect(() => parseEr(text)).not.toThrow()
    expect(await mermaidAccepts(text)).toBe(true)
  })

  it("l'export ER è Mermaid valido", async () => {
    const model: ErModel = {
      entities: {
        "pub.a": { schema: "pub", name: "a", attributes: [{ name: "id", type: "double precision", primaryKey: true, foreignKey: false, nullable: false, unique: false }] },
        b: { name: "b", attributes: [] },
      },
      relationships: {
        r: { name: "ha", source: { entity: "b", attributes: [], cardinality: "many" }, target: { entity: "pub.a", attributes: [], cardinality: "zero-or-one" }, identifying: true },
      },
    }
    expect(await mermaidAccepts(emitMermaid(model).text)).toBe(true)
  })
})

describe("oracolo Mermaid: classDiagram", () => {
  it.each(Object.entries(CLASS_VALID))("la fixture %s piace a entrambi i parser", async (_, text) => {
    expect(() => parseClass(text)).not.toThrow()
    expect(await mermaidAccepts(text)).toBe(true)
  })

  it("l'export delle classi è Mermaid valido, generici annidati e note comprese", async () => {
    const model: ClassModel = {
      classes: {
        Ordine: {
          name: "Ordine",
          stereotype: "abstract",
          attributes: [{ name: "pesi", type: "Map<string, List<int>>", visibility: "private", isStatic: true }],
          methods: [
            { name: "totale", type: "double", visibility: "public", isStatic: false, isAbstract: true, parameters: [{ name: "x", type: "int" }] },
            { name: "callback", type: "Func<(int) => void>", visibility: "public", isStatic: false, isAbstract: false, parameters: [] },
          ],
        },
        Riga: { name: "Riga", stereotype: "class", attributes: [], methods: [] },
      },
      relations: {
        r: { kind: "composition", source: { class: "Riga", multiplicity: "1..*", role: "" }, target: { class: "Ordine", multiplicity: "1", role: "" } },
      },
    }
    const notes = { n: { text: "a < b & \"c\"\nd", anchor: "class/Ordine" } }
    expect(await mermaidAccepts(emitClassMermaid(model, notes).text)).toBe(true)
  })
})

/** Il db di Mermaid per un flowchart: API interna e deprecata, che qui serve solo da confronto (spec §3.1). */
interface FlowDb {
  getVertices(): Map<string, { id: string; text: string }>
  getEdges(): { start: string; end: string; text: string }[]
  getSubGraphs(): { id: string; nodes: string[] }[]
}
const flowDb = async (text: string): Promise<FlowDb> => {
  const api = (mermaid as unknown as { mermaidAPI: { getDiagramFromText(t: string): Promise<{ db: FlowDb }> } }).mermaidAPI
  return (await api.getDiagramFromText(text)).db
}

describe("oracolo Mermaid: flowchart", () => {
  it.each(Object.entries(FLOW_VALID))("la fixture %s piace a entrambi i parser, con gli stessi nodi, archi e subgraph", async (_, text) => {
    expect(await mermaidAccepts(text)).toBe(true)
    const { ast } = parseFlow(text)
    const db = await flowDb(text)
    const subgraphIds = new Set(db.getSubGraphs().map((s) => s.id))
    const ours = new Set(ast.nodes.map((n) => n.id).filter((id) => !ast.subgraphs.some((s) => s.id === id)))
    expect(ours).toEqual(new Set([...db.getVertices().keys()].filter((id) => !subgraphIds.has(id))))
    expect(ast.edges.map((e) => [e.source, e.target])).toEqual(db.getEdges().map((e) => [e.start, e.end]))
    // Il nodo di ogni subgraph è il primo che lo nomina in ordine di chiusura, come `makeUniq`.
    const owner = (id: string) => ast.subgraphs.find((s) => ast.nodes.some((n) => n.id === id && n.subgraph === s.id))?.id
    for (const sg of db.getSubGraphs()) {
      for (const id of sg.nodes.filter((n) => !subgraphIds.has(n))) expect([id, owner(id)]).toEqual([id, sg.id])
    }
  })

  it("legge un «|» fra virgolette nell'etichetta di un arco come testo, e l'export lo scappa comunque", async () => {
    const db = await flowDb('flowchart LR\n  A -->|"a | b"| B\n')
    expect(db.getEdges()[0]!.text).toBe("a | b")
    const model: FlowModel = {
      pools: {},
      nodes: { a: { label: "x | y", shape: "process", lane: null }, b: { label: "b", shape: "decision", lane: null } },
      edges: { e: { source: "a", target: "b", label: "a | b" } },
    }
    const { text } = emitFlowMermaid(model)
    expect(await mermaidAccepts(text)).toBe(true)
    expect(mapFlow(parseFlow(text).ast, text).model.edges["0"]!.label).toBe("a | b")
  })

  it("toglie gli spazi attorno al testo di un nodo, come il nostro parser", async () => {
    const db = await flowDb('flowchart LR\n  A[" x "]\n')
    expect(db.getVertices().get("A")!.text).toBe("x")
    expect(parseFlow('flowchart LR\n  A[" x "]\n').ast.nodes[0]!.text?.text).toBe("x")
  })

  it("l'export di un'etichetta vuota è Mermaid valido, in ogni forma", async () => {
    const shapes = ["terminal", "process", "decision", "io", "subprocess"] as const
    const model: FlowModel = { pools: {}, nodes: Object.fromEntries(shapes.map((shape) => [shape, { label: "", shape, lane: null }])), edges: {} }
    expect(await mermaidAccepts(emitFlowMermaid(model).text)).toBe(true)
  })

  it("l'export del flowchart è Mermaid valido, con pool, corsie, entità e a capo", async () => {
    const model: FlowModel = {
      pools: { p: { name: "Ufficio", lanes: [{ id: "l1", name: "A & B" }, { id: "l2", name: "Corsia" }] } },
      nodes: {
        a: { label: "Inizio", shape: "terminal", lane: null },
        b: { label: 'a < b & "c"\nd', shape: "io", lane: "l1" },
        c: { label: "Va?", shape: "decision", lane: "l2" },
        d: { label: "Sotto", shape: "subprocess", lane: "l2" },
      },
      edges: { e1: { source: "a", target: "b", label: "" }, e2: { source: "b", target: "c", label: "sì" }, e3: { source: "c", target: "d", label: "" } },
    }
    expect(await mermaidAccepts(emitFlowMermaid(model).text)).toBe(true)
  })
})
