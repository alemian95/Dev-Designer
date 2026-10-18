import type { DiagramView } from "./registry"

/** Niente da disegnare né da modificare, per ora: la vista vera arriva coi task del canvas. */
const Nothing = () => null

/** `DiagramView` per le sequenze, nella versione minima: layer vuoti, nessuno strumento, nessun pannello. */
export const sequenceView: DiagramView = {
  NodesLayer: Nothing,
  EdgesLayer: Nothing,
  NodeView: Nothing,
  EdgeView: Nothing,
  Properties: Nothing,
  tools: [],
}
