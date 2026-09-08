import { describe, expect, it } from "vitest"
import type { ErModel } from "@/model/document"
import { mapToEr } from "./map"
import type { SqlTable } from "./schema"

const EMPTY_MODEL: ErModel = { entities: {}, relationships: {} }

const table = (over: Partial<SqlTable> & Pick<SqlTable, "name">): SqlTable => ({
  columns: [],
  primaryKey: [],
  unique: [],
  foreignKeys: [],
  ...over,
})

const child = (over: Partial<SqlTable> = {}): SqlTable =>
  table({
    name: "child",
    columns: [
      { name: "id", type: "bigint", nullable: false },
      { name: "parent_id", type: "bigint", nullable: false },
    ],
    primaryKey: ["id"],
    foreignKeys: [{ name: "child_fk", columns: ["parent_id"], refTable: "parent", refColumns: ["id"] }],
    ...over,
  })

const parent = (): SqlTable => table({ name: "parent", columns: [{ name: "id", type: "bigint", nullable: false }], primaryKey: ["id"] })

describe("mapToEr — entità e attributi", () => {
  it("la chiave dell'entità è schema.nome quando lo schema c'è, il nome nudo quando manca", () => {
    const r = mapToEr({ tables: [table({ name: "t", schema: "app" }), table({ name: "u" })], model: EMPTY_MODEL })
    expect(Object.keys(r.entities).sort()).toEqual(["app.t", "u"])
  })

  it("primaryKey, unique, foreignKey e nullable finiscono sugli attributi", () => {
    const r = mapToEr({
      tables: [
        table({
          name: "t",
          columns: [
            { name: "id", type: "bigint", nullable: false },
            { name: "code", type: "text", nullable: true },
            { name: "other_id", type: "bigint", nullable: true },
          ],
          primaryKey: ["id"],
          unique: [["code"]],
          foreignKeys: [{ columns: ["other_id"], refTable: "other", refColumns: ["id"] }],
        }),
        table({ name: "other", columns: [{ name: "id", type: "bigint", nullable: false }], primaryKey: ["id"] }),
      ],
      model: EMPTY_MODEL,
    })
    expect(r.entities["t"].attributes).toEqual([
      { name: "id", type: "bigint", primaryKey: true, foreignKey: false, nullable: false, unique: false },
      { name: "code", type: "text", primaryKey: false, foreignKey: false, nullable: true, unique: true },
      { name: "other_id", type: "bigint", primaryKey: false, foreignKey: true, nullable: true, unique: false },
    ])
  })

  it("un vincolo UNIQUE su più colonne non marca nessuna colonna e produce un avviso col conteggio", () => {
    const r = mapToEr({ tables: [table({ name: "t", columns: [{ name: "a", type: "int", nullable: true }], unique: [["a", "b"]] })], model: EMPTY_MODEL })
    expect(r.entities["t"].attributes[0].unique).toBe(false)
    expect(r.warnings.some((w) => w.includes("1") && w.includes("UNIQUE"))).toBe(true)
  })
})

describe("mapToEr — cardinalità", () => {
  it("FK non nullabile: il padre è esattamente uno", () => {
    const r = mapToEr({ tables: [child(), parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].target.cardinality).toBe("one")
  })

  it("FK nullabile: il padre è opzionale", () => {
    const t = child({ columns: [{ name: "id", type: "bigint", nullable: false }, { name: "parent_id", type: "bigint", nullable: true }] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].target.cardinality).toBe("zero-or-one")
  })

  it("FK non unica nel figlio: molti figli per padre", () => {
    const r = mapToEr({ tables: [child(), parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].source.cardinality).toBe("zero-or-many")
  })

  it("FK unica nel figlio: relazione uno a uno", () => {
    const t = child({ unique: [["parent_id"]] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].source.cardinality).toBe("zero-or-one")
  })

  it("FK che è la PRIMARY KEY del figlio: uno a uno e identificante", () => {
    const t = child({ primaryKey: ["parent_id"] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].source.cardinality).toBe("zero-or-one")
    expect(r.relationships[0].identifying).toBe(true)
  })

  it("FK fuori dalla PRIMARY KEY: non identificante", () => {
    const r = mapToEr({ tables: [child(), parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].identifying).toBe(false)
  })

  it("senza PRIMARY KEY nel figlio la relazione non è identificante", () => {
    const t = child({ primaryKey: [] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].identifying).toBe(false)
  })
})

describe("mapToEr — risoluzione dei riferimenti", () => {
  it("la relazione porta nome, estremi e colonne di entrambi i lati", () => {
    const r = mapToEr({ tables: [child(), parent()], model: EMPTY_MODEL })
    expect(r.relationships[0]).toEqual({
      name: "child_fk",
      source: { entity: "child", attributes: ["parent_id"], cardinality: "zero-or-many" },
      target: { entity: "parent", attributes: ["id"], cardinality: "one" },
      identifying: false,
    })
  })

  it("risolve un riferimento non qualificato verso un'entità già sul canvas", () => {
    const model: ErModel = {
      entities: { parent: { name: "parent", attributes: [] } },
      relationships: {},
    }
    const r = mapToEr({ tables: [child()], model })
    expect(r.relationships).toHaveLength(1)
    expect(r.relationships[0].target.entity).toBe("parent")
  })

  it("una FK verso una tabella assente salta la relazione e lascia un avviso", () => {
    const r = mapToEr({ tables: [child()], model: EMPTY_MODEL })
    expect(r.relationships).toEqual([])
    expect(r.warnings.some((w) => w.includes("parent"))).toBe(true)
  })

  it("un nome ambiguo fra due schemi salta la relazione e dice l'ambiguità", () => {
    const r = mapToEr({
      tables: [child(), table({ name: "parent", schema: "a" }), table({ name: "parent", schema: "b" })],
      model: EMPTY_MODEL,
    })
    expect(r.relationships).toEqual([])
    expect(r.warnings.some((w) => w.includes("ambiguo"))).toBe(true)
  })

  it("un riferimento qualificato va all'entità di quello schema", () => {
    const r = mapToEr({
      tables: [
        child({ foreignKeys: [{ columns: ["parent_id"], refSchema: "b", refTable: "parent", refColumns: ["id"] }] }),
        table({ name: "parent", schema: "a" }),
        table({ name: "parent", schema: "b" }),
      ],
      model: EMPTY_MODEL,
    })
    expect(r.relationships[0].target.entity).toBe("b.parent")
  })

  it("una FK verso se stessa non è un caso speciale", () => {
    const t = table({
      name: "node",
      columns: [{ name: "id", type: "int", nullable: false }, { name: "parent_id", type: "int", nullable: true }],
      primaryKey: ["id"],
      foreignKeys: [{ columns: ["parent_id"], refTable: "node", refColumns: ["id"] }],
    })
    const r = mapToEr({ tables: [t], model: EMPTY_MODEL })
    expect(r.relationships[0].source.entity).toBe("node")
    expect(r.relationships[0].target.entity).toBe("node")
  })
})

describe("mapToEr — invariante attributes non vuoto", () => {
  it("una FK con columns vuoto viene scartata con un avviso, non produce una relazione con attributes: []", () => {
    const t = child({ foreignKeys: [{ name: "broken_fk", columns: [], refTable: "parent", refColumns: ["id"] }] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships).toEqual([])
    expect(r.warnings.some((w) => w.includes("broken_fk"))).toBe(true)
  })

  it("una FK con refColumns vuoto viene scartata con un avviso", () => {
    const t = child({ foreignKeys: [{ name: "broken_fk", columns: ["parent_id"], refTable: "parent", refColumns: [] }] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships).toEqual([])
    expect(r.warnings.some((w) => w.includes("broken_fk"))).toBe(true)
  })
})
