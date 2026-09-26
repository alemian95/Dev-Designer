import { useMemo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { poolIds, poolLaneRects, poolRect, type PoolsPart } from "@/editor/flow/geometry"
import { PAD_X } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { POOL_HEADER_W } from "@/model/flow/schema"
import { registerNode } from "./dom-registry"
import { HANDLE } from "./resize-handle"

/**
 * Vista pura dei pool (spec 2b §3): per ognuno le bande delle corsie, la striscia a sinistra con il
 * nome ruotato come in BPMN e il contorno. La usano il canvas (`PoolsLayer`, sotto) e l'export
 * (`buildSvg`): è la ragione per cui esiste come componente separato — lo stesso pool nell'app e nel
 * file.
 *
 * Il gruppo di un pool ha `data-node-id="flow/<poolId>"` ed è registrato in `dom-registry`: selezione
 * e drag lo trattano come un nodo, e l'anteprima del drag riscrive solo il suo `transform`, perché le
 * coordinate interne sono relative al suo angolo. Si afferra solo la striscia: bande e contorno non
 * ricevono il puntatore, quindi un clic sul corpo di una corsia arriva al canvas, e da lì partono
 * selezione a riquadro e pan. Sul canvas porta anche le maniglie del ridimensionamento — il bordo
 * destro del pool e il bordo inferiore di ogni corsia (spec 2b §5) — che hanno un riempimento
 * trasparente per ricevere il puntatore; l'export non le disegna.
 */
export function PoolsLayerView({ part, selected = new Set(), handles = false }: { part: PoolsPart; selected?: ReadonlySet<string>; handles?: boolean }) {
  return (
    <g data-layer="pools">
      {poolIds(part).map((id) => (
        <PoolFrame key={id} part={part} poolId={id} selected={selected.has(id)} handles={handles} />
      ))}
    </g>
  )
}

function PoolFrame({ part, poolId, selected, handles }: { part: PoolsPart; poolId: string; selected: boolean; handles: boolean }) {
  const pool = part.model.pools[poolId]
  const rect = poolRect(part, poolId)
  if (!pool || !rect) return null
  const id = qualify("flow", poolId)
  const lanes = poolLaneRects(part, poolId)
  return (
    <g
      data-node-id={id}
      data-pool={poolId}
      transform={`translate(${rect.x} ${rect.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
      {lanes.map((lane, i) => (
        <g key={lane.id} pointerEvents="none">
          <rect x={POOL_HEADER_W} y={lane.y - rect.y} width={lane.w} height={lane.h} fill="var(--muted)" fillOpacity={0.35} stroke="var(--border)" />
          <text x={POOL_HEADER_W + PAD_X} y={lane.y - rect.y + PAD_X} dominantBaseline="hanging" fontSize={11} fill="var(--muted-foreground)">
            {pool.lanes[i]?.name}
          </text>
        </g>
      ))}
      <rect data-pool-header x={0} y={0} width={POOL_HEADER_W} height={rect.h} fill="var(--muted)" stroke="var(--border)" />
      <text
        transform={`translate(${POOL_HEADER_W / 2} ${rect.h / 2}) rotate(-90)`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fill="var(--foreground)"
        pointerEvents="none"
      >
        {pool.name}
      </text>
      <rect x={0} y={0} width={rect.w} height={rect.h} fill="none" stroke={selected ? "var(--primary)" : "var(--border)"} strokeWidth={selected ? 2 : 1} pointerEvents="none" />
      {handles && (
        <>
          <rect data-resize={id} x={rect.w - HANDLE / 2} y={0} width={HANDLE} height={rect.h} fill="transparent" style={{ cursor: "ew-resize" }} />
          {lanes.map((lane) => (
            <rect
              key={`maniglia-${lane.id}`}
              data-resize={id}
              data-resize-lane={lane.id}
              x={POOL_HEADER_W}
              y={lane.y - rect.y + lane.h - HANDLE / 2}
              width={lane.w}
              height={HANDLE}
              fill="transparent"
              style={{ cursor: "ns-resize" }}
            />
          ))}
        </>
      )}
    </g>
  )
}

/**
 * Componente connesso: monta `PoolsLayerView` con i pool dello store, prima di archi e nodi
 * (`Canvas.tsx`). Tre selettori stabili invece del diagramma intero: un drag di nodi cambia
 * `view.nodes`, non i pool, e non li ridisegna.
 */
export function PoolsLayer() {
  const pools = useStore(documentStore, (s) => flowDiagram(s.doc).model.pools)
  const poolViews = useStore(documentStore, (s) => flowDiagram(s.doc).view.pools)
  const laneViews = useStore(documentStore, (s) => flowDiagram(s.doc).view.lanes)
  const selection = useStore(sessionStore, (s) => s.selection)
  const part = useMemo(() => ({ model: { pools }, view: { pools: poolViews, lanes: laneViews } }), [pools, poolViews, laneViews])
  const selected = useMemo(() => new Set(Object.keys(pools).filter((id) => selection.has(selId("node", qualify("flow", id))))), [pools, selection])
  return <PoolsLayerView part={part} selected={selected} handles />
}
