import { describe, expect, it } from "vitest"
import type { FlowDiagram } from "@/model/flow/schema"
import { LANE_MIN_H } from "@/model/flow/schema"
import { flowLayoutGraph, placeInLanes } from "./layout"

const node = (lane: string) => ({ label: "x", shape: "process" as const, lane })

function diagram(nodes: Record<string, { lane: string }>, lanes: string[]): FlowDiagram {
  return {
    type: "flow",
    model: {
      lanes: lanes.map((id) => ({ id, name: id })),
      nodes: Object.fromEntries(Object.entries(nodes).map(([k, v]) => [k, node(v.lane)])),
      edges: {},
    },
    view: { nodes: {}, lanes: {} },
  }
}

describe("placeInLanes", () => {
  it("non tocca la x: è l'asse del flusso, e viene da ELK", () => {
    const d = diagram({ a: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 137, y: 999 } })
    expect(positions.a!.x).toBe(137)
  })

  it("mette ogni nodo dentro la banda della sua corsia", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l2" } }, ["l1", "l2"])
    const { positions, lanes } = placeInLanes(d, { a: { x: 0, y: 500 }, b: { x: 0, y: 0 } })
    expect(positions.a!.y).toBeGreaterThanOrEqual(lanes.l1!.y)
    expect(positions.a!.y).toBeLessThan(lanes.l1!.y + lanes.l1!.h)
    expect(positions.b!.y).toBeGreaterThanOrEqual(lanes.l2!.y)
    expect(positions.b!.y).toBeLessThan(lanes.l2!.y + lanes.l2!.h)
  })

  it("le bande sono contigue e nell'ordine del modello", () => {
    const d = diagram({}, ["l1", "l2", "l3"])
    const { lanes } = placeInLanes(d, {})
    expect(lanes.l1!.y).toBe(0)
    expect(lanes.l2!.y).toBe(lanes.l1!.y + lanes.l1!.h)
    expect(lanes.l3!.y).toBe(lanes.l2!.y + lanes.l2!.h)
  })

  it("una corsia vuota ha comunque la sua altezza minima", () => {
    const d = diagram({}, ["l1"])
    const { lanes } = placeInLanes(d, {})
    expect(lanes.l1!.h).toBe(LANE_MIN_H)
  })

  it("due nodi della stessa corsia che si accavallano in x finiscono su righe diverse", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } })
    expect(positions.a!.y).not.toBe(positions.b!.y)
  })

  it("due nodi della stessa corsia lontani in x restano sulla stessa riga", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 0, y: 0 }, b: { x: 900, y: 400 } })
    expect(positions.a!.y).toBe(positions.b!.y)
  })

  it("a parità di colonna l'ordine è quello che ELK aveva dato con la y", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 0, y: 500 }, b: { x: 0, y: 0 } })
    expect(positions.b!.y).toBeLessThan(positions.a!.y)
  })

  it("un nodo senza posizione da ELK non compare nel risultato invece di finire a zero", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 0, y: 0 } })
    expect(positions.b).toBeUndefined()
  })

  // `FlowModelSchema` impone che ogni nodo abbia una corsia esistente (spec §4), quindi questo
  // caso non dovrebbe accadere — ma spec §12 chiede esplicitamente che la funzione non esploda
  // comunque: un nodo orfano non entra in nessuna banda invece di far fallire l'intero layout.
  it("un nodo la cui corsia non esiste non fa esplodere la funzione, e resta fuori dal risultato", () => {
    const d = diagram({ a: { lane: "fantasma" } }, ["l1"])
    const { positions, lanes } = placeInLanes(d, { a: { x: 0, y: 0 } })
    expect(positions.a).toBeUndefined()
    expect(lanes.l1!.h).toBe(LANE_MIN_H)
  })
})

describe("flowLayoutGraph", () => {
  function graphDiagram(over: Partial<FlowDiagram["model"]> = {}, view: Partial<FlowDiagram["view"]> = {}): FlowDiagram {
    return {
      type: "flow",
      model: { lanes: [{ id: "l1", name: "l1" }], nodes: {}, edges: {}, ...over },
      view: { nodes: {}, lanes: {}, ...view },
    }
  }

  it("un nodo senza voce nella view non entra nel grafo", () => {
    const d = graphDiagram({ nodes: { a: node("l1"), b: node("l1") } }, { nodes: { a: { x: 0, y: 0, collapsed: false } } })
    expect(flowLayoutGraph(d).nodes.map((n) => n.id)).toEqual(["a"])
  })

  it("salta l'arco con un estremo fuori dal grafo", () => {
    const d = graphDiagram(
      { nodes: { a: node("l1"), b: node("l1") }, edges: { e1: { source: "a", target: "assente", label: "" } } },
      { nodes: { a: { x: 0, y: 0, collapsed: false }, b: { x: 0, y: 0, collapsed: false } } },
    )
    expect(flowLayoutGraph(d).edges).toEqual([])
  })

  it("non inverte gli archi: source resta la sorgente, è già il verso del flusso", () => {
    const d = graphDiagram(
      { nodes: { a: node("l1"), b: node("l1") }, edges: { e1: { source: "a", target: "b", label: "" } } },
      { nodes: { a: { x: 0, y: 0, collapsed: false }, b: { x: 0, y: 0, collapsed: false } } },
    )
    expect(flowLayoutGraph(d).edges).toEqual([{ id: "e1", source: "a", target: "b" }])
  })

  it("la direzione è RIGHT: le corsie occupano l'asse verticale", () => {
    expect(flowLayoutGraph(graphDiagram()).direction).toBe("RIGHT")
  })
})
