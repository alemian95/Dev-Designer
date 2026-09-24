import { useEffect, type RefObject } from "react"
import { flushSync } from "react-dom"
import { classDiagram } from "@/editor/class-access"
import { documentStore } from "@/editor/document-store"
import { splitKey } from "@/editor/families"
import type { Point } from "@/editor/geometry"
import type { Hit, PointerInfo } from "@/editor/interaction"
import { sessionStore } from "@/editor/session-store"
import { panBy, screenToWorld, zoomAt } from "@/editor/viewport"
import { createInteractionRunner } from "./interaction-runner"

const ZOOM_WHEEL_FACTOR = 0.01


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

/**
 * Nome o corpo, per il doppio click su una classe: il contratto DOM (`data-node-header`) non basta
 * da solo. Una classe senza membri non ha pixel di "corpo" distinti dall'header — l'header copre
 * l'intero nodo (`classSize`, §6 della spec) — ma deve comunque poter aprire `MembersEditor`,
 * altrimenti non riceverebbe mai il suo primo membro: niente import, niente riga di form la
 * popolano. La decisione è quindi presa a partire dal modello, non solo dal DOM: una classe vuota
 * ed espansa risolve sempre a "body", anche quando il click cade geometricamente sull'header.
 */
function classEditTarget(key: string, headerHit: boolean): "name" | "body" {
  const diagram = classDiagram(documentStore.getState().doc)
  // Una nota non ha nome: qualunque punto del suo rettangolo apre il corpo.
  if (diagram.model.notes[key]) return "body"
  const cls = diagram.model.classes[key]
  const view = diagram.view.nodes[key]
  const emptyExpanded = !!cls && !view?.collapsed && cls.attributes.length === 0 && cls.methods.length === 0
  if (emptyExpanded) return "body"
  return headerHit ? "name" : "body"
}

function isTextInput(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
}


export function useCanvasInteraction(svgRef: RefObject<SVGSVGElement | null>): void {
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let spaceHeld = false
    // Macchina a stati ed effetti stanno in `interaction-runner.ts`: qui resta solo ciò che ha
    // bisogno del browser per esistere. Un runner per montaggio, come lo era il `mode` di prima.
    const runner = createInteractionRunner()
    const step = runner.step

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
      // Lo strumento nodo — nota compresa, che ne è una variante — apre un editor già nel down:
      // senza annullare il default il `mousedown` di compatibilità sposterebbe subito il fuoco sul
      // body e lo richiuderebbe.
      if (e.button === 1 || session().tool === "node") e.preventDefault()
      step({ type: "down", info: info(e), spaceHeld })
    }
    const onPointerMove = (e: PointerEvent) => {
      if (runner.busy()) step({ type: "move", info: info(e) })
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
      if (hit.kind === "canvas") return
      // La famiglia viene dal prefisso della chiave colpita. `setEditing` riceve la chiave con il
      // prefisso, `classEditTarget` quella senza, perché legge il modello di famiglia.
      const { family, key } = splitKey(hit.key)
      // Solo il flowchart ha un'etichetta sull'arco (spec §8): ER non ha testo sugli archi, e le
      // relazioni di classe si rinominano dal pannello, non con un doppio click sul canvas. Va
      // prima della guardia `hit.kind !== "node"` qui sotto, che altrimenti la scarterebbe.
      if (family === "flow" && hit.kind === "edge") {
        session().setEditing({ key: hit.key, target: "label" })
        return
      }
      if (hit.kind !== "node") return
      const headerHit = !!el?.closest("[data-node-header]")
      if (family === "class") {
        session().setEditing({ key: hit.key, target: classEditTarget(key, headerHit) })
        return
      }
      // Un nodo di flowchart non ha un nome distinto dal corpo, come una nota del class diagram:
      // qualunque punto del nodo apre l'editor di testo (spec §7, «geometria ed editor inline si
      // riusano»), a differenza dell'header che l'ER usa per il nome dell'entità.
      if (family === "flow") {
        session().setEditing({ key: hit.key, target: "body" })
        return
      }
      // Nell'ER non esiste un formato di testo per gli attributi, e aprire una textarea sarebbe
      // una feature non chiesta: il contratto DOM basta da solo, il doppio click rinomina solo
      // quando cade sull'header.
      if (headerHit) session().setEditing({ key: hit.key, target: "name" })
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
