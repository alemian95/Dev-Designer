import { describe, expect, it } from "vitest"
import type { Relationship } from "@/model/document"
import { crowsFootPath, edgeGeometry, pathFromPoints, routeEdge } from "./edge-routing"

const rel: Relationship = {
  source: { entity: "a", attributes: [], cardinality: "many" },
  target: { entity: "b", attributes: [], cardinality: "one" },
  identifying: false,
}

describe("routeEdge", () => {
  it("entità affiancate: esce da destra, entra da sinistra, due pieghe", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 100, w: 100, h: 50 })
    expect(r.sourceDir).toEqual({ x: 1, y: 0 })
    expect(r.targetDir).toEqual({ x: -1, y: 0 })
    expect(r.points).toEqual([{ x: 100, y: 25 }, { x: 200, y: 25 }, { x: 200, y: 125 }, { x: 300, y: 125 }])
  })

  it("stessa altezza: segmento dritto", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 })
    expect(r.points).toHaveLength(2)
  })

  it("entità impilate: esce dal basso, entra dall'alto", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 20, y: 300, w: 100, h: 50 })
    expect(r.sourceDir).toEqual({ x: 0, y: 1 })
    expect(r.targetDir).toEqual({ x: 0, y: -1 })
    expect(r.points[0]).toEqual({ x: 50, y: 50 })
  })

  it("relazione su se stessa: anello a destra e rientro dall'alto", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 }
    const r = routeEdge(a, a)
    expect(r.points).toHaveLength(5)
    expect(r.targetDir).toEqual({ x: 0, y: -1 })
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
    const g = edgeGeometry({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 }, rel)
    expect(g.d).toBe(pathFromPoints([{ x: 100, y: 25 }, { x: 300, y: 25 }]))
    expect(g.label).toEqual({ x: 200, y: 25 })
    expect(g.sourceMarker).toContain("M")
    expect(g.targetMarker).toBe("M288 31 L288 19")
  })
})
