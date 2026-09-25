import { describe, expect, it } from "vitest"
import type { FlowDiagram } from "@/model/flow/schema"
import { LANE_MARGIN, LANE_MIN_H, POOL_HEADER_W, POOL_MIN_W } from "@/model/flow/schema"
import { flowLayoutGraph, keepInSpan, LANE_PAD, placedBounds, placeInLanes } from "./layout"

const node = (lane: string | null) => ({ label: "x", shape: "process" as const, lane })

/**
 * I nodi (chiave → corsia, `null` se libero) e i pool (id → corsie). Il pool i-esimo sta a y = i × 1000,
 * così l'ordine delle `y` è quello della dichiarazione. Corsie alte il minimo.
 */
function diagram(nodes: Record<string, string | null>, pools: Record<string, string[]> = { p1: ["l1"] }): FlowDiagram {
  const entries = Object.entries(pools)
  return {
    model: {
      pools: Object.fromEntries(entries.map(([id, ls]) => [id, { name: id, lanes: ls.map((l) => ({ id: l, name: l })) }])),
      nodes: Object.fromEntries(Object.entries(nodes).map(([k, lane]) => [k, node(lane)])),
      edges: {},
    },
    view: {
      nodes: {},
      pools: Object.fromEntries(entries.map(([id], i) => [id, { x: 0, y: i * 1000, w: POOL_MIN_W }])),
      lanes: Object.fromEntries(entries.flatMap(([, ls]) => ls.map((l) => [l, { h: LANE_MIN_H }]))),
    },
  }
}

describe("placeInLanes", () => {
  it("non tocca la x: è l'asse del flusso, e viene da ELK", () => {
    const { positions } = placeInLanes(diagram({ a: "l1" }), { a: { x: 137, y: 999 } })
    expect(positions.a!.x).toBe(137)
  })

  it("mette ogni nodo dentro la sua corsia", () => {
    const r = placeInLanes(diagram({ a: "l1", b: "l2" }, { p1: ["l1", "l2"] }), { a: { x: 0, y: 500 }, b: { x: 0, y: 0 } })
    const top1 = r.pools.p1!.y
    const top2 = top1 + r.lanes.l1!.h
    expect(r.positions.a!.y).toBeGreaterThanOrEqual(top1)
    expect(r.positions.a!.y).toBeLessThan(top2)
    expect(r.positions.b!.y).toBeGreaterThanOrEqual(top2)
    expect(r.positions.b!.y).toBeLessThan(top2 + r.lanes.l2!.h)
  })

  it("senza nodi liberi il primo pool parte da zero, e le corsie vuote restano al minimo", () => {
    const r = placeInLanes(diagram({}, { p1: ["l1", "l2"] }), {})
    expect(r.pools.p1!.y).toBe(0)
    expect(r.lanes).toEqual({ l1: { h: LANE_MIN_H }, l2: { h: LANE_MIN_H } })
  })

  it("i nodi liberi vanno in cima, e il pool comincia sotto la loro riga", () => {
    const r = placeInLanes(diagram({ f: null, a: "l1" }), { f: { x: 0, y: 0 }, a: { x: 0, y: 0 } })
    expect(r.positions.f!.y).toBe(LANE_PAD)
    // Una riga di nodi alti 40, con LANE_PAD sopra e sotto.
    expect(r.pools.p1!.y).toBe(LANE_PAD + 40 + LANE_PAD)
    expect(r.positions.a!.y).toBe(r.pools.p1!.y + LANE_PAD)
  })

  it("i pool si impilano nell'ordine della loro y, non del loro id", () => {
    // `z` è dichiarato per primo, quindi sta a y = 0; `a` a y = 1000.
    const r = placeInLanes(diagram({}, { z: ["lz"], a: ["la"] }), {})
    expect(r.pools.z!.y).toBe(0)
    expect(r.pools.a!.y).toBe(LANE_MIN_H)
  })

  it("tutti i pool prendono la stessa x e la stessa larghezza, dall'ingombro dei nodi di flusso", () => {
    const r = placeInLanes(diagram({ f: null, a: "l1", b: "m1" }, { p1: ["l1"], p2: ["m1"] }), {
      f: { x: 0, y: 0 },
      a: { x: 100, y: 0 },
      b: { x: 2000, y: 0 },
    })
    // Ingombro 0–2060 (`b` è largo 60).
    const x = 0 - LANE_MARGIN - POOL_HEADER_W
    const w = 2060 + 2 * LANE_MARGIN + POOL_HEADER_W
    expect(r.pools.p1).toMatchObject({ x, w })
    expect(r.pools.p2).toMatchObject({ x, w })
  })

  it("con pochi nodi la larghezza non scende sotto POOL_MIN_W", () => {
    expect(placeInLanes(diagram({ a: "l1" }), { a: { x: 0, y: 0 } }).pools.p1!.w).toBe(POOL_MIN_W)
  })

  it("due nodi della stessa corsia che si accavallano in x finiscono su righe diverse", () => {
    const { positions } = placeInLanes(diagram({ a: "l1", b: "l1" }), { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } })
    expect(positions.a!.y).not.toBe(positions.b!.y)
    expect(positions.a!.x).toBe(0)
    expect(positions.b!.x).toBe(10)
  })

  it("due nodi della stessa corsia lontani in x restano sulla stessa riga", () => {
    const { positions } = placeInLanes(diagram({ a: "l1", b: "l1" }), { a: { x: 0, y: 0 }, b: { x: 900, y: 400 } })
    expect(positions.a!.y).toBe(positions.b!.y)
  })

  // Tre righe nella prima corsia: due righe minime resterebbero sotto LANE_MIN_H.
  it("una corsia le cui righe superano il minimo cresce, e la successiva parte da lì", () => {
    const r = placeInLanes(diagram({ a: "l1", b: "l1", c: "l1", d: "l2" }, { p1: ["l1", "l2"] }), {
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      c: { x: 20, y: 0 },
      d: { x: 0, y: 0 },
    })
    expect(r.lanes.l1!.h).toBeGreaterThan(LANE_MIN_H)
    expect(r.positions.d!.y).toBeGreaterThanOrEqual(r.pools.p1!.y + r.lanes.l1!.h)
  })

  it("a parità di colonna l'ordine è quello che ELK aveva dato con la y", () => {
    const { positions } = placeInLanes(diagram({ a: "l1", b: "l1" }), { a: { x: 0, y: 500 }, b: { x: 0, y: 0 } })
    expect(positions.b!.y).toBeLessThan(positions.a!.y)
  })

  it("un nodo senza posizione da ELK non compare nel risultato invece di finire a zero", () => {
    expect(placeInLanes(diagram({ a: "l1", b: "l1" }), { a: { x: 0, y: 0 } }).positions.b).toBeUndefined()
  })

  it("un nodo la cui corsia non esiste non fa esplodere la funzione, e resta fuori dal risultato", () => {
    const r = placeInLanes(diagram({ a: "fantasma" }), { a: { x: 0, y: 0 } })
    expect(r.positions.a).toBeUndefined()
    expect(r.lanes.l1!.h).toBe(LANE_MIN_H)
  })
})

describe("keepInSpan", () => {
  it("lascia stare un valore già dentro i margini", () => {
    expect(keepInSpan(100, 100, 40, 130)).toBe(130)
  })

  it("riaggancia prima dell'inizio al margine iniziale", () => {
    expect(keepInSpan(100, 100, 40, -500)).toBe(100 + LANE_PAD)
  })

  it("riaggancia oltre la fine al margine finale", () => {
    expect(keepInSpan(100, 100, 40, 500)).toBe(100 + 100 - LANE_PAD - 40)
  })

  it("un intervallo troppo corto per i due margini si ripiega sul centro", () => {
    // 2 × LANE_PAD (40) + 20 = 60 > 40: l'intervallo [min, max] è vuoto.
    expect(keepInSpan(0, 40, 20, 999)).toBe(10)
  })
})

describe("flowLayoutGraph", () => {
  function graphDiagram(over: Partial<FlowDiagram["model"]> = {}, view: Partial<FlowDiagram["view"]> = {}): FlowDiagram {
    return {
      model: { pools: {}, nodes: {}, edges: {}, ...over },
      view: { nodes: {}, pools: {}, lanes: {}, ...view },
    }
  }

  it("un nodo senza voce nella view non entra nel grafo", () => {
    const d = graphDiagram({ nodes: { a: node(null), b: node(null) } }, { nodes: { a: { x: 0, y: 0, collapsed: false } } })
    expect(flowLayoutGraph(d).nodes.map((n) => n.id)).toEqual(["a"])
  })

  it("salta l'arco con un estremo fuori dal grafo", () => {
    const d = graphDiagram(
      { nodes: { a: node(null), b: node(null) }, edges: { e1: { source: "a", target: "assente", label: "" } } },
      { nodes: { a: { x: 0, y: 0, collapsed: false }, b: { x: 0, y: 0, collapsed: false } } },
    )
    expect(flowLayoutGraph(d).edges).toEqual([])
  })

  it("non inverte gli archi: source resta la sorgente, è già il verso del flusso", () => {
    const d = graphDiagram(
      { nodes: { a: node(null), b: node(null) }, edges: { e1: { source: "a", target: "b", label: "" } } },
      { nodes: { a: { x: 0, y: 0, collapsed: false }, b: { x: 0, y: 0, collapsed: false } } },
    )
    expect(flowLayoutGraph(d).edges).toEqual([{ id: "e1", source: "a", target: "b" }])
  })

  it("la direzione è RIGHT: le corsie occupano l'asse verticale", () => {
    expect(flowLayoutGraph(graphDiagram()).direction).toBe("RIGHT")
  })
})

describe("placedBounds", () => {
  it("comprende il pool, che sporge a sinistra dei nodi e può essere più largo", () => {
    const b = placedBounds(diagram({ a: "l1" }), { a: { x: 100, y: 0 } })!
    expect(b).toEqual({ x: 100 - LANE_MARGIN - POOL_HEADER_W, y: 0, w: POOL_MIN_W, h: LANE_MIN_H })
  })

  it("un pool vuoto è un blocco, senza nodi non c'è niente", () => {
    expect(placedBounds(diagram({}), {})).toEqual({ x: 0, y: 0, w: POOL_MIN_W, h: LANE_MIN_H })
    expect(placedBounds(diagram({}, {}), {})).toBeNull()
  })
})
