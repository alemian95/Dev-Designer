import { useState, type ReactNode } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { sequenceDiagram } from "@/editor/sequence-access"
import {
  addMessage, addNoteStep, addParticipant, addSection, deleteSteps, removeSection, renameParticipant, setAutonumber, setCondition, setMessage,
  setNoteStep, setOperator, setParticipantKind, setParticipantLabel, setSequenceTitle, wrapInBlock,
} from "@/editor/sequence/commands"
import { locate, stepAt } from "@/editor/sequence/tree"
import { sessionStore } from "@/editor/session-store"
import {
  HeadSchema, isValidParticipantName, LineSchema, OperatorSchema, ParticipantKindSchema, PlacementSchema, splitSequenceKey, type BlockStep, type MessageStep,
  type NoteStep, type Participant, type Sequence,
} from "@/model/sequence/schema"
import { BodyTextField } from "./BodyTextField"
import { CommitInput } from "./CommitInput"

const dispatch = (recipe: Recipe | null) => {
  if (recipe) documentStore.getState().dispatch(recipe)
}

const LINE_LABEL = { solid: "Piena", dashed: "Tratteggiata" } as const
const HEAD_LABEL = { none: "Nessuna", filled: "Piena", cross: "Croce", open: "Aperta", double: "Doppia" } as const
const PLACEMENT_LABEL = { left: "A sinistra", right: "A destra", over: "Sopra" } as const
const KIND_LABEL = { participant: "Partecipante", actor: "Attore" } as const

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm"

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

/** Una select su un'enum con le etichette italiane; `parse` rientra nel tipo dell'enum senza cast. */
function EnumSelect<T extends string>({ id, label, value, options, labels, parse, onChange }: {
  id: string
  label: string
  value: T
  options: readonly T[]
  labels: Readonly<Record<T, string>>
  parse: (value: string) => T
  onChange: (value: T) => void
}) {
  return (
    <Field id={id} label={label}>
      <select id={id} value={value} onChange={(e) => onChange(parse(e.target.value))} className={selectClass}>
        {options.map((o) => <option key={o} value={o}>{labels[o]}</option>)}
      </select>
    </Field>
  )
}

function ParticipantSelect({ id, label, value, participants, onChange, none }: {
  id: string
  label: string
  value: string | null
  participants: readonly Participant[]
  onChange: (pid: string) => void
  /** Se c'è, la voce «nessuno» con questo testo, valore `""`. */
  none?: string
}) {
  return (
    <Field id={id} label={label}>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {none !== undefined && <option value="">{none}</option>}
        {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Field>
  )
}

function SequenceBody({ seqKey, seq }: { seqKey: string; seq: Sequence }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <Field id="sequence-title" label="Titolo">
        <CommitInput id="sequence-title" key={seq.title} value={seq.title} onCommit={(t) => dispatch(setSequenceTitle(seqKey, t))} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input id="sequence-autonumber" type="checkbox" checked={seq.autonumber} onChange={(e) => dispatch(setAutonumber(seqKey, e.target.checked))} />
        Numera i messaggi
      </label>
      <Button variant="outline" size="sm" onClick={() => dispatch(addParticipant(seqKey, null).recipe)}>
        + partecipante
      </Button>
    </div>
  )
}

/** Perché un nome è rifiutato: `renameParticipant` dice solo «no»; la regola dei nomi validi è una sola, nel modello. */
function nameError(seq: Sequence, pid: string, name: string): string {
  const clean = name.trim()
  if (clean === "") return "Il nome non può essere vuoto."
  if (!isValidParticipantName(clean)) return "Mermaid non accetta questo nome per un partecipante."
  return seq.participants.some((p) => p.id !== pid && p.name === clean) ? "C'è già un partecipante con questo nome." : ""
}

function ParticipantBody({ seqKey, seq, participant }: { seqKey: string; seq: Sequence; participant: Participant }) {
  const [error, setError] = useState("")
  const rename = (name: string): boolean => {
    const recipe = renameParticipant(documentStore.getState().doc.diagram.sequence.model, seqKey, participant.id, name)
    setError(recipe ? "" : nameError(seq, participant.id, name))
    dispatch(recipe)
    return recipe !== null
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <Field id="participant-name" label="Nome">
        <CommitInput id="participant-name" key={participant.name} value={participant.name} onCommit={rename} aria-invalid={error !== ""} />
        {error !== "" && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </Field>
      <Field id="participant-label" label="Etichetta">
        <CommitInput
          id="participant-label"
          key={participant.label ?? ""}
          value={participant.label ?? ""}
          onCommit={(l) => dispatch(setParticipantLabel(seqKey, participant.id, l === "" ? null : l))}
        />
      </Field>
      <EnumSelect
        id="participant-kind" label="Tipo" value={participant.kind} options={ParticipantKindSchema.options} labels={KIND_LABEL}
        parse={ParticipantKindSchema.parse} onChange={(kind) => dispatch(setParticipantKind(seqKey, participant.id, kind))}
      />
    </div>
  )
}

/** I due partecipanti con cui nasce un messaggio dopo il passo: quelli del passo, o i primi della sequenza. */
function defaultPair(seq: Sequence, stepId: string): [string, string] | null {
  const step = stepAt(seq, stepId)
  if (step?.kind === "message") return [step.from, step.to]
  const [first, second] = step?.kind === "note" ? step.participants : seq.participants.map((p) => p.id)
  const a = first ?? seq.participants[0]?.id
  return a === undefined ? null : [a, second ?? a]
}

/** Pulsanti comuni ai passi: aggiungere dopo, avvolgere in un blocco, eliminare. */
function StepActions({ seqKey, seq, stepId }: { seqKey: string; seq: Sequence; stepId: string }) {
  const at = locate(seq, stepId)
  const pair = defaultPair(seq, stepId)
  const addAfter = () => {
    if (at && pair) dispatch(addMessage(seqKey, pair[0], pair[1], { container: at.container, index: at.index + 1 }).recipe)
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={!at || !pair} onClick={addAfter}>+ messaggio dopo</Button>
      <Button variant="outline" size="sm" onClick={() => dispatch(addNoteStep(seqKey, stepId).recipe)}>+ nota dopo</Button>
      <Button variant="outline" size="sm" onClick={() => dispatch(wrapInBlock(seqKey, [stepId], "loop").recipe)}>Avvolgi in blocco</Button>
      <Button
        variant="outline" size="sm"
        onClick={() => {
          dispatch(deleteSteps(seqKey, [stepId]))
          sessionStore.getState().setSelection([])
        }}
      >
        Elimina
      </Button>
    </div>
  )
}

function MessageBody({ seqKey, seq, step }: { seqKey: string; seq: Sequence; step: MessageStep }) {
  const patch = (p: Parameters<typeof setMessage>[2]) => dispatch(setMessage(seqKey, step.id, p))
  return (
    <div className="flex flex-col gap-3 p-3">
      <Field id="message-text" label="Testo">
        <CommitInput id="message-text" key={step.text} value={step.text} onCommit={(text) => patch({ text })} />
      </Field>
      <EnumSelect id="message-line" label="Tratto" value={step.line} options={LineSchema.options} labels={LINE_LABEL} parse={LineSchema.parse} onChange={(line) => patch({ line })} />
      <EnumSelect id="message-head" label="Punta" value={step.head} options={HeadSchema.options} labels={HEAD_LABEL} parse={HeadSchema.parse} onChange={(head) => patch({ head })} />
      <ParticipantSelect id="message-from" label="Da" value={step.from} participants={seq.participants} onChange={(from) => patch({ from })} />
      <ParticipantSelect id="message-to" label="A" value={step.to} participants={seq.participants} onChange={(to) => patch({ to })} />
      <StepActions seqKey={seqKey} seq={seq} stepId={step.id} />
    </div>
  )
}

function NoteStepBody({ seqKey, seq, step }: { seqKey: string; seq: Sequence; step: NoteStep }) {
  const patch = (p: Parameters<typeof setNoteStep>[2]) => dispatch(setNoteStep(seqKey, step.id, p))
  const [first, second] = step.participants
  return (
    <div className="flex flex-col gap-3 p-3">
      <BodyTextField fieldId="note-step-text" id={qualify("sequence", `${seqKey}/${step.id}`)} text={step.text} onCommit={(text) => patch({ text })} />
      {/* Due partecipanti valgono solo con «Sopra» (invariante del validatore): le altre posizioni tengono il primo. */}
      <EnumSelect
        id="note-step-placement" label="Posizione" value={step.placement} options={PlacementSchema.options} labels={PLACEMENT_LABEL}
        parse={PlacementSchema.parse} onChange={(placement) => patch(placement === "over" ? { placement } : { placement, participants: [first] })}
      />
      <ParticipantSelect id="note-step-first" label="Partecipante" value={first} participants={seq.participants} onChange={(pid) => patch({ participants: second === undefined || pid === second ? [pid] : [pid, second] })} />
      {step.placement === "over" && (
        <ParticipantSelect
          id="note-step-second" label="Secondo partecipante" value={second ?? null} none="Nessuno"
          participants={seq.participants.filter((p) => p.id !== first)}
          onChange={(pid) => patch({ participants: pid === "" ? [first] : [first, pid] })}
        />
      )}
      <StepActions seqKey={seqKey} seq={seq} stepId={step.id} />
    </div>
  )
}

function BlockBody({ seqKey, seq, step }: { seqKey: string; seq: Sequence; step: BlockStep }) {
  const model = useStore(documentStore, (s) => sequenceDiagram(s.doc).model)
  const last = step.sections.at(-1)
  const add = addSection(model, seqKey, step.id)
  const remove = last ? removeSection(model, seqKey, last.id) : null
  return (
    <div className="flex flex-col gap-3 p-3">
      <EnumSelect
        id="block-operator" label="Operatore" value={step.operator} options={OperatorSchema.options}
        labels={{ loop: "loop", alt: "alt", opt: "opt", par: "par", critical: "critical", break: "break" }}
        parse={OperatorSchema.parse} onChange={(op) => dispatch(setOperator(seqKey, step.id, op))}
      />
      {step.sections.map((section, i) => (
        <Field key={section.id} id={`section-condition-${section.id}`} label={`Condizione ${i + 1}`}>
          <CommitInput
            id={`section-condition-${section.id}`} className="section-condition" key={section.condition} value={section.condition}
            onCommit={(c) => dispatch(setCondition(seqKey, section.id, c))}
          />
        </Field>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={add === null} onClick={() => dispatch(add)}>+ sezione</Button>
        <Button variant="outline" size="sm" disabled={remove === null} onClick={() => dispatch(remove)}>− sezione</Button>
      </div>
      <StepActions seqKey={seqKey} seq={seq} stepId={step.id} />
    </div>
  )
}

/** Il corpo giusto per la chiave selezionata: `<seq>` è la sequenza, `<seq>/<id>` un partecipante o un passo. */
function SequenceSelectionBody({ selected }: { selected: string }) {
  const split = splitSequenceKey(selected)
  const seq = useStore(documentStore, (s) => (split ? sequenceDiagram(s.doc).model.sequences[split.sequence] : undefined))
  if (!split || !seq) return null
  if (split.participant === null) return <SequenceBody seqKey={split.sequence} seq={seq} />
  const id = split.participant
  const participant = seq.participants.find((p) => p.id === id)
  if (participant) return <ParticipantBody key={id} seqKey={split.sequence} seq={seq} participant={participant} />
  const step = stepAt(seq, id)
  if (step?.kind === "message") return <MessageBody key={id} seqKey={split.sequence} seq={seq} step={step} />
  if (step?.kind === "note") return <NoteStepBody key={id} seqKey={split.sequence} seq={seq} step={step} />
  return step ? <BlockBody key={id} seqKey={split.sequence} seq={seq} step={step} /> : null
}

/** Corpo del pannello per le sequenze (spec §4.2): un messaggio appena creato è selezionato come arco, il resto come nodo. */
export function SequenceProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const selected = familySelectedKeys(selection, "node", "sequence")[0] ?? familySelectedKeys(selection, "edge", "sequence")[0]
  return selected === undefined ? null : <SequenceSelectionBody selected={selected} />
}
