import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { detachNotes, setNoteText } from "@/editor/note/commands"
import { noteDiagram } from "@/editor/note-access"
import { sessionStore } from "@/editor/session-store"
import { endName } from "@/model/links/labels"
import { BodyTextField } from "./BodyTextField"

const dispatch = (recipe: Recipe) => documentStore.getState().dispatch(recipe)

function NoteBody({ noteKey: key }: { noteKey: string }) {
  const note = useStore(documentStore, (s) => noteDiagram(s.doc).model.notes[key])
  const anchorName = useStore(documentStore, (s) => {
    const anchor = noteDiagram(s.doc).model.notes[key]?.anchor
    return anchor ? endName(s.doc, anchor) : null
  })
  if (!note) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <BodyTextField id={qualify("note", key)} text={note.text} onCommit={(text) => dispatch(setNoteText(key, text))} />
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
