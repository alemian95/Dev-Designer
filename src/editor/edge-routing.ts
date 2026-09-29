import type { EdgeAnchors } from "@/model/shared"
import type { Cardinality, Relationship } from "@/model/er/schema"
import type { Point } from "./geometry"
import type { EdgePorts } from "./ports"

export interface Dir { x: -1 | 0 | 1; y: -1 | 0 | 1 }
export interface EdgeRoute { points: Point[]; sourceDir: Dir; targetDir: Dir }

export const RIGHT: Dir = { x: 1, y: 0 }
export const LEFT: Dir = { x: -1, y: 0 }
export const UP: Dir = { x: 0, y: -1 }
export const DOWN: Dir = { x: 0, y: 1 }

/** I due estremi di un arco, per chiave, e dove si agganciano: quanto basta a sapere chi collega chi. */
export interface EdgeEnds {
  key: string
  source: string
  target: string
  /** Assente: due capi automatici (`anchorsOf`). */
  anchors?: EdgeAnchors
}

/**
 * Ricorda l'ultimo risultato finché l'argomento è **lo stesso oggetto**. Serve ai porti di tutto il
 * canvas (`canvasPorts`): il fascio è O(archi) e ogni arco li chiede a ogni render, cioè O(archi²)
 * mentre il documento non è cambiato di una virgola.
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

export function pathFromPoints(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
}

/** Lunghezza e semilarghezza della freccia piena: la punta degli archi di flowchart e delle frecce delle forme. */
const FILLED_ARROW_LEN = 10
const FILLED_ARROW_HALF_W = 5

/**
 * Una punta piena con la cima in `at`, che si apre lungo `dir` — il versore che esce dal nodo lungo
 * l'arco, lo stesso di `routePorts` per `sourceDir` e `targetDir`: la cima tocca il bordo del nodo, la
 * base sta sull'arco. Serve a entrambi i capi.
 */
export function filledArrowPath(at: Point, dir: Dir): string {
  const px = -dir.y
  const py = dir.x
  const p = (d: number, s: number): Point => ({ x: at.x + dir.x * d + px * s, y: at.y + dir.y * d + py * s })
  return `${pathFromPoints([at, p(FILLED_ARROW_LEN, -FILLED_ARROW_HALF_W), p(FILLED_ARROW_LEN, FILLED_ARROW_HALF_W)])} Z`
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

/** Tutta la geometria di un edge dai suoi porti e la relazione. Usata sia da React sia dagli aggiornamenti imperativi. */
export function edgeGeometry(ports: EdgePorts, rel: Relationship): EdgeGeometry {
  const route = routePorts(ports)
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

/** Quanto `p` sta davanti a `from` lungo `d`: positivo davanti, negativo dietro. */
const ahead = (p: Point, from: Point, d: Dir): number => (p.x - from.x) * d.x + (p.y - from.y) * d.y

const step = (p: Point, d: Dir, by: number): Point => ({ x: p.x + d.x * by, y: p.y + d.y * by })

/**
 * Toglie i punti doppi e quelli in mezzo a due segmenti allineati e concordi: il percorso resta lo
 * stesso, con meno pieghe. Un'inversione a 180° non si toglie mai: cambierebbe il verso dei tratti.
 */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    const prev = out[out.length - 2]
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))
      && (last.x - prev.x) * (p.x - last.x) + (last.y - prev.y) * (p.y - last.y) > 0) out.pop()
    out.push(p)
  }
  return out
}

// ponytail: il router non evita gli ostacoli, quindi un arco all'indietro passa sopra i nodi che
// trova. Invisibile in ER e class, dove le contro-frecce sono rare; normale nel flowchart, dove il
// ciclo è il caso comune. Alzarlo significa un router con aggiramento (A* su griglia dei
// rettangoli), non una correzione a questo.
/**
 * Il percorso ortogonale fra due porti (spec agganci §5). Il primo segmento esce lungo
 * `source.dir`, l'ultimo entra lungo l'opposto di `target.dir`.
 *
 * - **Si guardano** (direzioni opposte, il bersaglio davanti): la Z di prima degli agganci, o un
 *   segmento solo se sono allineati.
 * - **Perpendicolari**, con l'angolo davanti a entrambi: una L.
 * - **Altrimenti** ogni porto esce di `stub` e i due tratti si uniscono girando attorno: una U con
 *   la stessa direzione, una S con direzioni opposte voltate, un giro con quelle perpendicolari.
 */
export function routePorts({ source, target, stub }: EdgePorts): EdgeRoute {
  const a = source.point
  const b = target.point
  const d0 = source.dir
  const d3 = target.dir
  const h0 = d0.x !== 0
  const h3 = d3.x !== 0
  let points: Point[]
  if (h0 === h3) {
    const facing = d0.x === -d3.x && d0.y === -d3.y && ahead(b, a, d0) > 0
    const same = d0.x === d3.x && d0.y === d3.y
    if (facing) {
      if (h0) {
        const mid = (a.x + b.x) / 2
        points = [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b]
      } else {
        const mid = (a.y + b.y) / 2
        points = [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b]
      }
    } else if (same && (h0 ? a.y === b.y : a.x === b.x)) {
      // Sulla stessa retta la U si ridurrebbe a un andirivieni: si scosta di `stub` di lato.
      const s0 = step(a, d0, stub)
      const s3 = step(b, d3, stub)
      const side: Dir = h0 ? DOWN : RIGHT
      points = [a, s0, step(s0, side, stub), step(s3, side, stub), s3, b]
    } else if (same) {
      if (h0) {
        const x = d0.x > 0 ? Math.max(a.x, b.x) + stub : Math.min(a.x, b.x) - stub
        points = [a, { x, y: a.y }, { x, y: b.y }, b]
      } else {
        const y = d0.y > 0 ? Math.max(a.y, b.y) + stub : Math.min(a.y, b.y) - stub
        points = [a, { x: a.x, y }, { x: b.x, y }, b]
      }
    } else {
      const s0 = step(a, d0, stub)
      const s3 = step(b, d3, stub)
      if (h0) {
        const mid = a.y === b.y ? a.y + stub : (a.y + b.y) / 2
        points = [a, s0, { x: s0.x, y: mid }, { x: s3.x, y: mid }, s3, b]
      } else {
        const mid = a.x === b.x ? a.x + stub : (a.x + b.x) / 2
        points = [a, s0, { x: mid, y: s0.y }, { x: mid, y: s3.y }, s3, b]
      }
    }
  } else {
    const corner = h0 ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
    if (ahead(corner, a, d0) > 0 && ahead(corner, b, d3) > 0) {
      points = [a, corner, b]
    } else {
      let s0 = step(a, d0, stub)
      let s3 = step(b, d3, stub)
      // Se i due tratti cadono sulla stessa retta il giro tornerebbe su se stesso: si allunga un tratto.
      if (h0 ? s0.x === s3.x : s0.y === s3.y) s0 = step(s0, d0, stub)
      if (h0 ? s0.y === s3.y : s0.x === s3.x) s3 = step(s3, d3, stub)
      points = h0 ? [a, s0, { x: s0.x, y: s3.y }, s3, b] : [a, s0, { x: s3.x, y: s0.y }, s3, b]
    }
  }
  return { points: simplify(points), sourceDir: d0, targetDir: d3 }
}
