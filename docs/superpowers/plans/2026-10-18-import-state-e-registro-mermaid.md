# Import di stateDiagram e registro dei formati Mermaid: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** portare l'import Mermaid su due registri (formati e import per famiglia) a comportamento invariato, poi importare `stateDiagram`/`stateDiagram-v2` nella famiglia del flusso, note comprese.

**Architecture:** `src/io/mermaid/formats.ts` diventa la sola fonte dei formati (parole d'apertura, nome, famiglia, `analyse`), e `src/ui/import/mermaid-families.tsx` la sola fonte di ciò che il dialog fa per famiglia. Il dialog non nomina più nessuna famiglia. Lo state è un parser scritto a mano (`state-parse.ts` → `StateAst`) più un map (`state-map.ts` → `FlowFragment`), e nei registri è una voce sola. Le note dello state viaggiano in `FlowFragment.notes` e si innestano insieme al flusso, nella stessa Recipe.

**Tech Stack:** TypeScript, React 19, zustand + immer (`documentStore`), vitest (jsdom solo per l'oracolo), Playwright per gli e2e, `mermaid@12.2.0` fra le devDependency.

**Spec:** `docs/superpowers/specs/2026-10-18-import-state-e-registro-mermaid-design.md` (qui «spec»). Decisioni: ADR 0008. Ricerca sulla grammatica: `docs/research/grammatica-state-sequence.md` sul branch `research/grammatica-state-sequence` (`git show origin/research/grammatica-state-sequence:docs/research/grammatica-state-sequence.md`). Lessico: `GLOSSARY.md`.

**Punto di partenza:** `master` a `bb75add` o successivo.

## Global Constraints

- **Retrocompatibilità**: nessun import, export o documento esistente cambia comportamento. Il formato del documento non cambia: nessuna migrazione, `SCHEMA_VERSION` resta 8.
- **Estendibilità**: un formato o una famiglia nuovi sono voci di registro controllate da tsc. Una voce dimenticata, o un `analyse` che torna il frammento di un'altra famiglia, è un errore di compilazione. Niente cast (`as`) nel dialog né nei registri.
- `mermaid` resta **solo** fra le `devDependencies`, a `12.2.0`, e lo importa solo `src/io/mermaid/oracle.test.ts`.
- Parser sincrono sul main thread, senza dipendenze a runtime (spec §4).
- Gli avvisi sono `ParseWarning`, aggregati per categoria con `aggregate` di `common.ts`: il parser segnala la sintassi scartata, il map le perdite semantiche. Un errore strutturale lancia `MermaidSyntaxError` con l'offset.
- Testi visibili in italiano; i testi di oggi del dialog e degli avvisi restano identici carattere per carattere.
- Comandi: `pnpm vitest run <file> --exclude '.claude/**'` (i worktree in `.claude/worktrees` contengono copie dei test), `pnpm exec tsc -b`, `pnpm lint`, `pnpm e2e`.
- Ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **`[*]` dentro un composto e transizioni verso il composto**: `[*] --> X` in `C` e `A --> C` fuori devono dare un solo arco `A → C_start`, e `C_start → X`. Una transizione verso un composto senza `[*]` iniziale si scarta con avviso e non deve lasciare un arco pendente. Test nel Task 5.
2. **Uno stato citato prima alla radice e poi in un composto** (o viceversa): deve diventare un nodo solo, nel composto, come in Mermaid. Il test del Task 5 lo confronta con `getData()` nell'oracolo del Task 7; se Mermaid lo mette alla radice, vince Mermaid e il test segue.
3. **`;` e `#` nelle etichette dello state**: `A --> B : x; y` deve dare l'etichetta intera `x; y` e nessuno stato spurio, `A --> B : a # b` deve dare `a # b`. Test nel Task 3.
4. **Il secondo import dello stesso state** aggiunge di nuovo tutto con chiavi nuove, note comprese, e le àncore delle note puntano ai nodi del secondo import, non del primo. Test nel Task 6.
5. **Il blocco `.md` con un flowchart e uno state**: il selettore deve dire «flowchart» e «state», e passare dall'uno all'altro rianalizza. Test nel Task 7, e2e.

---

### Task 1: Registro dei formati

Il refactor della spec §3.1 e §3.4, a comportamento invariato. Sostituisce `MermaidKind`, `detect` e `analyseKind`.

**Files:**
- Create: `src/io/mermaid/formats.ts`
- Create: `src/io/mermaid/formats.test.ts`
- Modify: `src/io/mermaid/analyse.ts` (tutto il file)
- Modify: `src/io/mermaid/common.ts:3-4` (via `MermaidKind`), `:48-57` (via `detect`)
- Modify: `src/io/mermaid/common.test.ts:33-44` (via il `describe("detect")`, che passa a `formats.test.ts`)
- Modify: `src/ui/import/ImportMermaidDialog.tsx:19,36-41,198-201,234` (solo `blockLabel`, descrizione e placeholder)

**Interfaces:**
- Produces, in `formats.ts`:
  - `interface FragmentByFamily { er: ErFragment; class: ClassFragment; flow: FlowFragment }`
  - `type ImportFamily = keyof FragmentByFamily`
  - `interface MermaidFormatEntry<F extends ImportFamily> { keywords: readonly string[]; label: string; named: string; family: F; analyse(text: string): FragmentByFamily[F] }`. `named` è il formato con l'articolo, per la descrizione del dialog («un erDiagram»).
  - `const MERMAID_FORMATS`, con chiavi `erDiagram`, `classDiagram` e `flowchart`, costruito con un helper `format<F extends ImportFamily>(entry: MermaidFormatEntry<F>): MermaidFormatEntry<F>`. È l'helper che lega `analyse` alla `family`.
  - `type MermaidFormat = keyof typeof MERMAID_FORMATS`
  - `function detectFormat(text: string): MermaidFormat | { unknown: string } | null`
  - `function formatList(conjunction: "e" | "o", pick: (f: MermaidFormat) => string): string`: elenco italiano, `a, b e c`.
- Produces, in `analyse.ts`: `type MermaidReadyOf<F extends ImportFamily> = { ok: true; kind: F; fragment: FragmentByFamily[F] }`, `type MermaidReady = { [F in ImportFamily]: MermaidReadyOf<F> }[ImportFamily]`, `type MermaidAnalysis = MermaidReady | { ok: false; message: string; at: number | null }`. `analyseMermaid(text: string): MermaidAnalysis` mantiene la firma.

- [ ] **Step 1: Scrivi `formats.test.ts` (fallisce)**

```ts
describe("detectFormat", () => {
  it("riconosce i formati dalla prima parola utile, alias compresi", () => {
    expect(detectFormat("%% c\nerDiagram")).toBe("erDiagram")
    expect(detectFormat("---\na: b\n---\nclassDiagram")).toBe("classDiagram")
    expect(detectFormat("graph TD")).toBe("flowchart")
    expect(detectFormat("FLOWCHART LR")).toBe("flowchart")
  })
  it("restituisce la parola sconosciuta, o null sul testo vuoto", () => {
    expect(detectFormat("sequenceDiagram\n  A->>B: x")).toEqual({ unknown: "sequenceDiagram" })
    expect(detectFormat("  \n %% solo commento")).toBeNull()
  })
})

describe("registro dei formati", () => {
  // Un testo minimo per parola d'apertura: la tabella cresce con il registro, il test no.
  const MINIMAL = (keyword: string) => `${keyword}\n`
  it.each(Object.entries(MERMAID_FORMATS).flatMap(([id, f]) => f.keywords.map((k) => [id, k, f.family] as const)))(
    "%s: «%s» si analizza nella famiglia %s", (_, keyword, family) => {
      expect(analyseMermaid(MINIMAL(keyword))).toMatchObject({ ok: true, kind: family })
    })
  it("l'errore sui formati sconosciuti li elenca tutti", () => {
    expect(analyseMermaid("gantt")).toEqual({ ok: false, message: "«gantt» non si importa: solo erDiagram, classDiagram e flowchart.", at: null })
  })
})
```

- [ ] **Step 2:** `pnpm vitest run src/io/mermaid/formats.test.ts --exclude '.claude/**'` → FAIL: `formats.ts` non esiste.

- [ ] **Step 3: Implementa `formats.ts` e riscrivi `analyse.ts`**

Le voci:

| id | `keywords` | `label` | `named` | `family` | `analyse` |
|---|---|---|---|---|---|
| `erDiagram` | `["erDiagram"]` | `ER` | `un erDiagram` | `er` | `parseEr` + `mapEr` |
| `classDiagram` | `["classDiagram"]` | `classi` | `un classDiagram` | `class` | `parseClass` + `mapClass` |
| `flowchart` | `["flowchart", "graph"]` | `flowchart` | `un flowchart` | `flow` | `parseFlow` + `mapFlow` |

`analyse` concatena gli avvisi del parser prima di quelli del map, come fa oggi `analyseKind`. Il confronto delle `keywords` è case-insensitive sulla prima parola di `stripNoise(text)`, come in `detect`. `analyseMermaid` gestisce vuoto, sconosciuto e `MermaidSyntaxError`, come oggi. Il messaggio sconosciuto è `«${word}» non si importa: solo ${formatList("e", (f) => f)}.`. `analyseMermaid` costruisce il `MermaidReady` con una funzione generica `ready<F extends ImportFamily>(entry: MermaidFormatEntry<F>, text: string): MermaidReadyOf<F>`, senza cast.

- [ ] **Step 4: Togli `MermaidKind` e `detect` da `common.ts` e il loro `describe` da `common.test.ts`.** Nel dialog: `blockLabel` usa `detectFormat` e `MERMAID_FORMATS[f].label`; la descrizione diventa `Incolla o carica ${formatList("o", (f) => MERMAID_FORMATS[f].named)}, anche dentro un file Markdown: gli elementi scelti, o il flowchart intero, entrano nel diagramma aperto, in un solo passo annullabile.`; il placeholder diventa `${formatList("o", (f) => f)} …`. Con i tre formati attuali escono i testi di oggi.

- [ ] **Step 5: Verifica**

Run: `pnpm vitest run src/io/mermaid --exclude '.claude/**' && pnpm exec tsc -b && pnpm lint`
Expected: tutto verde. `analyse.test.ts` e `oracle.test.ts` passano **senza modifiche**.

- [ ] **Step 6: Commit** — `refactor(import-mermaid): registro dei formati Mermaid`

---

### Task 2: Registro dell'import per famiglia

Spec §3.2–3.3. Il dialog smette di nominare le famiglie.

**Files:**
- Create: `src/ui/import/mermaid-families.tsx`
- Create: `src/ui/import/mermaid-families.test.tsx`
- Modify: `src/ui/import/ImportMermaidDialog.tsx` (via `NOUN`, `importFates`, `importable`, `counts`, `prepareImport`, `summary` e i rami JSX su `stage.family`)

**Interfaces:**
- Consumes: `ImportFamily`, `FragmentByFamily` (Task 1); `MermaidReadyOf`, `MermaidReady` (Task 1); le funzioni di `src/editor/commands/import-mermaid.ts`, che restano invariate.
- Produces:
  - `interface Tally { relations: number; notes: number; pools: number }`
  - `interface FamilyImport<F extends ImportFamily>`, i cui membri sono:
    - `noun: string`
    - `fates(doc: DevDocument, fr: FragmentByFamily[F]): Record<string, ImportFate>`
    - `importable(fr: FragmentByFamily[F], chosen: ReadonlySet<string>): number`
    - `prepare(doc: DevDocument, fr: FragmentByFamily[F], chosen: ReadonlySet<string>, layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<{ recipe: Recipe; elements: number; fallback: string | null }>`
    - `summary(fr: FragmentByFamily[F]): string`
    - `tally(doc: DevDocument): Tally`
    - `report(elements: number, delta: Tally): ReactNode`
  - `const FAMILY_IMPORTS: { [F in ImportFamily]: FamilyImport<F> }`
  - `interface BoundImport`: gli stessi membri senza il frammento (`fates(doc)`, `importable(chosen)`, `prepare(doc, chosen, layout)`, `summary()`), più `noun`, `tally` e `report`.
  - `function bindImport<F extends ImportFamily>(ready: MermaidReadyOf<F>): BoundImport`. Lega la voce di `FAMILY_IMPORTS[ready.kind]` al frammento: è l'unica funzione generica in `F` che il dialog chiama (spec §10, terzo punto).

- [ ] **Step 1: Scrivi `mermaid-families.test.tsx` (fallisce)**

Un test per famiglia, che fissa i testi di oggi:
- `summary`: `"2 entità, 1 relazioni"`, `"2 classi, 1 relazioni, 1 note"`, `"3 nodi, 2 archi, 1 pool"`.
- `noun`: `entità`, `classi`, `nodi`.
- `report`, renderizzato con `renderToStaticMarkup`:
  - ER: `Importate <strong>2</strong> entità e <strong>1</strong> relazioni.`
  - classi: `Importate <strong>2</strong> classi e <strong>1</strong> relazioni, con <strong>1</strong> note.`
  - flusso: `Importati <strong>3</strong> nodi e <strong>2</strong> archi, con <strong>1</strong> pool.`
- `fates` del flusso: `{}`. `importable` del flusso: il numero dei nodi, anche con `chosen` vuoto.

I frammenti di prova si costruiscono con `analyseMermaid` su un testo breve.

- [ ] **Step 2:** `pnpm vitest run src/ui/import --exclude '.claude/**'` → FAIL.

- [ ] **Step 3: Implementa `mermaid-families.tsx`.** Le tre voci spostano qui, invariati, i corpi di oggi di `importFates`, `importable`, `counts`, `prepareImport` e `summary`, oltre ai due rami JSX dello stage `fatto` (`ImportMermaidDialog.tsx:44-98`, `:207-217`).

- [ ] **Step 4: Riscrivi il dialog sopra `bindImport`.**
  - Lo stage `analizzato` tiene il `BoundImport` accanto al `result`.
  - Lo stage `fatto` diventa `{ kind: "fatto"; report: ReactNode; warnings: string[] }`.
  - Il pulsante è `Importa ${importable(chosen)} ${noun}`.
  - Gli attributi `data-*` e il markup restano uguali.
  - Dopo il refactor `grep -n '"er"\|"class"\|"flow"' src/ui/import/ImportMermaidDialog.tsx` non trova nulla.

- [ ] **Step 5: Verifica**

Run: `pnpm vitest run --exclude '.claude/**' && pnpm exec tsc -b && pnpm lint && pnpm e2e`
Expected: tutto verde. Lo scenario e2e `import-mermaid.mjs` passa **senza modifiche**.

- [ ] **Step 6: Commit** — `refactor(import-mermaid): registro dell'import per famiglia, il dialog non nomina le famiglie`

---

### Task 3: Parser dello state, senza composti né note

Spec §4. Due strati come gli altri formati: questo produce l'AST.

**Files:**
- Create: `src/io/mermaid/state-parse.ts`
- Create: `src/io/mermaid/state-parse.test.ts`
- Create: `src/io/mermaid/state-fixtures.ts`: `STATE_VALID: Readonly<Record<string, string>>`, testi che Mermaid accetta, sul modello di `flow-fixtures.ts`. In questo task: `basic`, `oneLine`, `comments`, `ids`, `labels`, `kinds`, `styled`.
- Modify: `src/io/mermaid/common.ts`. Estrai `stripFrontMatter(text: string): string` da `stripNoise`, che la usa e resta invariata.

**Interfaces:**
- Produces:

```ts
/** Un'estremità di transizione: l'id di uno stato, o `null` per `[*]`. */
export type StateAstEnd = string | null
/** Dove sta una menzione: il composto più interno aperto (`null` = radice) e la regione dentro di lui, da 0. */
export interface StateAstPlace { container: string | null; region: number }
export interface StateAstMention extends StateAstPlace {
  id: string
  /** Una descrizione data da questa menzione: alias di `state "X" as id`, o `id : testo`. */
  description: string | null
  kind: "choice" | "fork" | "join" | null
  at: number
}
export interface StateAstTransition extends StateAstPlace { source: StateAstEnd; target: StateAstEnd; label: string; at: number }
export interface StateAstComposite extends StateAstPlace { id: string; alias: string | null; regions: number; at: number }
export interface StateAstNote { target: string | null; text: string; at: number }
export interface StateAst {
  /** L'ultima `direction` della radice, `TB` se manca. */
  direction: string
  mentions: StateAstMention[]
  transitions: StateAstTransition[]
  composites: StateAstComposite[]
  notes: StateAstNote[]
}
export function parseState(text: string): { ast: StateAst; warnings: ParseWarning[] }
```

`composites` e `notes` restano vuoti fino ai Task 5 e 6; i tipi sono già quelli definitivi.

- [ ] **Step 1: Scrivi `state-parse.test.ts` (fallisce)**, un `it` per regola:
  - **intestazione**: `stateDiagram` e `stateDiagram-v2`, maiuscole e minuscole indifferenti. Senza intestazione, o con un'altra parola → `MermaidSyntaxError` «Il testo non comincia con stateDiagram».
  - **nessun terminatore**: `stateDiagram-v2\n  A --> B C --> D` → 2 transizioni; `stateDiagram-v2 A --> B` → 1.
  - **`[*]`**: `[*] --> A` → `source: null`; `A --> [*]` → `target: null`.
  - **id**: `a.b --> Città` → id `a.b` e `Città`. `A --> B;` → id `B;`. `a-b --> c` → `MermaidSyntaxError` con l'offset di `-`.
  - **etichetta**: `A --> B : x; y` → `label: "x; y"` e solo le menzioni `A` e `B`. `A --> B : a # b %% c` → `a # b %% c`. `A --> B : a:b` → `a:b`. `A --> B : a::b` → errore «"::" in un'etichetta». `A --> B : #59; #quot;x#quot;<br>y` → `; "x"\ny`.
  - **commenti a metà riga**: `A --> B %% coda` → `A → B`, etichetta vuota. `A%%x --> B` → una sola menzione, `A`. Un `#` all'inizio di un token apre un commento fino a fine riga.
  - **descrizioni**: `A : prima`, poi `A : seconda` → due menzioni di `A` con le due descrizioni. `state "Lungo nome" as L` → `description: "Lungo nome"`. `state L : descr` → nessuna menzione: Mermaid perde la descrizione e non crea lo stato.
  - **generi**: `state f <<fork>>`, `state j [[join]]`, `state c <<choice>>` → `kind`.
  - **righe ignorate senza avviso**: `hide empty description`, `scale 350 width`, front-matter, `%%{init: …}%%`.
  - **avvisi del parser**, con i testi esatti:
    - `classDef`, `class`, `style`, `click` e `A:::rosso` → una categoria `style`: «Stili e interazioni scartati (classDef, class, :::, style, click), il diagramma usa i suoi». Il `:::rosso` non entra nell'id.
    - `accTitle: T`, `accDescr: D`, `accDescr { … }` → «Titolo e descrizione di accessibilità scartati».
    - Direzione: un solo avviso se la `direction` finale della radice non è `LR`, anche se manca. Testo: «Direzione ignorata: il flusso si dispone da sinistra a destra». `direction LR` → nessun avviso. Una `direction` dentro un composto non cambia `ast.direction`.

- [ ] **Step 2:** `pnpm vitest run src/io/mermaid/state-parse.test.ts --exclude '.claude/**'` → FAIL.

- [ ] **Step 3: Implementa `parseState`.** È uno scanner a posizione sul testo dopo `stripFrontMatter`, con le regole della ricerca §1.2:
  - **niente `statements()` per `;`**: il `;` dello state è un carattere qualunque;
  - **niente `stripNoise`**: un `%%` dentro un'etichetta è testo.

  I token:
  - spazi e a capo;
  - `%%…` e `#…` a fine riga, quando aprono un token;
  - `[*]`, `-->`, `--`;
  - `:` seguito dal resto della riga;
  - `{`, `}`, `<<…>>`, `[[…]]`, `"…"`;
  - id, cioè `[^:\s\-{]` ripetuto, che si ferma a `%%` e a `:::`.

  Le parole chiave valgono solo all'inizio di un'istruzione. Testi con `decodeEntities` e `<br>` → a capo, come `decode` in `flow-parse.ts`.

- [ ] **Step 4:** stesso comando → PASS. Aggiungi le fixture a `state-fixtures.ts` e un `it.each(Object.entries(STATE_VALID))` che le analizza senza errori.

- [ ] **Step 5: Commit** — `feat(import-mermaid): parser di stateDiagram, stati e transizioni`

---

### Task 4: Map dello state sul flusso, senza composti né note

Spec §5, le righe della radice.

**Files:**
- Create: `src/io/mermaid/state-map.ts`
- Create: `src/io/mermaid/state-map.test.ts`

**Interfaces:**
- Consumes: `StateAst` (Task 3), `FlowFragment` (`flow-map.ts`).
- Produces: `function mapState(ast: StateAst, text: string): FlowFragment`. Le chiavi del frammento:
  - id dello stato per gli stati;
  - `${container ?? "root"}_start` e `_end` per i terminali, come gli id di `getData()`;
  - indice in stringa per gli archi.

- [ ] **Step 1: Scrivi `state-map.test.ts` (fallisce)**, un `it` per riga:
  - `[*] --> A`, `[*] --> B`, `A --> [*]`, `B --> [*]` → un solo `root_start` `{ label: "Inizio", shape: "terminal", lane: null }`, un solo `root_end` «Fine», 4 archi. Un livello senza `[*]` di partenza non ha «Inizio».
  - `A --> B : t` → l'arco `{ source: "A", target: "B", label: "t" }`; senza etichetta, `label: ""`.
  - Stato semplice → `process` con l'id come etichetta. Con `A : prima` e `A : seconda` → etichetta `"prima\nseconda"`. Con `state "Nome" as L` e `L : descr` → `"Nome\ndescr"`.
  - `<<choice>>` → `decision` con etichetta `""`.
  - `<<fork>>` e `<<join>>` → `process` con l'id come etichetta, e un avviso aggregato «Fork e join letti come processo: f, j (righe …)».
  - L'ordine degli avvisi: prima quelli del parser, poi quelli del map, come in `analyse`.

- [ ] **Step 2:** `pnpm vitest run src/io/mermaid/state-map.test.ts --exclude '.claude/**'` → FAIL.

- [ ] **Step 3: Implementa `mapState`.** Le categorie del map stanno in un `StateMapCategory` sul modello di `FlowMapCategory`, con i testi esatti di questo task e dei Task 5 e 6: `forkJoin`, `deep`, `compositeEdge`, `regionMerged`, `floatingNote`. Gli oggetti indicizzati per id nascono con `Object.create(null)`, come in `mapFlow`, perché gli id vengono dal testo.

- [ ] **Step 4:** stesso comando → PASS. **Step 5: Commit** — `feat(import-mermaid): stati e transizioni dello state come flusso`

---

### Task 5: Composti, regioni e transizioni verso i composti

Spec §4 (composti) e §5 (righe da «`state C { … }`» a «`--` alla radice»).

**Files:**
- Modify: `src/io/mermaid/state-parse.ts`, `state-parse.test.ts`, `state-map.ts`, `state-map.test.ts`
- Modify: `src/io/mermaid/state-fixtures.ts`: aggiungi `composite`, `nested`, `regions`, `compositeEdges`, `crossReference`.

- [ ] **Step 1: Test del parser (falliscono)**
  - `state C {` … `}`, `state "Alias" as C {`, `state C { X --> Y }` su una riga e annidati → `composites` con `container`/`region` del genitore. Le menzioni interne hanno `container: "C"`.
  - `--` in un composto → la `region` sale di 1, e `regions` del composto conta le regioni. `--` alla radice → errore «"--" fuori da uno stato composto».
  - `state Due parole {` → errore «Il nome di uno stato composto è una parola sola».
  - `{` non chiusa → errore «Stato composto senza "}"», con l'offset dell'apertura.
  - Un `}` con nessun composto aperto è lo stato `}`, come in Mermaid.

- [ ] **Step 2: Test del map (falliscono)**, un `it` per riga della tabella del §5:
  - un composto di primo livello è un pool. Il nome è l'alias, altrimenti l'id. Gli stati diretti vanno nella corsia implicita con l'id e il nome del pool.
  - un composto figlio di un pool è una corsia del pool, nell'ordine del testo.
  - dal terzo livello gli stati salgono nella corsia antenata, con l'avviso `deep` «Stati composti oltre il secondo livello: gli stati vanno nella corsia antenata: X (riga …)».
  - `[*]` dentro `C` → `C_start`/`C_end` con la `lane` della corsia di `C`.
  - `A --> C` → l'arco `A → C_start`; `C --> B` → `C_end → B`. Senza il terminale giusto l'arco si scarta, con l'avviso `compositeEdge` «Transizioni verso o da uno stato composto senza inizio o fine interni, scartate: A → C (riga …)».
  - regioni `--` in un pool → una corsia per regione, «Regione 1», «Regione 2»…, con id `${pool}#${n}`; i composti figli dentro una regione diventano corsie subito dopo quella regione.
  - regioni in un composto che è già una corsia → fuse nella corsia, con l'avviso `regionMerged` «Regioni concorrenti dentro un composto di secondo livello, fuse nella sua corsia: C (riga …)».
  - uno stato nato in un composto e citato fuori, o il contrario (Review Focus 2) → un nodo solo, nel composto dove compare.

- [ ] **Step 3:** `pnpm vitest run src/io/mermaid/state --exclude '.claude/**'` → FAIL, poi implementa → PASS.

- [ ] **Step 4: Commit** — `feat(import-mermaid): stati composti e regioni come pool e corsie`

---

### Task 6: Note dello state, dal parser all'innesto

Spec §5 (righe delle note) e §6.

**Files:**
- Modify: `src/io/mermaid/state-parse.ts`, `state-parse.test.ts`, `state-map.ts`, `state-map.test.ts`, `state-fixtures.ts` (aggiungi `notes`)
- Modify: `src/io/mermaid/flow-map.ts:11-14`. `FlowFragment` riceve `notes: Note[]`; `mapFlow` torna `notes: []`.
- Modify: `src/editor/commands/import-mermaid.ts:328-412`
- Modify: `src/editor/commands/import-mermaid.test.ts`, con nuovi `describe` in fondo; quelli esistenti non cambiano.
- Modify: `src/ui/import/mermaid-families.tsx` (voce `flow`), `mermaid-families.test.tsx`

**Interfaces:**
- Produces, in `import-mermaid.ts`:
  - `function rekeyFlowKeys(model: FlowModel): { model: FlowModel; keys: ReadonlyMap<string, string> }`: la mappa vecchia → nuova di nodi e pool. `rekeyFlow(model)` diventa `rekeyFlowKeys(model).model`, con firma e test invariati.
  - `function rekeyFlowNotes(notes: readonly Note[], keys: ReadonlyMap<string, string>): Record<string, Note>`: uuid per nota, àncora `flow/<vecchia>` → `flow/<nuova>`.
  - `placeFlowImport(doc, model, layout, notes: Readonly<Record<string, Note>> = {})`: `FlowPlacement` riceve `notes: Record<string, Point>`, vuoto se non ci sono note.
  - `importMermaidFlow(model, placement, notes: Readonly<Record<string, Note>> = {})`: le note si saltano se `sameNote` con una presente, come in `importMermaidClass`.

- [ ] **Step 1: Test del parser e del map (falliscono)**
  - `note right of A : t` e `note left of A : t` → `{ target: "A", text: "t" }`. La nota a blocco `note left of A` … `end note` tiene il testo multiriga, l'indentazione interna e il `;`. Senza `end note` → errore «Nota senza "end note"».
  - Nel map, una nota su uno stato diventa `{ text, anchor: "flow/A" }`. Su un composto diventa `flow/<pool che lo contiene>`.
  - `note "t" as N` → scartata, con l'avviso `floatingNote` «Note flottanti scartate (riga …)».
  - `mapFlow` di un flowchart qualunque → `notes: []`.

- [ ] **Step 2: Test dei comandi (falliscono)**
  - `rekeyFlowKeys` dà uuid nuovi e la mappa li collega. `rekeyFlow` resta uguale.
  - `rekeyFlowNotes` riscrive l'àncora di nodo e quella di pool.
  - `placeFlowImport` con una nota ancorata a un nodo la mette a destra del nodo: `x = nodo.x + larghezza + GUTTER`, `y = nodo.y`. Su un pool la mette a destra del `poolRect`. Una nota senza àncora va sotto il blocco. Si usano `flowNodeRect` e `poolRect` sulle posizioni piazzate.
  - Review Focus 4: due import dello stesso state con nota → 2 note, ognuna ancorata a un nodo del proprio import.
  - Un solo undo toglie nodi, archi, pool e note.

- [ ] **Step 3: Test della voce `flow` (falliscono)**
  - `summary`: `"3 nodi, 2 archi, 1 pool"` senza note, `"3 nodi, 2 archi, 1 pool, 1 note"` con.
  - `report`: con note ` …, con <strong>1</strong> pool e <strong>1</strong> note.`; senza note resta il testo del Task 2.
  - `tally` conta le note del documento.

- [ ] **Step 4:** `pnpm vitest run src/io/mermaid src/editor/commands src/ui/import --exclude '.claude/**'` → FAIL, poi implementa → PASS.

- [ ] **Step 5: Commit** — `feat(import-mermaid): le note dello state come note ancorate al flusso`

---

### Task 7: Lo state nel registro, oracolo, round-trip, linearità, e2e

Spec §3.5 e §7.

**Files:**
- Modify: `src/io/mermaid/formats.ts`: la voce `stateDiagram`. Gli effetti sui testi:
  - l'errore diventa «… solo erDiagram, classDiagram, flowchart e stateDiagram.»;
  - la descrizione del dialog diventa «un erDiagram, un classDiagram, un flowchart o uno stateDiagram»;
  - il placeholder diventa «erDiagram, classDiagram, flowchart o stateDiagram …».
- Modify: `src/io/mermaid/formats.test.ts`, solo il testo atteso dell'errore. Il test che scorre il registro copre da sé `stateDiagram` e `stateDiagram-v2`.
- Modify: `src/io/mermaid/oracle.test.ts`, con un `describe("oracolo Mermaid: stateDiagram")`.
- Create: `src/io/mermaid/state-round-trip.test.ts`
- Modify: `src/io/mermaid/state-parse.test.ts`, con il test di linearità.
- Modify: `scripts/e2e/import-mermaid.mjs`

**Interfaces:**
- Consumes: `parseState`, `mapState`, `STATE_VALID`, `emitFlowMermaid`, `parseFlow`, `mapFlow`.
- La voce: `stateDiagram: format({ keywords: ["stateDiagram", "stateDiagram-v2"], label: "state", named: "uno stateDiagram", family: "flow", analyse: … })`. Nessun altro file del dialog cambia.

- [ ] **Step 1: Test (falliscono)**
  - **Oracolo**, per ogni fixture di `STATE_VALID`:
    - `mermaid.parse` la accetta;
    - con `await mermaid.parse(text)` e poi `getDiagramFromText(text).db.getData()`:
      - i nodi di `getData()`, tolti `note`, `noteGroup`, `divider` e i gruppi (`isGroup`), sono le chiavi dei nostri nodi;
      - il `parentId` di ogni nodo dà la corsia attesa (pool, corsia, o risalita dal terzo livello);
      - gli archi sono i nostri a meno della riscrittura verso `C_start`/`C_end`, con le etichette decodificate (`ﬂ°°` → `&#`, `ﬂ°` → `&`, `¶ß` → `;`).
    - Restano fuori: le fixture con `;` nelle etichette, l'ultima regione (id casuale), `click`, il titolo da front-matter.
  - **Round-trip**: per ogni fixture, `analyseMermaid` → `emitFlowMermaid(fragment.model)` → `mermaid.parse` lo accetta, e `mapFlow(parseFlow(out))` ridà lo stesso modello a meno delle chiavi. Il confronto è su etichette, forme, corsie per nome e archi per etichette degli estremi.
  - **Linearità**: 5.000 stati in catena `s0 --> s1 --> …` con etichette → `ast.transitions.length === 4999` in meno di 2000 ms, come `flow-parse.test.ts:178`.
  - **E2E** in `import-mermaid.mjs`, con lo state del redattore (quello di questa mappa) più una nota e un composto:
    - incolla → riepilogo «N nodi, M archi, 1 pool, 1 note», senza caselle;
    - importa → pool e nota presenti sul canvas;
    - ⌘Z → canvas vuoto;
    - un `.md` con un flowchart e uno state: il selettore mostra «Blocco 1 · flowchart» e «Blocco 2 · state», e cliccando il secondo si rianalizza (Review Focus 5).

- [ ] **Step 2: Aggiungi la voce `stateDiagram`.** Run: `pnpm vitest run --exclude '.claude/**' && pnpm exec tsc -b && pnpm lint && pnpm e2e` → tutto verde.

- [ ] **Step 3: Commit** — `feat(import-mermaid): import di stateDiagram`

---

## Note per chi esegue

- **Ordine**: i Task 1 e 2 sono il refactor e vanno consegnati e verificati per primi (spec §3). Ognuno dei sette task è verde e committabile da solo.
- **Testi fissati nel piano** (miei, la spec li lascia al piano, §10 ultimo punto): i messaggi delle categorie `style`, `forkJoin`, `deep`, `compositeEdge`, `regionMerged`, `floatingNote`, e gli errori del Task 5 e del Task 6.
- **Scelte mie dove la spec tace**, da confermare in review:
  - la posizione delle note ancorate (a destra dell'àncora, `GUTTER` di stacco) invece del grafo di ELK di `placeClassImport`, perché nel flusso le note non devono spostare i nodi dentro le corsie;
  - `state L : descr` imitato da Mermaid, che perde la descrizione;
  - un `}` isolato letto come stato;
  - i test di `detect` spostati in `formats.test.ts`, l'unica modifica a test esistenti nel refactor.
