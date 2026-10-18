import { describe, expect, it } from "vitest"
import type { Participant, Sequence, Step } from "./schema"
import { validateSequences } from "./validate"

const p = (id: string, name: string): Participant => ({ id, name, label: null, kind: "participant" })
const msg = (id: string, from: string, to: string): Step => ({ kind: "message", id, from, to, text: "", line: "solid", head: "filled" })
const seq = (participants: Participant[], steps: Step[]): Sequence => ({ title: "", autonumber: false, participants, steps })
const issues = (s: Sequence) => validateSequences({ sequences: { s1: s } })

describe("validazione delle sequenze", () => {
  it("una sequenza corretta non ha problemi", () => {
    expect(issues(seq([p("a", "A"), p("b", "B")], [msg("m1", "a", "b")]))).toEqual([])
  })

  it("un messaggio verso un partecipante che non c'è è sequence-dangling-participant", () => {
    expect(issues(seq([p("a", "A")], [msg("m1", "a", "x")]))).toEqual([
      { code: "sequence-dangling-participant", severity: "error", node: "s1", message: "Un passo della sequenza nomina un partecipante che non c'è." },
    ])
  })

  it("una nota di sequenza con due partecipanti fuori da over, o uguali, è sequence-note-participants", () => {
    const fuori: Step = { kind: "note", id: "n1", placement: "left", participants: ["a", "b"], text: "" }
    const uguali: Step = { kind: "note", id: "n2", placement: "over", participants: ["a", "a"], text: "" }
    const issue = { code: "sequence-note-participants", severity: "error", node: "s1", message: "Una nota di sequenza ha due partecipanti solo sopra (over), e diversi." }
    expect(issues(seq([p("a", "A"), p("b", "B")], [fuori, uguali]))).toEqual([issue, issue])
  })

  it("un blocco con le sezioni sbagliate per l'operatore è sequence-block-sections, anche annidato", () => {
    const section = (id: string, steps: Step[] = []) => ({ id, condition: "", steps })
    const loopDoppio: Step = { kind: "block", id: "b2", operator: "loop", sections: [section("c2"), section("c3")] }
    const altVuoto: Step = { kind: "block", id: "b1", operator: "alt", sections: [] }
    const par: Step = { kind: "block", id: "b3", operator: "par", sections: [section("c1", [loopDoppio])] }
    const issue = { code: "sequence-block-sections", severity: "error", node: "s1", message: "Un blocco ha un numero di sezioni che il suo operatore non ammette." }
    expect(issues(seq([], [altVuoto, par]))).toEqual([issue, issue])
  })

  it("un nome ripetuto nella sequenza è sequence-duplicate-name", () => {
    expect(issues(seq([p("a", "A"), p("b", "A")], []))).toEqual([
      { code: "sequence-duplicate-name", severity: "error", node: "s1", message: "Il nome «A» è usato da più partecipanti." },
    ])
  })

  it("un nome vuoto o con un carattere che Mermaid non accetta è sequence-invalid-name", () => {
    expect(issues(seq([p("a", ""), p("b", "A;B")], []))).toEqual([
      { code: "sequence-invalid-name", severity: "warning", node: "s1", message: "Il nome «» non è valido in Mermaid: non può essere vuoto né contenere < > : , ; + ( ) \\ /." },
      { code: "sequence-invalid-name", severity: "warning", node: "s1", message: "Il nome «A;B» non è valido in Mermaid: non può essere vuoto né contenere < > : , ; + ( ) \\ /." },
    ])
  })

  it("un id ripetuto fra partecipanti, passi e sezioni è sequence-duplicate-id", () => {
    const block: Step = { kind: "block", id: "b1", operator: "opt", sections: [{ id: "a", condition: "", steps: [] }] }
    expect(issues(seq([p("a", "A")], [block]))).toEqual([
      { code: "sequence-duplicate-id", severity: "error", node: "s1", message: "L'id «a» è usato da più elementi della sequenza." },
    ])
  })
})
