import { describe, expect, it } from "vitest"
import type { ShapeDiagram } from "@/model/shape/schema"
import { shapeDrawOrder, shapeSize, shapeTextSize } from "./geometry"

const at = (w: number | null = null, h: number | null = null) => ({ x: 0, y: 0, collapsed: false, w, h })

describe("misura delle forme", () => {
  it("rettangolo ed ellisse vuoti hanno il minimo afferrabile; il testo vuoto misura il segnaposto", () => {
    expect(shapeTextSize({ kind: "rect", label: "" })).toEqual({ w: 60, h: 40 })
    expect(shapeTextSize({ kind: "ellipse", label: "" })).toEqual({ w: 60, h: 40 })
    // «Testo»: 5 × 7,8 + 20 = 59 → 60; una riga, 22 → 30.
    expect(shapeTextSize({ kind: "text", label: "" })).toEqual({ w: 60, h: 30 })
  })

  it("l'ellisse è √2 volte il rettangolo del testo, arrotondata alla griglia", () => {
    // 15 caratteri: 15 × 7,8 + 20 = 137 → 140; × √2 = 193,7 → 200.
    expect(shapeTextSize({ kind: "rect", label: "servizio ordini" }).w).toBe(140)
    expect(shapeTextSize({ kind: "ellipse", label: "servizio ordini" }).w).toBe(200)
  })

  it("la misura vera è, lato per lato, la più grande fra testo e misura scelta", () => {
    const shape = { kind: "rect" as const, label: "servizio ordini" }
    expect(shapeSize(shape, { w: 300, h: null })).toEqual({ w: 300, h: 40 })
    expect(shapeSize(shape, { w: 50, h: 200 })).toEqual({ w: 140, h: 200 })
  })
})

describe("ordine di disegno", () => {
  it("dalla forma più grande alla più piccola, anche se la grande è stata creata dopo", () => {
    const d: ShapeDiagram = {
      model: { shapes: { piccola: { kind: "rect", label: "" }, zona: { kind: "rect", label: "" } }, arrows: {} },
      view: { nodes: { piccola: at(), zona: at(400, 300) } },
    }
    expect(shapeDrawOrder(d)).toEqual(["zona", "piccola"])
  })
})
