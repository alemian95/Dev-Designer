import type { DevDocument } from "@/model/document"
import { FAMILIES, type Family } from "@/model/family"
import type { Issue } from "@/model/issue"
import { validateLinks } from "@/model/links/validate"
import { moveNodes } from "../commands/view"
import type { Recipe } from "../document-store"
import type { EdgeGeometry } from "../edge-routing"
import { linkId, linkKey, qualify, splitKey } from "../families"
import type { Point, Rect } from "../geometry"
import { connectAcross, deleteLinks, linksTouching, type ConnectResult } from "../links/commands"
import { linkGeometry } from "../links/geometry"
import { anchorNote, anchorsTouching, detachAnchoredTo } from "../note/anchor"
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
  edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
  addNode(at: Point, family: Family, variant?: string): { key: string; recipe: Recipe; edit: EditTarget | null }
  /**
   * Una nota e un altro elemento, in qualunque verso: l'àncora della nota (`anchorNote`), anche verso
   * un pool. Dentro una famiglia: l'arco della famiglia, oppure `null` se i due nodi non si possono
   * collegare. Fra famiglie diverse: un collegamento tipizzato creato, uno già presente da
   * selezionare, oppure un rifiuto con il suo avviso (`connectAcross`).
   */
  addEdge(source: string, target: string): ConnectResult | null
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

  return {
    nodeKeys: () => FAMILIES.flatMap((f) => ops(f).nodeKeys().map((k) => qualify(f, k))),

    frameKeys: () => FAMILIES.flatMap((f) => (ops(f).frameKeys?.() ?? []).map((k) => qualify(f, k))),

    isFrame,

    withFollowers: (keys) =>
      [...byFamily(keys)].flatMap(([f, ks]) => {
        const o = ops(f)
        return (o.withFollowers ? o.withFollowers(ks) : ks).map((k) => qualify(f, k))
      }),

    refuseNode: (at, family, variant) => ops(family).refuseNode?.(at, variant) ?? null,

    rectOf: (qualified, at) => {
      const { family, key } = splitKey(qualified)
      return ops(family).rectOf(key, at)
    },

    edgesTouching: (keys) => [
      ...[...byFamily(keys)].flatMap(([f, ks]) =>
        ops(f)
          .edgesTouching(new Set(ks))
          .map((e) => ({ key: qualify(f, e.key), source: qualify(f, e.source), target: qualify(f, e.target) })),
      ),
      ...linksTouching(doc.diagram.links, keys).map(([id, l]) => ({ key: linkKey(id), source: l.source, target: l.target })),
      ...anchorsTouching(doc, keys),
    ],

    edgeGeometry: (qualified, a, b) => {
      const id = linkId(qualified)
      if (id !== null) return doc.diagram.links[id] ? linkGeometry(a, b) : null
      const { family, key } = splitKey(qualified)
      return ops(family).edgeGeometry(key, a, b)
    },

    addNode: (at, family, variant) => {
      const created = ops(family).addNode(at, variant)
      return { ...created, key: qualify(family, created.key) }
    },

    addEdge: (source, target) => {
      // Una nota si ancora a qualunque elemento, pool compresi (spec 3a §5): si riconosce prima
      // della guardia dei frame, che per ogni altro collegamento resta chiusa (spec 2b §2).
      if (splitKey(source).family === "note" || splitKey(target).family === "note") return anchorNote(doc, source, target)
      // Un frame non è un estremo (spec 2b §2): niente arco, niente collegamento, niente avviso.
      if (isFrame(source) || isFrame(target)) return null
      const a = splitKey(source)
      const b = splitKey(target)
      if (a.family !== b.family) return connectAcross(doc, source, target)
      const created = ops(a.family).addEdge(a.key, b.key)
      return created ? { type: "created" as const, key: qualify(a.family, created.key), recipe: created.recipe } : null
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
      ...FAMILIES.filter((f) => familyHasContent(doc, f)).flatMap((f) =>
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
