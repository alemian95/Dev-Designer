import { createErDocument, type Attribute, type ErDocument } from "@/model/document"

const ATTRIBUTES_PER_ENTITY = 12
const COL_GAP = 260
const ROW_GAP = 340

function attribute(j: number): Attribute {
  return {
    name: j === 0 ? "id" : `col_${j}`,
    type: j === 0 ? "bigint" : j % 3 === 0 ? "varchar(255)" : "int",
    primaryKey: j === 0,
    foreignKey: j === 1,
    nullable: j % 2 === 1,
    unique: j === 2,
  }
}

/** Documento sintetico a N entità da 12 attributi, con ~2 relazioni per entità (vicina a sinistra e sopra). */
export function buildStressDocument(n: number): ErDocument {
  const doc = createErDocument(`Stress ${n}`, "stress")
  const cols = Math.ceil(Math.sqrt(n))
  for (let i = 0; i < n; i++) {
    const key = `t${i}`
    doc.diagram.model.entities[key] = { name: key, attributes: Array.from({ length: ATTRIBUTES_PER_ENTITY }, (_, j) => attribute(j)) }
    doc.diagram.view.nodes[key] = { x: (i % cols) * COL_GAP, y: Math.floor(i / cols) * ROW_GAP, collapsed: false }
    if (i > 0) {
      doc.diagram.model.relationships[`r${i}`] = {
        source: { entity: key, attributes: ["col_1"], cardinality: "many" },
        target: { entity: `t${i - 1}`, attributes: ["id"], cardinality: "one" },
        identifying: false,
      }
    }
    if (i >= cols) {
      doc.diagram.model.relationships[`c${i}`] = {
        source: { entity: key, attributes: ["col_1"], cardinality: "zero-or-many" },
        target: { entity: `t${i - cols}`, attributes: ["id"], cardinality: "one" },
        identifying: true,
      }
    }
  }
  return doc
}
