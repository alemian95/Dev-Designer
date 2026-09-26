import type { ReactElement } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { classDiagram } from "@/editor/class-access"
import { classSize } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { entitySize } from "@/editor/er/geometry"
import { splitKey } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { setEdgeLabel } from "@/editor/flow/commands"
import { CHAR_W, FONT_SIZE, HEADER_H, PAD_X } from "@/editor/geometry"
import { familyOps } from "@/editor/kinds/ops"
import { sessionStore, type SessionState } from "@/editor/session-store"
import { worldToScreen, type Viewport } from "@/editor/viewport"
import type { Family } from "@/model/family"
import { renameClassWithNotice } from "../class-rename"
import { renameEntityWithNotice } from "../entity-rename"

/** Negli editor di famiglia la chiave è **senza** prefisso: la toglie `InlineEditor`. La forma resta quella della sessione. */
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
 * La posizione è il punto etichetta che il render calcola già (spec §8: «si colloca sul primo
 * segmento, con lo stesso offset di fascio»): si legge da `familyOps(doc, "flow")`, la stessa via
 * di `FlowEdge.tsx` — non si ricalcolano i rettangoli a mano con `flowNodeRect` (una
 * seconda strada verso lo stesso dato, la ragione della correzione qui).
 *
 * Il testo si scarta senza rifinirlo: `setEdgeLabel` (`flow/commands.ts`) scarta gli spazi ai
 * margini da sé, così ogni via che scrive l'etichetta rispetta la stessa regola.
 */
function FlowEdgeLabelEditor({ editing, viewport, close }: { editing: Editing; viewport: Viewport; close: () => void }) {
  const edge = useStore(documentStore, (s) => flowDiagram(s.doc).model.edges[editing.key])
  const point = useStore(
    documentStore,
    useShallow((s) => {
      if (!edge) return null
      const ops = familyOps(s.doc, "flow")
      const source = ops.rectOf(edge.source)
      const target = ops.rectOf(edge.target)
      if (!source || !target) return null
      return ops.edgeGeometry(editing.key, source, target)?.label ?? null
    }),
  )
  if (!edge || !point) return null
  const chars = Math.max(MIN_LABEL_CHARS, edge.label.length)
  const w = chars * CHAR_W + 2 * PAD_X
  const tl = { x: point.x - w / 2, y: point.y - HEADER_H / 2 }
  const commit = (value: string) => {
    documentStore.getState().dispatch(setEdgeLabel(editing.key, value))
    close()
  }
  const screen = worldToScreen(viewport, tl)
  return <NameInput x={screen.x} y={screen.y} w={w} viewport={viewport} defaultValue={edge.label} label="Etichetta arco" onCommit={commit} onCancel={close} />
}

/**
 * L'editor del nome per la famiglia della chiave in editing — `null` per il flowchart, per le
 * note e per le forme, che un nome non ce l'hanno (un nodo ha solo l'etichetta del corpo, `target:
 * "body"`). Uno `switch` esaustivo sul tipo, non il ternario `er ? Entity : Class` di prima: quel
 * ternario è nato quando i tipi erano due, e un terzo (`"flow"`) ci sarebbe caduto dentro il ramo
 * sbagliato in silenzio — lo stesso difetto già corretto altrove nella stessa correzione finale
 * (`ui/export/svg.tsx`, Task 11). L'annotazione di ritorno è ciò che rende lo switch esaustivo:
 * senza, un quinto tipo futuro non gestito qui tornerebbe `undefined` senza che il compilatore se
 * ne accorga.
 */
function nameEditorFor(family: Family, editing: Editing, viewport: Viewport, close: () => void): ReactElement | null {
  switch (family) {
    case "er":
      return <EntityNameEditor editing={editing} viewport={viewport} close={close} />
    case "class":
      return <ClassNameEditor editing={editing} viewport={viewport} close={close} />
    case "flow":
      return null
    case "shape":
      return null
    case "note":
      return null
  }
}

/**
 * Input HTML sovrapposto all'header del nodo in editing: un comando al commit, Escape annulla e
 * ripristina — comportamento invariato dal Task 6. Guadagna la guardia su `target`: il corpo di una
 * classe è testo strutturato, non un nome, e ha il suo editor separato (`MembersEditor`); `label`
 * (l'etichetta di un arco di flowchart) smista a `FlowEdgeLabelEditor` prima di questa guardia,
 * e solo per una chiave `flow/`: gli archi delle altre famiglie un'etichetta modificabile non ce l'hanno.
 *
 * La famiglia viene dal prefisso della chiave in editing, che qui si toglie: gli editor di famiglia
 * ricevono la chiave nuda. Il nome: nell'ER da `erDiagram`/`renameEntityWithNotice`,
 * nelle classi da `classDiagram`/`renameClassWithNotice`, stesso schema di posizionamento e stessa
 * regola «il blur chiude sempre» — a differenza del corpo (§5 della spec), qui non c'è un parser
 * che possa rifiutare il testo.
 */
export function InlineEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const close = () => sessionStore.getState().setEditing(null)
  if (!editing) return null
  const { family, key } = splitKey(editing.key)
  const own = { key, target: editing.target }
  if (own.target === "label") return family === "flow" ? <FlowEdgeLabelEditor editing={own} viewport={viewport} close={close} /> : null
  if (own.target !== "name") return null
  return nameEditorFor(family, own, viewport, close)
}
