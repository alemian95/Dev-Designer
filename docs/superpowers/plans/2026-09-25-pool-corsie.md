# Pool e corsie facoltative (step 2b) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le corsie diventano facoltative: un nodo di flusso può stare libero, e le corsie vivono dentro pool delimitati, più d'uno per documento, che si creano, si spostano, si ridimensionano e si eliminano sul canvas.

**Architecture:** il modello del flusso passa da `lanes: Lane[]` a `pools: Record<id, { name, lanes }>`, con `lane: string | null` sul nodo. Le misure salvate sono `x`, `y`, `w` del pool e `h` di ogni corsia; la `y` di una corsia si ricava, in un solo posto (`laneRects`). La migrazione 5 → 6 raccoglie le corsie di un file vecchio nel pool `pool-1`. Sul canvas il pool è un gruppo con `data-node-id="flow/<poolId>"`: la selezione e il drag esistenti funzionano da soli, e il flusso aggiunge i nodi che seguono il pool, il rifiuto dello strumento e le maniglie di ridimensionamento.

**Tech Stack:** React 19 + TypeScript strict (`noUncheckedIndexedAccess`), zustand (vanilla store), Immer (recipe con patch), zod 4, Vitest, e2e con Playwright su `vite preview` (`pnpm e2e`).

**Spec:** `docs/superpowers/specs/2026-09-25-pool-corsie-design.md`

## Scostamenti dalla spec, decisi scrivendo il piano

1. **Mermaid: i pool escono per nome, a parità per id, non per `y`.** L'emettitore promette che lo stesso modello dia lo stesso testo byte per byte (`flow-mermaid.ts`), e prende solo il modello: con la `y` lo spostamento di un pool cambierebbe l'export. Il Task 5 corregge la §8 della spec.
2. **`LANE_MARGIN` scende nel modello**, in `model/flow/schema.ts`: la migrazione lo usa e `src/model` non importa `src/editor`.
3. **`keepNodeInBand` diventa `keepInSpan(start, length, size, v)`**, su un asse qualunque: la `LaneView` non ha più la `y`, e ora un nodo rientra in una corsia anche in orizzontale.
4. **`laneAt` prende un punto, non una `y`**: dal 2b conta anche la `x`.
5. **Il rifiuto del pool è un metodo a parte, `refuseNode`**, chiamato prima di `addNode`, come `connectAcross` rifiuta prima di creare. Cambiare il tipo di ritorno di `addNode` avrebbe toccato tutti i test che lo usano.
6. **Dal Task 2 al Task 4 l'e2e `flow.mjs` è rosso per costruzione**: usa il pannello globale delle corsie e le bande, che spariscono nel Task 2. Lo riscrive il Task 5, l'unico che lancia `pnpm e2e`.
7. **Il test del runner sul «riallineamento» sparisce**: un nodo trascinato fuori dalla corsia non viene più riportato dentro, diventa libero.
8. **Nel Task 2 il pannello delle corsie di un pool (`PoolLanes`) esiste ma non è montato**: lo monta il pannello del pool nel Task 3, quando un pool si può selezionare. Nel frattempo lo copre un test.

## Global Constraints

- Lingua: commenti, docblock, messaggi e nomi dei test in italiano; identificatori in inglese, come nel codice esistente.
- Nessuna dipendenza nuova.
- `src/model` non importa `src/editor`, `src/io` né `src/ui`. `src/editor` non importa React né `src/io`. Sono regole ESLint già attive.
- Chiavi: famiglie `${family}/${key}` solo con `qualify`/`splitKey` (`src/editor/families.ts`); la chiave di selezione di un pool è `qualify("flow", poolId)`.
- `SCHEMA_VERSION` passa da 5 a 6.
- Costanti esatte: `POOL_MIN_W = 640`, `POOL_HEADER_W = 32`, `LANE_MIN_H = 160` (invariata), `LANE_MARGIN = 40`.
- Testi esatti:
  - Avviso: `Un pool non sta dentro un altro pool.`
  - Nomi nuovi: `Pool N` fra i pool del documento, `Corsia N` fra le corsie del pool (il primo `N` libero).
  - Pool della migrazione: id `pool-1`, nome `Pool 1`.
  - Strumento: etichetta `Pool`, tasto `p`.
  - Pannello: voce `Nessuna` in testa alla select `Corsia`; campo `Nome` nel pannello del pool.
- Ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Messaggi in stile repo: `feat(ambito): …` in italiano.
- Verifiche a fine task: `pnpm tsc -b`, `pnpm lint`, `pnpm test` verdi. `pnpm e2e` solo nel Task 5 (scostamento 6).
- **Non lanciare `pnpm perf`.**

## Review Focus

Casi che la spec implica ma che i test di default non coprono. Per ciascuno il test sta nel task che possiede il codice:

1. **Collega fra l'intestazione di un pool e un'entità.** `connectAcross` prenderebbe `flow/<poolId>` per un nodo di flusso e creerebbe un accesso verso un pool. Deve non creare niente e non dare avvisi. → Task 3, test «Collega da un pool non crea niente, nemmeno verso un'altra famiglia».
2. **Un pool spostato sopra dei nodi liberi.** Non li cattura; i suoi nodi lo seguono; un solo annulla riporta tutto. → Task 3, test di `moveFlowNodes` e di `canvasOps`.
3. **Eliminare una corsia in mezzo.** Le corsie sotto salgono, e i loro nodi con loro, perché la `y` si ricava. → Task 2, test di `deleteLane`.
4. **Ridimensionare non cambia mai l'appartenenza.** Né restringendo il pool sotto i suoi nodi, né abbassando una corsia sotto i suoi. → Task 4, test di `resizePool` e `resizeLane`.
5. **Un documento v6 con un pool e un nodo libero torna uguale dal file.** → Task 2, test «un pool e un nodo libero tornano uguali dal file».

---

### Task 1: Le metriche del testo e `flowNodeSize` nel modello

**Files:**
- Create: `src/model/metrics.ts`
- Create: `src/model/flow/size.ts`
- Modify: `src/editor/geometry.ts`
- Modify: `src/editor/flow/geometry.ts`
- Modify: `src/editor/flow/geometry.test.ts`

**Interfaces:**
- Produces:
  - Da `@/model/metrics` (relativo `../metrics` dentro `src/model`): `FONT_SIZE`, `CHAR_W`, `ROW_H`, `PAD_X`, `GRID`.
  - Da `@/model/flow/size`: `DECISION_FACTOR`, `flowNodeSize(node: Pick<FlowNode, "label" | "shape">): { w: number; h: number }`.
  - `@/editor/geometry` e `@/editor/flow/geometry` continuano a esportare gli stessi nomi (riesportazione): nessun chiamante cambia import.

- [ ] **Step 1: Scrivi il test che fallisce**

In `src/editor/flow/geometry.test.ts`, aggiungi agli import:

```ts
import { flowNodeSize as flowNodeSizeDelModello } from "@/model/flow/size"
import { CHAR_W as CHAR_W_DEL_MODELLO } from "@/model/metrics"
import { CHAR_W } from "@/editor/geometry"
```

e dentro `describe("flowNodeSize")`:

```ts
  it("è la funzione del modello riesportata, con le stesse metriche: una formula sola", () => {
    expect(flowNodeSize).toBe(flowNodeSizeDelModello)
    expect(CHAR_W).toBe(CHAR_W_DEL_MODELLO)
  })
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `pnpm vitest run src/editor/flow/geometry.test.ts`
Expected: FAIL, `@/model/flow/size` e `@/model/metrics` non esistono.

- [ ] **Step 3: Le metriche**

Crea `src/model/metrics.ts`:

```ts
/**
 * Le metriche del testo: convenzioni pure, senza nessuna misura nel DOM. Stanno nel modello perché
 * la migrazione 5 → 6 (spec 2b §4) deve calcolare la larghezza dei nodi di flusso, e `src/model` non
 * importa `src/editor`. `editor/geometry.ts` le riesporta, e i chiamanti le importano da lì.
 */
export const FONT_SIZE = 13
/** JetBrains Mono ha avanzamento 600/1000 em: larghezza carattere = 0,6 × font size. Nessuna misura nel DOM. */
export const CHAR_W = FONT_SIZE * 0.6
export const ROW_H = 22
export const PAD_X = 10
export const GRID = 10
```

In `src/editor/geometry.ts`, sostituisci le righe di `FONT_SIZE`, `CHAR_W`, `ROW_H`, `PAD_X` e `GRID` (compreso il commento di `CHAR_W`) con:

```ts
import { GRID } from "@/model/metrics"

// Le metriche del testo vivono nel modello (spec 2b §3): qui si riesportano, così nessun chiamante
// cambia import.
export { CHAR_W, FONT_SIZE, GRID, PAD_X, ROW_H } from "@/model/metrics"
```

`HEADER_H` e `MIN_W` restano dove sono. `snap` continua a usare `GRID`, ora importato.

- [ ] **Step 4: `flowNodeSize`**

Crea `src/model/flow/size.ts`, spostando da `src/editor/flow/geometry.ts` `DECISION_FACTOR`, `MIN_NODE_W`, `MIN_NODE_H` e `flowNodeSize` con i loro docblock, così:

```ts
import { CHAR_W, GRID, PAD_X, ROW_H } from "../metrics"
import type { FlowNode } from "./schema"

/**
 * Un rombo che deve contenere il rettangolo `w × h` del testo di un processo omologo ha bisogno di
 * `2w × 2h` (spec §7): il punto medio di ogni lato del rombo è a metà della sua diagonale, quindi
 * dimezzare il fattore vorrebbe dire che il rettangolo di testo esce dai lati obliqui. Non è una
 * scelta di stile — è la ragione per cui nei flowchart le decisioni si scrivono corte.
 */
export const DECISION_FACTOR = 2

/** Dimensione minima di un nodo appena creato, con etichetta vuota: deve restare afferrabile, non
 *  sparire in un punto. */
const MIN_NODE_W = 60
const MIN_NODE_H = 40

/**
 * Dimensione di un nodo dalla sua etichetta, sulla falsariga di `noteSize` (`class/geometry.ts`):
 * larghezza dalla riga più lunga, altezza dal numero di righe. `decision` raddoppia entrambe le
 * misure con `DECISION_FACTOR` **dopo** aver applicato i minimi, così anche un rombo vuoto resta
 * un rombo — non un punto — e non solo il rettangolo che conterrebbe.
 *
 * Sta nel modello (spec 2b §3) perché la usa la migrazione 5 → 6; `editor/flow/geometry.ts` la
 * riesporta. Prende solo etichetta e forma: la corsia non cambia la misura.
 */
export function flowNodeSize(node: Pick<FlowNode, "label" | "shape">): { w: number; h: number } {
  const lines = node.label.split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  // Arrotondata alla griglia come `entitySize`, `classSize` e `noteSize`: il bordo sinistro di un
  // nodo è già sulla griglia (`snap`, alla creazione e al drag), e senza questo arrotondamento
  // quello destro non lo sarebbe.
  const w = Math.max(MIN_NODE_W, Math.ceil((chars * CHAR_W + 2 * PAD_X) / GRID) * GRID)
  const h = Math.max(MIN_NODE_H, lines.length * ROW_H)
  return node.shape === "decision" ? { w: w * DECISION_FACTOR, h: h * DECISION_FACTOR } : { w, h }
}
```

In `src/editor/flow/geometry.ts`: cancella quelle quattro definizioni e aggiungi in testa, accanto agli altri import:

```ts
import { flowNodeSize } from "@/model/flow/size"

// La misura dei nodi vive nel modello (spec 2b §3): qui si riesporta.
export { DECISION_FACTOR, flowNodeSize } from "@/model/flow/size"
```

Togli dall'import di `../geometry` i nomi che il file non usa più (`CHAR_W`, `GRID`, `PAD_X`, `ROW_H`, `Size`, se `pnpm lint` li segnala). `flowNodeRect` resta qui.

- [ ] **Step 5: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS. Nessun altro file cambia: i chiamanti importano ancora da `@/editor/geometry` e `@/editor/flow/geometry`.

- [ ] **Step 6: Commit**

```bash
git add src/model/metrics.ts src/model/flow/size.ts src/editor/geometry.ts src/editor/flow/geometry.ts src/editor/flow/geometry.test.ts
git commit -m "$(cat <<'EOF'
refactor(model): le metriche del testo e la misura dei nodi di flusso nel modello

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Il modello dei pool, la migrazione 5 → 6, e ogni lettore delle corsie

Il task è grande perché togliere `model.lanes` rompe la compilazione in ogni file che lo legge: il modello, i comandi, il layout, l'export Mermaid, il disegno, l'export SVG e il pannello cambiano insieme. Il comportamento nuovo di questo task è solo quello che il modello impone: nodi liberi, corsie dentro i pool, appartenenza decisa dal centro del nodo. Selezione, spostamento, creazione ed eliminazione dei pool arrivano nel Task 3.

**Files:**
- Modify: `src/model/flow/schema.ts`, `src/model/flow/schema.test.ts`
- Modify: `src/model/migrations.ts`, `src/model/migrations.test.ts`
- Modify: `src/model/class/schema.test.ts`
- Modify: `src/model/flow/validate.test.ts`
- Modify: `src/editor/flow/geometry.ts`, `src/editor/flow/geometry.test.ts`
- Modify: `src/editor/flow/layout.ts`, `src/editor/flow/layout.test.ts`
- Modify: `src/editor/flow/commands.ts`, `src/editor/flow/commands.test.ts`
- Modify: `src/editor/flow/lane-invariant.ts`
- Create: `src/editor/flow/pool-fixture.ts`
- Modify: `src/editor/flow-access.ts`
- Modify: `src/editor/kinds/flow.ts`, `src/editor/kinds/flow.test.ts`
- Modify: `src/io/emit/flow-mermaid.ts`, `src/io/emit/flow-mermaid.test.ts`
- Rename: `src/ui/canvas/LanesLayer.tsx` → `src/ui/canvas/PoolsLayer.tsx`, `src/ui/canvas/LanesLayer.test.tsx` → `src/ui/canvas/PoolsLayer.test.tsx`
- Modify: `src/ui/canvas/Canvas.tsx`
- Modify: `src/ui/canvas/interaction-runner.ts` (solo un docblock), `src/ui/canvas/interaction-runner.test.ts`
- Modify: `src/ui/export/svg.tsx`, `src/ui/export/svg.test.ts`
- Modify: `src/ui/panels/FlowProperties.tsx`, `src/ui/panels/FlowProperties.test.tsx`, `src/ui/panels/PropertiesPanel.tsx`
- Modify (solo fixture): `src/model/links/labels.test.ts`, `src/model/links/validate.test.ts`, `src/editor/links/commands.test.ts`, `src/ui/panels/LinkProperties.test.tsx`, `src/ui/canvas/use-canvas-interaction.test.tsx`

**Interfaces:**
- Consumes: `flowNodeSize` da `@/model/flow/size` (Task 1).
- Produces:
  - Da `@/model/flow/schema`: `PoolSchema`, `type Pool = { name: string; lanes: Lane[] }`; `type FlowNode = { label; shape; lane: string | null }`; `type FlowModel = { pools: Record<string, Pool>; nodes; edges }`; `PoolViewSchema`, `type PoolView = { x; y; w }`; `type LaneView = { h }`; `type FlowView = { nodes; pools: Record<string, PoolView>; lanes: Record<string, LaneView> }`; `POOL_MIN_W`, `POOL_HEADER_W`, `LANE_MARGIN`, `LANE_MIN_H`; `nextName(prefix: string, existing: readonly { name: string }[]): string`. `nextLaneName` sparisce.
  - Da `@/editor/flow/geometry`: `interface PoolsPart`, `interface LaneRect extends Rect { id; poolId }`, `poolIds(part)`, `poolLaneRects(part, poolId)`, `laneRects(part)`, `laneRect(part, laneId)`, `poolRect(part, poolId, at?)`, `poolAt(part, p)`, `laneAt(part, p)`, `laneOwner(part, laneId)`, `poolMembers(d: FlowDiagram, poolId)`. Spariscono `laneBandExtent`, `LANE_MIN_W` e il vecchio `laneAt(d, y)`.
  - Da `@/editor/flow/layout`: `keepInSpan(start, length, size, v)` al posto di `keepNodeInBand`; `placeInLanes(d, positions): { positions; pools: Record<string, PoolView>; lanes: Record<string, LaneView> }`.
  - Da `@/editor/flow/commands`: `addFlowNode(at, shape, lane: string | null)`, `setNodeLane(key, laneId: string | null)`, `addLane(poolId, name)`, `moveLane(poolId, from, to)`, `deleteLane(model, id, moveTo)` (stesso nome, `moveTo` nello stesso pool), e la funzione interna `keepNodesWithLanes(d, poolId, mutate)` che i task successivi riusano.
  - Da `@/editor/flow/pool-fixture` (solo per i test): `withPool(doc, lanes = ["l1"], h = 160)`.
  - Da `@/ui/canvas/PoolsLayer`: `PoolsLayerView({ part })`, `PoolsLayer()`.
  - Da `@/ui/panels/FlowProperties`: `PoolLanes({ poolId })` (montato dal Task 3). `FlowLanesPanel` sparisce.

- [ ] **Step 1: Lo schema**

`src/model/flow/schema.ts` diventa:

```ts
import * as z from "zod"
import { Identifier, NodeViewSchema } from "../shared"

/** Le cinque forme della notazione più la nota. La nota è una forma e non una specie: a
 *  differenza di quella del class diagram non si àncora a niente, è un riquadro con del testo. */
export const FlowShapeSchema = z.enum(["terminal", "process", "decision", "io", "subprocess", "note"])
export type FlowShape = z.infer<typeof FlowShapeSchema>

export const LaneSchema = z.object({ id: Identifier, name: z.string() })
export type Lane = z.infer<typeof LaneSchema>

/**
 * Un pool: un riquadro con un nome e le sue corsie (spec 2b §3). Le corsie sono un **array**: il loro
 * ordine dall'alto in basso è l'informazione, e l'array è il posto dove vive senza poter divergere da
 * nient'altro. Almeno una: un pool senza corsie non contiene niente.
 */
export const PoolSchema = z.object({ name: z.string(), lanes: z.array(LaneSchema).min(1) })
export type Pool = z.infer<typeof PoolSchema>

export const FlowNodeSchema = z.object({
  label: z.string(),
  shape: FlowShapeSchema,
  /** `id` di una `Lane` di qualche pool, o `null` per un nodo libero (spec 2b §3). Un id e non un
   *  indice: cancellare una corsia non rinumera le altre. */
  lane: Identifier.nullable(),
})
export type FlowNode = z.infer<typeof FlowNodeSchema>

/** `label` è sempre una stringa, vuota quando non c'è: un solo modo di dire «nessuna etichetta». */
export const FlowEdgeSchema = z.object({ source: Identifier, target: Identifier, label: z.string() })
export type FlowEdge = z.infer<typeof FlowEdgeSchema>

/** Gli id delle corsie di tutti i pool: la base dei due controlli qui sotto. */
function laneIds(pools: Readonly<Record<string, Pool>>): string[] {
  return Object.values(pools).flatMap((p) => p.lanes.map((l) => l.id))
}

/**
 * I pool sono un `Record` per id (uuid) e non un array: la loro posizione è libera e il loro ordine
 * non significa niente (spec 2b §3). Un flowchart senza pool è il caso normale: i nodi sono liberi.
 */
export const FlowModelSchema = z
  .object({
    pools: z.record(z.string(), PoolSchema),
    nodes: z.record(z.string(), FlowNodeSchema),
    edges: z.record(z.string(), FlowEdgeSchema),
  })
  .refine(
    (m) => {
      const ids = laneIds(m.pools)
      return new Set(ids).size === ids.length
    },
    { message: "gli id delle corsie devono essere unici in tutto il documento", path: ["pools"] },
  )
  .refine(
    (m) => {
      const ids = new Set(laneIds(m.pools))
      return Object.values(m.nodes).every((n) => n.lane === null || ids.has(n.lane))
    },
    { message: "la corsia di un nodo deve esistere in qualche pool", path: ["nodes"] },
  )
export type FlowModel = z.infer<typeof FlowModelSchema>

/** Posizione e larghezza di un pool, striscia di intestazione compresa: salvate, non ricavate dai
 *  nodi (spec 2b §3). L'altezza è la somma delle altezze delle sue corsie. */
export const PoolViewSchema = z.object({ x: z.number(), y: z.number(), w: z.number() })
export type PoolView = z.infer<typeof PoolViewSchema>

/** L'altezza di una corsia. La `y` non si salva: la ricava `laneRects` (`editor/flow/geometry.ts`)
 *  impilando le corsie del pool, così un pool non può avere buchi né sovrapposizioni. */
export const LaneViewSchema = z.object({ h: z.number() })
export type LaneView = z.infer<typeof LaneViewSchema>

export const FlowViewSchema = z.object({
  nodes: z.record(z.string(), NodeViewSchema),
  pools: z.record(z.string(), PoolViewSchema),
  lanes: z.record(z.string(), LaneViewSchema),
})
export type FlowView = z.infer<typeof FlowViewSchema>

export const FlowDiagramSchema = z.object({
  model: FlowModelSchema,
  view: FlowViewSchema,
})
export type FlowDiagram = z.infer<typeof FlowDiagramSchema>

/**
 * Altezza minima di una corsia, e altezza di una appena creata: contiene qualunque forma con
 * un'etichetta di due righe, rombo compreso. Sta nel modello e non nel layout perché la usano i
 * comandi, il layout e la migrazione, e due costanti con lo stesso valore divergono il giorno che
 * qualcuno ne cambia una.
 */
export const LANE_MIN_H = 160

/** Larghezza di un pool appena creato, e minima quando lo si ridimensiona: prende il posto della
 *  larghezza minima delle bande di prima del 2b. */
export const POOL_MIN_W = 640

/** La striscia a sinistra del pool, con il nome ruotato come in BPMN. `PoolView.w` la comprende. */
export const POOL_HEADER_W = 32

/** Margine orizzontale fra i nodi e il bordo delle corsie: lo usano la migrazione 5 → 6 e Disponi
 *  (spec 2b §4, §6). Nel modello perché la migrazione non può importare l'editor. */
export const LANE_MARGIN = 40

/**
 * Il primo nome «`<prefisso>` N» libero: fonte unica per «Pool N» (fra i pool del documento) e per
 * «Corsia N» (fra le corsie di un pool). `N` non è `existing.length + 1` da solo: dopo che una
 * cancellazione ne toglie uno di mezzo quel conteggio ripete un nome già in uso, quindi si cerca il
 * primo numero non ancora preso fra i nomi correnti.
 */
export function nextName(prefix: string, existing: readonly { name: string }[]): string {
  const used = new Set(existing.map((e) => e.name))
  let n = existing.length + 1
  while (used.has(`${prefix} ${n}`)) n++
  return `${prefix} ${n}`
}

/** Una parte di flusso vuota: nessun pool, quindi nessuna banda (spec 2b §1). */
export function emptyFlowDiagram(): FlowDiagram {
  return { model: { pools: {}, nodes: {}, edges: {} }, view: { nodes: {}, pools: {}, lanes: {} } }
}
```

`src/model/flow/schema.test.ts` diventa:

```ts
import { describe, expect, it } from "vitest"
import { emptyFlowDiagram, FlowModelSchema, nextName } from "./schema"

const pool = (...ids: string[]) => ({ name: "Pool 1", lanes: ids.map((id) => ({ id, name: id })) })
const node = (lane: string | null) => ({ label: "Verifica", shape: "process" as const, lane })

describe("FlowModelSchema", () => {
  it("accetta un flowchart senza pool, con i nodi liberi", () => {
    expect(FlowModelSchema.safeParse({ pools: {}, nodes: { n1: node(null) }, edges: {} }).success).toBe(true)
  })

  it("accetta un nodo nella corsia di un pool", () => {
    expect(FlowModelSchema.safeParse({ pools: { p1: pool("l1") }, nodes: { n1: node("l1") }, edges: {} }).success).toBe(true)
  })

  it("rifiuta un nodo la cui corsia non esiste in nessun pool", () => {
    expect(FlowModelSchema.safeParse({ pools: { p1: pool("l1") }, nodes: { n1: node("fantasma") }, edges: {} }).success).toBe(false)
  })

  it("rifiuta due corsie con lo stesso id in due pool", () => {
    expect(FlowModelSchema.safeParse({ pools: { p1: pool("l1"), p2: pool("l1") }, nodes: {}, edges: {} }).success).toBe(false)
  })

  it("rifiuta un pool senza corsie", () => {
    expect(FlowModelSchema.safeParse({ pools: { p1: pool() }, nodes: {}, edges: {} }).success).toBe(false)
  })

  it("accetta un'etichetta d'arco vuota: è il caso normale di un arco appena creato", () => {
    const r = FlowModelSchema.safeParse({
      pools: {},
      nodes: { n1: node(null), n2: node(null) },
      edges: { e1: { source: "n1", target: "n2", label: "" } },
    })
    expect(r.success).toBe(true)
  })
})

describe("emptyFlowDiagram", () => {
  it("nasce senza pool, senza nodi e senza bande", () => {
    expect(emptyFlowDiagram()).toEqual({ model: { pools: {}, nodes: {}, edges: {} }, view: { nodes: {}, pools: {}, lanes: {} } })
  })
})

describe("nextName", () => {
  it("propone il numero successivo al conteggio, senza nomi esistenti", () => {
    expect(nextName("Corsia", [])).toBe("Corsia 1")
  })

  it("propone N = conteggio + 1 quando quel nome non è già in uso", () => {
    expect(nextName("Corsia", [{ name: "Corsia 1" }, { name: "Corsia 2" }])).toBe("Corsia 3")
  })

  /** Cancellare un elemento di mezzo lascia un buco: `length + 1` riproporrebbe un nome già in uso. */
  it("salta un nome già in uso, anche se coincide col conteggio + 1", () => {
    expect(nextName("Corsia", [{ name: "Corsia 2" }])).toBe("Corsia 3")
  })

  it("un nome fuori schema non blocca la proposta", () => {
    expect(nextName("Corsia", [{ name: "Preparazione" }])).toBe("Corsia 2")
  })

  it("vale per i pool con il loro prefisso", () => {
    expect(nextName("Pool", [{ name: "Pool 1" }])).toBe("Pool 2")
  })
})
```

- [ ] **Step 2: La migrazione 5 → 6**

In `src/model/shared.ts`: `export const SCHEMA_VERSION = 6`.

In `src/model/migrations.ts`, aggiungi agli import:

```ts
import { LANE_MARGIN, LANE_MIN_H, POOL_HEADER_W, POOL_MIN_W, type FlowNode } from "./flow/schema"
import { flowNodeSize } from "./flow/size"
```

e dopo `sameShape`:

```ts
/** Il pool in cui la migrazione 5 → 6 raccoglie le corsie di un file v5: id fisso, perché la migrazione è pura. */
const MIGRATED_POOL_ID = "pool-1"

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v)

/**
 * L'estensione orizzontale delle bande di un file v5, come la calcolava `laneBandExtent` prima del
 * 2b: l'ingombro dei nodi più `LANE_MARGIN` per lato, con la larghezza minima delle bande (640, oggi
 * `POOL_MIN_W`). Serve solo qui: dal 2b la larghezza di un pool è un dato.
 */
function v5BandExtent(nodes: Record<string, FlowNode>, views: Record<string, { x: number }>): { x: number; w: number } {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (const [key, node] of Object.entries(nodes)) {
    const view = views[key]
    if (!view) continue
    minX = Math.min(minX, view.x)
    maxX = Math.max(maxX, view.x + flowNodeSize(node).w)
  }
  if (minX > maxX) return { x: -LANE_MARGIN, w: POOL_MIN_W }
  return { x: minX - LANE_MARGIN, w: Math.max(POOL_MIN_W, maxX - minX + 2 * LANE_MARGIN) }
}

/**
 * 5 → 6: le corsie entrano in un pool (spec 2b §4).
 *
 * - Una parte di flusso **senza nodi** perde le corsie: erano quella che `lanes.min(1)` imponeva.
 * - Una parte **con nodi** raccoglie le corsie nel pool `pool-1` «Pool 1», nello stesso ordine e con
 *   le stesse altezze. La `y` del pool è quella della prima banda; `x` e `w` sono quelle che le bande
 *   avevano, più la striscia a sinistra. Le bande del v5 sono impilate senza buchi (`restackLanes`),
 *   quindi ricavare la `y` dalle altezze dà le stesse bande. I nodi non si muovono.
 */
const lanesIntoPool: Migration = (raw) => {
  const diagram = raw.diagram
  if (!isObj(diagram) || !isObj(diagram.flow)) return raw
  const flow = diagram.flow
  if (!isObj(flow.model) || !isObj(flow.view)) return raw
  const { lanes, ...model } = flow.model
  const { lanes: bands, ...view } = flow.view
  const nodes = (isObj(model.nodes) ? model.nodes : {}) as Record<string, FlowNode>
  const nodeViews = (isObj(view.nodes) ? view.nodes : {}) as Record<string, { x: number }>
  const laneList = (Array.isArray(lanes) ? lanes : []) as { id: string; name: string }[]
  const bandMap = (isObj(bands) ? bands : {}) as Record<string, { y: number; h: number } | undefined>
  const pools: Obj = {}
  const poolViews: Obj = {}
  const laneViews: Obj = {}
  const first = laneList[0]
  if (Object.keys(nodes).length > 0 && first) {
    const extent = v5BandExtent(nodes, nodeViews)
    pools[MIGRATED_POOL_ID] = { name: "Pool 1", lanes: laneList }
    poolViews[MIGRATED_POOL_ID] = { x: extent.x - POOL_HEADER_W, y: bandMap[first.id]?.y ?? 0, w: extent.w + POOL_HEADER_W }
    for (const lane of laneList) laneViews[lane.id] = { h: bandMap[lane.id]?.h ?? LANE_MIN_H }
  }
  return {
    ...raw,
    diagram: { ...diagram, flow: { ...flow, model: { ...model, pools }, view: { ...view, pools: poolViews, lanes: laneViews } } },
  }
}
```

La tabella diventa `new Map([[1, addClassNotes], [2, unifyDiagram], [3, addLinks], [4, sameShape], [5, lanesIntoPool]])`.

In `src/model/migrations.test.ts`:
- ogni `toBe(5)` su `schemaVersion` diventa `toBe(6)` (righe 26, 34, 58, 98 e 115 di oggi);
- i titoli `"un documento già alla versione corrente (5) passa senza toccare niente"` → `(6)`, `"un documento v2 arriva alla 5 passando dalla 3"` → `"… arriva alla 6 …"`, `"un documento v4 con un «mappa su» passa intatto, alla versione 5"` → `"… alla versione 6"`;
- nel test `"un ER v2 diventa la parte er, con le altre due vuote"`, `expect(r.document.diagram.flow.model.lanes).toHaveLength(1)` diventa `expect(r.document.diagram.flow.model.pools).toEqual({})`;
- nel test `"un flowchart v2 conserva corsie e nodi"`, `expect(r.ok && r.document.diagram.flow.model.lanes.map((l) => l.name)).toEqual(["A"])` diventa `expect(r.ok && r.document.diagram.flow.model.pools["pool-1"]!.lanes.map((l) => l.name)).toEqual(["A"])`;
- aggiungi agli import `import { LANE_MARGIN, POOL_HEADER_W, POOL_MIN_W } from "./flow/schema"`, e in fondo:

```ts
describe("migrazione 5 → 6", () => {
  /** Un documento v5 con la parte di flusso data. */
  function v5(flow: unknown): string {
    const doc = JSON.parse(toJson(createDocument("Prova", "v5doc"))) as { diagram: Record<string, unknown> }
    return JSON.stringify({ ...doc, schemaVersion: 5, diagram: { ...doc.diagram, flow } })
  }
  const lanes = [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Negozio" }]
  const bands = { l1: { y: 0, h: 160 }, l2: { y: 160, h: 240 } }

  it("un flusso senza nodi perde le corsie, e non nasce nessun pool", () => {
    const r = parseDocument(v5({ model: { lanes, nodes: {}, edges: {} }, view: { nodes: {}, lanes: bands } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(6)
    expect(r.document.diagram.flow.model.pools).toEqual({})
    expect(r.document.diagram.flow.view.pools).toEqual({})
    expect(r.document.diagram.flow.view.lanes).toEqual({})
  })

  it("un flusso con nodi mette le corsie in «Pool 1», con le stesse altezze, e i nodi restano dove sono", () => {
    const nodes = { n1: { label: "Ordina", shape: "process", lane: "l1" }, n2: { label: "Spedisce", shape: "process", lane: "l2" } }
    const views = { n1: { x: 100, y: 20, collapsed: false }, n2: { x: 400, y: 200, collapsed: false } }
    const r = parseDocument(v5({ model: { lanes, nodes, edges: {} }, view: { nodes: views, lanes: bands } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const flow = r.document.diagram.flow
    expect(flow.model.pools).toEqual({ "pool-1": { name: "Pool 1", lanes } })
    expect(flow.view.lanes).toEqual({ l1: { h: 160 }, l2: { h: 240 } })
    expect(flow.model.nodes).toEqual(nodes)
    expect(flow.view.nodes).toEqual(views)
    // Ingombro dei nodi 100–490 («Spedisce» è largo 90): più 40 per lato fa 470, sotto il minimo di
    // 640. Il corpo delle bande resta dov'era, la striscia si aggiunge a sinistra.
    expect(flow.view.pools["pool-1"]).toEqual({ x: 100 - LANE_MARGIN - POOL_HEADER_W, y: 0, w: POOL_MIN_W + POOL_HEADER_W })
  })

  it("un pool e un nodo libero tornano uguali dal file", () => {
    // Review Focus 5.
    const doc = createDocument("t", "t")
    doc.diagram.flow.model.pools["p1"] = { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] }
    doc.diagram.flow.view.pools["p1"] = { x: 10, y: 20, w: 700 }
    doc.diagram.flow.view.lanes["l1"] = { h: 200 }
    doc.diagram.flow.model.nodes["n1"] = { label: "libero", shape: "process", lane: null }
    doc.diagram.flow.view.nodes["n1"] = { x: 900, y: 0, collapsed: false }
    const r = parseDocument(toJson(doc))
    expect(r.ok && r.document.diagram.flow).toEqual(doc.diagram.flow)
  })
})
```

In `src/model/class/schema.test.ts`: `expect(SCHEMA_VERSION).toBe(5)` → `toBe(6)`, e il commento sopra diventa `// La versione è quella corrente: la 5 → 6 raccoglie le corsie dei flowchart nei pool.`

In `src/model/flow/validate.test.ts`, le prime righe di fixture diventano (la costante `lane` sparisce):

```ts
const n = (shape: FlowShape) => ({ label: "x", shape, lane: null })
const model = (over: Partial<FlowModel>): FlowModel => ({ pools: {}, nodes: {}, edges: {}, ...over })
```

- [ ] **Step 3: La geometria delle corsie**

In `src/editor/flow/geometry.ts`, cancella `laneAt`, `LANE_MARGIN`, `LANE_MIN_W` e `laneBandExtent` con i loro docblock, e al loro posto metti:

```ts
/** La parte del diagramma che descrive i pool: basta questa per ricavarne la geometria. `FlowDiagram` la soddisfa. */
export interface PoolsPart {
  model: { pools: Readonly<Record<string, Pool>> }
  view: { pools: Readonly<Record<string, PoolView>>; lanes: Readonly<Record<string, LaneView>> }
}

/** Il rettangolo assoluto di una corsia, con il pool a cui appartiene. */
export interface LaneRect extends Rect {
  id: string
  poolId: string
}

/**
 * Gli id dei pool nell'ordine di disegno: per id. Un `Record` non ha un ordine suo che sopravviva a
 * un giro per il file, e l'ordine serve due volte: chi sta sopra quando due pool si sovrappongono
 * (l'ultimo, spec 2b §10) e l'ordine in cui canvas ed export li disegnano.
 */
export function poolIds(part: PoolsPart): string[] {
  return Object.keys(part.model.pools).sort()
}

/** Le corsie di un pool, dall'alto in basso: la `y` di ognuna è la `y` del pool più le altezze delle
 *  precedenti, la `x` salta la striscia (spec 2b §3). */
export function poolLaneRects(part: PoolsPart, poolId: string): LaneRect[] {
  const pool = part.model.pools[poolId]
  const view = part.view.pools[poolId]
  if (!pool || !view) return []
  let y = view.y
  return pool.lanes.map((lane) => {
    const h = part.view.lanes[lane.id]?.h ?? LANE_MIN_H
    const rect = { id: lane.id, poolId, x: view.x + POOL_HEADER_W, y, w: view.w - POOL_HEADER_W, h }
    y += h
    return rect
  })
}

/**
 * Le corsie di tutti i pool, nell'ordine di disegno. **L'unico posto** che ricava i rettangoli delle
 * corsie: canvas, hit test, comandi, layout ed export passano di qui, e nessuno salva una `y`.
 */
export function laneRects(part: PoolsPart): LaneRect[] {
  return poolIds(part).flatMap((id) => poolLaneRects(part, id))
}

/** Il rettangolo della corsia `laneId`, o `null`. */
export function laneRect(part: PoolsPart, laneId: string): LaneRect | null {
  return laneRects(part).find((r) => r.id === laneId) ?? null
}

/** Il rettangolo di un pool, striscia compresa: alto quanto le sue corsie. `at` sostituisce la
 *  posizione, per l'anteprima del drag. `null` se il pool non c'è. */
export function poolRect(part: PoolsPart, poolId: string, at?: Point): Rect | null {
  const pool = part.model.pools[poolId]
  const view = part.view.pools[poolId]
  if (!pool || !view) return null
  const h = pool.lanes.reduce((sum, lane) => sum + (part.view.lanes[lane.id]?.h ?? LANE_MIN_H), 0)
  return { x: at?.x ?? view.x, y: at?.y ?? view.y, w: view.w, h }
}

/** Chiuso a sinistra e in alto, aperto a destra e in basso: il confine fra due corsie appartiene a
 *  quella di sotto, senza buchi né doppie appartenenze. */
function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
}

/** Il pool disegnato più in alto che contiene `p`, o `null`. */
export function poolAt(part: PoolsPart, p: Point): string | null {
  for (const id of poolIds(part).reverse()) {
    const r = poolRect(part, id)
    if (r && contains(r, p)) return id
  }
  return null
}

/**
 * La corsia che contiene `p`, o `null` fuori da ogni pool o sulla striscia di intestazione. Decide
 * il pool disegnato più in alto (spec 2b §10): un punto nella zona comune a due pool va a quello
 * sopra. `null` non indovina: chi crea o trascina un nodo lo rende libero.
 */
export function laneAt(part: PoolsPart, p: Point): string | null {
  const poolId = poolAt(part, p)
  if (poolId === null) return null
  return poolLaneRects(part, poolId).find((r) => contains(r, p))?.id ?? null
}

/** Il pool che contiene la corsia, o `null`. */
export function laneOwner(part: PoolsPart, laneId: string): string | null {
  for (const [id, pool] of Object.entries(part.model.pools)) {
    if (pool.lanes.some((l) => l.id === laneId)) return id
  }
  return null
}

/** I nodi di un pool: quelli la cui corsia sta nel pool. */
export function poolMembers(d: FlowDiagram, poolId: string): string[] {
  const lanes = new Set(d.model.pools[poolId]?.lanes.map((l) => l.id) ?? [])
  return Object.entries(d.model.nodes)
    .filter(([, n]) => n.lane !== null && lanes.has(n.lane))
    .map(([key]) => key)
}
```

L'import dal modello diventa `import { LANE_MIN_H, POOL_HEADER_W, type FlowDiagram, type FlowEdge, type FlowNode, type FlowShape, type LaneView, type Pool, type PoolView } from "@/model/flow/schema"`, e quello da `../geometry` deve portare `Point` e `Rect`.

In `src/editor/flow/geometry.test.ts`, cancella `describe("laneAt")` e `describe("laneBandExtent")`, correggi l'import (`laneAt`, `laneRects`, `laneOwner`, `poolAt`, `poolLaneRects`, `poolMembers`, `poolRect` da `./geometry`; niente più `laneBandExtent`, `LANE_MARGIN`, `LANE_MIN_W`; `import { POOL_HEADER_W, type FlowDiagram } from "@/model/flow/schema"`), e nella fixture `node` in testa cambia `lane: "l1"` in `lane: null`. Poi aggiungi:

```ts
/** Due pool: `a` a (0, 0), largo 400, con a1 (alta 100) e a2 (50); `b` a (300, 50), largo 400, con
 *  b1 (100). `b` viene dopo `a` nell'ordine di disegno, quindi sta sopra. */
function duePool(): FlowDiagram {
  return {
    model: {
      pools: {
        a: { name: "A", lanes: [{ id: "a1", name: "a1" }, { id: "a2", name: "a2" }] },
        b: { name: "B", lanes: [{ id: "b1", name: "b1" }] },
      },
      nodes: {
        n1: { label: "x", shape: "process", lane: "a1" },
        n2: { label: "y", shape: "process", lane: "b1" },
        n3: { label: "z", shape: "process", lane: null },
      },
      edges: {},
    },
    view: {
      nodes: {},
      pools: { a: { x: 0, y: 0, w: 400 }, b: { x: 300, y: 50, w: 400 } },
      lanes: { a1: { h: 100 }, a2: { h: 50 }, b1: { h: 100 } },
    },
  }
}

describe("laneRects", () => {
  it("impila le corsie di un pool dalle altezze, e salta la striscia", () => {
    expect(poolLaneRects(duePool(), "a")).toEqual([
      { id: "a1", poolId: "a", x: POOL_HEADER_W, y: 0, w: 400 - POOL_HEADER_W, h: 100 },
      { id: "a2", poolId: "a", x: POOL_HEADER_W, y: 100, w: 400 - POOL_HEADER_W, h: 50 },
    ])
  })

  it("tutte le corsie, nell'ordine di disegno dei pool", () => {
    expect(laneRects(duePool()).map((r) => r.id)).toEqual(["a1", "a2", "b1"])
  })

  it("un pool senza vista non ha corsie, invece di rompersi", () => {
    const d = duePool()
    delete d.view.pools["a"]
    expect(poolLaneRects(d, "a")).toEqual([])
  })
})

describe("poolRect", () => {
  it("è alto quanto le sue corsie, striscia compresa", () => {
    expect(poolRect(duePool(), "a")).toEqual({ x: 0, y: 0, w: 400, h: 150 })
  })

  it("con `at` cambia solo la posizione", () => {
    expect(poolRect(duePool(), "a", { x: 5, y: 6 })).toEqual({ x: 5, y: 6, w: 400, h: 150 })
  })

  it("null per un pool che non c'è", () => {
    expect(poolRect(duePool(), "fantasma")).toBeNull()
  })
})

describe("poolAt e laneAt", () => {
  it("trovano il pool e la corsia che contengono il punto", () => {
    expect(poolAt(duePool(), { x: 100, y: 120 })).toBe("a")
    expect(laneAt(duePool(), { x: 100, y: 120 })).toBe("a2")
  })

  it("il confine fra due corsie appartiene a quella di sotto", () => {
    expect(laneAt(duePool(), { x: 100, y: 100 })).toBe("a2")
  })

  it("sulla striscia di intestazione c'è il pool ma nessuna corsia", () => {
    expect(poolAt(duePool(), { x: 10, y: 10 })).toBe("a")
    expect(laneAt(duePool(), { x: 10, y: 10 })).toBeNull()
  })

  it("fuori da ogni pool: null", () => {
    expect(poolAt(duePool(), { x: -5, y: 10 })).toBeNull()
    expect(laneAt(duePool(), { x: 100, y: 500 })).toBeNull()
  })

  it("nella zona comune a due pool vince quello disegnato sopra", () => {
    // (350, 60) sta in a1 e in b1: `b` è disegnato dopo, quindi sopra.
    expect(laneAt(duePool(), { x: 350, y: 60 })).toBe("b1")
  })
})

describe("laneOwner e poolMembers", () => {
  it("il pool di una corsia", () => {
    expect(laneOwner(duePool(), "a2")).toBe("a")
    expect(laneOwner(duePool(), "fantasma")).toBeNull()
  })

  it("i nodi di un pool sono quelli nelle sue corsie, non i liberi", () => {
    expect(poolMembers(duePool(), "a")).toEqual(["n1"])
    expect(poolMembers(duePool(), "b")).toEqual(["n2"])
  })
})
```

- [ ] **Step 4: Il layout**

`src/editor/flow/layout.ts` diventa:

```ts
import { LANE_MARGIN, LANE_MIN_H, POOL_HEADER_W, POOL_MIN_W, type FlowDiagram, type LaneView, type PoolView } from "@/model/flow/schema"
import type { LayoutEdge, LayoutGraph, LayoutNode, LayoutPositions } from "@/model/layout"
import { snap, type Point, type Size } from "../geometry"
import { flowNodeSize } from "./geometry"

export const LANE_PAD = 20
export const ROW_GAP = 24
export const COL_GAP = 24

/**
 * Riporta `v` dentro l'intervallo `[start, start + length]`, lasciando `LANE_PAD` fra ogni bordo e un
 * ingombro di misura `size`: **l'unico posto** che scrive questa formula. Vale su un asse solo — la
 * `y` di un nodo dentro una corsia, e la `x` quando un nodo entra in una corsia alla creazione o dal
 * pannello — ed è usata da ogni comando che porta un nodo dentro una corsia scelta.
 *
 * Se l'intervallo è troppo corto per l'ingombro con i due margini — una corsia minuscola con un nodo
 * enorme — `[min, max]` si inverte: si ripiega sul centro invece di tornare un valore fuori da
 * qualunque intervallo sensato.
 */
export function keepInSpan(start: number, length: number, size: number, v: number): number {
  const min = start + LANE_PAD
  const max = start + length - LANE_PAD - size
  if (max < min) return snap(start + (length - size) / 2)
  return snap(Math.min(Math.max(v, min), max))
}

/**
 * Traduce il diagramma nel grafo da disporre, sulla forma di `commands/layout.ts` (ER): i nodi
 * senza voce in `view.nodes` sono esclusi, gli archi con un estremo fuori dal grafo sono saltati —
 * a ELK un arco monco fa rifiutare l'intero grafo.
 *
 * Gli archi **non** si invertono: a differenza dell'ER, dove `source` è la figlia e la convenzione
 * vuole i padri in alto (ADR 0006), qui `source` è già il verso del flusso. I pool non entrano nel
 * grafo: ELK dà l'asse del flusso, e i pool li impila `placeInLanes` (spec 2b §6).
 */
export function flowLayoutGraph(diagram: FlowDiagram): LayoutGraph {
  const nodes: LayoutNode[] = []
  for (const [key, node] of Object.entries(diagram.model.nodes)) {
    if (diagram.view.nodes[key]) nodes.push({ id: key, ...flowNodeSize(node) })
  }

  const present = new Set(nodes.map((n) => n.id))
  const edges: LayoutEdge[] = []
  for (const [key, edge] of Object.entries(diagram.model.edges)) {
    if (present.has(edge.source) && present.has(edge.target)) {
      edges.push({ id: key, source: edge.source, target: edge.target })
    }
  }

  return { nodes, edges, direction: "RIGHT" }
}

interface Member {
  key: string
  pos: Point
  size: Size
  row: number
}

/** I nodi con posizione da ELK che stanno nella corsia `lane` (o liberi, con `null`), da sinistra a
 *  destra e, a parità di colonna, nell'ordine che ELK aveva dato con la y. */
function membersOf(diagram: FlowDiagram, positions: LayoutPositions, lane: string | null): Member[] {
  return Object.entries(diagram.model.nodes)
    .flatMap(([key, node]) => {
      const pos = positions[key]
      return node.lane === lane && pos ? [{ key, pos, size: flowNodeSize(node), row: 0 }] : []
    })
    .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y)
}

/**
 * Dispone un gruppo di nodi in righe a partire da `top`, scrive le loro posizioni in `out` e torna
 * l'altezza usata, margini compresi (`0` per un gruppo vuoto).
 *
 * Le righe sono colorazione di intervalli: un nodo entra nella prima riga già libera alla sua x,
 * altrimenti ne apre una. Così due nodi lontani nel flusso restano affiancati invece di impilarsi,
 * e solo quelli che si accavallano davvero scendono di riga.
 */
function placeRows(members: Member[], top: number, out: LayoutPositions): number {
  const rows: { end: number; h: number }[] = []
  for (const m of members) {
    let i = rows.findIndex((r) => r.end + COL_GAP <= m.pos.x)
    if (i === -1) i = rows.push({ end: Number.NEGATIVE_INFINITY, h: 0 }) - 1
    const row = rows[i]!
    row.end = m.pos.x + m.size.w
    row.h = Math.max(row.h, m.size.h)
    // `i` è l'indice appena trovato o appena spinto due righe sopra, non un'incognita.
    m.row = i
  }
  if (rows.length === 0) return 0

  const tops: number[] = []
  let y = top + LANE_PAD
  for (const row of rows) {
    tops.push(y)
    y += row.h + ROW_GAP
  }
  for (const m of members) {
    // `m.row` indicizza `rows`, e `tops` ha un elemento per riga: la stessa garanzia di sopra.
    out[m.key] = { x: m.pos.x, y: tops[m.row]! }
  }
  return y - ROW_GAP + LANE_PAD - top
}

/** `x` e larghezza comuni a tutti i pool dopo Disponi: l'ingombro dei nodi di flusso più
 *  `LANE_MARGIN` per lato, più la striscia, mai sotto `POOL_MIN_W` (spec 2b §6). */
function poolExtent(diagram: FlowDiagram, positions: LayoutPositions): { x: number; w: number } {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (const [key, node] of Object.entries(diagram.model.nodes)) {
    const p = positions[key]
    if (!p) continue
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x + flowNodeSize(node).w)
  }
  if (minX > maxX) return { x: 0, w: POOL_MIN_W }
  return { x: minX - LANE_MARGIN - POOL_HEADER_W, w: Math.max(POOL_MIN_W, maxX - minX + 2 * LANE_MARGIN + POOL_HEADER_W) }
}

/**
 * Le posizioni di ELK corrette per i pool (spec 2b §6).
 *
 * La **x** resta quella di ELK: è l'asse del flusso. La **y** la decide la banda — ma la y di ELK non
 * si butta, si degrada a **ordinamento** dentro la banda. Le bande, dall'alto:
 *
 * 1. i nodi liberi, in una banda senza nome che non si disegna;
 * 2. i pool, nell'ordine della loro `y` attuale (a parità, per id), ognuno con le sue corsie; ogni
 *    corsia è alta quanto le sue righe, mai sotto `LANE_MIN_H`. Tutti i pool prendono la stessa `x`
 *    e la stessa larghezza, così un flusso che li attraversa resta allineato.
 *
 * Un nodo la cui corsia non esiste non entra in nessuna banda e resta fuori dal risultato.
 */
export function placeInLanes(
  diagram: FlowDiagram,
  positions: LayoutPositions,
): { positions: LayoutPositions; pools: Record<string, PoolView>; lanes: Record<string, LaneView> } {
  const out: LayoutPositions = {}
  const pools: Record<string, PoolView> = {}
  const lanes: Record<string, LaneView> = {}

  let cursor = placeRows(membersOf(diagram, positions, null), 0, out)

  const extent = poolExtent(diagram, positions)
  const y = (id: string) => diagram.view.pools[id]?.y ?? 0
  const order = Object.keys(diagram.model.pools).sort((a, b) => y(a) - y(b) || (a < b ? -1 : 1))
  for (const poolId of order) {
    const top = cursor
    // `order` viene dalle chiavi di `model.pools`: il pool c'è.
    for (const lane of diagram.model.pools[poolId]!.lanes) {
      const h = Math.max(LANE_MIN_H, placeRows(membersOf(diagram, positions, lane.id), cursor, out))
      lanes[lane.id] = { h }
      cursor += h
    }
    pools[poolId] = { x: extent.x, y: top, w: extent.w }
  }

  return { positions: out, pools, lanes }
}
```

`src/editor/flow/layout.test.ts` diventa:

```ts
import { describe, expect, it } from "vitest"
import type { FlowDiagram } from "@/model/flow/schema"
import { LANE_MARGIN, LANE_MIN_H, POOL_HEADER_W, POOL_MIN_W } from "@/model/flow/schema"
import { flowLayoutGraph, keepInSpan, LANE_PAD, placeInLanes } from "./layout"

const node = (lane: string | null) => ({ label: "x", shape: "process" as const, lane })

/**
 * I nodi (chiave → corsia, `null` se libero) e i pool (id → corsie). Il pool i-esimo sta a y = i × 1000,
 * così l'ordine delle `y` è quello della dichiarazione. Corsie alte il minimo.
 */
function diagram(nodes: Record<string, string | null>, pools: Record<string, string[]> = { p1: ["l1"] }): FlowDiagram {
  const entries = Object.entries(pools)
  return {
    model: {
      pools: Object.fromEntries(entries.map(([id, ls]) => [id, { name: id, lanes: ls.map((l) => ({ id: l, name: l })) }])),
      nodes: Object.fromEntries(Object.entries(nodes).map(([k, lane]) => [k, node(lane)])),
      edges: {},
    },
    view: {
      nodes: {},
      pools: Object.fromEntries(entries.map(([id], i) => [id, { x: 0, y: i * 1000, w: POOL_MIN_W }])),
      lanes: Object.fromEntries(entries.flatMap(([, ls]) => ls.map((l) => [l, { h: LANE_MIN_H }]))),
    },
  }
}

describe("placeInLanes", () => {
  it("non tocca la x: è l'asse del flusso, e viene da ELK", () => {
    const { positions } = placeInLanes(diagram({ a: "l1" }), { a: { x: 137, y: 999 } })
    expect(positions.a!.x).toBe(137)
  })

  it("mette ogni nodo dentro la sua corsia", () => {
    const r = placeInLanes(diagram({ a: "l1", b: "l2" }, { p1: ["l1", "l2"] }), { a: { x: 0, y: 500 }, b: { x: 0, y: 0 } })
    const top1 = r.pools.p1!.y
    const top2 = top1 + r.lanes.l1!.h
    expect(r.positions.a!.y).toBeGreaterThanOrEqual(top1)
    expect(r.positions.a!.y).toBeLessThan(top2)
    expect(r.positions.b!.y).toBeGreaterThanOrEqual(top2)
    expect(r.positions.b!.y).toBeLessThan(top2 + r.lanes.l2!.h)
  })

  it("senza nodi liberi il primo pool parte da zero, e le corsie vuote restano al minimo", () => {
    const r = placeInLanes(diagram({}, { p1: ["l1", "l2"] }), {})
    expect(r.pools.p1!.y).toBe(0)
    expect(r.lanes).toEqual({ l1: { h: LANE_MIN_H }, l2: { h: LANE_MIN_H } })
  })

  it("i nodi liberi vanno in cima, e il pool comincia sotto la loro riga", () => {
    const r = placeInLanes(diagram({ f: null, a: "l1" }), { f: { x: 0, y: 0 }, a: { x: 0, y: 0 } })
    expect(r.positions.f!.y).toBe(LANE_PAD)
    // Una riga di nodi alti 40, con LANE_PAD sopra e sotto.
    expect(r.pools.p1!.y).toBe(LANE_PAD + 40 + LANE_PAD)
    expect(r.positions.a!.y).toBe(r.pools.p1!.y + LANE_PAD)
  })

  it("i pool si impilano nell'ordine della loro y, non del loro id", () => {
    // `z` è dichiarato per primo, quindi sta a y = 0; `a` a y = 1000.
    const r = placeInLanes(diagram({}, { z: ["lz"], a: ["la"] }), {})
    expect(r.pools.z!.y).toBe(0)
    expect(r.pools.a!.y).toBe(LANE_MIN_H)
  })

  it("tutti i pool prendono la stessa x e la stessa larghezza, dall'ingombro dei nodi di flusso", () => {
    const r = placeInLanes(diagram({ f: null, a: "l1", b: "m1" }, { p1: ["l1"], p2: ["m1"] }), {
      f: { x: 0, y: 0 },
      a: { x: 100, y: 0 },
      b: { x: 2000, y: 0 },
    })
    // Ingombro 0–2060 (`b` è largo 60).
    const x = 0 - LANE_MARGIN - POOL_HEADER_W
    const w = 2060 + 2 * LANE_MARGIN + POOL_HEADER_W
    expect(r.pools.p1).toMatchObject({ x, w })
    expect(r.pools.p2).toMatchObject({ x, w })
  })

  it("con pochi nodi la larghezza non scende sotto POOL_MIN_W", () => {
    expect(placeInLanes(diagram({ a: "l1" }), { a: { x: 0, y: 0 } }).pools.p1!.w).toBe(POOL_MIN_W)
  })

  it("due nodi della stessa corsia che si accavallano in x finiscono su righe diverse", () => {
    const { positions } = placeInLanes(diagram({ a: "l1", b: "l1" }), { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } })
    expect(positions.a!.y).not.toBe(positions.b!.y)
    expect(positions.a!.x).toBe(0)
    expect(positions.b!.x).toBe(10)
  })

  it("due nodi della stessa corsia lontani in x restano sulla stessa riga", () => {
    const { positions } = placeInLanes(diagram({ a: "l1", b: "l1" }), { a: { x: 0, y: 0 }, b: { x: 900, y: 400 } })
    expect(positions.a!.y).toBe(positions.b!.y)
  })

  // Tre righe nella prima corsia: due righe minime resterebbero sotto LANE_MIN_H.
  it("una corsia le cui righe superano il minimo cresce, e la successiva parte da lì", () => {
    const r = placeInLanes(diagram({ a: "l1", b: "l1", c: "l1", d: "l2" }, { p1: ["l1", "l2"] }), {
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      c: { x: 20, y: 0 },
      d: { x: 0, y: 0 },
    })
    expect(r.lanes.l1!.h).toBeGreaterThan(LANE_MIN_H)
    expect(r.positions.d!.y).toBeGreaterThanOrEqual(r.pools.p1!.y + r.lanes.l1!.h)
  })

  it("a parità di colonna l'ordine è quello che ELK aveva dato con la y", () => {
    const { positions } = placeInLanes(diagram({ a: "l1", b: "l1" }), { a: { x: 0, y: 500 }, b: { x: 0, y: 0 } })
    expect(positions.b!.y).toBeLessThan(positions.a!.y)
  })

  it("un nodo senza posizione da ELK non compare nel risultato invece di finire a zero", () => {
    expect(placeInLanes(diagram({ a: "l1", b: "l1" }), { a: { x: 0, y: 0 } }).positions.b).toBeUndefined()
  })

  it("un nodo la cui corsia non esiste non fa esplodere la funzione, e resta fuori dal risultato", () => {
    const r = placeInLanes(diagram({ a: "fantasma" }), { a: { x: 0, y: 0 } })
    expect(r.positions.a).toBeUndefined()
    expect(r.lanes.l1!.h).toBe(LANE_MIN_H)
  })
})

describe("keepInSpan", () => {
  it("lascia stare un valore già dentro i margini", () => {
    expect(keepInSpan(100, 100, 40, 130)).toBe(130)
  })

  it("riaggancia prima dell'inizio al margine iniziale", () => {
    expect(keepInSpan(100, 100, 40, -500)).toBe(100 + LANE_PAD)
  })

  it("riaggancia oltre la fine al margine finale", () => {
    expect(keepInSpan(100, 100, 40, 500)).toBe(100 + 100 - LANE_PAD - 40)
  })

  it("un intervallo troppo corto per i due margini si ripiega sul centro", () => {
    // 2 × LANE_PAD (40) + 20 = 60 > 40: l'intervallo [min, max] è vuoto.
    expect(keepInSpan(0, 40, 20, 999)).toBe(10)
  })
})

describe("flowLayoutGraph", () => {
  function graphDiagram(over: Partial<FlowDiagram["model"]> = {}, view: Partial<FlowDiagram["view"]> = {}): FlowDiagram {
    return {
      model: { pools: {}, nodes: {}, edges: {}, ...over },
      view: { nodes: {}, pools: {}, lanes: {}, ...view },
    }
  }

  it("un nodo senza voce nella view non entra nel grafo", () => {
    const d = graphDiagram({ nodes: { a: node(null), b: node(null) } }, { nodes: { a: { x: 0, y: 0, collapsed: false } } })
    expect(flowLayoutGraph(d).nodes.map((n) => n.id)).toEqual(["a"])
  })

  it("salta l'arco con un estremo fuori dal grafo", () => {
    const d = graphDiagram(
      { nodes: { a: node(null), b: node(null) }, edges: { e1: { source: "a", target: "assente", label: "" } } },
      { nodes: { a: { x: 0, y: 0, collapsed: false }, b: { x: 0, y: 0, collapsed: false } } },
    )
    expect(flowLayoutGraph(d).edges).toEqual([])
  })

  it("non inverte gli archi: source resta la sorgente, è già il verso del flusso", () => {
    const d = graphDiagram(
      { nodes: { a: node(null), b: node(null) }, edges: { e1: { source: "a", target: "b", label: "" } } },
      { nodes: { a: { x: 0, y: 0, collapsed: false }, b: { x: 0, y: 0, collapsed: false } } },
    )
    expect(flowLayoutGraph(d).edges).toEqual([{ id: "e1", source: "a", target: "b" }])
  })

  it("la direzione è RIGHT: le corsie occupano l'asse verticale", () => {
    expect(flowLayoutGraph(graphDiagram()).direction).toBe("RIGHT")
  })
})
```

- [ ] **Step 5: La fixture dei test e l'invariante di corsia**

Crea `src/editor/flow/pool-fixture.ts`:

```ts
import type { DevDocument } from "@/model/document"
import { POOL_HEADER_W } from "@/model/flow/schema"

/**
 * Per i test: aggiunge al documento il pool `p1` «Pool 1», con le corsie date (nome uguale all'id)
 * alte `h` ciascuna. Il **corpo** delle corsie parte da x = 0 e y = 0 ed è largo 640: la striscia
 * sta a sinistra, fra −POOL_HEADER_W e 0. Con una corsia sola alta 160 riproduce la banda unica dei
 * documenti di prima del 2b, [0, 640) × [0, 160), su cui sono scritti i numeri di molti test.
 *
 * Scrive sul documento che riceve — un documento appena creato, o una bozza di Immer — e lo
 * restituisce. È un modulo e non un file `*.test.ts` per la stessa ragione di `lane-invariant.ts`.
 */
export function withPool<T extends DevDocument>(doc: T, lanes: readonly string[] = ["l1"], h = 160): T {
  const flow = doc.diagram.flow
  flow.model.pools["p1"] = { name: "Pool 1", lanes: lanes.map((id) => ({ id, name: id })) }
  flow.view.pools["p1"] = { x: -POOL_HEADER_W, y: 0, w: 640 + POOL_HEADER_W }
  for (const id of lanes) flow.view.lanes[id] = { h }
  return doc
}
```

`src/editor/flow/lane-invariant.ts` diventa:

```ts
import { expect } from "vitest"
import type { FlowDiagram } from "@/model/flow/schema"
import { flowNodeSize, laneAt } from "./geometry"

/**
 * L'invariante di corsia: dopo un comando che tocca nodi, pool o corsie, ogni nodo **con una corsia**
 * e una voce in `view.nodes` ha il centro dentro la propria corsia. Un nodo libero non ha una corsia
 * da rispettare, e può anche stare sotto un pool senza farne parte (spec 2b §10).
 *
 * Vive qui e non dentro un file di test perché la usano più file di test: un file di test che ne
 * importasse un altro rieseguirebbe tutti i suoi `describe` una seconda volta.
 */
export function expectLaneInvariant(d: FlowDiagram): void {
  for (const [key, node] of Object.entries(d.model.nodes)) {
    if (node.lane === null) continue
    const view = d.view.nodes[key]
    if (!view) continue
    const { w, h } = flowNodeSize(node)
    expect(laneAt(d, { x: view.x + w / 2, y: view.y + h / 2 }), `nodo ${key} fuori dalla sua corsia`).toBe(node.lane)
  }
}
```

In `src/editor/flow-access.ts` il docblock diventa `/** La parte di flusso del documento: c'è sempre, anche senza pool e senza nodi. Nessun guard: la presenza la garantisce lo schema, non chi chiama. */`.

- [ ] **Step 6: I comandi**

`src/editor/flow/commands.ts` diventa:

```ts
import { LANE_MIN_H, type FlowDiagram, type FlowModel, type FlowShape } from "@/model/flow/schema"
import type { LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import { flowDiagram } from "../flow-access"
import { snap, type Point } from "../geometry"
import { flowNodeSize, laneAt, laneRect, poolLaneRects } from "./geometry"
import { keepInSpan, placeInLanes } from "./layout"

const DUPLICATE_OFFSET = 20

/**
 * Nuovo nodo vuoto, nella corsia data o libero con `null`. La chiave è un uuid e non un nome unico
 * come `uniqueKey` (er.ts): un nodo di flowchart non ha un nome che la identifichi.
 */
export function addFlowNode(at: Point, shape: FlowShape, lane: string | null): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const d = flowDiagram(draft)
      d.model.nodes[key] = { label: "", shape, lane }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

/**
 * Sposta i nodi come `moveNodes` (`commands/view.ts`) — stesso `snap`, stessa regola «niente si
 * muove» con `dx` e `dy` entrambi zero — e poi decide la corsia dal **centro** di ognuno: la corsia
 * in cui cade, o `null` se cade fuori da ogni pool o sulla striscia (spec 2b §5). Posizione e
 * corsia stanno nella stessa recipe: un solo passo di annulla. Un nodo non viene più trattenuto in
 * una banda: uscire da un pool lo libera.
 */
export function moveFlowNodes(keys: readonly string[], dx: number, dy: number): Recipe | null {
  if (dx === 0 && dy === 0) return null
  return (draft) => {
    const d = flowDiagram(draft)
    for (const key of keys) {
      const node = d.model.nodes[key]
      const view = d.view.nodes[key]
      if (!node || !view) continue
      view.x = snap(view.x + dx)
      view.y = snap(view.y + dy)
      const { w, h } = flowNodeSize(node)
      node.lane = laneAt(d, { x: view.x + w / 2, y: view.y + h / 2 })
    }
  }
}

/**
 * `null` solo quando un estremo non esiste. Due archi fra la stessa coppia sono ammessi di
 * proposito: sono i due rami di una decisione ("sì"/"no"), non un doppione da respingere come fa
 * `addNoteLink` (class/commands.ts) per due note identiche.
 */
export function addFlowEdge(model: FlowModel, source: string, target: string): { key: string; recipe: Recipe } | null {
  if (!(source in model.nodes) || !(target in model.nodes)) return null
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      flowDiagram(draft).model.edges[key] = { source, target, label: "" }
    },
  }
}

export function setNodeLabel(key: string, label: string): Recipe {
  return (draft) => {
    const node = flowDiagram(draft).model.nodes[key]
    // Si scrive solo se cambia davvero: riaprire e richiudere l'editor di testo senza toccare
    // nulla lascerebbe altrimenti una voce di undo fantasma.
    if (node && node.label !== label) node.label = label
  }
}

/**
 * Riporta un nodo dentro la sua corsia, su entrambi gli assi, con `keepInSpan`: l'unico punto dei
 * comandi che lo fa, usato dove un comando può lasciare un nodo a cavallo del bordo (un cambio di
 * forma che lo allarga, una copia spostata dall'offset, una corsia cancellata). Un nodo libero non
 * ha niente in cui rientrare.
 */
function keepInLane(d: FlowDiagram, key: string): void {
  const node = d.model.nodes[key]
  const view = d.view.nodes[key]
  if (!node || !view || node.lane === null) return
  const rect = laneRect(d, node.lane)
  if (!rect) return
  const { w, h } = flowNodeSize(node)
  view.x = keepInSpan(rect.x, rect.w, w, view.x)
  view.y = keepInSpan(rect.y, rect.h, h, view.y)
}

/**
 * Cambia la forma di un nodo. Una `decision` è circa il doppio del rettangolo omologo
 * (`DECISION_FACTOR`): il cambio può allargare il nodo abbastanza da farlo uscire dalla corsia,
 * quindi rientra con `keepInLane`.
 */
export function setNodeShape(key: string, shape: FlowShape): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const node = d.model.nodes[key]
    if (!node || node.shape === shape) return
    node.shape = shape
    keepInLane(d, key)
  }
}

/**
 * Cambia la corsia di un nodo dal pannello — l'alternativa da tastiera al trascinamento (spec 2b §7).
 * Con `null` il nodo diventa libero e resta dov'è. Con una corsia ci entra: la `y` al centro della
 * corsia, e la `x` solo se il nodo sta fuori dalla corsia in orizzontale — per esempio quando passa
 * da libero, o da un altro pool. Entrambe rientrano nei margini con `keepInSpan`.
 */
export function setNodeLane(key: string, laneId: string | null): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const node = d.model.nodes[key]
    const view = d.view.nodes[key]
    if (!node || !view || node.lane === laneId) return
    if (laneId === null) {
      node.lane = null
      return
    }
    const rect = laneRect(d, laneId)
    if (!rect) return
    node.lane = laneId
    const { w, h } = flowNodeSize(node)
    view.y = keepInSpan(rect.y, rect.h, h, rect.y + rect.h / 2 - h / 2)
    view.x = keepInSpan(rect.x, rect.w, w, view.x)
  }
}

/**
 * Scarta gli spazi ai margini: è una regola di dominio, non solo cosmetica — un'etichetta di soli
 * spazi non è "vuota" per `===` (`model/flow/validate.ts`, `flow-branch-unlabeled` confronta
 * `edge.label === ""`) e zittirebbe l'avviso in silenzio.
 */
export function setEdgeLabel(key: string, label: string): Recipe {
  return (draft) => {
    const edge = flowDiagram(draft).model.edges[key]
    const trimmed = label.trim()
    if (edge && edge.label !== trimmed) edge.label = trimmed
  }
}

export function deleteFlowItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null {
  if (nodeKeys.length === 0 && edgeKeys.length === 0) return null
  const nodes = new Set(nodeKeys)
  return (draft) => {
    const d = flowDiagram(draft)
    for (const key of edgeKeys) delete d.model.edges[key]
    for (const [key, edge] of Object.entries(d.model.edges)) {
      if (nodes.has(edge.source) || nodes.has(edge.target)) delete d.model.edges[key]
    }
    for (const key of nodeKeys) {
      delete d.model.nodes[key]
      delete d.view.nodes[key]
    }
  }
}

/**
 * Copia i nodi con un uuid nuovo ciascuno, nella stessa corsia dell'originale (o liberi, come lui);
 * gli archi non si duplicano. `DUPLICATE_OFFSET` può spingere la copia oltre il bordo della corsia,
 * quindi rientra con `keepInLane`.
 */
export function duplicateFlowNodes(model: FlowModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const plan = keys.filter((k) => k in model.nodes).map((from) => ({ from, to: crypto.randomUUID() }))
  return {
    keys: plan.map((p) => p.to),
    recipe: (draft) => {
      const d = flowDiagram(draft)
      for (const { from, to } of plan) {
        const node = d.model.nodes[from]
        const view = d.view.nodes[from]
        if (!node) continue
        d.model.nodes[to] = { ...node }
        d.view.nodes[to] = {
          x: (view?.x ?? 0) + DUPLICATE_OFFSET,
          y: (view?.y ?? 0) + DUPLICATE_OFFSET,
          collapsed: view?.collapsed ?? false,
        }
        keepInLane(d, to)
      }
    },
  }
}

/**
 * Esegue `mutate` sulle corsie del pool e poi trasla i nodi di ogni corsia di quanto è cambiata la
 * sua `y`. La `y` di una corsia non è un dato ma una conseguenza dell'ordine e delle altezze
 * (`laneRects`): quando una corsia sale o scende perché un'altra è stata spostata, cancellata o
 * ridimensionata, i suoi nodi la seguono dello stesso `delta`, senza essere riallineati né ricentrati
 * — la disposizione dentro la corsia è dell'utente. Senza questo resterebbero fermi, disegnati nella
 * corsia sbagliata, e il primo drag riscriverebbe la loro corsia su quella sbagliata.
 */
function keepNodesWithLanes(d: FlowDiagram, poolId: string, mutate: () => void): void {
  const before = new Map(poolLaneRects(d, poolId).map((r) => [r.id, r.y]))
  mutate()
  for (const rect of poolLaneRects(d, poolId)) {
    const old = before.get(rect.id)
    if (old === undefined || old === rect.y) continue
    for (const [key, node] of Object.entries(d.model.nodes)) {
      if (node.lane !== rect.id) continue
      const view = d.view.nodes[key]
      if (view) view.y = snap(view.y + rect.y - old)
    }
  }
}

/** Nuova corsia in fondo al pool, alta il minimo: le corsie sopra non si muovono, e nemmeno i loro nodi. */
export function addLane(poolId: string, name: string): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const pool = d.model.pools[poolId]
    if (!pool) return
    const id = crypto.randomUUID()
    pool.lanes.push({ id, name })
    d.view.lanes[id] = { h: LANE_MIN_H }
  }
}

export function renameLane(id: string, name: string): Recipe {
  return (draft) => {
    for (const pool of Object.values(flowDiagram(draft).model.pools)) {
      const lane = pool.lanes.find((l) => l.id === id)
      if (lane && lane.name !== name) lane.name = name
    }
  }
}

/**
 * Cancella una corsia spostando i suoi nodi in `moveTo`, che deve stare **nello stesso pool**:
 * l'ultima corsia di un pool non si cancella — si cancella il pool (spec 2b §5).
 *
 * Le guardie stanno fuori dalla recipe perché così il chiamante scopre «non si può» *prima* di
 * dispatchare, e può disabilitare il controllo nella UI. Le corsie sotto quella cancellata salgono con
 * i loro nodi (`keepNodesWithLanes`); i nodi spostati rientrano in `moveTo` con `keepInLane`, e
 * possono sovrapporsi a quelli che c'erano già — «Disponi» li risistema.
 */
export function deleteLane(model: FlowModel, id: string, moveTo: string): Recipe | null {
  if (id === moveTo) return null
  const entry = Object.entries(model.pools).find(([, pool]) => pool.lanes.some((l) => l.id === id))
  if (!entry) return null
  const [poolId, pool] = entry
  if (pool.lanes.length <= 1) return null
  if (!pool.lanes.some((l) => l.id === moveTo)) return null
  return (draft) => {
    const d = flowDiagram(draft)
    keepNodesWithLanes(d, poolId, () => {
      // ponytail: `!` non copre un'incognita — il pool l'ha trovato la guardia qui sopra, sullo stesso stato.
      const lanes = d.model.pools[poolId]!.lanes
      lanes.splice(
        lanes.findIndex((l) => l.id === id),
        1,
      )
      delete d.view.lanes[id]
    })
    for (const [key, node] of Object.entries(d.model.nodes)) {
      if (node.lane !== id) continue
      node.lane = moveTo
      keepInLane(d, key)
    }
  }
}

/** Sposta una corsia dentro il suo pool; le corsie che cambiano posto portano con sé i loro nodi. */
export function moveLane(poolId: string, from: number, to: number): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const lanes = d.model.pools[poolId]?.lanes
    if (!lanes || from === to || from < 0 || to < 0 || from >= lanes.length || to >= lanes.length) return
    keepNodesWithLanes(d, poolId, () => {
      const [item] = lanes.splice(from, 1)
      // ponytail: `!` non copre un'incognita — i bound sono controllati sopra, come fa
      // `moveAttribute` (commands/er.ts) per lo stesso motivo.
      lanes.splice(to, 0, item!)
    })
  }
}

/**
 * Posizioni, pool e altezze delle corsie in **una sola** recipe: più dispatch darebbero più passi di
 * undo per un gesto solo. `placeInLanes` è la funzione pura che fa il lavoro; qui si scrive il
 * risultato nel documento.
 */
export function applyFlowLayout(positions: LayoutPositions): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const placed = placeInLanes(d, positions)
    for (const [key, p] of Object.entries(placed.positions)) {
      const view = d.view.nodes[key]
      if (view) {
        view.x = p.x
        view.y = p.y
      }
    }
    d.view.pools = placed.pools
    d.view.lanes = placed.lanes
  }
}
```

(`keepNodesWithLanes` non è esportato qui; il Task 4 lo usa dentro questo stesso file.)

`src/editor/flow/commands.test.ts` diventa:

```ts
import { enablePatches, produce, produceWithPatches } from "immer"
import { describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import { LANE_MIN_H } from "@/model/flow/schema"
import { snap } from "@/editor/geometry"
import {
  addFlowEdge,
  addFlowNode,
  addLane,
  applyFlowLayout,
  deleteFlowItems,
  deleteLane,
  duplicateFlowNodes,
  moveFlowNodes,
  moveLane,
  renameLane,
  setEdgeLabel,
  setNodeLabel,
  setNodeLane,
  setNodeShape,
} from "./commands"
import { laneRect } from "./geometry"
import { expectLaneInvariant } from "./lane-invariant"
import { LANE_PAD } from "./layout"
import { withPool } from "./pool-fixture"

// Per leggere se una recipe produce patch: è la proprietà su cui `document-store.ts` scarta una
// dispatch, e un `toBe` per riferimento non basta.
enablePatches()

/** Un documento con il pool `p1` e le corsie date: il corpo parte da (0, 0) ed è largo 640 (`withPool`). */
const docWith = (lanes: readonly string[] = ["l1"], h = 160): DevDocument => withPool(createDocument("test", "id-1"), lanes, h)
const apply = (doc: DevDocument, recipe: (d: DevDocument) => void): DevDocument => produce(doc, recipe)
const fd = (doc: DevDocument) => doc.diagram.flow
const lanesOf = (doc: DevDocument) => fd(doc).model.pools["p1"]!.lanes.map((l) => l.name)
const topOf = (doc: DevDocument, lane: string) => laneRect(fd(doc), lane)!.y

describe("addFlowNode", () => {
  it("crea il nodo nella corsia data, con la forma data e l'etichetta vuota", () => {
    const { key, recipe } = addFlowNode({ x: 33, y: 47 }, "decision", "l1")
    const d = fd(apply(docWith(), recipe))
    expect(d.model.nodes[key]).toEqual({ label: "", shape: "decision", lane: "l1" })
    expect(d.view.nodes[key]).toEqual({ x: 30, y: 50, collapsed: false })
  })

  it("con `null` crea un nodo libero", () => {
    const { key, recipe } = addFlowNode({ x: 0, y: 0 }, "process", null)
    expect(fd(apply(createDocument("t", "t"), recipe)).model.nodes[key]!.lane).toBeNull()
  })
})

describe("addFlowEdge", () => {
  it("torna null se un estremo non esiste", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "process", null)
    const next = apply(createDocument("t", "t"), a.recipe)
    expect(addFlowEdge(fd(next).model, a.key, "fantasma")).toBeNull()
  })

  it("ammette due archi fra la stessa coppia: sono i due rami di una decisione", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "decision", null)
    const b = addFlowNode({ x: 200, y: 0 }, "process", null)
    let next = apply(apply(createDocument("t", "t"), a.recipe), b.recipe)
    next = apply(next, addFlowEdge(fd(next).model, a.key, b.key)!.recipe)
    next = apply(next, addFlowEdge(fd(next).model, a.key, b.key)!.recipe)
    expect(Object.keys(fd(next).model.edges)).toHaveLength(2)
  })
})

describe("deleteFlowItems", () => {
  it("cancellando un nodo porta via gli archi che lo toccano", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "process", null)
    const b = addFlowNode({ x: 200, y: 0 }, "process", null)
    let next = apply(apply(createDocument("t", "t"), a.recipe), b.recipe)
    const e = addFlowEdge(fd(next).model, a.key, b.key)!
    next = apply(apply(next, e.recipe), deleteFlowItems([a.key], [])!)
    expect(fd(next).model.nodes[a.key]).toBeUndefined()
    expect(fd(next).model.edges[e.key]).toBeUndefined()
    expect(fd(next).view.nodes[a.key]).toBeUndefined()
  })

  it("torna null quando non c'è niente da cancellare: evita una voce di undo fantasma", () => {
    expect(deleteFlowItems([], [])).toBeNull()
  })
})

describe("deleteLane", () => {
  it("rifiuta di cancellare l'ultima corsia del pool: si cancella il pool", () => {
    expect(deleteLane(fd(docWith()).model, "l1", "l1")).toBeNull()
  })

  it("sposta i nodi della corsia cancellata in quella indicata, dentro la sua banda", () => {
    const n = addFlowNode({ x: 0, y: 120 }, "process", "l2")
    let next = apply(docWith(["l1", "l2"], 100), n.recipe)
    next = apply(next, deleteLane(fd(next).model, "l2", "l1")!)
    expect(lanesOf(next)).toEqual(["l1"])
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
    expect(fd(next).view.lanes["l2"]).toBeUndefined()
    expectLaneInvariant(fd(next))
  })

  it("le corsie sotto quella cancellata salgono, e i loro nodi con loro", () => {
    // Review Focus 3.
    const n3 = addFlowNode({ x: 0, y: 220 }, "process", "l3")
    let next = apply(docWith(["l1", "l2", "l3"], 100), n3.recipe)
    next = apply(next, deleteLane(fd(next).model, "l2", "l1")!)
    expect(topOf(next, "l3")).toBe(100)
    expect(fd(next).view.nodes[n3.key]!.y).toBe(120)
    expectLaneInvariant(fd(next))
  })

  it("rifiuta un `moveTo` di un altro pool, o che non esiste", () => {
    const doc = docWith(["l1", "l2"])
    doc.diagram.flow.model.pools["p2"] = { name: "Pool 2", lanes: [{ id: "m1", name: "m1" }] }
    doc.diagram.flow.view.pools["p2"] = { x: 0, y: 500, w: 640 }
    doc.diagram.flow.view.lanes["m1"] = { h: 160 }
    expect(deleteLane(fd(doc).model, "l1", "m1")).toBeNull()
    expect(deleteLane(fd(doc).model, "l1", "fantasma")).toBeNull()
    expect(deleteLane(fd(doc).model, "l1", "l2")).not.toBeNull()
  })
})

describe("setNodeShape", () => {
  it("cambia la forma senza toccare etichetta e corsia", () => {
    const n = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const d = fd(apply(apply(docWith(), n.recipe), setNodeShape(n.key, "decision")))
    expect(d.model.nodes[n.key]).toEqual({ label: "", shape: "decision", lane: "l1" })
    expectLaneInvariant(d)
  })

  /**
   * `y: 130` con un `process` vuoto (`h: 40`) tiene il centro dentro la corsia [0, 160); diventato
   * `decision` (`h: 80`) il centro uscirebbe. L'intervallo utile è [20, 160 − 20 − 80] = [20, 60].
   */
  it("il cambio di forma che allarga il nodo lo fa rientrare nella corsia", () => {
    const n = addFlowNode({ x: 0, y: 130 }, "process", "l1")
    const d = fd(apply(apply(docWith(), n.recipe), setNodeShape(n.key, "decision")))
    expect(d.view.nodes[n.key]!.y).toBe(60)
    expectLaneInvariant(d)
  })

  it("su un nodo libero cambia solo la forma", () => {
    const n = addFlowNode({ x: 0, y: 130 }, "process", null)
    const d = fd(apply(apply(docWith(), n.recipe), setNodeShape(n.key, "decision")))
    expect(d.view.nodes[n.key]).toEqual({ x: 0, y: 130, collapsed: false })
  })
})

describe("setNodeLabel", () => {
  it("cambia l'etichetta del nodo", () => {
    const n = addFlowNode({ x: 0, y: 0 }, "process", null)
    const next = apply(apply(createDocument("t", "t"), n.recipe), setNodeLabel(n.key, "verifica ordine"))
    expect(fd(next).model.nodes[n.key]!.label).toBe("verifica ordine")
  })
})

describe("setNodeLane", () => {
  it("porta il nodo nella corsia data, centrato in verticale", () => {
    const n = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const next = apply(apply(docWith(["l1", "l2"], 100), n.recipe), setNodeLane(n.key, "l2"))
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l2")
    // Corsia l2 da 100 a 200, nodo alto 40: il centro della corsia dà 130.
    expect(fd(next).view.nodes[n.key]!.y).toBe(snap(100 + 50 - 20))
    expectLaneInvariant(fd(next))
  })

  it("porta dentro anche la x, se il nodo sta fuori dalla corsia in orizzontale", () => {
    const n = addFlowNode({ x: 900, y: 20 }, "process", null)
    const next = apply(apply(docWith(), n.recipe), setNodeLane(n.key, "l1"))
    // Corpo della corsia [0, 640), nodo largo 60: la x massima è 640 − 20 − 60 = 560.
    expect(fd(next).view.nodes[n.key]!.x).toBe(560)
    expectLaneInvariant(fd(next))
  })

  it("con `null` libera il nodo e lo lascia dov'è", () => {
    const n = addFlowNode({ x: 40, y: 40 }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), setNodeLane(n.key, null))
    expect(fd(next).model.nodes[n.key]!.lane).toBeNull()
    expect(fd(next).view.nodes[n.key]).toEqual({ x: 40, y: 40, collapsed: false })
  })

  it("non fa nulla quando la corsia data è già quella del nodo", () => {
    const n = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const next = apply(docWith(), n.recipe)
    expect(apply(next, setNodeLane(n.key, "l1"))).toBe(next)
  })
})

describe("setEdgeLabel", () => {
  it("cambia l'etichetta dell'arco, e scarta gli spazi ai margini", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "decision", null)
    const b = addFlowNode({ x: 200, y: 0 }, "process", null)
    let next = apply(apply(createDocument("t", "t"), a.recipe), b.recipe)
    const e = addFlowEdge(fd(next).model, a.key, b.key)!
    next = apply(apply(next, e.recipe), setEdgeLabel(e.key, "  sì  "))
    expect(fd(next).model.edges[e.key]!.label).toBe("sì")
    next = apply(next, setEdgeLabel(e.key, "   "))
    expect(fd(next).model.edges[e.key]!.label).toBe("")
  })
})

describe("addLane", () => {
  it("aggiunge la corsia in fondo al pool, alta il minimo", () => {
    const next = apply(docWith(), addLane("p1", "Corsia 2"))
    expect(lanesOf(next)).toEqual(["l1", "Corsia 2"])
    const nuova = fd(next).model.pools["p1"]!.lanes[1]!.id
    expect(fd(next).view.lanes[nuova]).toEqual({ h: LANE_MIN_H })
    expect(topOf(next, nuova)).toBe(160)
  })

  it("le corsie sopra e i loro nodi non si muovono", () => {
    const n = addFlowNode({ x: 0, y: LANE_PAD }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), addLane("p1", "Corsia 2"))
    expect(fd(next).view.nodes[n.key]!.y).toBe(LANE_PAD)
    expectLaneInvariant(fd(next))
  })

  it("su un pool che non c'è non fa niente", () => {
    const doc = docWith()
    expect(apply(doc, addLane("fantasma", "x"))).toBe(doc)
  })
})

describe("renameLane", () => {
  it("rinomina la corsia", () => {
    expect(lanesOf(apply(docWith(), renameLane("l1", "Preparazione")))).toEqual(["Preparazione"])
  })
})

describe("moveLane", () => {
  it("sposta la corsia nella posizione data, dentro il pool", () => {
    expect(lanesOf(apply(docWith(["a", "b", "c"]), moveLane("p1", 0, 2)))).toEqual(["b", "c", "a"])
  })

  it("trasla i nodi della corsia spostata, senza riallinearli né ricentrarli", () => {
    const doc = docWith(["a", "b"], 100)
    doc.diagram.flow.view.lanes["b"] = { h: 200 }
    const n1 = addFlowNode({ x: 0, y: 20 }, "process", "a")
    const n2 = addFlowNode({ x: 100, y: 60 }, "process", "a")
    const next = apply(apply(apply(doc, n1.recipe), n2.recipe), moveLane("p1", 0, 1))
    // "a" ora sta sotto "b" (alta 200): parte da 200, delta 200.
    expect(topOf(next, "a")).toBe(200)
    expect(fd(next).view.nodes[n1.key]!.y).toBe(220)
    expect(fd(next).view.nodes[n2.key]!.y).toBe(260)
    expectLaneInvariant(fd(next))
  })

  it("con tre corsie e un nodo in ognuna, l'invariante vale dopo lo spostamento", () => {
    let next = docWith(["a", "b", "c"])
    for (const lane of ["a", "b", "c"]) {
      next = apply(next, addFlowNode({ x: 0, y: topOf(next, lane) + LANE_PAD }, "process", lane).recipe)
    }
    expectLaneInvariant(fd(apply(next, moveLane("p1", 2, 0))))
  })

  it("indici fuori dal pool non fanno niente", () => {
    const doc = docWith()
    expect(apply(doc, moveLane("p1", 0, 5))).toBe(doc)
  })
})

describe("duplicateFlowNodes", () => {
  it("copia i nodi con l'offset, nella stessa corsia", () => {
    const n = addFlowNode({ x: 10, y: 10 }, "process", "l1")
    const next = apply(docWith(), n.recipe)
    const { keys, recipe } = duplicateFlowNodes(fd(next).model, [n.key])
    const d = fd(apply(next, recipe))
    expect(d.model.nodes[keys[0]!]).toEqual({ label: "", shape: "process", lane: "l1" })
    expect(d.view.nodes[keys[0]!]).toEqual({ x: 30, y: 30, collapsed: false })
    expectLaneInvariant(d)
  })

  /** y = 90, corsia [0, 160), nodo alto 40: l'intervallo utile è [20, 100], e +20 porterebbe a 110. */
  it("la copia che esce dalla corsia per l'offset ci rientra", () => {
    const n = addFlowNode({ x: 10, y: 90 }, "process", "l1")
    const next = apply(docWith(), n.recipe)
    const { keys, recipe } = duplicateFlowNodes(fd(next).model, [n.key])
    const d = fd(apply(next, recipe))
    expect(d.view.nodes[keys[0]!]!.y).toBe(100)
    expectLaneInvariant(d)
  })

  it("la copia di un nodo libero resta libera, con l'offset", () => {
    const n = addFlowNode({ x: 10, y: 10 }, "process", null)
    const next = apply(createDocument("t", "t"), n.recipe)
    const { keys, recipe } = duplicateFlowNodes(fd(next).model, [n.key])
    const d = fd(apply(next, recipe))
    expect(d.model.nodes[keys[0]!]!.lane).toBeNull()
    expect(d.view.nodes[keys[0]!]).toEqual({ x: 30, y: 30, collapsed: false })
  })
})

describe("applyFlowLayout", () => {
  it("scrive posizioni, pool e corsie in una sola applicazione, lasciando stare i nodi assenti dalla view", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const b = addFlowNode({ x: 0, y: 0 }, "process", "l2")
    const c = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    let next = apply(apply(apply(docWith(["l1", "l2"]), a.recipe), b.recipe), c.recipe)
    next = apply(next, (draft) => {
      delete fd(draft).view.nodes[c.key]
    })
    const d = fd(apply(next, applyFlowLayout({ [a.key]: { x: 10, y: 999 }, [b.key]: { x: 20, y: 999 }, [c.key]: { x: 30, y: 999 } })))
    expect(d.view.nodes[a.key]).toMatchObject({ x: 10, y: LANE_PAD })
    expect(d.view.nodes[b.key]).toMatchObject({ x: 20, y: laneRect(d, "l2")!.y + LANE_PAD })
    expect(d.view.nodes[c.key]).toBeUndefined()
    expect(d.view.pools["p1"]!.y).toBe(0)
    expect(d.view.lanes["l1"]).toEqual({ h: LANE_MIN_H })
  })
})

/** Il pool `p1` con due corsie: l1 da 0 a 100, l2 da 100 a 200; il corpo da x = 0 a 640. */
const dueCorsie = () => docWith(["l1", "l2"], 100)

describe("moveFlowNodes", () => {
  it("un nodo trascinato in un'altra corsia cambia corsia", () => {
    const n = addFlowNode({ x: 0, y: 20 }, "process", "l1")
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], 0, 100)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l2")
    expect(fd(next).view.nodes[n.key]!.y).toBe(120)
    expectLaneInvariant(fd(next))
  })

  it("un nodo trascinato fuori da ogni pool diventa libero, dove l'ha lasciato", () => {
    const n = addFlowNode({ x: 0, y: 50 }, "process", "l1")
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], 0, -500)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBeNull()
    expect(fd(next).view.nodes[n.key]!.y).toBe(-450)
  })

  it("un nodo libero trascinato dentro una corsia la prende", () => {
    const n = addFlowNode({ x: 900, y: 20 }, "process", null)
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], -800, 0)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
  })

  it("decide il centro, non lo spigolo", () => {
    // y 50 → 90: il bordo superiore è ancora in l1, il centro (110) è già in l2.
    const n = addFlowNode({ x: 0, y: 50 }, "process", "l1")
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], 0, 40)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l2")
  })

  it("con il centro sulla striscia di intestazione il nodo è libero", () => {
    // x 0 → −60: il centro (−30) cade sulla striscia, fra −32 e 0.
    const n = addFlowNode({ x: 0, y: 20 }, "process", "l1")
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], -60, 0)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBeNull()
  })

  it("trascinando più nodi insieme, ognuno prende la corsia dove cade lui", () => {
    const a = addFlowNode({ x: 0, y: 20 }, "process", "l1")
    const b = addFlowNode({ x: 0, y: 60 }, "process", "l1")
    const next = apply(apply(apply(dueCorsie(), a.recipe), b.recipe), moveFlowNodes([a.key, b.key], 0, 50)!)
    expect(fd(next).model.nodes[a.key]!.lane).toBe("l1")
    expect(fd(next).model.nodes[b.key]!.lane).toBe("l2")
  })

  it("dx e dy nulli non danno una recipe", () => {
    expect(moveFlowNodes(["x"], 0, 0)).toBeNull()
  })

  it("uno spostamento che la griglia annulla non produce patch", () => {
    const n = addFlowNode({ x: 0, y: 20 }, "process", "l1")
    const [, patches] = produceWithPatches(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], 3, 0)!)
    expect(patches).toHaveLength(0)
  })
})
```

- [ ] **Step 7: Le operazioni del flusso sul canvas**

In `src/editor/kinds/flow.ts`:
- cancella `nearestLane` e il suo docblock;
- l'import da `@/model/flow/schema` diventa `import type { FlowShape } from "@/model/flow/schema"`;
- l'import dalla geometria diventa `import { flowEdgeGeometry, flowEdgeOffsets, flowNodeRect, flowNodeSize, laneAt, laneRect } from "../flow/geometry"`, e quello dal layout `import { flowLayoutGraph, keepInSpan } from "../flow/layout"`;
- `addNode`, con il suo docblock, diventa:

```ts
    /**
     * Dentro una corsia il nodo nasce in quella corsia e rientra nei suoi margini su entrambi gli
     * assi: un clic vicino al bordo non deve creare un nodo a cavallo della corsia accanto o del
     * bordo del pool. Fuori da ogni pool, o sulla sua striscia, nasce libero dove si è cliccato
     * (spec 2b §5).
     */
    addNode: (at, variant) => {
      const d = diagram()
      const shape = (variant ?? "process") as FlowShape
      const lane = laneAt(d, at)
      const rect = lane === null ? null : laneRect(d, lane)
      if (!rect) return { ...addFlowNode(at, shape, null), edit: "body" }
      const { w, h } = flowNodeSize({ label: "", shape })
      const inLane = { x: keepInSpan(rect.x, rect.w, w, at.x), y: keepInSpan(rect.y, rect.h, h, at.y) }
      return { ...addFlowNode(inLane, shape, rect.id), edit: "body" }
    },
```

`src/editor/kinds/flow.test.ts` diventa:

```ts
import { produce } from "immer"
import { describe, expect, it } from "vitest"
import { expectLaneInvariant } from "@/editor/flow/lane-invariant"
import { withPool } from "@/editor/flow/pool-fixture"
import { createDocument } from "@/model/document"
import { familyOps } from "./ops"

describe("flowOps.addNode", () => {
  it("fuori da ogni pool crea un nodo libero dove si è cliccato, e apre l'editor del corpo", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe, edit } = familyOps(doc, "flow").addNode({ x: 10, y: 10 }, "decision")
    const d = produce(doc, recipe).diagram.flow
    expect(d.model.nodes[key]).toEqual({ label: "", shape: "decision", lane: null })
    expect(d.view.nodes[key]).toEqual({ x: 10, y: 10, collapsed: false })
    expect(edit).toBe("body")
  })

  it("senza variante crea un processo", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 0 })
    expect(produce(doc, recipe).diagram.flow.model.nodes[key]!.shape).toBe("process")
  })

  it("dentro una corsia crea il nodo in quella corsia", () => {
    const doc = withPool(createDocument("test", "id-1"), ["l1", "l2"], 100)
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 150 })
    expect(produce(doc, recipe).diagram.flow.model.nodes[key]!.lane).toBe("l2")
  })

  it("il confine fra due corsie va a quella di sotto", () => {
    const doc = withPool(createDocument("test", "id-1"), ["l1", "l2"], 100)
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 100 })
    expect(produce(doc, recipe).diagram.flow.model.nodes[key]!.lane).toBe("l2")
  })

  it("sulla striscia di intestazione il nodo nasce libero", () => {
    const doc = withPool(createDocument("test", "id-1"))
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: -10, y: 50 })
    expect(produce(doc, recipe).diagram.flow.model.nodes[key]!.lane).toBeNull()
  })

  it("un clic vicino al bordo della corsia fa rientrare il nodo, su entrambi gli assi", () => {
    // Corsia [0, 640) × [0, 160), processo 60 × 40: x massima 560, y massima 100.
    const doc = withPool(createDocument("test", "id-1"))
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 630, y: 150 }, "process")
    const d = produce(doc, recipe).diagram.flow
    expect(d.model.nodes[key]!.lane).toBe("l1")
    expect(d.view.nodes[key]).toEqual({ x: 560, y: 100, collapsed: false })
    expectLaneInvariant(d)
  })

  it("addEdge torna null se un estremo non esiste", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 0 }, "process")
    expect(familyOps(produce(doc, recipe), "flow").addEdge(key, "fantasma")).toBeNull()
  })
})

describe("rectOf", () => {
  it("torna il rettangolo del nodo alla sua posizione salvata", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 40, y: 40 }, "process")
    expect(familyOps(produce(doc, recipe), "flow").rectOf(key)).toEqual({ x: 40, y: 40, w: 60, h: 40 })
  })

  it("torna null per una chiave inesistente", () => {
    expect(familyOps(createDocument("test", "id-1"), "flow").rectOf("fantasma")).toBeNull()
  })

  // È il solo caso in cui `at` fa la differenza: l'anteprima del drag lo passa per disegnare il
  // nodo dove il gesto lo sta portando, non dove sta ancora scritto in `view.nodes`.
  it("con `at` usa la posizione data, non quella salvata in `view`", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 40, y: 40 }, "process")
    expect(familyOps(produce(doc, recipe), "flow").rectOf(key, { x: 200, y: 300 })).toEqual({ x: 200, y: 300, w: 60, h: 40 })
  })
})
```

- [ ] **Step 8: L'export Mermaid**

In `src/io/emit/flow-mermaid.ts`, `emitFlowMermaid` e il suo docblock diventano:

```ts
/**
 * Serializza il modello come `flowchart LR` (spec 2b §8): prima i nodi liberi, al livello più alto;
 * poi ogni pool come `subgraph`, con dentro un `subgraph` per corsia.
 *
 * **Ordine e id.** I pool escono per nome e, a parità, per id; le corsie nell'ordine del pool; dentro
 * ogni corsia (e fra i liberi) le chiavi dei nodi in ordine alfabetico, lo stesso `sort()` di
 * `class-mermaid.ts` ed `er-mermaid.ts`. L'ordine viene tutto dal modello, mai dalla posizione:
 * lo stesso modello produce sempre lo stesso testo, byte per byte, anche dopo che un pool è stato
 * spostato. Gli id sono `n1..nN` per i nodi, `p1..pN` per i pool e `l1..lN` per le corsie, contate
 * tutte in quell'ordine, anche quelle vuote.
 *
 * Le note sono escluse dalla numerazione: non emettono mai un nodo, quindi non consumano un id. Un
 * pool o una corsia senza nodi emettibili non escono: sarebbero un riquadro vuoto.
 */
export function emitFlowMermaid(model: FlowModel): EmitResult {
  const out = ["flowchart LR"]
  const nodeIdByKey = new Map<string, string>()
  let nextNodeId = 1
  let noteCount = 0
  let hasSubgraph = false
  let noteEdgeCount = 0

  /** Le chiavi emettibili di una corsia (o dei liberi, con `null`), in ordine; le note si contano e basta. */
  const emittable = (lane: string | null): string[] =>
    Object.keys(model.nodes)
      .filter((key) => model.nodes[key]!.lane === lane)
      .sort()
      .filter((key) => {
        if (model.nodes[key]!.shape !== "note") return true
        noteCount += 1
        return false
      })

  const emitNode = (key: string, indent: string) => {
    const node = model.nodes[key]!
    const nodeId = `n${nextNodeId}`
    nextNodeId += 1
    nodeIdByKey.set(key, nodeId)
    out.push(`${indent}${SHAPE_TEMPLATE[node.shape](nodeId, escapeLabel(node.label))}`)
  }

  for (const key of emittable(null)) emitNode(key, "  ")

  const pools = Object.entries(model.pools).sort(([a, p], [b, q]) => p.name.localeCompare(q.name) || (a < b ? -1 : 1))
  let laneCount = 0
  pools.forEach(([, pool], poolIndex) => {
    const lanes = pool.lanes.map((lane) => {
      laneCount += 1
      return { id: `l${laneCount}`, name: lane.name, keys: emittable(lane.id) }
    })
    const full = lanes.filter((l) => l.keys.length > 0)
    if (full.length === 0) return
    hasSubgraph = true
    out.push(`  subgraph p${poolIndex + 1}["${escapeLabel(pool.name)}"]`)
    for (const lane of full) {
      out.push(`    subgraph ${lane.id}["${escapeLabel(lane.name)}"]`)
      for (const key of lane.keys) emitNode(key, "      ")
      out.push("    end")
    }
    out.push("  end")
  })
```

Il resto della funzione (il ciclo sugli archi e gli avvisi) resta com'è, tranne il testo del primo avviso, che diventa `"I pool e le corsie sono usciti come riquadri annidati (subgraph): Mermaid non disegna corsie come bande orizzontali vere."`. Il vecchio `model.lanes.forEach(...)` sparisce.

In `src/io/emit/flow-mermaid.test.ts`:
- le fixture in testa diventano:

```ts
/** Un pool `p1` con una corsia sola di default; il chiamante può sostituire `pools` quando il caso vuole più corsie o più pool. */
const lane = { id: "l1", name: "corsia" }
const model = (over: Partial<FlowModel>): FlowModel => ({ pools: { p1: { name: "pool", lanes: [lane] } }, nodes: {}, edges: {}, ...over })
const n = (label: string, shape: FlowShape, l: string | null = "l1") => ({ label, shape, lane: l })
```

- nei tre test che sovrascrivono le corsie (`"due corsie escono come due subgraph, nell'ordine di model.lanes"`, `"una corsia senza nodi visibili non emette una subgraph vuota"`, `"una corsia con solo note non emette una subgraph, ma le conta comunque nell'avviso"`, `"un nome di corsia con virgolette e a capo è scappato come le etichette dei nodi"`), `lanes: [ … ],` diventa `pools: { p1: { name: "pool", lanes: [ … ] } },` con le stesse corsie; il primo cambia titolo in `"due corsie escono come due subgraph, nell'ordine del pool"`. Le asserzioni restano: le corsie sono numerate `l1`, `l2` come prima;
- aggiungi dentro `describe("emitFlowMermaid: apertura e struttura")`:

```ts
  it("un pool esce come subgraph che contiene quelle delle sue corsie", () => {
    const { text } = emitFlowMermaid(model({ nodes: { a: n("x", "process") } }))
    expect(text).toContain('  subgraph p1["pool"]\n    subgraph l1["corsia"]\n      n1["x"]\n    end\n  end\n')
  })

  it("i nodi liberi escono fuori da ogni subgraph, e senza pool non c'è l'avviso sulle corsie", () => {
    const { text, warnings } = emitFlowMermaid(model({ pools: {}, nodes: { a: n("A", "process", null) } }))
    expect(text).toBe('flowchart LR\n  n1["A"]\n')
    expect(warnings).toEqual([])
  })

  it("i liberi vengono prima dei pool", () => {
    const { text } = emitFlowMermaid(model({ nodes: { a: n("dentro", "process"), b: n("fuori", "process", null) } }))
    expect(text.indexOf('"fuori"')).toBeLessThan(text.indexOf("subgraph p1"))
  })

  it("i pool escono per nome, non per id né per posizione", () => {
    const { text } = emitFlowMermaid(
      model({
        pools: { z: { name: "A", lanes: [{ id: "l1", name: "uno" }] }, a: { name: "B", lanes: [{ id: "l2", name: "due" }] } },
        nodes: { x: n("X", "process", "l1"), y: n("Y", "process", "l2") },
      }),
    )
    expect(text.indexOf('["A"]')).toBeLessThan(text.indexOf('["B"]'))
  })
```

- [ ] **Step 9: Il disegno dei pool**

Rinomina i file con `git mv src/ui/canvas/LanesLayer.tsx src/ui/canvas/PoolsLayer.tsx` e `git mv src/ui/canvas/LanesLayer.test.tsx src/ui/canvas/PoolsLayer.test.tsx`.

`src/ui/canvas/PoolsLayer.tsx` diventa:

```tsx
import { useMemo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { flowDiagram } from "@/editor/flow-access"
import { poolIds, poolLaneRects, poolRect, type PoolsPart } from "@/editor/flow/geometry"
import { PAD_X } from "@/editor/geometry"
import { POOL_HEADER_W } from "@/model/flow/schema"

/**
 * Vista pura dei pool (spec 2b §3): per ognuno le bande delle corsie, la striscia a sinistra con il
 * nome ruotato come in BPMN. La usano il canvas (`PoolsLayer`, sotto) e l'export (`buildSvg`): è la
 * ragione per cui esiste come componente separato — lo stesso pool nell'app e nel file.
 *
 * Le coordinate interne sono relative all'angolo del pool (`translate`): spostare un pool vuol dire
 * riscrivere un solo attributo. Le bande non ricevono il puntatore: un clic sul corpo di una corsia
 * arriva al canvas, e da lì partono selezione a riquadro e pan.
 */
export function PoolsLayerView({ part }: { part: PoolsPart }) {
  return (
    <g data-layer="pools">
      {poolIds(part).map((id) => (
        <PoolFrame key={id} part={part} poolId={id} />
      ))}
    </g>
  )
}

function PoolFrame({ part, poolId }: { part: PoolsPart; poolId: string }) {
  const pool = part.model.pools[poolId]
  const rect = poolRect(part, poolId)
  if (!pool || !rect) return null
  const lanes = poolLaneRects(part, poolId)
  return (
    <g data-pool={poolId} transform={`translate(${rect.x} ${rect.y})`}>
      {lanes.map((lane, i) => (
        <g key={lane.id} pointerEvents="none">
          <rect x={POOL_HEADER_W} y={lane.y - rect.y} width={lane.w} height={lane.h} fill="var(--muted)" fillOpacity={0.35} stroke="var(--border)" />
          <text x={POOL_HEADER_W + PAD_X} y={lane.y - rect.y + PAD_X} dominantBaseline="hanging" fontSize={11} fill="var(--muted-foreground)">
            {pool.lanes[i]?.name}
          </text>
        </g>
      ))}
      <rect data-pool-header x={0} y={0} width={POOL_HEADER_W} height={rect.h} fill="var(--muted)" stroke="var(--border)" />
      <text
        transform={`translate(${POOL_HEADER_W / 2} ${rect.h / 2}) rotate(-90)`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fill="var(--foreground)"
        pointerEvents="none"
      >
        {pool.name}
      </text>
    </g>
  )
}

/**
 * Componente connesso: monta `PoolsLayerView` con i pool dello store, prima di archi e nodi
 * (`Canvas.tsx`). Tre selettori stabili invece del diagramma intero: un drag di nodi cambia
 * `view.nodes`, non i pool, e non li ridisegna.
 */
export function PoolsLayer() {
  const pools = useStore(documentStore, (s) => flowDiagram(s.doc).model.pools)
  const poolViews = useStore(documentStore, (s) => flowDiagram(s.doc).view.pools)
  const laneViews = useStore(documentStore, (s) => flowDiagram(s.doc).view.lanes)
  const part = useMemo(() => ({ model: { pools }, view: { pools: poolViews, lanes: laneViews } }), [pools, poolViews, laneViews])
  return <PoolsLayerView part={part} />
}
```

In `src/ui/canvas/Canvas.tsx`: `import { LanesLayer } from "./LanesLayer"` diventa `import { PoolsLayer } from "./PoolsLayer"`, e il blocco `{/* Le corsie non sono un … */}` + `<LanesLayer />` diventa:

```tsx
          {/* I pool non sono un `DiagramView.NodesLayer`: sono un layer che solo il flowchart popola,
              sotto archi e nodi (spec 2b §3). */}
          <PoolsLayer />
```

`src/ui/canvas/PoolsLayer.test.tsx` diventa:

```tsx
// @vitest-environment jsdom
//
// jsdom e non l'ambiente di default (node): `PoolsLayer` sotto monta il componente connesso allo
// store con `react-dom/client`, che ha bisogno di un DOM.
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { withPool } from "@/editor/flow/pool-fixture"
import { createDocument } from "@/model/document"
import { POOL_HEADER_W } from "@/model/flow/schema"
import { PoolsLayer, PoolsLayerView } from "./PoolsLayer"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("PoolsLayerView", () => {
  const part = {
    model: { pools: { p1: { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Negozio" }] } } },
    view: { pools: { p1: { x: 10, y: 20, w: 400 } }, lanes: { l1: { h: 100 }, l2: { h: 150 } } },
  }

  it("disegna il pool con il nome sulla striscia e una banda per corsia, impilate", () => {
    const html = renderToStaticMarkup(<PoolsLayerView part={part} />)
    expect(html).toContain('data-layer="pools"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain(">Processo<")
    expect(html).toContain(">Cliente<")
    expect(html).toContain(">Negozio<")
    // In coordinate del pool: la seconda corsia parte dove finisce la prima.
    expect(html).toContain('y="100"')
    expect(html).toContain('height="150"')
    // Le bande saltano la striscia, e ne tolgono la larghezza.
    expect(html).toContain(`x="${POOL_HEADER_W}"`)
    expect(html).toContain(`width="${400 - POOL_HEADER_W}"`)
  })

  it("senza pool il layer è vuoto", () => {
    const html = renderToStaticMarkup(<PoolsLayerView part={{ model: { pools: {} }, view: { pools: {}, lanes: {} } }} />)
    expect(html).toBe('<g data-layer="pools"></g>')
  })
})

describe("PoolsLayer — connesso allo store", () => {
  function monta(): { html: () => string; smonta: () => void } {
    const container = document.createElement("div")
    const root = createRoot(container)
    act(() => root.render(<PoolsLayer />))
    return { html: () => container.innerHTML, smonta: () => act(() => root.unmount()) }
  }

  it("un flowchart senza pool non ha bande, anche con dei nodi", () => {
    const doc = createDocument("t")
    doc.diagram.flow.model.nodes["n1"] = { label: "avvio", shape: "terminal", lane: null }
    doc.diagram.flow.view.nodes["n1"] = { x: 200, y: 10, collapsed: false }
    documentStore.getState().load(doc)
    const { html, smonta } = monta()
    expect(html()).not.toContain("<rect")
    smonta()
  })

  it("un pool si vede anche senza nodi", () => {
    documentStore.getState().load(withPool(createDocument("t")))
    const { html, smonta } = monta()
    expect(html()).toContain(">Pool 1<")
    smonta()
  })
})
```

- [ ] **Step 10: L'export SVG**

In `src/ui/export/svg.tsx`:
- gli import `laneBandExtent` (da `@/editor/flow/geometry`) e `LanesLayerView` (da `@/ui/canvas/LanesLayer`) diventano `import { poolIds, poolRect } from "@/editor/flow/geometry"` e `import { PoolsLayerView } from "@/ui/canvas/PoolsLayer"`; togli `familyHasContent` dall'import di `canvas-ops` se non serve più;
- il blocco da `const flow = familyHasContent(doc, "flow") ? flowDiagram(doc) : null` fino a `const bounds = …` compreso diventa:

```ts
  const flow = flowDiagram(doc)
  // I pool sono contenuto anche senza nodi (spec 2b §6): entrano nei limiti dell'export.
  const poolRects = poolIds(flow).flatMap((id) => poolRect(flow, id) ?? [])

  const bounds = rectsBounds([...sections.flatMap((s) => [...s.rects.values()]), ...poolRects])
```

- la riga `{flow && laneExtent && <LanesLayerView … />}` diventa `{poolRects.length > 0 && <PoolsLayerView part={flow} />}`, e il commento sopra parla di «I pool sotto tutto, come nel canvas»;
- nel docblock di `buildSvg`, il paragrafo che comincia con «Le corsie sono l'unica parte del flowchart…» diventa: `I pool sono l'unica parte del flowchart che non passa da DiagramOps/DiagramView: sono un layer che solo il flowchart ha, disegnato con la stessa PoolsLayerView del canvas, così il pool è identico nell'app e nell'export.`

In `src/ui/export/svg.test.ts`, la fixture `flowDiagramWithTwoLanes` e il `describe("buildSvg (flowchart)")` diventano (togli l'import di `laneBandExtent`):

```ts
/**
 * Un pool «Processo» con due corsie: «Cliente» con un nodo, «Backoffice» **vuota** e più alta di
 * quanto un nodo giustificherebbe (440 contro i 160 minimi): una corsia vuota o più alta dei suoi
 * nodi non deve uscire tagliata dall'export.
 */
function flowDiagramWithPool(): FlowDiagram {
  return {
    model: {
      pools: { p1: { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Backoffice" }] } },
      nodes: { n1: { label: "Inizio", shape: "terminal", lane: "l1" } },
      edges: {},
    },
    view: {
      nodes: { n1: { x: 100, y: 20, collapsed: false } },
      pools: { p1: { x: 0, y: 0, w: 672 } },
      lanes: { l1: { h: 160 }, l2: { h: 440 } },
    },
  }
}

describe("buildSvg (flowchart)", () => {
  it("l'SVG di un flowchart contiene il pool, le corsie e i loro nomi", () => {
    const svg = buildSvg(docOf("flow", flowDiagramWithPool()), { vars, fontFace: "" })!
    expect(svg).toContain('data-layer="pools"')
    expect(svg).toContain("Processo")
    expect(svg).toContain("Cliente")
  })

  it("i pool stanno prima dei nodi nel documento, così restano sotto", () => {
    const svg = buildSvg(docOf("flow", flowDiagramWithPool()), { vars, fontFace: "" })!
    expect(svg.indexOf('data-layer="pools"')).toBeLessThan(svg.indexOf('data-layer="nodes"'))
  })

  it("la larghezza delle bande nell'export è quella salvata nel pool, meno la striscia", () => {
    const svg = buildSvg(docOf("flow", flowDiagramWithPool()), { vars, fontFace: "" })!
    expect(svg).toContain('width="640"')
  })

  it("una corsia vuota o più alta dei suoi nodi non esce tagliata dal viewBox", () => {
    const svg = buildSvg(docOf("flow", flowDiagramWithPool()), { vars, fontFace: "" })!
    const [, y, , h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    expect(y + h).toBeGreaterThanOrEqual(160 + 440)
  })

  it("un pool senza nodi si esporta: è contenuto", () => {
    const d = flowDiagramWithPool()
    d.model.nodes = {}
    d.view.nodes = {}
    expect(buildSvg(docOf("flow", d), { vars, fontFace: "" })).not.toBeNull()
  })

  it("un documento nuovo non ha niente da esportare", () => {
    expect(buildSvg(createDocument("vuoto", "vuoto"), { vars })).toBeNull()
  })
})
```

Usa `docOf` come fanno gli altri test del file; se `docOf("flow", …)` non esiste con questa firma, leggi com'è scritto e adattalo senza cambiarne il comportamento.

- [ ] **Step 11: Il pannello**

In `src/ui/panels/FlowProperties.tsx`:
- gli import cambiano così: `useShallow` sparisce; si aggiungono `import { poolIds } from "@/editor/flow/geometry"`; dal modello `import { FlowShapeSchema, nextName, type FlowModel, type Lane } from "@/model/flow/schema"`;
- in `FlowNodeProperties`, il selettore `const lanes = …` diventa `const flow = useStore(documentStore, (s) => flowDiagram(s.doc))`, e il blocco `Corsia` diventa:

```tsx
      <div className="grid gap-1">
        <Label htmlFor="flow-node-lane">Corsia</Label>
        {/* Alternativa da tastiera al trascinamento (spec 2b §7): «Nessuna» libera il nodo dove sta,
         *  una corsia ce lo porta. Le corsie sono raggruppate per pool, nell'ordine di disegno. */}
        <select
          id="flow-node-lane"
          value={node.lane ?? ""}
          onChange={(e) => dispatch(setNodeLane(key, e.target.value === "" ? null : e.target.value))}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Nessuna</option>
          {poolIds(flow).map((id) => {
            // `poolIds` viene dalle chiavi di `model.pools`: il pool c'è.
            const pool = flow.model.pools[id]!
            return (
              <optgroup key={id} label={pool.name}>
                {pool.lanes.map((lane) => (
                  <option key={lane.id} value={lane.id}>
                    {lane.name}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </div>
```

- il docblock di `FlowProperties` perde la frase sul terzo caso («Il terzo caso, nessuna selezione, …»);
- da `nodeCountByLane` in giù, il file diventa:

```tsx
function nodeCountByLane(nodes: Readonly<Record<string, { lane: string | null }>>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of Object.values(nodes)) {
    if (node.lane !== null) counts.set(node.lane, (counts.get(node.lane) ?? 0) + 1)
  }
  return counts
}

/**
 * Riga di una corsia: nome, ordine, elimina. **L'eliminazione dell'ultima corsia del pool è
 * disabilitata** — lo decide `deleteLane` stesso (`canDelete`), non una copia della regola qui (SSOT).
 *
 * **Una corsia con dentro dei nodi chiede in quale spostarli** prima di eliminarla: il click su
 * «elimina» apre un select inline con le altre corsie dello stesso pool. Una corsia vuota si elimina
 * subito.
 */
function LaneRow({ model, poolId, lane, index, nodeCount }: { model: FlowModel; poolId: string; lane: Lane; index: number; nodeCount: number }) {
  const lanes = model.pools[poolId]?.lanes ?? []
  const others = lanes.filter((l) => l.id !== lane.id)
  const firstOther = others[0]
  const canDelete = firstOther !== undefined && deleteLane(model, lane.id, firstOther.id) !== null
  const [moveTo, setMoveTo] = useState<string | null>(null)

  const startDelete = () => {
    if (!canDelete || !firstOther) return
    if (nodeCount === 0) {
      dispatch(deleteLane(model, lane.id, firstOther.id))
      return
    }
    setMoveTo(firstOther.id)
  }
  const confirmDelete = () => {
    if (moveTo) dispatch(deleteLane(model, lane.id, moveTo))
    setMoveTo(null)
  }

  return (
    <li className="flex flex-col gap-1 rounded border p-2">
      <div className="flex items-center gap-1">
        <CommitInput key={lane.name} value={lane.name} aria-label={`Nome corsia ${index + 1}`} onCommit={(name) => dispatch(renameLane(lane.id, name))} className="h-7 text-xs" />
        <span className="ml-auto flex">
          <Button variant="ghost" size="icon" className="size-6" disabled={index === 0} aria-label={`Sposta su ${lane.name}`} onClick={() => dispatch(moveLane(poolId, index, index - 1))}><ArrowUp /></Button>
          <Button variant="ghost" size="icon" className="size-6" disabled={index === lanes.length - 1} aria-label={`Sposta giù ${lane.name}`} onClick={() => dispatch(moveLane(poolId, index, index + 1))}><ArrowDown /></Button>
          <Button variant="ghost" size="icon" className="size-6" disabled={!canDelete} aria-label={`Elimina corsia ${lane.name}`} onClick={startDelete}><Trash2 /></Button>
        </span>
      </div>
      {moveTo !== null && (
        <div className="flex items-center gap-1 text-xs">
          <span>Sposta {nodeCount} {nodeCount === 1 ? "nodo" : "nodi"} in</span>
          <select aria-label="Corsia di destinazione" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-6 rounded border bg-background px-1 text-xs">
            {others.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <Button size="xs" onClick={confirmDelete}>Elimina</Button>
          <Button size="xs" variant="ghost" onClick={() => setMoveTo(null)}>Annulla</Button>
        </div>
      )}
    </li>
  )
}

/**
 * Le corsie di un pool (spec 2b §7): rinomina, aggiungi, elimina e ordine — l'unico posto della UI che
 * gestisce le corsie come oggetti a sé. La monta il pannello del pool, sotto il nome.
 */
export function PoolLanes({ poolId }: { poolId: string }) {
  const model = useStore(documentStore, (s) => flowDiagram(s.doc).model)
  const pool = model.pools[poolId]
  if (!pool) return null
  const counts = nodeCountByLane(model.nodes)
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        {/* Titolo di sezione, non un'etichetta di campo: un `<Label>` senza `htmlFor` non è associato a
         *  nessun controllo. `IssuesPanel.tsx` titola il proprio pannello con un `<h2>` per lo stesso motivo. */}
        <h2 className="text-xs font-semibold uppercase text-muted-foreground">Corsie</h2>
        <Button variant="outline" size="sm" onClick={() => dispatch(addLane(poolId, nextName("Corsia", pool.lanes)))}><Plus /> Aggiungi</Button>
      </div>
      <ul className="flex flex-col gap-2">
        {pool.lanes.map((lane, index) => (
          <LaneRow key={lane.id} model={model} poolId={poolId} lane={lane} index={index} nodeCount={counts.get(lane.id) ?? 0} />
        ))}
      </ul>
    </div>
  )
}
```

`src/ui/panels/PropertiesPanel.tsx` diventa:

```tsx
import { useStore } from "zustand"
import { linkId, splitKey } from "@/editor/families"
import { selectedKeys, sessionStore } from "@/editor/session-store"
import { viewFor } from "@/ui/canvas/kinds/registry"
import { LinkProperties } from "./LinkProperties"

/**
 * Cornice, non contenuto: decide *se* c'è qualcosa da mostrare (esattamente un nodo o un arco
 * selezionato) e in tal caso monta il `Properties` della famiglia di quell'elemento, letta dal
 * prefisso della sua chiave. Il caso «niente selezionato» — zero o più selezioni miste — non
 * dipende dal tipo, quindi resta qui, con una frase unica.
 *
 * Le corsie non hanno più un pannello globale: stanno nel pannello del loro pool, che si apre
 * selezionando il pool (spec 2b §7).
 */
export function PropertiesPanel() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const nodes = selectedKeys(selection, "node")
  const edges = selectedKeys(selection, "edge")
  const single = (nodes.length === 1 && edges.length === 0) || (edges.length === 1 && nodes.length === 0)
  if (single) {
    const key = (nodes[0] ?? edges[0])!
    // Un collegamento non ha famiglia: si riconosce prima di `splitKey`, che lo rifiuterebbe.
    const link = linkId(key)
    if (link !== null) return <LinkProperties key={link} linkId={link} />
    const { Properties } = viewFor(splitKey(key).family)
    return <Properties />
  }
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? "Seleziona un elemento sul canvas." : `${selection.size} elementi selezionati`}
    </p>
  )
}
```

In `src/ui/panels/FlowProperties.test.tsx`:
- nel test esistente, `const lane = flowDiagram(…).model.lanes[0]!.id` sparisce e `addFlowNode({ x: 0, y: 0 }, "process", lane)` diventa `addFlowNode({ x: 0, y: 0 }, "process", null)`;
- aggiungi agli import `import { withPool } from "@/editor/flow/pool-fixture"` e `PoolLanes` da `./FlowProperties`, e in fondo:

```tsx
describe("FlowNodeProperties: corsia", () => {
  function nodoSelezionato(lane: string | null): string {
    documentStore.getState().load(withPool(createDocument("t", "t"), ["l1", "l2"]))
    const { key, recipe } = addFlowNode({ x: 0, y: 0 }, "process", lane)
    documentStore.getState().dispatch(recipe)
    sessionStore.getState().setSelection([selId("node", qualify("flow", key))])
    act(() => root.render(<FlowProperties />))
    return key
  }

  it("la select ha «Nessuna» in testa e le corsie raggruppate per pool", () => {
    nodoSelezionato(null)
    const select = container.querySelector<HTMLSelectElement>("#flow-node-lane")!
    expect(select.value).toBe("")
    expect(select.options[0]!.textContent).toBe("Nessuna")
    const group = select.querySelector("optgroup")!
    expect(group.label).toBe("Pool 1")
    expect([...group.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["l1", "l2"])
  })

  it("scegliere una corsia ci porta il nodo, e «Nessuna» lo libera", () => {
    const key = nodoSelezionato(null)
    const select = container.querySelector<HTMLSelectElement>("#flow-node-lane")!
    act(() => {
      select.value = "l2"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(flowDiagram(documentStore.getState().doc).model.nodes[key]!.lane).toBe("l2")
    act(() => {
      select.value = ""
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(flowDiagram(documentStore.getState().doc).model.nodes[key]!.lane).toBeNull()
  })
})

describe("PoolLanes", () => {
  it("«Aggiungi» mette in fondo al pool una corsia con il primo nome libero", () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    act(() => root.render(<PoolLanes poolId="p1" />))
    const aggiungi = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Aggiungi"))!
    act(() => aggiungi.click())
    expect(flowDiagram(documentStore.getState().doc).model.pools["p1"]!.lanes.map((l) => l.name)).toEqual(["l1", "Corsia 2"])
  })

  it("l'ultima corsia di un pool non si elimina", () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    act(() => root.render(<PoolLanes poolId="p1" />))
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Elimina corsia l1"]')!.disabled).toBe(true)
  })
})
```

- [ ] **Step 12: Le fixture degli altri test, e il runner**

In ognuno di questi cinque file c'è una riga `const lane = <…>.model.lanes[0]!.id` seguita da nodi di flusso scritti con `lane` (abbreviato) o `lane: lane`: cancella la riga e scrivi `lane: null` in quei nodi. I nodi non erano mai stati in una corsia per scelta del test, solo perché lo schema lo imponeva.
- `src/model/links/labels.test.ts` (riga 25 di oggi)
- `src/model/links/validate.test.ts` (riga 128)
- `src/editor/links/commands.test.ts` (riga 26)
- `src/ui/panels/LinkProperties.test.tsx` (riga 73)
- `src/ui/canvas/use-canvas-interaction.test.tsx` (riga 264)

In `src/ui/canvas/interaction-runner.test.ts`, dentro `describe("il rilascio del flowchart")`:
- cancella il test `"un nodo riallineato esattamente dov'era non lascia il DOM fermo all'anteprima"` (scostamento 7) e, se non serve più, l'import di `LANE_PAD`. Tieni `fintoNodoStato`: lo usa il Task 3;
- nel test `"il cablaggio: il rilascio in un'altra corsia passa da commitDrag, non da moveNodes"`, sostituisci la costruzione del documento (da `const base = …` fino a `doc = produce(doc, added.recipe)`) con:

```ts
    const base = withPool(createDocument("t", "t"), ["l1", "l2"], 100)
    const added = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    const doc = produce(base, added.recipe)
```

  e l'asserzione finale con `expect(flowDiagram(documentStore.getState().doc).model.nodes[added.key]!.lane).toBe("l2")`. Aggiungi `import { withPool } from "@/editor/flow/pool-fixture"`.

In `src/ui/canvas/interaction-runner.ts`, nel docblock di `resetDragTargets`, il secondo paragrafo («Gira a ogni rilascio, prima della dispatch. Serve per primo al flowchart …» fino a «… e viene comunque sovrascritto da React se la fa.») diventa: `Gira a ogni rilascio, prima della dispatch: se la recipe non produce patch — uno spostamento che la griglia annulla — React non ridisegna niente, e senza questo reset il transform scritto a mano dall'anteprima resterebbe sul DOM. Scrivendo qui le posizioni di partenza prima della dispatch, il DOM è corretto in entrambi i casi.`

- [ ] **Step 13: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS. Se `tsc` segnala un altro file che legge `model.lanes`, `view.lanes[…].y`, `laneBandExtent`, `keepNodeInBand` o `nextLaneName`, adattalo con le funzioni di questo task e segnalalo nel report. Non lanciare `pnpm e2e`: `flow.mjs` è rosso fino al Task 5 (scostamento 6).

- [ ] **Step 14: Commit**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat(flow): corsie dentro pool facoltativi, nodi liberi, e la versione 6

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Il pool sul canvas: crearlo, selezionarlo, spostarlo, eliminarlo, e il suo pannello

**Files:**
- Modify: `src/editor/flow/commands.ts`, `src/editor/flow/commands.test.ts`
- Modify: `src/editor/kinds/ops.ts`
- Modify: `src/editor/kinds/flow.ts`, `src/editor/kinds/flow.test.ts`
- Modify: `src/editor/kinds/canvas-ops.ts`, `src/editor/kinds/canvas-ops.test.ts`
- Modify: `src/editor/actions.ts`
- Modify: `src/ui/canvas/interaction-runner.ts`, `src/ui/canvas/interaction-runner.test.ts`
- Modify: `src/ui/canvas/use-canvas-interaction.ts`, `src/ui/canvas/use-canvas-interaction.test.tsx`
- Modify: `src/ui/canvas/PoolsLayer.tsx`, `src/ui/canvas/PoolsLayer.test.tsx`
- Modify: `src/ui/canvas/kinds/flow.tsx`
- Modify: `src/ui/panels/FlowProperties.tsx`, `src/ui/panels/FlowProperties.test.tsx`
- Modify: `src/ui/export/actions.ts`, `src/ui/export/svg.tsx`

**Interfaces:**
- Consumes (Task 2): `poolAt`, `poolMembers`, `poolRect`, `poolIds`, `PoolsPart`, `nextName`, `POOL_MIN_W`, `LANE_MIN_H`, `withPool`, `PoolLanes`, `PoolsLayerView`.
- Produces:
  - Da `@/editor/flow/commands`: `addPool(at: Point, name: string): { key: string; recipe: Recipe }`, `renamePool(id: string, name: string): Recipe`. `moveFlowNodes` e `deleteFlowItems` accettano anche chiavi di pool.
  - Da `@/editor/kinds/flow`: `POOL_VARIANT = "pool"`.
  - `DiagramOps` guadagna tre metodi facoltativi: `frameKeys?(): string[]`, `withFollowers?(keys: readonly string[]): string[]`, `refuseNode?(at: Point, variant?: string): string | null`. `addNode` torna `edit: EditTarget | null`.
  - `CanvasOps` guadagna `frameKeys(): string[]`, `isFrame(key: string): boolean`, `withFollowers(keys: readonly string[]): string[]`, `refuseNode(at: Point, family: Family, variant?: string): string | null`; `addNode` torna `edit: EditTarget | null`.
  - `familyHasContent` conta anche i pool; `nodeRects` e `fitToContent` comprendono i pool.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/flow/commands.test.ts`, aggiungi `addPool`, `renamePool` all'import da `./commands`, `POOL_MIN_W` all'import dal modello, e in fondo:

```ts
describe("addPool e renamePool", () => {
  it("crea un pool allineato alla griglia, con una corsia «Corsia 1» alta il minimo", () => {
    const { key, recipe } = addPool({ x: 33, y: 47 }, "Pool 1")
    const d = fd(apply(createDocument("t", "t"), recipe))
    expect(d.model.pools[key]).toEqual({ name: "Pool 1", lanes: [{ id: expect.any(String), name: "Corsia 1" }] })
    expect(d.view.pools[key]).toEqual({ x: 30, y: 50, w: POOL_MIN_W })
    expect(d.view.lanes[d.model.pools[key]!.lanes[0]!.id]).toEqual({ h: LANE_MIN_H })
  })

  it("rinomina il pool", () => {
    expect(fd(apply(docWith(), renamePool("p1", "Ordini"))).model.pools["p1"]!.name).toBe("Ordini")
  })
})

describe("moveFlowNodes con i pool", () => {
  it("spostare un pool porta con sé i suoi nodi, senza cambiarne la corsia", () => {
    const n = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), moveFlowNodes(["p1"], 200, 300)!)
    // La fixture mette il pool a x = −32, fuori griglia: lo spostamento lo riallinea (−32 + 200 → 170).
    expect(fd(next).view.pools["p1"]).toMatchObject({ x: 170, y: 300 })
    expect(fd(next).view.nodes[n.key]).toMatchObject({ x: 300, y: 320 })
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
    expectLaneInvariant(fd(next))
  })

  it("un nodo libero sotto il pool non viene catturato, e non si sposta", () => {
    // Review Focus 2.
    const libero = addFlowNode({ x: 100, y: 20 }, "process", null)
    const next = apply(apply(docWith(), libero.recipe), moveFlowNodes(["p1"], 200, 0)!)
    expect(fd(next).view.nodes[libero.key]).toMatchObject({ x: 100, y: 20 })
    expect(fd(next).model.nodes[libero.key]!.lane).toBeNull()
  })

  it("un nodo del pool che è anche fra le chiavi si sposta una volta sola", () => {
    const n = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), moveFlowNodes(["p1", n.key], 200, 0)!)
    expect(fd(next).view.nodes[n.key]!.x).toBe(300)
  })
})

describe("deleteFlowItems con i pool", () => {
  it("elimina il pool e le sue corsie, e i suoi nodi restano dove sono, liberi", () => {
    const n = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), deleteFlowItems(["p1"], [])!)
    expect(fd(next).model.pools).toEqual({})
    expect(fd(next).view.pools).toEqual({})
    expect(fd(next).view.lanes).toEqual({})
    expect(fd(next).model.nodes[n.key]!.lane).toBeNull()
    expect(fd(next).view.nodes[n.key]).toMatchObject({ x: 100, y: 20 })
  })
})
```

In `src/editor/kinds/flow.test.ts`, aggiungi `import { POOL_VARIANT } from "./flow"` e:

```ts
describe("flowOps e i pool", () => {
  it("lo strumento Pool fuori da ogni pool crea un pool, senza aprire un editor", () => {
    const doc = createDocument("test", "id-1")
    const ops = familyOps(doc, "flow")
    expect(ops.refuseNode?.({ x: 0, y: 0 }, POOL_VARIANT)).toBeNull()
    const { key, recipe, edit } = ops.addNode({ x: 0, y: 0 }, POOL_VARIANT)
    expect(produce(doc, recipe).diagram.flow.model.pools[key]!.name).toBe("Pool 1")
    expect(edit).toBeNull()
  })

  it("il secondo pool si chiama «Pool 2»", () => {
    const doc = withPool(createDocument("test", "id-1"))
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 1000 }, POOL_VARIANT)
    expect(produce(doc, recipe).diagram.flow.model.pools[key]!.name).toBe("Pool 2")
  })

  it("lo strumento Pool dentro un pool rifiuta, con il suo avviso", () => {
    const doc = withPool(createDocument("test", "id-1"))
    expect(familyOps(doc, "flow").refuseNode?.({ x: 100, y: 50 }, POOL_VARIANT)).toBe("Un pool non sta dentro un altro pool.")
  })

  it("un nodo dentro un pool non è mai rifiutato", () => {
    const doc = withPool(createDocument("test", "id-1"))
    expect(familyOps(doc, "flow").refuseNode?.({ x: 100, y: 50 }, "process")).toBeNull()
  })

  it("i pool sono frame e non nodi, e rectOf ne dà il rettangolo", () => {
    const ops = familyOps(withPool(createDocument("test", "id-1")), "flow")
    expect(ops.frameKeys?.()).toEqual(["p1"])
    expect(ops.nodeKeys()).toEqual([])
    expect(ops.rectOf("p1")).toEqual({ x: -32, y: 0, w: 672, h: 160 })
    expect(ops.rectOf("p1", { x: 5, y: 6 })).toEqual({ x: 5, y: 6, w: 672, h: 160 })
  })

  it("con un pool si trascinano anche i suoi nodi, una volta sola", () => {
    const base = withPool(createDocument("test", "id-1"))
    const { key, recipe } = familyOps(base, "flow").addNode({ x: 100, y: 20 }, "process")
    const ops = familyOps(produce(base, recipe), "flow")
    expect(new Set(ops.withFollowers?.(["p1", key]))).toEqual(new Set(["p1", key]))
    expect(ops.withFollowers?.(["p1"])).toHaveLength(2)
  })
})
```

In `src/editor/kinds/canvas-ops.test.ts`, aggiungi `import { withPool } from "../flow/pool-fixture"` e dentro `describe("canvasOps (famiglie mescolate)")`:

```ts
  it("un pool è un frame: non un nodo, ma contenuto della famiglia", () => {
    state().load(withPool(createDocument("t", "t")))
    const ops = canvasOps(state().doc)
    expect(ops.isFrame("flow/p1")).toBe(true)
    expect(ops.isFrame("er/p1")).toBe(false)
    expect(ops.nodeKeys()).toEqual([])
    expect(ops.frameKeys()).toEqual(["flow/p1"])
    expect(familyHasContent(state().doc, "flow")).toBe(true)
  })

  it("Collega da un pool non crea niente, nemmeno verso un'altra famiglia", () => {
    // Review Focus 1.
    state().load(withPool(createDocument("t", "t")))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 900 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 900, y: 900 }, "flow", "process")
    state().dispatch(node.recipe)
    expect(canvasOps(state().doc).addEdge("flow/p1", entity.key)).toBeNull()
    expect(canvasOps(state().doc).addEdge(entity.key, "flow/p1")).toBeNull()
    expect(canvasOps(state().doc).addEdge("flow/p1", node.key)).toBeNull()
  })

  it("trascinare un pool porta i suoi nodi in un solo passo, e un annulla riporta tutto", () => {
    // Review Focus 2.
    state().load(withPool(createDocument("t", "t")))
    const node = canvasOps(state().doc).addNode({ x: 100, y: 20 }, "flow", "process")
    state().dispatch(node.recipe)
    expect(canvasOps(state().doc).withFollowers(["flow/p1"]).sort()).toEqual(["flow/p1", node.key].sort())
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).commitDrag(["flow/p1"], 100, 0)!)
    expect(state().past.length).toBe(past + 1)
    expect(canvasOps(state().doc).rectOf(node.key)!.x).toBe(200)
    state().undo()
    expect(canvasOps(state().doc).rectOf(node.key)!.x).toBe(100)
    expect(canvasOps(state().doc).rectOf("flow/p1")!.x).toBe(-32)
  })

  it("eliminare un pool lascia i suoi nodi, liberi", () => {
    state().load(withPool(createDocument("t", "t")))
    const node = canvasOps(state().doc).addNode({ x: 100, y: 20 }, "flow", "process")
    state().dispatch(node.recipe)
    state().dispatch(canvasOps(state().doc).deleteItems(["flow/p1"], [])!)
    expect(canvasOps(state().doc).frameKeys()).toEqual([])
    expect(canvasOps(state().doc).nodeKeys()).toEqual([node.key])
  })
```

(Se `familyHasContent` non è già importato nel file, aggiungilo all'import da `./canvas-ops`.)

In `src/ui/canvas/interaction-runner.test.ts`, dentro `describe("il rilascio del flowchart")`:

```ts
  it("lo strumento Pool dentro un pool non crea niente: avviso, e lo strumento resta attivo", () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    documentSession.getState().patch({ notice: null })
    sessionStore.getState().setTool("node", "flow", "pool")
    const prima = documentStore.getState().doc
    const runner = createInteractionRunner()
    runner.step(giu({ world: { x: 100, y: 50 }, hit: { kind: "canvas" } }))
    expect(documentStore.getState().doc).toBe(prima)
    expect(documentSession.getState().notice).toBe("Un pool non sta dentro un altro pool.")
    expect(sessionStore.getState().tool).toBe("node")
    sessionStore.getState().setTool("select")
  })

  it("l'anteprima del drag di un pool muove anche i suoi nodi", () => {
    const base = withPool(createDocument("t", "t"))
    const added = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    documentStore.getState().load(produce(base, added.recipe))
    sessionStore.getState().setViewport(IDENTITY)
    sessionStore.getState().setCanvasSize({ w: 800, h: 600 })
    const pool = fintoNodoStato()
    const nodo = fintoNodoStato()
    registerNode(qualify("flow", "p1"), pool.el)
    registerNode(qualify("flow", added.key), nodo.el)
    const runner = createInteractionRunner()
    runner.step(giu({ world: { x: -20, y: 50 }, hit: { kind: "node", key: qualify("flow", "p1") } }))
    runner.step(muovi({ world: { x: 80, y: 50 } }))
    expect(pool.attrs.transform).toBe("translate(70 0)")
    expect(nodo.attrs.transform).toBe("translate(200 20)")
    runner.step({ type: "cancel" })
    registerNode(qualify("flow", "p1"), null)
    registerNode(qualify("flow", added.key), null)
  })
```

In `src/ui/canvas/use-canvas-interaction.test.tsx`, dentro `describe("il resto del cablaggio")`, aggiungi `import { withPool } from "@/editor/flow/pool-fixture"` e:

```ts
  it("il doppio click su un pool non apre niente", () => {
    documentStore.getState().load(withPool(createDocument("f", "f")))
    const pool = document.createElementNS("http://www.w3.org/2000/svg", "g")
    pool.setAttribute("data-node-id", qualify("flow", "p1"))
    svg.append(pool)
    sotto = pool
    svg.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }))
    expect(sessionStore.getState().editing).toBeNull()
  })
```

In `src/ui/canvas/PoolsLayer.test.tsx`, aggiungi agli import `selId, sessionStore` da `@/editor/session-store` e `qualify` da `@/editor/families`, e dentro `describe("PoolsLayer — connesso allo store")`:

```ts
  it("il pool è un nodo del canvas, e da selezionato ha il bordo evidenziato", () => {
    documentStore.getState().load(withPool(createDocument("t")))
    sessionStore.getState().setSelection([selId("node", qualify("flow", "p1"))])
    const { html, smonta } = monta()
    expect(html()).toContain('data-node-id="flow/p1"')
    expect(html()).toContain('stroke="var(--primary)"')
    smonta()
    sessionStore.getState().setSelection([])
  })
```

In `src/ui/panels/FlowProperties.test.tsx` il test passa dal campo, come quello dell'etichetta. Aggiungi:

```tsx
describe("pannello del pool", () => {
  it("con un pool selezionato mostra il nome, modificabile, e le sue corsie", () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    sessionStore.getState().setSelection([selId("node", qualify("flow", "p1"))])
    act(() => root.render(<FlowProperties />))
    const nome = container.querySelector<HTMLInputElement>("#pool-name")!
    expect(nome.value).toBe("Pool 1")
    expect(container.textContent).toContain("Corsie")
    act(() => editAndBlur(nome, "Ordini"))
    expect(flowDiagram(documentStore.getState().doc).model.pools["p1"]!.name).toBe("Ordini")
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/editor/flow src/editor/kinds src/ui/canvas src/ui/panels`
Expected: FAIL. `addPool`, `renamePool`, `POOL_VARIANT`, `frameKeys`, `isFrame`, `withFollowers` e `refuseNode` non esistono, il pool non ha `data-node-id` e non ha pannello.

- [ ] **Step 3: I comandi dei pool**

In `src/editor/flow/commands.ts`:
- gli import dal modello diventano `import { LANE_MIN_H, POOL_MIN_W, nextName, type FlowDiagram, type FlowModel, type FlowShape } from "@/model/flow/schema"`, e dalla geometria si aggiunge `poolMembers`;
- `moveFlowNodes`, con il suo docblock, diventa:

```ts
/**
 * Sposta i nodi come `moveNodes` (`commands/view.ts`) — stesso `snap`, stessa regola «niente si
 * muove» con `dx` e `dy` entrambi zero — e poi decide la corsia dal **centro** di ognuno: la corsia
 * in cui cade, o `null` se cade fuori da ogni pool o sulla striscia (spec 2b §5). Posizione e
 * corsia stanno nella stessa recipe: un solo passo di annulla.
 *
 * Fra le chiavi possono esserci **pool**: il pool si sposta con tutti i suoi nodi, che non cambiano
 * corsia, e un suo nodo che è anche fra le chiavi si sposta una volta sola. Un nodo libero che sta
 * sotto il pool non lo segue: spostare un pool non cattura niente (spec 2b §5).
 */
export function moveFlowNodes(keys: readonly string[], dx: number, dy: number): Recipe | null {
  if (dx === 0 && dy === 0) return null
  return (draft) => {
    const d = flowDiagram(draft)
    const pools = keys.filter((k) => k in d.model.pools)
    const carried = new Set(pools.flatMap((id) => poolMembers(d, id)))
    for (const id of pools) {
      const view = d.view.pools[id]
      if (!view) continue
      view.x = snap(view.x + dx)
      view.y = snap(view.y + dy)
    }
    for (const key of carried) {
      const view = d.view.nodes[key]
      if (!view) continue
      view.x = snap(view.x + dx)
      view.y = snap(view.y + dy)
    }
    for (const key of keys) {
      if (carried.has(key)) continue
      const node = d.model.nodes[key]
      const view = d.view.nodes[key]
      if (!node || !view) continue
      view.x = snap(view.x + dx)
      view.y = snap(view.y + dy)
      const { w, h } = flowNodeSize(node)
      node.lane = laneAt(d, { x: view.x + w / 2, y: view.y + h / 2 })
    }
  }
}
```

- `deleteFlowItems`, con un docblock nuovo, diventa:

```ts
/**
 * Cancella nodi e archi; gli archi che toccano un nodo cancellato se ne vanno con lui. Fra le chiavi
 * dei nodi possono esserci **pool**: il pool se ne va con le sue corsie, e i suoi nodi restano dove
 * sono, liberi (spec 2b §5) — niente sparisce se non il contenitore.
 */
export function deleteFlowItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null {
  if (nodeKeys.length === 0 && edgeKeys.length === 0) return null
  const nodes = new Set(nodeKeys)
  return (draft) => {
    const d = flowDiagram(draft)
    for (const key of nodeKeys) {
      const pool = d.model.pools[key]
      if (!pool) continue
      for (const member of poolMembers(d, key)) d.model.nodes[member]!.lane = null
      for (const lane of pool.lanes) delete d.view.lanes[lane.id]
      delete d.model.pools[key]
      delete d.view.pools[key]
    }
    for (const key of edgeKeys) delete d.model.edges[key]
    for (const [key, edge] of Object.entries(d.model.edges)) {
      if (nodes.has(edge.source) || nodes.has(edge.target)) delete d.model.edges[key]
    }
    for (const key of nodeKeys) {
      delete d.model.nodes[key]
      delete d.view.nodes[key]
    }
  }
}
```

(`d.model.nodes[member]!`: `poolMembers` torna solo chiavi di `model.nodes`.)

- sopra `addLane` aggiungi:

```ts
/**
 * Nuovo pool con l'angolo superiore sinistro sul punto dato, allineato alla griglia: una corsia
 * «Corsia 1» alta il minimo, larghezza `POOL_MIN_W` (spec 2b §5). Il nome lo sceglie chi chiama,
 * con `nextName("Pool", …)`, perché dipende dai pool che ci sono già.
 */
export function addPool(at: Point, name: string): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  const laneId = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const d = flowDiagram(draft)
      d.model.pools[key] = { name, lanes: [{ id: laneId, name: nextName("Corsia", []) }] }
      d.view.pools[key] = { x: snap(at.x), y: snap(at.y), w: POOL_MIN_W }
      d.view.lanes[laneId] = { h: LANE_MIN_H }
    },
  }
}

export function renamePool(id: string, name: string): Recipe {
  return (draft) => {
    const pool = flowDiagram(draft).model.pools[id]
    if (pool && pool.name !== name) pool.name = name
  }
}
```

- [ ] **Step 4: I contratti delle operazioni**

In `src/editor/kinds/ops.ts`, dentro `interface DiagramOps`:
- `addNode(at: Point, variant?: string): { key: string; recipe: Recipe; edit: EditTarget }` diventa `addNode(at: Point, variant?: string): { key: string; recipe: Recipe; edit: EditTarget | null }`, e al docblock aggiungi `` `edit` è `null` quando non c'è niente da scrivere: un pool appena creato si rinomina dal pannello. ``;
- dopo `nodeKeys(): string[]` aggiungi:

```ts
  /**
   * Chiavi di elementi che contengono nodi ma non sono nodi: i pool del flowchart (spec 2b §5). Si
   * selezionano, si trascinano e si eliminano come nodi, `rectOf` ne dà il rettangolo, ma non
   * entrano nella selezione a riquadro, in «Seleziona tutto» né nei collegamenti. Assente: nessuno.
   */
  frameKeys?(): string[]
  /** Le chiavi date più i nodi che un drag delle chiavi porta con sé (i nodi di un pool). Assente: le chiavi date. */
  withFollowers?(keys: readonly string[]): string[]
  /**
   * Il motivo per cui `addNode` non va chiamato in quel punto, o `null`. Si chiede **prima** di
   * creare, come `connectAcross` prima di collegare: un pool non nasce dentro un altro pool.
   * Assente: niente è mai rifiutato.
   */
  refuseNode?(at: Point, variant?: string): string | null
```

In `src/editor/kinds/flow.ts`:
- aggiungi agli import `nextName` (da `@/model/flow/schema`, accanto a `type FlowShape`), `addPool` (da `../flow/commands`), `poolAt`, `poolMembers`, `poolRect` (da `../flow/geometry`);
- sopra `flowOps`:

```ts
/** La variante dello strumento nodo che crea un pool invece di un nodo (spec 2b §5). */
export const POOL_VARIANT = "pool"
```

- dentro l'oggetto di `flowOps`, dopo `nodeKeys`:

```ts
    frameKeys: () => Object.keys(diagram().model.pools),

    withFollowers: (keys) => {
      const d = diagram()
      return [...new Set([...keys, ...keys.flatMap((k) => (k in d.model.pools ? poolMembers(d, k) : []))])]
    },

    refuseNode: (at, variant) => (variant === POOL_VARIANT && poolAt(diagram(), at) !== null ? "Un pool non sta dentro un altro pool." : null),
```

- `rectOf` diventa:

```ts
    rectOf: (key, at) => {
      const d = diagram()
      if (key in d.model.pools) return poolRect(d, key, at)
      const node = d.model.nodes[key]
      const view = d.view.nodes[key]
      if (!node || !view) return null
      return flowNodeRect(node, at ? { ...view, ...at } : view)
    },
```

- in `addNode`, come prima riga dopo `const d = diagram()`:

```ts
      if (variant === POOL_VARIANT) return { ...addPool(at, nextName("Pool", Object.values(d.model.pools))), edit: null }
```

In `src/editor/kinds/canvas-ops.ts`:
- nell'interfaccia `CanvasOps`, `addNode(...)` torna `{ key: string; recipe: Recipe; edit: EditTarget | null }`; dopo `nodeKeys(): string[]` aggiungi:

```ts
  /** I frame di tutte le famiglie, con prefisso (i pool, spec 2b §5). */
  frameKeys(): string[]
  /** Vero se la chiave è un frame e non un nodo. */
  isFrame(key: string): boolean
  /** Le chiavi date più i nodi che un drag porta con sé. */
  withFollowers(keys: readonly string[]): string[]
  /** Il motivo per cui lo strumento non crea niente in quel punto, o `null`. */
  refuseNode(at: Point, family: Family, variant?: string): string | null
```

- dentro `canvasOps`, prima del `return`:

```ts
  const isFrame = (qualified: string): boolean => {
    if (linkId(qualified) !== null) return false
    const { family, key } = splitKey(qualified)
    return ops(family).frameKeys?.().includes(key) ?? false
  }
```

- nell'oggetto restituito, dopo `nodeKeys`:

```ts
    frameKeys: () => FAMILIES.flatMap((f) => (ops(f).frameKeys?.() ?? []).map((k) => qualify(f, k))),

    isFrame,

    withFollowers: (keys) =>
      [...byFamily(keys)].flatMap(([f, ks]) => {
        const o = ops(f)
        return (o.withFollowers ? o.withFollowers(ks) : ks).map((k) => qualify(f, k))
      }),

    refuseNode: (at, family, variant) => ops(family).refuseNode?.(at, variant) ?? null,
```

- `addEdge` comincia con:

```ts
      // Un frame non è un estremo (spec 2b §2): niente arco, niente collegamento, niente avviso.
      if (isFrame(source) || isFrame(target)) return null
```

- `familyHasContent` e `nodeRects` diventano:

```ts
/** La famiglia ha almeno un nodo o un frame (un pool vuoto conta, spec 2b §6). È la sola definizione
 *  di «ha contenuto»: export, menu, documento e Disponi la usano. */
export function familyHasContent(doc: DevDocument, family: Family): boolean {
  const ops = familyOps(doc, family)
  return ops.nodeKeys().length > 0 || (ops.frameKeys?.().length ?? 0) > 0
}

/** I rettangoli di tutti i nodi e i frame del canvas, di ogni famiglia: lo spazio già occupato. */
export function nodeRects(doc: DevDocument): Rect[] {
  const ops = canvasOps(doc)
  return [...ops.nodeKeys(), ...ops.frameKeys()].flatMap((key) => ops.rectOf(key) ?? [])
}
```

In `src/editor/actions.ts`, `fitToContent` legge i rettangoli da `nodeRects`:

```ts
export function fitToContent(): void {
  const rects = nodeRects(documentStore.getState().doc)
  const session = sessionStore.getState()
  session.setViewport(fitToRect(rectsBounds(rects), session.canvasSize))
}
```

(con `import { canvasOps, nodeRects } from "./kinds/canvas-ops"`).

In `src/ui/export/actions.ts`, `hasNodes` diventa:

```ts
/** Vero se il documento ha contenuto in qualunque famiglia, un pool vuoto compreso: il caso vuoto di `copyPng`. */
function hasNodes(doc: DevDocument): boolean {
  return FAMILIES.some((f) => familyHasContent(doc, f))
}
```

con gli import di `FAMILIES` (`@/model/family`) e `familyHasContent` (`@/editor/kinds/canvas-ops`) al posto di `canvasOps`, se non serve più.

- [ ] **Step 5: Il runner, il doppio click, il disegno e lo strumento**

In `src/ui/canvas/interaction-runner.ts`:
- `case "preview-drag"` diventa:

```ts
      case "preview-drag":
        // I nodi di un pool trascinato si muovono con lui già nell'anteprima (spec 2b §5).
        dragTargets ??= collectDragTargets(canvasOps(documentStore.getState().doc).withFollowers(fx.keys))
        previewDrag(dragTargets, fx.dx, fx.dy)
        break
```

- `case "create-node"` diventa:

```ts
      case "create-node": {
        const ops = canvasOps(documentStore.getState().doc)
        const notice = ops.refuseNode(fx.at, fx.family, fx.variant)
        if (notice !== null) {
          // Come un rifiuto di Collega: l'avviso nella barra, e lo strumento resta attivo per riprovare.
          documentSession.getState().patch({ notice })
          break
        }
        const { key, recipe, edit } = ops.addNode(fx.at, fx.family, fx.variant)
        documentStore.getState().dispatch(recipe)
        session().setSelection([selId("node", key)])
        session().setTool("select")
        if (edit !== null) session().setEditing({ key, target: edit })
        break
      }
```

In `src/ui/canvas/use-canvas-interaction.ts`, aggiungi `import { canvasOps } from "@/editor/kinds/canvas-ops"` e, in `onDblClick`, subito dopo la riga `if (linkId(hit.key) !== null) return`:

```ts
      // Un pool non ha niente da modificare sul canvas: si rinomina dal pannello (spec 2b §7).
      if (canvasOps(documentStore.getState().doc).isFrame(hit.key)) return
```

`src/ui/canvas/PoolsLayer.tsx` diventa:

```tsx
import { useMemo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { poolIds, poolLaneRects, poolRect, type PoolsPart } from "@/editor/flow/geometry"
import { PAD_X } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { POOL_HEADER_W } from "@/model/flow/schema"
import { registerNode } from "./dom-registry"

/**
 * Vista pura dei pool (spec 2b §3): per ognuno le bande delle corsie, la striscia a sinistra con il
 * nome ruotato come in BPMN e il contorno. La usano il canvas (`PoolsLayer`, sotto) e l'export
 * (`buildSvg`): è la ragione per cui esiste come componente separato — lo stesso pool nell'app e nel
 * file.
 *
 * Il gruppo di un pool ha `data-node-id="flow/<poolId>"` ed è registrato in `dom-registry`: selezione
 * e drag lo trattano come un nodo, e l'anteprima del drag riscrive solo il suo `transform`, perché le
 * coordinate interne sono relative al suo angolo. Si afferra solo la striscia: bande e contorno non
 * ricevono il puntatore, quindi un clic sul corpo di una corsia arriva al canvas, e da lì partono
 * selezione a riquadro e pan.
 */
export function PoolsLayerView({ part, selected = new Set() }: { part: PoolsPart; selected?: ReadonlySet<string> }) {
  return (
    <g data-layer="pools">
      {poolIds(part).map((id) => (
        <PoolFrame key={id} part={part} poolId={id} selected={selected.has(id)} />
      ))}
    </g>
  )
}

function PoolFrame({ part, poolId, selected }: { part: PoolsPart; poolId: string; selected: boolean }) {
  const pool = part.model.pools[poolId]
  const rect = poolRect(part, poolId)
  if (!pool || !rect) return null
  const id = qualify("flow", poolId)
  const lanes = poolLaneRects(part, poolId)
  return (
    <g
      data-node-id={id}
      data-pool={poolId}
      transform={`translate(${rect.x} ${rect.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
      {lanes.map((lane, i) => (
        <g key={lane.id} pointerEvents="none">
          <rect x={POOL_HEADER_W} y={lane.y - rect.y} width={lane.w} height={lane.h} fill="var(--muted)" fillOpacity={0.35} stroke="var(--border)" />
          <text x={POOL_HEADER_W + PAD_X} y={lane.y - rect.y + PAD_X} dominantBaseline="hanging" fontSize={11} fill="var(--muted-foreground)">
            {pool.lanes[i]?.name}
          </text>
        </g>
      ))}
      <rect data-pool-header x={0} y={0} width={POOL_HEADER_W} height={rect.h} fill="var(--muted)" stroke="var(--border)" />
      <text
        transform={`translate(${POOL_HEADER_W / 2} ${rect.h / 2}) rotate(-90)`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fill="var(--foreground)"
        pointerEvents="none"
      >
        {pool.name}
      </text>
      <rect x={0} y={0} width={rect.w} height={rect.h} fill="none" stroke={selected ? "var(--primary)" : "var(--border)"} strokeWidth={selected ? 2 : 1} pointerEvents="none" />
    </g>
  )
}

/**
 * Componente connesso: monta `PoolsLayerView` con i pool dello store, prima di archi e nodi
 * (`Canvas.tsx`). Tre selettori stabili invece del diagramma intero: un drag di nodi cambia
 * `view.nodes`, non i pool, e non li ridisegna.
 */
export function PoolsLayer() {
  const pools = useStore(documentStore, (s) => flowDiagram(s.doc).model.pools)
  const poolViews = useStore(documentStore, (s) => flowDiagram(s.doc).view.pools)
  const laneViews = useStore(documentStore, (s) => flowDiagram(s.doc).view.lanes)
  const selection = useStore(sessionStore, (s) => s.selection)
  const part = useMemo(() => ({ model: { pools }, view: { pools: poolViews, lanes: laneViews } }), [pools, poolViews, laneViews])
  const selected = useMemo(() => new Set(Object.keys(pools).filter((id) => selection.has(selId("node", qualify("flow", id))))), [pools, selection])
  return <PoolsLayerView part={part} selected={selected} />
}
```

In `src/ui/export/svg.tsx` non cambia niente: `PoolsLayerView` senza `selected` disegna tutti i pool non selezionati. (Il `ref` non gira in `renderToStaticMarkup`.)

In `src/ui/canvas/kinds/flow.tsx`:
- aggiungi `import { Rows3 } from "lucide-react"` e `import { POOL_VARIANT } from "@/editor/kinds/flow"`;
- `tools` diventa la lista delle forme seguita dal pool:

```ts
  tools: [
    ...FLOW_SHAPES.map((shape, i) => ({
      // La nota ha un'etichetta sua solo qui: il select delle forme nel pannello resta «Nota».
      label: shape === "note" ? "Nota di flusso" : FLOW_SHAPE_LABEL[shape],
      key: String(i + 1),
      Icon: FLOW_SHAPE_ICON[shape],
      tool: "node" as const,
      family: "flow" as const,
      variant: shape,
    })),
    // Il pool è una variante dello strumento nodo che crea un contenitore (spec 2b §5).
    { label: "Pool", key: "p", Icon: Rows3, tool: "node" as const, family: "flow" as const, variant: POOL_VARIANT },
  ],
```

Controlla in `src/ui/use-keyboard-shortcuts.ts` che i tasti degli strumenti arrivino da `tools` e che `p` non sia già usato; se una scorciatoia fissa usa `p`, fermati e segnalalo.

- [ ] **Step 6: Il pannello del pool**

In `src/ui/panels/FlowProperties.tsx`:
- aggiungi `renamePool` all'import da `@/editor/flow/commands`;
- sopra `FlowProperties`:

```tsx
/** Il pannello di un pool selezionato (spec 2b §7): il nome, e sotto le sue corsie. */
function PoolProperties({ poolId }: { poolId: string }) {
  const pool = useStore(documentStore, (s) => flowDiagram(s.doc).model.pools[poolId])
  if (!pool) return null
  return (
    <div className="flex flex-col">
      <div className="grid gap-1 p-3 pb-0">
        <Label htmlFor="pool-name">Nome</Label>
        <CommitInput key={pool.name} id="pool-name" value={pool.name} onCommit={(name) => dispatch(renamePool(poolId, name))} />
      </div>
      <PoolLanes poolId={poolId} />
    </div>
  )
}
```

- `FlowProperties` distingue il pool dal nodo come `ClassProperties` distingue la nota dalla classe:

```tsx
export function FlowProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const nodes = familySelectedKeys(selection, "node", "flow")
  const key = nodes.length === 1 ? nodes[0]! : undefined
  const isPool = useStore(documentStore, (s) => key !== undefined && key in flowDiagram(s.doc).model.pools)
  if (key !== undefined) return isPool ? <PoolProperties key={key} poolId={key} /> : <FlowNodeProperties key={key} nodeKey={key} />
  const edges = familySelectedKeys(selection, "edge", "flow")
  return <FlowEdgeProperties key={edges[0]} edgeKey={edges[0]!} />
}
```

  e il suo docblock aggiunge: `Nodi e pool condividono lo spazio di chiavi di selezione: una chiave selezionata si distingue guardando in quale dei due record del modello compare, come fa ClassProperties per classi e note.`

- [ ] **Step 7: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS. Se `tsc` segnala un chiamante di `addNode` che usa `edit` senza guardare `null`, aggiungi la guardia come nel runner.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat(flow): il pool sul canvas si crea, si seleziona, si sposta con i suoi nodi e si elimina

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Ridimensionare pool e corsie

**Files:**
- Modify: `src/editor/flow/commands.ts`, `src/editor/flow/commands.test.ts`
- Modify: `src/editor/kinds/ops.ts`, `src/editor/kinds/flow.ts`, `src/editor/kinds/flow.test.ts`
- Modify: `src/editor/kinds/canvas-ops.ts`
- Modify: `src/editor/interaction.ts`, `src/editor/interaction.test.ts`
- Modify: `src/ui/canvas/interaction-runner.ts`, `src/ui/canvas/interaction-runner.test.ts`
- Modify: `src/ui/canvas/dom-registry.ts`, `src/ui/canvas/Overlay.tsx`
- Modify: `src/ui/canvas/use-canvas-interaction.ts`, `src/ui/canvas/use-canvas-interaction.test.tsx`
- Modify: `src/ui/canvas/PoolsLayer.tsx`, `src/ui/canvas/PoolsLayer.test.tsx`

**Interfaces:**
- Consumes: `keepNodesWithLanes`, `laneOwner`, `laneRect`, `poolMembers`, `poolRect` (Task 2); `PoolsLayerView` (Task 3).
- Produces:
  - Da `@/editor/flow/commands`: `clampPoolW(d: FlowDiagram, poolId: string, w: number): number`, `clampLaneH(d: FlowDiagram, laneId: string, h: number): number`, `resizePool(poolId: string, w: number): Recipe`, `resizeLane(laneId: string, h: number): Recipe`.
  - `DiagramOps.resize?(key: string, lane: string | null, dx: number, dy: number): { rect: Rect; recipe: Recipe } | null`; `CanvasOps.resize(key: string, lane: string | null, dx: number, dy: number): { rect: Rect; recipe: Recipe } | null` (chiave con prefisso). `lane` è `null` per il bordo destro del pool, l'id della corsia per il suo bordo inferiore.
  - In `@/editor/interaction`: `Hit` guadagna `{ kind: "resize"; key: string; lane: string | null }`; `Mode` guadagna `{ type: "resize"; key: string; lane: string | null; start: Point; moved: boolean }`; `Effect` guadagna `{ type: "preview-resize"; key; lane; dx; dy }`, `{ type: "commit-resize"; key; lane; dx; dy }`, `{ type: "clear-resize" }`.
  - Da `@/ui/canvas/dom-registry`: `showGuide(rect: Rect | null): void`.
  - Attributi DOM delle maniglie: `data-resize="<chiave del pool con prefisso>"`, più `data-resize-lane="<laneId>"` su quelle delle corsie.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/flow/commands.test.ts`, aggiungi `resizeLane`, `resizePool` all'import e:

```ts
describe("resizePool e resizeLane", () => {
  it("il pool si allarga, allineato alla griglia", () => {
    const d = fd(apply(docWith(), resizePool("p1", 1003)))
    expect(d.view.pools["p1"]!.w).toBe(1000)
  })

  it("il pool non scende sotto POOL_MIN_W, né sotto i suoi nodi", () => {
    // Review Focus 4.
    expect(fd(apply(docWith(), resizePool("p1", 100))).view.pools["p1"]!.w).toBe(POOL_MIN_W)
    const n = addFlowNode({ x: 900, y: 20 }, "process", null)
    let next = apply(apply(docWith(), n.recipe), setNodeLane(n.key, "l1"))
    next = apply(next, resizePool("p1", 3000))
    next = apply(next, moveFlowNodes([n.key], 1500, 0)!)
    // Il nodo sta a x = 560 + 1500 = 2060, largo 60: il bordo del pool resta oltre 2060 + 60 + 20.
    next = apply(next, resizePool("p1", 100))
    const pool = fd(next).view.pools["p1"]!
    expect(pool.x + pool.w).toBeGreaterThanOrEqual(2060 + 60 + LANE_PAD)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
  })

  it("una corsia si abbassa e le corsie sotto scendono con i loro nodi", () => {
    const n2 = addFlowNode({ x: 0, y: 120 }, "process", "l2")
    const next = apply(apply(docWith(["l1", "l2"], 100), n2.recipe), resizeLane("l1", 300))
    expect(fd(next).view.lanes["l1"]).toEqual({ h: 300 })
    expect(topOf(next, "l2")).toBe(300)
    expect(fd(next).view.nodes[n2.key]!.y).toBe(320)
    expectLaneInvariant(fd(next))
  })

  it("una corsia non scende sotto LANE_MIN_H, né sotto i suoi nodi", () => {
    // Review Focus 4.
    expect(fd(apply(docWith(), resizeLane("l1", 10))).view.lanes["l1"]).toEqual({ h: LANE_MIN_H })
    const doc = docWith(["l1"], 400)
    const n = addFlowNode({ x: 0, y: 300 }, "process", "l1")
    const next = apply(apply(doc, n.recipe), resizeLane("l1", 10))
    expect(fd(next).view.lanes["l1"]!.h).toBeGreaterThanOrEqual(300 + 40 + LANE_PAD)
    expectLaneInvariant(fd(next))
  })
})
```

In `src/editor/kinds/flow.test.ts`:

```ts
describe("flowOps.resize", () => {
  it("il bordo destro dà la guida del pool e la recipe con la larghezza limitata", () => {
    const doc = withPool(createDocument("test", "id-1"))
    const r = familyOps(doc, "flow").resize?.("p1", null, -500, 0)
    expect(r?.rect).toEqual({ x: -32, y: 0, w: 640, h: 160 })
    expect(produce(doc, r!.recipe).diagram.flow.view.pools["p1"]!.w).toBe(640)
  })

  it("il bordo di una corsia dà la guida della corsia", () => {
    const doc = withPool(createDocument("test", "id-1"), ["l1", "l2"], 200)
    const r = familyOps(doc, "flow").resize?.("p1", "l2", 0, 100)
    expect(r?.rect).toMatchObject({ id: "l2", y: 200, h: 300 })
  })

  it("una corsia di un altro pool non si ridimensiona da qui", () => {
    const doc = withPool(createDocument("test", "id-1"))
    expect(familyOps(doc, "flow").resize?.("p9", "l1", 0, 100)).toBeNull()
  })
})
```

In `src/editor/interaction.test.ts`, dentro `describe("reduce")`:

```ts
  it("una maniglia di ridimensionamento: seleziona il pool, anteprima a ogni move, un solo commit", () => {
    const hit: Hit = { kind: "resize", key: "flow/p1", lane: null }
    const r = run([down({ hit, world: { x: 100, y: 0 } }), move({ world: { x: 150, y: 10 } }), up({ world: { x: 160, y: 10 } })])
    expect(r.effects).toEqual([
      { type: "select", ids: [selId("node", "flow/p1")] },
      { type: "preview-resize", key: "flow/p1", lane: null, dx: 50, dy: 10 },
      { type: "clear-resize" },
      { type: "commit-resize", key: "flow/p1", lane: null, dx: 60, dy: 10 },
    ])
    expect(r.mode).toEqual(IDLE)
  })

  it("una maniglia rilasciata senza movimento non committa, e Escape annulla", () => {
    const hit: Hit = { kind: "resize", key: "flow/p1", lane: "l1" }
    expect(run([down({ hit }), up({})]).effects).toEqual([{ type: "select", ids: [selId("node", "flow/p1")] }, { type: "clear-resize" }])
    const cancel = run([down({ hit }), move({ world: { x: 0, y: 30 } }), { type: "cancel" }])
    expect(cancel.effects.at(-1)).toEqual({ type: "clear-resize" })
    expect(cancel.mode).toEqual(IDLE)
  })
```

In `src/ui/canvas/interaction-runner.test.ts`, dentro `describe("il rilascio del flowchart")`:

```ts
  it("il ridimensionamento scrive la larghezza al rilascio, in un solo passo", () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    const past = documentStore.getState().past.length
    const runner = createInteractionRunner()
    const hit = { kind: "resize" as const, key: qualify("flow", "p1"), lane: null }
    runner.step(giu({ world: { x: 640, y: 50 }, hit }))
    runner.step(muovi({ world: { x: 840, y: 50 } }))
    runner.step(su({ world: { x: 840, y: 50 } }))
    // 672 + 200 = 872, allineato alla griglia: 870.
    expect(flowDiagram(documentStore.getState().doc).view.pools["p1"]!.w).toBe(870)
    expect(documentStore.getState().past.length).toBe(past + 1)
  })
```

In `src/ui/canvas/use-canvas-interaction.test.tsx`, dentro `describe("il resto del cablaggio")`:

```ts
  it("un down su una maniglia di un pool la trascina, e il pool si allarga", () => {
    documentStore.getState().load(withPool(createDocument("f", "f")))
    const maniglia = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    maniglia.setAttribute("data-resize", qualify("flow", "p1"))
    svg.append(maniglia)
    sotto = maniglia
    giu()
    muovi()
    su()
    // `giu` a x = 100, `muovi` e `su` a x = 160: sessanta unità di mondo alla scala 1. 672 + 60 = 732,
    // allineato alla griglia: 730.
    expect(documentStore.getState().doc.diagram.flow.view.pools["p1"]!.w).toBe(730)
  })
```

In `src/ui/canvas/PoolsLayer.test.tsx`, dentro `describe("PoolsLayer — connesso allo store")`:

```ts
  it("il canvas ha le maniglie del pool e di ogni corsia, l'export no", () => {
    documentStore.getState().load(withPool(createDocument("t"), ["l1", "l2"]))
    const { html, smonta } = monta()
    expect(html()).toContain('data-resize="flow/p1"')
    expect(html()).toContain('data-resize-lane="l2"')
    smonta()
    const part = documentStore.getState().doc.diagram.flow
    expect(renderToStaticMarkup(<PoolsLayerView part={part} />)).not.toContain("data-resize")
  })
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/editor src/ui/canvas`
Expected: FAIL. `resizePool`, `resizeLane`, `resize` e il modo `resize` non esistono.

- [ ] **Step 3: I comandi**

In `src/editor/flow/commands.ts`:
- l'import da `../geometry` diventa `import { GRID, snap, type Point } from "../geometry"`, e dalla geometria del flusso si aggiunge `laneOwner`;
- l'import dal layout si allarga a `import { keepInSpan, LANE_PAD, placeInLanes } from "./layout"`;
- dopo `renamePool`:

```ts
/** Il primo multiplo della griglia che non sta sotto `v`: un minimo arrotondato per difetto lascerebbe fuori un nodo. */
const ceilToGrid = (v: number) => Math.ceil(v / GRID) * GRID

/**
 * La larghezza che un pool può avere quando si chiede `w`: allineata alla griglia, mai sotto
 * `POOL_MIN_W` né sotto quanto serve perché ogni suo nodo resti dentro con `LANE_PAD` a destra —
 * così ridimensionare non cambia mai l'appartenenza (spec 2b §5). La usano il comando e la guida
 * dell'anteprima: una regola sola.
 */
export function clampPoolW(d: FlowDiagram, poolId: string, w: number): number {
  const view = d.view.pools[poolId]
  if (!view) return w
  let min = POOL_MIN_W
  for (const key of poolMembers(d, poolId)) {
    const node = d.model.nodes[key]
    const v = d.view.nodes[key]
    if (node && v) min = Math.max(min, v.x + flowNodeSize(node).w + LANE_PAD - view.x)
  }
  return Math.max(snap(w), ceilToGrid(min))
}

/** Come `clampPoolW`, per l'altezza di una corsia: mai sotto `LANE_MIN_H` né sotto i suoi nodi. */
export function clampLaneH(d: FlowDiagram, laneId: string, h: number): number {
  const rect = laneRect(d, laneId)
  if (!rect) return h
  let min = LANE_MIN_H
  for (const [key, node] of Object.entries(d.model.nodes)) {
    if (node.lane !== laneId) continue
    const v = d.view.nodes[key]
    if (v) min = Math.max(min, v.y + flowNodeSize(node).h + LANE_PAD - rect.y)
  }
  return Math.max(snap(h), ceilToGrid(min))
}

/** Il bordo destro del pool (spec 2b §5), con i limiti di `clampPoolW`. */
export function resizePool(poolId: string, w: number): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const view = d.view.pools[poolId]
    if (view) view.w = clampPoolW(d, poolId, w)
  }
}

/** Il bordo inferiore di una corsia, con i limiti di `clampLaneH`: le corsie sotto scendono o salgono con i loro nodi. */
export function resizeLane(laneId: string, h: number): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const poolId = laneOwner(d, laneId)
    const view = d.view.lanes[laneId]
    if (poolId === null || !view) return
    const next = clampLaneH(d, laneId, h)
    keepNodesWithLanes(d, poolId, () => {
      view.h = next
    })
  }
}
```

- [ ] **Step 4: I contratti e il flusso**

In `src/editor/kinds/ops.ts`, dentro `DiagramOps`:

```ts
  /**
   * Il ridimensionamento di un frame da una sua maniglia (spec 2b §5): `lane` è `null` per il bordo
   * destro del pool, l'id di una corsia per il suo bordo inferiore. Torna il rettangolo da mostrare
   * come guida durante il gesto e la recipe da applicare al rilascio, calcolati con la stessa regola;
   * `null` se la maniglia non appartiene al frame. Assente: niente si ridimensiona.
   */
  resize?(key: string, lane: string | null, dx: number, dy: number): { rect: Rect; recipe: Recipe } | null
```

In `src/editor/kinds/flow.ts`, aggiungi agli import `clampLaneH`, `clampPoolW`, `resizeLane`, `resizePool` e `laneRect` (se non c'è già), e dentro `flowOps`:

```ts
    resize: (key, lane, dx, dy) => {
      const d = diagram()
      if (lane === null) {
        const view = d.view.pools[key]
        const rect = poolRect(d, key)
        if (!view || !rect) return null
        const w = clampPoolW(d, key, view.w + dx)
        return { rect: { ...rect, w }, recipe: resizePool(key, w) }
      }
      const rect = laneRect(d, lane)
      if (!rect || rect.poolId !== key) return null
      const h = clampLaneH(d, lane, rect.h + dy)
      return { rect: { ...rect, h }, recipe: resizeLane(lane, h) }
    },
```

In `src/editor/kinds/canvas-ops.ts`, nell'interfaccia `CanvasOps`:

```ts
  /** Il ridimensionamento di un frame, sulla chiave con prefisso (vedi `DiagramOps.resize`). */
  resize(key: string, lane: string | null, dx: number, dy: number): { rect: Rect; recipe: Recipe } | null
```

e nell'oggetto:

```ts
    resize: (qualified, lane, dx, dy) => {
      const { family, key } = splitKey(qualified)
      return ops(family).resize?.(key, lane, dx, dy) ?? null
    },
```

- [ ] **Step 5: La macchina a stati**

In `src/editor/interaction.ts`:
- `Hit` diventa `{ kind: "node"; key: string } | { kind: "edge"; key: string } | { kind: "resize"; key: string; lane: string | null } | { kind: "canvas" }`;
- `Mode` guadagna `| { type: "resize"; key: string; lane: string | null; start: Point; moved: boolean }`;
- `Effect` guadagna:

```ts
  | { type: "preview-resize"; key: string; lane: string | null; dx: number; dy: number }
  | { type: "commit-resize"; key: string; lane: string | null; dx: number; dy: number }
  | { type: "clear-resize" }
```

- in `onDown`, subito prima di `switch (info.hit.kind)`:

```ts
  // Una maniglia di ridimensionamento (spec 2b §5): seleziona il frame e apre il gesto. Sta prima
  // dello switch, che così resta sui soli nodi, archi e canvas.
  if (info.hit.kind === "resize") {
    const { key, lane } = info.hit
    return { mode: { type: "resize", key, lane, start: info.world, moved: false }, effects: [{ type: "select", ids: [selId("node", key)] }] }
  }
```

- in `onMove`:

```ts
    case "resize": {
      const dx = info.world.x - mode.start.x
      const dy = info.world.y - mode.start.y
      return { mode: { ...mode, moved: true }, effects: [{ type: "preview-resize", key: mode.key, lane: mode.lane, dx, dy }] }
    }
```

- in `onUp`:

```ts
    case "resize": {
      const effects: Effect[] = [{ type: "clear-resize" }]
      if (mode.moved) {
        effects.push({ type: "commit-resize", key: mode.key, lane: mode.lane, dx: info.world.x - mode.start.x, dy: info.world.y - mode.start.y })
      }
      return { mode: IDLE, effects }
    }
```

- in `onCancel`:

```ts
    case "resize":
      return { mode: IDLE, effects: [{ type: "clear-resize" }] }
```

- [ ] **Step 6: Il runner, la guida, l'hit test e le maniglie**

In `src/ui/canvas/dom-registry.ts`, dopo `showMarquee`:

```ts
/** La guida del ridimensionamento: il contorno che il frame avrà al rilascio. `null` la nasconde. */
export function showGuide(rect: Rect | null): void {
  const el = overlay?.querySelector("[data-guide]")
  if (!el) return
  if (!rect) {
    el.setAttribute("visibility", "hidden")
    return
  }
  el.setAttribute("visibility", "visible")
  el.setAttribute("x", String(rect.x))
  el.setAttribute("y", String(rect.y))
  el.setAttribute("width", String(rect.w))
  el.setAttribute("height", String(rect.h))
}
```

In `src/ui/canvas/Overlay.tsx`, dopo il `<path data-connect … />`:

```tsx
      <rect data-guide visibility="hidden" fill="none" stroke="var(--primary)" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
```

e il docblock diventa `/** Layer overlay: marquee, anteprima connessione e guida del ridimensionamento, aggiornati dal DOM durante l'interazione. */`.

In `src/ui/canvas/interaction-runner.ts`, aggiungi `showGuide` all'import da `./dom-registry` e dentro `run`:

```ts
      case "preview-resize":
        // Solo una guida sul DOM durante il gesto: il documento cambia una volta sola, al rilascio.
        showGuide(canvasOps(documentStore.getState().doc).resize(fx.key, fx.lane, fx.dx, fx.dy)?.rect ?? null)
        break
      case "commit-resize": {
        const result = canvasOps(documentStore.getState().doc).resize(fx.key, fx.lane, fx.dx, fx.dy)
        if (result) documentStore.getState().dispatch(result.recipe)
        break
      }
      case "clear-resize":
        showGuide(null)
        break
```

In `src/ui/canvas/use-canvas-interaction.ts`, `hitTest` comincia con:

```ts
  // Le maniglie stanno dentro il gruppo del pool, che è un nodo: vanno guardate prima.
  const handle = el?.closest("[data-resize]")
  if (handle) return { kind: "resize", key: handle.getAttribute("data-resize")!, lane: handle.getAttribute("data-resize-lane") }
```

In `src/ui/canvas/PoolsLayer.tsx`:
- `PoolsLayerView` prende una prop in più, `handles = false`, e la passa a `PoolFrame`; `PoolsLayer` la passa `true`. L'export non la passa: le maniglie servono solo sul canvas.
- sopra `PoolsLayerView`:

```ts
/** Spessore delle maniglie di ridimensionamento, in unità di mondo: abbastanza da prenderle, non da coprire i nodi. */
const HANDLE = 8
```

- in `PoolFrame`, dopo il `<rect>` del contorno:

```tsx
      {handles && (
        <>
          <rect data-resize={id} x={rect.w - HANDLE / 2} y={0} width={HANDLE} height={rect.h} fill="transparent" style={{ cursor: "ew-resize" }} />
          {lanes.map((lane) => (
            <rect
              key={`maniglia-${lane.id}`}
              data-resize={id}
              data-resize-lane={lane.id}
              x={POOL_HEADER_W}
              y={lane.y - rect.y + lane.h - HANDLE / 2}
              width={lane.w}
              height={HANDLE}
              fill="transparent"
              style={{ cursor: "ns-resize" }}
            />
          ))}
        </>
      )}
```

- il docblock di `PoolsLayerView` aggiunge: `Sul canvas porta anche le maniglie del ridimensionamento — il bordo destro del pool e il bordo inferiore di ogni corsia (spec 2b §5) — che hanno un riempimento trasparente per ricevere il puntatore; l'export non le disegna.`

- [ ] **Step 7: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat(flow): il pool si allarga dal bordo destro e le corsie dal bordo inferiore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: E2E dei pool, flowchart riscritto, README e spec

**Files:**
- Modify: `scripts/e2e/helpers.mjs`
- Modify: `scripts/e2e/flow.mjs`
- Create: `scripts/e2e/pool.mjs`
- Modify: `scripts/e2e/run.mjs`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-25-pool-corsie-design.md`

**Interfaces:**
- Consumes: tutto il comportamento dei task precedenti, dal browser.
- Produces: nessuna firma.

- [ ] **Step 1: Gli helper contano i nodi, non i pool**

In `scripts/e2e/helpers.mjs`, `expectNodes` e `nodeRects` leggono `[data-node-id]`: da ora anche il gruppo di un pool ha `data-node-id`. In entrambi il selettore diventa `[data-node-id]:not([data-pool])`, con il commento `// Un pool ha data-node-id per la selezione e il drag, ma non è un nodo (spec 2b §5): non si conta e non entra nelle sovrapposizioni.` `signature` resta com'è: lo spostamento di un pool deve cambiarla.

- [ ] **Step 2: `flow.mjs` riscritto sui pool**

In `scripts/e2e/flow.mjs`:
- il docblock in testa descrive il nuovo percorso: un documento nuovo senza pool; un pool creato con `P`; una seconda corsia dal pannello del pool; tre nodi dentro le corsie; Collega ed etichetta; Disponi; il trascinamento fra corsie con un solo ⌘Z; un nodo trascinato fuori dal pool che diventa libero; l'export Mermaid. I tre punti che il docblock di oggi spiega (elkjs che si carica davvero, drag con eventi veri, un solo ⌘Z) restano;
- `laneBandRects` legge le bande dentro i pool, nell'ordine documentale:

```js
/** Rettangoli schermo delle bande delle corsie, nell'ordine documentale: dentro ogni pool una `<g>`
 *  per corsia, con la sua `<rect>` (`PoolsLayerView`). */
async function laneBandRects(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-layer="pools"] [data-pool] > g > rect')].map((r) => {
      const rect = r.getBoundingClientRect()
      return { y: rect.y, h: rect.height }
    }),
  )
}
```

- i passi diventano, nell'ordine (mantieni i corpi di oggi dove il testo dice «come oggi»):

```js
    await step("Nuovo documento: il canvas è vuoto e non c'è nessun pool", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: "Nuovo documento" }).click()
      await expectMenu(page, "closed")
      await expectNodes(page, 0)
      await page.waitForFunction(() => document.querySelectorAll("[data-pool]").length === 0)
    })

    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("un pool con P: nasce con una corsia, selezionato, e il pannello è il suo", async () => {
      // Il pool nasce con l'angolo sul clic: a (60, 20) nel mondo il corpo delle corsie va da x = 92 a 700.
      await page.keyboard.press("p")
      await page.mouse.click(canvas.x + 60, canvas.y + 20)
      await page.waitForFunction(() => document.querySelectorAll("[data-pool]").length === 1)
      if ((await laneBandRects(page)).length !== 1) throw new Error("il pool non è nato con una corsia")
      await page.locator("#pool-name").waitFor()
    })

    await step("aggiungi una seconda corsia dal pannello del pool", async () => {
      await page.getByRole("button", { name: "Aggiungi" }).click()
      await page.waitForFunction(() => document.querySelectorAll('[data-layer="pools"] [data-pool] > g > rect').length === 2)
    })
```

  Poi il passo dei tre nodi, con questi clic: «Inizio» (Terminale) a `(canvas.x + 150, canvas.y + 40)`, «Processo A» (Processo, `exact: true`) a `(canvas.x + 450, canvas.y + 40)`, «Decisione» a `(canvas.x + 150, canvas.y + 200)`; prima del primo, `Escape` per lasciare il pannello del pool. Le asserzioni `withinBand` restano: i primi due nella prima banda, la decisione nella seconda. Il passo che si chiamava «il primo nodo, un terminale nella prima corsia» sparisce: il terminale nasce qui.

  I passi «collega Inizio a Processo A …», «Disponi …», «trascina «Decisione» nella prima corsia …» e «un solo ⌘Z …» restano come oggi. Dopo il ⌘Z aggiungi:

```js
    await step("trascinata fuori dal pool, «Decisione» diventa libera", async () => {
      const decisione = await rectByLabel(page, "Decisione")
      const bands = await laneBandRects(page)
      const last = bands[bands.length - 1]
      const fromX = decisione.x + decisione.w / 2
      const fromY = decisione.y + decisione.h / 2
      await page.mouse.move(fromX, fromY)
      await page.mouse.down()
      await page.mouse.move(fromX, last.y + last.h + 150, { steps: 8 })
      await page.mouse.up()
      // Il drag la lascia selezionata: il pannello dice che non ha più una corsia.
      await page.waitForFunction(() => document.querySelector("#flow-node-lane")?.value === "")
    })
```

  L'ultimo passo, l'export Mermaid, resta come oggi: controlla `subgraph` (il pool e le sue corsie), il rombo e l'etichetta dell'arco.

- [ ] **Step 3: Lo scenario dei pool**

Crea `scripts/e2e/pool.mjs`, sulla forma di `collegamenti.mjs` (stessa struttura di `run`, `step`, raccolta degli errori della pagina, guardia di esecuzione diretta con `startEnv`). La pagina si apre su `${base}?fallback=1`, come `persistenza.mjs`, perché l'ultimo passo carica un file dall'`#upload-input`. Docblock: lo scenario del 2b (spec §9), i cinque passi qui sotto, e il perché del `?fallback=1`.

Helper, sotto gli import:

```js
/** Rettangolo schermo del nodo di flusso che mostra `label` (il suo `<path>`), escluso ogni pool. */
async function rectByLabel(page, label) {
  return page.evaluate((label) => {
    const g = [...document.querySelectorAll('[data-node-id^="flow/"]:not([data-pool])')].find((el) => el.textContent.includes(label))
    if (!g) return null
    const r = g.querySelector("path").getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, label)
}

/** Rettangolo schermo della prima banda di corsia del primo pool. */
async function firstBand(page) {
  return page.evaluate(() => {
    const r = document.querySelector('[data-layer="pools"] [data-pool] > g > rect')?.getBoundingClientRect()
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
  })
}

/** Trascina con eventi veri dal centro di `from` a `to`. */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
```

Passi:

```js
    await step("un processo libero, e nessuna banda sul canvas", async () => {
      await page.keyboard.press("2")
      await page.mouse.click(canvas.x + 100, canvas.y + 400)
      await nodeText.waitFor()
      await nodeText.fill("Verifica")
      await nodeText.blur()
      await nodeText.waitFor({ state: "detached" })
      await expectNodes(page, 1)
      if ((await page.locator("[data-pool]").count()) !== 0) throw new Error("c'è un pool che nessuno ha creato")
    })

    await step("un pool con P; il processo trascinato dentro prende la corsia, e fuori torna libero", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("p")
      await page.mouse.click(canvas.x + 300, canvas.y + 40)
      await page.waitForSelector("[data-pool]")
      const band = await firstBand(page)
      await drag(page, center(await rectByLabel(page, "Verifica")), center(band))
      await page.waitForFunction(() => document.querySelector("#flow-node-lane")?.value !== "")
      await drag(page, center(await rectByLabel(page, "Verifica")), { x: canvas.x + 100, y: canvas.y + 400 })
      await page.waitForFunction(() => document.querySelector("#flow-node-lane")?.value === "")
    })

    await step("il pool spostato dall'intestazione porta con sé il nodo che contiene", async () => {
      await drag(page, center(await rectByLabel(page, "Verifica")), center(await firstBand(page)))
      await page.waitForFunction(() => document.querySelector("#flow-node-lane")?.value !== "")
      const before = await rectByLabel(page, "Verifica")
      const header = await page.locator("[data-pool-header]").boundingBox()
      await drag(page, { x: header.x + header.width / 2, y: header.y + 20 }, { x: header.x + header.width / 2 + 200, y: header.y + 20 })
      await page.waitForFunction((x0) => {
        const g = [...document.querySelectorAll('[data-node-id^="flow/"]:not([data-pool])')].find((el) => el.textContent.includes("Verifica"))
        return g && Math.abs(g.querySelector("path").getBoundingClientRect().x - (x0 + 200)) < 2
      }, before.x)
    })

    await step("Canc sul pool: il pool sparisce e il nodo resta", async () => {
      const header = await page.locator("[data-pool-header]").boundingBox()
      await page.mouse.click(header.x + header.width / 2, header.y + 20)
      await page.keyboard.press("Delete")
      await page.waitForFunction(() => document.querySelectorAll("[data-pool]").length === 0)
      await expectNodes(page, 1)
    })

    await step("un file v5 caricato ha un pool «Pool 1» con le corsie di prima", async () => {
      await page.locator("#upload-input").setInputFiles({ name: "vecchio.dd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(V5)) })
      await expectText(page, "[data-pool]", "Pool 1")
      await expectText(page, "[data-pool]", "Cliente")
      await expectText(page, "[data-pool]", "Negozio")
      await expectNodes(page, 1)
    })
```

con, sopra `run`:

```js
/** Un documento della versione 5: due corsie e un nodo, com'erano prima del 2b. */
const V5 = {
  schemaVersion: 5,
  id: "v5",
  name: "vecchio",
  diagram: {
    er: { model: { entities: {}, relationships: {} }, view: { nodes: {} } },
    class: { model: { classes: {}, relations: {}, notes: {} }, view: { nodes: {} } },
    flow: {
      model: { lanes: [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Negozio" }], nodes: { n1: { label: "Ordina", shape: "process", lane: "l1" } }, edges: {} },
      view: { nodes: { n1: { x: 100, y: 20, collapsed: false } }, lanes: { l1: { y: 0, h: 160 }, l2: { y: 160, h: 160 } } },
    },
    links: {},
  },
}
```

e `const nodeText = page.locator('[aria-label="Testo del nodo"]')` fra i locator, `const canvas = await page.locator("svg.dd-canvas").boundingBox()` dopo `page.goto`.

Note per chi implementa, da verificare contro l'app vera e non da indovinare:
- `2` è il processo, `p` il pool (`src/ui/canvas/kinds/flow.tsx`). Prima di premere un tasto di strumento, `Escape` riporta a Seleziona e toglie la selezione.
- La maniglia del bordo destro del pool e quella del bordo inferiore di ogni corsia sono strisce di 8 unità: un clic o un trascinamento che cade lì ridimensiona invece di selezionare. Afferra l'intestazione a 20 pixel dal bordo superiore, non sugli spigoli.
- Il caricamento di un file sopra un documento con modifiche non salvate può chiedere conferma: leggi come lo gestisce `persistenza.mjs` (che parte da «Nuovo documento») e fai lo stesso, invece di indovinare.
- Se un passo fallisce, correggi lo scenario solo quando il difetto è nello scenario. Se il difetto è nell'app, correggi l'app, aggiungi un test unitario che lo fissi, e scrivilo nel report.

In `scripts/e2e/run.mjs`: `import { run as runPool } from "./pool.mjs"`, `const poolOk = await runPool(browser, base)` dopo `collegamentiOk`, `&& poolOk` nella condizione, e nel docblock «… e dei collegamenti fra famiglie, e dei pool» e `node scripts/e2e/pool.mjs` nell'elenco.

`misto.mjs` e `collegamenti.mjs` non dovrebbero cambiare: i loro nodi di flusso nascono liberi, e `collegamenti.mjs` cerca già i nodi per testo. Se uno dei due fallisce, correggilo e scrivi il perché nel report.

- [ ] **Step 4: Lancia l'e2e**

Run: `pnpm build && node scripts/e2e/pool.mjs` e `node scripts/e2e/flow.mjs` mentre iteri, poi `pnpm e2e`.
Expected: PASS, compresi `e2e flow: PASS`, `e2e misto: PASS`, `e2e collegamenti: PASS` e `e2e pool: PASS`.

- [ ] **Step 5: README**

In `README.md`:
- nella sezione «Disegna», dove oggi si descrivono le corsie del flowchart, il testo diventa:

```markdown
- **Pool e corsie**, facoltativi: un nodo di flusso nasce libero, e chi vuole gli attori crea un
  pool con `P`. Un pool ha un nome, una striscia a sinistra e le sue corsie; si sposta
  dall'intestazione con i suoi nodi, si allarga dal bordo destro, e ogni corsia cresce dal bordo
  inferiore. Un nodo trascinato in una corsia ci entra, trascinato fuori torna libero. Più pool
  possono stare sullo stesso canvas.
```

  (Adatta la frase che c'è oggi invece di aggiungerne una seconda: leggi il README e sostituisci il punto sulle corsie.)
- nella sezione «Test end-to-end», il punto del **Flowchart** descrive il nuovo percorso (pool con `P`, seconda corsia dal pannello del pool, tre nodi, Collega, Disponi, drag fra corsie con un ⌘Z, un nodo che esce dal pool, export Mermaid), e si aggiunge:

```markdown
- **Pool**: crea un processo libero e un pool, trascina il processo dentro e fuori dal pool,
  sposta il pool dall'intestazione e verifica che il nodo lo segua, elimina il pool e verifica che
  il nodo resti, e carica un file della versione precedente per verificare che le sue corsie siano
  finite in «Pool 1».
```

- [ ] **Step 6: La spec**

In `docs/superpowers/specs/2026-09-25-pool-corsie-design.md`:
- nella §8, `I pool escono nell'ordine della loro \`y\`.` diventa `I pool escono per nome e, a parità, per id: l'emettitore riceve solo il modello, e lo stesso modello deve dare lo stesso testo anche dopo che un pool è stato spostato (scostamento 1 del piano).`;
- nella §3, alla riga delle costanti aggiungi `, e \`LANE_MARGIN = 40\`, che la migrazione usa (scostamento 2 del piano)`.

- [ ] **Step 7: Controlli finali**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: PASS. Alla fine `pgrep -fl "vite preview"` non trova niente di tuo.

- [ ] **Step 8: Commit**

```bash
git add scripts/e2e README.md docs/superpowers/specs/2026-09-25-pool-corsie-design.md
git commit -m "$(cat <<'EOF'
test(e2e): scenario dei pool, flowchart sui pool, README e spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
