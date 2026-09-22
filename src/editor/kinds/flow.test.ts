import { produce } from "immer"
import { describe, expect, it } from "vitest"
import type { DevDocument } from "@/model/document"
import { createFlowDocument, type FlowDiagram } from "@/model/flow/schema"
import { opsFor } from "./ops"

/** Due corsie scritte a mano, come in `flow/commands.test.ts`: `l1` da 0 a 100, `l2` da 100 a 200. */
function dueCorsie(): { doc: DevDocument; l1: string; l2: string } {
  const base = createFlowDocument("test", "id-1")
  const l1 = base.diagram.model.lanes[0]!.id
  const doc = produce(base, (d) => {
    const f = d.diagram as FlowDiagram
    f.model.lanes.push({ id: "l2", name: "Seconda" })
    f.view.lanes = { [l1]: { y: 0, h: 100 }, l2: { y: 100, h: 100 } }
  })
  return { doc, l1, l2: "l2" }
}

/** Il diagramma di flowchart del documento. Solleva se il documento è di un altro tipo. */
function laneOf(doc: DevDocument, key: string): string {
  const d = doc.diagram
  if (d.type !== "flow") throw new Error("tipo sbagliato")
  const n = d.model.nodes[key]
  if (!n) throw new Error("nodo assente")
  return n.lane
}

describe("flowOps", () => {
  it("addNode crea il nodo nella prima corsia e apre l'editor del corpo", () => {
    const doc = createFlowDocument("test", "id-1")
    const lane = doc.diagram.model.lanes[0]!.id
    const { key, recipe, edit } = opsFor(doc).addNode({ x: 10, y: 10 }, "decision")
    const next = produce(doc, recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[key]).toEqual({ label: "", shape: "decision", lane })
    expect(edit).toBe("body")
  })

  it("addNode senza variante crea un nodo \"process\"", () => {
    const doc = createFlowDocument("test", "id-1")
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 0 })
    const next = produce(doc, recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[key]!.shape).toBe("process")
  })

  it("addNode risolve la corsia dalla coordinata y del rilascio, non sempre la prima", () => {
    const { doc, l2 } = dueCorsie()
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 150 })
    const next = produce(doc, recipe)
    expect(laneOf(next, key)).toBe(l2)
  })

  it("una y nella prima banda risolve comunque alla prima corsia", () => {
    const { doc, l1 } = dueCorsie()
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 50 })
    const next = produce(doc, recipe)
    expect(laneOf(next, key)).toBe(l1)
  })

  // Il confine è il punto in cui uno stub — o un'implementazione con l'estremo sbagliato — si
  // tradisce: appartiene alla corsia di sotto (`l2`), non a quella sopra e non a entrambe.
  it("il confine fra due corsie risolve a quella di sotto, non a quella sopra", () => {
    const { doc, l2 } = dueCorsie()
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 100 })
    const next = produce(doc, recipe)
    expect(laneOf(next, key)).toBe(l2)
  })

  it("addEdge torna null se un estremo non esiste", () => {
    const doc = createFlowDocument("test", "id-1")
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 0 }, "process")
    const next = produce(doc, recipe)
    expect(opsFor(next).addEdge(key, "fantasma")).toBeNull()
  })
})
