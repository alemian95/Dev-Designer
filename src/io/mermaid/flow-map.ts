import type { ParseWarning } from "@/io/ddl/schema"
import type { FlowEdge, FlowModel, FlowNode, FlowShape, Lane, Pool } from "@/model/flow/schema"
import { aggregate, type Finding } from "./common"
import type { FlowAst, FlowAstNode, FlowAstSubgraph, FlowAstText } from "./flow-parse"

/**
 * Un flowchart letto da Mermaid, con le chiavi del testo: id dei nodi e dei subgraph, indici per gli
 * archi. Il comando di import le sostituisce con uuid (spec §5): qui servono solo a tenere insieme i
 * pezzi. La corsia implicita di un pool ha l'id del pool.
 */
export interface FlowFragment {
  model: FlowModel
  warnings: ParseWarning[]
}

type FlowMapCategory = "shape" | "lineStyle" | "head" | "deep" | "twice" | "subgraphEdge" | "markdown"

const MESSAGES: Record<FlowMapCategory, string> = {
  shape: "Forme senza equivalente, lette come processo",
  lineStyle: "Stile di linea perso (tratteggiata, spessa): l'arco è una linea continua",
  head: "Archi senza freccia, con cerchio, croce o due teste, letti come una freccia nel verso scritto",
  deep: "Subgraph oltre il secondo livello: i nodi vanno nella corsia antenata",
  twice: "Nodi in più subgraph: restano nel primo",
  subgraphEdge: "Archi da o verso un subgraph scartati",
  markdown: "Stringhe markdown lette come testo semplice",
}

/**
 * Il tipo di nodo di `flowDb` sulle cinque forme (spec §4.3, §11). Le forme fra parentesi hanno il
 * nome interno del lexer (`square`, `round`, `lean_right`…); i nomi di `@{ shape: … }` sono quelli
 * di `shapesDefs` in `mermaid@12.2.0` (`shortName` e `aliases`), presi per le cinque figure che il
 * modello sa disegnare. Ogni altro nome è un processo, con avviso.
 */
const SHAPES: Readonly<Record<string, FlowShape>> = Object.fromEntries(
  ([
    ["process", ["square", "rect", "proc", "process", "rectangle"]],
    ["terminal", ["round", "stadium", "circle", "doublecircle", "rounded", "event", "terminal", "pill", "circ", "dbl-circ", "double-circle"]],
    ["decision", ["diamond", "diam", "decision", "question"]],
    ["io", ["lean_right", "lean_left", "lean-r", "lean-right", "in-out", "lean-l", "lean-left", "out-in"]],
    ["subprocess", ["subroutine", "fr-rect", "subprocess", "subproc", "framed-rectangle"]],
  ] as const).flatMap(([shape, names]) => names.map((n) => [n, shape])),
)

/**
 * Applica all'AST le regole della spec §4.3 e restituisce un frammento di `FlowModel`. Non vede il
 * documento: chiavi nuove e posizioni le decide il comando di import. `text` serve solo a dire le
 * righe negli avvisi.
 */
export function mapFlow(ast: FlowAst, text: string): FlowFragment {
  const findings: Finding<FlowMapCategory>[] = []
  const label = (t: FlowAstText, at: number): string => {
    if (t.markdown) findings.push({ category: "markdown", at })
    return t.text
  }

  // Un id ripetuto è lo stesso subgraph: vale la prima chiusura, come in `flowDb`.
  const subgraphs = new Map<string, FlowAstSubgraph>()
  for (const sg of ast.subgraphs) if (!subgraphs.has(sg.id)) subgraphs.set(sg.id, sg)
  const chain = (id: string): string[] => {
    const out = [id]
    for (let p = subgraphs.get(id)!.parent; p !== null; p = subgraphs.get(p)!.parent) out.unshift(p)
    return out
  }

  // Ultima forma ed etichetta date vincono, come in `flowDb.addVertex`.
  // Senza prototipo: gli id vengono dal testo, e «constructor» o «__proto__» sono id validi.
  const nodes: Record<string, FlowNode> = Object.create(null)
  const shapeOf = new Map<string, { shape: string; at: number }>()
  for (const m of ast.nodes) {
    if (subgraphs.has(m.id)) continue
    const node = (nodes[m.id] ??= { label: m.id, shape: "process", lane: null })
    if (m.text !== null) node.label = label(m.text, m.at)
    if (m.shape !== null) shapeOf.set(m.id, { shape: m.shape, at: m.at })
  }
  for (const [id, { shape, at }] of shapeOf) {
    const known = Object.hasOwn(SHAPES, shape) ? SHAPES[shape] : undefined
    if (known === undefined) findings.push({ category: "shape", at, subject: `${id} (${shape})` })
    nodes[id]!.shape = known ?? "process"
  }

  // Un nodo va nel subgraph che si chiude per primo fra quelli che lo nominano (`makeUniq` di `flowDb`).
  const owner = new Map<string, string>()
  const bySubgraph = new Map<string, FlowAstNode[]>()
  for (const m of ast.nodes) {
    if (m.subgraph === null || !(m.id in nodes)) continue
    if (!bySubgraph.has(m.subgraph)) bySubgraph.set(m.subgraph, [])
    bySubgraph.get(m.subgraph)!.push(m)
  }
  for (const id of subgraphs.keys()) {
    for (const m of bySubgraph.get(id) ?? []) {
      const first = owner.get(m.id)
      if (first === undefined) owner.set(m.id, id)
      else if (!chain(id).includes(first) && !chain(first).includes(id)) findings.push({ category: "twice", at: m.at, subject: m.id })
    }
  }

  const pools: Record<string, Pool> = Object.create(null)
  const roots = [...subgraphs.values()].filter((sg) => sg.parent === null).sort((a, b) => a.at - b.at)
  const name = (sg: FlowAstSubgraph) => (sg.title === null ? sg.id : label(sg.title, sg.at))
  const owners = new Set(owner.values())
  for (const root of roots) {
    const children = [...subgraphs.values()].filter((sg) => sg.parent === root.id).sort((a, b) => a.at - b.at)
    const direct = owners.has(root.id)
    const lanes: Lane[] = children.map((c) => ({ id: c.id, name: name(c) }))
    if (direct || lanes.length === 0) lanes.unshift({ id: root.id, name: name(root) })
    pools[root.id] = { name: name(root), lanes }
  }
  for (const [id, sg] of owner) {
    const path = chain(sg)
    if (path.length > 2) findings.push({ category: "deep", at: subgraphs.get(sg)!.at, subject: id })
    nodes[id]!.lane = path[Math.min(1, path.length - 1)]!
  }

  const edges: Record<string, FlowEdge> = {}
  for (const e of ast.edges) {
    if (e.stroke === "invisible") continue
    if (subgraphs.has(e.source) || subgraphs.has(e.target)) {
      findings.push({ category: "subgraphEdge", at: e.at, subject: `${e.source} → ${e.target}` })
      continue
    }
    if (e.stroke !== "normal") findings.push({ category: "lineStyle", at: e.at })
    if (e.head !== "point" || e.double) findings.push({ category: "head", at: e.at })
    edges[String(Object.keys(edges).length)] = { source: e.source, target: e.target, label: e.label === null ? "" : label(e.label, e.at) }
  }

  return { model: { pools, nodes, edges }, warnings: aggregate(findings, text, MESSAGES) }
}
