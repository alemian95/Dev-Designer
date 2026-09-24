import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { editingIn } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { setNodeLabel } from "@/editor/flow/commands"
import { flowNodeSize } from "@/editor/flow/geometry"
import { sessionStore } from "@/editor/session-store"
import { TextEditorOverlay } from "./TextEditorOverlay"

/**
 * Overlay dell'editor sul nodo di flowchart in editing: solo dati e commit, il markup è
 * `TextEditorOverlay` (I2 della correzione finale — vedi il suo docblock per la ragione
 * dell'estrazione, condivisa con `NoteEditor.tsx`).
 *
 * **Perché esiste come file a sé e non come ramo di `NoteEditor.tsx`.** Il doppio click su un
 * nodo di flowchart apre sempre il corpo — non c'è un nome distinto come nell'ER o nelle classi
 * — ed è lo stesso `target: "body"` che `addNode` (`kinds/flow.ts`) già imposta alla creazione:
 * senza un editor che lo raccolga, `session().editing` resterebbe acceso e il canvas ignorerebbe
 * ogni click successivo (`use-canvas-interaction.ts` esce subito quando `editing` è impostato).
 * Un ramo dentro `NoteEditor.tsx` legherebbe due tipi di diagramma allo stesso file per un
 * dettaglio implementativo che non condividono — la nota è una figura del class diagram, il nodo
 * lo è del flowchart.
 */
export function FlowNodeEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const own = editingIn(editing, "flow")
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const node = useStore(documentStore, (s) => (own?.target === "body" ? flowDiagram(s.doc).model.nodes[own.key] : undefined))
  const view = useStore(documentStore, (s) => (own?.target === "body" ? flowDiagram(s.doc).view.nodes[own.key] : undefined))
  if (!own || own.target !== "body" || !node || !view) return null

  const close = () => sessionStore.getState().setEditing(null)
  const { w, h } = flowNodeSize(node)

  return (
    <TextEditorOverlay
      ariaLabel="Testo del nodo"
      x={view.x}
      y={view.y}
      w={w}
      h={h}
      viewport={viewport}
      defaultValue={node.label}
      onCommit={(value) => {
        documentStore.getState().dispatch(setNodeLabel(own.key, value))
        close()
      }}
      onCancel={close}
    />
  )
}
