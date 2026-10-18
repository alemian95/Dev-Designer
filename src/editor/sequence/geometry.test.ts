import { describe, expect, it } from "vitest"
import type { Sequence } from "@/model/sequence/schema"
import { sequenceLayout } from "./layout"
import { sequenceRect, subRect } from "./geometry"

const seq: Sequence = {
  title: "Ordine",
  autonumber: false,
  participants: [
    { id: "u", name: "Utente", label: null, kind: "actor" },
    { id: "api", name: "API", label: null, kind: "participant" },
  ],
  steps: [
    { kind: "message", id: "m1", from: "u", to: "api", text: "ordina", line: "solid", head: "filled" },
    { kind: "block", id: "k", operator: "opt", sections: [{ id: "s", condition: "ok", steps: [] }] },
  ],
}
const view = { x: 100, y: 50, collapsed: false }
const layout = sequenceLayout(seq)
const shifted = (r: { x: number; y: number; w: number; h: number }) => ({ ...r, x: r.x + view.x, y: r.y + view.y })

describe("geometria della sequenza", () => {
  it("la sequenza occupa la dimensione del layout, dalla posizione della view", () => {
    expect(sequenceRect(seq, view)).toEqual({ x: 100, y: 50, w: layout.width, h: layout.height })
  })

  it("partecipante, riga ed etichetta del blocco sono in coordinate del canvas", () => {
    expect(subRect(seq, view, "api")).toEqual(shifted(layout.columns.api!.head))
    expect(subRect(seq, view, "m1")).toEqual(shifted(layout.rows.m1!))
    expect(subRect(seq, view, "k")).toEqual(shifted(layout.blocks.k!.label))
  })

  it("un sotto-elemento inesistente non ha rettangolo", () => {
    expect(subRect(seq, view, "fantasma")).toBeNull()
  })
})
