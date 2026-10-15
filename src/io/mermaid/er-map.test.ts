import { describe, expect, it } from "vitest"
import { ER_VALID } from "./er-fixtures"
import { mapEr } from "./er-map"
import { parseEr } from "./er-parse"

const read = (text: string) => mapEr(parseEr(text).ast, text)

describe("mapEr", () => {
  it("mette a sinistra il padre e a destra il figlio, con la cardinalità del proprio marcatore", () => {
    const { relationships } = read(ER_VALID.basic!)
    expect(relationships).toEqual([
      {
        name: "places",
        source: { entity: "ORDER", attributes: [], cardinality: "zero-or-many" },
        target: { entity: "CUSTOMER", attributes: [], cardinality: "one" },
        identifying: true,
      },
    ])
  })

  it("crea senza attributi le entità che compaiono solo in una relazione", () => {
    expect(read(ER_VALID.basic!).entities.ORDER).toEqual({ name: "ORDER", attributes: [] })
  })

  it("elenca le entità che compaiono solo nelle relazioni, non quelle dichiarate", () => {
    expect(read("erDiagram\n  A ||--o{ B : x\n  B {\n    int id\n  }\n  C\n  C ||--|| D : y\n").referenced).toEqual(["A", "D"])
  })

  it("traduce le chiavi e deduce nullable dalla chiave primaria", () => {
    const { entities } = read(ER_VALID.keysAndComments!)
    const e = entities["pub.utenti"]!
    expect(e).toMatchObject({ schema: "pub", name: "utenti" })
    expect(e.attributes.map(({ name, primaryKey, foreignKey, unique, nullable }) => [name, primaryKey, foreignKey, unique, nullable])).toEqual([
      ["id", true, false, false, false],
      ["gruppo_id", false, true, false, true],
      ["email", false, false, true, true],
      ["a", true, true, false, false],
    ])
  })

  it("spezza il nome sul primo punto", () => {
    expect(Object.keys(read("erDiagram\n  a.b.c\n  .x\n").entities)).toEqual(["a.b.c", ".x"])
    expect(read("erDiagram\n  a.b.c\n").entities["a.b.c"]).toEqual({ schema: "a", name: "b.c", attributes: [] })
  })

  it("spezza sul primo punto anche i nomi non citati di una relazione", () => {
    const { relationships, entities } = read("erDiagram\n  pub.a ||--o{ b : x\n")
    expect(relationships[0]!.target.entity).toBe("pub.a")
    expect(entities["pub.a"]).toEqual({ schema: "pub", name: "a", attributes: [] })
  })

  it("unisce i blocchi ripetuti e tiene il primo attributo omonimo, con avviso", () => {
    const { entities, warnings } = read(ER_VALID.repeated!)
    expect(entities.A!.attributes.map((a) => [a.name, a.type])).toEqual([["id", "int"], ["nome", "string"]])
    expect(warnings.map((w) => w.message)).toEqual(["Attributi ripetuti nella stessa entità, si tiene il primo: A.id (riga 7)"])
  })

  it("segnala alias e commenti scartati, e lascia senza nome un'etichetta vuota", () => {
    const alias = read(ER_VALID.aliasAndStyle!)
    expect(alias.relationships[0]!.name).toBeUndefined()
    expect(alias.warnings.map((w) => w.message)).toEqual(["Alias delle entità scartati, il nome resta l'id: p (riga 7)"])
    expect(read(ER_VALID.keysAndComments!).warnings.map((w) => w.message)).toEqual([
      "Commenti degli attributi scartati: pub.utenti.id (riga 3)",
    ])
  })

  it("legge la cardinalità «u» come «one», con avviso", () => {
    const { relationships, warnings } = read("erDiagram\n  A u--o{ B : x\n")
    expect(relationships[0]!.target.cardinality).toBe("one")
    expect(warnings).toHaveLength(1)
  })
})
