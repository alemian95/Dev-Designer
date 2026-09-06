import { useEffect, type RefObject } from "react"
import { addEntity, addRelationship, moveNodes } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { edgeGeometry } from "@/editor/edge-routing"
import { erDiagram } from "@/editor/er-access"
import { entityRect, rectsIntersect, snap, type Point, type Rect } from "@/editor/er-geometry"
import { IDLE, reduce, type Effect, type Hit, type InteractionEvent, type Mode, type PointerInfo } from "@/editor/interaction"
import { selId, sessionStore } from "@/editor/session-store"
import { panBy, screenToWorld, zoomAt } from "@/editor/viewport"
import { setEdgeGeometry, setNodePosition, showConnect, showMarquee } from "./dom-registry"

const ZOOM_WHEEL_FACTOR = 0.01

interface DragTargets {
  nodes: { key: string; x: number; y: number }[]
  edges: { key: string; source: string; target: string }[]
}

/**
 * Il pointer capture sull'svg ritarget a sé stesso i pointer event successivi al down e i click:
 * `event.target` è sempre l'svg, quindi l'elemento sotto il cursore va cercato dalle coordinate.
 */
function elementAt(e: MouseEvent): Element | null {
  return document.elementFromPoint(e.clientX, e.clientY)
}

function hitTest(el: Element | null): Hit {
  const node = el?.closest("[data-node-id]")
  if (node) return { kind: "entity", key: node.getAttribute("data-node-id")! }
  const edge = el?.closest("[data-edge-id]")
  if (edge) return { kind: "relationship", key: edge.getAttribute("data-edge-id")! }
  return { kind: "canvas" }
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
}

function collectDragTargets(keys: readonly string[]): DragTargets {
  const d = erDiagram(documentStore.getState().doc)
  const set = new Set(keys)
  return {
    nodes: keys.flatMap((key) => {
      const v = d.view.nodes[key]
      return v ? [{ key, x: v.x, y: v.y }] : []
    }),
    edges: Object.entries(d.model.relationships)
      .filter(([, r]) => set.has(r.source.entity) || set.has(r.target.entity))
      .map(([key, r]) => ({ key, source: r.source.entity, target: r.target.entity })),
  }
}

/** Anteprima del drag: posizioni snappate sui nodi e geometria ricalcolata sugli edge toccati, tutto sul DOM. */
function previewDrag(targets: DragTargets, dx: number, dy: number): void {
  const d = erDiagram(documentStore.getState().doc)
  const moved = new Map(targets.nodes.map((n) => [n.key, { x: snap(n.x + dx), y: snap(n.y + dy) }]))
  for (const [key, p] of moved) setNodePosition(key, p.x, p.y)
  const rectOf = (key: string): Rect | null => {
    const entity = d.model.entities[key]
    const view = d.view.nodes[key]
    if (!entity || !view) return null
    return entityRect(entity, { ...view, ...moved.get(key) })
  }
  for (const edge of targets.edges) {
    const rel = d.model.relationships[edge.key]
    const a = rectOf(edge.source)
    const b = rectOf(edge.target)
    if (rel && a && b) setEdgeGeometry(edge.key, edgeGeometry(a, b, rel))
  }
}

function entityCenter(key: string): Point | null {
  const d = erDiagram(documentStore.getState().doc)
  const entity = d.model.entities[key]
  const view = d.view.nodes[key]
  if (!entity || !view) return null
  const r = entityRect(entity, view)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

function entitiesIn(rect: Rect): string[] {
  const d = erDiagram(documentStore.getState().doc)
  return Object.entries(d.model.entities)
    .filter(([key, entity]) => {
      const view = d.view.nodes[key]
      return view && rectsIntersect(entityRect(entity, view), rect)
    })
    .map(([key]) => key)
}

export function useCanvasInteraction(svgRef: RefObject<SVGSVGElement | null>): void {
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let mode: Mode = IDLE
    let spaceHeld = false
    let dragTargets: DragTargets | null = null

    const session = () => sessionStore.getState()
    const toScreen = (e: MouseEvent): Point => {
      const r = svg.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const info = (e: PointerEvent): PointerInfo => {
      const screen = toScreen(e)
      return {
        screen,
        world: screenToWorld(session().viewport, screen),
        button: (e.button === 1 || e.button === 2 ? e.button : 0) as 0 | 1 | 2,
        shift: e.shiftKey,
        alt: e.altKey,
        hit: hitTest(elementAt(e)),
      }
    }

    const run = (fx: Effect): void => {
      switch (fx.type) {
        case "select":
          session().setSelection(fx.ids)
          break
        case "pan-by":
          session().setViewport(panBy(session().viewport, fx.dx, fx.dy))
          break
        case "preview-drag":
          dragTargets ??= collectDragTargets(fx.keys)
          previewDrag(dragTargets, fx.dx, fx.dy)
          break
        case "commit-drag": {
          const recipe = moveNodes(fx.keys, fx.dx, fx.dy)
          if (recipe) documentStore.getState().dispatch(recipe)
          break
        }
        case "preview-marquee":
          showMarquee(fx.rect)
          break
        case "commit-marquee": {
          const ids = entitiesIn(fx.rect).map((k) => selId("entity", k))
          session().setSelection(fx.additive ? [...session().selection, ...ids] : ids)
          break
        }
        case "preview-connect":
          showConnect(fx.to ? entityCenter(fx.source) : null, fx.to)
          break
        case "commit-connect": {
          const { key, recipe } = addRelationship(erDiagram(documentStore.getState().doc).model.relationships, fx.source, fx.target)
          documentStore.getState().dispatch(recipe)
          session().setSelection([selId("relationship", key)])
          session().setTool("select")
          break
        }
        case "create-entity": {
          const { key, recipe } = addEntity(erDiagram(documentStore.getState().doc).model.entities, fx.at)
          documentStore.getState().dispatch(recipe)
          session().setSelection([selId("entity", key)])
          session().setTool("select")
          session().setEditing({ key })
          break
        }
      }
    }

    const step = (event: InteractionEvent): void => {
      const result = reduce(mode, event, { tool: session().tool, selection: session().selection })
      mode = result.mode
      for (const fx of result.effects) run(fx)
      // Lo snapshot del drag vale per un solo drag: si scarta appena si esce dal modo, commit o annullamento che sia.
      if (mode.type !== "drag") dragTargets = null
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return
      if (session().editing) return // l'input inline gestisce il blur da solo
      svg.setPointerCapture(e.pointerId)
      // Lo strumento entità apre l'editor inline già nel down: senza annullare il default il
      // `mousedown` di compatibilità sposterebbe subito il fuoco sul body e lo richiuderebbe.
      if (e.button === 1 || session().tool === "entity") e.preventDefault()
      step({ type: "down", info: info(e), spaceHeld })
    }
    const onPointerMove = (e: PointerEvent) => {
      if (mode.type !== "idle") step({ type: "move", info: info(e) })
    }
    const onPointerUp = (e: PointerEvent) => {
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId)
      step({ type: "up", info: info(e) })
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const vp = session().viewport
      if (e.ctrlKey || e.metaKey) session().setViewport(zoomAt(vp, toScreen(e), Math.exp(-e.deltaY * ZOOM_WHEEL_FACTOR)))
      else session().setViewport(panBy(vp, -e.deltaX, -e.deltaY))
    }
    const onDblClick = (e: MouseEvent) => {
      const el = elementAt(e)
      const hit = hitTest(el)
      if (el?.closest("[data-node-header]") && hit.kind === "entity") session().setEditing({ key: hit.key })
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return
      if (e.code === "Space") {
        spaceHeld = true
        e.preventDefault()
      }
      if (e.key === "Escape") step({ type: "cancel" })
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld = false
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()
    const onPointerCancel = () => step({ type: "cancel" })

    svg.addEventListener("pointerdown", onPointerDown)
    svg.addEventListener("pointermove", onPointerMove)
    svg.addEventListener("pointerup", onPointerUp)
    svg.addEventListener("pointercancel", onPointerCancel)
    svg.addEventListener("wheel", onWheel, { passive: false })
    svg.addEventListener("dblclick", onDblClick)
    svg.addEventListener("contextmenu", onContextMenu)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      svg.removeEventListener("pointerdown", onPointerDown)
      svg.removeEventListener("pointermove", onPointerMove)
      svg.removeEventListener("pointerup", onPointerUp)
      svg.removeEventListener("pointercancel", onPointerCancel)
      svg.removeEventListener("wheel", onWheel)
      svg.removeEventListener("dblclick", onDblClick)
      svg.removeEventListener("contextmenu", onContextMenu)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [svgRef])
}
