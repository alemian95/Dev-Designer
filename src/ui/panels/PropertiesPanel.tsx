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
 * La frase composta (`Seleziona una X o una Y.`) reggeva due strumenti; con la nota come variante
 * in più non regge più — comporla per tre voci produrrebbe una lista innaturale in italiano. Si
 * biforca quindi per tipo di diagramma: dove una variante "note" esiste in `tools` (le classi) la
 * frase è scritta per esteso, altrove (l'ER) resta la composizione a due, con le etichette dello
 * strumento nodo semplice e dello strumento arco cercate in `view.tools`.
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
  const nodeLabel = (view.tools.find((t) => t.tool === "node" && !t.variant)?.label ?? "").toLowerCase()
  const edgeLabel = (view.tools.find((t) => t.tool === "edge")?.label ?? "").toLowerCase()
  const vuoto = view.tools.some((t) => t.variant === "note")
    ? "Seleziona una classe, una relazione o una nota."
    : `Seleziona ${indeterminateArticle(nodeLabel)}${nodeLabel} o ${indeterminateArticle(edgeLabel)}${edgeLabel}.`
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? vuoto : `${selection.size} elementi selezionati`}
    </p>
  )
}
