import { useEffect, type RefObject } from "react"
import { flushSync } from "react-dom"
import { addEntity, addRelationship, moveNodes } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { edgeGeometry } from "@/editor/edge-routing"
import { erDiagram } from "@/editor/er-access"
import { entityRect } from "@/editor/er/geometry"
import { rectsIntersect, snap, type Point, type Rect } from "@/editor/geometry"
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
  if (node) return { kind: "node", key: node.getAttribute("data-node-id")! }
  const edge = el?.closest("[data-edge-id]")
  if (edge) return { kind: "edge", key: edge.getAttribute("data-edge-id")! }
  return { kind: "canvas" }
}

function isTextInput(target: EventTarget | null): target is HTMLElement {
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

    /**
     * `getBoundingClientRect` è una lettura che forza stile e layout. Durante un drag `previewDrag`
     * ha appena riscritto centinaia di `transform` e di path, e la lettura successiva obbliga il
     * browser a ricalcolare tutto quel lavoro in sincrono — a ogni `pointermove`, che arriva più
     * spesso dei frame. Il rect si mette quindi in cache e si invalida quando può cambiare davvero.
     */
    let rect: DOMRect | null = null
    const invalidateRect = () => {
      rect = null
    }
    const toScreen = (e: MouseEvent): Point => {
      const r = (rect ??= svg.getBoundingClientRect())
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const info = (e: PointerEvent): PointerInfo => {
      const screen = toScreen(e)
      let hit: Hit | null = null
      return {
        screen,
        world: screenToWorld(session().viewport, screen),
        button: (e.button === 1 || e.button === 2 ? e.button : 0) as 0 | 1 | 2,
        shift: e.shiftKey,
        alt: e.altKey,
        // Anche `elementFromPoint` forza stile e layout, e il reducer guarda `hit` solo su down e su
        // up: in `onMove` non lo legge mai. Getter memoizzato, così il valore resta identico a prima
        // nei punti dove serve (`commit-connect` e il doppio click dipendono da `elementFromPoint`,
        // non da `e.target`, per via del pointer capture) ma il drag non lo paga.
        get hit() {
          return (hit ??= hitTest(elementAt(e)))
        },
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
          const ids = entitiesIn(fx.rect).map((k) => selId("node", k))
          session().setSelection(fx.additive ? [...session().selection, ...ids] : ids)
          break
        }
        case "preview-connect":
          showConnect(fx.to ? entityCenter(fx.source) : null, fx.to)
          break
        case "commit-connect": {
          const { key, recipe } = addRelationship(erDiagram(documentStore.getState().doc).model.relationships, fx.source, fx.target)
          documentStore.getState().dispatch(recipe)
          session().setSelection([selId("edge", key)])
          session().setTool("select")
          break
        }
        case "create-node": {
          const { key, recipe } = addEntity(erDiagram(documentStore.getState().doc).model.entities, fx.at)
          documentStore.getState().dispatch(recipe)
          session().setSelection([selId("node", key)])
          session().setTool("select")
          session().setEditing({ key, target: "name" })
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
      // Il down sul canvas cambia la selezione e smonta subito il pannello proprietà: se un campo di
      // testo ha il fuoco va sfocato *prima*, altrimenti l'input viene tolto dal DOM senza mai emettere
      // `blur` e il testo appena digitato — che `CommitInput` salva proprio sul blur — sparirebbe in
      // silenzio. Il blur esplicito fa partire il commit mentre il campo è ancora montato; `flushSync`
      // manda in pagina il risultato del comando prima dell'hit test, che legge il DOM per coordinate.
      const active = document.activeElement
      if (isTextInput(active)) flushSync(() => active.blur())
      svg.setPointerCapture(e.pointerId)
      // Lo strumento entità apre l'editor inline già nel down: senza annullare il default il
      // `mousedown` di compatibilità sposterebbe subito il fuoco sul body e lo richiuderebbe.
      if (e.button === 1 || session().tool === "node") e.preventDefault()
      step({ type: "down", info: info(e), spaceHeld })
    }
    const onPointerMove = (e: PointerEvent) => {
      if (mode.type !== "idle") step({ type: "move", info: info(e) })
    }
    /**
     * Nessun filtro sul pulsante, ed è deliberato: Chrome consegna `pointerup` una volta sola, quando
     * l'ultimo pulsante si alza (i rilasci intermedi arrivano come `pointermove` con `button`
     * impostato). Filtrare sul pulsante che ha aperto il modo lascerebbe il modo aperto per sempre
     * quando il sinistro si rilascia prima del destro — verificato: il nodo continua a seguire il
     * cursore a pulsanti tutti alzati.
     */
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
      if (el?.closest("[data-node-header]") && hit.kind === "node") session().setEditing({ key: hit.key, target: "name" })
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return
      if (e.code === "Space") {
        spaceHeld = true
        // Il default dello Space si annulla solo quando il fuoco è sul canvas o su nessun elemento:
        // il listener è su `window` e un `<button>` non è un campo di testo, quindi annullare il
        // keydown gli impedirebbe di ricevere il click al keyup — nessun pulsante di toolbar o
        // pannello si attiverebbe con la barra spaziatrice, e lo stesso vale per i `<select>`.
        if (e.target === document.body || (e.target instanceof Node && svg.contains(e.target))) e.preventDefault()
      }
      if (e.key === "Escape") step({ type: "cancel" })
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld = false
    }
    // Il keyup dello Space non arriva se il fuoco lascia la finestra mentre il tasto è premuto:
    // senza questo, al rientro il canvas resta in pan e niente lo sblocca fino al prossimo Space.
    const onBlur = () => {
      spaceHeld = false
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()
    const onPointerCancel = () => step({ type: "cancel" })

    // Unico osservatore sull'svg: aggiorna la dimensione del canvas nella sessione (serve a `fitToRect`)
    // e invalida il rect in cache. Le due cose cambiano insieme, quindi stanno insieme.
    const observer = new ResizeObserver(([entry]) => {
      invalidateRect()
      if (entry) session().setCanvasSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(svg)

    // Il rect è relativo al viewport, quindi uno scroll lo sposta. Oggi la pagina non scorre — la
    // cornice è una griglia `h-screen` e l'unico contenitore scorrevole è il pannello laterale, che
    // non muove il canvas — ma un listener in capture costa una riga e non scatta mai a vuoto,
    // mentre un rect stantio darebbe un drag disallineato senza dare alcun segno di sé.
    window.addEventListener("scroll", invalidateRect, { capture: true, passive: true })

    svg.addEventListener("pointerdown", onPointerDown)
    svg.addEventListener("pointermove", onPointerMove)
    svg.addEventListener("pointerup", onPointerUp)
    svg.addEventListener("pointercancel", onPointerCancel)
    svg.addEventListener("wheel", onWheel, { passive: false })
    svg.addEventListener("dblclick", onDblClick)
    svg.addEventListener("contextmenu", onContextMenu)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", invalidateRect, { capture: true })
      svg.removeEventListener("pointerdown", onPointerDown)
      svg.removeEventListener("pointermove", onPointerMove)
      svg.removeEventListener("pointerup", onPointerUp)
      svg.removeEventListener("pointercancel", onPointerCancel)
      svg.removeEventListener("wheel", onWheel)
      svg.removeEventListener("dblclick", onDblClick)
      svg.removeEventListener("contextmenu", onContextMenu)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [svgRef])
}
