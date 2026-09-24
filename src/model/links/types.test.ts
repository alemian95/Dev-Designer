import { describe, expect, it } from "vitest"
import { classTypeCategory, sqlTypeCategories, typesCompatible } from "./types"

describe("classTypeCategory", () => {
  it.each([
    ["int", "integer"], ["?int", "integer"], ["int|null", "integer"], ["null|int", "integer"], ["INT | NULL", "integer"],
    ["float", "decimal"], ["string", "string"], ["bool", "boolean"], ["Carbon", "datetime"],
    ["DateTimeImmutable", "datetime"], ["array", "json"], ["uuid", "uuid"],
  ])("%s → %s", (type, category) => {
    expect(classTypeCategory(type)).toBe(category)
  })

  it("un tipo personalizzato, o vuoto, non ha categoria", () => {
    expect(classTypeCategory("StatoOrdine")).toBeNull()
    expect(classTypeCategory("")).toBeNull()
  })
})

describe("sqlTypeCategories", () => {
  it("riduce il tipo alla forma base prima di cercarlo", () => {
    expect(sqlTypeCategories("bigint(20) unsigned")).toEqual(["integer"])
    expect(sqlTypeCategories("NUMERIC(10,2)")).toEqual(["decimal"])
    expect(sqlTypeCategories("timestamp with time zone")).toEqual(["datetime"])
  })

  it("tinyint ammette anche il booleano; json e uuid anche la stringa", () => {
    expect(sqlTypeCategories("tinyint(1)")).toEqual(["integer", "boolean"])
    expect(sqlTypeCategories("jsonb")).toEqual(["json", "string"])
    expect(sqlTypeCategories("uuid")).toEqual(["uuid", "string"])
  })

  it("un tipo sconosciuto non ha categorie", () => {
    expect(sqlTypeCategories("geometry")).toBeNull()
  })
})

describe("typesCompatible", () => {
  it("compatibili se la categoria della classe è fra quelle della colonna", () => {
    expect(typesCompatible("float", "double precision")).toBe(true)
    expect(typesCompatible("string", "uuid")).toBe(true)
    expect(typesCompatible("string", "numeric")).toBe(false)
  })

  it("un tipo non riconosciuto da una delle due parti non è un'incompatibilità", () => {
    expect(typesCompatible("StatoOrdine", "varchar")).toBe(true)
    expect(typesCompatible("string", "geometry")).toBe(true)
  })
})
