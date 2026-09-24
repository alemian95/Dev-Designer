import { useStore } from "zustand"
import { fitToContent } from "@/editor/actions"
import { applyLayout } from "@/editor/commands/view"
import { documentStore } from "@/editor/document-store"
import { canvasOps, familyHasContent } from "@/editor/kinds/canvas-ops"
import { familyOps } from "@/editor/kinds/ops"
import { FAMILIES } from "@/model/family"
import { layoutEngine } from "@/io/app-io"
import { documentSession } from "@/io/document-session"

/**
 * Dispone il diagramma: grafo → worker → una sola dispatch → vista adattata.
 *
 * Un fallimento del worker non tocca il documento: o arrivano le posizioni o non se ne applica
 * nessuna, perché un layout a metà è peggio di quello di prima. L'avviso passa dalla barra che
 * esiste già.
 *
 * Dispone una famiglia sola, la prima che ha contenuto: soluzione di transizione, il Task 6 la
 * sostituisce con il layout per blocchi di tutte le famiglie.
 */
export async function autoLayout(): Promise<void> {
  const session = documentSession.getState()
  if (session.layingOut || session.readOnly) return
  const family = FAMILIES.find((f) => familyHasContent(documentStore.getState().doc, f))
  if (!family) return
  const graph = familyOps(documentStore.getState().doc, family).layoutGraph()
  // Con meno di due nodi non c'è niente da disporre, e il pulsante è già disabilitato: questa è la
  // guardia per la scorciatoia da tastiera, che non ha uno stato disabilitato.
  if (graph.nodes.length < 2) return

  documentSession.getState().patch({ layingOut: true })
  try {
    const positions = await layoutEngine.layout(graph)
    const ops = familyOps(documentStore.getState().doc, family)
    documentStore.getState().dispatch(ops.layoutRecipe ? ops.layoutRecipe(positions) : applyLayout(family, positions))
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
  const hasEnoughNodes = useStore(documentStore, (s) => canvasOps(s.doc).nodeKeys().length > 1)
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const layingOut = useStore(documentSession, (s) => s.layingOut)
  return hasEnoughNodes && !readOnly && !layingOut
}
