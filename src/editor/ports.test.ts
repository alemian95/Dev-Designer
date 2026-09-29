import { describe, expect, it } from "vitest"
import { DOWN, LEFT, RIGHT, UP, type EdgeEnds } from "./edge-routing"
import type { Rect } from "./geometry"
import { anchorPort, assignPorts, autoPorts, LOOP_GAP, offeredAnchors, type Outline, samePorts, SELF_LOOP_OFFSET, STUB } from "./ports"

const R = { x: 0, y: 0, w: 100, h: 40 }
const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 2)
  expect(p.y).toBeCloseTo(y, 2)
}

describe("anchorPort sul rettangolo", () => {
  it("i punti dei lati stanno a ¼, ½, ¾ in senso orario, con la normale uscente", () => {
    expect(anchorPort(R, "rect", "n1")).toEqual({ point: { x: 25, y: 0 }, dir: UP })
    expect(anchorPort(R, "rect", "e2")).toEqual({ point: { x: 100, y: 20 }, dir: RIGHT })
    expect(anchorPort(R, "rect", "s1")).toEqual({ point: { x: 75, y: 40 }, dir: DOWN })
    expect(anchorPort(R, "rect", "w1")).toEqual({ point: { x: 0, y: 30 }, dir: LEFT })
  })

  it("uno spigolo esce dalla normale che guarda di più verso l'altro capo", () => {
    expect(anchorPort(R, "rect", "nw", { x: 500, y: 0 })).toEqual({ point: { x: 0, y: 0 }, dir: UP })
    expect(anchorPort(R, "rect", "nw", { x: -500, y: 20 })).toEqual({ point: { x: 0, y: 0 }, dir: LEFT })
    expect(anchorPort(R, "rect", "se", { x: 400, y: 60 }).dir).toEqual(RIGHT)
  })

  it("senza `toward` lo spigolo esce in orizzontale", () => {
    expect(anchorPort(R, "rect", "ne").dir).toEqual(RIGHT)
  })
})

describe("anchorPort sui contorni non rettangolari", () => {
  it("rombo: il punto scende sul lato obliquo, la punta resta la punta", () => {
    close(anchorPort(R, "diamond", "n1").point, 25, 10)
    close(anchorPort(R, "diamond", "n2").point, 50, 0)
    close(anchorPort(R, "diamond", "e2").point, 100, 20)
  })

  it("ellisse: il punto sta sulla curva", () => {
    close(anchorPort(R, "ellipse", "n1").point, 25, 20 - 20 * Math.sqrt(0.75))
    close(anchorPort(R, "ellipse", "w2").point, 0, 20)
  })

  it("stadio: dritto sul tratto piano, sulla curva sulle estremità", () => {
    close(anchorPort(R, "stadium", "n1").point, 25, 0)
    close(anchorPort(R, "stadium", "e2").point, 100, 20)
    close(anchorPort(R, "stadium", "e1").point, 80 + Math.sqrt(300), 10)
  })

  it("parallelogramma: i lati obliqui e i vertici veri", () => {
    const skew = { skew: 16 }
    close(anchorPort(R, skew, "n1").point, 25, 0)
    close(anchorPort(R, skew, "w2").point, 8, 20)
    close(anchorPort(R, skew, "e2").point, 92, 20)
    close(anchorPort(R, skew, "nw").point, 16, 0)
    close(anchorPort(R, skew, "se").point, 84, 40)
  })

  it("uno spigolo su un rombo cade sul contorno, in diagonale verso il centro", () => {
    close(anchorPort(R, "diamond", "nw").point, 25, 10)
    close(anchorPort(R, "ellipse", "se").point, 50 + 50 * Math.SQRT1_2, 20 + 20 * Math.SQRT1_2)
  })
})

describe("offeredAnchors", () => {
  it("rettangolo e parallelogramma offrono 16 punti, le forme senza spigoli 12", () => {
    expect(offeredAnchors("rect")).toHaveLength(16)
    expect(offeredAnchors({ skew: 16 })).toHaveLength(16)
    for (const o of ["diamond", "ellipse", "stadium"] as const) {
      expect(offeredAnchors(o)).toHaveLength(12)
      expect(offeredAnchors(o)).not.toContain("nw")
    }
  })
})

describe("autoPorts", () => {
  it("la geometria di oggi: il centro dei due lati che si guardano", () => {
    const p = autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 100, w: 100, h: 50 })
    expect(p).toEqual({ source: { point: { x: 100, y: 25 }, dir: RIGHT }, target: { point: { x: 300, y: 125 }, dir: LEFT }, stub: STUB })
  })

  it("nodi impilati: dal basso verso l'alto", () => {
    const p = autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 20, y: 300, w: 100, h: 50 })
    expect(p.source).toEqual({ point: { x: 50, y: 50 }, dir: DOWN })
    expect(p.target).toEqual({ point: { x: 70, y: 300 }, dir: UP })
  })
})

describe("samePorts", () => {
  it("confronta i numeri, non l'identità", () => {
    const a = autoPorts(R, { ...R, x: 300 })
    expect(samePorts(a, autoPorts(R, { ...R, x: 300 }))).toBe(true)
    expect(samePorts(a, autoPorts(R, { ...R, x: 310 }))).toBe(false)
  })
})

describe("assignPorts", () => {
  const rects: Record<string, Rect> = {
    a: { x: 0, y: 0, w: 100, h: 50 },
    b: { x: 400, y: 0, w: 100, h: 50 },
    t: { x: 200, y: 300, w: 120, h: 40 },
    c: { x: 1000, y: 1000, w: 100, h: 50 },
    d: { x: 1300, y: 1000, w: 100, h: 50 },
  }
  const rectOf = (k: string) => rects[k] ?? null
  const rect = (): Outline => "rect"
  const run = (edges: EdgeEnds[], outlineOf: (k: string) => Outline = rect, r = rectOf) => assignPorts(edges, r, outlineOf)

  it("lo screenshot: due sorgenti diverse sullo stesso lato del bersaglio attaccano in due punti", () => {
    const ports = run([
      { key: "ea", source: "a", target: "t" },
      { key: "eb", source: "b", target: "t" },
    ])
    // Il lato `n` di `t` va da 206 a 314: due capi a un terzo e due terzi, quello da sinistra a sinistra.
    expect(ports.get("ea")!.target).toEqual({ point: { x: 242, y: 300 }, dir: UP })
    expect(ports.get("eb")!.target).toEqual({ point: { x: 278, y: 300 }, dir: UP })
    // Un capo solo sul suo lato resta a metà, come prima degli agganci.
    expect(ports.get("ea")!.source).toEqual({ point: { x: 50, y: 50 }, dir: DOWN })
  })

  it("un arco solo fra due nodi ha la geometria di prima", () => {
    const ports = run([{ key: "e", source: "a", target: "b" }])
    expect(ports.get("e")).toEqual(autoPorts(rects.a!, rects.b!))
  })

  it("due archi fra la stessa coppia si separano, nello stesso ordine ai due capi", () => {
    const ports = run([
      { key: "e1", source: "a", target: "b" },
      { key: "e2", source: "a", target: "b" },
    ])
    const [p1, p2] = [ports.get("e1")!, ports.get("e2")!]
    expect(p1.source.point.y).not.toBe(p2.source.point.y)
    expect(p1.source.point.y < p2.source.point.y).toBe(p1.target.point.y < p2.target.point.y)
  })

  it("archi di famiglie diverse sullo stesso lato si separano fra loro", () => {
    const ports = run([
      { key: "flow/e", source: "a", target: "t" },
      { key: "link/l", source: "b", target: "t" },
    ])
    expect(ports.get("flow/e")!.target.point).not.toEqual(ports.get("link/l")!.target.point)
  })

  it("un capo fissato resta al suo punto e i capi automatici gli lasciano spazio", () => {
    const ports = run([
      { key: "fisso", source: "a", target: "t", anchors: { source: null, target: "n2" } },
      { key: "auto", source: "b", target: "t" },
    ])
    expect(ports.get("fisso")!.target).toEqual({ point: { x: 260, y: 300 }, dir: UP })
    // `b` sta a destra: il suo capo cade nell'intervallo fra il fissato e lo spigolo destro.
    expect(ports.get("auto")!.target.point).toEqual({ x: 287, y: 300 })
  })

  it("un capo fissato su un rombo cade sul contorno del rombo", () => {
    const ports = run([{ key: "e", source: "a", target: "t", anchors: { source: null, target: "nw" } }], (k) => (k === "t" ? "diamond" : "rect"))
    const p = ports.get("e")!.target.point
    expect(p.x).toBeCloseTo(230, 2)
    expect(p.y).toBeCloseTo(310, 2)
  })

  it("il cappio esce da destra, entra dall'alto, e il secondo cappio gira più largo", () => {
    const ports = run([
      { key: "l1", source: "a", target: "a" },
      { key: "l2", source: "a", target: "a" },
    ])
    expect(ports.get("l1")!.source.dir).toEqual(RIGHT)
    expect(ports.get("l1")!.target.dir).toEqual(UP)
    expect(ports.get("l1")!.stub).toBe(SELF_LOOP_OFFSET)
    expect(ports.get("l2")!.stub).toBe(SELF_LOOP_OFFSET + LOOP_GAP)
    expect(ports.get("l1")!.source.point).not.toEqual(ports.get("l2")!.source.point)
  })

  it("un arco con un estremo senza rettangolo non ha porti", () => {
    expect(run([{ key: "e", source: "a", target: "manca" }]).has("e")).toBe(false)
  })

  it("località: spostare un nodo non tocca i porti degli archi lontani da lui e dai suoi vicini", () => {
    const edges: EdgeEnds[] = [
      { key: "at", source: "a", target: "t" },
      { key: "cd", source: "c", target: "d" },
    ]
    const before = run(edges)
    const moved = (k: string) => (k === "a" ? { ...rects.a!, x: 150 } : rectOf(k))
    const after = run(edges, rect, moved)
    expect(after.get("cd")).toEqual(before.get("cd"))
    expect(after.get("at")).not.toEqual(before.get("at"))
  })
})
