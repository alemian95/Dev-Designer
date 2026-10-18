import type { DevDocument } from "@/model/document"
import {
  INVALID_NAME, SINGLE_SECTION, type MessageStep, type NoteStep, type Operator, type ParticipantKind, type Sequence, type SequenceModel, type Step,
} from "@/model/sequence/schema"
import type { Recipe } from "../document-store"
import { DUPLICATE_OFFSET, snap, type Point } from "../geometry"
import { sequenceDiagram } from "../sequence-access"
import { ROOT, sequenceLayout, type SequenceLayout } from "./layout"
import { descendants, locate, sectionsOf, stepAt, stepsIn, type Slot } from "./tree"

const sequenceIn = (draft: DevDocument, seq: string): Sequence | undefined => sequenceDiagram(draft).model.sequences[seq]

const message = (id: string, from: string, to: string): MessageStep => ({ kind: "message", id, from, to, text: "", line: "solid", head: "filled" })

/** Una sequenza nuova (spec §4.3): due partecipanti, «A» e «B», e un messaggio A→B vuoto. La chiave è un uuid. */
export function addSequence(at: Point): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  const [a, b] = [crypto.randomUUID(), crypto.randomUUID()]
  const step = message(crypto.randomUUID(), a, b)
  return {
    key,
    recipe: (draft) => {
      const d = sequenceDiagram(draft)
      d.model.sequences[key] = {
        title: "",
        autonumber: false,
        participants: [
          { id: a, name: "A", label: null, kind: "participant" },
          { id: b, name: "B", label: null, kind: "participant" },
        ],
        steps: [step],
      }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

export function deleteSequences(keys: readonly string[]): Recipe {
  return (draft) => {
    const d = sequenceDiagram(draft)
    for (const key of keys) {
      delete d.model.sequences[key]
      delete d.view.nodes[key]
    }
  }
}

/** La copia di una sequenza con uuid nuovi per partecipanti, passi e sezioni, e i riferimenti rimappati. */
function copySequence(seq: Sequence): Sequence {
  const pids = new Map(seq.participants.map((p) => [p.id, crypto.randomUUID()] as const))
  const pid = (id: string): string => pids.get(id) ?? id
  const copyStep = (step: Step): Step => {
    const id = crypto.randomUUID()
    if (step.kind === "message") return { ...step, id, from: pid(step.from), to: pid(step.to) }
    if (step.kind === "note") {
      const [first, second] = step.participants
      return { ...step, id, participants: second === undefined ? [pid(first)] : [pid(first), pid(second)] }
    }
    return { ...step, id, sections: step.sections.map((s) => ({ ...s, id: crypto.randomUUID(), steps: s.steps.map(copyStep) })) }
  }
  return { ...seq, participants: seq.participants.map((p) => ({ ...p, id: pid(p.id) })), steps: seq.steps.map(copyStep) }
}

/** Copia le sequenze con un uuid nuovo ovunque e lo scarto di sempre. */
export function duplicateSequences(model: SequenceModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const copies = keys.flatMap((from) => {
    const seq = model.sequences[from]
    return seq ? [{ from, to: crypto.randomUUID(), seq: copySequence(seq) }] : []
  })
  return {
    keys: copies.map((c) => c.to),
    recipe: (draft) => {
      const d = sequenceDiagram(draft)
      for (const { from, to, seq } of copies) {
        const view = d.view.nodes[from]
        if (!view) continue
        d.model.sequences[to] = seq
        d.view.nodes[to] = { ...view, x: view.x + DUPLICATE_OFFSET, y: view.y + DUPLICATE_OFFSET }
      }
    },
  }
}

export function setSequenceTitle(seq: string, title: string): Recipe {
  return (draft) => {
    const s = sequenceIn(draft, seq)
    if (s && s.title !== title) s.title = title
  }
}

export function setAutonumber(seq: string, on: boolean): Recipe {
  return (draft) => {
    const s = sequenceIn(draft, seq)
    if (s && s.autonumber !== on) s.autonumber = on
  }
}

/** Un partecipante «P<n>», col primo `n` libero; dopo `after`, o in coda se `after` è `null`. */
export function addParticipant(seq: string, after: string | null): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const s = sequenceIn(draft, seq)
      if (!s) return
      const index = after === null ? s.participants.length : s.participants.findIndex((p) => p.id === after) + 1
      if (index === 0) return
      const names = new Set(s.participants.map((p) => p.name))
      let n = s.participants.length + 1
      while (names.has(`P${n}`)) n++
      s.participants.splice(index, 0, { id: key, name: `P${n}`, label: null, kind: "participant" })
    },
  }
}

/** `null` se il nome, ripulito dagli spazi in testa e in coda, è vuoto, già usato da un altro o con INVALID_NAME. */
export function renameParticipant(model: SequenceModel, seq: string, pid: string, name: string): Recipe | null {
  const clean = name.trim()
  const taken = model.sequences[seq]?.participants.some((p) => p.id !== pid && p.name === clean) ?? false
  if (clean === "" || INVALID_NAME.test(clean) || taken) return null
  return (draft) => {
    const p = sequenceIn(draft, seq)?.participants.find((x) => x.id === pid)
    if (p && p.name !== clean) p.name = clean
  }
}

export function setParticipantLabel(seq: string, pid: string, label: string | null): Recipe {
  return (draft) => {
    const p = sequenceIn(draft, seq)?.participants.find((x) => x.id === pid)
    if (p && p.label !== label) p.label = label
  }
}

export function setParticipantKind(seq: string, pid: string, kind: ParticipantKind): Recipe {
  return (draft) => {
    const p = sequenceIn(draft, seq)?.participants.find((x) => x.id === pid)
    if (p && p.kind !== kind) p.kind = kind
  }
}

/** `toIndex` è la posizione finale fra i partecipanti. */
export function moveParticipant(seq: string, pid: string, toIndex: number): Recipe {
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const from = s?.participants.findIndex((p) => p.id === pid) ?? -1
    if (!s || from < 0) return
    const to = Math.max(0, Math.min(toIndex, s.participants.length - 1))
    if (to === from) return
    const [p] = s.participants.splice(from, 1)
    if (p) s.participants.splice(to, 0, p)
  }
}

/** Toglie, a ogni profondità, i passi che soddisfano `drop`; i blocchi rimasti vuoti restano. */
function prune(steps: Step[], drop: (step: Step) => boolean): void {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (!step) continue
    if (drop(step)) steps.splice(i, 1)
    else if (step.kind === "block") step.sections.forEach((s) => prune(s.steps, drop))
  }
}

/** Elimina il partecipante e i messaggi e le note di sequenza che lo coinvolgono, anche dentro i blocchi. */
export function deleteParticipant(seq: string, pid: string): Recipe {
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const index = s?.participants.findIndex((p) => p.id === pid) ?? -1
    if (!s || index < 0) return
    s.participants.splice(index, 1)
    prune(s.steps, (step) =>
      step.kind === "message" ? step.from === pid || step.to === pid : step.kind === "note" && step.participants.some((p) => p === pid))
  }
}

export function addMessage(seq: string, from: string, to: string, where: Slot): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const s = sequenceIn(draft, seq)
      const steps = s && stepsIn(s, where.container)
      const known = (pid: string): boolean => s?.participants.some((p) => p.id === pid) ?? false
      if (!steps || !known(from) || !known(to)) return
      steps.splice(Math.max(0, Math.min(where.index, steps.length)), 0, message(key, from, to))
    },
  }
}

/** Una nota sopra il mittente del passo `after` (o il primo partecipante della nota), altrimenti sopra il primo partecipante. */
export function addNoteStep(seq: string, after: string): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const s = sequenceIn(draft, seq)
      const at = s && locate(s, after)
      const steps = s && at && stepsIn(s, at.container)
      const step = steps?.[at?.index ?? -1]
      if (!s || !at || !steps || !step) return
      const over = step.kind === "message" ? step.from : step.kind === "note" ? step.participants[0] : s.participants[0]?.id
      if (over === undefined) return
      steps.splice(at.index + 1, 0, { kind: "note", id: key, placement: "over", participants: [over], text: "" })
    },
  }
}

type MessagePatch = Partial<Omit<MessageStep, "id" | "kind">>
type NotePatch = Partial<Omit<NoteStep, "id" | "kind">>
const MESSAGE_FIELDS = ["from", "to", "text", "line", "head"] as const
const NOTE_FIELDS = ["placement", "participants", "text"] as const

/** Scrive il campo solo se la patch lo porta e il valore cambia; JSON confronta per valore anche la coppia di una nota. */
function write<S, K extends keyof S>(step: S, field: K, value: S[K] | undefined): void {
  if (value !== undefined && JSON.stringify(step[field]) !== JSON.stringify(value)) step[field] = value
}

/** Applica la patch a un messaggio; su un passo di altro tipo non fa niente. */
export function setMessage(seq: string, stepId: string, patch: MessagePatch): Recipe {
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const step = s && stepAt(s, stepId)
    if (step?.kind === "message") for (const field of MESSAGE_FIELDS) write(step, field, patch[field])
  }
}

/** Applica la patch a una nota di sequenza; su un passo di altro tipo non fa niente. */
export function setNoteStep(seq: string, stepId: string, patch: NotePatch): Recipe {
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const step = s && stepAt(s, stepId)
    if (step?.kind === "note") for (const field of NOTE_FIELDS) write(step, field, patch[field])
  }
}

/**
 * Sposta un passo nello slot `to`, con l'indice degli slot calcolati **prima** dello spostamento:
 * nello stesso contenitore, in avanti, l'indice scala di uno dopo aver tolto il passo.
 * `null` se `to` è dentro il passo stesso.
 */
export function moveStep(model: SequenceModel, seq: string, stepId: string, to: Slot): Recipe | null {
  const original = model.sequences[seq]
  const moving = original && stepAt(original, stepId)
  if (moving && descendants(moving).includes(to.container)) return null
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const from = s && locate(s, stepId)
    const source = s && from && stepsIn(s, from.container)
    const target = s && stepsIn(s, to.container)
    const step = source?.[from?.index ?? -1]
    if (!from || !source || !target || !step || descendants(step).includes(to.container)) return
    const index = from.container === to.container && from.index < to.index ? to.index - 1 : to.index
    if (from.container === to.container && index === from.index) return
    source.splice(from.index, 1)
    target.splice(Math.min(index, target.length), 0, step)
  }
}

export function deleteSteps(seq: string, stepIds: readonly string[]): Recipe {
  const ids = new Set(stepIds)
  return (draft) => {
    const s = sequenceIn(draft, seq)
    if (s) prune(s.steps, (step) => ids.has(step.id))
  }
}

/**
 * Avvolge i passi in un blocco con una sola sezione, al posto del primo. I passi devono essere
 * contigui e nello stesso contenitore: altrimenti la recipe lancia un errore al dispatch, e il
 * documento resta com'è.
 */
export function wrapInBlock(seq: string, stepIds: readonly string[], operator: Operator): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  const sectionId = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const s = sequenceIn(draft, seq)
      if (!s) return
      const at = stepIds.map((id) => locate(s, id))
      const container = at[0]?.container
      const indices = at.flatMap((x) => (x && x.container === container ? [x.index] : [])).sort((a, b) => a - b)
      const first = indices[0]
      const steps = container === undefined ? null : stepsIn(s, container)
      if (!steps || first === undefined || indices.length !== stepIds.length || indices.some((i, n) => i !== first + n)) {
        throw new Error("wrapInBlock: i passi devono essere contigui e nello stesso contenitore")
      }
      const wrapped = steps.splice(first, indices.length)
      steps.splice(first, 0, { kind: "block", id: key, operator, sections: [{ id: sectionId, condition: "", steps: wrapped }] })
    },
  }
}

/** Verso un operatore a una sola sezione le sezioni si fondono nella prima (scelta della spec §4.2). */
export function setOperator(seq: string, blockId: string, operator: Operator): Recipe {
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const block = s && stepAt(s, blockId)
    if (block?.kind !== "block" || block.operator === operator) return
    block.operator = operator
    const [first, ...rest] = block.sections
    if (!first || rest.length === 0 || !SINGLE_SECTION.has(operator)) return
    first.steps.push(...rest.flatMap((x) => x.steps))
    block.sections.splice(1)
  }
}

/** Una sezione vuota in fondo al blocco; `null` se l'operatore ne ammette una sola. */
export function addSection(model: SequenceModel, seq: string, blockId: string): Recipe | null {
  const original = model.sequences[seq]
  const block = original && stepAt(original, blockId)
  if (block?.kind === "block" && SINGLE_SECTION.has(block.operator)) return null
  const id = crypto.randomUUID()
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const target = s && stepAt(s, blockId)
    if (target?.kind === "block" && !SINGLE_SECTION.has(target.operator)) target.sections.push({ id, condition: "", steps: [] })
  }
}

/**
 * Toglie la sezione e ne fonde i passi nella precedente, o nella successiva se è la prima, come fa
 * `setOperator`. `null` se l'operatore ne ammette una sola o se è l'ultima.
 */
export function removeSection(model: SequenceModel, seq: string, sectionId: string): Recipe | null {
  const original = model.sequences[seq]
  const owner = original && sectionsOf(original).get(sectionId)?.block
  if (owner && (SINGLE_SECTION.has(owner.operator) || owner.sections.length <= 1)) return null
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const block = s && sectionsOf(s).get(sectionId)?.block
    if (!block || block.sections.length <= 1) return
    const index = block.sections.findIndex((x) => x.id === sectionId)
    const [removed] = block.sections.splice(index, 1)
    if (!removed) return
    const previous = block.sections[index - 1]
    if (previous) previous.steps.push(...removed.steps)
    else block.sections[0]?.steps.unshift(...removed.steps)
  }
}

export function setCondition(seq: string, sectionId: string, condition: string): Recipe {
  return (draft) => {
    const s = sequenceIn(draft, seq)
    const section = s && sectionsOf(s).get(sectionId)?.section
    if (section && section.condition !== condition) section.condition = condition
  }
}

/** Lo slot più vicino a `y`, saltando quelli dentro il passo `exclude`: un passo non cade mai dentro sé stesso. */
export function dropTarget(seq: Sequence, layout: SequenceLayout, y: number, exclude: string): Slot {
  const step = stepAt(seq, exclude)
  const inside = new Set(step ? descendants(step) : [])
  const end = { container: ROOT, index: seq.steps.length, y: Infinity, depth: 0 }
  const best = layout.slots
    .filter((slot) => !inside.has(slot.container))
    .reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a), end)
  return { container: best.container, index: best.index }
}

/**
 * Dove cade il passo `stepId` trascinato di `dy`: lo slot più vicino al bordo del passo spostato nel
 * verso del movimento, l'alto salendo e il basso scendendo (la riga, o il riquadro intero di un
 * blocco). Così una riga di scarto scambia il passo col vicino nei due versi, e gli slot dentro un
 * blocco trascinato restano irraggiungibili. La stessa regola per la linea d'inserimento e per il
 * rilascio. `null` se il passo non c'è.
 */
export function stepDrop(seq: Sequence, stepId: string, dy: number): Slot | null {
  const l = sequenceLayout(seq)
  const r = l.rows[stepId] ?? l.blocks[stepId]?.rect
  return r ? dropTarget(seq, l, (dy > 0 ? r.y + r.h : r.y) + dy, stepId) : null
}
