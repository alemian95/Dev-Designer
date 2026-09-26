import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { flowNodeSize, shapePath } from "@/editor/flow/geometry"
import { ROW_H } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import type { FlowNode as FlowNodeModel } from "@/model/flow/schema"
import type { NodeView } from "@/model/shared"
import { registerNode } from "./dom-registry"

interface Props {
  nodeKey: string
  node: FlowNodeModel
  view: NodeView
  selected: boolean
}

/**
 * Vista pura e memoizzata del nodo: un flowchart è fatto delle stesse etichette brevi su più
 * righe della nota unica (`NoteView`, `Note.tsx`, spec §7), ma un solo `<path>` per il corpo, non
 * due: `shapePath` (Task 6) torna già un contorno completo per ogni forma, mentre il secondo path
 * a due tinte di `NoteView` è un dettaglio decorativo dell'angolo ripiegato che qui non serve.
 *
 * **Il testo si centra**, non si allinea a sinistra come nella nota: un rombo o un parallelogramma
 * non hanno un rettangolo interno comodo per il testo, e il centro è l'unico punto che resta
 * dentro qualunque delle cinque forme.
 */
export const FlowNodeView = memo(function FlowNodeView({ nodeKey, node, view, selected }: Props) {
  const id = qualify("flow", nodeKey)
  const { w, h } = flowNodeSize(node)
  const d = shapePath(node.shape, w, h)
  const lines = node.label === "" ? [] : node.label.split("\n")
  const stroke = selected ? "var(--primary)" : "var(--border)"
  // Il blocco di righe si centra sull'altezza della forma: la prima riga sale di metà del blocco
  // rispetto al centro, le altre scendono di `ROW_H` in `ROW_H` via `dy` sui `<tspan>`.
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
      <path d={d} fill="var(--card)" stroke={stroke} strokeWidth={selected ? 2 : 1} />
      {/* `data-node-body`: il contratto del livello di dettaglio, vedi `ViewportGroup`. */}
      {lines.length > 0 && (
        <g data-node-body>
          <text x={w / 2} y={startY} textAnchor="middle" dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
            {lines.map((line, i) => (
              <tspan key={i} x={w / 2} dy={i === 0 ? 0 : ROW_H}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}
    </g>
  )
})

/** Componente connesso: un selettore per nodo, così un cambiamento altrove non lo tocca. */
export function FlowNode({ nodeKey }: { nodeKey: string }) {
  const node = useStore(documentStore, (s) => flowDiagram(s.doc).model.nodes[nodeKey])
  const view = useStore(documentStore, (s) => flowDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", qualify("flow", nodeKey))))
  if (!node || !view) return null
  return <FlowNodeView nodeKey={nodeKey} node={node} view={view} selected={selected} />
}
