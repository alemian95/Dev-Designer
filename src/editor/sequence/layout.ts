import { allSteps, type NoteStep, type Sequence, type Step } from "@/model/sequence/schema"
import type { ChosenSize } from "@/model/shared"
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
/** Margine orizzontale del foglio di una nota `left`/`right` dalla linea di vita. */
export const NOTE_INSET = 4
/** Aria attorno al testo di un messaggio fra le sue colonne, e di una nota dentro il suo foglio. */
const MESSAGE_TEXT_PAD = 24
const NOTE_TEXT_PAD = 20
/** Distanza minima fra il foglio di una nota e la linea di vita accanto. */
const NOTE_MARGIN = 12
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

/** Una distanza minima fra gli assi di due colonne, `from` a sinistra di `to`. */
interface Spacing {
  from: number
  to: number
  d: number
}

/**
 * Lo spazio che chiedono i testi (spec §4.1): un messaggio fra le sue colonne, una nota `over` attorno
 * all'asse o fra i due partecipanti, una nota `left`/`right` fino alla linea di vita accanto. Verso
 * il bordo, dove non c'è una colonna, la richiesta va al margine: `lead` a sinistra della prima,
 * `tail` a destra dell'ultima. `selfText` è a parte, perché parte dalla linea di vita come nell'anello.
 */
function textDemands(seq: Sequence, widths: number[], measure: (text: string) => number) {
  const index = new Map(seq.participants.map((p, i) => [p.id, i]))
  const last = seq.participants.length - 1
  const numbers = seq.autonumber ? messageNumbers(seq) : new Map<string, number>()
  const spacings: Spacing[] = []
  const selfText = new Map<number, number>()
  let lead = 0
  let tail = 0
  // Lo spazio da un asse verso il vicino a sinistra (`side` -1) o a destra (1), o verso il bordo.
  const around = (i: number, side: -1 | 1, d: number): void => {
    const j = i + side
    if (j >= 0 && j <= last) spacings.push(side === 1 ? { from: i, to: j, d } : { from: j, to: i, d })
    else if (side === -1) lead = Math.max(lead, d)
    else tail = Math.max(tail, d)
  }
  for (const s of allSteps(seq.steps)) {
    if (s.kind === "message") {
      const a = index.get(s.from)
      const b = index.get(s.to)
      if (a === undefined || b === undefined) continue
      const text = measure(messageLabel(s.text, numbers.get(s.id)))
      if (a === b) selfText.set(a, Math.max(selfText.get(a) ?? 0, text))
      else spacings.push({ from: Math.min(a, b), to: Math.max(a, b), d: text + MESSAGE_TEXT_PAD })
    }
    if (s.kind !== "note") continue
    const ids = s.participants.flatMap((id) => index.get(id) ?? [])
    if (ids.length !== s.participants.length) continue
    const sheet = noteWidth(s, measure)
    if (s.placement === "over" && ids.length === 2) {
      const [a, b] = [Math.min(...ids), Math.max(...ids)]
      spacings.push({ from: a, to: b, d: sheet - widths[a]! / 2 - widths[b]! / 2 })
    } else if (s.placement === "over") {
      around(ids[0]!, -1, sheet / 2 + NOTE_MARGIN)
      around(ids[0]!, 1, sheet / 2 + NOTE_MARGIN)
    } else around(ids[0]!, s.placement === "left" ? -1 : 1, NOTE_INSET + sheet + NOTE_MARGIN)
  }
  return { spacings, selfText, lead, tail }
}

/** La larghezza del foglio di una nota: quella del testo, allargata a quella scelta a mano. */
const noteWidth = (note: NoteStep, measure: (text: string) => number): number => Math.max(measure(note.text) + NOTE_TEXT_PAD, note.w ?? 0)

/** L'altezza di una riga: quella del suo tipo, allargata a quella scelta a mano. */
function rowHeight(step: Exclude<Step, { kind: "block" }>): number {
  const auto = step.kind === "note" ? NOTE_H : step.from === step.to ? SELF_MESSAGE_H : MESSAGE_H
  return Math.max(auto, step.h ?? 0)
}

/** `frame` porta la misura della cornice scelta a mano: un minimo sopra quella del contenuto. */
export function sequenceLayout(seq: Sequence, frame: ChosenSize = {}, measure: (text: string) => number = estimate): SequenceLayout {
  const columns: SequenceLayout["columns"] = {}
  const widths = seq.participants.map((p) => Math.max(COLUMN_MIN_W, measure(p.label ?? p.name) + COLUMN_TEXT_PAD, p.w ?? 0))
  const { spacings, selfText, lead, tail } = textDemands(seq, widths, measure)
  // Quanto occupa una colonna a destra del suo asse: metà larghezza, o il testo di un messaggio a sé
  // stesso, che parte dalla linea di vita verso destra.
  const reach = (i: number): number => {
    const text = selfText.get(i)
    return Math.max(widths[i]! / 2, text === undefined ? 0 : SELF_TEXT_DX + text + SELF_TEXT_PAD)
  }
  // Gli assi da sinistra: ognuno è il più a sinistra che rispetta la colonna prima e ogni distanza
  // chiesta dai testi verso le colonne già piazzate. Così l'allargamento va nello spazio prima della
  // colonna più a destra.
  const xs: number[] = []
  seq.participants.forEach((p, i) => {
    const w = widths[i]!
    let x = i === 0 ? PAD + Math.max(w / 2, lead) : xs[i - 1]! + reach(i - 1) + COLUMN_GAP + w / 2
    for (const s of spacings) if (s.to === i) x = Math.max(x, xs[s.from]! + s.d)
    xs.push(x)
    columns[p.id] = { x, w, head: { x: x - w / 2, y: 6, w, h: HEAD_H - 4 } }
  })
  const last = xs.length - 1
  const width = Math.max(last < 0 ? MIN_WIDTH : xs[last]! + Math.max(reach(last), tail) + PAD, frame.w ?? 0)
  // `margin` allarga (o, se negativo, stringe) l'estensione, anche quando nessun partecipante si risolve.
  const spanOf = (step: Step, margin: number): { x0: number; x1: number } => {
    const cols = stepParticipants(step).flatMap((id) => columns[id] ?? [])
    const x0 = cols.length ? Math.min(...cols.map((c) => c.x - c.w / 2)) : PAD
    const x1 = cols.length ? Math.max(...cols.map((c) => c.x + c.w / 2)) : width - PAD
    return { x0: x0 - margin, x1: x1 + margin }
  }

  // Il foglio di una nota, almeno largo quanto il testo: `over` centrato sull'asse, `left`/`right`
  // dalla linea di vita verso il suo lato. La riga resta il rettangolo che `Sequence.tsx` disegna.
  const noteSpan = (step: NoteStep): { x0: number; x1: number } => {
    const span = spanOf(step, 0)
    const col = columns[step.participants[0]]
    if (!col || (step.placement === "over" && step.participants.length === 2)) return span
    const sheet = noteWidth(step, measure)
    if (step.placement === "over") {
      const half = Math.max(col.w, sheet) / 2
      return { x0: col.x - half, x1: col.x + half }
    }
    const out = NOTE_INSET + sheet
    return step.placement === "left" ? { x0: Math.min(span.x0, col.x - out), x1: span.x1 } : { x0: span.x0, x1: Math.max(span.x1, col.x + out) }
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
        const { x0, x1 } = step.kind === "note" ? noteSpan(step) : spanOf(step, 0)
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
  return { width, height: Math.max(end + BOTTOM, frame.h ?? 0), header, columns, rows, blocks, slots }
}
