import { describe, expect, it } from "vitest"
import { emitSequenceMermaid } from "@/io/emit/sequence-mermaid"
import type { Sequence, Step } from "@/model/sequence/schema"
import { analyseMermaid } from "./analyse"
import { SEQUENCE_MODELS, SEQUENCE_REWRITTEN, SEQUENCE_VALID } from "./sequence-fixtures"

/** La sequenza importata da un testo. */
const importSequence = (text: string): Sequence => {
  const analysis = analyseMermaid(text)
  if (!analysis.ok || analysis.kind !== "sequence") throw new Error(`non è una sequenza: ${JSON.stringify(analysis)}`)
  return analysis.fragment.sequence
}

/** La sequenza a meno degli id: i partecipanti per posizione, i passi e le sezioni senza id. */
const shape = (seq: Sequence) => {
  const at = (id: string) => seq.participants.findIndex((p) => p.id === id)
  const steps = (list: readonly Step[]): unknown[] =>
    list.map((s) => {
      switch (s.kind) {
        case "message": return { ...s, id: undefined, from: at(s.from), to: at(s.to) }
        case "note": return { ...s, id: undefined, participants: s.participants.map(at) }
        case "block": return { ...s, id: undefined, sections: s.sections.map((x) => ({ condition: x.condition, steps: steps(x.steps) })) }
      }
    })
  return { ...seq, participants: seq.participants.map(({ name, label, kind }) => ({ name, label, kind })), steps: steps(seq.steps) }
}

const roundTrip = (seq: Sequence): Sequence => importSequence(emitSequenceMermaid(seq, "s").text)

describe("round-trip sequenceDiagram", () => {
  it.each(Object.entries(SEQUENCE_VALID))("la fixture %s, esportata e riletta, dà la stessa sequenza", (_, text) => {
    const seq = importSequence(text)
    expect(shape(roundTrip(seq))).toEqual(shape(seq))
  })

  it.each(Object.entries(SEQUENCE_MODELS))("il modello %s, esportato e riletto, torna identico a meno degli id", (_, seq) => {
    expect(shape(roundTrip(seq))).toEqual(shape(seq))
  })

  it("un nome non valido, anche una parola chiave, torna come id sicuro con il nome come etichetta", () => {
    const seq = SEQUENCE_REWRITTEN.keywordName!
    expect(shape(roundTrip(seq))).toEqual(shape({
      ...seq,
      participants: [seq.participants[0]!, { ...seq.participants[1]!, name: "p1", label: "end" }, { ...seq.participants[2]!, name: "p2" }],
    }))
  })

  it("gli spazi ai bordi dei testi si perdono, come in Mermaid: è l'unica eccezione della spec §8.4", () => {
    const back = shape(roundTrip(SEQUENCE_REWRITTEN.edgeSpaces!))
    expect(back.title).toBe("titolo")
    expect(back.participants[0]!.label).toBe("Alice")
    expect(back.steps).toEqual([
      expect.objectContaining({ text: "attorno" }),
      expect.objectContaining({ text: "wrap: x" }),
      expect.objectContaining({ text: "nota" }),
      expect.objectContaining({ sections: [{ condition: "se", steps: [] }] }),
    ])
  })
})
