export type Dialect = "postgres" | "mysql"

export interface SqlColumn {
  name: string
  /** Tipo come lo scrive il dialetto d'origine, ricomposto: `varchar(255)`, `bigint(20) unsigned`. */
  type: string
  nullable: boolean
}

export interface SqlForeignKey {
  /** Nome del vincolo, se il DDL lo dà. */
  name?: string
  columns: string[]
  refSchema?: string
  refTable: string
  refColumns: string[]
}

export interface SqlTable {
  name: string
  schema?: string
  columns: SqlColumn[]
  /** Vuoto se la tabella non ha PRIMARY KEY. */
  primaryKey: string[]
  /** Ogni vincolo UNIQUE come lista di colonne. */
  unique: string[][]
  foreignKeys: SqlForeignKey[]
}

export interface ParseWarning {
  message: string
  /** Offset nel testo, quando il parser lo dà (`sqlDetails.cursorPosition` di libpg-query). */
  at?: number
}

/**
 * Il risultato di un adapter. Si chiama così e non `ParseResult` perché `libpg-query` riespone
 * `@pgsql/types`, dove `ParseResult` è il risultato del parser di Postgres.
 */
export interface DdlParseResult {
  tables: SqlTable[]
  warnings: ParseWarning[]
  /** Statement riconosciuti e non usati, contati per tipo: `{ IndexStmt: 8, CreateSeqStmt: 9 }`. */
  skipped: Record<string, number>
}

/** Aiuto per gli adapter: incrementa un contatore di `skipped`. */
export function countSkipped(skipped: Record<string, number>, kind: string): void {
  skipped[kind] = (skipped[kind] ?? 0) + 1
}
