import { describe, expect, it } from "vitest"
import { emitFlowMermaid } from "@/io/emit/flow-mermaid"
import type { FlowModel } from "@/model/flow/schema"
import { mapFlow } from "./flow-map"
import { parseFlow } from "./flow-parse"

/**
 * Un modello con solo ciò che Mermaid porta (spec §8): nessuna corsia vuota, che l'export non emette.
 * Le chiavi sono quelle che l'export dà (`n1…`, `p1…`, `l1…`, nodi liberi prima, poi i pool per nome)
 * e gli archi sono indici, come li numera `mapFlow`: così il round-trip si confronta per uguaglianza.
 */
const MODEL: FlowModel = {
  pools: {
    p1: { name: "Ufficio & co", lanes: [{ id: "l1", name: "Front <office>" }, { id: "l2", name: "Back" }] },
  },
  nodes: {
    n1: { label: "Inizio", shape: "terminal", lane: null },
    n2: { label: "Fine", shape: "process", lane: null },
    n3: { label: 'a < b & "c"\nd | e', shape: "io", lane: "l1" },
    n4: { label: "Va?", shape: "decision", lane: "l2" },
    n5: { label: "Sotto", shape: "subprocess", lane: "l2" },
  },
  edges: {
    "0": { source: "n1", target: "n3", label: "" },
    "1": { source: "n3", target: "n4", label: "sì | no" },
    "2": { source: "n4", target: "n5", label: "" },
    "3": { source: "n5", target: "n2", label: "" },
  },
}

describe("round-trip flowchart", () => {
  it("modello → emitFlowMermaid → parseFlow → mapFlow restituisce il modello", () => {
    const { text } = emitFlowMermaid(MODEL)
    const { ast, warnings } = parseFlow(text)
    expect(warnings).toEqual([])
    const fragment = mapFlow(ast, text)
    expect(fragment.warnings).toEqual([])
    expect(fragment.model).toEqual(MODEL)
  })
  it("un'etichetta vuota torna vuota, in ogni forma", () => {
    const shapes = ["terminal", "process", "decision", "io", "subprocess"] as const
    const model: FlowModel = { pools: {}, nodes: Object.fromEntries(shapes.map((shape, i) => [`n${i + 1}`, { label: "", shape, lane: null }])), edges: {} }
    const { text } = emitFlowMermaid(model)
    expect(mapFlow(parseFlow(text).ast, text).model).toEqual(model)
  })
})
