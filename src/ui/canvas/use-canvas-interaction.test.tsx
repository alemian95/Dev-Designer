// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createErDocument } from "@/model/er/schema"
import { documentStore } from "@/editor/document-store"
import { sessionStore } from "@/editor/session-store"
import { IDENTITY } from "@/editor/viewport"
import { useCanvasInteraction } from "./use-canvas-interaction"

/**
 * Il cablaggio degli eventi, cioè quel che è rimasto nell'hook dopo che la macchina a stati se n'è
 * andata in `interaction-runner.ts` (DT-18): pointer capture, rect in cache, rotella, tastiera,
 * smontaggio. Ha bisogno di un DOM per esistere — `class-render.test.tsx` è l'altro file che ne usa
 * uno, per lo stesso motivo su `ClassEdge`.
 *
 * **Tre cose jsdom non le implementa, e vanno messe a mano.** Non sono scorciatoie: due delle tre
 * sono proprio ciò che si vuole osservare.
 *
 * - `setPointerCapture` e compagni: sostituiti da un registro, che è anche il modo per asserire il
 *   protocollo — preso al down, rilasciato all'up.
 * - `elementFromPoint`: è il modo in cui il test decide cosa sta sotto il cursore, che nel browser
 *   dipende dal layout e qui non esiste.
 * - `ResizeObserver`: sostituito con uno che tiene la callback, così il test può far scattare un
 *   ridimensionamento a comando.
 *
 * `getBoundingClientRect` in jsdom torna tutti zeri: qui è sovrascritto con un rettangolo noto e un
 * contatore, perché **quante volte viene chiamato** è metà di ciò che questo file verifica.
 */

let svg: SVGSVGElement
let root: Root
let catturati: Set<number>
let letture: () => number
let sotto: Element | null
let ridimensiona: (w: number, h: number) => void

/** Il nodo finto sotto il cursore: `data-node-id` è il contratto DOM su cui `hitTest` lavora. */
let nodo: SVGGElement
let header: SVGRectElement

function monta() {
  const ref = { current: svg }
  function Prova() {
    useCanvasInteraction(ref)
    return null
  }
  root = createRoot(document.createElement("div"))
  act(() => root.render(<Prova />))
}

const giu = (over: PointerEventInit = {}) =>
  svg.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, button: 0, buttons: 1, clientX: 100, clientY: 100, bubbles: true, cancelable: true, ...over }))
const muovi = (over: PointerEventInit = {}) =>
  svg.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, button: 0, buttons: 1, clientX: 160, clientY: 140, bubbles: true, cancelable: true, ...over }))
const su = (over: PointerEventInit = {}) =>
  svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, button: 0, buttons: 0, clientX: 160, clientY: 140, bubbles: true, cancelable: true, ...over }))
const tasto = (tipo: "keydown" | "keyup", init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent(tipo, { bubbles: true, cancelable: true, ...init }))

const viewport = () => sessionStore.getState().viewport

beforeEach(() => {
  document.body.innerHTML = ""
  svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  nodo = document.createElementNS("http://www.w3.org/2000/svg", "g")
  nodo.setAttribute("data-node-id", "a")
  header = document.createElementNS("http://www.w3.org/2000/svg", "rect")
  header.setAttribute("data-node-header", "")
  nodo.append(header)
  svg.append(nodo)
  document.body.append(svg)

  catturati = new Set()
  svg.setPointerCapture = (id: number) => void catturati.add(id)
  svg.hasPointerCapture = (id: number) => catturati.has(id)
  svg.releasePointerCapture = (id: number) => void catturati.delete(id)

  const spia = vi.fn(() => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect)
  svg.getBoundingClientRect = spia
  letture = () => spia.mock.calls.length

  sotto = null
  document.elementFromPoint = () => sotto

  let callback: ResizeObserverCallback | null = null
  ridimensiona = (w, h) =>
    callback?.([{ contentRect: { width: w, height: h } } as ResizeObserverEntry], null as unknown as ResizeObserver)
  globalThis.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) { callback = cb }
    observe() {}
    unobserve() {}
    disconnect() { callback = null }
  }

  documentStore.getState().load(createErDocument("t", "t"))
  documentStore.getState().dispatch((draft) => {
    const d = draft.diagram
    if (d.type !== "er") return
    d.model.entities["a"] = { name: "a", attributes: [] }
    d.view.nodes["a"] = { x: 0, y: 0, collapsed: false }
  })
  sessionStore.getState().setViewport(IDENTITY)
  sessionStore.getState().setSelection([])
  sessionStore.getState().setEditing(null)
  sessionStore.getState().setTool("select")
  monta()
})

afterEach(() => {
  act(() => root.unmount())
})

describe("pointer capture", () => {
  it("si prende sul down e si rilascia sull'up", () => {
    giu()
    expect(catturati.has(1)).toBe(true)
    su()
    expect(catturati.has(1)).toBe(false)
  })

  it("il tasto destro non apre nessuna interazione", () => {
    // Il reducer tratterebbe `button: 2` come «nessun modo», ma il capture non deve essere nemmeno
    // preso: resterebbe appeso, perché il `pointerup` di un tasto mai catturato non lo rilascia.
    giu({ button: 2, buttons: 2 })
    expect(catturati.size).toBe(0)
  })

  it("mentre un editor inline è aperto il down non fa nulla: il blur lo gestisce l'input", () => {
    sessionStore.getState().setEditing({ key: "a", target: "name" })
    giu()
    expect(catturati.size).toBe(0)
  })
})

describe("il rect in cache", () => {
  it("si legge una volta sola e si riusa a ogni movimento", () => {
    // È la correzione che ha tolto uno stile e un layout forzati da ogni `pointermove`. Senza la
    // cache queste sarebbero quattro letture invece di una.
    giu()
    muovi()
    muovi()
    muovi()
    expect(letture()).toBe(1)
  })

  it("a riposo un movimento non lo legge affatto", () => {
    muovi()
    expect(letture()).toBe(0)
  })

  it("un ridimensionamento lo invalida, e aggiorna la dimensione del canvas", () => {
    giu()
    muovi()
    expect(letture()).toBe(1)
    act(() => ridimensiona(1000, 700))
    expect(sessionStore.getState().canvasSize).toEqual({ w: 1000, h: 700 })
    muovi()
    expect(letture()).toBe(2)
  })

  it("uno scroll in qualunque punto della pagina lo invalida", () => {
    // Il listener è in capture su `window`: il rect è relativo al viewport, e uno scroll lo sposta.
    giu()
    muovi()
    expect(letture()).toBe(1)
    document.body.dispatchEvent(new Event("scroll", { bubbles: false }))
    muovi()
    expect(letture()).toBe(2)
  })
})

describe("la rotella", () => {
  const rotella = (init: WheelEventInit) => {
    const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init })
    svg.dispatchEvent(e)
    return e
  }

  it("con ctrl o cmd cambia la scala, e annulla sempre il default", () => {
    const e = rotella({ deltaY: -100, ctrlKey: true })
    expect(viewport().scale).toBeGreaterThan(1)
    // Senza `preventDefault` il gesto di pinch del trackpad fa zoomare la pagina intera.
    expect(e.defaultPrevented).toBe(true)
  })

  it("senza modificatori pana, e non tocca la scala", () => {
    const e = rotella({ deltaX: 30, deltaY: 40 })
    expect(viewport()).toMatchObject({ x: -30, y: -40, scale: 1 })
    expect(e.defaultPrevented).toBe(true)
  })
})

describe("la tastiera", () => {
  it("con lo spazio premuto il down pana invece di trascinare", () => {
    sotto = nodo
    tasto("keydown", { code: "Space" })
    giu()
    muovi()
    // Panato di (60, 40), cioè lo spostamento del puntatore: se fosse un drag il viewport starebbe fermo.
    expect(viewport()).toMatchObject({ x: 60, y: 40 })
    expect(sessionStore.getState().selection.size).toBe(0)
    su()
  })

  it("il blur della finestra azzera lo spazio: al rientro il canvas non resta in pan", () => {
    // Il `keyup` non arriva se il fuoco lascia la finestra col tasto premuto. Senza questa riga il
    // canvas resta in pan e niente lo sblocca fino al prossimo Space (DT-2, che fino a jsdom non
    // aveva modo di essere provato).
    sotto = nodo
    tasto("keydown", { code: "Space" })
    window.dispatchEvent(new Event("blur"))
    const prima = viewport()
    giu()
    muovi()
    expect(viewport()).toEqual(prima)
    expect(sessionStore.getState().selection.has("node:a")).toBe(true)
    su()
  })

  it("Escape annulla l'interazione in corso: nessun comando al rilascio", () => {
    sotto = nodo
    const storia = documentStore.getState().past.length
    giu()
    muovi()
    tasto("keydown", { key: "Escape" })
    su()
    expect(documentStore.getState().past.length).toBe(storia)
  })

  it("Escape dentro un campo di testo non tocca il canvas", () => {
    // La guardia esiste perché il listener sta su `window`: chiudere un menu o annullare una
    // rinomina non deve annullare anche quello che il canvas sta facendo.
    sotto = nodo
    const storia = documentStore.getState().past.length
    giu()
    muovi()
    const input = document.createElement("input")
    document.body.append(input)
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    su()
    expect(documentStore.getState().past.length).toBe(storia + 1)
  })
})

describe("il resto del cablaggio", () => {
  it("il doppio click sull'header di un'entità apre la rinomina", () => {
    sotto = header
    svg.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }))
    expect(sessionStore.getState().editing).toEqual({ key: "a", target: "name" })
  })

  it("il doppio click fuori dall'header di un'entità non apre niente", () => {
    // Nell'ER il corpo non ha un formato di testo: il doppio click rinomina solo sull'header.
    sotto = nodo
    svg.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }))
    expect(sessionStore.getState().editing).toBeNull()
  })

  it("il menu contestuale del browser non compare sul canvas", () => {
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    svg.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it("un pointercancel annulla come Escape", () => {
    sotto = nodo
    const storia = documentStore.getState().past.length
    giu()
    muovi()
    svg.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }))
    su()
    expect(documentStore.getState().past.length).toBe(storia)
  })

  it("lo smontaggio stacca tutti i listener, su svg e su window", () => {
    act(() => root.unmount())
    giu()
    expect(catturati.size).toBe(0)
    const e = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
    svg.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    expect(viewport()).toEqual(IDENTITY)
    // `afterEach` smonterebbe di nuovo: rimontare tiene la radice valida.
    monta()
  })
})
