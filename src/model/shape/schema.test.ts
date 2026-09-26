import { describe, expect, it } from "vitest"
import { ArrowSchema, ShapeDiagramSchema, ShapeSchema, ShapeViewSchema } from "./schema"

const at = (w: number | null = null, h: number | null = null) => ({ x: 0, y: 0, collapsed: false, w, h })

describe("schema delle forme", () => {
  it("accetta forme, view con la misura scelta e frecce", () => {
    const part = {
      model: {
        shapes: { a: { kind: "rect", label: "" }, b: { kind: "ellipse", label: "API" }, c: { kind: "text", label: "titolo" } },
        arrows: { f: { source: "a", target: "b", head: "end", dashed: false } },
      },
      view: { nodes: { a: at(200, null), b: at(), c: at() } },
    }
    expect(ShapeDiagramSchema.safeParse(part).success).toBe(true)
  })

  it("rifiuta una freccia da una forma a sé stessa", () => {
    expect(ArrowSchema.safeParse({ source: "a", target: "a", head: "end", dashed: false }).success).toBe(false)
  })

  it("rifiuta un tipo di forma sconosciuto e una misura scelta non positiva", () => {
    expect(ShapeSchema.safeParse({ kind: "triangle", label: "" }).success).toBe(false)
    expect(ShapeViewSchema.safeParse(at(0, null)).success).toBe(false)
  })
})
