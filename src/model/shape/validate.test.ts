import { describe, expect, it } from "vitest"
import { validateShapes } from "./validate"

describe("validazione delle forme", () => {
  it("una freccia con un estremo che non c'è è shape-dangling-arrow; le altre no", () => {
    const issues = validateShapes({
      shapes: { a: { kind: "rect", label: "" }, b: { kind: "ellipse", label: "" } },
      arrows: {
        buona: { source: "a", target: "b", head: "end", dashed: false },
        rotta: { source: "a", target: "sparita", head: "end", dashed: false },
      },
    })
    expect(issues).toEqual([{ code: "shape-dangling-arrow", severity: "error", edge: "rotta", message: "La freccia collega una forma che non c'è." }])
  })
})
