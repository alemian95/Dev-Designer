import { memo } from "react"
import { useStore } from "zustand"
import { classDiagram } from "@/editor/class-access"
import { classSize, hasStereotypeLine, STEREO_H } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { HEADER_H, PAD_X, ROW_H } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { memberLines, type MemberLine } from "@/model/class/members"
import type { ClassNode as ClassNodeModel } from "@/model/class/schema"
import type { NodeView } from "@/model/shared"
import { registerNode } from "./dom-registry"

interface Props {
  nodeKey: string
  node: ClassNodeModel
  view: NodeView
  selected: boolean
}

/** Margine sotto un compartimento con righe: la stessa costante di `classSize` (`editor/class/geometry.ts`). */
const COMPARTMENT_MARGIN = 6

/**
 * Una riga di membro come UML la disegna: se `underline` è `null` è un `<text>` unico, come prima
 * di questo task. Un membro statico invece spezza il testo in tre `<tspan>` — prefisso, nome, resto
 * — perché solo il nome va sottolineato: `{static}` non compare mai in chiaro, quella sintassi resta
 * nella textarea (`memberText`/`parseMembers`), non nel disegno.
 */
function MemberRow({ line, y }: { line: MemberLine; y: number }) {
  if (!line.underline) {
    return (
      <text x={PAD_X} y={y} dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
        {line.text}
      </text>
    )
  }
  const { from, to } = line.underline
  return (
    <text x={PAD_X} y={y} dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
      <tspan>{line.text.slice(0, from)}</tspan>
      <tspan style={{ textDecoration: "underline" }}>{line.text.slice(from, to)}</tspan>
      <tspan>{line.text.slice(to)}</tspan>
    </text>
  )
}

/**
 * Vista pura e memoizzata: tre scomparti — header, attributi, metodi — come UML li disegna. Un
 * compartimento senza righe non occupa spazio e non lascia il suo separatore (§6 della spec).
 * Gli attributi e i metodi si allineano ciascuno nel proprio compartimento: due chiamate a
 * `memberLines` separate, non una sola sull'intera classe, altrimenti il nome più lungo di un
 * compartimento farebbe slittare la colonna dei due punti anche nell'altro.
 */
export const ClassNodeView = memo(function ClassNodeView({ nodeKey, node, view, selected }: Props) {
  const id = qualify("class", nodeKey)
  const { w, h } = classSize(node, view.collapsed)
  const stereo = hasStereotypeLine(node)
  const headerH = HEADER_H + (stereo ? STEREO_H : 0)
  const italic = node.stereotype === "abstract"

  const attrLines = view.collapsed ? [] : memberLines({ attributes: node.attributes, methods: [] })
  const methodLines = view.collapsed ? [] : memberLines({ attributes: [], methods: node.methods })
  const attrTop = headerH
  const methodTop = attrTop + (attrLines.length ? attrLines.length * ROW_H + COMPARTMENT_MARGIN : 0)

  return (
    <g
      data-node-id={id}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
      <rect width={w} height={h} rx={4} fill="var(--card)" stroke={selected ? "var(--primary)" : "var(--border)"} strokeWidth={selected ? 2 : 1} />
      <rect data-node-header width={w} height={headerH} rx={4} fill="var(--muted)" />
      {stereo && (
        <text data-node-header x={w / 2} y={STEREO_H / 2} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="var(--muted-foreground)">
          {`«${node.stereotype}»`}
        </text>
      )}
      <text
        data-node-header
        x={w / 2}
        y={stereo ? STEREO_H + HEADER_H / 2 : HEADER_H / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight={600}
        fontStyle={italic ? "italic" : undefined}
        fill="var(--foreground)"
      >
        {node.name}
      </text>
      {/* Le righe di separazione degli scomparti restano: non hanno glifi, non costano layout, e
          senza di loro un nodo con i membri nascosti sembrerebbe una classe senza membri. */}
      {attrLines.length > 0 && <line data-compartment-rule x1={0} y1={attrTop} x2={w} y2={attrTop} stroke="var(--border)" />}
      {methodLines.length > 0 && <line data-compartment-rule x1={0} y1={methodTop} x2={w} y2={methodTop} stroke="var(--border)" />}
      {/* `data-node-body`: il contratto del livello di dettaglio, vedi `ViewportGroup`. */}
      <g data-node-body>
        {attrLines.map((line, i) => (
          <MemberRow key={`a${i}`} line={line} y={attrTop + 3 + ROW_H * i + ROW_H / 2} />
        ))}
        {methodLines.map((line, i) => (
          <MemberRow key={`m${i}`} line={line} y={methodTop + 3 + ROW_H * i + ROW_H / 2} />
        ))}
      </g>
    </g>
  )
})

/** Componente connesso: un selettore per nodo, così un cambiamento altrove non lo tocca. */
export function ClassNode({ nodeKey }: { nodeKey: string }) {
  const node = useStore(documentStore, (s) => classDiagram(s.doc).model.classes[nodeKey])
  const view = useStore(documentStore, (s) => classDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", qualify("class", nodeKey))))
  if (!node || !view) return null
  return <ClassNodeView nodeKey={nodeKey} node={node} view={view} selected={selected} />
}
