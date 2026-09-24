import { documentStore } from "@/editor/document-store"
import { rectsIntersect, snap, type Point, type Rect } from "@/editor/geometry"
import { IDLE, reduce, type Effect, type InteractionEvent, type Mode } from "@/editor/interaction"
import { canvasOps } from "@/editor/kinds/canvas-ops"
import type { EdgeEnds } from "@/editor/kinds/ops"
import { selId, sessionStore } from "@/editor/session-store"
import { panBy, visibleWorldRect } from "@/editor/viewport"
import { setEdgeGeometry, setNodePosition, showConnect, showMarquee } from "./dom-registry"

/**
 * Margine, in unità di mondo, attorno all'inquadratura entro cui l'anteprima del drag scrive
 * comunque. Un arco non sta dentro l'ingombro dei suoi due nodi: il cappio di un'auto-relazione
 * esce di `SELF_LOOP_OFFSET` (30) più il suo anello, un marker arriva a 24 dal bordo e
 * un'etichetta di capo poco oltre. Senza margine, un nodo appena fuori dallo schermo lascerebbe
 * mezzo cappio visibile e fermo.
 */
const PREVIEW_MARGIN = 64

interface DragTargets {
  nodes: { key: string; x: number; y: number }[]
  edges: EdgeEnds[]
  /**
   * Il rettangolo di ogni nodo coinvolto — trascinato o all'estremo di un arco toccato — com'era
   * alla presa. La **dimensione** di un nodo non dipende da dove sta: durante il drag cambiano solo
   * `x`/`y`, e ricalcolarla vale una misura di testo per ogni attributo, due volte per arco, a ogni
   * frame. Qui si misura una volta sola e poi si sposta.
   */
  rects: Map<string, Rect>
}

function collectDragTargets(keys: readonly string[]): DragTargets {
  const ops = canvasOps(documentStore.getState().doc)
  const edges = ops.edgesTouching(new Set(keys))
  const rects = new Map<string, Rect>()
  const measure = (key: string) => {
    if (rects.has(key)) return
    const r = ops.rectOf(key)
    if (r) rects.set(key, r)
  }
  for (const key of keys) measure(key)
  for (const edge of edges) {
    measure(edge.source)
    measure(edge.target)
  }
  return {
    nodes: keys.flatMap((key) => {
      const r = rects.get(key)
      return r ? [{ key, x: r.x, y: r.y }] : []
    }),
    edges,
    rects,
  }
}

/** Unione di due rettangoli: l'ingombro di un arco è quello dei suoi due estremi. */
function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/**
 * Anteprima del drag: posizioni snappate sui nodi e geometria ricalcolata sugli edge toccati, tutto
 * sul DOM.
 *
 * **Si scrive solo ciò che finisce nell'inquadratura.** Trascinando una selezione larga, la
 * stragrande maggioranza dei nodi e degli archi sta fuori dallo schermo — alla scala 1, con 300
 * entità, se ne vedono otto — e ogni `setAttribute` su di loro costa comunque ricalcolo di stile
 * per un pixel che nessuno guarda. Il criterio è il rettangolo **dopo** lo spostamento, non prima:
 * un nodo che entra nell'inquadratura durante il drag va scritto, uno che ne esce no. Al rilascio
 * React rende comunque tutto dalle posizioni del comando, quindi il DOM saltato qui non resta
 * indietro: è un'anteprima, non lo stato.
 */
function previewDrag(targets: DragTargets, dx: number, dy: number): void {
  const ops = canvasOps(documentStore.getState().doc)
  const { viewport, canvasSize } = sessionStore.getState()
  const v = visibleWorldRect(viewport, canvasSize)
  const seen = { x: v.x - PREVIEW_MARGIN, y: v.y - PREVIEW_MARGIN, w: v.w + 2 * PREVIEW_MARGIN, h: v.h + 2 * PREVIEW_MARGIN }
  const moved = new Map(targets.nodes.map((n) => [n.key, { x: snap(n.x + dx), y: snap(n.y + dy) }]))
  const rectAt = (key: string): Rect | null => {
    const base = targets.rects.get(key)
    if (!base) return null
    const p = moved.get(key)
    return p ? { ...base, x: p.x, y: p.y } : base
  }
  for (const [key, p] of moved) {
    const r = rectAt(key)
    if (r && rectsIntersect(r, seen)) setNodePosition(key, p.x, p.y)
  }
  for (const edge of targets.edges) {
    const a = rectAt(edge.source)
    const b = rectAt(edge.target)
    // L'ingombro dell'arco e non i suoi estremi: un arco lungo può attraversare l'inquadratura con
    // entrambi i nodi fuori.
    if (!a || !b || !rectsIntersect(union(a, b), seen)) continue
    const geo = ops.edgeGeometry(edge.key, a, b)
    if (geo) setEdgeGeometry(edge.key, geo)
  }
}

/**
 * Riporta nodi e archi di `targets` alle posizioni di partenza, senza il filtro dell'inquadratura
 * di `previewDrag` — qui serve **tutto**, non solo ciò che si vede: gira una volta sola al
 * rilascio, non a ogni frame, e su ciò che il gesto ha davvero toccato, quindi il costo è quello
 * della selezione trascinata, non del documento intero.
 *
 * Gira a ogni rilascio, prima della dispatch. Serve per primo al flowchart (spec §6), dove la
 * posizione scritta al rilascio può differire da quella dell'anteprima: se il centro del nodo cade
 * fuori da ogni banda, il comando lo riallinea alla sua banda di partenza, e quel riallineamento
 * può riportarlo **esattamente** dov'era prima del drag. In quel caso `documentStore.dispatch` non
 * produce patch per quel nodo (e per gli archi che lo toccano), React non ridisegna niente perché
 * per lei nulla è cambiato, e il `transform` scritto a mano dall'anteprima — fermo all'ultima
 * posizione del puntatore, non a quella di partenza — resterebbe sul DOM. Scrivendo qui le
 * posizioni di partenza *prima* della dispatch, il DOM è già corretto se la dispatch non fa nulla,
 * e viene comunque sovrascritto da React se la fa.
 *
 * Il reset è **incondizionato**: una selezione mista può contenere nodi di una famiglia con
 * `commitDrag` e nodi di un'altra senza, e decidere famiglia per famiglia non varrebbe la pena. Per
 * ER e classi è innocuo: React riscrive i nodi la cui view è cambiata, e quelli rimasti fermi sono
 * già tornati alla posizione di partenza.
 */
function resetDragTargets(targets: DragTargets): void {
  const ops = canvasOps(documentStore.getState().doc)
  for (const node of targets.nodes) setNodePosition(node.key, node.x, node.y)
  for (const edge of targets.edges) {
    const a = targets.rects.get(edge.source)
    const b = targets.rects.get(edge.target)
    if (!a || !b) continue
    const geo = ops.edgeGeometry(edge.key, a, b)
    if (geo) setEdgeGeometry(edge.key, geo)
  }
}

function nodeCenter(key: string): Point | null {
  const r = canvasOps(documentStore.getState().doc).rectOf(key)
  return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null
}

function nodesIn(rect: Rect): string[] {
  const ops = canvasOps(documentStore.getState().doc)
  return ops.nodeKeys().filter((key) => {
    const r = ops.rectOf(key)
    return r !== null && rectsIntersect(r, rect)
  })
}

/**
 * La macchina a stati dell'interazione e i suoi effetti, **separati dagli eventi del DOM**.
 * `use-canvas-interaction.ts` costruisce un `PointerInfo` dagli eventi del browser e chiama `step`:
 * tutto quello che succede dopo — il `reduce`, l'anteprima sul DOM, il comando al rilascio — sta
 * qui, e qui si può provare senza un DOM.
 *
 * Non è una separazione inventata per i test. Quel che resta nell'hook ha bisogno del browser per
 * definizione (`getBoundingClientRect`, `elementFromPoint`, il pointer capture); quel che sta qui
 * non ne ha bisogno affatto, perché ogni scrittura passa dal registro di `dom-registry`, che su una
 * chiave non registrata non fa nulla. Erano due responsabilità dentro una `useEffect`.
 */
export interface InteractionRunner {
  step(event: InteractionEvent): void
  /** `false` quando non c'è nulla in corso: il `pointermove` esce senza costruire un `PointerInfo`,
   *  che costerebbe un `getBoundingClientRect`. */
  busy(): boolean
}

export function createInteractionRunner(): InteractionRunner {
  /** Modo corrente e snapshot del drag: lo stato che vive fra un evento e il successivo. */
  let mode: Mode = IDLE
  let dragTargets: DragTargets | null = null
  const session = () => sessionStore.getState()


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
        if (dragTargets) resetDragTargets(dragTargets)
        const recipe = canvasOps(documentStore.getState().doc).commitDrag(fx.keys, fx.dx, fx.dy)
        if (recipe) documentStore.getState().dispatch(recipe)
        break
      }
      case "preview-marquee":
        showMarquee(fx.rect)
        break
      case "commit-marquee": {
        const ids = nodesIn(fx.rect).map((k) => selId("node", k))
        session().setSelection(fx.additive ? [...session().selection, ...ids] : ids)
        break
      }
      case "preview-connect":
        showConnect(fx.to ? nodeCenter(fx.source) : null, fx.to)
        break
      case "commit-connect": {
        const result = canvasOps(documentStore.getState().doc).addEdge(fx.source, fx.target)
        if (!result || result.type === "rejected") break
        if (result.type === "created") documentStore.getState().dispatch(result.recipe)
        session().setSelection([selId("edge", result.key)])
        session().setTool("select")
        break
      }
      case "create-node": {
        const { key, recipe, edit } = canvasOps(documentStore.getState().doc).addNode(fx.at, fx.family, fx.variant)
        documentStore.getState().dispatch(recipe)
        session().setSelection([selId("node", key)])
        session().setTool("select")
        session().setEditing({ key, target: edit })
        break
      }
    }
  }

  const step = (event: InteractionEvent): void => {
    const result = reduce(mode, event, {
      tool: session().tool,
      family: session().family,
      variant: session().variant ?? undefined,
      selection: session().selection,
    })
    mode = result.mode
    for (const fx of result.effects) run(fx)
    // Lo snapshot del drag vale per un solo drag: si scarta appena si esce dal modo, commit o annullamento che sia.
    if (mode.type !== "drag") dragTargets = null
  }

  return {
    step,
    busy: () => mode.type !== "idle",
  }
}
