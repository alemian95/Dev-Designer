import type { ParseWarning } from "@/io/ddl/schema"
import { OperatorSchema, type Head, type Line, type Sequence, type Step } from "@/model/sequence/schema"
import { aggregate, type Finding } from "./common"
import type { SequenceAst, SequenceAstStep } from "./sequence-parse"

/** Una `Sequence` con i nomi del testo come id dei partecipanti: gli id definitivi li assegna `rekeySequence`. */
export interface SequenceFragment {
  sequence: Sequence
  warnings: ParseWarning[]
}

type SequenceMapCategory = "halfArrow"

const MESSAGES: Record<SequenceMapCategory, string> = {
  halfArrow: "Mezze frecce lette come frecce piene, con la stessa linea",
}

/** Le 10 frecce classiche (spec §8.1), in minuscolo: la `x` della croce si scrive anche maiuscola. */
const CLASSIC: Readonly<Record<string, { line: Line; head: Head }>> = {
  "->": { line: "solid", head: "none" },
  "-->": { line: "dashed", head: "none" },
  "->>": { line: "solid", head: "filled" },
  "-->>": { line: "dashed", head: "filled" },
  "-x": { line: "solid", head: "cross" },
  "--x": { line: "dashed", head: "cross" },
  "-)": { line: "solid", head: "open" },
  "--)": { line: "dashed", head: "open" },
  "<<->>": { line: "solid", head: "double" },
  "<<-->>": { line: "dashed", head: "double" },
}

/**
 * Traduce lo `SequenceAst` in una sequenza (spec §6). Le perdite del testo le segnala già il parser;
 * qui resta solo la mezza freccia, che diventa la piena con la stessa linea. Passi e sezioni prendono
 * un id progressivo, provvisorio come i nomi.
 */
export function mapSequence(ast: SequenceAst, text: string): SequenceFragment {
  const findings: Finding<SequenceMapCategory>[] = []
  let next = 0
  const id = () => String(next++)

  const step = (s: SequenceAstStep): Step => {
    switch (s.kind) {
      case "message": {
        const classic = CLASSIC[s.arrow.toLowerCase()]
        if (!classic) findings.push({ category: "halfArrow", at: s.at })
        const { line, head }: { line: Line; head: Head } = classic ?? { line: s.arrow.includes("--") ? "dashed" : "solid", head: "filled" }
        return { kind: "message", id: id(), from: s.from, to: s.to, text: s.text, line, head }
      }
      case "note": {
        const [first, second] = s.participants
        return { kind: "note", id: id(), placement: s.placement, participants: second === undefined ? [first!] : [first!, second], text: s.text }
      }
      case "block":
        return {
          kind: "block", id: id(), operator: OperatorSchema.parse(s.operator),
          sections: s.sections.map((section) => ({ id: id(), condition: section.condition, steps: section.steps.map(step) })),
        }
    }
  }

  const sequence: Sequence = {
    title: ast.title ?? "",
    autonumber: ast.autonumber,
    participants: ast.participants.map((p) => ({ id: p.name, name: p.name, label: p.label, kind: p.kind })),
    steps: ast.steps.map(step),
  }
  return { sequence, warnings: aggregate(findings, text, MESSAGES) }
}
