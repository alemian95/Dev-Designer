import { describe, expect, it } from "vitest"
import { createDocument } from "../document"
import { NoteStepSchema, SequenceDiagramSchema, SequenceSchema, isValidParticipantName, splitSequenceKey, StepSchema } from "./schema"

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

describe("splitSequenceKey", () => {
  it("dà la sequenza e, se c'è, il partecipante; più di due segmenti o uno vuoto non sono una chiave", () => {
    expect(splitSequenceKey("s1")).toEqual({ sequence: "s1", participant: null })
    expect(splitSequenceKey("s1/p1")).toEqual({ sequence: "s1", participant: "p1" })
    for (const key of ["s1/p1/xyz", "", "s1/", "/p1"]) expect(splitSequenceKey(key)).toBeNull()
  })
})

describe("isValidParticipantName", () => {
  it("rifiuta il vuoto, i caratteri riservati, la parola chiave in testa e le frecce; i confini fini li copre l'export", () => {
    expect(["", "a;b", "end", "end-user", "Note Service", "user-x", "a-"].filter(isValidParticipantName)).toEqual([])
    expect(["Backend", "end_x", "a-b", "Utente web"].every(isValidParticipantName)).toBe(true)
  })
})

describe("misure scelte a mano", () => {
  it("partecipante, messaggio, nota e cornice accettano una misura positiva, e senza valgono come prima", () => {
    expect(SequenceSchema.safeParse({ title: "", autonumber: false, participants: [{ ...anna, w: 200 }, api], steps: [{ ...msg("m"), h: 80 }] }).success).toBe(true)
    expect(StepSchema.safeParse({ kind: "note", id: "n", placement: "over", participants: ["p1"], text: "", w: 300, h: null }).success).toBe(true)
    const part = { model: { sequences: {} }, view: { nodes: { s: { x: 0, y: 0, collapsed: false, w: 500, h: 400 } } } }
    expect(SequenceDiagramSchema.safeParse(part).success).toBe(true)
  })

  it("una misura non positiva non è valida", () => {
    expect(SequenceSchema.safeParse({ title: "", autonumber: false, participants: [{ ...anna, w: 0 }], steps: [] }).success).toBe(false)
    expect(StepSchema.safeParse({ ...msg("m"), h: -1 }).success).toBe(false)
  })
})
