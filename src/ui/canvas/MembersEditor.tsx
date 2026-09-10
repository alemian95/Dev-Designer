import { useStore } from "zustand"
import { setMembers } from "@/editor/class/commands"
import { classDiagram } from "@/editor/class-access"
import { classSize } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { FONT_SIZE } from "@/editor/geometry"
import { sessionStore } from "@/editor/session-store"
import { worldToScreen } from "@/editor/viewport"
import { documentSession } from "@/io/document-session"
import { memberText, parseMembers } from "@/model/class/members"

/**
 * Textarea sovrapposta al corpo della classe in editing (`session.editing?.target === "body"`),
 * posizionata come `InlineEditor` — `worldToScreen`, dimensioni da `classSize` — ma sull'intero
 * nodo invece che sul solo header: una riga per membro, nella sintassi di §5 della spec.
 *
 * Al blur il testo passa da `parseMembers`. Un rifiuto **non chiude l'editor**: è il contrario del
 * comportamento normale di un blur, e deliberato — perdere in silenzio venti righe appena scritte
 * è l'unico esito inaccettabile, la stessa ragione per cui `CommitInput` ripristina il campo quando
 * `onCommit` torna `false`. Solo Escape chiude, scartando il testo non salvato.
 */
export function MembersEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const cls = useStore(documentStore, (s) =>
    editing?.target === "body" && s.doc.diagram.type === "class" ? classDiagram(s.doc).model.classes[editing.key] : undefined,
  )
  const view = useStore(documentStore, (s) =>
    editing?.target === "body" && s.doc.diagram.type === "class" ? classDiagram(s.doc).view.nodes[editing.key] : undefined,
  )
  if (!editing || editing.target !== "body" || !cls || !view) return null

  const close = () => sessionStore.getState().setEditing(null)
  const initial = memberText({ attributes: cls.attributes, methods: cls.methods })
  const { w, h } = classSize(cls, view.collapsed)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })

  const commit = (text: string, field: HTMLTextAreaElement) => {
    const result = parseMembers(text)
    if (!result.ok) {
      // Rifiuto: il campo resta aperto col testo intatto e l'avviso dice quale riga e perché.
      documentSession.getState().patch({ notice: `Riga ${result.line}: ${result.message}` })
      field.focus()
      return
    }
    documentStore.getState().dispatch(setMembers(editing.key, result.value))
    close()
  }

  return (
    <textarea
      autoFocus
      defaultValue={initial}
      aria-label="Membri della classe"
      className="absolute resize-none whitespace-pre border border-primary bg-card text-foreground outline-none"
      style={{ left: tl.x, top: tl.y, width: w * viewport.scale, height: h * viewport.scale, fontSize: FONT_SIZE * viewport.scale }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget.value, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.value = initial
          close()
        }
      }}
    />
  )
}
