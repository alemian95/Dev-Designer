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
  for (const m of ast.mentions) {
    const node = (nodes[m.id] ??= { label: m.id, shape: "process", lane: null })
    if (m.description !== null) descriptions.set(m.id, [...(descriptions.get(m.id) ?? []), m.description])
    if (m.kind === null) continue
    node.shape = m.kind === "choice" ? "decision" : "process"
    if (m.kind !== "choice") findings.push({ category: "forkJoin", at: m.at, subject: m.id })
  }
  for (const [id, lines] of descriptions) nodes[id]!.label = lines.join("\n")
  for (const m of ast.mentions) if (m.kind === "choice" && !descriptions.has(m.id)) nodes[m.id]!.label = ""

  const key = (end: StateAstEnd, terminal: string): string => {
    if (end === null) nodes[terminal] ??= { label: terminal === START ? "Inizio" : "Fine", shape: "terminal", lane: null }
    return end ?? terminal
  }
  const edges: Record<string, FlowEdge> = {}
  for (const t of ast.transitions) {
    edges[String(Object.keys(edges).length)] = { source: key(t.source, START), target: key(t.target, END), label: t.label }
  }

  return { model: { pools: Object.create(null), nodes, edges }, warnings: aggregate(findings, text, MESSAGES) }
}
