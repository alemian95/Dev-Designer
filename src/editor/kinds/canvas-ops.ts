import type { DevDocument } from "@/model/document"
import { FAMILIES, inFamily, type Family } from "@/model/family"
import type { Issue } from "@/model/issue"
import { validateLinks } from "@/model/links/validate"
import { AUTO_ANCHORS, anchorsOf, type Anchor, type EdgeAnchors } from "@/model/shared"
import { moveNodes } from "../commands/view"
import type { Recipe } from "../document-store"
import { memoOnIdentity, type EdgeGeometry } from "../edge-routing"
import { linkId, linkKey, qualify, splitKey } from "../families"
import type { Point, Rect } from "../geometry"
import { connectAcross, deleteLinks, linksTouching, setLinkAnchors, type ConnectResult } from "../links/commands"
import { linkGeometry } from "../links/geometry"
import { anchorNote, anchorsTouching, detachAnchoredTo } from "../note/anchor"
import { anchorPort, assignPorts, autoPorts, offeredAnchors, samePorts, type EdgePorts, type Outline } from "../ports"
import { familyOps, type EdgeEnds, type EditTarget } from "./ops"

export type { ConnectResult }

/**
 * Il solo contratto con cui canvas e azioni condivise parlano: gli stessi metodi di `DiagramOps`, ma
 * su **chiavi con prefisso**, su tutte le famiglie del documento e sui collegamenti fra famiglie
 * (chiavi `link/…`, spec 4a §4). Ogni chiamata va alla famiglia della chiave, e le chiavi che tornano
 * riprendono il prefisso. Le famiglie non vedono mai il prefisso (spec §4).
 *
 * Le chiavi `link/…` si riconoscono con `linkId` **prima** di `splitKey`, che le rifiuta.
 */
export interface CanvasOps {
  nodeKeys(): string[]
  /** I frame di tutte le famiglie, con prefisso (i pool, spec 2b §5). */
  frameKeys(): string[]
  /** Vero se la chiave è un frame e non un nodo. */
  isFrame(key: string): boolean
  /** Le chiavi date più i nodi che un drag porta con sé. */
  withFollowers(keys: readonly string[]): string[]
  /** Il motivo per cui lo strumento non crea niente in quel punto, o `null`. */
  refuseNode(at: Point, family: Family, variant?: string): string | null
  rectOf(key: string, at?: Point): Rect | null
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  /** Tutti gli archi del canvas, con prefisso: famiglie, collegamenti, linee delle note. */
  allEdges(): EdgeEnds[]
  /** Il contorno di un nodo per gli agganci. */
  outlineOf(key: string): Outline
  /**
   * I porti degli archi dati con i rettangoli di `rectOf` (spec agganci §4): il fascio per lato su
   * famiglie e collegamenti insieme, `autoPorts` per le linee delle note, che restano fuori.
   * `canvasPorts` lo chiama a riposo, l'anteprima del drag con i rettangoli spostati.
   */
  portsOf(edges: readonly EdgeEnds[], rectOf: (key: string) => Rect | null): Map<string, EdgePorts>
  edgeGeometry(key: string, ports: EdgePorts): EdgeGeometry | null
  /** Vero per un nodo che mostra gli agganci: non un frame, non una nota, non un collegamento (spec §6). */
  hasAnchors(key: string): boolean
  /** Il punto di un aggancio del nodo, per l'anteprima di Collega. `null` se il nodo non c'è. */
  anchorPoint(node: string, anchor: Anchor): Point | null
  /** Gli agganci che il nodo offre, con il loro punto: quelli che il canvas disegna. */
  anchorPoints(node: string): { anchor: Anchor; point: Point }[]
  addNode(at: Point, family: Family, variant?: string): { key: string; recipe: Recipe; edit: EditTarget | null }
  /**
   * Una nota e un altro elemento, in qualunque verso: l'àncora della nota (`anchorNote`), anche verso
   * un pool. Dentro una famiglia: l'arco della famiglia, oppure `null` se i due nodi non si possono
   * collegare. Fra famiglie diverse: un collegamento tipizzato creato, uno già presente da
   * selezionare, oppure un rifiuto con il suo avviso (`connectAcross`). `anchors` sono gli agganci
   * del gesto, scritti nella stessa recipe (le note li ignorano, un collegamento già presente non li
   * cambia).
   */
  addEdge(source: string, target: string, anchors?: EdgeAnchors): ConnectResult | null
  /** Sposta l'aggancio di un capo: `null` torna automatico. `null` se l'arco non c'è, è una linea di nota, o l'aggancio è già quello. */
  setEdgeAnchor(edgeKey: string, end: "source" | "target", anchor: Anchor | null): Recipe | null
  /** Una recipe sola per tutta la selezione, anche mista: un passo di annulla. */
  commitDrag(keys: readonly string[], dx: number, dy: number): Recipe | null
  deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
  duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
  /** Il ridimensionamento di un frame o di una forma, sulla chiave con prefisso (vedi `DiagramOps.resize`). */
  resize(key: string, lane: string | null, dx: number, dy: number): { rect: Rect; recipe: Recipe } | null
  /** Solo le famiglie con contenuto: una famiglia vuota non ha problemi da segnalare. Poi i collegamenti. */
  validate(): Issue[]
}

/** Raggruppa chiavi con prefisso per famiglia, togliendo il prefisso. L'ordine delle chiavi resta quello dato. */
function byFamily(keys: Iterable<string>): Map<Family, string[]> {
  const out = new Map<Family, string[]>()
  for (const qualified of keys) {
    const { family, key } = splitKey(qualified)
    const list = out.get(family)
    if (list) list.push(key)
    else out.set(family, [key])
  }
  return out
}

/** Più recipe di famiglia sullo stesso draft, in sequenza: un solo passo di annulla. `null` se non ce n'è nessuna. */
function combine(recipes: readonly (Recipe | null)[]): Recipe | null {
  const present = recipes.filter((r): r is Recipe => r !== null)
  if (present.length === 0) return null
  return (draft) => {
    for (const recipe of present) recipe(draft)
  }
}

const NOOP: Recipe = () => {}

export function canvasOps(doc: DevDocument): CanvasOps {
  const ops = (family: Family) => familyOps(doc, family)

  const isFrame = (qualified: string): boolean => {
    if (linkId(qualified) !== null) return false
    const { family, key } = splitKey(qualified)
    return ops(family).frameKeys?.().includes(key) ?? false
  }

  /** Una linea di nota: la chiave del suo arco è quella della nota (`anchorsTouching`). */
  const isNoteLine = (qualified: string): boolean => linkId(qualified) === null && inFamily(qualified, "note")

  const outlineOf = (qualified: string): Outline => {
    const { family, key } = splitKey(qualified)
    return ops(family).outlineOf?.(key) ?? "rect"
  }

  const rectOf = (qualified: string, at?: Point): Rect | null => {
    const { family, key } = splitKey(qualified)
    return ops(family).rectOf(key, at)
  }

  const edgesTouching = (keys: ReadonlySet<string>): EdgeEnds[] => [
    ...[...byFamily(keys)].flatMap(([f, ks]) =>
      ops(f)
        .edgesTouching(new Set(ks))
        .map((e) => ({ ...e, key: qualify(f, e.key), source: qualify(f, e.source), target: qualify(f, e.target) })),
    ),
    ...linksTouching(doc.diagram.links, keys).map(([id, l]) => ({ key: linkKey(id), source: l.source, target: l.target, anchors: l.anchors })),
    ...anchorsTouching(doc, keys),
  ]

  const nodeKeys = () => FAMILIES.flatMap((f) => ops(f).nodeKeys().map((k) => qualify(f, k)))
  const frameKeys = () => FAMILIES.flatMap((f) => (ops(f).frameKeys?.() ?? []).map((k) => qualify(f, k)))
  const allEdges = () => edgesTouching(new Set([...nodeKeys(), ...frameKeys()]))

  /** Scrive la coppia di agganci su un arco o un collegamento; `null` per le linee delle note. */
  const writeEdgeAnchors = (qualified: string, anchors: EdgeAnchors): Recipe | null => {
    const id = linkId(qualified)
    if (id !== null) return setLinkAnchors(id, anchors)
    const { family, key } = splitKey(qualified)
    return ops(family).setEdgeAnchors?.(key, anchors) ?? null
  }

  const withAnchors = (key: string, recipe: Recipe, anchors: EdgeAnchors): Recipe =>
    anchors.source === null && anchors.target === null ? recipe : (combine([recipe, writeEdgeAnchors(key, anchors)]) ?? recipe)

  return {
    nodeKeys,

    frameKeys,

    isFrame,

    withFollowers: (keys) =>
      [...byFamily(keys)].flatMap(([f, ks]) => {
        const o = ops(f)
        return (o.withFollowers ? o.withFollowers(ks) : ks).map((k) => qualify(f, k))
      }),

    refuseNode: (at, family, variant) => ops(family).refuseNode?.(at, variant) ?? null,

    rectOf,

    edgesTouching,

    allEdges,

    outlineOf,

    portsOf: (edges, rectAt) => {
      const out = assignPorts(edges.filter((e) => !isNoteLine(e.key)), rectAt, outlineOf)
      for (const e of edges) {
        if (!isNoteLine(e.key)) continue
        const a = rectAt(e.source)
        const b = rectAt(e.target)
        if (a && b) out.set(e.key, autoPorts(a, b))
      }
      return out
    },

    edgeGeometry: (qualified, ports) => {
      const id = linkId(qualified)
      if (id !== null) return doc.diagram.links[id] ? linkGeometry(ports) : null
      const { family, key } = splitKey(qualified)
      return ops(family).edgeGeometry(key, ports)
    },

    hasAnchors: (qualified) => linkId(qualified) === null && !inFamily(qualified, "note") && !isFrame(qualified) && rectOf(qualified) !== null,

    anchorPoint: (node, anchor) => {
      const r = rectOf(node)
      return r ? anchorPort(r, outlineOf(node), anchor).point : null
    },

    anchorPoints: (node) => {
      const r = rectOf(node)
      if (!r) return []
      const outline = outlineOf(node)
      return offeredAnchors(outline).map((anchor) => ({ anchor, point: anchorPort(r, outline, anchor).point }))
    },

    addNode: (at, family, variant) => {
      const created = ops(family).addNode(at, variant)
      return { ...created, key: qualify(family, created.key) }
    },

    addEdge: (source, target, anchors = AUTO_ANCHORS) => {
      // Una nota si ancora a qualunque elemento, pool compresi (spec 3a §5): si riconosce prima
      // della guardia dei frame, che per ogni altro collegamento resta chiusa (spec 2b §2).
      if (splitKey(source).family === "note" || splitKey(target).family === "note") return anchorNote(doc, source, target)
      // Un frame non è un estremo (spec 2b §2): niente arco, niente collegamento, niente avviso.
      if (isFrame(source) || isFrame(target)) return null
      const a = splitKey(source)
      const b = splitKey(target)
      if (a.family !== b.family) return connectAcross(doc, source, target, anchors)
      const created = ops(a.family).addEdge(a.key, b.key)
      if (!created) return null
      const key = qualify(a.family, created.key)
      return { type: "created" as const, key, recipe: withAnchors(key, created.recipe, anchors) }
    },

    setEdgeAnchor: (edgeKey, end, anchor) => {
      if (isNoteLine(edgeKey)) return null
      const edge = allEdges().find((e) => e.key === edgeKey)
      if (!edge) return null
      const current = anchorsOf(edge)
      if (current[end] === anchor) return null
      return writeEdgeAnchors(edgeKey, { ...current, [end]: anchor })
    },

    commitDrag: (keys, dx, dy) =>
      combine(
        [...byFamily(keys)].map(([f, ks]) => {
          const o = ops(f)
          return o.commitDrag ? o.commitDrag(ks, dx, dy) : moveNodes(f, ks, dx, dy)
        }),
      ),

    deleteItems: (nodeKeys, edgeKeys) => {
      // I collegamenti selezionati, e quelli che toccano un nodo eliminato; le note ancorate a un
      // nodo eliminato si staccano: tutto nella stessa recipe delle famiglie, così un solo annulla
      // riporta indietro tutto (spec 4a §4, spec 3a §5).
      const selectedLinks = edgeKeys.flatMap((k) => linkId(k) ?? [])
      const cascade = linksTouching(doc.diagram.links, new Set(nodeKeys)).map(([id]) => id)
      const linkIds = [...new Set([...selectedLinks, ...cascade])]
      const nodes = byFamily(nodeKeys)
      const edges = byFamily(edgeKeys.filter((k) => linkId(k) === null))
      const touched = new Set([...nodes.keys(), ...edges.keys()])
      return combine([
        ...[...touched].map((f) => ops(f).deleteItems(nodes.get(f) ?? [], edges.get(f) ?? [])),
        linkIds.length > 0 ? deleteLinks(linkIds) : null,
        detachAnchoredTo(doc, new Set(nodeKeys)),
      ])
    },

    resize: (qualified, lane, dx, dy) => {
      const { family, key } = splitKey(qualified)
      return ops(family).resize?.(key, lane, dx, dy) ?? null
    },

    duplicateNodes: (keys) => {
      const parts = [...byFamily(keys)].map(([f, ks]) => {
        const dup = ops(f).duplicateNodes(ks)
        return { keys: dup.keys.map((k) => qualify(f, k)), recipe: dup.recipe }
      })
      return { keys: parts.flatMap((p) => p.keys), recipe: combine(parts.map((p) => p.recipe)) ?? NOOP }
    },

    validate: () => [
      // `shape` salta il cancello di `familyHasContent`: le sue frecce possono restare orfane dopo
      // che le forme sono sparite (un file corrotto a mano, o un futuro comando che non fa ancora la
      // cascata), e `shape-dangling-arrow` deve emergere anche a zero forme. Il costo è nullo — senza
      // forme né frecce `validateShapes` non ha niente da dire.
      ...FAMILIES.filter((f) => f === "shape" || familyHasContent(doc, f)).flatMap((f) =>
        ops(f)
          .validate()
          .map((issue) => ({
            ...issue,
            ...(issue.node !== undefined && { node: qualify(f, issue.node) }),
            ...(issue.edge !== undefined && { edge: qualify(f, issue.edge) }),
          })),
      ),
      // `validateLinks` dà l'id senza namespace, e la chiave della classe già con prefisso.
      ...validateLinks(doc).map((issue) => ({ ...issue, ...(issue.edge !== undefined && { edge: linkKey(issue.edge) }) })),
    ],
  }
}

/** La famiglia ha almeno un nodo o un frame (un pool vuoto conta, spec 2b §6). È la sola definizione
 *  di «ha contenuto»: export, menu, documento e Disponi la usano. */
export function familyHasContent(doc: DevDocument, family: Family): boolean {
  const ops = familyOps(doc, family)
  return ops.nodeKeys().length > 0 || (ops.frameKeys?.().length ?? 0) > 0
}

/** I rettangoli di tutti i nodi e i frame del canvas, di ogni famiglia: lo spazio già occupato. */
export function nodeRects(doc: DevDocument): Rect[] {
  const ops = canvasOps(doc)
  return [...ops.nodeKeys(), ...ops.frameKeys()].flatMap((key) => ops.rectOf(key) ?? [])
}

/**
 * I porti di tutti gli archi del canvas a riposo (spec agganci §7): la sola fonte per il canvas,
 * l'export e l'editor d'etichetta. Memo sul documento, che Immer sostituisce a ogni cambiamento.
 *
 * **Riusa l'oggetto dei porti di un arco quando i numeri non cambiano**: ogni arco sul canvas si
 * sottoscrive ai propri porti con un `useStore` per identità, e senza questo ogni battitura in un
 * pannello ridisegnerebbe tutti gli archi.
 */
export const canvasPorts: (doc: DevDocument) => ReadonlyMap<string, EdgePorts> = (() => {
  let previous = new Map<string, EdgePorts>()
  return memoOnIdentity((doc: DevDocument) => {
    const ops = canvasOps(doc)
    const next = ops.portsOf(ops.allEdges(), (key) => ops.rectOf(key))
    for (const [key, ports] of next) {
      const old = previous.get(key)
      if (old && samePorts(old, ports)) next.set(key, old)
    }
    previous = next
    return next
  })
})()
