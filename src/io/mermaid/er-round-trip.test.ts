import { describe, expect, it } from "vitest"
import { emitMermaid } from "@/io/emit/er-mermaid"
import type { ErModel } from "@/model/er/schema"
import { mapEr } from "./er-map"
import { parseEr } from "./er-parse"

/**
 * Un modello con solo ciò che Mermaid porta (spec §8): nullabilità uguale a `!primaryKey`,
 * relazioni senza colonne. Il round-trip deve restituirlo identico.
 */
const MODEL: ErModel = {
  entities: {
    "pub.cliente": {
      schema: "pub",
      name: "cliente",
      attributes: [
        { name: "id", type: "bigint", primaryKey: true, foreignKey: false, nullable: false, unique: false },
        { name: "email", type: "varchar(255)", primaryKey: false, foreignKey: false, nullable: true, unique: true },
        { name: "nota", type: "double precision", primaryKey: false, foreignKey: false, nullable: true, unique: false },
      ],
    },
    ordine: {
      name: "ordine",
      attributes: [
        { name: "id", type: "int", primaryKey: true, foreignKey: false, nullable: false, unique: false },
        { name: "cliente_id", type: "bigint", primaryKey: false, foreignKey: true, nullable: true, unique: false },
      ],
    },
  },
  relationships: {
    r1: {
      name: "effettua",
      source: { entity: "ordine", attributes: [], cardinality: "zero-or-many" },
      target: { entity: "pub.cliente", attributes: [], cardinality: "one" },
      identifying: false,
    },
    r2: {
      source: { entity: "ordine", attributes: [], cardinality: "zero-or-one" },
      target: { entity: "ordine", attributes: [], cardinality: "many" },
      identifying: true,
    },
  },
}

describe("round-trip ER", () => {
  it("modello → emitMermaid → parseEr → mapEr restituisce il modello", () => {
    const { text, warnings } = emitMermaid(MODEL)
    expect(warnings).toEqual([])
    const fragment = mapEr(parseEr(text).ast, text)
    expect(fragment.warnings).toEqual([])
    expect(fragment.entities).toEqual(MODEL.entities)
    expect(fragment.relationships).toEqual(Object.values(MODEL.relationships))
  })
})
