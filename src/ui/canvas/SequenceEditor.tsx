import { useStore } from "zustand"
import { documentStore, type Recipe } from "@/editor/document-store"
import { editingIn } from "@/editor/families"
import type { Point, Rect } from "@/editor/geometry"
import { sessionStore } from "@/editor/session-store"
import { renameParticipant, setCondition, setMessage, setNoteStep, setParticipantLabel, setSequenceTitle } from "@/editor/sequence/commands"
import { sequenceLayout } from "@/editor/sequence/layout"
import { stepAt } from "@/editor/sequence/tree"
import { sequenceDiagram } from "@/editor/sequence-access"
import { splitSequenceKey, type Sequence, type SequenceModel } from "@/model/sequence/schema"
import { TextEditorOverlay } from "./TextEditorOverlay"

interface Target {
  label: string
  rect: Rect
  value: string
  commit: (value: string) => Recipe | null
}

const offset = (r: Rect, view: Point): Rect => ({ ...r, x: r.x + view.x, y: r.y + view.y })

/**
 * Il testo che il sotto-elemento `sub` mostra, dove sta e il comando che lo scrive: il titolo per la
 * sequenza (`sub` `null`), nome o etichetta per un partecipante, il testo di un messaggio o di una
 * nota, la condizione della prima sezione per l'etichetta di un blocco.
 */
function targetOf(model: SequenceModel, seqKey: string, seq: Sequence, view: Point, sub: string | null): Target | null {
  const l = sequenceLayout(seq)
  if (sub === null) return { label: "Titolo della sequenza", rect: offset(l.header, view), value: seq.title, commit: (v) => setSequenceTitle(seqKey, v) }
  const p = seq.participants.find((x) => x.id === sub)
  const head = l.columns[sub]?.head
  if (p && head) {
    // Il testo mostrato è l'etichetta, se c'è: si modifica quello. Un'etichetta svuotata torna al nome.
    if (p.label !== null) return { label: "Etichetta del partecipante", rect: offset(head, view), value: p.label, commit: (v) => setParticipantLabel(seqKey, sub, v === "" ? null : v) }
    return { label: "Nome del partecipante", rect: offset(head, view), value: p.name, commit: (v) => renameParticipant(model, seqKey, sub, v) }
  }
  const step = stepAt(seq, sub)
  const row = l.rows[sub]
  if (step?.kind === "message" && row) return { label: "Testo del messaggio", rect: offset(row, view), value: step.text, commit: (v) => setMessage(seqKey, sub, { text: v }) }
  if (step?.kind === "note" && row) return { label: "Testo della nota", rect: offset(row, view), value: step.text, commit: (v) => setNoteStep(seqKey, sub, { text: v }) }
  const block = l.blocks[sub]
  const section = step?.kind === "block" ? step.sections[0] : undefined
  if (!block || !section) return null
  const rect = { x: block.label.x + block.label.w, y: block.label.y, w: Math.max(block.rect.w - block.label.w, block.label.h), h: block.label.h }
  return { label: "Condizione della sezione", rect: offset(rect, view), value: section.condition, commit: (v) => setCondition(seqKey, section.id, v) }
}

/** Modifica sul posto del testo della sequenza o del sotto-elemento in editing, sul markup di `TextEditorOverlay`. */
export function SequenceEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const own = editingIn(editing, "sequence")
  const parts = own?.target === "body" ? splitSequenceKey(own.key) : null
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const model = useStore(documentStore, (s) => sequenceDiagram(s.doc).model)
  const view = useStore(documentStore, (s) => (parts ? sequenceDiagram(s.doc).view.nodes[parts.sequence] : undefined))
  const seq = parts ? model.sequences[parts.sequence] : undefined
  const target = parts && seq && view ? targetOf(model, parts.sequence, seq, view, parts.participant) : null
  if (!target) return null

  const close = () => sessionStore.getState().setEditing(null)
  return (
    <TextEditorOverlay
      ariaLabel={target.label}
      {...target.rect}
      viewport={viewport}
      defaultValue={target.value}
      onCommit={(value) => {
        // ponytail: un nome rifiutato da `renameParticipant` resta quello di prima, senza avviso; il testo dell'avviso lo fissa il pannello (Task 6).
        const recipe = target.commit(value)
        if (recipe) documentStore.getState().dispatch(recipe)
        close()
      }}
      onCancel={close}
    />
  )
}
