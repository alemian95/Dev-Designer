import { useStore } from "zustand"
import { linkId, splitKey } from "@/editor/families"
import { selectedKeys, sessionStore } from "@/editor/session-store"
import { viewFor } from "@/ui/canvas/kinds/registry"
import { LinkProperties } from "./LinkProperties"

/**
 * Cornice, non contenuto: decide *se* c'è qualcosa da mostrare (esattamente un nodo o un arco
 * selezionato) e in tal caso monta il `Properties` della famiglia di quell'elemento, letta dal
 * prefisso della sua chiave. Il caso «niente selezionato» — zero o più selezioni miste — non
 * dipende dal tipo, quindi resta qui, con una frase unica.
 *
 * Le corsie non hanno più un pannello globale: stanno nel pannello del loro pool, che si apre
 * selezionando il pool (spec 2b §7).
 */
export function PropertiesPanel() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const nodes = selectedKeys(selection, "node")
  const edges = selectedKeys(selection, "edge")
  const single = (nodes.length === 1 && edges.length === 0) || (edges.length === 1 && nodes.length === 0)
  if (single) {
    const key = (nodes[0] ?? edges[0])!
    // Un collegamento non ha famiglia: si riconosce prima di `splitKey`, che lo rifiuterebbe.
    const link = linkId(key)
    if (link !== null) return <LinkProperties key={link} linkId={link} />
    const { Properties } = viewFor(splitKey(key).family)
    return <Properties />
  }
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? "Seleziona un elemento sul canvas." : `${selection.size} elementi selezionati`}
    </p>
  )
}
