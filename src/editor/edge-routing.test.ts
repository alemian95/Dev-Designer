import { describe, expect, it } from "vitest"
import type { Relationship } from "@/model/er/schema"
import { crowsFootPath, DOWN, edgeGeometry, filledArrowPath, LEFT, pathFromPoints, RIGHT, routePorts, UP } from "./edge-routing"
import { autoPorts, STUB, type EdgePorts, type Port } from "./ports"

const rel: Relationship = {
  source: { entity: "a", attributes: [], cardinality: "many" },
  target: { entity: "b", attributes: [], cardinality: "one" },
  identifying: false,
}

describe("routePorts fra due rettangoli", () => {
  it("entità affiancate: esce da destra, entra da sinistra, due pieghe", () => {
    const r = routePorts(autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 100, w: 100, h: 50 }))
    expect(r.sourceDir).toEqual({ x: 1, y: 0 })
    expect(r.targetDir).toEqual({ x: -1, y: 0 })
    expect(r.points).toEqual([{ x: 100, y: 25 }, { x: 200, y: 25 }, { x: 200, y: 125 }, { x: 300, y: 125 }])
  })

  it("stessa altezza: segmento dritto", () => {
    const r = routePorts(autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 }))
    expect(r.points).toHaveLength(2)
  })

  it("entità impilate: esce dal basso, entra dall'alto", () => {
    const r = routePorts(autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 20, y: 300, w: 100, h: 50 }))
    expect(r.sourceDir).toEqual({ x: 0, y: 1 })
    expect(r.targetDir).toEqual({ x: 0, y: -1 })
    expect(r.points[0]).toEqual({ x: 50, y: 50 })
  })
})

describe("routePorts da sinistra a destra", () => {
  it("esce a destra della sorgente ed entra a sinistra del bersaglio", () => {
    const a = { x: 0, y: 0, w: 100, h: 60 }
    const b = { x: 300, y: 0, w: 100, h: 60 }
    const route = routePorts(autoPorts(a, b))
    expect(route.sourceDir).toEqual(RIGHT)
    expect(route.targetDir).toEqual(LEFT)
  })

  it("un arco all'indietro esce comunque con un percorso ortogonale valido", () => {
    const a = { x: 300, y: 0, w: 100, h: 60 }
    const b = { x: 0, y: 0, w: 100, h: 60 }
    const route = routePorts(autoPorts(a, b))
    expect(route.points.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < route.points.length; i++) {
      const p = route.points[i - 1]!, q = route.points[i]!
      expect(p.x === q.x || p.y === q.y).toBe(true)
    }
  })
})

describe("crowsFootPath", () => {
  it("one: una sola barra", () => {
    expect(crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "one")).toBe("M12 -6 L12 6")
  })
  it("many: tre linee più la barra", () => {
    const d = crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "many")
    expect(d.split("M")).toHaveLength(5)
  })
  it("zero-or-one: barra più cerchio", () => {
    expect(crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "zero-or-one")).toContain("a4 4 0 1 0 8 0")
  })
})

describe("edgeGeometry", () => {
  it("produce path, marker ed etichetta", () => {
    const g = edgeGeometry(autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 }), rel)
    expect(g.d).toBe(pathFromPoints([{ x: 100, y: 25 }, { x: 300, y: 25 }]))
    expect(g.label).toEqual({ x: 200, y: 25 })
    expect(g.sourceMarker).toContain("M")
    expect(g.targetMarker).toBe("M288 31 L288 19")
  })
})

describe("filledArrowPath", () => {
  it("la cima sta nel punto dato e la base si apre lungo la direzione", () => {
    expect(filledArrowPath({ x: 100, y: 50 }, { x: 1, y: 0 })).toBe("M100 50 L110 45 L110 55 Z")
  })
})

/** Invarianti di ogni percorso: segmenti ortogonali, primo lungo `source.dir`, ultimo lungo `−target.dir`. */
function checkRoute(ports: EdgePorts) {
  const { points } = routePorts(ports)
  expect(points[0]).toEqual(ports.source.point)
  expect(points[points.length - 1]).toEqual(ports.target.point)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    expect(a.x === b.x || a.y === b.y).toBe(true)
    expect(a.x === b.x && a.y === b.y).toBe(false)
  }
  const dirOf = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) })
  expect(dirOf(points[0]!, points[1]!)).toEqual(ports.source.dir)
  const last = dirOf(points[points.length - 2]!, points[points.length - 1]!)
  expect(last).toEqual({ x: -ports.target.dir.x || 0, y: -ports.target.dir.y || 0 })
  return points
}

const port = (x: number, y: number, dir: Port["dir"]): Port => ({ point: { x, y }, dir })
const ports = (source: Port, target: Port, stub = STUB): EdgePorts => ({ source, target, stub })

describe("routePorts", () => {
  it("porti che si guardano: la Z di prima", () => {
    const p = autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 100, w: 100, h: 50 })
    expect(checkRoute(p)).toEqual([{ x: 100, y: 25 }, { x: 200, y: 25 }, { x: 200, y: 125 }, { x: 300, y: 125 }])
  })

  it("allineati: un segmento solo", () => {
    expect(checkRoute(ports(port(100, 25, RIGHT), port(300, 25, LEFT)))).toHaveLength(2)
  })

  it("perpendicolari e davanti l'uno all'altro: una L", () => {
    expect(checkRoute(ports(port(100, 25, RIGHT), port(300, 125, UP)))).toEqual([{ x: 100, y: 25 }, { x: 300, y: 25 }, { x: 300, y: 125 }])
  })

  it("stessa direzione: una U oltre il più esterno dei due", () => {
    expect(checkRoute(ports(port(100, 25, RIGHT), port(300, 125, RIGHT)))).toEqual([
      { x: 100, y: 25 }, { x: 316, y: 25 }, { x: 316, y: 125 }, { x: 300, y: 125 },
    ])
  })

  it("opposte ma voltate: una S fra i due tratti", () => {
    checkRoute(ports(port(300, 25, RIGHT), port(100, 125, LEFT)))
  })

  it("perpendicolari senza L possibile: esce, gira, rientra", () => {
    checkRoute(ports(port(100, 25, RIGHT), port(50, 0, UP)))
  })

  it("il cappio: esce a destra, gira sopra e rientra dall'alto, largo quanto il suo tratto", () => {
    const pts = checkRoute(ports(port(100, 12.5, RIGHT), port(75, 0, UP), 30))
    expect(pts).toEqual([{ x: 100, y: 12.5 }, { x: 130, y: 12.5 }, { x: 130, y: -30 }, { x: 75, y: -30 }, { x: 75, y: 0 }])
  })

  it("verticali che si guardano: la Z verticale", () => {
    checkRoute(ports(port(50, 50, DOWN), port(70, 300, UP)))
  })

  it("stessa direzione sulla stessa retta: la U si scosta di lato", () => {
    checkRoute(ports(port(100, 25, RIGHT), port(300, 25, RIGHT)))
    checkRoute(ports(port(300, 25, RIGHT), port(100, 25, RIGHT)))
    checkRoute(ports(port(50, 0, DOWN), port(50, 200, DOWN)))
  })

  it("opposte e voltate, sulla stessa retta: la S si scosta di lato", () => {
    checkRoute(ports(port(300, 25, RIGHT), port(100, 25, LEFT)))
    checkRoute(ports(port(50, 200, DOWN), port(50, 0, UP)))
  })

  it("lati opposti dello stesso nodo (cappio): il percorso non attraversa in linea retta", () => {
    checkRoute(ports(port(0, 25, LEFT), port(100, 25, RIGHT)))
    checkRoute(ports(port(50, 0, UP), port(50, 50, DOWN)))
  })

  it("perpendicolari con i tratti sulla stessa retta: il giro non torna su se stesso", () => {
    checkRoute(ports(port(100, 25, RIGHT), port(116, 0, UP)))
    checkRoute(ports(port(100, 25, RIGHT), port(50, 41, UP)))
    checkRoute(ports(port(25, 100, DOWN), port(0, 116, LEFT)))
    checkRoute(ports(port(25, 100, DOWN), port(41, 50, LEFT)))
  })

  it("restituisce le direzioni dei porti per i marker", () => {
    const r = routePorts(ports(port(100, 25, RIGHT), port(300, 125, UP)))
    expect(r.sourceDir).toEqual(RIGHT)
    expect(r.targetDir).toEqual(UP)
  })
})
