import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { detachNotes, setNoteText } from "@/editor/note/commands"
import { noteDiagram } from "@/editor/note-access"
import { sessionStore } from "@/editor/session-store"
import { endName } from "@/model/links/labels"
import { CommitTextarea } from "./CommitTextarea"

const dispatch = (recipe: Recipe) => documentStore.getState().dispatch(recipe)

/**
 * Il campo «Testo» di una nota: una `textarea` commessa sul blur, l'alternativa al doppio clic sul
 * canvas. **Alternativa, non secondo editor:** finché l'editor sul canvas è aperto su *questa* nota
 * il campo è in sola lettura e lo dice, perché due campi modificabili per lo stesso dato
 * divergerebbero. `id` è la chiave con prefisso della nota, quella che l'editing in corso porta.
 */
export function NoteTextField({ id, text, onCommit }: { id: string; text: string; onCommit: (text: string) => void }) {
  const editingHere = useStore(sessionStore, (s) => s.editing?.key === id && s.editing.target === "body")
  return (
    <div className="grid gap-1">
      <Label htmlFor="note-text">Testo</Label>
      <CommitTextarea
        id="note-text"
        key={text}
        value={text}
        readOnly={editingHere}
        onCommit={onCommit}
        className="min-h-24 resize-none rounded-md border bg-background p-2 text-sm read-only:opacity-50"
      />
      {editingHere && <p className="text-xs text-muted-foreground">Modifica in corso sul canvas.</p>}
    </div>
  )
}

function NoteBody({ noteKey: key }: { noteKey: string }) {
  const note = useStore(documentStore, (s) => noteDiagram(s.doc).model.notes[key])
  const anchorName = useStore(documentStore, (s) => {
    const anchor = noteDiagram(s.doc).model.notes[key]?.anchor
    return anchor ? endName(s.doc, anchor) : null
  })
  if (!note) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <NoteTextField id={qualify("note", key)} text={note.text} onCommit={(text) => dispatch(setNoteText(key, text))} />
      {note.anchor === null ? (
        <p className="text-sm text-muted-foreground">Libera</p>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span>
            Ancorata a: <span className="font-medium">{anchorName}</span>
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => dispatch(detachNotes([key]))}>
            Stacca
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Corpo del pannello per le note (spec 3a §7): lo stesso con la nota selezionata o con la sua linea
 * di ancoraggio, che ha la stessa chiave — è la stessa nota vista da due punti.
 */
export function NoteProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const key = familySelectedKeys(selection, "node", "note")[0] ?? familySelectedKeys(selection, "edge", "note")[0]
  if (key === undefined) return null
  return <NoteBody key={key} noteKey={key} />
}
