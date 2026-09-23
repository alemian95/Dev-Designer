import type { Issue } from "../issue"
import type { FlowModel } from "./schema"

/**
 * Validazione live del modello flowchart. Funzione pura: nessun accesso allo store, nessuna
 * geometria — solo il modello (spec §9). Una sola visita del grafo, O(n+e): le mappe qui sotto
 * si costruiscono con un giro sugli archi e si consumano con un giro sui nodi.
 */
export function validateFlow(model: FlowModel): Issue[] {
  const issues: Issue[] = []
  const { nodes, edges } = model

  // Chiave nodo -> chiavi degli archi uscenti, target compreso anche quando inesistente: l'arità
  // e il "senza uscite" contano gli archi che partono dal nodo, non se arrivano da qualche parte.
  const outgoingEdges = new Map<string, string[]>()
  // Chiave nodo -> chiavi dei nodi raggiunti da un arco valido (source e target esistenti): solo
  // questa alimenta la BFS di raggiungibilità, un arco a vuoto non porta in nessun posto reale.
  const adjacency = new Map<string, string[]>()
  // Chiavi di nodo che sono target di almeno un arco, valido o no: definisce chi non è un ingresso.
  const incomingTargets = new Set<string>()

  for (const [edgeKey, edge] of Object.entries(edges)) {
    const sourceExists = edge.source in nodes
    const targetExists = edge.target in nodes
    if (!sourceExists) {
      issues.push({ code: "flow-dangling-edge", severity: "error", edge: edgeKey, message: `arco "${edgeKey}": nodo "${edge.source}" inesistente` })
    }
    if (!targetExists) {
      issues.push({ code: "flow-dangling-edge", severity: "error", edge: edgeKey, message: `arco "${edgeKey}": nodo "${edge.target}" inesistente` })
    }

    incomingTargets.add(edge.target)

    if (sourceExists) {
      const outgoing = outgoingEdges.get(edge.source) ?? []
      outgoing.push(edgeKey)
      outgoingEdges.set(edge.source, outgoing)

      if (targetExists) {
        const reached = adjacency.get(edge.source) ?? []
        reached.push(edge.target)
        adjacency.set(edge.source, reached)
      }
    }
  }

  for (const [key, node] of Object.entries(nodes)) {
    // La nota non partecipa al flusso (spec §9): non ha arità, non è un vicolo cieco, non è
    // irraggiungibile — è un riquadro di testo, non un passo del processo.
    if (node.shape === "note") continue

    const outgoing = outgoingEdges.get(key) ?? []

    if (node.shape === "decision" && outgoing.length < 2) {
      issues.push({
        code: "flow-decision-arity",
        severity: "error",
        node: key,
        message: `"${node.label}" è una decisione: servono almeno due uscite, ne ha ${outgoing.length}`,
      })
    }

    // Un terminale senza uscite è la fine del flusso, non un vicolo cieco: è l'unico caso escluso.
    if (node.shape !== "terminal" && outgoing.length === 0) {
      issues.push({ code: "flow-dead-end", severity: "warning", node: key, message: `"${node.label}" non ha uscite: il flusso finisce nel nulla` })
    }

    if (node.shape === "decision") {
      for (const edgeKey of outgoing) {
        const edge = edges[edgeKey]
        if (edge && edge.label === "") {
          issues.push({ code: "flow-branch-unlabeled", severity: "warning", edge: edgeKey, message: `il ramo da "${node.label}" non ha un'etichetta` })
        }
      }
    }
  }

  const hasTerminal = Object.values(nodes).some((node) => node.shape === "terminal")
  if (!hasTerminal) {
    issues.push({ code: "flow-no-terminal", severity: "warning", message: "il diagramma non ha nessun nodo terminale" })
  }

  // Gli ingressi sono i terminali senza archi entranti. Senza ingressi la regola tace invece di
  // gridare su ogni nodo: la sua premessa manca, e senza premessa il messaggio giusto è l'altro
  // (flow-no-terminal, quando manca anche un terminale) — stessa lezione di DT-20.
  const entryKeys = Object.entries(nodes)
    .filter(([key, node]) => node.shape === "terminal" && !incomingTargets.has(key))
    .map(([key]) => key)

  if (entryKeys.length > 0) {
    const reached = new Set<string>(entryKeys)
    const queue = [...entryKeys]
    let head = 0
    while (head < queue.length) {
      const current = queue[head]
      head += 1
      if (current === undefined) continue
      for (const next of adjacency.get(current) ?? []) {
        if (reached.has(next)) continue
        reached.add(next)
        queue.push(next)
      }
    }

    for (const [key, node] of Object.entries(nodes)) {
      if (node.shape === "note") continue
      if (!reached.has(key)) {
        issues.push({ code: "flow-unreachable", severity: "warning", node: key, message: `"${node.label}" non è raggiungibile da nessun ingresso` })
      }
    }
  }

  return issues
}
