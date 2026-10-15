# Import Mermaid flowchart: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** importare un `flowchart`/`graph` Mermaid nel documento aperto, pool e corsie compresi, accanto all'import di `erDiagram` e `classDiagram`.

**Architecture:** un parser scritto a mano produce un AST fedele al testo, con catene e `&` già espansi, che `mapFlow` traduce in un `FlowModel` con le chiavi del testo, con le regole della spec §4.3. Il comando `importMermaidFlow`, accanto a `importMermaidClass`, lo innesta con un solo dispatch dopo che `rekeyFlow` gli ha dato chiavi uuid. Nodi, pool e corsie si dispongono con la pipeline di «Disponi» del flowchart (`flowLayoutGraph` → ELK → `placeInLanes`) su un `FlowDiagram` temporaneo con il solo frammento, poi il blocco si trasla sotto il canvas. Il dialog si estende al flowchart, senza caselle.

**Tech Stack:** TypeScript, React 19, zustand + immer (`documentStore`), vitest (jsdom solo per l'oracolo), Playwright per gli e2e, `mermaid@12.2.0` già fra le devDependency.

**Spec:** `docs/superpowers/specs/2026-10-15-import-mermaid-design.md`, §4.3 per la mappatura, §5 per l'innesto (il flowchart si aggiunge sempre, chiavi uuid), §6 per la disposizione, §7 per il dialog (niente caselle, si importa intero). È l'ultimo dei tre piani del §11: riusa `src/io/mermaid/common.ts`, `analyse.ts`, la suite `oracle.test.ts`, `layoutBelow` e `placeInGrid` del piano delle classi (`2026-10-15-import-mermaid-class.md`). La mappatura del flowchart è la issue #6 della mappa.

**Punto di partenza.** `master` a `8de3ee5`, con le PR #13, #14 e #15 già mergiate: l'albero è identico a quello di `fix/import-mermaid-solo-relazioni` (`385ce31`). Senza quelle PR mancano `class-*.ts`, `placeInGrid` e `layoutBelow`, e i diff dei Task 3–5 non si applicano.

**Verifica preliminare.** Il codice di questo piano è stato scritto e fatto girare prima della stesura, su un worktree di quell'albero: 1282 test unitari in tutto (86 nei file toccati da questo piano), l'oracolo `mermaid.parse()` con il confronto sul db di Mermaid per tutte le fixture, `pnpm lint`, `tsc -b` e l'e2e completo sulla build di produzione (100 passi `ok`, quattordici nello scenario dell'import Mermaid, tre del flowchart). Un import vero nel browser, a mano, dà il pool con le sue due corsie e i nodi liberi sopra, come «Disponi». Il piano rigiocato su un worktree pulito di `master` (`8de3ee5`), applicando solo i suoi blocchi nell'ordine dei task, dà gli stessi 15 file, byte per byte.

**Fonti della grammatica.** Il pacchetto installato non contiene i sorgenti, ma le source map di `node_modules/mermaid/dist/chunks/mermaid.core/*.mjs.map` hanno `sourcesContent`: da lì vengono `packages/mermaid/src/diagrams/flowchart/parser/flow.jison` (già compilato da jison: le regole del lexer sono nell'array `rules`), `flowDb.ts` e `rendering-util/rendering-elements/shapes.ts` di `mermaid@12.2.0`. Quello che il parser fa come `flowDb` è annotato nel codice con il nome della funzione di Mermaid (`destructLink`, `addVertex`, `makeUniq`, `subCount`).

**§11, i nomi `@{ shape: … }`.** `flowDb.addVertex` accetta un nome se è minuscolo, senza `_`, e se è una chiave di `shapes` (`shapesDefs`: `shortName`, `aliases` e `internalAliases`, più qualche forma non documentata). Il piano prende, per le cinque figure del modello, **tutti** i nomi che `shapesDefs` dà alla stessa figura, più quelli delle forme fra parentesi che la spec §4.3 manda già sul terminale (`(…)`, `((…))`, `(((…)))`):

| `shape` | Nomi `@{ shape: … }` (mermaid@12.2.0) | Forme fra parentesi (tipo di `flowDb`) |
|---|---|---|
| process | `rect`, `proc`, `process`, `rectangle` | `A`, `A[…]` (`square`) |
| terminal | `stadium`, `terminal`, `pill`, `rounded`, `event`, `circle`, `circ`, `dbl-circ`, `double-circle` | `([…])` `stadium`, `(…)` `round`, `((…))` `circle`, `(((…)))` `doublecircle` |
| decision | `diamond`, `diam`, `decision`, `question` | `{…}` (`diamond`) |
| io | `lean-r`, `lean-right`, `in-out`, `lean-l`, `lean-left`, `out-in` | `[/…/]` `lean_right`, `[\…\]` `lean_left` |
| subprocess | `fr-rect`, `subprocess`, `subproc`, `framed-rectangle`, `subroutine` | `[[…]]` (`subroutine`) |

Ogni altro nome (`cyl`, `hex`, `doc`, `trap-b`…) e ogni altra forma fra parentesi (`[(…)]`, `{{…}}`, `>…]`, `[/…\]`, `[\…/]`, `(-…-)`) è un processo, con l'avviso «Forme senza equivalente» che nomina nodo e forma. La tabella è `SHAPES` in `flow-map.ts` (Task 2). Un nome che Mermaid rifiuta (`Rect`, `lean_right` dentro `@{}`) qui non è un errore: diventa un processo con avviso, perché il parser è più largo della grammatica, mai più stretto sulle fixture valide.

**§11, la pipeline di «Disponi» su un `FlowDiagram` temporaneo.** La pipeline è fatta di tre funzioni pure di `src/editor/flow/layout.ts` che prendono un `FlowDiagram` e non il documento: `flowLayoutGraph(diagram)`, il motore ELK iniettato, `placeInLanes(diagram, positions)`; `placedBounds` dà l'ingombro del blocco, pool compresi. Le accetta qualunque `FlowDiagram`, a due condizioni che il temporaneo di `placeFlowImport` (Task 4) rispetta:

1. ogni nodo ha una voce in `view.nodes`, anche finta (`{ x: 0, y: 0, collapsed: false }`): `flowLayoutGraph` salta i nodi senza vista;
2. ogni pool ha una voce in `view.pools` con `y` uguale al suo indice nel testo: `placeInLanes` impila i pool per `y` e, a parità, per id, e gli id sono uuid, quindi senza quella `y` l'ordine dei pool sarebbe casuale.

`view.lanes` parte vuota: le altezze le calcola `placeInLanes`, mai sotto `LANE_MIN_H`; la larghezza dei pool mai sotto `POOL_MIN_W` (`poolExtent`). Il risultato si trasla con un solo scarto, agganciato alla griglia, sotto tutto ciò che è sul canvas (`originBelow`, l'origine di `placeNew`): nodi e pool insieme, come `applyFlowLayout`. `layoutBelow` non va bene così com'è, perché misura il blocco sui soli nodi mentre i pool sporgono a sinistra di `LANE_MARGIN + POOL_HEADER_W`; il Task 4 ne estrae le due metà (`runEngine` e `originBelow`) e le usa entrambe. Se ELK fallisce, `placeInGrid` dà le posizioni grezze, che passano comunque per `placeInLanes`: il ripiego tiene ogni nodo dentro la sua corsia.

**Il `|` di `flow-mermaid.ts`.** Misurato (Task 3): `mermaid@12.2.0` legge `-->|"a | b"|` come etichetta «a | b», e lo stesso fra virgolette nel testo di un nodo. L'escape `#124;` dell'export quindi non serve a Mermaid; resta, perché toglierlo cambierebbe il testo esportato senza guadagno, e l'import lo decodifica. Cambia solo il commento.

## Global Constraints

- `mermaid` resta **solo** fra le `devDependencies`, a `12.2.0`, e lo importa solo `src/io/mermaid/oracle.test.ts`.
- Parser sul main thread, sincrono, senza dipendenze a runtime (spec §3.1, §3.2).
- Gli avvisi sono `ParseWarning` (`src/io/ddl/schema.ts`), aggregati per categoria con `aggregate` di `common.ts`, con le righe nel messaggio (spec §3.3). Il parser segnala ciò che scarta della sintassi, il map le perdite semantiche.
- Un errore strutturale lancia `MermaidSyntaxError` con l'offset: nessun recupero parziale (spec §3.3).
- I commenti `%%` e il front-matter si ignorano senza avviso (`stripNoise`, spec §3.3).
- Il flowchart **si aggiunge sempre**: nodi, archi, pool e corsie ricevono chiavi nuove (uuid). Re-importare lo stesso flowchart lo duplica (spec §5).
- Il flowchart non ha caselle e si importa intero (spec §7).
- `src/editor` non importa `src/io` (ESLint): il motore di layout arriva come parametro, e il comando prende un `FlowModel`, non il `FlowFragment`.
- Tutto l'import è **un solo dispatch**, annullabile con un solo ⌘Z (spec §5).
- Testi dell'interfaccia e messaggi in italiano.

## Review Focus

Cinque ingressi che la spec non nomina e che un utente incontrerà presto. Ciascuno ha già il suo test nel task indicato.

1. **Più istruzioni sulla stessa riga, separate da `;`** (`graph TD; A-->B; B-->C`), e un `;` o un `|` fra virgolette che invece è testo (`C["x; y"]`, `-->|"a | b"|`). Task 1, e il confronto col db di Mermaid nel Task 3.
2. **Un nodo dichiarato fuori da un subgraph e poi nominato dentro**, o nominato in due corsie: Mermaid lo mette nel subgraph che si chiude per primo. Task 2 (`subgraphs`, «tiene nel primo subgraph…») e Task 3.
3. **`A&B` senza spazi**: per Mermaid è un nodo solo, `A & B` sono due. Task 1 e fixture `ampersand` del Task 3.
4. **Un nodo senza testo o con `@{ label }`, ridichiarato più volte**: vincono l'ultima forma e l'ultima etichetta, come in `addVertex`. Task 2.
5. **ELK che fallisce su un flowchart con pool**: i nodi restano dentro le loro corsie, perché il ripiego passa per `placeInLanes`. Task 4 (`expectLaneInvariant`).

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/io/mermaid/flow-parse.ts` | `flowchart`/`graph` → `FlowAst` + avvisi sintattici; catene e `&` espansi |
| `src/io/mermaid/flow-fixtures.ts` | testi `flowchart` validi, condivisi fra test del parser, del map e oracolo |
| `src/io/mermaid/flow-map.ts` | `FlowAst` → `FlowFragment` (un `FlowModel` con le chiavi del testo; regole della spec §4.3) + avvisi semantici |
| `src/io/mermaid/analyse.ts` | il ramo `flow`, al posto del ramo `ponytail:` «il flowchart arriverà» |
| `src/editor/commands/import-mermaid.ts` | `runEngine` e `originBelow` estratti da `layoutBelow`; `rekeyFlow`, `placeFlowImport`, `importMermaidFlow` |
| `src/ui/import/ImportMermaidDialog.tsx` | il dialog per le tre famiglie, il flowchart senza caselle |
| `scripts/e2e/import-mermaid.mjs` | lo scenario end-to-end, con i passi del flowchart |

File modificati anche: `src/io/mermaid/oracle.test.ts`, `src/io/mermaid/analyse.test.ts`, `src/editor/commands/import-mermaid.test.ts`, `src/io/emit/flow-mermaid.ts` (solo un commento), `README.md`. La voce di menu «Importa Mermaid…», `src/editor/flow/layout.ts` e `scripts/e2e/run.mjs` non cambiano.

**Decisioni prese qui, dove la spec tace** (le vede il revisore, e vanno nella descrizione della PR):

- I nomi `@{ shape: … }` sono tutti gli alias di `shapesDefs` per le cinque figure, più quelli di `(…)`, `((…))` e `(((…)))`, che la spec manda già sul terminale (tabella sopra). La spec nomina solo `stadium`/`terminal`, `rect`/`proc`, `diamond`/`decision`, `lean-r`/`lean-l`/`in-out`, `subproc`/`fr-rect`.
- La **corsia implicita** di un pool (i nodi scritti direttamente nel subgraph di primo livello) sta **in testa**, prima delle corsie figlie, e c'è solo se ha nodi o se il pool non ha figli.
- Un nodo nominato in più subgraph va in quello che si chiude per primo, come `makeUniq` di `flowDb`: dentro un pool e poi in una sua corsia va nella corsia, senza avviso. L'avviso «resta nel primo» c'è solo quando i due subgraph non sono uno dentro l'altro.
- Un subgraph con lo stesso id di uno già chiuso è lo stesso subgraph, come in `flowDb`: i membri si uniscono, valgono titolo e posizione del primo.
- Un subgraph senza id e con un titolo con spazi prende l'id `subGraphN` di `flowDb`, con N il numero di subgraph già chiusi: serve solo all'oracolo.
- La lunghezza della freccia (`--->`, `---->`) si perde senza avviso; `~~~` si scarta senza avviso, come chiede la spec (la riga non dice «con avviso»); `accTitle` e `accDescr` si scartano con avviso, come nelle altre due famiglie.
- L'avviso sulla direzione vale anche per una `direction` interna diversa da `LR`.
- I nodi importati hanno le coordinate di «Disponi» più uno scarto agganciato alla griglia, non ciascuna agganciata: lo stesso di `applyFlowLayout`.
- Un flowchart di soli subgraph vuoti non si importa dal dialog: il pulsante conta i nodi, e a zero resta disabilitato. Il comando lo saprebbe fare (c'è il test).
- Lo scenario e2e del flowchart sta nello stesso `scripts/e2e/import-mermaid.mjs`, come quello delle classi, non in uno script suo come chiede la spec §8.
- Il parser è più largo della grammatica dove non costa: parentesi nel testo non virgolettato, `A[x]&B`, spazi fra un nodo e `@{`, nomi di forma maiuscoli. Mai più stretto sulle fixture valide: lo controlla l'oracolo.

---

### Task 1: Parser `flowchart`

**Files:**
- Create: `src/io/mermaid/flow-parse.ts`
- Create: `src/io/mermaid/flow-fixtures.ts`
- Test: `src/io/mermaid/flow-parse.test.ts`

**Interfaces:**
- Consumes: da `common.ts` `aggregate`, `decodeEntities`, `MermaidSyntaxError`, `stripNoise`, `Finding`; `ParseWarning` da `src/io/ddl/schema.ts`.
- Produces:
  - `interface FlowAstText { text: string; markdown: boolean }`;
  - `interface FlowAstNode { id: string; text: FlowAstText | null; shape: string | null; subgraph: string | null; at: number }` (una menzione; `shape` è il tipo di `flowDb` o il nome di `@{ shape }`);
  - `type FlowAstHead = "point" | "open" | "circle" | "cross"`, `type FlowAstStroke = "normal" | "thick" | "dotted" | "invisible"`;
  - `interface FlowAstEdge { source: string; target: string; head: FlowAstHead; double: boolean; stroke: FlowAstStroke; label: FlowAstText | null; at: number }`;
  - `interface FlowAstSubgraph { id: string; title: FlowAstText | null; parent: string | null; at: number }` (nell'ordine di chiusura);
  - `interface FlowAst { direction: string; nodes: FlowAstNode[]; edges: FlowAstEdge[]; subgraphs: FlowAstSubgraph[] }`;
  - `parseFlow(input: string): { ast: FlowAst; warnings: ParseWarning[] }`;
  - `FLOW_VALID: Readonly<Record<string, string>>` (chiavi: `basic`, `shapes`, `links`, `subgraphs`, `styled`, `ampersand`, `repeatedSubgraph`, `text`).

Note sulla grammatica, per chi legge il codice:
- le istruzioni si separano con l'a capo o con `;`, ma non fra virgolette né dentro parentesi;
- il lexer di jison prova le regole **nell'ordine** e vince la prima che combacia, non la più lunga: per questo `LINKS` prova prima la freccia intera (`-->`) e poi l'inizio di quella con il testo in mezzo (`-- testo -->`), per i tre tratti `-`, `=`, `.`, e infine `~~~`;
- testa e tratto si leggono come `destructLink` di `flowDb`: l'ultimo carattere dà la testa, il primo la seconda testa;
- un `-` dentro un id è un trattino solo se non segue `-`, `>` o `.`; `o` e `x` attaccati a una freccia sono teste (`A--oB`), dentro un id restano lettere (`Ao--oB` è `Ao` → `B`);
- `e1@-->` dà un id all'arco, e `e1@{ … }` dopo un arco con quell'id è la sua animazione, non un nodo.

- [ ] **Step 1: Scrivi le fixture**

`src/io/mermaid/flow-fixtures.ts`:

```ts
/**
 * Testi `flowchart`/`graph` che Mermaid accetta: li leggono i test del parser e la suite oracolo, che
 * controlla che `mermaid.parse()` li accetti davvero e che il suo db abbia gli stessi nodi, archi e
 * subgraph del nostro AST (spec §8). Chi aggiunge un caso valido lo aggiunge qui, così l'oracolo lo vede.
 */
export const FLOW_VALID: Readonly<Record<string, string>> = {
  basic: `flowchart LR
  A[Inizio] --> B{Va bene?}
  B -->|sì| C([Fine])
  B -- no --> D[[Rifai]]
  D --> A
`,
  shapes: `graph TD
  a1(Arrotondato)
  a2((Cerchio))
  a3(((Doppio)))
  a4[/Dato/]
  a5[\\Dato\\]
  a6[(Database)]
  a7{{Esagono}}
  a8>Bandiera]
  a9[/Trapezio\\]
  a10[\\Rovescio/]
  a11(-Ellisse-)
  a12@{ shape: lean-r, label: "Ingresso" }
  a13@{ shape: cyl }
  a14["Testo #quot;citato#quot;<br>a capo"]
`,
  links: `flowchart LR
  A --> B & C --> D
  E ---> F
  G -.-> H
  I ==> J
  K --- L
  M <--> N
  O --o P
  Q --x R
  S ~~~ T
  U -. tratteggiata .-> V
  W == spessa ==> X
  Y e1@--> Z
  e1@{ animate: true }
`,
  subgraphs: `flowchart LR
  inizio --> a
  subgraph p1 [Ufficio]
    a --> b
    subgraph c1 [Contabilità]
      c
    end
    subgraph c2
      d --> e
      subgraph troppo
        f
      end
    end
  end
  subgraph Pool con spazi
    g
  end
  subgraph vuoto
  end
  b --> c1
`,
  styled: `flowchart LR
  A:::rosso --> B
  classDef rosso fill:#f00
  class B rosso
  style A fill:#0f0
  linkStyle 0 stroke:#00f
  click A "https://example.com"
  accTitle: Titolo
  accDescr: Descrizione
`,
  ampersand: `flowchart LR
  A&B --> C
  D & E --> F
`,
  repeatedSubgraph: `flowchart LR
  A --> B
  subgraph s
    A
  end
  subgraph s
    B
  end
`,
  text: `flowchart LR
  A["\`**grassetto**\`"] --> B["fa:fa-car Auto"]
  B -->|"a | b"| C["x; y"]; C --> D
`,
}
```

- [ ] **Step 2: Scrivi i test che falliscono**

`src/io/mermaid/flow-parse.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { MermaidSyntaxError } from "./common"
import { FLOW_VALID } from "./flow-fixtures"
import { parseFlow } from "./flow-parse"

const flow = (body: string) => parseFlow(`flowchart LR\n  ${body}\n`)
const edges = (body: string) => flow(body).ast.edges.map(({ source, target, head, double, stroke, label }) => ({ source, target, head, double, stroke, label }))
const node = (body: string) => flow(body).ast.nodes[0]!
const syntaxError = (text: string): { message: string; at: number } => {
  try {
    parseFlow(text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { message: e.message, at: e.at }
    throw e
  }
  throw new Error("nessun errore")
}

describe("parseFlow: nodi", () => {
  it("legge le forme fra parentesi col tipo di flowDb", () => {
    const shapes = parseFlow(FLOW_VALID.shapes!).ast.nodes.map((n) => [n.id, n.shape])
    expect(shapes).toEqual([
      ["a1", "round"], ["a2", "circle"], ["a3", "doublecircle"], ["a4", "lean_right"], ["a5", "lean_left"], ["a6", "cylinder"],
      ["a7", "hexagon"], ["a8", "odd"], ["a9", "trapezoid"], ["a10", "inv_trapezoid"], ["a11", "ellipse"], ["a12", "lean-r"],
      ["a13", "cyl"], ["a14", "square"],
    ])
  })

  it("legge testo fra virgolette, markdown, entità e <br>", () => {
    expect(node('A["Testo #quot;citato#quot;<br>a capo"]').text).toEqual({ text: 'Testo "citato"\na capo', markdown: false })
    expect(node('A["`**md**`"]').text).toEqual({ text: "**md**", markdown: true })
    expect(node("A[ due parole ]").text).toEqual({ text: "due parole", markdown: false })
    expect(node("A").text).toBeNull()
    expect(node('A["x; y"]').text?.text).toBe("x; y")
  })

  it("legge @{ shape, label } e scarta gli altri attributi con un avviso", () => {
    expect(node('A@{ shape: diam, label: "Va?" }')).toMatchObject({ shape: "diam", text: { text: "Va?" } })
    const { warnings } = flow("A@{ shape: rect, icon: fa:car, pos: t }")
    expect(warnings.map((w) => w.message)).toEqual(["Attributi dei nodi scartati (icon, img, pos, w, h…), restano forma ed etichetta (riga 2)"])
  })

  it("ricorda il subgraph aperto più interno", () => {
    const { ast } = parseFlow("flowchart LR\n  a\n  subgraph p\n    b\n    subgraph c\n      d\n    end\n  end\n")
    expect(ast.nodes.map((n) => [n.id, n.subgraph])).toEqual([["a", null], ["b", "p"], ["d", "c"]])
    expect(ast.subgraphs.map((s) => [s.id, s.parent])).toEqual([["c", "p"], ["p", null]])
  })
})

describe("parseFlow: archi", () => {
  it("espande catene e & in un arco per coppia, nell'ordine di flowDb", () => {
    expect(edges("A --> B & C --> D").map((e) => `${e.source}${e.target}`)).toEqual(["AB", "AC", "BD", "CD"])
    expect(edges("A & B --> C & D").map((e) => `${e.source}${e.target}`)).toEqual(["AC", "AD", "BC", "BD"])
    expect(edges("A&B --> C").map((e) => `${e.source}>${e.target}`)).toEqual(["A&B>C"])
  })

  it("legge testa e tratto con la regola di destructLink", () => {
    const kinds = parseFlow(FLOW_VALID.links!).ast.edges.map((e) => [e.head, e.double, e.stroke])
    expect(kinds).toEqual([
      ["point", false, "normal"], ["point", false, "normal"], ["point", false, "normal"], ["point", false, "normal"],
      ["point", false, "normal"], ["point", false, "dotted"], ["point", false, "thick"], ["open", false, "normal"],
      ["point", true, "normal"], ["circle", false, "normal"], ["cross", false, "normal"], ["open", false, "invisible"],
      ["point", false, "dotted"], ["point", false, "thick"], ["point", false, "normal"],
    ])
  })

  it("legge le etichette fra | e in mezzo alla freccia, con o senza spazi", () => {
    expect(edges("A-->|sì|B")[0]!.label).toEqual({ text: "sì", markdown: false })
    expect(edges('A --> |"a | b"| B')[0]!.label?.text).toBe("a | b")
    expect(edges("A -- due parole --> B")[0]!.label?.text).toBe("due parole")
    expect(edges("A -. t .-> B")[0]).toMatchObject({ stroke: "dotted", label: { text: "t" } })
    expect(edges("A == t ==> B")[0]).toMatchObject({ stroke: "thick", label: { text: "t" } })
    expect(edges("A --> B")[0]!.label).toBeNull()
  })

  it("non scambia per una freccia il trattino di un nome, né per una testa la o di un nome", () => {
    expect(edges("my-node-->B")[0]).toMatchObject({ source: "my-node", target: "B" })
    expect(edges("Ao--oB")[0]).toMatchObject({ source: "Ao", target: "B", head: "circle" })
    expect(edges("order --> other")[0]).toMatchObject({ source: "order", target: "other", head: "point" })
  })

  it("scarta id e animazioni degli archi con un avviso, senza crearne un nodo", () => {
    const { ast, warnings } = flow("A e1@--> B\n  e1@{ animate: true }")
    expect(ast.nodes.map((n) => n.id)).toEqual(["A", "B"])
    expect(warnings.map((w) => w.message)).toEqual(["Id e animazioni degli archi scartati (righe 2, 3)"])
  })
})

describe("parseFlow: il resto", () => {
  it("legge i tre modi di scrivere un subgraph, e dà a quello con spazi l'id di flowDb", () => {
    const { ast } = parseFlow("flowchart LR\n  subgraph a [Uno]\n  end\n  subgraph b[\"Due\"]\n  end\n  subgraph Tre parole\n  end\n  subgraph c\n  end\n")
    expect(ast.subgraphs.map((s) => [s.id, s.title?.text ?? null])).toEqual([["a", "Uno"], ["b", "Due"], ["subGraph2", "Tre parole"], ["c", "c"]])
  })

  it("separa le istruzioni sul ;, e legge `graph` e le direzioni", () => {
    const { ast, warnings } = parseFlow("graph TD; A-->B; B-->C")
    expect(ast.direction).toBe("TD")
    expect(ast.edges).toHaveLength(2)
    expect(warnings.map((w) => w.message)).toEqual(["Direzione ignorata: il flusso si dispone da sinistra a destra (riga 1)"])
    expect(parseFlow("flowchart\n  A").ast.direction).toBe("TB")
    expect(parseFlow("flowchart LR\n  subgraph s\n    direction LR\n  end\n").warnings).toEqual([])
  })

  it("scarta stili, interazioni e accessibilità con un avviso per categoria", () => {
    expect(parseFlow(FLOW_VALID.styled!).warnings.map((w) => w.message)).toEqual([
      "Stili scartati (style, linkStyle, classDef, class, :::), il diagramma usa i suoi (righe 2, 3, 4, 5, 6)",
      "Interazioni scartate (click) (riga 7)",
      "Titolo e descrizione di accessibilità scartati (righe 8, 9)",
    ])
  })

  it("ignora commenti e front-matter senza avviso, e legge gli a capo di Windows", () => {
    const { ast, warnings } = parseFlow("---\ntitle: x\n---\r\nflowchart LR\r\n  %% commento\r\n  A --> B\r\n")
    expect(warnings).toEqual([])
    expect(ast.edges.map((e) => [e.source, e.target])).toEqual([["A", "B"]])
  })

  it("si ferma agli errori strutturali, con l'offset", () => {
    expect(syntaxError("sequenceDiagram\n")).toEqual({ message: "Il testo non comincia con flowchart o graph", at: 0 })
    expect(syntaxError("flowchart LR\n  subgraph s\n  A\n")).toEqual({ message: "Subgraph senza «end»", at: 15 })
    expect(syntaxError("flowchart LR\n  end\n")).toEqual({ message: "«end» senza un subgraph aperto", at: 15 })
    expect(syntaxError("flowchart LR\n  A[x --> B\n")).toEqual({ message: "Forma «[» senza chiusura", at: 16 })
    expect(syntaxError('flowchart LR\n  A["x] --> B\n')).toMatchObject({ message: "Virgolette senza chiusura" })
    expect(syntaxError("flowchart LR\n  A -- testo B\n")).toEqual({ message: "Freccia con testo senza chiusura", at: 16 })
    expect(syntaxError("flowchart LR\n  A -- t ==> B\n")).toMatchObject({ message: "Freccia con testo senza chiusura" })
    expect(syntaxError("flowchart LR\n  A --> B C\n")).toEqual({ message: "Testo inatteso: «C»", at: 22 })
  })

  it("resta lineare su un testo grande", () => {
    const lines = ["flowchart LR", "  subgraph p [Pool]"]
    for (let i = 0; i < 5000; i++) lines.push(`    n${i}["Passo ${i}"] -->|ok| n${i + 1}{"Va?"}`)
    lines.push("  end")
    const started = performance.now()
    const { ast } = parseFlow(lines.join("\n"))
    expect(ast.edges).toHaveLength(5000)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
```

- [ ] **Step 3: Verifica che falliscano**

Run: `pnpm vitest run src/io/mermaid/flow-parse.test.ts`
Expected: FAIL, `Failed to resolve import "./flow-parse"`

- [ ] **Step 4: Scrivi il parser**

`src/io/mermaid/flow-parse.ts`:

```ts
import type { ParseWarning } from "@/io/ddl/schema"
import { aggregate, decodeEntities, MermaidSyntaxError, stripNoise, type Finding } from "./common"

/** Un testo di nodo, di arco o di subgraph, già decodificato. `markdown` se era fra `` "` `` e `` `" ``. */
export interface FlowAstText {
  text: string
  markdown: boolean
}

/**
 * Una menzione di nodo, in una dichiarazione o in un arco: lo stesso id può comparire più volte.
 * `shape` è il tipo come lo scrive `flowDb` (`square`, `round`, `lean_right`…, o il nome di
 * `@{ shape: … }`), `null` se la menzione non ne dà uno. `subgraph` è il subgraph aperto più interno.
 */
export interface FlowAstNode {
  id: string
  text: FlowAstText | null
  shape: string | null
  subgraph: string | null
  at: number
}

export type FlowAstHead = "point" | "open" | "circle" | "cross"
export type FlowAstStroke = "normal" | "thick" | "dotted" | "invisible"

/** Un arco già espanso da catene e `&`: uno per coppia di estremi. */
export interface FlowAstEdge {
  source: string
  target: string
  head: FlowAstHead
  /** Testa anche dal lato della sorgente (`<-->`, `o--o`, `x--x`). */
  double: boolean
  stroke: FlowAstStroke
  label: FlowAstText | null
  at: number
}

/** Un subgraph, nell'ordine in cui si chiude: è l'ordine in cui `flowDb` assegna i nodi. */
export interface FlowAstSubgraph {
  id: string
  title: FlowAstText | null
  parent: string | null
  at: number
}

export interface FlowAst {
  /** La direzione dell'intestazione, `TB` se manca. */
  direction: string
  nodes: FlowAstNode[]
  edges: FlowAstEdge[]
  subgraphs: FlowAstSubgraph[]
}

export interface FlowParseResult {
  ast: FlowAst
  warnings: ParseWarning[]
}

type FlowSyntaxCategory = "style" | "interaction" | "direction" | "accessibility" | "edgeId" | "nodeData"

const MESSAGES: Record<FlowSyntaxCategory, string> = {
  style: "Stili scartati (style, linkStyle, classDef, class, :::), il diagramma usa i suoi",
  interaction: "Interazioni scartate (click)",
  direction: "Direzione ignorata: il flusso si dispone da sinistra a destra",
  accessibility: "Titolo e descrizione di accessibilità scartati",
  edgeId: "Id e animazioni degli archi scartati",
  nodeData: "Attributi dei nodi scartati (icon, img, pos, w, h…), restano forma ed etichetta",
}

/**
 * Le forme fra parentesi del lexer di `mermaid@12.2`, con il tipo che `flowDb` dà al nodo: le aperture
 * più lunghe prima, perché l'alternanza prova nell'ordine. `[/` e `[\` hanno due chiusure ciascuna.
 */
const BRACKETS: readonly [open: string, closers: Readonly<Record<string, string>>][] = [
  ["(((", { ")))": "doublecircle" }],
  ["((", { "))": "circle" }],
  ["([", { "])": "stadium" }],
  ["(-", { "-)": "ellipse" }],
  ["[[", { "]]": "subroutine" }],
  ["[(", { ")]": "cylinder" }],
  ["[/", { "/]": "lean_right", "\\]": "trapezoid" }],
  ["[\\", { "\\]": "lean_left", "/]": "inv_trapezoid" }],
  ["{{", { "}}": "hexagon" }],
  ["(", { ")": "round" }],
  ["[", { "]": "square" }],
  ["{", { "}": "diamond" }],
  [">", { "]": "odd" }],
]

/**
 * Id di nodo: la regola `NODE_STRING` del lexer, senza `"`. Un `-` seguito da `-`, `>` o `.` è già
 * una freccia (`A-->B`, `A-.->B`), non il nome. Il `&` attaccato fa parte del nome, come in Mermaid
 * (`A&B` è un nodo solo): separa i nodi solo dopo uno spazio (`A & B`).
 */
const ID = /(?:[\p{L}\p{N}_!#$%&'*+.?\\/`]|-(?![->.]))+/uy

/**
 * Le frecce del lexer, nell'ordine delle sue regole: per ogni tratto la freccia intera, poi l'inizio
 * di quella con il testo in mezzo (`-- testo -->`). La prima che combacia vince, come in jison.
 */
const LINKS: readonly { full: RegExp; start: RegExp | null; end: RegExp | null }[] = [
  { full: /\s*[xo<]?--+[-xo>]\s*/y, start: /\s*[xo<]?--\s*/y, end: /\s*[xo<]?--+[-xo>]\s*/y },
  { full: /\s*[xo<]?==+[=xo>]\s*/y, start: /\s*[xo<]?==\s*/y, end: /\s*[xo<]?==+[=xo>]\s*/y },
  { full: /\s*[xo<]?-?\.+-[xo>]?\s*/y, start: /\s*[xo<]?-\.\s*/y, end: /\s*[xo<]?-?\.+-[xo>]?\s*/y },
  { full: /\s*~~~+\s*/y, start: null, end: null },
]
const LINK_ID = /\s*([^\s"&@]+)@(?=[^{"])/y
const SPACES = /\s*/y
const AMP = /\s*&\s*/y
const STYLE_CLASS = /:::[\w-]+/y

type Link = Pick<FlowAstEdge, "head" | "double" | "stroke" | "label"> & { id: string | null }

/** Una regex sticky a `pos`: il match, o `null`. */
function stick(re: RegExp, s: string, pos: number): RegExpExecArray | null {
  re.lastIndex = pos
  return re.exec(s)
}

const BR = /<br\s*\/?>/gi

/** Entità e `<br>` di un testo (spec §4.3). */
const decode = (raw: string): string => decodeEntities(raw).replace(BR, "\n")

/** Un testo fra virgolette o fra `` "` `` e `` `" ``, già letto fino alla `"` di chiusura. */
function quoted(inner: string): FlowAstText {
  const markdown = inner.length >= 2 && inner.startsWith("`") && inner.endsWith("`")
  return { text: decode(markdown ? inner.slice(1, -1) : inner), markdown }
}

/** `"…"` a partire da `pos` (spazi ammessi prima): il testo e la posizione dopo la `"`, o `null`. */
function readQuoted(s: string, pos: number, base: number): { text: FlowAstText; end: number } | null {
  const start = stick(SPACES, s, pos)![0].length + pos
  if (s[start] !== '"') return null
  const close = s.indexOf('"', start + 1)
  if (close === -1) throw new MermaidSyntaxError("Virgolette senza chiusura", base + start)
  return { text: quoted(s.slice(start + 1, close)), end: close + 1 }
}

/**
 * Le dichiarazioni del testo: una per riga o separate da `;`, ma un `;` o un a capo fra virgolette o
 * dentro parentesi non separano (`A["x; y"]`, un `@{ … }` su più righe).
 */
function statements(text: string): { s: string; at: number }[] {
  const out: { s: string; at: number }[] = []
  let start = 0
  let depth = 0
  let quote = false
  const push = (end: number) => {
    const raw = text.slice(start, end)
    const lead = raw.length - raw.trimStart().length
    if (raw.trim() !== "") out.push({ s: raw.trim(), at: start + lead })
    start = end + 1
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '"') quote = !quote
    else if (quote) continue
    else if (c === "[" || c === "(" || c === "{") depth++
    else if ((c === "]" || c === ")" || c === "}") && depth > 0) depth--
    else if ((c === "\n" || c === ";") && depth === 0) push(i)
  }
  if (quote) throw new MermaidSyntaxError("Virgolette senza chiusura", text.lastIndexOf('"'))
  push(text.length)
  return out
}

/** Testa e tratto di una freccia, con la regola di `destructLink` di `flowDb`. `null` se illeggibile. */
function destruct(end: string, start: string | null): Pick<Link, "head" | "double" | "stroke"> | null {
  const e = end.trim()
  const last = e.slice(-1)
  const head: FlowAstHead = last === ">" ? "point" : last === "o" ? "circle" : last === "x" ? "cross" : "open"
  const opener = { point: "<", circle: "o", cross: "x", open: "" }[head]
  const line = e.startsWith("~") ? "~" : e.replace(/^[xo<]/, "")
  const stroke: FlowAstStroke = line.startsWith("~") ? "invisible" : line.includes(".") ? "dotted" : line.startsWith("=") ? "thick" : "normal"
  if (start === null) return { head, double: opener !== "" && e.startsWith(opener), stroke }
  const s = start.trim()
  const startHead = s[0] === "<" ? "point" : s[0] === "x" ? "cross" : s[0] === "o" ? "circle" : "open"
  const startStroke = s.includes(".") ? "dotted" : s.includes("=") ? "thick" : "normal"
  if (startStroke !== stroke || (startHead !== "open" && startHead !== head)) return null
  return { head, double: startHead !== "open", stroke }
}

/**
 * Legge un `flowchart`/`graph` nell'AST della famiglia (spec §3.3): fedele al testo, nessuna regola
 * di dominio. Le catene e i `&` si espandono qui, un arco per coppia di estremi, come in `flowDb`.
 * Gli avvisi sono i soli costrutti sintattici scartati; un errore strutturale lancia
 * `MermaidSyntaxError` con l'offset.
 */
export function parseFlow(input: string): FlowParseResult {
  const text = stripNoise(input).replace(/\r/g, " ")
  const findings: Finding<FlowSyntaxCategory>[] = []
  const ast: FlowAst = { direction: "TB", nodes: [], edges: [], subgraphs: [] }
  /**
   * I subgraph aperti. Un id assente (titolo con spazi) diventa `subGraphN` alla chiusura, con N il
   * numero di subgraph già chiusi, come `subCount` di `flowDb`: per questo si tengono le menzioni e i
   * figli da aggiornare.
   */
  const open: { sg: FlowAstSubgraph; auto: boolean; members: FlowAstNode[]; children: FlowAstSubgraph[] }[] = []
  const edgeIds = new Set<string>()
  let seenHeader = false

  const current = () => open[open.length - 1]?.sg.id ?? null
  const direction = (value: string, at: number) => {
    if (!/^(LR|>)$/.test(value)) findings.push({ category: "direction", at })
  }

  /** `id`, la forma fra parentesi, `:::classe` e `@{ … }`, a partire da `pos`. */
  const node = (s: string, pos: number, base: number): { node: FlowAstNode | null; end: number } => {
    pos += stick(SPACES, s, pos)![0].length
    const id = stick(ID, s, pos)
    if (!id) throw new MermaidSyntaxError(`Nodo atteso, trovato «${s.slice(pos, pos + 10)}»`, base + pos)
    const mention: FlowAstNode = { id: id[0], text: null, shape: null, subgraph: current(), at: base + pos }
    open[open.length - 1]?.members.push(mention)
    let i = pos + id[0].length
    const bracket = BRACKETS.find(([o]) => s.startsWith(o, i))
    if (bracket) {
      const [o, closers] = bracket
      const q = readQuoted(s, i + o.length, base)
      const from = q ? q.end : i + o.length
      const found = Object.keys(closers)
        .map((c) => [c, s.indexOf(c, from)] as const)
        .filter(([, at]) => at !== -1 && (q === null || s.slice(from, at).trim() === ""))
        .sort((a, b) => a[1] - b[1])[0]
      if (!found) throw new MermaidSyntaxError(`Forma «${o}» senza chiusura`, base + i)
      const [closer, at] = found
      mention.text = q ? q.text : { text: decode(s.slice(from, at).trim()), markdown: false }
      mention.shape = closers[closer]!
      i = at + closer.length
    }
    if (stick(STYLE_CLASS, s, i)) {
      findings.push({ category: "style", at: base + i })
      i = STYLE_CLASS.lastIndex
    }
    const data = stick(/\s*@\{/y, s, i)
    if (data) {
      const close = s.indexOf("}", i + data[0].length)
      if (close === -1) throw new MermaidSyntaxError("«@{» senza «}»", base + i)
      const body = s.slice(i + data[0].length, close)
      i = close + 1
      if (edgeIds.has(mention.id)) {
        findings.push({ category: "edgeId", at: base + pos })
        return { node: null, end: i }
      }
      for (const [, key, value] of body.matchAll(/(\w+)\s*:\s*("[^"]*"|[^,\n]*)/g)) {
        const v = value!.trim().replace(/^"(.*)"$/s, "$1")
        if (key === "shape") mention.shape = v
        else if (key === "label") mention.text = { text: decode(v), markdown: false }
        else findings.push({ category: "nodeData", at: base + pos })
      }
    }
    return { node: mention, end: i }
  }

  /** Nodi separati da `&`. */
  const group = (s: string, pos: number, base: number): { nodes: FlowAstNode[]; end: number } => {
    const nodes: FlowAstNode[] = []
    let i = pos
    for (;;) {
      const n = node(s, i, base)
      if (n.node) nodes.push(n.node)
      i = n.end
      const amp = stick(AMP, s, i)
      if (!amp) return { nodes, end: i }
      i = AMP.lastIndex
    }
  }

  /** Una freccia a partire da `pos`, con l'eventuale id davanti e il testo: in mezzo o fra `|`. */
  const link = (s: string, pos: number, base: number): { link: Link; end: number } | null => {
    let i = pos
    let id: string | null = null
    const named = stick(LINK_ID, s, i)
    if (named) {
      id = named[1]!
      i = LINK_ID.lastIndex
    }
    for (const { full, start, end } of LINKS) {
      const f = stick(full, s, i)
      if (f) {
        const kind = destruct(f[0], null)!
        let label: FlowAstText | null = null
        let after = full.lastIndex
        const pipe = stick(/\s*\|/y, s, after)
        if (pipe) {
          const from = after + pipe[0].length
          const q = readQuoted(s, from, base)
          const close = s.indexOf("|", q ? q.end : from)
          if (close === -1 || (q && s.slice(q.end, close).trim() !== "")) throw new MermaidSyntaxError("Etichetta «|» senza chiusura", base + after)
          label = q ? q.text : { text: decode(s.slice(from, close).trim()), markdown: false }
          after = close + 1
        }
        return { link: { ...kind, label, id }, end: after }
      }
      const st = start && stick(start, s, i)
      if (st) {
        const from = start.lastIndex
        const q = readQuoted(s, from, base)
        let j = q ? q.end : from
        let closing: RegExpExecArray | null = null
        for (; j < s.length; j++) if ((closing = stick(end!, s, j))) break
        if (!closing) throw new MermaidSyntaxError("Freccia con testo senza chiusura", base + i)
        const kind = destruct(closing[0], st[0])
        if (!kind) throw new MermaidSyntaxError("Freccia illeggibile: i due capi non si accordano", base + i)
        const label = q ? q.text : { text: decode(s.slice(from, j).trim()), markdown: false }
        return { link: { ...kind, label, id }, end: end!.lastIndex }
      }
    }
    if (named) throw new MermaidSyntaxError("Id di arco senza la freccia", base + pos)
    return null
  }

  /** Nodi e archi di una dichiarazione: `A --> B & C -->|t| D`. */
  const vertexStatement = (s: string, base: number) => {
    let prev = group(s, 0, base)
    ast.nodes.push(...prev.nodes)
    let i = prev.end
    for (;;) {
      const l = link(s, i, base)
      if (!l) break
      const next = group(s, l.end, base)
      ast.nodes.push(...next.nodes)
      if (l.link.id !== null) {
        edgeIds.add(l.link.id)
        findings.push({ category: "edgeId", at: base + i })
      }
      for (const from of prev.nodes) {
        for (const to of next.nodes) {
          const { head, double, stroke, label } = l.link
          ast.edges.push({ source: from.id, target: to.id, head, double, stroke, label, at: base })
        }
      }
      prev = next
      i = next.end
    }
    if (s.slice(i).trim() !== "") throw new MermaidSyntaxError(`Testo inatteso: «${s.slice(i).trim()}»`, base + i)
  }

  for (const { s, at } of statements(text)) {
    if (!seenHeader) {
      const header = /^(?:graph|flowchart|flowchart-elk)(?:\s+(\S+))?$/i.exec(s)
      if (!header) throw new MermaidSyntaxError("Il testo non comincia con flowchart o graph", at)
      if (header[1] !== undefined) ast.direction = header[1].toUpperCase()
      direction(ast.direction, at)
      seenHeader = true
      continue
    }
    let m: RegExpExecArray | null
    if (/^(style|linkStyle|classDef|class)\s/.test(s)) findings.push({ category: "style", at })
    else if (/^click\s/.test(s)) findings.push({ category: "interaction", at })
    else if ((m = /^direction\s+(\S+)$/.exec(s))) direction(m[1]!, at)
    else if (/^acc(Title|Descr)\s*[:{]/.test(s)) findings.push({ category: "accessibility", at })
    else if (s === "end") {
      const closing = open.pop()
      if (!closing) throw new MermaidSyntaxError("«end» senza un subgraph aperto", at)
      const { sg, auto, members, children } = closing
      if (auto) {
        sg.id = `subGraph${ast.subgraphs.length}`
        for (const m of members) if (m.subgraph === "") m.subgraph = sg.id
        for (const c of children) c.parent = sg.id
      }
      sg.parent = current()
      open[open.length - 1]?.children.push(sg)
      ast.subgraphs.push(sg)
    } else if ((m = /^subgraph(?:\s+(.*))?$/.exec(s))) {
      const rest = (m[1] ?? "").trim()
      const titled = /^([^\s["]+)\s*\[(.*)\]$/s.exec(rest)
      let id: string
      let title: FlowAstText | null
      if (titled) {
        const inner = titled[2]!.trim()
        id = titled[1]!
        title = /^".*"$/s.test(inner) ? quoted(inner.slice(1, -1)) : { text: decode(inner), markdown: false }
      } else {
        title = rest === "" ? null : /^".*"$/s.test(rest) ? quoted(rest.slice(1, -1)) : { text: decode(rest), markdown: false }
        id = title === null || /\s/.test(title.text) ? "" : title.text
      }
      open.push({ sg: { id, title, parent: null, at }, auto: id === "", members: [], children: [] })
    } else vertexStatement(s, at)
  }

  if (!seenHeader) throw new MermaidSyntaxError("Il testo non comincia con flowchart o graph", 0)
  if (open.length > 0) throw new MermaidSyntaxError("Subgraph senza «end»", open[open.length - 1]!.sg.at)
  return { ast, warnings: aggregate(findings, text, MESSAGES) }
}
```

- [ ] **Step 5: Verifica che passino**

Run: `pnpm vitest run src/io/mermaid/flow-parse.test.ts`
Expected: PASS, 15 test

- [ ] **Step 6: Commit**

```bash
git add src/io/mermaid/flow-parse.ts src/io/mermaid/flow-fixtures.ts src/io/mermaid/flow-parse.test.ts
git commit -m "feat(import-mermaid): il parser di flowchart, con catene, & e subgraph"
```

---

### Task 2: Map del flowchart e round-trip

**Files:**
- Create: `src/io/mermaid/flow-map.ts`
- Test: `src/io/mermaid/flow-map.test.ts`
- Test: `src/io/mermaid/flow-round-trip.test.ts`

**Interfaces:**
- Consumes: `FlowAst`, `FlowAstNode`, `FlowAstSubgraph`, `FlowAstText`, `parseFlow`, `FLOW_VALID` (Task 1); `aggregate`, `Finding` da `common.ts`; `FlowModel`, `FlowNode`, `FlowEdge`, `FlowShape`, `Lane`, `Pool` da `src/model/flow/schema.ts`; `emitFlowMermaid` da `src/io/emit/flow-mermaid.ts` (solo nel round-trip).
- Produces:
  - `interface FlowFragment { model: FlowModel; warnings: ParseWarning[] }`, con le chiavi del testo: id dei nodi, id dei subgraph per pool e corsie (la corsia implicita ha l'id del pool), indici `"0"`, `"1"`… per gli archi;
  - `mapFlow(ast: FlowAst, text: string): FlowFragment`.

Le regole, nell'ordine in cui le applica `mapFlow`:
1. un id che è anche l'id di un subgraph non è un nodo;
2. ogni nodo nasce processo con l'id come etichetta; ogni menzione con testo o forma la sovrascrive, l'ultima vince;
3. un nodo va nel subgraph che si chiude per primo fra quelli che lo nominano;
4. i subgraph di primo livello sono pool, i loro figli corsie, i nipoti finiscono nella corsia antenata;
5. gli archi `~~~` si scartano, quelli con un estremo subgraph pure (con avviso); gli altri tengono il verso scritto.

- [ ] **Step 1: Scrivi i test che falliscono**

`src/io/mermaid/flow-map.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { FLOW_VALID } from "./flow-fixtures"
import { mapFlow } from "./flow-map"
import { parseFlow } from "./flow-parse"

const map = (text: string) => mapFlow(parseFlow(text).ast, text)
const flow = (body: string) => map(`flowchart LR\n  ${body}\n`)

describe("mapFlow: nodi", () => {
  it("dà a ogni forma la sua figura, e il processo con avviso alle altre", () => {
    const { model, warnings } = map(FLOW_VALID.shapes!)
    expect(Object.values(model.nodes).map((n) => n.shape)).toEqual([
      "terminal", "terminal", "terminal", "io", "io", "process", "process", "process", "process", "process", "process", "io", "process", "process",
    ])
    expect(warnings.map((w) => w.message)).toEqual([
      "Forme senza equivalente, lette come processo: a6 (cylinder), a7 (hexagon), a8 (odd), a9 (trapezoid), a10 (inv_trapezoid), a11 (ellipse), a13 (cyl) (righe 7, 8, 9, 10, 11, 12, 14)",
    ])
  })

  it("legge i nomi di @{ shape } della spec, alias compresi", () => {
    const names = { stadium: "terminal", terminal: "terminal", rect: "process", proc: "process", diamond: "decision", decision: "decision",
      "lean-r": "io", "lean-l": "io", "in-out": "io", subproc: "subprocess", "fr-rect": "subprocess" }
    for (const [name, shape] of Object.entries(names)) expect([name, flow(`A@{ shape: ${name} }`).model.nodes.A!.shape]).toEqual([name, shape])
  })

  it("prende l'id come etichetta di un nodo senza testo, e tiene l'ultima forma ed etichetta date", () => {
    expect(flow("A --> B").model.nodes.B).toEqual({ label: "B", shape: "process", lane: null })
    expect(flow("A[Uno]\n  A --> B\n  A{Due}").model.nodes.A).toEqual({ label: "Due", shape: "decision", lane: null })
  })

  it("toglie i backtick alle stringhe markdown, con un avviso, e lascia fa:fa- come testo", () => {
    const { model, warnings } = map(FLOW_VALID.text!)
    expect(model.nodes.A!.label).toBe("**grassetto**")
    expect(model.nodes.B!.label).toBe("fa:fa-car Auto")
    expect(warnings.map((w) => w.message)).toEqual(["Stringhe markdown lette come testo semplice (riga 2)"])
  })
})

describe("mapFlow: archi", () => {
  it("tiene il verso scritto, perde stile e teste con un avviso, e scarta ~~~ in silenzio", () => {
    const { model, warnings } = map(FLOW_VALID.links!)
    expect(Object.values(model.edges).map((e) => `${e.source}${e.target}`)).toEqual([
      "AB", "AC", "BD", "CD", "EF", "GH", "IJ", "KL", "MN", "OP", "QR", "UV", "WX", "YZ",
    ])
    expect(warnings.map((w) => w.message)).toEqual([
      "Stile di linea perso (tratteggiata, spessa): l'arco è una linea continua (righe 4, 5, 11, 12)",
      "Archi senza freccia, con cerchio, croce o due teste, letti come una freccia nel verso scritto (righe 6, 7, 8, 9)",
    ])
  })

  it("porta l'etichetta, vuota quando manca", () => {
    expect(Object.values(flow("A -->|sì| B --> C").model.edges).map((e) => e.label)).toEqual(["sì", ""])
  })
})

describe("mapFlow: subgraph", () => {
  const { model, warnings } = map(FLOW_VALID.subgraphs!)

  it("fa dei subgraph di primo livello i pool e dei figli le corsie, con la corsia implicita in testa", () => {
    expect(model.pools).toEqual({
      p1: { name: "Ufficio", lanes: [{ id: "p1", name: "Ufficio" }, { id: "c1", name: "Contabilità" }, { id: "c2", name: "c2" }] },
      subGraph4: { name: "Pool con spazi", lanes: [{ id: "subGraph4", name: "Pool con spazi" }] },
      vuoto: { name: "vuoto", lanes: [{ id: "vuoto", name: "vuoto" }] },
    })
    expect(Object.fromEntries(Object.entries(model.nodes).map(([k, n]) => [k, n.lane]))).toEqual({
      inizio: null, a: "p1", b: "p1", c: "c1", d: "c2", e: "c2", f: "c2", g: "subGraph4",
    })
  })

  it("non dà la corsia implicita a un pool che ha solo figli", () => {
    expect(flow("subgraph p\n    subgraph l\n      A\n    end\n  end").model.pools.p!.lanes).toEqual([{ id: "l", name: "l" }])
  })

  it("avvisa dei livelli in più e scarta gli archi verso un subgraph", () => {
    expect(warnings.map((w) => w.message)).toEqual([
      "Subgraph oltre il secondo livello: i nodi vanno nella corsia antenata: f (riga 10)",
      "Archi da o verso un subgraph scartati: b → c1 (riga 20)",
    ])
    expect(Object.values(model.edges).some((e) => e.target === "c1")).toBe(false)
    expect(model.nodes.c1).toBeUndefined()
  })

  it("unisce i membri di un subgraph ripetuto nel primo, come flowDb", () => {
    const { model } = map(FLOW_VALID.repeatedSubgraph!)
    expect(model.pools).toEqual({ s: { name: "s", lanes: [{ id: "s", name: "s" }] } })
    expect([model.nodes.A!.lane, model.nodes.B!.lane]).toEqual(["s", "s"])
  })

  it("tiene nel primo subgraph un nodo nominato in due fratelli, con avviso; dentro e fuori da una corsia non avvisa", () => {
    const twice = flow("subgraph p\n    A\n  end\n  subgraph q\n    A\n  end")
    expect(twice.model.nodes.A!.lane).toBe("p")
    expect(twice.warnings.map((w) => w.message)).toEqual(["Nodi in più subgraph: restano nel primo: A (riga 6)"])
    const nested = flow("subgraph p\n    A\n    subgraph l\n      A\n    end\n  end")
    expect(nested.model.nodes.A!.lane).toBe("l")
    expect(nested.warnings).toEqual([])
  })
})
```

`src/io/mermaid/flow-round-trip.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { emitFlowMermaid } from "@/io/emit/flow-mermaid"
import type { FlowModel } from "@/model/flow/schema"
import { mapFlow } from "./flow-map"
import { parseFlow } from "./flow-parse"

/**
 * Un modello con solo ciò che Mermaid porta (spec §8): nessuna corsia vuota, che l'export non emette.
 * Le chiavi sono quelle che l'export dà (`n1…`, `p1…`, `l1…`, nodi liberi prima, poi i pool per nome)
 * e gli archi sono indici, come li numera `mapFlow`: così il round-trip si confronta per uguaglianza.
 */
const MODEL: FlowModel = {
  pools: {
    p1: { name: "Ufficio & co", lanes: [{ id: "l1", name: "Front <office>" }, { id: "l2", name: "Back" }] },
  },
  nodes: {
    n1: { label: "Inizio", shape: "terminal", lane: null },
    n2: { label: "Fine", shape: "process", lane: null },
    n3: { label: 'a < b & "c"\nd | e', shape: "io", lane: "l1" },
    n4: { label: "Va?", shape: "decision", lane: "l2" },
    n5: { label: "Sotto", shape: "subprocess", lane: "l2" },
  },
  edges: {
    "0": { source: "n1", target: "n3", label: "" },
    "1": { source: "n3", target: "n4", label: "sì | no" },
    "2": { source: "n4", target: "n5", label: "" },
    "3": { source: "n5", target: "n2", label: "" },
  },
}

describe("round-trip flowchart", () => {
  it("modello → emitFlowMermaid → parseFlow → mapFlow restituisce il modello", () => {
    const { text } = emitFlowMermaid(MODEL)
    const { ast, warnings } = parseFlow(text)
    expect(warnings).toEqual([])
    const fragment = mapFlow(ast, text)
    expect(fragment.warnings).toEqual([])
    expect(fragment.model).toEqual(MODEL)
  })
})
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm vitest run src/io/mermaid/flow-map.test.ts src/io/mermaid/flow-round-trip.test.ts`
Expected: FAIL, `Failed to resolve import "./flow-map"`

- [ ] **Step 3: Scrivi il map**

`src/io/mermaid/flow-map.ts`:

```ts
import type { ParseWarning } from "@/io/ddl/schema"
import type { FlowEdge, FlowModel, FlowNode, FlowShape, Lane, Pool } from "@/model/flow/schema"
import { aggregate, type Finding } from "./common"
import type { FlowAst, FlowAstNode, FlowAstSubgraph, FlowAstText } from "./flow-parse"

/**
 * Un flowchart letto da Mermaid, con le chiavi del testo: id dei nodi e dei subgraph, indici per gli
 * archi. Il comando di import le sostituisce con uuid (spec §5): qui servono solo a tenere insieme i
 * pezzi. La corsia implicita di un pool ha l'id del pool.
 */
export interface FlowFragment {
  model: FlowModel
  warnings: ParseWarning[]
}

type FlowMapCategory = "shape" | "lineStyle" | "head" | "deep" | "twice" | "subgraphEdge" | "markdown"

const MESSAGES: Record<FlowMapCategory, string> = {
  shape: "Forme senza equivalente, lette come processo",
  lineStyle: "Stile di linea perso (tratteggiata, spessa): l'arco è una linea continua",
  head: "Archi senza freccia, con cerchio, croce o due teste, letti come una freccia nel verso scritto",
  deep: "Subgraph oltre il secondo livello: i nodi vanno nella corsia antenata",
  twice: "Nodi in più subgraph: restano nel primo",
  subgraphEdge: "Archi da o verso un subgraph scartati",
  markdown: "Stringhe markdown lette come testo semplice",
}

/**
 * Il tipo di nodo di `flowDb` sulle cinque forme (spec §4.3, §11). Le forme fra parentesi hanno il
 * nome interno del lexer (`square`, `round`, `lean_right`…); i nomi di `@{ shape: … }` sono quelli
 * di `shapesDefs` in `mermaid@12.2.0` (`shortName` e `aliases`), presi per le cinque figure che il
 * modello sa disegnare. Ogni altro nome è un processo, con avviso.
 */
const SHAPES: Readonly<Record<string, FlowShape>> = Object.fromEntries(
  ([
    ["process", ["square", "rect", "proc", "process", "rectangle"]],
    ["terminal", ["round", "stadium", "circle", "doublecircle", "rounded", "event", "terminal", "pill", "circ", "dbl-circ", "double-circle"]],
    ["decision", ["diamond", "diam", "decision", "question"]],
    ["io", ["lean_right", "lean_left", "lean-r", "lean-right", "in-out", "lean-l", "lean-left", "out-in"]],
    ["subprocess", ["subroutine", "fr-rect", "subprocess", "subproc", "framed-rectangle"]],
  ] as const).flatMap(([shape, names]) => names.map((n) => [n, shape])),
)

/**
 * Applica all'AST le regole della spec §4.3 e restituisce un frammento di `FlowModel`. Non vede il
 * documento: chiavi nuove e posizioni le decide il comando di import. `text` serve solo a dire le
 * righe negli avvisi.
 */
export function mapFlow(ast: FlowAst, text: string): FlowFragment {
  const findings: Finding<FlowMapCategory>[] = []
  const label = (t: FlowAstText, at: number): string => {
    if (t.markdown) findings.push({ category: "markdown", at })
    return t.text
  }

  // Un id ripetuto è lo stesso subgraph: vale la prima chiusura, come in `flowDb`.
  const subgraphs = new Map<string, FlowAstSubgraph>()
  for (const sg of ast.subgraphs) if (!subgraphs.has(sg.id)) subgraphs.set(sg.id, sg)
  const chain = (id: string): string[] => {
    const out = [id]
    for (let p = subgraphs.get(id)!.parent; p !== null; p = subgraphs.get(p)!.parent) out.unshift(p)
    return out
  }

  // Ultima forma ed etichetta date vincono, come in `flowDb.addVertex`.
  const nodes: Record<string, FlowNode> = {}
  const shapeOf = new Map<string, { shape: string; at: number }>()
  for (const m of ast.nodes) {
    if (subgraphs.has(m.id)) continue
    const node = (nodes[m.id] ??= { label: m.id, shape: "process", lane: null })
    if (m.text !== null) node.label = label(m.text, m.at)
    if (m.shape !== null) shapeOf.set(m.id, { shape: m.shape, at: m.at })
  }
  for (const [id, { shape, at }] of shapeOf) {
    const known = SHAPES[shape]
    if (known === undefined) findings.push({ category: "shape", at, subject: `${id} (${shape})` })
    nodes[id]!.shape = known ?? "process"
  }

  // Un nodo va nel subgraph che si chiude per primo fra quelli che lo nominano (`makeUniq` di `flowDb`).
  const owner = new Map<string, string>()
  const bySubgraph = new Map<string, FlowAstNode[]>()
  for (const m of ast.nodes) {
    if (m.subgraph === null || !(m.id in nodes)) continue
    if (!bySubgraph.has(m.subgraph)) bySubgraph.set(m.subgraph, [])
    bySubgraph.get(m.subgraph)!.push(m)
  }
  for (const id of subgraphs.keys()) {
    for (const m of bySubgraph.get(id) ?? []) {
      const first = owner.get(m.id)
      if (first === undefined) owner.set(m.id, id)
      else if (!chain(id).includes(first) && !chain(first).includes(id)) findings.push({ category: "twice", at: m.at, subject: m.id })
    }
  }

  const pools: Record<string, Pool> = {}
  const roots = [...subgraphs.values()].filter((sg) => sg.parent === null).sort((a, b) => a.at - b.at)
  const name = (sg: FlowAstSubgraph) => (sg.title === null ? sg.id : label(sg.title, sg.at))
  const owners = new Set(owner.values())
  for (const root of roots) {
    const children = [...subgraphs.values()].filter((sg) => sg.parent === root.id).sort((a, b) => a.at - b.at)
    const direct = owners.has(root.id)
    const lanes: Lane[] = children.map((c) => ({ id: c.id, name: name(c) }))
    if (direct || lanes.length === 0) lanes.unshift({ id: root.id, name: name(root) })
    pools[root.id] = { name: name(root), lanes }
  }
  for (const [id, sg] of owner) {
    const path = chain(sg)
    if (path.length > 2) findings.push({ category: "deep", at: subgraphs.get(sg)!.at, subject: id })
    nodes[id]!.lane = path[Math.min(1, path.length - 1)]!
  }

  const edges: Record<string, FlowEdge> = {}
  for (const e of ast.edges) {
    if (e.stroke === "invisible") continue
    if (subgraphs.has(e.source) || subgraphs.has(e.target)) {
      findings.push({ category: "subgraphEdge", at: e.at, subject: `${e.source} → ${e.target}` })
      continue
    }
    if (e.stroke !== "normal") findings.push({ category: "lineStyle", at: e.at })
    if (e.head !== "point" || e.double) findings.push({ category: "head", at: e.at })
    edges[String(Object.keys(edges).length)] = { source: e.source, target: e.target, label: e.label === null ? "" : label(e.label, e.at) }
  }

  return { model: { pools, nodes, edges }, warnings: aggregate(findings, text, MESSAGES) }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `pnpm vitest run src/io/mermaid/flow-map.test.ts src/io/mermaid/flow-round-trip.test.ts`
Expected: PASS, 12 test

Se il round-trip fallisce solo sulle chiavi, il modello del test non rispetta la numerazione dell'export: prima i nodi liberi in ordine di chiave, poi i pool per nome, dentro le corsie i nodi in ordine di chiave.

- [ ] **Step 5: Commit**

```bash
git add src/io/mermaid/flow-map.ts src/io/mermaid/flow-map.test.ts src/io/mermaid/flow-round-trip.test.ts
git commit -m "feat(import-mermaid): dall'AST del flowchart al FlowModel, con pool, corsie e round-trip"
```

---

### Task 3: Oracolo sul flowchart, e il `|` misurato

**Files:**
- Test: `src/io/mermaid/oracle.test.ts`
- Modify: `src/io/emit/flow-mermaid.ts` (il commento di `escapeLabel`)

**Interfaces:**
- Consumes: `FLOW_VALID`, `parseFlow` (Task 1); `mapFlow` (Task 2); `emitFlowMermaid`; `FlowModel`.
- Produces: niente per gli altri task.

L'oracolo del flowchart fa più di quelli di ER e classi: oltre a `mermaid.parse()`, legge il db di Mermaid con `mermaidAPI.getDiagramFromText` (interno e deprecato, ma qui è solo un confronto, spec §3.1) e controlla che nodi, archi e appartenenza ai subgraph siano gli stessi del nostro AST. `getDiagramFromText` funziona solo dopo un `mermaid.parse()`, che registra i diagrammi: per questo nel test viene dopo `mermaidAccepts`. Il testo dei nodi non si confronta: il db tiene le entità codificate con dei segnaposto.

- [ ] **Step 1: Estendi la suite**

```diff
diff --git a/src/io/mermaid/oracle.test.ts b/src/io/mermaid/oracle.test.ts
index 66452ac..baf4dc3 100644
--- a/src/io/mermaid/oracle.test.ts
+++ b/src/io/mermaid/oracle.test.ts
@@ -3,12 +3,17 @@ import mermaid from "mermaid"
 import { describe, expect, it } from "vitest"
 import { emitClassMermaid } from "@/io/emit/class-mermaid"
 import { emitMermaid } from "@/io/emit/er-mermaid"
+import { emitFlowMermaid } from "@/io/emit/flow-mermaid"
 import type { ClassModel } from "@/model/class/schema"
 import type { ErModel } from "@/model/er/schema"
+import type { FlowModel } from "@/model/flow/schema"
 import { CLASS_VALID } from "./class-fixtures"
 import { parseClass } from "./class-parse"
 import { ER_VALID } from "./er-fixtures"
 import { parseEr } from "./er-parse"
+import { FLOW_VALID } from "./flow-fixtures"
+import { mapFlow } from "./flow-map"
+import { parseFlow } from "./flow-parse"
 
 /**
  * Mermaid stesso come oracolo (spec §8): ciò che il nostro parser accetta come valido lo deve
@@ -65,3 +70,58 @@ describe("oracolo Mermaid: classDiagram", () => {
     expect(await mermaidAccepts(emitClassMermaid(model, notes).text)).toBe(true)
   })
 })
+
+/** Il db di Mermaid per un flowchart: API interna e deprecata, che qui serve solo da confronto (spec §3.1). */
+interface FlowDb {
+  getVertices(): Map<string, { id: string }>
+  getEdges(): { start: string; end: string; text: string }[]
+  getSubGraphs(): { id: string; nodes: string[] }[]
+}
+const flowDb = async (text: string): Promise<FlowDb> => {
+  const api = (mermaid as unknown as { mermaidAPI: { getDiagramFromText(t: string): Promise<{ db: FlowDb }> } }).mermaidAPI
+  return (await api.getDiagramFromText(text)).db
+}
+
+describe("oracolo Mermaid: flowchart", () => {
+  it.each(Object.entries(FLOW_VALID))("la fixture %s piace a entrambi i parser, con gli stessi nodi, archi e subgraph", async (_, text) => {
+    expect(await mermaidAccepts(text)).toBe(true)
+    const { ast } = parseFlow(text)
+    const db = await flowDb(text)
+    const subgraphIds = new Set(db.getSubGraphs().map((s) => s.id))
+    const ours = new Set(ast.nodes.map((n) => n.id).filter((id) => !ast.subgraphs.some((s) => s.id === id)))
+    expect(ours).toEqual(new Set([...db.getVertices().keys()].filter((id) => !subgraphIds.has(id))))
+    expect(ast.edges.map((e) => [e.source, e.target])).toEqual(db.getEdges().map((e) => [e.start, e.end]))
+    // Il nodo di ogni subgraph è il primo che lo nomina in ordine di chiusura, come `makeUniq`.
+    const owner = (id: string) => ast.subgraphs.find((s) => ast.nodes.some((n) => n.id === id && n.subgraph === s.id))?.id
+    for (const sg of db.getSubGraphs()) {
+      for (const id of sg.nodes.filter((n) => !subgraphIds.has(n))) expect([id, owner(id)]).toEqual([id, sg.id])
+    }
+  })
+
+  it("legge un «|» fra virgolette nell'etichetta di un arco come testo, e l'export lo scappa comunque", async () => {
+    const db = await flowDb('flowchart LR\n  A -->|"a | b"| B\n')
+    expect(db.getEdges()[0]!.text).toBe("a | b")
+    const model: FlowModel = {
+      pools: {},
+      nodes: { a: { label: "x | y", shape: "process", lane: null }, b: { label: "b", shape: "decision", lane: null } },
+      edges: { e: { source: "a", target: "b", label: "a | b" } },
+    }
+    const { text } = emitFlowMermaid(model)
+    expect(await mermaidAccepts(text)).toBe(true)
+    expect(mapFlow(parseFlow(text).ast, text).model.edges["0"]!.label).toBe("a | b")
+  })
+
+  it("l'export del flowchart è Mermaid valido, con pool, corsie, entità e a capo", async () => {
+    const model: FlowModel = {
+      pools: { p: { name: "Ufficio", lanes: [{ id: "l1", name: "A & B" }, { id: "l2", name: "Corsia" }] } },
+      nodes: {
+        a: { label: "Inizio", shape: "terminal", lane: null },
+        b: { label: 'a < b & "c"\nd', shape: "io", lane: "l1" },
+        c: { label: "Va?", shape: "decision", lane: "l2" },
+        d: { label: "Sotto", shape: "subprocess", lane: "l2" },
+      },
+      edges: { e1: { source: "a", target: "b", label: "" }, e2: { source: "b", target: "c", label: "sì" }, e3: { source: "c", target: "d", label: "" } },
+    }
+    expect(await mermaidAccepts(emitFlowMermaid(model).text)).toBe(true)
+  })
+})
```

- [ ] **Step 2: Verifica che passi e che l'oracolo distingua**

Run: `pnpm vitest run src/io/mermaid/oracle.test.ts`
Expected: PASS, 25 test

Per controllare che il confronto col db distingua davvero, togli per un momento il `&` dalla classe di caratteri di `ID` in `flow-parse.ts`: il nostro parser legge allora `A&B` come due nodi, e il caso `ampersand` deve fallire sul confronto dei nodi (insieme ai test del Task 1 su `A&B`). Poi rimetti il `&`.

- [ ] **Step 3: Aggiorna il commento sul `|`**

```diff
diff --git a/src/io/emit/flow-mermaid.ts b/src/io/emit/flow-mermaid.ts
index 1b89694..53ceb03 100644
--- a/src/io/emit/flow-mermaid.ts
+++ b/src/io/emit/flow-mermaid.ts
@@ -15,13 +15,10 @@ import type { EmitResult } from "./result"
  * testo va sempre fra virgolette"), non un escape carattere per carattere.
  *
  * `|` invece si scappa come entità (`#124;`), nella stessa lista e nello stesso ordine (dopo `&`,
- * come tutte le altre): il progetto non ha mermaid installato per misurare se il lexer
- * dell'etichetta di un arco (`-->|"…"|`) legge un `|` dentro le virgolette come testo o come il
- * delimitatore che chiude anticipatamente l'etichetta — invece di verificarlo, la domanda si
- * rende superflua: un'entità non contiene mai il carattere delimitatore, quindi l'uscita è valida
- * qualunque cosa faccia quel lexer. Vale anche nel testo di un nodo, dove il `|` non avrebbe
- * bisogno di protezione: una regola sola per tutte le etichette costa meno di un ramo speciale
- * solo per gli archi.
+ * come tutte le altre). Misurato con `mermaid@12.2.0` (`src/io/mermaid/oracle.test.ts`): fra
+ * virgolette il lexer legge `-->|"a | b"|` come etichetta «a | b», quindi l'entità non serve a
+ * Mermaid. Resta perché non costa niente, l'import la decodifica, e togliere una riga dall'escape
+ * cambierebbe il testo esportato di chi lo tiene sotto versione.
  */
 function escapeLabel(text: string): string {
   return text
```

- [ ] **Step 4: Commit**

```bash
git add src/io/mermaid/oracle.test.ts src/io/emit/flow-mermaid.ts
git commit -m "test(import-mermaid): mermaid@12.2 come oracolo del flowchart, col db e col | delle etichette"
```

---

### Task 4: Comando, chiavi nuove e disposizione del flowchart

**Files:**
- Modify: `src/editor/commands/import-mermaid.ts`
- Test: `src/editor/commands/import-mermaid.test.ts`

**Interfaces:**
- Consumes: `flowLayoutGraph`, `placeInLanes`, `placedBounds` da `src/editor/flow/layout.ts`; `flowDiagram` da `src/editor/flow-access.ts`; `placeInGrid`, `GUTTER` da `./import`; `nodeRects` da `../kinds/canvas-ops`; `FlowDiagram`, `FlowModel`, `LaneView`, `PoolView`, `POOL_MIN_W` da `src/model/flow/schema.ts`. Nei test: `withPool` (`../flow/pool-fixture`), `expectLaneInvariant` (`../flow/lane-invariant`), `FlowDiagramSchema`, `LANE_MIN_H`.
- Produces:
  - `rekeyFlow(model: FlowModel): FlowModel`;
  - `interface FlowPlacement { nodes: Record<string, Point>; pools: Record<string, PoolView>; lanes: Record<string, LaneView>; fallback: string | null }`;
  - `placeFlowImport(doc: DevDocument, model: FlowModel, layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<FlowPlacement>`;
  - `importMermaidFlow(model: FlowModel, placement: Pick<FlowPlacement, "nodes" | "pools" | "lanes">): Recipe`.

`layoutBelow` perde il ramo `{ [graph.nodes[0]!.id]: … }`, che con zero nodi (un flowchart di soli pool) leggerebbe fuori dall'array: `runEngine` usa `Object.fromEntries` su tutti i nodi, zero o uno. Il comportamento di ER e classi non cambia, e i loro test non si toccano.

- [ ] **Step 1: Scrivi i test che falliscono**

```diff
diff --git a/src/editor/commands/import-mermaid.test.ts b/src/editor/commands/import-mermaid.test.ts
index 96b37ab..b5d01a3 100644
--- a/src/editor/commands/import-mermaid.test.ts
+++ b/src/editor/commands/import-mermaid.test.ts
@@ -2,15 +2,19 @@ import { beforeEach, describe, expect, it } from "vitest"
 import type { ClassNode, ClassRelation } from "@/model/class/schema"
 import { createDocument } from "@/model/document"
 import type { Entity, Relationship } from "@/model/er/schema"
+import { FlowDiagramSchema, LANE_MIN_H, POOL_MIN_W, type FlowModel } from "@/model/flow/schema"
 import type { LayoutGraph } from "@/model/layout"
 import { classDiagram } from "../class-access"
 import { documentStore } from "../document-store"
 import { erDiagram } from "../er-access"
+import { flowDiagram } from "../flow-access"
+import { expectLaneInvariant } from "../flow/lane-invariant"
+import { withPool } from "../flow/pool-fixture"
 import { noteDiagram } from "../note-access"
 import { importEr } from "./import"
 import {
-  classImportFates, erImportFates, importMermaidClass, importMermaidEr, placeClassImport, placeErImport, sameClassRelation,
-  selectClassFragment, selectErFragment, type ClassImport,
+  classImportFates, erImportFates, importMermaidClass, importMermaidEr, importMermaidFlow, placeClassImport, placeErImport,
+  placeFlowImport, rekeyFlow, sameClassRelation, selectClassFragment, selectErFragment, type ClassImport,
 } from "./import-mermaid"
 
 const entity = (name: string, attributes: string[] = ["id"]): Entity => ({
@@ -261,3 +265,93 @@ describe("placeClassImport", () => {
     expect(placement.fallback).toMatch(/griglia/)
   })
 })
+
+/** Un flowchart come lo produce `mapFlow`: un nodo libero e un pool con la corsia implicita e una figlia. */
+const FLOW: FlowModel = {
+  pools: { p: { name: "Ufficio", lanes: [{ id: "p", name: "Ufficio" }, { id: "c", name: "Conti" }] } },
+  nodes: {
+    a: { label: "Inizio", shape: "terminal", lane: null },
+    b: { label: "Passo", shape: "process", lane: "p" },
+    c: { label: "Va?", shape: "decision", lane: "c" },
+  },
+  edges: { "0": { source: "a", target: "b", label: "" }, "1": { source: "b", target: "c", label: "sì" } },
+}
+
+const flow = () => flowDiagram(doc())
+
+/** Disposizione e innesto come li fa il dialog. */
+async function importFlow(model: FlowModel, layout = fakeLayout): Promise<FlowModel> {
+  const fresh = rekeyFlow(model)
+  documentStore.getState().dispatch(importMermaidFlow(fresh, await placeFlowImport(doc(), fresh, layout)))
+  return fresh
+}
+
+describe("rekeyFlow", () => {
+  it("dà uuid nuovi a nodi, archi, pool e corsie, e tiene i riferimenti", () => {
+    const fresh = rekeyFlow(FLOW)
+    const [pool] = Object.values(fresh.pools)
+    const byLabel = Object.fromEntries(Object.entries(fresh.nodes).map(([key, n]) => [n.label, { key, ...n }]))
+    expect(Object.keys(fresh.nodes).some((k) => k in FLOW.nodes)).toBe(false)
+    expect(pool!.lanes.map((l) => l.name)).toEqual(["Ufficio", "Conti"])
+    expect(byLabel.Passo!.lane).toBe(pool!.lanes[0]!.id)
+    expect(byLabel["Va?"]!.lane).toBe(pool!.lanes[1]!.id)
+    expect(Object.values(fresh.edges).map((e) => [e.source, e.target])).toEqual([
+      [byLabel.Inizio!.key, byLabel.Passo!.key], [byLabel.Passo!.key, byLabel["Va?"]!.key],
+    ])
+  })
+})
+
+describe("placeFlowImport e importMermaidFlow", () => {
+  it("passa per il grafo di «Disponi» e mette nodi e pool sotto il contenuto, con i minimi", async () => {
+    documentStore.getState().load(withPool(createDocument("prova", "doc-1")))
+    const fresh = rekeyFlow(FLOW)
+    const placement = await placeFlowImport(doc(), fresh, async (g) => {
+      expect(g.direction).toBe("RIGHT")
+      expect(g.edges).toHaveLength(2)
+      return fakeLayout(g)
+    })
+    expect(placement.fallback).toBeNull()
+    const [poolKey] = Object.keys(fresh.pools)
+    const pool = placement.pools[poolKey!]!
+    expect(pool.y).toBeGreaterThanOrEqual(160 + 40)
+    expect(pool.w).toBeGreaterThanOrEqual(POOL_MIN_W)
+    expect(Object.values(placement.lanes).every((l) => l.h >= LANE_MIN_H)).toBe(true)
+    expect(Object.keys(placement.nodes).sort()).toEqual(Object.keys(fresh.nodes).sort())
+  })
+
+  it("aggiunge sempre: re-importare lo stesso flowchart lo duplica, e lascia stare ciò che c'era", async () => {
+    documentStore.getState().load(withPool(createDocument("prova", "doc-1")))
+    await importFlow(FLOW)
+    await importFlow(FLOW)
+    expect(Object.keys(flow().model.nodes)).toHaveLength(6)
+    expect(Object.keys(flow().model.edges)).toHaveLength(4)
+    expect(Object.keys(flow().model.pools)).toHaveLength(3)
+    expect(flow().model.pools.p1).toEqual({ name: "Pool 1", lanes: [{ id: "l1", name: "l1" }] })
+    expect(FlowDiagramSchema.safeParse(flow()).success).toBe(true)
+    expectLaneInvariant(flow())
+  })
+
+  it("se il motore fallisce ripiega sulla griglia, con un messaggio, e i nodi restano nelle corsie", async () => {
+    await importFlow(FLOW, async () => {
+      throw new Error("timeout")
+    })
+    expect(Object.keys(flow().view.nodes)).toHaveLength(3)
+    expectLaneInvariant(flow())
+    const fresh = rekeyFlow(FLOW)
+    expect((await placeFlowImport(doc(), fresh, async () => Promise.reject(new Error("x")))).fallback).toMatch(/griglia/)
+  })
+
+  it("importa anche un flowchart di soli pool vuoti", async () => {
+    await importFlow({ pools: { v: { name: "Vuoto", lanes: [{ id: "v", name: "Vuoto" }] } }, nodes: {}, edges: {} })
+    const [pool] = Object.values(flow().view.pools)
+    expect(pool).toMatchObject({ x: 40, y: 40, w: POOL_MIN_W })
+    expect(Object.values(flow().view.lanes)).toEqual([{ h: LANE_MIN_H }])
+  })
+
+  it("si annulla con un solo undo", async () => {
+    await importFlow(FLOW)
+    documentStore.getState().undo()
+    expect(flow().model).toEqual({ pools: {}, nodes: {}, edges: {} })
+    expect(flow().view).toEqual({ nodes: {}, pools: {}, lanes: {} })
+  })
+})
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm vitest run src/editor/commands/import-mermaid.test.ts`
Expected: FAIL, `importMermaidFlow`, `placeFlowImport` e `rekeyFlow` non esportati da `./import-mermaid`

- [ ] **Step 3: Scrivi il comando e la disposizione**

```diff
diff --git a/src/editor/commands/import-mermaid.ts b/src/editor/commands/import-mermaid.ts
index f2b6674..5ee8b69 100644
--- a/src/editor/commands/import-mermaid.ts
+++ b/src/editor/commands/import-mermaid.ts
@@ -2,12 +2,15 @@ import type { ClassDiagram, ClassNode, ClassRelation } from "@/model/class/schem
 import type { DevDocument } from "@/model/document"
 import type { Entity, ErDiagram, Relationship } from "@/model/er/schema"
 import { splitKey } from "@/model/family"
+import { POOL_MIN_W, type FlowDiagram, type FlowModel, type LaneView, type PoolView } from "@/model/flow/schema"
 import type { LayoutGraph, LayoutPositions } from "@/model/layout"
 import type { Note } from "@/model/note/schema"
 import { classLayoutGraph } from "../class/commands"
 import { classDiagram } from "../class-access"
 import type { Recipe } from "../document-store"
 import { erDiagram } from "../er-access"
+import { flowDiagram } from "../flow-access"
+import { flowLayoutGraph, placedBounds, placeInLanes } from "../flow/layout"
 import { rectsBounds, snap, type Point, type Rect } from "../geometry"
 import { nodeRects } from "../kinds/canvas-ops"
 import { nodesBounds } from "../layout-pack"
@@ -111,23 +114,33 @@ export async function placeErImport(
   return { positions, fallback: null }
 }
 
+/** ELK sul grafo; un nodo solo, o nessuno, non passa per il motore. `null` se il motore fallisce. */
+async function runEngine(graph: LayoutGraph, layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<LayoutPositions | null> {
+  try {
+    return graph.nodes.length > 1 ? await layout(graph) : Object.fromEntries(graph.nodes.map((n) => [n.id, { x: 0, y: 0 }]))
+  } catch {
+    return null
+  }
+}
+
+/** L'angolo del blocco nuovo: sotto tutto ciò che è sul canvas, con l'origine di `placeNew` (spec §6). */
+function originBelow(occupied: readonly Rect[]): Point {
+  const bounds = rectsBounds(occupied)
+  return bounds ? { x: bounds.x, y: bounds.y + bounds.h + GUTTER } : { x: GUTTER, y: GUTTER }
+}
+
 /**
- * ELK sul grafo dei soli nodi nuovi, poi il blocco traslato sotto `occupied`, con l'origine di
- * `placeNew` (spec §6). Un nodo solo non passa per il motore. `null` se il motore fallisce: il
- * ripiego sulla griglia lo sceglie il chiamante, che conosce le misure della sua famiglia.
+ * ELK sul grafo dei soli nodi nuovi, poi il blocco traslato sotto `occupied` (spec §6). `null` se il
+ * motore fallisce: il ripiego sulla griglia lo sceglie il chiamante, che conosce le misure della sua
+ * famiglia.
  */
 async function layoutBelow(
   graph: LayoutGraph, occupied: readonly Rect[], layout: (g: LayoutGraph) => Promise<LayoutPositions>,
 ): Promise<Record<string, Point> | null> {
-  let raw: LayoutPositions
-  try {
-    raw = graph.nodes.length > 1 ? await layout(graph) : { [graph.nodes[0]!.id]: { x: 0, y: 0 } }
-  } catch {
-    return null
-  }
+  const raw = await runEngine(graph, layout)
+  if (raw === null) return null
   const block = nodesBounds(graph.nodes, raw)!
-  const bounds = rectsBounds(occupied)
-  const origin = bounds ? { x: bounds.x, y: bounds.y + bounds.h + GUTTER } : { x: GUTTER, y: GUTTER }
+  const origin = originBelow(occupied)
   return Object.fromEntries(
     Object.entries(raw).map(([key, p]) => [key, { x: snap(origin.x + p.x - block.x), y: snap(origin.y + p.y - block.y) }]),
   )
@@ -311,3 +324,89 @@ export function importMermaidClass(fragment: ClassImport, placement: Pick<ClassP
     }
   }
 }
+
+/**
+ * Il flowchart da innestare, con chiavi nuove (spec §5): nodi, archi, pool e corsie prendono un uuid,
+ * come in `addFlowNode` e `addPool`, quindi re-importare lo stesso testo lo duplica. L'ordine dei pool
+ * resta quello del testo.
+ */
+export function rekeyFlow(model: FlowModel): FlowModel {
+  const renamer = () => {
+    const seen = new Map<string, string>()
+    return (old: string): string => {
+      if (!seen.has(old)) seen.set(old, crypto.randomUUID())
+      return seen.get(old)!
+    }
+  }
+  const node = renamer()
+  const lane = renamer()
+  return {
+    pools: Object.fromEntries(
+      Object.values(model.pools).map((p) => [crypto.randomUUID(), { name: p.name, lanes: p.lanes.map((l) => ({ id: lane(l.id), name: l.name })) }]),
+    ),
+    nodes: Object.fromEntries(Object.entries(model.nodes).map(([key, n]) => [node(key), { ...n, lane: n.lane === null ? null : lane(n.lane) }])),
+    edges: Object.fromEntries(Object.values(model.edges).map((e) => [crypto.randomUUID(), { ...e, source: node(e.source), target: node(e.target) }])),
+  }
+}
+
+export interface FlowPlacement {
+  nodes: Record<string, Point>
+  pools: Record<string, PoolView>
+  lanes: Record<string, LaneView>
+  /** Il messaggio del ripiego sulla griglia, se c'è stato. */
+  fallback: string | null
+}
+
+/**
+ * Posizioni dei nodi, pool e altezze delle corsie del flowchart in arrivo (spec §6): la pipeline di
+ * «Disponi» del flowchart (`flowLayoutGraph`, ELK, `placeInLanes`) su un `FlowDiagram` temporaneo
+ * con il solo frammento, poi il blocco, pool compresi, traslato sotto tutto ciò che è sul canvas.
+ * Il temporaneo dà a ogni nodo una vista (`flowLayoutGraph` salta chi non ce l'ha) e ai pool la `y`
+ * del loro ordine nel testo, che `placeInLanes` usa per impilarli. Se il motore fallisce, la griglia
+ * di `placeInGrid` fa da posizioni grezze: corsie e pool restano coerenti, perché passano comunque
+ * per `placeInLanes`.
+ */
+export async function placeFlowImport(
+  doc: DevDocument, model: FlowModel, layout: (g: LayoutGraph) => Promise<LayoutPositions>,
+): Promise<FlowPlacement> {
+  const temporary: FlowDiagram = {
+    model,
+    view: {
+      nodes: Object.fromEntries(Object.keys(model.nodes).map((key) => [key, { x: 0, y: 0, collapsed: false }])),
+      pools: Object.fromEntries(Object.keys(model.pools).map((key, i) => [key, { x: 0, y: i, w: POOL_MIN_W }])),
+      lanes: {},
+    },
+  }
+  const graph = flowLayoutGraph(temporary)
+  const engine = await runEngine(graph, layout)
+  const raw = engine ?? placeInGrid(graph.nodes.map((n) => [n.id, { w: n.w, h: n.h }] as const), [])
+  const fallback = engine === null ? "La disposizione automatica non è riuscita: i nodi nuovi sono in griglia." : null
+  const placed = placeInLanes(temporary, raw)
+  const block = placedBounds(temporary, raw)
+  if (block === null) return { nodes: {}, pools: {}, lanes: {}, fallback }
+  const origin = originBelow(nodeRects(doc))
+  const dx = snap(origin.x - block.x)
+  const dy = snap(origin.y - block.y)
+  return {
+    nodes: Object.fromEntries(Object.entries(placed.positions).map(([key, p]) => [key, { x: p.x + dx, y: p.y + dy }])),
+    pools: Object.fromEntries(Object.entries(placed.pools).map(([key, v]) => [key, { ...v, x: v.x + dx, y: v.y + dy }])),
+    lanes: placed.lanes,
+    fallback,
+  }
+}
+
+/**
+ * Innesta un flowchart letto da Mermaid (spec §5), in un solo comando: si aggiunge sempre, con le
+ * chiavi che gli ha dato `rekeyFlow`, e non tocca niente di ciò che c'era.
+ */
+export function importMermaidFlow(model: FlowModel, placement: Pick<FlowPlacement, "nodes" | "pools" | "lanes">): Recipe {
+  return (draft) => {
+    const d = flowDiagram(draft)
+    Object.assign(d.model.pools, model.pools)
+    Object.assign(d.model.nodes, model.nodes)
+    Object.assign(d.model.edges, model.edges)
+    for (const [key, p] of Object.entries(placement.nodes)) d.view.nodes[key] = { ...p, collapsed: false }
+    Object.assign(d.view.pools, placement.pools)
+    Object.assign(d.view.lanes, placement.lanes)
+  }
+}
```

- [ ] **Step 4: Verifica che passino**

Run: `pnpm vitest run src/editor/commands/import-mermaid.test.ts`
Expected: PASS, 29 test (23 di ER e classi, 6 del flowchart)

- [ ] **Step 5: Commit**

```bash
git add src/editor/commands/import-mermaid.ts src/editor/commands/import-mermaid.test.ts
git commit -m "feat(import-mermaid): il comando del flowchart, chiavi nuove e la pipeline di «Disponi» sul solo frammento"
```

---

### Task 5: Analisi, dialog ed e2e

**Files:**
- Modify: `src/io/mermaid/analyse.ts`
- Test: `src/io/mermaid/analyse.test.ts`
- Modify: `src/ui/import/ImportMermaidDialog.tsx`
- Modify: `scripts/e2e/import-mermaid.mjs`

**Interfaces:**
- Consumes: `parseFlow` (Task 1), `mapFlow`, `FlowFragment` (Task 2); `rekeyFlow`, `placeFlowImport`, `importMermaidFlow` (Task 4); `MermaidKind` da `common.ts`; `flowDiagram`.
- Produces: `MermaidAnalysis` con il ramo `{ ok: true; kind: "flow"; fragment: FlowFragment }`.

L'analisi e il dialog stanno nello stesso task perché il nuovo ramo di `MermaidAnalysis` rompe i tipi del dialog (`NOUN` senza `flow`, `referenced` che `FlowFragment` non ha): separati, un commit non compilerebbe.

Cosa cambia per l'utente: il riepilogo dice «N nodi, M archi, P pool»; non c'è la lista con le caselle; il pulsante è «Importa N nodi», disabilitato a zero nodi; il riepilogo finale è «Importati N nodi e M archi, con P pool». Il passo e2e del `.md` cambia nome e controllo: il primo blocco, un flowchart, ora si analizza invece di dare il messaggio «Per ora si importano…».

- [ ] **Step 1: Scrivi il test che fallisce**

```diff
diff --git a/src/io/mermaid/analyse.test.ts b/src/io/mermaid/analyse.test.ts
index b9a4dbb..8da1279 100644
--- a/src/io/mermaid/analyse.test.ts
+++ b/src/io/mermaid/analyse.test.ts
@@ -19,14 +19,23 @@ describe("analyseMermaid", () => {
     ])
   })
 
-  it("rifiuta testo vuoto, tipi sconosciuti e il flowchart, non ancora supportato", () => {
+  it("restituisce il frammento del flowchart, con lo stesso ordine degli avvisi", () => {
+    const result = analyseMermaid("graph TD\n  A -.-> B")
+    expect(result).toMatchObject({ ok: true, kind: "flow" })
+    expect(result.ok && result.fragment.warnings.map((w) => w.message.split(":")[0])).toEqual([
+      "Direzione ignorata",
+      "Stile di linea perso (tratteggiata, spessa)",
+    ])
+  })
+
+  it("rifiuta testo vuoto e tipi sconosciuti", () => {
     expect(analyseMermaid("  ")).toEqual({ ok: false, message: "Il testo è vuoto.", at: null })
     expect(analyseMermaid("sequenceDiagram")).toMatchObject({ ok: false, at: null })
-    expect(analyseMermaid("flowchart LR\n  A --> B")).toMatchObject({ ok: false, at: null })
   })
 
   it("trasforma un errore di sintassi in un esito con l'offset", () => {
     expect(analyseMermaid("erDiagram\n  A {\n")).toEqual({ ok: false, message: "Blocco «{» senza «}»", at: 14 })
     expect(analyseMermaid("classDiagram\n  class A {\n")).toEqual({ ok: false, message: "Blocco «{» senza «}»", at: 23 })
+    expect(analyseMermaid("flowchart LR\n  end\n")).toEqual({ ok: false, message: "«end» senza un subgraph aperto", at: 15 })
   })
 })
```

- [ ] **Step 2: Verifica che fallisca**

Run: `pnpm vitest run src/io/mermaid/analyse.test.ts`
Expected: FAIL in «restituisce il frammento del flowchart…» (oggi `{ ok: false, message: "Per ora si importano erDiagram e classDiagram…" }`) e in «trasforma un errore di sintassi in un esito con l'offset»

- [ ] **Step 3: Togli il ramo `ponytail:` e aggiungi quello del flowchart**

```diff
diff --git a/src/io/mermaid/analyse.ts b/src/io/mermaid/analyse.ts
index 2476ecf..a47697e 100644
--- a/src/io/mermaid/analyse.ts
+++ b/src/io/mermaid/analyse.ts
@@ -1,24 +1,32 @@
 import { mapClass, type ClassFragment } from "./class-map"
 import { parseClass } from "./class-parse"
-import { detect, MermaidSyntaxError } from "./common"
+import { detect, MermaidSyntaxError, type MermaidKind } from "./common"
 import { mapEr, type ErFragment } from "./er-map"
 import { parseEr } from "./er-parse"
+import { mapFlow, type FlowFragment } from "./flow-map"
+import { parseFlow } from "./flow-parse"
 
 export type MermaidAnalysis =
   | { ok: true; kind: "er"; fragment: ErFragment }
   | { ok: true; kind: "class"; fragment: ClassFragment }
+  | { ok: true; kind: "flow"; fragment: FlowFragment }
   /** `at` è l'offset nel testo analizzato, quando l'errore ne ha uno. */
   | { ok: false; message: string; at: number | null }
 
 /** Parse e map della famiglia: gli avvisi del parser precedono quelli del map. */
-function analyseKind(kind: "er" | "class", text: string): MermaidAnalysis {
+function analyseKind(kind: MermaidKind, text: string): MermaidAnalysis {
   if (kind === "er") {
     const { ast, warnings } = parseEr(text)
     const fragment = mapEr(ast, text)
     return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
   }
-  const { ast, warnings } = parseClass(text)
-  const fragment = mapClass(ast, text)
+  if (kind === "class") {
+    const { ast, warnings } = parseClass(text)
+    const fragment = mapClass(ast, text)
+    return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
+  }
+  const { ast, warnings } = parseFlow(text)
+  const fragment = mapFlow(ast, text)
   return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
 }
 
@@ -30,8 +38,6 @@ export function analyseMermaid(text: string): MermaidAnalysis {
   const kind = detect(text)
   if (kind === null) return { ok: false, message: "Il testo è vuoto.", at: null }
   if (typeof kind === "object") return { ok: false, message: `«${kind.unknown}» non si importa: solo erDiagram, classDiagram e flowchart.`, at: null }
-  // ponytail: il flowchart ha il suo piano; finché non arriva, qui si ferma con un messaggio.
-  if (kind === "flow") return { ok: false, message: "Per ora si importano erDiagram e classDiagram: il flowchart arriverà.", at: null }
   try {
     return analyseKind(kind, text)
   } catch (e) {
```

- [ ] **Step 4: Verifica che passi**

Run: `pnpm vitest run src/io/mermaid/analyse.test.ts`
Expected: PASS, 5 test. `pnpm tsc -b` invece fallisce in `ImportMermaidDialog.tsx`: lo sistema lo step dopo.

- [ ] **Step 5: Estendi il dialog**

```diff
diff --git a/src/ui/import/ImportMermaidDialog.tsx b/src/ui/import/ImportMermaidDialog.tsx
index dd874dc..53f1204 100644
--- a/src/ui/import/ImportMermaidDialog.tsx
+++ b/src/ui/import/ImportMermaidDialog.tsx
@@ -6,11 +6,12 @@ import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, D
 import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
 import { classDiagram } from "@/editor/class-access"
 import {
-  classImportFates, erImportFates, importMermaidClass, importMermaidEr, placeClassImport, placeErImport, selectClassFragment,
-  selectErFragment, type ImportFate,
+  classImportFates, erImportFates, importMermaidClass, importMermaidEr, importMermaidFlow, placeClassImport, placeErImport,
+  placeFlowImport, rekeyFlow, selectClassFragment, selectErFragment, type ImportFate,
 } from "@/editor/commands/import-mermaid"
 import { documentStore, type Recipe } from "@/editor/document-store"
 import { erDiagram } from "@/editor/er-access"
+import { flowDiagram } from "@/editor/flow-access"
 import { noteDiagram } from "@/editor/note-access"
 import { layoutEngine } from "@/io/app-io"
 import { documentSession } from "@/io/document-session"
@@ -23,12 +24,12 @@ type Stage =
   | { kind: "vuoto" }
   | { kind: "analizzato"; block: MermaidBlock; result: MermaidAnalysis }
   | { kind: "importa" }
-  | { kind: "fatto"; family: Family; elements: number; relations: number; notes: number; warnings: string[] }
+  | { kind: "fatto"; family: Family; elements: number; relations: number; notes: number; pools: number; warnings: string[] }
 
 type Ready = Extract<MermaidAnalysis, { ok: true }>
 type Family = Ready["kind"]
 
-const NOUN: Record<Family, string> = { er: "entità", class: "classi" }
+const NOUN: Record<Family, string> = { er: "entità", class: "classi", flow: "nodi" }
 
 const FATE_LABEL: Record<ImportFate, string> = { nuovo: "nuova", sostituisce: "già presente, verrà sostituita", identico: "identica, saltata" }
 
@@ -39,17 +40,28 @@ function blockLabel(block: MermaidBlock, index: number): string {
   return `Blocco ${index + 1} · ${name}`
 }
 
+/** L'esito di ogni elemento con la casella. Il flowchart non ne ha: si aggiunge sempre, intero (spec §7). */
 function importFates(doc: DevDocument, ready: Ready): Record<string, ImportFate> {
+  if (ready.kind === "flow") return {}
   const referenced = new Set(ready.fragment.referenced)
   return ready.kind === "er"
     ? erImportFates(doc, ready.fragment.entities, referenced)
     : classImportFates(doc, ready.fragment.classes, referenced)
 }
 
-/** Relazioni e note presenti nella famiglia: la differenza prima/dopo il dispatch dice quante ne sono entrate davvero. */
-function counts(doc: DevDocument, family: Family): { relations: number; notes: number } {
-  if (family === "er") return { relations: Object.keys(erDiagram(doc).model.relationships).length, notes: 0 }
-  return { relations: Object.keys(classDiagram(doc).model.relations).length, notes: Object.keys(noteDiagram(doc).model.notes).length }
+/** Quanti elementi entrano col pulsante: quelli scelti, o i nodi del flowchart. Un flowchart di soli subgraph vuoti non si importa. */
+function importable(ready: Ready, chosen: ReadonlySet<string>): number {
+  return ready.kind === "flow" ? Object.keys(ready.fragment.model.nodes).length : chosen.size
+}
+
+/** Relazioni (o archi), note e pool presenti nella famiglia: la differenza prima/dopo il dispatch dice quanti ne sono entrati davvero. */
+function counts(doc: DevDocument, family: Family): { relations: number; notes: number; pools: number } {
+  if (family === "er") return { relations: Object.keys(erDiagram(doc).model.relationships).length, notes: 0, pools: 0 }
+  if (family === "flow") {
+    const { model } = flowDiagram(doc)
+    return { relations: Object.keys(model.edges).length, notes: 0, pools: Object.keys(model.pools).length }
+  }
+  return { relations: Object.keys(classDiagram(doc).model.relations).length, notes: Object.keys(noteDiagram(doc).model.notes).length, pools: 0 }
 }
 
 /** Selezione, disposizione e comando della famiglia: ciò che resta da fare è il dispatch. */
@@ -63,6 +75,11 @@ async function prepareImport(
     const { positions, fallback } = await placeErImport(doc, entities, relationships, layout)
     return { recipe: importMermaidEr(entities, relationships, positions), elements: Object.keys(entities).length, fallback }
   }
+  if (ready.kind === "flow") {
+    const model = rekeyFlow(ready.fragment.model)
+    const placement = await placeFlowImport(doc, model, layout)
+    return { recipe: importMermaidFlow(model, placement), elements: Object.keys(model.nodes).length, fallback: placement.fallback }
+  }
   const present = new Set(Object.keys(classDiagram(doc).model.classes))
   const fragment = selectClassFragment(ready.fragment.classes, ready.fragment.relations, ready.fragment.notes, chosen, present)
   const placement = await placeClassImport(doc, fragment, layout)
@@ -72,6 +89,10 @@ async function prepareImport(
 /** I conteggi del riepilogo, prima dell'import. */
 function summary(ready: Ready): string {
   if (ready.kind === "er") return `${Object.keys(ready.fragment.entities).length} entità, ${ready.fragment.relationships.length} relazioni`
+  if (ready.kind === "flow") {
+    const { nodes, edges, pools } = ready.fragment.model
+    return `${Object.keys(nodes).length} nodi, ${Object.keys(edges).length} archi, ${Object.keys(pools).length} pool`
+  }
   const { classes, relations, notes } = ready.fragment
   return `${Object.keys(classes).length} classi, ${relations.length} relazioni, ${notes.length} note`
 }
@@ -140,6 +161,7 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
       elements,
       relations: after.relations - before.relations,
       notes: after.notes - before.notes,
+      pools: after.pools - before.pools,
       warnings: [...ready.fragment.warnings.map((w) => w.message), ...(fallback ? [fallback] : [])],
     })
   }
@@ -175,17 +197,24 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
         <DialogHeader>
           <DialogTitle>Importa Mermaid</DialogTitle>
           <DialogDescription>
-            Incolla o carica un erDiagram o un classDiagram, anche dentro un file Markdown: gli elementi scelti entrano nel
-            diagramma aperto, in un solo passo annullabile.
+            Incolla o carica un erDiagram, un classDiagram o un flowchart, anche dentro un file Markdown: gli elementi scelti
+            entrano nel diagramma aperto, in un solo passo annullabile.
           </DialogDescription>
         </DialogHeader>
 
         {stage.kind === "fatto" ? (
           <div className="min-h-0 flex-1 space-y-3 overflow-auto text-sm">
-            <p>
-              Importate <strong>{stage.elements}</strong> {NOUN[stage.family]} e <strong>{stage.relations}</strong> relazioni
-              {stage.family === "class" && <>, con <strong>{stage.notes}</strong> note</>}.
-            </p>
+            {stage.family === "flow" ? (
+              <p>
+                Importati <strong>{stage.elements}</strong> nodi e <strong>{stage.relations}</strong> archi, con{" "}
+                <strong>{stage.pools}</strong> pool.
+              </p>
+            ) : (
+              <p>
+                Importate <strong>{stage.elements}</strong> {NOUN[stage.family]} e <strong>{stage.relations}</strong> relazioni
+                {stage.family === "class" && <>, con <strong>{stage.notes}</strong> note</>}.
+              </p>
+            )}
             {stage.warnings.length > 0 && (
               <details open data-import-warnings>
                 <summary className="cursor-pointer text-muted-foreground">{stage.warnings.length} avvisi</summary>
@@ -202,7 +231,7 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
               value={text}
               onChange={(e) => setText(e.target.value)}
               onPaste={onPaste}
-              placeholder="erDiagram o classDiagram …"
+              placeholder="erDiagram, classDiagram o flowchart …"
               className="h-32 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
             />
             <div className="flex items-center gap-2">
@@ -270,8 +299,8 @@ export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onO
                   Questo documento è aperto in un&apos;altra scheda: qui è in sola lettura.
                 </p>
               )}
-              <Button onClick={() => void onImport()} disabled={chosen.size === 0 || readOnly}>
-                Importa {chosen.size} {NOUN[ready.kind]}
+              <Button onClick={() => void onImport()} disabled={importable(ready, chosen) === 0 || readOnly}>
+                Importa {importable(ready, chosen)} {NOUN[ready.kind]}
               </Button>
             </>
           )}
```

- [ ] **Step 6: Verifica tipi e lint**

```bash
pnpm tsc -b
pnpm lint
```

Expected: nessun errore.

- [ ] **Step 7: Estendi lo scenario e2e**

````diff
diff --git a/scripts/e2e/import-mermaid.mjs b/scripts/e2e/import-mermaid.mjs
index 5631325..8c03ce5 100644
--- a/scripts/e2e/import-mermaid.mjs
+++ b/scripts/e2e/import-mermaid.mjs
@@ -1,5 +1,5 @@
 /**
- * End-to-end dell'import Mermaid, ER e classi: incolla → analizza → importa → re-importa senza
+ * End-to-end dell'import Mermaid, ER, classi e flowchart: incolla → analizza → importa → re-importa senza
  * duplicare → annulla. Copre quello che i test unitari non vedono: la voce di menu, l'incollata vera, la
  * disposizione col worker di ELK sulla build di produzione e il selettore dei blocchi di un `.md`.
  *
@@ -32,6 +32,17 @@ const CLASSES = `classDiagram
   direction LR
 `
 
+const FLOW = `flowchart TD
+  inizio([Inizio]) --> a
+  subgraph p [Ufficio]
+    a[Raccogli] --> b{Completo?}
+    subgraph c [Contabilità]
+      b -->|sì| d[[Registra]]
+    end
+  end
+  b -.-> a
+`
+
 const MARKDOWN = "# Note\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```mermaid\n" + ER + "```\n"
 
 /** Apre «Importa Mermaid…» e aspetta il dialog, per la stessa ragione di `openImportDialog` in import.mjs. */
@@ -60,6 +71,8 @@ async function closeDialog(page) {
 
 const edgeCount = (page) => page.evaluate(() => document.querySelectorAll("[data-edge-id]").length)
 const classEdgeCount = (page) => page.evaluate(() => document.querySelectorAll('[data-edge-id^="class/"]').length)
+const flowEdgeCount = (page) => page.evaluate(() => document.querySelectorAll('[data-edge-id^="flow/"]').length)
+const poolCount = (page) => page.evaluate(() => document.querySelectorAll("[data-pool]").length)
 
 /** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
 export async function run(browser, base) {
@@ -118,10 +131,10 @@ export async function run(browser, base) {
       await expectNodes(page, 0)
     })
 
-    await step("in un .md sceglie il blocco ER e spiega quello che non si importa", async () => {
+    await step("in un .md analizza il primo blocco, un flowchart, e passa al blocco ER", async () => {
       await openDialog(page)
       await paste(page, MARKDOWN)
-      await expectText(page, "[data-import-error]", "Per ora si importano erDiagram e classDiagram")
+      await expectText(page, "[data-import-summary]", "2 nodi, 1 archi, 0 pool")
       await page.locator("[data-import-blocks]").getByText("Blocco 2 · ER").click()
       await expectText(page, "[data-import-summary]", "3 entità")
       await closeDialog(page)
@@ -181,6 +194,40 @@ export async function run(browser, base) {
       await page.keyboard.press("ControlOrMeta+z")
       await expectNodes(page, 0)
     })
+
+    await step("analizza il flowchart incollato, senza caselle e con gli avvisi su direzione e stile", async () => {
+      await openDialog(page)
+      await paste(page, FLOW)
+      await expectText(page, "[data-import-summary]", "4 nodi, 4 archi, 1 pool")
+      await expectText(page, "[data-import-warnings]", "2 avvisi")
+      const boxes = await page.getByRole("checkbox").count()
+      if (boxes !== 0) throw new Error(`il flowchart non ha caselle, trovate ${boxes}`)
+    })
+
+    await step("importa il flowchart intero, con il pool e le sue corsie, disposto da ELK", async () => {
+      await page.getByRole("button", { name: /^Importa 4 nodi$/ }).click()
+      await page.waitForSelector("[data-import-mermaid-dialog] strong")
+      await expectText(page, "[data-import-mermaid-dialog]", "con 1 pool")
+      await closeDialog(page)
+      await expectNodes(page, 4)
+      const edges = await flowEdgeCount(page)
+      if (edges !== 4) throw new Error(`attesi 4 archi, trovati ${edges}`)
+      if ((await poolCount(page)) !== 1) throw new Error("atteso 1 pool")
+    })
+
+    await step("il re-import del flowchart lo aggiunge di nuovo, e due ⌘Z lo tolgono", async () => {
+      await openDialog(page)
+      await paste(page, FLOW)
+      await page.getByRole("button", { name: /^Importa 4 nodi$/ }).click()
+      await page.waitForSelector("[data-import-mermaid-dialog] strong")
+      await closeDialog(page)
+      await expectNodes(page, 8)
+      if ((await poolCount(page)) !== 2) throw new Error("attesi 2 pool")
+      await page.keyboard.press("ControlOrMeta+z")
+      await page.keyboard.press("ControlOrMeta+z")
+      await expectNodes(page, 0)
+      if ((await poolCount(page)) !== 0) throw new Error("attesi 0 pool")
+    })
   } catch (e) {
     failed = true
     console.error("\nFALLITO:", e)
````

Il flowchart dello scenario ha quattro nodi (`inizio`, `a`, `b`, `d`) e quattro archi, e due avvisi: la direzione `TD` e lo stile della freccia `-.->`. `b` è scritto nel pool ma nominato anche nella corsia `c`: finisce nella corsia, come in Mermaid.

- [ ] **Step 8: Verifica l'e2e**

Run: `pnpm e2e` (fa `vite build` e lancia tutti gli scenari; oltre due minuti, va in background)
Expected: exit 0, tutti i passi `ok`; nello scenario dell'import Mermaid i tre passi del flowchart dopo quelli delle classi.

- [ ] **Step 9: Commit**

```bash
git add src/io/mermaid/analyse.ts src/io/mermaid/analyse.test.ts src/ui/import/ImportMermaidDialog.tsx scripts/e2e/import-mermaid.mjs
git commit -m "feat(import-mermaid): il dialog importa anche il flowchart, intero e senza caselle"
```

---

### Task 6: README e verifica finale

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Aggiorna il README**

```diff
diff --git a/README.md b/README.md
index 2ba7bba..76ecb05 100644
--- a/README.md
+++ b/README.md
@@ -67,8 +67,11 @@ Da un `erDiagram` o un `classDiagram`, incollato o caricato (anche dentro un fil
 scegliendo il blocco), si scelgono le entità o le classi da importare, e con le classi entrano le
 note. Gli elementi nuovi si dispongono da soli sotto il contenuto esistente; uno già presente viene
 sostituito e resta nella sua posizione, e re-importare lo stesso testo non duplica relazioni e note.
-Stili, alias, etichette, namespace e direzione si scartano con un avviso. `flowchart` non si importa
-ancora.
+Stili, alias, etichette, namespace e direzione si scartano con un avviso.
+
+Un `flowchart` o un `graph` si importa intero, senza scelta: i subgraph di primo livello diventano
+pool e i loro figli corsie, e le forme senza equivalente diventano processi, con un avviso.
+Re-importarlo lo aggiunge di nuovo.
 
 ### Esporta
 
@@ -117,8 +120,10 @@ Un documento si modifica da una scheda sola: le altre lo mostrano in sola lettur
 - **Prestazioni misurate fino a 600 entità ER** (p95 del tempo di frame ≤ 20 ms in produzione:
   [la misura](docs/perf/2026-09-13-gate-verde.md)). Classi, flowchart, note e forme non sono
   misurati.
-- **Import Mermaid**: un'istruzione per riga fuori dai blocchi, e un'etichetta di relazione con spazi
-  va fra virgolette. Le relazioni importate non hanno colonne, come quelle disegnate a mano.
+- **Import Mermaid**: nell'ER e nelle classi un'istruzione per riga fuori dai blocchi, e
+  un'etichetta di relazione con spazi va fra virgolette. Le relazioni importate non hanno colonne,
+  come quelle disegnate a mano. Del flowchart si perdono lo stile delle linee, le teste diverse
+  dalla freccia e gli archi verso un subgraph.
 - **Import DDL**: i vincoli `UNIQUE` su più colonne vengono ignorati, con un avviso. In MySQL un
   `REFERENCES` senza lista di colonne fa scartare l'intero `CREATE TABLE`.
 - **Classi**: i generici annidati escono in Mermaid in forma approssimata, con un avviso; l'import li
@@ -179,7 +184,8 @@ ognuno in un contesto di browser separato:
   sola lettura che prende il controllo (sul percorso `?fallback=1`).
 - **Import DDL**: import di entità e relazione, undo, reimport senza duplicati.
 - **Import Mermaid**: erDiagram e classDiagram incollati e disposti, reimport senza duplicati, undo,
-  blocco scelto in un Markdown, errore con la riga.
+  blocco scelto in un Markdown, errore con la riga; flowchart con pool e corsie, senza caselle,
+  aggiunto di nuovo al re-import.
 - **Export immagini**: SVG, PNG e copia negli appunti col tema scuro attivo.
 - **Export testo**: i tre formati, copia e download.
 - **Auto layout**: «Disponi» sposta i nodi senza sovrapporli, e si annulla.
```

- [ ] **Step 2: Verifica tutto**

```bash
pnpm lint
pnpm tsc -b
pnpm test
pnpm e2e
```

Expected: lint e tipi senza errori, 1282 test verdi, tutti gli scenari e2e `ok` (100 passi).

Due note, le stesse dei piani precedenti:
- Se `pnpm lint` segnala centinaia di errori con «multiple candidate TSConfigRootDirs», nel checkout è rimasto un worktree in `.claude/worktrees/`: va rimosso, il codice non c'entra.
- `src/io/ddl/sql-text.test.ts` ha un test di tempi già instabile in CI, fuori da questo piano: se cade solo lui, rilancia il job.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): l'import di flowchart"
```

---

## Fuori da questo piano

- **Lo stile delle linee e le teste diverse dalla freccia**: il modello non le ha. Un arco tratteggiato, spesso, senza testa o con due teste diventa una freccia continua, con avviso.
- **Gli archi da o verso un subgraph**: il modello collega solo nodi. Scartati con avviso.
- **I subgraph oltre il secondo livello**: il modello ha pool e corsie, non corsie annidate. I nodi vanno nella corsia antenata, con avviso.
- **Le forme senza equivalente** (`cyl`, `hex`, `doc`…): processo, con avviso. Si allarga la tabella `SHAPES` il giorno che il modello avrà una forma in più.
- **Un flowchart di soli subgraph vuoti dal dialog**: il pulsante conta i nodi. Se serve, il conteggio diventa nodi più pool.
- **Il `|` nell'export**: l'escape `#124;` resta anche se Mermaid non ne ha bisogno (Task 3). Si toglie solo se qualcuno chiede un export più leggibile.
