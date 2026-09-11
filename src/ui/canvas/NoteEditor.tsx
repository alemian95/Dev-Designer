import { useStore } from "zustand"
import { setNoteText } from "@/editor/class/commands"
import { classDiagram } from "@/editor/class-access"
import { noteSize } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { FONT_SIZE } from "@/editor/geometry"
import { sessionStore } from "@/editor/session-store"
import { worldToScreen } from "@/editor/viewport"

/**
 * Textarea sovrapposta a una nota in editing, posizionata come `MembersEditor` — `worldToScreen`,
 * dimensioni da `noteSize`.
 *
 * **Senza parser, quindi senza i due comportamenti che `MembersEditor` ha dovuto costruire**: non
 * c'è un testo che possa essere rifiutato, quindi nessun rifiuto sul blur e nessuna riapertura col
 * caret su una riga d'errore. Si commette sul blur, Escape chiude scartando.
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
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })

  return (
    <textarea
      aria-label="Testo della nota"
      autoFocus
      defaultValue={note.text}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        documentStore.getState().dispatch(setNoteText(editing.key, e.currentTarget.value))
        close()
      }}
      onKeyDown={(e) => {
        // Escape scarta; Enter no — una nota è multiriga per natura, a differenza di un nome.
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
