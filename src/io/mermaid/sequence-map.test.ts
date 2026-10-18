import { describe, expect, it } from "vitest"
import type { MessageStep } from "@/model/sequence/schema"
import { mapSequence } from "./sequence-map"
import { parseSequence } from "./sequence-parse"

const map = (body: string) => {
  const text = `sequenceDiagram\n  ${body}\n`
  return mapSequence(parseSequence(text).ast, text)
}
const message = (body: string): MessageStep => {
  const step = map(body).sequence.steps[0]!
  if (step.kind !== "message") throw new Error(step.kind)
  return step
}

describe("mapSequence: partecipanti", () => {
  it("porta tipo ed etichetta, con il nome come id provvisorio", () => {
    expect(map("participant A as Alice\n  actor B").sequence.participants).toEqual([
      { id: "A", name: "A", label: "Alice", kind: "participant" },
      { id: "B", name: "B", label: null, kind: "actor" },
    ])
  })

  it("importa i partecipanti dichiarati anche senza messaggi", () => {
    const { sequence, warnings } = map("participant A\n  actor B")
    expect(sequence.participants.map((p) => p.name)).toEqual(["A", "B"])
    expect(sequence.steps).toEqual([])
    expect(warnings).toEqual([])
  })

  it("il config @{…} dà tipo ed etichetta (l'avviso è del parser)", () => {
    expect(map('participant D@{ "type": "actor", "alias": "Il DB" }').sequence.participants[0])
      .toEqual({ id: "D", name: "D", label: "Il DB", kind: "actor" })
  })
})

describe("mapSequence: messaggi", () => {
  it.each([
    ["->", "solid", "none"], ["-->", "dashed", "none"],
    ["->>", "solid", "filled"], ["-->>", "dashed", "filled"],
    ["-x", "solid", "cross"], ["--x", "dashed", "cross"],
    ["-)", "solid", "open"], ["--)", "dashed", "open"],
    ["<<->>", "solid", "double"], ["<<-->>", "dashed", "double"],
  ])("«%s» è %s × %s", (arrow, line, head) => {
    expect(message(`A${arrow}B: t`)).toMatchObject({ from: "A", to: "B", text: "t", line, head })
  })

  it("non distingue le maiuscole nella croce", () => {
    expect(message("A-XB: t")).toMatchObject({ line: "solid", head: "cross" })
    expect(message("A--XB: t")).toMatchObject({ line: "dashed", head: "cross" })
  })

  it("legge le mezze frecce come piene, con la stessa linea e un avviso", () => {
    const { sequence, warnings } = map("A-|\\B: a\n  A--//B: b\n  A/|-B: c\n  A\\\\--B: d")
    expect(sequence.steps.map((s) => s.kind === "message" && [s.line, s.head])).toEqual([
      ["solid", "filled"], ["dashed", "filled"], ["solid", "filled"], ["dashed", "filled"],
    ])
    expect(warnings).toEqual([{ message: "Mezze frecce lette come frecce piene, con la stessa linea (righe 2, 3, 4, 5)", at: 18 }])
  })

  it("una mezza freccia che comincia dalla punta va dal destinatario scritto al mittente, come la disegna Mermaid", () => {
    const { sequence } = map("A/|-B: a\n  A\\|--B: b\n  A//-B: c\n  A\\\\--B: d\n  A-|/B: e")
    expect(sequence.steps.map((s) => s.kind === "message" && [s.from, s.to, s.line])).toEqual([
      ["B", "A", "solid"], ["B", "A", "dashed"], ["B", "A", "solid"], ["B", "A", "dashed"], ["A", "B", "solid"],
    ])
  })

  it("tiene il messaggio senza connessione centrale né wrap:", () => {
    expect(map("A->>()B: x\n  A->>B: wrap: y").sequence.steps.map((s) => s.kind === "message" && s.text)).toEqual(["x", "y"])
  })
})

describe("mapSequence: note e blocchi", () => {
  it("porta le note di sequenza con i loro partecipanti", () => {
    const { steps } = map("Note left of A: l\n  Note over A,B: o").sequence
    expect(steps).toMatchObject([
      { kind: "note", placement: "left", participants: ["A"], text: "l" },
      { kind: "note", placement: "over", participants: ["A", "B"], text: "o" },
    ])
  })

  it("porta i blocchi con le loro sezioni, annidati", () => {
    const { steps } = map("alt ok\n    A->>B: x\n  else ko\n    loop sempre\n      B->>A: y\n    end\n  end").sequence
    expect(steps).toMatchObject([{
      kind: "block", operator: "alt", sections: [
        { condition: "ok", steps: [{ kind: "message", text: "x" }] },
        { condition: "ko", steps: [{ kind: "block", operator: "loop", sections: [{ condition: "sempre", steps: [{ text: "y" }] }] }] },
      ],
    }])
  })

  it("par_over è par", () => {
    expect(map("par_over p\n    A->>B: x\n  end").sequence.steps[0]).toMatchObject({ kind: "block", operator: "par" })
  })

  it("i passi di un rect restano dove si trovava", () => {
    expect(map("rect rgb(0,0,0)\n    A->>B: x\n  end\n  A->>B: y").sequence.steps.map((s) => s.kind)).toEqual(["message", "message"])
  })

  it("dà ai passi e alle sezioni id distinti", () => {
    const { steps } = map("A->>B: x\n  loop l\n    A->>B: y\n  end\n  Note over A: n").sequence
    const [message, block, note] = steps
    if (block?.kind !== "block") throw new Error("forma")
    const section = block.sections[0]!
    const ids = [message!.id, block.id, note!.id, section.id, section.steps[0]!.id]
    expect(new Set(ids).size).toBe(5)
  })
})

describe("mapSequence: intestazione", () => {
  it("porta titolo e autonumber", () => {
    expect(map("title Il titolo\n  autonumber").sequence).toMatchObject({ title: "Il titolo", autonumber: true })
  })

  it("senza titolo il titolo è vuoto", () => {
    expect(map("A->>B: x").sequence).toMatchObject({ title: "", autonumber: false })
  })
})
