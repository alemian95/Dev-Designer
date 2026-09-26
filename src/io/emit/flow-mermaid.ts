import type { FlowModel, FlowShape } from "@/model/flow/schema"
import { splitKey } from "@/model/family"
import type { Note } from "@/model/note/schema"
import type { EmitResult } from "./result"

/**
 * Escape comune a etichette di nodo, di arco e nomi di corsia: le entità sono quelle di Mermaid,
 * stessa scelta e stesso ordine di `noteText` in `class-mermaid.ts` — `&` per primo (altrimenti un
 * `&lt;` letterale scritto dall'utente si confonderebbe con un `<` appena escapato), poi `<`/`>`/`"`,
 * e l'a capo vero per ultimo, così il `<br/>` che produciamo noi non subisce a sua volta l'escape
 * di `<`/`>`. A differenza delle note del class diagram l'a capo qui diventa `<br/>` autochiudente:
 * è la forma che la spec (§10) chiede per il flowchart, non `<br>`.
 *
 * Non scappa `[`, `]`, `{`, `}`: sono le virgolette attorno al testo a proteggerli (spec §10, "il
 * testo va sempre fra virgolette"), non un escape carattere per carattere.
 *
 * `|` invece si scappa come entità (`#124;`), nella stessa lista e nello stesso ordine (dopo `&`,
 * come tutte le altre): il progetto non ha mermaid installato per misurare se il lexer
 * dell'etichetta di un arco (`-->|"…"|`) legge un `|` dentro le virgolette come testo o come il
 * delimitatore che chiude anticipatamente l'etichetta — invece di verificarlo, la domanda si
 * rende superflua: un'entità non contiene mai il carattere delimitatore, quindi l'uscita è valida
 * qualunque cosa faccia quel lexer. Vale anche nel testo di un nodo, dove il `|` non avrebbe
 * bisogno di protezione: una regola sola per tutte le etichette costa meno di un ramo speciale
 * solo per gli archi.
 */
function escapeLabel(text: string): string {
  return text
    .replaceAll("&", "#amp;")
    .replaceAll("<", "#lt;")
    .replaceAll(">", "#gt;")
    .replaceAll('"', "#quot;")
    .replaceAll("|", "#124;")
    .replaceAll("\n", "<br/>")
}

/** Il template Mermaid per ciascuna forma. L'etichetta arriva già scappata da `escapeLabel`. */
const SHAPE_TEMPLATE: Record<FlowShape, (id: string, label: string) => string> = {
  terminal: (id, label) => `${id}(["${label}"])`,
  process: (id, label) => `${id}["${label}"]`,
  decision: (id, label) => `${id}{"${label}"}`,
  io: (id, label) => `${id}[/"${label}"/]`,
  subprocess: (id, label) => `${id}[["${label}"]]`,
}

/** Confronto per code unit UTF-16: lo stesso su ogni macchina, a differenza di `localeCompare`. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Serializza il modello come `flowchart LR` (spec 2b §8): prima i nodi liberi, al livello più alto;
 * poi ogni pool come `subgraph`, con dentro un `subgraph` per corsia.
 *
 * **Ordine e id.** I pool escono per nome e, a parità, per id, confrontati per code unit e non con
 * `localeCompare`, che dipende dal locale della macchina; le corsie nell'ordine del pool; dentro
 * ogni corsia (e fra i liberi) le chiavi dei nodi in ordine alfabetico, lo stesso `sort()` di
 * `class-mermaid.ts` ed `er-mermaid.ts`. L'ordine viene tutto dal modello, mai dalla posizione:
 * lo stesso modello produce sempre lo stesso testo, byte per byte, anche dopo che un pool è stato
 * spostato. Gli id sono `n1..nN` per i nodi, `p1..pN` per i pool e `l1..lN` per le corsie, contate
 * tutte in quell'ordine, anche quelle vuote.
 *
 * Un pool o una corsia senza nodi emettibili non escono: sarebbero un riquadro vuoto.
 */
export function emitFlowMermaid(model: FlowModel, notes: Readonly<Record<string, Note>> = {}): EmitResult {
  const out = ["flowchart LR"]
  const nodeIdByKey = new Map<string, string>()
  let nextNodeId = 1
  let hasSubgraph = false

  /** Le chiavi emettibili di una corsia (o dei liberi, con `null`), in ordine. */
  const emittable = (lane: string | null): string[] =>
    Object.keys(model.nodes).filter((key) => model.nodes[key]!.lane === lane).sort()

  const emitNode = (key: string, indent: string) => {
    const node = model.nodes[key]!
    const nodeId = `n${nextNodeId}`
    nextNodeId += 1
    nodeIdByKey.set(key, nodeId)
    out.push(`${indent}${SHAPE_TEMPLATE[node.shape](nodeId, escapeLabel(node.label))}`)
  }

  for (const key of emittable(null)) emitNode(key, "  ")

  const pools = Object.entries(model.pools).sort(([a, p], [b, q]) => byCodeUnit(p.name, q.name) || byCodeUnit(a, b))
  let laneCount = 0
  pools.forEach(([, pool], poolIndex) => {
    const lanes = pool.lanes.map((lane) => {
      laneCount += 1
      return { id: `l${laneCount}`, name: lane.name, keys: emittable(lane.id) }
    })
    const full = lanes.filter((l) => l.keys.length > 0)
    if (full.length === 0) return
    hasSubgraph = true
    out.push(`  subgraph p${poolIndex + 1}["${escapeLabel(pool.name)}"]`)
    for (const lane of full) {
      out.push(`    subgraph ${lane.id}["${escapeLabel(lane.name)}"]`)
      for (const key of lane.keys) emitNode(key, "      ")
      out.push("    end")
    }
    out.push("  end")
  })

  for (const key of Object.keys(model.edges).sort()) {
    const edge = model.edges[key]!
    const sourceId = nodeIdByKey.get(edge.source)
    const targetId = nodeIdByKey.get(edge.target)
    // Un estremo inesistente lo segnala già `validateFlow` (`flow-dangling-edge`): qui si scarta e basta.
    if (sourceId === undefined || targetId === undefined) continue
    const label = edge.label === "" ? "" : `|"${escapeLabel(edge.label)}"|`
    out.push(`  ${sourceId} -->${label} ${targetId}`)
  }

  const warnings: string[] = []
  if (hasSubgraph) {
    warnings.push(
      "I pool e le corsie sono usciti come riquadri annidati (subgraph): Mermaid non disegna corsie come bande orizzontali vere.",
    )
  }
  const anchored = Object.values(notes).filter((n) => n.anchor !== null && splitKey(n.anchor).family === "flow").length
  if (anchored > 0) {
    warnings.push(
      anchored === 1
        ? "1 nota ancorata al flusso non è uscita: i flowchart di Mermaid non hanno note."
        : `${anchored} note ancorate al flusso non sono uscite: i flowchart di Mermaid non hanno note.`,
    )
  }

  return { text: `${out.join("\n")}\n`, warnings }
}
