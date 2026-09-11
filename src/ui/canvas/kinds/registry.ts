import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import type { Rect } from "@/editor/geometry"
import type { Diagram } from "@/model/document"
import type { NodeView as NodeViewModel } from "@/model/shared"
import { classView } from "./class"
import { erView } from "./er"

/**
 * Formati emessi dall'export testo. `class-mermaid` è dichiarato già qui perché il Task 14
 * userà questa stessa union, ma nessuna `DiagramView` di oggi lo elenca in `textFormats`: un
 * formato senza emettitore non deve comparire nel dialogo.
 */
export type TextFormat = "postgres" | "mysql" | "mermaid" | "class-mermaid"

/**
 * Props di `DiagramView.NodeView`: `node` arriva come `unknown` perché il registro è lo stesso
 * per ogni tipo di diagramma — il tipo concreto (`Entity`, `ClassNode`, ...) si restringe con un
 * cast esplicito nel modulo `kinds/*.tsx` che cabla la vista, l'unico punto che lo conosce.
 */
export interface NodeViewProps {
  nodeKey: string
  node: unknown
  view: NodeViewModel
  selected: boolean
}

/** Props di `DiagramView.EdgeView`: stessa ragione di `NodeViewProps` per `relation`. */
export interface EdgeViewProps {
  edgeKey: string
  relation: unknown
  source: Rect
  target: Rect
  selected: boolean
}

/**
 * Il lato «componenti» della giuntura fra tipi di diagramma: `DiagramOps` (in
 * `@/editor/kinds/ops.ts`) copre dati e comandi, questa copre React. Divisa in due oggetti
 * perché `src/editor` non può importare React (vedi `eslint.config.js`).
 *
 * `NodesLayer`/`EdgesLayer` sono i layer sottoscritti che il canvas monta (leggono lo store da
 * sé). `NodeView`/`EdgeView` sono le viste pure guidate dalle prop, senza store: le usa
 * `buildSvg` (`@/ui/export/svg.tsx`), che gira dentro `renderToStaticMarkup` e uno store non ce
 * l'ha.
 */
interface ToolDef { label: string; key: string; Icon: LucideIcon }

export interface DiagramView {
  NodesLayer: ComponentType
  EdgesLayer: ComponentType
  NodeView: ComponentType<NodeViewProps>
  EdgeView: ComponentType<EdgeViewProps>
  Properties: ComponentType
  tools: {
    node: ToolDef
    edge: ToolDef
    /** Terza specie di nodo, oggi solo nel class diagram: l'ER non ha note e non ne dichiara. */
    note?: ToolDef
  }
  textFormats: TextFormat[]
}

/** Chiuso sul tipo: neutro rispetto a cosa contiene ogni vista, non guarda dentro nessuna di esse. */
export function viewFor(type: Diagram["type"]): DiagramView {
  switch (type) {
    case "er":
      return erView
    case "class":
      return classView
  }
}

/** Hook: legge il tipo di diagramma corrente dallo store e ne ricava la vista. */
export function useDiagramView(): DiagramView {
  const type = useStore(documentStore, (s) => s.doc.diagram.type)
  return viewFor(type)
}
