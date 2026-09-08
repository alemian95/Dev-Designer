export type Dialect = "postgres" | "mysql"

export interface SqlColumn {
  name: string
  /** Tipo come lo scrive il dialetto d'origine, ricomposto: `varchar(255)`, `bigint(20) unsigned`. */
  type: string
  /**
   * Nullabilità **effettiva**, non quella letterale del DDL: una colonna nella PRIMARY KEY è già
   * `false` qui, anche quando il DDL non scrive NOT NULL su di lei. `pg.ts` e `mysql.ts` impongono
   * la regola al momento di leggere il vincolo PRIMARY KEY — sia inline nel CREATE TABLE sia in un
   * ALTER TABLE successivo — e la impongono su ogni colonna della chiave, non solo su quelle già
   * marcate NOT NULL nel testo. Chi consuma `SqlColumn` (map.ts compreso) legge questo campo da
   * solo: non deve ricontrollare `primaryKey` per dedurre la stessa cosa una seconda volta.
   */
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
