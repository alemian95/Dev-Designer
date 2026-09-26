import { describe, expect, it } from "vitest"
import { POOL_HEADER_W, type FlowDiagram, type FlowEdge, type FlowNode } from "@/model/flow/schema"
import { flowNodeSize as flowNodeSizeDelModello } from "@/model/flow/size"
import { CHAR_W as CHAR_W_DEL_MODELLO } from "@/model/metrics"
import { routeEdge } from "../edge-routing"
import { CHAR_W } from "../geometry"
import type { Rect } from "../geometry"
import { flowEdgeGeometry, flowEdgeOffsets, flowNodeSize, laneAt, laneOwner, laneRects, poolAt, poolLaneRects, poolMembers, poolRect, shapePath } from "./geometry"

const node = (over: Partial<FlowNode> = {}): FlowNode => ({ label: "Verifica", shape: "process", lane: null, ...over })

describe("flowNodeSize", () => {
  it("cresce con la riga più lunga", () => {
    const corta = flowNodeSize(node({ label: "ok" }))
    const lunga = flowNodeSize(node({ label: "una etichetta molto più lunga di quella corta" }))
    expect(lunga.w).toBeGreaterThan(corta.w)
  })

  it("cresce in altezza con il numero di righe", () => {
    const una = flowNodeSize(node({ label: "a" }))
    const tre = flowNodeSize(node({ label: "a\nb\nc" }))
    expect(tre.h).toBeGreaterThan(una.h)
  })

  it("il rombo è circa il doppio del rettangolo a parità di testo: deve contenerlo", () => {
    const processo = flowNodeSize(node({ shape: "process" }))
    const decisione = flowNodeSize(node({ shape: "decision" }))
    expect(decisione.w).toBe(processo.w * 2)
    expect(decisione.h).toBe(processo.h * 2)
  })

  it("un'etichetta vuota non produce un nodo invisibile", () => {
    const vuoto = flowNodeSize(node({ label: "" }))
    expect(vuoto.w).toBeGreaterThanOrEqual(60)
    expect(vuoto.h).toBeGreaterThanOrEqual(40)
  })

  it("è la funzione del modello riesportata, con le stesse metriche: una formula sola", () => {
    expect(flowNodeSize).toBe(flowNodeSizeDelModello)
    expect(CHAR_W).toBe(CHAR_W_DEL_MODELLO)
  })
})

describe("shapePath", () => {
  it("ogni forma produce un path non vuoto", () => {
    for (const shape of ["terminal", "process", "decision", "io", "subprocess"] as const) {
      expect(shapePath(shape, 100, 50).length).toBeGreaterThan(0)
    }
  })

  /**
   * Nessun test finora fissava i vertici di una forma: bastava un path non vuoto, quindi una
   * regressione che avesse mischiato le coordinate sarebbe passata in silenzio. Il rombo è quello
   * che conta davvero fissare, perché l'aggancio degli archi (spec §8) si appoggia esattamente sul
   * fatto che il punto medio di ogni lato del rettangolo di ingombro **è** la punta del rombo — se
   * quella proprietà si rompe, l'arco attacca fuori posto senza che nessun test se ne accorga.
   *
   * `w` e `h` diversi fra loro, non un quadrato: uno scambio fra i due (o fra `w/2` e `h/2`)
   * sfuggirebbe a un caso simmetrico e qui invece sposta il vertice.
   *
   * I numeri si estraggono dal `d` con una regex invece di confrontare la stringa letterale:
   * pinna i quattro vertici, non la sintassi esatta del path (spaziatura, notazione decimale).
   */
  it("il rombo ha i quattro vertici sui punti medi dei lati del rettangolo di ingombro", () => {
    const w = 120
    const h = 80
    const d = shapePath("decision", w, h)
    const numbers = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    const points: [number, number][] = []
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i]!, numbers[i + 1]!])
    expect(points).toEqual([
      [w / 2, 0],
      [w, h / 2],
      [w / 2, h],
      [0, h / 2],
    ])
  })
})

/** Due pool: `a` a (0, 0), largo 400, con a1 (alta 100) e a2 (50); `b` a (300, 50), largo 400, con
 *  b1 (100). `b` viene dopo `a` nell'ordine di disegno, quindi sta sopra. */
function duePool(): FlowDiagram {
  return {
    model: {
      pools: {
        a: { name: "A", lanes: [{ id: "a1", name: "a1" }, { id: "a2", name: "a2" }] },
        b: { name: "B", lanes: [{ id: "b1", name: "b1" }] },
      },
      nodes: {
        n1: { label: "x", shape: "process", lane: "a1" },
        n2: { label: "y", shape: "process", lane: "b1" },
        n3: { label: "z", shape: "process", lane: null },
      },
      edges: {},
    },
    view: {
      nodes: {},
      pools: { a: { x: 0, y: 0, w: 400 }, b: { x: 300, y: 50, w: 400 } },
      lanes: { a1: { h: 100 }, a2: { h: 50 }, b1: { h: 100 } },
    },
  }
}

describe("laneRects", () => {
  it("impila le corsie di un pool dalle altezze, e salta la striscia", () => {
    expect(poolLaneRects(duePool(), "a")).toEqual([
      { id: "a1", poolId: "a", x: POOL_HEADER_W, y: 0, w: 400 - POOL_HEADER_W, h: 100 },
      { id: "a2", poolId: "a", x: POOL_HEADER_W, y: 100, w: 400 - POOL_HEADER_W, h: 50 },
    ])
  })

  it("tutte le corsie, nell'ordine di disegno dei pool", () => {
    expect(laneRects(duePool()).map((r) => r.id)).toEqual(["a1", "a2", "b1"])
  })

  it("un pool senza vista non ha corsie, invece di rompersi", () => {
    const d = duePool()
    delete d.view.pools["a"]
    expect(poolLaneRects(d, "a")).toEqual([])
  })
})

describe("poolRect", () => {
  it("è alto quanto le sue corsie, striscia compresa", () => {
    expect(poolRect(duePool(), "a")).toEqual({ x: 0, y: 0, w: 400, h: 150 })
  })

  it("con `at` cambia solo la posizione", () => {
    expect(poolRect(duePool(), "a", { x: 5, y: 6 })).toEqual({ x: 5, y: 6, w: 400, h: 150 })
  })

  it("null per un pool che non c'è", () => {
    expect(poolRect(duePool(), "fantasma")).toBeNull()
  })
})

describe("poolAt e laneAt", () => {
  it("trovano il pool e la corsia che contengono il punto", () => {
    expect(poolAt(duePool(), { x: 100, y: 120 })).toBe("a")
    expect(laneAt(duePool(), { x: 100, y: 120 })).toBe("a2")
  })

  it("il confine fra due corsie appartiene a quella di sotto", () => {
    expect(laneAt(duePool(), { x: 100, y: 100 })).toBe("a2")
  })

  it("sulla striscia di intestazione c'è il pool ma nessuna corsia", () => {
    expect(poolAt(duePool(), { x: 10, y: 10 })).toBe("a")
    expect(laneAt(duePool(), { x: 10, y: 10 })).toBeNull()
  })

  it("fuori da ogni pool: null", () => {
    expect(poolAt(duePool(), { x: -5, y: 10 })).toBeNull()
    expect(laneAt(duePool(), { x: 100, y: 500 })).toBeNull()
  })

  it("nella zona comune a due pool vince quello disegnato sopra", () => {
    // (350, 60) sta in a1 e in b1: `b` è disegnato dopo, quindi sopra.
    expect(laneAt(duePool(), { x: 350, y: 60 })).toBe("b1")
  })
})

describe("laneOwner e poolMembers", () => {
  it("il pool di una corsia", () => {
    expect(laneOwner(duePool(), "a2")).toBe("a")
    expect(laneOwner(duePool(), "fantasma")).toBeNull()
  })

  it("i nodi di un pool sono quelli nelle sue corsie, non i liberi", () => {
    expect(poolMembers(duePool(), "a")).toEqual(["n1"])
    expect(poolMembers(duePool(), "b")).toEqual(["n2"])
  })
})

describe("flowEdgeGeometry", () => {
  // `y` diversi fra sorgente e bersaglio, non allineati: con due punti soli (linea retta) il primo
  // segmento e quello centrale coincidono e la proprietà che questi test devono fissare — che
  // l'etichetta sta sul *primo* segmento, non su quello centrale come in ER e classi (spec §8,
  // docblock di `flowEdgeGeometry`) — non si distinguerebbe da un copia-incolla della formula di
  // `edgeGeometry`. Con `y` diversi il router piega due volte e i due punti medi divergono davvero.
  const source: Rect = { x: 0, y: 0, w: 100, h: 60 }
  const target: Rect = { x: 300, y: 100, w: 100, h: 60 }
  const edge = (over: Partial<FlowEdge> = {}): FlowEdge => ({ source: "a", target: "b", label: "", ...over })

  it("l'etichetta cade sul punto medio del primo segmento, non di quello centrale", () => {
    const route = routeEdge(source, target, false)
    const p0 = route.points[0]!
    const p1 = route.points[1]!
    // Il percorso piega davvero: altrimenti il primo segmento e quello centrale coinciderebbero e
    // il test passerebbe anche con la formula sbagliata.
    expect(route.points.length).toBeGreaterThan(2)
    const geo = flowEdgeGeometry(source, target, edge())
    expect(geo.label).toEqual({ x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 })
  })

  it("due archi fra la stessa coppia ereditano offset diversi: le etichette non coincidono", () => {
    const edges: Readonly<Record<string, FlowEdge>> = { e1: edge(), e2: edge() }
    const offsets = flowEdgeOffsets(edges)
    const g1 = flowEdgeGeometry(source, target, edges.e1!, offsets.get("e1") ?? 0)
    const g2 = flowEdgeGeometry(source, target, edges.e2!, offsets.get("e2") ?? 0)
    expect(g1.label).not.toEqual(g2.label)
  })
})
