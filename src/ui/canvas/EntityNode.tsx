import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { attributeLines, entitySize } from "@/editor/er/geometry"
import { HEADER_H, PAD_X, ROW_H } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { entityKey, type Entity } from "@/model/er/schema"
import type { NodeView } from "@/model/shared"
import { registerNode } from "./dom-registry"

interface Props {
  nodeKey: string
  entity: Entity
  view: NodeView
  selected: boolean
}

/** Vista pura e memoizzata: ri-renderizza solo se cambiano entità, view o selezione di questo nodo. */
export const EntityNodeView = memo(function EntityNodeView({ nodeKey, entity, view, selected }: Props) {
  const { w, h } = entitySize(entity, view.collapsed)
  const lines = view.collapsed ? [] : attributeLines(entity.attributes)
  return (
    <g
      data-node-id={nodeKey}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(nodeKey, el)
        return () => registerNode(nodeKey, null)
      }}
    >
      <rect width={w} height={h} rx={4} fill="var(--card)" stroke={selected ? "var(--primary)" : "var(--border)"} strokeWidth={selected ? 2 : 1} />
      <rect data-node-header width={w} height={HEADER_H} rx={4} fill="var(--muted)" />
      {lines.length > 0 && <line x1={0} y1={HEADER_H} x2={w} y2={HEADER_H} stroke="var(--border)" />}
      <text data-node-header x={w / 2} y={HEADER_H / 2} textAnchor="middle" dominantBaseline="central" fontWeight={600} fill="var(--foreground)">
        {entityKey(entity)}
      </text>
      {lines.map((line, i) => (
        <text key={i} x={PAD_X} y={HEADER_H + 3 + ROW_H * i + ROW_H / 2} dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
          {line}
        </text>
      ))}
    </g>
  )
})

/** Componente connesso: un selettore per nodo, così un cambiamento altrove non lo tocca. */
export function EntityNode({ nodeKey }: { nodeKey: string }) {
  const entity = useStore(documentStore, (s) => erDiagram(s.doc).model.entities[nodeKey])
  const view = useStore(documentStore, (s) => erDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("entity", nodeKey)))
  if (!entity || !view) return null
  return <EntityNodeView nodeKey={nodeKey} entity={entity} view={view} selected={selected} />
}
