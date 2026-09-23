import { Circle, Diamond, Layers, Parentheses, Square, StickyNote, type LucideIcon } from "lucide-react"
import { FlowShapeSchema, type FlowShape } from "@/model/flow/schema"

/**
 * Etichetta italiana e icona di ogni forma — unica fonte per la barra degli strumenti
 * (`ui/canvas/kinds/flow.tsx`) e per il select del pannello proprietà
 * (`ui/panels/FlowProperties.tsx`), che altrimenti la ridichiarerebbero in due posti (violazione
 * SSOT: stesso dato — il nome di una forma — con due origini che potrebbero divergere).
 *
 * Vive qui e non in uno dei due file che la usano perché sono loro stessi ad accoppiarsi in un
 * ciclo d'importazione se uno pescasse dall'altro: `kinds/flow.tsx` monta `FlowProperties` dentro
 * `DiagramView.Properties`, e `FlowProperties` avrebbe dovuto rileggere `flowView.tools` da lì.
 */
export const FLOW_SHAPE_LABEL: Record<FlowShape, string> = {
  terminal: "Terminale",
  process: "Processo",
  decision: "Decisione",
  io: "Input/Output",
  subprocess: "Sottoprocesso",
  note: "Nota",
}

export const FLOW_SHAPE_ICON: Record<FlowShape, LucideIcon> = {
  terminal: Circle,
  process: Square,
  decision: Diamond,
  io: Parentheses,
  subprocess: Layers,
  note: StickyNote,
}

/** Le sei forme nell'ordine di presentazione: quello di `FlowShapeSchema`, non l'ordine
 *  d'inserimento di un `Record`, che per chiavi stringa non è garantito. */
export const FLOW_SHAPES = FlowShapeSchema.options
