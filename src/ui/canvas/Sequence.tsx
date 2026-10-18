import { memo } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import type { Point, Rect } from "@/editor/geometry"
import { notePath } from "@/editor/note/geometry"
import { selId, selectedKeys, sessionStore } from "@/editor/session-store"
import { stepDrop } from "@/editor/sequence/commands"
import { subRect } from "@/editor/sequence/geometry"
import { ROOT, ROW_GAP, SELF_TEXT_DX, messageNumbers, sequenceLayout, type SequenceLayout } from "@/editor/sequence/layout"
import { sequenceDiagram } from "@/editor/sequence-access"
import type { BlockStep, Head, MessageStep, NoteStep, Participant, Sequence, Step } from "@/model/sequence/schema"
import type { NodeView } from "@/model/shared"
import { registerNode } from "./dom-registry"

interface Props {
  /** La chiave con prefisso, `sequence/<seq>`: i sotto-elementi la estendono con `/<id>`. */
  id: string
  sequence: Sequence
  view: NodeView
  selected: boolean
  /** Gli id dei sotto-elementi selezionati, senza prefisso: si contornano come la cornice selezionata. */
  selectedSubs?: readonly string[]
}

const LINE = "var(--muted-foreground)"
const BORDER = "var(--border)"
const SMALL = 11
/** Quanto sotto il fondo della riga corre la freccia: lo spazio sopra resta al testo. */
const ARROW_LIFT = 10
const SELF_LOOP_W = 38
const SELF_LOOP_H = 22
const HEAD_LEN = 10
const HEAD_HALF = 5
const NOTE_INSET = 4
const TAB_CUT = 8

/** I passi in ordine di lettura, con quelli dei blocchi subito dopo il loro blocco. */
function flatten(steps: Step[]): Step[] {
  return steps.flatMap((s) => (s.kind === "block" ? [s, ...s.sections.flatMap((x) => flatten(x.steps))] : [s]))
}

/** Una punta di messaggio che arriva in `tip` andando nel verso `dir` (1 verso destra, -1 verso sinistra). */
function HeadMark({ head, tip, dir }: { head: Exclude<Head, "none" | "double">; tip: Point; dir: number }) {
  const back = tip.x - dir * HEAD_LEN
  if (head === "filled") {
    return <path d={`M${tip.x} ${tip.y} L${back} ${tip.y - HEAD_HALF} L${back} ${tip.y + HEAD_HALF} Z`} fill={LINE} stroke={LINE} />
  }
  if (head === "open") {
    return <path d={`M${back} ${tip.y - HEAD_HALF} L${tip.x} ${tip.y} L${back} ${tip.y + HEAD_HALF}`} fill="none" stroke={LINE} strokeWidth={1.5} />
  }
  const c = tip.x - (dir * HEAD_LEN) / 2
  const k = HEAD_HALF - 1
  return <path d={`M${c - k} ${tip.y - k} L${c + k} ${tip.y + k} M${c + k} ${tip.y - k} L${c - k} ${tip.y + k}`} stroke={LINE} strokeWidth={1.6} />
}

/** Le punte di un messaggio: `double` è la punta piena a tutti e due i capi (`<<->>`). */
function Heads({ head, end, start }: { head: Head; end: { tip: Point; dir: number }; start: { tip: Point; dir: number } }) {
  if (head === "none") return null
  if (head !== "double") return <HeadMark head={head} {...end} />
  return (
    <>
      <HeadMark head="filled" {...end} />
      <HeadMark head="filled" {...start} />
    </>
  )
}

/** Un'etichetta a linguetta (l'intestazione «sd», l'operatore di un blocco): un angolo tagliato in basso a destra. */
function Tab({ r, text }: { r: Rect; text: string }) {
  return (
    <>
      <path d={`M${r.x} ${r.y} h${r.w} v${r.h - TAB_CUT} l${-TAB_CUT} ${TAB_CUT} H${r.x} Z`} fill="var(--muted)" stroke={BORDER} />
      <text x={r.x + 7} y={r.y + r.h / 2} dominantBaseline="central" fontSize={SMALL} fontWeight={600} fill="var(--foreground)" xmlSpace="preserve">
        {text}
      </text>
    </>
  )
}

function ParticipantHead({ id, p, l }: { id: string; p: Participant; l: SequenceLayout }) {
  const col = l.columns[p.id]
  if (!col) return null
  const { head } = col
  const name = (
    <text
      data-sequence-text={p.id}
      x={col.x}
      y={p.kind === "actor" ? head.y + head.h - 6 : head.y + head.h / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fill="var(--foreground)"
      xmlSpace="preserve"
    >
      {p.label ?? p.name}
    </text>
  )
  return (
    <g data-node-id={`${id}/${p.id}`}>
      {p.kind === "actor" ? (
        <>
          <rect x={head.x} y={head.y} width={head.w} height={head.h} fill="transparent" />
          <g fill="none" stroke={LINE} strokeWidth={1.4}>
            <circle cx={col.x} cy={head.y + 6} r={4} />
            <path d={`M${col.x} ${head.y + 10}v9 M${col.x - 7} ${head.y + 13}h14 M${col.x} ${head.y + 19}l-6 6 M${col.x} ${head.y + 19}l6 6`} />
          </g>
        </>
      ) : (
        <rect x={head.x} y={head.y} width={head.w} height={head.h} rx={3} fill="var(--card)" stroke={BORDER} />
      )}
      {name}
    </g>
  )
}

function Message({ id, step, l, number }: { id: string; step: MessageStep; l: SequenceLayout; number: number | null }) {
  const r = l.rows[step.id]
  const a = l.columns[step.from]
  const b = l.columns[step.to]
  // Un riferimento pendente è un problema di validazione: la riga resta vuota.
  if (!r || !a || !b) return null
  const y = r.y + r.h - ARROW_LIFT
  const dash = step.line === "dashed" ? "6 4" : undefined
  const self = step.from === step.to
  const dir = self ? -1 : Math.sign(b.x - a.x)
  const end = { tip: { x: self ? a.x + 2 : b.x, y }, dir }
  // Nell'anello la partenza esce verso destra: la sua punta guarda a sinistra, verso la linea di vita.
  const start = { tip: { x: a.x, y: self ? y - SELF_LOOP_H : y }, dir: self ? -1 : -dir }
  const line = self
    ? `M${a.x} ${y - SELF_LOOP_H} h${SELF_LOOP_W} v${SELF_LOOP_H} h${2 - SELF_LOOP_W}`
    : `M${a.x} ${y} L${b.x} ${y}`
  const label = self ? { x: a.x + SELF_TEXT_DX, y: y - SELF_LOOP_H - 6, anchor: "start" as const } : { x: (a.x + b.x) / 2, y: y - 7, anchor: "middle" as const }
  return (
    <g data-node-id={`${id}/${step.id}`}>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" />
      <path d={line} fill="none" stroke={LINE} strokeWidth={1.5} strokeDasharray={dash} />
      <Heads head={step.head} end={end} start={start} />
      <text x={label.x} y={label.y} textAnchor={label.anchor} fill="var(--foreground)" xmlSpace="preserve">
        {number !== null && (
          <tspan fill="var(--primary)" fontWeight={600}>
            {number}.{" "}
          </tspan>
        )}
        <tspan data-sequence-text={step.id}>{step.text}</tspan>
      </text>
    </g>
  )
}

/**
 * Una nota di sequenza, foglio con l'angolo piegato come le Note. Sta **dentro** la sua riga, così
 * il rettangolo di `subRect` è quello disegnato: `left`/`right` prendono la metà della colonna da
 * quel lato della linea di vita, `over` tutta la riga.
 */
function SequenceNote({ id, step, l }: { id: string; step: NoteStep; l: SequenceLayout }) {
  const r = l.rows[step.id]
  if (!r) return null
  const col = step.placement === "over" ? undefined : l.columns[step.participants[0]]
  const x0 = col && step.placement === "right" ? col.x + NOTE_INSET : r.x
  const x1 = col && step.placement === "left" ? col.x - NOTE_INSET : r.x + r.w
  const w = x1 - x0
  const h = r.h - 2 * NOTE_INSET
  const { body, fold } = notePath(w, h)
  return (
    <g data-node-id={`${id}/${step.id}`} transform={`translate(${x0} ${r.y + NOTE_INSET})`}>
      <path d={body} fill="var(--card)" stroke={BORDER} />
      <path d={fold} fill="var(--muted)" stroke={BORDER} />
      <text data-sequence-text={step.id} x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
        {step.text}
      </text>
    </g>
  )
}

/** Il riquadro di un blocco, con le sezioni divise da linee tratteggiate e le condizioni. */
function Block({ step, l }: { step: BlockStep; l: SequenceLayout }) {
  const b = l.blocks[step.id]
  if (!b) return null
  return (
    <g>
      <rect x={b.rect.x} y={b.rect.y} width={b.rect.w} height={b.rect.h} fill="none" stroke={BORDER} />
      {step.sections.map((section, j) => {
        const s = b.sections[section.id]
        if (!s) return null
        return (
          <g key={section.id}>
            {j > 0 && <line x1={s.x} x2={s.x + s.w} y1={s.y} y2={s.y} stroke={BORDER} strokeDasharray="5 4" />}
            <text
              x={j === 0 ? b.label.x + b.label.w + 8 : s.x + 8}
              y={s.y + b.label.h / 2}
              dominantBaseline="central"
              fontSize={SMALL}
              fill="var(--muted-foreground)"
              xmlSpace="preserve"
            >
              {/* Il tspan resta anche vuoto, per la modifica sul posto; le parentesi solo con una condizione. */}
              {section.condition !== "" && "["}
              <tspan data-sequence-text={section.id}>{section.condition}</tspan>
              {section.condition !== "" && "]"}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** L'etichetta di un blocco: è il sotto-elemento, e si disegna dopo le linee di vita perché le loro fasce di presa non la coprano. */
function BlockLabel({ id, step, l }: { id: string; step: BlockStep; l: SequenceLayout }) {
  const b = l.blocks[step.id]
  if (!b) return null
  return (
    <g data-node-id={`${id}/${step.id}`}>
      <Tab r={b.label} text={step.operator} />
    </g>
  )
}

/**
 * Vista pura e memoizzata di una sequenza (spec §4.1): tutto viene da `sequenceLayout`. L'ordine nel
 * DOM è l'ordine di disegno, e `hitTest` prende il `data-node-id` più interno sotto il cursore:
 * l'intestazione «sd» viene prima delle teste che copre, i riquadri dei blocchi prima delle linee di vita,
 * le etichette dei blocchi dopo, e le righe per ultime.
 */
export const SequenceNodeView = memo(function SequenceNodeView({ id, sequence, view, selected, selectedSubs = [] }: Props) {
  const l = sequenceLayout(sequence)
  const steps = flatten(sequence.steps)
  const numbers = sequence.autonumber ? messageNumbers(sequence) : new Map<string, number>()
  return (
    <g
      data-node-id={id}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
      <rect width={l.width} height={l.height} fill="var(--card)" stroke={selected ? "var(--primary)" : BORDER} strokeWidth={selected ? 2 : 1} />
      <g data-sequence-header>
        <Tab r={l.header} text={sequence.title === "" ? "sd" : `sd ${sequence.title}`} />
      </g>
      {steps.map((s) => s.kind === "block" && <Block key={s.id} step={s} l={l} />)}
      {sequence.participants.map((p) => {
        const col = l.columns[p.id]
        if (!col) return null
        return (
          <g key={p.id}>
            <g data-lifeline={`${id}/${p.id}`}>
              <line x1={col.x} x2={col.x} y1={col.head.y + col.head.h} y2={l.height - 8} stroke="transparent" strokeWidth={14} />
              <line x1={col.x} x2={col.x} y1={col.head.y + col.head.h} y2={l.height - 8} stroke={LINE} strokeDasharray="4 4" />
            </g>
            <ParticipantHead id={id} p={p} l={l} />
          </g>
        )
      })}
      {steps.map((s) => s.kind === "block" && <BlockLabel key={s.id} id={id} step={s} l={l} />)}
      {steps.map((s) =>
        s.kind === "message" ? (
          <Message key={s.id} id={id} step={s} l={l} number={numbers.get(s.id) ?? null} />
        ) : s.kind === "note" ? (
          <SequenceNote key={s.id} id={id} step={s} l={l} />
        ) : null,
      )}
      {selectedSubs.map((sub) => {
        const r = subRect(sequence, { x: 0, y: 0 }, sub)
        return r && <rect key={sub} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="var(--primary)" strokeWidth={2} pointerEvents="none" />
      })}
    </g>
  )
})

/**
 * La linea che mostra dove cade il passo `stepId` trascinato di `dy` (spec §4.2): lo slot di
 * `stepDrop`, la stessa regola del rilascio. Larga quanto la sezione che lo contiene, o quanto la
 * sequenza. Niente per un sotto-elemento che non è un passo.
 */
export function SequenceDropLine({ sequence, view, stepId, dy }: { sequence: Sequence; view: Point; stepId: string; dy: number }) {
  const slot = stepDrop(sequence, stepId, dy)
  if (!slot) return null
  const l = sequenceLayout(sequence)
  const y = l.slots.find((s) => s.container === slot.container && s.index === slot.index)?.y
  const span = slot.container === ROOT ? { x: 0, w: l.width } : Object.values(l.blocks).find((b) => b.sections[slot.container])?.sections[slot.container]
  if (y === undefined || !span) return null
  const at = view.y + y - ROW_GAP / 2
  return <line data-sequence-drop x1={view.x + span.x} x2={view.x + span.x + span.w} y1={at} y2={at} stroke="var(--primary)" strokeWidth={2} pointerEvents="none" />
}

/** Componente connesso: un selettore per sequenza, così un cambiamento altrove non la tocca. */
export function SequenceNode({ nodeKey }: { nodeKey: string }) {
  const id = qualify("sequence", nodeKey)
  const sequence = useStore(documentStore, (s) => sequenceDiagram(s.doc).model.sequences[nodeKey])
  const view = useStore(documentStore, (s) => sequenceDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", id)))
  const selectedSubs = useStore(
    sessionStore,
    useShallow((s) => selectedKeys(s.selection, "node").flatMap((k) => (k.startsWith(`${id}/`) ? [k.slice(id.length + 1)] : []))),
  )
  // Lo scarto verticale solo quando si trascina, da solo, un sotto-elemento di questa sequenza: le altre non ridisegnano.
  const dragDy = useStore(sessionStore, (s) => (s.dragOffset && selectedSubs.length === 1 && s.selection.size === 1 ? s.dragOffset.y : null))
  if (!sequence || !view) return null
  const [dragged] = selectedSubs
  return (
    <>
      <SequenceNodeView id={id} sequence={sequence} view={view} selected={selected} selectedSubs={selectedSubs} />
      {dragDy !== null && dragged !== undefined && <SequenceDropLine sequence={sequence} view={view} stepId={dragged} dy={dragDy} />}
    </>
  )
}
