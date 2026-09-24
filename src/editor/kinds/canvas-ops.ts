import type { DevDocument } from "@/model/document"
import type { Family } from "@/model/family"
import type { Issue } from "@/model/issue"
import { moveNodes } from "../commands/view"
import type { Recipe } from "../document-store"
import type { EdgeGeometry } from "../edge-routing"
import { documentFamilies, qualify, splitKey } from "../families"
import type { Point, Rect } from "../geometry"
import { familyOps, type EdgeEnds, type EditTarget } from "./ops"

/**
 * Il solo contratto con cui canvas e azioni condivise parlano: gli stessi metodi di `DiagramOps`,
 * ma su **chiavi con prefisso** e su tutte le famiglie del documento. Ogni chiamata va alla famiglia
 * della chiave, e le chiavi che tornano riprendono il prefisso. Le famiglie non vedono mai il
 * prefisso (spec §4).
 */
export interface CanvasOps {
  nodeKeys(): string[]
  rectOf(key: string, at?: Point): Rect | null
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
  addNode(at: Point, family: Family, variant?: string): { key: string; recipe: Recipe; edit: EditTarget }
  /** `null` fra famiglie diverse: i collegamenti fra famiglie arrivano con lo step 4. */
  addEdge(source: string, target: string): { key: string; recipe: Recipe } | null
  /** Una recipe sola per tutta la selezione, anche mista: un passo di annulla. */
  commitDrag(keys: readonly string[], dx: number, dy: number): Recipe | null
  deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
  duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
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
  const families = documentFamilies(doc)
  const ops = (family: Family) => familyOps(doc, family)

  return {
    nodeKeys: () => families.flatMap((f) => ops(f).nodeKeys().map((k) => qualify(f, k))),

    rectOf: (qualified, at) => {
      const { family, key } = splitKey(qualified)
      return ops(family).rectOf(key, at)
    },

    edgesTouching: (keys) =>
      [...byFamily(keys)].flatMap(([f, ks]) =>
        ops(f)
          .edgesTouching(new Set(ks))
          .map((e) => ({ key: qualify(f, e.key), source: qualify(f, e.source), target: qualify(f, e.target) })),
      ),

    edgeGeometry: (qualified, a, b) => {
      const { family, key } = splitKey(qualified)
      return ops(family).edgeGeometry(key, a, b)
    },

    addNode: (at, family, variant) => {
      const created = ops(family).addNode(at, variant)
      return { ...created, key: qualify(family, created.key) }
    },

    addEdge: (source, target) => {
      const a = splitKey(source)
      const b = splitKey(target)
      if (a.family !== b.family) return null
      const created = ops(a.family).addEdge(a.key, b.key)
      return created && { ...created, key: qualify(a.family, created.key) }
    },

    commitDrag: (keys, dx, dy) =>
      combine(
        [...byFamily(keys)].map(([f, ks]) => {
          const o = ops(f)
          return o.commitDrag ? o.commitDrag(ks, dx, dy) : moveNodes(ks, dx, dy)
        }),
      ),

    deleteItems: (nodeKeys, edgeKeys) => {
      const nodes = byFamily(nodeKeys)
      const edges = byFamily(edgeKeys)
      const touched = new Set([...nodes.keys(), ...edges.keys()])
      return combine([...touched].map((f) => ops(f).deleteItems(nodes.get(f) ?? [], edges.get(f) ?? [])))
    },

    duplicateNodes: (keys) => {
      const parts = [...byFamily(keys)].map(([f, ks]) => {
        const dup = ops(f).duplicateNodes(ks)
        return { keys: dup.keys.map((k) => qualify(f, k)), recipe: dup.recipe }
      })
      return { keys: parts.flatMap((p) => p.keys), recipe: combine(parts.map((p) => p.recipe)) ?? NOOP }
    },

    validate: () =>
      families.flatMap((f) =>
        ops(f)
          .validate()
          .map((issue) => ({
            ...issue,
            ...(issue.node !== undefined && { node: qualify(f, issue.node) }),
            ...(issue.edge !== undefined && { edge: qualify(f, issue.edge) }),
          })),
      ),
  }
}
