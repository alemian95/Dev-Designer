import { useStore } from "zustand"
import { selectedKeys, sessionStore } from "@/editor/session-store"
import { useDiagramView } from "@/ui/canvas/kinds/registry"

/**
 * Articolo indeterminativo davanti a un'etichetta, con l'elisione davanti a vocale (`un'entità`,
 * non `una entità`). Le etichette di `tools` sono tutte sostantivi femminili nei due tipi di
 * diagramma di oggi (entità/classe, relazione): se un terzo tipo introducesse un'etichetta
 * maschile, questa funzione andrebbe estesa, non aggirata.
 */
function indeterminateArticle(label: string): string {
  return /^[aeiou]/i.test(label) ? "un'" : "una "
}

/**
 * Cornice, non contenuto: decide *se* c'è qualcosa da mostrare (esattamente un nodo o un arco
 * selezionato) e in tal caso monta `view.Properties`, il corpo specifico del tipo di diagramma
 * corrente. Il caso «niente selezionato» — zero o più selezioni miste — non dipende dal tipo,
 * quindi resta qui, ma la frase sì: «nodo» e «arco» sono il vocabolario di `SelectionKind`, non
 * quello dell'utente.
 *
 * La frase composta (`Seleziona una X o una Y.`) reggeva due strumenti; con la nota come terzo
 * non regge più — comporla per tre voci produrrebbe una lista innaturale in italiano. Si biforca
 * quindi per tipo di diagramma: dove `tools.note` esiste (le classi) la frase è scritta per
 * esteso, dove non esiste (l'ER) resta la composizione a due, con `view.tools.node.label`/
 * `view.tools.edge.label` come già facevano.
 */
export function PropertiesPanel() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const view = useDiagramView()
  const nodes = selectedKeys(selection, "node")
  const edges = selectedKeys(selection, "edge")
  const single = (nodes.length === 1 && edges.length === 0) || (edges.length === 1 && nodes.length === 0)
  if (single) return <view.Properties />
  const nodeLabel = view.tools.node.label.toLowerCase()
  const edgeLabel = view.tools.edge.label.toLowerCase()
  const vuoto = view.tools.note
    ? "Seleziona una classe, una relazione o una nota."
    : `Seleziona ${indeterminateArticle(nodeLabel)}${nodeLabel} o ${indeterminateArticle(edgeLabel)}${edgeLabel}.`
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? vuoto : `${selection.size} elementi selezionati`}
    </p>
  )
}
