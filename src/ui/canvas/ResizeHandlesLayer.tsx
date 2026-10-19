import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { CORNERS, type Corner } from "@/editor/geometry"
import { canvasOps } from "@/editor/kinds/canvas-ops"
import { parseSelId, sessionStore } from "@/editor/session-store"
import { inFamily } from "@/model/family"

/** Lato della maniglia, in pixel dello schermo come gli agganci: si divide per la scala. */
const SIDE = 8

/** L'unico nodo selezionato, se la selezione è esattamente un nodo. */
function singleNode(selection: ReadonlySet<string>): string | null {
  if (selection.size !== 1) return null
  const { kind, key } = parseSelId([...selection][0]!)
  return kind === "node" ? key : null
}

const CURSOR: Readonly<Record<Corner, string>> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" }

/**
 * Le quattro maniglie di ridimensionamento del nodo selezionato da solo, una per spigolo. Sopra i
 * nodi, come gli agganci: `hitTest` le riconosce da `data-resize`, e `data-resize-handle` dice lo
 * spigolo. Niente maniglie per una sequenza, che si dispone da sola, né per un pool, che ha le sue
 * sui bordi (`PoolsLayer`).
 */
export function ResizeHandlesLayer() {
  const key = useStore(sessionStore, (s) => singleNode(s.selection))
  const scale = useStore(sessionStore, (s) => s.viewport.scale)
  const dragging = useStore(sessionStore, (s) => s.dragging)
  const doc = useStore(documentStore, (s) => s.doc)
  if (dragging || key === null || inFamily(key, "sequence")) return null
  const ops = canvasOps(doc)
  const rect = ops.isFrame(key) ? null : ops.rectOf(key)
  if (!rect) return null
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
