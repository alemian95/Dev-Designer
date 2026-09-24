import { memo } from "react"
import { useStore } from "zustand"
import { classDiagram } from "@/editor/class-access"
import { noteSize, notePath } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { PAD_X, ROW_H } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import type { ClassNote } from "@/model/class/schema"
import type { NodeView } from "@/model/shared"
import { registerNode } from "./dom-registry"

interface Props {
  nodeKey: string
  note: ClassNote
  view: NodeView
  selected: boolean
}

/**
 * Vista pura e memoizzata della nota: la forma UML, rettangolo con l'angolo in alto a destra
 * piegato. Due path e non uno — il triangolo della piega va riempito di un colore diverso dal
 * corpo, e un path solo non può avere due riempimenti.
 *
 * Nessuno scomparto, nessun header: una nota è testo e basta, e `collapsed` non le si applica.
 */
export const ClassNoteView = memo(function ClassNoteView({ nodeKey, note, view, selected }: Props) {
  const id = qualify("class", nodeKey)
  const { w, h } = noteSize(note)
  const { body, fold } = notePath(w, h)
  const lines = note.text === "" ? [] : note.text.split("\n")
  const stroke = selected ? "var(--primary)" : "var(--border)"
  return (
    <g
      data-node-id={id}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
      <path d={body} fill="var(--card)" stroke={stroke} strokeWidth={selected ? 2 : 1} />
      <path data-note-fold d={fold} fill="var(--muted)" stroke={stroke} strokeWidth={selected ? 2 : 1} />
      {/* `data-node-body`: il contratto del livello di dettaglio, vedi `ViewportGroup`. Una nota è
          tutta testo, quindi mentre si zooma resta il solo foglio con l'orecchia. */}
      <g data-node-body>
        {lines.map((line, i) => (
          <text key={i} x={PAD_X} y={6 + ROW_H * i + ROW_H / 2} dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
            {line}
          </text>
        ))}
      </g>
    </g>
  )
})

/** Componente connesso: un selettore per nota, così un cambiamento altrove non la tocca. */
export function ClassNoteNode({ nodeKey }: { nodeKey: string }) {
  const note = useStore(documentStore, (s) => classDiagram(s.doc).model.notes[nodeKey])
  const view = useStore(documentStore, (s) => classDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", qualify("class", nodeKey))))
  if (!note || !view) return null
  return <ClassNoteView nodeKey={nodeKey} note={note} view={view} selected={selected} />
}
