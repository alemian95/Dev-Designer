import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import type { Rect } from "@/editor/geometry"
import { canvasOps } from "@/editor/kinds/canvas-ops"

/**
 * Il rettangolo di un nodo o di un frame di qualunque famiglia, dalla chiave con prefisso, attraverso
 * lo stesso seam che l'export usa (`canvasOps(doc).rectOf`, `src/editor/kinds/canvas-ops.ts`): lo
 * usano gli archi di ogni famiglia (`ClassEdge`, `FlowEdge`), i collegamenti (`LinkEdge`) e le linee
 * di ancoraggio delle note (`NoteAnchor`). Una copia locale che leggeva solo il modello di una
 * famiglia lasciava irrisolto l'estremo di un ancoraggio o di un collegamento fra famiglie diverse, e
 * l'arco non si montava mai sul canvas dal vivo, anche quando modello ed export (che passano già da
 * `rectOf`) lo disegnavano correttamente. `useShallow` evita comunque un rerender per un riferimento
 * nuovo: `rectOf` costruisce un oggetto piatto (`{x,y,w,h}`, tutti campi primitivi) a ogni chiamata,
 * ma `useShallow` confronta chiave per chiave e non per identità dell'oggetto.
 */
export function useNodeRect(key: string | undefined): Rect | null {
  return useStore(documentStore, useShallow((s) => (key ? canvasOps(s.doc).rectOf(key) : null)))
}
