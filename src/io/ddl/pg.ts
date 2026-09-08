import { hasSqlDetails, loadModule, parse } from "libpg-query"
import type { AlterTableStmt, ColumnDef, Constraint, CreateStmt, Node, ParseResult, RangeVar, TypeName } from "libpg-query"
import { countSkipped, type DdlParseResult, type ParseWarning, type SqlForeignKey, type SqlTable } from "./schema"
import { splitStatements, stripPsqlMeta } from "./sql-text"

/**
 * `Node` è un'unione di oggetti a una sola chiave: `{ CreateStmt: … } | { AlterTableStmt: … } | …`.
 * Il nome della chiave è il tipo dello statement, e serve sia a restringere sia a contare gli scartati.
 */
const kindOf = (n: Node): string => Object.keys(n)[0] ?? "sconosciuto"

/** Nomi interni del parser di Postgres, nella grafia in cui li scrive un umano. */
const TYPE_NAMES: Record<string, string> = {
  int2: "smallint",
  int4: "integer",
  int8: "bigint",
  float4: "real",
  float8: "double precision",
  bool: "boolean",
  bpchar: "char",
}

const strValue = (n: Node | undefined): string | undefined => (n && "String" in n ? n.String.sval : undefined)

/** I typmod sono `A_Const` con un intero dentro: `varchar(255)` → 255, `numeric(10,2)` → 10 e 2. */
const typmodValue = (n: Node): number | undefined =>
  "A_Const" in n && n.A_Const.ival ? n.A_Const.ival.ival ?? 0 : undefined

function typeText(t: TypeName | undefined): string {
  const parts = (t?.names ?? []).map(strValue).filter((s): s is string => s !== undefined && s !== "pg_catalog")
  const base = TYPE_NAMES[parts.join(".")] ?? parts.join(".")
  const mods = (t?.typmods ?? []).map(typmodValue).filter((n): n is number => n !== undefined)
  const array = (t?.arrayBounds?.length ?? 0) > 0 ? "[]" : ""
  return `${base}${mods.length > 0 ? `(${mods.join(",")})` : ""}${array}`
}

const columnNames = (nodes: Node[] | undefined): string[] =>
  (nodes ?? []).map(strValue).filter((s): s is string => s !== undefined)

const tableKey = (r: RangeVar | undefined): string =>
  r?.schemaname ? `${r.schemaname}.${r.relname}` : (r?.relname ?? "")

function foreignKey(c: Constraint, fallbackColumn?: string): SqlForeignKey {
  const columns = columnNames(c.fk_attrs)
  return {
    ...(c.conname ? { name: c.conname } : {}),
    // Un REFERENCES scritto sulla colonna non porta fk_attrs: la colonna è quella che si sta definendo.
    columns: columns.length > 0 ? columns : fallbackColumn ? [fallbackColumn] : [],
    ...(c.pktable?.schemaname ? { refSchema: c.pktable.schemaname } : {}),
    refTable: c.pktable?.relname ?? "",
    refColumns: columnNames(c.pk_attrs),
  }
}

/** Applica un vincolo alla tabella. `column` è valorizzata solo per i vincoli scritti sulla colonna. */
function applyConstraint(table: SqlTable, c: Constraint, column?: string): void {
  const keys = column ? [column] : columnNames(c.keys)
  if (c.contype === "CONSTR_PRIMARY") {
    table.primaryKey = keys
    // In Postgres la PRIMARY KEY implica NOT NULL, anche quando il DDL non lo scrive.
    for (const col of table.columns) if (keys.includes(col.name)) col.nullable = false
  } else if (c.contype === "CONSTR_UNIQUE") table.unique.push(keys)
  else if (c.contype === "CONSTR_FOREIGN") table.foreignKeys.push(foreignKey(c, column))
}

function readCreate(stmt: CreateStmt): SqlTable {
  const table: SqlTable = {
    name: stmt.relation?.relname ?? "",
    ...(stmt.relation?.schemaname ? { schema: stmt.relation.schemaname } : {}),
    columns: [],
    primaryKey: [],
    unique: [],
    foreignKeys: [],
  }
  const pending: Array<{ c: Constraint; column?: string }> = []
  for (const el of stmt.tableElts ?? []) {
    if ("ColumnDef" in el) {
      const def: ColumnDef = el.ColumnDef
      const name = def.colname ?? ""
      // `is_not_null` non è valorizzato nell'albero grezzo: NOT NULL è un constraint della colonna.
      const notNull = (def.constraints ?? []).some((n) => "Constraint" in n && n.Constraint.contype === "CONSTR_NOTNULL")
      table.columns.push({ name, type: typeText(def.typeName), nullable: !notNull })
      for (const n of def.constraints ?? []) if ("Constraint" in n) pending.push({ c: n.Constraint, column: name })
    } else if ("Constraint" in el) pending.push({ c: el.Constraint })
  }
  // I vincoli si applicano dopo le colonne: la PRIMARY KEY deve poter spegnere `nullable`.
  for (const { c, column } of pending) applyConstraint(table, c, column)
  return table
}

const warnOf = (e: unknown, fallback: string): ParseWarning =>
  hasSqlDetails(e)
    ? { message: `${fallback}: ${e.sqlDetails.message}`, at: e.sqlDetails.cursorPosition }
    : { message: `${fallback}: ${e instanceof Error ? e.message : String(e)}` }

const nodesOf = (tree: ParseResult): Node[] =>
  (tree.stmts ?? []).map((s) => s.stmt).filter((n): n is Node => n !== undefined)

/**
 * `parse()` è tutto o niente: un solo statement indigesto fa perdere l'intero dump. Il caso normale
 * costa una chiamata; se fallisce si ripiega su una passata statement per statement, così un dump con
 * un'istruzione esotica importa tutto il resto e segnala solo quella.
 */
async function allNodes(sql: string, warnings: ParseWarning[]): Promise<Node[]> {
  try {
    return nodesOf(await parse(sql))
  } catch (whole) {
    warnings.push(warnOf(whole, "il dump non è stato letto in un colpo, si procede statement per statement"))
    const out: Node[] = []
    // Il ripiego analizza un frammento alla volta: `cursorPosition` che il parser calcola è relativo
    // a quel frammento, non al dump intero, e va tradotto nell'offset del testo originale che
    // `ParseWarning.at` promette (vedi schema.ts) sommando dove il frammento comincia in `sql`.
    // `cursor` avanza in un solo verso perché ogni frammento di `splitStatements` è una sottostringa
    // verbatim di `sql` (a parte lo spazio iniziale già tolto) e i frammenti sono nello stesso ordine
    // del testo: `indexOf` a partire dal cursore trova sempre il frammento giusto, in tempo
    // complessivamente lineare invece che quadratico nel numero di frammenti.
    let cursor = 0
    for (const text of splitStatements(sql)) {
      const base = sql.indexOf(text, cursor)
      cursor = base + text.length
      try {
        out.push(...nodesOf(await parse(text)))
      } catch (one) {
        const w = warnOf(one, `statement non riconosciuto (${text.slice(0, 60).replace(/\s+/g, " ")})`)
        warnings.push(w.at === undefined ? w : { ...w, at: w.at + base })
      }
    }
    return out
  }
}

/** Adapter PostgreSQL: dal testo di un `pg_dump` alla rappresentazione intermedia. */
export async function parsePostgres(ddl: string): Promise<DdlParseResult> {
  const warnings: ParseWarning[] = []
  const skipped: Record<string, number> = {}
  const { sql, removed } = stripPsqlMeta(ddl)
  removed.forEach(() => countSkipped(skipped, "meta-comando psql"))

  await loadModule()
  const nodes = await allNodes(sql, warnings)

  const byKey = new Map<string, SqlTable>()
  const alters: AlterTableStmt[] = []
  for (const node of nodes) {
    if ("CreateStmt" in node) {
      const table = readCreate(node.CreateStmt)
      byKey.set(tableKey(node.CreateStmt.relation), table)
    } else if ("AlterTableStmt" in node) alters.push(node.AlterTableStmt)
    else countSkipped(skipped, kindOf(node))
  }

  /** Un ALTER può qualificare lo schema dove il CREATE non lo faceva: si ripiega sul nome nudo, se è unico. */
  const lookup = (r: RangeVar | undefined): SqlTable | undefined => {
    const exact = byKey.get(tableKey(r))
    if (exact) return exact
    const matches = [...byKey.values()].filter((t) => t.name === r?.relname)
    return matches.length === 1 ? matches[0] : undefined
  }

  for (const alter of alters) {
    const table = lookup(alter.relation)
    if (!table) {
      warnings.push({ message: `ALTER TABLE su una tabella non presente nel dump: ${tableKey(alter.relation)}` })
      continue
    }
    for (const cmd of alter.cmds ?? []) {
      if (!("AlterTableCmd" in cmd)) continue
      const { subtype, def, name } = cmd.AlterTableCmd
      if (subtype === "AT_AddConstraint" && def && "Constraint" in def) applyConstraint(table, def.Constraint)
      else if (subtype === "AT_SetNotNull") {
        const col = table.columns.find((c) => c.name === name)
        if (col) col.nullable = false
      } else countSkipped(skipped, subtype ?? "AlterTableCmd")
    }
  }

  return { tables: [...byKey.values()], warnings, skipped }
}
