import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import type { Diagram } from "@/model/document"
import { classView } from "./class"
import { erView } from "./er"

/**
 * Formati emessi dall'export testo. `class-mermaid` è dichiarato già qui perché il Task 14
 * userà questa stessa union, ma nessuna `DiagramView` di oggi lo elenca in `textFormats`: un
 * formato senza emettitore non deve comparire nel dialogo.
 */
export type TextFormat = "postgres" | "mysql" | "mermaid" | "class-mermaid"

/**
 * Il lato «componenti» della giuntura fra tipi di diagramma: `DiagramOps` (in
 * `@/editor/kinds/ops.ts`) copre dati e comandi, questa copre React. Divisa in due oggetti
 * perché `src/editor` non può importare React (vedi `eslint.config.js`).
 */
export interface DiagramView {
  NodesLayer: ComponentType
  EdgesLayer: ComponentType
  Properties: ComponentType
  tools: {
    node: { label: string; key: string; Icon: LucideIcon }
    edge: { label: string; key: string; Icon: LucideIcon }
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
