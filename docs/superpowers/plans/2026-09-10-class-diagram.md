# Class diagram UML — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un secondo tipo di documento — class diagram UML con classi, membri
tipizzati, sei tipi di relazione ed export Mermaid — che riusa canvas, undo,
persistenza, routing e auto layout dell'editor ER invece di duplicarli.

**Architecture:** Prima si estrae la giuntura per tipo di diagramma **con l'ER
come unico tipo** (task 1-6), così il refactoring del codice più delicato si
prova contro i 332 test esistenti senza che una riga di codice nuovo possa
essere sospettata. Poi le classi entrano come secondo tipo (task 7-15), che a
quel punto è un lavoro additivo. La giuntura è in due metà perché ESLint vieta a
`src/editor` di importare React: `DiagramOps` (dati e comandi, TypeScript puro,
interamente testabile) e `DiagramView` (componenti).

**Tech Stack:** TypeScript 6 strict, React 19, zod 4, Zustand 5 vanilla, Immer
patch-based undo, Vitest 5, Playwright per gli e2e, elkjs in worker (già
presente), pnpm.

**Spec:** `docs/superpowers/specs/2026-09-10-class-diagram-design.md`

## Global Constraints

Valgono per ogni task, senza ripeterle.

- **Lingua:** commenti, docstring, descrizioni dei test, testo della UI e
  messaggi di commit in **italiano**; identificatori in **inglese**. Nessuna
  eccezione: identificatori italiani sono stati un difetto ricorrente nei piani
  precedenti.
- **I dump reali `spike/fixtures/postgres.sql` e `spike/fixtures/mysql.sql` sono
  git-ignored e non vanno mai committati. Nessun frammento di essi — nomi di
  tabella e di colonna compresi — può comparire in un test.** Non aprirli. I
  nomi nei test si inventano.
- **Non uccidere PID trovati con `lsof` o `ps` senza averli verificati.** In una
  sessione precedente è stato ucciso per sbaglio un processo di sistema.
- Comandi versioni e dettagli di API si prendono dalla **documentazione ufficiale
  corrente**, non dalla memoria.
- **Livelli, imposti da `no-restricted-imports` in `eslint.config.js`:**
  `src/model` non importa React, store, `@/editor/**`, `@/ui/**`, `@/io/**`;
  `src/editor` non importa React, `@/ui/**`, `@/io/**`; `src/io` non importa
  React né `@/ui/**`. Una violazione fa fallire `pnpm lint`.
- **`SCHEMA_VERSION` resta 1** e la tabella delle migrazioni resta vuota:
  allargare la union lascia validi tutti i file esistenti.
- **Il progetto non ha Prettier** — nessuna dipendenza, nessuna configurazione,
  nessuno script `format`. Le righe lunghe sono normali qui (le esistenti
  arrivano a 186 caratteri): non riformattare codice che non stai cambiando.
- **Il progetto non ha jsdom.** Le viste guidate dalle prop si testano con
  `renderToStaticMarkup` di `react-dom/server` (vedi
  `src/ui/canvas/render.test.tsx`); le interazioni — eventi, fuoco, clipboard —
  solo negli e2e.
- **Comandi:** `pnpm test` (`vitest run --passWithNoTests`), `pnpm build`
  (`tsc -b && vite build`, il solo type check), `pnpm lint` (`eslint .`, copre
  anche i `.mjs`), `pnpm e2e` (`vite build` più gli scenari), `pnpm perf [N]`.
- **Criterio di prestazioni:** p95 ≤ 20 ms fra frame dipinti, cioè ≥ 50 FPS. 60
  FPS è il tetto desiderato: non ottimizzare oltre.
- **`documentStore.dispatch(recipe)` torna `false`** quando Immer non produce
  patch: riassegnare valori identici non crea una voce di undo fantasma. Le
  guardie «se il valore non è cambiato non fare nulla» servono comunque, per non
  passare dal dispatch.
- **Baseline da non rompere:** 332 test in 30 file, `pnpm lint` pulito,
  `pnpm build` pulito, 5 scenari e2e verdi. Ogni task li lascia verdi.

---

## Struttura dei file

**Creati — modello (TypeScript puro):**

| File | Responsabilità |
|---|---|
| `src/model/er/schema.ts` | Schemi zod dell'ER, spostati da `document.ts` |
| `src/model/class/schema.ts` | Schemi zod delle classi |
| `src/model/class/members.ts` | Parser e serializzatore del testo dei membri |
| `src/model/class/validate.ts` | `validateClass` |
| `src/model/issue.ts` | `Issue`, `IssueCode`, `IssueSeverity` condivisi |

**Creati — editor (niente React):**

| File | Responsabilità |
|---|---|
| `src/editor/geometry.ts` | Costanti, `snap`, `Point`/`Rect`/`Size`, `rectsBounds`, `rectsIntersect` |
| `src/editor/er/geometry.ts` | `attributeLines`, `entitySize`, `entityRect` |
| `src/editor/class/geometry.ts` | `memberLines`, `classSize`, `classRect`, `umlMarkerPath` |
| `src/editor/class/commands.ts` | Comandi sul modello delle classi |
| `src/editor/commands/view.ts` | `diagramView`, `moveNodes`, `setCollapsed`, `applyLayout` — condivisi |
| `src/editor/kinds/ops.ts` | `DiagramOps`, `opsFor` |
| `src/editor/kinds/er.ts` | `erOps` |
| `src/editor/kinds/class.ts` | `classOps` |

**Creati — io e ui:**

| File | Responsabilità |
|---|---|
| `src/io/emit/class-mermaid.ts` | Emettitore `classDiagram` |
| `src/ui/canvas/kinds/registry.ts` | `DiagramView`, `viewFor` |
| `src/ui/canvas/kinds/er.tsx` | `erView` |
| `src/ui/canvas/kinds/class.tsx` | `classView` |
| `src/ui/canvas/ClassNode.tsx` | `ClassNodeView` (prop) e `ClassNode` (store) |
| `src/ui/canvas/ClassEdge.tsx` | `ClassEdgeView` e `ClassEdge` |
| `src/ui/canvas/MembersEditor.tsx` | `textarea` sovrapposta al corpo della classe |
| `src/ui/panels/ClassProperties.tsx` | Corpo del pannello per le classi |
| `scripts/e2e/class.mjs` | Sesta scena |

**Rinominati:** `src/io/emit/mermaid.ts` → `er-mermaid.ts` (due importatori).

**Modificati in modo sostanziale:** `src/model/document.ts` (resta il
condiviso), `src/editor/interaction.ts` (vocabolario),
`src/editor/session-store.ts` (vocabolario e `editing`),
`src/editor/actions.ts` (passa dalle ops), `src/ui/canvas/dom-registry.ts` (un
blocco), `src/editor/edge-routing.ts` (due campi in `EdgeGeometry`),
`src/ui/canvas/use-canvas-interaction.ts` (passa dalle ops),
`src/ui/canvas/layers.tsx`, `src/ui/Toolbar.tsx`, `src/ui/DocumentMenu.tsx`,
`src/ui/panels/PropertiesPanel.tsx`, `src/ui/panels/IssuesPanel.tsx`,
`src/ui/export/svg.tsx`, `src/ui/export/TextExportDialog.tsx`,
`src/io/document-io.ts`, `src/ui/use-keyboard-shortcuts.ts`,
`scripts/e2e/run.mjs`.

---

# Fase A — la giuntura, con l'ER come unico tipo

Nessun codice delle classi in questa fase. Il criterio di successo di ogni task
è che i **332 test esistenti restino verdi**: se uno si rompe, lo spostamento ha
cambiato semantica, e va capito prima di andare avanti.

## Task 1: Gli schemi ER escono da `document.ts`

**Files:**
- Create: `src/model/er/schema.ts`, `src/model/shared.ts`
- Modify: `src/model/document.ts` (98 righe → ~35)
- Modify: ogni file che importa i tipi ER da `@/model/document` (39 importatori
  di `document`, non tutti toccati: solo quelli che usano nomi ER)

**Interfaces:**
- Produces: `src/model/er/schema.ts` esporta `CardinalitySchema`, `Cardinality`,
  `AttributeSchema`, `Attribute`, `EntitySchema`, `Entity`, `entityKey`,
  `RelationshipEndSchema`, `RelationshipEnd`, `RelationshipSchema`,
  `Relationship`, `ErModelSchema`, `ErModel`, `ErViewSchema`, `ErView`,
  `ErDiagramSchema`, `ErDiagram`, `createErDocument`, `ErDocument`.
  `src/model/shared.ts` esporta `SCHEMA_VERSION`, `Identifier`,
  `NodeViewSchema`, `NodeView` — non importa nessun altro modulo del progetto, e
  `document.ts` non li riesporta: chi li usa importa da lì. `SCHEMA_VERSION` sta
  qui e non in `document.ts` perché `createErDocument` lo legge come **valore**:
  lasciarlo in `document.ts` chiude un ciclo di valori con la union, e il ciclo
  non è teorico (vedi lo Step 2). Gli altri tre lettori — `migrations.ts`,
  `serialize.test.ts`, `document.test.ts` — passano a `./shared`.
  `src/model/document.ts` resta con `DiagramSchema`, `Diagram`, `DocumentSchema`,
  `DevDocument`.

- [ ] **Step 1: Leggere il file da dividere**

`cat -n src/model/document.ts`. Le righe 1-51 e 53-62 e 70-75 e 91-98 sono ER;
4, 6, 64-68, 78-89 sono condivise. `ErViewSchema` è ER solo di nome: la sua
forma `{ nodes: Record<string, NodeView> }` sarà identica a quella delle classi.
Lasciarla in `er/schema.ts` comunque — il tipo `ErDiagram` la nomina.

- [ ] **Step 2: Creare `src/model/er/schema.ts`**

Spostare, non riscrivere: taglia e incolla i blocchi ER, con i loro commenti.
**Il ciclo va rotto, non tollerato.** `document.ts` importa `ErDiagramSchema` da
`er/schema.ts` per la union, e `er/schema.ts` ha bisogno di `SCHEMA_VERSION`,
`Identifier` e `NodeViewSchema`. Se questi restano in `document.ts` il ciclo è di
**valori**, non di tipi: chi vince la corsa dipende dal grafo di import del file
che entra per primo, e l'altro verso vede `undefined` — misurato, non temuto:
`TypeError: Cannot read properties of undefined (reading '_zod')` su 12 file di
test su 30.

**Rompilo:** sposta `SCHEMA_VERSION`, `Identifier` e `NodeViewSchema` in
`src/model/shared.ts`, che non importa nessun altro modulo del progetto. Il grafo
diventa un albero: `document.ts` → `er/schema.ts` → `shared.ts`, e
`document.ts` → `shared.ts`. L'import in cima a `er/schema.ts` diventa

```ts
import { Identifier, NodeViewSchema, SCHEMA_VERSION } from "../shared"
import type { DevDocument } from "../document"
```

`import type` sulla seconda riga non è cosmetico: è ciò che la cancella a
runtime, e senza cancellazione il ciclo torna.

- [ ] **Step 3: Aggiornare gli import**

`grep -rln "@/model/document" src` e, per ciascuno, spostare i nomi ER
sull'import nuovo. `sed` va bene per i casi meccanici, ma **rileggi ogni file
toccato**: alcuni importano sia nomi ER sia nomi condivisi dalla stessa riga.

- [ ] **Step 4: Type check, lint e test**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: build e lint puliti, **332 test verdi**. Se un test fallisce, non è un
test da aggiustare: è una semantica cambiata.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(model): gli schemi ER escono da document.ts

document.ts teneva insieme il documento e il solo tipo di diagramma che
esisteva. Con due tipi diventerebbe duecento righe di due cose diverse:
gli schemi ER vanno in model/er/schema.ts accanto alla loro validazione,
e in document.ts resta il condiviso.

SCHEMA_VERSION, Identifier e NodeViewSchema scendono in model/shared.ts per
rompere il ciclo di valori fra document.ts, che nomina ErDiagramSchema nella
union, ed er/schema.ts, che li legge: un ciclo di soli tipi si cancella a
runtime, uno di valori lascia undefined a chi perde la corsa."
```

## Task 2: La geometria si divide, e `Issue` diventa condivisa

**Files:**
- Create: `src/editor/geometry.ts`, `src/editor/er/geometry.ts`,
  `src/model/issue.ts`
- Delete: `src/editor/er-geometry.ts` (il suo test si divide in due)
- Modify: `src/model/er/validate.ts`, `src/ui/panels/IssuesPanel.tsx`, e i 18
  importatori di `er-geometry`
- Delete: `src/editor/er-geometry.test.ts` (si divide nei due test qui sotto)
- Test: `src/editor/geometry.test.ts`, `src/editor/er/geometry.test.ts` (dal
  vecchio `er-geometry.test.ts`)

**Interfaces:**
- Consumes: gli schemi ER da `@/model/er/schema` (Task 1).
- Produces: `src/editor/geometry.ts` esporta `FONT_SIZE`, `CHAR_W`, `HEADER_H`,
  `ROW_H`, `PAD_X`, `MIN_W`, `GRID`, `snap`, `Point`, `Size`, `Rect`,
  `rectsBounds`, `rectsIntersect`. `src/editor/er/geometry.ts` esporta
  `attributeMarker`, `attributeTypeText`, `attributeLines`, `entitySize`,
  `entityRect`. `src/model/issue.ts` esporta:

```ts
export type IssueCode =
  // ER
  | "entity-without-pk" | "duplicate-attribute" | "fk-without-relationship"
  | "dangling-relationship" | "entity-name-clash"
  // class (i codici arrivano nel Task 10; dichiararli già qui evita di
  // riaprire questo file, e una union chiusa dà l'esaustività a tsc)
  | "class-name-clash" | "duplicate-member" | "dangling-relation"
  | "generalization-cycle" | "abstract-method-in-concrete-class"

export type IssueSeverity = "error" | "warning"

export interface Issue {
  code: IssueCode
  severity: IssueSeverity
  message: string
  /** Chiave del nodo coinvolto, se c'è. */
  node?: string
  /** Chiave dell'arco coinvolto, se c'è. */
  edge?: string
}
```

- [ ] **Step 1: Creare `src/editor/geometry.ts` e `src/editor/er/geometry.ts`**

Taglia e incolla da `er-geometry.ts`. `entitySize` importa `entityKey` da
`@/model/er/schema` e le costanti da `../geometry`.

- [ ] **Step 2: Dividere il test esistente**

`src/editor/er-geometry.test.ts` ha 53 righe: i casi su `snap`,
`rectsBounds` e `rectsIntersect` vanno in `src/editor/geometry.test.ts`,
quelli su `attributeLines`/`entitySize`/`entityRect` in
`src/editor/er/geometry.test.ts`. **Nessun caso si perde e nessuno si
riscrive:** il conteggio totale dei test non deve cambiare.

- [ ] **Step 3: Spostare `Issue` in `src/model/issue.ts` e rinominare i campi**

`validateEr` importa `Issue` da `../issue` e cambia `entity:` in `node:` e
`relationship:` in `edge:` nei cinque punti in cui costruisce un `Issue`.
`IssuesPanel.select` (righe 9-10) legge `issue.node` e `issue.edge`.
`src/model/er/validate.ts` **non** esporta più `Issue`.

- [ ] **Step 4: Aggiornare i 18 importatori di `er-geometry`**

Sei vogliono solo la metà condivisa (`edge-routing`, `interaction`,
`session-store`, `viewport`, `dom-registry`, `Canvas.tsx`): puntano a
`@/editor/geometry`. Gli altri importano da entrambe.

- [ ] **Step 5: Cancellare `er-geometry.ts` e verificare**

Run: `pnpm build && pnpm lint && pnpm test`
Expected: 332 test verdi, `grep -rn "er-geometry" src` vuoto.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(editor): la geometria condivisa si separa da quella ER

er-geometry.ts teneva le costanti del canvas e la geometria delle
entità nello stesso file, con diciotto importatori di cui sei
volevano solo le prime. Diventa editor/geometry.ts più
editor/er/geometry.ts.

Issue sale in model/issue.ts con node/edge al posto di
entity/relationship, e con i codici delle classi già dichiarati:
la union chiusa dà l'esaustività a tsc e questo file non si
riapre. IssuesPanel non cambia forma, legge gli altri due campi."
```

## Task 3: Il vocabolario diventa `node` / `edge`

**Files:**
- Modify: `src/editor/interaction.ts`, `src/editor/interaction.test.ts`,
  `src/editor/session-store.ts`, `src/editor/actions.ts`,
  `src/editor/actions.test.ts`, `src/ui/canvas/use-canvas-interaction.ts`,
  `src/ui/canvas/RelationshipEdge.tsx`, `src/ui/canvas/EntityNode.tsx`,
  `src/ui/panels/IssuesPanel.tsx`, `src/ui/panels/PropertiesPanel.tsx`,
  `src/ui/Toolbar.tsx`, `src/ui/use-keyboard-shortcuts.ts`,
  `src/ui/layout-actions.ts`

**Interfaces:**
- Produces: `Hit = { kind: "node"; key } | { kind: "edge"; key } | { kind: "canvas" }`;
  `SelectionKind = "node" | "edge"`; `Tool = "select" | "node" | "edge"`;
  l'effetto `{ type: "create-node"; at: Point }`; `selectAllNodes()`.

- [ ] **Step 1: Rinominare in `interaction.ts` e nel suo test**

Solo stringhe e nomi di tipo. Il reducer non ha logica da cambiare: non chiama
`erDiagram()` e non legge il documento.

- [ ] **Step 2: Rinominare in `session-store.ts`**

`SelectionKind`, `Tool`, e `editing` che passa da `{ key: string } | null` a:

```ts
/** `name` = rinomina inline dell'header; `body` = editor dei membri (solo classi). */
editing: { key: string; target: "name" | "body" } | null
```

Chi oggi chiama `setEditing({ key })` passa `{ key, target: "name" }`.

- [ ] **Step 3: Rinominare nei consumatori**

`selId("entity", k)` → `selId("node", k)`, `selId("relationship", k)` →
`selId("edge", k)`, `selectAllEntities` → `selectAllNodes`, `create-entity` →
`create-node`. In `Toolbar.tsx` i valori dello `ToggleGroup` passano da
`"entity"`/`"relation"` a `"node"`/`"edge"`; **le etichette visibili e gli
`aria-label` restano «Entità» e «Relazione»** — diventeranno per tipo nel Task
13, e cambiarli ora romperebbe gli e2e senza motivo.

- [ ] **Step 4: Verificare che il DOM non sia cambiato**

Run: `grep -rn "data-node-id\|data-edge-id" src | wc -l` e confrontare col
valore prima del task. `hitTest` cercava già quegli attributi: se il conteggio
cambia, hai toccato il markup e non solo i tipi.

- [ ] **Step 5: Test, build, lint e i cinque e2e**

Run: `pnpm test && pnpm build && pnpm lint && pnpm e2e`
Expected: 332 test verdi e **5 scenari e2e PASS**. Gli e2e usano solo
`data-node-id` e `data-edge-id`, quindi non dovrebbero accorgersi di nulla: se
uno fallisce, il rename ha cambiato comportamento.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: il canvas parla di nodi e archi, non di entità

Il reducer delle interazioni, la selezione e gli strumenti non hanno
mai avuto bisogno di sapere che i nodi fossero entità: interaction.ts
non chiama nemmeno erDiagram(). Cambiano le parole, non la logica.

Il contratto DOM era già neutro (data-node-id, data-edge-id), quindi
nessuna asserzione e2e cambia, e la selezione vive nella sessione, che
non entra né nell'undo né nel file: il prefisso non ha niente da
migrare.

editing guadagna un target, perché le classi avranno due superfici di
editing sul nodo invece di una."
```

## Task 4: Tre comandi che non sono per tipo

**Files:**
- Create: `src/editor/commands/view.ts`, `src/editor/commands/view.test.ts`
- Modify: `src/editor/commands/er.ts` (togliere `moveNodes` e `setCollapsed`),
  `src/editor/commands/layout.ts` (togliere `applyLayout`), e i loro chiamanti
- Test: `src/editor/commands/view.test.ts`

**Interfaces:**
- Produces:

```ts
/** La view del diagramma, qualunque sia il tipo: `view.nodes` è la proprietà
 *  comune della union e ha la stessa forma nei due membri. */
export function diagramView(doc: DevDocument): { nodes: Record<string, NodeView> }
export function moveNodes(keys: readonly string[], dx: number, dy: number): Recipe | null
export function setCollapsed(key: string, collapsed: boolean): Recipe
export function applyLayout(positions: LayoutPositions): Recipe
```

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, expect, it } from "vitest"
import { createErDocument } from "@/model/er/schema"
import { applyLayout, moveNodes } from "./view"

/** Un documento ER con due nodi in posizioni note. I nomi sono inventati. */
function docConDueNodi() {
  const doc = createErDocument("prova")
  doc.diagram.model.entities["cliente"] = { name: "cliente", attributes: [] }
  doc.diagram.model.entities["ordine"] = { name: "ordine", attributes: [] }
  doc.diagram.view.nodes["cliente"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.view.nodes["ordine"] = { x: 100, y: 0, collapsed: false }
  return doc
}

describe("moveNodes condiviso", () => {
  it("sposta e snappa senza sapere che tipo di diagramma sia", () => {
    const doc = docConDueNodi()
    moveNodes(["cliente"], 13, 27)!(doc)
    expect(doc.diagram.view.nodes["cliente"]).toEqual({ x: 10, y: 30, collapsed: false })
    expect(doc.diagram.view.nodes["ordine"]!.x).toBe(100)
  })

  it("uno spostamento nullo non produce recipe", () => {
    expect(moveNodes(["cliente"], 0, 0)).toBeNull()
  })
})

describe("applyLayout condiviso", () => {
  it("trasla dal minimo e ignora le posizioni di nodi che non esistono", () => {
    const doc = docConDueNodi()
    applyLayout({ cliente: { x: 500, y: 500 }, ordine: { x: 600, y: 500 }, fantasma: { x: 0, y: 0 } })(doc)
    expect(doc.diagram.view.nodes["cliente"]).toEqual({ x: 40, y: 40, collapsed: false })
    expect(doc.diagram.view.nodes["ordine"]).toEqual({ x: 140, y: 40, collapsed: false })
    expect(doc.diagram.view.nodes["fantasma"]).toBeUndefined()
  })
})
```

- [ ] **Step 2: Eseguirlo e vederlo fallire**

Run: `pnpm vitest run src/editor/commands/view.test.ts`
Expected: FAIL, «Failed to resolve import "./view"».

- [ ] **Step 3: Creare `view.ts` spostando i tre comandi**

Sposta i corpi di `moveNodes` e `setCollapsed` da `commands/er.ts` e di
`applyLayout` da `commands/layout.ts`, sostituendo `erDiagram(draft)` con
`diagramView(draft)`. `diagramView` è una riga: `doc.diagram.view`. **Non serve
un guard sul tipo**, perché `view` è una proprietà comune della union con la
stessa forma nei due membri e `tsc` la accetta direttamente. Se `tsc` protesta,
è il segnale che le due `view` hanno divergato e va risolto lì, non con un cast.

- [ ] **Step 4: Aggiornare i chiamanti**

`grep -rn "moveNodes\|setCollapsed\|applyLayout" src` e puntarli a
`@/editor/commands/view`. I test esistenti di `er.test.ts` e `layout.test.ts`
che coprono quei tre comandi si spostano in `view.test.ts`: **nessun caso si
perde**.

- [ ] **Step 5: Verificare**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: 332 test più i quattro nuovi (o 332 se gli spostati coprivano già
questi casi: il conteggio va **letto e riportato**, non assunto).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(editor): drag, collasso e layout non sono per tipo

moveNodes, setCollapsed e applyLayout toccano soltanto view.nodes, e
quella forma è identica nei due tipi di diagramma: chiamavano
erDiagram() solo per restringere la union, non perché guardassero il
modello.

Diventano condivisi sopra un accessore che legge la proprietà comune
della union. Tre implementazioni che il class diagram non dovrà
riscrivere, e il percorso del drag resta un solo pezzo di codice."
```

## Task 5: `DiagramOps` e `erOps`, e il canvas che non sa più cos'è un'entità

Il task più rischioso del piano: riscrive le funzioni interne di
`use-canvas-interaction.ts`, che è codice sensibile alle prestazioni.

**Files:**
- Create: `src/editor/kinds/ops.ts`, `src/editor/kinds/er.ts`,
  `src/editor/kinds/ops.test.ts`
- Modify: `src/editor/edge-routing.ts` (due campi in `EdgeGeometry`),
  `src/ui/canvas/dom-registry.ts` (un blocco),
  `src/ui/canvas/use-canvas-interaction.ts`, `src/editor/actions.ts`,
  `src/ui/layout-actions.ts`

**Interfaces:**
- Consumes: `diagramView` e i tre comandi condivisi (Task 4); la geometria
  divisa (Task 2); il vocabolario `node`/`edge` (Task 3).
- Produces:

```ts
export interface EdgeEnds { key: string; source: string; target: string }

export interface DiagramOps {
  nodeKeys(): string[]
  /** `at` sovrascrive la posizione: serve all'anteprima del drag. */
  rectOf(key: string, at?: Point): Rect | null
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
  addNode(at: Point): { key: string; recipe: Recipe }
  addEdge(source: string, target: string): { key: string; recipe: Recipe }
  deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
  duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
  layoutGraph(): LayoutGraph
  validate(): Issue[]
}

/** Chiuso sullo snapshot: il chiamante lo ricrea a ogni lettura dello store. */
export function opsFor(doc: DevDocument): DiagramOps
```

`EdgeGeometry` guadagna `sourceEnd?: Point` e `targetEnd?: Point` (capi per le
molteplicità, assenti nell'ER).

- [ ] **Step 1: Scrivere la batteria condivisa che fallisce**

Il test è scritto **contro l'interfaccia, non contro l'ER**, perché il Task 11
lo rieseguirà sulle ops delle classi. Struttura:

```ts
import { describe, expect, it } from "vitest"
import type { DevDocument } from "@/model/document"
import { createErDocument } from "@/model/er/schema"
import { opsFor } from "./ops"

/** Contratto che ogni tipo di diagramma deve rispettare. Il Task 11 richiama
 *  questa funzione con un documento di classi. */
export function verificaContrattoOps(nome: string, docConDueNodiEUnArco: () => DevDocument) {
  describe(`DiagramOps: ${nome}`, () => {
    it("nodeKeys elenca solo i nodi presenti nella view", () => {
      const ops = opsFor(docConDueNodiEUnArco())
      expect(ops.nodeKeys().sort()).toHaveLength(2)
    })

    it("rectOf torna null per una chiave inesistente", () => {
      expect(opsFor(docConDueNodiEUnArco()).rectOf("inesistente")).toBeNull()
    })

    it("rectOf con `at` usa la posizione data e non quella della view", () => {
      const ops = opsFor(docConDueNodiEUnArco())
      const key = ops.nodeKeys()[0]!
      const fermo = ops.rectOf(key)!
      const spostato = ops.rectOf(key, { x: fermo.x + 70, y: fermo.y })!
      expect(spostato.x).toBe(fermo.x + 70)
      expect(spostato.w).toBe(fermo.w)
    })

    it("edgesTouching trova l'arco da uno solo dei due estremi", () => {
      const ops = opsFor(docConDueNodiEUnArco())
      const [primo] = ops.nodeKeys()
      expect(ops.edgesTouching(new Set([primo!]))).toHaveLength(1)
    })

    it("edgesTouching non trova nulla per una chiave che non esiste", () => {
      expect(opsFor(docConDueNodiEUnArco()).edgesTouching(new Set(["inesistente"]))).toHaveLength(0)
    })

    it("addNode produce una chiave nuova e un recipe che la crea", () => {
      const doc = docConDueNodiEUnArco()
      const { key, recipe } = opsFor(doc).addNode({ x: 40, y: 40 })
      recipe(doc)
      expect(opsFor(doc).nodeKeys()).toContain(key)
    })

    it("addEdge collega due nodi esistenti", () => {
      const doc = docConDueNodiEUnArco()
      const ops = opsFor(doc)
      const [a, b] = ops.nodeKeys()
      const { recipe } = ops.addEdge(a!, b!)
      recipe(doc)
      expect(opsFor(doc).edgesTouching(new Set([a!]))).toHaveLength(2)
    })

    it("deleteItems torna null quando non c'è niente da cancellare", () => {
      expect(opsFor(docConDueNodiEUnArco()).deleteItems([], [])).toBeNull()
    })

    it("cancellare un nodo porta via gli archi che lo toccavano", () => {
      const doc = docConDueNodiEUnArco()
      const [a] = opsFor(doc).nodeKeys()
      opsFor(doc).deleteItems([a!], [])!(doc)
      const dopo = opsFor(doc)
      expect(dopo.nodeKeys()).toHaveLength(1)
      expect(dopo.edgesTouching(new Set(dopo.nodeKeys()))).toHaveLength(0)
    })

    it("duplicateNodes torna chiavi nuove e non tocca gli originali", () => {
      const doc = docConDueNodiEUnArco()
      const prima = opsFor(doc).nodeKeys()
      const { keys, recipe } = opsFor(doc).duplicateNodes([prima[0]!])
      recipe(doc)
      expect(keys).toHaveLength(1)
      expect(prima.every((k) => opsFor(doc).nodeKeys().includes(k))).toBe(true)
    })

    it("layoutGraph esclude i nodi senza view e gli archi con un estremo mancante", () => {
      const graph = opsFor(docConDueNodiEUnArco()).layoutGraph()
      expect(graph.nodes).toHaveLength(2)
      expect(graph.edges).toHaveLength(1)
      expect(graph.nodes.every((n) => n.w > 0 && n.h > 0)).toBe(true)
    })

    it("validate torna un array, vuoto o no, e mai undefined", () => {
      expect(Array.isArray(opsFor(docConDueNodiEUnArco()).validate())).toBe(true)
    })
  })
}

/** Documento ER con due entità e una relazione fra loro. Nomi inventati. */
function docEr(): DevDocument {
  const doc = createErDocument("prova")
  const d = doc.diagram
  const pk = { type: "int", primaryKey: true, foreignKey: false, nullable: false, unique: false }
  d.model.entities["cliente"] = { name: "cliente", attributes: [{ name: "id", ...pk }] }
  d.model.entities["ordine"] = {
    name: "ordine",
    attributes: [
      { name: "id", ...pk },
      { name: "cliente_id", type: "int", primaryKey: false, foreignKey: true, nullable: false, unique: false },
    ],
  }
  d.model.relationships["ordine_cliente"] = {
    source: { entity: "ordine", attributes: ["cliente_id"], cardinality: "many" },
    target: { entity: "cliente", attributes: ["id"], cardinality: "one" },
    identifying: false,
  }
  d.view.nodes["cliente"] = { x: 0, y: 0, collapsed: false }
  d.view.nodes["ordine"] = { x: 200, y: 0, collapsed: false }
  return doc
}

verificaContrattoOps("er", docEr)
```

- [ ] **Step 2: Eseguirlo e vederlo fallire**

Run: `pnpm vitest run src/editor/kinds/ops.test.ts`
Expected: FAIL, `./ops` non risolve.

- [ ] **Step 3: Scrivere `ops.ts` ed `er.ts`**

`opsFor(doc)` fa uno `switch` su `doc.diagram.type` e torna l'oggetto per quel
tipo. `erOps(doc)` chiude sul documento e delega ai comandi ER esistenti:
`rectOf` è `entityRect(entity, { ...view, ...at })`, `edgeGeometry` chiama
`edgeGeometry(a, b, rel)` di `edge-routing`, `addNode` è `addEntity`, `addEdge`
è `addRelationship`, `deleteItems` e `duplicateNodes` sono i comandi omonimi,
`layoutGraph` e `validate` le funzioni esistenti. **Nessuna logica nuova:**
questo file è cablaggio, e se ti trovi a scrivere logica hai sbagliato posto.

- [ ] **Step 4: Aggiungere i due campi a `EdgeGeometry` e il blocco a `dom-registry`**

In `edge-routing.ts`, `EdgeGeometry` guadagna `sourceEnd?: Point` e
`targetEnd?: Point`; la `edgeGeometry` dell'ER **non li popola** (l'ER non ha
molteplicità testuali). In `dom-registry.setEdgeGeometry`, dopo il blocco di
`data-edge-label`, aggiungere:

```ts
  // Molteplicità agli estremi: esistono solo nei class diagram, e il guard fa
  // saltare il blocco quando gli elementi non ci sono — come per l'etichetta.
  if (geo.sourceEnd) positionLabel(g, "[data-edge-source-label]", geo.sourceEnd)
  if (geo.targetEnd) positionLabel(g, "[data-edge-target-label]", geo.targetEnd)
```

con `positionLabel` funzione locale che fa `querySelector` e scrive `x`/`y`.

- [ ] **Step 5: Riscrivere l'hook e `actions.ts` sopra le ops**

In `use-canvas-interaction.ts`: `collectDragTargets` usa
`ops.edgesTouching`, `previewDrag` usa `ops.rectOf(key, posizioneSpostata)` e
`ops.edgeGeometry`, `entityCenter` diventa `nodeCenter` sopra `ops.rectOf`,
`entitiesIn` diventa `nodesIn` sopra `ops.nodeKeys` e `ops.rectOf`. I tre
effetti chiamano `ops.addNode`, `ops.addEdge`, e `commit-drag` resta su
`moveNodes` condiviso. `erDiagram` esce dagli import di questo file.

In `actions.ts`: `deleteSelection` e `duplicateSelection` passano dalle ops;
`selectAllNodes` è `opsFor(doc).nodeKeys()`; `fitToContent` è
`ops.nodeKeys().flatMap(k => ops.rectOf(k) ?? [])`. In `layout-actions.ts`,
`layoutGraph(erDiagram(doc))` diventa `opsFor(doc).layoutGraph()`.

Run: `grep -rn "erDiagram" src/ui/canvas src/editor/actions.ts src/ui/layout-actions.ts`
Expected: nessun risultato.

- [ ] **Step 6: Test, build, lint, e2e**

Run: `pnpm test && pnpm build && pnpm lint && pnpm e2e`
Expected: tutti i test verdi e 5 scenari e2e PASS.

- [ ] **Step 7: Misurare le prestazioni e riportare i numeri**

Run: `pnpm perf 300`

**Questo è un controllo di non-regressione, non un traguardo assoluto**, e la
differenza è sostanziale: il criterio `p95 ≤ 20 ms` **non è soddisfatto oggi**.
Lo zoom è un FAIL documentato — 33,5–41,7 ms secondo il display — registrato in
`docs/perf/2026-09-06-fps-frame-dipinti.md` e dichiarato nel README. Chiedere un
PASS assoluto qui vorrebbe dire chiedere di sistemare lo zoom, che è un altro
lavoro (è layout-bound: 1.716 ms su 2.439 dello scenario sono layout, e la
rotella non passa dal codice che questo task riscrive).

Quello che il task deve dimostrare è di **non peggiorare** i quattro scenari che
riscrive — `drag`, `dragAll`, `marquee`, `marqueeAll` — più `pan` come controllo.

**Riporta la tabella nel report, non un giudizio.** E riporta anche le colonne
del profiler (script, stile, layout), perché il p95 può essere cieco: su un
display a 60 Hz ogni scenario tranne lo zoom sta già sul pavimento di 17,4 ms, e
il p95 non ha risoluzione per mostrare né un miglioramento né un peggioramento
moderato. Su ProMotion a 120 Hz il pavimento è 9,3 ms e la risoluzione c'è.

Se uno dei cinque scenari peggiora, **rimisura il commit precedente nella stessa
sessione e sullo stesso display** prima di concludere: è il metodo che il §3bis
di quel documento ha già usato con `git stash`, e serve perché i p95 assoluti fra
sessioni e display diversi non sono confrontabili. Due misure concordi sono un
segnale; una sola non lo è.

Baseline di riferimento a 300 entità (§3, ProMotion 120 Hz, pavimento 9,3 ms):
drag 10,4 · dragAll 18,0 · pan 10,3 · marquee 10,3 · zoom **41,7** ·
marqueeAll 10,3.

Nota: `pnpm perf` guida un Chrome **visibile** e la finestra non va toccata né
coperta durante la misura. Se non puoi garantirlo, dillo nel report: una misura
disturbata va dichiarata, non presentata come risultato.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(editor): il canvas passa da DiagramOps

Il canvas sapeva cos'è un'entità in sette punti dell'hook e in due
di actions.ts. Ora passa da un'interfaccia di dieci metodi dichiarata
una volta per tipo di diagramma, e con l'ER come unico tipo il
comportamento è invariato: la prova sono i test esistenti e i cinque
scenari e2e.

La batteria di ops.test.ts è scritta contro l'interfaccia e non contro
l'ER, perché il class diagram la rieseguirà identica: è così che si
dimostra che i due tipi rispettano lo stesso contratto.

EdgeGeometry guadagna due capi opzionali per le molteplicità, che l'ER
non popola, e setEdgeGeometry un blocco con lo stesso guard che aveva
già per l'etichetta."
```

## Task 6: `DiagramView` e `erView`

**Files:**
- Create: `src/ui/canvas/kinds/registry.ts`, `src/ui/canvas/kinds/er.tsx`
- Modify: `src/ui/canvas/layers.tsx`, `src/ui/Toolbar.tsx`,
  `src/ui/panels/PropertiesPanel.tsx`, `src/ui/panels/IssuesPanel.tsx`,
  `src/ui/export/svg.tsx`, `src/ui/export/TextExportDialog.tsx`

**Interfaces:**
- Consumes: `opsFor` (Task 5).
- Produces:

```ts
export type TextFormat = "postgres" | "mysql" | "mermaid" | "class-mermaid"

export interface DiagramView {
  NodesLayer: ComponentType
  EdgesLayer: ComponentType
  Properties: ComponentType
  tools: {
    node: { label: string; key: string; Icon: LucideIcon }
    edge: { label: string; key: string; Icon: LucideIcon }
  }
  textFormats: TextFormat[]
}
export function viewFor(type: Diagram["type"]): DiagramView
export function useDiagramView(): DiagramView   // hook: legge il tipo dallo store
```

- [ ] **Step 1: Creare il registro con il solo ER**

`erView` raccoglie i componenti esistenti: `NodesLayer` ed `EdgesLayer` da
`layers.tsx`, `Properties` è il corpo attuale di `PropertiesPanel`, `tools` è
`{ node: { label: "Entità", key: "e", Icon: Square }, edge: { label: "Relazione", key: "r", Icon: Spline } }`,
`textFormats` è `["postgres", "mysql", "mermaid"]`.

- [ ] **Step 2: Far passare i consumatori dal registro**

`Canvas.tsx` monta `view.NodesLayer` e `view.EdgesLayer`; `Toolbar.tsx` legge
etichette, icone e tasti da `view.tools`; `PropertiesPanel` diventa la cornice
(titolo e caso «niente selezionato») e monta `view.Properties` per il corpo;
`IssuesPanel` usa `opsFor(doc).validate()` invece di `validateEr` diretto;
`TextExportDialog` legge i formati da `view.textFormats`.

- [ ] **Step 3: L'export immagini passa dalle viste a prop**

`svg.tsx` rende oggi `EntityNodeView` e `RelationshipEdgeView` direttamente. Per
non allargare l'interfaccia con due componenti in più adesso, `DiagramView`
resta com'è e `svg.tsx` fa il proprio `switch` sul tipo, **con un commento che
dice perché**: l'export costruisce un albero fuori da React DOM e non ha uno
store da cui leggere, quindi ha bisogno delle viste a prop e non dei layer. Il
Task 12 aggiunge il ramo delle classi a quello switch.

- [ ] **Step 4: Verificare**

Run: `pnpm test && pnpm build && pnpm lint && pnpm e2e`
Expected: tutto verde, 5 e2e PASS. La UI deve essere **identica**: se un
tooltip, un'etichetta o l'ordine dei pulsanti cambia, è un errore di questo task.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): i componenti del canvas passano da un registro

Layer, corpo del pannello proprietà, etichette degli strumenti e
formati dell'export testo vengono da un oggetto dichiarato per tipo di
diagramma invece di essere cablati sull'ER. Con un tipo solo l'interfaccia
è identica a prima, ed è quello che gli e2e verificano.

L'export immagini resta su uno switch proprio: costruisce un albero
fuori da React DOM e non ha uno store da cui leggere, quindi vuole le
viste a prop e non i layer sottoscritti."
```

---

# Fase B — il class diagram

Da qui il lavoro è additivo: la fase A ha lasciato un posto dove metterlo.

## Task 7: Il modello delle classi

**Files:**
- Create: `src/model/class/schema.ts`, `src/model/class/schema.test.ts`
- Modify: `src/model/document.ts` (union a due membri)

**Interfaces:**
- Consumes: `Identifier`, `NodeViewSchema` da `@/model/shared`;
  `SCHEMA_VERSION` da `@/model/shared`; `DevDocument` da `@/model/document`, con
  `import type` — `createClassDocument` chiuderebbe lo stesso ciclo di valori che
  il Task 1 ha rotto.
- Produces: `VisibilitySchema`, `Visibility`, `StereotypeSchema`, `Stereotype`,
  `ClassAttributeSchema`, `ClassAttribute`, `ParameterSchema`, `Parameter`,
  `ClassMethodSchema`, `ClassMethod`, `ClassNodeSchema`, `ClassNode`,
  `RelationKindSchema`, `RelationKind`, `ClassEndSchema`, `ClassEnd`,
  `ClassRelationSchema`, `ClassRelation`, `ClassModelSchema`, `ClassModel`,
  `ClassDiagramSchema`, `ClassDiagram`, `ClassDocument`,
  `createClassDocument(name: string, id?: string): ClassDocument`.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, expect, it } from "vitest"
import { DocumentSchema } from "../document"
import { createErDocument } from "../er/schema"
import { SCHEMA_VERSION } from "../shared"
import { ClassDiagramSchema, createClassDocument } from "./schema"

/** Un diagramma di classi minimo con due classi e una relazione fra loro.
 *  `patch` sovrascrive campi della relazione, per provare i casi rifiutati. */
function diagrammaConRelazione(patch: Record<string, unknown>) {
  return {
    type: "class",
    model: {
      classes: {
        Ordine: { name: "Ordine", stereotype: "class", attributes: [], methods: [] },
        Cliente: { name: "Cliente", stereotype: "class", attributes: [], methods: [] },
      },
      relations: {
        r1: {
          kind: "association",
          source: { class: "Ordine", multiplicity: "*", role: "" },
          target: { class: "Cliente", multiplicity: "1", role: "cliente" },
          ...patch,
        },
      },
    },
    view: { nodes: {} },
  }
}

describe("schema del class diagram", () => {
  it("un documento classe appena creato valida contro DocumentSchema", () => {
    expect(DocumentSchema.safeParse(createClassDocument("prova")).success).toBe(true)
  })

  it("la chiave di una classe è il suo nome, e il modello non la ricontrolla", () => {
    const doc = createClassDocument("prova")
    doc.diagram.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("uno stereotipo fuori dai quattro è rifiutato", () => {
    const r = ClassDiagramSchema.safeParse({
      type: "class",
      model: { classes: { X: { name: "X", stereotype: "trait", attributes: [], methods: [] } }, relations: {} },
      view: { nodes: {} },
    })
    expect(r.success).toBe(false)
  })

  it("un tipo di relazione fuori dai sei è rifiutato, e uno dei sei è accettato", () => {
    // Il verso positivo non è ridondante: un negativo da solo passerebbe anche se
    // fosse la forma dell'oggetto a essere sbagliata, non l'enum a rifiutare.
    expect(ClassDiagramSchema.safeParse(diagrammaConRelazione({})).success).toBe(true)
    expect(ClassDiagramSchema.safeParse(diagrammaConRelazione({ kind: "friendship" })).success).toBe(false)
  })

  it("un attributo con tipo vuoto è legale: è così che si scrive un valore di enum", () => {
    const doc = createClassDocument("prova")
    doc.diagram.model.classes["Stato"] = {
      name: "Stato", stereotype: "enum",
      attributes: [{ name: "IN_CORSO", type: "", visibility: "public", isStatic: false }],
      methods: [],
    }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("i documenti ER continuano a validare: la union è allargata, non cambiata", () => {
    const er = createErDocument("prova")
    expect(DocumentSchema.safeParse(er).success).toBe(true)
    // Nessuna migrazione: se questa riga cambia, ogni file già salvato va migrato.
    expect(SCHEMA_VERSION).toBe(1)
    expect(er.schemaVersion).toBe(SCHEMA_VERSION)
  })
})
```

- [ ] **Step 2: Eseguirlo e vederlo fallire**

Run: `pnpm vitest run src/model/class/schema.test.ts`
Expected: FAIL, `./schema` non risolve.

- [ ] **Step 3: Scrivere `src/model/class/schema.ts`**

Copia gli schemi dalla §4 della spec **verbatim**, con i loro commenti. `type`
sugli attributi e sui metodi è `z.string()` senza `min`, perché il vuoto è
legale. `ClassModelSchema` è
`z.object({ classes: z.record(z.string(), ClassNodeSchema), relations: z.record(z.string(), ClassRelationSchema) })`.
**Nessun `.refine` sulla coerenza fra chiave e nome:** l'ER ce l'ha perché la
chiave è composta (`schema.nome`), qui la chiave è il nome e un refine sarebbe
una tautologia che costa un errore di validazione a ogni rinomina in corso.

- [ ] **Step 4: Allargare la union in `document.ts`**

`z.discriminatedUnion("type", [ErDiagramSchema, ClassDiagramSchema])`. Il
commento «Flowchart, class e sequence si aggiungono qui nei piani successivi»
diventa «Flowchart e sequence si aggiungono qui nei piani successivi».

- [ ] **Step 5: Verificare**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: tutti verdi. **`pnpm build` è il punto critico:** allargare una union
discriminata fa emergere ogni posto che assumeva un solo membro senza
restringere. Se `tsc` segnala errori, sono veri e vanno risolti restringendo,
non con `as`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(model): lo schema del class diagram

Due array per i membri e non uno con parameters nullable: UML ha due
scomparti, e un tipo che li tiene separati non mente sulla propria forma.
isStatic e isAbstract invece di static e abstract perché il secondo non si
può destrutturare.

source è il figlio e target il padre, come nell'ER dove source è il lato
della foreign key: così l'auto layout inverte gli archi come già fa e le
superclassi finiscono in alto senza codice nuovo.

Nessuna migrazione: la union allargata lascia validi i file esistenti e
SCHEMA_VERSION resta 1."
```

## Task 8: Il parser e il serializzatore dei membri

Il cuore dell'ergonomia: senza import, questa è l'unica porta d'ingresso del
diagramma.

**Files:**
- Create: `src/model/class/members.ts`, `src/model/class/members.test.ts`

**Interfaces:**
- Consumes: `ClassAttribute`, `ClassMethod`, `Visibility` da `./schema`.
- Produces:

```ts
export interface Members { attributes: ClassAttribute[]; methods: ClassMethod[] }
export type ParseResult =
  | { ok: true; value: Members }
  | { ok: false; line: number; message: string }

/** Testo → membri. `line` nell'errore è 1-based, per dirlo all'utente. */
export function parseMembers(text: string): ParseResult
/** Membri → forma canonica per la textarea: `+ id: int`, spazio singolo. */
export function memberText(m: Members): string
/** Membri → righe rese sul nodo, colonne allineate con spazi. */
export function memberLines(m: Members): string[]
```

- [ ] **Step 1: Scrivere i test che falliscono — round trip prima di tutto**

```ts
import { describe, expect, it } from "vitest"
import { memberLines, memberText, parseMembers, type Members } from "./members"

/** Le dieci righe della tabella §5 della spec, tutte insieme. */
const TESTO = [
  "+ id: int",
  "- nome: string",
  "# creatoIl: DateTime",
  "~ interno: bool",
  "titolo: string",
  "IN_CORSO",
  "+ salva(x: int, y: string): void",
  "+ {static} conta(): int",
  "+ {abstract} render(): string",
  "+ Persona(nome: string)",
].join("\n")

function parsa(text: string): Members {
  const r = parseMembers(text)
  if (!r.ok) throw new Error(`atteso ok, ricevuto errore a riga ${r.line}: ${r.message}`)
  return r.value
}

describe("parseMembers", () => {
  it("legge visibilità, tipo e modificatori dalle dieci forme", () => {
    const m = parsa(TESTO)
    expect(m.attributes).toEqual([
      { name: "id", type: "int", visibility: "public", isStatic: false },
      { name: "nome", type: "string", visibility: "private", isStatic: false },
      { name: "creatoIl", type: "DateTime", visibility: "protected", isStatic: false },
      { name: "interno", type: "bool", visibility: "package", isStatic: false },
      { name: "titolo", type: "string", visibility: "public", isStatic: false },
      { name: "IN_CORSO", type: "", visibility: "public", isStatic: false },
    ])
    expect(m.methods).toEqual([
      { name: "salva", type: "void", visibility: "public", isStatic: false, isAbstract: false,
        parameters: [{ name: "x", type: "int" }, { name: "y", type: "string" }] },
      { name: "conta", type: "int", visibility: "public", isStatic: true, isAbstract: false, parameters: [] },
      { name: "render", type: "string", visibility: "public", isStatic: false, isAbstract: true, parameters: [] },
      { name: "Persona", type: "", visibility: "public", isStatic: false, isAbstract: false,
        parameters: [{ name: "nome", type: "string" }] },
    ])
  })

  it("le righe vuote si saltano senza diventare membri", () => {
    expect(parsa("+ a: int\n\n\n- b: int").attributes).toHaveLength(2)
  })

  it("i modificatori si accettano in qualsiasi ordine", () => {
    const uno = parsa("+ {static} {abstract} f(): void").methods[0]!
    const due = parsa("+ {abstract} {static} f(): void").methods[0]!
    expect(uno).toEqual(due)
  })

  it("un tipo con parentesi nei parametri non confonde il tipo di ritorno", () => {
    const m = parsa("+ trova(f: Map<K, V>): List<T>").methods[0]!
    expect(m.type).toBe("List<T>")
    expect(m.parameters).toEqual([{ name: "f", type: "Map<K, V>" }])
  })

  it("rifiuta le parentesi non bilanciate dicendo quale riga", () => {
    const r = parseMembers("+ a: int\n+ salva(x: int")
    expect(r).toMatchObject({ ok: false, line: 2 })
    expect(r.ok === false && r.message).toMatch(/parentesi/i)
  })

  it("rifiuta un modificatore che non esiste", () => {
    expect(parseMembers("+ {virtual} f(): void")).toMatchObject({ ok: false, line: 1 })
  })

  it("rifiuta un nome vuoto", () => {
    expect(parseMembers("+ : int")).toMatchObject({ ok: false, line: 1 })
  })

  it("rifiuta {abstract} su un attributo: il modello non ha dove metterlo", () => {
    const r = parseMembers("+ {abstract} x: int")
    expect(r).toMatchObject({ ok: false, line: 1 })
    expect(r.ok === false && r.message).toMatch(/attributo/i)
  })
})

describe("round trip", () => {
  it("parseMembers(memberText(m)) è m", () => {
    const m = parsa(TESTO)
    expect(parsa(memberText(m))).toEqual(m)
  })

  it("memberText produce la forma canonica, non quella allineata", () => {
    expect(memberText(parsa("+   id   :   int"))).toBe("+ id: int")
  })
})

describe("memberLines", () => {
  it("allinea i nomi con spazi, perché il font è monospace", () => {
    const righe = memberLines(parsa("+ id: int\n- descrizione: string"))
    expect(righe[0]!.indexOf("int")).toBe(righe[1]!.indexOf("string"))
  })

  it("un tipo vuoto non lascia due punti pendenti", () => {
    expect(memberLines(parsa("IN_CORSO"))[0]!).not.toContain(":")
  })
})
```

- [ ] **Step 2: Eseguirli e vederli fallire**

Run: `pnpm vitest run src/model/class/members.test.ts`
Expected: FAIL, `./members` non risolve.

- [ ] **Step 3: Implementare il parser**

Algoritmo per riga, nell'ordine:

1. `trim()`; se vuota, salta.
2. Se il primo carattere è uno di `+-#~`, quella è la visibilità e si consuma;
   altrimenti `public`. Mappa: `+` public, `-` private, `#` protected,
   `~` package.
3. `trim()`; finché la riga inizia con `{`, leggi fino a `}`: il contenuto,
   `trim()`ato, deve essere `static` o `abstract`, altrimenti errore
   «modificatore sconosciuto: "…"». Un `{` senza `}` è errore.
4. Cerca la prima `(`. Se non c'è, è un **attributo**: il tipo è ciò che segue
   l'ultimo `:` **al livello zero di parentesi** — tonde, angolari, quadre e
   graffe — e il nome è ciò che precede. Il «fuori dalle parentesi» è la regola
   4 della §5 della spec e **non** va perso: `+ x: { a: int }` e
   `+ m: Map<K, V>` sono input plausibili per chi scrive TypeScript, e un
   `lastIndexOf(":")` nudo li spezza nel punto sbagliato. È la stessa scansione
   a livello zero che serve ai parametri: una primitiva, due usi.
   Se `isAbstract` era stato letto, errore «un attributo non può essere
   abstract». Nome vuoto → errore. **Il nome va validato:** se contiene un
   carattere strutturale (`(`, `)`, `{`, `}`, `<`, `>`, `:`, `,`) è un errore
   con la sua riga, non un nome da accettare — altrimenti `+ f)(x: int)`
   produce un membro di nome `f)` senza che nessuno protesti, e lo schema lo
   rifiuta molto più tardi, con la riga sbagliata.
5. Se c'è: trova la `)` che la chiude **contando le parentesi** (i tipi generici
   con virgole non hanno parentesi, ma un tipo come `(int) => void` sì, e il
   conteggio è tre righe contro un `lastIndexOf` che sbaglia). Nessuna
   chiusura → errore «parentesi non bilanciate». Il nome è ciò che precede la
   `(`; i parametri sono l'interno diviso per virgola **al livello zero di
   parentesi e di parentesi angolari**, con **contatori separati per i due
   tipi**: con un contatore unico una `<` mai chiusa tiene la profondità sopra
   zero per tutto il resto della riga, e da lì in poi nessuna virgola viene più
   riconosciuta — i parametri successivi spariscono dentro il tipo del primo, in
   silenzio. Una parentesi mai chiusa dentro i parametri è un **errore con la
   sua riga**, non un parametro da assorbire. È quello che fa passare il test su
   `Map<K, V>`. Dopo la `)`, un `:` opzionale introduce il tipo di ritorno; se
   manca, il tipo è `""`.

`memberText`: attributi e poi metodi, ciascuno
`${simbolo}${modificatori} ${nome}${parametri}${tipo ? ": " + tipo : ""}`.
`memberLines`: come `attributeLines` dell'ER — calcola `nameW` come il massimo
delle lunghezze dei nomi e usa `padEnd`.

- [ ] **Step 4: Verificarli verdi**

Run: `pnpm vitest run src/model/class/members.test.ts`
Expected: PASS, tutti.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(model): il testo dei membri di una classe, letto e scritto

Senza import DDL il testo sul nodo è l'unica porta d'ingresso di un
class diagram, quindi la sintassi è progettata per essere scritta a
mano: la visibilità è un carattere, i modificatori stanno in graffe, e
un membro è un metodo se ha una parentesi.

Il round trip è l'invariante che tiene: memberText produce la forma
canonica e memberLines quella allineata, e riaprire la textarea deve
ridare esattamente i membri che c'erano. Sono funzioni distinte proprio
per questo.

Le parentesi si contano invece di cercare l'ultima, e le virgole dei
parametri si dividono al livello zero: un tipo generico con virgole
dentro è il caso che un lastIndexOf sbaglia."
```

## Task 9: Geometria delle classi e punte UML

**Files:**
- Create: `src/editor/class/geometry.ts`, `src/editor/class/geometry.test.ts`

**Interfaces:**
- Consumes: costanti e `Point`/`Rect`/`Size` da `@/editor/geometry`;
  `ClassNode`, `RelationKind` da `@/model/class/schema`; `memberLines` da
  `@/model/class/members`; `Dir` da `@/editor/edge-routing`, che è
  `{ x: -1 | 0 | 1; y: -1 | 0 | 1 }` e **non** una stringa. Le quattro costanti
  `RIGHT`/`LEFT`/`UP`/`DOWN` esistono in quel file ma **non sono esportate**:
  esportale in questo task, perché servono a `umlMarkerPath` e ai suoi test.
- Produces:

```ts
export const STEREO_H = 16
/** `true` per interface ed enum: hanno una riga ««nome»» dentro l'header. */
export function hasStereotypeLine(node: ClassNode): boolean
export function classSize(node: ClassNode, collapsed: boolean): Size
export function classRect(node: ClassNode, view: NodeView): Rect
/** Punta UML sul capo dell'arco. Un solo marker per arco: cade sempre sul target. */
export function umlMarkerPath(at: Point, dir: Dir, kind: RelationKind): string
/** `true` se la linea dell'arco va tratteggiata: realizzazione e dipendenza. */
export function isDashed(kind: RelationKind): boolean
/** `true` se la punta va riempita: solo la composizione. */
export function isFilled(kind: RelationKind): boolean
```

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
import { describe, expect, it } from "vitest"
import { HEADER_H, MIN_W, ROW_H } from "../geometry"
import { DOWN, LEFT, RIGHT, UP } from "../edge-routing"
import { classSize, isDashed, isFilled, STEREO_H, umlMarkerPath } from "./geometry"

const vuota = { name: "Cliente", stereotype: "class", attributes: [], methods: [] } as const

describe("classSize", () => {
  it("una classe senza membri è alta come il solo header", () => {
    expect(classSize(vuota, false)).toEqual({ w: MIN_W, h: HEADER_H })
  })

  it("uno scomparto vuoto non occupa spazio", () => {
    const soloAttributi = { ...vuota, attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }] }
    expect(classSize(soloAttributi, false).h).toBe(HEADER_H + ROW_H + 6)
  })

  it("due scomparti pieni sommano due volte il margine", () => { /* attributi e metodi insieme */ })

  it("interface ed enum aggiungono la riga dello stereotipo, class e abstract no", () => {
    expect(classSize({ ...vuota, stereotype: "interface" }, false).h).toBe(HEADER_H + STEREO_H)
    expect(classSize({ ...vuota, stereotype: "abstract" }, false).h).toBe(HEADER_H)
  })

  it("collassata: solo header, e lo stereotipo resta perché è nell'header", () => {
    const piena = { ...vuota, stereotype: "interface", attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }] }
    expect(classSize(piena, true).h).toBe(HEADER_H + STEREO_H)
  })

  it("la larghezza cresce col membro più lungo e resta multipla di GRID", () => { /* … */ })
})

describe("punte e linee", () => {
  it("solo realizzazione e dipendenza sono tratteggiate", () => {
    expect(["realization", "dependency"].every(isDashed)).toBe(true)
    expect(["association", "generalization", "composition", "aggregation"].some(isDashed)).toBe(false)
  })

  it("solo la composizione ha la punta piena", () => {
    expect(isFilled("composition")).toBe(true)
    expect(isFilled("aggregation")).toBe(false)
  })

  it("l'associazione non disegna punta", () => {
    expect(umlMarkerPath({ x: 0, y: 0 }, UP, "association")).toBe("")
  })

  it("generalizzazione e realizzazione condividono il triangolo", () => {
    const a = umlMarkerPath({ x: 10, y: 10 }, UP, "generalization")
    expect(umlMarkerPath({ x: 10, y: 10 }, UP, "realization")).toBe(a)
  })

  it("il path parte dal punto dato, in tutte e quattro le direzioni", () => {
    for (const dir of [UP, DOWN, LEFT, RIGHT]) {
      expect(umlMarkerPath({ x: 40, y: 50 }, dir, "generalization")).toContain("40")
    }
  })
})
```

- [ ] **Step 2: Eseguirli e vederli fallire**

Run: `pnpm vitest run src/editor/class/geometry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare**

`classSize` segue la formula della §6 della spec. La larghezza è
`Math.max(MIN_W, Math.ceil((chars * CHAR_W + 2 * PAD_X) / GRID) * GRID)` dove
`chars` è il massimo fra la lunghezza del nome, quella di `«stereotipo»` se c'è
la riga, e le lunghezze delle righe dei membri. `umlMarkerPath` torna `""` per
l'associazione, un triangolo per generalizzazione e realizzazione, un rombo per
composizione e aggregazione, due segmenti per la dipendenza. Guarda
`crowsFootPath` in `edge-routing.ts` per la convenzione di come `dir` orienta il
path e riusala.

- [ ] **Step 4: Verificarli verdi e committare**

```bash
git add -A
git commit -m "feat(editor): geometria della classe e punte UML

Tre scomparti invece di due, con le stesse formule di entitySize: uno
scomparto vuoto non si disegna, come già succede a un'entità senza
attributi.

Una funzione sola per le punte, non due come per la zampa di gallina:
con la convenzione source=figlio e target=padre ogni punta cade sul
target e il source è sempre nudo. Il rombo della composizione va sul
tutto, che è il target — è l'errore che si fa di solito, e la
convenzione lo risolve prima che si presenti.

Tratteggio e riempimento sono predicati sul kind e non geometria: il
renderer li usa come prop statiche, e setEdgeGeometry riscrive solo i
path."
```

## Task 10: Validazione delle classi

**Files:**
- Create: `src/model/class/validate.ts`, `src/model/class/validate.test.ts`

**Interfaces:**
- Consumes: `ClassModel` da `./schema`; `Issue` da `../issue` (i cinque codici
  delle classi sono già nella union, Task 2).
- Produces: `export function validateClass(model: ClassModel): Issue[]`

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
import { describe, expect, it } from "vitest"
import { validateClass } from "./validate"
import type { ClassModel } from "./schema"

const classe = (name: string, extra: Partial<ClassNode> = {}): ClassNode =>
  ({ name, stereotype: "class", attributes: [], methods: [], ...extra })

/** Un modello con le classi date e le relazioni date. Nomi inventati. */
function modello(classi: ClassNode[], relazioni: ClassRelation[] = []): ClassModel { /* … */ }

const end = (c: string) => ({ class: c, multiplicity: "", role: "" })
const gen = (figlio: string, padre: string): ClassRelation =>
  ({ kind: "generalization", source: end(figlio), target: end(padre) })

describe("validateClass", () => {
  it("un modello vuoto non ha problemi", () => {
    expect(validateClass(modello([]))).toEqual([])
  })

  it("due classi che differiscono solo per maiuscole: avviso", () => {
    const issues = validateClass(modello([classe("Cliente"), classe("cliente")]))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: "class-name-clash", severity: "warning" })
  })

  it("attributo duplicato: errore", () => {
    const c = classe("Cliente", { attributes: [
      { name: "id", type: "int", visibility: "public", isStatic: false },
      { name: "id", type: "string", visibility: "public", isStatic: false },
    ] })
    expect(validateClass(modello([c]))[0]).toMatchObject({ code: "duplicate-member", severity: "error", node: "Cliente" })
  })

  it("due metodi con lo stesso nome ma parametri diversi sono un overload legale", () => {
    const c = classe("Cliente", { methods: [
      { name: "trova", type: "void", visibility: "public", isStatic: false, isAbstract: false, parameters: [{ name: "a", type: "int" }] },
      { name: "trova", type: "void", visibility: "public", isStatic: false, isAbstract: false, parameters: [{ name: "a", type: "string" }] },
    ] })
    expect(validateClass(modello([c]))).toEqual([])
  })

  it("due metodi con nome e tipi dei parametri identici: errore", () => { /* parametri con nomi diversi, tipi uguali */ })

  it("una relazione verso una classe inesistente: errore", () => {
    const issues = validateClass(modello([classe("Cliente")], [gen("Cliente", "Fantasma")]))
    expect(issues[0]).toMatchObject({ code: "dangling-relation", severity: "error" })
  })

  it("un ciclo di generalizzazione di due: errore", () => {
    const issues = validateClass(modello([classe("A"), classe("B")], [gen("A", "B"), gen("B", "A")]))
    expect(issues.filter((i) => i.code === "generalization-cycle")).toHaveLength(1)
  })

  it("un ciclo di generalizzazione di tre: errore, e uno solo", () => {
    const m = modello([classe("A"), classe("B"), classe("C")], [gen("A", "B"), gen("B", "C"), gen("C", "A")])
    expect(validateClass(m).filter((i) => i.code === "generalization-cycle")).toHaveLength(1)
  })

  it("una gerarchia a diamante non è un ciclo", () => {
    const m = modello([classe("A"), classe("B"), classe("C"), classe("D")],
      [gen("B", "A"), gen("C", "A"), gen("D", "B"), gen("D", "C")])
    expect(validateClass(m).filter((i) => i.code === "generalization-cycle")).toHaveLength(0)
  })

  it("un metodo abstract in una classe concreta: avviso", () => {
    const c = classe("Cliente", { methods: [
      { name: "f", type: "void", visibility: "public", isStatic: false, isAbstract: true, parameters: [] },
    ] })
    expect(validateClass(modello([c]))[0]).toMatchObject({ code: "abstract-method-in-concrete-class", severity: "warning" })
  })

  it("lo stesso metodo in una classe abstract o interface non è un problema", () => { /* stereotype: "abstract" e "interface" */ })
})
```

- [ ] **Step 2: Eseguirli, vederli fallire, implementare**

Il ciclo si trova con una DFS a tre stati (bianco, grigio, nero) sul sottografo
di `generalization` e `realization`: un arco verso un grigio è un ciclo. Emetti
**un solo** issue per ciclo trovato, non uno per arco — è il senso dei due test
sulla lunghezza. Il diamante è la controprova che non stai segnalando i nodi
visitati due volte.

- [ ] **Step 3: Verificare e committare**

```bash
git add -A
git commit -m "feat(model): validazione del class diagram

Cinque regole, con le severità della convenzione in uso: errore per i
difetti strutturali, avviso per i consigli di modellazione.

Il ciclo di generalizzazione è l'unica regola concettualmente nuova del
progetto: nell'ER un ciclo di foreign key è legittimo, in una gerarchia
di ereditarietà no. DFS a tre stati, un issue per ciclo e non uno per
arco, e un test sul diamante come controprova che non si segnalano i
nodi visitati due volte.

Un overload con parametri di tipo diverso è legale: si confrontano nome
e tipi, non il solo nome."
```

## Task 11: Comandi e `classOps`

**Files:**
- Create: `src/editor/class/commands.ts`, `src/editor/class/commands.test.ts`,
  `src/editor/kinds/class.ts`
- Modify: `src/editor/kinds/ops.ts` (il ramo `"class"` dello switch),
  `src/editor/kinds/ops.test.ts` (rieseguire la batteria sulle classi)

**Interfaces:**
- Consumes: `DiagramOps`, `EdgeEnds` da `./ops` (Task 5); la geometria delle
  classi (Task 9); `validateClass` (Task 10); `parseMembers`/`Members` (Task 8);
  `uniqueKey` da `@/editor/commands/er` — **è generico** (`Record<string, unknown>`
  più una base), quindi si riusa invece di riscriverlo; i tre comandi condivisi
  (Task 4).
- Produces:

```ts
export function addClass(classes: Record<string, unknown>, at: Point): { key: string; recipe: Recipe }
export function renameClass(key: string, name: string): Recipe | null
export function setStereotype(key: string, stereotype: Stereotype): Recipe
export function setMembers(key: string, members: Members): Recipe
export function addRelation(relations: Record<string, unknown>, source: string, target: string): { key: string; recipe: Recipe }
export function updateRelation(key: string, mutate: (r: ClassRelation) => void): Recipe
export function deleteClassItems(classKeys: readonly string[], relationKeys: readonly string[]): Recipe | null
export function duplicateClasses(model: ClassModel, keys: readonly string[]): { keys: string[]; recipe: Recipe }
export function classLayoutGraph(diagram: ClassDiagram): LayoutGraph
/** L'oggetto che `opsFor` torna per `type === "class"`. */
export function classOps(doc: DevDocument): DiagramOps
```

- [ ] **Step 1: Riusare la batteria del contratto sulle classi**

In `ops.test.ts`, accanto a `verificaContrattoOps("er", docEr)`, aggiungere:

```ts
/** Documento classe con due classi e una generalizzazione. Nomi inventati. */
function docClass(): DevDocument {
  const doc = createClassDocument("prova")
  doc.diagram.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
  doc.diagram.model.classes["Persona"] = { name: "Persona", stereotype: "abstract", attributes: [], methods: [] }
  doc.diagram.view.nodes["Cliente"] = { x: 0, y: 100, collapsed: false }
  doc.diagram.view.nodes["Persona"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.model.relations["r1"] = {
    kind: "generalization",
    source: { class: "Cliente", multiplicity: "", role: "" },
    target: { class: "Persona", multiplicity: "", role: "" },
  }
  return doc
}

verificaContrattoOps("class", docClass)
```

**Questa è la prova che i due tipi rispettano lo stesso contratto**, ed è il
motivo per cui la batteria del Task 5 era scritta contro l'interfaccia.

- [ ] **Step 2: Eseguirla e vederla fallire**

Run: `pnpm vitest run src/editor/kinds/ops.test.ts`
Expected: FAIL su tutti i casi `class`, perché `opsFor` non ha il ramo.

- [ ] **Step 3: Scrivere i comandi, con i loro test propri**

`commands.test.ts` copre quello che la batteria non vede:

```ts
it("setMembers non produce patch se i membri sono identici", () => { /* il dispatch tornerà false */ })
it("renameClass rifiuta un nome che collide con una classe esistente", () => { /* torna null */ })
it("renameClass sposta anche la view e gli estremi delle relazioni", () => {
  // la chiave è il nome: rinominare vuol dire ricreare la voce sotto un'altra
  // chiave, e ogni relazione che la nominava va aggiornata. È il caso che
  // l'ER risolve con entityKey e qui va risolto a mano.
})
it("duplicateClasses usa i suffissi di uniqueKey e non ne inventa altri", () => { /* _2, _3 */ })
it("cancellare una classe porta via le relazioni che la toccavano", () => { /* … */ })
```

`renameClass` è il comando che merita più attenzione: nell'ER la chiave è
`schema.nome` e la rinomina ha già il suo percorso; qui la chiave **è** il nome,
quindi rinominare significa spostare la voce nel record e riscrivere ogni
estremo di relazione che la nominava. Una collisione torna `null`, come fa
`renameEntity`.

`duplicateClasses` riusa `uniqueKey`, che usa i suffissi `_2`/`_3` — **non**
`_copy2`, che è l'incoerenza di `duplicateEntities` registrata in
`docs/debito-tecnico.md`. Non replicarla.

- [ ] **Step 4: Scrivere `classOps` e il ramo dello switch**

Cablaggio, come `erOps`: `rectOf` è `classRect`, `edgeGeometry` compone
`routeEdge` con `umlMarkerPath` e popola `sourceEnd`/`targetEnd` **solo se
almeno una molteplicità non è vuota** (una molteplicità vuota non deve
piazzare un'etichetta invisibile che il drag poi inseguirebbe),
`layoutGraph` è `classLayoutGraph` — che inverte gli archi esattamente come
quello dell'ER, con lo stesso commento sul perché.

- [ ] **Step 5: Verificare**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: la batteria del contratto passa **per entrambi i tipi**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(editor): comandi e ops del class diagram

Il ramo class di opsFor, e i comandi sul modello delle classi. La
batteria del contratto scritta nel task della giuntura gira ora su
entrambi i tipi senza una riga di differenza: è la prova che la
giuntura è un contratto e non un'astrazione decorativa.

renameClass è il comando che costa: qui la chiave è il nome, quindi
rinominare sposta la voce nel record e riscrive gli estremi di ogni
relazione che la nominava. Nell'ER la chiave composta rende il problema
diverso.

duplicateClasses usa i suffissi _2 e _3 di uniqueKey, non i _copy2 di
duplicateEntities: quell'incoerenza è già registrata nel debito
tecnico e non va replicata."
```

## Task 12: I renderer della classe e dell'arco

**Files:**
- Create: `src/ui/canvas/ClassNode.tsx`, `src/ui/canvas/ClassEdge.tsx`,
  `src/ui/canvas/class-render.test.tsx`
- Modify: `src/ui/export/svg.tsx` (il ramo `class` dello switch del Task 6)

**Interfaces:**
- Consumes: la geometria delle classi (Task 9); `memberLines` (Task 8);
  `registerNode`/`registerEdge` da `./dom-registry`.
- Produces: `ClassNodeView` e `ClassNode`, `ClassEdgeView` e `ClassEdge`, con le
  stesse coppie prop/store di `EntityNode` e `RelationshipEdge`.

**Contratto DOM da rispettare**, perché è ciò che l'hit test e gli e2e leggono:
il nodo è un `<g data-node-id="…" transform="translate(x y)">` con il `<rect>` a
piena dimensione **per primo**, e `data-node-header` sull'header. L'arco è un
`<g data-edge-id="…">` con `data-edge-hit`, `data-edge-line`,
`data-edge-source`, `data-edge-target`, e — nuovi — `data-edge-source-label` e
`data-edge-target-label` per le molteplicità, che `dom-registry` cerca con
quei selettori (Task 5).

- [ ] **Step 1: Scrivere i test che falliscono, con `renderToStaticMarkup`**

Sul modello di `src/ui/canvas/render.test.tsx`:

```ts
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { classSize, STEREO_H } from "@/editor/class/geometry"
import { HEADER_H } from "@/editor/geometry"
import { ClassNodeView } from "./ClassNode"
import { ClassEdgeView } from "./ClassEdge"

const cliente = {
  name: "Cliente", stereotype: "class" as const,
  attributes: [{ name: "id", type: "int", visibility: "public" as const, isStatic: false }],
  methods: [{ name: "salva", type: "void", visibility: "private" as const, isStatic: false, isAbstract: false, parameters: [] }],
}

describe("ClassNodeView", () => {
  it("disegna header, nome e i due scomparti", () => {
    const html = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={cliente} view={{ x: 10, y: 20, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="Cliente"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain(">Cliente<")
    expect(html).toContain("+ id: int")
    expect(html).toContain("- salva(): void")
    expect(html).toContain(`height="${classSize(cliente, false).h}"`)
  })

  it("uno scomparto vuoto non produce il suo separatore", () => {
    const senzaMetodi = { ...cliente, methods: [] }
    const html = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={senzaMetodi} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    // Un separatore per scomparto presente: header→attributi, e nient'altro.
    expect((html.match(/data-compartment-rule/g) ?? [])).toHaveLength(1)
  })

  it("interface mostra la riga dello stereotipo, class no", () => {
    const i = renderToStaticMarkup(<ClassNodeView nodeKey="S" node={{ ...cliente, stereotype: "interface" }} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(i).toContain("«interface»")
    expect(renderToStaticMarkup(<ClassNodeView nodeKey="C" node={cliente} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)).not.toContain("«")
  })

  it("abstract mette il nome in corsivo invece di una riga in più", () => {
    const html = renderToStaticMarkup(<ClassNodeView nodeKey="P" node={{ ...cliente, stereotype: "abstract" }} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(html).toContain("italic")
    expect(html).not.toContain("«")
  })

  it("collassata: solo header, nessuna riga di membro", () => {
    const html = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={cliente} view={{ x: 0, y: 0, collapsed: true }} selected />)
    expect(html).not.toContain("+ id: int")
    expect(html).toContain(`height="${HEADER_H}"`)
  })
})

describe("ClassEdgeView", () => {
  const rects = { source: { x: 0, y: 200, w: 160, h: 40 }, target: { x: 0, y: 0, w: 160, h: 40 } }

  it("realizzazione e dipendenza sono tratteggiate, le altre no", () => {
    for (const kind of ["realization", "dependency"] as const) {
      expect(renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione(kind)} {...rects} selected={false} />)).toContain("stroke-dasharray")
    }
    expect(renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione("generalization")} {...rects} selected={false} />)).not.toContain("stroke-dasharray")
  })

  it("la composizione ha la punta piena, l'aggregazione vuota", () => { /* fill sul data-edge-target */ })

  it("le molteplicità compaiono solo quando non sono vuote", () => {
    expect(renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione("association")} {...rects} selected={false} />))
      .not.toContain("data-edge-source-label")
    const conMolt = relazione("association", { sourceMult: "0..*", targetMult: "1" })
    const html = renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={conMolt} {...rects} selected={false} />)
    expect(html).toContain("data-edge-source-label")
    expect(html).toContain(">0..*<")
  })

  it("l'etichetta del nome compare solo se il nome c'è", () => { /* come RelationshipEdgeView */ })
})
```

- [ ] **Step 2: Eseguirli, vederli fallire, implementare**

Segui la forma di `EntityNode.tsx` e `RelationshipEdge.tsx`: coppia
`…View` (prop) più `…` (store), `memo` sulla vista, ref callback che registra e
deregistra nel `dom-registry`. Il `<rect>` a piena dimensione va **per primo**,
altrimenti l'hit test per coordinate prende l'elemento sbagliato.

- [ ] **Step 3: Aggiungere il ramo `class` allo switch di `svg.tsx`**

- [ ] **Step 4: Verificare e committare**

Run: `pnpm test && pnpm build && pnpm lint`

```bash
git add -A
git commit -m "feat(ui): il nodo classe e i sei archi UML

Tre scomparti, con lo stereotipo reso come lo rende UML: «interface» su
una riga per interface ed enum, nome in corsivo per abstract. Uno
scomparto vuoto non si disegna e non lascia il suo separatore.

Tratteggio e riempimento sono prop statiche del renderer, non
geometria: dipendono dal kind e non dalla posizione, quindi
setEdgeGeometry continua a riscrivere solo i path. Le molteplicità si
rendono solo quando non sono vuote — un'etichetta vuota sarebbe un
elemento invisibile che il drag inseguirebbe a ogni pointermove.

I test usano renderToStaticMarkup come già fa render.test.tsx: senza
jsdom le viste a prop si provano comunque, sono le interazioni che
vanno negli e2e."
```

## Task 13: `classView`, l'editor dei membri, il pannello e il menu

**Files:**
- Create: `src/ui/canvas/kinds/class.tsx`, `src/ui/canvas/MembersEditor.tsx`,
  `src/ui/panels/ClassProperties.tsx`
- Modify: `src/ui/canvas/kinds/registry.ts`, `src/ui/canvas/InlineEditor.tsx`
  (guardia su `target`), `src/ui/canvas/use-canvas-interaction.ts` (il doppio
  click sul corpo), `src/ui/DocumentMenu.tsx`, `src/io/document-io.ts`,
  `src/ui/Toolbar.tsx`

**Interfaces:**
- Consumes: `DiagramView` (Task 6); i comandi delle classi (Task 11);
  `parseMembers`/`memberText` (Task 8); `createClassDocument` (Task 7).
- Produces: `classView`, con `tools` `{ node: { label: "Classe", key: "c", Icon: Box }, edge: { label: "Relazione", key: "r", Icon: Spline } }`
  e `textFormats: ["class-mermaid"]`; `documentIo.newDocument(type?: Diagram["type"])`.

- [ ] **Step 1: L'editor dei membri**

`MembersEditor.tsx` è una `textarea` posizionata come l'`InlineEditor`
(`worldToScreen`, larghezza dal `classSize`), montata quando
`session.editing?.target === "body"`. Al blur:

```ts
const commit = (text: string) => {
  const result = parseMembers(text)
  if (!result.ok) {
    // Rifiuto: il campo resta aperto col testo intatto. Perdere venti righe
    // appena scritte in silenzio è l'unico esito inaccettabile.
    documentSession.getState().patch({ notice: `Riga ${result.line}: ${result.message}` })
    return
  }
  const recipe = setMembers(editing.key, result.value)
  documentStore.getState().dispatch(recipe)
  close()
}
```

Attenzione: al blur il rifiuto **non deve chiudere** l'editor, e questo va
contro il comportamento normale di un blur. Rimetti il fuoco sulla `textarea`
dopo l'avviso. Escape chiude sempre, scartando.

`InlineEditor` guadagna la guardia `if (editing.target !== "name") return null`.
In `use-canvas-interaction.ts`, `onDblClick` diventa: header →
`{ key, target: "name" }`; corpo del nodo → `{ key, target: "body" }` **solo se
il diagramma è di classi** — nell'ER il corpo non è editabile come testo, e
aprire una `textarea` sugli attributi ER sarebbe una feature non chiesta. La
condizione si legge dal tipo del documento.

- [ ] **Step 2: Il pannello**

`ClassProperties.tsx`: classe selezionata → nome (con `CommitInput`, che già
ripristina quando `onCommit` torna `false`), select dello stereotipo, conteggio
dei membri in sola lettura con la frase «doppio click sul corpo per
modificarli». Relazione selezionata → select del tipo fra i sei, nome, e per
ciascun estremo molteplicità e ruolo. **Nessuna riga di form per membro.**

- [ ] **Step 3: Creazione del documento**

`documentIo.newDocument(type: Diagram["type"] = "er")` chiama
`createClassDocument` o `createErDocument`. In `DocumentMenu`, «Nuovo» diventa un
`DropdownMenuSub` con «Diagramma ER» e «Class diagram». Verifica che il
sottomenu non litighi con la chiusura del menu, che è il problema che l'export
testo ha già incontrato (§13 della spec dell'export testo).

- [ ] **Step 4: Registrare `classView` e verificare**

Run: `pnpm test && pnpm build && pnpm lint && pnpm e2e`
Expected: i 5 e2e esistenti restano PASS — sono documenti ER e non devono
accorgersi di nulla.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): scrivere un class diagram

La textarea dei membri sul corpo della classe, il pannello per ciò che
il testo non esprime, gli strumenti con etichetta e tasto propri, e
Nuovo che diventa una scelta fra due tipi di documento.

Il rifiuto di un testo non valido non chiude l'editor e rimette il
fuoco: è contro il comportamento normale di un blur, e deliberato.
Perdere in silenzio venti righe appena scritte è l'unico esito
inaccettabile, ed è la stessa ragione per cui CommitInput ripristina il
campo quando onCommit torna false.

Nessuna riga di form per membro nel pannello: sarebbe la
ricostruzione dell'alternativa scartata nel brainstorming, e due editor
per lo stesso dato divergono."
```

## Task 14: Export Mermaid delle classi

**Files:**
- Create: `src/io/emit/class-mermaid.ts`, `src/io/emit/class-mermaid.test.ts`
- Rename: `src/io/emit/mermaid.ts` → `src/io/emit/er-mermaid.ts` (e il suo test)
- Modify: `src/ui/export/TextExportDialog.tsx`

**Interfaces:**
- Consumes: `ClassModel` da `@/model/class/schema`; `EmitResult` da `./result`.
- Produces: `export function emitClassMermaid(model: ClassModel): EmitResult`

**La tabella dei lati è normativa** (§9 della spec). Si emettono solo i token
documentati, e il padre non sta sempre dallo stesso lato:

| `kind` | riga | a sinistra |
|---|---|---|
| `generalization` | `Padre <\|-- Figlio` | target |
| `realization` | `Impl ..\|> Interfaccia` | source |
| `composition` | `Tutto *-- Parte` | target |
| `aggregation` | `Tutto o-- Parte` | target |
| `dependency` | `Dipendente ..> Dipendenza` | source |
| `association` | `A -- B` | source |

- [ ] **Step 1: Scrivere i test che falliscono — sei tipi, molteplicità asimmetriche**

```ts
import { describe, expect, it } from "vitest"
import { emitClassMermaid } from "./class-mermaid"

/** Padre e figlio con molteplicità DIVERSE fra i due lati: con molteplicità
 *  uguali il test passerebbe anche a lati invertiti, che è il difetto che
 *  questi casi esistono per prendere. */
const relazione = (kind) => ({
  kind,
  source: { class: "Figlio", multiplicity: "0..*", role: "" },
  target: { class: "Padre", multiplicity: "1", role: "" },
})

describe("emitClassMermaid: i sei tipi e i loro lati", () => {
  it("generalizzazione: il padre a sinistra, con la sua molteplicità", () => {
    const { text } = emitClassMermaid(modello(relazione("generalization")))
    expect(text).toContain('Padre "1" <|-- "0..*" Figlio')
  })

  it("realizzazione: l'implementatore a sinistra", () => {
    expect(emitClassMermaid(modello(relazione("realization"))).text)
      .toContain('Figlio "0..*" ..|> "1" Padre')
  })

  it("composizione: il tutto a sinistra", () => {
    expect(emitClassMermaid(modello(relazione("composition"))).text)
      .toContain('Padre "1" *-- "0..*" Figlio')
  })

  it("aggregazione: il tutto a sinistra", () => { /* o-- */ })
  it("dipendenza: il dipendente a sinistra", () => { /* Figlio ..> Padre */ })
  it("associazione: source a sinistra, link solido", () => { /* -- */ })

  it("molteplicità vuote non producono apici vuoti", () => {
    const senza = { ...relazione("association"), source: { class: "A", multiplicity: "", role: "" }, target: { class: "B", multiplicity: "", role: "" } }
    expect(emitClassMermaid(modello(senza)).text).not.toContain('""')
  })

  it("il nome della relazione va in coda dopo i due punti", () => { /* : possiede */ })
})

describe("emitClassMermaid: i membri", () => {
  it("il tipo precede il nome nei campi", () => {
    expect(emitten("+ id: int")).toContain("+int id")
  })
  it("un attributo senza tipo esce col solo nome", () => {
    expect(emitten("IN_CORSO")).toContain("+IN_CORSO")
  })
  it("il tipo di ritorno segue le parentesi separato da spazio", () => {
    expect(emitten("+ salva(x: int): void")).toContain("+salva(int x) void")
  })
  it("statico e astratto sono classificatori in coda", () => {
    expect(emitten("+ {static} conta(): int")).toContain("+conta() int$")
    expect(emitten("+ {abstract} render(): string")).toContain("+render() string*")
  })
  it("un campo statico porta il dollaro dopo il nome", () => {
    expect(emitten("+ {static} n: int")).toContain("+int n$")
  })
  it("un costruttore non emette tipo di ritorno", () => {
    expect(emitten("+ Persona(nome: string)")).toContain("+Persona(string nome)")
  })
  it("enum diventa enumeration, class non emette annotazione", () => { /* <<enumeration>> */ })
})

describe("emitClassMermaid: nomi che Mermaid non prende nudi", () => {
  it("un nome con spazi viene sanificato e produce un avviso aggregato", () => {
    const { text, warnings } = emitClassMermaid(modelloCon("Ordine Cliente"))
    expect(text).not.toContain("Ordine Cliente")
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/1 nom/i)
  })
})
```

- [ ] **Step 2: Eseguirli, vederli fallire, implementare**

Nome sicuro: `/^[A-Za-z_][A-Za-z0-9_]*$/`. Tutto il resto si sanifica
sostituendo i caratteri fuori insieme con `_` e si conta in **un avviso
aggregato**, come vuole `result.ts` («gli avvisi sono aggregati … su un dump da
80 tabelle una riga per colonna è illeggibile»): una riga sola che dice quanti
nomi sono stati cambiati.

- [ ] **Step 3: Rinominare l'emettitore ER e collegare il dialog**

`git mv src/io/emit/mermaid.ts src/io/emit/er-mermaid.ts` più il test; due
importatori da aggiornare. Nel dialog, `class-mermaid` ha etichetta «Mermaid» ed
estensione `mmd`, e con un formato solo il `ToggleGroup` non si mostra.

- [ ] **Step 4: Verificare e committare**

Run: `pnpm test && pnpm build && pnpm lint`

```bash
git add -A
git commit -m "feat(io): export Mermaid del class diagram

La sintassi viene dalla documentazione corrente di Mermaid, non dalla
memoria, e due cose sarebbero state sbagliate: nei campi il tipo
precede il nome, e i classificatori $ e * vanno in coda dopo il tipo di
ritorno.

I lati delle relazioni sono la parte che si sbaglia. Si emettono solo i
token documentati, e quelli non mettono il padre tutti dallo stesso
lato: generalizzazione, composizione e aggregazione lo vogliono a
sinistra, realizzazione e dipendenza a destra. Ogni test ha
molteplicità diverse fra i due lati, perché con molteplicità uguali
passerebbe anche a lati invertiti.

mermaid.ts diventa er-mermaid.ts: due importatori, e non resta un file
che si chiama mermaid ed emette solo ER."
```

## Task 15: La sesta scena e2e, la misura e la documentazione

**Files:**
- Create: `scripts/e2e/class.mjs`
- Modify: `scripts/e2e/run.mjs`, `README.md`,
  `docs/superpowers/specs/2026-09-06-dev-designer-design.md`,
  `docs/debito-tecnico.md`

**Interfaces:**
- Consumes: `startEnv`, `expectNodes`, `expectMenu`, `isMainModule`,
  `pickFromMenu` da `scripts/e2e/helpers.mjs` — **leggi le firme nel file**, non
  assumerle.

- [ ] **Step 1: Scrivere la sesta scena**

Segui la forma di `scripts/e2e/layout.mjs`: docstring in italiano che dice cosa
copre e perché **non** è coperto altrove, `export async function run(browser, base)`
che apre il proprio contesto, guardia `isMainModule` per l'esecuzione isolata.

I passi, con le asserzioni che un difetto vero fa fallire:

1. «Nuovo ▸ Class diagram», e il canvas è vuoto.
2. Strumento classe, due click: due `[data-node-id]`.
3. Doppio click sull'header della prima, scrive `Persona`, Enter.
4. Doppio click sul **corpo**: la `textarea` compare. Scrive
   `+ id: int\n- nome: string\n+ {abstract} saluta(): string`, blur.
   Asserisce che il nodo mostri `+ id: int` e che sia **più alto** di prima —
   i membri hanno cambiato la geometria.
5. Scrive un testo **non valido** (`+ salva(x: int`) e asserisce che l'avviso
   compaia e che la `textarea` sia **ancora aperta**: è il comportamento del
   Task 13 e nessun test unitario può provarlo.
6. Rinomina la seconda in `Cliente`, la collega alla prima con lo strumento
   relazione, e dal pannello cambia il tipo in generalizzazione.
7. «Disponi», e asserisce che il `y` di `Persona` sia **minore** di quello di
   `Cliente`: il padre sta sopra. È la convenzione dell'ADR 0006 applicata
   all'ereditarietà.
8. «Esporta testo…», copia negli appunti, e asserisce che il testo contenga
   `Persona` **prima** di `<|--` e `Cliente` dopo. È l'asserzione che prende le
   frecce invertite.

- [ ] **Step 2: Registrarla in `run.mjs`**

Sesto import, sesta chiamata, sesto termine dell'`&&` finale, e la docstring del
file aggiornata all'elenco di sei.

- [ ] **Step 3: Eseguire i sei scenari**

Run: `pnpm e2e`
Expected: 6 scenari PASS, exit 0.

- [ ] **Step 4: Misurare le prestazioni e riportare la tabella**

Run: `pnpm perf 300`
Expected: p95 ≤ 20 ms. **Metti la tabella nel report**, e confrontala con quella
del Task 5.

- [ ] **Step 5: Aggiornare la documentazione**

`README.md`: un punto nello Stato per il class diagram (cosa c'è: classi,
membri come testo, sei relazioni, validazione, export Mermaid; e i limiti di
§16 della spec); il link alla spec nuova; l'elenco degli e2e passa da cinque a
sei; `pnpm e2e` da «cinque scenari» a «sei scenari».

`docs/superpowers/specs/2026-09-06-dev-designer-design.md`: il punto 2
dell'ordine di consegna si barra come fatto il punto 1, elencando cosa
comprende. **Rileggi l'intera sezione §2 e la riga «Auto layout» di §3 per
concetto**, non con `grep`: nell'ultimo piano quattro frasi della spec madre
dicevano il falso e due sono state trovate solo rileggendo.

`docs/debito-tecnico.md`: le voci che questo piano ha aperto e rinviato, se ce
ne sono, con la motivazione e il costo-se-sbagliato. Se non ce ne sono, non
inventarle.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(e2e): sesta scena, il class diagram nel browser

Copre le tre cose che senza un browser vero non esistono: la textarea
dei membri con fuoco e commit sul blur, il rifiuto di un testo non
valido che lascia il campo aperto, e l'ordine dei lati nell'export
Mermaid.

Le due asserzioni che valgono il test: dopo Disponi il padre ha y
minore del figlio, e nel testo esportato Persona compare prima di <|--.
La seconda è quella che prende le frecce invertite, che è come si è
preso il difetto dell'export SVG e quello di elkjs nel worker.

Documentazione allineata: lo Stato del README, il punto 2 dell'ordine
di consegna nella spec madre, e l'elenco degli scenari da cinque a sei."
```

---

## Autorevisione del piano

**Copertura della spec.** §1-2 → tutto il piano. §3 (giuntura, due metà, i tre
comandi condivisi, la rinomina) → task 3, 4, 5, 6. §4 (modello) → task 7.
§5 (membri) → task 8, più la superficie di editing nel task 13. §6 (geometria) →
task 9. §7 (sei archi, `EdgeGeometry`, `dom-registry`) → task 5 per i due campi
e il blocco, task 9 per le punte, task 12 per il rendering. §8 (validazione) →
task 10, più `Issue` nel task 2. §9 (Mermaid) → task 14. §10 (UI) → task 13, più
`svg.tsx` nei task 6 e 12. §11 (cosa arriva gratis) → nessun task, è
un'osservazione. §12 (riordino) → task 1, 2, e la rinomina dell'emettitore nel
task 14. §13 (test) → distribuito, più il task 15 per l'e2e. §14 (prestazioni) →
task 5 step 7 e task 15 step 4. §15-16 → nessun task.

Nessuna sezione della spec resta senza un task.

**Coerenza dei tipi.** `DiagramOps` ha gli stessi dieci metodi nel task 5 e nel
task 11. `Members` è il tipo prodotto dal task 8 e consumato da `setMembers`
(task 11) e dall'editor (task 13). `Issue` con `node`/`edge` è dichiarato nel
task 2 e usato da `validateClass` (task 10). `EdgeGeometry` guadagna
`sourceEnd`/`targetEnd` nel task 5 e li popola solo `classOps` (task 11), con i
selettori `data-edge-source-label`/`data-edge-target-label` che il task 12
produce e il task 5 consuma — **coppia da non far divergere**.

**Due punti da tenere d'occhio in revisione**, dichiarati qui perché è dove il
piano è più esposto:

1. Il task 5 è il solo che può degradare le prestazioni, e la sua prova è una
   tabella, non un'impressione. Un report che dice «sembra fluido» va rifiutato.
2. `renameClass` (task 11) è l'unico comando senza precedente diretto nell'ER,
   perché qui la chiave è il nome. Se un implementatore lo scrive come
   `renameEntity`, gli estremi delle relazioni restano appesi al nome vecchio e
   la validazione lo segnala come `dangling-relation`: il test dello step 3 è
   quello che deve fallire in rosso prima.
