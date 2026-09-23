# Flowchart con corsie — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un terzo tipo di diagramma — flowchart con corsie, cinque forme di nodo, archi etichettati, validazione live ed export Mermaid `flowchart LR`.

**Architecture:** Il tipo si innesta sulla giuntura esistente (`DiagramOps` per dati e comandi, `DiagramView` per i componenti React), che va allargata da «due specie di nodo più una nota» a «un comando con varianti». L'auto layout chiede a ELK solo l'asse del flusso (`direction: RIGHT`) e decide da sé l'asse trasversale in base alla corsia, con una funzione pura provabile senza worker.

**Tech Stack:** React 19, TypeScript 6, Zod 4, Zustand 5 (store vanilla), Immer 11 (patch di undo), elkjs 0.12 in worker, Vitest 5, Playwright su Chrome di sistema per e2e.

**Spec:** `docs/superpowers/specs/2026-09-22-flowchart-design.md`

**ADR:** `docs/adr/0007-la-direzione-di-elk-e-una-proprieta-del-tipo-di-diagramma.md`

## Global Constraints

- **Node >= 22, pnpm 10.** Comandi: `pnpm test` (Vitest), `pnpm lint` (ESLint), `pnpm build` (`tsc -b` + Vite), `pnpm e2e`, `pnpm perf`.
- **Lingua:** identificatori e tipi in inglese, commenti e messaggi all'utente in italiano. I docblock spiegano il *perché*, non il *cosa*.
- **`noUncheckedIndexedAccess` è acceso**: ogni accesso per indice o per chiave torna `T | undefined` e va guardato. Non si aggira con `!`.
- **ESLint vieta a `src/editor` di importare `src/io` e React.** La geometria e i comandi stanno in `editor`, i componenti in `ui`, gli emettitori in `io`.
- **`SCHEMA_VERSION` resta 2.** Nessuna migrazione: la union dei diagrammi si allarga e i documenti esistenti continuano a validare.
- **Type id del nuovo diagramma: `"flow"`** (breve come `"er"`, non `"flowchart"`). L'etichetta per l'utente è «Flowchart».
- **Baseline di prestazione da non sfondare:** p95 ≤ 20 ms per scenario; misura del 2026-09-22 a N=300: peggiore 9,3 ms.
- **Ogni task finisce con `pnpm lint && pnpm test` verdi e un commit.** Messaggio in italiano, minuscolo, con prefisso convenzionale (`feat:`, `refactor:`, `test:`, `docs:`).
- **Attribuzione nei commit:** ultima riga `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Struttura dei file

**Nuovi:**

| file | responsabilità |
|---|---|
| `src/model/flow/schema.ts` | schema Zod del diagramma, tipi, `createFlowDocument` |
| `src/model/flow/validate.ts` | le sei regole di validazione |
| `src/editor/flow/commands.ts` | comandi sul modello: nodi, archi, corsie |
| `src/editor/flow/geometry.ts` | misure delle forme, path SVG, `laneAt` |
| `src/editor/flow/layout.ts` | `flowLayoutGraph` e `placeInLanes` (la funzione pura del §5) |
| `src/editor/flow-access.ts` | `flowDiagram(doc)`, come `er-access.ts` |
| `src/editor/kinds/flow.ts` | `DiagramOps` del flowchart |
| `src/io/emit/flow-mermaid.ts` | emettitore Mermaid |
| `src/ui/canvas/FlowNode.tsx` | resa di un nodo |
| `src/ui/canvas/FlowEdge.tsx` | resa di un arco con etichetta |
| `src/ui/canvas/LanesLayer.tsx` | le bande di sfondo |
| `src/ui/canvas/kinds/flow.tsx` | `DiagramView` del flowchart |
| `src/ui/panels/FlowProperties.tsx` | pannello proprietà di nodo, arco e corsie |
| `scripts/e2e/flow.mjs` | ottavo scenario end-to-end |

**Modificati (la giuntura e i punti che il compilatore segnalerà):**

`src/editor/session-store.ts`, `src/editor/interaction.ts`, `src/editor/kinds/ops.ts`, `src/editor/kinds/er.ts`, `src/editor/kinds/class.ts`, `src/model/document.ts`, `src/model/issue.ts`, `src/model/layout.ts`, `src/io/layout/client.ts`, `src/io/layout/elk.worker.ts`, `src/io/document-io.ts`, `src/ui/Toolbar.tsx`, `src/ui/use-keyboard-shortcuts.ts`, `src/ui/DocumentMenu.tsx`, `src/ui/canvas/interaction-runner.ts`, `src/ui/canvas/kinds/registry.ts`, `src/ui/canvas/kinds/er.tsx`, `src/ui/canvas/kinds/class.tsx`, `src/ui/export/actions.ts`, `src/ui/export/svg.tsx`, `src/ui/panels/PropertiesPanel.tsx`, `src/ui/layout-actions.ts`, `src/editor/commands/layout.ts`, `src/editor/class/commands.ts`, `src/perf/stress.ts`.

**Scostamento dalla spec, deciso qui.** La spec §5 dice `adjustLayout?(positions): LayoutPositions`. Non basta: il passo delle corsie riscrive anche le bande (`view.lanes`), e due dispatch separate darebbero due passi di undo. Il contratto diventa quindi `layoutRecipe?(positions): Recipe`, e la funzione pura `placeInLanes` — che è ciò che la spec chiama testabile senza worker — resta esattamente com'è descritta, solo un livello più in dentro. La spec va aggiornata nel Task 1.

---

### Task 1: La giuntura — strumenti come varianti

Allarga il contratto da «due specie di nodo più una nota opzionale» a «un comando di creazione con varianti», e fa sparire `addNote?`. Nessun comportamento visibile cambia: è la preparazione che rende possibile il resto, ed è interamente guidata dal compilatore.

**Files:**
- Modify: `src/editor/session-store.ts`, `src/editor/interaction.ts`, `src/editor/kinds/ops.ts`, `src/editor/kinds/er.ts`, `src/editor/kinds/class.ts`, `src/ui/canvas/kinds/registry.ts`, `src/ui/canvas/kinds/er.tsx`, `src/ui/canvas/kinds/class.tsx`, `src/ui/canvas/interaction-runner.ts`, `src/ui/Toolbar.tsx`, `src/ui/use-keyboard-shortcuts.ts`
- Modify (spec): `docs/superpowers/specs/2026-09-22-flowchart-design.md` §5
- Test: `src/editor/interaction.test.ts`, `src/editor/kinds/ops.test.ts`, `src/ui/canvas/kinds/registry.test.ts`

**Interfaces:**
- Produces:
  - `type Tool = "select" | "node" | "edge"` (`session-store.ts`) — `"note"` sparisce
  - `SessionState.variant: string | null`, `setTool(tool: Tool, variant?: string | null): void`
  - `type EditTarget = "name" | "body"` (`kinds/ops.ts`)
  - `DiagramOps.addNode(at: Point, variant?: string): { key: string; recipe: Recipe; edit: EditTarget }`
  - `interface ToolDef { label: string; key: string; Icon: LucideIcon; tool: Tool; variant?: string }` (`kinds/registry.ts`)
  - `DiagramView.tools: ToolDef[]`
  - `function toolId(def: ToolDef): string` (`kinds/registry.ts`) — `"node"`, `"node:note"`, `"edge"`
  - `Effect` perde `create-note`; `create-node` diventa `{ type: "create-node"; at: Point; variant?: string }`
  - `Context` diventa `{ tool: Tool; variant?: string; selection: ReadonlySet<string> }`

- [ ] **Step 1: Scrivi il test che fallisce sul reducer**

In `src/editor/interaction.test.ts`, aggiungi:

```ts
describe("strumento nodo con variante", () => {
  const info = (hit: Hit): PointerInfo => ({
    screen: { x: 0, y: 0 },
    world: { x: 10, y: 20 },
    button: 0,
    shift: false,
    alt: false,
    hit,
  })

  it("porta la variante nell'effetto di creazione", () => {
    const step = reduce(
      IDLE,
      { type: "down", info: info({ kind: "canvas" }), spaceHeld: false },
      { tool: "node", variant: "decision", selection: new Set() },
    )
    expect(step.effects).toEqual([{ type: "create-node", at: { x: 10, y: 20 }, variant: "decision" }])
  })

  it("senza variante l'effetto non la porta", () => {
    const step = reduce(
      IDLE,
      { type: "down", info: info({ kind: "canvas" }), spaceHeld: false },
      { tool: "node", selection: new Set() },
    )
    expect(step.effects).toEqual([{ type: "create-node", at: { x: 10, y: 20 }, variant: undefined }])
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `pnpm vitest run src/editor/interaction.test.ts`
Expected: FAIL — `Object literal may only specify known properties, and 'variant' does not exist in type 'Context'`.

- [ ] **Step 3: Allarga `session-store.ts`**

```ts
export type Tool = "select" | "node" | "edge"
```

In `SessionState` aggiungi il campo e cambia la firma:

```ts
  tool: Tool
  /** Variante dello strumento corrente: la forma, per i tipi che ne hanno più d'una. Opaca qui. */
  variant: string | null
  setTool: (tool: Tool, variant?: string | null) => void
```

e nello store:

```ts
  tool: "select",
  variant: null,
  setTool: (tool, variant = null) => set({ tool, variant }),
```

- [ ] **Step 4: Allarga `interaction.ts`**

In `Effect` sostituisci le due voci di creazione con una sola:

```ts
  | { type: "create-node"; at: Point; variant?: string }
```

In `Context`:

```ts
export interface Context {
  tool: Tool
  variant?: string
  selection: ReadonlySet<string>
}
```

In `onDown`, il ramo dello strumento `"note"` sparisce e quello del nodo porta la variante:

```ts
  if (ctx.tool === "node") {
    if (info.hit.kind === "canvas") {
      return { mode: IDLE, effects: [{ type: "create-node", at: info.world, variant: ctx.variant }] }
    }
  }
```

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `pnpm vitest run src/editor/interaction.test.ts`
Expected: PASS

- [ ] **Step 6: Cambia il contratto in `kinds/ops.ts`**

```ts
/** Dove va il fuoco dopo la creazione: l'header (`name`) o l'editor di testo sul corpo (`body`). */
export type EditTarget = "name" | "body"

export interface DiagramOps {
  // ...
  /**
   * Crea un nodo. `variant` è una stringa opaca per la giuntura: la dichiara `DiagramView.tools` e
   * la interpreta solo il modulo `kinds/` del tipo che l'ha dichiarata. `edit` dice dove va il
   * fuoco: sostituisce il caso speciale che `addNote` era prima di questo cambiamento.
   */
  addNode(at: Point, variant?: string): { key: string; recipe: Recipe; edit: EditTarget }
  // `addNote?` è rimosso: la nota del class diagram è `addNode(at, "note")`.
}
```

- [ ] **Step 7: Adatta i due tipi esistenti**

In `src/editor/kinds/er.ts`:

```ts
    addNode: (at) => ({ ...addEntity(diagram().model.entities, at), edit: "name" }),
```

In `src/editor/kinds/class.ts` — il `variant` instrada verso il comando giusto:

```ts
    addNode: (at, variant) =>
      variant === "note"
        ? { ...addNote(at), edit: "body" }
        : { ...addClass(diagram().model.classes, at), edit: "name" },
```

- [ ] **Step 8: Trasforma `tools` in una lista**

In `src/ui/canvas/kinds/registry.ts`:

```ts
export interface ToolDef {
  label: string
  key: string
  Icon: LucideIcon
  tool: Tool
  /** Passata ad `addNode`: la forma, per i tipi che ne hanno più d'una. */
  variant?: string
}

/** Identità di uno strumento nel ToggleGroup: `tool` da solo non basta quando ci sono più varianti. */
export function toolId(def: Pick<ToolDef, "tool" | "variant">): string {
  return def.variant ? `${def.tool}:${def.variant}` : def.tool
}
```

e in `DiagramView` il campo diventa `tools: ToolDef[]`.

In `src/ui/canvas/kinds/er.tsx`:

```ts
  tools: [
    { label: "Entità", key: "e", Icon: Square, tool: "node" },
    { label: "Relazione", key: "r", Icon: Spline, tool: "edge" },
  ],
```

In `src/ui/canvas/kinds/class.tsx`:

```ts
  tools: [
    { label: "Classe", key: "c", Icon: Box, tool: "node" },
    { label: "Relazione", key: "r", Icon: Spline, tool: "edge" },
    { label: "Nota", key: "n", Icon: StickyNote, tool: "node", variant: "note" },
  ],
```

- [ ] **Step 9: Unifica il gestore di effetti**

In `src/ui/canvas/interaction-runner.ts`, i due `case` diventano uno:

```ts
      case "create-node": {
        const { key, recipe, edit } = opsFor(documentStore.getState().doc).addNode(fx.at, fx.variant)
        documentStore.getState().dispatch(recipe)
        session().setSelection([selId("node", key)])
        session().setTool("select")
        session().setEditing({ key, target: edit })
        break
      }
```

e la chiamata a `reduce` passa la variante:

```ts
    const result = reduce(mode, event, { tool: session().tool, variant: session().variant ?? undefined, selection: session().selection })
```

- [ ] **Step 10: Adatta toolbar e scorciatoie**

In `src/ui/Toolbar.tsx`, `ToolItem` prende la definizione intera e il gruppo itera la lista:

```tsx
function ToolItem({ def }: { def: ToolDef }) {
  return (
    <Hint label={`${def.label} (${def.key.toUpperCase()})`}>
      <ToggleGroupItem value={toolId(def)} aria-label={def.label} className={TOOL_ITEM}><def.Icon /></ToggleGroupItem>
    </Hint>
  )
}
```

Il valore corrente del gruppo si compone dallo stato, e la selezione si risolve cercando nella lista:

```tsx
  const variant = useStore(sessionStore, (s) => s.variant)
  const current = toolId({ tool, variant: variant ?? undefined })
  // ...
      <ToggleGroup
        type="single"
        value={current}
        onValueChange={(v) => {
          if (!v) return
          if (v === "select") return setTool("select")
          const def = view.tools.find((t) => toolId(t) === v)
          if (def) setTool(def.tool, def.variant ?? null)
        }}
      >
        <Hint label="Seleziona (V)"><ToggleGroupItem value="select" aria-label="Seleziona" className={TOOL_ITEM}><MousePointer2 /></ToggleGroupItem></Hint>
        {view.tools.map((def) => <ToolItem key={toolId(def)} def={def} />)}
      </ToggleGroup>
```

In `src/ui/use-keyboard-shortcuts.ts`, i tre rami cablati su `tools.node` / `tools.edge` / `tools.note` diventano una ricerca sola:

```ts
  const tools = viewFor(doc.doc.diagram.type).tools
  // ...
  else if (!mod && key === "v") session.setTool("select")
  else if (!mod && tools.some((t) => t.key === key)) {
    const def = tools.find((t) => t.key === key)
    if (def) session.setTool(def.tool, def.variant ?? null)
  }
```

- [ ] **Step 11: Allinea la spec allo scostamento**

In `docs/superpowers/specs/2026-09-22-flowchart-design.md`, §5, sostituisci la frase su `adjustLayout?(positions): LayoutPositions` con:

```markdown
**Dove sta il codice.** `DiagramOps` guadagna un metodo opzionale
`layoutRecipe?(positions): Recipe`, che sostituisce la dispatch predefinita
`applyLayout(positions)` quando c'è. Serve perché il passo delle corsie riscrive
anche le bande, e due dispatch separate darebbero due passi di undo. Dentro ci
sta la funzione pura `placeInLanes(diagram, positions)`, che da posizioni e
modello ricava posizioni corrette e bande: si prova senza worker, senza DOM e
senza ELK.
```

- [ ] **Step 12: Verifica tutto e committa**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: tutto verde. `tsc -b` è la rete: se un punto della giuntura è rimasto indietro, fallisce qui.

```bash
git add -A
git commit -m "$(cat <<'MSG'
refactor(kinds): gli strumenti diventano varianti di un comando solo

Il terzo tipo di diagramma ha sei forme di nodo, e la giuntura era modellata
su due specie più una nota opzionale. Le forme non sono specie: sono varianti
dello stesso comando, come lo stereotipo del class diagram è un campo e non
quattro classi.

`addNote?` sparisce dal contratto: la nota del class diagram è
`addNode(at, "note")`. Un metodo opzionale in meno e un caso speciale in meno
nel canvas, senza che nulla cambi per chi usa l'app.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 2: Il modello

Lo schema Zod del flowchart e il suo ingresso nella union dei diagrammi. Alla fine di questo task un documento flowchart si crea, si serializza e si rilegge; non si disegna ancora.

**Files:**
- Create: `src/model/flow/schema.ts`, `src/model/flow/schema.test.ts`, `src/editor/flow-access.ts`
- Modify: `src/model/document.ts`

**Interfaces:**
- Consumes: `Identifier`, `NodeViewSchema`, `SCHEMA_VERSION` da `src/model/shared.ts`
- Produces:
  - `FlowShape = "terminal" | "process" | "decision" | "io" | "subprocess" | "note"`
  - `interface Lane { id: string; name: string }`
  - `interface FlowNode { label: string; shape: FlowShape; lane: string }`
  - `interface FlowEdge { source: string; target: string; label: string }`
  - `interface LaneView { y: number; h: number }`
  - `FlowModel { lanes: Lane[]; nodes: Record<string, FlowNode>; edges: Record<string, FlowEdge> }`
  - `FlowView { nodes: Record<string, NodeView>; lanes: Record<string, LaneView> }`
  - `FlowDiagram { type: "flow"; model: FlowModel; view: FlowView }`
  - `createFlowDocument(name: string, id?: string): FlowDocument`
  - `flowDiagram(doc: DevDocument): FlowDiagram` (`src/editor/flow-access.ts`)

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/model/flow/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createFlowDocument, FlowModelSchema } from "./schema"

const lane = { id: "l1", name: "Cliente" }
const node = { label: "Verifica", shape: "process" as const, lane: "l1" }

describe("FlowModelSchema", () => {
  it("accetta un modello coerente", () => {
    const r = FlowModelSchema.safeParse({ lanes: [lane], nodes: { n1: node }, edges: {} })
    expect(r.success).toBe(true)
  })

  it("rifiuta un modello senza corsie: ogni nodo ne ha una, e senza corsie non ce ne sarebbe", () => {
    const r = FlowModelSchema.safeParse({ lanes: [], nodes: {}, edges: {} })
    expect(r.success).toBe(false)
  })

  it("rifiuta un nodo la cui corsia non esiste", () => {
    const r = FlowModelSchema.safeParse({
      lanes: [lane],
      nodes: { n1: { ...node, lane: "fantasma" } },
      edges: {},
    })
    expect(r.success).toBe(false)
  })

  it("accetta un'etichetta d'arco vuota: è il caso normale di un arco appena creato", () => {
    const r = FlowModelSchema.safeParse({
      lanes: [lane],
      nodes: { n1: node, n2: node },
      edges: { e1: { source: "n1", target: "n2", label: "" } },
    })
    expect(r.success).toBe(true)
  })
})

describe("createFlowDocument", () => {
  it("nasce con una corsia sola, nessun nodo e la banda già nella view", () => {
    const doc = createFlowDocument("Processo", "id-1")
    expect(doc.diagram.type).toBe("flow")
    expect(doc.diagram.model.lanes).toHaveLength(1)
    expect(doc.diagram.model.nodes).toEqual({})
    const laneId = doc.diagram.model.lanes[0]!.id
    expect(doc.diagram.view.lanes[laneId]).toEqual({ y: 0, h: 160 })
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/model/flow/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`

- [ ] **Step 3: Scrivi lo schema**

Crea `src/model/flow/schema.ts`:

```ts
import * as z from "zod"
import { Identifier, NodeViewSchema, SCHEMA_VERSION } from "../shared"
import type { DevDocument } from "../document"

/** Le cinque forme della notazione più la nota. La nota è una forma e non una specie: a
 *  differenza di quella del class diagram non si àncora a niente, è un riquadro con del testo. */
export const FlowShapeSchema = z.enum(["terminal", "process", "decision", "io", "subprocess", "note"])
export type FlowShape = z.infer<typeof FlowShapeSchema>

export const LaneSchema = z.object({ id: Identifier, name: z.string() })
export type Lane = z.infer<typeof LaneSchema>

export const FlowNodeSchema = z.object({
  label: z.string(),
  shape: FlowShapeSchema,
  /** `id` di una `Lane`, non un indice: cancellare una corsia non rinumera le altre. */
  lane: Identifier,
})
export type FlowNode = z.infer<typeof FlowNodeSchema>

/** `label` è sempre una stringa, vuota quando non c'è: un solo modo di dire «nessuna etichetta». */
export const FlowEdgeSchema = z.object({ source: Identifier, target: Identifier, label: z.string() })
export type FlowEdge = z.infer<typeof FlowEdgeSchema>

/**
 * Le corsie sono un **array** e non un `Record` come entità e classi: là la chiave è un nome
 * naturale e l'ordine non significa nulla, qui l'ordine è l'informazione, e l'array è il posto
 * dove vive senza poter divergere da nient'altro.
 */
export const FlowModelSchema = z
  .object({
    lanes: z.array(LaneSchema).min(1),
    nodes: z.record(z.string(), FlowNodeSchema),
    edges: z.record(z.string(), FlowEdgeSchema),
  })
  .refine((m) => Object.values(m.nodes).every((n) => m.lanes.some((l) => l.id === n.lane)), {
    message: "ogni nodo deve appartenere a una corsia esistente",
    path: ["nodes"],
  })
export type FlowModel = z.infer<typeof FlowModelSchema>

/** La banda di una corsia: posizionata come un nodo, non derivata dai nodi (spec §5). */
export const LaneViewSchema = z.object({ y: z.number(), h: z.number() })
export type LaneView = z.infer<typeof LaneViewSchema>

export const FlowViewSchema = z.object({
  nodes: z.record(z.string(), NodeViewSchema),
  lanes: z.record(z.string(), LaneViewSchema),
})
export type FlowView = z.infer<typeof FlowViewSchema>

export const FlowDiagramSchema = z.object({
  type: z.literal("flow"),
  model: FlowModelSchema,
  view: FlowViewSchema,
})
export type FlowDiagram = z.infer<typeof FlowDiagramSchema>

export type FlowDocument = DevDocument & { diagram: FlowDiagram }

/**
 * Altezza minima di una corsia, e altezza di una appena creata: contiene qualunque forma con
 * un'etichetta di due righe, rombo compreso. Sta nel modello e non nel layout perché la usano
 * entrambi — `createFlowDocument` qui e `placeInLanes` in `editor/flow/layout.ts` — e due costanti
 * con lo stesso valore divergono il giorno che qualcuno ne cambia una.
 */
export const LANE_MIN_H = 160

export function createFlowDocument(name: string, id: string = crypto.randomUUID()): FlowDocument {
  const laneId = crypto.randomUUID()
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: {
      type: "flow",
      model: { lanes: [{ id: laneId, name: "Corsia 1" }], nodes: {}, edges: {} },
      view: { nodes: {}, lanes: { [laneId]: { y: 0, h: LANE_MIN_H } } },
    },
  }
}
```

- [ ] **Step 4: Aggiungi il tipo alla union**

In `src/model/document.ts`:

```ts
import { FlowDiagramSchema } from "./flow/schema"

export const DiagramSchema = z.discriminatedUnion("type", [ErDiagramSchema, ClassDiagramSchema, FlowDiagramSchema])
```

- [ ] **Step 5: Scrivi l'accessore**

Crea `src/editor/flow-access.ts`, copia esatta della forma di `er-access.ts`:

```ts
import type { DevDocument } from "@/model/document"
import type { FlowDiagram } from "@/model/flow/schema"

/** Il diagramma come flowchart. Chi chiama sa già che lo è: lo garantisce `opsFor`. */
export function flowDiagram(doc: DevDocument): FlowDiagram {
  if (doc.diagram.type !== "flow") throw new Error("il documento non è un flowchart")
  return doc.diagram
}
```

- [ ] **Step 6: Esegui i test e verifica che passino**

Run: `pnpm vitest run src/model/flow/schema.test.ts`
Expected: PASS

- [ ] **Step 7: Verifica che il compilatore segnali i punti scoperti**

Run: `pnpm build`
Expected: FAIL sui quattro `switch` esaustivi (`editor/kinds/ops.ts`, `ui/canvas/kinds/registry.ts`, `io/document-io.ts`, `ui/export/actions.ts`) più `hasContent` e `hasNodes`. **È il risultato atteso**: sono i punti che i Task 3-12 riempiono. Annota l'elenco che `tsc` stampa — è la lista di lavoro, e deve svuotarsi entro il Task 12.

Per tenere l'albero compilabile fino ad allora, aggiungi in ciascuno dei sei punti il ramo `case "flow":` con un `throw new Error("flowchart: non ancora implementato")`, e un commento `// ponytail: rimosso nel Task N`, dove N è il task che lo riempie (3 per `opsFor`, 12 per gli altri).

- [ ] **Step 8: Committa**

Run: `pnpm lint && pnpm test && pnpm build`

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): il modello del flowchart con le corsie

Le chiavi sono id generati e non nomi, come la spec madre prescrive per
flowchart e sequence: due nodi con la stessa etichetta possono coesistere e
non serve una regola sui nomi in conflitto.

Le corsie sono un array perché il loro ordine è un dato dell'utente; i nodi
le puntano per id, così cancellarne una non rinumera le altre. Che ogni nodo
appartenga a una corsia esistente è un refine dello schema: un invariante del
modello, non una regola di validazione da scrivere dopo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: I comandi

Tutti i comandi che scrivono sul modello: nodi, archi, corsie. Sono funzioni che tornano una `Recipe` (una mutazione Immer su bozza), esattamente come `commands/er.ts` e `class/commands.ts`.

**Files:**
- Create: `src/editor/flow/commands.ts`, `src/editor/flow/commands.test.ts`
- Modify: `src/editor/kinds/ops.ts` (il `case "flow"` del Task 2 diventa vero)
- Create: `src/editor/kinds/flow.ts`

**Interfaces:**
- Consumes: `flowDiagram` (Task 2), `snap` e `Point` da `@/editor/geometry`, `Recipe` da `@/editor/document-store`
- Produces (tutte in `src/editor/flow/commands.ts`):
  - `addFlowNode(at: Point, shape: FlowShape, lane: string): { key: string; recipe: Recipe }`
  - `addFlowEdge(model: FlowModel, source: string, target: string): { key: string; recipe: Recipe } | null`
  - `setNodeLabel(key: string, label: string): Recipe`
  - `setNodeShape(key: string, shape: FlowShape): Recipe`
  - `setEdgeLabel(key: string, label: string): Recipe`
  - `deleteFlowItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null`
  - `duplicateFlowNodes(model: FlowModel, keys: readonly string[]): { keys: string[]; recipe: Recipe }`
  - `addLane(name: string): Recipe`
  - `renameLane(id: string, name: string): Recipe`
  - `deleteLane(id: string, moveTo: string): Recipe | null`
  - `moveLane(from: number, to: number): Recipe`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/editor/flow/commands.test.ts`. Ogni test applica la recipe con `produce` di Immer su un documento minimo:

```ts
import { produce } from "immer"
import { describe, expect, it } from "vitest"
import type { DevDocument } from "@/model/document"
import { createFlowDocument } from "@/model/flow/schema"
import { addFlowEdge, addFlowNode, deleteFlowItems, deleteLane, addLane, setNodeShape } from "./commands"

function docWith(): { doc: DevDocument; lane: string } {
  const doc = createFlowDocument("test", "id-1")
  return { doc, lane: doc.diagram.model.lanes[0]!.id }
}

const apply = (doc: DevDocument, recipe: (d: DevDocument) => void): DevDocument => produce(doc, recipe)

describe("addFlowNode", () => {
  it("crea il nodo nella corsia data, con la forma data e l'etichetta vuota", () => {
    const { doc, lane } = docWith()
    const { key, recipe } = addFlowNode({ x: 33, y: 47 }, "decision", lane)
    const next = apply(doc, recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[key]).toEqual({ label: "", shape: "decision", lane })
    expect(d.view.nodes[key]).toEqual({ x: 30, y: 50, collapsed: false })
  })
})

describe("addFlowEdge", () => {
  it("torna null se un estremo non esiste", () => {
    const { doc, lane } = docWith()
    const a = addFlowNode({ x: 0, y: 0 }, "process", lane)
    const next = apply(doc, a.recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(addFlowEdge(d.model, a.key, "fantasma")).toBeNull()
  })

  it("ammette due archi fra la stessa coppia: sono i due rami di una decisione", () => {
    const { doc, lane } = docWith()
    const a = addFlowNode({ x: 0, y: 0 }, "decision", lane)
    const b = addFlowNode({ x: 200, y: 0 }, "process", lane)
    let next = apply(apply(doc, a.recipe), b.recipe)
    const first = addFlowEdge((next.diagram as { model: FlowModel }).model, a.key, b.key)!
    next = apply(next, first.recipe)
    const second = addFlowEdge((next.diagram as { model: FlowModel }).model, a.key, b.key)!
    next = apply(next, second.recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(Object.keys(d.model.edges)).toHaveLength(2)
  })
})

describe("deleteFlowItems", () => {
  it("cancellando un nodo porta via gli archi che lo toccano", () => {
    const { doc, lane } = docWith()
    const a = addFlowNode({ x: 0, y: 0 }, "process", lane)
    const b = addFlowNode({ x: 200, y: 0 }, "process", lane)
    let next = apply(apply(doc, a.recipe), b.recipe)
    const e = addFlowEdge((next.diagram as { model: FlowModel }).model, a.key, b.key)!
    next = apply(next, e.recipe)
    next = apply(next, deleteFlowItems([a.key], [])!)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[a.key]).toBeUndefined()
    expect(d.model.edges[e.key]).toBeUndefined()
    expect(d.view.nodes[a.key]).toBeUndefined()
  })
})

describe("deleteLane", () => {
  it("rifiuta di cancellare l'ultima corsia: nessun nodo può restare senza", () => {
    const { doc, lane } = docWith()
    expect(deleteLane(lane, lane)).toBeNull()
  })

  it("sposta i nodi della corsia cancellata in quella indicata", () => {
    const { doc, lane } = docWith()
    let next = apply(doc, addLane("Corsia 2"))
    const d0 = next.diagram
    if (d0.type !== "flow") throw new Error("tipo sbagliato")
    const seconda = d0.model.lanes[1]!.id
    const n = addFlowNode({ x: 0, y: 0 }, "process", seconda)
    next = apply(next, n.recipe)
    next = apply(next, deleteLane(seconda, lane)!)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.lanes).toHaveLength(1)
    expect(d.model.nodes[n.key]!.lane).toBe(lane)
    expect(d.view.lanes[seconda]).toBeUndefined()
  })
})

describe("setNodeShape", () => {
  it("cambia la forma senza toccare etichetta e corsia", () => {
    const { doc, lane } = docWith()
    const n = addFlowNode({ x: 0, y: 0 }, "process", lane)
    const next = apply(apply(doc, n.recipe), setNodeShape(n.key, "decision"))
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[n.key]).toEqual({ label: "", shape: "decision", lane })
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/editor/flow/commands.test.ts`
Expected: FAIL — `Cannot find module './commands'`

- [ ] **Step 3: Scrivi i comandi**

Crea `src/editor/flow/commands.ts`. Le regole da rispettare, tutte già usate dagli altri due tipi:

- una chiave nuova è `crypto.randomUUID()` (niente `uniqueKey`: qui la chiave non è un nome);
- le posizioni passano da `snap()`;
- un comando che non cambia niente non scrive (evita una voce di undo fantasma);
- cancellare un nodo cancella la sua voce in `view.nodes` e ogni arco che lo tocca;
- `deleteLane` torna `null` quando la corsia è l'ultima, e sposta i nodi in `moveTo` altrimenti; toglie anche la banda da `view.lanes`;
- `addLane` appende la banda sotto l'ultima: `y` = somma delle altezze esistenti, `h` = `LANE_MIN_H`;
- `duplicateFlowNodes` sposta la copia di `DUPLICATE_OFFSET = 20` e la lascia **nella stessa corsia**.

- [ ] **Step 4: Scrivi `DiagramOps` del flowchart**

Crea `src/editor/kinds/flow.ts` sulla forma esatta di `kinds/er.ts`. `addNode` risolve la corsia dal punto di rilascio, e ogni nodo del flowchart apre l'editor di testo:

```ts
    addNode: (at, variant) => {
      const d = diagram()
      const shape = (variant ?? "process") as FlowShape
      const lane = laneAt(d, at.y) ?? d.model.lanes[0]!.id
      return { ...addFlowNode(at, shape, lane), edit: "body" }
    },
```

`laneAt` arriva nel Task 6; fino ad allora scrivila come stub che torna `d.model.lanes[0]!.id` e **scrivi subito il test** che la vuole vera, marcandolo `it.todo`. In `opsFor`, il `case "flow"` chiama `flowOps(doc)`.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `pnpm vitest run src/editor/flow`
Expected: PASS

- [ ] **Step 6: Committa**

Run: `pnpm lint && pnpm test`

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): i comandi su nodi, archi e corsie

Cancellare una corsia sposta i suoi nodi invece di lasciarli orfani, e
l'ultima non si cancella: l'invariante «ogni nodo ha una corsia» si difende
nei comandi, non a valle con una regola di validazione.

Due archi fra la stessa coppia sono ammessi di proposito: sono i due rami di
una decisione, non un doppione.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: La direzione di ELK diventa un dato

Il flowchart dispone da sinistra a destra, gli altri due dall'alto in basso. Oggi la direzione è una costante nel worker (ADR 0006); diventa un campo del grafo (ADR 0007).

**Files:**
- Modify: `src/model/layout.ts`, `src/io/layout/client.ts`, `src/io/layout/elk.worker.ts`, `src/io/layout/client.test.ts`, `src/editor/commands/layout.ts`, `src/editor/class/commands.ts` (`classLayoutGraph`), `src/ui/layout-actions.ts`

**Interfaces:**
- Produces:
  - `type LayoutDirection = "DOWN" | "RIGHT"` (`src/model/layout.ts`)
  - `LayoutGraph` guadagna `direction: LayoutDirection`
  - `LayoutRequest` guadagna `direction: LayoutDirection`
  - `LayoutEngine.layout(graph: LayoutGraph): Promise<LayoutPositions>` — prende il grafo intero invece di `(nodes, edges)`

- [ ] **Step 1: Scrivi il test che fallisce**

In `src/io/layout/client.test.ts`, aggiungi:

```ts
it("la direzione del grafo arriva al worker dentro la richiesta", () => {
  const w = new FakeWorker()
  const engine = createLayoutEngine(() => w)
  void engine.layout({ nodes: [{ id: "a", w: 10, h: 10 }], edges: [], direction: "RIGHT" })
  expect(w.requests[0]!.direction).toBe("RIGHT")
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/io/layout/client.test.ts`
Expected: FAIL — `layout` non accetta un oggetto, e `LayoutRequest` non ha `direction`.

- [ ] **Step 3: Allarga il vocabolario del layout**

In `src/model/layout.ts`:

```ts
/**
 * Direzione del flusso. Non è una costante del progetto ma una proprietà del tipo di diagramma
 * (ADR 0007): ER e class scendono, il flowchart con corsie va a destra perché le corsie occupano
 * l'asse verticale.
 */
export type LayoutDirection = "DOWN" | "RIGHT"

export interface LayoutGraph {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  direction: LayoutDirection
}
```

- [ ] **Step 4: Porta la direzione fino a ELK**

In `src/io/layout/client.ts`: `LayoutRequest` guadagna `direction: LayoutDirection`, e `LayoutEngine.layout` prende `(graph: LayoutGraph)`. Dentro, la `postMessage` inoltra `direction: graph.direction`.

In `src/io/layout/elk.worker.ts`, `OPTIONS` perde `elk.direction` e il commento sopra va corretto, perché la riga che dichiarava «non è un parametro di chi chiama» ora è falsa per un campo:

```ts
/**
 * Algoritmo e spaziature sono una decisione del progetto (ADR 0006) e non un parametro di chi
 * chiama. La **direzione** sì: è una proprietà del tipo di diagramma (ADR 0007), e arriva nella
 * richiesta.
 */
const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
}
```

e la chiamata usa `{ ...OPTIONS, "elk.direction": message.direction }`.

- [ ] **Step 5: Adatta i due produttori esistenti e il chiamante**

`layoutGraph` (`src/editor/commands/layout.ts`) e `classLayoutGraph` (`src/editor/class/commands.ts`) tornano `direction: "DOWN"`. In `src/ui/layout-actions.ts` la chiamata diventa `await layoutEngine.layout(graph)`.

- [ ] **Step 6: Esegui i test e verifica che passino**

Run: `pnpm vitest run src/io/layout src/editor`
Expected: PASS

- [ ] **Step 7: Committa**

Run: `pnpm lint && pnpm test && pnpm build`

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(layout): la direzione di ELK è una proprietà del tipo di diagramma

ADR 0007. Il flowchart con corsie dispone da sinistra a destra perché le
corsie occupano l'asse verticale; ER e class restano DOWN per l'area e il
tempo misurati in ADR 0006.

Algoritmo e spaziature restano una costante del progetto: la distinzione va
tenuta, altrimenti il worker torna a essere un passacarte e la decisione su
come questo programma dispone finisce sparsa nei tipi di diagramma.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 5: Il layout con le corsie

Il cuore della feature (spec §5). ELK dispone il grafo ignorando le corsie; di quel risultato si tiene la **x**, mentre la **y** la decide la corsia. La y di ELK non si butta: si degrada da coordinata a **ordinamento** dentro la banda.

Tutto questo task è provabile senza worker, senza DOM e senza ELK.

**Files:**
- Create: `src/editor/flow/layout.ts`, `src/editor/flow/layout.test.ts`
- Modify: `src/editor/kinds/ops.ts` (nuovo metodo opzionale), `src/editor/kinds/flow.ts`, `src/ui/layout-actions.ts`

**Interfaces:**
- Consumes: `flowNodeSize` (Task 6 — fino ad allora usa la misura provvisoria descritta sotto), `LayoutPositions`, `LayoutGraph`
- Produces:
  - `flowLayoutGraph(diagram: FlowDiagram): LayoutGraph`
  - `placeInLanes(diagram: FlowDiagram, positions: LayoutPositions): { positions: LayoutPositions; lanes: Record<string, LaneView> }`
  - `applyFlowLayout(positions: LayoutPositions): Recipe` (in `src/editor/flow/commands.ts`)
  - `DiagramOps.layoutRecipe?(positions: LayoutPositions): Recipe`
  - costanti `LANE_PAD = 20`, `ROW_GAP = 24`, `COL_GAP = 24` (`LANE_MIN_H` **non** si ridefinisce qui: si importa da `@/model/flow/schema`, dove il Task 2 l'ha messa)

**Nota sull'ordine:** questo task consuma `flowNodeSize` dal Task 6. Se lo esegui prima, definisci in `layout.ts` una misura provvisoria `{ w: 160, h: 60 }` per ogni nodo e sostituiscila nel Task 6 — i test di questo task non dipendono dalle misure reali, solo dal fatto che ci siano.

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/editor/flow/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { FlowDiagram } from "@/model/flow/schema"
import { LANE_MIN_H } from "@/model/flow/schema"
import { placeInLanes } from "./layout"

const node = (lane: string) => ({ label: "x", shape: "process" as const, lane })

function diagram(nodes: Record<string, { lane: string }>, lanes: string[]): FlowDiagram {
  return {
    type: "flow",
    model: {
      lanes: lanes.map((id) => ({ id, name: id })),
      nodes: Object.fromEntries(Object.entries(nodes).map(([k, v]) => [k, node(v.lane)])),
      edges: {},
    },
    view: { nodes: {}, lanes: {} },
  }
}

describe("placeInLanes", () => {
  it("non tocca la x: è l'asse del flusso, e viene da ELK", () => {
    const d = diagram({ a: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 137, y: 999 } })
    expect(positions.a!.x).toBe(137)
  })

  it("mette ogni nodo dentro la banda della sua corsia", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l2" } }, ["l1", "l2"])
    const { positions, lanes } = placeInLanes(d, { a: { x: 0, y: 500 }, b: { x: 0, y: 0 } })
    expect(positions.a!.y).toBeGreaterThanOrEqual(lanes.l1!.y)
    expect(positions.a!.y).toBeLessThan(lanes.l1!.y + lanes.l1!.h)
    expect(positions.b!.y).toBeGreaterThanOrEqual(lanes.l2!.y)
    expect(positions.b!.y).toBeLessThan(lanes.l2!.y + lanes.l2!.h)
  })

  it("le bande sono contigue e nell'ordine del modello", () => {
    const d = diagram({}, ["l1", "l2", "l3"])
    const { lanes } = placeInLanes(d, {})
    expect(lanes.l1!.y).toBe(0)
    expect(lanes.l2!.y).toBe(lanes.l1!.y + lanes.l1!.h)
    expect(lanes.l3!.y).toBe(lanes.l2!.y + lanes.l2!.h)
  })

  it("una corsia vuota ha comunque la sua altezza minima", () => {
    const d = diagram({}, ["l1"])
    const { lanes } = placeInLanes(d, {})
    expect(lanes.l1!.h).toBe(LANE_MIN_H)
  })

  it("due nodi della stessa corsia che si accavallano in x finiscono su righe diverse", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } })
    expect(positions.a!.y).not.toBe(positions.b!.y)
  })

  it("due nodi della stessa corsia lontani in x restano sulla stessa riga", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 0, y: 0 }, b: { x: 900, y: 400 } })
    expect(positions.a!.y).toBe(positions.b!.y)
  })

  it("a parità di colonna l'ordine è quello che ELK aveva dato con la y", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 0, y: 500 }, b: { x: 0, y: 0 } })
    expect(positions.b!.y).toBeLessThan(positions.a!.y)
  })

  it("un nodo senza posizione da ELK non compare nel risultato invece di finire a zero", () => {
    const d = diagram({ a: { lane: "l1" }, b: { lane: "l1" } }, ["l1"])
    const { positions } = placeInLanes(d, { a: { x: 0, y: 0 } })
    expect(positions.b).toBeUndefined()
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/editor/flow/layout.test.ts`
Expected: FAIL — `Cannot find module './layout'`

- [ ] **Step 3: Scrivi `flowLayoutGraph`**

In `src/editor/flow/layout.ts`, sulla forma di `layoutGraph` (`commands/layout.ts`): i nodi senza voce in `view.nodes` sono esclusi, gli archi con un estremo fuori dal grafo sono saltati (a ELK un arco monco fa rifiutare tutto il grafo), e `direction` è `"RIGHT"`.

Gli archi **non** vanno invertiti: a differenza dell'ER, dove `source` è la figlia e la convenzione vuole i padri in alto (ADR 0006), qui `source` è già il verso del flusso.

- [ ] **Step 4: Scrivi `placeInLanes`**

```ts
import { LANE_MIN_H } from "@/model/flow/schema"

export const LANE_PAD = 20
export const ROW_GAP = 24
export const COL_GAP = 24

/**
 * Le posizioni di ELK corrette per le corsie (spec §5).
 *
 * La **x** resta quella di ELK: è l'asse del flusso. La **y** la decide la corsia — ma la y di ELK
 * non si butta, si degrada a **ordinamento**: dentro la corsia i nodi si dispongono in righe, e a
 * parità di colonna vince l'ordine che ELK aveva scelto per ridurre gli incroci.
 *
 * Le righe sono colorazione di intervalli: un nodo entra nella prima riga già libera alla sua x,
 * altrimenti ne apre una. Così due nodi lontani nel flusso restano affiancati invece di impilarsi,
 * e solo quelli che si accavallano davvero scendono di riga.
 */
export function placeInLanes(
  diagram: FlowDiagram,
  positions: LayoutPositions,
): { positions: LayoutPositions; lanes: Record<string, LaneView> } {
  const out: LayoutPositions = {}
  const lanes: Record<string, LaneView> = {}
  let cursor = 0

  for (const lane of diagram.model.lanes) {
    const members = Object.entries(diagram.model.nodes)
      .flatMap(([key, node]) => {
        const pos = positions[key]
        return node.lane === lane.id && pos ? [{ key, pos, size: flowNodeSize(node) }] : []
      })
      .sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y)

    const rows: { end: number; h: number }[] = []
    const rowOf = new Map<string, number>()
    for (const m of members) {
      let i = rows.findIndex((r) => r.end + COL_GAP <= m.pos.x)
      if (i === -1) i = rows.push({ end: Number.NEGATIVE_INFINITY, h: 0 }) - 1
      const row = rows[i]!
      row.end = m.pos.x + m.size.w
      row.h = Math.max(row.h, m.size.h)
      rowOf.set(m.key, i)
    }

    const tops: number[] = []
    let y = cursor + LANE_PAD
    for (const row of rows) {
      tops.push(y)
      y += row.h + ROW_GAP
    }
    for (const m of members) {
      out[m.key] = { x: m.pos.x, y: tops[rowOf.get(m.key) ?? 0] ?? cursor + LANE_PAD }
    }

    const used = rows.length === 0 ? 0 : y - ROW_GAP + LANE_PAD - cursor
    const h = Math.max(LANE_MIN_H, used)
    lanes[lane.id] = { y: cursor, h }
    cursor += h
  }

  return { positions: out, lanes }
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `pnpm vitest run src/editor/flow/layout.test.ts`
Expected: PASS, otto test.

- [ ] **Step 6: Collega il layout alla dispatch**

In `src/editor/flow/commands.ts`:

```ts
/** Posizioni e bande in **una sola** recipe: due dispatch darebbero due passi di undo per un gesto. */
export function applyFlowLayout(positions: LayoutPositions): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const placed = placeInLanes(d, positions)
    for (const [key, p] of Object.entries(placed.positions)) {
      const view = d.view.nodes[key]
      if (view) { view.x = p.x; view.y = p.y }
    }
    d.view.lanes = placed.lanes
  }
}
```

In `src/editor/kinds/ops.ts`:

```ts
  /**
   * Sostituisce la dispatch predefinita `applyLayout(positions)` quando c'è. Serve al flowchart,
   * che col layout riscrive anche le bande: due dispatch darebbero due passi di undo.
   */
  layoutRecipe?(positions: LayoutPositions): Recipe
```

In `src/ui/layout-actions.ts`:

```ts
    const positions = await layoutEngine.layout(graph)
    const ops = opsFor(documentStore.getState().doc)
    documentStore.getState().dispatch(ops.layoutRecipe ? ops.layoutRecipe(positions) : applyLayout(positions))
```

- [ ] **Step 7: Verifica e committa**

Run: `pnpm lint && pnpm test`

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): il layout con le corsie, con la y di ELK degradata a ordinamento

ELK dispone il grafo ignorando le corsie e se ne tiene la x, che è l'asse del
flusso; la y la decide la corsia. Ma la y di ELK non si butta: dentro la
corsia diventa l'ordine dei nodi a parità di colonna, così il lavoro che ELK
ha fatto per ridurre gli incroci sopravvive dove può ancora servire.

Le righe dentro una corsia sono colorazione di intervalli: due nodi lontani
nel flusso restano affiancati, e scendono di riga solo quelli che si
accavallano davvero.

È la stessa divisione già scelta per le rotte degli archi: al worker si
chiede la posizione, non il disegno. Qui gli si chiede un asse solo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: Geometria delle forme

Misure e path SVG delle cinque forme più la nota, e la risoluzione della corsia da una coordinata.

**Files:**
- Create: `src/editor/flow/geometry.ts`, `src/editor/flow/geometry.test.ts`
- Modify: `src/editor/flow/layout.ts` (sostituisce la misura provvisoria), `src/editor/kinds/flow.ts` (`laneAt` vera)

**Interfaces:**
- Consumes: `CHAR_W`, `ROW_H`, `PAD_X`, `MIN_W`, `Size`, `Rect`, `NodeView`
- Produces:
  - `flowNodeSize(node: FlowNode): Size`
  - `flowNodeRect(node: FlowNode, view: NodeView): Rect`
  - `shapePath(shape: FlowShape, w: number, h: number): string`
  - `laneAt(diagram: FlowDiagram, y: number): string | null`
  - `DECISION_FACTOR = 2`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/editor/flow/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { FlowDiagram, FlowNode } from "@/model/flow/schema"
import { flowNodeSize, laneAt, shapePath } from "./geometry"

const node = (over: Partial<FlowNode> = {}): FlowNode => ({ label: "Verifica", shape: "process", lane: "l1", ...over })

describe("flowNodeSize", () => {
  it("cresce con la riga più lunga", () => {
    const corta = flowNodeSize(node({ label: "ok" }))
    const lunga = flowNodeSize(node({ label: "una etichetta molto più lunga di quella corta" }))
    expect(lunga.w).toBeGreaterThan(corta.w)
  })

  it("cresce in altezza con il numero di righe", () => {
    const una = flowNodeSize(node({ label: "a" }))
    const tre = flowNodeSize(node({ label: "a\nb\nc" }))
    expect(tre.h).toBeGreaterThan(una.h)
  })

  it("il rombo è circa il doppio del rettangolo a parità di testo: deve contenerlo", () => {
    const processo = flowNodeSize(node({ shape: "process" }))
    const decisione = flowNodeSize(node({ shape: "decision" }))
    expect(decisione.w).toBe(processo.w * 2)
    expect(decisione.h).toBe(processo.h * 2)
  })

  it("un'etichetta vuota non produce un nodo invisibile", () => {
    const vuoto = flowNodeSize(node({ label: "" }))
    expect(vuoto.w).toBeGreaterThanOrEqual(60)
    expect(vuoto.h).toBeGreaterThanOrEqual(40)
  })
})

describe("shapePath", () => {
  it("ogni forma produce un path non vuoto", () => {
    for (const shape of ["terminal", "process", "decision", "io", "subprocess", "note"] as const) {
      expect(shapePath(shape, 100, 50).length).toBeGreaterThan(0)
    }
  })
})

describe("laneAt", () => {
  const d = {
    type: "flow",
    model: { lanes: [{ id: "l1", name: "a" }, { id: "l2", name: "b" }], nodes: {}, edges: {} },
    view: { nodes: {}, lanes: { l1: { y: 0, h: 100 }, l2: { y: 100, h: 100 } } },
  } as FlowDiagram

  it("trova la corsia che contiene la coordinata", () => {
    expect(laneAt(d, 50)).toBe("l1")
    expect(laneAt(d, 150)).toBe("l2")
  })

  it("il confine appartiene alla corsia di sotto, senza buchi né sovrapposizioni", () => {
    expect(laneAt(d, 100)).toBe("l2")
  })

  it("fuori da ogni banda torna null: chi chiama decide, qui non si indovina", () => {
    expect(laneAt(d, -10)).toBeNull()
    expect(laneAt(d, 5000)).toBeNull()
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/editor/flow/geometry.test.ts`
Expected: FAIL — `Cannot find module './geometry'`

- [ ] **Step 3: Scrivi la geometria**

Regole:

- la misura del testo usa le costanti condivise di `editor/geometry.ts` (`CHAR_W`, `ROW_H`, `PAD_X`), come fa `noteSize` per la nota del class diagram: larghezza dalla riga più lunga, altezza dal numero di righe, minimi `60 × 40` perché un nodo appena creato ha etichetta vuota e deve restare afferrabile;
- `decision` moltiplica entrambe le misure per `DECISION_FACTOR = 2`: un rombo che contiene un rettangolo `w × h` ha bisogno di `2w × 2h`. È la ragione per cui nei flowchart le decisioni si scrivono corte, e il docblock lo dice;
- `shapePath` torna l'attributo `d` di un `<path>` per ogni forma: stadio (`terminal`), rettangolo (`process`), rombo (`decision`), parallelogramma con inclinazione fissa (`io`), rettangolo con due barre verticali interne (`subprocess`), riquadro con angolo ripiegato (`note`, e qui si riusa `notePath` di `class/geometry.ts` invece di riscriverlo);
- `laneAt`:

```ts
/**
 * La corsia che contiene `y`, o `null` fuori da ogni banda.
 *
 * Il confronto è chiuso sopra e aperto sotto, così il confine fra due bande appartiene a quella di
 * sotto e non a entrambe: nessun buco, nessuna doppia appartenenza. Fuori da ogni banda torna
 * `null` invece di agganciare alla più vicina — indovinare qui vorrebbe dire decidere al posto di
 * chi chiama, che sa se sta creando un nodo (allora la prima corsia) o trascinandone uno (allora
 * quella di partenza).
 */
export function laneAt(diagram: FlowDiagram, y: number): string | null {
  for (const lane of diagram.model.lanes) {
    const band = diagram.view.lanes[lane.id]
    if (band && y >= band.y && y < band.y + band.h) return lane.id
  }
  return null
}
```

- [ ] **Step 4: Sostituisci la misura provvisoria nel layout**

In `src/editor/flow/layout.ts`, importa `flowNodeSize` da `./geometry` ed elimina il segnaposto del Task 5.

- [ ] **Step 5: Rendi vera `laneAt` in `kinds/flow.ts`**

Sostituisci lo stub del Task 3 con la funzione vera e togli l'`it.todo`.

- [ ] **Step 6: Esegui i test e committa**

Run: `pnpm lint && pnpm test`
Expected: PASS, compresi i test del Task 5 con le misure vere.

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): misure e path delle cinque forme

Il rombo è il doppio del rettangolo su entrambi gli assi perché deve
contenerlo: è geometria, non una scelta di stile, ed è la ragione per cui
nei flowchart le decisioni si scrivono corte.

`laneAt` dà il confine fra due bande alla corsia di sotto, così non restano
né buchi né doppie appartenenze, e fuori da ogni banda torna null invece di
indovinare: decide chi chiama.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 7: Resa sul canvas

Nodi, archi con etichetta e bande. Alla fine di questo task un flowchart si disegna e si dispone.

**Files:**
- Create: `src/ui/canvas/FlowNode.tsx`, `src/ui/canvas/FlowEdge.tsx`, `src/ui/canvas/LanesLayer.tsx`, `src/ui/canvas/kinds/flow.tsx`
- Modify: `src/ui/canvas/kinds/registry.ts` (il `case "flow"` diventa vero), `src/ui/canvas/Canvas.tsx`
- Test: `src/ui/canvas/kinds/registry.test.ts`

**Interfaces:**
- Consumes: `NodeViewProps`, `EdgeViewProps`, `DiagramView` (Task 1), `flowNodeRect`, `shapePath` (Task 6)
- Produces: `flowView: DiagramView`, `FlowNodeView`, `FlowEdgeView`, `LanesLayer`

- [ ] **Step 1: Scrivi il test che fallisce**

In `src/ui/canvas/kinds/registry.test.ts`:

```ts
it("il flowchart dichiara sette strumenti, tutti con chiave distinta", () => {
  const view = viewFor("flow")
  expect(view.tools).toHaveLength(7)
  const keys = view.tools.map((t) => t.key)
  expect(new Set(keys).size).toBe(keys.length)
})

it("le sei forme sono varianti dello strumento nodo, l'arco no", () => {
  const view = viewFor("flow")
  expect(view.tools.filter((t) => t.tool === "node").every((t) => t.variant)).toBe(true)
  expect(view.tools.filter((t) => t.tool === "edge")).toHaveLength(1)
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/ui/canvas/kinds/registry.test.ts`
Expected: FAIL — `viewFor("flow")` lancia lo stub del Task 2.

- [ ] **Step 3: Scrivi i tre componenti**

`FlowNode.tsx` sulla forma esatta di `ClassNote.tsx`: un `FlowNodeView` puro `memo` guidato dalle prop (lo usa `buildSvg`) e un `FlowNode` sottoscritto allo store. Il corpo è un `<path d={shapePath(...)}>` più il testo su più righe in `<tspan>`; il doppio click apre l'editor (`setEditing({ key, target: "body" })`).

`FlowEdge.tsx` sulla forma di `ClassEdge.tsx`: `routeEdge` per il percorso, una freccia piena in punta, e l'etichetta come `<text>` sul primo segmento, **spostata dello stesso `offset` di fascio** che il componente riceve già come prop — è il punto che chiude la voce d'Archivio sulle etichette sovrapposte (spec §8).

`LanesLayer.tsx`: un `<g data-layer="lanes">` con, per ogni corsia, un `<rect>` a tutta larghezza del contenuto e un `<text>` con il nome sul bordo sinistro. La larghezza viene dai limiti dei nodi (`rectsBounds`) allargati di un margine, non dal viewport: deve essere la stessa nell'app e nell'export.

- [ ] **Step 4: Estendi il router all'asse orizzontale e scrivi il limite nel codice**

Il router non è mai stato esercitato su un flusso sinistra→destra. In `src/editor/edge-routing.test.ts` aggiungi i casi speculari a quelli verticali esistenti:

```ts
describe("routeEdge da sinistra a destra", () => {
  it("esce a destra della sorgente ed entra a sinistra del bersaglio", () => {
    const a = { x: 0, y: 0, w: 100, h: 60 }
    const b = { x: 300, y: 0, w: 100, h: 60 }
    const route = routeEdge(a, b, false)
    expect(route.sourceDir).toEqual(RIGHT)
    expect(route.targetDir).toEqual(LEFT)
  })

  it("un arco all'indietro esce comunque con un percorso ortogonale valido", () => {
    const a = { x: 300, y: 0, w: 100, h: 60 }
    const b = { x: 0, y: 0, w: 100, h: 60 }
    const route = routeEdge(a, b, false)
    expect(route.points.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < route.points.length; i++) {
      const p = route.points[i - 1]!, q = route.points[i]!
      expect(p.x === q.x || p.y === q.y).toBe(true)
    }
  })
})
```

Il secondo test non pretende che l'arco all'indietro sia *bello*: pretende che sia ortogonale. Che passi **sopra i nodi** è il limite accettato dalla spec §8, e va scritto dove qualcuno lo troverà, in testa a `routeEdge`:

```ts
// ponytail: il router non evita gli ostacoli, quindi un arco all'indietro passa sopra i nodi che
// trova. Invisibile in ER e class, dove le contro-frecce sono rare; normale nel flowchart, dove il
// ciclo è il caso comune. Alzarlo significa un router con aggiramento (A* su griglia dei
// rettangoli), non una correzione a questo.
```

- [ ] **Step 5: Monta il layer sotto tutto**

In `Canvas.tsx` il layer delle bande va **prima** di nodi e archi nell'ordine di montaggio, così sta sotto senza z-index. Non è un `DiagramView.NodesLayer`: è un terzo layer che solo il flowchart popola, e per gli altri due tipi rende `null`.

- [ ] **Step 6: Scrivi `flowView`**

```tsx
export const flowView: DiagramView = {
  NodesLayer,
  EdgesLayer,
  NodeView,
  EdgeView,
  Properties: FlowProperties,
  tools: [
    { label: "Terminale", key: "1", Icon: Circle, tool: "node", variant: "terminal" },
    { label: "Processo", key: "2", Icon: Square, tool: "node", variant: "process" },
    { label: "Decisione", key: "3", Icon: Diamond, tool: "node", variant: "decision" },
    { label: "Input/Output", key: "4", Icon: Parentheses, tool: "node", variant: "io" },
    { label: "Sottoprocesso", key: "5", Icon: Layers, tool: "node", variant: "subprocess" },
    { label: "Nota", key: "6", Icon: StickyNote, tool: "node", variant: "note" },
    { label: "Arco", key: "r", Icon: Spline, tool: "edge" },
  ],
  textFormats: ["flow-mermaid"],
}
```

`FlowProperties` arriva nel Task 12: fino ad allora punta a un componente che rende `null`. `"flow-mermaid"` va aggiunto a `TextFormat` in `registry.ts`; l'emettitore arriva nel Task 10, e finché non c'è **il formato non va elencato** in `textFormats` — un formato senza emettitore non deve comparire nel dialogo (è la regola già scritta nel docblock di `TextFormat`). Quindi in questo task `textFormats: []`, e il Task 10 lo riempie.

- [ ] **Step 7: Esegui, guarda con gli occhi, committa**

Run: `pnpm lint && pnpm test && pnpm build`

Poi `pnpm dev`: crea un flowchart, metti un nodo per forma, collegane due, premi `L`. Le bande devono comparire, i nodi restare dentro la propria, e nessuna coppia sovrapporsi.

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): nodi, archi e bande sul canvas

L'etichetta dell'arco si colloca sul primo segmento spostata dello stesso
scarto di fascio già calcolato per gli archi: con flusso a destra gli archi
entranti arrivano tutti dal lato sinistro, quindi l'etichetta eredita la
separazione che il fascio ha calcolato invece di chiederne una propria.

Le bande sono un layer di sfondo e non nodi: non si selezionano, non si
duplicano, non entrano nel grafo di layout.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: Il drag fra corsie

Il punto in cui la feature tocca il codice più caldo del progetto — il gesto che scrive sul DOM fuori da React e che il gate di prestazione misura. Lo tocca solo al rilascio.

**Files:**
- Modify: `src/editor/kinds/ops.ts`, `src/editor/kinds/flow.ts`, `src/editor/flow/commands.ts`, `src/ui/canvas/interaction-runner.ts`
- Test: `src/editor/flow/commands.test.ts`

**Interfaces:**
- Produces:
  - `DiagramOps.commitDrag?(keys: readonly string[], dx: number, dy: number): Recipe | null` — quando manca, il runner usa `moveNodes`
  - `moveFlowNodes(keys: readonly string[], dx: number, dy: number): Recipe | null` (`flow/commands.ts`)

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
import { produce } from "immer"
import { describe, expect, it } from "vitest"
import type { DevDocument } from "@/model/document"
import { createFlowDocument, type FlowDiagram, type FlowModel } from "@/model/flow/schema"
import { addFlowNode, addLane, moveFlowNodes } from "./commands"

/** Due corsie: `l1` da 0 a 100, `l2` da 100 a 200. Bande scritte a mano, non calcolate. */
function dueCorsie(): { doc: DevDocument; l1: string; l2: string } {
  const base = createFlowDocument("test", "id-1")
  const l1 = base.diagram.model.lanes[0]!.id
  const doc = produce(base, (d) => {
    const f = d.diagram as FlowDiagram
    f.model.lanes.push({ id: "l2", name: "Seconda" })
    f.view.lanes = { [l1]: { y: 0, h: 100 }, l2: { y: 100, h: 100 } }
  })
  return { doc, l1, l2: "l2" }
}

const flow = (doc: DevDocument): FlowDiagram => {
  if (doc.diagram.type !== "flow") throw new Error("tipo sbagliato")
  return doc.diagram
}

describe("moveFlowNodes", () => {
  it("un nodo trascinato in un'altra banda cambia corsia", () => {
    const { doc, l1, l2 } = dueCorsie()
    const n = addFlowNode({ x: 0, y: 20 }, "process", l1)
    const conNodo = produce(doc, n.recipe)
    const next = produce(conNodo, moveFlowNodes([n.key], 0, 100)!)
    expect(flow(next).model.nodes[n.key]!.lane).toBe(l2)
    expect(flow(next).view.nodes[n.key]!.y).toBe(120)
  })

  it("un nodo lasciato fuori da ogni banda resta nella sua corsia e ci rientra", () => {
    const { doc, l1 } = dueCorsie()
    const n = addFlowNode({ x: 0, y: 20 }, "process", l1)
    const conNodo = produce(doc, n.recipe)
    const next = produce(conNodo, moveFlowNodes([n.key], 0, -500)!)
    expect(flow(next).model.nodes[n.key]!.lane).toBe(l1)
    const y = flow(next).view.nodes[n.key]!.y
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThan(100)
  })

  it("trascinando più nodi insieme, ognuno prende la corsia dove cade lui", () => {
    const { doc, l1, l2 } = dueCorsie()
    const a = addFlowNode({ x: 0, y: 20 }, "process", l1)
    const b = addFlowNode({ x: 0, y: 60 }, "process", l1)
    const conNodi = produce(produce(doc, a.recipe), b.recipe)
    // +50: `a` da 20 a 70 resta in l1, `b` da 60 a 110 passa in l2.
    const next = produce(conNodi, moveFlowNodes([a.key, b.key], 0, 50)!)
    expect(flow(next).model.nodes[a.key]!.lane).toBe(l1)
    expect(flow(next).model.nodes[b.key]!.lane).toBe(l2)
  })

  it("un trascinamento che non muove né posizione né corsia non lascia una voce di undo", () => {
    const { doc, l1 } = dueCorsie()
    const n = addFlowNode({ x: 0, y: 20 }, "process", l1)
    const conNodo = produce(doc, n.recipe)
    expect(moveFlowNodes([n.key], 0, 0)).toBeNull()
  })
})
```

Il quinto test — «posizione e corsia sono **un solo** passo di undo» — non si scrive qui: `moveFlowNodes` torna una `Recipe`, e che una recipe sia un passo solo è una proprietà di `documentStore.dispatch`, non di questo modulo. Va nello scenario e2e del Task 13, dove il ⌘Z è vero.

Scrivi questi quattro test per intero- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/editor/flow/commands.test.ts`
Expected: FAIL — `moveFlowNodes` non esiste.

- [ ] **Step 3: Scrivi `moveFlowNodes`**

Regole, nell'ordine:

1. sposta le posizioni come fa `moveNodes`, con `snap`;
2. per ogni nodo mosso, calcola il **centro** del suo rettangolo dopo lo spostamento e chiedi `laneAt`;
3. se torna una corsia diversa, scrivila in `model.nodes[key].lane`;
4. se torna `null` — il nodo è caduto fuori da ogni banda — **lascia la corsia di partenza** e riporta la `y` dentro quella banda, agganciandola al bordo più vicino meno un margine. Nessun nodo senza corsia è l'invariante del modello, non un caso da sistemare a valle;
5. se nessuna posizione e nessuna corsia cambia davvero, torna `null`: un drag che non muove niente non deve lasciare una voce di undo.

- [ ] **Step 4: Collega il runner**

In `src/ui/canvas/interaction-runner.ts`:

```ts
      case "commit-drag": {
        const ops = opsFor(documentStore.getState().doc)
        const recipe = ops.commitDrag ? ops.commitDrag(fx.keys, fx.dx, fx.dy) : moveNodes(fx.keys, fx.dx, fx.dy)
        if (recipe) documentStore.getState().dispatch(recipe)
        break
      }
```

Nient'altro cambia: `preview-drag` resta identico, quindi **durante** il gesto non si tocca né lo store né il modello, ed è la ragione per cui il gate di prestazione non ha motivo di muoversi.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `pnpm vitest run src/editor/flow`
Expected: PASS

- [ ] **Step 6: Verifica a mano il gesto, poi committa**

`pnpm dev`: trascina un nodo da una corsia all'altra, controlla che il pannello mostri la corsia nuova, premi ⌘Z una volta sola e verifica che torni **posizione e corsia insieme**.

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): trascinare un nodo in un'altra corsia gli cambia l'attore

Durante il gesto non cambia niente nel modello: il nodo si sposta sul DOM
come per ogni altro tipo di diagramma. Solo al rilascio, dove la posizione
si commetteva già, si guarda in quale banda è caduto il centro e si scrive
posizione e corsia nella stessa recipe — un solo passo di undo.

Un nodo lasciato fuori da ogni banda resta nella sua corsia e ci rientra:
nessun nodo senza corsia è un invariante, non un caso da gestire a valle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: Validazione live

**Files:**
- Create: `src/model/flow/validate.ts`, `src/model/flow/validate.test.ts`
- Modify: `src/model/issue.ts`, `src/editor/kinds/flow.ts`

**Interfaces:**
- Produces: `validateFlow(model: FlowModel): Issue[]`; sei nuovi `IssueCode`

- [ ] **Step 1: Scrivi i test che falliscono**

Un helper e i quattro casi che si sbagliano; gli altri sono la stessa forma con un codice diverso.

```ts
import { describe, expect, it } from "vitest"
import type { FlowModel, FlowShape } from "@/model/flow/schema"
import { validateFlow } from "./validate"

const lane = { id: "l1", name: "a" }
const n = (shape: FlowShape) => ({ label: "x", shape, lane: "l1" })
const e = (source: string, target: string, label = "") => ({ source, target, label })

const model = (over: Partial<FlowModel>): FlowModel => ({ lanes: [lane], nodes: {}, edges: {}, ...over })

/** terminale → processo → terminale: il flusso minimo che non deve produrre niente. */
const sano = model({
  nodes: { s: n("terminal"), p: n("process"), t: n("terminal") },
  edges: { e1: e("s", "p"), e2: e("p", "t") },
})

describe("validateFlow", () => {
  it("un modello corretto non ha issue", () => {
    expect(validateFlow(sano)).toEqual([])
  })

  it("senza nessun terminale tace sulla raggiungibilità invece di gridare su ogni nodo", () => {
    const m = model({ nodes: { a: n("process"), b: n("process") }, edges: { e1: e("a", "b") } })
    const issues = validateFlow(m)
    expect(issues.filter((i) => i.code === "flow-unreachable")).toEqual([])
    expect(issues).toContainEqual(expect.objectContaining({ code: "flow-no-terminal", severity: "warning" }))
  })

  it("un terminale senza uscite è la fine del flusso, non un vicolo cieco", () => {
    expect(validateFlow(sano).filter((i) => i.code === "flow-dead-end")).toEqual([])
  })

  it("una nota non partecipa al flusso: né irraggiungibile né senza uscite", () => {
    const m = model({
      nodes: { s: sano.nodes.s!, p: sano.nodes.p!, t: sano.nodes.t!, nota: n("note") },
      edges: sano.edges,
    })
    const issues = validateFlow(m)
    expect(issues.filter((i) => i.node === "nota")).toEqual([])
  })
})
```

Gli altri casi, stessa forma, con l'esito esatto atteso:

| modello | issue attesa |
|---|---|
| `edges: { e1: e("s", "fantasma") }` | `flow-dangling-edge`, `error` |
| decisione con **una** sola uscita | `flow-decision-arity`, `error` |
| decisione con **due** uscite | nessuna issue di arità |
| processo senza archi in uscita | `flow-dead-end`, `warning` |
| due nodi collegati fra loro ma non raggiungibili dal terminale | `flow-unreachable`, `warning`, uno per nodo |
| arco in uscita da una decisione con `label: ""` | `flow-branch-unlabeled`, `warning` |
| arco con `label: ""` che **non** esce da una decisione | nessuna issue |



- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/model/flow/validate.test.ts`
Expected: FAIL — modulo assente.

- [ ] **Step 3: Aggiungi i codici e scrivi le regole**

In `src/model/issue.ts` aggiungi alla union: `"flow-dangling-edge" | "flow-decision-arity" | "flow-dead-end" | "flow-unreachable" | "flow-branch-unlabeled" | "flow-no-terminal"`.

`validateFlow` fa una visita sola del grafo, O(n+e). Gli **ingressi** sono i nodi `terminal` senza archi entranti; `flow-unreachable` parte da lì, e quando non ce ne sono **non emette nulla** — esce solo `flow-no-terminal`. Una regola tace quando la sua premessa manca, invece di gridare su tutto: è l'errore che `fk-without-relationship` ha già fatto una volta (DT-20).

I nodi `note` sono fuori da ogni regola di raggiungibilità e di uscita: una nota non partecipa al flusso.

- [ ] **Step 4: Collega `validate` in `kinds/flow.ts` ed esegui**

Run: `pnpm vitest run src/model/flow`
Expected: PASS

- [ ] **Step 5: Committa**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): le sei regole di validazione

Senza nessun terminale la regola sulla raggiungibilità tace invece di
segnalare ogni nodo: la sua premessa è che esista un ingresso, e senza
premessa il messaggio giusto è l'altro. Stessa lezione di DT-20.

Non c'è nessuna regola per «nodo senza corsia»: è un invariante del modello,
e un invariante che regge vale più di una regola che avvisa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: Export Mermaid

**Files:**
- Create: `src/io/emit/flow-mermaid.ts`, `src/io/emit/flow-mermaid.test.ts`
- Modify: `src/ui/canvas/kinds/registry.ts` (`TextFormat`), `src/ui/canvas/kinds/flow.tsx` (`textFormats`), `src/ui/export/TextExportDialog.tsx`

**Interfaces:**
- Consumes: `EmitResult` da `src/io/emit/result.ts`
- Produces: `emitFlowMermaid(model: FlowModel): EmitResult`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
it("l'etichetta va sempre fra virgolette, e le parentesi quadre non rompono l'uscita", () => {
  const m = model({ nodes: { a: { label: "array[0]", shape: "process", lane: "l1" } }, edges: {} })
  expect(emitFlowMermaid(m).text).toContain('n1["array[0]"]')
})

it("gli a capo diventano <br/>, non restano a capo dentro le virgolette", () => {
  const m = model({ nodes: { a: { label: "prima\nseconda", shape: "process", lane: "l1" } }, edges: {} })
  expect(emitFlowMermaid(m).text).toContain('n1["prima<br/>seconda"]')
  expect(emitFlowMermaid(m).text).not.toContain('"prima\nseconda"')
})

it("gli id sono n1..nN e non gli uuid del modello", () => {
  const m = model({ nodes: { "0f9e-uuid-lungo": { label: "x", shape: "process", lane: "l1" } }, edges: {} })
  const { text } = emitFlowMermaid(m)
  expect(text).toContain("n1[")
  expect(text).not.toContain("0f9e-uuid-lungo")
})

it("le note non escono, e l'avviso dice quante — una volta sola, non una per nota", () => {
  const m = model({
    nodes: { a: { label: "x", shape: "process", lane: "l1" }, n1: { label: "nota", shape: "note", lane: "l1" }, n2: { label: "altra", shape: "note", lane: "l1" } },
    edges: {},
  })
  const { text, warnings } = emitFlowMermaid(m)
  expect(text).not.toContain("nota")
  expect(warnings.filter((w) => w.includes("nota") || w.includes("note"))).toHaveLength(1)
  expect(warnings.join(" ")).toContain("2")
})
```

Gli altri casi, stessa forma, con l'uscita esatta attesa:

| caso | uscita |
|---|---|
| apertura | prima riga `flowchart LR` |
| due corsie | due `subgraph`, nell'ordine di `model.lanes` |
| `process` / `decision` / `terminal` / `io` / `subprocess` | `n1["…"]` · `n1{"…"}` · `n1(["…"])` · `n1[/"…"/]` · `n1[["…"]]` |
| arco con etichetta `sì` | `n1 -->|"sì"| n2` |
| arco senza etichetta | `n1 --> n2`, senza pipe vuote |
| almeno una `subgraph` | un avviso sulle corsie, sempre |
| modello vuoto | documento valido, `warnings` vuoto

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/io/emit/flow-mermaid.test.ts`
Expected: FAIL — modulo assente.

- [ ] **Step 3: Scrivi l'emettitore**

Sulla forma di `emitClassMermaid`. Gli avvisi vanno in `EmitResult.warnings`, aggregati e con il **numero**, non uno per occorrenza — è la lezione di DT-27: il riepilogo parla all'utente, non al programmatore.

- [ ] **Step 4: Elenca il formato ed esegui**

`TextFormat` guadagna `"flow-mermaid"`, `flowView.textFormats` diventa `["flow-mermaid"]`, e `TextExportDialog` impara l'etichetta «Mermaid flowchart».

Run: `pnpm lint && pnpm test`

- [ ] **Step 5: Committa**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): export Mermaid flowchart LR, con una subgraph per corsia

Le note non escono: in Mermaid entrerebbero nel flusso come nodi qualunque
e ne sposterebbero il layout, cioè mentirebbero sul disegno. L'avviso dice
quante sono rimaste fuori.

Gli id si rigenerano come n1..nN: il modello usa id generati, e un uuid
dentro un Mermaid lo rende illeggibile a chi lo apre in una PR.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 11: Le bande nell'export immagini

**Files:**
- Modify: `src/ui/export/svg.tsx`
- Test: `src/ui/export/svg.test.ts`

**Interfaces:**
- Consumes: `buildSvg(diagram: Diagram, opts: BuildSvgOptions): string | null` — firma invariata

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
it("l'SVG di un flowchart contiene le bande delle corsie e il loro nome", () => {
  const svg = buildSvg(flowDiagramWithTwoLanes, { vars: VARS, fontFace: "" })!
  expect(svg).toContain('data-layer="lanes"')
  expect(svg).toContain("Cliente")
})

it("le bande stanno prima dei nodi nel documento, così restano sotto", () => {
  const svg = buildSvg(flowDiagramWithTwoLanes, { vars: VARS, fontFace: "" })!
  expect(svg.indexOf('data-layer="lanes"')).toBeLessThan(svg.indexOf('data-layer="nodes"'))
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm vitest run src/ui/export/svg.test.ts`
Expected: FAIL — nessun layer `lanes` nell'uscita.

- [ ] **Step 3: Disegna le bande in `buildSvg`**

`buildSvg` riceve il `Diagram` intero, quindi le bande le ha già in `view.lanes`: **va aggiunto il disegno, non il passaggio dei dati.** Riusa il componente `LanesLayer` in versione pura (guidata dalle prop, senza store), come `NodeView` ed `EdgeView` sono già la versione pura dei loro layer — è la ragione per cui quella divisione esiste.

I limiti del disegno vanno allargati alle bande: una corsia più alta dei suoi nodi, o vuota, non deve uscire tagliata.

- [ ] **Step 4: Esegui, guarda il file, committa**

Run: `pnpm vitest run src/ui/export && pnpm lint`

Poi a mano: esporta un SVG e un PNG di un flowchart con due corsie, **con il tema scuro attivo**, e verifica che escano in chiaro con le bande al posto giusto.

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): le bande escono anche nell'export immagini

buildSvg gira dentro renderToStaticMarkup e uno store non ce l'ha, ma il
Diagram lo riceve intero: le bande erano già lì, mancava il disegno.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 12: L'ultimo miglio della UI

Il pannello, il menu, le scorciatoie, e i `case "flow"` provvisori del Task 2 che diventano veri. Alla fine di questo task `pnpm build` non ha più nessuno stub.

**Files:**
- Create: `src/ui/panels/FlowProperties.tsx`
- Modify: `src/ui/DocumentMenu.tsx`, `src/ui/panels/PropertiesPanel.tsx`, `src/io/document-io.ts` (`hasContent`), `src/ui/export/actions.ts` (`hasNodes`), `src/ui/canvas/kinds/flow.tsx`

- [ ] **Step 1: Togli gli stub e fatti dire dal compilatore cosa manca**

Rimuovi i `throw new Error("flowchart: non ancora implementato")` lasciati nel Task 2.

Run: `pnpm build`
Expected: FAIL con l'elenco esatto dei punti ancora scoperti. È la lista di questo task.

- [ ] **Step 2: Riempi i due predicati**

```ts
// src/io/document-io.ts e src/ui/export/actions.ts, stessa forma nei due
    case "flow":
      return Object.keys(doc.diagram.model.nodes).length > 0
```

- [ ] **Step 3: Aggiungi la voce di menu**

In `src/ui/DocumentMenu.tsx`, dentro `Nuovo`:

```tsx
              <DropdownMenuItem onSelect={() => void documentIo.newDocument("flow")}><Workflow /> Flowchart</DropdownMenuItem>
```

- [ ] **Step 4: Scrivi `FlowProperties`**

Tre sezioni, sulla forma di `ClassProperties.tsx`:

- **nodo selezionato**: etichetta (`CommitInput`), forma (select sulle sei), corsia (select sulle corsie esistenti — cambiarla da qui è l'alternativa da tastiera al trascinamento);
- **arco selezionato**: etichetta;
- **nessuna selezione**: l'elenco delle corsie con rinomina, aggiungi, elimina e due frecce per l'ordine. L'eliminazione dell'ultima corsia è disabilitata, e quella di una corsia con dentro dei nodi chiede in quale spostarli.

- [ ] **Step 5: Verifica che le scorciatoie numeriche funzionino**

`1`..`6` cambiano strumento, `R` mette l'arco, `V` torna alla selezione. La ricerca nella lista scritta nel Task 1 le copre già: qui si verifica soltanto, e si aggiunge la riga alla tabella del README.

Verifica anche che **premere `1` mentre si scrive in un'etichetta non cambi strumento**: la guardia `inTextInput` esiste già e questo è il caso che la mette alla prova come nessun tipo faceva prima, perché le lettere non si digitano tanto quanto i numeri.

- [ ] **Step 6: Verifica tutto e committa**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: verde, e **nessuno stub rimasto**.

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(flow): pannello, menu e scorciatoie

Le sei forme prendono i tasti 1..6: sette strumenti sono troppi per le
lettere ancora libere, e i numeri vanno al tipo che ne ha molti mentre le
lettere restano a quelli che ne hanno pochi.

La corsia si cambia anche dal pannello, non solo trascinando: è
l'alternativa da tastiera allo stesso dato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 13: Collaudo in un browser vero, misura, documentazione

L'ottavo scenario e2e, la rimisura del gate contro la baseline, e i documenti che questa consegna deve lasciare dietro di sé.

**Files:**
- Create: `scripts/e2e/flow.mjs`
- Modify: `scripts/e2e/run.mjs`, `src/perf/stress.ts`, `README.md`, `docs/debito-tecnico.md`

- [ ] **Step 1: Scrivi l'ottavo scenario**

Crea `scripts/e2e/flow.mjs` sulla forma di `scripts/e2e/class.mjs`, con questi passi in quest'ordine:

1. «Nuovo ▸ Flowchart»: il canvas è vuoto e c'è una corsia sola;
2. aggiungi una seconda corsia dal pannello;
3. tre nodi di forme diverse — un terminale e un processo nella prima corsia, una decisione nella seconda;
4. collega due nodi e scrivi l'etichetta sull'arco col doppio click;
5. **«Disponi»**: ogni nodo sta dentro la banda della sua corsia, e nessuna coppia di nodi si sovrappone. *È l'unico passo che prova che elkjs si carica davvero: i test unitari usano un worker finto, quindi un bundle che non si risolve passerebbe tutta la suite e fallirebbe solo qui;*
6. trascina un nodo nell'altra corsia con eventi veri e verifica che ci resti;
7. **un solo ⌘Z**: il nodo torna nella corsia di prima *e* dov'era. È il passo che vale più di tutti — prova che posizione e corsia sono un passo unico;
8. «Esporta testo…»: nell'uscita compaiono `subgraph`, un rombo `{"…"}` e l'etichetta sull'arco.

Registra lo scenario in `scripts/e2e/run.mjs`, in coda alla sequenza. **Mai in parallelo**: la persistenza tocca il lock fra schede e IndexedDB sulla stessa origine.

- [ ] **Step 2: Esegui l'e2e**

Run: `pnpm e2e`
Expected: otto scenari su otto PASS, exit 0.

- [ ] **Step 3: Estendi il generatore sintetico**

In `src/perf/stress.ts`, aggiungi la generazione di un flowchart di N nodi distribuiti su 4 corsie, con archi che seguono il flusso e qualche ciclo all'indietro — un flowchart senza cicli non è un flowchart, e i cicli sono il caso che il router paga.

Senza questo passo il gate misurerebbe il flowchart con un documento ER.

- [ ] **Step 4: Rimisura il gate**

Run: `pnpm perf`
Expected: sei scenari su sei PASS. **Confronta con la baseline del 2026-09-22 (p95 peggiore 9,3 ms), che sta in `docs/perf/`.**

Se un p95 è peggiorato in modo visibile, il sospetto numero uno è il **layer delle bande**, che è disegno in più sotto ogni frame: verifica con il profiler che non si ridisegni durante il trascinamento di un nodo. Scrivi la misura in `docs/perf/2026-09-XX-<esito>.md` come è stato fatto per le due precedenti, **anche se è verde**: una misura non scritta è una misura persa, ed è esattamente ciò che DT-14 insegna.

- [ ] **Step 5: Aggiorna il README**

- «Cosa fa» guadagna il flowchart accanto a ER e class;
- la tabella delle scorciatoie guadagna la riga `1`..`6`;
- «Limiti noti» guadagna i cinque della spec §16, ciascuno con la sua ragione;
- «Test end-to-end» passa da sette a otto scenari, con la descrizione del nuovo;
- lo stack cita che il flowchart dispone con `direction: RIGHT` (ADR 0007).

- [ ] **Step 6: Aggiorna il debito tecnico**

In `docs/debito-tecnico.md`, sezione **Archivio**, una voce per ogni semplificazione accettata in questa consegna, ciascuna con il motivo del rinvio e il costo-se-sbagliato:

- gli archi all'indietro passano sopra i nodi (il router non evita gli ostacoli);
- gli incroci sull'asse trasversale aumentano rispetto a un layout senza corsie;
- le corsie non si ridimensionano né si riordinano per trascinamento;
- il caso ancora scoperto delle etichette: archi non in fascio che passano vicini per caso.

E la regola del registro, che vale durante questo piano e non alla sua fine: **un rilievo che si decide di non correggere si scrive nello stesso momento in cui si decide.**

- [ ] **Step 7: Verifica finale e commit**

Run: `pnpm lint && pnpm test && pnpm build && pnpm e2e`

```bash
git add -A
git commit -m "$(cat <<'MSG'
test(flow): l'ottavo scenario e2e, la misura e i documenti

Lo scenario prova le tre cose che senza un browser vero non esistono: che
elkjs si carichi davvero (il worker finto dei test unitari passerebbe anche
con un bundle che non si risolve), il trascinamento fra corsie con eventi
veri, e la subgraph nell'export.

Il passo che vale più di tutti è un solo ⌘Z dopo il trascinamento: prova che
posizione e corsia sono un passo unico e non due.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Ordine, e cosa si può fare in parallelo

I task 1-5 sono una catena: ognuno consuma il precedente. Dal 6 in poi si apre:

- **6 (geometria)** e **9 (validazione)** non si toccano: il primo lavora su misure, il secondo sul grafo.
- **10 (Mermaid)** dipende solo dal modello (Task 2): si può fare in qualunque momento dopo di quello.
- **7 (canvas)** ha bisogno di 6; **8 (drag)** ha bisogno di 6 e 7; **11 (export immagini)** ha bisogno di 7.
- **12** chiude tutti i `case` rimasti e va per ultimo prima del 13.

Il **Task 5** è quello da non affrettare: è il cuore, ed è l'unico interamente provabile a tavolino. Se una cosa sola di questo piano merita un giro di revisione in più, è quella.
