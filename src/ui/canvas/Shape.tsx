import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { ROW_H } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { shapeSize, shapeText } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import type { Shape, ShapeView } from "@/model/shape/schema"
import { registerNode } from "./dom-registry"

interface Props {
  /** La chiave con prefisso: la forma si registra e si colpisce con quella. */
  id: string
  shape: Shape
  view: ShapeView
  selected: boolean
  /** Mostra la maniglia di ridimensionamento: solo per la forma selezionata da sola. */
  handle?: boolean
}

/** Lato della maniglia di ridimensionamento, in unità mondo: lo stesso dei pool. */
const HANDLE = 8

/**
 * Vista pura e memoizzata di una forma (spec 3b §5). Rettangolo ed ellisse hanno bordo e fondo del
 * tema, come i nodi di flusso; il testo non ha né l'uno né l'altro, solo un rettangolo trasparente
 * che lo rende afferrabile anche fra una lettera e l'altra. Il testo si centra, come nei nodi di
 * flusso: il centro è l'unico punto che sta dentro tutte e tre le forme. Un testo vuoto mostra il
 * segnaposto in grigio.
 */
export const ShapeNodeView = memo(function ShapeNodeView({ id, shape, view, selected, handle = false }: Props) {
  const { w, h } = shapeSize(shape, view)
  const text = shapeText(shape)
  const lines = text === "" ? [] : text.split("\n")
  const placeholder = shape.kind === "text" && shape.label === ""
  const stroke = selected ? "var(--primary)" : "var(--border)"
  const strokeWidth = selected ? 2 : 1
  const startY = h / 2 - ((lines.length - 1) * ROW_H) / 2
  return (
    <g
      data-node-id={id}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
      {shape.kind === "rect" && <rect width={w} height={h} fill="var(--card)" stroke={stroke} strokeWidth={strokeWidth} />}
      {shape.kind === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="var(--card)" stroke={stroke} strokeWidth={strokeWidth} />}
      {shape.kind === "text" && (
        <rect width={w} height={h} fill="transparent" stroke={selected ? "var(--primary)" : "none"} strokeDasharray="4 2" />
      )}
      {/* `data-node-body`: il contratto del livello di dettaglio, vedi `ViewportGroup`. */}
      {lines.length > 0 && (
        <g data-node-body>
          <text
            x={w / 2}
            y={startY}
            textAnchor="middle"
            dominantBaseline="central"
            fill={placeholder ? "var(--muted-foreground)" : "var(--foreground)"}
            xmlSpace="preserve"
          >
            {lines.map((line, i) => (
              <tspan key={i} x={w / 2} dy={i === 0 ? 0 : ROW_H}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}
      {/* `data-resize` con la chiave della forma: `hitTest` la guarda prima del nodo, come per i pool (spec 3b §5). */}
      {handle && (
        <rect
          data-resize={id}
          x={w - HANDLE / 2}
          y={h - HANDLE / 2}
          width={HANDLE}
          height={HANDLE}
          fill="var(--primary)"
          style={{ cursor: "nwse-resize" }}
        />
      )}
    </g>
  )
})

/** Componente connesso: un selettore per forma, così un cambiamento altrove non la tocca. */
export function ShapeNode({ nodeKey }: { nodeKey: string }) {
  const id = qualify("shape", nodeKey)
  const shape = useStore(documentStore, (s) => shapeDiagram(s.doc).model.shapes[nodeKey])
  const view = useStore(documentStore, (s) => shapeDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", id)))
  const alone = useStore(sessionStore, (s) => s.selection.size === 1 && s.selection.has(selId("node", id)))
  if (!shape || !view) return null
  return <ShapeNodeView id={id} shape={shape} view={view} selected={selected} handle={alone} />
}
