import { memo, useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent, WheelEvent } from "react"
import { gridPositions, makeEntities, type Entity, type Pos } from "./fixtures"

// ponytail: 14px monospace ≈ 8.4px per carattere; il valore vero si misura una volta con getComputedTextLength
const CHAR_W = 8.4
const ROW_H = 20
const FONT = "ui-monospace, SFMono-Regular, Menlo, monospace"

type View = { x: number; y: number; k: number }

function size(e: Entity) {
  const chars = Math.max(e.name.length, ...e.attrs.map((a) => a.length)) + 2
  return { w: chars * CHAR_W, h: ROW_H * (e.attrs.length + 1) }
}

const EntityNode = memo(function EntityNode({
  e,
  pos,
  selected,
}: {
  e: Entity
  pos: Pos
  selected: boolean
}) {
  const { w, h } = size(e)
  return (
    <g data-id={e.id} transform={`translate(${pos.x} ${pos.y})`} style={{ cursor: "grab" }}>
      <rect width={w} height={h} fill="var(--card)" stroke={selected ? "var(--primary)" : "var(--border)"} strokeWidth={selected ? 2 : 1} />
      <rect width={w} height={ROW_H} fill="var(--muted)" />
      <text x={CHAR_W} y={ROW_H - 6} fontFamily={FONT} fontSize={14} fontWeight="bold" fill="var(--foreground)">
        {e.name}
      </text>
      {e.attrs.map((a, i) => (
        <text key={a} x={CHAR_W} y={ROW_H * (i + 2) - 6} fontFamily={FONT} fontSize={14} fill="var(--foreground)">
          {a}
        </text>
      ))}
    </g>
  )
})

function useFps() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const tick = (t: number) => {
      frames++
      if (t - last >= 1000) {
        setFps(frames)
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

export function SpikeCanvas({ toolbar }: { toolbar?: React.ReactNode }) {
  const [count, setCount] = useState(300)
  const entities = useMemo(() => makeEntities(count), [count])
  const [positions, setPositions] = useState<Record<string, Pos>>(() => gridPositions(300))
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 })
  const [selected, setSelected] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
  const fps = useFps()

  // il brief resettava le posizioni in un useEffect su `count`: react-hooks/set-state-in-effect
  // lo vieta, e `count` cambia solo da questo handler. Stesso comportamento, senza effetto.
  const changeCount = (n: number) => {
    setCount(n)
    setPositions(gridPositions(n))
  }

  const toWorld = (ev: PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k }
  }

  const onPointerDown = (ev: PointerEvent<SVGSVGElement>) => {
    svgRef.current!.setPointerCapture(ev.pointerId)
    const id = (ev.target as Element).closest<SVGGElement>("[data-id]")?.dataset.id
    if (id) {
      const p = toWorld(ev)
      drag.current = { id, ox: p.x - positions[id].x, oy: p.y - positions[id].y }
      setSelected(id)
    } else {
      pan.current = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }
      setSelected(null)
    }
  }

  const onPointerMove = (ev: PointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      const { id, ox, oy } = drag.current
      const p = toWorld(ev)
      setPositions((prev) => ({ ...prev, [id]: { x: p.x - ox, y: p.y - oy } }))
    } else if (pan.current) {
      const { sx, sy, vx, vy } = pan.current
      setView((v) => ({ ...v, x: vx + ev.clientX - sx, y: vy + ev.clientY - sy }))
    }
  }

  const onPointerUp = () => {
    drag.current = null
    pan.current = null
  }

  const onWheel = (ev: WheelEvent<SVGSVGElement>) => {
    const r = svgRef.current!.getBoundingClientRect()
    const mx = ev.clientX - r.left
    const my = ev.clientY - r.top
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1
    setView((v) => {
      const k = Math.min(4, Math.max(0.1, v.k * factor))
      return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }
    })
  }

  // auto-drag: misura oggettiva senza mouse — muove t0 di 2px/frame per 5s e stampa i frame completati
  const autoDrag = () => {
    let frames = 0
    const start = performance.now()
    const step = () => {
      frames++
      setPositions((prev) => ({ ...prev, t0: { x: prev.t0.x + 2, y: prev.t0.y + 2 } }))
      if (performance.now() - start < 5000) requestAnimationFrame(step)
      else console.log(`auto-drag: ${frames} frame in 5s (${(frames / 5).toFixed(1)} fps)`)
    }
    requestAnimationFrame(step)
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex items-center gap-3 border-b p-2 font-mono text-sm">
        <span>FPS {fps}</span>
        <label>
          entità
          <input
            type="number"
            className="ml-1 w-20 border bg-background px-1"
            value={count}
            onChange={(e) => changeCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <span>zoom {view.k.toFixed(2)}</span>
        <button type="button" className="border px-2" onClick={autoDrag}>
          auto-drag
        </button>
        {toolbar}
      </div>
      <svg
        ref={svgRef}
        className="flex-1 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g>
            {entities.slice(1).map((e, i) => {
              const a = positions[entities[i].id]
              const b = positions[e.id]
              if (!a || !b) return null
              return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border)" />
            })}
          </g>
          <g>
            {entities.map((e) =>
              positions[e.id] ? (
                <EntityNode key={e.id} e={e} pos={positions[e.id]} selected={selected === e.id} />
              ) : null,
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
