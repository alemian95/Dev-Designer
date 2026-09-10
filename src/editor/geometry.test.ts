import { describe, expect, it } from "vitest"
import { rectsBounds, rectsIntersect, snap } from "./geometry"

describe("rect helpers", () => {
  it("snap arrotonda alla griglia", () => {
    expect(snap(14)).toBe(10)
    expect(snap(15)).toBe(20)
  })
  it("rectsBounds racchiude tutti i rettangoli e null se vuoto", () => {
    expect(rectsBounds([])).toBeNull()
    expect(rectsBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 10, h: 10 }])).toEqual({ x: 0, y: -5, w: 30, h: 15 })
  })
  it("rectsIntersect", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 10, h: 10 })).toBe(false)
  })
})
