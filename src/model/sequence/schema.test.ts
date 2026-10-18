import { describe, expect, it } from "vitest"
import { createDocument } from "../document"
import { NoteStepSchema, SequenceDiagramSchema, SequenceSchema, StepSchema } from "./schema"

const anna = { id: "p1", name: "Anna", label: null, kind: "actor" }
const api = { id: "p2", name: "API", label: "Server API", kind: "participant" }
const msg = (id: string) => ({ kind: "message", id, from: "p1", to: "p2", text: "ciao", line: "solid", head: "filled" })

describe("schema delle sequenze", () => {
  it("accetta una sequenza completa, con blocchi annidati", () => {
    const part = {
      model: {
        sequences: {
          s1: {
            title: "Login",
            autonumber: true,
            participants: [anna, api],
            steps: [
              msg("m1"),
              { kind: "note", id: "n1", placement: "over", participants: ["p1", "p2"], text: "nota" },
              {
                kind: "block",
                id: "b1",
                operator: "alt",
                sections: [
                  { id: "c1", condition: "ok", steps: [{ kind: "block", id: "b2", operator: "loop", sections: [{ id: "c2", condition: "", steps: [msg("m2")] }] }] },
                  { id: "c3", condition: "errore", steps: [] },
                ],
              },
            ],
          },
        },
      },
      view: { nodes: { s1: { x: 0, y: 0, collapsed: false } } },
    }
    expect(SequenceDiagramSchema.safeParse(part).success).toBe(true)
  })

  it("rifiuta una punta sconosciuta, un tipo di passo sconosciuto e una nota senza partecipanti", () => {
    expect(StepSchema.safeParse({ ...msg("m1"), head: "diamond" }).success).toBe(false)
    expect(StepSchema.safeParse({ kind: "activate", id: "a1" }).success).toBe(false)
    expect(NoteStepSchema.safeParse({ kind: "note", id: "n1", placement: "left", participants: [], text: "" }).success).toBe(false)
  })

  it("rifiuta un tipo di partecipante sconosciuto", () => {
    expect(SequenceSchema.safeParse({ title: "", autonumber: false, participants: [{ ...anna, kind: "boundary" }], steps: [] }).success).toBe(false)
  })

  it("un documento nuovo ha la parte delle sequenze, vuota", () => {
    expect(createDocument("t", "t").diagram.sequence).toEqual({ model: { sequences: {} }, view: { nodes: {} } })
  })
})
