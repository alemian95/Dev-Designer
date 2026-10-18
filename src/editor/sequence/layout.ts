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
/** Dove comincia, a destra della linea di vita, il testo di un messaggio a sé stesso; e il margine dopo. */
export const SELF_TEXT_DX = 8
export const SELF_TEXT_PAD = 8
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

/** Il numero di `autonumber` di ogni messaggio, in ordine di lettura, anche dentro i blocchi. */
export function messageNumbers(seq: Sequence): Map<string, number> {
  const numbers = new Map<string, number>()
  const walk = (steps: Step[]): void =>
    steps.forEach((s) => (s.kind === "block" ? s.sections.forEach((x) => walk(x.steps)) : s.kind === "message" && numbers.set(s.id, numbers.size + 1)))
  walk(seq.steps)
  return numbers
}

/** Il testo di un messaggio come lo disegna `Sequence.tsx`: col numero davanti, se la sequenza numera. */
function messageLabel(text: string, number: number | undefined): string {
  return number === undefined ? text : `${number}. ${text}`
}

/** Per partecipante, la larghezza del testo più lungo fra i suoi messaggi a sé stesso. */
function selfTextWidths(seq: Sequence, measure: (text: string) => number): Map<string, number> {
  const numbers = seq.autonumber ? messageNumbers(seq) : new Map<string, number>()
  const widths = new Map<string, number>()
  const walk = (steps: Step[]): void =>
    steps.forEach((s) => {
      if (s.kind === "block") return s.sections.forEach((x) => walk(x.steps))
      if (s.kind !== "message" || s.from !== s.to) return
      widths.set(s.from, Math.max(widths.get(s.from) ?? 0, measure(messageLabel(s.text, numbers.get(s.id)))))
    })
  walk(seq.steps)
  return widths
}

function rowHeight(step: Exclude<Step, { kind: "block" }>): number {
  if (step.kind === "note") return NOTE_H
  return step.from === step.to ? SELF_MESSAGE_H : MESSAGE_H
}

export function sequenceLayout(seq: Sequence, measure: (text: string) => number = estimate): SequenceLayout {
  const columns: SequenceLayout["columns"] = {}
  const selfText = selfTextWidths(seq, measure)
  let left = PAD
  let right = PAD
  for (const p of seq.participants) {
    const w = Math.max(COLUMN_MIN_W, measure(p.label ?? p.name) + COLUMN_TEXT_PAD)
    const x = left + w / 2
    columns[p.id] = { x, w, head: { x: left, y: 6, w, h: HEAD_H - 4 } }
    // Il testo di un messaggio a sé stesso parte dalla linea di vita verso destra: la colonna dopo, o
    // il bordo, si scosta quanto basta.
    const text = selfText.get(p.id)
    right = Math.max(left + w, text === undefined ? 0 : x + SELF_TEXT_DX + text + SELF_TEXT_PAD)
    left = right + COLUMN_GAP
  }
  const width = seq.participants.length === 0 ? MIN_WIDTH : right + PAD
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
