import type { DevDocument, ErDiagram } from "@/model/document"

/** Oggi il documento è sempre ER; il guard resta perché la union crescerà. */
export function erDiagram(doc: DevDocument): ErDiagram {
  if (doc.diagram.type !== "er") throw new Error(`atteso un diagramma ER, trovato ${doc.diagram.type}`)
  return doc.diagram
}
