import { describe, expect, it } from "vitest"
import type { Sequence, Step } from "@/model/sequence/schema"
import type { Rect } from "../geometry"
import { CHAR_W } from "../geometry"
import { COLUMN_MIN_W, NOTE_H, PAD, SELF_MESSAGE_H, SELF_TEXT_DX, TOP, messageNumbers, sequenceLayout } from "./layout"

const part = (id: string) => ({ id, name: id, label: null, kind: "participant" as const })
const msg = (id: string, from: string, to: string): Step => ({ kind: "message", id, from, to, text: "", line: "solid", head: "filled" })
const note = (id: string, p: string): Step => ({ kind: "note", id, placement: "over", participants: [p], text: "" })
const block = (id: string, ...sections: { id: string; steps: Step[] }[]): Step => ({
  kind: "block", id, operator: "alt", sections: sections.map((s) => ({ ...s, condition: "" })),
})
const seq = (participants: string[], steps: Step[]): Sequence => ({ title: "t", autonumber: false, participants: participants.map(part), steps })
const bottom = (r: Rect) => r.y + r.h
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && bottom(inner) <= bottom(outer)

describe("sequenceLayout", () => {
  it("mette le colonne nell'ordine dei partecipanti, senza sovrapporle", () => {
    const l = sequenceLayout(seq(["a", "b", "c"], []))
    const a = l.columns.a!, b = l.columns.b!, c = l.columns.c!
    expect(a.x).toBeLessThan(b.x)
    expect(a.head.x + a.head.w).toBeLessThan(b.head.x)
    expect(b.head.x + b.head.w).toBeLessThan(c.head.x)
  })

  it("ordina le righe dall'alto, anche dentro i blocchi", () => {
    const l = sequenceLayout(seq(["a", "b"], [msg("m1", "a", "b"), block("k", { id: "s", steps: [msg("m2", "b", "a")] }), note("n", "a")]))
    const ys = ["m1", "m2", "n"].map((id) => l.rows[id]!.y)
    expect(ys).toEqual([...ys].sort((x, y) => x - y))
    expect(new Set(ys).size).toBe(3)
  })

  it("il blocco contiene le sezioni, e le sezioni le loro righe", () => {
    const l = sequenceLayout(seq(["a", "b"], [block("k", { id: "s1", steps: [msg("m1", "a", "b")] }, { id: "s2", steps: [msg("m2", "b", "a")] })]))
    const b = l.blocks.k!
    expect(contains(b.rect, b.sections.s1!)).toBe(true)
    expect(contains(b.rect, b.sections.s2!)).toBe(true)
    expect(contains(b.sections.s1!, l.rows.m1!)).toBe(true)
    expect(contains(b.sections.s2!, l.rows.m2!)).toBe(true)
  })

  it("stringe il blocco annidato rispetto al padre", () => {
    const inner = block("in", { id: "si", steps: [msg("m", "a", "b")] })
    const l = sequenceLayout(seq(["a", "b"], [block("out", { id: "so", steps: [inner] })]))
    expect(l.blocks.in!.rect.w).toBeLessThan(l.blocks.out!.rect.w)
  })

  it("dà altezza a una sezione vuota", () => {
    const l = sequenceLayout(seq(["a"], [block("k", { id: "s", steps: [] })]))
    expect(l.blocks.k!.sections.s!.h).toBeGreaterThan(0)
  })

  it("ha uno slot in più dei passi per ogni contenitore", () => {
    const l = sequenceLayout(seq(["a", "b"], [msg("m1", "a", "b"), block("k", { id: "s", steps: [msg("m2", "a", "b")] }, { id: "e", steps: [] })]))
    const count = (c: string) => l.slots.filter((s) => s.container === c).length
    expect([count("root"), count("s"), count("e")]).toEqual([3, 2, 1])
  })

  it("cresce con un partecipante e con un passo", () => {
    const base = sequenceLayout(seq(["a"], []))
    expect(sequenceLayout(seq(["a", "b"], [])).width).toBeGreaterThan(base.width)
    expect(sequenceLayout(seq(["a"], [msg("m", "a", "a")])).height).toBeGreaterThan(base.height)
  })

  it("ha una dimensione minima senza partecipanti", () => {
    const l = sequenceLayout(seq([], []))
    expect(l.width).toBeGreaterThan(0)
    expect(l.height).toBeGreaterThan(0)
  })

  describe("metriche", () => {
    it("dà alla colonna la larghezza minima e l'asse a metà", () => {
      const l = sequenceLayout(seq(["a", "b"], []), () => 0)
      expect(l.columns.a!.w).toBe(96)
      expect(l.columns.a!.x).toBe(PAD + 48)
      expect(l.columns.b!.x).toBe(PAD + 96 + 36 + 48)
    })

    it("allarga la colonna con un'etichetta lunga, che conta più del nome", () => {
      const p = { ...part("a"), label: "x".repeat(20) }
      const l = sequenceLayout({ ...seq([], []), participants: [p] }, (t) => t.length * 10)
      expect(l.columns.a!.w).toBe(20 * 10 + 28)
      expect(l.columns.a!.w).toBeGreaterThan(COLUMN_MIN_W)
    })

    it("dà ai tre tipi di riga 40, 58 e 44, a passo 6", () => {
      const l = sequenceLayout(seq(["a", "b"], [msg("m", "a", "b"), msg("s", "a", "a"), note("n", "a")]), () => 0)
      expect([l.rows.m!.h, l.rows.s!.h, l.rows.n!.h]).toEqual([40, SELF_MESSAGE_H, NOTE_H])
      expect([l.rows.m!.y, l.rows.s!.y, l.rows.n!.y]).toEqual([TOP, TOP + 46, TOP + 46 + 64])
    })

    it("allinea gli slot di primo livello alle righe", () => {
      const steps = [msg("m", "a", "b"), msg("s", "a", "a"), note("n", "a")]
      const l = sequenceLayout(seq(["a", "b"], steps), () => 0)
      const root = l.slots.filter((s) => s.container === "root")
      steps.forEach((step, i) => expect(root[i]!.y).toBe(l.rows[step.id]!.y))
    })

    it("dà intestazione 30, separatore 24 e sezione vuota 18 a un blocco", () => {
      const l = sequenceLayout(seq(["a"], [block("k", { id: "s1", steps: [] }, { id: "s2", steps: [] })]), () => 0)
      const b = l.blocks.k!
      expect(b.sections.s1).toMatchObject({ y: TOP, h: 30 + 18 })
      expect(b.sections.s2!.y).toBe(TOP + 30 + 18)
      expect(b.sections.s2!.h).toBe(24 + 18 + 8)
      expect(b.rect.h).toBe(30 + 18 + 24 + 18 + 8)
    })
  })
})

describe("messaggi a sé stessi", () => {
  const lungo = "un testo molto più lungo della colonna"
  const self = (id: string, p: string): Step => ({ kind: "message", id, from: p, to: p, text: lungo, line: "solid", head: "filled" })

  it("il testo sull'ultima colonna sta dentro la larghezza, numero compreso", () => {
    const s: Sequence = { ...seq(["a", "b"], [msg("m0", "a", "b"), self("m1", "b")]), autonumber: true }
    const l = sequenceLayout(s)
    const end = l.columns.b!.x + SELF_TEXT_DX + `2. ${lungo}`.length * CHAR_W
    expect(end).toBeLessThanOrEqual(l.width - PAD)
  })

  it("il testo su una colonna di mezzo non arriva alla colonna dopo", () => {
    const l = sequenceLayout(seq(["a", "b"], [self("m1", "a")]))
    expect(l.columns.a!.x + SELF_TEXT_DX + lungo.length * CHAR_W).toBeLessThan(l.columns.b!.head.x)
  })

  it("messageNumbers numera i messaggi in ordine di lettura, anche dentro i blocchi", () => {
    const s = seq(["a", "b"], [msg("m1", "a", "b"), block("k", { id: "s", steps: [msg("m2", "b", "a")] }), msg("m3", "a", "b")])
    expect([...messageNumbers(s)]).toEqual([["m1", 1], ["m2", 2], ["m3", 3]])
  })
})
