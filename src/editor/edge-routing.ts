import type { Cardinality, Relationship } from "@/model/er/schema"
import type { Point, Rect } from "./geometry"

export interface Dir { x: -1 | 0 | 1; y: -1 | 0 | 1 }
export interface EdgeRoute { points: Point[]; sourceDir: Dir; targetDir: Dir }

export const RIGHT: Dir = { x: 1, y: 0 }
export const LEFT: Dir = { x: -1, y: 0 }
export const UP: Dir = { x: 0, y: -1 }
export const DOWN: Dir = { x: 0, y: 1 }
const SELF_LOOP_OFFSET = 30

/** Distanza fra archi paralleli, e passo di crescita fra cappi concentrici. */
export const BUNDLE_GAP = 14

/** I due estremi di un arco, per chiave: quanto basta a sapere chi collega chi. */
export interface EdgeEnds {
  key: string
  source: string
  target: string
}

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** Chiave della coppia, non orientata: A→B e B→A sono lo stesso fascio. Lo `\u0000` non può stare
 *  in un nome, quindi non confonde `{"a\u0000b"}` con `{"a", "b"}` — la collisione di DT-1. */
const pairKey = (e: EdgeEnds): string =>
  e.source < e.target ? `${e.source}\u0000${e.target}` : `${e.target}\u0000${e.source}`

/**
 * Lo scarto laterale di ciascun arco rispetto agli altri che collegano la **stessa coppia di nodi**.
 * Senza, ogni arco attacca al centro del proprio lato e due relazioni fra le stesse due classi si
 * disegnano una sull'altra, etichette comprese: se ne vede una sola e l'altra non si può nemmeno
 * selezionare.
 *
 * **Un numero per arco, non un anti-sovrapposizione globale.** `routeEdge` vede due `Rect` e nulla
 * più, e la §7 della spec quella conoscenza la tiene fuori di proposito: qui si calcola l'unica cosa
 * che il fascio sa e il routing no, e il routing si limita ad applicarla. Un arco solo nel proprio
 * fascio riceve 0, cioè esattamente la geometria di prima.
 *
 * Un fascio si apre simmetrico attorno all'asse — l'insieme resta centrato dov'era il singolo arco —
 * mentre i cappi crescono verso l'esterno, concentrici: un cappio ha un solo nodo e non ha un lato
 * opposto su cui bilanciarsi.
 *
 * L'ordine è quello di `ends`, cioè quello di inserimento nel modello: stabile fra due render, e
 * stabile fra il canvas e l'export finché entrambi partono dallo stesso modello.
 */
export function edgeOffsets(ends: readonly EdgeEnds[]): Map<string, number> {
  const bundles = new Map<string, EdgeEnds[]>()
  for (const e of ends) {
    const k = pairKey(e)
    const bundle = bundles.get(k)
    if (bundle) bundle.push(e)
    else bundles.set(k, [e])
  }
  const offsets = new Map<string, number>()
  for (const bundle of bundles.values()) {
    for (let i = 0; i < bundle.length; i++) {
      const e = bundle[i]!
      const loop = e.source === e.target
      offsets.set(e.key, (loop ? i : i - (bundle.length - 1) / 2) * BUNDLE_GAP)
    }
  }
  return offsets
}

/**
 * Ricorda l'ultimo risultato finché l'argomento è **lo stesso oggetto**. Serve agli scarti di
 * fascio: `edgeOffsets` è O(archi) e il preview del drag lo chiederebbe una volta per arco a ogni
 * frame, cioè O(archi²) mentre il modello non è cambiato di una virgola.
 *
 * **Misurato, non temuto:** senza memo lo scenario `dragAll` del gate di prestazione (300 entità
 * trascinate insieme) passa da 25,9 a 125,1 ms di p95. Con il memo torna al valore di prima.
 *
 * L'identità basta come chiave perché i modelli arrivano da Immer, che sostituisce l'oggetto a ogni
 * cambiamento e non muta mai sul posto: stesso riferimento significa davvero stesso contenuto.
 * Una voce sola: i chiamanti alternano fra due modelli solo al cambio di documento, e lì un miss
 * costa una scansione.
 */
export function memoOnIdentity<A extends object, R>(compute: (a: A) => R): (a: A) => R {
  let lastArg: A | null = null
  let last: R | null = null
  return (arg) => {
    if (arg !== lastArg || last === null) {
      lastArg = arg
      last = compute(arg)
    }
    return last
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Quanto l'attacco resta lontano dallo spigolo, dove il marker si confonderebbe col profilo del
 *  nodo. Piccolo di proposito: un rientro pari a `BUNDLE_GAP` chiuderebbe la banda utile a zero
 *  proprio sui nodi bassi — un'entità senza attributi è alta quanto il suo solo header — e il
 *  fascio tornerebbe sovrapposto sugli archi orizzontali. Misurato: con rientro 14 due archi fra
 *  due entità vuote uscivano di nuovo identici nell'export. */
const EDGE_INSET = 6

/**
 * Sposta un attacco lungo il proprio lato, senza farlo uscire dal rettangolo: oltre il bordo l'arco
 * partirebbe dal vuoto.
 *
 * **Su un lato più corto del fascio gli attacchi si schiacciano fino a coincidere di nuovo.** È il
 * limite accettato: meglio due archi che ripartono dallo stesso punto e divergono subito dopo, che
 * due archi che partono dal nulla accanto al nodo.
 */
function slide(at: number, min: number, size: number, offset: number): number {
  const inset = Math.min(EDGE_INSET, size / 2)
  return clamp(at + offset, min + inset, min + size - inset)
}

// ponytail: il router non evita gli ostacoli, quindi un arco all'indietro passa sopra i nodi che
// trova. Invisibile in ER e class, dove le contro-frecce sono rare; normale nel flowchart, dove il
// ciclo è il caso comune. Alzarlo significa un router con aggiramento (A* su griglia dei
// rettangoli), non una correzione a questo.
/**
 * Routing ortogonale con al più due pieghe, senza evitamento ostacoli (spec §4.3).
 *
 * **`loop` lo dice il chiamante, non si deduce dai rettangoli.** Prima si riconosceva
 * l'auto-relazione confrontando `a` e `b` per valore: due nodi *diversi* delle stesse dimensioni
 * trascinati sulla stessa cella della griglia — e lo snap rende la cosa facile, non ipotetica —
 * producevano rettangoli identici e l'arco fra loro veniva disegnato come un cappio su uno solo dei
 * due. Se un estremo è lo stesso nodo lo sa il modello, che è il solo posto dove è vero.
 *
 * `offset` è lo scarto del fascio (`edgeOffsets`): 0 è l'arco unico fra due nodi, con l'attacco al
 * centro del lato.
 */
export function routeEdge(a: Rect, b: Rect, loop: boolean, offset = 0): EdgeRoute {
  if (loop) return selfLoop(a, offset)
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const p0 = { x: dx >= 0 ? a.x + a.w : a.x, y: slide(ca.y, a.y, a.h, offset) }
    const p3 = { x: dx >= 0 ? b.x : b.x + b.w, y: slide(cb.y, b.y, b.h, offset) }
    const midX = (p0.x + p3.x) / 2
    const points = p0.y === p3.y ? [p0, p3] : [p0, { x: midX, y: p0.y }, { x: midX, y: p3.y }, p3]
    return { points, sourceDir: dx >= 0 ? RIGHT : LEFT, targetDir: dx >= 0 ? LEFT : RIGHT }
  }
  const p0 = { x: slide(ca.x, a.x, a.w, offset), y: dy >= 0 ? a.y + a.h : a.y }
  const p3 = { x: slide(cb.x, b.x, b.w, offset), y: dy >= 0 ? b.y : b.y + b.h }
  const midY = (p0.y + p3.y) / 2
  const points = p0.x === p3.x ? [p0, p3] : [p0, { x: p0.x, y: midY }, { x: p3.x, y: midY }, p3]
  return { points, sourceDir: dy >= 0 ? DOWN : UP, targetDir: dy >= 0 ? UP : DOWN }
}

/**
 * Il cappio di una relazione su se stessa: esce dal lato destro, gira sopra il nodo e rientra
 * dall'alto.
 *
 * **Gli attacchi sono spostati verso l'angolo in alto a destra, non al centro dei due lati.** Il
 * centro è dove attacca ogni altro arco che tocca il nodo — `routeEdge` qui sopra esce sempre da
 * metà lato — quindi un cappio ancorato lì si sovrapporrebbe esattamente a quell'arco e alla sua
 * punta, e nel class diagram anche alle due etichette dei capi.
 */
function selfLoop(a: Rect, offset: number): EdgeRoute {
  // Cresce l'anello *e* si spostano gli attacchi: con i soli anelli concentrici i due cappi
  // condividerebbero i due punti terminali, e lì stanno marker ed etichette.
  const o = SELF_LOOP_OFFSET + offset
  const right = a.x + a.w
  const y = slide(a.y + a.h / 4, a.y, a.h, -offset)
  const x = slide(a.x + (a.w * 3) / 4, a.x, a.w, offset)
  return {
    points: [{ x: right, y }, { x: right + o, y }, { x: right + o, y: a.y - o }, { x, y: a.y - o }, { x, y: a.y }],
    sourceDir: RIGHT,
    targetDir: UP,
  }
}

export function pathFromPoints(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
}

/**
 * Marker crow's foot. `point` sta sul bordo dell'entità, `dir` è il versore che esce dall'entità lungo l'edge.
 * Distanze lungo l'edge: barra a 12, punta del piede a 16, seconda barra a 20, cerchio a 24.
 */
export function crowsFootPath(point: Point, dir: Dir, cardinality: Cardinality): string {
  const px = -dir.y
  const py = dir.x
  const at = (d: number, s: number): Point => ({ x: point.x + dir.x * d + px * s, y: point.y + dir.y * d + py * s })
  const seg = (a: Point, b: Point): string => `M${a.x} ${a.y} L${b.x} ${b.y}`
  const many = cardinality === "many" || cardinality === "zero-or-many"
  const optional = cardinality.startsWith("zero")
  const parts: string[] = []
  if (many) {
    const tip = at(16, 0)
    for (const s of [-6, 0, 6]) parts.push(seg(tip, at(0, s)))
  } else {
    parts.push(seg(at(12, -6), at(12, 6)))
  }
  if (optional) {
    const c = at(24, 0)
    const r = 4
    parts.push(`M${c.x - r} ${c.y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`)
  } else if (many) {
    parts.push(seg(at(20, -6), at(20, 6)))
  }
  return parts.join(" ")
}

export interface EdgeGeometry {
  d: string
  sourceMarker: string
  targetMarker: string
  /** Punto per l'etichetta: il segmento centrale per ER e classi (`edgeGeometry`,
   *  `classEdgeGeometry`), il primo per il flowchart (`flowEdgeGeometry`) — vedi lì il perché. */
  label: Point
  /** Capi per le molteplicità testuali: solo nei class diagram, l'ER non li popola. */
  sourceEnd?: Point
  targetEnd?: Point
}

/** Tutta la geometria di un edge da due rettangoli e la relazione. Usata sia da React sia dagli aggiornamenti imperativi. */
export function edgeGeometry(source: Rect, target: Rect, rel: Relationship, offset = 0): EdgeGeometry {
  const route = routeEdge(source, target, rel.source.entity === rel.target.entity, offset)
  const pts = route.points
  const mid = Math.floor((pts.length - 1) / 2)
  const a = pts[mid]!
  const b = pts[mid + 1]!
  return {
    d: pathFromPoints(pts),
    sourceMarker: crowsFootPath(pts[0]!, route.sourceDir, rel.source.cardinality),
    targetMarker: crowsFootPath(pts[pts.length - 1]!, route.targetDir, rel.target.cardinality),
    label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  }
}
