import { memberLines } from "@/model/class/members"
import type { ClassEnd, ClassNode, ClassNote, ClassRelation, RelationKind } from "@/model/class/schema"
import type { NodeView } from "@/model/shared"
import { pathFromPoints, routeEdge, type Dir, type EdgeGeometry } from "../edge-routing"
import { CHAR_W, GRID, HEADER_H, MIN_W, PAD_X, ROW_H, type Point, type Rect, type Size } from "../geometry"

/** Altezza della riga «stereotipo» dentro l'header, per interface ed enum. */
export const STEREO_H = 16

/** `true` per interface ed enum: hanno una riga ««nome»» dentro l'header. */
export function hasStereotypeLine(node: ClassNode): boolean {
  return node.stereotype === "interface" || node.stereotype === "enum"
}

/** Testo della riga stereotipo, come lo rende UML: `«interface»`. */
function stereotypeText(node: ClassNode): string {
  return `«${node.stereotype}»`
}

export function classSize(node: ClassNode, collapsed: boolean): Size {
  // Due chiamate separate a `memberLines`, una per scomparto — non una sola
  // sull'intera classe. È la stessa scelta di `ClassNodeView`
  // (ui/canvas/ClassNode.tsx): allineano i due punti dentro ciascun
  // compartimento, altrimenti il nome più lungo di un compartimento farebbe
  // slittare la colonna dei due punti anche nell'altro, e la larghezza qui
  // misurata supererebbe quella che il renderer produce davvero.
  const attrLines = collapsed ? [] : memberLines({ attributes: node.attributes, methods: [] })
  const methodLines = collapsed ? [] : memberLines({ attributes: [], methods: node.methods })
  const attrCount = collapsed ? 0 : node.attributes.length
  const methodCount = collapsed ? 0 : node.methods.length
  const stereo = hasStereotypeLine(node)

  const chars = Math.max(
    node.name.length,
    stereo ? stereotypeText(node).length : 0,
    ...attrLines.map((l) => l.length),
    ...methodLines.map((l) => l.length),
  )
  const w = Math.max(MIN_W, Math.ceil((chars * CHAR_W + 2 * PAD_X) / GRID) * GRID)
  const h =
    HEADER_H +
    (stereo ? STEREO_H : 0) +
    attrCount * ROW_H + (attrCount ? 6 : 0) +
    methodCount * ROW_H + (methodCount ? 6 : 0)
  return { w, h }
}

export function classRect(node: ClassNode, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...classSize(node, view.collapsed) }
}

/** Lato del triangolo piegato nell'angolo in alto a destra della nota. */
export const NOTE_FOLD = 12

/** Margine interno verticale della nota, sopra e sotto il blocco di righe. */
const NOTE_PAD_Y = 6

/**
 * Dimensione di una nota, sulla falsariga di `classSize` (§6 del documento madre): larghezza dal
 * carattere più lungo arrotondata alla griglia, altezza dal numero di righe. A differenza di
 * `classSize`, la larghezza aggiunge `NOTE_FOLD`: senza quello spazio la piega dell'angolo
 * morderebbe l'ultimo carattere della riga più lunga. Il minimo è metà di quello di una classe —
 * una nota vuota deve restare cliccabile, non larga quanto una classe.
 */
export function noteSize(note: ClassNote): Size {
  const lines = note.text.split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  const w = Math.max(MIN_W / 2, Math.ceil((chars * CHAR_W + 2 * PAD_X + NOTE_FOLD) / GRID) * GRID)
  return { w, h: lines.length * ROW_H + 2 * NOTE_PAD_Y }
}

export function noteRect(note: ClassNote, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...noteSize(note) }
}

/**
 * I due path della forma UML della nota: `body` è il contorno con l'angolo in alto a destra
 * tagliato, `fold` il triangolino che lo chiude. Due path e non uno perché il triangolo va
 * riempito di un colore diverso dal corpo, e un path solo non può avere due riempimenti.
 */
export function notePath(w: number, h: number): { body: string; fold: string } {
  const f = NOTE_FOLD
  return {
    body: `M0 0 L${w - f} 0 L${w} ${f} L${w} ${h} L0 ${h} Z`,
    fold: `M${w - f} 0 L${w} ${f} L${w - f} ${f} Z`,
  }
}

/** Lunghezza e semi-larghezza del triangolo vuoto (generalizzazione, realizzazione). */
const TRIANGLE_LEN = 14
const TRIANGLE_HALF_W = 6

/** Lunghezza e semi-larghezza del rombo (composizione, aggregazione). */
const DIAMOND_LEN = 16
const DIAMOND_HALF_W = 5

/** Lunghezza e semi-larghezza della freccia aperta (dipendenza). */
const ARROW_LEN = 10
const ARROW_HALF_W = 5

/** Freccia aperta: due segmenti che convergono su `at`. La usano la dipendenza e l'associazione navigabile. */
function openArrowPath(at: Point, dir: Dir): string {
  const px = -dir.y
  const py = dir.x
  const p = (d: number, s: number): Point => ({ x: at.x + dir.x * d + px * s, y: at.y + dir.y * d + py * s })
  return `${pathFromPoints([p(ARROW_LEN, -ARROW_HALF_W), at])} ${pathFromPoints([at, p(ARROW_LEN, ARROW_HALF_W)])}`
}

/**
 * Punta UML sul capo dell'arco. Un solo marker per arco: cade sempre sul
 * target. `at` sta sul bordo del target, `dir` è il versore che ne esce
 * lungo l'edge — stessa convenzione di `crowsFootPath`: l'apice della punta
 * tocca `at` (d=0) e il resto si allunga lungo `dir`, verso il source.
 */
export function umlMarkerPath(at: Point, dir: Dir, kind: RelationKind, navigable = false): string {
  // L'associazione è l'unico tipo il cui marker dipende dal modello e non solo dal `kind`: la
  // navigabilità è un'affermazione che il diagramma fa, non una proprietà della specie di arco.
  if (kind === "association") return navigable ? openArrowPath(at, dir) : ""

  const px = -dir.y
  const py = dir.x
  const p = (d: number, s: number): Point => ({ x: at.x + dir.x * d + px * s, y: at.y + dir.y * d + py * s })

  if (kind === "generalization" || kind === "realization") {
    return `${pathFromPoints([at, p(TRIANGLE_LEN, -TRIANGLE_HALF_W), p(TRIANGLE_LEN, TRIANGLE_HALF_W)])} Z`
  }

  if (kind === "composition" || kind === "aggregation") {
    return `${pathFromPoints([at, p(DIAMOND_LEN / 2, -DIAMOND_HALF_W), p(DIAMOND_LEN, 0), p(DIAMOND_LEN / 2, DIAMOND_HALF_W)])} Z`
  }

  return openArrowPath(at, dir)
}

/** `true` se la linea dell'arco va tratteggiata: realizzazione e dipendenza. */
export function isDashed(kind: RelationKind): boolean {
  return kind === "realization" || kind === "dependency"
}

/** `true` se la punta va riempita: solo la composizione. */
export function isFilled(kind: RelationKind): boolean {
  return kind === "composition"
}

/**
 * Distanza lungo l'edge a cui piazzare l'etichetta di un capo, sullo stesso lato del marker.
 * Deve superare il marker più lungo — il rombo, `DIAMOND_LEN` — il cui apice tocca il bordo del
 * nodo: a 14 l'etichetta del target cadeva dentro il rombo e ne usciva mangiata.
 */
const END_LABEL_OFFSET = DIAMOND_LEN + 8

/** Stacco fra l'etichetta di un capo e la linea dell'arco. */
const END_LABEL_GAP = 5

/** `fontSize` delle etichette dei capi in `ClassEdgeView`, e larghezza del suo carattere: il font
 *  è monospace con avanzamento 0,6 em, la stessa assunzione di `CHAR_W` (`editor/geometry.ts`). */
const END_LABEL_FONT = 11
const END_LABEL_CHAR_W = END_LABEL_FONT * 0.6

/**
 * Testo dell'etichetta di un capo: molteplicità e ruolo nello stesso testo, separati da uno
 * spazio, e ciascuna delle due metà può mancare.
 *
 * **Una sola etichetta per capo e non due.** La collocazione UML rigorosa mette il ruolo
 * sull'altro lato della linea rispetto alla molteplicità, ma due etichette per capo vorrebbero
 * due punti in più in `EdgeGeometry` e due `querySelector` per arco su ogni frame del drag — il
 * costo che la §7 della spec mette per iscritto come cosa da non aggiungere alla leggera.
 *
 * Vuota quando il capo non ha né molteplicità né ruolo: `classEdgeGeometry` e `ClassEdgeView` la
 * usano entrambi come condizione, così geometria e render decidono sullo stesso valore.
 */
export function endLabel(end: ClassEnd): string {
  return [end.multiplicity, end.role].filter(Boolean).join(" ")
}

/**
 * Punto a cui ancorare l'etichetta di un capo. `at` sta sul bordo del nodo, `dir` è il versore che
 * ne esce lungo l'edge — stessa convenzione di `umlMarkerPath`.
 *
 * Il testo è centrato sul proprio punto (`textAnchor="middle"` in `ClassEdgeView`), quindi ogni
 * scarto conta una **semilarghezza** oltre al distacco vero: la semilarghezza si calcola e non si
 * indovina, perché il font è monospace. Dove va lo scarto dipende dalla direzione:
 *
 * - arco orizzontale: la semilarghezza va lungo l'arco, altrimenti un'etichetta lunga rientra nel
 *   rettangolo del proprio nodo e ne esce tagliata. Perpendicolarmente il testo scende **sotto**
 *   la linea, perché sopra c'è già il nome della relazione (`label.y - 6` in `ClassEdgeView`): su
 *   due nodi vicini le tre etichette condividerebbero la stessa fascia di pixel.
 * - arco verticale: la linea passerebbe in mezzo alle lettere, quindi la semilarghezza va di lato
 *   e lungo l'arco resta il solo `END_LABEL_OFFSET`, che già scavalca il marker.
 */
function endPoint(at: Point, dir: Dir, label: string): Point {
  const half = (label.length * END_LABEL_CHAR_W) / 2
  if (dir.y !== 0) {
    return { x: at.x + END_LABEL_GAP + half, y: at.y + dir.y * END_LABEL_OFFSET }
  }
  // La base del testo va sotto la linea di uno stacco più l'altezza delle maiuscole, altrimenti
  // «sotto la linea» sarebbe la base e le lettere starebbero ancora sopra.
  return { x: at.x + dir.x * (END_LABEL_OFFSET + half), y: at.y + END_LABEL_GAP + END_LABEL_FONT * 0.75 }
}

/**
 * Tutta la geometria di un arco fra classi, da due rettangoli e la relazione — stesso ruolo di
 * `edgeGeometry` in `edge-routing.ts` per l'ER. Un solo chiamante di ciascuno dei due livelli sotto
 * (`routeEdge`, `umlMarkerPath`) non basta: sia il render statico (`ClassEdgeView`) sia l'anteprima
 * del drag (`classOps.edgeGeometry`, via `dom-registry.setEdgeGeometry`) devono disegnare lo stesso
 * arco, quindi la composizione vive qui una volta sola.
 *
 * Un solo marker per arco, e cade sempre sul `target` — contratto di `umlMarkerPath`: il `source`
 * resta nudo. `sourceEnd`/`targetEnd` si calcolano *in coppia*: se almeno un capo ha qualcosa da
 * mostrare (`endLabel`), li popola entrambi, anche quando l'altro è vuoto e quindi
 * `ClassEdgeView` non renderà mai la sua etichetta (rende ciascuna solo se la propria `endLabel`
 * non è vuota). Non è un problema: `setEdgeGeometry`/`positionLabel` (`dom-registry.ts`)
 * aggiornano solo l'elemento che trovano nel DOM e non fanno nulla se manca, quindi il capo senza
 * etichetta non viene mai toccato davvero — il calcolo in più è innocuo, non un bug da evitare.
 */
export function classEdgeGeometry(source: Rect, target: Rect, relation: ClassRelation): EdgeGeometry {
  const route = routeEdge(source, target)
  const pts = route.points
  const mid = Math.floor((pts.length - 1) / 2)
  const p1 = pts[mid]!
  const p2 = pts[mid + 1]!
  const from = pts[0]!
  const to = pts[pts.length - 1]!
  const geo: EdgeGeometry = {
    d: pathFromPoints(pts),
    sourceMarker: "",
    targetMarker: umlMarkerPath(to, route.targetDir, relation.kind, relation.navigable),
    label: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
  }
  const sourceLabel = endLabel(relation.source)
  const targetLabel = endLabel(relation.target)
  if (sourceLabel || targetLabel) {
    geo.sourceEnd = endPoint(from, route.sourceDir, sourceLabel)
    geo.targetEnd = endPoint(to, route.targetDir, targetLabel)
  }
  return geo
}
