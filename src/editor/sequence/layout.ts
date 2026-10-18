import type { Sequence, Step } from "@/model/sequence/schema"
import { CHAR_W, type Rect } from "../geometry"

// Le metriche del prototipo (spec §4.1): tutto il resto del disegno si ricava da queste.
export const PAD = 24
export const COLUMN_GAP = 36
export const COLUMN_MIN_W = 96
export const COLUMN_TEXT_PAD = 28
export const HEAD_H = 44
export const TOP = HEAD_H + 26
export const BOTTOM = 24
export const HEADER_H = 22
export const HEADER_PAD = 18
export const MESSAGE_H = 40
export const SELF_MESSAGE_H = 58
export const NOTE_H = 44
export const ROW_GAP = 6
export const BLOCK_HEAD_H = 30
export const BLOCK_LABEL_H = 18
export const BLOCK_LABEL_PAD = 16
export const SECTION_GAP = 24
export const EMPTY_SECTION_H = 18
export const BLOCK_END = 8
export const BLOCK_INSET = 14
export const DEPTH_INSET = 6
export const ROOT = "root"
/** Larghezza minima di una sequenza senza partecipanti: il titolo deve restare cliccabile. */
const MIN_WIDTH = 160

export interface SequenceLayout {
  width: number
  height: number
  header: Rect
  columns: Record<string, { x: number; w: number; head: Rect }>
  rows: Record<string, Rect>
  blocks: Record<string, { rect: Rect; label: Rect; sections: Record<string, Rect> }>
  slots: { container: string; index: number; y: number; depth: number }[]
}

const estimate = (text: string): number => text.length * CHAR_W

function stepParticipants(step: Step): string[] {
  if (step.kind === "message") return [step.from, step.to]
  if (step.kind === "note") return [...step.participants]
  return step.sections.flatMap((s) => s.steps.flatMap(stepParticipants))
}

function rowHeight(step: Exclude<Step, { kind: "block" }>): number {
  if (step.kind === "note") return NOTE_H
  return step.from === step.to ? SELF_MESSAGE_H : MESSAGE_H
}

export function sequenceLayout(seq: Sequence, measure: (text: string) => number = estimate): SequenceLayout {
  const columns: SequenceLayout["columns"] = {}
  let left = PAD
  for (const p of seq.participants) {
    const w = Math.max(COLUMN_MIN_W, measure(p.label ?? p.name) + COLUMN_TEXT_PAD)
    columns[p.id] = { x: left + w / 2, w, head: { x: left, y: 6, w, h: HEAD_H - 4 } }
    left += w + COLUMN_GAP
  }
  const width = seq.participants.length === 0 ? MIN_WIDTH : left - COLUMN_GAP + PAD
  // `margin` allarga (o, se negativo, stringe) l'estensione, anche quando nessun partecipante si risolve.
  const spanOf = (step: Step, margin: number): { x0: number; x1: number } => {
    const cols = stepParticipants(step).flatMap((id) => columns[id] ?? [])
    const x0 = cols.length ? Math.min(...cols.map((c) => c.x - c.w / 2)) : PAD
    const x1 = cols.length ? Math.max(...cols.map((c) => c.x + c.w / 2)) : width - PAD
    return { x0: x0 - margin, x1: x1 + margin }
  }

  const rows: SequenceLayout["rows"] = {}
  const blocks: SequenceLayout["blocks"] = {}
  const slots: SequenceLayout["slots"] = []

  // Percorre un contenitore dall'alto e restituisce la y a cui finisce.
  const walk = (steps: Step[], container: string, depth: number, startY: number): number => {
    let y = startY
    steps.forEach((step, index) => {
      slots.push({ container, index, y, depth })
      if (step.kind !== "block") {
        const h = rowHeight(step)
        const { x0, x1 } = spanOf(step, 0)
        rows[step.id] = { x: x0, y, w: x1 - x0, h }
        y += h + ROW_GAP
        return
      }
      const top = y
      const tops: number[] = []
      y += BLOCK_HEAD_H
      step.sections.forEach((section, j) => {
        if (j > 0) y += SECTION_GAP
        tops.push(j === 0 ? top : y - SECTION_GAP)
        y = walk(section.steps, section.id, depth + 1, y)
        if (section.steps.length === 0) y += EMPTY_SECTION_H
      })
      y += BLOCK_END
      const { x0, x1 } = spanOf(step, BLOCK_INSET - DEPTH_INSET * depth)
      const w = x1 - x0
      const sections: Record<string, Rect> = {}
      step.sections.forEach((section, j) => {
        const sectionTop = tops[j] ?? top
        const sectionEnd = tops[j + 1] ?? y
        sections[section.id] = { x: x0, y: sectionTop, w, h: sectionEnd - sectionTop }
      })
      blocks[step.id] = {
        rect: { x: x0, y: top, w, h: y - top },
        label: { x: x0, y: top, w: measure(step.operator) + BLOCK_LABEL_PAD, h: BLOCK_LABEL_H },
        sections,
      }
      y += BLOCK_END
    })
    slots.push({ container, index: steps.length, y, depth })
    return y
  }

  const end = walk(seq.steps, ROOT, 0, TOP)
  const header: Rect = { x: 0, y: 0, w: measure(`sd ${seq.title}`) + HEADER_PAD, h: HEADER_H }
  return { width, height: end + BOTTOM, header, columns, rows, blocks, slots }
}
