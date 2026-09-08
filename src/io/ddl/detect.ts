import type { Dialect } from "./schema"

/** Solo la testa del testo: gli indizi stanno nell'intestazione del dump, e un dump può essere enorme. */
const HEAD = 8192

const PG = [
  /--\s*PostgreSQL database dump/i,
  /SET\s+standard_conforming_strings/i,
  /\bpg_catalog\./,
  /^\s*\\(restrict|unrestrict|connect)\b/m,
  /\bOWNER\s+TO\b/i,
  /::[a-z_]+/,
  /\$\$/,
]

const MY = [
  /--\s*MySQL dump/i,
  /\/\*!\d{5}/,
  /\/\*M!/,
  /\bENGINE\s*=/i,
  /\bAUTO_INCREMENT\b/i,
  /`[^`\n]+`/,
]

const score = (text: string, patterns: readonly RegExp[]): number =>
  patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)

/**
 * Conta gli indizi dei due dialetti nella testa del testo. A pari merito, o senza indizi, Postgres:
 * `libpg-query` è il parser che regge meglio lo SQL standard scritto a mano. Il risultato preseleziona
 * il dialetto nel dialog e resta correggibile dall'utente.
 */
export function detectDialect(sql: string): Dialect {
  const head = sql.slice(0, HEAD)
  return score(head, MY) > score(head, PG) ? "mysql" : "postgres"
}
