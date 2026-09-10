import { useStore } from "zustand"
import { selectedKeys, sessionStore } from "@/editor/session-store"
import { useDiagramView } from "@/ui/canvas/kinds/registry"

/**
 * Cornice, non contenuto: decide *se* c'è qualcosa da mostrare (esattamente un nodo o un arco
 * selezionato) e in tal caso monta `view.Properties`, il corpo specifico del tipo di diagramma
 * corrente. Il caso «niente selezionato» — zero o più selezioni miste — non dipende dal tipo,
 * quindi resta qui.
 */
export function PropertiesPanel() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const view = useDiagramView()
  const nodes = selectedKeys(selection, "node")
  const edges = selectedKeys(selection, "edge")
  const single = (nodes.length === 1 && edges.length === 0) || (edges.length === 1 && nodes.length === 0)
  if (single) return <view.Properties />
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? "Seleziona un nodo o un arco." : `${selection.size} elementi selezionati`}
    </p>
  )
}
