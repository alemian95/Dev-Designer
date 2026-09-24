import { describe, expect, it } from "vitest"
import { linkGeometry } from "./geometry"

describe("linkGeometry", () => {
  it("percorso ortogonale, freccia aperta sul target e nessun marker sul source", () => {
    const geo = linkGeometry({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 100, w: 100, h: 40 })
    // Da destra del source a sinistra del target, con due pieghe: quattro punti.
    expect(geo.d).toBe("M100 20 L200 20 L200 120 L300 120")
    expect(geo.sourceMarker).toBe("")
    expect(geo.targetMarker).not.toBe("")
    // Etichetta a metà del primo segmento, come nel flowchart.
    expect(geo.label).toEqual({ x: 150, y: 20 })
  })
})
