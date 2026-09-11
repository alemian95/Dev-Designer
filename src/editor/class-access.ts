import type { ClassDiagram } from "@/model/class/schema"
import type { DevDocument } from "@/model/document"

/** Il diagramma di classi del documento. Solleva se il documento è di un altro tipo. */
export function classDiagram(doc: DevDocument): ClassDiagram {
  if (doc.diagram.type !== "class") throw new Error(`atteso un diagramma di classi, trovato ${doc.diagram.type}`)
  return doc.diagram
}
