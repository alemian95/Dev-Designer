import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { editingIn } from "@/editor/families"
import { setNoteText } from "@/editor/note/commands"
import { noteSize } from "@/editor/note/geometry"
import { noteDiagram } from "@/editor/note-access"
import { sessionStore } from "@/editor/session-store"
import { TextEditorOverlay } from "./TextEditorOverlay"

/**
 * Overlay dell'editor sulla nota in editing: solo dati e commit, il markup è `TextEditorOverlay`
 * (I2 della correzione finale — vedi il suo docblock per la ragione dell'estrazione).
 */
export function NoteEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const own = editingIn(editing, "note")
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const note = useStore(documentStore, (s) => (own?.target === "body" ? noteDiagram(s.doc).model.notes[own.key] : undefined))
  const view = useStore(documentStore, (s) => (own?.target === "body" ? noteDiagram(s.doc).view.nodes[own.key] : undefined))
  if (!own || own.target !== "body" || !note || !view) return null

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
        documentStore.getState().dispatch(setNoteText(own.key, value))
        close()
      }}
      onCancel={close}
    />
  )
}
