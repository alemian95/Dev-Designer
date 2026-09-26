import { describe, expect, it } from "vitest"
import { GRID, MIN_W } from "../geometry"
import { anchorGeometry, noteSize, notePath } from "./geometry"

describe("noteSize", () => {
  it("larghezza dalla riga più lunga, altezza dal numero di righe", () => {
    const corta = noteSize({ text: "ok" })
    const lunga = noteSize({ text: "una riga molto più lunga della precedente" })
    expect(lunga.w).toBeGreaterThan(corta.w)
    expect(noteSize({ text: "a\nb\nc" }).h).toBeGreaterThan(noteSize({ text: "a" }).h)
  })

  it("una nota vuota ha comunque una dimensione cliccabile", () => {
    const { w, h } = noteSize({ text: "" })
    expect(w).toBeGreaterThanOrEqual(MIN_W / 2)
    expect(h).toBeGreaterThan(0)
  })

  it("la larghezza è arrotondata alla griglia, come le classi", () => {
    expect(noteSize({ text: "abcdefghijklmnopqrstuvwxyz" }).w % GRID).toBe(0)
  })
})

describe("notePath", () => {
  it("il corpo salta l'angolo in alto a destra e la piega lo chiude", () => {
    const { body, fold } = notePath(200, 80)
    // Path esatti e non solo "non lancia": la piega è la geometria più delicata del diff,
    // e il renderer (task successivo) deve riprodurla identica — un vertice spostato o
    // mancante deve far fallire il test, non passare inosservato.
    expect(body).toBe("M0 0 L188 0 L200 12 L200 80 L0 80 Z")
    expect(fold).toBe("M188 0 L200 12 L188 12 Z")
  })
})

describe("anchorGeometry", () => {
  it("una linea senza marker a nessuno dei due capi", () => {
    const geo = anchorGeometry({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 0, w: 100, h: 40 })
    expect(geo.d).not.toBe("")
    expect(geo.sourceMarker).toBe("")
    expect(geo.targetMarker).toBe("")
  })
})
