import { describe, expect, it } from "vitest"
import { baseType, foreignTypes } from "./sql-types"

describe("baseType", () => {
  // La tabella della spec §9, riga per riga. Non si tronca al primo spazio: i tipi a più parole
  // sono quelli che contano, e `double precision` arriva così dall'adapter Postgres.
  it.each([
    ["VARCHAR(255)", "varchar"],
    ["numeric(10,2)", "numeric"],
    ["bigint(20) unsigned", "bigint"],
    ["bigint unsigned", "bigint"],
    ["character varying(255)", "character varying"],
    ["timestamp(3) with time zone", "timestamp with time zone"],
    ["text[]", "text"],
    ["double precision", "double precision"],
    ["  Int  ", "int"],
    ["", ""],
  ])("normalizza %j in %j", (input, atteso) => {
    expect(baseType(input)).toBe(atteso)
  })
})

describe("foreignTypes", () => {
  it("segnala i tipi che appartengono all'altro dialetto e non al target", () => {
    expect(foreignTypes(["jsonb", "timestamptz", "bytea"], "mysql")).toEqual(["bytea", "jsonb", "timestamptz"])
    expect(foreignTypes(["longtext", "mediumint", "datetime"], "postgres")).toEqual(["datetime", "longtext", "mediumint"])
  })

  it("tace sui tipi noti a entrambi", () => {
    expect(foreignTypes(["text", "int", "varchar(255)", "double precision"], "mysql")).toEqual([])
    expect(foreignTypes(["text", "int", "varchar(255)", "double precision"], "postgres")).toEqual([])
  })

  it("tace sui tipi personalizzati, che non sono di nessuno dei due", () => {
    // Un enum o un domain di Postgres arriva col proprio nome. Segnalarlo sarebbe un falso
    // positivo su ogni schema che ne usa uno, ed era il difetto della prima formulazione.
    expect(foreignTypes(["mood", "citext", "varchar2(30)"], "postgres")).toEqual([])
    expect(foreignTypes(["mood", "citext", "varchar2(30)"], "mysql")).toEqual([])
  })

  it("tace sul tipo noto solo al target", () => {
    expect(foreignTypes(["jsonb", "bytea"], "postgres")).toEqual([])
  })

  it("non ripete lo stesso tipo base e ignora lunghezza e scala", () => {
    expect(foreignTypes(["longtext", "longtext", "mediumint(8)", "mediumint"], "postgres")).toEqual(["longtext", "mediumint"])
  })
})
