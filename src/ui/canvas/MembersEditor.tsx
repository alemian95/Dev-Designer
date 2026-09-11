import { useRef } from "react"
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
 * Offset di carattere dell'inizio della riga `line` (1-based, come lo intende `parseMembers`, che
 * conta con lo stesso `text.split("\n")`) dentro `text`. Somma le lunghezze delle righe precedenti
 * più un newline per ciascuna; clampato ai bordi nel caso limite di un `line` fuori range.
 */
function caretOffsetForLine(text: string, line: number): number {
  const lines = text.split("\n")
  const idx = Math.min(Math.max(line - 1, 0), lines.length - 1)
  let offset = 0
  for (let i = 0; i < idx; i++) offset += lines[i]!.length + 1
  return offset
}

/**
 * Textarea sovrapposta al corpo della classe in editing (`session.editing?.target === "body"`),
 * posizionata come `InlineEditor` — `worldToScreen`, dimensioni da `classSize` — ma sull'intero
 * nodo invece che sul solo header: una riga per membro, nella sintassi di §5 della spec.
 *
 * Al blur il testo passa da `parseMembers`. Un rifiuto **non chiude l'editor**: è il contrario del
 * comportamento normale di un blur, e deliberato — perdere in silenzio venti righe appena scritte
 * è l'unico esito inaccettabile, la stessa ragione per cui `CommitInput` ripristina il campo quando
 * `onCommit` torna `false`. Solo Escape chiude, scartando il testo non salvato.
 *
 * Il refocus dopo un rifiuto **non deve riselezionare tutto il testo**: `onFocus` normalmente fa
 * `select()` per l'autofocus iniziale (comodo per sovrascrivere in un colpo solo), ma se lo facesse
 * anche qui la battuta successiva all'avviso cancellerebbe l'intero testo appena rifiutato — la
 * stessa perdita di righe che questo componente esiste per impedire. `caretOffsetRef` distingue i
 * due casi: `null` all'autofocus iniziale (select-all), un offset dopo un rifiuto (caret lì, niente
 * selezione) — l'avviso dice «Riga N: …» e portare il cursore a inizio riga trasforma il messaggio
 * in un'indicazione, invece di lasciare l'utente a cercarla a occhio in una textarea di venti righe.
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
  // `null` significa «prossimo focus è l'autofocus iniziale, seleziona tutto»; un numero è l'offset
  // dove posare il caret dopo un rifiuto. Un `useRef`, non uno stato locale: cambiarlo non deve
  // causare un render, lo legge solo il prossimo `onFocus`.
  const caretOffsetRef = useRef<number | null>(null)
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
      caretOffsetRef.current = caretOffsetForLine(text, result.line)
      // `requestAnimationFrame`, non sincrono: se il blur è stato causato dal click su un altro
      // elemento focalizzabile (un pulsante di toolbar, un input del pannello), il browser assegna
      // il fuoco a quello *dopo* il focusout — un `field.focus()` qui dentro perderebbe contro
      // quell'assegnazione. Rimandare al frame successivo lascia vincere il refocus voluto.
      requestAnimationFrame(() => field.focus())
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
      onFocus={(e) => {
        const offset = caretOffsetRef.current
        if (offset === null) {
          e.currentTarget.select()
        } else {
          caretOffsetRef.current = null
          e.currentTarget.setSelectionRange(offset, offset)
        }
      }}
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
