import { memo } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { classDiagram } from "@/editor/class-access"
import { classEdgeGeometry, classRect, isDashed, isFilled } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import type { Rect } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import type { ClassRelation } from "@/model/class/schema"
import { registerEdge } from "./dom-registry"

interface Props {
  edgeKey: string
  relation: ClassRelation
  source: Rect
  target: Rect
  selected: boolean
}

export const ClassEdgeView = memo(function ClassEdgeView({ edgeKey, relation, source, target, selected }: Props) {
  const geo = classEdgeGeometry(source, target, relation)
  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  return (
    <g
      data-edge-id={edgeKey}
      ref={(el) => {
        registerEdge(edgeKey, el)
        return () => registerEdge(edgeKey, null)
      }}
    >
      <path data-edge-hit d={geo.d} fill="none" stroke="transparent" strokeWidth={12} />
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray={isDashed(relation.kind) ? "6 4" : undefined} />
      <path data-edge-source d={geo.sourceMarker} fill="none" stroke={stroke} strokeWidth={1.5} />
      <path data-edge-target d={geo.targetMarker} fill={isFilled(relation.kind) ? stroke : "none"} stroke={stroke} strokeWidth={1.5} />
      {relation.source.multiplicity && geo.sourceEnd && (
        <text data-edge-source-label x={geo.sourceEnd.x} y={geo.sourceEnd.y} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {relation.source.multiplicity}
        </text>
      )}
      {relation.target.multiplicity && geo.targetEnd && (
        <text data-edge-target-label x={geo.targetEnd.x} y={geo.targetEnd.y} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {relation.target.multiplicity}
        </text>
      )}
      {relation.name && (
        <text data-edge-label x={geo.label.x} y={geo.label.y - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {relation.name}
        </text>
      )}
    </g>
  )
})

/** Rect di una classe dallo store; useShallow evita un riferimento nuovo a ogni chiamata. */
function useClassRect(key: string | undefined): Rect | null {
  return useStore(
    documentStore,
    useShallow((s) => {
      if (!key) return null
      const d = classDiagram(s.doc)
      const cls = d.model.classes[key]
      const view = d.view.nodes[key]
      return cls && view ? classRect(cls, view) : null
    }),
  )
}

export function ClassEdge({ edgeKey }: { edgeKey: string }) {
  const relation = useStore(documentStore, (s) => classDiagram(s.doc).model.relations[edgeKey])
  const source = useClassRect(relation?.source.class)
  const target = useClassRect(relation?.target.class)
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", edgeKey)))
  if (!relation || !source || !target) return null
  return <ClassEdgeView edgeKey={edgeKey} relation={relation} source={source} target={target} selected={selected} />
}
