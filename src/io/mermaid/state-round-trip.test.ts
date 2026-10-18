import { describe, expect, it } from "vitest"
import { emitFlowMermaid } from "@/io/emit/flow-mermaid"
import type { FlowModel } from "@/model/flow/schema"
import { analyseMermaid } from "./analyse"
import { mapFlow } from "./flow-map"
import { parseFlow } from "./flow-parse"
import { STATE_VALID } from "./state-fixtures"

/** Il modello dello state importato, come flowchart esportato e riletto. */
const stateModel = (text: string): FlowModel => {
  const analysis = analyseMermaid(text)
  if (!analysis.ok || analysis.kind !== "flow") throw new Error(`non è un flusso: ${JSON.stringify(analysis)}`)
  return analysis.fragment.model
}

/**
 * Il modello a meno delle chiavi, che l'export rinumera: nodi per etichetta, forma e corsia per nome,
 * archi per le etichette degli estremi. Ordinati, perché l'export riordina nodi e pool.
 */
const shape = (model: FlowModel) => {
  const lanes = new Map(Object.values(model.pools).flatMap((p) => p.lanes.map((l) => [l.id, `${p.name} / ${l.name}`])))
  const label = (key: string) => model.nodes[key]!.label
  return {
    nodes: Object.values(model.nodes).map((n) => JSON.stringify([n.label, n.shape, n.lane === null ? null : lanes.get(n.lane)])).sort(),
    edges: Object.values(model.edges).map((e) => JSON.stringify([label(e.source), label(e.target), e.label])).sort(),
  }
}

describe("round-trip stateDiagram", () => {
  it.each(Object.entries(STATE_VALID))("la fixture %s, esportata come flowchart e riletta, dà lo stesso modello", (_, text) => {
    const model = stateModel(text)
    const { text: out } = emitFlowMermaid(model)
    expect(shape(mapFlow(parseFlow(out).ast, out).model)).toEqual(shape(model))
  })
})
