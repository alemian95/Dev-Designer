import { describe, expect, it } from "vitest"
import mysqlSynthetic from "../../../spike/fixtures/mysql.synthetic.sql?raw"
import pgSynthetic from "../../../spike/fixtures/postgres.synthetic.sql?raw"
import { mapToEr } from "@/io/ddl/map"
import { parseMysql } from "@/io/ddl/mysql"
import { parsePostgres } from "@/io/ddl/pg"
import type { DdlParseResult, SqlTable } from "@/io/ddl/schema"
import type { ErModel } from "@/model/document"
import { emitDdl } from "./ddl"

/**
 * Riduce le tabelle ai soli campi che il modello ER sa rappresentare, in un ordine stabile.
 * Gli UNIQUE su più colonne si scartano da **entrambi** i lati: il modello non li rappresenta e
 * l'import li scarta già con un avviso, quindi confrontarli pretenderebbe il contrario della spec.
 * I nomi dei vincoli si escludono perché l'export li rigenera.
 */
function comparable(tables: SqlTable[]) {
  return [...tables]
    .map((t) => ({
      name: t.name,
      schema: t.schema,
      columns: t.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
      primaryKey: t.primaryKey,
      unique: t.unique.filter((u) => u.length === 1).map((u) => u.join()).sort(),
      foreignKeys: t.foreignKeys
        .map((f) => [f.columns.join(), f.refSchema ?? "", f.refTable, f.refColumns.join()].join("|"))
        .sort(),
    }))
    .sort((a, b) => `${a.schema ?? ""}.${a.name}`.localeCompare(`${b.schema ?? ""}.${b.name}`))
}

/** Il modello che l'import produce dalle tabelle lette, senza nulla di preesistente sul canvas. */
function toModel(parsed: DdlParseResult): ErModel {
  const { entities, relationships } = mapToEr({ tables: parsed.tables, model: { entities: {}, relationships: {} } })
  return {
    entities,
    relationships: Object.fromEntries(relationships.map((r, i) => [`r${i}`, r])),
  }
}

describe("round-trip del DDL", () => {
  it("un dump Postgres sintetico sopravvive a modello → DDL → riparse", async () => {
    const primo = await parsePostgres(pgSynthetic)
    expect(primo.tables.length).toBeGreaterThan(0)
    const { text, warnings } = emitDdl(toModel(primo), "postgres")
    // Nessun tipo estraneo: il dump è Postgres e il target è Postgres.
    expect(warnings.filter((w) => w.includes("non appartengono"))).toEqual([])
    const secondo = await parsePostgres(text)
    expect(secondo.warnings).toEqual([])
    expect(comparable(secondo.tables)).toEqual(comparable(primo.tables))
  })

  it("un dump MySQL sintetico sopravvive a modello → DDL → riparse", () => {
    const primo = parseMysql(mysqlSynthetic)
    expect(primo.tables.length).toBeGreaterThan(0)
    const { text, warnings } = emitDdl(toModel(primo), "mysql")
    expect(warnings.filter((w) => w.includes("non appartengono"))).toEqual([])
    const secondo = parseMysql(text)
    expect(secondo.warnings).toEqual([])
    expect(comparable(secondo.tables)).toEqual(comparable(primo.tables))
  })
})
