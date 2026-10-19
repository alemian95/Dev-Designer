import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { splitKey } from "@/editor/families"
import { CORNERS, type Corner, type Rect } from "@/editor/geometry"
import { canvasOps } from "@/editor/kinds/canvas-ops"
import { subBox } from "@/editor/sequence/geometry"
import { sequenceDiagram } from "@/editor/sequence-access"
import { parseSelId, sessionStore } from "@/editor/session-store"
import type { DevDocument } from "@/model/document"
import { splitSequenceKey } from "@/model/sequence/schema"

/** Lato della maniglia, in pixel dello schermo come gli agganci: si divide per la scala. */
const SIDE = 8

/** L'unico nodo selezionato, se la selezione è esattamente un nodo. */
function singleNode(selection: ReadonlySet<string>): string | null {
  if (selection.size !== 1) return null
  const { kind, key } = parseSelId([...selection][0]!)
  return kind === "node" ? key : null
}

/**
 * Il riquadro su cui stanno le maniglie: quello del nodo, o per un sotto-elemento di sequenza quello
 * che il ridimensionamento cambia (`subBox`). `null` per un pool, che ha le sue sui bordi
 * (`PoolsLayer`), e per un blocco di sequenza, che segue il suo contenuto.
 */
function handlesRect(doc: DevDocument, key: string): Rect | null {
  const ops = canvasOps(doc)
  if (ops.isFrame(key)) return null
  const { family, key: own } = splitKey(key)
  const parts = family === "sequence" ? splitSequenceKey(own) : null
  if (!parts?.participant) return ops.rectOf(key)
  const d = sequenceDiagram(doc)
  const seq = d.model.sequences[parts.sequence]
  const view = d.view.nodes[parts.sequence]
  return seq && view ? subBox(seq, view, parts.participant) : null
}

const CURSOR: Readonly<Record<Corner, string>> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" }

/**
 * Le quattro maniglie di ridimensionamento del nodo selezionato da solo, una per spigolo: anche una
 * sequenza, un suo partecipante, messaggio o nota. Sopra i nodi, come gli agganci: `hitTest` le
 * riconosce da `data-resize`, e `data-resize-handle` dice lo spigolo.
 */
export function ResizeHandlesLayer() {
  const key = useStore(sessionStore, (s) => singleNode(s.selection))
  const scale = useStore(sessionStore, (s) => s.viewport.scale)
  const dragging = useStore(sessionStore, (s) => s.dragging)
  const doc = useStore(documentStore, (s) => s.doc)
  const rect = dragging || key === null ? null : handlesRect(doc, key)
  if (key === null || !rect) return null
  const side = SIDE / scale
  return (
    <g data-layer="resize-handles">
      {CORNERS.map((corner) => (
        <rect
          key={corner}
          data-resize={key}
          data-resize-handle={corner}
          x={(corner === "ne" || corner === "se" ? rect.x + rect.w : rect.x) - side / 2}
          y={(corner === "sw" || corner === "se" ? rect.y + rect.h : rect.y) - side / 2}
          width={side}
          height={side}
          fill="var(--primary)"
          style={{ cursor: CURSOR[corner] }}
        />
      ))}
    </g>
  )
}
