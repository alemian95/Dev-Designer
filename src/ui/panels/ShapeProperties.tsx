import { useStore } from "zustand"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { sessionStore } from "@/editor/session-store"
import { setShapeLabel } from "@/editor/shape/commands"
import { shapeDiagram } from "@/editor/shape-access"
import { NoteTextField } from "./NoteProperties"

const dispatch = (recipe: Recipe) => documentStore.getState().dispatch(recipe)

function ShapeBody({ shapeKey: key }: { shapeKey: string }) {
  const shape = useStore(documentStore, (s) => shapeDiagram(s.doc).model.shapes[key])
  if (!shape) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <NoteTextField fieldId="shape-text" id={qualify("shape", key)} text={shape.label} onCommit={(label) => dispatch(setShapeLabel(key, label))} />
    </div>
  )
}

/** Corpo del pannello per le forme (spec 3b §7). Il pannello della freccia arriva col Task 2. */
export function ShapeProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const key = familySelectedKeys(selection, "node", "shape")[0]
  if (key === undefined) return null
  return <ShapeBody key={key} shapeKey={key} />
}
