import { useStore } from "zustand"
import { fitToContent } from "@/editor/actions"
import { applyLayout, layoutGraph } from "@/editor/commands/layout"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { layoutEngine } from "@/io/app-io"
import { documentSession } from "@/io/document-session"

/**
 * Dispone il diagramma: grafo → worker → una sola dispatch → vista adattata.
 *
 * Un fallimento del worker non tocca il documento: o arrivano le posizioni o non se ne applica
 * nessuna, perché un layout a metà è peggio di quello di prima. L'avviso passa dalla barra che
 * esiste già.
 */
export async function autoLayout(): Promise<void> {
  const session = documentSession.getState()
  if (session.layingOut || session.readOnly) return
  const graph = layoutGraph(erDiagram(documentStore.getState().doc))
  // Con meno di due nodi non c'è niente da disporre, e il pulsante è già disabilitato: questa è la
  // guardia per la scorciatoia da tastiera, che non ha uno stato disabilitato.
  if (graph.nodes.length < 2) return

  documentSession.getState().patch({ layingOut: true })
  try {
    const positions = await layoutEngine.layout(graph.nodes, graph.edges)
    documentStore.getState().dispatch(applyLayout(positions))
    // Anche se il layout non ha cambiato niente: la vista si adatta comunque, ed è ciò che
    // l'utente ha chiesto premendo il pulsante.
    fitToContent()
  } catch {
    documentSession.getState().patch({ notice: "Non è stato possibile disporre il diagramma." })
  } finally {
    documentSession.getState().patch({ layingOut: false })
  }
}

/** Vero quando c'è qualcosa da disporre e nessun layout in corso. Serve al pulsante. */
export function useCanAutoLayout(): boolean {
  // I selettori restituiscono booleani, non il documento: così il pulsante non si ridisegna a ogni
  // modifica del diagramma, ma solo quando la risposta cambia.
  const hasEnoughNodes = useStore(documentStore, (s) => Object.keys(erDiagram(s.doc).view.nodes).length > 1)
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const layingOut = useStore(documentSession, (s) => s.layingOut)
  return hasEnoughNodes && !readOnly && !layingOut
}
