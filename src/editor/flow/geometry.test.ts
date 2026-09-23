import { describe, expect, it } from "vitest"
import type { FlowDiagram, FlowEdge, FlowNode } from "@/model/flow/schema"
import { routeEdge } from "../edge-routing"
import type { Rect } from "../geometry"
import { flowEdgeGeometry, flowEdgeOffsets, flowNodeSize, laneAt, laneBandExtent, LANE_MARGIN, shapePath } from "./geometry"

const node = (over: Partial<FlowNode> = {}): FlowNode => ({ label: "Verifica", shape: "process", lane: "l1", ...over })

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
})

describe("shapePath", () => {
  it("ogni forma produce un path non vuoto", () => {
    for (const shape of ["terminal", "process", "decision", "io", "subprocess", "note"] as const) {
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

describe("laneAt", () => {
  const d = {
    type: "flow",
    model: { lanes: [{ id: "l1", name: "a" }, { id: "l2", name: "b" }], nodes: {}, edges: {} },
    view: { nodes: {}, lanes: { l1: { y: 0, h: 100 }, l2: { y: 100, h: 100 } } },
  } as FlowDiagram

  it("trova la corsia che contiene la coordinata", () => {
    expect(laneAt(d, 50)).toBe("l1")
    expect(laneAt(d, 150)).toBe("l2")
  })

  it("il confine appartiene alla corsia di sotto, senza buchi né sovrapposizioni", () => {
    expect(laneAt(d, 100)).toBe("l2")
  })

  it("fuori da ogni banda torna null: chi chiama decide, qui non si indovina", () => {
    expect(laneAt(d, -10)).toBeNull()
    expect(laneAt(d, 5000)).toBeNull()
  })
})

describe("laneBandExtent", () => {
  /**
   * Unico posto che calcola x e larghezza delle bande: sia `LanesLayerView` (canvas) sia
   * `buildSvg` (export) lo chiamano, invece di ricavare ciascuno la propria versione — la ragione
   * del Task 11, spec §5 ("la stessa banda nell'app e nell'export").
   */
  const flowDiagram = (): FlowDiagram => ({
    type: "flow",
    model: {
      lanes: [{ id: "l1", name: "a" }],
      nodes: { n1: { label: "x", shape: "process", lane: "l1" } },
      edges: {},
    },
    view: { nodes: { n1: { x: 100, y: 0, collapsed: false } }, lanes: { l1: { y: 0, h: 100 } } },
  })

  it("allarga i limiti dei nodi del margine di corsia su entrambi i lati", () => {
    const d = flowDiagram()
    const { w: nodeW } = flowNodeSize(d.model.nodes["n1"]!)
    const extent = laneBandExtent(d)
    expect(extent.x).toBe(100 - LANE_MARGIN)
    expect(extent.w).toBe(nodeW + 2 * LANE_MARGIN)
  })

  it("senza nodi torna comunque un'estensione finita, non NaN o negativa", () => {
    const d = flowDiagram()
    d.model.nodes = {}
    d.view.nodes = {}
    const extent = laneBandExtent(d)
    expect(extent.x).toBe(-LANE_MARGIN)
    expect(extent.w).toBe(2 * LANE_MARGIN)
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
