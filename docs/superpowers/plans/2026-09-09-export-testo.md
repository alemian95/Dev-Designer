# Export testo — piano di implementazione

> **Per gli esecutori agentici:** SOTTO-SKILL RICHIESTA: usa
> `superpowers:subagent-driven-development` (consigliata) o
> `superpowers:executing-plans` per eseguire questo piano task per task. I passi
> usano le caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** esportare il diagramma ER come DDL PostgreSQL, DDL MySQL e
Mermaid, da un dialog con anteprima, Copia e Scarica.

**Architettura:** tre emettitori puri `ErModel → { text, warnings }` in
`src/io/emit`, nessuno dei quali tocca il DOM, più un dialog in `src/ui/export`.
Un solo emettitore DDL per i due dialetti, che differiscono per il carattere di
citazione e per l'insieme dei tipi noti.

**Stack:** TypeScript 6 strict, Vitest 5, React 19, Tailwind v4, shadcn/ui.
**Nessuna dipendenza nuova**: `dialog.tsx` e `toggle-group.tsx` sono già in
`src/components/ui`.

**Spec:** `docs/superpowers/specs/2026-09-09-export-testo-design.md`

## Vincoli globali

- **Testo UI, commenti e messaggi di commit in italiano**; identificatori in
  inglese. Nessuna eccezione: è la convenzione di tutto il repository.
- **Strati imposti da ESLint** (`eslint.config.js`): `src/io/**` non può
  importare `react`, `react-dom` né `@/ui/**`. Gli emettitori vedono solo
  `@/model/**` e `@/io/ddl/schema`.
- **I dump reali dell'utente (`spike/fixtures/postgres.sql`,
  `spike/fixtures/mysql.sql`) sono git-ignored e non entrano in alcun test**, e
  nemmeno un frammento di essi: nessun nome di tabella o di colonna che venga da
  lì. I test usano `spike/fixtures/*.synthetic.sql` (committati) e snippet
  inline con nomi inventati.
- **Identità git personale**: `alessandromian95@gmail.com`. Già configurata su
  questo repository, da non cambiare.
- **Il branch è `feat/export-testo`**, già creato. `git push` e i merge sono
  decisioni dell'utente: non farli.
- **Comandi**: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e` (che fa già
  `vite build` da sé). `pnpm` 10.33.0.
- **Determinismo dell'uscita** (spec §4): entità e relazioni in ordine
  alfabetico di chiave, attributi nell'ordine del modello. Due export dello
  stesso documento danno due file identici byte per byte.

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/io/emit/result.ts` | il tipo `EmitResult`, contratto comune ai tre emettitori |
| `src/io/emit/sql-types.ts` | `baseType`, i due insiemi di tipi, `foreignTypes`, `DIALECT_LABEL` |
| `src/io/emit/ddl.ts` | `emitDdl`: citazione, `CREATE TABLE`, `ALTER TABLE`, casi degeneri |
| `src/io/emit/mermaid.ts` | `emitMermaid`: `erDiagram`, citazione secondo la grammatica |
| `src/io/emit/round-trip.test.ts` | dump sintetico → modello → DDL → riparse → confronto |
| `src/ui/export/file-name.ts` | `documentFileName`, estratta da `actions.ts` |
| `src/ui/export/TextExportDialog.tsx` | anteprima, scelta del formato, Copia, Scarica |
| `scripts/e2e/export-testo.mjs` | quarta scena e2e |
| `docs/adr/0005-*.md` | perché un emettitore DDL solo, contro i due parser dell'ADR 0001 |

---

### Task 1: `sql-types.ts` — normalizzazione e tipi estranei

**Files:**
- Create: `src/io/emit/result.ts`
- Create: `src/io/emit/sql-types.ts`
- Test: `src/io/emit/sql-types.test.ts`

**Interfaces:**
- Consuma: `Dialect` da `@/io/ddl/schema` (già esistente,
  `export type Dialect = "postgres" | "mysql"`).
- Produce: `interface EmitResult { text: string; warnings: string[] }`;
  `DIALECT_LABEL: Record<Dialect, string>`; `baseType(type: string): string`;
  `foreignTypes(types: Iterable<string>, dialect: Dialect): string[]`.

- [ ] **Passo 1: scrivi il test che falisce**

`src/io/emit/sql-types.test.ts`:

```ts
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
```

- [ ] **Passo 2: esegui il test e verifica che falisca**

Esegui: `pnpm vitest run src/io/emit/sql-types.test.ts`
Atteso: FAIL, «Failed to resolve import "./sql-types"».

- [ ] **Passo 3: scrivi `result.ts`**

```ts
/**
 * Uscita comune ai tre emettitori.
 *
 * Gli avvisi sono **aggregati** — «3 tipi non appartengono a MySQL: …» e non una riga per colonna:
 * su un dump da 80 tabelle una riga per colonna è illeggibile.
 */
export interface EmitResult {
  text: string
  warnings: string[]
}
```

- [ ] **Passo 4: scrivi `sql-types.ts`**

```ts
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
```

- [ ] **Passo 5: esegui il test e verifica che passi**

Esegui: `pnpm vitest run src/io/emit/sql-types.test.ts`
Atteso: PASS, 15 test.

- [ ] **Passo 6: lint**

Esegui: `pnpm lint`
Atteso: nessun errore. Se ESLint segnala l'import di `@/io/ddl/schema`, è un
errore nella regola degli strati e non nel codice: `src/io/**` può importare da
`src/io/**`.

- [ ] **Passo 7: commit**

```bash
git add src/io/emit/result.ts src/io/emit/sql-types.ts src/io/emit/sql-types.test.ts
git commit -m "feat(io): normalizzazione dei tipi SQL e rilevamento di quelli estranei al dialetto

Il predicato avvisa solo se il tipo appartiene all'altro dialetto e non al
target. La formulazione più larga — non e' nell'insieme del target — avrebbe
segnalato ogni enum, domain e citext, che sono tipi personalizzati validi.

Gli insiemi vengono da Table 8.1 di Postgres e dal manuale MySQL 8.4."
```

---

### Task 2: `ddl.ts` — l'emettitore DDL e l'ADR 0005

**Files:**
- Create: `src/io/emit/ddl.ts`
- Create: `docs/adr/0005-un-solo-emettitore-ddl-per-i-due-dialetti.md`
- Test: `src/io/emit/ddl.test.ts`

**Interfaces:**
- Consuma: `EmitResult` da `./result`; `DIALECT_LABEL`, `foreignTypes` da
  `./sql-types`; `Dialect` da `@/io/ddl/schema`; `Attribute`, `Entity`,
  `ErModel`, `Relationship` da `@/model/document`.
- Produce: `emitDdl(model: ErModel, dialect: Dialect): EmitResult`.

**Nota sul modello per i test.** `ErModel` è
`{ entities: Record<string, Entity>, relationships: Record<string, Relationship> }`.
`Entity` è `{ name: string; schema?: string; attributes: Attribute[] }`.
`Attribute` è `{ name, type, primaryKey, foreignKey, nullable, unique }`, tutti
obbligatori. `Relationship` è
`{ name?: string; source: RelationshipEnd; target: RelationshipEnd; identifying: boolean }`
con `RelationshipEnd = { entity: string; attributes: string[]; cardinality: Cardinality }`.
La chiave di ogni entità **deve** essere `entityKey(entity)`, cioè
`schema.nome` o `nome`.

- [ ] **Passo 1: scrivi il test che falisce**

`src/io/emit/ddl.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { Attribute, Entity, ErModel, Relationship } from "@/model/document"
import { emitDdl } from "./ddl"

const attr = (name: string, type: string, p: Partial<Attribute> = {}): Attribute => ({
  name, type, primaryKey: false, foreignKey: false, nullable: true, unique: false, ...p,
})

const entity = (name: string, attributes: Attribute[], schema?: string): Entity => ({
  name, ...(schema ? { schema } : {}), attributes,
})

/** Due entità e una relazione: `ordini.utente_id` → `pub.utenti.id`. */
function model(): ErModel {
  const utenti = entity("utenti", [
    attr("id", "integer", { primaryKey: true, nullable: false }),
    attr("email", "varchar(255)", { nullable: false, unique: true }),
  ], "pub")
  const ordini = entity("ordini", [
    attr("id", "integer", { primaryKey: true, nullable: false }),
    attr("utente_id", "integer", { foreignKey: true }),
  ])
  const rel: Relationship = {
    source: { entity: "ordini", attributes: ["utente_id"], cardinality: "zero-or-many" },
    target: { entity: "pub.utenti", attributes: ["id"], cardinality: "zero-or-one" },
    identifying: false,
  }
  return { entities: { "pub.utenti": utenti, ordini }, relationships: { r1: rel } }
}

describe("emitDdl", () => {
  it("emette schemi, tabelle in ordine alfabetico e FK in ALTER TABLE separati", () => {
    const { text } = emitDdl(model(), "postgres")
    expect(text).toBe(`-- Dev Designer — export PostgreSQL
-- Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più colonne:
-- questo DDL descrive tabelle, colonne, chiavi e riferimenti.

CREATE SCHEMA IF NOT EXISTS "pub";

CREATE TABLE "ordini" (
  "id" integer NOT NULL,
  "utente_id" integer,
  PRIMARY KEY ("id")
);

CREATE TABLE "pub"."utenti" (
  "id" integer NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  PRIMARY KEY ("id")
);

ALTER TABLE "ordini"
  ADD CONSTRAINT "ordini_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "pub"."utenti" ("id");
`)
  })

  it("MySQL cambia solo il carattere di citazione", () => {
    const { text } = emitDdl(model(), "mysql")
    expect(text).toContain("CREATE SCHEMA IF NOT EXISTS `pub`;")
    expect(text).toContain("CREATE TABLE `pub`.`utenti` (")
    expect(text).toContain("REFERENCES `pub`.`utenti` (`id`);")
    expect(text).not.toContain('"')
  })

  it("non emette CREATE SCHEMA se nessuna entità ha uno schema", () => {
    const m = model()
    delete m.entities["pub.utenti"]
    delete m.relationships["r1"]
    const { text } = emitDdl(m, "postgres")
    expect(text).not.toContain("CREATE SCHEMA")
  })

  it("sfugge il carattere di citazione dentro i nomi, in entrambi i dialetti", () => {
    // Il nome di una relazione lo digita l'utente: può contenere qualunque cosa. Senza
    // sfuggimento il DDL è malformato — lo stesso difetto dell'export SVG in produzione.
    const m: ErModel = {
      entities: { 'a"b': entity('a"b', [attr('c"d', "int")]) },
      relationships: {
        r: {
          name: 'v"k',
          source: { entity: 'a"b', attributes: ['c"d'], cardinality: "zero-or-many" },
          target: { entity: 'a"b', attributes: ['c"d'], cardinality: "one" },
          identifying: false,
        },
      },
    }
    const pg = emitDdl(m, "postgres").text
    expect(pg).toContain('CREATE TABLE "a""b" (')
    expect(pg).toContain('ADD CONSTRAINT "v""k"')
    const my = emitDdl({ entities: { "a`b": entity("a`b", [attr("c`d", "int")]) }, relationships: {} }, "mysql").text
    expect(my).toContain("CREATE TABLE `a``b` (")
  })

  it("emette la chiave composta come vincolo di tabella", () => {
    const m: ErModel = {
      entities: {
        t: entity("t", [
          attr("a", "int", { primaryKey: true, nullable: false }),
          attr("b", "int", { primaryKey: true, nullable: false }),
        ]),
      },
      relationships: {},
    }
    expect(emitDdl(m, "postgres").text).toContain('  PRIMARY KEY ("a", "b")')
  })

  it("commenta l'entità senza colonne invece di emettere un CREATE TABLE non valido", () => {
    const m: ErModel = { entities: { vuota: entity("vuota", []) }, relationships: {} }
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).toContain('-- tabella "vuota": nessuna colonna definita nel diagramma')
    expect(text).not.toContain("CREATE TABLE")
    expect(warnings).toContain("1 entità senza colonne non producono una tabella: vuota")
  })

  it("commenta la relazione disegnata a mano invece di inventare una FOREIGN KEY", () => {
    const m = model()
    m.relationships["r1"]!.source.attributes = []
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).toContain('-- relazione "ordini" → "pub"."utenti": colonne non definite nel diagramma')
    expect(text).not.toContain("ADD CONSTRAINT")
    expect(warnings).toContain("1 relazioni disegnate a mano non hanno colonne: nessuna FOREIGN KEY emessa, solo un commento")
  })

  it("avvisa quando l'entità referenziata non ha PRIMARY KEY", () => {
    const m = model()
    m.entities["pub.utenti"]!.attributes[0]!.primaryKey = false
    const { warnings } = emitDdl(m, "postgres")
    expect(warnings.some((w) => w.includes("non hanno PRIMARY KEY") && w.includes("pub.utenti"))).toBe(true)
  })

  it("salta la relazione con un estremo fuori dal diagramma", () => {
    const m = model()
    m.relationships["r1"]!.target.entity = "inesistente"
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).not.toContain("ADD CONSTRAINT")
    expect(warnings).toContain('relazione "r1" saltata: un estremo non è nel diagramma')
  })

  it("emette il tipo vuoto come text e lo dice", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "   ")]) }, relationships: {} }
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).toContain('  "a" text')
    expect(warnings).toContain("1 colonne senza tipo sono state emesse come text: t.a")
  })

  it("deduplica i nomi di vincolo: MySQL li vuole unici per database", () => {
    const rel = (child: string): Relationship => ({
      source: { entity: child, attributes: ["p_id"], cardinality: "zero-or-many" },
      target: { entity: "p", attributes: ["id"], cardinality: "one" },
      identifying: false,
    })
    const figlio = (name: string) => entity(name, [attr("p_id", "int")])
    const m: ErModel = {
      entities: {
        p: entity("p", [attr("id", "int", { primaryKey: true, nullable: false })]),
        c1: figlio("c1"),
        c2: figlio("c2"),
      },
      // Due relazioni con lo stesso nome esplicito: la seconda deve essere rinominata.
      relationships: { a: { ...rel("c1"), name: "fk_condiviso" }, b: { ...rel("c2"), name: "fk_condiviso" } },
    }
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).toContain('ADD CONSTRAINT "fk_condiviso"')
    expect(text).toContain('ADD CONSTRAINT "fk_condiviso_2"')
    expect(warnings).toContain('il nome di vincolo "fk_condiviso" era già usato: emesso come "fk_condiviso_2"')
  })

  it("avvisa sui tipi estranei al dialetto senza tradurli", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "jsonb"), attr("b", "timestamptz")]) }, relationships: {} }
    const { text, warnings } = emitDdl(m, "mysql")
    expect(text).toContain("`a` jsonb")
    expect(warnings).toContain("2 tipi non appartengono a MySQL: jsonb, timestamptz")
    expect(emitDdl(m, "postgres").warnings).toEqual([])
  })

  it("è deterministico: due chiamate danno la stessa stringa", () => {
    expect(emitDdl(model(), "postgres").text).toBe(emitDdl(model(), "postgres").text)
  })
})
```

- [ ] **Passo 2: esegui il test e verifica che falisca**

Esegui: `pnpm vitest run src/io/emit/ddl.test.ts`
Atteso: FAIL, «Failed to resolve import "./ddl"».

- [ ] **Passo 3: scrivi `ddl.ts`**

```ts
import type { Dialect } from "@/io/ddl/schema"
import type { Attribute, Entity, ErModel, Relationship } from "@/model/document"
import type { EmitResult } from "./result"
import { DIALECT_LABEL, foreignTypes } from "./sql-types"

/**
 * Tipo emesso quando l'attributo non ne ha uno. È l'**unico** posto in cui questo emettitore
 * inventa, e lo fa perché l'alternativa è una colonna senza tipo, cioè un file che non gira.
 * Il caso è raggiungibile: `AttributeSchema.type` è `z.string()` senza minimo.
 */
const FALLBACK_TYPE = "text"

/**
 * Cita e sfugge un identificatore. Il valore dentro i delimitatori va **sempre** sfuggito: il nome
 * di una relazione lo digita l'utente e può contenere qualunque cosa. È la lezione dell'export SVG,
 * dove un valore infilato grezzo dentro un delimitatore produceva un file malformato solo in
 * produzione, applicata prima invece che dopo.
 */
function quote(dialect: Dialect, name: string): string {
  return dialect === "postgres" ? `"${name.replaceAll('"', '""')}"` : `\`${name.replaceAll("`", "``")}\``
}

/**
 * Nome qualificato. Schema e nome si leggono dai campi dell'entità, **non** spezzando `entityKey`
 * sul primo punto: il punto è ammesso anche dentro un nome, e `map.ts` documenta già perché quella
 * scorciatoia è sbagliata.
 */
const qualified = (dialect: Dialect, e: Entity): string =>
  e.schema ? `${quote(dialect, e.schema)}.${quote(dialect, e.name)}` : quote(dialect, e.name)

const columns = (dialect: Dialect, names: readonly string[]): string =>
  names.map((n) => quote(dialect, n)).join(", ")

function column(dialect: Dialect, a: Attribute): string {
  const parts = [quote(dialect, a.name), a.type.trim() || FALLBACK_TYPE]
  if (!a.nullable) parts.push("NOT NULL")
  // UNIQUE anche su una colonna della PRIMARY KEY: ridondante ma fedele al modello, e una
  // diramazione in meno. Il round-trip lo pretende, altrimenti il flag si perderebbe alla riparse.
  if (a.unique) parts.push("UNIQUE")
  return `  ${parts.join(" ")}`
}

/** `PRIMARY KEY` come vincolo di tabella: regge la chiave composta senza un secondo percorso. */
function createTable(dialect: Dialect, e: Entity): string {
  const lines = e.attributes.map((a) => column(dialect, a))
  const pk = e.attributes.filter((a) => a.primaryKey).map((a) => a.name)
  if (pk.length > 0) lines.push(`  PRIMARY KEY (${columns(dialect, pk)})`)
  return `CREATE TABLE ${qualified(dialect, e)} (\n${lines.join(",\n")}\n);`
}

/**
 * Nome del vincolo: quello della relazione se c'è, altrimenti la convenzione di Postgres.
 * I nomi si deduplicano perché MySQL li pretende unici per **database**, non per tabella: due
 * tabelle con la stessa colonna FK verso la stessa destinazione collidono.
 */
function constraintName(rel: Relationship, child: Entity, used: Set<string>, warnings: string[]): string {
  const base = rel.name?.trim() || `${child.name}_${rel.source.attributes.join("_")}_fkey`
  let name = base
  for (let i = 2; used.has(name); i++) name = `${base}_${i}`
  if (name !== base) warnings.push(`il nome di vincolo "${base}" era già usato: emesso come "${name}"`)
  used.add(name)
  return name
}

/**
 * Serializza il modello come DDL del dialetto scelto.
 *
 * Strutturale per necessità, non per pigrizia: il modello non contiene DEFAULT, CHECK, indici,
 * ON DELETE, AUTO_INCREMENT né UNIQUE su più colonne, quindi un dump che entra ed esce non è
 * identico all'originale. È una proprietà del modello, e l'intestazione del file lo dice.
 */
export function emitDdl(model: ErModel, dialect: Dialect): EmitResult {
  const warnings: string[] = []
  const out: string[] = [
    `-- Dev Designer — export ${DIALECT_LABEL[dialect]}`,
    "-- Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più colonne:",
    "-- questo DDL descrive tabelle, colonne, chiavi e riferimenti.",
    "",
  ]
  const keys = Object.keys(model.entities).sort()

  // Senza, il DDL non gira su un database vuoto. In MySQL SCHEMA è sinonimo di DATABASE.
  const schemas = [...new Set(keys.map((k) => model.entities[k]!.schema).filter((s) => s !== undefined))].sort()
  if (schemas.length > 0) {
    for (const s of schemas) out.push(`CREATE SCHEMA IF NOT EXISTS ${quote(dialect, s)};`)
    out.push("")
  }

  const senzaColonne: string[] = []
  const senzaTipo: string[] = []
  for (const key of keys) {
    const e = model.entities[key]!
    for (const a of e.attributes) if (!a.type.trim()) senzaTipo.push(`${key}.${a.name}`)
    if (e.attributes.length === 0) {
      // `CREATE TABLE x ()` non è valido in nessuno dei due dialetti: un file che non gira è
      // peggio di un file con un commento al posto di una tabella.
      senzaColonne.push(key)
      out.push(`-- tabella ${qualified(dialect, e)}: nessuna colonna definita nel diagramma`, "")
      continue
    }
    out.push(createTable(dialect, e), "")
  }

  const used = new Set<string>()
  let aMano = 0
  const senzaPk = new Set<string>()
  for (const key of Object.keys(model.relationships).sort()) {
    const rel = model.relationships[key]!
    const child = model.entities[rel.source.entity]
    const parent = model.entities[rel.target.entity]
    if (!child || !parent) {
      warnings.push(`relazione "${key}" saltata: un estremo non è nel diagramma`)
      continue
    }
    if (rel.source.attributes.length === 0 || rel.target.attributes.length === 0) {
      // Relazione disegnata a mano (ADR 0003): non ha colonne, quindi non esiste una FOREIGN KEY
      // da scrivere. Il commento resta dov'è utile, cioè nel file che un dev finisce a mano.
      aMano++
      out.push(`-- relazione ${qualified(dialect, child)} → ${qualified(dialect, parent)}: colonne non definite nel diagramma`, "")
      continue
    }
    if (!parent.attributes.some((a) => a.primaryKey)) senzaPk.add(rel.target.entity)
    out.push(
      `ALTER TABLE ${qualified(dialect, child)}\n  ADD CONSTRAINT ${quote(dialect, constraintName(rel, child, used, warnings))}` +
        ` FOREIGN KEY (${columns(dialect, rel.source.attributes)})` +
        ` REFERENCES ${qualified(dialect, parent)} (${columns(dialect, rel.target.attributes)});`,
      "",
    )
  }

  const foreign = foreignTypes(keys.flatMap((k) => model.entities[k]!.attributes.map((a) => a.type)), dialect)
  if (foreign.length > 0) {
    warnings.push(`${foreign.length} tipi non appartengono a ${DIALECT_LABEL[dialect]}: ${foreign.join(", ")}`)
  }
  if (senzaTipo.length > 0) {
    warnings.push(`${senzaTipo.length} colonne senza tipo sono state emesse come ${FALLBACK_TYPE}: ${senzaTipo.join(", ")}`)
  }
  if (senzaColonne.length > 0) {
    warnings.push(`${senzaColonne.length} entità senza colonne non producono una tabella: ${senzaColonne.join(", ")}`)
  }
  if (aMano > 0) {
    warnings.push(`${aMano} relazioni disegnate a mano non hanno colonne: nessuna FOREIGN KEY emessa, solo un commento`)
  }
  if (senzaPk.size > 0) {
    warnings.push(
      `${senzaPk.size} entità referenziate non hanno PRIMARY KEY: in MySQL l'ALTER TABLE fallirà (${[...senzaPk].sort().join(", ")})`,
    )
  }

  return { text: `${out.join("\n").trimEnd()}\n`, warnings }
}
```

- [ ] **Passo 4: esegui il test e verifica che passi**

Esegui: `pnpm vitest run src/io/emit/ddl.test.ts`
Atteso: PASS, 13 test. Il primo test confronta il file **intero**: se falisce per
uno spazio o una riga vuota, correggi il codice sull'atteso del test solo dopo
aver verificato che l'atteso sia SQL valido — non il contrario.

- [ ] **Passo 5: scrivi l'ADR 0005**

`docs/adr/0005-un-solo-emettitore-ddl-per-i-due-dialetti.md`:

```markdown
# 0005. Un solo emettitore DDL per i due dialetti

Date: 2026-09-09

## Status

Accepted

## Context

L'ADR 0001 tiene i due parser di dialetto (`pg.ts`, `mysql.ts`) **deliberatamente
non fattorizzati**: i due AST sono incompatibili, le funzioni omonime operano su
strutture diverse e divergeranno, quindi unificarle peggiorerebbe il codice.

L'export presenta il caso apparentemente gemello: due dialetti, due uscite. Letta
di sfuggita, la decisione dell'ADR 0001 direbbe «due emettitori».

## Decision

Un solo `emitDdl(model, dialect)` in `src/io/emit/ddl.ts`, con il dialetto
ridotto a due differenze: il carattere di citazione e l'insieme dei tipi noti.

## Consequences

Il caso è **simmetrico**, non contrario, a quello dell'ADR 0001. Là gli ingressi
sono due alberi incompatibili e ciò che sembra comune non lo è; qui l'ingresso è
uno solo — la stessa `ErModel` — e ciò che differisce è quasi nulla. Due
emettitori duplicherebbero per intero la generazione di `CREATE TABLE`, dei
vincoli e degli `ALTER TABLE`, cioè quasi tutto il file.

È la stessa regola applicata a un input diverso: fattorizza ciò che è davvero
comune, non ciò che si somiglia. Questo ADR esiste perché senza di esso la
prossima lettura vedrebbe due decisioni opposte e ne dedurrebbe un'incoerenza.

Un terzo dialetto costa un ramo in `quote` e un insieme di tipi. Il giorno in cui
un dialetto chiedesse una forma di `CREATE TABLE` diversa — non solo un
delimitatore diverso — questa decisione va rivista, non estesa con condizioni.
```

- [ ] **Passo 6: commit**

```bash
git add src/io/emit/ddl.ts src/io/emit/ddl.test.ts docs/adr/0005-un-solo-emettitore-ddl-per-i-due-dialetti.md
git commit -m "feat(io): emette il DDL dei due dialetti dal modello ER

Identificatori sempre citati e sempre sfuggiti: il nome di una relazione lo
digita l'utente. FK in ALTER TABLE separati, cosi' nessun ordinamento
topologico e i riferimenti circolari funzionano.

I tre casi che il modello permette e il DDL no — entita' senza colonne,
relazione disegnata a mano, tipo vuoto — producono un commento o un
fallback con avviso, mai un file che non gira.

L'ADR 0005 spiega perche' qui un emettitore solo e nell'ADR 0001 due
parser separati sono la stessa regola, non due decisioni opposte."
```

---

### Task 3: `mermaid.ts` — l'emettitore Mermaid

**Files:**
- Create: `src/io/emit/mermaid.ts`
- Test: `src/io/emit/mermaid.test.ts`

**Interfaces:**
- Consuma: `EmitResult` da `./result`; `Cardinality`, `ErModel` da
  `@/model/document`.
- Produce: `emitMermaid(model: ErModel): EmitResult`.

**Regole verificate sulla grammatica**
(`packages/mermaid/src/diagrams/er/parser/erDiagram.jison`, branch `develop`),
non sulla pagina di documentazione:
- `ATTRIBUTE_WORD` = `([\*A-Za-z_À-￿][A-Za-z0-9\-\_\[\]\(\)\.,À-￿\*]*)`
  — virgola e punto **sono** ammessi, lo spazio **no**.
- Nello stato `block_bq` (aperto da un backtick dentro un blocco entità) il
  lexer accetta `[^`]+` e i backtick non entrano nel token.
- `ENTITY_NAME` citato = `\"[^"%\r\n\v\b\\]+\"`.
- L'etichetta vuota `: ""` è accettata (`\"[^"]*\"`).

- [ ] **Passo 1: scrivi il test che falisce**

`src/io/emit/mermaid.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { Attribute, Cardinality, Entity, ErModel } from "@/model/document"
import { emitMermaid } from "./mermaid"

const attr = (name: string, type: string, p: Partial<Attribute> = {}): Attribute => ({
  name, type, primaryKey: false, foreignKey: false, nullable: true, unique: false, ...p,
})

const entity = (name: string, attributes: Attribute[], schema?: string): Entity => ({
  name, ...(schema ? { schema } : {}), attributes,
})

function model(): ErModel {
  return {
    entities: {
      "pub.utenti": entity("utenti", [
        attr("id", "integer", { primaryKey: true, nullable: false }),
        attr("email", "varchar(255)", { nullable: false, unique: true }),
        attr("saldo", "double precision"),
      ], "pub"),
      ordini: entity("ordini", [attr("utente_id", "integer", { foreignKey: true })]),
    },
    relationships: {
      r1: {
        source: { entity: "ordini", attributes: ["utente_id"], cardinality: "zero-or-many" },
        target: { entity: "pub.utenti", attributes: ["id"], cardinality: "zero-or-one" },
        identifying: false,
      },
    },
  }
}

describe("emitMermaid", () => {
  it("emette l'erDiagram con relazioni, blocchi e chiavi", () => {
    expect(emitMermaid(model()).text).toBe(`erDiagram
  "pub.utenti" |o..o{ "ordini" : ""
  "ordini" {
    integer utente_id FK
  }
  "pub.utenti" {
    integer id PK
    varchar(255) email UK
    \`double precision\` saldo
  }
`)
  })

  it("mette fra backtick solo i tipi che contengono uno spazio", () => {
    // `double precision` e `bigint(20) unsigned` sono le forme con spazio che arrivano davvero
    // dagli adapter (asserite in pg.test.ts e mysql.test.ts). `numeric(10,2)` no: la virgola e le
    // parentesi sono ammesse da ATTRIBUTE_WORD, la documentazione in prosa dice altro.
    const m: ErModel = {
      entities: { t: entity("t", [attr("a", "numeric(10,2)"), attr("b", "bigint(20) unsigned"), attr("c", "text[]")]) },
      relationships: {},
    }
    const { text } = emitMermaid(m)
    expect(text).toContain("    numeric(10,2) a")
    expect(text).toContain("    `bigint(20) unsigned` b")
    expect(text).toContain("    text[] c")
  })

  it("cita sempre il nome dell'entità, così il punto passa", () => {
    expect(emitMermaid(model()).text).toContain('"pub.utenti" {')
  })

  it("sostituisce i caratteri che un nome citato non ammette, e lo dice", () => {
    const m: ErModel = { entities: { 'a"b%c': entity('a"b%c', [attr("x", "int")]) }, relationships: {} }
    const { text, warnings } = emitMermaid(m)
    expect(text).toContain('"a_b_c" {')
    expect(warnings).toContain('il nome "a"b%c" contiene caratteri che Mermaid non ammette: emesso come "a_b_c"')
  })

  it("rimuove i backtick dal tipo: dentro block_bq non c'è modo di sfuggirli", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "int`x y")]) }, relationships: {} }
    const { text, warnings } = emitMermaid(m)
    expect(text).toContain("    `intx y` a")
    expect(warnings).toContain("il tipo di t.a: i backtick sono stati rimossi, Mermaid non li sa sfuggire")
  })

  it("emette `_` per il tipo vuoto: in Mermaid è un'etichetta, non SQL", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "  ")]) }, relationships: {} }
    expect(emitMermaid(m).text).toContain("    _ a")
  })

  it("combina le chiavi con la virgola", () => {
    const m: ErModel = {
      entities: { t: entity("t", [attr("a", "int", { primaryKey: true, foreignKey: true, unique: true })]) },
      relationships: {},
    }
    expect(emitMermaid(m).text).toContain("    int a PK,FK,UK")
  })

  it.each<[Cardinality, Cardinality, string]>([
    ["one", "one", "||--||"],
    ["zero-or-one", "zero-or-many", "|o--o{"],
    ["many", "zero-or-one", "}|--o|"],
    ["zero-or-many", "many", "}o--|{"],
  ])("il marcatore sta accanto all'entità che descrive: %s/%s → %s", (target, source, atteso) => {
    const m: ErModel = {
      entities: { p: entity("p", [attr("id", "int")]), c: entity("c", [attr("p_id", "int")]) },
      relationships: {
        r: {
          source: { entity: "c", attributes: ["p_id"], cardinality: source },
          target: { entity: "p", attributes: ["id"], cardinality: target },
          identifying: true,
        },
      },
    }
    expect(emitMermaid(m).text).toContain(`  "p" ${atteso} "c" : ""`)
  })

  it("identifying continuo, non identifying tratteggiato", () => {
    const m = model()
    expect(emitMermaid(m).text).toContain("|o..o{")
    m.relationships["r1"]!.identifying = true
    expect(emitMermaid(m).text).toContain("|o--o{")
  })

  it("l'etichetta è il nome della relazione, sempre citata", () => {
    const m = model()
    m.relationships["r1"]!.name = "appartiene a"
    expect(emitMermaid(m).text).toContain(' : "appartiene a"')
  })

  it("l'entità senza attributi produce un blocco vuoto, che Mermaid disegna", () => {
    const m: ErModel = { entities: { vuota: entity("vuota", []) }, relationships: {} }
    expect(emitMermaid(m).text).toBe('erDiagram\n  "vuota" {\n  }\n')
  })

  it("salta la relazione con un estremo fuori dal diagramma", () => {
    const m = model()
    m.relationships["r1"]!.target.entity = "inesistente"
    const { text, warnings } = emitMermaid(m)
    expect(text).not.toContain("|o..o{")
    expect(warnings).toContain('relazione "r1" saltata: un estremo non è nel diagramma')
  })
})
```

- [ ] **Passo 2: esegui il test e verifica che falisca**

Esegui: `pnpm vitest run src/io/emit/mermaid.test.ts`
Atteso: FAIL, «Failed to resolve import "./mermaid"».

- [ ] **Passo 3: scrivi `mermaid.ts`**

```ts
import type { Cardinality, ErModel } from "@/model/document"
import type { EmitResult } from "./result"

/**
 * Una «parola» che Mermaid accetta nuda dentro un blocco entità: la regola `ATTRIBUTE_WORD` della
 * grammatica (`erDiagram.jison`), non la pagina di documentazione, che omette la virgola e il
 * punto. Lo spazio non c'è, e sono i tipi con spazio il caso che conta.
 */
const PLAIN_WORD = /^[*A-Za-z_\u00C0-\uFFFF][A-Za-z0-9\-_[\]().,\u00C0-\uFFFF*]*$/

/** Caratteri che un nome di entità citato non ammette (`ENTITY_NAME` nella grammatica). */
const ILLEGAL_IN_NAME = /["%\r\n\v\b\\]/g

/** Il marcatore sta accanto all'entità che descrive: due forme per i due lati della riga. */
const LEFT: Record<Cardinality, string> = { one: "||", "zero-or-one": "|o", many: "}|", "zero-or-many": "}o" }
const RIGHT: Record<Cardinality, string> = { one: "||", "zero-or-one": "o|", many: "|{", "zero-or-many": "o{" }

/**
 * Tipo o nome di attributo. Fra backtick solo quando serve: sempre backtick sarebbe una
 * diramazione in meno, ma renderebbe brutta l'uscita normale, e qui l'uscita **è** il prodotto.
 *
 * Un backtick dentro il valore si rimuove: nello stato `block_bq` il lexer accetta `[^`]+` e non
 * esiste modo di sfuggirlo. Un valore vuoto diventa `_`: in Mermaid il tipo è solo un'etichetta e
 * non produce SQL non valido come nel DDL, quindi il fallback è diverso di proposito.
 */
function word(value: string, what: string, warnings: string[]): string {
  const trimmed = value.trim()
  const clean = trimmed.replaceAll("`", "")
  if (clean !== trimmed) warnings.push(`${what}: i backtick sono stati rimossi, Mermaid non li sa sfuggire`)
  if (clean === "") return "_"
  return PLAIN_WORD.test(clean) ? clean : `\`${clean}\``
}

/**
 * Nome di entità, sempre citato: citare sempre evita di decidere caso per caso e fa passare
 * `pub.utenti` con il punto. I caratteri che la forma citata non ammette diventano `_`.
 */
function entityName(key: string, warnings: string[]): string {
  const clean = key.replaceAll(ILLEGAL_IN_NAME, "_")
  if (clean !== key) warnings.push(`il nome "${key}" contiene caratteri che Mermaid non ammette: emesso come "${clean}"`)
  return `"${clean}"`
}

/**
 * Serializza il modello come `erDiagram`.
 *
 * La nullabilità non viene emessa: Mermaid ER ha solo PK/FK/UK, e il `?` sul tipo che la
 * documentazione cita non compare in `ATTRIBUTE_WORD`. `NOT NULL` vive nel DDL.
 */
export function emitMermaid(model: ErModel): EmitResult {
  const warnings: string[] = []
  const out = ["erDiagram"]

  for (const key of Object.keys(model.relationships).sort()) {
    const rel = model.relationships[key]!
    if (!(rel.source.entity in model.entities) || !(rel.target.entity in model.entities)) {
      warnings.push(`relazione "${key}" saltata: un estremo non è nel diagramma`)
      continue
    }
    // Il padre (`target`, il lato referenziato) a sinistra e il figlio (`source`, il lato della FK)
    // a destra: è il verso in cui la riga si legge.
    const linea = rel.identifying ? "--" : ".."
    const etichetta = (rel.name ?? "").replaceAll('"', "")
    out.push(
      `  ${entityName(rel.target.entity, warnings)} ${LEFT[rel.target.cardinality]}${linea}${RIGHT[rel.source.cardinality]}` +
        ` ${entityName(rel.source.entity, warnings)} : "${etichetta}"`,
    )
  }

  for (const key of Object.keys(model.entities).sort()) {
    const e = model.entities[key]!
    out.push(`  ${entityName(key, warnings)} {`)
    for (const a of e.attributes) {
      const chiavi: string[] = []
      if (a.primaryKey) chiavi.push("PK")
      if (a.foreignKey) chiavi.push("FK")
      if (a.unique) chiavi.push("UK")
      const tipo = word(a.type, `il tipo di ${key}.${a.name}`, warnings)
      const nome = word(a.name, `il nome di ${key}.${a.name}`, warnings)
      out.push(`    ${tipo} ${nome}${chiavi.length > 0 ? ` ${chiavi.join(",")}` : ""}`)
    }
    out.push("  }")
  }

  // `entityName` è chiamata sia per la relazione sia per il blocco: lo stesso avviso arriverebbe due volte.
  return { text: `${out.join("\n")}\n`, warnings: [...new Set(warnings)] }
}
```

- [ ] **Passo 4: esegui il test e verifica che passi**

Esegui: `pnpm vitest run src/io/emit/mermaid.test.ts`
Atteso: PASS, 15 test (le quattro cardinalità contano come quattro).

- [ ] **Passo 5: verifica manuale, una volta sola**

Prendi il testo del primo test (`erDiagram` con `pub.utenti` e `ordini`) e
incollalo in un renderer Mermaid vero — `mermaid.live` o l'anteprima Mermaid di
un editor. **Guarda che disegni**: due entità, gli attributi con le chiavi, la
linea tratteggiata con i marcatori `|o` e `o{` ai lati giusti.

Nessun test automatico può dirlo senza aggiungere `mermaid` come dipendenza per
una sola asserzione, e non vale il peso. Scrivi nel commit che l'hai fatto e che
cosa hai visto: se lo lasci implicito, nessuno saprà mai se è stato fatto.

- [ ] **Passo 6: commit**

```bash
git add src/io/emit/mermaid.ts src/io/emit/mermaid.test.ts
git commit -m "feat(io): emette il diagramma come erDiagram Mermaid

Le regole vengono dalla grammatica (erDiagram.jison), non dalla pagina di
documentazione, che su due punti dice altro: i tipi ammettono virgole e
parentesi ma non gli spazi, e la via d'uscita per i tipi con spazio e' lo
stato block_bq del lexer, che la prosa non menziona.

Nomi di entita' sempre citati, cosi' il punto di schema.nome passa.
Nullabilita' non emessa: Mermaid ER ha solo PK/FK/UK.

Verificato a mano una volta in un renderer vero: <che cosa hai visto>."
```

---

### Task 4: round-trip `dump → modello → DDL → riparse`

**Files:**
- Test: `src/io/emit/round-trip.test.ts`

**Interfaces:**
- Consuma: `emitDdl(model, dialect)` dal Task 2; `parsePostgres(ddl): Promise<DdlParseResult>`
  da `@/io/ddl/pg`; `parseMysql(ddl): DdlParseResult` da `@/io/ddl/mysql`;
  `mapToEr({ tables, model }): MapOutput` da `@/io/ddl/map`, dove `MapOutput` è
  `{ entities: Record<string, Entity>; relationships: Relationship[]; warnings: string[] }`.
- Produce: nulla. È il test che chiude il cerchio.

**Perché questo test è a parte.** Usa i parser veri — quello Postgres è WASM e
asincrono — e prova la catena intera invece dell'emettitore da solo. Un revisore
potrebbe accettare il Task 2 e rifiutare questo, o viceversa.

**Che cosa si confronta e che cosa no.** Solo i campi che il modello **sa**
rappresentare: nomi, tipi, `nullable`, `primaryKey`, `unique` di colonna
singola, colonne delle FK. Non i DEFAULT, i commenti, gli indici né gli UNIQUE
compositi: la spec §2 dichiara che il modello non li contiene, e asserirli
significherebbe pretendere il contrario della spec. I nomi dei vincoli si
escludono perché l'export li rigenera.

- [ ] **Passo 1: scrivi il test**

`src/io/emit/round-trip.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import mysqlSynthetic from "../../../spike/fixtures/mysql.synthetic.sql?raw"
import pgSynthetic from "../../../spike/fixtures/postgres.synthetic.sql?raw"
import { mapToEr } from "@/io/ddl/map"
import { parseMysql } from "@/io/ddl/mysql"
import { parsePostgres } from "@/io/ddl/pg"
import type { DdlParseResult, SqlTable } from "@/io/ddl/schema"
import type { ErModel } from "@/model/document"
import { emitDdl } from "./ddl"

/**
 * Riduce le tabelle ai soli campi che il modello ER sa rappresentare, in un ordine stabile.
 * Gli UNIQUE su più colonne si scartano da **entrambi** i lati: il modello non li rappresenta e
 * l'import li scarta già con un avviso, quindi confrontarli pretenderebbe il contrario della spec.
 * I nomi dei vincoli si escludono perché l'export li rigenera.
 */
function comparable(tables: SqlTable[]) {
  return [...tables]
    .map((t) => ({
      name: t.name,
      schema: t.schema,
      columns: t.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
      primaryKey: t.primaryKey,
      unique: t.unique.filter((u) => u.length === 1).map((u) => u.join()).sort(),
      foreignKeys: t.foreignKeys
        .map((f) => [f.columns.join(), f.refSchema ?? "", f.refTable, f.refColumns.join()].join("|"))
        .sort(),
    }))
    .sort((a, b) => `${a.schema ?? ""}.${a.name}`.localeCompare(`${b.schema ?? ""}.${b.name}`))
}

/** Il modello che l'import produce dalle tabelle lette, senza nulla di preesistente sul canvas. */
function toModel(parsed: DdlParseResult): ErModel {
  const { entities, relationships } = mapToEr({ tables: parsed.tables, model: { entities: {}, relationships: {} } })
  return {
    entities,
    relationships: Object.fromEntries(relationships.map((r, i) => [`r${i}`, r])),
  }
}

describe("round-trip del DDL", () => {
  it("un dump Postgres sintetico sopravvive a modello → DDL → riparse", async () => {
    const primo = await parsePostgres(pgSynthetic)
    expect(primo.tables.length).toBeGreaterThan(0)
    const { text, warnings } = emitDdl(toModel(primo), "postgres")
    // Nessun tipo estraneo: il dump è Postgres e il target è Postgres.
    expect(warnings.filter((w) => w.includes("non appartengono"))).toEqual([])
    const secondo = await parsePostgres(text)
    expect(secondo.warnings).toEqual([])
    expect(comparable(secondo.tables)).toEqual(comparable(primo.tables))
  })

  it("un dump MySQL sintetico sopravvive a modello → DDL → riparse", () => {
    const primo = parseMysql(mysqlSynthetic)
    expect(primo.tables.length).toBeGreaterThan(0)
    const { text, warnings } = emitDdl(toModel(primo), "mysql")
    expect(warnings.filter((w) => w.includes("non appartengono"))).toEqual([])
    const secondo = parseMysql(text)
    expect(secondo.warnings).toEqual([])
    expect(comparable(secondo.tables)).toEqual(comparable(primo.tables))
  })
})
```

- [ ] **Passo 2: esegui il test**

Esegui: `pnpm vitest run src/io/emit/round-trip.test.ts`

Se falisce, **leggi il diff prima di toccare il test**. Tre esiti possibili, con
tre risposte diverse:

1. **Un difetto vero dell'emettitore** (una colonna manca, un tipo è storpiato,
   una FK punta altrove). Correggi `ddl.ts`.
2. **Un dato che il modello davvero non porta** e che `comparable` non ha
   ancora escluso. Escludilo, **e aggiungi un commento che dice quale campo e
   perché** — l'esclusione è una dichiarazione di perdita, non una scorciatoia
   per far passare il test.
3. **Il primo parse ha già degli avvisi** sulla fixture (tabelle saltate). In
   quel caso `primo.tables` non contiene quelle tabelle e il confronto resta
   valido: non è un fallimento.

Non allentare l'asserzione `expect(secondo.warnings).toEqual([])`: un avviso
alla riparse significa che il DDL che abbiamo emesso non è pienamente
comprensibile al parser del suo stesso dialetto, ed è esattamente il difetto che
questo test esiste per trovare.

- [ ] **Passo 3: commit**

```bash
git add src/io/emit/round-trip.test.ts
git commit -m "test(io): il round-trip chiude il cerchio con i parser dell'import

dump sintetico → mapToEr → emitDdl → riparse → confronto. Prova in un
colpo la citazione, i tipi, le PK, gli UNIQUE e le FK, riusando i parser
che esistono gia' invece di un secondo oracolo scritto a mano.

Il confronto e' sui soli campi che il modello sa rappresentare: gli UNIQUE
compositi e i DEFAULT si escludono da entrambi i lati, perche' la spec §2
dichiara che il modello non li contiene e asserirli pretenderebbe il
contrario."
```

---

### Task 5: il dialog, la voce di menu e la misura del bundle

**Files:**
- Create: `src/ui/export/file-name.ts`
- Create: `src/ui/export/TextExportDialog.tsx`
- Modify: `src/ui/export/actions.ts` (togli la `fileName` privata, importa `documentFileName`)
- Modify: `src/ui/DocumentMenu.tsx` (voce di menu e dialog fratello)

**Interfaces:**
- Consuma: `emitDdl(model, dialect)` e `emitMermaid(model)` dai Task 2 e 3;
  `EmitResult` da `@/io/emit/result`; `download(name, data, mime)` da `@/io/file`
  (accetta già `Blob | string`); `documentSession.getState().patch({ notice })`
  da `@/io/document-session`; `erDiagram(doc)` da `@/editor/er-access`.
- Produce: `documentFileName(extension: string): string`;
  `TextExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`.

- [ ] **Passo 1: misura il bundle PRIMA di toccare la UI**

```bash
pnpm build 2>&1 | grep -E "dist/assets/index.*\.js"
```

Scrivi il numero da qualche parte: è il termine di confronto. All'export
immagini un `react-dom/server` non misurato gonfiò l'index del 37%, e a
scoprirlo fu la misura, non l'intuizione.

- [ ] **Passo 2: estrai `documentFileName`**

Crea `src/ui/export/file-name.ts`:

```ts
import { documentStore } from "@/editor/document-store"

/** `/` e i caratteri vietati nei nomi di file troncherebbero il nome del file scaricato. */
export function documentFileName(extension: string): string {
  const name = documentStore.getState().doc.name.trim() || "diagramma"
  return `${name.replaceAll(/[\\/:*?"<>|]/g, "-")}.${extension}`
}
```

In `src/ui/export/actions.ts` cancella la funzione privata `fileName` e la sua
docstring, aggiungi `import { documentFileName } from "./file-name"` fra gli
import e sostituisci le due chiamate `fileName("svg")` e `fileName("png")` con
`documentFileName("svg")` e `documentFileName("png")`.

- [ ] **Passo 3: verifica che l'estrazione non abbia rotto niente**

Esegui: `pnpm test && pnpm build`
Atteso: test verdi, build verde. Se `tsc` segnala `fileName` dichiarata e non
usata, non l'hai cancellata.

- [ ] **Passo 4: scrivi `TextExportDialog.tsx`**

```tsx
import { useState } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { emitDdl } from "@/io/emit/ddl"
import { emitMermaid } from "@/io/emit/mermaid"
import { documentSession } from "@/io/document-session"
import { download } from "@/io/file"
import { documentFileName } from "./file-name"

type Format = "postgres" | "mysql" | "mermaid"

const FORMATS: { value: Format; label: string; extension: string }[] = [
  { value: "postgres", label: "PostgreSQL", extension: "sql" },
  { value: "mysql", label: "MySQL", extension: "sql" },
  { value: "mermaid", label: "Mermaid", extension: "mmd" },
]

/** Vale per tutti i formati: è una proprietà del modello, non del dialetto scelto. */
const LIMITE_MODELLO =
  "Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più colonne: un dump che entra ed esce non è identico all'originale."

/**
 * Anteprima e consegna dell'export testo.
 *
 * Il ricalcolo al cambio di formato è una funzione pura su un modello già in memoria: si fa nel
 * render, senza stato asincrono e senza `useEffect`. Se su un diagramma grande si sentisse, si
 * misura e si mette in `useMemo` — non prima.
 */
export function TextExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [format, setFormat] = useState<Format>("postgres")
  const model = useStore(documentStore, (s) => erDiagram(s.doc).model)
  // Gli hook stanno sopra, l'uscita anticipata sotto: `DocumentMenu` si ri-renderizza a ogni
  // battuta sul nome del documento e a ogni cambio del pallino delle modifiche, e senza questa
  // riga i tre emettitori girerebbero ogni volta a dialog chiuso.
  if (!open) return null
  const scelto = FORMATS.find((f) => f.value === format)!
  const { text, warnings } = format === "mermaid" ? emitMermaid(model) : emitDdl(model, format)

  const copy = async () => {
    const patch = documentSession.getState().patch
    try {
      await navigator.clipboard.writeText(text)
      patch({ notice: "Testo copiato negli appunti." })
    } catch {
      // Contesto non sicuro o permesso negato: l'utente può sempre selezionare l'anteprima.
      patch({ notice: "Non è stato possibile copiare negli appunti." })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-text-export-dialog className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Esporta testo</DialogTitle>
          <DialogDescription>Il DDL dello schema o il diagramma in Mermaid.</DialogDescription>
        </DialogHeader>
        <ToggleGroup type="single" value={format} onValueChange={(v) => v && setFormat(v as Format)} className="justify-start">
          {FORMATS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} aria-label={f.label} className="aria-checked:bg-muted px-3">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          <li>{LIMITE_MODELLO}</li>
          {warnings.map((w) => (
            <li key={w} data-export-warning className="text-foreground">{w}</li>
          ))}
        </ul>
        <pre data-export-preview className="max-h-96 overflow-auto rounded border bg-muted/40 p-3 font-mono text-xs">{text}</pre>
        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}>Copia</Button>
          <Button onClick={() => download(documentFileName(scelto.extension), text, "text/plain;charset=utf-8")}>Scarica</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Passo 5: aggiungi la voce di menu**

In `src/ui/DocumentMenu.tsx`:

1. Aggiungi `FileText` alla lista di icone importate da `lucide-react` (prima
   riga del file, in ordine alfabetico fra `FilePlus2` e `FolderOpen`).
2. Aggiungi `import { TextExportDialog } from "./export/TextExportDialog"` fra
   gli import, dopo quello di `./export/lazy`.
3. Aggiungi lo stato accanto a `const [importOpen, setImportOpen] = useState(false)`:

```tsx
  const [textExportOpen, setTextExportOpen] = useState(false)
```

4. Subito dopo la voce `Esporta PNG` (`src/ui/DocumentMenu.tsx:59`), aggiungi:

```tsx
          <DropdownMenuItem onSelect={() => setTextExportOpen(true)}><FileText /> Esporta testo…</DropdownMenuItem>
```

Nota: **senza** `disabled={readOnly}`, come le altre due voci di export — il
commento sopra di esse («L'export è una lettura») copre anche questa.

5. Accanto a `<ImportDdlDialog open={importOpen} onOpenChange={setImportOpen} />`,
   come fratello del `DropdownMenu` e non figlio, per la stessa ragione già
   commentata lì (litigherebbe sul fuoco col menu che si chiude):

```tsx
      <TextExportDialog open={textExportOpen} onOpenChange={setTextExportOpen} />
```

- [ ] **Passo 6: misura il bundle DOPO, e confronta**

```bash
pnpm build 2>&1 | grep -E "dist/assets/index.*\.js"
```

Confronta col numero del Passo 1. Gli emettitori sono stringhe pure e il dialog
è un componente come gli altri, quindi la crescita attesa è di pochi kB. **Se
l'index cresce di più del 5%**, fai come per l'export immagini: crea
`src/ui/export/lazy-text.ts` con

```ts
export const TextExportDialog = lazy(() => import("./TextExportDialog").then((m) => ({ default: m.TextExportDialog })))
```

avvolgi l'uso in `<Suspense fallback={null}>` e rimisura. Se resta sotto il 5%,
**non** aggiungere il caricamento pigro: sarebbe complessità senza una misura
che la giustifichi. Scrivi i due numeri nel messaggio di commit in ogni caso.

- [ ] **Passo 7: verifica**

Esegui: `pnpm lint && pnpm test && pnpm build`
Atteso: tutto verde. Se ESLint segnala l'import di `@/io/emit/**` da `src/ui`,
è un falso positivo da indagare: `ui` è lo strato più esterno e può vedere `io`.

- [ ] **Passo 8: commit**

```bash
git add src/ui/export/file-name.ts src/ui/export/TextExportDialog.tsx src/ui/export/actions.ts src/ui/DocumentMenu.tsx
git commit -m "feat(ui): dialog di export testo con anteprima, Copia e Scarica

Una voce di menu sola per tre formati invece di tre voci: il ricalcolo e'
una funzione pura su un modello in memoria, quindi il cambio di formato e'
istantaneo e l'anteprima non ha stato asincrono.

Gli avvisi sui tipi hanno bisogno di un posto dove stare, e la NoticeBar a
una riga non e' quel posto: e' la ragione per cui l'export testo apre un
dialog e quello immagini scarica diretto.

fileName estratta da actions.ts: due chiamanti veri, non un'astrazione
prematura.

Bundle index: <prima> → <dopo> (<gzip prima> → <gzip dopo> gzip)."
```

---

### Task 6: quarta scena e2e

**Files:**
- Create: `scripts/e2e/export-testo.mjs`
- Modify: `scripts/e2e/run.mjs`

**Interfaces:**
- Consuma: `expectMenu`, `expectNodes`, `isMainModule`, `pickFromMenu`,
  `startEnv` da `./helpers.mjs`; esporta `run(browser, base): Promise<boolean>`
  come le altre tre scene.
- Produce: nulla. È la prova sulla build vera.

**Perché serve nonostante i test unitari.** Tre cose non esistono senza un
browser: la clipboard, il download, e il fatto che il dialog **si apra** dalla
voce di menu senza litigare col menu che si chiude. Ed è la build di produzione:
è lì che l'export SVG si era rotto mentre ogni test unitario passava.

- [ ] **Passo 1: scrivi la scena**

`scripts/e2e/export-testo.mjs`:

```js
/**
 * End-to-end dell'export testo: importa un DDL → apre il dialog → controlla i tre formati →
 * copia negli appunti → scarica.
 *
 * Copre quello che nessun test unitario può provare: che il dialog si apra dalla voce di menu
 * senza litigare col menu che si chiude, che la clipboard riceva davvero il testo, e che il
 * download arrivi — sulla build di produzione, che è dove l'export SVG si era rotto mentre ogni
 * test unitario passava.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/export-testo.mjs`.
 * `HEADLESS=0` per vedere il browser.
 */
import { readFile } from "node:fs/promises"
import { expectMenu, expectNodes, isMainModule, pickFromMenu, startEnv } from "./helpers.mjs"

const DDL = `CREATE TABLE mittente (id bigint PRIMARY KEY, etichetta text NOT NULL);
CREATE TABLE recapito (id bigint PRIMARY KEY, mittente_id bigint NOT NULL REFERENCES mittente(id));`

/** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
export async function run(browser, base) {
  const pageErrors = []
  let failed = false

  async function step(name, body) {
    process.stdout.write(`• ${name}… `)
    await body()
    pageErrors.push(...(await page.evaluate(() => window.__rejections.splice(0))))
    if (pageErrors.length > 0) throw new Error(`errori nella pagina: ${pageErrors.splice(0).join(" | ")}`)
    process.stdout.write("ok\n")
  }

  // La clipboard va concessa: senza il permesso `writeText` rigetta e il dialog mostrerebbe
  // l'avviso di fallimento invece di copiare.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  })
  const page = await context.newPage()
  page.on("pageerror", (e) => pageErrors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()))
  await page.addInitScript(() => {
    window.__rejections = []
    addEventListener("unhandledrejection", (e) => window.__rejections.push(String(e.reason?.stack ?? e.reason)))
  })

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("importa un DDL: due entità e una relazione da esportare", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: /Importa DDL/ }).click()
      await page.waitForSelector("[data-import-dialog]")
      await page.locator('[aria-label="DDL"]').click()
      await page.evaluate((text) => {
        const area = document.querySelector('[aria-label="DDL"]')
        const data = new DataTransfer()
        data.setData("text", text)
        area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
      }, DDL)
      await page.waitForSelector("[data-import-summary]", { timeout: 30_000 })
      await page.getByRole("button", { name: /^Importa 2 tabelle$/ }).click()
      await expectNodes(page, 2)
      await page.getByRole("button", { name: "Chiudi" }).click()
      await page.waitForSelector("[data-import-dialog]", { state: "detached" })
    })

    const testi = {}
    await step("apre il dialog e produce i tre formati, diversi fra loro", async () => {
      await pickFromMenu(page, page.getByRole("menuitem", { name: "Esporta testo…" }))
      await page.waitForSelector("[data-text-export-dialog]")
      const anteprima = page.locator("[data-export-preview]")

      // PostgreSQL è il formato iniziale.
      testi.postgres = await anteprima.textContent()
      // Il confronto è contro il testo **corrente**, non contro il primo: confrontando sempre con
      // quello di PostgreSQL la seconda attesa passerebbe subito, perché l'anteprima mostra già
      // MySQL, e si registrerebbe il testo sbagliato sotto la chiave `mermaid`.
      let precedente = testi.postgres
      for (const formato of ["MySQL", "Mermaid"]) {
        // ToggleGroupItem ha ruolo `radio`, non `button`.
        await page.getByRole("radio", { name: formato }).click()
        await page.waitForFunction(
          (p) => document.querySelector("[data-export-preview]").textContent !== p,
          precedente,
        )
        precedente = await anteprima.textContent()
        testi[formato.toLowerCase()] = precedente
      }

      if (!testi.postgres.includes('CREATE TABLE "mittente"')) throw new Error("il DDL Postgres non cita gli identificatori")
      if (!testi.mysql.includes("CREATE TABLE `mittente`")) throw new Error("il DDL MySQL non usa i backtick")
      if (!testi.mermaid.startsWith("erDiagram")) throw new Error("il Mermaid non inizia con erDiagram")
      if (testi.postgres === testi.mysql) throw new Error("i due dialetti producono lo stesso testo")
      if (!testi.postgres.includes("ADD CONSTRAINT")) throw new Error("manca la FOREIGN KEY in ALTER TABLE")
    })

    await step("copia negli appunti il formato mostrato", async () => {
      await page.getByRole("button", { name: "Copia" }).click()
      const appunti = await page.evaluate(() => navigator.clipboard.readText())
      if (appunti !== testi.mermaid) {
        throw new Error(`gli appunti non contengono il Mermaid mostrato (${appunti.slice(0, 60)}…)`)
      }
    })

    await step("scarica il file con l'estensione del formato", async () => {
      const download = page.waitForEvent("download", { timeout: 30_000 })
      await page.getByRole("button", { name: "Scarica" }).click()
      const d = await download
      if (!d.suggestedFilename().endsWith(".mmd")) throw new Error(`nome inatteso: ${d.suggestedFilename()}`)
      const contenuto = await readFile(await d.path(), "utf8")
      if (contenuto !== testi.mermaid) throw new Error("il file scaricato non è il testo mostrato")
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (export testo):", e)
  }
  console.log(failed ? "\ne2e export testo: FAIL" : "\ne2e export testo: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/export-testo.mjs` esegue solo questo scenario. */
if (isMainModule(import.meta.url)) {
  let ok = false
  let preview, browser
  try {
    let base
    ;({ preview, browser, base } = await startEnv())
    ok = await run(browser, base)
  } catch (e) {
    console.error("\nFALLITO:", e)
  } finally {
    await browser?.close()
    preview?.kill()
  }
  process.exit(ok ? 0 : 1)
}
```

- [ ] **Passo 2: registra la scena in `run.mjs`**

In `scripts/e2e/run.mjs`:

1. Aggiungi l'import, in ordine alfabetico dopo quello di `./export.mjs`:

```js
import { run as runExportTesto } from "./export-testo.mjs"
```

2. Dopo `const exportOk = await runExport(browser, base)` aggiungi:

```js
  const exportTestoOk = await runExportTesto(browser, base)
```

3. Cambia la riga dell'esito:

```js
  ok = persistenzaOk && importOk && exportOk && exportTestoOk
```

4. Aggiorna la docstring in testa al file: la frase «gli scenari della
   persistenza, dell'import e dell'export» diventa «gli scenari della
   persistenza, dell'import, dell'export immagini e dell'export testo», e
   l'elenco dei comandi per il lancio isolato guadagna
   `node scripts/e2e/export-testo.mjs`.

- [ ] **Passo 3: esegui l'e2e**

Esegui: `pnpm e2e`
Atteso: `4/4 PASS` e `echo $?` uguale a `0`.

Se la scena falisce al passo della clipboard, **non** togliere l'asserzione: il
permesso `clipboard-read` in Chromium headless è concesso dal contesto, e se
rigetta vuol dire che il dialog sta mostrando l'avviso di fallimento, cioè che
la copia non funziona davvero per l'utente.

- [ ] **Passo 4: prova che l'e2e fallisce quando deve**

Rompi deliberatamente `quote` in `src/io/emit/ddl.ts` facendo tornare il nome
nudo (`return name`), poi:

```bash
pnpm e2e; echo "exit=$?"
```

Atteso: FAIL sulla scena dell'export testo, `exit=1`.

**Controlla che `pnpm build` sia andato a buon fine dentro `pnpm e2e`.** Se
`tsc` falisce, l'e2e girerebbe sulla `dist/` vecchia e passerebbe per un motivo
che non ha niente a che vedere col codice — è già capitato con l'export SVG, e
la verifica risultò invalida. Poi ripristina `quote` e rilancia per confermare
il verde.

- [ ] **Passo 5: commit**

```bash
git add scripts/e2e/export-testo.mjs scripts/e2e/run.mjs
git commit -m "test(e2e): quarta scena, l'export testo sulla build di produzione

Copre le tre cose che non esistono senza un browser: che il dialog si apra
dalla voce di menu senza litigare col menu che si chiude, che la clipboard
riceva davvero il testo, e che il download arrivi.

Verificata anche al contrario: rompendo la citazione degli identificatori
la scena falisce con exit=1, e il build dentro pnpm e2e e' andato a buon
fine — altrimenti la scena girerebbe sulla dist vecchia, come e' gia'
successo con l'export SVG."
```

---

### Task 7: aggiorna il debito e la spec madre

**Files:**
- Modify: `docs/debito-tecnico.md`
- Modify: `docs/superpowers/specs/2026-09-06-dev-designer-design.md`

- [ ] **Passo 1: segna il punto 1 dell'ordine di consegna come chiuso**

In `docs/superpowers/specs/2026-09-06-dev-designer-design.md`, nella sezione
«Ordine di consegna», la voce 1 diventa:

```markdown
1. ~~Shell + ER completo (disegno, validazione, import DDL, export DDL e
   Mermaid).~~ Fatto: import DDL, export immagini (SVG, PNG) ed export testo
   (DDL PostgreSQL e MySQL, Mermaid). Restano fuori l'auto layout con ELK e la
   copia dell'immagine negli appunti, che hanno spec proprie.
```

- [ ] **Passo 2: aggiungi al debito quello che questo lavoro lascia aperto**

In `docs/debito-tecnico.md`, sezione **Nuove voci**, aggiungi le voci che
l'implementazione ha davvero prodotto. Se non ne ha prodotte, scrivi
esplicitamente che non ce ne sono: la regola del documento è che *«un rilievo
che si decide di non correggere si scrive qui nello stesso momento in cui si
decide»*, e il silenzio non è una decisione.

Voci già note da riportare, salvo che l'implementazione le abbia chiuse:

- **`serial` non produce avviso** pur avendo semantiche diverse nei due
  dialetti (in MySQL è `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`): appartiene a
  entrambi gli insiemi. Deciso così per non tradurre la semantica.
- **`baseType` si confonde su un letterale con una parentesi chiusa dentro**,
  come `enum('a)b')`. Il risultato non corrisponde a nessun insieme e quindi
  non produce alcun avviso: fallisce in silenzio, che è il modo giusto di
  sbagliare qui, ma resta un limite noto.
- **DT-7** resta aperta: `initial()` in `src/ui/use-theme.ts` legge
  `localStorage` senza `try/catch`.

- [ ] **Passo 3: commit**

```bash
git add docs/debito-tecnico.md docs/superpowers/specs/2026-09-06-dev-designer-design.md
git commit -m "docs: chiude il punto 1 dell'ordine di consegna e registra i limiti noti

Shell + ER completo era l'unico punto aperto della spec madre a includere
l'export testo. Restano fuori l'auto layout ELK e la copia dell'immagine
negli appunti, che hanno spec proprie.

I due limiti dell'emettitore — serial ambiguo fra i dialetti e baseType
confuso da un letterale con una parentesi chiusa — vanno nel debito ora
che sono decisi, non quando daranno fastidio."
```

---

## Verifica finale

- [ ] `pnpm lint` — nessun errore
- [ ] `pnpm test` — tutti verdi, e il numero di test è cresciuto di ~45
- [ ] `pnpm build` — verde
- [ ] `pnpm e2e` — `4/4 PASS`, `echo $?` uguale a `0`
- [ ] `git diff --stat master..HEAD` — rivedi il diff per intero
- [ ] La verifica manuale del Mermaid (Task 3, Passo 5) è stata fatta e il
      commit lo dice
- [ ] I due numeri del bundle (Task 5) sono nel messaggio di commit
- [ ] **Nessun test tocca i dump reali dell'utente.** Il controllo si fa sui
      percorsi, non sui nomi: nominare qui un identificatore preso da quei file
      lo scriverebbe in un documento committato, cioè commetterebbe l'errore che
      la regola vieta.
      ```bash
      git diff master..HEAD | grep -nE 'fixtures/(postgres|mysql)\.sql'
      ```
      Non deve trovare nulla: `*.synthetic.sql` è committato e ammesso, i due
      dump nudi sono git-ignored e fuori dai test.
- [ ] `git push` e il merge **non** li fai: sono decisioni dell'utente
