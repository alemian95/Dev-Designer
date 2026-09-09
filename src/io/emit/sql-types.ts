import type { Dialect } from "@/io/ddl/schema"

/** Etichetta del dialetto nei messaggi all'utente. */
export const DIALECT_LABEL: Record<Dialect, string> = { postgres: "PostgreSQL", mysql: "MySQL" }

/**
 * Nome base del tipo, **solo** per il confronto con gli insiemi qui sotto: il tipo emesso resta
 * sempre la stringa del modello, intatta.
 *
 * Non si tronca al primo spazio perché i tipi a più parole esistono e sono quelli che contano:
 * `double precision` arriva così dall'adapter Postgres, `bigint(20) unsigned` da quello MySQL.
 *
 * Un letterale con una parentesi chiusa dentro — `enum('a)b')` — confonde il taglio delle
 * parentesi. Il risultato non corrisponde a nessun insieme e quindi non produce alcun avviso:
 * fallire in silenzio è il modo giusto di sbagliare, qui.
 */
export function baseType(type: string): string {
  return type
    .toLowerCase()
    .replaceAll(/\([^)]*\)/g, " ")
    .replaceAll("[]", " ")
    .replaceAll(/\b(?:unsigned|zerofill)\b/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
}

/** Table 8.1 di `postgresql.org/docs/current/datatype.html`, nomi e alias. */
const POSTGRES: ReadonlySet<string> = new Set([
  "bigint", "int8", "bigserial", "serial8", "bit", "bit varying", "varbit", "boolean", "bool",
  "box", "bytea", "character", "char", "character varying", "varchar", "cidr", "circle", "date",
  "double precision", "float", "float8", "inet", "integer", "int", "int4", "interval", "json",
  "jsonb", "line", "lseg", "macaddr", "macaddr8", "money", "numeric", "decimal", "path", "pg_lsn",
  "pg_snapshot", "point", "polygon", "real", "float4", "smallint", "int2", "smallserial", "serial2",
  "serial", "serial4", "text", "time", "time with time zone", "time without time zone", "timetz",
  "timestamp", "timestamp with time zone", "timestamp without time zone", "timestamptz", "tsquery",
  "tsvector", "txid_snapshot", "uuid", "xml",
])

/** `dev.mysql.com/doc/refman/8.4/en/data-types.html`, sinonimi compresi. */
const MYSQL: ReadonlySet<string> = new Set([
  "integer", "int", "smallint", "tinyint", "mediumint", "bigint", "decimal", "dec", "numeric",
  "fixed", "float", "double", "double precision", "real", "bit", "bool", "boolean", "serial",
  "date", "datetime", "timestamp", "time", "year", "char", "varchar", "binary", "varbinary",
  "blob", "tinyblob", "mediumblob", "longblob", "text", "tinytext", "mediumtext", "longtext",
  "enum", "set", "json", "geometry", "point", "linestring", "polygon", "multipoint",
  "multilinestring", "multipolygon", "geometrycollection",
])

const TYPES: Record<Dialect, ReadonlySet<string>> = { postgres: POSTGRES, mysql: MYSQL }

/**
 * I tipi che appartengono all'**altro** dialetto e non a `dialect`, come nomi base, senza
 * ripetizioni e in ordine alfabetico.
 *
 * Il predicato è deliberatamente più stretto di «non è nell'insieme del target»: quello avrebbe
 * segnalato ogni `enum`, `domain` o `citext`, che sono tipi personalizzati **validi** in Postgres,
 * e un export Postgres→Postgres avrebbe gridato al lupo su ogni schema che ne usa uno. Di un tipo
 * che non conosciamo non diciamo nulla.
 *
 * Limite noto: `serial` esiste in entrambi con semantiche diverse (in MySQL è
 * `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`), quindi non produce avviso. Coerente con la scelta di
 * non tradurre la semantica.
 */
export function foreignTypes(types: Iterable<string>, dialect: Dialect): string[] {
  const target = TYPES[dialect]
  const other = TYPES[dialect === "postgres" ? "mysql" : "postgres"]
  const found = new Set<string>()
  for (const type of types) {
    const base = baseType(type)
    if (other.has(base) && !target.has(base)) found.add(base)
  }
  return [...found].sort()
}
