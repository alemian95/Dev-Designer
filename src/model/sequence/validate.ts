import type { Issue } from "../issue"
import { INVALID_NAME, SINGLE_SECTION, type Sequence, type SequenceModel, type Step } from "./schema"

/** Ogni passo della sequenza, in ordine, compresi quelli dentro i blocchi. */
function allSteps(steps: readonly Step[]): Step[] {
  return steps.flatMap((step) => (step.kind === "block" ? [step, ...step.sections.flatMap((s) => allSteps(s.steps))] : [step]))
}

/** I valori che compaiono più di una volta, ciascuno una volta sola, nell'ordine della seconda comparsa. */
function repeated(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const v of values) (seen.has(v) ? twice : seen).add(v)
  return [...twice]
}

function sequenceIssues(sequence: Sequence): Issue[] {
  const steps = allSteps(sequence.steps)
  const ids = new Set(sequence.participants.map((p) => p.id))
  const issues: Issue[] = []

  for (const step of steps) {
    const refs = step.kind === "message" ? [step.from, step.to] : step.kind === "note" ? step.participants : []
    if (refs.some((id) => !ids.has(id))) {
      issues.push({ code: "sequence-dangling-participant", severity: "error", message: "Un passo della sequenza nomina un partecipante che non c'è." })
    }
    if (step.kind === "note" && step.participants.length === 2 && (step.placement !== "over" || step.participants[0] === step.participants[1])) {
      issues.push({ code: "sequence-note-participants", severity: "error", message: "Una nota di sequenza ha due partecipanti solo sopra (over), e diversi." })
    }
    if (step.kind === "block" && (SINGLE_SECTION.has(step.operator) ? step.sections.length !== 1 : step.sections.length === 0)) {
      issues.push({ code: "sequence-block-sections", severity: "error", message: "Un blocco ha un numero di sezioni che il suo operatore non ammette." })
    }
  }

  const names = sequence.participants.map((p) => p.name)
  for (const name of repeated(names)) {
    issues.push({ code: "sequence-duplicate-name", severity: "error", message: `Il nome «${name}» è usato da più partecipanti.` })
  }
  for (const name of names.filter((n) => n === "" || INVALID_NAME.test(n))) {
    issues.push({
      code: "sequence-invalid-name",
      severity: "warning",
      message: `Il nome «${name}» non è valido in Mermaid: non può essere vuoto né contenere < > : , ; + ( ) \\ /.`,
    })
  }

  const sections = steps.flatMap((s) => (s.kind === "block" ? s.sections.map((section) => section.id) : []))
  for (const id of repeated([...sequence.participants.map((p) => p.id), ...steps.map((s) => s.id), ...sections])) {
    issues.push({ code: "sequence-duplicate-id", severity: "error", message: `L'id «${id}» è usato da più elementi della sequenza.` })
  }
  return issues
}

/** I problemi delle sequenze (spec §3.3). `node` è la chiave della sequenza, senza prefisso. */
export function validateSequences(model: SequenceModel): Issue[] {
  return Object.entries(model.sequences).flatMap(([key, sequence]) => sequenceIssues(sequence).map((issue) => ({ ...issue, node: key })))
}
