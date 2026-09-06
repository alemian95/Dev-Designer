import type { EdgeGeometry } from "@/editor/edge-routing"
import type { Point, Rect } from "@/editor/er-geometry"

/**
 * Elementi SVG per chiave. Serve al drag: le posizioni si scrivono sul DOM senza passare da React,
 * e il documento riceve un solo comando al rilascio (spec §4.2-4.3, decisioni dello spike).
 */
const nodes = new Map<string, SVGGElement>()
const edges = new Map<string, SVGGElement>()
let overlay: SVGGElement | null = null

export function registerNode(key: string, el: SVGGElement | null): void {
  if (el) nodes.set(key, el)
  else nodes.delete(key)
}

export function registerEdge(key: string, el: SVGGElement | null): void {
  if (el) edges.set(key, el)
  else edges.delete(key)
}

export function registerOverlay(el: SVGGElement | null): void {
  overlay = el
}

export function setNodePosition(key: string, x: number, y: number): void {
  nodes.get(key)?.setAttribute("transform", `translate(${x} ${y})`)
}

export function setEdgeGeometry(key: string, geo: EdgeGeometry): void {
  const g = edges.get(key)
  if (!g) return
  g.querySelector("[data-edge-hit]")?.setAttribute("d", geo.d)
  g.querySelector("[data-edge-line]")?.setAttribute("d", geo.d)
  g.querySelector("[data-edge-source]")?.setAttribute("d", geo.sourceMarker)
  g.querySelector("[data-edge-target]")?.setAttribute("d", geo.targetMarker)
  const label = g.querySelector("[data-edge-label]")
  if (label) {
    label.setAttribute("x", String(geo.label.x))
    label.setAttribute("y", String(geo.label.y - 6))
  }
}

/** Rettangolo di selezione: `null` lo nasconde. */
export function showMarquee(rect: Rect | null): void {
  const el = overlay?.querySelector("[data-marquee]")
  if (!el) return
  if (!rect) {
    el.setAttribute("visibility", "hidden")
    return
  }
  el.setAttribute("visibility", "visible")
  el.setAttribute("x", String(rect.x))
  el.setAttribute("y", String(rect.y))
  el.setAttribute("width", String(rect.w))
  el.setAttribute("height", String(rect.h))
}

/** Anteprima della connessione in corso: un estremo `null` la nasconde. */
export function showConnect(from: Point | null, to: Point | null): void {
  const el = overlay?.querySelector("[data-connect]")
  if (!el) return
  if (!from || !to) {
    el.setAttribute("visibility", "hidden")
    return
  }
  el.setAttribute("visibility", "visible")
  el.setAttribute("d", `M${from.x} ${from.y} L${to.x} ${to.y}`)
}
