import type { DevDocument } from "@/model/document"
import type { ErDiagram } from "@/model/er/schema"

/** Il guard resta perché la union include anche il class diagram (Task 7): senza, TypeScript non la restringe. */
export function erDiagram(doc: DevDocument): ErDiagram {
  if (doc.diagram.type !== "er") throw new Error(`atteso un diagramma ER, trovato ${doc.diagram.type}`)
  return doc.diagram
}
