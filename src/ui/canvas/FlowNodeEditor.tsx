import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { flowDiagram } from "@/editor/flow-access"
import { setNodeLabel } from "@/editor/flow/commands"
import { flowNodeSize } from "@/editor/flow/geometry"
import { FONT_SIZE } from "@/editor/geometry"
import { sessionStore } from "@/editor/session-store"
import { worldToScreen } from "@/editor/viewport"

/**
 * Textarea sovrapposta al nodo in editing, sulla stessa forma di `NoteEditor.tsx`: un flowchart
 * riusa l'editor inline della nota di classe (spec §7, «geometria ed editor inline si riusano
 * invece di riscriverli»), non ne scrive uno nuovo — solo la fonte del testo e la dimensione
 * cambiano (`flowNodeSize`/`setNodeLabel` invece di `noteSize`/`setNoteText`).
 *
 * Nessun parser, quindi nessun rifiuto sul blur: si commette sempre, Escape scarta.
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
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const node = useStore(documentStore, (s) =>
    editing?.target === "body" && s.doc.diagram.type === "flow" ? flowDiagram(s.doc).model.nodes[editing.key] : undefined,
  )
  const view = useStore(documentStore, (s) =>
    editing?.target === "body" && s.doc.diagram.type === "flow" ? flowDiagram(s.doc).view.nodes[editing.key] : undefined,
  )
  if (!editing || editing.target !== "body" || !node || !view) return null

  const close = () => sessionStore.getState().setEditing(null)
  const { w, h } = flowNodeSize(node)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })

  return (
    <textarea
      aria-label="Testo del nodo"
      autoFocus
      defaultValue={node.label}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        documentStore.getState().dispatch(setNodeLabel(editing.key, e.currentTarget.value))
        close()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          close()
        }
      }}
      style={{
        position: "absolute",
        left: tl.x,
        top: tl.y,
        width: w * viewport.scale,
        height: h * viewport.scale,
        fontSize: FONT_SIZE * viewport.scale,
      }}
      className="resize-none rounded border bg-card p-1 font-mono text-foreground outline-none ring-2 ring-primary"
    />
  )
}
