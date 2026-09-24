import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { splitKey } from "@/editor/families"
import { familyHasContent } from "@/editor/kinds/canvas-ops"
import { selectedKeys, sessionStore } from "@/editor/session-store"
import { viewFor } from "@/ui/canvas/kinds/registry"
import { FlowLanesPanel } from "./FlowProperties"

/**
 * Cornice, non contenuto: decide *se* c'è qualcosa da mostrare (esattamente un nodo o un arco
 * selezionato) e in tal caso monta il `Properties` della famiglia di quell'elemento, letta dal
 * prefisso della sua chiave. Il caso «niente selezionato» — zero o più selezioni miste — non
 * dipende dal tipo, quindi resta qui, con una frase unica: da quando gli strumenti sono per famiglia (Task 2) e
 * «Collega» è comune a tutte, non c'è più un'etichetta di nodo/arco singola da comporre per tipo.
 *
 * **Selezione vuota**: la frase generica c'è sempre (spec §10), e se il flusso ha almeno un nodo
 * sotto di lei compare anche il pannello delle corsie (`FlowLanesPanel`, spec §11), nello stesso
 * ordine in cui compaiono le bande sul canvas (`LanesLayer`): le corsie esistono sempre nel
 * modello, ma si vedono solo quando c'è un nodo di flusso. Una selezione **multipla** non monta
 * mai le corsie: resta sulla sola frase generica, come oggi.
 */
export function PropertiesPanel() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const hasFlowNodes = useStore(documentStore, (s) => familyHasContent(s.doc, "flow"))
  const nodes = selectedKeys(selection, "node")
  const edges = selectedKeys(selection, "edge")
  const single = (nodes.length === 1 && edges.length === 0) || (edges.length === 1 && nodes.length === 0)
  if (single) {
    const { family } = splitKey((nodes[0] ?? edges[0])!)
    const { Properties } = viewFor(family)
    return <Properties />
  }
  return (
    <>
      <p className="p-3 text-sm text-muted-foreground">
        {selection.size === 0 ? "Seleziona un elemento sul canvas." : `${selection.size} elementi selezionati`}
      </p>
      {selection.size === 0 && hasFlowNodes && <FlowLanesPanel />}
    </>
  )
}
