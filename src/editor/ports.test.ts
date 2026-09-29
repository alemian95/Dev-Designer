import { describe, expect, it } from "vitest"
import { DOWN, LEFT, RIGHT, UP } from "./edge-routing"
import { anchorPort, autoPorts, offeredAnchors, samePorts, STUB } from "./ports"

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
