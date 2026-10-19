import { describe, expect, it } from "vitest"
import type { ShapeDiagram } from "@/model/shape/schema"
import { autoPorts } from "../ports"
import { arrowGeometry, resizedShape, shapeDrawOrder, shapeOutline, shapeSize, shapeTextSize } from "./geometry"

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

describe("geometria delle frecce", () => {
  const a = { x: 0, y: 0, w: 100, h: 40 }
  const b = { x: 300, y: 0, w: 100, h: 40 }
  const start = (d: string) => d.split(" L")[0]!.slice(1)
  const end = (d: string) => d.split(" L").at(-1)!

  it("la punta segue head: nessuna, solo alla fine, a entrambi i capi", () => {
    expect(arrowGeometry(autoPorts(a, b), { head: "none" })).toMatchObject({ sourceMarker: "", targetMarker: "" })
    const fine = arrowGeometry(autoPorts(a, b), { head: "end" })
    expect(fine.sourceMarker).toBe("")
    expect(fine.targetMarker.startsWith(`M${end(fine.d)}`)).toBe(true)
    const entrambe = arrowGeometry(autoPorts(a, b), { head: "both" })
    expect(entrambe.sourceMarker.startsWith(`M${start(entrambe.d)}`)).toBe(true)
    expect(entrambe.targetMarker).not.toBe("")
  })

  it("il contorno per gli agganci: l'ellisse è un'ellisse, il resto un rettangolo", () => {
    expect(shapeOutline("ellipse")).toBe("ellipse")
    expect(shapeOutline("rect")).toBe("rect")
    expect(shapeOutline("text")).toBe("rect")
  })
})

describe("ridimensionamento", () => {
  const vuoto = { kind: "rect" as const, label: "" }

  it("allarga della distanza trascinata, allineata alla griglia", () => {
    // 60 × 40 + (103, 47) → 163 → 160, 87 → 90.
    expect(resizedShape(vuoto, { x: 0, y: 0, w: null, h: null }, "se", 103, 47)).toEqual({ rect: { x: 0, y: 0, w: 160, h: 90 }, w: 160, h: 90 })
  })

  it("non scende sotto il testo, e fino al testo torna alla misura automatica", () => {
    expect(resizedShape(vuoto, { x: 0, y: 0, w: 200, h: 100 }, "se", -500, -500)).toEqual({ rect: { x: 0, y: 0, w: 60, h: 40 }, w: null, h: null })
  })

  it("dall'angolo in alto a sinistra sposta l'origine e tiene fermo l'angolo opposto", () => {
    // 60 × 40 in (100, 100), trascinato di (-43, -47): 103 → 100, 87 → 90; l'angolo in basso a destra resta in (160, 140).
    expect(resizedShape(vuoto, { x: 100, y: 100, w: null, h: null }, "nw", -43, -47)).toEqual({ rect: { x: 60, y: 50, w: 100, h: 90 }, w: 100, h: 90 })
  })

  it("dagli angoli ne e sw sposta solo l'origine sul lato trascinato", () => {
    expect(resizedShape(vuoto, { x: 100, y: 100, w: null, h: null }, "ne", 40, -20).rect).toEqual({ x: 100, y: 80, w: 100, h: 60 })
    expect(resizedShape(vuoto, { x: 100, y: 100, w: null, h: null }, "sw", -40, 20).rect).toEqual({ x: 60, y: 100, w: 100, h: 60 })
  })

  it("dall'angolo in alto a sinistra non scende sotto il testo, e l'angolo opposto resta fermo", () => {
    expect(resizedShape(vuoto, { x: 100, y: 100, w: 200, h: 100 }, "nw", 500, 500).rect).toEqual({ x: 240, y: 160, w: 60, h: 40 })
  })
})
