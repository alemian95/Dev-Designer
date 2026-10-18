import type { BlockStep, Section, Sequence, Step } from "@/model/sequence/schema"
import { ROOT } from "./layout"

/** Un punto d'inserimento: il contenitore (`ROOT` o una sezione) e l'indice fra i suoi passi. */
export interface Slot {
  container: string
  index: number
}

/** Ogni sezione della sequenza, anche annidata, col blocco che la contiene. */
export function sectionsOf(seq: Sequence): Map<string, { section: Section; block: BlockStep }> {
  const sections = new Map<string, { section: Section; block: BlockStep }>()
  const walk = (steps: Step[]): void =>
    steps.forEach((step) => {
      if (step.kind !== "block") return
      for (const section of step.sections) {
        sections.set(section.id, { section, block: step })
        walk(section.steps)
      }
    })
  walk(seq.steps)
  return sections
}

/** I passi di un contenitore: `ROOT` o l'id di una sezione. `null` se il contenitore non c'è. */
export function stepsIn(seq: Sequence, container: string): Step[] | null {
  return container === ROOT ? seq.steps : (sectionsOf(seq).get(container)?.section.steps ?? null)
}

export function locate(seq: Sequence, stepId: string): Slot | null {
  const containers: [string, Step[]][] = [[ROOT, seq.steps], ...[...sectionsOf(seq)].map(([id, { section }]): [string, Step[]] => [id, section.steps])]
  for (const [container, steps] of containers) {
    const index = steps.findIndex((s) => s.id === stepId)
    if (index >= 0) return { container, index }
  }
  return null
}

export function stepAt(seq: Sequence, id: string): Step | null {
  const at = locate(seq, id)
  return at && (stepsIn(seq, at.container)?.[at.index] ?? null)
}

/** Gli id delle sezioni e dei passi dentro un passo, a ogni profondità; il passo stesso escluso. */
export function descendants(step: Step): string[] {
  if (step.kind !== "block") return []
  return step.sections.flatMap((section) => [section.id, ...section.steps.flatMap((s) => [s.id, ...descendants(s)])])
}

/** Tutti i passi, a ogni profondità, in ordine di testo. */
export function allSteps(steps: readonly Step[]): Step[] {
  return steps.flatMap((step) => [step, ...(step.kind === "block" ? step.sections.flatMap((s) => allSteps(s.steps)) : [])])
}
