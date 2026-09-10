import { useRef, type ReactNode } from "react"
import { FONT_SIZE, GRID } from "@/editor/geometry"
import { InlineEditor } from "./InlineEditor"
import { useDiagramView } from "./kinds/registry"
import { MembersEditor } from "./MembersEditor"
import { Overlay } from "./Overlay"
import { useCanvasInteraction } from "./use-canvas-interaction"
import { ViewportGroup } from "./ViewportGroup"

const GRID_EXTENT = 50_000

/** Un solo <svg>. `children` finisce nel gruppo viewport sopra i nodi (overlay, Task 8). */
export function Canvas({ children }: { children?: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null)
  // L'hook osserva l'svg: aggiorna la dimensione del canvas nella sessione e invalida il rect in cache.
  useCanvasInteraction(svgRef)
  // I layer vengono dal registro: con un solo tipo di diagramma sono sempre NodesLayer/EdgesLayer
  // di `layers.tsx`, ma il canvas non lo sa più — legge `DiagramView`, non un modulo fisso.
  const { NodesLayer, EdgesLayer } = useDiagramView()

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
          <EdgesLayer />
          <NodesLayer />
          {children}
          <Overlay />
        </ViewportGroup>
      </svg>
      <InlineEditor />
      <MembersEditor />
    </div>
  )
}
