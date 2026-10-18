// @vitest-environment jsdom
import mermaid from "mermaid"
import { describe, expect, it } from "vitest"
import { emitClassMermaid } from "@/io/emit/class-mermaid"
import { emitMermaid } from "@/io/emit/er-mermaid"
import { emitFlowMermaid } from "@/io/emit/flow-mermaid"
import { emitSequenceMermaid } from "@/io/emit/sequence-mermaid"
import type { ClassModel } from "@/model/class/schema"
import type { ErModel } from "@/model/er/schema"
import { qualify } from "@/model/family"
import type { FlowModel } from "@/model/flow/schema"
import type { Head, Line, Operator, Placement, Sequence, Step } from "@/model/sequence/schema"
import { analyseMermaid } from "./analyse"
import { CLASS_VALID } from "./class-fixtures"
import { parseClass } from "./class-parse"
import { ER_VALID } from "./er-fixtures"
import { parseEr } from "./er-parse"
import { FLOW_VALID } from "./flow-fixtures"
import { mapFlow } from "./flow-map"
import { parseFlow } from "./flow-parse"
import { SEQUENCE_MODELS, SEQUENCE_REWRITTEN, SEQUENCE_VALID } from "./sequence-fixtures"
import { STATE_VALID } from "./state-fixtures"
import { mapState } from "./state-map"
import { parseState } from "./state-parse"

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
const diagramDb = async <Db>(text: string): Promise<Db> => {
  const api = (mermaid as unknown as { mermaidAPI: { getDiagramFromText(t: string): Promise<{ db: Db }> } }).mermaidAPI
  return (await api.getDiagramFromText(text)).db
}
const flowDb = diagramDb<FlowDb>

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

/** Il db di Mermaid per uno state, come `FlowDb`: `getData()` è ciò che il renderer disegna. */
interface StateDbNode { id: string; shape: string; isGroup: boolean; parentId?: string; label: string }
interface StateDb { getData(): { nodes: StateDbNode[]; edges: { start: string; end: string; label?: string }[] } }
const stateDb = async (text: string): Promise<StateDb> => {
  // Senza il parse prima, `getDiagramFromText` riusa lo stato del db del diagramma precedente.
  await mermaid.parse(text)
  return diagramDb<StateDb>(text)
}

/** Le etichette di `getData()` hanno le entità protette: tornano HTML, e poi testo come nel nostro parser. */
const decodeLabel = (s: string): string => {
  const html = document.createElement("textarea")
  html.innerHTML = s.replaceAll("ﬂ°°", "&#").replaceAll("ﬂ°", "&").replaceAll("¶ß", ";")
  return html.value.replace(/<br\s*\/?>/gi, "\n")
}

describe("oracolo Mermaid: stateDiagram", () => {
  it.each(Object.entries(STATE_VALID))("la fixture %s piace a entrambi i parser", async (_, text) => {
    expect(() => parseState(text)).not.toThrow()
    expect(await mermaidAccepts(text)).toBe(true)
  })

  it.each(Object.entries(STATE_VALID))("la fixture %s ha gli stati, le corsie, le transizioni e le note di Mermaid", async (_, text) => {
    const fragment = mapState(parseState(text).ast, text)
    const { nodes, edges } = (await stateDb(text)).getData()
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const node = (id: string): StateDbNode => byId.get(id)!
    const states = nodes.filter((n) => !n.isGroup && !["note", "noteGroup", "divider"].includes(n.shape))
    // Mermaid dà un inizio e una fine a ogni regione, noi uno solo al composto: si riscrivono i suoi.
    const key = (n: StateDbNode): string => {
      const parent = n.parentId === undefined ? undefined : node(n.parentId)
      if (parent?.shape !== "divider" || !["stateStart", "stateEnd"].includes(n.shape)) return n.id
      return `${parent.parentId}_${n.shape === "stateStart" ? "start" : "end"}`
    }
    expect(new Set(Object.keys(fragment.model.nodes))).toEqual(new Set(states.map(key)))

    // La corsia dal `parentId`: il composto di secondo livello, o la regione per posizione, o il pool.
    const laneOf = (parentId: string | undefined): string | null => {
      const path: string[] = []
      for (let p = parentId; p !== undefined; p = node(p).parentId) path.unshift(p)
      const composites = path.filter((p) => node(p).shape !== "divider")
      if (composites.length === 0) return null
      if (composites.length > 1) return composites[1]!
      if (path.length === 1) return path[0]!
      const regions = nodes.filter((n) => n.shape === "divider" && n.parentId === path[0])
      return `${path[0]}#${regions.findIndex((n) => n.id === path[1]) + 1}`
    }
    for (const n of states) expect([key(n), fragment.model.nodes[key(n)]?.lane]).toEqual([key(n), laneOf(n.parentId)])

    // Una transizione su un composto entra dal suo inizio ed esce dalla sua fine; senza, si scarta.
    const known = new Set(states.map(key))
    const end = (id: string, inner: "start" | "end"): string => (node(id).isGroup ? `${id}_${inner}` : key(node(id)))
    const theirs = edges
      .filter((e) => node(e.start).shape !== "note" && node(e.end).shape !== "note")
      .map((e) => [end(e.start, "end"), end(e.end, "start"), decodeLabel(e.label ?? "")])
      .filter(([source, target]) => known.has(source!) && known.has(target!))
    expect(Object.values(fragment.model.edges).map((e) => [e.source, e.target, e.label])).toEqual(theirs)

    // Una nota sta sul suo stato, o sul pool del composto che la porta; la flottante Mermaid non la disegna.
    const top = (id: string): string => (node(id).parentId === undefined ? id : top(node(id).parentId!))
    const anchor = (target: string): string => qualify("flow", node(target).isGroup ? top(target) : target)
    const theirNotes = nodes.filter((n) => n.shape === "note").map((n) => anchor(n.id.split("----")[0]!))
    expect(fragment.notes.map((n) => n.anchor)).toEqual(theirNotes)
  })

  it.each(Object.entries(STATE_VALID))("la fixture %s, importata ed esportata come flowchart, è Mermaid valido", async (_, text) => {
    const analysis = analyseMermaid(text)
    if (!analysis.ok || analysis.kind !== "flow") throw new Error(`non è un flusso: ${JSON.stringify(analysis)}`)
    expect(await mermaidAccepts(emitFlowMermaid(analysis.fragment.model).text)).toBe(true)
  })
})

/** Il db di Mermaid per un sequenceDiagram (ricerca §2.3): `getMessages()` è piatta, i blocchi sono coppie di voci. */
interface SequenceDbMessage { from?: string; to?: string; message: string; type: number; placement?: number }
interface SequenceDb {
  getActors(): Map<string, { name: string; description: string; type: string }>
  getMessages(): SequenceDbMessage[]
  LINETYPE: Record<string, number>
  PLACEMENT: Record<"LEFTOF" | "RIGHTOF" | "OVER", number>
}
const sequenceDb = async (text: string): Promise<SequenceDb> => {
  await mermaid.parse(text)
  return diagramDb<SequenceDb>(text)
}

const importSequence = (text: string): Sequence => {
  const analysis = analyseMermaid(text)
  if (!analysis.ok || analysis.kind !== "sequence") throw new Error(`non è una sequenza: ${JSON.stringify(analysis)}`)
  return analysis.fragment.sequence
}

/** I passi senza id, con i partecipanti per nome: la forma in cui si confrontano con il db. */
const sequenceSteps = (seq: Sequence): unknown[] => {
  const name = (id: string) => seq.participants.find((p) => p.id === id)!.name
  const steps = (list: readonly Step[]): unknown[] =>
    list.map((s) => {
      switch (s.kind) {
        case "message": return { message: [name(s.from), name(s.to), s.text, s.line, s.head] }
        case "note": return { note: [s.placement, s.participants.map(name), s.text] }
        case "block": return { block: s.operator, sections: s.sections.map((x) => ({ condition: x.condition, steps: steps(x.steps) })) }
      }
    })
  return steps(seq.steps)
}

/**
 * `getMessages()` ripiegata nella stessa forma: le coppie di inizio e fine fanno i blocchi, le voci di
 * attivazione, numerazione, rect e connessione centrale restano fuori, come i costrutti persi con avviso.
 */
const dbSteps = (db: SequenceDb): unknown[] => {
  const T = db.LINETYPE
  const opens: Record<number, Operator> = {
    [T.LOOP_START!]: "loop", [T.ALT_START!]: "alt", [T.OPT_START!]: "opt", [T.PAR_START!]: "par",
    [T.PAR_OVER_START!]: "par", [T.CRITICAL_START!]: "critical", [T.BREAK_START!]: "break",
  }
  const sections = new Set([T.ALT_ELSE, T.PAR_AND, T.CRITICAL_OPTION])
  const ends = new Set([T.LOOP_END, T.ALT_END, T.OPT_END, T.PAR_END, T.CRITICAL_END, T.BREAK_END])
  const skipped = new Set([T.ACTIVE_START, T.ACTIVE_END, T.AUTONUMBER, T.RECT_START, T.RECT_END, T.CENTRAL_CONNECTION, T.CENTRAL_CONNECTION_REVERSE, T.CENTRAL_CONNECTION_DUAL])
  const arrows: Record<number, [Line, Head]> = {
    [T.SOLID_OPEN!]: ["solid", "none"], [T.DOTTED_OPEN!]: ["dashed", "none"], [T.SOLID!]: ["solid", "filled"], [T.DOTTED!]: ["dashed", "filled"],
    [T.SOLID_CROSS!]: ["solid", "cross"], [T.DOTTED_CROSS!]: ["dashed", "cross"], [T.SOLID_POINT!]: ["solid", "open"], [T.DOTTED_POINT!]: ["dashed", "open"],
    [T.BIDIRECTIONAL_SOLID!]: ["solid", "double"], [T.BIDIRECTIONAL_DOTTED!]: ["dashed", "double"],
  }
  const placements: Record<number, Placement> = { [db.PLACEMENT.LEFTOF]: "left", [db.PLACEMENT.RIGHTOF]: "right", [db.PLACEMENT.OVER]: "over" }

  type Section = { condition: string; steps: unknown[] }
  const root: unknown[] = []
  const open: { block: Operator; sections: Section[] }[] = []
  const current = () => open.at(-1)?.sections.at(-1)?.steps ?? root
  for (const m of db.getMessages()) {
    if (skipped.has(m.type)) continue
    const text = decodeLabel(m.message)
    if (opens[m.type] !== undefined) {
      const block = { block: opens[m.type]!, sections: [{ condition: text, steps: [] }] }
      current().push(block)
      open.push(block)
    } else if (sections.has(m.type)) open.at(-1)!.sections.push({ condition: text, steps: [] })
    else if (ends.has(m.type)) open.pop()
    else if (m.type === T.NOTE) current().push({ note: [placements[m.placement!], m.from === m.to ? [m.from] : [m.from, m.to], text] })
    else {
      // Le mezze frecce: la piena con la stessa linea. Per i tipi `*_REVERSE*` il renderer di Mermaid mette
      // la punta con `marker-start` sul mittente scritto, quindi il messaggio va da `to` a `from`.
      const name = Object.entries(T).find(([, v]) => v === m.type)![0]
      const [line, head] = arrows[m.type] ?? [name.includes("DOTTED") ? "dashed" : "solid", "filled"]
      const [from, to] = name.includes("REVERSE") ? [m.to, m.from] : [m.from, m.to]
      current().push({ message: [from, to, text, line, head] })
    }
  }
  return root
}

describe("oracolo Mermaid: sequenceDiagram", () => {
  it.each(Object.entries(SEQUENCE_VALID))("la fixture %s piace a entrambi i parser", async (_, text) => {
    expect(() => importSequence(text)).not.toThrow()
    expect(await mermaidAccepts(text)).toBe(true)
  })

  it.each(Object.entries(SEQUENCE_VALID))("la fixture %s ha i partecipanti, i messaggi, le note e i blocchi di Mermaid", async (_, text) => {
    const seq = importSequence(text)
    const db = await sequenceDb(text)
    // Le virgolette dell'alias restano, da noi come in Mermaid (spec §5); senza alias Mermaid ripete il nome.
    const theirs = [...db.getActors().values()].map((a) => ({ name: a.name, label: decodeLabel(a.description), kind: a.type === "actor" ? "actor" : "participant" }))
    expect(seq.participants.map((p) => ({ name: p.name, label: p.label ?? p.name, kind: p.kind }))).toEqual(theirs)
    expect(sequenceSteps(seq)).toEqual(dbSteps(db))
  })

  it("una mezza freccia che comincia dalla punta la disegna sul mittente scritto", async () => {
    const db = await sequenceDb("sequenceDiagram\n  A/|-B: x\n")
    expect(db.getMessages()[0]).toMatchObject({ from: "A", to: "B", type: db.LINETYPE.SOLID_ARROW_TOP_REVERSE })
    expect(sequenceSteps(importSequence("sequenceDiagram\n  A/|-B: x\n"))).toEqual([{ message: ["B", "A", "x", "solid", "filled"] }])
  })

  it.each(Object.entries({ ...SEQUENCE_MODELS, ...SEQUENCE_REWRITTEN }))("l'export del modello %s è Mermaid valido, con i passi che rilegge Mermaid", async (_, seq) => {
    const { text } = emitSequenceMermaid(seq, "s")
    expect(await mermaidAccepts(text)).toBe(true)
    expect(sequenceSteps(importSequence(text))).toEqual(dbSteps(await sequenceDb(text)))
  })

  it.each(Object.entries(SEQUENCE_VALID))("la fixture %s, importata ed esportata, è Mermaid valido", async (_, text) => {
    expect(await mermaidAccepts(emitSequenceMermaid(importSequence(text), "s").text)).toBe(true)
  })

  it("un nome uguale a una parola chiave lo accetta il nostro parser ma non Mermaid; l'export lo riscrive", async () => {
    const text = "sequenceDiagram\n  A->>end: x\n"
    expect(await mermaidAccepts(text)).toBe(false)
    const out = emitSequenceMermaid(importSequence(text), "s").text
    expect(out).toContain("participant p1 as end")
    expect(await mermaidAccepts(out)).toBe(true)
  })
})
