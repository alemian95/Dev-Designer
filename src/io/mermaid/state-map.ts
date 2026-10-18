import type { FlowEdge, FlowNode, Lane, Pool } from "@/model/flow/schema"
import { aggregate, type Finding } from "./common"
import type { FlowFragment } from "./flow-map"
import type { StateAst, StateAstComposite, StateAstEnd, StateAstPlace } from "./state-parse"

type StateMapCategory = "forkJoin" | "deep" | "compositeEdge" | "regionMerged" | "floatingNote"

const MESSAGES: Record<StateMapCategory, string> = {
  forkJoin: "Fork e join letti come processo",
  deep: "Stati composti oltre il secondo livello: gli stati vanno nella corsia antenata",
  compositeEdge: "Transizioni verso o da uno stato composto senza inizio o fine interni, scartate",
  regionMerged: "Regioni concorrenti dentro un composto di secondo livello, fuse nella sua corsia",
  floatingNote: "Note flottanti scartate",
}

/**
 * Traduce lo `StateAst` in un frammento di `FlowModel` (spec §5): un composto di primo livello è un pool,
 * i suoi figli sono corsie, come i subgraph in `mapFlow`. Le note arrivano dopo. Chiavi come in
 * `getData()` di Mermaid: id dello stato, `<composto>_start`/`_end` (`root_` alla radice), indice per
 * gli archi; la corsia implicita ha l'id del pool, quella di una regione `<pool>#<n>`.
 */
export function mapState(ast: StateAst, text: string): FlowFragment {
  const findings: Finding<StateMapCategory>[] = []

  // Un id ripetuto è lo stesso composto: vale la prima apertura, il cui genitore è aperto prima di lei.
  const composites = new Map<string, StateAstComposite>()
  for (const c of ast.composites) if (!composites.has(c.id)) composites.set(c.id, c)
  const chain = (id: string): string[] => {
    const out = [id]
    for (let p = composites.get(id)!.container; p !== null; p = composites.get(p)!.container) out.unshift(p)
    return out
  }
  const laneOf = ({ container, region }: StateAstPlace): string | null => {
    if (container === null) return null
    const path = chain(container)
    if (path.length > 1) return path[1]!
    return composites.get(container)!.regions > 1 ? `${container}#${region + 1}` : container
  }

  // Senza prototipo: gli id vengono dal testo. Un composto non è un nodo: le sue menzioni sono il composto.
  const nodes: Record<string, FlowNode> = Object.create(null)
  const descriptions = new Map<string, string[]>()
  // L'ultimo genere dato vale per forma, etichetta e avviso; `at` è la menzione che lo fissa.
  const kinds = new Map<string, { kind: "choice" | "fork" | "join"; at: number }>()
  // L'ultimo composto che cita uno stato lo prende, come `parentId` in `getData()`; la radice no.
  const places = new Map<string, StateAstPlace>()
  for (const m of ast.mentions) {
    if (composites.has(m.id)) continue
    nodes[m.id] ??= { label: m.id, shape: "process", lane: null }
    if (m.container !== null) places.set(m.id, m)
    if (m.description !== null) {
      const lines = descriptions.get(m.id) ?? []
      lines.push(m.description)
      descriptions.set(m.id, lines)
    }
    if (m.kind !== null) kinds.set(m.id, { kind: m.kind, at: m.at })
  }
  for (const [id, node] of Object.entries(nodes)) {
    const lines = descriptions.get(id)
    if (lines) node.label = lines.join("\n")
    const given = kinds.get(id)
    if (!given) continue
    if (given.kind === "choice") {
      node.shape = "decision"
      if (!lines) node.label = ""
    } else findings.push({ category: "forkJoin", at: given.at, subject: id })
  }
  for (const [id, place] of places) {
    if (chain(place.container!).length > 2) findings.push({ category: "deep", at: composites.get(place.container!)!.at, subject: id })
    nodes[id]!.lane = laneOf(place)
  }

  // Un «Inizio» e una «Fine» per livello, nella corsia del primo `[*]` che li usa.
  const terminal = (place: StateAstPlace, which: "start" | "end"): string => {
    const id = `${place.container ?? "root"}_${which}`
    nodes[id] ??= { label: which === "start" ? "Inizio" : "Fine", shape: "terminal", lane: laneOf(place) }
    return id
  }
  for (const t of ast.transitions) {
    if (t.source === null) terminal(t, "start")
    if (t.target === null) terminal(t, "end")
  }
  /** Lo stato, il terminale del livello per `[*]`, o il terminale interno di un composto: `undefined` se manca. */
  const key = (end: StateAstEnd, place: StateAstPlace, own: "start" | "end", inner: "start" | "end"): string | undefined => {
    if (end === null) return terminal(place, own)
    if (!composites.has(end)) return end
    const id = `${end}_${inner}`
    return id in nodes ? id : undefined
  }
  const edges: Record<string, FlowEdge> = {}
  ast.transitions.forEach((t, i) => {
    const source = key(t.source, t, "start", "end")
    const target = key(t.target, t, "end", "start")
    if (source === undefined || target === undefined) {
      findings.push({ category: "compositeEdge", at: t.at, subject: `${t.source ?? "[*]"} → ${t.target ?? "[*]"}` })
      return
    }
    edges[String(i)] = { source, target, label: t.label }
  })

  const pools: Record<string, Pool> = Object.create(null)
  const name = (c: StateAstComposite): string => c.alias ?? c.id
  const used = new Set(Object.values(nodes).map((n) => n.lane))
  const all = [...composites.values()]
  for (const c of all) if (c.regions > 1 && c.container !== null && chain(c.id).length === 2) findings.push({ category: "regionMerged", at: c.at, subject: c.id })
  for (const root of all.filter((c) => c.container === null)) {
    const children = all.filter((c) => c.container === root.id)
    const lane = (c: StateAstComposite): Lane => ({ id: c.id, name: name(c) })
    let lanes: Lane[]
    if (root.regions > 1) {
      lanes = Array.from({ length: root.regions }, (_, n) => [{ id: `${root.id}#${n + 1}`, name: `Regione ${n + 1}` }, ...children.filter((c) => c.region === n).map(lane)]).flat()
    } else {
      lanes = children.map(lane)
      if (used.has(root.id) || lanes.length === 0) lanes.unshift({ id: root.id, name: name(root) })
    }
    pools[root.id] = { name: name(root), lanes }
  }

  return { model: { pools, nodes, edges }, warnings: aggregate(findings, text, MESSAGES) }
}
