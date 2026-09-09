import { Parser } from "node-sql-parser/build/mysql"
import { countSkipped, type DdlParseResult, type ParseWarning, type SqlForeignKey, type SqlTable } from "./schema"
import { splitStatements, stripExecutableComments } from "./sql-text"

/**
 * I tipi del pacchetto lasciano `reference_definition` a `any`: questo è il minimo che ci serve,
 * castato una volta sola dove si legge il vincolo.
 */
interface ReferenceDefinition {
  table?: Array<{ table?: string; db?: string | null }>
  definition?: Array<{ column?: string }>
}

/** Un elemento di `create_definitions`, ridotto ai campi che leggiamo. */
interface Definition {
  resource?: string
  constraint_type?: string
  constraint?: string
  index?: string
  column?: { column?: string }
  definition?: unknown
  nullable?: { type?: string }
  reference_definition?: unknown
  // Presente solo quando UNIQUE è scritto in linea sulla colonna (non come vincolo di tabella a
  // parte): stesse due grafie di `constraint_type` ("unique" e "unique key"), lette da isUnique().
  unique?: string
}

/**
 * Un elemento di `alter.expr`: il vincolo di un `ADD CONSTRAINT` non sta sull'elemento stesso ma
 * annidato in `create_definitions`.
 */
interface AlterExprItem {
  create_definitions?: Definition
}

interface ColumnType {
  dataType?: string
  length?: number
  // `scale` è `null` (non assente) quando il tipo non ha decimali, es. `bigint(20)`.
  scale?: number | null
  suffix?: string[] | null
}

const parser = new Parser()

/** `[{ type: "column_ref", column: "id" }]` → `["id"]`. Vale per PK, UNIQUE e colonne locali di una FK. */
const columnNames = (def: unknown): string[] =>
  Array.isArray(def)
    ? def.map((d: { column?: string }) => d.column).filter((c): c is string => typeof c === "string")
    : []

/** `BIGINT` + 20 + `["UNSIGNED"]` → `bigint(20) unsigned`. */
function typeText(d: ColumnType | undefined): string {
  const base = (d?.dataType ?? "").toLowerCase()
  // `scale` è `null`, non assente, quando il tipo non ha decimali (es. `bigint(20)`).
  const size = d?.length === undefined ? "" : d.scale == null ? `(${d.length})` : `(${d.length},${d.scale})`
  const suffix = (d?.suffix ?? []).map((s) => s.toLowerCase()).join(" ")
  return `${base}${size}${suffix ? ` ${suffix}` : ""}`
}

const isUnique = (t: string): boolean => ["unique key", "unique", "unique index"].includes(t)

/** Chiave qualificata dallo schema, come `pg.ts`: due tabelle omonime in schemi diversi non collidono. */
const tableKey = (t: Pick<SqlTable, "name" | "schema">): string => (t.schema ? `${t.schema}.${t.name}` : t.name)

function readForeignKey(d: Definition): SqlForeignKey {
  const ref = d.reference_definition as ReferenceDefinition | undefined
  return {
    ...(d.constraint ? { name: d.constraint } : {}),
    columns: columnNames(d.definition),
    ...(ref?.table?.[0]?.db ? { refSchema: ref.table[0].db } : {}),
    refTable: ref?.table?.[0]?.table ?? "",
    refColumns: (ref?.definition ?? []).map((c) => c.column).filter((c): c is string => typeof c === "string"),
  }
}

/** Applica un elemento di `create_definitions` o di un ALTER alla tabella. */
function applyDefinition(table: SqlTable, d: Definition): boolean {
  // `constraint_type` ha case incoerente nel pacchetto: "primary key" minuscolo, "FOREIGN KEY" maiuscolo.
  const type = (d.constraint_type ?? "").toLowerCase()
  if (type === "primary key") {
    table.primaryKey = columnNames(d.definition)
    // In MySQL la PRIMARY KEY implica NOT NULL, e il dump non scrive NOT NULL su quelle colonne.
    for (const col of table.columns) if (table.primaryKey.includes(col.name)) col.nullable = false
    return true
  }
  if (isUnique(type)) {
    table.unique.push(columnNames(d.definition))
    return true
  }
  if (type === "foreign key") {
    table.foreignKeys.push(readForeignKey(d))
    return true
  }
  return false
}

function readCreate(ast: { table?: Array<{ table?: string; db?: string | null }>; create_definitions?: unknown }): SqlTable {
  const head = ast.table?.[0]
  const table: SqlTable = {
    name: head?.table ?? "",
    ...(head?.db ? { schema: head.db } : {}),
    columns: [],
    primaryKey: [],
    unique: [],
    foreignKeys: [],
  }
  const defs = (ast.create_definitions ?? []) as Definition[]
  for (const d of defs) {
    if (d.resource !== "column") continue
    table.columns.push({
      name: d.column?.column ?? "",
      type: typeText(d.definition as ColumnType),
      // `nullable` c'è solo quando la colonna è NOT NULL: l'assenza vuol dire nullabile.
      nullable: d.nullable?.type !== "not null",
    })
    // UNIQUE in linea sulla colonna (es. `col int UNIQUE`) non produce un elemento a parte come il
    // vincolo di tabella: il flag sta qui, sull'elemento colonna stesso.
    if (isUnique(d.unique ?? "")) table.unique.push([d.column?.column ?? ""])
  }
  // I vincoli dopo le colonne: la PRIMARY KEY deve poter spegnere `nullable`.
  for (const d of defs) if (d.resource !== "column") applyDefinition(table, d)
  return table
}

/** Adapter MySQL/MariaDB: dal testo di un `mysqldump` alla rappresentazione intermedia. */
export function parseMysql(ddl: string): DdlParseResult {
  const warnings: ParseWarning[] = []
  const skipped: Record<string, number> = {}
  const byName = new Map<string, SqlTable>()
  const alters: Array<{ table?: Array<{ table?: string; db?: string | null }>; expr?: unknown; schema?: string }> = []
  // Lo schema fissato dall'ultimo `USE`: `mysqldump --databases` non qualifica i CREATE TABLE che
  // seguono, si affida a questo per stabilire in quale database finiscono.
  let currentSchema: string | undefined

  for (const chunk of splitStatements(ddl)) {
    const sql = stripExecutableComments(chunk)
    // null: il contenuto del commento eseguibile non è SQL (il marcatore sandbox di MariaDB).
    if (sql === null) {
      countSkipped(skipped, "commento eseguibile")
      continue
    }
    let ast: unknown
    try {
      ast = parser.astify(sql, { database: "MySQL" })
    } catch (e) {
      warnings.push({ message: `statement non riconosciuto (${sql.slice(0, 60).replace(/\s+/g, " ")}): ${e instanceof Error ? e.message : String(e)}` })
      continue
    }
    // Su un solo statement `astify` restituisce l'oggetto, non un array.
    for (const one of (Array.isArray(ast) ? ast : [ast]) as Array<Record<string, unknown>>) {
      const kind = `${String(one.type)}:${String(one.keyword)}`
      if (one.type === "create" && one.keyword === "table") {
        const table = readCreate(one as Parameters<typeof readCreate>[0])
        // Il CREATE TABLE può qualificare lo schema da sé; quando non lo fa, è quello dell'ultimo USE.
        if (!table.schema && currentSchema) table.schema = currentSchema
        byName.set(tableKey(table), table)
      } else if (one.type === "alter") {
        alters.push({ ...(one as (typeof alters)[number]), schema: currentSchema })
      } else if (one.type === "use") {
        // `USE db` fissa lo schema corrente per le CREATE TABLE non qualificate che seguono: è ciò
        // che stabilisce il database di destinazione in un dump `--databases`, non uno statement da
        // scartare (finiva in `skipped` con la chiave "use:undefined", perdendo l'informazione).
        const db = (one as { db?: unknown }).db
        currentSchema = typeof db === "string" ? db : undefined
      } else countSkipped(skipped, kind)
    }
  }

  /**
   * Un ALTER può non qualificare lo schema anche quando il CREATE lo fa (implicito nell'ultimo USE):
   * si cerca prima con lo schema — il proprio se lo dà, altrimenti quello dell'USE in vigore quando
   * l'ALTER è stato letto — e si ripiega sul nome nudo solo se è unico, come fa `pg.ts`.
   */
  const lookup = (t: { table?: string; db?: string | null } | undefined, schema?: string): SqlTable | undefined => {
    const effectiveSchema = t?.db ?? schema
    const exact = byName.get(effectiveSchema ? `${effectiveSchema}.${t?.table ?? ""}` : (t?.table ?? ""))
    if (exact) return exact
    const matches = [...byName.values()].filter((table) => table.name === t?.table)
    return matches.length === 1 ? matches[0] : undefined
  }

  for (const alter of alters) {
    const table = lookup(alter.table?.[0], alter.schema)
    if (!table) {
      warnings.push({ message: `ALTER TABLE su una tabella non presente nel dump: ${alter.table?.[0]?.table ?? "?"}` })
      continue
    }
    // Il vincolo di un ADD CONSTRAINT sta annidato in `create_definitions`, non sull'elemento stesso.
    const exprs = (Array.isArray(alter.expr) ? alter.expr : [alter.expr]) as AlterExprItem[]
    for (const item of exprs) {
      const d = item.create_definitions
      if (!d || !applyDefinition(table, d)) countSkipped(skipped, "alter:altro")
    }
  }

  return { tables: [...byName.values()], warnings, skipped }
}
