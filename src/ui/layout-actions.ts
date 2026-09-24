import { useStore } from "zustand"
import { fitToContent } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { canvasOps } from "@/editor/kinds/canvas-ops"
import { layoutAll } from "@/editor/layout-pack"
import { layoutEngine } from "@/io/app-io"
import { documentSession } from "@/io/document-session"

/**
 * Dispone il canvas: un layout per famiglia → blocchi in fila → una sola dispatch → vista adattata.
 *
 * Un fallimento del worker non tocca il documento: o arrivano le posizioni di tutte le famiglie o
 * non se ne applica nessuna, perché un layout a metà è peggio di quello di prima. L'avviso passa
 * dalla barra che esiste già.
 */
export async function autoLayout(): Promise<void> {
  const session = documentSession.getState()
  if (session.layingOut || session.readOnly) return
  // Guardia per la scorciatoia da tastiera, che non ha uno stato disabilitato.
  if (canvasOps(documentStore.getState().doc).nodeKeys().length < 2) return

  documentSession.getState().patch({ layingOut: true })
  try {
    const recipe = await layoutAll(documentStore.getState().doc, (g) => layoutEngine.layout(g))
    if (recipe) documentStore.getState().dispatch(recipe)
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
