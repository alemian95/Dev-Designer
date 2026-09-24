import type { ComponentType } from "react"
import { Spline, type LucideIcon } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { documentFamilies } from "@/editor/families"
import type { Rect } from "@/editor/geometry"
import type { Tool } from "@/editor/session-store"
import type { Family } from "@/model/family"
import type { NodeView as NodeViewModel } from "@/model/shared"
import { classView } from "./class"
import { erView } from "./er"
import { flowView } from "./flow"

/**
 * Formati emessi dall'export testo. `class-mermaid` e `flow-mermaid` sono dichiarati già qui
 * perché più task consumano questa stessa union prima che l'emettitore esista, ma nessuna
 * `DiagramView` li elenca in `textFormats` finché il proprio emettitore non c'è: un formato senza
 * emettitore non deve comparire nel dialogo. `flow-mermaid` lo guadagna il Task 10.
 */
export type TextFormat = "postgres" | "mysql" | "mermaid" | "class-mermaid" | "flow-mermaid"

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
  /** Scarto del fascio (`edgeOffsets`): 0 per l'arco unico fra due nodi. Prop e non calcolo interno
   *  perché dipende da *tutti* gli archi, e la vista pura vede solo il proprio. */
  offset: number
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
export interface ToolDef {
  label: string
  key: string
  Icon: LucideIcon
  tool: Tool
  /** Famiglia in cui lo strumento crea: `null` per Collega, che non crea nodi. */
  family: Family | null
  /** Passata ad `addNode`: la forma, per le famiglie che ne hanno più d'una. */
  variant?: string
}

/**
 * Identità di uno strumento nel ToggleGroup. La famiglia serve: «Nota di classe» e «Nota di flusso»
 * sono entrambe `node` con variante `note`, e senza la famiglia avrebbero lo stesso id.
 */
export function toolId(def: Pick<ToolDef, "tool" | "family" | "variant">): string {
  return [def.tool, def.family, def.variant].filter(Boolean).join(":")
}

/**
 * Lo strumento per collegare, uno solo per tutte le famiglie: il tipo di arco lo decidono gli
 * estremi (`CanvasOps.addEdge`), non lo strumento.
 */
export const LINK_TOOL: ToolDef = { label: "Collega", key: "r", Icon: Spline, tool: "edge", family: null }

/** Nome del gruppo della sidebar: è anche il nome accessibile del `role="group"`. */
export const FAMILY_LABEL: Record<Family, string> = { er: "ER", class: "Classi", flow: "Flusso" }

/** Gli strumenti del canvas nell'ordine della sidebar: famiglia per famiglia, poi Collega. «Seleziona» non è qui: non crea niente. */
export function canvasTools(families: readonly Family[]): ToolDef[] {
  return [...families.flatMap((family) => viewFor(family).tools), LINK_TOOL]
}

export interface DiagramView {
  NodesLayer: ComponentType
  EdgesLayer: ComponentType
  NodeView: ComponentType<NodeViewProps>
  EdgeView: ComponentType<EdgeViewProps>
  /** Montato solo quando la selezione è esattamente un nodo o esattamente un arco (`PropertiesPanel`). */
  Properties: ComponentType
  /**
   * Corpo del pannello **senza nessuna selezione**. Opzionale: se un tipo non lo dichiara,
   * `PropertiesPanel` mostra la propria frase generica, come faceva prima che questo campo
   * esistesse — ER e class non lo dichiarano e restano su quella. Il flowchart lo usa per il
   * pannello delle corsie (spec §11): a differenza di `Properties`, qui non c'è un nodo o un arco
   * da passare, quindi il componente non prende prop.
   */
  EmptyProperties?: ComponentType
  tools: ToolDef[]
  textFormats: TextFormat[]
}

/** Chiuso sulla famiglia: neutro rispetto a cosa contiene ogni vista, non guarda dentro nessuna di esse. */
export function viewFor(family: Family): DiagramView {
  switch (family) {
    case "er":
      return erView
    case "class":
      return classView
    case "flow":
      return flowView
  }
}

/** Le famiglie del documento aperto (fase A: il suo tipo). Il Task 5 la sostituisce con `FAMILIES`. */
export function useDocumentFamilies(): readonly Family[] {
  return useStore(documentStore, useShallow((s) => documentFamilies(s.doc)))
}
