import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { classDiagram } from "@/editor/class-access"
import { classSize } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { entitySize } from "@/editor/er/geometry"
import { flowDiagram } from "@/editor/flow-access"
import { setEdgeLabel } from "@/editor/flow/commands"
import { flowEdgeGeometry, flowEdgeOffsets, flowNodeRect } from "@/editor/flow/geometry"
import { CHAR_W, FONT_SIZE, HEADER_H, PAD_X } from "@/editor/geometry"
import { sessionStore, type SessionState } from "@/editor/session-store"
import { worldToScreen, type Viewport } from "@/editor/viewport"
import { renameClassWithNotice } from "../class-rename"
import { renameEntityWithNotice } from "../entity-rename"

type Editing = NonNullable<SessionState["editing"]>

interface NameInputProps {
  x: number
  y: number
  w: number
  viewport: Viewport
  defaultValue: string
  label: string
  onCommit: (value: string) => void
  onCancel: () => void
}

/** Il solo markup dell'input: posizione, dimensione e tasti sono identici per entità e classi, cambia solo cosa fa il commit. */
function NameInput({ x, y, w, viewport, defaultValue, label, onCommit, onCancel }: NameInputProps) {
  return (
    <input
      autoFocus
      defaultValue={defaultValue}
      aria-label={label}
      className="absolute border border-primary bg-card text-center font-mono text-foreground outline-none"
      style={{ left: x, top: y, width: w * viewport.scale, height: HEADER_H * viewport.scale, fontSize: FONT_SIZE * viewport.scale }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          e.currentTarget.value = defaultValue
          onCancel()
        }
      }}
    />
  )
}

function EntityNameEditor({ editing, viewport, close }: { editing: Editing; viewport: Viewport; close: () => void }) {
  const entity = useStore(documentStore, (s) => erDiagram(s.doc).model.entities[editing.key])
  const view = useStore(documentStore, (s) => erDiagram(s.doc).view.nodes[editing.key])
  if (!entity || !view) return null
  const { w } = entitySize(entity, view.collapsed)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })
  const commit = (value: string) => {
    // Il blur committa sempre, anche quando l'editor si chiude col testo intatto: senza questa guardia
    // una rinomina identica passerebbe dal dispatch e sporcherebbe la pila undo.
    if (value.trim() !== entity.name) renameEntityWithNotice(editing.key, value, entity.schema)
    close()
  }
  return <NameInput x={tl.x} y={tl.y} w={w} viewport={viewport} defaultValue={entity.name} label="Nome entità" onCommit={commit} onCancel={close} />
}

function ClassNameEditor({ editing, viewport, close }: { editing: Editing; viewport: Viewport; close: () => void }) {
  const cls = useStore(documentStore, (s) => classDiagram(s.doc).model.classes[editing.key])
  const view = useStore(documentStore, (s) => classDiagram(s.doc).view.nodes[editing.key])
  if (!cls || !view) return null
  const { w } = classSize(cls, view.collapsed)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })
  const commit = (value: string) => {
    if (value.trim() !== cls.name) renameClassWithNotice(editing.key, value)
    close()
  }
  return <NameInput x={tl.x} y={tl.y} w={w} viewport={viewport} defaultValue={cls.name} label="Nome classe" onCommit={commit} onCancel={close} />
}

/** Etichetta vuota afferrabile quanto quattro caratteri: sotto questa soglia il riquadro dell'editor collasserebbe a un punto. */
const MIN_LABEL_CHARS = 4

/**
 * Editor dell'etichetta di un arco di flowchart (spec §8), doppio click sull'arco
 * (`use-canvas-interaction.ts`). **Riusa `NameInput`, non un terzo editor a `textarea`** come
 * `NoteEditor`/`FlowNodeEditor`: un'etichetta d'arco è testo a una riga per costruzione — `FlowEdgeView`
 * la disegna in un unico `<text>` senza `tspan`, quindi un a capo non spezzerebbe mai una riga sul
 * canvas, la renderebbe solo invisibile — mentre `NameInput` è già l'`<input>` generico a una riga
 * che questo file condivide fra entità e classi (docblock qui sopra).
 *
 * La posizione è il punto etichetta che `flowEdgeGeometry` calcola già per il render (spec §8: «si
 * colloca sul primo segmento, con lo stesso offset di fascio»): si legge da lì, non si ricalcola.
 */
function FlowEdgeLabelEditor({ editing, viewport, close }: { editing: Editing; viewport: Viewport; close: () => void }) {
  const edge = useStore(documentStore, (s) =>
    s.doc.diagram.type === "flow" ? flowDiagram(s.doc).model.edges[editing.key] : undefined,
  )
  const point = useStore(
    documentStore,
    useShallow((s) => {
      if (s.doc.diagram.type !== "flow" || !edge) return null
      const diagram = flowDiagram(s.doc)
      const sourceNode = diagram.model.nodes[edge.source]
      const sourceView = diagram.view.nodes[edge.source]
      const targetNode = diagram.model.nodes[edge.target]
      const targetView = diagram.view.nodes[edge.target]
      if (!sourceNode || !sourceView || !targetNode || !targetView) return null
      const offset = flowEdgeOffsets(diagram.model.edges).get(editing.key) ?? 0
      return flowEdgeGeometry(flowNodeRect(sourceNode, sourceView), flowNodeRect(targetNode, targetView), edge, offset).label
    }),
  )
  if (!edge || !point) return null
  const chars = Math.max(MIN_LABEL_CHARS, edge.label.length)
  const w = chars * CHAR_W + 2 * PAD_X
  const tl = { x: point.x - w / 2, y: point.y - HEADER_H / 2 }
  const commit = (value: string) => {
    const trimmed = value.trim()
    if (trimmed !== edge.label) documentStore.getState().dispatch(setEdgeLabel(editing.key, trimmed))
    close()
  }
  const screen = worldToScreen(viewport, tl)
  return <NameInput x={screen.x} y={screen.y} w={w} viewport={viewport} defaultValue={edge.label} label="Etichetta arco" onCommit={commit} onCancel={close} />
}

/**
 * Input HTML sovrapposto all'header del nodo in editing: un comando al commit, Escape annulla e
 * ripristina — comportamento invariato dal Task 6. Guadagna la guardia su `target`: il corpo di una
 * classe è testo strutturato, non un nome, e ha il suo editor separato (`MembersEditor`); `label`
 * (l'etichetta di un arco di flowchart) smista a `FlowEdgeLabelEditor` prima di questa guardia,
 * perché non dipende dal tipo di diagramma corrente come fanno `name` ed `EntityNameEditor`/`ClassNameEditor`.
 *
 * Il nome viene dal tipo di diagramma corrente: nell'ER da `erDiagram`/`renameEntityWithNotice`,
 * nelle classi da `classDiagram`/`renameClassWithNotice`, stesso schema di posizionamento e stessa
 * regola «il blur chiude sempre» — a differenza del corpo (§5 della spec), qui non c'è un parser
 * che possa rifiutare il testo.
 */
export function InlineEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const type = useStore(documentStore, (s) => s.doc.diagram.type)
  const close = () => sessionStore.getState().setEditing(null)
  if (!editing) return null
  if (editing.target === "label") return <FlowEdgeLabelEditor editing={editing} viewport={viewport} close={close} />
  if (editing.target !== "name") return null
  return type === "er"
    ? <EntityNameEditor editing={editing} viewport={viewport} close={close} />
    : <ClassNameEditor editing={editing} viewport={viewport} close={close} />
}
