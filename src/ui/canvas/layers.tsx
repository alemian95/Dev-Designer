import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { erEdgeOffsets } from "@/editor/er/geometry"
import { EntityNode } from "./EntityNode"
import { RelationshipEdge } from "./RelationshipEdge"

/**
 * `NodesLayer` ed `EdgesLayer` sono già solo il contenitore che itera le chiavi del modello e
 * monta un renderer per ognuna: `erDiagram` resta qui invece di scendere in `EntityNode` /
 * `RelationshipEdge`, perché spostarlo aggiungerebbe una prop a ogni renderer senza eliminare
 * nessuna conoscenza dell'ER — quella conoscenza si sposterebbe, non sparirebbe. Questi due
 * componenti sono esattamente `erView.NodesLayer` / `erView.EdgesLayer` (`kinds/er.tsx`).
 */
export function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(erDiagram(s.doc).model.entities)))
  return (
    <g data-layer="nodes">
      {keys.map((key) => <EntityNode key={key} nodeKey={key} />)}
    </g>
  )
}

/**
 * Gli scarti di fascio si leggono **qui e non in `RelationshipEdge`**: dipendono da tutte le
 * relazioni, e farli calcolare a ciascun arco sarebbe la stessa scansione ripetuta n volte.
 * `erEdgeOffsets` è già memoizzata sull'identità della mappa, che Immer sostituisce solo quando il
 * modello cambia davvero: un drag muove `view.nodes` e non fa ripartire il calcolo, quindi non
 * serve un `useMemo` che ripeta la stessa guardia.
 *
 * Per questo il selettore prende l'oggetto e non più le sole chiavi: gli estremi servono, e le
 * chiavi da sole non li portano. I figli restano `memo` e ricevono un numero, che si confronta per
 * valore.
 */
export function EdgesLayer() {
  const relationships = useStore(documentStore, (s) => erDiagram(s.doc).model.relationships)
  const offsets = erEdgeOffsets(relationships)
  return (
    <g data-layer="edges">
      {Object.keys(relationships).map((key) => <RelationshipEdge key={key} edgeKey={key} offset={offsets.get(key) ?? 0} />)}
    </g>
  )
}
