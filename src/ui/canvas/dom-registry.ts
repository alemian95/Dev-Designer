import type { EdgeGeometry } from "@/editor/edge-routing"

/**
 * Elementi SVG per chiave. Serve al drag: le posizioni si scrivono sul DOM senza passare da React,
 * e il documento riceve un solo comando al rilascio (spec §4.2-4.3, decisioni dello spike).
 */
const nodes = new Map<string, SVGGElement>()
const edges = new Map<string, SVGGElement>()

export function registerNode(key: string, el: SVGGElement | null): void {
  if (el) nodes.set(key, el)
  else nodes.delete(key)
}

export function registerEdge(key: string, el: SVGGElement | null): void {
  if (el) edges.set(key, el)
  else edges.delete(key)
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
