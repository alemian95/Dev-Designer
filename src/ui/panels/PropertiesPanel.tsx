import { useStore } from "zustand"
import { selectedKeys, sessionStore } from "@/editor/session-store"
import { useDiagramView } from "@/ui/canvas/kinds/registry"

/**
 * Cornice, non contenuto: decide *se* c'è qualcosa da mostrare (esattamente un nodo o un arco
 * selezionato) e in tal caso monta `view.Properties`, il corpo specifico del tipo di diagramma
 * corrente. Il caso «niente selezionato» — zero o più selezioni miste — non dipende dal tipo,
 * quindi resta qui, con una frase unica: da quando gli strumenti sono per famiglia (Task 2) e
 * «Collega» è comune a tutte, non c'è più un'etichetta di nodo/arco singola da comporre per tipo.
 *
 * **Selezione vuota**: di norma è anche lei neutra rispetto al tipo (la stessa frase sopra, con
 * `selection.size === 0`). `view.EmptyProperties`, se dichiarato, la sostituisce — solo il
 * flowchart lo fa, per il pannello delle corsie (spec §11): senza nodo o arco da passare non c'è
 * niente che serva a `Properties`, quindi è un componente a sé. Una selezione **multipla** non
 * lo monta comunque: resta sulla frase generica, come oggi.
 */
export function PropertiesPanel() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const view = useDiagramView()
  const nodes = selectedKeys(selection, "node")
  const edges = selectedKeys(selection, "edge")
  const single = (nodes.length === 1 && edges.length === 0) || (edges.length === 1 && nodes.length === 0)
  if (single) return <view.Properties />
  if (selection.size === 0 && view.EmptyProperties) return <view.EmptyProperties />
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? "Seleziona un elemento sul canvas." : `${selection.size} elementi selezionati`}
    </p>
  )
}
