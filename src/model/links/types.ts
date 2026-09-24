import { baseType } from "../sql-type"

/** La categoria in cui si riducono sia il tipo di un attributo sia quello di una colonna. */
export type TypeCategory = "integer" | "decimal" | "string" | "boolean" | "datetime" | "json" | "uuid"

// Mappe e non oggetti letterali: un tipo che si chiama `constructor` o `toString` troverebbe la
// proprietà di `Object.prototype` e passerebbe per un tipo noto.
/** Ogni nome della lista, con lo stesso valore: le voci di una mappa. */
const each = <V,>(names: readonly string[], value: V) => names.map((name) => [name, value] as const)

/** Lato classe, in minuscolo. */
const CLASS_TYPES: ReadonlyMap<string, TypeCategory> = new Map<string, TypeCategory>([
  ...each<TypeCategory>(["int", "integer"], "integer"),
  ...each<TypeCategory>(["float", "double", "decimal"], "decimal"),
  ...each<TypeCategory>(["string"], "string"),
  ...each<TypeCategory>(["bool", "boolean"], "boolean"),
  ...each<TypeCategory>(["datetime", "datetimeimmutable", "datetimeinterface", "carbon", "carbonimmutable", "date"], "datetime"),
  ...each<TypeCategory>(["array", "json"], "json"),
  ...each<TypeCategory>(["uuid"], "uuid"),
])

/** Lato SQL, per nome base (`baseType`). Un tipo ammette un **insieme** di categorie. */
const SQL_TYPES: ReadonlyMap<string, readonly TypeCategory[]> = new Map<string, readonly TypeCategory[]>([
  ...each<readonly TypeCategory[]>(
    ["int", "integer", "bigint", "smallint", "mediumint", "serial", "bigserial", "smallserial", "int2", "int4", "int8"],
    ["integer"],
  ),
  // Il booleano di MySQL, con Laravel.
  ...each<readonly TypeCategory[]>(["tinyint"], ["integer", "boolean"]),
  ...each<readonly TypeCategory[]>(["decimal", "numeric", "real", "double precision", "double", "float", "float4", "float8"], ["decimal"]),
  ...each<readonly TypeCategory[]>(
    ["varchar", "character varying", "char", "character", "text", "mediumtext", "longtext", "tinytext", "citext"],
    ["string"],
  ),
  ...each<readonly TypeCategory[]>(["boolean", "bool"], ["boolean"]),
  ...each<readonly TypeCategory[]>(
    ["date", "datetime", "timestamp", "timestamptz", "timestamp with time zone", "timestamp without time zone", "time"],
    ["datetime"],
  ),
  ...each<readonly TypeCategory[]>(["json", "jsonb"], ["json", "string"]),
  ...each<readonly TypeCategory[]>(["uuid"], ["uuid", "string"]),
])

/** La categoria del tipo di un attributo: si tolgono `?` in testa e `|null`/`null|`, maiuscole ignorate. */
export function classTypeCategory(type: string): TypeCategory | null {
  const bare = type
    .trim()
    .replace(/^\?/, "")
    .replace(/^null\s*\|\s*/i, "")
    .replace(/\s*\|\s*null$/i, "")
    .trim()
    .toLowerCase()
  return CLASS_TYPES.get(bare) ?? null
}

/** Le categorie che una colonna di questo tipo ammette. */
export function sqlTypeCategories(type: string): readonly TypeCategory[] | null {
  return SQL_TYPES.get(baseType(type)) ?? null
}

/**
 * `false` solo quando entrambi i tipi sono riconosciuti e la categoria dell'attributo non è fra quelle
 * della colonna. Un tipo personalizzato, o vuoto, non deve produrre falsi allarmi (spec 4a §5).
 */
export function typesCompatible(classType: string, sqlType: string): boolean {
  const cls = classTypeCategory(classType)
  const sql = sqlTypeCategories(sqlType)
  return cls === null || sql === null || sql.includes(cls)
}
