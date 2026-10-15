# Import Mermaid classi: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** importare un `classDiagram` Mermaid nel documento aperto, con le note, accanto all'import di `erDiagram` già in `master`.

**Architecture:** un parser scritto a mano produce un AST fedele al testo, che `mapClass` traduce in un frammento di `ClassModel` più le note, con le regole della spec §4.2. Un comando `importMermaidClass`, accanto a `importMermaidEr`, lo innesta con un solo dispatch. Classi nuove e note si dispongono con ELK sul solo frammento, col grafo di «Disponi» delle classi (`classLayoutGraph`) e il motore iniettato. Il dialog `ImportMermaidDialog` si estende alle classi, con le caselle.

**Tech Stack:** TypeScript, React 19, zustand + immer (`documentStore`), vitest (jsdom solo per l'oracolo), Playwright per gli e2e, `mermaid@12.2.0` già fra le devDependency.

**Spec:** `docs/superpowers/specs/2026-10-15-import-mermaid-design.md`, §4.2 per la mappatura, §5 per la sostituzione, §6 per la disposizione, §7 per il dialog. È il secondo dei tre piani del §11: riusa `src/io/mermaid/common.ts`, `analyse.ts`, la suite `oracle.test.ts` e lo schema dei comandi del piano ER (`2026-10-15-import-mermaid-er.md`). Le decisioni stanno nella mappa (issue #1–#10); la mappatura delle classi è la #5.

**Verifica preliminare.** Il codice di questo piano è stato scritto e fatto girare prima della stesura, su un worktree di `master` (`4862a44`): 1231 test unitari in tutto (66 nei file toccati da questo piano), l'oracolo `mermaid.parse()` su tutte le fixture e sull'export delle classi, `pnpm lint`, `tsc -b` e l'e2e completo sulla build di produzione (96 passi `ok`, dieci nello scenario dell'import Mermaid). La grammatica è quella di `mermaid@12.2.0` (`packages/mermaid/src/diagrams/class/parser/classDiagram.jison`), con `classDb.ts` e `classTypes.ts` per ciò che il parser lascia al db (membri, annotazioni, generici delle classi).

**§11, generici a tilde annidati.** Mermaid non li decodifica: `parseGenericTypes` di `mermaid@12.2.0` rende `Map~string, List~int~~` come `Map<string, List<int~>`. La regola di questo piano: una `~` **apre** se segue un carattere di nome e precede l'inizio di un tipo (lettera, cifra, `_`, `(`, `[`); ogni altra **chiude**. È l'inversa di `genericsToTildes` dell'export, quindi il round-trip di `Map<string, List<int>>` torna identico. Se le tilde non si chiudono, il tipo resta com'è, con un avviso. La funzione è `decodeGenerics` (Task 1).

## Global Constraints

- `mermaid` resta **solo** fra le `devDependencies`, a `12.2.0`, e lo importa solo `src/io/mermaid/oracle.test.ts`.
- Parser sul main thread, sincrono, senza dipendenze a runtime (spec §3.1, §3.2).
- Gli avvisi sono `ParseWarning` (`src/io/ddl/schema.ts`), aggregati per categoria con `aggregate` di `common.ts`, con le righe nel messaggio (spec §3.3). Il parser segnala ciò che scarta della sintassi, il map le perdite semantiche.
- Un errore strutturale lancia `MermaidSyntaxError` con l'offset: nessun recupero parziale (spec §3.3).
- I commenti `%%` e il front-matter si ignorano senza avviso (`stripNoise`, spec §3.3).
- Il lato con la **testa** è il `target`, comunque sia scritta la riga (spec §4.2). I ruoli importati sono sempre `""`.
- La chiave di una classe è il suo nome; quella di una nota è un uuid, come in `addNote`.
- `src/editor` non importa `src/io` (ESLint): il motore di layout arriva come parametro, e il comando non conosce `ClassFragment`.
- Tutto l'import è **un solo dispatch**, annullabile con un solo ⌘Z (spec §5).
- Testi dell'interfaccia e messaggi in italiano.

## Review Focus

Cinque ingressi che la spec non nomina e che un utente incontrerà presto. Ciascuno ha già il suo test nel task indicato.

1. **Un nome di classe che comincia per `o` accanto a una relazione** (`order -- B`, `A <|-- order`): la grammatica ha `o` come testa dell'aggregazione, ma qui è l'inizio del nome. Task 1.
2. **Un tipo con virgole e `::` nei parametri** (`+on(Func~(int) => void~ f, int n)`, `+calcola(Map~string, List~int~~ pesi)`, `std::string nome`): le virgole dentro i generici non separano i parametri, e il `::` non separa nome e tipo. Task 1.
3. **A capo di Windows** (`\r\n`) in un testo incollato: si legge come con `\n`, anche dentro un blocco. Task 1.
4. **Re-import dello stesso testo con le note**: ogni import dà alle note chiavi nuove, ma una nota con lo stesso testo e la stessa àncora non si duplica. Task 5.
5. **Una nota ancorata a una classe deselezionata nel dialog e assente dal documento**: non entra, invece di restare pendente. Task 5.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/io/mermaid/class-parse.ts` | `classDiagram` → `ClassAst` + avvisi sintattici; `decodeGenerics` |
| `src/io/mermaid/class-fixtures.ts` | testi `classDiagram` validi, condivisi fra test del parser, del map e oracolo |
| `src/io/mermaid/class-map.ts` | `ClassAst` → `ClassFragment` (classi, relazioni, note; regole della spec §4.2) + avvisi semantici |
| `src/io/mermaid/analyse.ts` | il ramo `class`, al posto del messaggio «per ora solo erDiagram» |
| `src/editor/commands/import.ts` | `placeInGrid`, la griglia di `placeNew` per nodi di qualunque famiglia |
| `src/editor/commands/import-mermaid.ts` | `layoutBelow` condiviso; esito, selezione, disposizione e comando `importMermaidClass` |
| `src/ui/import/ImportMermaidDialog.tsx` | il dialog per le due famiglie |
| `scripts/e2e/import-mermaid.mjs` | lo scenario end-to-end, con i passi delle classi |

File modificati anche: `src/io/mermaid/oracle.test.ts`, `src/io/mermaid/analyse.test.ts`, `src/editor/commands/import-mermaid.test.ts`, `README.md`. La voce di menu «Importa Mermaid…» e `scripts/e2e/run.mjs` non cambiano.

**Decisioni prese qui, dove la spec tace** (le vede il revisore, e vanno nella descrizione della PR):

- Una riga con il solo nome (`A`) non crea la classe: è una `memberStatement` senza effetto anche in Mermaid.
- `<<annotazione>> A` crea la classe anche se non è dichiarata prima; Mermaid in quel caso va in errore (`Cannot read properties of undefined`), ma è un suo difetto, non una regola.
- Più stereotipi sulla stessa classe: vale il primo, con un avviso.
- `..*` e `..o` sono composizione e aggregazione come `--*` e `--o` (la tabella della spec li elenca già); `<--` è un'associazione navigabile come `-->`.
- Un metodo con i classificatori in coda `$*` (li emette l'export per un metodo statico e astratto) è statico e astratto. Mermaid tiene solo l'ultimo carattere.
- Lo scenario e2e delle classi sta nello stesso `scripts/e2e/import-mermaid.mjs` dell'ER, non in uno script suo come chiede la spec §8: riusa `openDialog`, `paste` e `closeDialog`, e la voce di menu è la stessa.
- Una relazione dentro un `namespace` si legge; Mermaid la rifiuta. Il parser è più largo della grammatica, mai più stretto sulle fixture valide: lo controlla l'oracolo.

---

### Task 1: Parser `classDiagram`

**Files:**
- Create: `src/io/mermaid/class-parse.ts`
- Create: `src/io/mermaid/class-fixtures.ts`
- Test: `src/io/mermaid/class-parse.test.ts`

**Interfaces:**
- Consumes: da `common.ts` `aggregate`, `decodeEntities`, `MermaidSyntaxError`, `stripNoise`, `Finding`; `ParseWarning` da `src/io/ddl/schema.ts`.
- Produces:
  - `type ClassHead = "extension" | "composition" | "aggregation" | "dependency" | "lollipop"`;
  - `type ClassAstVisibility = "+" | "-" | "#" | "~" | ""`;
  - `interface ClassAstParameter { name: string; type: string }`;
  - `type ClassAstMember` = `{ kind: "attribute"; visibility; name; type; isStatic; isAbstract; at }` | `{ kind: "method"; visibility; name; parameters: ClassAstParameter[]; returnType; isStatic; isAbstract; at }`;
  - `interface ClassAstClass { id: string; generic: string | null; label: string | null; annotations: string[]; members: ClassAstMember[]; at: number }`;
  - `interface ClassAstRelation { left; leftMultiplicity: string | null; leftHead: ClassHead | null; dotted: boolean; rightHead: ClassHead | null; rightMultiplicity: string | null; right; label: string | null; at }`;
  - `interface ClassAstNote { text: string; target: string | null; at: number }`;
  - `interface ClassAst { classes: ClassAstClass[]; relations: ClassAstRelation[]; notes: ClassAstNote[] }`;
  - `parseClass(input: string): { ast: ClassAst; warnings: ParseWarning[] }`;
  - `decodeGenerics(text: string): string | null`;
  - `CLASS_VALID: Readonly<Record<string, string>>` (chiavi: `basic`, `relations`, `multiplicities`, `members`, `annotations`, `notes`, `namespaceAndStyle`).

Note sulla grammatica, per chi legge il codice:
- le teste del lexer sono `<|` `|>` (extension), `*` (composition), `o` (aggregation), `<` `>` (dependency), `()` (lollipop), da una parte o dall'altra di `--` o `..`;
- un membro è un metodo se ha le parentesi (`ClassMember`); la visibilità è il primo carattere; `$` e `*` sono i classificatori, subito dopo la `)` o in coda;
- `class A["…"]` è un'etichetta, `class A~T~` un parametro generico, `:::` uno stile;
- `namespace` si annida e contiene classi e note; il blocco di una classe non contiene `{`.

- [ ] **Step 1: Scrivi le fixture**

`src/io/mermaid/class-fixtures.ts`:

```ts
/**
 * Testi `classDiagram` che Mermaid accetta: li leggono i test del parser e la suite oracolo, che
 * controlla che `mermaid.parse()` li accetti davvero (spec §8). Chi aggiunge un caso valido lo
 * aggiunge qui, così l'oracolo lo vede.
 */
export const CLASS_VALID: Readonly<Record<string, string>> = {
  basic: `classDiagram
  Animal <|-- Duck
  Animal : +int age
  Animal : +isMammal() bool
  class Duck {
    +String beakColor
    +swim()
  }
`,
  relations: `classDiagram
  A <|-- B
  C ..|> D
  E *-- F
  G --o H
  I --> J
  K ..> L
  M -- N
  O .. P
  Q <|--|> R
  S ()-- T
  U <-- V
`,
  multiplicities: `classDiagram
  Cliente "1" --> "0..*" Ordine : effettua
  Ordine"1"*--"1..*"Riga
`,
  members: `classDiagram
  class Ordine {
    <<Abstract>>
    -int id
    +totale: double
    #List~Riga~ righe$
    ~stato
    +Ordine(int id)
    +aggiungi(Riga r, quantita: int) bool
    +conta()$ int
    +calcola(Map~string, List~int~~ pesi) double*
  }
`,
  annotations: `classDiagram
  class Forma {
    <<interface>>
  }
  class Colore {
    <<enumeration>>
    ROSSO
    VERDE
  }
  class Servizio <<Service>>
  <<abstract>> Servizio
`,
  notes: `classDiagram
  class A
  note "libera"
  note for A "uno<br>due #lt;tre#gt; #amp; #quot;quattro#quot;"
  note for Fantasma "pendente"
`,
  namespaceAndStyle: `---
title: Prova
---
classDiagram
  %% un commento
  direction LR
  namespace Dominio {
    class Cliente
    class \`Ordine Web\`
  }
  class Square~Shape~["Quadrato"]:::evidenza
  Cliente --> \`Ordine Web\`
  style Cliente fill:#f9f
  classDef evidenza fill:#ff0
  cssClass "Cliente" evidenza
  click Cliente href "https://example.com"
  accTitle: titolo
  accDescr: descrizione
`,
}
```

- [ ] **Step 2: Scrivi il test**

`src/io/mermaid/class-parse.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { MermaidSyntaxError } from "./common"
import { CLASS_VALID } from "./class-fixtures"
import { decodeGenerics, parseClass, type ClassAstRelation } from "./class-parse"

const relation = (line: string): ClassAstRelation => parseClass(`classDiagram\n  ${line}\n`).ast.relations[0]!
const members = (body: string) => parseClass(`classDiagram\n  class A {\n${body}\n  }\n`).ast.classes[0]!.members
const syntaxError = (text: string): { message: string; at: number } => {
  try {
    parseClass(text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { message: e.message, at: e.at }
    throw e
  }
  throw new Error("nessun errore")
}

describe("decodeGenerics", () => {
  it("riporta fra <> i generici piatti e annidati", () => {
    expect(decodeGenerics("List~int~")).toBe("List<int>")
    expect(decodeGenerics("Map~string, int~")).toBe("Map<string, int>")
    expect(decodeGenerics("Map~string, List~int~~")).toBe("Map<string, List<int>>")
    expect(decodeGenerics("List~Map~string, List~int~~~ x")).toBe("List<Map<string, List<int>>> x")
    expect(decodeGenerics("Func~(int) => void~")).toBe("Func<(int) => void>")
  })

  it("lascia stare il testo senza tilde e rifiuta le tilde che non si chiudono", () => {
    expect(decodeGenerics("double precision")).toBe("double precision")
    expect(decodeGenerics("List~int")).toBeNull()
    expect(decodeGenerics("int~")).toBeNull()
  })
})

describe("parseClass: relazioni", () => {
  it("legge teste, linea e lati come sono scritti", () => {
    expect(relation("A <|-- B")).toMatchObject({ left: "A", leftHead: "extension", dotted: false, rightHead: null, right: "B" })
    expect(relation("C ..|> D")).toMatchObject({ leftHead: null, dotted: true, rightHead: "extension" })
    expect(relation("E *-- F")).toMatchObject({ leftHead: "composition" })
    expect(relation("G --o H")).toMatchObject({ rightHead: "aggregation", right: "H" })
    expect(relation("I --> J")).toMatchObject({ rightHead: "dependency" })
    expect(relation("U <-- V")).toMatchObject({ leftHead: "dependency" })
    expect(relation("M -- N")).toMatchObject({ leftHead: null, rightHead: null, dotted: false })
    expect(relation("Q <|--|> R")).toMatchObject({ leftHead: "extension", rightHead: "extension" })
    expect(relation("S ()-- T")).toMatchObject({ leftHead: "lollipop" })
  })

  it("legge molteplicità ed etichetta, anche senza spazi", () => {
    expect(relation('Cliente "1" --> "0..*" Ordine : effettua')).toMatchObject({
      left: "Cliente", leftMultiplicity: "1", rightMultiplicity: "0..*", right: "Ordine", label: "effettua",
    })
    expect(relation('Ordine"1"*--"1..*"Riga')).toMatchObject({ leftMultiplicity: "1", leftHead: "composition", right: "Riga", label: null })
    expect(relation("A --> B : due parole")).toMatchObject({ label: "due parole" })
  })

  it("non scambia per una testa la o iniziale di un nome, né per una linea il trattino di un nome", () => {
    expect(relation("order -- B")).toMatchObject({ left: "order", leftHead: null })
    expect(relation("A <|-- order")).toMatchObject({ rightHead: null, right: "order" })
    expect(relation("A-->B")).toMatchObject({ left: "A", rightHead: "dependency", right: "B" })
    expect(relation("a.b --> c-d")).toMatchObject({ left: "a.b", right: "c-d" })
    expect(relation("Città --> Paese")).toMatchObject({ left: "Città", right: "Paese" })
  })

  it("toglie i backtick e registra il generico di un estremo come dichiarazione", () => {
    const { ast } = parseClass("classDiagram\n  `Ordine Web` <|-- Square~Shape~\n")
    expect(ast.relations[0]).toMatchObject({ left: "Ordine Web", right: "Square" })
    expect(ast.classes).toMatchObject([{ id: "Square", generic: "Shape" }])
  })
})

describe("parseClass: membri", () => {
  it("spezza attributi e metodi, con visibilità e classificatori", () => {
    expect(members(`    -int id\n    +totale: double\n    #List~Riga~ righe$\n    ~stato\n    +y*`)).toMatchObject([
      { kind: "attribute", visibility: "-", name: "id", type: "int", isStatic: false },
      { kind: "attribute", visibility: "+", name: "totale", type: "double" },
      { kind: "attribute", visibility: "#", name: "righe", type: "List<Riga>", isStatic: true },
      { kind: "attribute", visibility: "~", name: "stato", type: "" },
      { kind: "attribute", name: "y", isAbstract: true },
    ])
    expect(members(`    +aggiungi(Riga r, quantita: int, x) bool\n    +conta()$ int\n    +calcola(Map~string, List~int~~ pesi) double$*\n    Ordine()`)).toMatchObject([
      { kind: "method", name: "aggiungi", returnType: "bool", parameters: [{ name: "r", type: "Riga" }, { name: "quantita", type: "int" }, { name: "x", type: "" }] },
      { kind: "method", name: "conta", returnType: "int", isStatic: true, isAbstract: false },
      { kind: "method", name: "calcola", parameters: [{ name: "pesi", type: "Map<string, List<int>>" }], returnType: "double", isStatic: true, isAbstract: true },
      { kind: "method", visibility: "", name: "Ordine", parameters: [], returnType: "" },
    ])
  })

  it("non spezza un tipo sul :: né sulla freccia di un tipo funzione", () => {
    expect(members(`    std::string nome\n    +on(Func~(int) => void~ f, int n)`)).toMatchObject([
      { name: "nome", type: "std::string" },
      { parameters: [{ name: "f", type: "Func<(int) => void>" }, { name: "n", type: "int" }] },
    ])
  })

  it("legge i membri in riga, le annotazioni ovunque e il blocco su una riga sola", () => {
    const { ast } = parseClass(CLASS_VALID.basic!)
    expect(ast.classes.map((c) => [c.id, c.members.map((m) => m.name)])).toEqual([
      ["Animal", ["age"]], ["Animal", ["isMammal"]], ["Duck", ["beakColor", "swim"]],
    ])
    const annotated = parseClass(CLASS_VALID.annotations!).ast.classes
    expect(annotated.map((c) => [c.id, c.annotations])).toEqual([
      ["Forma", ["interface"]], ["Colore", ["enumeration"]], ["Servizio", ["Service"]], ["Servizio", ["abstract"]],
    ])
    expect(parseClass("classDiagram\n  class A { +x }\n  class B {}\n").ast.classes.map((c) => c.members.length)).toEqual([1, 0])
  })

  it("segnala un generico a tilde sbilanciato e tiene il tipo com'è", () => {
    const { ast, warnings } = parseClass("classDiagram\n  class A {\n    +List~int x\n  }\n")
    expect(ast.classes[0]!.members[0]).toMatchObject({ name: "x", type: "List~int" })
    expect(warnings.map((w) => w.message)).toEqual(["Generici a tilde sbilanciati, il tipo resta com'è: List~int x (riga 3)"])
  })
})

describe("parseClass: note, etichette e scarti", () => {
  it("decodifica le note e distingue libere e ancorate", () => {
    expect(parseClass(CLASS_VALID.notes!).ast.notes).toMatchObject([
      { text: "libera", target: null },
      { text: 'uno\ndue <tre> & "quattro"', target: "A" },
      { text: "pendente", target: "Fantasma" },
    ])
  })

  it("appiattisce i namespace e scarta stili, interazioni, direzione e accessibilità con un avviso per categoria", () => {
    const { ast, warnings } = parseClass(CLASS_VALID.namespaceAndStyle!)
    expect(ast.classes.map((c) => [c.id, c.generic, c.label])).toEqual([
      ["Cliente", null, null], ["Ordine Web", null, null], ["Square", "Shape", "Quadrato"],
    ])
    expect(warnings.map((w) => w.message)).toEqual([
      "Direzione ignorata: il diagramma delle classi si dispone dall'alto in basso (riga 6)",
      "Namespace appiattiti: le classi entrano, i riquadri no (riga 7)",
      "Stili scartati (style, classDef, cssClass, :::), il diagramma usa i suoi (righe 11, 13, 14, 15)",
      "Interazioni scartate (click, callback, link) (riga 16)",
      "Titolo e descrizione di accessibilità scartati (righe 17, 18)",
    ])
  })

  it("ignora un nome da solo, come Mermaid", () => {
    expect(parseClass("classDiagram\n  A\n").ast).toEqual({ classes: [], relations: [], notes: [] })
  })

  it("legge i fine riga di Windows", () => {
    expect(parseClass("classDiagram\r\n  A --> B\r\n  class C {\r\n    +x\r\n  }\r\n").ast.classes[0]!.members).toMatchObject([{ name: "x" }])
  })
})

describe("parseClass: errori strutturali", () => {
  it("indica l'offset del problema", () => {
    expect(syntaxError("erDiagram\n")).toEqual({ message: "Il testo non comincia con classDiagram", at: 0 })
    expect(syntaxError("classDiagram\n  class A {\n    +x\n")).toEqual({ message: "Blocco «{» senza «}»", at: 23 })
    expect(syntaxError("classDiagram\n  class A {\n    +f() {x}\n  }\n")).toMatchObject({ message: "«{» dentro il blocco di una classe" })
    expect(syntaxError("classDiagram\n  namespace N {\n    class A\n")).toEqual({ message: "Namespace senza «}»", at: 15 })
    expect(syntaxError("classDiagram\n  }\n")).toEqual({ message: "«}» senza un blocco aperto", at: 15 })
    expect(syntaxError("classDiagram\n  A --> B C --> D\n")).toEqual({ message: "Riga non riconosciuta: «A --> B C --> D»", at: 15 })
  })

  it("resta lineare su un testo grande", () => {
    const lines = ["classDiagram"]
    for (let i = 0; i < 5000; i++) {
      lines.push(`  C${i} "1" <|-- "*" C${i + 1} : r`, `  class C${i} {`, "    +Map~string, List~int~~ cache$", "    +find(int id, nome: string) bool", "  }")
    }
    const started = performance.now()
    const { ast } = parseClass(lines.join("\n"))
    expect(ast.relations).toHaveLength(5000)
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it("rifiuta in fretta una riga lunga che non si legge", () => {
    const started = performance.now()
    expect(syntaxError(`classDiagram\n  ${"A".repeat(20000)} ? B\n`).message).toMatch(/^Riga non riconosciuta/)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
```

- [ ] **Step 3: Verifica che fallisca**

Run: `pnpm vitest run src/io/mermaid/class-parse.test.ts`
Expected: FAIL, `Failed to resolve import "./class-parse"`

- [ ] **Step 4: Scrivi l'implementazione**

`src/io/mermaid/class-parse.ts`:

```ts
import type { ParseWarning } from "@/io/ddl/schema"
import { aggregate, decodeEntities, MermaidSyntaxError, stripNoise, type Finding } from "./common"

/** Le teste della grammatica (`relationType` in `classDiagram.jison`), con un nome invece del numero. */
export type ClassHead = "extension" | "composition" | "aggregation" | "dependency" | "lollipop"

export type ClassAstVisibility = "+" | "-" | "#" | "~" | ""

export interface ClassAstParameter {
  name: string
  type: string
}

/** Un membro già spezzato: i generici a tilde sono già tornati fra `<>`. */
export type ClassAstMember =
  | { kind: "attribute"; visibility: ClassAstVisibility; name: string; type: string; isStatic: boolean; isAbstract: boolean; at: number }
  | {
      kind: "method"
      visibility: ClassAstVisibility
      name: string
      parameters: ClassAstParameter[]
      returnType: string
      isStatic: boolean
      isAbstract: boolean
      at: number
    }

/**
 * Una dichiarazione che tocca una classe: un blocco, `class X`, `X : membro`, `<<a>> X`, o un nome
 * con un generico in una relazione. La stessa classe può comparire più volte.
 */
export interface ClassAstClass {
  id: string
  /** Il parametro di `Square~Shape~`, senza tilde. */
  generic: string | null
  /** L'etichetta di `class A["…"]`. */
  label: string | null
  annotations: string[]
  members: ClassAstMember[]
  at: number
}

/** Una riga di relazione così come è scritta: `left` e `right` sono i lati del testo, non i ruoli del modello. */
export interface ClassAstRelation {
  left: string
  leftMultiplicity: string | null
  leftHead: ClassHead | null
  dotted: boolean
  rightHead: ClassHead | null
  rightMultiplicity: string | null
  right: string
  label: string | null
  at: number
}

export interface ClassAstNote {
  text: string
  /** La classe di `note for X`; `null` per una nota libera. */
  target: string | null
  at: number
}

export interface ClassAst {
  classes: ClassAstClass[]
  relations: ClassAstRelation[]
  notes: ClassAstNote[]
}

export interface ClassParseResult {
  ast: ClassAst
  warnings: ParseWarning[]
}

type ClassSyntaxCategory = "style" | "interaction" | "direction" | "accessibility" | "namespace" | "generics"

const MESSAGES: Record<ClassSyntaxCategory, string> = {
  style: "Stili scartati (style, classDef, cssClass, :::), il diagramma usa i suoi",
  interaction: "Interazioni scartate (click, callback, link)",
  direction: "Direzione ignorata: il diagramma delle classi si dispone dall'alto in basso",
  accessibility: "Titolo e descrizione di accessibilità scartati",
  namespace: "Namespace appiattiti: le classi entrano, i riquadri no",
  generics: "Generici a tilde sbilanciati, il tipo resta com'è",
}

/** Un carattere di nome: le regole `ALPHA`, `NUM` e `UNICODE_TEXT` del lexer. */
const NAME_CHAR = "[\\w\\u0080-\\uFFFF]"
/**
 * Nome di classe: fra backtick, o la regola `className` (`alphaNumToken`, `MINUS`, `DOT`). Un `-`
 * o un `.` seguito da un altro è già la linea di una relazione (`A--B`, `A..B`), non il nome.
 */
const NAME = `(\`[^\`]+\`|(?:${NAME_CHAR}|-(?![-.])|\\.(?![.-]))+)`
const GENERIC = "(?:~([^~\\n]*)~)?"
/** Le teste del lexer. La `o` vale come testa solo se non comincia un nome (`A -- order`). */
const HEAD = `(<\\||\\|>|\\*|o(?!${NAME_CHAR})|<|>|\\(\\))`
const MULTIPLICITY = '(?:"([^"]*)")?'

const RELATION = new RegExp(
  `^${NAME}${GENERIC}\\s*${MULTIPLICITY}\\s*${HEAD}?(--|\\.\\.)${HEAD}?\\s*${MULTIPLICITY}\\s*${NAME}${GENERIC}\\s*(?::(.*))?$`,
)
const CLASS_HEADER = new RegExp(
  `^class\\s+${NAME}${GENERIC}\\s*(?:\\[\\s*"([^"]*)"\\s*\\])?\\s*(?::::([\\w-]+)|<<\\s*([^>\\s]+)\\s*>>)?\\s*(\\{.*)?$`,
)
const MEMBER_LINE = new RegExp(`^${NAME}${GENERIC}\\s*:(.*)$`)
const ANNOTATION_STATEMENT = new RegExp(`^<<\\s*([^>\\s]+)\\s*>>\\s*${NAME}${GENERIC}$`)
const NOTE_FOR = new RegExp(`^note\\s+for\\s+${NAME}${GENERIC}\\s+"([^"]*)"$`)
const NOTE = /^note\s+"([^"]*)"$/
const NAMESPACE = new RegExp(`^namespace\\s+${NAME}\\s*(?:\\[\\s*"[^"]*"\\s*\\])?\\s*\\{$`)

const HEAD_BY_TOKEN: Record<string, ClassHead> = {
  "<|": "extension", "|>": "extension", "*": "composition", o: "aggregation", "<": "dependency", ">": "dependency", "()": "lollipop",
}

const unquote = (s: string): string => (s.startsWith("`") && s.endsWith("`") && s.length >= 2 ? s.slice(1, -1) : s)

/** `true` se `~` in `i` apre un generico: segue un carattere di nome e precede l'inizio di un tipo. */
const opensGeneric = (text: string, i: number): boolean =>
  i > 0 && /[\w\u0080-￿]/.test(text[i - 1]!) && /[\w\u0080-￿([]/.test(text[i + 1] ?? "")

/**
 * I generici a tilde tornano fra `<>` (spec §4.2, §11). Una `~` dopo un nome e prima di un tipo
 * apre, ogni altra chiude: `Map~string, List~int~~` → `Map<string, List<int>>`. Mermaid stesso non
 * lo sa fare (`parseGenericTypes` rende `Map<string, List<int~>`): la regola è nostra, ed è
 * l'inversa di `genericsToTildes` dell'export. `null` se le tilde non si chiudono.
 */
export function decodeGenerics(text: string): string | null {
  let depth = 0
  let out = ""
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "~") {
      out += text[i]
      continue
    }
    if (opensGeneric(text, i)) {
      depth++
      out += "<"
    } else {
      if (depth === 0) return null
      depth--
      out += ">"
    }
  }
  return depth === 0 ? out : null
}

/**
 * Le virgole al livello zero di tonde e angolari: `Map<K, V> m, int n` sono due parametri. Il `>`
 * di `=>` e `->` non chiude niente, come in `members.ts`.
 */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "(" || c === "<") depth++
    else if (c === ")" || (c === ">" && text[i - 1] !== "=" && text[i - 1] !== "-")) depth--
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter((p) => p !== "")
}

/** `nome: tipo`, `tipo nome` o `nome`. Il `::` di `std::string` non è il separatore. */
function nameAndType(text: string): { name: string; type: string } {
  const colon = /^([^\s:]+)\s*:(?!:)\s*(.+)$/.exec(text)
  if (colon) return { name: colon[1]!, type: colon[2]!.trim() }
  const space = text.search(/\s\S+$/)
  if (space === -1) return { name: text, type: "" }
  return { name: text.slice(space).trim(), type: text.slice(0, space).trim() }
}

/**
 * Un membro (`ClassMember` di Mermaid): metodo se ha le parentesi, attributo altrimenti. La
 * visibilità è il primo carattere; `$` e `*` sono i classificatori, dopo la `)` o in coda.
 */
function parseMember(raw: string, at: number, findings: Finding<ClassSyntaxCategory>[]): ClassAstMember {
  const generics = (s: string): string => {
    const decoded = decodeGenerics(s)
    if (decoded === null) findings.push({ category: "generics", at, subject: s })
    return decoded ?? s
  }
  const visibility = (/^[+\-#~]/.exec(raw)?.[0] ?? "") as ClassAstVisibility
  const body = raw.slice(visibility.length).trim()
  const open = body.indexOf("(")
  const close = body.lastIndexOf(")")
  if (open !== -1 && close > open) {
    const after = body.slice(close + 1).trim()
    const classifiers = (/^[$*]*/.exec(after)?.[0] ?? "") + (/[$*]*$/.exec(after)?.[0] ?? "")
    const returnType = after.replace(/^[$*]+/, "").replace(/[$*]+$/, "").trim()
    return {
      kind: "method",
      visibility,
      name: body.slice(0, open).trim(),
      parameters: splitTopLevel(generics(body.slice(open + 1, close))).map(nameAndType),
      returnType: generics(returnType),
      isStatic: classifiers.includes("$"),
      isAbstract: classifiers.includes("*"),
      at,
    }
  }
  const classifiers = /[$*]*$/.exec(body)![0]
  const { name, type } = nameAndType(generics(body.slice(0, body.length - classifiers.length).trim()))
  return { kind: "attribute", visibility, name, type, isStatic: classifiers.includes("$"), isAbstract: classifiers.includes("*"), at }
}

/** Il contenuto di un blocco o di `X : …`: un'annotazione `<<…>>` o un membro. */
function addMember(decl: ClassAstClass, raw: string, at: number, findings: Finding<ClassSyntaxCategory>[]): void {
  const text = raw.trim()
  if (text === "") return
  const annotation = /^<<\s*(.+?)\s*>>$/.exec(text)
  if (annotation) decl.annotations.push(annotation[1]!)
  else decl.members.push(parseMember(text, at, findings))
}

const declaration = (id: string, generic: string | undefined, at: number): ClassAstClass => ({
  id: unquote(id), generic: generic ?? null, label: null, annotations: [], members: [], at,
})

const noteText = (s: string): string => decodeEntities(s.replace(/<br\s*\/?>/gi, "\n"))

/**
 * Legge un `classDiagram` nell'AST della famiglia (spec §3.3): fedele al testo, nessuna regola di
 * dominio. Gli avvisi sono i soli costrutti sintattici scartati; un errore strutturale lancia
 * `MermaidSyntaxError` con l'offset.
 *
 * ponytail: una istruzione per riga fuori dai blocchi, e una nota su una riga sola, come per l'ER.
 * La grammatica ammette una stringa di nota su più righe; l'export usa `<br>` e non la produce.
 */
export function parseClass(input: string): ClassParseResult {
  const text = stripNoise(input).replace(/\r/g, " ")
  const findings: Finding<ClassSyntaxCategory>[] = []
  const ast: ClassAst = { classes: [], relations: [], notes: [] }
  const namespaces: number[] = []
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
      if (!/^classDiagram(-v2)?$/.test(line)) throw new MermaidSyntaxError("Il testo non comincia con classDiagram", at)
      seenHeader = true
      i = next
      continue
    }

    let m: RegExpExecArray | null
    if (/^(style|classDef|cssClass)\b/.test(line)) findings.push({ category: "style", at })
    else if (/^(click|callback|link)\b/.test(line)) findings.push({ category: "interaction", at })
    else if (/^direction\s+(TB|BT|RL|LR)$/.test(line)) findings.push({ category: "direction", at })
    else if (/^acc(Title|Descr)\s*:/.test(line)) findings.push({ category: "accessibility", at })
    else if (/^accDescr\s*\{/.test(line)) {
      const close = text.indexOf("}", at)
      if (close === -1) throw new MermaidSyntaxError("Descrizione di accessibilità senza «}»", at)
      findings.push({ category: "accessibility", at })
      next = text.indexOf("\n", close) === -1 ? text.length : text.indexOf("\n", close) + 1
    } else if (/^namespace\b/.test(line)) {
      if (!NAMESPACE.test(line)) throw new MermaidSyntaxError("Namespace non valido: va «namespace Nome {»", at)
      namespaces.push(at)
      findings.push({ category: "namespace", at })
    } else if (line === "}") {
      if (namespaces.pop() === undefined) throw new MermaidSyntaxError("«}» senza un blocco aperto", at)
    } else if ((m = CLASS_HEADER.exec(line))) {
      const decl = declaration(m[1]!, m[2], at)
      if (m[3] !== undefined) decl.label = decodeEntities(m[3])
      if (m[4] !== undefined) findings.push({ category: "style", at })
      if (m[5] !== undefined) decl.annotations.push(m[5])
      if (m[6] !== undefined) {
        const open = at + line.length - m[6].length
        const close = text.indexOf("}", open)
        if (close === -1) throw new MermaidSyntaxError("Blocco «{» senza «}»", open)
        const inner = text.indexOf("{", open + 1)
        if (inner !== -1 && inner < close) throw new MermaidSyntaxError("«{» dentro il blocco di una classe", inner)
        const after = text.indexOf("\n", close) === -1 ? text.length : text.indexOf("\n", close)
        if (text.slice(close + 1, after).trim() !== "") throw new MermaidSyntaxError("Testo dopo «}» sulla stessa riga", close + 1)
        let offset = open + 1
        for (const member of text.slice(open + 1, close).split("\n")) {
          addMember(decl, member, offset + member.length - member.trimStart().length, findings)
          offset += member.length + 1
        }
        next = after + 1
      }
      ast.classes.push(decl)
    } else if ((m = RELATION.exec(line))) {
      const label = m[10] === undefined ? null : decodeEntities(m[10].trim())
      ast.relations.push({
        left: unquote(m[1]!),
        leftMultiplicity: m[3] === undefined ? null : decodeEntities(m[3]),
        leftHead: m[4] === undefined ? null : HEAD_BY_TOKEN[m[4]]!,
        dotted: m[5] === "..",
        rightHead: m[6] === undefined ? null : HEAD_BY_TOKEN[m[6]]!,
        rightMultiplicity: m[7] === undefined ? null : decodeEntities(m[7]),
        right: unquote(m[8]!),
        label: label === "" ? null : label,
        at,
      })
      // Un nome con il generico in una relazione è anche una dichiarazione: l'avviso lo dà il map.
      if (m[2] !== undefined) ast.classes.push(declaration(m[1]!, m[2], at))
      if (m[9] !== undefined) ast.classes.push(declaration(m[8]!, m[9], at))
    } else if ((m = NOTE_FOR.exec(line))) {
      ast.notes.push({ text: noteText(m[3]!), target: unquote(m[1]!), at })
    } else if ((m = NOTE.exec(line))) {
      ast.notes.push({ text: noteText(m[1]!), target: null, at })
    } else if ((m = ANNOTATION_STATEMENT.exec(line))) {
      const decl = declaration(m[2]!, m[3], at)
      decl.annotations.push(m[1]!)
      ast.classes.push(decl)
    } else if ((m = MEMBER_LINE.exec(line))) {
      const decl = declaration(m[1]!, m[2], at)
      addMember(decl, m[3]!, at, findings)
      ast.classes.push(decl)
    } else if (new RegExp(`^${NAME}${GENERIC}$`).test(line)) {
      // Un nome da solo è una `memberStatement` senza effetto: Mermaid non crea la classe, e nemmeno noi.
    } else {
      throw new MermaidSyntaxError(`Riga non riconosciuta: «${line}»`, at)
    }
    i = next
  }

  if (!seenHeader) throw new MermaidSyntaxError("Il testo non comincia con classDiagram", 0)
  if (namespaces.length > 0) throw new MermaidSyntaxError("Namespace senza «}»", namespaces[namespaces.length - 1]!)
  return { ast, warnings: aggregate(findings, text, MESSAGES) }
}
```

- [ ] **Step 5: Verifica che passi**

Run: `pnpm vitest run src/io/mermaid/class-parse.test.ts`
Expected: PASS, 17 test

- [ ] **Step 6: Commit**

```bash
git add src/io/mermaid/class-parse.ts src/io/mermaid/class-fixtures.ts src/io/mermaid/class-parse.test.ts
git commit -m "feat(import-mermaid): il parser di classDiagram, con i generici a tilde annidati"
```

---

### Task 2: Map delle classi e round-trip

**Files:**
- Create: `src/io/mermaid/class-map.ts`
- Test: `src/io/mermaid/class-map.test.ts`, `src/io/mermaid/class-round-trip.test.ts`

**Interfaces:**
- Consumes: `ClassAst`, `ClassAstRelation`, `ClassAstVisibility`, `ClassHead`, `parseClass`, `CLASS_VALID` (Task 1); `ClassNode`, `ClassRelation`, `ClassEnd`, `Stereotype`, `Visibility` da `src/model/class/schema.ts`; `Note` da `src/model/note/schema.ts`; `emitClassMermaid` da `src/io/emit/class-mermaid.ts`.
- Produces: `interface ClassFragment { classes: Record<string, ClassNode>; relations: ClassRelation[]; notes: Note[]; warnings: ParseWarning[] }` e `mapClass(ast: ClassAst, text: string): ClassFragment`. Le note ancorate hanno `anchor: "class/<Nome>"`; le chiavi delle note non esistono ancora, le dà il comando (Task 5).

- [ ] **Step 1: Scrivi i test**

`src/io/mermaid/class-map.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { CLASS_VALID } from "./class-fixtures"
import { mapClass, type ClassFragment } from "./class-map"
import { parseClass } from "./class-parse"

const map = (text: string): ClassFragment => mapClass(parseClass(text).ast, text)
const one = (line: string) => map(`classDiagram\n  ${line}\n`).relations[0]
const warnings = (text: string): string[] => map(text).warnings.map((w) => w.message)

describe("mapClass: relazioni", () => {
  it("mette il lato con la testa nel target e ne ricava la specie (spec §4.2)", () => {
    expect(one("A <|-- B")).toMatchObject({ kind: "generalization", source: { class: "B" }, target: { class: "A" } })
    expect(one("B --|> A")).toMatchObject({ kind: "generalization", source: { class: "B" }, target: { class: "A" } })
    expect(one("C ..|> D")).toMatchObject({ kind: "realization", source: { class: "C" }, target: { class: "D" } })
    expect(one("E *-- F")).toMatchObject({ kind: "composition", source: { class: "F" }, target: { class: "E" } })
    expect(one("E ..* F")).toMatchObject({ kind: "composition", target: { class: "F" } })
    expect(one("G --o H")).toMatchObject({ kind: "aggregation", target: { class: "H" } })
    expect(one("I --> J")).toEqual({ kind: "association", navigable: true, source: { class: "I", multiplicity: "", role: "" }, target: { class: "J", multiplicity: "", role: "" } })
    expect(one("U <-- V")).toMatchObject({ kind: "association", navigable: true, source: { class: "V" }, target: { class: "U" } })
    expect(one("K ..> L")).toMatchObject({ kind: "dependency", source: { class: "K" }, target: { class: "L" } })
    expect(one("M -- N")).toEqual({ kind: "association", source: { class: "M", multiplicity: "", role: "" }, target: { class: "N", multiplicity: "", role: "" } })
  })

  it("porta la molteplicità al capo vicino e l'etichetta nel nome", () => {
    expect(one('Ordine "1" *-- "1..*" Riga : contiene')).toEqual({
      kind: "composition",
      name: "contiene",
      source: { class: "Riga", multiplicity: "1..*", role: "" },
      target: { class: "Ordine", multiplicity: "1", role: "" },
    })
  })

  it("scarta due teste e lollipop, e avvisa sulla linea tratteggiata nuda", () => {
    const fragment = map(CLASS_VALID.relations!)
    expect(fragment.relations).toHaveLength(9)
    expect(fragment.classes).toHaveProperty("S")
    expect(fragment.warnings.map((w) => w.message)).toEqual([
      "Linee tratteggiate senza testa lette come associazioni (riga 9)",
      "Relazioni con due teste scartate (riga 10)",
      "Interfacce lollipop scartate (riga 11)",
    ])
  })
})

describe("mapClass: classi e membri", () => {
  it("unisce blocchi e righe in ordine, e crea vuote le classi delle sole relazioni", () => {
    const { classes } = map(CLASS_VALID.basic!)
    expect(classes.Animal).toEqual({
      name: "Animal",
      stereotype: "class",
      attributes: [{ name: "age", type: "int", visibility: "public", isStatic: false }],
      methods: [{ name: "isMammal", type: "bool", visibility: "public", isStatic: false, isAbstract: false, parameters: [] }],
    })
    expect(classes.Duck!.attributes.map((a) => a.name)).toEqual(["beakColor"])
    expect(map("classDiagram\n  A --> B\n").classes.B).toEqual({ name: "B", stereotype: "class", attributes: [], methods: [] })
  })

  it("legge visibilità, statici, astratti e generici dei membri", () => {
    const ordine = map(CLASS_VALID.members!).classes.Ordine!
    expect(ordine.stereotype).toBe("abstract")
    expect(ordine.attributes).toEqual([
      { name: "id", type: "int", visibility: "private", isStatic: false },
      { name: "totale", type: "double", visibility: "public", isStatic: false },
      { name: "righe", type: "List<Riga>", visibility: "protected", isStatic: true },
      { name: "stato", type: "", visibility: "package", isStatic: false },
    ])
    expect(ordine.methods.map((m) => [m.name, m.type, m.isStatic, m.isAbstract, m.parameters])).toEqual([
      ["Ordine", "", false, false, [{ name: "id", type: "int" }]],
      ["aggiungi", "bool", false, false, [{ name: "r", type: "Riga" }, { name: "quantita", type: "int" }]],
      ["conta", "int", true, false, []],
      ["calcola", "double", false, true, [{ name: "pesi", type: "Map<string, List<int>>" }]],
    ])
  })

  it("riconosce gli stereotipi senza badare alle maiuscole, e avvisa sugli altri", () => {
    const fragment = map(CLASS_VALID.annotations!)
    expect(Object.values(fragment.classes).map((c) => [c.name, c.stereotype])).toEqual([
      ["Forma", "interface"], ["Colore", "enum"], ["Servizio", "class"],
    ])
    expect(fragment.classes.Colore!.attributes.map((a) => [a.name, a.type])).toEqual([["ROSSO", ""], ["VERDE", ""]])
    expect(fragment.warnings.map((w) => w.message)).toEqual([
      "Stereotipi sconosciuti, letti come classe: Servizio «Service» (riga 10)",
      "Più stereotipi sulla stessa classe, si tiene il primo: Servizio (riga 10)",
    ])
  })

  it("tiene il primo attributo omonimo e il primo metodo con la stessa firma, ma gli overload restano", () => {
    const text = "classDiagram\n  class A {\n    +int x\n    +string x\n    +f(int a)\n    +f(int b) bool\n    +f(string a)\n    +y*\n  }\n"
    const a = map(text).classes.A!
    expect(a.attributes.map((x) => [x.name, x.type])).toEqual([["x", "int"], ["y", ""]])
    expect(a.methods.map((m) => m.parameters.map((p) => p.type))).toEqual([["int"], ["string"]])
    expect(warnings(text)).toEqual([
      "Attributi ripetuti nella stessa classe, si tiene il primo: A.x (riga 4)",
      "Metodi con la stessa firma nella stessa classe, si tiene il primo: A.f(int) (riga 6)",
      "«*» su un attributo scartato: solo i metodi sono astratti: A.y (riga 8)",
    ])
  })

  it("scarta etichetta e parametro generico delle classi, con un avviso", () => {
    const fragment = map(CLASS_VALID.namespaceAndStyle!)
    expect(Object.keys(fragment.classes)).toEqual(["Cliente", "Ordine Web", "Square"])
    expect(fragment.warnings.map((w) => w.message)).toEqual([
      "Etichette delle classi scartate, il nome resta l'id: Square (riga 11)",
      "Parametri generici delle classi scartati: Square~Shape~ (riga 11)",
    ])
  })
})

describe("mapClass: note", () => {
  it("ancora le note alle classi del frammento, e libera quelle su una classe che non c'è", () => {
    const fragment = map(CLASS_VALID.notes!)
    expect(fragment.notes).toEqual([
      { text: "libera", anchor: null },
      { text: 'uno\ndue <tre> & "quattro"', anchor: "class/A" },
      { text: "pendente", anchor: null },
    ])
    expect(fragment.warnings.map((w) => w.message)).toEqual(["Note su una classe che non c'è, diventate libere: Fantasma (riga 5)"])
  })
})
```

`src/io/mermaid/class-round-trip.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { emitClassMermaid } from "@/io/emit/class-mermaid"
import type { ClassModel } from "@/model/class/schema"
import type { Note } from "@/model/note/schema"
import { mapClass } from "./class-map"
import { parseClass } from "./class-parse"

/**
 * Un modello con solo ciò che Mermaid porta (spec §8): ruoli vuoti, nomi che Mermaid accetta nudi.
 * Le sei specie, la navigabilità e molteplicità asimmetriche prendono un verso sbagliato; il
 * generico annidato prende la decodifica delle tilde (spec §11). Il round-trip deve restituirlo identico.
 */
const MODEL: ClassModel = {
  classes: {
    Forma: { name: "Forma", stereotype: "interface", attributes: [], methods: [{ name: "area", type: "double", visibility: "public", isStatic: false, isAbstract: true, parameters: [] }] },
    Quadrato: {
      name: "Quadrato",
      stereotype: "class",
      attributes: [
        { name: "lato", type: "double", visibility: "private", isStatic: false },
        { name: "cache", type: "Map<string, List<int>>", visibility: "protected", isStatic: true },
      ],
      methods: [
        { name: "Quadrato", type: "", visibility: "public", isStatic: false, isAbstract: false, parameters: [{ name: "lato", type: "double" }] },
        { name: "scala", type: "Quadrato", visibility: "package", isStatic: true, isAbstract: false, parameters: [{ name: "f", type: "double" }, { name: "pesi", type: "Map<K, V>" }] },
      ],
    },
    Base: { name: "Base", stereotype: "abstract", attributes: [], methods: [] },
    Colore: { name: "Colore", stereotype: "enum", attributes: [{ name: "ROSSO", type: "", visibility: "public", isStatic: false }], methods: [] },
    Disegno: { name: "Disegno", stereotype: "class", attributes: [], methods: [] },
  },
  relations: {
    r1: { kind: "realization", source: { class: "Quadrato", multiplicity: "", role: "" }, target: { class: "Forma", multiplicity: "", role: "" } },
    r2: { kind: "generalization", source: { class: "Quadrato", multiplicity: "", role: "" }, target: { class: "Base", multiplicity: "", role: "" } },
    r3: { kind: "composition", name: "contiene", source: { class: "Forma", multiplicity: "0..*", role: "" }, target: { class: "Disegno", multiplicity: "1", role: "" } },
    r4: { kind: "aggregation", source: { class: "Colore", multiplicity: "1", role: "" }, target: { class: "Disegno", multiplicity: "*", role: "" } },
    r5: { kind: "dependency", source: { class: "Disegno", multiplicity: "", role: "" }, target: { class: "Colore", multiplicity: "", role: "" } },
    r6: { kind: "association", navigable: true, source: { class: "Base", multiplicity: "1", role: "" }, target: { class: "Colore", multiplicity: "2", role: "" } },
    r7: { kind: "association", source: { class: "Forma", multiplicity: "", role: "" }, target: { class: "Colore", multiplicity: "", role: "" } },
  },
}

const NOTES: Record<string, Note> = {
  a: { text: "libera", anchor: null },
  b: { text: 'a < b & "c"\nriga due', anchor: "class/Quadrato" },
}

describe("round-trip classi", () => {
  it("modello → emitClassMermaid → parseClass → mapClass restituisce il modello e le note", () => {
    const { text, warnings } = emitClassMermaid(MODEL, NOTES)
    // L'unico avviso dell'export è il generico annidato, che l'import sa rileggere.
    expect(warnings).toHaveLength(1)
    const parsed = parseClass(text)
    expect(parsed.warnings).toEqual([])
    const fragment = mapClass(parsed.ast, text)
    expect(fragment.warnings).toEqual([])
    expect(fragment.classes).toEqual(MODEL.classes)
    expect(fragment.relations).toEqual(Object.values(MODEL.relations))
    expect(fragment.notes).toEqual(Object.values(NOTES))
  })
})
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm vitest run src/io/mermaid/class-map.test.ts src/io/mermaid/class-round-trip.test.ts`
Expected: FAIL, `Failed to resolve import "./class-map"`

- [ ] **Step 3: Scrivi l'implementazione**

`src/io/mermaid/class-map.ts`:

```ts
import type { ParseWarning } from "@/io/ddl/schema"
import type { ClassEnd, ClassNode, ClassRelation, Stereotype, Visibility } from "@/model/class/schema"
import type { Note } from "@/model/note/schema"
import { aggregate, type Finding } from "./common"
import type { ClassAst, ClassAstRelation, ClassAstVisibility, ClassHead } from "./class-parse"

export interface ClassFragment {
  classes: Record<string, ClassNode>
  relations: ClassRelation[]
  /** Le note libere e quelle ancorate a una classe del frammento (`class/Nome`). Le chiavi le dà il comando. */
  notes: Note[]
  warnings: ParseWarning[]
}

type ClassMapCategory =
  | "label" | "generic" | "stereotype" | "annotations" | "abstractAttribute" | "duplicateAttribute" | "duplicateMethod"
  | "dotted" | "twoHeads" | "lollipop" | "danglingNote"

const MESSAGES: Record<ClassMapCategory, string> = {
  label: "Etichette delle classi scartate, il nome resta l'id",
  generic: "Parametri generici delle classi scartati",
  stereotype: "Stereotipi sconosciuti, letti come classe",
  annotations: "Più stereotipi sulla stessa classe, si tiene il primo",
  abstractAttribute: "«*» su un attributo scartato: solo i metodi sono astratti",
  duplicateAttribute: "Attributi ripetuti nella stessa classe, si tiene il primo",
  duplicateMethod: "Metodi con la stessa firma nella stessa classe, si tiene il primo",
  dotted: "Linee tratteggiate senza testa lette come associazioni",
  twoHeads: "Relazioni con due teste scartate",
  lollipop: "Interfacce lollipop scartate",
  danglingNote: "Note su una classe che non c'è, diventate libere",
}

const VISIBILITY: Record<ClassAstVisibility, Visibility> = { "+": "public", "-": "private", "#": "protected", "~": "package", "": "public" }

/** Gli stereotipi noti, senza distinzione fra maiuscole e minuscole (spec §4.2). */
const STEREOTYPE: Readonly<Record<string, Stereotype>> = {
  interface: "interface", abstract: "abstract", enumeration: "enum", enum: "enum",
}

/** La specie dalla testa e dalla linea (spec §4.2). `dependency` con la linea piena è un'associazione navigabile. */
function kindOf(head: ClassHead | null, dotted: boolean): Pick<ClassRelation, "kind" | "navigable"> {
  switch (head) {
    case "extension": return { kind: dotted ? "realization" : "generalization" }
    case "composition": return { kind: "composition" }
    case "aggregation": return { kind: "aggregation" }
    case "dependency": return dotted ? { kind: "dependency" } : { kind: "association", navigable: true }
    default: return { kind: "association" }
  }
}

/** La firma che distingue gli overload (spec §4.2): nome e tipi dei parametri. */
const signature = (m: { name: string; parameters: readonly { type: string }[] }): string => `${m.name}(${m.parameters.map((p) => p.type).join(",")})`

/**
 * Applica all'AST le regole della spec §4.2 e restituisce un frammento del modello delle classi,
 * con le note. Non vede il documento: sostituzione, chiavi e posizioni le decide il comando di
 * import. `text` serve solo a dire le righe negli avvisi.
 */
export function mapClass(ast: ClassAst, text: string): ClassFragment {
  const findings: Finding<ClassMapCategory>[] = []
  const classes: Record<string, ClassNode> = {}
  const annotations = new Map<string, string[]>()

  const ensure = (id: string): ClassNode => (classes[id] ??= { name: id, stereotype: "class", attributes: [], methods: [] })

  for (const decl of ast.classes) {
    const cls = ensure(decl.id)
    if (decl.label !== null) findings.push({ category: "label", at: decl.at, subject: decl.id })
    if (decl.generic !== null) findings.push({ category: "generic", at: decl.at, subject: `${decl.id}~${decl.generic}~` })
    for (const a of decl.annotations) annotations.set(decl.id, [...(annotations.get(decl.id) ?? []), a])
    for (const m of decl.members) {
      const subject = `${decl.id}.${m.name}`
      if (m.kind === "attribute") {
        if (m.isAbstract) findings.push({ category: "abstractAttribute", at: m.at, subject })
        if (cls.attributes.some((a) => a.name === m.name)) {
          findings.push({ category: "duplicateAttribute", at: m.at, subject })
          continue
        }
        cls.attributes.push({ name: m.name, type: m.type, visibility: VISIBILITY[m.visibility], isStatic: m.isStatic })
      } else {
        const sig = signature(m)
        if (cls.methods.some((x) => signature(x) === sig)) {
          findings.push({ category: "duplicateMethod", at: m.at, subject: `${decl.id}.${sig}` })
          continue
        }
        cls.methods.push({
          name: m.name, type: m.returnType, visibility: VISIBILITY[m.visibility], isStatic: m.isStatic, isAbstract: m.isAbstract,
          parameters: m.parameters.map((p) => ({ name: p.name, type: p.type })),
        })
      }
    }
  }

  for (const [id, list] of annotations) {
    const at = ast.classes.find((c) => c.id === id)!.at
    const stereotype = STEREOTYPE[list[0]!.toLowerCase()]
    if (stereotype === undefined) findings.push({ category: "stereotype", at, subject: `${id} «${list[0]}»` })
    if (list.length > 1) findings.push({ category: "annotations", at, subject: id })
    classes[id]!.stereotype = stereotype ?? "class"
  }

  const relations = ast.relations.flatMap((r: ClassAstRelation): ClassRelation[] => {
    ensure(r.left)
    ensure(r.right)
    if (r.leftHead === "lollipop" || r.rightHead === "lollipop") {
      findings.push({ category: "lollipop", at: r.at })
      return []
    }
    if (r.leftHead !== null && r.rightHead !== null) {
      findings.push({ category: "twoHeads", at: r.at })
      return []
    }
    if (r.leftHead === null && r.rightHead === null && r.dotted) findings.push({ category: "dotted", at: r.at })
    const left: ClassEnd = { class: r.left, multiplicity: r.leftMultiplicity ?? "", role: "" }
    const right: ClassEnd = { class: r.right, multiplicity: r.rightMultiplicity ?? "", role: "" }
    // Il lato con la testa è il `target`, comunque sia scritta la riga; senza teste, il verso del testo.
    const [source, target] = r.leftHead !== null ? [right, left] : [left, right]
    return [{ ...kindOf(r.leftHead ?? r.rightHead, r.dotted), ...(r.label === null ? {} : { name: r.label }), source, target }]
  })

  const notes = ast.notes.map((n): Note => {
    if (n.target === null) return { text: n.text, anchor: null }
    if (n.target in classes) return { text: n.text, anchor: `class/${n.target}` }
    findings.push({ category: "danglingNote", at: n.at, subject: n.target })
    return { text: n.text, anchor: null }
  })

  return { classes, relations, notes, warnings: aggregate(findings, text, MESSAGES) }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `pnpm vitest run src/io/mermaid/class-map.test.ts src/io/mermaid/class-round-trip.test.ts`
Expected: PASS, 10 test. Il round-trip è quello che prende il verso sbagliato di una specie: se fallisce su `r1`/`r5`, la regola «testa = target» del map è invertita.

- [ ] **Step 5: Commit**

```bash
git add src/io/mermaid/class-map.ts src/io/mermaid/class-map.test.ts src/io/mermaid/class-round-trip.test.ts
git commit -m "feat(import-mermaid): dall'AST delle classi al frammento del modello, con il round-trip"
```

---

### Task 3: Oracolo sulle classi

**Files:**
- Test: `src/io/mermaid/oracle.test.ts`

**Interfaces:**
- Consumes: `CLASS_VALID`, `parseClass` (Task 1); `emitClassMermaid`; `ClassModel`.
- Produces: niente per gli altri task.

- [ ] **Step 1: Estendi la suite**

`src/io/mermaid/oracle.test.ts`, intero:

```ts
// @vitest-environment jsdom
import mermaid from "mermaid"
import { describe, expect, it } from "vitest"
import { emitClassMermaid } from "@/io/emit/class-mermaid"
import { emitMermaid } from "@/io/emit/er-mermaid"
import type { ClassModel } from "@/model/class/schema"
import type { ErModel } from "@/model/er/schema"
import { CLASS_VALID } from "./class-fixtures"
import { parseClass } from "./class-parse"
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

describe("oracolo Mermaid: classDiagram", () => {
  it.each(Object.entries(CLASS_VALID))("la fixture %s piace a entrambi i parser", async (_, text) => {
    expect(() => parseClass(text)).not.toThrow()
    expect(await mermaidAccepts(text)).toBe(true)
  })

  it("l'export delle classi è Mermaid valido, generici annidati e note comprese", async () => {
    const model: ClassModel = {
      classes: {
        Ordine: {
          name: "Ordine",
          stereotype: "abstract",
          attributes: [{ name: "pesi", type: "Map<string, List<int>>", visibility: "private", isStatic: true }],
          methods: [{ name: "totale", type: "double", visibility: "public", isStatic: false, isAbstract: true, parameters: [{ name: "x", type: "int" }] }],
        },
        Riga: { name: "Riga", stereotype: "class", attributes: [], methods: [] },
      },
      relations: {
        r: { kind: "composition", source: { class: "Riga", multiplicity: "1..*", role: "" }, target: { class: "Ordine", multiplicity: "1", role: "" } },
      },
    }
    const notes = { n: { text: "a < b & \"c\"\nd", anchor: "class/Ordine" } }
    expect(await mermaidAccepts(emitClassMermaid(model, notes).text)).toBe(true)
  })
})
```

- [ ] **Step 2: Verifica che passi e che l'oracolo distingua**

Run: `pnpm vitest run src/io/mermaid/oracle.test.ts`
Expected: PASS, 15 test

Per controllare che l'oracolo rifiuti davvero il testo sbagliato, metti per un momento in `CLASS_VALID.basic` due istruzioni sulla stessa riga (`Animal <|-- Duck Duck --> X`): il caso `basic` deve fallire, e prima ancora `parseClass` deve lanciare. Poi rimetti la riga com'era.

- [ ] **Step 3: Commit**

```bash
git add src/io/mermaid/oracle.test.ts
git commit -m "test(import-mermaid): mermaid@12.2 come oracolo del parser e dell'export delle classi"
```

---

### Task 4: Disposizione e griglia per qualunque famiglia

Un refactoring senza cambi di comportamento: la griglia di `placeNew` e il blocco ELK di `placeErImport` servono identici alle classi. Li coprono già i test di `import.test.ts` e di `placeErImport`, che devono restare verdi senza toccarli.

**Files:**
- Modify: `src/editor/commands/import.ts`
- Modify: `src/editor/commands/import-mermaid.ts`

**Interfaces:**
- Consumes: niente di nuovo.
- Produces:
  - `placeInGrid(fresh: readonly (readonly [string, Size])[], occupied: readonly Rect[]): Record<string, Point>` in `import.ts`, esportata;
  - `layoutBelow(graph: LayoutGraph, occupied: readonly Rect[], layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<Record<string, Point> | null>` in `import-mermaid.ts`, non esportata. `null` vuol dire che il motore è fallito.

- [ ] **Step 1: Verifica il punto di partenza**

Run: `pnpm vitest run src/editor/commands/import.test.ts src/editor/commands/import-mermaid.test.ts`
Expected: PASS, 23 test

- [ ] **Step 2: Estrai `placeInGrid`**

```diff
diff --git a/src/editor/commands/import.ts b/src/editor/commands/import.ts
index 1386753..778d46d 100644
--- a/src/editor/commands/import.ts
+++ b/src/editor/commands/import.ts
@@ -2,7 +2,7 @@ import type { Entity, ErDiagram, Relationship } from "@/model/er/schema"
 import type { Recipe } from "../document-store"
 import { erDiagram } from "../er-access"
 import { entitySize } from "../er/geometry"
-import { rectsBounds, snap, type Point, type Rect } from "../geometry"
+import { rectsBounds, snap, type Point, type Rect, type Size } from "../geometry"
 import { uniqueKey } from "./er"
 
 /** Spazio fra le celle della griglia e fra l'import e ciò che c'è già. */
@@ -24,10 +24,14 @@ export const GUTTER = 40
  */
 export function placeNew(entities: Record<string, Entity>, diagram: ErDiagram, occupied: readonly Rect[]): Record<string, Point> {
   const fresh = Object.entries(entities).filter(([key]) => !(key in diagram.view.nodes))
+  return placeInGrid(fresh.map(([key, entity]) => [key, entitySize(entity, false)]), occupied)
+}
+
+/** La griglia di `placeNew` per nodi di qualunque famiglia, già filtrati e misurati: la usa anche l'import delle classi. */
+export function placeInGrid(fresh: readonly (readonly [string, Size])[], occupied: readonly Rect[]): Record<string, Point> {
   if (fresh.length === 0) return {}
 
-  const sizes = fresh.map(([, entity]) => entitySize(entity, false))
-  const cellW = snap(Math.max(...sizes.map((s) => s.w)) + GUTTER)
+  const cellW = snap(Math.max(...fresh.map(([, s]) => s.w)) + GUTTER)
   const cols = Math.ceil(Math.sqrt(fresh.length))
 
   const bounds = rectsBounds(occupied)
@@ -35,14 +39,14 @@ export function placeNew(entities: Record<string, Entity>, diagram: ErDiagram, o
   const originY = snap(bounds ? bounds.y + bounds.h + GUTTER : GUTTER)
 
   const out: Record<string, Point> = {}
-  // Quota corrente di ogni colonna, in ordine di lettura: l'entità i-esima si appoggia sotto quella
-  // che l'ha preceduta nella sua colonna.
+  // Quota corrente di ogni colonna, in ordine di lettura: il nodo i-esimo si appoggia sotto quello
+  // che l'ha preceduto nella sua colonna.
   const colY = new Array<number>(cols).fill(originY)
-  fresh.forEach(([key], i) => {
+  fresh.forEach(([key, size], i) => {
     const col = i % cols
     const y = colY[col] ?? originY
     out[key] = { x: snap(originX + col * cellW), y: snap(y) }
-    colY[col] = y + (sizes[i]?.h ?? 0) + GUTTER
+    colY[col] = y + size.h + GUTTER
   })
   return out
 }
```

- [ ] **Step 3: Estrai `layoutBelow`**

In `src/editor/commands/import-mermaid.ts`:

```diff
diff --git a/src/editor/commands/import-mermaid.ts b/src/editor/commands/import-mermaid.ts
--- a/src/editor/commands/import-mermaid.ts
+++ b/src/editor/commands/import-mermaid.ts
@@ -4,6 +4,6 @@ import type { LayoutGraph, LayoutPositions } from "@/model/layout"
 import type { Recipe } from "../document-store"
 import { erDiagram } from "../er-access"
-import { rectsBounds, snap, type Point } from "../geometry"
+import { rectsBounds, snap, type Point, type Rect } from "../geometry"
 import { nodeRects } from "../kinds/canvas-ops"
 import { nodesBounds } from "../layout-pack"
 import { uniqueKey } from "./er"
@@ -88,23 +88,36 @@ export async function placeErImport(
   }
   const graph = layoutGraph(temporary)
   const occupied = nodeRects(doc)
-
-  let raw: LayoutPositions
-  try {
-    raw = graph.nodes.length > 1 ? await layout(graph) : { [fresh[0]!]: { x: 0, y: 0 } }
-  } catch {
+  const positions = await layoutBelow(graph, occupied, layout)
+  if (positions === null) {
     return {
       positions: placeNew(temporary.model.entities, diagram, occupied),
       fallback: "La disposizione automatica non è riuscita: le entità nuove sono in griglia.",
     }
   }
+  return { positions, fallback: null }
+}
+
+/**
+ * ELK sul grafo dei soli nodi nuovi, poi il blocco traslato sotto `occupied`, con l'origine di
+ * `placeNew` (spec §6). Un nodo solo non passa per il motore. `null` se il motore fallisce: il
+ * ripiego sulla griglia lo sceglie il chiamante, che conosce le misure della sua famiglia.
+ */
+async function layoutBelow(
+  graph: LayoutGraph, occupied: readonly Rect[], layout: (g: LayoutGraph) => Promise<LayoutPositions>,
+): Promise<Record<string, Point> | null> {
+  let raw: LayoutPositions
+  try {
+    raw = graph.nodes.length > 1 ? await layout(graph) : { [graph.nodes[0]!.id]: { x: 0, y: 0 } }
+  } catch {
+    return null
+  }
   const block = nodesBounds(graph.nodes, raw)!
   const bounds = rectsBounds(occupied)
   const origin = bounds ? { x: bounds.x, y: bounds.y + bounds.h + GUTTER } : { x: GUTTER, y: GUTTER }
-  const positions = Object.fromEntries(
+  return Object.fromEntries(
     Object.entries(raw).map(([key, p]) => [key, { x: snap(origin.x + p.x - block.x), y: snap(origin.y + p.y - block.y) }]),
   )
-  return { positions, fallback: null }
 }
 
 /**
```

- [ ] **Step 4: Verifica che non sia cambiato niente**

Run: `pnpm vitest run src/editor/commands/import.test.ts src/editor/commands/import-mermaid.test.ts && pnpm tsc -b`
Expected: PASS, gli stessi 23 test; `tsc` senza errori

- [ ] **Step 5: Commit**

```bash
git add src/editor/commands/import.ts src/editor/commands/import-mermaid.ts
git commit -m "refactor(import): griglia e blocco ELK riusabili da ogni famiglia"
```

---

### Task 5: Comando, esito e disposizione delle classi

**Files:**
- Modify: `src/editor/commands/import-mermaid.ts`
- Test: `src/editor/commands/import-mermaid.test.ts`

**Interfaces:**
- Consumes: `placeInGrid` (Task 4), `layoutBelow` (Task 4), `ImportFate`, `uniqueKey`; `classLayoutGraph` da `src/editor/class/commands.ts`; `noteSize` da `src/editor/note/geometry.ts`; `classDiagram`, `noteDiagram`; `splitKey` da `src/model/family.ts`.
- Produces (tutto esportato da `import-mermaid.ts`):
  - `sameClass(a: ClassNode, b: ClassNode): boolean`;
  - `sameClassRelation(a: ClassRelation, b: ClassRelation): boolean` (navigabilità assente = `false`);
  - `classImportFates(doc: DevDocument, classes: Readonly<Record<string, ClassNode>>): Record<string, ImportFate>`;
  - `interface ClassImport { classes: Record<string, ClassNode>; relations: ClassRelation[]; notes: Record<string, Note> }`;
  - `selectClassFragment(classes, relations: readonly ClassRelation[], notes: readonly Note[], chosen: ReadonlySet<string>, present: ReadonlySet<string>): ClassImport` — qui le note prendono un uuid;
  - `interface ClassPlacement { classes: Record<string, Point>; notes: Record<string, Point>; fallback: string | null }`;
  - `placeClassImport(doc, fragment: ClassImport, layout): Promise<ClassPlacement>`;
  - `importMermaidClass(fragment: ClassImport, placement: Pick<ClassPlacement, "classes" | "notes">): Recipe`.

- [ ] **Step 1: Scrivi il test**

In `src/editor/commands/import-mermaid.test.ts`, gli import diventano:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import type { ClassNode, ClassRelation } from "@/model/class/schema"
import { createDocument } from "@/model/document"
import type { Entity, Relationship } from "@/model/er/schema"
import type { LayoutGraph } from "@/model/layout"
import { classDiagram } from "../class-access"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { noteDiagram } from "../note-access"
import { importEr } from "./import"
import {
  classImportFates, erImportFates, importMermaidClass, importMermaidEr, placeClassImport, placeErImport, sameClassRelation,
  selectClassFragment, selectErFragment, type ClassImport,
} from "./import-mermaid"
```

e in fondo al file si aggiunge:

```ts
const cls = (name: string, attributes: string[] = []): ClassNode => ({
  name,
  stereotype: "class",
  attributes: attributes.map((n) => ({ name: n, type: "int", visibility: "public", isStatic: false })),
  methods: [],
})

/** Una relazione come la produce `mapClass`: ruoli vuoti. */
const classRel = (source: string, target: string, kind: ClassRelation["kind"] = "generalization"): ClassRelation => ({
  kind,
  source: { class: source, multiplicity: "", role: "" },
  target: { class: target, multiplicity: "", role: "" },
})

const classes = () => classDiagram(doc())
const notes = () => Object.values(noteDiagram(doc()).model.notes)
const at = (x: number, y: number) => ({ x, y })

describe("importMermaidClass", () => {
  it("crea classi, relazioni e note alle posizioni date", () => {
    const fragment: ClassImport = { classes: { A: cls("A"), B: cls("B") }, relations: [classRel("B", "A")], notes: { n1: { text: "ciao", anchor: "class/A" } } }
    documentStore.getState().dispatch(importMermaidClass(fragment, { classes: { A: at(40, 40), B: at(340, 40) }, notes: { n1: at(40, 300) } }))
    expect(Object.keys(classes().model.classes)).toEqual(["A", "B"])
    expect(classes().view.nodes.B).toEqual({ x: 340, y: 40, collapsed: false })
    expect(Object.values(classes().model.relations)).toEqual([classRel("B", "A")])
    expect(noteDiagram(doc()).model.notes.n1).toEqual({ text: "ciao", anchor: "class/A" })
    expect(noteDiagram(doc()).view.nodes.n1).toEqual({ x: 40, y: 300, collapsed: false })
  })

  it("sostituisce una classe presente, le lascia la posizione e le tiene la nota ancorata", () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A") }, relations: [], notes: { n1: { text: "x", anchor: "class/A" } } }, { classes: { A: at(40, 40) }, notes: { n1: at(0, 300) } }))
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A", ["id"]) }, relations: [], notes: {} }, { classes: { A: at(999, 999) }, notes: {} }))
    expect(classes().model.classes.A!.attributes.map((a) => a.name)).toEqual(["id"])
    expect(classes().view.nodes.A).toMatchObject({ x: 40, y: 40 })
    expect(notes()).toEqual([{ text: "x", anchor: "class/A" }])
  })

  it("re-importare lo stesso testo non duplica relazioni e note, una relazione diversa si aggiunge", () => {
    const run = (kind: ClassRelation["kind"], noteKey: string) =>
      documentStore.getState().dispatch(importMermaidClass(
        { classes: { A: cls("A"), B: cls("B") }, relations: [classRel("B", "A", kind)], notes: { [noteKey]: { text: "nota", anchor: null } } },
        { classes: { A: at(40, 40), B: at(340, 40) }, notes: { [noteKey]: at(40, 300) } },
      ))
    run("generalization", "n1")
    run("generalization", "n2")
    expect(Object.keys(classes().model.relations)).toHaveLength(1)
    expect(notes()).toHaveLength(1)
    run("realization", "n3")
    expect(Object.keys(classes().model.relations)).toHaveLength(2)
  })

  it("si annulla con un solo undo", () => {
    documentStore.getState().dispatch(importMermaidClass(
      { classes: { A: cls("A"), B: cls("B") }, relations: [classRel("B", "A")], notes: { n1: { text: "x", anchor: null } } },
      { classes: { A: at(0, 0), B: at(0, 0) }, notes: { n1: at(0, 0) } },
    ))
    documentStore.getState().undo()
    expect(classes().model.classes).toEqual({})
    expect(classes().model.relations).toEqual({})
    expect(notes()).toEqual([])
  })
})

describe("classImportFates, sameClassRelation e selectClassFragment", () => {
  it("distinguono nuovo, sostituisce e identico", () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A"), B: cls("B") }, relations: [], notes: {} }, { classes: { A: at(0, 0), B: at(0, 0) }, notes: {} }))
    expect(classImportFates(doc(), { A: cls("A"), B: cls("B", ["x"]), C: cls("C") })).toEqual({ A: "identico", B: "sostituisce", C: "nuovo" })
  })

  it("considerano uguali una navigabilità assente e una falsa, e diverse due molteplicità", () => {
    expect(sameClassRelation(classRel("B", "A", "association"), { ...classRel("B", "A", "association"), navigable: false })).toBe(true)
    expect(sameClassRelation(classRel("B", "A"), { ...classRel("B", "A"), target: { class: "A", multiplicity: "1", role: "" } })).toBe(false)
  })

  it("tengono solo relazioni e note ancorate con estremi scelti o già presenti, e danno una chiave alle note", () => {
    const out = selectClassFragment(
      { A: cls("A"), B: cls("B"), C: cls("C") },
      [classRel("B", "A"), classRel("C", "A"), classRel("B", "Z")],
      [{ text: "libera", anchor: null }, { text: "su C", anchor: "class/C" }, { text: "su Z", anchor: "class/Z" }],
      new Set(["A", "B"]), new Set(["Z"]),
    )
    expect(Object.keys(out.classes)).toEqual(["A", "B"])
    expect(out.relations).toEqual([classRel("B", "A"), classRel("B", "Z")])
    expect(Object.values(out.notes)).toEqual([{ text: "libera", anchor: null }, { text: "su Z", anchor: "class/Z" }])
    expect(Object.keys(out.notes).every((k) => /^[0-9a-f-]{36}$/.test(k))).toBe(true)
  })
})

describe("placeClassImport", () => {
  it("dispone con il motore le sole classi nuove e le note, con l'arco dalla classe alla sua nota", async () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: { A: cls("A") }, relations: [], notes: {} }, { classes: { A: at(40, 40) }, notes: {} }))
    const fragment: ClassImport = {
      classes: { A: cls("A"), B: cls("B"), C: cls("C") },
      relations: [classRel("C", "B"), classRel("B", "A")],
      notes: { n1: { text: "su C", anchor: "class/C" } },
    }
    const { classes: placed, notes: placedNotes, fallback } = await placeClassImport(doc(), fragment, async (g) => {
      expect(g.nodes.map((n) => n.id)).toEqual(["B", "C", "n1"])
      expect(g.edges.map((e) => [e.source, e.target])).toEqual([["B", "C"], ["C", "n1"]])
      return fakeLayout(g)
    })
    expect(fallback).toBeNull()
    expect(Object.keys(placed)).toEqual(["B", "C"])
    expect(Object.keys(placedNotes)).toEqual(["n1"])
    expect(placed.B!.x).toBe(40)
    expect(placed.B!.y).toBeGreaterThan(classes().view.nodes.A!.y)
  })

  it("non dispone una nota identica a una presente", async () => {
    documentStore.getState().dispatch(importMermaidClass({ classes: {}, relations: [], notes: { n1: { text: "x", anchor: null } } }, { classes: {}, notes: { n1: at(40, 40) } }))
    const placement = await placeClassImport(doc(), { classes: {}, relations: [], notes: { n2: { text: "x", anchor: null } } }, async () => {
      throw new Error("non doveva essere chiamato")
    })
    expect(placement).toEqual({ classes: {}, notes: {}, fallback: null })
  })

  it("se il motore fallisce ripiega sulla griglia, con un messaggio", async () => {
    const placement = await placeClassImport(doc(), { classes: { A: cls("A"), B: cls("B") }, relations: [], notes: { n1: { text: "x", anchor: null } } }, async () => {
      throw new Error("timeout")
    })
    expect(Object.keys(placement.classes)).toEqual(["A", "B"])
    expect(Object.keys(placement.notes)).toEqual(["n1"])
    expect(placement.fallback).toMatch(/griglia/)
  })
})
```

- [ ] **Step 2: Verifica che fallisca**

Run: `pnpm vitest run src/editor/commands/import-mermaid.test.ts`
Expected: FAIL, `importMermaidClass` (e gli altri) non esportati da `./import-mermaid`

- [ ] **Step 3: Scrivi l'implementazione**

In `src/editor/commands/import-mermaid.ts`, gli import diventano:

```ts
import type { ClassDiagram, ClassNode, ClassRelation } from "@/model/class/schema"
import type { DevDocument } from "@/model/document"
import type { Entity, ErDiagram, Relationship } from "@/model/er/schema"
import { splitKey } from "@/model/family"
import type { LayoutGraph, LayoutPositions } from "@/model/layout"
import type { Note } from "@/model/note/schema"
import { classLayoutGraph } from "../class/commands"
import { classDiagram } from "../class-access"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { rectsBounds, snap, type Point, type Rect } from "../geometry"
import { nodeRects } from "../kinds/canvas-ops"
import { nodesBounds } from "../layout-pack"
import { noteDiagram } from "../note-access"
import { noteSize } from "../note/geometry"
import { uniqueKey } from "./er"
import { GUTTER, placeInGrid, placeNew } from "./import"
import { layoutGraph } from "./layout"
```

e in fondo al file si aggiunge:

```ts
/** Uguaglianza campo per campo, come `sameEntity`: l'ordine delle chiavi non conta, quello dei membri sì. */
export function sameClass(a: ClassNode, b: ClassNode): boolean {
  return (
    a.name === b.name &&
    a.stereotype === b.stereotype &&
    a.attributes.length === b.attributes.length &&
    a.attributes.every((x, i) => {
      const y = b.attributes[i]!
      return x.name === y.name && x.type === y.type && x.visibility === y.visibility && x.isStatic === y.isStatic
    }) &&
    a.methods.length === b.methods.length &&
    a.methods.every((x, i) => {
      const y = b.methods[i]!
      return x.name === y.name && x.type === y.type && x.visibility === y.visibility && x.isStatic === y.isStatic &&
        x.isAbstract === y.isAbstract && x.parameters.length === y.parameters.length &&
        x.parameters.every((p, j) => p.name === y.parameters[j]!.name && p.type === y.parameters[j]!.type)
    })
  )
}

/** Due relazioni dicono la stessa cosa (spec §5): estremi, molteplicità, specie, nome e navigabilità. Gli agganci non contano. */
export function sameClassRelation(a: ClassRelation, b: ClassRelation): boolean {
  const sameEnd = (x: ClassRelation["source"], y: ClassRelation["source"]) =>
    x.class === y.class && x.multiplicity === y.multiplicity && x.role === y.role
  return sameEnd(a.source, b.source) && sameEnd(a.target, b.target) && a.kind === b.kind && a.name === b.name &&
    (a.navigable ?? false) === (b.navigable ?? false)
}

/** Una nota con lo stesso testo e la stessa àncora c'è già (spec §5). */
const sameNote = (a: Note, b: Note): boolean => a.text === b.text && a.anchor === b.anchor

export function classImportFates(doc: DevDocument, classes: Readonly<Record<string, ClassNode>>): Record<string, ImportFate> {
  const present = classDiagram(doc).model.classes
  return Object.fromEntries(
    Object.entries(classes).map(([key, c]) => {
      const old = present[key]
      return [key, old === undefined ? "nuovo" : sameClass(old, c) ? "identico" : "sostituisce"]
    }),
  )
}

/** Il frammento di classi pronto per l'innesto: le note hanno già la loro chiave. */
export interface ClassImport {
  classes: Record<string, ClassNode>
  relations: ClassRelation[]
  notes: Record<string, Note>
}

/**
 * Le sole classi scelte, e relazioni e note ancorate i cui estremi sono tutti scelti o già nel
 * documento (spec §7). Le note libere entrano sempre. Le note prendono qui la chiave, un uuid come
 * in `addNote`: serve già alla disposizione.
 */
export function selectClassFragment(
  classes: Readonly<Record<string, ClassNode>>, relations: readonly ClassRelation[], notes: readonly Note[],
  chosen: ReadonlySet<string>, present: ReadonlySet<string>,
): ClassImport {
  const picked = Object.fromEntries(Object.entries(classes).filter(([key]) => chosen.has(key)))
  const reachable = (key: string) => key in picked || present.has(key)
  return {
    classes: picked,
    relations: relations.filter((r) => reachable(r.source.class) && reachable(r.target.class)),
    notes: Object.fromEntries(
      notes.filter((n) => n.anchor === null || reachable(splitKey(n.anchor).key)).map((n) => [crypto.randomUUID(), n]),
    ),
  }
}

export interface ClassPlacement {
  classes: Record<string, Point>
  notes: Record<string, Point>
  /** Il messaggio del ripiego sulla griglia, se c'è stato. */
  fallback: string | null
}

/**
 * Le posizioni delle classi **nuove** e delle note da aggiungere (spec §6): lo stesso blocco di
 * `placeErImport`, con il grafo di «Disponi» delle classi. Le note entrano nel grafo come nodi, con
 * un arco dalla loro classe quando anche quella è nuova, così ELK le mette accanto.
 *
 * ponytail: una nota ancorata a una classe che c'era già finisce nel blocco nuovo, lontana dalla
 * sua classe. Se dà fastidio, va messa accanto al rettangolo della classe invece che nel grafo.
 */
export async function placeClassImport(
  doc: DevDocument, fragment: ClassImport, layout: (g: LayoutGraph) => Promise<LayoutPositions>,
): Promise<ClassPlacement> {
  const diagram = classDiagram(doc)
  const fresh = Object.keys(fragment.classes).filter((key) => !(key in diagram.view.nodes))
  const freshSet = new Set(fresh)
  const existingNotes = Object.values(noteDiagram(doc).model.notes)
  const notes = Object.entries(fragment.notes).filter(([, n]) => !existingNotes.some((old) => sameNote(old, n)))
  if (fresh.length === 0 && notes.length === 0) return { classes: {}, notes: {}, fallback: null }

  const temporary: ClassDiagram = {
    model: {
      classes: Object.fromEntries(fresh.map((key) => [key, fragment.classes[key]!])),
      relations: Object.fromEntries(
        fragment.relations.filter((r) => freshSet.has(r.source.class) && freshSet.has(r.target.class)).map((r, i) => [String(i), r]),
      ),
    },
    view: { nodes: Object.fromEntries(fresh.map((key) => [key, { x: 0, y: 0, collapsed: false }])) },
  }
  const graph = classLayoutGraph(temporary)
  for (const [key, note] of notes) {
    graph.nodes.push({ id: key, ...noteSize(note) })
    const anchor = note.anchor === null ? null : splitKey(note.anchor).key
    if (anchor !== null && freshSet.has(anchor)) graph.edges.push({ id: `note:${key}`, source: anchor, target: key })
  }

  const occupied = nodeRects(doc)
  const split = (positions: Record<string, Point>) => ({
    classes: Object.fromEntries(Object.entries(positions).filter(([key]) => freshSet.has(key))),
    notes: Object.fromEntries(Object.entries(positions).filter(([key]) => !freshSet.has(key))),
  })
  const positions = await layoutBelow(graph, occupied, layout)
  if (positions === null) {
    const sizes = graph.nodes.map((n) => [n.id, { w: n.w, h: n.h }] as const)
    return { ...split(placeInGrid(sizes, occupied)), fallback: "La disposizione automatica non è riuscita: gli elementi nuovi sono in griglia." }
  }
  return { ...split(positions), fallback: null }
}

/**
 * Innesta un frammento di classi letto da Mermaid (spec §5), in un solo comando. Una classe
 * presente viene sostituita e tiene il suo nodo; una nuova prende la posizione da `placement`. Una
 * relazione uguale a una presente si salta, e così una nota con lo stesso testo e la stessa
 * àncora; nessuna si pota.
 */
export function importMermaidClass(fragment: ClassImport, placement: Pick<ClassPlacement, "classes" | "notes">): Recipe {
  return (draft) => {
    const d = classDiagram(draft)
    for (const [key, cls] of Object.entries(fragment.classes)) {
      d.model.classes[key] = cls
      const pos = placement.classes[key]
      if (pos && !(key in d.view.nodes)) d.view.nodes[key] = { ...pos, collapsed: false }
    }
    for (const rel of fragment.relations) {
      if (Object.values(d.model.relations).some((old) => sameClassRelation(old, rel))) continue
      d.model.relations[uniqueKey(d.model.relations, `${rel.source.class}_${rel.target.class}`)] = rel
    }
    const n = noteDiagram(draft)
    for (const [key, note] of Object.entries(fragment.notes)) {
      const pos = placement.notes[key]
      if (!pos || Object.values(n.model.notes).some((old) => sameNote(old, note))) continue
      n.model.notes[key] = note
      n.view.nodes[key] = { ...pos, collapsed: false }
    }
  }
}
```

- [ ] **Step 4: Verifica che passi, insieme ai test dell'import DDL**

Run: `pnpm vitest run src/editor/commands/`
Expected: PASS, 65 test

- [ ] **Step 5: Commit**

```bash
git add src/editor/commands/import-mermaid.ts src/editor/commands/import-mermaid.test.ts
git commit -m "feat(import-mermaid): il comando delle classi, l'esito per classe e la disposizione con ELK"
```

---

### Task 6: Analisi, dialog ed e2e

Il ramo `class` di `analyseMermaid` e il dialog vanno insieme: con il solo ramo nuovo, `MermaidAnalysis` diventa un'unione che il dialog di oggi non compila (`Property 'entities' does not exist on type 'ClassFragment'`).

**Files:**
- Modify: `src/io/mermaid/analyse.ts`
- Modify: `src/ui/import/ImportMermaidDialog.tsx`
- Modify: `scripts/e2e/import-mermaid.mjs`
- Test: `src/io/mermaid/analyse.test.ts`

**Interfaces:**
- Consumes: `parseClass` (Task 1), `mapClass`, `ClassFragment` (Task 2); `classImportFates`, `selectClassFragment`, `placeClassImport`, `importMermaidClass` (Task 5); quelli ER già usati.
- Produces: `MermaidAnalysis` con il caso `{ ok: true; kind: "class"; fragment: ClassFragment }`. Il dialog resta uno: `importFates`, `counts`, `prepareImport` e `summary` distinguono le famiglie su `kind`, e il componente non ha rami per famiglia salvo il nome («entità»/«classi») e il conteggio delle note.

- [ ] **Step 1: Aggiorna il test dell'analisi**

`src/io/mermaid/analyse.test.ts`, intero. Il caso «classDiagram rifiutato» diventa un caso accettato; resta rifiutato il flowchart:

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

  it("restituisce il frammento delle classi, con lo stesso ordine degli avvisi", () => {
    const result = analyseMermaid("classDiagram\n  direction LR\n  class A[\"Etichetta\"]\n")
    expect(result).toMatchObject({ ok: true, kind: "class" })
    expect(result.ok && result.fragment.warnings.map((w) => w.message.split(":")[0])).toEqual([
      "Direzione ignorata",
      "Etichette delle classi scartate, il nome resta l'id",
    ])
  })

  it("rifiuta testo vuoto, tipi sconosciuti e il flowchart, non ancora supportato", () => {
    expect(analyseMermaid("  ")).toEqual({ ok: false, message: "Il testo è vuoto.", at: null })
    expect(analyseMermaid("sequenceDiagram")).toMatchObject({ ok: false, at: null })
    expect(analyseMermaid("flowchart LR\n  A --> B")).toMatchObject({ ok: false, at: null })
  })

  it("trasforma un errore di sintassi in un esito con l'offset", () => {
    expect(analyseMermaid("erDiagram\n  A {\n")).toEqual({ ok: false, message: "Blocco «{» senza «}»", at: 14 })
    expect(analyseMermaid("classDiagram\n  class A {\n")).toEqual({ ok: false, message: "Blocco «{» senza «}»", at: 23 })
  })
})
```

- [ ] **Step 2: Scrivi i passi e2e**

```diff
diff --git a/scripts/e2e/import-mermaid.mjs b/scripts/e2e/import-mermaid.mjs
index 1aa421f..5f8eeb0 100644
--- a/scripts/e2e/import-mermaid.mjs
+++ b/scripts/e2e/import-mermaid.mjs
@@ -1,6 +1,6 @@
 /**
- * End-to-end dell'import Mermaid ER: incolla → analizza → importa → re-importa senza duplicare →
- * annulla. Copre quello che i test unitari non vedono: la voce di menu, l'incollata vera, la
+ * End-to-end dell'import Mermaid, ER e classi: incolla → analizza → importa → re-importa senza
+ * duplicare → annulla. Copre quello che i test unitari non vedono: la voce di menu, l'incollata vera, la
  * disposizione col worker di ELK sulla build di produzione e il selettore dei blocchi di un `.md`.
  *
  * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/import-mermaid.mjs`.
@@ -18,7 +18,21 @@ const ER = `erDiagram
   style CLIENTE fill:#f9f
 `
 
-const MARKDOWN = "# Note\n\n```mermaid\nclassDiagram\n  A\n```\n\n```mermaid\n" + ER + "```\n"
+const CLASSES = `classDiagram
+  Forma <|.. Quadrato
+  Disegno "1" *-- "0..*" Forma : contiene
+  class Forma {
+    <<interface>>
+    +area() double
+  }
+  class Quadrato {
+    -Map~string, List~int~~ cache
+  }
+  note for Quadrato "lato #gt; 0"
+  direction LR
+`
+
+const MARKDOWN = "# Note\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```mermaid\n" + ER + "```\n"
 
 /** Apre «Importa Mermaid…» e aspetta il dialog, per la stessa ragione di `openImportDialog` in import.mjs. */
 async function openDialog(page) {
@@ -45,6 +59,7 @@ async function closeDialog(page) {
 }
 
 const edgeCount = (page) => page.evaluate(() => document.querySelectorAll("[data-edge-id]").length)
+const classEdgeCount = (page) => page.evaluate(() => document.querySelectorAll('[data-edge-id^="class/"]').length)
 
 /** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
 export async function run(browser, base) {
@@ -106,7 +121,7 @@ export async function run(browser, base) {
     await step("in un .md sceglie il blocco ER e spiega quello che non si importa", async () => {
       await openDialog(page)
       await paste(page, MARKDOWN)
-      await expectText(page, "[data-import-error]", "Per ora si importa solo erDiagram")
+      await expectText(page, "[data-import-error]", "Per ora si importano erDiagram e classDiagram")
       await page.locator("[data-import-blocks]").getByText("Blocco 2 · ER").click()
       await expectText(page, "[data-import-summary]", "3 entità")
       await closeDialog(page)
@@ -118,6 +133,42 @@ export async function run(browser, base) {
       await expectText(page, "[data-import-error]", "Riga 2: Blocco «{» senza «}»")
       await closeDialog(page)
     })
+
+    await step("analizza il classDiagram incollato, con l'avviso sulla direzione", async () => {
+      await openDialog(page)
+      await paste(page, CLASSES)
+      await expectText(page, "[data-import-summary]", "3 classi, 2 relazioni, 1 note")
+      await expectText(page, "[data-import-warnings]", "1 avvisi")
+    })
+
+    await step("importa tre classi, due relazioni e la nota ancorata", async () => {
+      await page.getByRole("button", { name: /^Importa 3 classi$/ }).click()
+      await page.waitForSelector("[data-import-mermaid-dialog] strong")
+      await expectText(page, "[data-import-mermaid-dialog]", "con 1 note")
+      await closeDialog(page)
+      await expectNodes(page, 4)
+      const edges = await classEdgeCount(page)
+      if (edges !== 2) throw new Error(`attese 2 relazioni, trovate ${edges}`)
+    })
+
+    await step("il re-import delle classi non duplica relazioni né note", async () => {
+      await openDialog(page)
+      await paste(page, CLASSES)
+      await expectText(page, "[data-import-mermaid-dialog]", "identica, saltata")
+      await page.getByRole("checkbox").first().click()
+      await page.getByRole("button", { name: /^Importa 1 classi$/ }).click()
+      await page.waitForSelector("[data-import-mermaid-dialog] strong")
+      await closeDialog(page)
+      await expectNodes(page, 4)
+      const edges = await classEdgeCount(page)
+      if (edges !== 2) throw new Error(`attese 2 relazioni, trovate ${edges}`)
+    })
+
+    await step("annulla con ⌘Z il re-import e poi l'import delle classi", async () => {
+      await page.keyboard.press("ControlOrMeta+z")
+      await page.keyboard.press("ControlOrMeta+z")
+      await expectNodes(page, 0)
+    })
   } catch (e) {
     failed = true
     console.error("\nFALLITO:", e)
```

Il primo blocco del Markdown diventa un `flowchart`: un `classDiagram` ora si importa, e il passo vuole un blocco che non si importa ancora.

- [ ] **Step 3: Verifica che falliscano**

Run: `pnpm vitest run src/io/mermaid/analyse.test.ts`
Expected: FAIL su «restituisce il frammento delle classi» e sull'errore di sintassi del `classDiagram`: l'esito è ancora «Per ora si importa solo erDiagram…», senza offset

Run: `pnpm build && node scripts/e2e/import-mermaid.mjs`
Expected: FAIL al passo «in un .md sceglie il blocco ER…», sul messaggio del primo blocco

- [ ] **Step 4: Scrivi l'analisi**

`src/io/mermaid/analyse.ts`, intero. Il ramo segnato `ponytail:` per `class` sparisce; quello del flowchart resta, col messaggio aggiornato:

```ts
import { mapClass, type ClassFragment } from "./class-map"
import { parseClass } from "./class-parse"
import { detect, MermaidSyntaxError } from "./common"
import { mapEr, type ErFragment } from "./er-map"
import { parseEr } from "./er-parse"

export type MermaidAnalysis =
  | { ok: true; kind: "er"; fragment: ErFragment }
  | { ok: true; kind: "class"; fragment: ClassFragment }
  /** `at` è l'offset nel testo analizzato, quando l'errore ne ha uno. */
  | { ok: false; message: string; at: number | null }

/** Parse e map della famiglia: gli avvisi del parser precedono quelli del map. */
function analyseKind(kind: "er" | "class", text: string): MermaidAnalysis {
  if (kind === "er") {
    const { ast, warnings } = parseEr(text)
    const fragment = mapEr(ast, text)
    return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
  }
  const { ast, warnings } = parseClass(text)
  const fragment = mapClass(ast, text)
  return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
}

/**
 * Dal testo di un blocco al frammento da importare: rilevamento, parse e map, sincroni (spec §3.2).
 * Un errore strutturale non lancia: torna come esito.
 */
export function analyseMermaid(text: string): MermaidAnalysis {
  const kind = detect(text)
  if (kind === null) return { ok: false, message: "Il testo è vuoto.", at: null }
  if (typeof kind === "object") return { ok: false, message: `«${kind.unknown}» non si importa: solo erDiagram, classDiagram e flowchart.`, at: null }
  // ponytail: il flowchart ha il suo piano; finché non arriva, qui si ferma con un messaggio.
  if (kind === "flow") return { ok: false, message: "Per ora si importano erDiagram e classDiagram: il flowchart arriverà.", at: null }
  try {
    return analyseKind(kind, text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { ok: false, message: e.message, at: e.at }
    throw e
  }
}
```

- [ ] **Step 5: Estendi il dialog**

```diff
diff --git a/src/ui/import/ImportMermaidDialog.tsx b/src/ui/import/ImportMermaidDialog.tsx
index f4fab29..8b456f2 100644
--- a/src/ui/import/ImportMermaidDialog.tsx
+++ b/src/ui/import/ImportMermaidDialog.tsx
@@ -4,19 +4,31 @@ import { Button } from "@/components/ui/button"
 import { Checkbox } from "@/components/ui/checkbox"
 import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
 import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
-import { erImportFates, importMermaidEr, placeErImport, selectErFragment, type ImportFate } from "@/editor/commands/import-mermaid"
-import { documentStore } from "@/editor/document-store"
+import { classDiagram } from "@/editor/class-access"
+import {
+  classImportFates, erImportFates, importMermaidClass, importMermaidEr, placeClassImport, placeErImport, selectClassFragment,
+  selectErFragment, type ImportFate,
+} from "@/editor/commands/import-mermaid"
+import { documentStore, type Recipe } from "@/editor/document-store"
 import { erDiagram } from "@/editor/er-access"
+import { noteDiagram } from "@/editor/note-access"
 import { layoutEngine } from "@/io/app-io"
 import { documentSession } from "@/io/document-session"
 import { analyseMermaid, type MermaidAnalysis } from "@/io/mermaid/analyse"
 import { blocks, detect, lineOf, type MermaidBlock } from "@/io/mermaid/common"
+import type { DevDocument } from "@/model/document"
+import type { LayoutGraph } from "@/model/layout"
 
 type Stage =
   | { kind: "vuoto" }
   | { kind: "analizzato"; block: MermaidBlock; result: MermaidAnalysis }
   | { kind: "importa" }
-  | { kind: "fatto"; entities: number; relationships: number; warnings: string[] }
+  | { kind: "fatto"; family: Family; elements: number; relations: number; notes: number; warnings: string[] }
+
+type Ready = Extract<MermaidAnalysis, { ok: true }>
+type Family = Ready["kind"]
+
+const NOUN: Record<Family, string> = { er: "entità", class: "classi" }
 
 const FATE_LABEL: Record<ImportFate, string> = { nuovo: "nuova", sostituisce: "già presente, verrà sostituita", identico: "identica, saltata" }
 
@@ -27,6 +39,40 @@ function blockLabel(block: MermaidBlock, index: number): string {
   return `Blocco ${index + 1} · ${name}`
 }
 
+function importFates(doc: DevDocument, ready: Ready): Record<string, ImportFate> {
+  return ready.kind === "er" ? erImportFates(doc, ready.fragment.entities) : classImportFates(doc, ready.fragment.classes)
+}
+
+/** Relazioni e note presenti nella famiglia: la differenza prima/dopo il dispatch dice quante ne sono entrate davvero. */
+function counts(doc: DevDocument, family: Family): { relations: number; notes: number } {
+  if (family === "er") return { relations: Object.keys(erDiagram(doc).model.relationships).length, notes: 0 }
+  return { relations: Object.keys(classDiagram(doc).model.relations).length, notes: Object.keys(noteDiagram(doc).model.notes).length }
+}
+
+/** Selezione, disposizione e comando della famiglia: ciò che resta da fare è il dispatch. */
+async function prepareImport(
+  ready: Ready, doc: DevDocument, chosen: ReadonlySet<string>,
+): Promise<{ recipe: Recipe; elements: number; fallback: string | null }> {
+  const layout = (g: LayoutGraph) => layoutEngine.layout(g)
+  if (ready.kind === "er") {
+    const present = new Set(Object.keys(erDiagram(doc).model.entities))
+    const { entities, relationships } = selectErFragment(ready.fragment.entities, ready.fragment.relationships, chosen, present)
+    const { positions, fallback } = await placeErImport(doc, entities, relationships, layout)
+    return { recipe: importMermaidEr(entities, relationships, positions), elements: Object.keys(entities).length, fallback }
+  }
+  const present = new Set(Object.keys(classDiagram(doc).model.classes))
+  const fragment = selectClassFragment(ready.fragment.classes, ready.fragment.relations, ready.fragment.notes, chosen, present)
+  const placement = await placeClassImport(doc, fragment, layout)
+  return { recipe: importMermaidClass(fragment, placement), elements: Object.keys(fragment.classes).length, fallback: placement.fallback }
+}
+
+/** I conteggi del riepilogo, prima dell'import. */
+function summary(ready: Ready): string {
+  if (ready.kind === "er") return `${Object.keys(ready.fragment.entities).length} entità, ${ready.fragment.relationships.length} relazioni`
+  const { classes, relations, notes } = ready.fragment
+  return `${Object.keys(classes).length} classi, ${relations.length} relazioni, ${notes.length} note`
+}
+
 /**
  * Import Mermaid (spec §7): gemello di `ImportDdlDialog`. L'analisi è sincrona (spec §3.2), quindi non
  * c'è uno stato «analisi»; lo è anche la disposizione degli elementi nuovi, che passa per il worker di
@@ -48,7 +94,7 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
     const block = all[Math.min(index, all.length - 1)]!
     const result = analyseMermaid(block.text)
     if (result.ok) {
-      const fates = erImportFates(documentStore.getState().doc, result.fragment.entities)
+      const fates = importFates(documentStore.getState().doc, result)
       setChosen(new Set(Object.keys(fates).filter((key) => fates[key] !== "identico")))
     }
     setStage({ kind: "analizzato", block, result })
@@ -78,21 +124,20 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
     // Stessa guardia del DDL: la sola lettura può sopravvenire fra il render e il click.
     if (stage.kind !== "analizzato" || !stage.result.ok || documentSession.getState().readOnly) return
     const gen = ++generation.current
-    const { fragment } = stage.result
-    const before = documentStore.getState().doc
-    const present = new Set(Object.keys(erDiagram(before).model.entities))
-    const { entities, relationships } = selectErFragment(fragment.entities, fragment.relationships, chosen, present)
+    const ready = stage.result
     setStage({ kind: "importa" })
-    const { positions, fallback } = await placeErImport(before, entities, relationships, (g) => layoutEngine.layout(g))
+    const { recipe, elements, fallback } = await prepareImport(ready, documentStore.getState().doc, chosen)
     if (generation.current !== gen || documentSession.getState().readOnly) return
-    const count = () => Object.keys(erDiagram(documentStore.getState().doc).model.relationships).length
-    const relationshipsBefore = count()
-    documentStore.getState().dispatch(importMermaidEr(entities, relationships, positions))
+    const before = counts(documentStore.getState().doc, ready.kind)
+    documentStore.getState().dispatch(recipe)
+    const after = counts(documentStore.getState().doc, ready.kind)
     setStage({
       kind: "fatto",
-      entities: Object.keys(entities).length,
-      relationships: count() - relationshipsBefore,
-      warnings: [...fragment.warnings.map((w) => w.message), ...(fallback ? [fallback] : [])],
+      family: ready.kind,
+      elements,
+      relations: after.relations - before.relations,
+      notes: after.notes - before.notes,
+      warnings: [...ready.fragment.warnings.map((w) => w.message), ...(fallback ? [fallback] : [])],
     })
   }
 
@@ -117,7 +162,7 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
   }
 
   const ready = stage.kind === "analizzato" && stage.result.ok ? stage.result : null
-  const fates = ready ? erImportFates(doc, ready.fragment.entities) : {}
+  const fates = ready ? importFates(doc, ready) : {}
   /** La riga nel testo intero, non nel blocco: è quella che l'utente vede nel textarea. */
   const lineInText = (block: MermaidBlock, at: number) => lineOf(text, block.offset + at)
 
@@ -127,15 +172,16 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
         <DialogHeader>
           <DialogTitle>Importa Mermaid</DialogTitle>
           <DialogDescription>
-            Incolla o carica un erDiagram, anche dentro un file Markdown: le entità scelte entrano nel diagramma aperto, in
-            un solo passo annullabile.
+            Incolla o carica un erDiagram o un classDiagram, anche dentro un file Markdown: gli elementi scelti entrano nel
+            diagramma aperto, in un solo passo annullabile.
           </DialogDescription>
         </DialogHeader>
 
         {stage.kind === "fatto" ? (
           <div className="min-h-0 flex-1 space-y-3 overflow-auto text-sm">
             <p>
-              Importate <strong>{stage.entities}</strong> entità e <strong>{stage.relationships}</strong> relazioni.
+              Importate <strong>{stage.elements}</strong> {NOUN[stage.family]} e <strong>{stage.relations}</strong> relazioni
+              {stage.family === "class" && <>, con <strong>{stage.notes}</strong> note</>}.
             </p>
             {stage.warnings.length > 0 && (
               <details open data-import-warnings>
@@ -153,7 +199,7 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
               value={text}
               onChange={(e) => setText(e.target.value)}
               onPaste={onPaste}
-              placeholder="erDiagram …"
+              placeholder="erDiagram o classDiagram …"
               className="h-32 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
             />
             <div className="flex items-center gap-2">
@@ -189,7 +235,7 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
             {stage.kind === "analizzato" && ready && (
               <>
                 <p className="text-sm text-muted-foreground" data-import-summary>
-                  {Object.keys(ready.fragment.entities).length} entità, {ready.fragment.relationships.length} relazioni
+                  {summary(ready)}
                 </p>
                 {ready.fragment.warnings.length > 0 && (
                   <details data-import-warnings>
@@ -200,7 +246,7 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
                   </details>
                 )}
                 <ul className="space-y-1">
-                  {Object.keys(ready.fragment.entities).map((key) => (
+                  {Object.keys(fates).map((key) => (
                     <li key={key} className="flex items-center gap-2 text-sm">
                       <Checkbox id={`m-${key}`} checked={chosen.has(key)} onCheckedChange={() => toggle(key)} />
                       <label htmlFor={`m-${key}`} className="cursor-pointer font-mono text-xs">{key}</label>
@@ -222,7 +268,7 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
                 </p>
               )}
               <Button onClick={() => void onImport()} disabled={chosen.size === 0 || readOnly}>
-                Importa {chosen.size} entità
+                Importa {chosen.size} {NOUN[ready.kind]}
               </Button>
             </>
           )}
```

- [ ] **Step 6: Verifica che passi**

Run: `pnpm vitest run src/io/mermaid/ && pnpm build && node scripts/e2e/import-mermaid.mjs`
Expected: tutti i test di `src/io/mermaid/` verdi, `tsc` senza errori dentro `pnpm build`, dieci righe `• … ok` ed exit code 0

- [ ] **Step 7: Commit**

```bash
git add src/io/mermaid/analyse.ts src/io/mermaid/analyse.test.ts src/ui/import/ImportMermaidDialog.tsx scripts/e2e/import-mermaid.mjs
git commit -m "feat(import-mermaid): il dialog importa anche i classDiagram"
```

---

### Task 7: README e verifica finale

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Aggiorna il README**

```diff
diff --git a/README.md b/README.md
index d6bc213..2ba7bba 100644
--- a/README.md
+++ b/README.md
@@ -63,11 +63,12 @@ dalle foreign key. Una tabella già presente viene sostituita e resta nella sua
 
 ### Importa un diagramma Mermaid
 
-Da un `erDiagram`, incollato o caricato (anche dentro un file Markdown, scegliendo il blocco), si
-scelgono le entità da importare. Le entità nuove si dispongono da sole sotto il contenuto esistente;
-una già presente viene sostituita e resta nella sua posizione, e re-importare lo stesso testo non
-duplica le relazioni. Stili, alias, commenti e direzione si scartano con un avviso. `classDiagram` e
-`flowchart` non si importano ancora.
+Da un `erDiagram` o un `classDiagram`, incollato o caricato (anche dentro un file Markdown,
+scegliendo il blocco), si scelgono le entità o le classi da importare, e con le classi entrano le
+note. Gli elementi nuovi si dispongono da soli sotto il contenuto esistente; uno già presente viene
+sostituito e resta nella sua posizione, e re-importare lo stesso testo non duplica relazioni e note.
+Stili, alias, etichette, namespace e direzione si scartano con un avviso. `flowchart` non si importa
+ancora.
 
 ### Esporta
 
@@ -120,9 +121,9 @@ Un documento si modifica da una scheda sola: le altre lo mostrano in sola lettur
   va fra virgolette. Le relazioni importate non hanno colonne, come quelle disegnate a mano.
 - **Import DDL**: i vincoli `UNIQUE` su più colonne vengono ignorati, con un avviso. In MySQL un
   `REFERENCES` senza lista di colonne fa scartare l'intero `CREATE TABLE`.
-- **Classi**: i generici annidati escono in Mermaid in forma approssimata, con un avviso. Non ci sono
-  package, classi di associazione, classi annidate, PlantUML, generazione di codice né import da
-  Mermaid o da codice sorgente.
+- **Classi**: i generici annidati escono in Mermaid in forma approssimata, con un avviso; l'import li
+  rilegge giusti. Non ci sono package, classi di associazione, classi annidate, PlantUML,
+  generazione di codice né import da codice sorgente.
 - **Flowchart**:
   - gli archi all'indietro passano sopra i nodi;
   - con le corsie, gli archi si incrociano più che senza;
@@ -177,8 +178,8 @@ ognuno in un contesto di browser separato:
 - **Persistenza**: autosave, salvataggio e riapertura del file, file non valido, seconda scheda in
   sola lettura che prende il controllo (sul percorso `?fallback=1`).
 - **Import DDL**: import di entità e relazione, undo, reimport senza duplicati.
-- **Import Mermaid**: erDiagram incollato e disposto, reimport senza duplicati, undo, blocco scelto
-  in un Markdown, errore con la riga.
+- **Import Mermaid**: erDiagram e classDiagram incollati e disposti, reimport senza duplicati, undo,
+  blocco scelto in un Markdown, errore con la riga.
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

Due note, le stesse del piano ER:
- Se `pnpm lint` segnala centinaia di errori con «multiple candidate TSConfigRootDirs», nel checkout è rimasto un worktree in `.claude/worktrees/`: va rimosso, il codice non c'entra.
- `src/io/ddl/sql-text.test.ts` ha un test di tempi già instabile in CI, fuori da questo piano: se cade solo lui, rilancia il job.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): l'import di classDiagram"
```

---

## Fuori da questo piano

- `flowchart` (spec §4.3): l'ultimo dei tre piani. Toglie il ramo `ponytail:` rimasto in `analyseMermaid`, aggiunge `importMermaidFlow` e il ramo del dialog senza caselle (spec §7). Può riusare `layoutBelow` e `placeInGrid`.
- I punti del §11 che riguardano solo il flowchart: i nomi `@{ shape: … }` e la pipeline di «Disponi» su un `FlowDiagram` temporaneo.
- Una nota ancorata a una classe che c'era già finisce nel blocco nuovo, non accanto alla sua classe (segnato `ponytail:` in `placeClassImport`).
- Una stringa di nota su più righe: la grammatica la ammette, il parser legge una nota per riga (segnato `ponytail:` in `parseClass`). L'export usa `<br>` e non la produce.
