import type { FlowEdge, FlowNode } from "@/model/flow/schema"
import { aggregate, type Finding } from "./common"
import type { FlowFragment } from "./flow-map"
import type { StateAst, StateAstEnd } from "./state-parse"

type StateMapCategory = "forkJoin" | "deep" | "compositeEdge" | "regionMerged" | "floatingNote"

const MESSAGES: Record<StateMapCategory, string> = {
  forkJoin: "Fork e join letti come processo",
  deep: "Stati composti oltre il secondo livello: gli stati vanno nella corsia antenata",
  compositeEdge: "Transizioni verso o da uno stato composto senza inizio o fine interni, scartate",
  regionMerged: "Regioni concorrenti dentro un composto di secondo livello, fuse nella sua corsia",
  floatingNote: "Note flottanti scartate",
}

const START = "root_start"
const END = "root_end"

/**
 * Traduce lo `StateAst` in un frammento di `FlowModel` (spec §5). Per ora solo la radice: composti e
 * note arrivano dopo. Chiavi come in `mapFlow`: id dello stato, `root_start`/`root_end`, indice per gli archi.
 */
export function mapState(ast: StateAst, text: string): FlowFragment {
  const findings: Finding<StateMapCategory>[] = []

  // Senza prototipo: gli id vengono dal testo.
  const nodes: Record<string, FlowNode> = Object.create(null)
  const descriptions = new Map<string, string[]>()
  // L'ultimo genere dato vale per forma, etichetta e avviso; `at` è la menzione che lo fissa.
  const kinds = new Map<string, { kind: "choice" | "fork" | "join"; at: number }>()
  for (const m of ast.mentions) {
    nodes[m.id] ??= { label: m.id, shape: "process", lane: null }
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

  const key = (end: StateAstEnd, terminal: string): string => {
    if (end === null) nodes[terminal] ??= { label: terminal === START ? "Inizio" : "Fine", shape: "terminal", lane: null }
    return end ?? terminal
  }
  const edges: Record<string, FlowEdge> = {}
  ast.transitions.forEach((t, i) => {
    edges[String(i)] = { source: key(t.source, START), target: key(t.target, END), label: t.label }
  })

  return { model: { pools: Object.create(null), nodes, edges }, warnings: aggregate(findings, text, MESSAGES) }
}
