import { useStore } from "zustand"
import { classDiagram } from "@/editor/class-access"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { selId, sessionStore } from "@/editor/session-store"
import { NoteView } from "./Note"

/** Una nota di classe di un documento esistente: la stessa vista della nota unica, con la chiave della famiglia delle classi. */
export function ClassNoteNode({ nodeKey }: { nodeKey: string }) {
  const id = qualify("class", nodeKey)
  const note = useStore(documentStore, (s) => classDiagram(s.doc).model.notes[nodeKey])
  const view = useStore(documentStore, (s) => classDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", id)))
  if (!note || !view) return null
  return <NoteView id={id} note={note} view={view} selected={selected} />
}
