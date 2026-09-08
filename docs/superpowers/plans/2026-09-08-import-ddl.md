# Import DDL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare uno schema SQL esistente (`pg_dump` o `mysqldump`) dentro un diagramma ER: si incolla o si carica il DDL, si scelgono le tabelle, e sul canvas compaiono entità con attributi, chiavi e relazioni con cardinalità dedotte dalle foreign key, in un solo comando annullabile.

**Architecture:** Uno scanner del testo SQL e due adapter puri (uno per dialetto) producono una rappresentazione intermedia neutra; un worker unico li carica con `import()` dinamico; una funzione pura mappa la rappresentazione intermedia su entità e relazioni del modello; un comando in `editor` le innesta nel documento aperto con una sola `dispatch`. La UI è un dialog che orchestra le quattro chiamate.

**Tech Stack:** TypeScript 6 strict, Vitest 5, `libpg-query` 17.7.4 (WASM, Postgres), `node-sql-parser` 5.4.0 (MySQL/MariaDB), Vite 8 (worker `?worker`, fixture `?raw`), React 19, shadcn/ui (`dialog`, `checkbox`), Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-08-import-ddl-design.md`

## Global Constraints

- Testo della UI, commenti, docstring e messaggi di commit in **italiano**; identificatori in inglese.
- Strati con dipendenze verso il basso, imposte da `no-restricted-imports` in `eslint.config.js`: `model` non conosce nulla; `editor` conosce `model`, zustand e immer, mai React né `ui`; `io` conosce `model`, `editor`, zustand e idb, mai React né `ui`; `ui` conosce tutto.
- **Nessuna dipendenza npm nuova.** `libpg-query` e `node-sql-parser` sono già in `package.json`. Gli unici file generati da fuori sono i due componenti shadcn `dialog` e `checkbox`.
- I dump reali dell'utente (`spike/fixtures/postgres.sql`, `spike/fixtures/mysql.sql`) sono git-ignored e **non si committano mai**, e **nessun loro frammento** — nomi di tabella o di colonna compresi — finisce in un test committato. Le fixture dei test sono i dump sintetici già committati (`spike/fixtures/*.synthetic.sql`) più snippet in linea con nomi inventati.
- Le fixture si importano con `?raw` (dichiarato da `vite/client`, già in `types` di `tsconfig.app.json`), **non** con `node:fs`: i test stanno dentro `src/` e `tsconfig.app.json` non ha i tipi di Node.
- Nessun test per componente React (non c'è jsdom nel progetto). La UI si verifica nel browser e con l'e2e Playwright.
- Ogni task termina con `pnpm lint && pnpm test` verdi e **un commit**, con prefisso convenzionale (`feat:`, `fix:`, `test:`, `chore:`, `docs:`) e scope quando aiuta (`feat(io):`).
- Il tipo del risultato del parse si chiama **`DdlParseResult`**, non `ParseResult`: `libpg-query` riespone `@pgsql/types`, dove `ParseResult` è il risultato del parser di Postgres.
- L'AST di Postgres è tipizzato — `Node`, `CreateStmt`, `AlterTableStmt`, `ColumnDef`, `Constraint`, `TypeName`, `ConstrType`, `AlterTableType` si importano da `libpg-query`. `Node` è un'unione di oggetti a **una sola chiave**, quindi si restringe con `"CreateStmt" in node`.
- Nessun `any` non motivato: dove l'AST di MySQL è `any` (`reference_definition`) si dichiara un tipo locale minimo e si castano i dati **una volta sola**, al confine.

## Struttura dei file

| file | responsabilità | task |
|---|---|---|
| `src/io/ddl/sql-text.ts` | scanner del testo SQL: tratti di codice contro literal, split degli statement, meta-comandi psql, commenti eseguibili | 1 |
| `src/io/ddl/schema.ts` | la rappresentazione intermedia e i tipi condivisi. Solo tipi, nessuna logica | 2 |
| `src/io/ddl/detect.ts` | rilevamento del dialetto dal testo | 2 |
| `src/io/ddl/pg.ts` | AST di libpg-query → rappresentazione intermedia | 3 |
| `src/io/ddl/mysql.ts` | AST di node-sql-parser → rappresentazione intermedia | 4 |
| `src/io/ddl/parse.worker.ts` | il worker unico, con `import()` dell'adapter | 5 |
| `src/io/ddl/parse-client.ts` | lato main: ciclo di vita e protezione del worker | 5 |
| `src/io/ddl/map.ts` | rappresentazione intermedia + tabelle scelte + modello corrente → entità e relazioni | 6 |
| `src/editor/commands/import.ts` | la recipe dell'import e `placeNew` | 7 |
| `src/ui/import/ImportDdlDialog.tsx` | il dialog | 8 |
| `vite.config.ts` | il plugin del WASM, reso condizionale | 9 |
| `scripts/e2e/import.mjs` | l'e2e dell'import | 10 |

---

### Task 1: Scanner del testo SQL

Il file più insidioso del piano, e il primo perché tutto il resto ci si appoggia. Lo spike aveva uno split ingenuo (`split(/;\s*\r?\n/)`) valido solo per `mysqldump --no-data`, e tagliava ogni riga che inizia per `\` senza guardare se fosse dentro una stringa. Qui si fa la cosa giusta una volta.

**Files:**
- Create: `src/io/ddl/sql-text.ts`
- Test: `src/io/ddl/sql-text.test.ts`

**Interfaces:**
- Consumes: niente, è il primo task.
- Produces:
  - `export interface Span { start: number; end: number; code: boolean }`
  - `export function spans(sql: string): Span[]`
  - `export function stripPsqlMeta(sql: string): { sql: string; removed: string[] }`
  - `export function splitStatements(sql: string): string[]`
  - `export function stripExecutableComments(chunk: string): string | null`

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `src/io/ddl/sql-text.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { spans, splitStatements, stripExecutableComments, stripPsqlMeta } from "./sql-text"

/** Aiuto di lettura: i soli tratti di codice, concatenati. */
const codeOf = (sql: string) => spans(sql).filter((s) => s.code).map((s) => sql.slice(s.start, s.end)).join("")

describe("spans", () => {
  it("tutto codice quando non ci sono literal", () => {
    expect(codeOf("select 1")).toBe("select 1")
  })

  it("una stringa non è codice, e l'apice raddoppiato non la chiude", () => {
    expect(codeOf("insert values ('a''b'), (1)")).toBe("insert values (), (1)")
  })

  it("l'apice sfuggito col backslash non chiude la stringa", () => {
    expect(codeOf("values ('a\\'b') x")).toBe("values () x")
  })

  it("gli identificatori quotati e i backtick non sono codice", () => {
    expect(codeOf('create table "a;b" ()')).toBe("create table  ()")
    expect(codeOf("create table `a;b` ()")).toBe("create table  ()")
  })

  it("i commenti di riga, in entrambe le grafie, non sono codice", () => {
    expect(codeOf("a -- ; commento\nb")).toBe("a \nb")
    expect(codeOf("a # ; commento\nb")).toBe("a \nb")
  })

  it("i commenti a blocchi non sono codice e si annidano come in Postgres", () => {
    expect(codeOf("a /* ; /* dentro */ ancora */ b")).toBe("a  b")
  })

  it("il dollar-quote di Postgres non è codice, con e senza tag", () => {
    expect(codeOf("do $$ begin ; end $$; x")).toBe("do ; x")
    expect(codeOf("do $fn$ ; $fn$; x")).toBe("do ; x")
  })

  it("un dollaro che non apre un tag resta codice", () => {
    expect(codeOf("select a$1")).toBe("select a$1")
  })
})

describe("stripPsqlMeta", () => {
  it("toglie i meta-comandi di pg_dump 18 e li riporta", () => {
    const r = stripPsqlMeta("\\restrict abc\ncreate table t ();\n\\unrestrict abc\n")
    expect(r.sql).toBe("\ncreate table t ();\n\n")
    expect(r.removed).toEqual(["\\restrict abc", "\\unrestrict abc"])
  })

  it("non tocca un backslash a inizio riga dentro una stringa", () => {
    const sql = "insert values ('riga1\n\\restrict finto');\n"
    expect(stripPsqlMeta(sql).sql).toBe(sql)
    expect(stripPsqlMeta(sql).removed).toEqual([])
  })

  it("non tocca una riga che inizia per backslash ma non è un meta-comando noto", () => {
    const sql = "\\pippo qualcosa\nselect 1;\n"
    expect(stripPsqlMeta(sql).sql).toBe(sql)
  })
})

describe("splitStatements", () => {
  it("spezza sul punto e virgola e scarta i tratti vuoti", () => {
    expect(splitStatements("create table a ();\ncreate table b ();\n")).toEqual([
      "create table a ()",
      "create table b ()",
    ])
  })

  it("non spezza sul punto e virgola dentro una stringa", () => {
    expect(splitStatements("insert into t values ('a;b');\nselect 1;")).toEqual([
      "insert into t values ('a;b')",
      "select 1",
    ])
  })

  it("non spezza sul punto e virgola dentro un commento", () => {
    expect(splitStatements("select 1 -- ;\n;\nselect 2;")).toEqual(["select 1 -- ;\n", "select 2"])
  })

  it("onora DELIMITER e non emette la direttiva come statement", () => {
    const sql = "DELIMITER ;;\ncreate trigger t begin insert; end;;\nDELIMITER ;\nselect 1;"
    expect(splitStatements(sql)).toEqual([
      "create trigger t begin insert; end",
      "select 1",
    ])
  })

  it("l'ultimo statement senza punto e virgola finale non si perde", () => {
    expect(splitStatements("select 1")).toEqual(["select 1"])
  })
})

describe("stripExecutableComments", () => {
  it("spoglia il commento eseguibile e restituisce l'SQL dentro", () => {
    expect(stripExecutableComments("/*!40101 SET NAMES utf8mb4 */")).toBe("SET NAMES utf8mb4")
  })

  it("spoglia anche la variante MariaDB", () => {
    expect(stripExecutableComments("/*M!100001 SET x = 1 */")).toBe("SET x = 1")
  })

  it("scarta il marcatore sandbox di MariaDB, che non è SQL", () => {
    expect(stripExecutableComments("/*M!999999\\- enable the sandbox mode */")).toBeNull()
  })

  it("lascia intatto un chunk che non è un commento eseguibile", () => {
    expect(stripExecutableComments("create table t ()")).toBe("create table t ()")
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm vitest run src/io/ddl/sql-text.test.ts`
Expected: FAIL — `Failed to resolve import "./sql-text"`.

- [ ] **Step 3: Scrivere lo scanner**

Creare `src/io/ddl/sql-text.ts`:

```ts
/**
 * Un tratto di testo SQL. `code` distingue l'SQL vero da stringhe, identificatori quotati e commenti:
 * chi cerca un `;` o un meta-comando deve guardare solo i tratti di codice.
 */
export interface Span {
  start: number
  end: number
  code: boolean
}

/** Meta-comandi psql, insieme chiuso. `pg_dump` 18 racchiude il dump fra `\restrict` e `\unrestrict`. */
const PSQL_META = new Set(["restrict", "unrestrict", "connect", "c", "echo", "set", "unset", "i", "ir", "if", "else", "endif", "encoding", "."])

const endOfLine = (sql: string, from: number): number => {
  const nl = sql.indexOf("\n", from)
  return nl === -1 ? sql.length : nl
}

/** Commenti a blocchi annidabili: Postgres li annida, MySQL no, e contare la profondità va bene per entrambi. */
function blockCommentEnd(sql: string, from: number): number {
  let depth = 0
  let i = from
  while (i < sql.length) {
    if (sql[i] === "/" && sql[i + 1] === "*") {
      depth++
      i += 2
    } else if (sql[i] === "*" && sql[i + 1] === "/") {
      depth--
      i += 2
      if (depth === 0) return i
    } else i++
  }
  return sql.length
}

/** Fine di un literal delimitato da `quote`. Il delimitatore raddoppiato non chiude, il backslash sfugge. */
function quotedEnd(sql: string, from: number, quote: string): number {
  let i = from + 1
  while (i < sql.length) {
    const c = sql[i]
    if (c === "\\") i += 2
    else if (c === quote) {
      if (sql[i + 1] === quote) i += 2
      else return i + 1
    } else i++
  }
  return sql.length
}

/** `$$` o `$tag$` a partire da `i`, o null se quel dollaro non apre un dollar-quote. */
function dollarTagAt(sql: string, i: number): string | null {
  const m = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(i))
  return m ? m[0] : null
}

/** Segmenta il testo in tratti di codice e tratti di literal o commento. Una sola passata. */
export function spans(sql: string): Span[] {
  const out: Span[] = []
  let codeStart = 0
  const closeCode = (at: number) => {
    if (at > codeStart) out.push({ start: codeStart, end: at, code: true })
  }
  const skip = (start: number, end: number) => {
    closeCode(start)
    out.push({ start, end, code: false })
    codeStart = end
    return end
  }

  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]
    if ((c === "-" && next === "-") || c === "#") {
      i = skip(i, endOfLine(sql, i))
      continue
    }
    if (c === "/" && next === "*") {
      i = skip(i, blockCommentEnd(sql, i))
      continue
    }
    if (c === "'" || c === '"' || c === "`") {
      i = skip(i, quotedEnd(sql, i, c))
      continue
    }
    if (c === "$") {
      const tag = dollarTagAt(sql, i)
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length)
        i = skip(i, close === -1 ? sql.length : close + tag.length)
        continue
      }
    }
    i++
  }
  closeCode(sql.length)
  return out
}

/** True se `at` cade in un tratto di codice. */
const inCode = (list: readonly Span[], at: number): boolean =>
  list.some((s) => s.code && at >= s.start && at < s.end)

/**
 * Toglie le righe di meta-comando psql che stanno in stato codice, lasciando il resto intatto —
 * il carattere `\n` compreso, così le posizioni degli statement restano vicine all'originale.
 */
export function stripPsqlMeta(sql: string): { sql: string; removed: string[] } {
  const list = spans(sql)
  const removed: string[] = []
  let out = ""
  let at = 0
  while (at < sql.length) {
    const end = endOfLine(sql, at)
    const line = sql.slice(at, end)
    const m = /^[ \t]*\\([A-Za-z]+|\.)/.exec(line)
    if (m && inCode(list, at + line.indexOf("\\")) && PSQL_META.has(m[1])) {
      removed.push(line.trim())
    } else out += line
    out += end < sql.length ? "\n" : ""
    at = end + 1
  }
  return { sql: out, removed }
}

/** Direttiva `DELIMITER x` di mysqldump: cambia il terminatore degli statement e non è uno statement. */
const DELIMITER = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*$/i

/**
 * Spezza in statement rispettando stringhe, identificatori quotati, commenti e `DELIMITER`.
 * I tratti vuoti si scartano; l'ultimo statement senza terminatore non si perde.
 */
export function splitStatements(sql: string): string[] {
  const list = spans(sql)
  const out: string[] = []
  let terminator = ";"
  let start = 0
  let i = 0

  const push = (end: number) => {
    const text = sql.slice(start, end)
    if (text.trim()) out.push(text.trim())
  }

  while (i < sql.length) {
    if (!inCode(list, i)) {
      i++
      continue
    }
    // La direttiva DELIMITER si riconosce solo a inizio riga, in stato codice.
    if (i === start || sql[i - 1] === "\n") {
      const line = sql.slice(i, endOfLine(sql, i))
      const m = DELIMITER.exec(line)
      if (m) {
        push(i)
        terminator = m[1]
        i = endOfLine(sql, i) + 1
        start = i
        continue
      }
    }
    if (sql.startsWith(terminator, i)) {
      push(i)
      i += terminator.length
      start = i
      continue
    }
    i++
  }
  push(sql.length)
  return out
}

const EXECUTABLE = /^\/\*(?:!|M!)\d*\s*([\s\S]*?)\*\/$/

/**
 * Spoglia il commento eseguibile che racchiude un chunk: `mysqldump` mette in quella forma anche DDL
 * che serve, quindi scartare il chunk intero (come faceva lo spike) perde informazione. null quando
 * il contenuto non è SQL — il marcatore sandbox di MariaDB, per esempio, che comincia per backslash.
 */
export function stripExecutableComments(chunk: string): string | null {
  const m = EXECUTABLE.exec(chunk.trim())
  if (!m) return chunk
  const inner = m[1].trim()
  return /^[A-Za-z(]/.test(inner) ? inner : null
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `pnpm vitest run src/io/ddl/sql-text.test.ts`
Expected: PASS, 20 test.

Se `splitStatements` sbaglia sul caso `DELIMITER`, il sospetto giusto è la condizione di inizio riga (`i === start || sql[i - 1] === "\n"`): dopo un `push` il nuovo `start` può cadere in mezzo a una riga.

- [ ] **Step 5: Lint e commit**

```bash
pnpm lint && pnpm test
git add src/io/ddl/sql-text.ts src/io/ddl/sql-text.test.ts
git commit -m "feat(io): scanner del testo SQL consapevole di stringhe, commenti e DELIMITER"
```

---

### Task 2: Rappresentazione intermedia e rilevamento del dialetto

**Files:**
- Create: `src/io/ddl/schema.ts`
- Create: `src/io/ddl/detect.ts`
- Test: `src/io/ddl/detect.test.ts`

**Interfaces:**
- Consumes: niente del Task 1.
- Produces:
  - `SqlColumn`, `SqlForeignKey`, `SqlTable`, `ParseWarning`, `DdlParseResult`, `Dialect` da `schema.ts`
  - `export function detectDialect(sql: string): Dialect` da `detect.ts`

- [ ] **Step 1: Scrivere i tipi della rappresentazione intermedia**

Creare `src/io/ddl/schema.ts`. Sono solo tipi: nessuna logica, quindi nessun test proprio — li esercitano i Task 3, 4 e 6.

```ts
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
```

- [ ] **Step 2: Scrivere i test del rilevamento**

Creare `src/io/ddl/detect.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import pgSynthetic from "../../../spike/fixtures/postgres.synthetic.sql?raw"
import mysqlSynthetic from "../../../spike/fixtures/mysql.synthetic.sql?raw"
import { detectDialect } from "./detect"

describe("detectDialect", () => {
  it("riconosce l'intestazione di pg_dump", () => {
    expect(detectDialect("-- PostgreSQL database dump\nSET standard_conforming_strings = on;")).toBe("postgres")
  })

  it("riconosce l'intestazione di mysqldump", () => {
    expect(detectDialect("-- MySQL dump 10.19\n/*!40101 SET NAMES utf8 */;")).toBe("mysql")
  })

  it("riconosce i commenti eseguibili MariaDB", () => {
    expect(detectDialect("/*M!999999\\- enable the sandbox mode */")).toBe("mysql")
  })

  it("riconosce i backtick e ENGINE= come MySQL", () => {
    expect(detectDialect("CREATE TABLE `t` (`id` int) ENGINE=InnoDB;")).toBe("mysql")
  })

  it("riconosce i meta-comandi psql e il cast :: come Postgres", () => {
    expect(detectDialect("\\restrict abc\nSELECT 1::int;")).toBe("postgres")
  })

  it("in assenza di indizi ripiega su postgres", () => {
    expect(detectDialect("CREATE TABLE t (id integer);")).toBe("postgres")
  })

  it("azzecca le due fixture sintetiche", () => {
    expect(detectDialect(pgSynthetic)).toBe("postgres")
    expect(detectDialect(mysqlSynthetic)).toBe("mysql")
  })
})
```

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

Run: `pnpm vitest run src/io/ddl/detect.test.ts`
Expected: FAIL — `Failed to resolve import "./detect"`.

Se invece fallisce sull'import delle fixture `?raw`, il problema è di risoluzione e non di codice: verificare che il percorso relativo dal file di test raggiunga `spike/fixtures/`, e che quei due file sintetici esistano (`ls spike/fixtures`). Sono committati, quindi ci sono.

- [ ] **Step 4: Scrivere il rilevamento**

Creare `src/io/ddl/detect.ts`:

```ts
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
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `pnpm vitest run src/io/ddl/detect.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 6: Lint e commit**

```bash
pnpm lint && pnpm test
git add src/io/ddl/schema.ts src/io/ddl/detect.ts src/io/ddl/detect.test.ts
git commit -m "feat(io): rappresentazione intermedia del DDL e rilevamento del dialetto"
```

---

### Task 3: Adapter Postgres

I percorsi dell'AST scritti qui sono stati **verificati eseguendo `libpg-query@17.7.4`**, non ricordati. Tre cose sorprendono e sono la ragione per cui vanno letti e non indovinati:

1. `ColumnDef.is_not_null` è **sempre `undefined`** nell'albero grezzo: `NOT NULL` sta in `ColumnDef.constraints` come `Constraint` con `contype: "CONSTR_NOTNULL"`. Il campo `is_not_null` lo riempie l'analisi semantica, che qui non gira.
2. I nomi dei tipi sono quelli **interni**: `int8`, `int4`, `bool`, `timestamptz`, `bpchar`. Vanno ritradotti nella grafia che uno scrive. `text[]` arriva come `names: [{String:{sval:"text"}}]` **senza** il prefisso `pg_catalog` e con `arrayBounds: [{Integer:{ival:-1}}]`.
3. Un `REFERENCES` scritto sulla colonna produce un `CONSTR_FOREIGN` **senza `fk_attrs`**: la colonna è implicita. Va riempita col nome della colonna che si sta definendo, altrimenti la relazione nascerebbe con `source.attributes` vuoto — e quello è il marcatore delle relazioni disegnate a mano, che la potatura del Task 7 usa per non cancellarle.

E un vincolo di struttura: `parse()` è **tutto o niente**. Su `CREATE TABLE ok (a int); NOT SQL AT ALL;` lancia `SqlError` e non restituisce nemmeno lo statement buono. Quindi serve una seconda passata statement per statement, altrimenti un dump con una sola istruzione esotica non importa niente — e la spec §4.4 chiede tolleranza.

**Files:**
- Create: `src/io/ddl/pg.ts`
- Test: `src/io/ddl/pg.test.ts`

**Interfaces:**
- Consumes: `stripPsqlMeta`, `splitStatements` da `./sql-text`; `countSkipped`, `DdlParseResult`, `ParseWarning`, `SqlForeignKey`, `SqlTable` da `./schema`.
- Produces: `export async function parsePostgres(ddl: string): Promise<DdlParseResult>`

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `src/io/ddl/pg.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import synthetic from "../../../spike/fixtures/postgres.synthetic.sql?raw"
import { parsePostgres } from "./pg"

const find = (r: Awaited<ReturnType<typeof parsePostgres>>, name: string) => r.tables.find((t) => t.name === name)!

describe("parsePostgres", () => {
  it("legge i tipi nella grafia in cui si scrivono, non nei nomi interni", async () => {
    const r = await parsePostgres(`CREATE TABLE t (
      a bigint, b integer, c smallint, d boolean, e character varying(255),
      f numeric(10,2), g timestamp with time zone, h text, i text[], j double precision
    );`)
    expect(find(r, "t").columns.map((c) => c.type)).toEqual([
      "bigint", "integer", "smallint", "boolean", "varchar(255)",
      "numeric(10,2)", "timestamptz", "text", "text[]", "double precision",
    ])
  })

  it("NOT NULL si legge dai constraint della colonna, non da is_not_null", async () => {
    const r = await parsePostgres("CREATE TABLE t (a int NOT NULL, b int);")
    expect(find(r, "t").columns.map((c) => c.nullable)).toEqual([false, true])
  })

  it("lo schema qualificato finisce nel campo schema", async () => {
    const r = await parsePostgres("CREATE TABLE app.t (a int);")
    expect(find(r, "t").schema).toBe("app")
  })

  it("PRIMARY KEY, UNIQUE e FOREIGN KEY aggiunti con ALTER TABLE arrivano sulla tabella", async () => {
    const r = await parsePostgres(`
      CREATE TABLE app.parent (id bigint);
      CREATE TABLE app.child (id bigint, parent_id bigint, code text);
      ALTER TABLE ONLY app.child ADD CONSTRAINT child_pkey PRIMARY KEY (id);
      ALTER TABLE ONLY app.child ADD CONSTRAINT child_code_key UNIQUE (code);
      ALTER TABLE ONLY app.child ADD CONSTRAINT child_fk FOREIGN KEY (parent_id) REFERENCES app.parent(id);
    `)
    const child = find(r, "child")
    expect(child.primaryKey).toEqual(["id"])
    expect(child.unique).toEqual([["code"]])
    expect(child.foreignKeys).toEqual([
      { name: "child_fk", columns: ["parent_id"], refSchema: "app", refTable: "parent", refColumns: ["id"] },
    ])
  })

  it("ALTER COLUMN SET NOT NULL cambia la colonna già raccolta", async () => {
    const r = await parsePostgres("CREATE TABLE t (a int); ALTER TABLE ONLY t ALTER COLUMN a SET NOT NULL;")
    expect(find(r, "t").columns[0].nullable).toBe(false)
  })

  it("un REFERENCES scritto sulla colonna riempie columns col nome della colonna", async () => {
    const r = await parsePostgres("CREATE TABLE t (parent_id bigint REFERENCES other(id));")
    expect(find(r, "t").foreignKeys[0].columns).toEqual(["parent_id"])
  })

  it("i vincoli in linea nel CREATE TABLE si leggono come quelli aggiunti dopo", async () => {
    const r = await parsePostgres("CREATE TABLE t (id int PRIMARY KEY, code text UNIQUE, UNIQUE (id, code));")
    expect(find(r, "t").primaryKey).toEqual(["id"])
    expect(find(r, "t").unique).toEqual([["code"], ["id", "code"]])
  })

  it("un ALTER su una tabella sconosciuta è un avviso, non un errore", async () => {
    const r = await parsePostgres("ALTER TABLE ONLY assente ADD CONSTRAINT x PRIMARY KEY (id);")
    expect(r.tables).toEqual([])
    expect(r.warnings.some((w) => w.message.includes("assente"))).toBe(true)
  })

  it("i meta-comandi di pg_dump 18 non fanno fallire il parse", async () => {
    const r = await parsePostgres("\\restrict abc\nCREATE TABLE t (a int);\n\\unrestrict abc\n")
    expect(find(r, "t").columns).toHaveLength(1)
  })

  it("uno statement non riconosciuto non fa perdere gli altri, e diventa un avviso con la posizione", async () => {
    const r = await parsePostgres("CREATE TABLE ok (a int); NOT SQL AT ALL; CREATE TABLE altra (b int);")
    expect(r.tables.map((t) => t.name)).toEqual(["ok", "altra"])
    expect(r.warnings.some((w) => w.at !== undefined)).toBe(true)
  })

  it("conta per tipo gli statement che non usa", async () => {
    const r = await parsePostgres("CREATE TABLE t (a int); CREATE INDEX i ON t (a); CREATE SEQUENCE s;")
    expect(r.skipped).toMatchObject({ IndexStmt: 1, CreateSeqStmt: 1 })
  })

  it("digerisce la fixture sintetica da 200 tabelle con le sue 199 foreign key", async () => {
    const r = await parsePostgres(synthetic)
    expect(r.tables).toHaveLength(200)
    expect(r.tables.every((t) => t.schema === "app")).toBe(true)
    expect(r.tables.flatMap((t) => t.foreignKeys)).toHaveLength(199)
    expect(r.tables.every((t) => t.primaryKey.length === 1)).toBe(true)
    const t1 = find(r, "table_1")
    expect(t1.columns[0]).toEqual({ name: "id", type: "bigint", nullable: false })
    expect(t1.columns.find((c) => c.name === "col_1")).toEqual({ name: "col_1", type: "varchar(255)", nullable: true })
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm vitest run src/io/ddl/pg.test.ts`
Expected: FAIL — `Failed to resolve import "./pg"`.

- [ ] **Step 3: Scrivere l'adapter**

Creare `src/io/ddl/pg.ts`:

```ts
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
    for (const text of splitStatements(sql)) {
      try {
        out.push(...nodesOf(await parse(text)))
      } catch (one) {
        warnings.push(warnOf(one, `statement non riconosciuto (${text.slice(0, 60).replace(/\s+/g, " ")})`))
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
  for (const _ of removed) countSkipped(skipped, "meta-comando psql")

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
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `pnpm vitest run src/io/ddl/pg.test.ts`
Expected: PASS, 12 test.

Se il test dei tipi fallisce su `text[]`, la causa è che `arrayBounds` c'è ma `names` per `text` **non** ha il prefisso `pg_catalog`: il filtro deve togliere `pg_catalog` senza pretendere che ci sia.

- [ ] **Step 5: Lint e commit**

```bash
pnpm lint && pnpm test
git add src/io/ddl/pg.ts src/io/ddl/pg.test.ts
git commit -m "feat(io): adapter PostgreSQL dal pg_dump alla rappresentazione intermedia"
```

---

### Task 4: Adapter MySQL/MariaDB

Anche qui i percorsi dell'AST sono stati **verificati eseguendo `node-sql-parser@5.4.0`**. Le insidie:

1. `nullable` **è assente** sulle colonne nullabili: c'è solo quando la colonna è `NOT NULL`, nella forma `{ type: "not null", value: "not null" }`. L'assenza vuol dire nullabile, non «sconosciuto».
2. `constraint_type` ha il **case incoerente**: `"primary key"` e `"unique key"` minuscoli, `"FOREIGN KEY"` maiuscolo. E per l'unicità i tipi del pacchetto dichiarano **tre grafie**: `"unique key"`, `"unique"`, `"unique index"`.
3. Le `KEY` non uniche stanno su `resource: "index"`, **non** su `resource: "constraint"`, e non hanno `constraint_type`. Non ci interessano, ma vanno riconosciute per non contarle come sconosciute.
4. `dataType` è **maiuscolo** (`BIGINT`, `VARCHAR`), `suffix` è un array o `null` (`["UNSIGNED"]`), `length` e `scale` sono numeri.
5. Su un solo statement `astify` restituisce **l'oggetto**, non un array.
6. `reference_definition` è tipizzato `any` dal pacchetto: serve un tipo locale minimo, con un cast unico al confine.

**Files:**
- Create: `src/io/ddl/mysql.ts`
- Test: `src/io/ddl/mysql.test.ts`

**Interfaces:**
- Consumes: `splitStatements`, `stripExecutableComments` da `./sql-text`; `countSkipped`, `DdlParseResult`, `ParseWarning`, `SqlForeignKey`, `SqlTable` da `./schema`.
- Produces: `export function parseMysql(ddl: string): DdlParseResult` — **sincrona**, a differenza di `parsePostgres`, perché `node-sql-parser` non ha WASM da caricare.

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `src/io/ddl/mysql.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import synthetic from "../../../spike/fixtures/mysql.synthetic.sql?raw"
import { parseMysql } from "./mysql"

const find = (r: ReturnType<typeof parseMysql>, name: string) => r.tables.find((t) => t.name === name)!

describe("parseMysql", () => {
  it("ricompone i tipi con lunghezza, scala e modificatori, in minuscolo", () => {
    const r = parseMysql("CREATE TABLE `t` (`a` bigint(20) unsigned, `b` varchar(255), `c` decimal(10,2), `d` longtext);")
    expect(find(r, "t").columns.map((c) => c.type)).toEqual([
      "bigint(20) unsigned", "varchar(255)", "decimal(10,2)", "longtext",
    ])
  })

  it("l'assenza di nullable vuol dire nullabile", () => {
    const r = parseMysql("CREATE TABLE `t` (`a` int NOT NULL, `b` int DEFAULT NULL);")
    expect(find(r, "t").columns.map((c) => c.nullable)).toEqual([false, true])
  })

  it("PRIMARY KEY, UNIQUE KEY e FOREIGN KEY dentro il CREATE TABLE", () => {
    const r = parseMysql(`CREATE TABLE \`child\` (
      \`id\` bigint unsigned NOT NULL,
      \`code\` varchar(255) NOT NULL,
      \`parent_id\` bigint unsigned DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`child_code_unique\` (\`code\`),
      KEY \`child_parent_index\` (\`parent_id\`),
      CONSTRAINT \`child_fk\` FOREIGN KEY (\`parent_id\`) REFERENCES \`parent\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB;`)
    const child = find(r, "child")
    expect(child.primaryKey).toEqual(["id"])
    expect(child.unique).toEqual([["code"]])
    expect(child.foreignKeys).toEqual([
      { name: "child_fk", columns: ["parent_id"], refTable: "parent", refColumns: ["id"] },
    ])
  })

  it("la PRIMARY KEY spegne nullable anche senza NOT NULL scritto", () => {
    const r = parseMysql("CREATE TABLE `t` (`id` int, PRIMARY KEY (`id`));")
    expect(find(r, "t").columns[0].nullable).toBe(false)
  })

  it("una tabella senza PRIMARY KEY ha primaryKey vuoto e non è un errore", () => {
    const r = parseMysql("CREATE TABLE `t` (`a` int);")
    expect(find(r, "t").primaryKey).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it("un CHECK json_valid non rompe niente", () => {
    const r = parseMysql("CREATE TABLE `t` (`note` longtext DEFAULT NULL CHECK (json_valid(`note`)));")
    expect(find(r, "t").columns).toHaveLength(1)
  })

  it("il marcatore sandbox di MariaDB non produce un avviso", () => {
    const r = parseMysql("/*M!999999\\- enable the sandbox mode */;\nCREATE TABLE `t` (`a` int);")
    expect(find(r, "t").columns).toHaveLength(1)
    expect(r.warnings).toEqual([])
  })

  it("i commenti eseguibili si spogliano invece di essere scartati", () => {
    const r = parseMysql("/*!40101 SET NAMES utf8mb4 */;\nCREATE TABLE `t` (`a` int);")
    expect(find(r, "t").columns).toHaveLength(1)
    expect(r.skipped).toMatchObject({ "set:undefined": 1 })
  })

  it("ALTER TABLE ADD CONSTRAINT fuori dal CREATE TABLE arriva sulla tabella", () => {
    const r = parseMysql("CREATE TABLE `t` (`id` int, `p` int);\nALTER TABLE `t` ADD CONSTRAINT `t_fk` FOREIGN KEY (`p`) REFERENCES `o` (`id`);")
    expect(find(r, "t").foreignKeys[0].refTable).toBe("o")
  })

  it("un chunk non parsabile è un avviso e non fa perdere il resto", () => {
    const r = parseMysql("CREATE TABLE `ok` (`a` int);\nSET NAMES utf8mb4;\nCREATE TABLE `altra` (`b` int);")
    expect(r.tables.map((t) => t.name)).toEqual(["ok", "altra"])
    expect(r.warnings).toHaveLength(1)
  })

  it("digerisce la fixture sintetica da 200 tabelle con le sue 199 foreign key", () => {
    const r = parseMysql(synthetic)
    expect(r.tables).toHaveLength(200)
    expect(r.tables.flatMap((t) => t.foreignKeys)).toHaveLength(199)
    const t1 = find(r, "table_1")
    expect(t1.primaryKey).toEqual(["id"])
    expect(t1.unique).toEqual([["col_0"]])
    expect(t1.columns.find((c) => c.name === "col_1")).toEqual({ name: "col_1", type: "varchar(255)", nullable: true })
    expect(t1.columns.find((c) => c.name === "id")).toEqual({ name: "id", type: "bigint unsigned", nullable: false })
  })
})
```

Nota sull'asserzione `skipped: { "set:undefined": 1 }`: la chiave è `` `${ast.type}:${ast.keyword}` `` e uno `SET` non ha `keyword`. Se l'implementazione produce una chiave diversa, **è l'asserzione ad andare corretta sul valore vero**, non il codice a essere piegato: il conteggio serve solo al riepilogo del dialog.

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm vitest run src/io/ddl/mysql.test.ts`
Expected: FAIL — `Failed to resolve import "./mysql"`.

- [ ] **Step 3: Scrivere l'adapter**

Creare `src/io/ddl/mysql.ts`:

```ts
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
}

interface ColumnType {
  dataType?: string
  length?: number
  scale?: number
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
  const size = d?.length === undefined ? "" : d.scale === undefined ? `(${d.length})` : `(${d.length},${d.scale})`
  const suffix = (d?.suffix ?? []).map((s) => s.toLowerCase()).join(" ")
  return `${base}${size}${suffix ? ` ${suffix}` : ""}`
}

const isUnique = (t: string): boolean => ["unique key", "unique", "unique index"].includes(t)

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
  const alters: Array<{ table?: Array<{ table?: string }>; expr?: unknown }> = []

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
        byName.set(table.name, table)
      } else if (one.type === "alter") alters.push(one as (typeof alters)[number])
      else countSkipped(skipped, kind)
    }
  }

  for (const alter of alters) {
    const table = byName.get(alter.table?.[0]?.table ?? "")
    if (!table) {
      warnings.push({ message: `ALTER TABLE su una tabella non presente nel dump: ${alter.table?.[0]?.table ?? "?"}` })
      continue
    }
    const exprs = (Array.isArray(alter.expr) ? alter.expr : [alter.expr]) as Definition[]
    for (const d of exprs) if (!applyDefinition(table, d)) countSkipped(skipped, "alter:altro")
  }

  return { tables: [...byName.values()], warnings, skipped }
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `pnpm vitest run src/io/ddl/mysql.test.ts`
Expected: PASS, 11 test.

Il punto più probabile di scostamento è la forma dell'AST di `ALTER TABLE ADD CONSTRAINT`: `alter.expr` può essere un oggetto o un array, e il vincolo può stare un livello più in basso. **Stampare l'AST vero** (`console.log(JSON.stringify(parser.astify(sql, { database: "MySQL" }), null, 2))`) e adattare la lettura a quello, non tirare a indovinare. Se `expr` porta un involucro tipo `{ action: "add", …, create_definitions: … }`, leggere il vincolo da lì.

- [ ] **Step 5: Lint e commit**

```bash
pnpm lint && pnpm test
git add src/io/ddl/mysql.ts src/io/ddl/mysql.test.ts
git commit -m "feat(io): adapter MySQL/MariaDB dal mysqldump alla rappresentazione intermedia"
```

---

### Task 5: Worker unico e client protetto

> **Nota sull'ordine.** La spec chiama la verifica di `node-sql-parser` nel worker «il primo passo del piano». Sta qui, al Task 5, e non al Task 1, perché anticiparla richiederebbe un worker usa e getta e **non salverebbe lavoro**: gli adapter dei Task 3 e 4 sono funzioni pure e servono identiche in qualunque caso: se l'interop nel worker non funziona cambia solo *dove gira* `mysql.ts`, non che cosa fa. Il rischio è quindi contenuto e nessun task precedente va rifatto.

Qui sta l'unica incognita tecnica del piano: `node-sql-parser` è UMD/CJS ed è stato eseguito **solo** in Node. In Node ESM puro `import { Parser } from ".../build/mysql.js"` **non funziona** — verificato: `SyntaxError: Named export 'Parser' not found`. Sotto Vite l'interop CJS lo risolve (lo spike lo ha provato in vitest), ma **nel worker va verificato nel browser**, non dedotto.

Il resto del task è il ponteggio che lo spike ha segnalato come mancante: senza `onerror`, `onmessageerror` e un timeout, un fallimento di caricamento del `.wasm` lascia la promessa appesa per sempre e il dialog bloccato senza messaggio.

**Files:**
- Create: `src/io/ddl/parse-client.ts`
- Create: `src/io/ddl/parse.worker.ts`
- Create: `src/io/ddl/spawn.ts`
- Test: `src/io/ddl/parse-client.test.ts`

**Interfaces:**
- Consumes: `parsePostgres` da `./pg`, `parseMysql` da `./mysql`, `DdlParseResult` e `Dialect` da `./schema`.
- Produces:
  - `ParseRequest`, `ParseResponse`, `ParseWorker`, `DdlParser`, `PARSE_TIMEOUT_MS` da `parse-client.ts`
  - `export function createParser(spawn: () => ParseWorker, timeoutMs?: number): DdlParser`
  - `export const spawnParseWorker: () => ParseWorker` da `spawn.ts`

- [ ] **Step 1: Scrivere i test del client che falliscono**

Creare `src/io/ddl/parse-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { createParser, type ParseRequest, type ParseResponse, type ParseWorker } from "./parse-client"
import type { DdlParseResult } from "./schema"

const EMPTY: DdlParseResult = { tables: [], warnings: [], skipped: {} }

/** Worker finto: registra le richieste e lascia al test il momento in cui rispondere. */
class FakeWorker implements ParseWorker {
  sent: ParseRequest[] = []
  terminated = false
  private listeners = new Map<string, Array<(e: unknown) => void>>()

  postMessage(message: ParseRequest): void {
    this.sent.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  addEventListener(type: string, listener: (e: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener as (e: unknown) => void])
  }

  emit(type: string, event: unknown): void {
    for (const l of this.listeners.get(type) ?? []) l(event)
  }

  reply(response: ParseResponse): void {
    this.emit("message", { data: response })
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("createParser", () => {
  it("risolve con il risultato del worker", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("create table t ()", "postgres")
    expect(w.sent[0]).toMatchObject({ id: 1, dialect: "postgres", ddl: "create table t ()" })
    w.reply({ id: 1, ok: true, result: EMPTY })
    await expect(pending).resolves.toEqual(EMPTY)
  })

  it("rigetta col messaggio quando il worker riporta un errore", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "mysql")
    w.reply({ id: 1, ok: false, message: "parser esploso" })
    await expect(pending).rejects.toThrow("parser esploso")
  })

  it("un errore di caricamento del worker rigetta invece di lasciare la promessa appesa", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "postgres")
    w.emit("error", new Event("error"))
    await expect(pending).rejects.toThrow(/caricato/)
  })

  it("un messaggio illeggibile rigetta", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "postgres")
    w.emit("messageerror", new Event("messageerror"))
    await expect(pending).rejects.toThrow(/illeggibile/)
  })

  it("senza risposta va in timeout", async () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    const parser = createParser(() => w, 1000)
    const pending = parser.parse("x", "postgres")
    vi.advanceTimersByTime(1000)
    await expect(pending).rejects.toThrow(/in tempo/)
  })

  it("una risposta con id ignoto viene scartata e non rompe niente", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "postgres")
    w.reply({ id: 999, ok: true, result: EMPTY })
    w.reply({ id: 1, ok: true, result: EMPTY })
    await expect(pending).resolves.toEqual(EMPTY)
  })

  it("il worker si crea una volta sola e serve più analisi", async () => {
    let spawns = 0
    const w = new FakeWorker()
    const parser = createParser(() => {
      spawns++
      return w
    })
    const a = parser.parse("a", "postgres")
    const b = parser.parse("b", "mysql")
    w.reply({ id: 1, ok: true, result: EMPTY })
    w.reply({ id: 2, ok: true, result: EMPTY })
    await Promise.all([a, b])
    expect(spawns).toBe(1)
    expect(w.sent.map((s) => s.id)).toEqual([1, 2])
  })

  it("dispose termina il worker e rigetta le analisi in corso", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "postgres")
    parser.dispose()
    expect(w.terminated).toBe(true)
    await expect(pending).rejects.toThrow(/annullata/)
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm vitest run src/io/ddl/parse-client.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-client"`.

- [ ] **Step 3: Scrivere il client**

Creare `src/io/ddl/parse-client.ts`:

```ts
import type { DdlParseResult, Dialect } from "./schema"

export interface ParseRequest {
  id: number
  dialect: Dialect
  ddl: string
}

export type ParseResponse =
  | { id: number; ok: true; result: DdlParseResult }
  | { id: number; ok: false; message: string }

/**
 * Il sottoinsieme di `Worker` che serve; un `Worker` vero lo soddisfa, e i test iniettano un finto.
 * Stessa forma di `LockRequester` in `lock.ts`, per la stessa ragione: il worker non esiste in Node.
 */
export interface ParseWorker {
  postMessage: (message: ParseRequest) => void
  terminate: () => void
  addEventListener: (type: "message" | "error" | "messageerror", listener: (event: never) => void) => void
}

/** Si chiama `DdlParser` e non `Parser` perché `Parser` è la classe di `node-sql-parser`. */
export interface DdlParser {
  parse: (ddl: string, dialect: Dialect) => Promise<DdlParseResult>
  /** Termina il worker e rigetta le analisi in corso: chiudere il dialog annulla davvero. */
  dispose: () => void
}

/** 30 s: 200 tabelle costano 136 ms misurati, quindi il margine è tre ordini di grandezza. */
export const PARSE_TIMEOUT_MS = 30_000

interface Pending {
  resolve: (result: DdlParseResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Crea il worker alla prima analisi e lo tiene per le successive. Ogni promessa ha un timeout, e un
 * fallimento del worker le rigetta tutte: senza questo un `.wasm` che non carica lascia il dialog
 * bloccato senza messaggio.
 */
export function createParser(spawn: () => ParseWorker, timeoutMs: number = PARSE_TIMEOUT_MS): DdlParser {
  let worker: ParseWorker | null = null
  let nextId = 1
  const pending = new Map<number, Pending>()

  const failAll = (message: string): void => {
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(message))
    }
    pending.clear()
  }

  const settle = (event: MessageEvent<ParseResponse>): void => {
    const p = pending.get(event.data.id)
    // Risposta di un'analisi scaduta o superata da un'altra: si scarta senza far niente.
    if (!p) return
    pending.delete(event.data.id)
    clearTimeout(p.timer)
    if (event.data.ok) p.resolve(event.data.result)
    else p.reject(new Error(event.data.message))
  }

  const ensure = (): ParseWorker => {
    if (worker) return worker
    const w = spawn()
    w.addEventListener("message", settle as (event: never) => void)
    w.addEventListener("error", (() => failAll("il parser non è stato caricato")) as (event: never) => void)
    w.addEventListener("messageerror", (() => failAll("risposta del parser illeggibile")) as (event: never) => void)
    worker = w
    return w
  }

  return {
    parse: (ddl, dialect) =>
      new Promise<DdlParseResult>((resolve, reject) => {
        const id = nextId++
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error("il parser non ha risposto in tempo"))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        ensure().postMessage({ id, dialect, ddl })
      }),
    dispose: () => {
      failAll("analisi annullata")
      worker?.terminate()
      worker = null
    },
  }
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `pnpm vitest run src/io/ddl/parse-client.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Scrivere il worker e la sua fabbrica**

Creare `src/io/ddl/parse.worker.ts`:

```ts
import type { ParseRequest, ParseResponse } from "./parse-client"

/**
 * In un worker `self` non è `Window`: il tipo `DedicatedWorkerGlobalScope` sta in `lib.webworker`, che
 * questo progetto non carica (ha `lib` DOM, e mescolarle dà dichiarazioni duplicate). Qui si dichiara
 * il minimo che serve, che ombreggia il globale solo per questo modulo.
 */
declare const self: {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null
  postMessage: (message: ParseResponse) => void
}

/**
 * Un worker unico per i due dialetti: `import()` dinamico tiene i due parser in chunk separati, quindi
 * chi importa Postgres non scarica `node-sql-parser` e viceversa. Due worker separati avrebbero
 * raddoppiato protocollo e protezione senza guadagnare questa proprietà, che viene dall'`import()`.
 */
self.onmessage = (event) => {
  const { id, dialect, ddl } = event.data
  const run = async (): Promise<ParseResponse> => {
    try {
      const result =
        dialect === "postgres"
          ? await (await import("./pg")).parsePostgres(ddl)
          : (await import("./mysql")).parseMysql(ddl)
      return { id, ok: true, result }
    } catch (e) {
      return { id, ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
  void run().then((response) => self.postMessage(response))
}
```

Creare `src/io/ddl/spawn.ts`:

```ts
import type { ParseWorker } from "./parse-client"
import ParseWorkerConstructor from "./parse.worker?worker"

/**
 * Vive in un file suo perché `?worker` è una trasformazione di Vite: importarlo da `parse-client.ts`
 * lo tirerebbe dentro i test, che girano in Node dove `Worker` non esiste.
 */
export const spawnParseWorker = (): ParseWorker => new ParseWorkerConstructor()
```

Se `tsc` rifiuta l'assegnazione da `Worker` a `ParseWorker` per via delle firme sovraccariche di `addEventListener`, castare **una volta sola qui**, con un commento che dica perché — non allargare `ParseWorker`.

- [ ] **Step 6: Verificare nel browser che entrambi i parser funzionino nel worker**

È l'incognita del piano e va **osservata**, non dedotta. Aggiungere temporaneamente in coda a `src/main.tsx`:

```ts
// SONDA TEMPORANEA — da rimuovere prima del commit.
if (new URLSearchParams(location.search).get("ddlprobe") === "1") {
  void (async () => {
    const { createParser } = await import("@/io/ddl/parse-client")
    const { spawnParseWorker } = await import("@/io/ddl/spawn")
    const parser = createParser(spawnParseWorker)
    for (const [dialect, ddl] of [
      ["postgres", "CREATE TABLE app.t (id bigint NOT NULL);"],
      ["mysql", "CREATE TABLE `t` (`id` bigint unsigned NOT NULL);"],
    ] as const) {
      try {
        const r = await parser.parse(ddl, dialect)
        console.log("SONDA", dialect, "ok:", r.tables.length, "tabelle", JSON.stringify(r.tables[0]))
      } catch (e) {
        console.error("SONDA", dialect, "FALLITA:", e)
      }
    }
    parser.dispose()
  })()
}
```

Poi avviare il dev server e aprire `/?ddlprobe=1`, e leggere la console del browser. Attese: due righe `SONDA postgres ok: 1 tabelle …` e `SONDA mysql ok: 1 tabelle …`.

**Se il ramo MySQL fallisce** con un errore di export o di interop CJS, provare nell'ordine, fermandosi al primo che funziona: (1) `import Pkg from "node-sql-parser/build/mysql"` e poi `const { Parser } = Pkg`; (2) aggiungere `optimizeDeps: { include: ["node-sql-parser/build/mysql"] }` in `vite.config.ts`; (3) come ultima risorsa tenere il solo ramo MySQL sul thread principale, importandolo dal client invece che dal worker. Qualunque via si prenda, **scriverla nel report del task**: è una decisione di architettura, non un dettaglio.

**Se il ramo Postgres fallisce** con `CompileError: expected magic word`, il `.wasm` non viene servito: il plugin `libpgQueryWasm` in `vite.config.ts` esiste già e serve qualunque URL che finisce per `/libpg-query.wasm` — controllare nella scheda Rete quale URL viene chiesta.

- [ ] **Step 7: Rimuovere la sonda, lint e commit**

La sonda **non si committa**. Rimuoverla da `src/main.tsx` e verificare con `git diff src/main.tsx` che il file sia tornato identico all'originale.

```bash
git diff --stat src/main.tsx   # deve essere vuoto
pnpm lint && pnpm test && pnpm build
git add src/io/ddl/parse-client.ts src/io/ddl/parse.worker.ts src/io/ddl/spawn.ts src/io/ddl/parse-client.test.ts
git commit -m "feat(io): worker unico dei parser DDL, con timeout e rigetto degli errori di caricamento"
```

---

### Task 6: Mapping verso il modello ER

**Files:**
- Create: `src/io/ddl/map.ts`
- Test: `src/io/ddl/map.test.ts`

**Interfaces:**
- Consumes: `SqlTable`, `SqlColumn`, `SqlForeignKey` da `./schema`; `entityKey`, `Attribute`, `Entity`, `ErModel`, `Relationship` da `@/model/document`.
- Produces:
  - `export interface MapInput { tables: SqlTable[]; model: ErModel }`
  - `export interface MapOutput { entities: Record<string, Entity>; relationships: Relationship[]; warnings: string[] }`
  - `export function mapToEr(input: MapInput): MapOutput`

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `src/io/ddl/map.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { ErModel } from "@/model/document"
import { mapToEr } from "./map"
import type { SqlTable } from "./schema"

const EMPTY_MODEL: ErModel = { entities: {}, relationships: {} }

const table = (over: Partial<SqlTable> & Pick<SqlTable, "name">): SqlTable => ({
  columns: [],
  primaryKey: [],
  unique: [],
  foreignKeys: [],
  ...over,
})

const child = (over: Partial<SqlTable> = {}): SqlTable =>
  table({
    name: "child",
    columns: [
      { name: "id", type: "bigint", nullable: false },
      { name: "parent_id", type: "bigint", nullable: false },
    ],
    primaryKey: ["id"],
    foreignKeys: [{ name: "child_fk", columns: ["parent_id"], refTable: "parent", refColumns: ["id"] }],
    ...over,
  })

const parent = (): SqlTable => table({ name: "parent", columns: [{ name: "id", type: "bigint", nullable: false }], primaryKey: ["id"] })

describe("mapToEr — entità e attributi", () => {
  it("la chiave dell'entità è schema.nome quando lo schema c'è, il nome nudo quando manca", () => {
    const r = mapToEr({ tables: [table({ name: "t", schema: "app" }), table({ name: "u" })], model: EMPTY_MODEL })
    expect(Object.keys(r.entities).sort()).toEqual(["app.t", "u"])
  })

  it("primaryKey, unique, foreignKey e nullable finiscono sugli attributi", () => {
    const r = mapToEr({
      tables: [
        table({
          name: "t",
          columns: [
            { name: "id", type: "bigint", nullable: false },
            { name: "code", type: "text", nullable: true },
            { name: "other_id", type: "bigint", nullable: true },
          ],
          primaryKey: ["id"],
          unique: [["code"]],
          foreignKeys: [{ columns: ["other_id"], refTable: "other", refColumns: ["id"] }],
        }),
        table({ name: "other", columns: [{ name: "id", type: "bigint", nullable: false }], primaryKey: ["id"] }),
      ],
      model: EMPTY_MODEL,
    })
    expect(r.entities["t"].attributes).toEqual([
      { name: "id", type: "bigint", primaryKey: true, foreignKey: false, nullable: false, unique: false },
      { name: "code", type: "text", primaryKey: false, foreignKey: false, nullable: true, unique: true },
      { name: "other_id", type: "bigint", primaryKey: false, foreignKey: true, nullable: true, unique: false },
    ])
  })

  it("un vincolo UNIQUE su più colonne non marca nessuna colonna e produce un avviso col conteggio", () => {
    const r = mapToEr({ tables: [table({ name: "t", columns: [{ name: "a", type: "int", nullable: true }], unique: [["a", "b"]] })], model: EMPTY_MODEL })
    expect(r.entities["t"].attributes[0].unique).toBe(false)
    expect(r.warnings.some((w) => w.includes("1") && w.includes("UNIQUE"))).toBe(true)
  })
})

describe("mapToEr — cardinalità", () => {
  it("FK non nullabile: il padre è esattamente uno", () => {
    const r = mapToEr({ tables: [child(), parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].target.cardinality).toBe("one")
  })

  it("FK nullabile: il padre è opzionale", () => {
    const t = child({ columns: [{ name: "id", type: "bigint", nullable: false }, { name: "parent_id", type: "bigint", nullable: true }] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].target.cardinality).toBe("zero-or-one")
  })

  it("FK non unica nel figlio: molti figli per padre", () => {
    const r = mapToEr({ tables: [child(), parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].source.cardinality).toBe("zero-or-many")
  })

  it("FK unica nel figlio: relazione uno a uno", () => {
    const t = child({ unique: [["parent_id"]] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].source.cardinality).toBe("zero-or-one")
  })

  it("FK che è la PRIMARY KEY del figlio: uno a uno e identificante", () => {
    const t = child({ primaryKey: ["parent_id"] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].source.cardinality).toBe("zero-or-one")
    expect(r.relationships[0].identifying).toBe(true)
  })

  it("FK fuori dalla PRIMARY KEY: non identificante", () => {
    const r = mapToEr({ tables: [child(), parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].identifying).toBe(false)
  })

  it("senza PRIMARY KEY nel figlio la relazione non è identificante", () => {
    const t = child({ primaryKey: [] })
    const r = mapToEr({ tables: [t, parent()], model: EMPTY_MODEL })
    expect(r.relationships[0].identifying).toBe(false)
  })
})

describe("mapToEr — risoluzione dei riferimenti", () => {
  it("la relazione porta nome, estremi e colonne di entrambi i lati", () => {
    const r = mapToEr({ tables: [child(), parent()], model: EMPTY_MODEL })
    expect(r.relationships[0]).toEqual({
      name: "child_fk",
      source: { entity: "child", attributes: ["parent_id"], cardinality: "zero-or-many" },
      target: { entity: "parent", attributes: ["id"], cardinality: "one" },
      identifying: false,
    })
  })

  it("risolve un riferimento non qualificato verso un'entità già sul canvas", () => {
    const model: ErModel = {
      entities: { parent: { name: "parent", attributes: [] } },
      relationships: {},
    }
    const r = mapToEr({ tables: [child()], model })
    expect(r.relationships).toHaveLength(1)
    expect(r.relationships[0].target.entity).toBe("parent")
  })

  it("una FK verso una tabella assente salta la relazione e lascia un avviso", () => {
    const r = mapToEr({ tables: [child()], model: EMPTY_MODEL })
    expect(r.relationships).toEqual([])
    expect(r.warnings.some((w) => w.includes("parent"))).toBe(true)
  })

  it("un nome ambiguo fra due schemi salta la relazione e dice l'ambiguità", () => {
    const r = mapToEr({
      tables: [child(), table({ name: "parent", schema: "a" }), table({ name: "parent", schema: "b" })],
      model: EMPTY_MODEL,
    })
    expect(r.relationships).toEqual([])
    expect(r.warnings.some((w) => w.includes("ambiguo"))).toBe(true)
  })

  it("un riferimento qualificato va all'entità di quello schema", () => {
    const r = mapToEr({
      tables: [
        child({ foreignKeys: [{ columns: ["parent_id"], refSchema: "b", refTable: "parent", refColumns: ["id"] }] }),
        table({ name: "parent", schema: "a" }),
        table({ name: "parent", schema: "b" }),
      ],
      model: EMPTY_MODEL,
    })
    expect(r.relationships[0].target.entity).toBe("b.parent")
  })

  it("una FK verso se stessa non è un caso speciale", () => {
    const t = table({
      name: "node",
      columns: [{ name: "id", type: "int", nullable: false }, { name: "parent_id", type: "int", nullable: true }],
      primaryKey: ["id"],
      foreignKeys: [{ columns: ["parent_id"], refTable: "node", refColumns: ["id"] }],
    })
    const r = mapToEr({ tables: [t], model: EMPTY_MODEL })
    expect(r.relationships[0].source.entity).toBe("node")
    expect(r.relationships[0].target.entity).toBe("node")
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm vitest run src/io/ddl/map.test.ts`
Expected: FAIL — `Failed to resolve import "./map"`.

- [ ] **Step 3: Scrivere il mapping**

Creare `src/io/ddl/map.ts`:

```ts
import { entityKey, type Attribute, type Cardinality, type Entity, type ErModel, type Relationship } from "@/model/document"
import type { SqlColumn, SqlForeignKey, SqlTable } from "./schema"

export interface MapInput {
  /** Solo le tabelle scelte nel dialog. */
  tables: SqlTable[]
  /** Il modello corrente: serve a risolvere i riferimenti verso entità già sul canvas. */
  model: ErModel
}

export interface MapOutput {
  /** Chiave = entityKey, come impone il refine di ErModelSchema. */
  entities: Record<string, Entity>
  /** Lista, non record: le chiavi si assegnano nella recipe, dopo la potatura. */
  relationships: Relationship[]
  warnings: string[]
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length > 0 && a.length === b.length && a.every((x) => b.includes(x))

function attribute(table: SqlTable, column: SqlColumn, fkColumns: ReadonlySet<string>): Attribute {
  const primaryKey = table.primaryKey.includes(column.name)
  return {
    name: column.name,
    type: column.type,
    primaryKey,
    foreignKey: fkColumns.has(column.name),
    // La PRIMARY KEY implica NOT NULL in entrambi i dialetti, anche dove il DDL non lo scrive.
    nullable: column.nullable && !primaryKey,
    // Un UNIQUE su più colonne non è rappresentabile sull'attributo: non marca nessuna delle sue colonne.
    unique: table.unique.some((u) => u.length === 1 && u[0] === column.name),
  }
}

/** Il nome senza schema, per risolvere i riferimenti che non lo qualificano. */
const bareName = (key: string): string => (key.includes(".") ? key.slice(key.indexOf(".") + 1) : key)

export function mapToEr({ tables, model }: MapInput): MapOutput {
  const warnings: string[] = []
  const entities: Record<string, Entity> = {}
  for (const t of tables) {
    const fkColumns = new Set(t.foreignKeys.flatMap((f) => f.columns))
    const entity: Entity = {
      name: t.name,
      ...(t.schema ? { schema: t.schema } : {}),
      attributes: t.columns.map((c) => attribute(t, c, fkColumns)),
    }
    entities[entityKey(entity)] = entity
  }

  // Le entità già sul canvas contano quanto quelle in arrivo: una FK può puntare a una di quelle.
  const known = new Set([...Object.keys(entities), ...Object.keys(model.entities)])
  const byBareName = new Map<string, string[]>()
  for (const key of known) {
    const bare = bareName(key)
    byBareName.set(bare, [...(byBareName.get(bare) ?? []), key])
  }

  const resolve = (fk: SqlForeignKey, from: string): string | null => {
    if (fk.refSchema) {
      const key = `${fk.refSchema}.${fk.refTable}`
      if (known.has(key)) return key
      warnings.push(`relazione saltata: ${from} punta a "${key}", che non è nel diagramma`)
      return null
    }
    const matches = byBareName.get(fk.refTable) ?? []
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) {
      warnings.push(`relazione saltata: il riferimento a "${fk.refTable}" da ${from} è ambiguo, corrisponde a ${matches.join(" e ")}`)
      return null
    }
    warnings.push(`relazione saltata: ${from} punta a "${fk.refTable}", che non è nel diagramma`)
    return null
  }

  const relationships: Relationship[] = []
  let compositeUnique = 0
  for (const t of tables) {
    compositeUnique += t.unique.filter((u) => u.length > 1).length
    const sourceKey = entityKey({ name: t.name, schema: t.schema })
    const nullableOf = new Map(t.columns.map((c) => [c.name, c.nullable]))
    for (const fk of t.foreignKeys) {
      const targetKey = resolve(fk, `${sourceKey}(${fk.columns.join(", ")})`)
      if (!targetKey) continue
      // Colonna sconosciuta: prudenza, la si tratta come nullabile.
      const optional = fk.columns.some((c) => nullableOf.get(c) ?? true)
      // Se le colonne della FK sono la PK o un UNIQUE del figlio, per ogni padre c'è al più un figlio.
      const oneToOne = sameSet(fk.columns, t.primaryKey) || t.unique.some((u) => sameSet(u, fk.columns))
      const source: Cardinality = oneToOne ? "zero-or-one" : "zero-or-many"
      const target: Cardinality = optional ? "zero-or-one" : "one"
      relationships.push({
        ...(fk.name ? { name: fk.name } : {}),
        source: { entity: sourceKey, attributes: fk.columns, cardinality: source },
        target: { entity: targetKey, attributes: fk.refColumns, cardinality: target },
        identifying: t.primaryKey.length > 0 && fk.columns.every((c) => t.primaryKey.includes(c)),
      })
    }
  }

  if (compositeUnique > 0) {
    warnings.push(`${compositeUnique} vincoli UNIQUE su più colonne non sono rappresentabili nel modello e sono stati ignorati`)
  }

  return { entities, relationships, warnings }
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `pnpm vitest run src/io/ddl/map.test.ts`
Expected: PASS, 15 test.

- [ ] **Step 5: Lint e commit**

```bash
pnpm lint && pnpm test
git add src/io/ddl/map.ts src/io/ddl/map.test.ts
git commit -m "feat(io): mapping dal DDL a entità e relazioni, con cardinalità dedotte dalle FK"
```

---

### Task 7: Il comando di import

Due regole vanno azzeccate, e sbagliarle si vede solo al secondo import.

**La potatura.** Senza, un re-import duplica le relazioni. Con una potatura troppo larga, cancella le connessioni disegnate a mano. La condizione giusta usa un invariante che il modello già dichiara: `RelationshipEndSchema.attributes` è *«vuoto per relazioni disegnate a mano»*. Quindi si eliminano le relazioni il cui `source.entity` è fra le entità in arrivo **e** che hanno `source.attributes` non vuoto.

**L'ordine.** Le chiavi delle relazioni si assegnano **dopo** la potatura: calcolarle prima le farebbe collidere con relazioni che stanno per sparire, e `uniqueKey` produrrebbe dei `_2` inutili.

**Files:**
- Create: `src/editor/commands/import.ts`
- Test: `src/editor/commands/import.test.ts`

**Interfaces:**
- Consumes: `uniqueKey` da `./er`; `Recipe` da `../document-store`; `erDiagram` da `../er-access`; `entityRect`, `entitySize`, `rectsBounds`, `snap`, `Point`, `Rect` da `../er-geometry`; `Entity`, `ErDiagram`, `Relationship` da `@/model/document`.
- Produces:
  - `export function placeNew(entities: Record<string, Entity>, diagram: ErDiagram): Record<string, Point>`
  - `export function importEr(entities: Record<string, Entity>, relationships: readonly Relationship[]): Recipe`

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `src/editor/commands/import.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument, type Entity, type ErDocument, type Relationship } from "@/model/document"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { importEr, placeNew } from "./import"

const entity = (name: string, attributes: string[] = ["id"]): Entity => ({
  name,
  attributes: attributes.map((n) => ({ name: n, type: "int", primaryKey: n === "id", foreignKey: false, nullable: false, unique: false })),
})

const derived = (source: string, target: string): Relationship => ({
  source: { entity: source, attributes: ["parent_id"], cardinality: "zero-or-many" },
  target: { entity: target, attributes: ["id"], cardinality: "one" },
  identifying: false,
})

/** Una relazione disegnata a mano: estremi senza attributi, come documenta RelationshipEndSchema. */
const byHand = (source: string, target: string): Relationship => ({
  source: { entity: source, attributes: [], cardinality: "zero-or-many" },
  target: { entity: target, attributes: [], cardinality: "one" },
  identifying: false,
})

const doc = (): ErDocument => createErDocument("prova", "doc-1")
const diagram = () => erDiagram(documentStore.getState().doc)

beforeEach(() => {
  documentStore.getState().load(doc())
})

describe("importEr", () => {
  it("crea le entità nuove con una posizione e le relazioni con la convenzione delle chiavi", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")]))
    const d = diagram()
    expect(Object.keys(d.model.entities).sort()).toEqual(["a", "b"])
    expect(Object.keys(d.view.nodes).sort()).toEqual(["a", "b"])
    expect(Object.keys(d.model.relationships)).toEqual(["a_b"])
  })

  it("un import è un solo comando: un undo lo annulla tutto", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")]))
    expect(documentStore.getState().past).toHaveLength(1)
    documentStore.getState().undo()
    expect(diagram().model.entities).toEqual({})
    expect(diagram().model.relationships).toEqual({})
    expect(diagram().view.nodes).toEqual({})
  })

  it("una tabella che c'è già viene sostituita e tiene la posizione", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a") }, []))
    const before = { ...diagram().view.nodes["a"] }
    documentStore.getState().dispatch(importEr({ a: entity("a", ["id", "nuovo"]) }, []))
    expect(diagram().model.entities["a"].attributes.map((x) => x.name)).toEqual(["id", "nuovo"])
    expect(diagram().view.nodes["a"]).toEqual(before)
  })

  it("il re-import non duplica le relazioni derivate", () => {
    const payload = () => importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")])
    documentStore.getState().dispatch(payload())
    documentStore.getState().dispatch(payload())
    expect(Object.keys(diagram().model.relationships)).toEqual(["a_b"])
  })

  it("una relazione disegnata a mano sopravvive al re-import", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, []))
    documentStore.getState().dispatch((draft) => {
      erDiagram(draft).model.relationships["manuale"] = byHand("a", "b")
    })
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")]))
    expect(Object.keys(diagram().model.relationships).sort()).toEqual(["a_b", "manuale"])
  })

  it("una relazione derivata verso un'entità in arrivo, ma da un'entità che resta, non si tocca", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived("a", "b")]))
    documentStore.getState().dispatch(importEr({ b: entity("b") }, []))
    expect(Object.keys(diagram().model.relationships)).toEqual(["a_b"])
  })
})

describe("placeNew", () => {
  it("dà una posizione solo alle entità nuove", () => {
    documentStore.getState().dispatch(importEr({ a: entity("a") }, []))
    expect(Object.keys(placeNew({ a: entity("a"), b: entity("b") }, diagram()))).toEqual(["b"])
  })

  it("è deterministico a parità di ingresso", () => {
    const entities = { a: entity("a"), b: entity("b"), c: entity("c") }
    expect(placeNew(entities, diagram())).toEqual(placeNew(entities, diagram()))
  })

  it("non sovrappone le entità nuove a quelle già sul canvas", () => {
    documentStore.getState().dispatch(importEr({ vecchia: entity("vecchia") }, []))
    const placed = placeNew({ nuova: entity("nuova") }, diagram())
    expect(placed["nuova"].y).toBeGreaterThan(diagram().view.nodes["vecchia"].y)
  })

  it("dispone in griglia, quindi la seconda entità non finisce sopra la prima", () => {
    const placed = placeNew({ a: entity("a"), b: entity("b") }, diagram())
    expect(placed["a"]).not.toEqual(placed["b"])
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm vitest run src/editor/commands/import.test.ts`
Expected: FAIL — `Failed to resolve import "./import"`.

- [ ] **Step 3: Scrivere il comando**

Creare `src/editor/commands/import.ts`:

```ts
import type { Entity, ErDiagram, Relationship } from "@/model/document"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { entityRect, entitySize, rectsBounds, snap, type Point, type Rect } from "../er-geometry"
import { uniqueKey } from "./er"

/** Spazio fra le celle della griglia e fra l'import e ciò che c'è già. */
const GUTTER = 40

/**
 * Posizioni per le sole entità nuove: griglia deterministica di `ceil(√n)` colonne, con la cella pari
 * all'entità più grande del lotto. L'origine sta sotto tutto ciò che è già sul canvas, così un import
 * non copre mai il lavoro esistente. Non è auto layout: è una disposizione leggibile e trascinabile.
 */
export function placeNew(entities: Record<string, Entity>, diagram: ErDiagram): Record<string, Point> {
  const fresh = Object.keys(entities).filter((key) => !(key in diagram.view.nodes))
  if (fresh.length === 0) return {}

  const sizes = fresh.map((key) => entitySize(entities[key], false))
  const cellW = snap(Math.max(...sizes.map((s) => s.w)) + GUTTER)
  const cellH = snap(Math.max(...sizes.map((s) => s.h)) + GUTTER)
  const cols = Math.ceil(Math.sqrt(fresh.length))

  const existing: Rect[] = Object.entries(diagram.view.nodes)
    .map(([key, view]) => {
      const entity = diagram.model.entities[key]
      return entity ? entityRect(entity, view) : null
    })
    .filter((r): r is Rect => r !== null)
  const bounds = rectsBounds(existing)
  const originX = snap(bounds ? bounds.x : GUTTER)
  const originY = snap(bounds ? bounds.y + bounds.h + GUTTER : GUTTER)

  const out: Record<string, Point> = {}
  fresh.forEach((key, i) => {
    out[key] = { x: snap(originX + (i % cols) * cellW), y: snap(originY + Math.floor(i / cols) * cellH) }
  })
  return out
}

/**
 * Innesta le entità e le relazioni importate nel documento aperto, in un solo comando: un ⌘Z annulla
 * tutto l'import. Una tabella che c'è già viene sostituita e tiene la posizione.
 */
export function importEr(entities: Record<string, Entity>, relationships: readonly Relationship[]): Recipe {
  return (draft) => {
    const d = erDiagram(draft)
    // Prima delle mutazioni: le posizioni si calcolano sui bounds di ciò che c'è ora.
    const positions = placeNew(entities, d)

    for (const [key, entity] of Object.entries(entities)) {
      d.model.entities[key] = entity
      // Chi c'era tiene il suo nodo, quindi la posizione che l'utente le ha dato sopravvive.
      if (!(key in d.view.nodes)) d.view.nodes[key] = { ...positions[key], collapsed: false }
    }

    // Via le relazioni derivate da una FK delle tabelle in arrivo, altrimenti il re-import le duplica.
    // `source.attributes` vuoto è il marcatore delle relazioni disegnate a mano: quelle sopravvivono.
    for (const [key, rel] of Object.entries(d.model.relationships)) {
      if (rel.source.entity in entities && rel.source.attributes.length > 0) delete d.model.relationships[key]
    }

    // Le chiavi si assegnano qui, dopo la potatura: prima collidevano con relazioni che stanno per sparire.
    for (const rel of relationships) {
      d.model.relationships[uniqueKey(d.model.relationships, `${rel.source.entity}_${rel.target.entity}`)] = rel
    }
  }
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `pnpm vitest run src/editor/commands/import.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Lint e commit**

```bash
pnpm lint && pnpm test
git add src/editor/commands/import.ts src/editor/commands/import.test.ts
git commit -m "feat(editor): comando di import, con sostituzione che tiene la posizione e potatura delle sole relazioni derivate"
```

---

### Task 8: Il dialog

Un solo pannello con quattro stati, non un wizard. Dopo l'import **non si chiude**: mostra l'esito con i warning, che sono il punto in cui l'utente scopre che tre FK sono cadute — chiudendosi li butterebbe via nel momento in cui diventano utili.

Attenzione a un'insidia di Radix, non a un problema di logica: un `Dialog` aperto da un `DropdownMenuItem` litiga sul fuoco, perché il menu si chiude e restituisce il fuoco al trigger mentre il dialog lo sta prendendo. Il dialog va reso **fratello** del `DropdownMenu`, controllato da stato, e va **verificato nel browser**.

**Files:**
- Create: `src/ui/import/ImportDdlDialog.tsx`
- Create (da shadcn): `src/components/ui/dialog.tsx`, `src/components/ui/checkbox.tsx`
- Modify: `src/ui/DocumentMenu.tsx`

**Interfaces:**
- Consumes: `createParser` e `DdlParser` da `@/io/ddl/parse-client`; `spawnParseWorker` da `@/io/ddl/spawn`; `detectDialect` da `@/io/ddl/detect`; `mapToEr` da `@/io/ddl/map`; `DdlParseResult`, `Dialect`, `SqlTable` da `@/io/ddl/schema`; `importEr` da `@/editor/commands/import`; `documentStore` da `@/editor/document-store` (via `useStore` di zustand); `erDiagram` da `@/editor/er-access`; `entityKey` da `@/model/document`; `documentSession` da `@/io/document-session`.
- Produces: `export function ImportDdlDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`

- [ ] **Step 1: Generare i due componenti shadcn**

```bash
pnpm dlx shadcn@latest add dialog checkbox -y
git status --short   # attesi solo src/components/ui/dialog.tsx e checkbox.tsx (più eventuali dipendenze radix già presenti)
```

Se il comando tocca `package.json`, controllare che aggiunga solo pacchetti Radix già in albero come dipendenze di `radix-ui`: **nessuna dipendenza nuova** oltre a quelle che shadcn richiede per questi due componenti.

- [ ] **Step 2: Scrivere il dialog**

Creare `src/ui/import/ImportDdlDialog.tsx`:

```tsx
import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { importEr } from "@/editor/commands/import"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { detectDialect } from "@/io/ddl/detect"
import { mapToEr } from "@/io/ddl/map"
import { createParser, type DdlParser } from "@/io/ddl/parse-client"
import type { DdlParseResult, Dialect, SqlTable } from "@/io/ddl/schema"
import { spawnParseWorker } from "@/io/ddl/spawn"
import { entityKey } from "@/model/document"

/** Etichette per i tipi di statement più frequenti; per gli altri si mostra la chiave del parser. */
const SKIPPED_LABELS: Record<string, string> = {
  IndexStmt: "indici",
  CreateSeqStmt: "sequenze",
  AlterSeqStmt: "sequenze",
  CreateSchemaStmt: "schemi",
  CommentStmt: "commenti",
  VariableSetStmt: "SET di sessione",
  ViewStmt: "viste",
  CreateTrigStmt: "trigger",
  CreateFunctionStmt: "funzioni",
  GrantStmt: "permessi",
  CreateEnumStmt: "tipi enum",
  "drop:table": "DROP TABLE",
  "insert:undefined": "righe di dati",
  "set:undefined": "SET di sessione",
  "commento eseguibile": "commenti eseguibili",
  "meta-comando psql": "meta-comandi psql",
}

type Stage =
  | { kind: "vuoto" }
  | { kind: "analisi" }
  | { kind: "pronto"; result: DdlParseResult }
  | { kind: "errore"; message: string }
  | { kind: "fatto"; tables: number; relationships: number; warnings: string[] }

const keyOf = (t: SqlTable): string => entityKey({ name: t.name, schema: t.schema })

const summary = (skipped: Record<string, number>): string =>
  Object.entries(skipped)
    .map(([kind, n]) => `${n} ${SKIPPED_LABELS[kind] ?? kind}`)
    .join(", ")

export function ImportDdlDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState("")
  const [dialect, setDialect] = useState<Dialect>("postgres")
  const [stage, setStage] = useState<Stage>({ kind: "vuoto" })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const parser = useRef<DdlParser | null>(null)

  // Iscrizione e non `getState()`: il render deve essere puro, e dopo un import la lista si riaggiorna.
  const doc = useStore(documentStore, (s) => s.doc)
  const present = new Set(Object.keys(erDiagram(doc).model.entities))

  const analyse = async (ddl: string, which: Dialect) => {
    setStage({ kind: "analisi" })
    parser.current ??= createParser(spawnParseWorker)
    try {
      const result = await parser.current.parse(ddl, which)
      setChosen(new Set(result.tables.map(keyOf)))
      setStage({ kind: "pronto", result })
    } catch (e) {
      setStage({ kind: "errore", message: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Il testo che arriva da una incollata o da un file si analizza da sé; quello digitato col pulsante. */
  const receive = (ddl: string) => {
    setText(ddl)
    const which = detectDialect(ddl)
    setDialect(which)
    void analyse(ddl, which)
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const ddl = e.clipboardData.getData("text")
    if (!ddl) return
    e.preventDefault()
    receive(ddl)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) receive(await file.text())
  }

  const onImport = () => {
    if (stage.kind !== "pronto") return
    const tables = stage.result.tables.filter((t) => chosen.has(keyOf(t)))
    const model = erDiagram(documentStore.getState().doc).model
    const { entities, relationships, warnings } = mapToEr({ tables, model })
    documentStore.getState().dispatch(importEr(entities, relationships))
    setStage({ kind: "fatto", tables: Object.keys(entities).length, relationships: relationships.length, warnings })
  }

  const close = (next: boolean) => {
    if (!next) {
      // Terminare il worker è ciò che rende immediato l'annullamento e non lascia lavoro orfano.
      parser.current?.dispose()
      parser.current = null
      setText("")
      setStage({ kind: "vuoto" })
      setChosen(new Set())
      setFilter("")
    }
    onOpenChange(next)
  }

  const toggle = (key: string) => {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const visible = stage.kind === "pronto" ? stage.result.tables.filter((t) => keyOf(t).includes(filter.trim())) : []

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl" data-import-dialog>
        <DialogHeader>
          <DialogTitle>Importa DDL</DialogTitle>
          <DialogDescription>
            Incolla o carica un dump PostgreSQL o MySQL: le tabelle scelte entrano nel diagramma aperto,
            in un solo passo annullabile.
          </DialogDescription>
        </DialogHeader>

        {stage.kind === "fatto" ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto text-sm">
            <p>
              Importate <strong>{stage.tables}</strong> tabelle e <strong>{stage.relationships}</strong> relazioni.
            </p>
            {stage.warnings.length > 0 && (
              <details open data-import-warnings>
                <summary className="cursor-pointer text-muted-foreground">{stage.warnings.length} avvisi</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {stage.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto">
            <textarea
              aria-label="DDL"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              placeholder="CREATE TABLE …"
              className="h-32 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex items-center gap-2">
              <input type="file" accept=".sql,.txt" aria-label="Carica un file SQL" onChange={(e) => void onFile(e)} className="text-xs" />
              <ToggleGroup type="single" value={dialect} onValueChange={(v) => v && setDialect(v as Dialect)} className="ml-auto">
                <ToggleGroupItem value="postgres">PostgreSQL</ToggleGroupItem>
                <ToggleGroupItem value="mysql">MySQL</ToggleGroupItem>
              </ToggleGroup>
              <Button variant="secondary" size="sm" disabled={!text.trim() || stage.kind === "analisi"} onClick={() => void analyse(text, dialect)}>
                Analizza
              </Button>
            </div>

            {stage.kind === "analisi" && <p className="text-sm text-muted-foreground">Analisi in corso…</p>}
            {stage.kind === "errore" && <p className="text-sm text-destructive" data-import-error>{stage.message}</p>}

            {stage.kind === "pronto" && (
              <>
                <p className="text-sm text-muted-foreground" data-import-summary>
                  {stage.result.tables.length} tabelle, {stage.result.tables.flatMap((t) => t.foreignKeys).length} foreign key
                  {Object.keys(stage.result.skipped).length > 0 && `. Ignorati: ${summary(stage.result.skipped)}`}
                </p>
                {stage.result.warnings.length > 0 && (
                  <details data-import-warnings>
                    <summary className="cursor-pointer text-xs text-muted-foreground">{stage.result.warnings.length} avvisi dal parser</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {stage.result.warnings.map((w) => <li key={w.message}>{w.message}</li>)}
                    </ul>
                  </details>
                )}
                <input
                  aria-label="Filtra tabelle"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtra…"
                  className="w-full rounded-md border bg-transparent px-3 py-1.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <ul className="space-y-1">
                  {visible.map((t) => {
                    const key = keyOf(t)
                    return (
                      <li key={key} className="flex items-center gap-2 text-sm">
                        <Checkbox id={`t-${key}`} checked={chosen.has(key)} onCheckedChange={() => toggle(key)} />
                        <label htmlFor={`t-${key}`} className="cursor-pointer font-mono text-xs">{key}</label>
                        <span className="text-xs text-muted-foreground">{t.columns.length} colonne</span>
                        {present.has(key) && <span className="ml-auto text-xs text-primary">già presente, verrà aggiornata</span>}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {stage.kind === "pronto" && (
            <Button onClick={onImport} disabled={chosen.size === 0}>
              Importa {chosen.size} tabelle
            </Button>
          )}
          <Button variant="ghost" onClick={() => close(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Aggiungere la voce di menu**

In `src/ui/DocumentMenu.tsx`: importare `useState` (già importato), `FileCode2` da `lucide-react`, e `ImportDdlDialog` da `./import/ImportDdlDialog`. Aggiungere lo stato e la voce, e rendere il dialog **fratello** del `DropdownMenu`, dentro il frammento che già contiene l'input di upload:

```tsx
const [importOpen, setImportOpen] = useState(false)
```

La voce va subito dopo `Apri…`:

```tsx
<DropdownMenuItem disabled={readOnly} onSelect={() => setImportOpen(true)}><FileCode2 /> Importa DDL…</DropdownMenuItem>
```

E il dialog accanto all'input di upload, **fuori** dal `DropdownMenu`:

```tsx
<ImportDdlDialog open={importOpen} onOpenChange={setImportOpen} />
```

- [ ] **Step 4: Verificare nel browser**

Avviare il dev server e provare, nell'ordine:

1. Aprire il menu, cliccare `Importa DDL…`: il dialog si apre e **resta** aperto. Se lampeggia o si chiude subito, è la lite sul fuoco fra menu e dialog: aprirlo dal `onCloseAutoFocus` del `DropdownMenuContent` invece che dall'`onSelect` della voce, oppure rimandare con un `setTimeout(() => setImportOpen(true), 0)`. Verificare di nuovo nel browser, non fidarsi del ragionamento.
2. Incollare `CREATE TABLE parent (id bigint PRIMARY KEY); CREATE TABLE child (id bigint PRIMARY KEY, parent_id bigint NOT NULL REFERENCES parent(id));`: il dialetto si mette su PostgreSQL da sé, compaiono due tabelle spuntate e il riepilogo.
3. Cliccare `Importa 2 tabelle`: due entità sul canvas, una relazione fra loro, e il pannello mostra l'esito con gli avvisi. ⌘Z le fa sparire tutte insieme.
4. Reimportare lo stesso DDL: le due tabelle sono marcate «già presente, verrà aggiornata», e dopo l'import la relazione è **una**, non due.
5. Incollare un `mysqldump` (o il DDL MySQL del Task 4): il dialetto si mette su MySQL da sé.
6. Prendere il controllo da una seconda scheda per mettere la prima in sola lettura: la voce `Importa DDL…` è disabilitata.

Fare uno screenshot del dialog nello stato «pronto» e allegarlo al report del task.

- [ ] **Step 5: Lint, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/ui/import/ImportDdlDialog.tsx src/ui/DocumentMenu.tsx src/components/ui/dialog.tsx src/components/ui/checkbox.tsx package.json pnpm-lock.yaml
git commit -m "feat(ui): dialog di import DDL con scelta delle tabelle, dialetto rilevato e avvisi"
```

---

### Task 9: Il plugin del WASM diventa condizionale

Debito che lo spike ha lasciato scritto: oggi `libpgQueryWasm()` emette il binario da 1,1 MB in `dist/assets/` **incondizionatamente**, anche quando nessun modulo importa `libpg-query`. Ora che l'importer esiste, si sistema — e si sistemano anche le altre due cose che lo spike aveva annotato: il percorso di atterraggio legato a `build.assetsDir` invece che a `assets` scritto a mano, e la risoluzione del file spostata dentro gli hook, così una dipendenza mancante rompe l'import e non qualunque comando Vite.

C'è una trappola: Vite compila i worker in una **build separata**, con la propria lista di plugin. Un plugin registrato solo in `plugins` non vede i moduli del worker, e `libpg-query` è importato **solo dal worker**. Quindi il plugin va registrato in `plugins` **e** in `worker.plugins`, e ogni istanza emette se ha visto la dipendenza.

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: niente dai task precedenti. Il worker del Task 5 è ciò che rende osservabile il comportamento.
- Produces: niente per i task successivi.

- [ ] **Step 1: Riscrivere il plugin**

Sostituire la funzione `libpgQueryWasm` e la registrazione dei plugin in `vite.config.ts`:

```ts
/**
 * Emscripten cerca `libpg-query.wasm` accanto allo script che lo carica (`scriptDirectory`), e
 * `loadModule()` non espone `locateFile`: il percorso non si può indicare dal codice applicativo.
 * Quindi in dev lo serviamo noi e in build lo emettiamo — ma solo se qualcuno lo importa davvero,
 * perché è un megabyte. Vite compila i worker in una build separata con i propri plugin, e
 * `libpg-query` è importato solo dal worker: per questo il plugin va registrato in entrambe le liste.
 */
function libpgQueryWasm(): Plugin {
  const wasmPath = () => createRequire(import.meta.url).resolve("libpg-query/wasm/libpg-query.wasm")
  let assetsDir = "assets"
  let used = false
  return {
    name: "libpg-query-wasm",
    configResolved(config) {
      assetsDir = config.build.assetsDir
    },
    resolveId(source) {
      if (source === "libpg-query" || source.startsWith("libpg-query/")) used = true
      return null
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split("?")[0].endsWith("/libpg-query.wasm")) return next()
        res.setHeader("Content-Type", "application/wasm")
        res.end(readFileSync(wasmPath()))
      })
    },
    generateBundle() {
      if (!used) return
      this.emitFile({ type: "asset", fileName: `${assetsDir}/libpg-query.wasm`, source: readFileSync(wasmPath()) })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), libpgQueryWasm()],
  // I worker hanno una build a parte: senza questa riga il plugin non vede l'import di libpg-query.
  worker: { plugins: () => [libpgQueryWasm()] },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
```

- [ ] **Step 2: Verificare il caso positivo**

```bash
rm -rf dist && pnpm build && ls -la dist/assets/libpg-query.wasm
```
Expected: il file c'è, 1.150.984 byte, **una volta sola**.

- [ ] **Step 3: Verificare il caso negativo, osservandolo**

Commentare temporaneamente l'`import("./pg")` in `src/io/ddl/parse.worker.ts` (sostituendolo con un `throw`), ricostruire, e controllare che il binario **non** ci sia:

```bash
rm -rf dist && pnpm build && ls dist/assets/ | grep -c libpg-query
```
Expected: `0`.

Poi ripristinare il worker e ricostruire, e verificare che il binario torni.

**Se il condizionale non funziona** — il binario non compare nel caso positivo, oppure compare in quello negativo — **non insistere sulla trovata**: rimettere l'emissione incondizionata, scrivere nel report del task che cosa si è osservato e che il megabyte in `dist` resta un costo noto. L'obiettivo è una build corretta, non un plugin ingegnoso.

- [ ] **Step 4: Verificare che il dev server serva ancora il binario**

Avviare il dev server, aprire il dialog di import, incollare un `CREATE TABLE` Postgres e controllare che l'analisi vada a buon fine. Nella scheda Rete deve comparire una richiesta a `…/libpg-query.wasm` con `200` e `Content-Type: application/wasm`.

- [ ] **Step 5: Lint e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add vite.config.ts
git commit -m "chore(build): il .wasm di libpg-query si emette solo se un chunk lo importa"
```

---

### Task 10: End-to-end e documentazione

L'e2e della persistenza ha trovato bug che i test unitari non vedevano, e i suoi due aiuti sull'attesa del menu Radix contengono conoscenza sudata: si estraggono in un modulo condiviso invece di essere ricopiati. Si estraggono **solo** gli aiuti puri sul browser; `step`, `watch` e la contabilità degli errori restano in ciascuno script, perché sono legati al suo esito.

**Files:**
- Create: `scripts/e2e/helpers.mjs`
- Create: `scripts/e2e/import.mjs`
- Modify: `scripts/e2e/persistenza.mjs` (importa gli aiuti invece di definirli)
- Modify: `package.json` (lo script `e2e` lancia i due scenari)
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-06-dev-designer-design.md`

**Interfaces:**
- Consumes: la voce di menu `Importa DDL…` e i `data-*` del dialog dal Task 8; `[data-node-id]` dal canvas.
- Produces: niente.

- [ ] **Step 1: Estrarre gli aiuti condivisi**

Creare `scripts/e2e/helpers.mjs` spostando **senza modificarli** da `scripts/e2e/persistenza.mjs`: `waitFor`, `launch`, `expectNodes`, `expectText`, `expectMenu`, `pickFromMenu`. Aggiungere `export` a ciascuno e conservare i loro commenti, che spiegano perché l'attesa sul menu è fatta così. In `persistenza.mjs` toglierne le definizioni e importarli:

```js
import { expectMenu, expectNodes, expectText, launch, pickFromMenu, waitFor } from "./helpers.mjs"
```

- [ ] **Step 2: Verificare che l'e2e esistente passi ancora**

Run: `pnpm e2e`
Expected: i 7 passi della persistenza passano come prima. Se qualcosa si rompe qui, è l'estrazione ad aver perso qualcosa: confrontare con `git diff`.

- [ ] **Step 3: Scrivere l'e2e dell'import**

Creare `scripts/e2e/import.mjs`:

```js
/**
 * End-to-end dell'import DDL: build di produzione servita da `vite preview`, Chrome di sistema
 * headless. Copre: apri il dialog → incolla un DDL → analizza → importa → due entità e una relazione
 * sul canvas → annulla → canvas vuoto. E il re-import, che non deve duplicare la relazione.
 *
 * Uso: `pnpm e2e`. `HEADLESS=0` per vedere il browser.
 */
import { spawn } from "node:child_process"
import { expectNodes, expectText, launch, pickFromMenu, waitFor } from "./helpers.mjs"

const PORT = 4175
const BASE = `http://localhost:${PORT}/`
const DDL = `CREATE TABLE parent (id bigint PRIMARY KEY);
CREATE TABLE child (id bigint PRIMARY KEY, parent_id bigint NOT NULL REFERENCES parent(id));`

const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
const pageErrors = []
let failed = false

/** Incolla il DDL nel textarea con un vero evento di incollata, così parte l'analisi automatica. */
async function paste(page, ddl) {
  await page.locator('[aria-label="DDL"]').click()
  await page.evaluate((text) => {
    const area = document.querySelector('[aria-label="DDL"]')
    const data = new DataTransfer()
    data.setData("text", text)
    area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, ddl)
  await page.waitForSelector("[data-import-summary]", { timeout: 30_000 })
}

async function step(name, body) {
  process.stdout.write(`• ${name}… `)
  await body()
  if (pageErrors.length > 0) throw new Error(`errori nella pagina: ${pageErrors.join(" | ")}`)
  process.stdout.write("ok\n")
}

try {
  await waitFor(BASE)
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on("pageerror", (e) => pageErrors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()))

  await page.goto(BASE)
  await page.waitForSelector("[data-canvas]")

  await step("apre il dialog di import e analizza il DDL incollato", async () => {
    await pickFromMenu(page, page.getByRole("menuitem", { name: /Importa DDL/ }))
    await page.waitForSelector("[data-import-dialog]")
    await paste(page, DDL)
    await expectText(page, "[data-import-summary]", "2 tabelle")
  })

  await step("importa e trova due entità e una relazione", async () => {
    await page.getByRole("button", { name: /^Importa 2 tabelle$/ }).click()
    await expectNodes(page, 2)
  })

  await step("annulla con ⌘Z e il canvas torna vuoto", async () => {
    await page.getByRole("button", { name: "Chiudi" }).click()
    await page.waitForSelector("[data-import-dialog]", { state: "detached" })
    await page.keyboard.press("ControlOrMeta+z")
    await expectNodes(page, 0)
  })

  await step("il re-import non duplica la relazione", async () => {
    for (let i = 0; i < 2; i++) {
      await pickFromMenu(page, page.getByRole("menuitem", { name: /Importa DDL/ }))
      await page.waitForSelector("[data-import-dialog]")
      await paste(page, DDL)
      await page.getByRole("button", { name: /^Importa 2 tabelle$/ }).click()
      await page.waitForSelector("[data-import-dialog] strong")
      await page.getByRole("button", { name: "Chiudi" }).click()
      await page.waitForSelector("[data-import-dialog]", { state: "detached" })
    }
    const relationships = await page.evaluate(() => document.querySelectorAll("[data-relationship-id]").length)
    if (relationships !== 1) throw new Error(`attesa una relazione, trovate ${relationships}`)
  })

  await browser.close()
} catch (e) {
  failed = true
  console.error("\nFALLITO:", e)
} finally {
  preview.kill()
}
process.exit(failed ? 1 : 0)
```

Il selettore `[data-relationship-id]` va **verificato nel canvas vero**: se il layer degli edge non espone un attributo del genere, aggiungerlo in `src/ui/canvas/` accanto a `data-node-id`, oppure contare le relazioni con `page.evaluate` sullo store. Non inventare un selettore che non esiste: aprire il DOM e guardare.

- [ ] **Step 4: Collegare lo script e osservare l'esito, compreso il fallimento**

In `package.json`, lo script `e2e` lancia i due scenari dopo una sola build:

```json
"e2e": "vite build && node scripts/e2e/persistenza.mjs && node scripts/e2e/import.mjs"
```

Run: `pnpm e2e`
Expected: tutti i passi dei due script passano.

Poi **osservare il fallimento**, non dedurlo: cambiare temporaneamente un'attesa in `import.mjs` perché fallisca (per esempio `expectNodes(page, 2)` in `expectNodes(page, 3)`), rilanciare, e verificare che lo script stampi `FALLITO:` e che `echo $?` dia `1`. Ripristinare.

- [ ] **Step 5: Aggiornare README e spec di progetto**

In `README.md`: togliere l'import DDL dalla riga di quello che **non** c'è ancora, e aggiungere allo stato quello che ora c'è — import PostgreSQL e MySQL/MariaDB con scelta delle tabelle, cardinalità dedotte dalle FK, disposizione a griglia, un solo undo — dicendo anche i limiti veri: niente auto layout, i vincoli UNIQUE su più colonne si perdono, e l'import sostituisce le tabelle omonime tenendo la posizione.

In `docs/superpowers/specs/2026-09-06-dev-designer-design.md`, §4.4: aggiungere una riga che rimanda alla spec di dettaglio (`docs/superpowers/specs/2026-09-08-import-ddl-design.md`) e correggere il contratto, che nella realizzazione è `(ddl: string, dialect: Dialect) => Promise<DdlParseResult>` sul client del worker, non `(ddl: string) => { model, warnings }`: il modello lo produce `map.ts` in un passo separato, perché la scelta delle tabelle sta in mezzo.

- [ ] **Step 6: Lint, test, build e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add scripts/e2e/helpers.mjs scripts/e2e/import.mjs scripts/e2e/persistenza.mjs package.json README.md docs/superpowers/specs/2026-09-06-dev-designer-design.md
git commit -m "test(e2e): l'import DDL provato in un browser vero, e documentazione dello stato"
```
