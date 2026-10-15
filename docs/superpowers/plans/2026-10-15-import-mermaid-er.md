# Import Mermaid ER: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** importare un `erDiagram` Mermaid nel documento aperto, con il modulo comune che classi e flowchart riuseranno.

**Architecture:** un parser ER scritto a mano produce un AST fedele al testo, che `mapEr` traduce in un frammento di `ErModel` con le regole della spec. Un comando `importMermaidEr` lo innesta con un solo dispatch. Le entità nuove si dispongono con ELK sul solo frammento, attraverso il motore iniettato. Un dialog gemello di `ImportDdlDialog` collega il tutto.

**Tech Stack:** TypeScript, React 19, zustand + immer (`documentStore`), vitest (jsdom solo per l'oracolo), Playwright per gli e2e, `mermaid@12.2.0` solo come devDependency.

**Spec:** `docs/superpowers/specs/2026-10-15-import-mermaid-design.md`. Questo è il primo dei tre piani previsti dal §11 della spec: modulo comune + ER. Classi e flowchart avranno un piano ciascuno, che riusa `common.ts`, `analyse.ts` e lo schema dei comandi di questo.

**Verifica preliminare.** Il codice di questo piano è stato scritto e fatto girare prima della stesura, su questo stesso repository: 52 test unitari, l'oracolo `mermaid.parse()`, `pnpm lint`, `tsc` e lo scenario e2e sulla build di produzione. Le grammatiche citate sono quelle di `mermaid@12.2.0` (`packages/mermaid/src/diagrams/er/parser/erDiagram.jison`).

## Global Constraints

- `mermaid` entra **solo** fra le `devDependencies`, alla versione esatta `12.2.0`, e lo importa solo `src/io/mermaid/oracle.test.ts`.
- Parser sul main thread, sincrono, senza dipendenze a runtime (spec §3.1, §3.2).
- Gli avvisi sono `ParseWarning` (`src/io/ddl/schema.ts`), aggregati per categoria, con le righe nel messaggio (spec §3.3).
- Un errore strutturale lancia `MermaidSyntaxError` con l'offset: nessun recupero parziale (spec §3.3).
- I commenti `%%` e il front-matter si ignorano senza avviso (spec §3.3).
- Le relazioni importate hanno `attributes: []` su entrambi i lati (ADR 0003, spec §4.1).
- `src/editor` non importa `src/io` (ESLint, `eslint.config.js`): il motore di layout arriva come parametro.
- Tutto l'import è **un solo dispatch**, annullabile con un solo ⌘Z (spec §5).
- Testi dell'interfaccia e messaggi in italiano.

## Review Focus

Cinque ingressi che la spec non nomina e che un utente incontrerà presto. Ciascuno ha già il suo test nel task indicato.

1. **`}` dentro il commento di un attributo** (`int id PK "chiude }"`): il blocco non si deve chiudere lì. Il test è nel Task 2, la funzione è `closingBrace`.
2. **A capo di Windows** (`\r\n`), in un testo incollato da un editor Windows: si deve leggere come con `\n`. Task 2.
3. **Nomi non ASCII senza virgolette** (`Città`), e un attributo che si chiama come una chiave (`int pk PK`): nome `pk`, chiave PK. Task 2.
4. **Due istruzioni sulla stessa riga**, o un'etichetta con spazi senza virgolette: errore chiaro sulla riga, non una relazione letta a metà. Task 2.
5. **Nome con lo schema, senza virgolette, dentro una relazione** (`pub.a ||--o{ b : x`): si spezza sul primo punto come i nomi citati. Task 3.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/io/mermaid/common.ts` | blocchi di un `.md`, rilevamento della famiglia, rumore (front-matter, `%%`), righe, entità `#…;`, aggregazione degli avvisi, `MermaidSyntaxError` |
| `src/io/mermaid/er-parse.ts` | `erDiagram` → `ErAst` + avvisi sintattici |
| `src/io/mermaid/er-fixtures.ts` | testi ER validi, condivisi fra test del parser e oracolo |
| `src/io/mermaid/er-map.ts` | `ErAst` → `ErFragment` (regole della spec §4.1) + avvisi semantici |
| `src/io/mermaid/analyse.ts` | il punto d'ingresso del dialog: rilevamento → parse → map, errori come esito |
| `src/editor/commands/import-mermaid.ts` | esito per entità, selezione, disposizione con ELK, comando `importMermaidEr` |
| `src/ui/import/ImportMermaidDialog.tsx` | il dialog |
| `scripts/e2e/import-mermaid.mjs` | lo scenario end-to-end |

File modificati: `src/editor/commands/import.ts` (esporta `GUTTER`), `src/ui/DocumentMenu.tsx`, `scripts/e2e/run.mjs`, `README.md`, `package.json`/`pnpm-lock.yaml`.

---

### Task 1: Modulo comune

**Files:**
- Create: `src/io/mermaid/common.ts`
- Test: `src/io/mermaid/common.test.ts`

**Interfaces:**
- Consumes: `ParseWarning` da `src/io/ddl/schema.ts` (`{ message: string; at?: number }`).
- Produces:
  - `type MermaidKind = "er" | "class" | "flow"`;
  - `interface MermaidBlock { text: string; offset: number }`;
  - `class MermaidSyntaxError extends Error { readonly at: number }`;
  - `blocks(text): MermaidBlock[]`, `stripNoise(text): string`;
  - `detect(text): MermaidKind | { unknown: string } | null`;
  - `lineOf(text, at): number`, `decodeEntities(text): string`;
  - `interface Finding<C extends string> { category: C; at: number; subject?: string }`;
  - `aggregate<C>(findings, text, messages: Record<C, string>): ParseWarning[]`.

- [ ] **Step 1: Scrivi il test**

```ts
import { describe, expect, it } from "vitest"
import { aggregate, blocks, decodeEntities, detect, lineOf, stripNoise } from "./common"

describe("blocks", () => {
  it("restituisce il testo intero quando non ci sono blocchi mermaid", () => {
    expect(blocks("erDiagram\n  A")).toEqual([{ text: "erDiagram\n  A", offset: 0 }])
  })

  it("estrae ogni blocco ```mermaid di un markdown con l'offset del suo contenuto", () => {
    const md = "# T\n\n```mermaid\nerDiagram\n  A\n```\n\ntesto\n\n```mermaid\nclassDiagram\n```\n"
    const found = blocks(md)
    expect(found.map((b) => b.text)).toEqual(["erDiagram\n  A\n", "classDiagram\n"])
    expect(md.slice(found[0]!.offset, found[0]!.offset + 9)).toBe("erDiagram")
  })
})

describe("stripNoise", () => {
  it("toglie front-matter e commenti %% senza spostare gli offset", () => {
    const text = "---\ntitle: x\n---\nerDiagram\n  A %% nota\n  %%{init: {}}%%\n"
    const out = stripNoise(text)
    expect(out).toHaveLength(text.length)
    expect(out.indexOf("erDiagram")).toBe(text.indexOf("erDiagram"))
    expect(out).not.toContain("title")
    expect(out).not.toContain("nota")
    expect(out).not.toContain("init")
  })

  it("lascia stare un %% dentro le virgolette", () => {
    expect(stripNoise('A ||--o{ B : "50%% sconto"')).toContain("50%% sconto")
  })
})

describe("detect", () => {
  it("riconosce le tre famiglie dalla prima parola utile", () => {
    expect(detect("%% c\nerDiagram")).toBe("er")
    expect(detect("---\na: b\n---\nclassDiagram")).toBe("class")
    expect(detect("graph TD")).toBe("flow")
    expect(detect("flowchart LR")).toBe("flow")
  })

  it("restituisce la parola sconosciuta, o null sul testo vuoto", () => {
    expect(detect("sequenceDiagram\n  A->>B: x")).toEqual({ unknown: "sequenceDiagram" })
    expect(detect("  \n %% solo commento")).toBeNull()
  })
})

describe("lineOf e decodeEntities", () => {
  it("contano le righe da 1", () => {
    expect(lineOf("a\nb\nc", 0)).toBe(1)
    expect(lineOf("a\nb\nc", 4)).toBe(3)
  })

  it("decodificano le entità con nome e numeriche, e lasciano le sconosciute", () => {
    expect(decodeEntities("#lt;b#gt; #amp; #quot; #9829; #foo;")).toBe('<b> & " ♥ #foo;')
  })
})

describe("aggregate", () => {
  it("fa un avviso per categoria, con righe e nomi", () => {
    const text = "x\ny\nz"
    const out = aggregate(
      [{ category: "a", at: 0, subject: "P" }, { category: "a", at: 4, subject: "Q" }, { category: "b", at: 2 }],
      text,
      { a: "Persi", b: "Altro" },
    )
    expect(out).toEqual([
      { message: "Persi: P, Q (righe 1, 3)", at: 0 },
      { message: "Altro (riga 2)", at: 2 },
    ])
  })
})
```

- [ ] **Step 2: Verifica che fallisca**

Run: `pnpm vitest run src/io/mermaid/common.test.ts`
Expected: FAIL, `Failed to resolve import "./common"`

- [ ] **Step 3: Scrivi l'implementazione**

```ts
import type { ParseWarning } from "@/io/ddl/schema"

/** Le famiglie che l'import sa leggere, col nome che ha la prima parola del testo Mermaid. */
export type MermaidKind = "er" | "class" | "flow"

/** Un blocco da importare e il punto del testo originale in cui comincia: serve a dire la riga giusta. */
export interface MermaidBlock {
  text: string
  offset: number
}

/**
 * Errore strutturale: il testo non si importa per niente (spec §3.3). `at` è l'offset nel testo
 * dato al parser, da cui `lineOf` ricava la riga da mostrare.
 */
export class MermaidSyntaxError extends Error {
  readonly at: number

  constructor(message: string, at: number) {
    super(message)
    this.name = "MermaidSyntaxError"
    this.at = at
  }
}

const FENCE = /^```mermaid[^\n]*\n([\s\S]*?)^```/gm

/** I blocchi ```mermaid di un markdown; il testo intero se non ce n'è nessuno. */
export function blocks(text: string): MermaidBlock[] {
  const found = [...text.matchAll(FENCE)].map((m) => ({ text: m[1]!, offset: m.index + m[0].indexOf("\n") + 1 }))
  return found.length > 0 ? found : [{ text, offset: 0 }]
}

/** Sostituisce ogni carattere che non è un a capo con uno spazio: gli offset restano quelli del testo originale. */
const blank = (s: string): string => s.replace(/[^\n]/g, " ")

/**
 * Toglie front-matter (`---` … `---` in testa) e commenti `%%` fino a fine riga, direttive `%%{…}%%`
 * comprese, senza spostare nessun offset (stessa garanzia di `stripPsqlMeta` nel DDL). Si ignorano
 * senza avviso (spec §3.3). Un `%%` dentro una stringa fra virgolette non è un commento.
 */
export function stripNoise(text: string): string {
  let out = text.replace(/^---\n[\s\S]*?\n---[^\n]*/, blank)
  out = out.replace(/"[^"\n]*"|%%[^\n]*/g, (m) => (m.startsWith("%%") ? blank(m) : m))
  return out
}

/** La famiglia del testo, dalla prima parola utile; la parola stessa se non è una delle tre; `null` se il testo è vuoto. */
export function detect(text: string): MermaidKind | { unknown: string } | null {
  const word = stripNoise(text).match(/\S+/)?.[0]
  if (word === undefined) return null
  const lower = word.toLowerCase()
  if (lower === "erdiagram") return "er"
  if (lower === "classdiagram") return "class"
  if (lower === "flowchart" || lower === "graph") return "flow"
  return { unknown: word }
}

/** Riga 1-based dell'offset `at`. */
export function lineOf(text: string, at: number): number {
  let line = 1
  for (let i = 0; i < at && i < text.length; i++) if (text[i] === "\n") line++
  return line
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"' }

/** Decodifica le entità Mermaid `#nome;` e `#123;`; le sconosciute restano com'erano. */
export function decodeEntities(text: string): string {
  return text.replace(/#(\w+);/g, (m, code: string) => {
    if (/^\d+$/.test(code)) return String.fromCodePoint(Number(code))
    return NAMED[code] ?? m
  })
}

/** Un'occorrenza da segnalare: la categoria la sceglie chi la trova, `at` dice dove. */
export interface Finding<C extends string> {
  category: C
  at: number
  /** Il nome di ciò che si è perso, quando serve all'utente per ritrovarlo. */
  subject?: string
}

/**
 * Un avviso per categoria, non uno per occorrenza (gli export fanno lo stesso, `emit/result.ts`): il
 * messaggio porta le righe e, se ci sono, i nomi; `at` è la prima occorrenza.
 */
export function aggregate<C extends string>(
  findings: readonly Finding<C>[], text: string, messages: Readonly<Record<C, string>>,
): ParseWarning[] {
  const byCategory = new Map<C, Finding<C>[]>()
  for (const f of findings) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f])
  return [...byCategory].map(([category, list]) => {
    const lines = [...new Set(list.map((f) => lineOf(text, f.at)))].join(", ")
    const subjects = [...new Set(list.flatMap((f) => (f.subject ? [f.subject] : [])))]
    const what = subjects.length > 0 ? `: ${subjects.join(", ")}` : ""
    return { message: `${messages[category]}${what} (${lines.includes(",") ? "righe" : "riga"} ${lines})`, at: list[0]!.at }
  })
}
```

- [ ] **Step 4: Verifica che passi**

Run: `pnpm vitest run src/io/mermaid/common.test.ts`
Expected: PASS, 9 test

- [ ] **Step 5: Commit**

```bash
git add src/io/mermaid/common.ts src/io/mermaid/common.test.ts
git commit -m "feat(import-mermaid): il modulo comune a tutte le famiglie"
```

---

### Task 2: Parser `erDiagram`

**Files:**
- Create: `src/io/mermaid/er-fixtures.ts`, `src/io/mermaid/er-parse.ts`
- Test: `src/io/mermaid/er-parse.test.ts`

**Interfaces:**
- Consumes: `aggregate`, `decodeEntities`, `MermaidSyntaxError`, `stripNoise`, `Finding` (Task 1).
- Produces:
  - `type ErCardinalityToken = "ZERO_OR_ONE" | "ZERO_OR_MORE" | "ONE_OR_MORE" | "ONLY_ONE" | "MD_PARENT"`;
  - `ErAstAttribute { type; name; keys: ("PK"|"FK"|"UK")[]; comment: string | null; at }`;
  - `ErAstEntity { id; alias: string | null; attributes; at }`;
  - `ErAstRelationship { left; leftCard; right; rightCard; identifying; label: string | null; at }`;
  - `ErAst { entities; relationships }`, `parseEr(text): { ast: ErAst; warnings: ParseWarning[] }`;
  - `ER_VALID: Record<string, string>`, letto anche dall'oracolo (Task 4).

Note per chi implementa:
- Le forme di cardinalità e di linea sono quelle del lexer di `mermaid@12.2`, nello stesso ordine. Fuori dai blocchi si legge un'istruzione per riga: la grammatica ne permetterebbe di più, ma la scelta è annotata con un commento `ponytail:`.
- Mermaid vuole sempre l'etichetta della relazione: `A ||--o{ B` senza `: x` lo rifiuta. Il nostro parser la accetta anche assente (spec §4.1), quindi una fixture senza etichetta **non** va in `ER_VALID`, perché l'oracolo la rifiuterebbe.
- L'etichetta è un gettone solo, fra virgolette o una parola, come `role` nella grammatica. Un'etichetta con spazi senza virgolette dà un errore chiaro.
- Fra le parole chiave c'è anche `subgraph`, che è nuovo in `mermaid@12`: si appiattisce con un avviso, come i `namespace` delle classi (spec §4.2). La spec ER non lo nominava.

- [ ] **Step 1: Scrivi le fixture**

```ts
/**
 * Testi `erDiagram` che Mermaid accetta: li leggono i test del parser e la suite oracolo, che
 * controlla che `mermaid.parse()` li accetti davvero (spec §8). Chi aggiunge un caso valido lo
 * aggiunge qui, così l'oracolo lo vede.
 */
export const ER_VALID: Readonly<Record<string, string>> = {
  basic: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  CUSTOMER {
    string name PK
    int age
  }
`,
  words: `erDiagram
  A only one to zero or more B : "ha"
  C one or more optionally to many(0) D : x
`,
  symbols: `erDiagram
  A |o..o| B : a
  C }|--|{ D : b
  E ||.-o{ F : c
  G 1--0+ H : d
`,
  keysAndComments: `erDiagram
  "pub.utenti" {
    bigint id PK "chiave"
    bigint gruppo_id FK
    varchar(255) email UK
    int a PK, FK
  }
`,
  aliasAndStyle: `---
title: Prova
---
erDiagram
  %% un commento
  direction LR
  p[Persona] {
    string nome
  }
  p ||--o{ q : ""
  style p fill:#f9f
  classDef rosso fill:#f00
`,
  repeated: `erDiagram
  A {
    int id PK
  }
  A {
    string nome
    int id
  }
`,
}
```

- [ ] **Step 2: Scrivi il test**

```ts
import { describe, expect, it } from "vitest"
import { MermaidSyntaxError } from "./common"
import { ER_VALID } from "./er-fixtures"
import { parseEr } from "./er-parse"

const syntaxErrorAt = (text: string): number => {
  try {
    parseEr(text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return e.at
    throw e
  }
  throw new Error("nessun errore")
}

describe("parseEr", () => {
  it("legge relazioni ed entità con gli attributi", () => {
    const { ast, warnings } = parseEr(ER_VALID.basic!)
    expect(warnings).toEqual([])
    expect(ast.relationships).toEqual([
      { left: "CUSTOMER", leftCard: "ONLY_ONE", right: "ORDER", rightCard: "ZERO_OR_MORE", identifying: true, label: "places", at: 12 },
    ])
    expect(ast.entities).toHaveLength(1)
    expect(ast.entities[0]).toMatchObject({ id: "CUSTOMER", alias: null })
    expect(ast.entities[0]!.attributes.map(({ type, name, keys }) => ({ type, name, keys }))).toEqual([
      { type: "string", name: "name", keys: ["PK"] },
      { type: "int", name: "age", keys: [] },
    ])
  })

  it("legge le cardinalità a parole e le linee «to» e «optionally to»", () => {
    const [a, c] = parseEr(ER_VALID.words!).ast.relationships
    expect(a).toMatchObject({ leftCard: "ONLY_ONE", rightCard: "ZERO_OR_MORE", identifying: true, label: "ha" })
    expect(c).toMatchObject({ leftCard: "ONE_OR_MORE", rightCard: "ZERO_OR_MORE", identifying: false, label: "x" })
  })

  it("legge le cardinalità a simboli e le linee tratteggiate", () => {
    const rels = parseEr(ER_VALID.symbols!).ast.relationships
    expect(rels.map((r) => [r.leftCard, r.identifying, r.rightCard])).toEqual([
      ["ZERO_OR_ONE", false, "ZERO_OR_ONE"],
      ["ONE_OR_MORE", true, "ONE_OR_MORE"],
      ["ONLY_ONE", false, "ZERO_OR_MORE"],
      ["ONLY_ONE", true, "ZERO_OR_MORE"],
    ])
  })

  it("legge nomi citati, chiavi multiple e commenti", () => {
    const [entity] = parseEr(ER_VALID.keysAndComments!).ast.entities
    expect(entity!.id).toBe("pub.utenti")
    expect(entity!.attributes.map(({ type, name, keys, comment }) => ({ type, name, keys, comment }))).toEqual([
      { type: "bigint", name: "id", keys: ["PK"], comment: "chiave" },
      { type: "bigint", name: "gruppo_id", keys: ["FK"], comment: null },
      { type: "varchar(255)", name: "email", keys: ["UK"], comment: null },
      { type: "int", name: "a", keys: ["PK", "FK"], comment: null },
    ])
  })

  it("legge tipi fra backtick, tipi con tilde e il ? del tipo", () => {
    const { ast } = parseEr("erDiagram\n  A {\n    `double precision` x\n    List~int~ ys\n    int? z\n  }\n")
    expect(ast.entities[0]!.attributes.map((a) => [a.type, a.name])).toEqual([["double precision", "x"], ["List~int~", "ys"], ["int?", "z"]])
  })

  it("accetta un blocco su una riga sola e un blocco vuoto", () => {
    const { ast } = parseEr("erDiagram\n  A { int id PK }\n  B {}\n")
    expect(ast.entities.map((e) => [e.id, e.attributes.length])).toEqual([["A", 1], ["B", 0]])
  })

  it("segnala alias, stili e direzione, e ignora front-matter e commenti", () => {
    const { ast, warnings } = parseEr(ER_VALID.aliasAndStyle!)
    expect(ast.entities[0]).toMatchObject({ id: "p", alias: "Persona" })
    expect(ast.relationships[0]).toMatchObject({ left: "p", right: "q", label: null })
    expect(warnings.map((w) => w.message)).toEqual([
      "Direzione ignorata: il diagramma ER si dispone dall'alto in basso (riga 6)",
      "Stili scartati (style, classDef, class, :::), il diagramma usa i suoi (righe 11, 12)",
    ])
  })

  it("appiattisce i subgraph con un avviso", () => {
    const { ast, warnings } = parseEr("erDiagram\n  subgraph S [Titolo]\n    A ||--o{ B : x\n  end\n")
    expect(ast.relationships).toHaveLength(1)
    expect(warnings.map((w) => w.message)).toEqual(["Subgraph appiattiti: le entità entrano, i riquadri no (riga 2)"])
  })

  it("non chiude il blocco su una } dentro un commento", () => {
    const { ast } = parseEr('erDiagram\n  A {\n    int id PK "chiude }"\n    string nome\n  }\n')
    expect(ast.entities[0]!.attributes.map((a) => [a.name, a.comment])).toEqual([["id", "chiude }"], ["nome", null]])
  })

  it("legge un testo con gli a capo di Windows", () => {
    const { ast } = parseEr("erDiagram\r\n  A ||--o{ B : ha\r\n  A {\r\n    int id PK\r\n  }\r\n")
    expect(ast.relationships[0]).toMatchObject({ left: "A", right: "B", label: "ha" })
    expect(ast.entities[0]!.attributes.map((a) => a.name)).toEqual(["id"])
  })

  it("accetta nomi non ASCII senza virgolette e un attributo che si chiama come una chiave", () => {
    const { ast } = parseEr("erDiagram\n  Città ||--o{ Società : ospita\n  Città {\n    int pk PK\n  }\n")
    expect(ast.relationships[0]).toMatchObject({ left: "Città", right: "Società" })
    expect(ast.entities[0]!.attributes[0]).toMatchObject({ name: "pk", keys: ["PK"] })
  })

  it("rifiuta due istruzioni sulla stessa riga invece di leggerne mezza", () => {
    expect(syntaxErrorAt("erDiagram\n  A ||--o{ B : x C ||--|| D : y\n")).toBe(12)
  })

  it("lancia un errore con l'offset sui guasti strutturali", () => {
    const unclosed = "erDiagram\n  A {\n    int id\n"
    expect(syntaxErrorAt(unclosed)).toBe(unclosed.indexOf("{"))
    expect(syntaxErrorAt("erDiagram\n  A ||--x B : y\n")).toBe(12)
    expect(syntaxErrorAt("erDiagram\n  end\n")).toBe(12)
    expect(syntaxErrorAt("erDiagram\n  subgraph S\n  A\n")).toBe(12)
    expect(syntaxErrorAt("classDiagram\n")).toBe(0)
  })

  it("resta lineare su un testo grande", () => {
    const lines = ["erDiagram"]
    for (let i = 0; i < 5000; i++) {
      lines.push(`  E${i} ||--o{ E${i + 1} : r`, `  E${i} {`, "    int id PK", "    varchar(255) nome", "  }")
    }
    const started = performance.now()
    const { ast } = parseEr(lines.join("\n"))
    expect(ast.relationships).toHaveLength(5000)
    // Un'espressione regolare che torna indietro in modo esponenziale sfora di ordini di grandezza.
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
```

- [ ] **Step 3: Verifica che fallisca**

Run: `pnpm vitest run src/io/mermaid/er-parse.test.ts`
Expected: FAIL, `Failed to resolve import "./er-parse"`

- [ ] **Step 4: Scrivi l'implementazione**

```ts
import type { ParseWarning } from "@/io/ddl/schema"
import { aggregate, decodeEntities, MermaidSyntaxError, stripNoise, type Finding } from "./common"

/** I cinque gettoni di cardinalità della grammatica (`erDiagram.jison`), qualunque forma li scriva. */
export type ErCardinalityToken = "ZERO_OR_ONE" | "ZERO_OR_MORE" | "ONE_OR_MORE" | "ONLY_ONE" | "MD_PARENT"

export type ErKeyToken = "PK" | "FK" | "UK"

export interface ErAstAttribute {
  type: string
  name: string
  keys: ErKeyToken[]
  comment: string | null
  at: number
}

/** Una dichiarazione di entità: un blocco, o il nome da solo. La stessa entità può comparire più volte. */
export interface ErAstEntity {
  id: string
  alias: string | null
  attributes: ErAstAttribute[]
  at: number
}

/** Una riga di relazione così come è scritta: `left` è l'entità a sinistra, `leftCard` il marcatore accanto a lei. */
export interface ErAstRelationship {
  left: string
  leftCard: ErCardinalityToken
  right: string
  rightCard: ErCardinalityToken
  identifying: boolean
  label: string | null
  at: number
}

export interface ErAst {
  entities: ErAstEntity[]
  relationships: ErAstRelationship[]
}

export interface ErParseResult {
  ast: ErAst
  warnings: ParseWarning[]
}

type ErSyntaxCategory = "style" | "direction" | "accessibility" | "title" | "subgraph"

const MESSAGES: Record<ErSyntaxCategory, string> = {
  style: "Stili scartati (style, classDef, class, :::), il diagramma usa i suoi",
  direction: "Direzione ignorata: il diagramma ER si dispone dall'alto in basso",
  accessibility: "Titolo e descrizione di accessibilità scartati",
  title: "Titolo scartato",
  subgraph: "Subgraph appiattiti: le entità entrano, i riquadri no",
}

/** Le forme di cardinalità del lexer di `mermaid@12.2`, dalla più lunga: l'alternanza prova nell'ordine. */
const CARDINALITY: readonly [string, ErCardinalityToken][] = [
  ["one or zero", "ZERO_OR_ONE"], ["one or more", "ONE_OR_MORE"], ["one or many", "ONE_OR_MORE"],
  ["zero or one", "ZERO_OR_ONE"], ["zero or more", "ZERO_OR_MORE"], ["zero or many", "ZERO_OR_MORE"],
  ["only one", "ONLY_ONE"], ["many(0)", "ZERO_OR_MORE"], ["many(1)", "ONE_OR_MORE"], ["many", "ZERO_OR_MORE"],
  ["one", "ONLY_ONE"], ["1+", "ONE_OR_MORE"], ["0+", "ZERO_OR_MORE"], ["1", "ONLY_ONE"],
  ["|o", "ZERO_OR_ONE"], ["o|", "ZERO_OR_ONE"], ["}o", "ZERO_OR_MORE"], ["o{", "ZERO_OR_MORE"],
  ["}|", "ONE_OR_MORE"], ["|{", "ONE_OR_MORE"], ["||", "ONLY_ONE"], ["u", "MD_PARENT"],
]
const CARD_BY_FORM = new Map(CARDINALITY.map(([form, token]) => [form, token]))

/** Il tipo di linea: `--` e `to` identificanti, gli altri no. «optionally to» prima di «to». */
const LINE_FORMS: readonly [string, boolean][] = [["--", true], ["..", false], [".-", false], ["-.", false], ["optionally to", false], ["to", true]]
const LINE_BY_FORM = new Map(LINE_FORMS)

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const CARD = `(${CARDINALITY.map(([f]) => escape(f)).join("|")})`
const LINE = `(${LINE_FORMS.map(([f]) => escape(f)).join("|")})`
/** Nome di entità: citato, o la regola `UNICODE_TEXT` del lexer (lettere, cifre, `_`, `-`, `*`, `.`). */
const NAME = `("[^"\\n]+"|[\\w.*\\-\\u0080-\\uFFFF]+)`
const STYLE = `(:::[\\w,\\-]+)?`

const RELATIONSHIP_HEAD = `^${NAME}\\s*${STYLE}\\s*${CARD}\\s*${LINE}\\s*${CARD}\\s*${NAME}\\s*${STYLE}`
/** L'etichetta è un solo gettone, come `role` nella grammatica: fra virgolette, o una parola. */
const RELATIONSHIP = new RegExp(`${RELATIONSHIP_HEAD}\\s*(?::\\s*("[^"]*"|[^\\s"]+))?\\s*$`, "i")
const LOOKS_LIKE_RELATIONSHIP = new RegExp(RELATIONSHIP_HEAD, "i")
const ENTITY = new RegExp(`^${NAME}\\s*(?:\\[\\s*${NAME}\\s*\\])?\\s*${STYLE}\\s*$`)

const unquote = (s: string): string => (s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s.slice(1, -1) : s)

/** I gettoni del contenuto di un blocco: le regole `<block>` del lexer, nello stesso ordine. */
type BlockToken =
  | { kind: "key"; value: ErKeyToken; raw: string; at: number }
  | { kind: "word"; value: string; at: number }
  | { kind: "comment"; value: string; at: number }
  | { kind: "comma" | "question"; at: number }

const BLOCK_RULES: readonly [RegExp, (m: string, at: number) => BlockToken][] = [
  [/^(PK|FK|UK)\b/i, (m, at) => ({ kind: "key", value: m.toUpperCase() as ErKeyToken, raw: m, at })],
  [/^[^\s]*~[^\n]*~[^\s]*/, (m, at) => ({ kind: "word", value: m, at })],
  [/^[*A-Za-z_À-￿][A-Za-z0-9\-_[\]().,À-￿*]*/, (m, at) => ({ kind: "word", value: m, at })],
  [/^`[^`]+`/, (m, at) => ({ kind: "word", value: m.slice(1, -1), at })],
  [/^"[^"]*"/, (m, at) => ({ kind: "comment", value: m.slice(1, -1), at })],
  [/^,/, (_, at) => ({ kind: "comma", at })],
  [/^\?/, (_, at) => ({ kind: "question", at })],
]

/** La `}` che chiude il blocco aperto in `open`, saltando quelle dentro un commento fra virgolette. -1 se manca. */
function closingBrace(text: string, open: number): number {
  let quoted = false
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted
    else if (text[i] === "}" && !quoted) return i
  }
  return -1
}

function blockTokens(body: string, base: number): BlockToken[] {
  const out: BlockToken[] = []
  let i = 0
  while (i < body.length) {
    const ws = /^\s+/.exec(body.slice(i))
    if (ws) {
      i += ws[0].length
      continue
    }
    const rest = body.slice(i)
    const rule = BLOCK_RULES.find(([re]) => re.test(rest))
    if (!rule) throw new MermaidSyntaxError(`Carattere inatteso «${rest[0]}» nel blocco dell'entità`, base + i)
    const m = rule[0].exec(rest)![0]
    out.push(rule[1](m, base + i))
    i += m.length
  }
  return out
}

/** `tipo nome [PK, FK, UK] ["commento"]`, ripetuto: gli a capo nel blocco non contano, come nel lexer. */
function attributes(body: string, base: number): ErAstAttribute[] {
  const tokens = blockTokens(body, base)
  const out: ErAstAttribute[] = []
  let i = 0
  const word = (what: string): { value: string; at: number } => {
    const t = tokens[i]
    // Un nome di attributo che si chiama come una chiave (`int pk`) è legittimo: qui serve una parola.
    if (t?.kind === "word") {
      i++
      return { value: t.value, at: t.at }
    }
    if (t?.kind === "key" && what === "il nome") {
      i++
      return { value: t.raw, at: t.at }
    }
    throw new MermaidSyntaxError(`Manca ${what} dell'attributo`, t?.at ?? base + body.length)
  }
  while (i < tokens.length) {
    const type = word("il tipo")
    let typeText = type.value
    if (tokens[i]?.kind === "question") {
      typeText += "?"
      i++
    }
    const name = word("il nome")
    const keys: ErKeyToken[] = []
    while (tokens[i]?.kind === "key") {
      keys.push((tokens[i] as { value: ErKeyToken }).value)
      i++
      if (tokens[i]?.kind === "comma" && tokens[i + 1]?.kind === "key") i++
    }
    let comment: string | null = null
    if (tokens[i]?.kind === "comment") {
      comment = (tokens[i] as { value: string }).value
      i++
    }
    out.push({ type: typeText, name: name.value, keys, comment, at: type.at })
  }
  return out
}

/**
 * Legge un `erDiagram` nell'AST della famiglia (spec §3.3): fedele al testo, nessuna regola di
 * dominio. Gli avvisi sono i soli costrutti sintattici scartati; un errore strutturale lancia
 * `MermaidSyntaxError` con l'offset.
 *
 * ponytail: una istruzione per riga fuori dai blocchi, mentre la grammatica ne ammette più d'una
 * sulla stessa riga. Nessuno lo scrive e l'export non lo produce; se un file reale lo fa, serve un
 * tokenizzatore vero al posto delle espressioni regolari per riga.
 */
export function parseEr(input: string): ErParseResult {
  const text = stripNoise(input)
  const findings: Finding<ErSyntaxCategory>[] = []
  const ast: ErAst = { entities: [], relationships: [] }
  const subgraphs: number[] = []
  let seenHeader = false
  let i = 0

  while (i < text.length) {
    const end = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i)
    const raw = text.slice(i, end)
    const lead = raw.length - raw.trimStart().length
    const at = i + lead
    const line = raw.trim()
    let next = end + 1

    if (line === "") {
      i = next
      continue
    }
    if (!seenHeader) {
      if (!/^erDiagram\b/i.test(line)) throw new MermaidSyntaxError("Il testo non comincia con erDiagram", at)
      seenHeader = true
      i = next
      continue
    }

    const brace = line.indexOf("{")
    // Un `{` fuori dalle virgolette apre un blocco, salvo che sia il marcatore `o{`/`|{` di una relazione.
    const opensBlock = brace !== -1 && !LOOKS_LIKE_RELATIONSHIP.test(line) && !/^accDescr\s*\{/i.test(line)

    if (/^(style|classDef|class)\b/i.test(line)) findings.push({ category: "style", at })
    else if (/^direction\s+\w+/i.test(line)) findings.push({ category: "direction", at })
    else if (/^acc(Title|Descr)\s*:/i.test(line)) findings.push({ category: "accessibility", at })
    else if (/^accDescr\s*\{/i.test(line)) {
      const close = text.indexOf("}", i + lead)
      if (close === -1) throw new MermaidSyntaxError("Descrizione di accessibilità senza «}»", at)
      findings.push({ category: "accessibility", at })
      next = text.indexOf("\n", close) === -1 ? text.length : text.indexOf("\n", close) + 1
    } else if (/^title\b/i.test(line)) findings.push({ category: "title", at })
    else if (/^subgraph\b/i.test(line)) {
      subgraphs.push(at)
      findings.push({ category: "subgraph", at })
    } else if (/^end$/i.test(line)) {
      if (subgraphs.pop() === undefined) throw new MermaidSyntaxError("«end» senza un subgraph aperto", at)
    } else if (opensBlock) {
      const open = i + lead + brace
      const close = closingBrace(text, open)
      if (close === -1) throw new MermaidSyntaxError("Blocco «{» senza «}»", open)
      const header = ENTITY.exec(text.slice(i + lead, open).trim())
      if (!header) throw new MermaidSyntaxError("Nome di entità non valido prima di «{»", at)
      if (header[3]) findings.push({ category: "style", at })
      const after = text.indexOf("\n", close) === -1 ? text.length : text.indexOf("\n", close)
      if (text.slice(close + 1, after).trim() !== "") throw new MermaidSyntaxError("Testo dopo «}» sulla stessa riga", close + 1)
      ast.entities.push({
        id: unquote(header[1]!),
        alias: header[2] ? unquote(header[2]) : null,
        attributes: attributes(text.slice(open + 1, close), open + 1).map((a) => ({ ...a, comment: a.comment && decodeEntities(a.comment) })),
        at,
      })
      next = after + 1
    } else {
      const rel = RELATIONSHIP.exec(line)
      const entity = rel ? null : ENTITY.exec(line)
      if (rel) {
        if (rel[2] || rel[7]) findings.push({ category: "style", at })
        const label = rel[8] === undefined ? null : decodeEntities(unquote(rel[8]))
        ast.relationships.push({
          left: unquote(rel[1]!),
          leftCard: CARD_BY_FORM.get(rel[3]!.toLowerCase())!,
          identifying: LINE_BY_FORM.get(rel[4]!.toLowerCase())!,
          rightCard: CARD_BY_FORM.get(rel[5]!.toLowerCase())!,
          right: unquote(rel[6]!),
          label: label === "" ? null : label,
          at,
        })
      } else if (entity) {
        if (entity[3]) findings.push({ category: "style", at })
        ast.entities.push({ id: unquote(entity[1]!), alias: entity[2] ? unquote(entity[2]) : null, attributes: [], at })
      } else if (LOOKS_LIKE_RELATIONSHIP.test(line)) {
        throw new MermaidSyntaxError("Testo in più dopo la relazione: un'etichetta con spazi va fra virgolette, e va un'istruzione per riga", at)
      } else {
        throw new MermaidSyntaxError(`Riga non riconosciuta: «${line}»`, at)
      }
    }
    i = next
  }

  if (!seenHeader) throw new MermaidSyntaxError("Il testo non comincia con erDiagram", 0)
  if (subgraphs.length > 0) throw new MermaidSyntaxError("Subgraph senza «end»", subgraphs[subgraphs.length - 1]!)
  return { ast, warnings: aggregate(findings, text, MESSAGES) }
}
```

- [ ] **Step 5: Verifica che passi**

Run: `pnpm vitest run src/io/mermaid/er-parse.test.ts`
Expected: PASS, 14 test; quello su 5.000 entità sotto i 2 s

- [ ] **Step 6: Commit**

```bash
git add src/io/mermaid/er-fixtures.ts src/io/mermaid/er-parse.ts src/io/mermaid/er-parse.test.ts
git commit -m "feat(import-mermaid): il parser di erDiagram"
```

---

### Task 3: Map ER e round-trip

**Files:**
- Create: `src/io/mermaid/er-map.ts`
- Test: `src/io/mermaid/er-map.test.ts`, `src/io/mermaid/er-round-trip.test.ts`

**Interfaces:**
- Consumes: `ErAst`, `ErCardinalityToken`, `parseEr` (Task 2); `aggregate`, `Finding` (Task 1); `entityKey`, `Entity`, `Relationship`, `Cardinality`, `Attribute` da `src/model/er/schema.ts`; `emitMermaid` da `src/io/emit/er-mermaid.ts`.
- Produces: `interface ErFragment { entities: Record<string, Entity>; relationships: Relationship[]; warnings: ParseWarning[] }` e `mapEr(ast: ErAst, text: string): ErFragment`.

- [ ] **Step 1: Scrivi i test**

```ts
import { describe, expect, it } from "vitest"
import { ER_VALID } from "./er-fixtures"
import { mapEr } from "./er-map"
import { parseEr } from "./er-parse"

const read = (text: string) => mapEr(parseEr(text).ast, text)

describe("mapEr", () => {
  it("mette a sinistra il padre e a destra il figlio, con la cardinalità del proprio marcatore", () => {
    const { relationships } = read(ER_VALID.basic!)
    expect(relationships).toEqual([
      {
        name: "places",
        source: { entity: "ORDER", attributes: [], cardinality: "zero-or-many" },
        target: { entity: "CUSTOMER", attributes: [], cardinality: "one" },
        identifying: true,
      },
    ])
  })

  it("crea senza attributi le entità che compaiono solo in una relazione", () => {
    expect(read(ER_VALID.basic!).entities.ORDER).toEqual({ name: "ORDER", attributes: [] })
  })

  it("traduce le chiavi e deduce nullable dalla chiave primaria", () => {
    const { entities } = read(ER_VALID.keysAndComments!)
    const e = entities["pub.utenti"]!
    expect(e).toMatchObject({ schema: "pub", name: "utenti" })
    expect(e.attributes.map(({ name, primaryKey, foreignKey, unique, nullable }) => [name, primaryKey, foreignKey, unique, nullable])).toEqual([
      ["id", true, false, false, false],
      ["gruppo_id", false, true, false, true],
      ["email", false, false, true, true],
      ["a", true, true, false, false],
    ])
  })

  it("spezza il nome sul primo punto", () => {
    expect(Object.keys(read("erDiagram\n  a.b.c\n  .x\n").entities)).toEqual(["a.b.c", ".x"])
    expect(read("erDiagram\n  a.b.c\n").entities["a.b.c"]).toEqual({ schema: "a", name: "b.c", attributes: [] })
  })

  it("spezza sul primo punto anche i nomi non citati di una relazione", () => {
    const { relationships, entities } = read("erDiagram\n  pub.a ||--o{ b : x\n")
    expect(relationships[0]!.target.entity).toBe("pub.a")
    expect(entities["pub.a"]).toEqual({ schema: "pub", name: "a", attributes: [] })
  })

  it("unisce i blocchi ripetuti e tiene il primo attributo omonimo, con avviso", () => {
    const { entities, warnings } = read(ER_VALID.repeated!)
    expect(entities.A!.attributes.map((a) => [a.name, a.type])).toEqual([["id", "int"], ["nome", "string"]])
    expect(warnings.map((w) => w.message)).toEqual(["Attributi ripetuti nella stessa entità, si tiene il primo: A.id (riga 7)"])
  })

  it("segnala alias e commenti scartati, e lascia senza nome un'etichetta vuota", () => {
    const alias = read(ER_VALID.aliasAndStyle!)
    expect(alias.relationships[0]!.name).toBeUndefined()
    expect(alias.warnings.map((w) => w.message)).toEqual(["Alias delle entità scartati, il nome resta l'id: p (riga 7)"])
    expect(read(ER_VALID.keysAndComments!).warnings.map((w) => w.message)).toEqual([
      "Commenti degli attributi scartati: pub.utenti.id (riga 3)",
    ])
  })

  it("legge la cardinalità «u» come «one», con avviso", () => {
    const { relationships, warnings } = read("erDiagram\n  A u--o{ B : x\n")
    expect(relationships[0]!.target.cardinality).toBe("one")
    expect(warnings).toHaveLength(1)
  })
})
```

```ts
import { describe, expect, it } from "vitest"
import { emitMermaid } from "@/io/emit/er-mermaid"
import type { ErModel } from "@/model/er/schema"
import { mapEr } from "./er-map"
import { parseEr } from "./er-parse"

/**
 * Un modello con solo ciò che Mermaid porta (spec §8): nullabilità uguale a `!primaryKey`,
 * relazioni senza colonne. Il round-trip deve restituirlo identico.
 */
const MODEL: ErModel = {
  entities: {
    "pub.cliente": {
      schema: "pub",
      name: "cliente",
      attributes: [
        { name: "id", type: "bigint", primaryKey: true, foreignKey: false, nullable: false, unique: false },
        { name: "email", type: "varchar(255)", primaryKey: false, foreignKey: false, nullable: true, unique: true },
        { name: "nota", type: "double precision", primaryKey: false, foreignKey: false, nullable: true, unique: false },
      ],
    },
    ordine: {
      name: "ordine",
      attributes: [
        { name: "id", type: "int", primaryKey: true, foreignKey: false, nullable: false, unique: false },
        { name: "cliente_id", type: "bigint", primaryKey: false, foreignKey: true, nullable: true, unique: false },
      ],
    },
  },
  relationships: {
    r1: {
      name: "effettua",
      source: { entity: "ordine", attributes: [], cardinality: "zero-or-many" },
      target: { entity: "pub.cliente", attributes: [], cardinality: "one" },
      identifying: false,
    },
    r2: {
      source: { entity: "ordine", attributes: [], cardinality: "zero-or-one" },
      target: { entity: "ordine", attributes: [], cardinality: "many" },
      identifying: true,
    },
  },
}

describe("round-trip ER", () => {
  it("modello → emitMermaid → parseEr → mapEr restituisce il modello", () => {
    const { text, warnings } = emitMermaid(MODEL)
    expect(warnings).toEqual([])
    const fragment = mapEr(parseEr(text).ast, text)
    expect(fragment.warnings).toEqual([])
    expect(fragment.entities).toEqual(MODEL.entities)
    expect(fragment.relationships).toEqual(Object.values(MODEL.relationships))
  })
})
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm vitest run src/io/mermaid/er-map.test.ts src/io/mermaid/er-round-trip.test.ts`
Expected: FAIL, `Failed to resolve import "./er-map"`

- [ ] **Step 3: Scrivi l'implementazione**

```ts
import type { ParseWarning } from "@/io/ddl/schema"
import { entityKey, type Attribute, type Cardinality, type Entity, type Relationship } from "@/model/er/schema"
import { aggregate, type Finding } from "./common"
import type { ErAst, ErCardinalityToken } from "./er-parse"

export interface ErFragment {
  entities: Record<string, Entity>
  relationships: Relationship[]
  warnings: ParseWarning[]
}

type ErMapCategory = "alias" | "comment" | "duplicate" | "mdParent"

const MESSAGES: Record<ErMapCategory, string> = {
  alias: "Alias delle entità scartati, il nome resta l'id",
  comment: "Commenti degli attributi scartati",
  duplicate: "Attributi ripetuti nella stessa entità, si tiene il primo",
  mdParent: "Cardinalità «u» (genitore master-detail) letta come «esattamente uno»",
}

/** I gettoni della grammatica sui quattro valori del modello (spec §4.1). `MD_PARENT` non ha un equivalente. */
const CARDINALITY: Record<ErCardinalityToken, Cardinality> = {
  ZERO_OR_ONE: "zero-or-one",
  ZERO_OR_MORE: "zero-or-many",
  ONE_OR_MORE: "many",
  ONLY_ONE: "one",
  MD_PARENT: "one",
}

/** `pub.utenti` → schema `pub`, nome `utenti`: si spezza sul **primo** punto (spec §4.1). */
function splitName(id: string): Pick<Entity, "name" | "schema"> {
  const dot = id.indexOf(".")
  if (dot <= 0 || dot === id.length - 1) return { name: id }
  return { schema: id.slice(0, dot), name: id.slice(dot + 1) }
}

/**
 * Applica all'AST le regole della spec §4.1 e restituisce un frammento del modello ER. Non vede il
 * documento: sostituzione, chiavi delle relazioni e posizioni le decide il comando di import.
 * `text` serve solo a dire le righe negli avvisi.
 */
export function mapEr(ast: ErAst, text: string): ErFragment {
  const findings: Finding<ErMapCategory>[] = []
  const entities: Record<string, Entity> = {}

  const ensure = (id: string): string => {
    const parts = splitName(id)
    const key = entityKey(parts)
    entities[key] ??= { ...parts, attributes: [] }
    return key
  }

  for (const decl of ast.entities) {
    const key = ensure(decl.id)
    if (decl.alias !== null) findings.push({ category: "alias", at: decl.at, subject: decl.id })
    const entity = entities[key]!
    for (const a of decl.attributes) {
      if (a.comment !== null) findings.push({ category: "comment", at: a.at, subject: `${key}.${a.name}` })
      if (entity.attributes.some((b) => b.name === a.name)) {
        findings.push({ category: "duplicate", at: a.at, subject: `${key}.${a.name}` })
        continue
      }
      const primaryKey = a.keys.includes("PK")
      const attribute: Attribute = {
        name: a.name,
        type: a.type,
        primaryKey,
        foreignKey: a.keys.includes("FK"),
        // Mermaid non esprime la nullabilità: si legge come una colonna SQL senza NOT NULL (spec §4.1).
        nullable: !primaryKey,
        unique: a.keys.includes("UK"),
      }
      entity.attributes.push(attribute)
    }
  }

  const relationships = ast.relationships.map((r): Relationship => {
    if (r.leftCard === "MD_PARENT" || r.rightCard === "MD_PARENT") findings.push({ category: "mdParent", at: r.at })
    // Sinistra = padre (`target`), destra = figlio (`source`), sempre: è il verso dell'export (spec §4.1).
    const target = ensure(r.left)
    const source = ensure(r.right)
    return {
      ...(r.label === null ? {} : { name: r.label }),
      source: { entity: source, attributes: [], cardinality: CARDINALITY[r.rightCard] },
      target: { entity: target, attributes: [], cardinality: CARDINALITY[r.leftCard] },
      identifying: r.identifying,
    }
  })

  return { entities, relationships, warnings: aggregate(findings, text, MESSAGES) }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `pnpm vitest run src/io/mermaid/er-map.test.ts src/io/mermaid/er-round-trip.test.ts`
Expected: PASS, 9 test

- [ ] **Step 5: Commit**

```bash
git add src/io/mermaid/er-map.ts src/io/mermaid/er-map.test.ts src/io/mermaid/er-round-trip.test.ts
git commit -m "feat(import-mermaid): dall'AST ER al frammento del modello, con il round-trip"
```

---

### Task 4: Mermaid come oracolo

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Test: `src/io/mermaid/oracle.test.ts`

**Interfaces:**
- Consumes: `ER_VALID` (Task 2), `parseEr` (Task 2), `emitMermaid`.
- Produces: niente per gli altri task. È la suite che i piani delle classi e del flowchart estenderanno con le loro fixture.

- [ ] **Step 1: Installa la devDependency**

```bash
pnpm add -D mermaid@12.2.0
```

Controlla che in `package.json` compaia `"mermaid": "12.2.0"` sotto `devDependencies`, non sotto `dependencies`.

- [ ] **Step 2: Scrivi la suite**

```ts
// @vitest-environment jsdom
import mermaid from "mermaid"
import { describe, expect, it } from "vitest"
import { emitMermaid } from "@/io/emit/er-mermaid"
import type { ErModel } from "@/model/er/schema"
import { ER_VALID } from "./er-fixtures"
import { parseEr } from "./er-parse"

/**
 * Mermaid stesso come oracolo (spec §8): ciò che il nostro parser accetta come valido lo deve
 * accettare anche `mermaid.parse()`, e ciò che l'export produce lo deve leggere Mermaid. `mermaid`
 * è solo una devDependency: non entra nel bundle.
 */
const mermaidAccepts = async (text: string): Promise<boolean> => (await mermaid.parse(text, { suppressErrors: true })) !== false

describe("oracolo Mermaid: erDiagram", () => {
  it.each(Object.entries(ER_VALID))("la fixture %s piace a entrambi i parser", async (_, text) => {
    expect(() => parseEr(text)).not.toThrow()
    expect(await mermaidAccepts(text)).toBe(true)
  })

  it("l'export ER è Mermaid valido", async () => {
    const model: ErModel = {
      entities: {
        "pub.a": { schema: "pub", name: "a", attributes: [{ name: "id", type: "double precision", primaryKey: true, foreignKey: false, nullable: false, unique: false }] },
        b: { name: "b", attributes: [] },
      },
      relationships: {
        r: { name: "ha", source: { entity: "b", attributes: [], cardinality: "many" }, target: { entity: "pub.a", attributes: [], cardinality: "zero-or-one" }, identifying: true },
      },
    }
    expect(await mermaidAccepts(emitMermaid(model).text)).toBe(true)
  })
})
```

- [ ] **Step 3: Verifica che passi e che l'oracolo distingua**

Run: `pnpm vitest run src/io/mermaid/oracle.test.ts`
Expected: PASS, 7 test

Per controllare che l'oracolo rifiuti davvero il testo sbagliato, cambia per un momento in `ER_VALID.basic` il `o{` in `x`: il caso `basic` deve fallire. Poi rimetti `o{`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/io/mermaid/oracle.test.ts
git commit -m "test(import-mermaid): mermaid@12.2 come oracolo del parser e dell'export ER"
```

---

### Task 5: Analisi per il dialog

**Files:**
- Create: `src/io/mermaid/analyse.ts`
- Test: `src/io/mermaid/analyse.test.ts`

**Interfaces:**
- Consumes: `detect`, `MermaidSyntaxError` (Task 1); `parseEr` (Task 2); `mapEr`, `ErFragment` (Task 3).
- Produces: `type MermaidAnalysis = { ok: true; kind: "er"; fragment: ErFragment } | { ok: false; message: string; at: number | null }` e `analyseMermaid(text): MermaidAnalysis`. I piani successivi aggiungono i rami `"class"` e `"flow"` e tolgono il commento `ponytail:`.

- [ ] **Step 1: Scrivi il test**

```ts
import { describe, expect, it } from "vitest"
import { analyseMermaid } from "./analyse"

describe("analyseMermaid", () => {
  it("restituisce il frammento ER con gli avvisi del parser prima di quelli del map", () => {
    const result = analyseMermaid("erDiagram\n  direction LR\n  p[P]\n")
    expect(result.ok && result.fragment.warnings.map((w) => w.message.split(":")[0])).toEqual([
      "Direzione ignorata",
      "Alias delle entità scartati, il nome resta l'id",
    ])
  })

  it("rifiuta testo vuoto, tipi sconosciuti e le famiglie non ancora supportate", () => {
    expect(analyseMermaid("  ")).toEqual({ ok: false, message: "Il testo è vuoto.", at: null })
    expect(analyseMermaid("sequenceDiagram")).toMatchObject({ ok: false, at: null })
    expect(analyseMermaid("classDiagram\n  A")).toMatchObject({ ok: false, at: null })
  })

  it("trasforma un errore di sintassi in un esito con l'offset", () => {
    expect(analyseMermaid("erDiagram\n  A {\n")).toEqual({ ok: false, message: "Blocco «{» senza «}»", at: 14 })
  })
})
```

- [ ] **Step 2: Verifica che fallisca**

Run: `pnpm vitest run src/io/mermaid/analyse.test.ts`
Expected: FAIL, `Failed to resolve import "./analyse"`

- [ ] **Step 3: Scrivi l'implementazione**

```ts
import { detect, MermaidSyntaxError } from "./common"
import { mapEr, type ErFragment } from "./er-map"
import { parseEr } from "./er-parse"

export type MermaidAnalysis =
  | { ok: true; kind: "er"; fragment: ErFragment }
  /** `at` è l'offset nel testo analizzato, quando l'errore ne ha uno. */
  | { ok: false; message: string; at: number | null }

/**
 * Dal testo di un blocco al frammento da importare: rilevamento, parse e map, sincroni (spec §3.2).
 * Gli avvisi del parser precedono quelli del map. Un errore strutturale non lancia: torna come esito.
 */
export function analyseMermaid(text: string): MermaidAnalysis {
  const kind = detect(text)
  if (kind === null) return { ok: false, message: "Il testo è vuoto.", at: null }
  if (typeof kind === "object") return { ok: false, message: `«${kind.unknown}» non si importa: solo erDiagram, classDiagram e flowchart.`, at: null }
  // ponytail: classi e flowchart hanno i loro piani; finché non arrivano, qui si fermano con un messaggio.
  if (kind !== "er") return { ok: false, message: "Per ora si importa solo erDiagram: classDiagram e flowchart arriveranno.", at: null }
  try {
    const { ast, warnings } = parseEr(text)
    const fragment = mapEr(ast, text)
    return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { ok: false, message: e.message, at: e.at }
    throw e
  }
}
```

- [ ] **Step 4: Verifica che passi**

Run: `pnpm vitest run src/io/mermaid/analyse.test.ts`
Expected: PASS, 3 test

- [ ] **Step 5: Commit**

```bash
git add src/io/mermaid/analyse.ts src/io/mermaid/analyse.test.ts
git commit -m "feat(import-mermaid): l'analisi di un blocco, con gli errori come esito"
```

---

### Task 6: Comando, esito e disposizione

**Files:**
- Modify: `src/editor/commands/import.ts:9`
- Create: `src/editor/commands/import-mermaid.ts`
- Test: `src/editor/commands/import-mermaid.test.ts`

**Interfaces:**
- Consumes: `placeNew`, `GUTTER` da `./import`; `layoutGraph` da `./layout`; `nodesBounds` da `../layout-pack`; `nodeRects` da `../kinds/canvas-ops`; `uniqueKey` da `./er`; `erDiagram` da `../er-access`; `rectsBounds`, `snap`, `Point` da `../geometry`.
- Produces:
  - `type ImportFate = "nuovo" | "sostituisce" | "identico"`;
  - `sameEntity(a, b): boolean`, `sameRelationship(a, b): boolean`;
  - `erImportFates(doc, entities): Record<string, ImportFate>`;
  - `selectErFragment(entities, relationships, chosen: ReadonlySet<string>, present: ReadonlySet<string>): { entities; relationships }`;
  - `interface ErPlacement { positions: Record<string, Point>; fallback: string | null }`;
  - `placeErImport(doc, entities, relationships, layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<ErPlacement>`;
  - `importMermaidEr(entities, relationships, positions): Recipe`.

- [ ] **Step 1: Esporta `GUTTER`**

In `src/editor/commands/import.ts`:

```diff
 /** Spazio fra le celle della griglia e fra l'import e ciò che c'è già. */
-const GUTTER = 40
+export const GUTTER = 40
```

- [ ] **Step 2: Scrivi il test**

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import type { Entity, Relationship } from "@/model/er/schema"
import type { LayoutGraph } from "@/model/layout"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { importEr } from "./import"
import { erImportFates, importMermaidEr, placeErImport, selectErFragment } from "./import-mermaid"

const entity = (name: string, attributes: string[] = ["id"]): Entity => ({
  name,
  attributes: attributes.map((n) => ({ name: n, type: "int", primaryKey: n === "id", foreignKey: false, nullable: n !== "id", unique: false })),
})

/** Una relazione come la produce `mapEr`: senza colonne. */
const rel = (source: string, target: string, name?: string): Relationship => ({
  ...(name === undefined ? {} : { name }),
  source: { entity: source, attributes: [], cardinality: "zero-or-many" },
  target: { entity: target, attributes: [], cardinality: "one" },
  identifying: false,
})

const doc = () => documentStore.getState().doc
const diagram = () => erDiagram(doc())
/** Un motore finto: dispone i nodi in fila, a 300 px l'uno dall'altro, partendo da (500, 700). */
const fakeLayout = async (g: LayoutGraph) => Object.fromEntries(g.nodes.map((n, i) => [n.id, { x: 500 + i * 300, y: 700 }]))

beforeEach(() => {
  documentStore.getState().load(createDocument("prova", "doc-1"))
})

describe("importMermaidEr", () => {
  it("crea le entità nuove alle posizioni date e le relazioni", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a")], { a: { x: 40, y: 40 }, b: { x: 340, y: 40 } }))
    expect(Object.keys(diagram().model.entities)).toEqual(["a", "b"])
    expect(diagram().view.nodes.b).toEqual({ x: 340, y: 40, collapsed: false })
    expect(Object.values(diagram().model.relationships)).toEqual([rel("b", "a")])
  })

  it("sostituisce un'entità presente e le lascia la posizione", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a") }, [], { a: { x: 40, y: 40 } }))
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a", ["id", "nome"]) }, [], { a: { x: 999, y: 999 } }))
    expect(diagram().model.entities.a!.attributes.map((x) => x.name)).toEqual(["id", "nome"])
    expect(diagram().view.nodes.a).toMatchObject({ x: 40, y: 40 })
  })

  it("re-importare lo stesso testo non duplica le relazioni, una relazione diversa si aggiunge", () => {
    const pos = { a: { x: 40, y: 40 }, b: { x: 340, y: 40 } }
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a", "ha")], pos))
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a", "ha")], pos))
    expect(Object.keys(diagram().model.relationships)).toHaveLength(1)
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a", "possiede")], pos))
    expect(Object.keys(diagram().model.relationships)).toHaveLength(2)
  })

  it("non pota le relazioni derivate da una FK delle entità in arrivo", () => {
    const derived: Relationship = { ...rel("b", "a"), source: { entity: "b", attributes: ["a_id"], cardinality: "zero-or-many" } }
    documentStore.getState().dispatch(importEr({ a: entity("a"), b: entity("b") }, [derived], []))
    documentStore.getState().dispatch(importMermaidEr({ b: entity("b") }, [], {}))
    expect(Object.values(diagram().model.relationships)).toEqual([derived])
  })

  it("si annulla con un solo undo", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [rel("b", "a")], { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }))
    documentStore.getState().undo()
    expect(diagram().model.entities).toEqual({})
    expect(diagram().model.relationships).toEqual({})
  })
})

describe("erImportFates e selectErFragment", () => {
  it("distinguono nuovo, sostituisce e identico", () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a"), b: entity("b") }, [], { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }))
    expect(erImportFates(doc(), { a: entity("a"), b: entity("b", ["id", "x"]), c: entity("c") })).toEqual({ a: "identico", b: "sostituisce", c: "nuovo" })
  })

  it("tiene solo le relazioni con estremi scelti o già presenti", () => {
    const out = selectErFragment({ a: entity("a"), b: entity("b"), c: entity("c") }, [rel("b", "a"), rel("c", "a"), rel("b", "z")], new Set(["a", "b"]), new Set(["z"]))
    expect(Object.keys(out.entities)).toEqual(["a", "b"])
    expect(out.relationships).toEqual([rel("b", "a"), rel("b", "z")])
  })
})

describe("placeErImport", () => {
  it("dispone con il motore le sole entità nuove, in un blocco sotto il contenuto esistente", async () => {
    documentStore.getState().dispatch(importMermaidEr({ a: entity("a") }, [], { a: { x: 40, y: 40 } }))
    const seen: string[][] = []
    const { positions, fallback } = await placeErImport(doc(), { a: entity("a"), b: entity("b"), c: entity("c") }, [rel("c", "b"), rel("b", "a")], async (g) => {
      seen.push(g.nodes.map((n) => n.id))
      expect(g.edges.map((e) => [e.source, e.target])).toEqual([["b", "c"]])
      return fakeLayout(g)
    })
    expect(fallback).toBeNull()
    expect(seen).toEqual([["b", "c"]])
    expect(Object.keys(positions)).toEqual(["b", "c"])
    const below = diagram().view.nodes.a!.y
    expect(positions.b!.x).toBe(40)
    expect(positions.b!.y).toBeGreaterThan(below)
    expect(positions.c!.x - positions.b!.x).toBe(300)
  })

  it("con una sola entità nuova non chiama il motore", async () => {
    const { positions } = await placeErImport(doc(), { a: entity("a") }, [], async () => {
      throw new Error("non doveva essere chiamato")
    })
    expect(positions.a).toEqual({ x: 40, y: 40 })
  })

  it("se il motore fallisce ripiega sulla griglia, con un messaggio", async () => {
    const { positions, fallback } = await placeErImport(doc(), { a: entity("a"), b: entity("b") }, [], async () => {
      throw new Error("timeout")
    })
    expect(Object.keys(positions)).toEqual(["a", "b"])
    expect(fallback).toMatch(/griglia/)
  })
})
```

- [ ] **Step 3: Verifica che fallisca**

Run: `pnpm vitest run src/editor/commands/import-mermaid.test.ts`
Expected: FAIL, `Failed to resolve import "./import-mermaid"`

- [ ] **Step 4: Scrivi l'implementazione**

```ts
import type { DevDocument } from "@/model/document"
import type { Entity, ErDiagram, Relationship } from "@/model/er/schema"
import type { LayoutGraph, LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { rectsBounds, snap, type Point } from "../geometry"
import { nodeRects } from "../kinds/canvas-ops"
import { nodesBounds } from "../layout-pack"
import { uniqueKey } from "./er"
import { GUTTER, placeNew } from "./import"
import { layoutGraph } from "./layout"

/** Cosa succede a un'entità in arrivo, rispetto al documento (spec §7): lo mostra il dialog. */
export type ImportFate = "nuovo" | "sostituisce" | "identico"

/** Uguaglianza campo per campo: `JSON.stringify` dipenderebbe dall'ordine delle chiavi, che il DDL e Mermaid producono diverso. */
export function sameEntity(a: Entity, b: Entity): boolean {
  return (
    a.name === b.name &&
    a.schema === b.schema &&
    a.attributes.length === b.attributes.length &&
    a.attributes.every((x, i) => {
      const y = b.attributes[i]!
      return x.name === y.name && x.type === y.type && x.primaryKey === y.primaryKey && x.foreignKey === y.foreignKey &&
        x.nullable === y.nullable && x.unique === y.unique
    })
  )
}

/** Due relazioni dicono la stessa cosa (spec §5): estremi, colonne, cardinalità, nome e `identifying`. Gli agganci non contano. */
export function sameRelationship(a: Relationship, b: Relationship): boolean {
  const sameEnd = (x: Relationship["source"], y: Relationship["source"]) =>
    x.entity === y.entity && x.cardinality === y.cardinality && x.attributes.join() === y.attributes.join()
  return sameEnd(a.source, b.source) && sameEnd(a.target, b.target) && a.name === b.name && a.identifying === b.identifying
}

export function erImportFates(doc: DevDocument, entities: Readonly<Record<string, Entity>>): Record<string, ImportFate> {
  const present = erDiagram(doc).model.entities
  return Object.fromEntries(
    Object.entries(entities).map(([key, e]) => {
      const old = present[key]
      return [key, old === undefined ? "nuovo" : sameEntity(old, e) ? "identico" : "sostituisce"]
    }),
  )
}

/**
 * Le sole entità scelte e le relazioni i cui estremi sono tutti scelti o già nel documento
 * (spec §7): una relazione verso un'entità né importata né presente sarebbe pendente.
 */
export function selectErFragment(
  entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[], chosen: ReadonlySet<string>,
  present: ReadonlySet<string>,
): { entities: Record<string, Entity>; relationships: Relationship[] } {
  const picked = Object.fromEntries(Object.entries(entities).filter(([key]) => chosen.has(key)))
  const reachable = (key: string) => key in picked || present.has(key)
  return { entities: picked, relationships: relationships.filter((r) => reachable(r.source.entity) && reachable(r.target.entity)) }
}

export interface ErPlacement {
  positions: Record<string, Point>
  /** Il messaggio del ripiego sulla griglia, se c'è stato. */
  fallback: string | null
}

/**
 * Le posizioni delle entità **nuove** (spec §6): ELK sul solo frammento, con il grafo di «Disponi»,
 * poi il blocco sotto tutto ciò che è già sul canvas, con l'origine di `placeNew`. Se il motore
 * fallisce si ripiega sulla griglia di `placeNew`. Il motore è iniettato: `editor` non importa `io`.
 */
export async function placeErImport(
  doc: DevDocument, entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[],
  layout: (g: LayoutGraph) => Promise<LayoutPositions>,
): Promise<ErPlacement> {
  const diagram = erDiagram(doc)
  const fresh = Object.keys(entities).filter((key) => !(key in diagram.view.nodes))
  if (fresh.length === 0) return { positions: {}, fallback: null }
  const freshSet = new Set(fresh)

  const temporary: ErDiagram = {
    model: {
      entities: Object.fromEntries(fresh.map((key) => [key, entities[key]!])),
      relationships: Object.fromEntries(
        relationships.filter((r) => freshSet.has(r.source.entity) && freshSet.has(r.target.entity)).map((r, i) => [String(i), r]),
      ),
    },
    view: { nodes: Object.fromEntries(fresh.map((key) => [key, { x: 0, y: 0, collapsed: false }])) },
  }
  const graph = layoutGraph(temporary)
  const occupied = nodeRects(doc)

  let raw: LayoutPositions
  try {
    raw = graph.nodes.length > 1 ? await layout(graph) : { [fresh[0]!]: { x: 0, y: 0 } }
  } catch {
    return {
      positions: placeNew(temporary.model.entities, diagram, occupied),
      fallback: "La disposizione automatica non è riuscita: le entità nuove sono in griglia.",
    }
  }
  const block = nodesBounds(graph.nodes, raw)!
  const bounds = rectsBounds(occupied)
  const origin = bounds ? { x: bounds.x, y: bounds.y + bounds.h + GUTTER } : { x: GUTTER, y: GUTTER }
  const positions = Object.fromEntries(
    Object.entries(raw).map(([key, p]) => [key, { x: snap(origin.x + p.x - block.x), y: snap(origin.y + p.y - block.y) }]),
  )
  return { positions, fallback: null }
}

/**
 * Innesta un frammento ER letto da Mermaid (spec §5), in un solo comando. Un'entità presente viene
 * sostituita e tiene il suo nodo; una nuova prende la posizione da `positions`. Una relazione
 * uguale a una già presente si salta, e nessuna si pota: a differenza di `importEr`, qui le
 * relazioni non vengono da una FK e non ce n'è una derivata da rimpiazzare (ADR 0003).
 */
export function importMermaidEr(
  entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[], positions: Readonly<Record<string, Point>>,
): Recipe {
  return (draft) => {
    const d = erDiagram(draft)
    for (const [key, entity] of Object.entries(entities)) {
      d.model.entities[key] = entity
      const pos = positions[key]
      if (pos && !(key in d.view.nodes)) d.view.nodes[key] = { ...pos, collapsed: false }
    }
    for (const rel of relationships) {
      if (Object.values(d.model.relationships).some((old) => sameRelationship(old, rel))) continue
      d.model.relationships[uniqueKey(d.model.relationships, `${rel.source.entity}_${rel.target.entity}`)] = rel
    }
  }
}
```

- [ ] **Step 5: Verifica che passi, insieme ai test dell'import DDL**

Run: `pnpm vitest run src/editor/commands/import-mermaid.test.ts src/editor/commands/import.test.ts`
Expected: PASS; il file nuovo ha 10 test

- [ ] **Step 6: Commit**

```bash
git add src/editor/commands/import.ts src/editor/commands/import-mermaid.ts src/editor/commands/import-mermaid.test.ts
git commit -m "feat(import-mermaid): il comando ER, l'esito per entità e la disposizione con ELK"
```

---

### Task 7: Dialog, voce di menu ed e2e

**Files:**
- Create: `src/ui/import/ImportMermaidDialog.tsx`, `scripts/e2e/import-mermaid.mjs`
- Modify: `src/ui/DocumentMenu.tsx`, `scripts/e2e/run.mjs`

**Interfaces:**
- Consumes: `analyseMermaid`, `MermaidAnalysis` (Task 5); `blocks`, `detect`, `lineOf`, `MermaidBlock` (Task 1); `erImportFates`, `importMermaidEr`, `placeErImport`, `selectErFragment`, `ImportFate` (Task 6); `layoutEngine` da `src/io/app-io.ts`; `documentStore`, `documentSession`, `erDiagram`.
- Produces: `ImportMermaidDialog({ open, onOpenChange })`. Gli attributi `data-import-mermaid-dialog`, `data-import-summary`, `data-import-warnings`, `data-import-error` e `data-import-blocks` li usa l'e2e.

Scelte già prese, da non cambiare:
- L'analisi parte da sola su un'incollata o un file, come nel DDL, e a mano con «Analizza».
- Le entità «identiche» partono deselezionate.
- La riga di un errore si conta nel testo intero, non nel blocco del `.md`.
- Una risposta di ELK arrivata dopo la chiusura del dialog si scarta grazie a `generation`.

- [ ] **Step 1: Scrivi lo scenario e2e**

```js
/**
 * End-to-end dell'import Mermaid ER: incolla → analizza → importa → re-importa senza duplicare →
 * annulla. Copre quello che i test unitari non vedono: la voce di menu, l'incollata vera, la
 * disposizione col worker di ELK sulla build di produzione e il selettore dei blocchi di un `.md`.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/import-mermaid.mjs`.
 * `HEADLESS=0` per vedere il browser.
 */
import { expectMenu, expectNodes, expectText, isMainModule, startEnv } from "./helpers.mjs"

const ER = `erDiagram
  CLIENTE ||--o{ ORDINE : effettua
  ORDINE ||--|{ RIGA : contiene
  CLIENTE {
    bigint id PK
    string email UK
  }
  style CLIENTE fill:#f9f
`

const MARKDOWN = "# Note\n\n```mermaid\nclassDiagram\n  A\n```\n\n```mermaid\n" + ER + "```\n"

/** Apre «Importa Mermaid…» e aspetta il dialog, per la stessa ragione di `openImportDialog` in import.mjs. */
async function openDialog(page) {
  await expectMenu(page, "closed")
  await page.locator("[data-document-menu]").click()
  await expectMenu(page, "open")
  await page.getByRole("menuitem", { name: /Importa Mermaid/ }).click()
  await page.waitForSelector("[data-import-mermaid-dialog]")
}

async function paste(page, text) {
  await page.locator('[aria-label="Mermaid"]').click()
  await page.evaluate((value) => {
    const area = document.querySelector('[aria-label="Mermaid"]')
    const data = new DataTransfer()
    data.setData("text", value)
    area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

async function closeDialog(page) {
  await page.getByRole("button", { name: "Chiudi" }).click()
  await page.waitForSelector("[data-import-mermaid-dialog]", { state: "detached" })
}

const edgeCount = (page) => page.evaluate(() => document.querySelectorAll("[data-edge-id]").length)

/** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
export async function run(browser, base) {
  const pageErrors = []
  let failed = false

  async function step(name, body) {
    process.stdout.write(`• ${name}… `)
    await body()
    if (pageErrors.length > 0) throw new Error(`errori nella pagina: ${pageErrors.splice(0).join(" | ")}`)
    process.stdout.write("ok\n")
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on("pageerror", (e) => pageErrors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()))

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("analizza l'erDiagram incollato, con l'avviso sugli stili", async () => {
      await openDialog(page)
      await paste(page, ER)
      await expectText(page, "[data-import-summary]", "3 entità, 2 relazioni")
      await expectText(page, "[data-import-warnings]", "1 avvisi")
    })

    await step("importa tre entità e due relazioni, disposte da ELK", async () => {
      await page.getByRole("button", { name: /^Importa 3 entità$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await closeDialog(page)
      await expectNodes(page, 3)
      const edges = await edgeCount(page)
      if (edges !== 2) throw new Error(`attese 2 relazioni, trovate ${edges}`)
    })

    await step("il re-import dello stesso testo non duplica niente", async () => {
      await openDialog(page)
      await paste(page, ER)
      await expectText(page, "[data-import-mermaid-dialog]", "identica, saltata")
      // `RIGA` e `ORDINE` non hanno attributi nel testo e lo sono anche nel documento: tutte e tre identiche.
      await page.getByRole("checkbox").first().click()
      await page.getByRole("button", { name: /^Importa 1 entità$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await closeDialog(page)
      await expectNodes(page, 3)
      const edges = await edgeCount(page)
      if (edges !== 2) throw new Error(`attese 2 relazioni, trovate ${edges}`)
    })

    await step("annulla con ⌘Z il re-import e poi l'import", async () => {
      await page.keyboard.press("ControlOrMeta+z")
      await page.keyboard.press("ControlOrMeta+z")
      await expectNodes(page, 0)
    })

    await step("in un .md sceglie il blocco ER e spiega quello che non si importa", async () => {
      await openDialog(page)
      await paste(page, MARKDOWN)
      await expectText(page, "[data-import-error]", "Per ora si importa solo erDiagram")
      await page.locator("[data-import-blocks]").getByText("Blocco 2 · ER").click()
      await expectText(page, "[data-import-summary]", "3 entità")
      await closeDialog(page)
    })

    await step("un errore di sintassi indica la riga", async () => {
      await openDialog(page)
      await paste(page, "erDiagram\n  A {\n    int id\n")
      await expectText(page, "[data-import-error]", "Riga 2: Blocco «{» senza «}»")
      await closeDialog(page)
    })
  } catch (e) {
    failed = true
    console.error("\nFALLITO:", e)
  } finally {
    await context.close()
  }
  return !failed
}

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

- [ ] **Step 2: Registra lo scenario in `run.mjs`**

```diff
diff --git a/scripts/e2e/run.mjs b/scripts/e2e/run.mjs
index 4413ff4..f286ac1 100644
--- a/scripts/e2e/run.mjs
+++ b/scripts/e2e/run.mjs
@@ -25,6 +25,7 @@ import { run as runFlow } from "./flow.mjs"
 import { run as runForme } from "./forme.mjs"
 import { startEnv } from "./helpers.mjs"
 import { run as runImport } from "./import.mjs"
+import { run as runImportMermaid } from "./import-mermaid.mjs"
 import { run as runLayout } from "./layout.mjs"
 import { run as runMisto } from "./misto.mjs"
 import { run as runNote } from "./note.mjs"
@@ -38,6 +39,7 @@ try {
   ;({ preview, browser, base } = await startEnv())
   const persistenzaOk = await runPersistenza(browser, base)
   const importOk = await runImport(browser, base)
+  const importMermaidOk = await runImportMermaid(browser, base)
   const exportOk = await runExport(browser, base)
   const exportTestoOk = await runExportTesto(browser, base)
   const layoutOk = await runLayout(browser, base)
@@ -49,7 +51,7 @@ try {
   const noteOk = await runNote(browser, base)
   const formeOk = await runForme(browser, base)
   const agganciOk = await runAgganci(browser, base)
-  ok = persistenzaOk && importOk && exportOk && exportTestoOk && layoutOk && classOk && flowOk && mistoOk && collegamentiOk && poolOk && noteOk && formeOk && agganciOk
+  ok = persistenzaOk && importOk && importMermaidOk && exportOk && exportTestoOk && layoutOk && classOk && flowOk && mistoOk && collegamentiOk && poolOk && noteOk && formeOk && agganciOk
 } catch (e) {
   console.error("\nFALLITO:", e)
 } finally {
```

- [ ] **Step 3: Verifica che fallisca**

Run: `pnpm build && node scripts/e2e/import-mermaid.mjs`
Expected: FAIL al primo passo: il menu non ha una voce «Importa Mermaid»

- [ ] **Step 4: Scrivi il dialog**

```tsx
import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { erImportFates, importMermaidEr, placeErImport, selectErFragment, type ImportFate } from "@/editor/commands/import-mermaid"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { layoutEngine } from "@/io/app-io"
import { documentSession } from "@/io/document-session"
import { analyseMermaid, type MermaidAnalysis } from "@/io/mermaid/analyse"
import { blocks, detect, lineOf, type MermaidBlock } from "@/io/mermaid/common"

type Stage =
  | { kind: "vuoto" }
  | { kind: "analizzato"; block: MermaidBlock; result: MermaidAnalysis }
  | { kind: "importa" }
  | { kind: "fatto"; entities: number; relationships: number; warnings: string[] }

const FATE_LABEL: Record<ImportFate, string> = { nuovo: "nuova", sostituisce: "già presente, verrà sostituita", identico: "identica, saltata" }

/** Il nome della famiglia di un blocco, per il selettore dei blocchi di un `.md`. */
function blockLabel(block: MermaidBlock, index: number): string {
  const kind = detect(block.text)
  const name = kind === null ? "vuoto" : typeof kind === "object" ? kind.unknown : { er: "ER", class: "classi", flow: "flowchart" }[kind]
  return `Blocco ${index + 1} · ${name}`
}

/**
 * Import Mermaid (spec §7): gemello di `ImportDdlDialog`. L'analisi è sincrona (spec §3.2), quindi non
 * c'è uno stato «analisi»; lo è anche la disposizione degli elementi nuovi, che passa per il worker di
 * ELK, e per quella la generazione protegge come nel DDL da una risposta arrivata dopo la chiusura.
 */
export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState("")
  const [blockIndex, setBlockIndex] = useState(0)
  const [stage, setStage] = useState<Stage>({ kind: "vuoto" })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const generation = useRef(0)

  const doc = useStore(documentStore, (s) => s.doc)
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const found = blocks(text)

  const analyse = (source: string, index: number) => {
    const all = blocks(source)
    const block = all[Math.min(index, all.length - 1)]!
    const result = analyseMermaid(block.text)
    if (result.ok) {
      const fates = erImportFates(documentStore.getState().doc, result.fragment.entities)
      setChosen(new Set(Object.keys(fates).filter((key) => fates[key] !== "identico")))
    }
    setStage({ kind: "analizzato", block, result })
  }

  /** Il testo incollato o caricato si analizza da sé, a partire dal primo blocco; quello digitato col pulsante. */
  const receive = (source: string) => {
    setText(source)
    setBlockIndex(0)
    analyse(source, 0)
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text")
    if (!pasted) return
    e.preventDefault()
    receive(pasted)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) receive(await file.text())
  }

  const onImport = async () => {
    // Stessa guardia del DDL: la sola lettura può sopravvenire fra il render e il click.
    if (stage.kind !== "analizzato" || !stage.result.ok || documentSession.getState().readOnly) return
    const gen = ++generation.current
    const { fragment } = stage.result
    const before = documentStore.getState().doc
    const present = new Set(Object.keys(erDiagram(before).model.entities))
    const { entities, relationships } = selectErFragment(fragment.entities, fragment.relationships, chosen, present)
    setStage({ kind: "importa" })
    const { positions, fallback } = await placeErImport(before, entities, relationships, (g) => layoutEngine.layout(g))
    if (generation.current !== gen || documentSession.getState().readOnly) return
    const count = () => Object.keys(erDiagram(documentStore.getState().doc).model.relationships).length
    const relationshipsBefore = count()
    documentStore.getState().dispatch(importMermaidEr(entities, relationships, positions))
    setStage({
      kind: "fatto",
      entities: Object.keys(entities).length,
      relationships: count() - relationshipsBefore,
      warnings: [...fragment.warnings.map((w) => w.message), ...(fallback ? [fallback] : [])],
    })
  }

  const close = (next: boolean) => {
    if (!next) {
      generation.current++
      setText("")
      setBlockIndex(0)
      setStage({ kind: "vuoto" })
      setChosen(new Set())
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

  const ready = stage.kind === "analizzato" && stage.result.ok ? stage.result : null
  const fates = ready ? erImportFates(doc, ready.fragment.entities) : {}
  /** La riga nel testo intero, non nel blocco: è quella che l'utente vede nel textarea. */
  const lineInText = (block: MermaidBlock, at: number) => lineOf(text, block.offset + at)

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl" data-import-mermaid-dialog>
        <DialogHeader>
          <DialogTitle>Importa Mermaid</DialogTitle>
          <DialogDescription>
            Incolla o carica un erDiagram, anche dentro un file Markdown: le entità scelte entrano nel diagramma aperto, in
            un solo passo annullabile.
          </DialogDescription>
        </DialogHeader>

        {stage.kind === "fatto" ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto text-sm">
            <p>
              Importate <strong>{stage.entities}</strong> entità e <strong>{stage.relationships}</strong> relazioni.
            </p>
            {stage.warnings.length > 0 && (
              <details open data-import-warnings>
                <summary className="cursor-pointer text-muted-foreground">{stage.warnings.length} avvisi</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {stage.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto">
            <textarea
              aria-label="Mermaid"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              placeholder="erDiagram …"
              className="h-32 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex items-center gap-2">
              <input type="file" accept=".mmd,.mermaid,.md,.txt" aria-label="Carica un file Mermaid" onChange={(e) => void onFile(e)} className="text-xs" />
              <Button variant="secondary" size="sm" className="ml-auto" disabled={!text.trim() || stage.kind === "importa"} onClick={() => analyse(text, blockIndex)}>
                Analizza
              </Button>
            </div>

            {found.length > 1 && (
              <ToggleGroup
                type="single"
                value={String(blockIndex)}
                onValueChange={(v) => {
                  if (!v) return
                  setBlockIndex(Number(v))
                  analyse(text, Number(v))
                }}
                className="flex-wrap justify-start"
                data-import-blocks
              >
                {found.map((b, i) => <ToggleGroupItem key={i} value={String(i)} className="text-xs">{blockLabel(b, i)}</ToggleGroupItem>)}
              </ToggleGroup>
            )}

            {stage.kind === "importa" && <p className="text-sm text-muted-foreground">Disposizione in corso…</p>}
            {stage.kind === "analizzato" && !stage.result.ok && (
              <p className="text-sm text-destructive" data-import-error>
                {stage.result.at !== null && `Riga ${lineInText(stage.block, stage.result.at)}: `}{stage.result.message}
              </p>
            )}

            {stage.kind === "analizzato" && ready && (
              <>
                <p className="text-sm text-muted-foreground" data-import-summary>
                  {Object.keys(ready.fragment.entities).length} entità, {ready.fragment.relationships.length} relazioni
                </p>
                {ready.fragment.warnings.length > 0 && (
                  <details data-import-warnings>
                    <summary className="cursor-pointer text-xs text-muted-foreground">{ready.fragment.warnings.length} avvisi</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {ready.fragment.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                    </ul>
                  </details>
                )}
                <ul className="space-y-1">
                  {Object.keys(ready.fragment.entities).map((key) => (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      <Checkbox id={`m-${key}`} checked={chosen.has(key)} onCheckedChange={() => toggle(key)} />
                      <label htmlFor={`m-${key}`} className="cursor-pointer font-mono text-xs">{key}</label>
                      <span className={`ml-auto text-xs ${fates[key] === "nuovo" ? "text-primary" : "text-muted-foreground"}`}>{FATE_LABEL[fates[key] ?? "nuovo"]}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {ready && stage.kind === "analizzato" && (
            <>
              {readOnly && (
                <p className="mr-auto self-center text-xs text-muted-foreground" data-import-readonly>
                  Questo documento è aperto in un&apos;altra scheda: qui è in sola lettura.
                </p>
              )}
              <Button onClick={() => void onImport()} disabled={chosen.size === 0 || readOnly}>
                Importa {chosen.size} entità
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => close(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Aggiungi la voce di menu**

```diff
diff --git a/src/ui/DocumentMenu.tsx b/src/ui/DocumentMenu.tsx
index 4fe906b..1f285a9 100644
--- a/src/ui/DocumentMenu.tsx
+++ b/src/ui/DocumentMenu.tsx
@@ -16,6 +16,7 @@ import { requestOpen, UPLOAD_INPUT_ID } from "./document-actions"
 import { copyPng, exportPng, exportSvg } from "./export/lazy"
 import { TextExportDialog } from "./export/TextExportDialog"
 import { ImportDdlDialog } from "./import/ImportDdlDialog"
+import { ImportMermaidDialog } from "./import/ImportMermaidDialog"
 
 const when = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" })
 
@@ -37,6 +38,7 @@ export function DocumentMenu() {
   /** Chiudendosi il menu ridà il fuoco al trigger: se si sta rinominando lo ruberebbe al campo appena montato. */
   const renamingRef = useRef(false)
   const [importOpen, setImportOpen] = useState(false)
+  const [mermaidOpen, setMermaidOpen] = useState(false)
   const [textExportOpen, setTextExportOpen] = useState(false)
 
   const refreshRecent = () => void documentDb.listRecent().then(setRecent, () => setRecent([]))
@@ -92,6 +94,7 @@ export function DocumentMenu() {
             <DropdownMenuItem onSelect={() => void documentIo.newDocument()}><FilePlus2 /> Nuovo documento</DropdownMenuItem>
             <DropdownMenuItem onSelect={requestOpen}><FolderOpen /> Apri… <DropdownMenuShortcut>⌘O</DropdownMenuShortcut></DropdownMenuItem>
             <DropdownMenuItem disabled={readOnly} onSelect={() => setImportOpen(true)}><FileCode2 /> Importa DDL…</DropdownMenuItem>
+            <DropdownMenuItem disabled={readOnly} onSelect={() => setMermaidOpen(true)}><FileCode2 /> Importa Mermaid…</DropdownMenuItem>
             <DropdownMenuItem disabled={readOnly} onSelect={() => void documentIo.save()}><Save /> Salva <DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuItem>
             <DropdownMenuItem disabled={readOnly} onSelect={() => void documentIo.saveAs()}><SaveAll /> Salva con nome… <DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut></DropdownMenuItem>
             <DropdownMenuItem disabled={readOnly} onSelect={startRename}><PencilLine /> Rinomina…</DropdownMenuItem>
@@ -143,6 +146,7 @@ export function DocumentMenu() {
       <input id={UPLOAD_INPUT_ID} type="file" accept=".dd.json,application/json" hidden aria-label="Carica documento" onChange={(e) => void onUpload(e)} />
       {/* Fratello del DropdownMenu, non figlio: aperto dalla voce di menu, litigherebbe sul fuoco col menu che si chiude. */}
       <ImportDdlDialog open={importOpen} onOpenChange={setImportOpen} />
+      <ImportMermaidDialog open={mermaidOpen} onOpenChange={setMermaidOpen} />
       <TextExportDialog open={textExportOpen} onOpenChange={setTextExportOpen} />
     </>
   )
```

- [ ] **Step 6: Verifica che passi**

Run: `pnpm build && node scripts/e2e/import-mermaid.mjs`
Expected: sei righe `• … ok`, exit code 0

- [ ] **Step 7: Commit**

```bash
git add src/ui/import/ImportMermaidDialog.tsx src/ui/DocumentMenu.tsx scripts/e2e/import-mermaid.mjs scripts/e2e/run.mjs
git commit -m "feat(import-mermaid): il dialog «Importa Mermaid…» per erDiagram"
```

---

### Task 8: README e verifica finale

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Aggiorna il README**

```diff
diff --git a/README.md b/README.md
index a861a79..d6bc213 100644
--- a/README.md
+++ b/README.md
@@ -61,6 +61,14 @@ Da un dump **PostgreSQL** o **MySQL/MariaDB**, incollato o caricato, si scelgono
 importare. Entrano nel documento aperto in un solo passo annullabile, con le cardinalità dedotte
 dalle foreign key. Una tabella già presente viene sostituita e resta nella sua posizione.
 
+### Importa un diagramma Mermaid
+
+Da un `erDiagram`, incollato o caricato (anche dentro un file Markdown, scegliendo il blocco), si
+scelgono le entità da importare. Le entità nuove si dispongono da sole sotto il contenuto esistente;
+una già presente viene sostituita e resta nella sua posizione, e re-importare lo stesso testo non
+duplica le relazioni. Stili, alias, commenti e direzione si scartano con un avviso. `classDiagram` e
+`flowchart` non si importano ancora.
+
 ### Esporta
 
 - **Immagini**: SVG e PNG del documento intero, più «Copia PNG» negli appunti. Sempre col tema
@@ -108,6 +116,8 @@ Un documento si modifica da una scheda sola: le altre lo mostrano in sola lettur
 - **Prestazioni misurate fino a 600 entità ER** (p95 del tempo di frame ≤ 20 ms in produzione:
   [la misura](docs/perf/2026-09-13-gate-verde.md)). Classi, flowchart, note e forme non sono
   misurati.
+- **Import Mermaid**: un'istruzione per riga fuori dai blocchi, e un'etichetta di relazione con spazi
+  va fra virgolette. Le relazioni importate non hanno colonne, come quelle disegnate a mano.
 - **Import DDL**: i vincoli `UNIQUE` su più colonne vengono ignorati, con un avviso. In MySQL un
   `REFERENCES` senza lista di colonne fa scartare l'intero `CREATE TABLE`.
 - **Classi**: i generici annidati escono in Mermaid in forma approssimata, con un avviso. Non ci sono
@@ -167,6 +177,8 @@ ognuno in un contesto di browser separato:
 - **Persistenza**: autosave, salvataggio e riapertura del file, file non valido, seconda scheda in
   sola lettura che prende il controllo (sul percorso `?fallback=1`).
 - **Import DDL**: import di entità e relazione, undo, reimport senza duplicati.
+- **Import Mermaid**: erDiagram incollato e disposto, reimport senza duplicati, undo, blocco scelto
+  in un Markdown, errore con la riga.
 - **Export immagini**: SVG, PNG e copia negli appunti col tema scuro attivo.
 - **Export testo**: i tre formati, copia e download.
 - **Auto layout**: «Disponi» sposta i nodi senza sovrapporli, e si annulla.
```

- [ ] **Step 2: Verifica tutto**

```bash
pnpm lint
pnpm test
pnpm e2e
```

Expected: lint senza errori, tutti i test verdi, tutti gli scenari e2e `ok`.

Due note:
- Se `pnpm lint` segnala centinaia di errori con «multiple candidate TSConfigRootDirs», nel checkout è rimasto un worktree in `.claude/worktrees/`: va rimosso, il codice non c'entra.
- `src/io/ddl/sql-text.test.ts` ha un test di tempi già instabile in CI, fuori da questo piano: se cade solo lui, rilancia il job.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): l'import di erDiagram"
```

---

## Fuori da questo piano

- `classDiagram` (spec §4.2) e `flowchart` (spec §4.3): un piano ciascuno. Riusano `common.ts` e l'oracolo, e aggiungono un ramo ad `analyseMermaid`, un comando accanto a `importMermaidEr` e il ramo del dialog (il flowchart senza caselle, spec §7).
- I punti del §11 della spec che riguardano solo quelle famiglie: i nomi `@{ shape: … }`, la pipeline di «Disponi» su un `FlowDiagram` temporaneo, i generici a tilde annidati.
