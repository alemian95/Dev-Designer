import { describe, expect, it } from "vitest"
import type { ClassNode } from "@/model/class/schema"
import { GRID, HEADER_H, MIN_W, ROW_H } from "../geometry"
import { DOWN, LEFT, RIGHT, UP } from "../edge-routing"
import { classSize, isDashed, isFilled, STEREO_H, umlMarkerPath } from "./geometry"

// Annotazione esplicita `ClassNode` sulle fixture, non `as const`: il brief le
// scriveva `as const`, ma un `ClassNode` ha array mutabili e `as const` li
// rende `readonly`, cosa che `tsc -b` rifiuta. L'annotazione dà la stessa
// tipizzazione stretta dei letterali senza quel conflitto.
const vuota: ClassNode = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }

describe("classSize", () => {
  it("una classe senza membri è alta come il solo header", () => {
    expect(classSize(vuota, false)).toEqual({ w: MIN_W, h: HEADER_H })
  })

  it("uno scomparto vuoto non occupa spazio", () => {
    const soloAttributi: ClassNode = { ...vuota, attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }] }
    expect(classSize(soloAttributi, false).h).toBe(HEADER_H + ROW_H + 6)
  })

  it("due scomparti pieni sommano due volte il margine", () => {
    const piena: ClassNode = {
      ...vuota,
      attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }],
      methods: [{ name: "salva", type: "void", visibility: "public", isStatic: false, isAbstract: false, parameters: [] }],
    }
    // Il margine di 6 px sta sotto ogni scomparto che ha righe, quindi due volte.
    expect(classSize(piena, false).h).toBe(HEADER_H + ROW_H + 6 + ROW_H + 6)
  })

  it("interface ed enum aggiungono la riga dello stereotipo, class e abstract no", () => {
    expect(classSize({ ...vuota, stereotype: "interface" }, false).h).toBe(HEADER_H + STEREO_H)
    expect(classSize({ ...vuota, stereotype: "abstract" }, false).h).toBe(HEADER_H)
  })

  it("collassata: solo header, e lo stereotipo resta perché è nell'header", () => {
    const piena: ClassNode = { ...vuota, stereotype: "interface", attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }] }
    expect(classSize(piena, true).h).toBe(HEADER_H + STEREO_H)
  })

  it("la larghezza cresce col membro più lungo e resta multipla di GRID", () => {
    const lungo: ClassNode = {
      ...vuota,
      attributes: [{ name: "unAttributoDalNomeMoltoLungo", type: "Dictionary<string, int>", visibility: "public", isStatic: false }],
    }
    const w = classSize(lungo, false).w
    expect(w).toBeGreaterThan(MIN_W)
    expect(w % GRID).toBe(0)
    // Il nome della classe è corto: la larghezza viene dal membro, non dall'header.
    expect(w).toBeGreaterThan(classSize(vuota, false).w)
  })
})

describe("punte e linee", () => {
  it("solo realizzazione e dipendenza sono tratteggiate", () => {
    // `as const`: senza, l'array letterale è `string[]` e non tipizza contro
    // il parametro `RelationKind` di `isDashed` (stesso genere di difetto
    // delle fixture di `classSize` sopra: letterali senza contesto di tipo).
    expect((["realization", "dependency"] as const).every(isDashed)).toBe(true)
    expect((["association", "generalization", "composition", "aggregation"] as const).some(isDashed)).toBe(false)
  })

  it("solo la composizione ha la punta piena", () => {
    expect(isFilled("composition")).toBe(true)
    expect(isFilled("aggregation")).toBe(false)
  })

  it("l'associazione non disegna punta", () => {
    expect(umlMarkerPath({ x: 0, y: 0 }, UP, "association")).toBe("")
  })

  it("generalizzazione e realizzazione condividono il triangolo", () => {
    const a = umlMarkerPath({ x: 10, y: 10 }, UP, "generalization")
    expect(umlMarkerPath({ x: 10, y: 10 }, UP, "realization")).toBe(a)
  })

  it("il path parte dal punto dato, in tutte e quattro le direzioni", () => {
    for (const dir of [UP, DOWN, LEFT, RIGHT]) {
      expect(umlMarkerPath({ x: 40, y: 50 }, dir, "generalization")).toContain("40")
    }
  })
})
