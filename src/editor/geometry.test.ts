import { describe, expect, it } from "vitest"
import { cornerResize, rectsBounds, rectsIntersect, snap } from "./geometry"

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

describe("cornerResize", () => {
  const contenuto = { w: 60, h: 40 }
  const at = (x: number, y: number, w: number | null = null, h: number | null = null) => ({ x, y, w, h })

  it("allarga della distanza trascinata, allineata alla griglia", () => {
    // 60 × 40 + (103, 47) → 163 → 160, 87 → 90.
    expect(cornerResize(contenuto, at(0, 0), "se", 103, 47)).toEqual({ rect: { x: 0, y: 0, w: 160, h: 90 }, next: { x: 0, y: 0, w: 160, h: 90 } })
  })

  it("non scende sotto il contenuto, e fino al contenuto torna alla misura automatica", () => {
    expect(cornerResize(contenuto, at(0, 0, 200, 100), "se", -500, -500)!.next).toEqual({ x: 0, y: 0, w: null, h: null })
  })

  it("dall'angolo in alto a sinistra sposta l'origine e tiene fermo l'angolo opposto", () => {
    // 60 × 40 in (100, 100), trascinato di (-43, -47): 103 → 100, 87 → 90; l'angolo in basso a destra resta in (160, 140).
    expect(cornerResize(contenuto, at(100, 100), "nw", -43, -47)!.rect).toEqual({ x: 60, y: 50, w: 100, h: 90 })
    expect(cornerResize(contenuto, at(100, 100, 200, 100), "nw", 500, 500)!.rect).toEqual({ x: 240, y: 160, w: 60, h: 40 })
  })

  it("dagli angoli ne e sw sposta solo l'origine sul lato trascinato", () => {
    expect(cornerResize(contenuto, at(100, 100), "ne", 40, -20)!.rect).toEqual({ x: 100, y: 80, w: 100, h: 60 })
    expect(cornerResize(contenuto, at(100, 100), "sw", -40, 20)!.rect).toEqual({ x: 60, y: 100, w: 100, h: 60 })
  })

  it("un nodo collassato cambia solo la larghezza, e tiene l'altezza scelta per quando si riapre", () => {
    const r = cornerResize(contenuto, { ...at(0, 0, null, 200), collapsed: true }, "se", 100, 100)!
    expect(r.rect).toEqual({ x: 0, y: 0, w: 160, h: 40 })
    expect(r.next).toEqual({ x: 0, y: 0, w: 160, h: 200 })
  })

  it("una maniglia che non è uno spigolo non ridimensiona", () => {
    expect(cornerResize(contenuto, at(0, 0), null, 10, 10)).toBeNull()
    expect(cornerResize(contenuto, at(0, 0), "l1", 10, 10)).toBeNull()
  })
})
