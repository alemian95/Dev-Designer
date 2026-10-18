import { describe, expect, it } from "vitest"
import { mapSequence } from "@/io/mermaid/sequence-map"
import { parseSequence } from "@/io/mermaid/sequence-parse"
import type { Note } from "@/model/note/schema"
import type { Head, Line, Participant, Sequence, Step } from "@/model/sequence/schema"
import { emitSequenceMermaid, emitSequences } from "./sequence-mermaid"

const A: Participant = { id: "a", name: "A", label: null, kind: "participant" }
const B: Participant = { id: "b", name: "B", label: null, kind: "participant" }
const seq = (over: Partial<Sequence> = {}): Sequence => ({ title: "", autonumber: false, participants: [A, B], steps: [], ...over })
const msg = (text: string, line: Line = "solid", head: Head = "filled"): Step => ({ kind: "message", id: "m", from: "a", to: "b", text, line, head })
const emit = (s: Sequence) => emitSequenceMermaid(s, "s1", {})

describe("emitSequenceMermaid", () => {
  it.each([
    ["solid", "none", "->"], ["solid", "filled", "->>"], ["solid", "cross", "-x"], ["solid", "open", "-)"], ["solid", "double", "<<->>"],
    ["dashed", "none", "-->"], ["dashed", "filled", "-->>"], ["dashed", "cross", "--x"], ["dashed", "open", "--)"], ["dashed", "double", "<<-->>"],
  ] as const)("la freccia %s/%s esce come %s", (line, head, arrow) => {
    expect(emit(seq({ steps: [msg("x", line, head)] })).text.split("\n").at(-2)).toBe(`  A${arrow}B: x`)
  })

  it("dichiara i partecipanti con actor e as, con title e autonumber", () => {
    const { text, warnings } = emit(seq({ title: "T", autonumber: true, participants: [{ ...A, label: "Alice", kind: "actor" }, B] }))
    expect(text).toBe("sequenceDiagram\ntitle T\nautonumber\n  actor A as Alice\n  participant B\n")
    expect(warnings).toEqual([])
  })

  it("blocchi annidati con else, and, option e condizione vuota", () => {
    const block = (operator: "alt" | "par" | "critical" | "loop", conditions: string[], inner: Step[][]): Step => ({
      kind: "block", id: "k", operator, sections: conditions.map((condition, i) => ({ id: `s${i}`, condition, steps: inner[i] ?? [] })),
    })
    const s = seq({ steps: [
      block("alt", ["ok", ""], [[block("loop", ["ogni"], [[msg("x")]])], [msg("y")]]),
      block("par", ["", "b"], []),
      block("critical", ["c", "d"], []),
    ] })
    expect(emit(s).text).toBe([
      "sequenceDiagram", "  participant A", "  participant B",
      "  alt ok", "    loop ogni", "      A->>B: x", "    end", "  else", "    A->>B: y", "  end",
      "  par", "  and b", "  end",
      "  critical c", "  option d", "  end", "",
    ].join("\n"))
  })

  it("messaggio vuoto e Note di sequenza", () => {
    const note = (placement: "left" | "right" | "over", ids: string[]): Step =>
      ({ kind: "note", id: "n", placement, participants: ids.length === 1 ? [ids[0]!] : [ids[0]!, ids[1]!], text: "t" })
    const lines = emit(seq({ steps: [msg(""), note("left", ["a"]), note("right", ["b"]), note("over", ["a"]), note("over", ["a", "b"])] })).text.split("\n").slice(3, -1)
    expect(lines).toEqual(["  A->>B:", "  Note left of A: t", "  Note right of B: t", "  Note over A: t", "  Note over A,B: t"])
  })

  it("escape di #, ; e a capo, e il percorso inverso restituisce il testo", () => {
    const original = "a;b #c #59; d\ne"
    const { text } = emit(seq({ title: original, steps: [msg(original)] }))
    expect(text).toContain("A->>B: a#59;b #35;c #35;59#59; d<br>e")
    const parsed = parseSequence(text)
    const { sequence } = mapSequence(parsed.ast, text)
    expect(sequence.title).toBe(original)
    expect(sequence.steps[0]).toMatchObject({ text: original })
  })

  it("un nome non valido o riservato esce come id sicuro, con avviso aggregato", () => {
    const s = seq({
      participants: [{ ...A, name: "A;B" }, { ...B, name: "End" }, { id: "c", name: "p1", label: null, kind: "participant" }],
      steps: [msg("x")],
    })
    const { text, warnings } = emit(s)
    expect(text).toContain("participant p2 as A#59;B")
    expect(text).toContain("participant p3 as End")
    expect(text).toContain("participant p1\n")
    expect(text).toContain("p2->>p3: x")
    expect(warnings).toEqual(["2 nomi di partecipante non validi per Mermaid sono usciti come id sicuri (p1, p2…), con l'etichetta che c'era o, in mancanza, il nome."])
  })

  it("una parola chiave in testa al nome, seguita da un carattere non di parola, è un nome non valido; in mezzo no", () => {
    const names = ["end-user", "opt-in", "Note Service", "loop 1", "Break Room", "link x", "par_over", "user-x", "a->b", "a-)b", "a--b", "a-xylophone", "a-", "Backend", "end_x", "link", "a end", "a-b", "a-1", "a-b-c", "a-_b"]
    const participants = names.map((name, i) => ({ id: `i${i}`, name, label: null, kind: "participant" as const }))
    const { text, warnings } = emit(seq({ participants }))
    const declared = text.split("\n").slice(1, -1).map((l) => l.trim().replace("participant ", ""))
    expect(declared).toEqual([
      "p1 as end-user", "p2 as opt-in", "p3 as Note Service", "p4 as loop 1", "p5 as Break Room", "p6 as link x", "p7 as par_over", "p8 as user-x",
      "p9 as a->b", "p10 as a-)b", "p11 as a--b", "p12 as a-xylophone", "p13 as a-",
      "Backend", "end_x", "link", "a end", "a-b", "a-1", "a-b-c", "a-_b",
    ])
    expect(warnings[0]).toMatch(/^13 nomi/)
  })

  it("le Note ancorate a quella sequenza non escono, con avviso (singolare e plurale)", () => {
    const n = (anchor: string | null): Note => ({ text: "x", anchor })
    expect(emitSequenceMermaid(seq(), "s1", { a: n("sequence/s1"), b: n("sequence/s2/p"), c: n(null) }).warnings)
      .toEqual(["1 nota ancorata a una sequenza non è uscita: i sequenceDiagram di Mermaid non hanno note libere."])
    expect(emitSequences({ sequences: { s1: seq() } }, { a: n("sequence/s1"), b: n("sequence/s1/a") }).warnings)
      .toEqual(["2 note ancorate a una sequenza non sono uscite: i sequenceDiagram di Mermaid non hanno note libere."])
  })
})

describe("emitSequences", () => {
  it("una sequenza esce come .mmd", () => {
    const r = emitSequences({ sequences: { s1: seq() } })
    expect(r.extension).toBe("mmd")
    expect(r.text.startsWith("sequenceDiagram\n")).toBe(true)
  })

  it("due sequenze escono come .md con due blocchi, titolati o numerati", () => {
    const r = emitSequences({ sequences: { s1: seq({ title: "Login" }), s2: seq() } })
    expect(r.extension).toBe("md")
    expect(r.text.match(/```mermaid\n/g)).toHaveLength(2)
    expect(r.text).toContain("## Login\n\n```mermaid\nsequenceDiagram\ntitle Login\n")
    expect(r.text).toContain("## Sequenza 2\n\n```mermaid\nsequenceDiagram\n")
  })
})
