import type { DevDocument } from "@/model/document"
import type { ErDiagram } from "@/model/er/schema"

/** Oggi il documento è sempre ER; il guard resta perché la union crescerà. */
export function erDiagram(doc: DevDocument): ErDiagram {
  if (doc.diagram.type !== "er") throw new Error(`atteso un diagramma ER, trovato ${doc.diagram.type}`)
  return doc.diagram
}
