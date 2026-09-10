import { useStore } from "zustand"
import { classDiagram } from "@/editor/class-access"
import { classSize } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { entitySize } from "@/editor/er/geometry"
import { FONT_SIZE, HEADER_H } from "@/editor/geometry"
import { sessionStore, type SessionState } from "@/editor/session-store"
import { worldToScreen, type Viewport } from "@/editor/viewport"
import { renameClassWithNotice } from "../class-rename"
import { renameEntityWithNotice } from "../entity-rename"

type Editing = NonNullable<SessionState["editing"]>

interface NameInputProps {
  x: number
  y: number
  w: number
  viewport: Viewport
  defaultValue: string
  label: string
  onCommit: (value: string) => void
  onCancel: () => void
}

/** Il solo markup dell'input: posizione, dimensione e tasti sono identici per entità e classi, cambia solo cosa fa il commit. */
function NameInput({ x, y, w, viewport, defaultValue, label, onCommit, onCancel }: NameInputProps) {
  return (
    <input
      autoFocus
      defaultValue={defaultValue}
      aria-label={label}
      className="absolute border border-primary bg-card text-center font-mono text-foreground outline-none"
      style={{ left: x, top: y, width: w * viewport.scale, height: HEADER_H * viewport.scale, fontSize: FONT_SIZE * viewport.scale }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          e.currentTarget.value = defaultValue
          onCancel()
        }
      }}
    />
  )
}

function EntityNameEditor({ editing, viewport, close }: { editing: Editing; viewport: Viewport; close: () => void }) {
  const entity = useStore(documentStore, (s) => erDiagram(s.doc).model.entities[editing.key])
  const view = useStore(documentStore, (s) => erDiagram(s.doc).view.nodes[editing.key])
  if (!entity || !view) return null
  const { w } = entitySize(entity, view.collapsed)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })
  const commit = (value: string) => {
    // Il blur committa sempre, anche quando l'editor si chiude col testo intatto: senza questa guardia
    // una rinomina identica passerebbe dal dispatch e sporcherebbe la pila undo.
    if (value.trim() !== entity.name) renameEntityWithNotice(editing.key, value, entity.schema)
    close()
  }
  return <NameInput x={tl.x} y={tl.y} w={w} viewport={viewport} defaultValue={entity.name} label="Nome entità" onCommit={commit} onCancel={close} />
}

function ClassNameEditor({ editing, viewport, close }: { editing: Editing; viewport: Viewport; close: () => void }) {
  const cls = useStore(documentStore, (s) => classDiagram(s.doc).model.classes[editing.key])
  const view = useStore(documentStore, (s) => classDiagram(s.doc).view.nodes[editing.key])
  if (!cls || !view) return null
  const { w } = classSize(cls, view.collapsed)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })
  const commit = (value: string) => {
    if (value.trim() !== cls.name) renameClassWithNotice(editing.key, value)
    close()
  }
  return <NameInput x={tl.x} y={tl.y} w={w} viewport={viewport} defaultValue={cls.name} label="Nome classe" onCommit={commit} onCancel={close} />
}

/**
 * Input HTML sovrapposto all'header del nodo in editing: un comando al commit, Escape annulla e
 * ripristina — comportamento invariato dal Task 6. Guadagna la guardia su `target`: il corpo di una
 * classe è testo strutturato, non un nome, e ha il suo editor separato (`MembersEditor`).
 *
 * Il nome viene dal tipo di diagramma corrente: nell'ER da `erDiagram`/`renameEntityWithNotice`,
 * nelle classi da `classDiagram`/`renameClassWithNotice`, stesso schema di posizionamento e stessa
 * regola «il blur chiude sempre» — a differenza del corpo (§5 della spec), qui non c'è un parser
 * che possa rifiutare il testo.
 */
export function InlineEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const type = useStore(documentStore, (s) => s.doc.diagram.type)
  const close = () => sessionStore.getState().setEditing(null)
  if (!editing || editing.target !== "name") return null
  return type === "er"
    ? <EntityNameEditor editing={editing} viewport={viewport} close={close} />
    : <ClassNameEditor editing={editing} viewport={viewport} close={close} />
}
