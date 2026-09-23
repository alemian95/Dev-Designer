import { produce } from "immer"
import { describe, expect, it } from "vitest"
import { expectLaneInvariant } from "@/editor/flow/lane-invariant"
import { flowNodeSize } from "@/editor/flow/geometry"
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

/**
 * C1 (brief della correzione finale): un click fuori da ogni banda non deve più lanciare — da
 * quando `laneAt` è reale, `null` è il caso normale (sopra la prima banda, o sotto l'ultima di un
 * documento con un'unica corsia di 160px). La corsia si decide dal punto del click, poi il nodo
 * rientra nella banda scelta. Questi test vanno in RED sull'implementazione che lancia su `null`.
 */
describe("addNode: C1 — fuori da ogni banda risolve alla corsia più vicina, e il nodo vi rientra", () => {
  it("un click sopra la prima banda risolve alla prima corsia", () => {
    const { doc, l1 } = dueCorsie()
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: -50 }, "process")
    const next = produce(doc, recipe)
    expect(laneOf(next, key)).toBe(l1)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expectLaneInvariant(d)
  })

  it("un click sotto l'ultima banda risolve all'ultima corsia", () => {
    const { doc, l2 } = dueCorsie()
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 250 }, "process")
    const next = produce(doc, recipe)
    expect(laneOf(next, key)).toBe(l2)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expectLaneInvariant(d)
  })

  /**
   * L'esempio esatto del brief: un click a y=150 nell'unica banda di un documento nuovo ([0,160)).
   * Senza il rientro il nodo (h=40) finirebbe a [150,190), a cavallo del bordo della banda — qui
   * deve restare interamente dentro.
   */
  it("un click vicino al bordo inferiore di una banda non fa sconfinare il nodo nella successiva", () => {
    const doc = createFlowDocument("test", "id-1")
    const lane = doc.diagram.model.lanes[0]!.id
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 150 }, "process")
    const next = produce(doc, recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(laneOf(next, key)).toBe(lane)
    const view = d.view.nodes[key]!
    const size = flowNodeSize(d.model.nodes[key]!)
    expect(view.y + size.h).toBeLessThanOrEqual(160)
    expectLaneInvariant(d)
  })
})

describe("rectOf", () => {
  it("torna il rettangolo del nodo alla sua posizione salvata", () => {
    const doc = createFlowDocument("test", "id-1")
    const { key, recipe } = opsFor(doc).addNode({ x: 40, y: 40 }, "process")
    const next = produce(doc, recipe)
    expect(opsFor(next).rectOf(key)).toEqual({ x: 40, y: 40, w: 60, h: 40 })
  })

  it("torna null per una chiave inesistente", () => {
    expect(opsFor(createFlowDocument("test", "id-1")).rectOf("fantasma")).toBeNull()
  })

  // È il solo caso in cui `at` fa la differenza: l'anteprima del drag lo passa per disegnare il
  // nodo dove il gesto lo sta portando, non dove sta ancora scritto in `view.nodes`.
  it("con `at` usa la posizione data, non quella salvata in `view`", () => {
    const doc = createFlowDocument("test", "id-1")
    const { key, recipe } = opsFor(doc).addNode({ x: 40, y: 40 }, "process")
    const next = produce(doc, recipe)
    expect(opsFor(next).rectOf(key, { x: 200, y: 300 })).toEqual({ x: 200, y: 300, w: 60, h: 40 })
  })
})
