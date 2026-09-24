import { useRef, type ReactNode } from "react"
import { FONT_SIZE, GRID } from "@/editor/geometry"
import { FlowNodeEditor } from "./FlowNodeEditor"
import { InlineEditor } from "./InlineEditor"
import { useDocumentFamilies, viewFor } from "./kinds/registry"
import { LanesLayer } from "./LanesLayer"
import { MembersEditor } from "./MembersEditor"
import { NoteEditor } from "./NoteEditor"
import { Overlay } from "./Overlay"
import { useCanvasInteraction } from "./use-canvas-interaction"
import { ViewportGroup } from "./ViewportGroup"

const GRID_EXTENT = 50_000

/** Un solo <svg>. `children` finisce nel gruppo viewport sopra i nodi (overlay, Task 8). */
export function Canvas({ children }: { children?: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null)
  // L'hook osserva l'svg: aggiorna la dimensione del canvas nella sessione e invalida il rect in cache.
  useCanvasInteraction(svgRef)
  // Le famiglie vengono dal registro: con una sola famiglia nel documento è sempre la stessa,
  // ma il canvas non lo sa più — scorre `documentFamilies` e monta i layer di ognuna.
  const families = useDocumentFamilies()

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
          {/* Le corsie non sono un `DiagramView.NodesLayer`: sono un terzo layer che solo il
              flowchart popola (spec §5). `LanesLayer` decide da sé se montarsi. */}
          <LanesLayer />
          {/* Tutti gli archi sotto tutti i nodi: un arco ER non deve coprire una classe (spec §5). */}
          {families.map((f) => {
            const { EdgesLayer } = viewFor(f)
            return <EdgesLayer key={`edges-${f}`} />
          })}
          {families.map((f) => {
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
    </div>
  )
}
