import { describe, expect, it } from "vitest"
import { fitToRect, IDENTITY, MAX_SCALE, panBy, screenToWorld, transformAttr, visibleWorldRect, worldToScreen, zoomAt } from "./viewport"

describe("viewport", () => {
  it("screen ↔ world sono inverse", () => {
    const vp = { x: 100, y: 50, scale: 2 }
    const p = { x: 37, y: -12 }
    expect(screenToWorld(vp, worldToScreen(vp, p))).toEqual(p)
  })

  it("zoomAt tiene fermo il punto sotto il cursore", () => {
    const vp = { x: 100, y: 50, scale: 1 }
    const screen = { x: 400, y: 300 }
    const before = screenToWorld(vp, screen)
    const after = screenToWorld(zoomAt(vp, screen, 2), screen)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it("zoomAt rispetta i limiti", () => {
    expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE)
  })

  it("fitToRect centra il contenuto e non supera scala 1", () => {
    const vp = fitToRect({ x: 0, y: 0, w: 100, h: 100 }, { w: 1000, h: 800 })
    expect(vp.scale).toBe(1)
    expect(vp.x).toBe(450)
    expect(vp.y).toBe(350)
    expect(fitToRect(null, { w: 1000, h: 800 })).toEqual(IDENTITY)
  })

  it("panBy e transformAttr", () => {
    expect(panBy(IDENTITY, 10, -5)).toEqual({ x: 10, y: -5, scale: 1 })
    expect(transformAttr({ x: 10, y: -5, scale: 2 })).toBe("translate(10 -5) scale(2)")
  })

  it("visibleWorldRect", () => {
    expect(visibleWorldRect({ x: 100, y: 0, scale: 2 }, { w: 400, h: 200 })).toEqual({ x: -50, y: 0, w: 200, h: 100 })
  })
})
