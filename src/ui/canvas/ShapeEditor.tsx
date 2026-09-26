import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { editingIn } from "@/editor/families"
import { sessionStore } from "@/editor/session-store"
import { setShapeLabel } from "@/editor/shape/commands"
import { shapeSize } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import { TextEditorOverlay } from "./TextEditorOverlay"

/**
 * Overlay dell'editor sulla forma in editing: solo dati e commit, il markup è `TextEditorOverlay`,
 * come `NoteEditor` e `FlowNodeEditor`. Si apre alla creazione (`edit: "body"`) e al doppio clic.
 */
export function ShapeEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const own = editingIn(editing, "shape")
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const shape = useStore(documentStore, (s) => (own?.target === "body" ? shapeDiagram(s.doc).model.shapes[own.key] : undefined))
  const view = useStore(documentStore, (s) => (own?.target === "body" ? shapeDiagram(s.doc).view.nodes[own.key] : undefined))
  if (!own || own.target !== "body" || !shape || !view) return null

  const close = () => sessionStore.getState().setEditing(null)
  const { w, h } = shapeSize(shape, view)

  return (
    <TextEditorOverlay
      ariaLabel="Testo della forma"
      x={view.x}
      y={view.y}
      w={w}
      h={h}
      viewport={viewport}
      defaultValue={shape.label}
      onCommit={(value) => {
        documentStore.getState().dispatch(setShapeLabel(own.key, value))
        close()
      }}
      onCancel={close}
    />
  )
}
