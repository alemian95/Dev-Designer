import { useRef, type ReactNode } from "react"
import { FONT_SIZE, GRID } from "@/editor/geometry"
import { FAMILIES } from "@/model/family"
import { FlowNodeEditor } from "./FlowNodeEditor"
import { InlineEditor } from "./InlineEditor"
import { viewFor } from "./kinds/registry"
import { LinksLayer } from "./LinkEdge"
import { MembersEditor } from "./MembersEditor"
import { NoteEditor } from "./NoteEditor"
import { Overlay } from "./Overlay"
import { PoolsLayer } from "./PoolsLayer"
import { ShapeEditor } from "./ShapeEditor"
import { useCanvasInteraction } from "./use-canvas-interaction"
import { ViewportGroup } from "./ViewportGroup"

const GRID_EXTENT = 50_000

/** Un solo <svg>. `children` finisce nel gruppo viewport sopra i nodi (overlay, Task 8). */
export function Canvas({ children }: { children?: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null)
  // L'hook osserva l'svg: aggiorna la dimensione del canvas nella sessione e invalida il rect in cache.
  useCanvasInteraction(svgRef)

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <svg ref={svgRef} className="dd-canvas h-full w-full" fontFamily="var(--font-mono)" fontSize={FONT_SIZE}>
        <defs>
          <pattern id="dd-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="var(--border)" strokeWidth={0.5} />
          </pattern>
        </defs>
        <ViewportGroup>
          <rect data-canvas x={-GRID_EXTENT} y={-GRID_EXTENT} width={2 * GRID_EXTENT} height={2 * GRID_EXTENT} fill="url(#dd-grid)" />
          {/* Le famiglie `backdrop` sotto tutto, anche sotto pool e archi: una zona non copre ciò che
              racchiude (spec 3b §3). */}
          {FAMILIES.filter((f) => viewFor(f).backdrop).map((f) => {
            const { NodesLayer } = viewFor(f)
            return <NodesLayer key={`nodes-${f}`} />
          })}
          {/* I pool non sono un `DiagramView.NodesLayer`: sono un layer che solo il flowchart popola,
              sotto archi e nodi (spec 2b §3). */}
          <PoolsLayer />
          {/* Tutti gli archi sotto tutti i nodi: un arco ER non deve coprire una classe (spec §5). */}
          {FAMILIES.map((f) => {
            const { EdgesLayer } = viewFor(f)
            return <EdgesLayer key={`edges-${f}`} />
          })}
          {/* I collegamenti fra famiglie: sopra gli archi interni, sotto ogni nodo (spec 4a §6). */}
          <LinksLayer />
          {FAMILIES.filter((f) => !viewFor(f).backdrop).map((f) => {
            const { NodesLayer } = viewFor(f)
            return <NodesLayer key={`nodes-${f}`} />
          })}
          {children}
          <Overlay />
        </ViewportGroup>
      </svg>
      <InlineEditor />
      <MembersEditor />
      <NoteEditor />
      <FlowNodeEditor />
      <ShapeEditor />
    </div>
  )
}
