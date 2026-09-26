import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { sessionStore } from "@/editor/session-store"
import { invertArrow, setArrowDashed, setArrowHead, setShapeLabel } from "@/editor/shape/commands"
import { shapeDiagram } from "@/editor/shape-access"
import { ArrowHeadSchema, type ArrowHead } from "@/model/shape/schema"
import { NoteTextField } from "./NoteProperties"

const dispatch = (recipe: Recipe) => documentStore.getState().dispatch(recipe)

/** Le voci della select «Punte», nell'ordine di `ArrowHeadSchema`. */
const ARROW_HEAD_LABEL: Readonly<Record<ArrowHead, string>> = { none: "Nessuna", end: "Alla fine", both: "Entrambe" }

function ShapeBody({ shapeKey: key }: { shapeKey: string }) {
  const shape = useStore(documentStore, (s) => shapeDiagram(s.doc).model.shapes[key])
  if (!shape) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <NoteTextField fieldId="shape-text" id={qualify("shape", key)} text={shape.label} onCommit={(label) => dispatch(setShapeLabel(key, label))} />
    </div>
  )
}

/** Punte, tratteggio e verso di una freccia (spec 3b §7): ogni modifica è un passo di annulla. */
function ArrowBody({ arrowKey: key }: { arrowKey: string }) {
  const arrow = useStore(documentStore, (s) => shapeDiagram(s.doc).model.arrows[key])
  if (!arrow) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-1">
        <Label htmlFor="arrow-head">Punte</Label>
        <select
          id="arrow-head"
          value={arrow.head}
          onChange={(e) => dispatch(setArrowHead(key, ArrowHeadSchema.parse(e.target.value)))}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {ArrowHeadSchema.options.map((head) => <option key={head} value={head}>{ARROW_HEAD_LABEL[head]}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="arrow-dashed" type="checkbox" checked={arrow.dashed} onChange={(e) => dispatch(setArrowDashed(key, e.target.checked))} />
        Tratteggiata
      </label>
      <Button variant="outline" size="sm" onClick={() => dispatch(invertArrow(key))}>
        Inverti
      </Button>
    </div>
  )
}

/** Corpo del pannello per le forme (spec 3b §7): una forma o una freccia, come garantisce `PropertiesPanel`. */
export function ShapeProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const node = familySelectedKeys(selection, "node", "shape")[0]
  if (node !== undefined) return <ShapeBody key={node} shapeKey={node} />
  const edge = familySelectedKeys(selection, "edge", "shape")[0]
  return edge === undefined ? null : <ArrowBody key={edge} arrowKey={edge} />
}
