import type { FlowModel, FlowShape } from "@/model/flow/schema"
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

/**
 * Il template Mermaid per ciascuna forma. `note` è nella mappa solo per restare `Record<FlowShape,
 * …>` — totale, senza `Exclude` che poi `noUncheckedIndexedAccess` non riesce a far tornare al
 * chiamante come narrowing — ma non viene mai invocata: `emitFlowMermaid` filtra le note prima di
 * arrivare qui (si omettono con avviso, spec §10), quindi il `throw` è morto per costruzione.
 * L'etichetta arriva già scappata da `escapeLabel`.
 */
const SHAPE_TEMPLATE: Record<FlowShape, (id: string, label: string) => string> = {
  terminal: (id, label) => `${id}(["${label}"])`,
  process: (id, label) => `${id}["${label}"]`,
  decision: (id, label) => `${id}{"${label}"}`,
  io: (id, label) => `${id}[/"${label}"/]`,
  subprocess: (id, label) => `${id}[["${label}"]]`,
  note: () => {
    throw new Error("una nota non emette mai un nodo: emitFlowMermaid la esclude prima di arrivare qui")
  },
}

/**
 * Serializza il modello come `flowchart LR`, una `subgraph` per corsia (spec §10).
 *
 * **Ordine di assegnazione degli id** (nodi `n1..nN`, corsie `l1..lN`): corsia nell'ordine di
 * `model.lanes` — già un array ordinato, è l'informazione stessa (schema.ts) — e dentro ciascuna
 * corsia le chiavi dei nodi in ordine alfabetico, lo stesso `Object.keys(...).sort()` usato in
 * `class-mermaid.ts` ed `er-mermaid.ts`. Questo ordine non dipende dall'ordine di inserimento delle
 * proprietà dell'oggetto `nodes` — che un giro per `JSON.parse`/store non garantisce identico — né
 * da quale corsia contenga quale nodo oltre a quanto il modello stesso dichiara: lo stesso modello
 * produce sempre lo stesso testo, byte per byte.
 *
 * Le note sono escluse dalla numerazione: non emettono mai un nodo, quindi non consumano un id, e
 * non lasciano un buco nella sequenza `n1..nN` che segue.
 */
export function emitFlowMermaid(model: FlowModel): EmitResult {
  const out = ["flowchart LR"]
  const nodeIdByKey = new Map<string, string>()
  let nextNodeId = 1
  let noteCount = 0
  let hasSubgraph = false
  let noteEdgeCount = 0

  model.lanes.forEach((lane, laneIndex) => {
    const keysInLane = Object.keys(model.nodes)
      .filter((key) => model.nodes[key]!.lane === lane.id)
      .sort()

    const emittableKeys: string[] = []
    for (const key of keysInLane) {
      if (model.nodes[key]!.shape === "note") {
        noteCount += 1
      } else {
        emittableKeys.push(key)
      }
    }

    // Una corsia senza nodi visibili non emette una subgraph vuota: un modello senza nodi resta
    // il solo `flowchart LR`, senza corsie a fare da rumore né l'avviso che le accompagna — è la
    // lettura di "modello vuoto" della tabella del brief, che altrimenti contraddirebbe "almeno una
    // subgraph produce sempre un avviso".
    if (emittableKeys.length === 0) return

    hasSubgraph = true
    const laneId = `l${laneIndex + 1}`
    out.push(`  subgraph ${laneId}["${escapeLabel(lane.name)}"]`)
    for (const key of emittableKeys) {
      const node = model.nodes[key]!
      const nodeId = `n${nextNodeId}`
      nextNodeId += 1
      nodeIdByKey.set(key, nodeId)
      out.push(`    ${SHAPE_TEMPLATE[node.shape](nodeId, escapeLabel(node.label))}`)
    }
    out.push("  end")
  })

  for (const key of Object.keys(model.edges).sort()) {
    const edge = model.edges[key]!
    const sourceId = nodeIdByKey.get(edge.source)
    const targetId = nodeIdByKey.get(edge.target)
    if (sourceId === undefined || targetId === undefined) {
      // Una nota è comunque un nodo di `model.nodes` — `validateFlow` non la tratta come un
      // estremo assente, quindi `flow-dangling-edge` non scatta e il pannello problemi tace.
      // L'unico posto che sa che l'arco è sparito è qui: si conta, per l'avviso aggregato sotto.
      // Un estremo davvero inesistente (chiave che non è in `model.nodes` per niente) è invece
      // un invariante rotto che `validateFlow` segnala già come `flow-dangling-edge` — qui non
      // aggiunge un secondo conteggio, si scarta e basta.
      const sourceIsNote = model.nodes[edge.source]?.shape === "note"
      const targetIsNote = model.nodes[edge.target]?.shape === "note"
      if (sourceIsNote || targetIsNote) noteEdgeCount += 1
      continue
    }
    const label = edge.label === "" ? "" : `|"${escapeLabel(edge.label)}"|`
    out.push(`  ${sourceId} -->${label} ${targetId}`)
  }

  const warnings: string[] = []
  if (hasSubgraph) {
    warnings.push(
      "Le corsie sono uscite come riquadri (subgraph): Mermaid non disegna corsie come bande orizzontali vere, solo come contenitori annidati.",
    )
  }
  if (noteCount > 0) {
    warnings.push(
      `${noteCount} note non sono uscite: in Mermaid entrerebbero nel flusso come nodi qualunque e ne sposterebbero il layout.`,
    )
  }
  if (noteEdgeCount > 0) {
    warnings.push(
      `${noteEdgeCount} archi non sono usciti perché toccano una nota: una nota non è un nodo del flusso in Mermaid.`,
    )
  }

  return { text: `${out.join("\n")}\n`, warnings }
}
