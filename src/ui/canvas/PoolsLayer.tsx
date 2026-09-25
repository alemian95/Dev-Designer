import { useMemo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { flowDiagram } from "@/editor/flow-access"
import { poolIds, poolLaneRects, poolRect, type PoolsPart } from "@/editor/flow/geometry"
import { PAD_X } from "@/editor/geometry"
import { POOL_HEADER_W } from "@/model/flow/schema"

/**
 * Vista pura dei pool (spec 2b §3): per ognuno le bande delle corsie, la striscia a sinistra con il
 * nome ruotato come in BPMN. La usano il canvas (`PoolsLayer`, sotto) e l'export (`buildSvg`): è la
 * ragione per cui esiste come componente separato — lo stesso pool nell'app e nel file.
 *
 * Le coordinate interne sono relative all'angolo del pool (`translate`): spostare un pool vuol dire
 * riscrivere un solo attributo. Le bande non ricevono il puntatore: un clic sul corpo di una corsia
 * arriva al canvas, e da lì partono selezione a riquadro e pan.
 */
export function PoolsLayerView({ part }: { part: PoolsPart }) {
  return (
    <g data-layer="pools">
      {poolIds(part).map((id) => (
        <PoolFrame key={id} part={part} poolId={id} />
      ))}
    </g>
  )
}

function PoolFrame({ part, poolId }: { part: PoolsPart; poolId: string }) {
  const pool = part.model.pools[poolId]
  const rect = poolRect(part, poolId)
  if (!pool || !rect) return null
  const lanes = poolLaneRects(part, poolId)
  return (
    <g data-pool={poolId} transform={`translate(${rect.x} ${rect.y})`}>
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
  const part = useMemo(() => ({ model: { pools }, view: { pools: poolViews, lanes: laneViews } }), [pools, poolViews, laneViews])
  return <PoolsLayerView part={part} />
}
