import { useStore } from "zustand"
import { setNoteText } from "@/editor/class/commands"
import { classDiagram } from "@/editor/class-access"
import { noteSize } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { sessionStore } from "@/editor/session-store"
import { TextEditorOverlay } from "./TextEditorOverlay"

/**
 * Overlay dell'editor sulla nota in editing: solo dati e commit, il markup è `TextEditorOverlay`
 * (I2 della correzione finale — vedi il suo docblock per la ragione dell'estrazione).
 */
export function NoteEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const note = useStore(documentStore, (s) =>
    editing?.target === "body" && s.doc.diagram.type === "class" ? classDiagram(s.doc).model.notes[editing.key] : undefined,
  )
  const view = useStore(documentStore, (s) =>
    editing?.target === "body" && s.doc.diagram.type === "class" ? classDiagram(s.doc).view.nodes[editing.key] : undefined,
  )
  if (!editing || editing.target !== "body" || !note || !view) return null

  const close = () => sessionStore.getState().setEditing(null)
  const { w, h } = noteSize(note)

  return (
    <TextEditorOverlay
      ariaLabel="Testo della nota"
      x={view.x}
      y={view.y}
      w={w}
      h={h}
      viewport={viewport}
      defaultValue={note.text}
      onCommit={(value) => {
        documentStore.getState().dispatch(setNoteText(editing.key, value))
        close()
      }}
      onCancel={close}
    />
  )
}
