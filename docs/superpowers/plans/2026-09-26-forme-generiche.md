# Le forme generiche (step 3b) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una quinta famiglia `shape` con rettangolo, ellisse, testo e freccia: una lavagna libera accanto alle famiglie tipizzate, sotto tutto nei layer, con misura dal testo allargabile a mano.

**Architecture:** `FAMILIES` diventa `["shape", "er", "class", "flow", "note"]` e il documento guadagna `diagram.shape = { model: { shapes, arrows }, view: { nodes } }`. Una forma è `{ kind, label }` con una view `{ x, y, collapsed, w, h }`; una freccia è un arco della famiglia `{ source, target, head, dashed }`. Il resto viene dall'impianto a famiglie: `shapeOps` (`DiagramOps`) per comandi e geometria, `shapeView` (`DiagramView`) per React, con un flag nuovo `backdrop` che fa disegnare i nodi della famiglia sotto pool e archi, nel canvas e nell'SVG.

**Tech Stack:** React 19 + TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedLocals`), zustand (vanilla store), Immer (recipe con patch), zod 4, Vitest, e2e con Playwright su `vite preview` (`pnpm e2e`).

**Spec:** `docs/superpowers/specs/2026-09-26-forme-generiche-design.md`

## Scostamenti dalla spec, decisi scrivendo il piano

1. **Le forme stanno sotto anche ai pool e agli archi**, non solo sotto i nodi delle altre famiglie. Il canvas disegna tutti gli archi prima di tutti i nodi: con le forme nel solo ordine di `FAMILIES`, una zona coprirebbe le relazioni e gli archi fra i nodi che racchiude. La spec è già corretta in questo senso (§3 e §12), nello stesso commit del piano. Il meccanismo è `DiagramView.backdrop`.
2. **Il segnaposto di un testo vuoto conta nella misura.** Un testo vuoto misura quanto la parola «Testo»: senza, sarebbe un rettangolo di zero caratteri, difficile da afferrare. L'export lo salta con `DiagramView.hiddenInExport`, e i suoi limiti non lo contano.
3. **Una misura scelta che non supera quella del testo si scrive `null`.** Trascinare la maniglia fino alla misura del testo riporta la forma alla misura automatica: poi cresce e cala col testo, come una forma appena creata. La spec dice «non scende mai sotto la misura del testo», e questo resta vero.
4. **Fra il Task 1 e il Task 2 le frecce esistono solo nel modello.** Il Task 1 porta lo schema, la validazione, l'eliminazione a cascata e la duplicazione delle frecce, perché appartengono ai comandi delle forme; il gesto, il disegno e il pannello delle frecce arrivano col Task 2. Fra i due, `shapeOps.edgeGeometry` e `shapeOps.addEdge` tornano `null` e la vista della freccia non disegna niente.
5. **`endName` impara le forme**, per il pannello di una nota ancorata a una forma: una forma ha per chiave un uuid, e si mostra col suo testo su una riga.
6. **`NoteTextField` prende un `fieldId`** (predefinito `note-text`), e il pannello della forma lo riusa con `shape-text`: la regola della sola lettura durante l'editing sul canvas ha così un posto solo.

## Global Constraints

- Lingua: commenti, docblock, messaggi e nomi dei test in italiano; identificatori in inglese, come nel codice esistente.
- Nessuna dipendenza nuova.
- `src/model` non importa `src/editor`, `src/io` né `src/ui`. `src/editor` non importa React né `src/io`. Sono regole ESLint già attive.
- Chiavi: famiglie `${family}/${key}` solo con `qualify`/`splitKey` (`src/editor/families.ts`, `src/model/family.ts`). Forme e frecce hanno chiavi uuid; sul canvas `qualify("shape", key)`. Gli estremi di una freccia sono chiavi di forme **senza** prefisso.
- `SCHEMA_VERSION` passa da 7 a 8.
- Testi esatti:
  - Gruppo della sidebar: `Forme`. Strumenti: `Rettangolo` tasto `q`, `Ellisse` tasto `o`, `Testo` tasto `t`.
  - Editor sul canvas: `aria-label="Testo della forma"`. Segnaposto di un testo vuoto: `Testo`.
  - Pannello della forma: campo `Testo` (`id="shape-text"`). Pannello della freccia: select `Punte` (`id="arrow-head"`) con le voci `Nessuna`, `Alla fine`, `Entrambe`; casella `Tratteggiata` (`id="arrow-dashed"`); pulsante `Inverti`.
  - Problema: codice `shape-dangling-arrow`, messaggio `La freccia collega una forma che non c'è.`
  - Nome della famiglia negli avvisi di Collega: `una forma` (avviso completo: `Non esiste un collegamento fra una forma e un'entità.`).
  - Export testuale: con formati disponibili, la riga `Le forme escono solo come immagine (SVG o PNG).`; senza formati, il paragrafo `Le forme escono solo come immagine: usa l'export SVG o PNG.`
  - Nome di una forma nei pannelli (`endName`): il testo su una riga, `(senza testo)` se vuoto, `(forma eliminata)` se non c'è.
- Ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Messaggi in stile repo: `feat(ambito): …` in italiano.
- Verifiche a fine task: `pnpm tsc -b`, `pnpm lint`, `pnpm test` verdi e senza warning. `pnpm e2e` solo nel Task 4.
- **Non lanciare `pnpm perf`.**
- I dump reali `spike/fixtures/postgres.sql` e `mysql.sql` non compaiono mai in un test.

## Review Focus

Casi che la spec implica ma che i suoi test non nominano. Per ciascuno il test sta nel task che possiede il codice:

1. **Un testo lasciato vuoto.** Resta afferrabile sul canvas (misura del segnaposto) e non esce nell'SVG, né ne allarga i limiti. → Task 1, test di geometria e di `buildSvg`.
2. **Eliminare una forma che ha frecce e una nota ancorata, poi annullare.** Un solo ⌘Z riporta la forma, le frecce e l'àncora. → Task 1, test di `canvasOps.deleteItems` con `undo`.
3. **Duplicare una forma collegata a una forma non duplicata.** La freccia verso l'esterno non si copia; quella fra due forme copiate sì, sulle copie. → Task 1, test di `duplicateShapes`.
4. **Un file scritto a mano con una freccia verso una forma che non c'è.** Si apre, la validazione lo segnala, la freccia non si disegna e l'export non esplode. → Task 2, test di `buildSvg`.
5. **Ridimensionare e poi riportare la maniglia fino al testo.** La forma torna alla misura automatica (`w`/`h` a `null`) e poi segue il testo; un ridimensionamento è un solo passo di annulla. → Task 3, test di `shapeOps.resize`.

---

### Task 1: La famiglia delle forme

Il task aggiunge la quinta famiglia con le tre forme: modello, migrazione, validazione, comandi, disegno sotto tutto, editor del testo, pannello, SVG ed export testuale. Le frecce esistono già nel modello (schema, validazione, eliminazione a cascata, duplicazione), ma il gesto e il disegno arrivano col Task 2 (scostamento 4).

**Files:**
- Create: `src/model/shape/schema.ts`, `src/model/shape/schema.test.ts`
- Create: `src/model/shape/validate.ts`, `src/model/shape/validate.test.ts`
- Modify: `src/model/family.ts`, `src/model/document.ts`, `src/model/shared.ts`, `src/model/issue.ts`
- Modify: `src/model/migrations.ts`, `src/model/migrations.test.ts`
- Modify: `src/model/note/validate.ts`, `src/model/note/validate.test.ts`
- Modify: `src/model/links/validate.ts`, `src/model/links/labels.ts`, `src/model/links/labels.test.ts`
- Create: `src/editor/shape-access.ts`
- Create: `src/editor/shape/geometry.ts`, `src/editor/shape/geometry.test.ts`
- Create: `src/editor/shape/commands.ts`, `src/editor/shape/commands.test.ts`
- Create: `src/editor/kinds/shape.ts`
- Modify: `src/editor/kinds/ops.ts`, `src/editor/kinds/canvas-ops.test.ts`
- Modify: `src/editor/links/commands.ts`
- Create: `src/ui/canvas/Shape.tsx`, `src/ui/canvas/Shape.test.tsx`, `src/ui/canvas/ShapeEditor.tsx`
- Create: `src/ui/canvas/kinds/shape.tsx`
- Create: `src/ui/panels/ShapeProperties.tsx`
- Modify: `src/ui/canvas/kinds/registry.ts`, `src/ui/canvas/kinds/registry.test.ts`
- Modify: `src/ui/canvas/Canvas.tsx`, `src/ui/canvas/InlineEditor.tsx`, `src/ui/canvas/use-canvas-interaction.ts`
- Modify: `src/ui/panels/NoteProperties.tsx`
- Modify: `src/ui/export/svg.tsx`, `src/ui/export/svg.test.ts`, `src/ui/export/TextExportDialog.tsx`, `src/ui/export/TextExportDialog.test.tsx`
- Modify: `src/ui/use-keyboard-shortcuts.ts` (solo il docblock)
- Modify (solo asserzioni): ogni test che fissa la versione 7 (`grep -rn "toBe(7)" src`) e ogni test che elenca le famiglie di un documento nuovo (`tsc -b` e `pnpm test` li elencano).

**Interfaces:**
- Produces:
  - Da `@/model/shape/schema`: `ShapeKindSchema`, `type ShapeKind = "rect" | "ellipse" | "text"`, `ShapeSchema`, `type Shape = { kind: ShapeKind; label: string }`, `ArrowHeadSchema`, `type ArrowHead = "none" | "end" | "both"`, `ArrowSchema`, `type Arrow = { source: string; target: string; head: ArrowHead; dashed: boolean }`, `ShapeViewSchema`, `type ShapeView = NodeView & { w: number | null; h: number | null }`, `ShapeModelSchema`, `type ShapeModel = { shapes: Record<string, Shape>; arrows: Record<string, Arrow> }`, `ShapeDiagramSchema`, `type ShapeDiagram`, `emptyShapeDiagram(): ShapeDiagram`.
  - Da `@/model/shape/validate`: `validateShapes(model: ShapeModel): Issue[]`.
  - `FAMILIES = ["shape", "er", "class", "flow", "note"]`; `DiagramSchema` ha `shape`; `SCHEMA_VERSION = 8`; `IssueCode` ha `"shape-dangling-arrow"`.
  - Da `@/editor/shape-access`: `shapeDiagram(doc: DevDocument): ShapeDiagram`.
  - Da `@/editor/shape/geometry`: `TEXT_PLACEHOLDER`, `shapeText(shape): string`, `shapeTextSize(shape: Pick<Shape, "kind" | "label">): Size`, `shapeSize(shape: Pick<Shape, "kind" | "label">, view: Pick<ShapeView, "w" | "h">): Size`, `shapeRect(shape, view: ShapeView): Rect`, `shapeDrawOrder(d: ShapeDiagram): string[]`.
  - Da `@/editor/shape/commands`: `addShape(at: Point, kind: ShapeKind): { key; recipe }`, `setShapeLabel(key, label): Recipe`, `deleteShapeItems(nodeKeys, edgeKeys): Recipe | null`, `duplicateShapes(model: ShapeModel, keys): { keys: string[]; recipe: Recipe }`, `shapeLayoutGraph(d: ShapeDiagram): LayoutGraph`.
  - Da `@/editor/kinds/shape`: `shapeOps(doc): DiagramOps`.
  - `DiagramView` (`@/ui/canvas/kinds/registry`) guadagna `backdrop?: boolean` e `hiddenInExport?: (node: unknown) => boolean`.
  - Da `@/ui/canvas/Shape`: `ShapeNodeView({ id, shape, view, selected })` (`id` con prefisso), `ShapeNode({ nodeKey })`.
  - Da `@/ui/canvas/kinds/shape`: `shapeView: DiagramView`.
  - Da `@/ui/panels/ShapeProperties`: `ShapeProperties()`.
  - `NoteTextField({ id, text, onCommit, fieldId? })` in `@/ui/panels/NoteProperties`.

- [ ] **Step 1: Il modello della famiglia**

`src/model/family.ts`: `FAMILIES` diventa

```ts
export const FAMILIES = ["shape", "er", "class", "flow", "note"] as const
```

Nel docblock di `qualify` l'elenco degli esempi diventa `` `shape/…`, `er/utenti`, `class/Ordine`, `flow/n3`, `note/…` ``.

Crea `src/model/shape/schema.ts`:

```ts
import * as z from "zod"
import { Identifier, NodeViewSchema } from "../shared"

/** Le tre forme (spec 3b §3). `kind` non cambia dopo la creazione. */
export const ShapeKindSchema = z.enum(["rect", "ellipse", "text"])
export type ShapeKind = z.infer<typeof ShapeKindSchema>

/** Una forma: un tipo e un'etichetta, anche su più righe. Nessuna semantica, nessuna validazione di dominio. */
export const ShapeSchema = z.object({ kind: ShapeKindSchema, label: z.string() })
export type Shape = z.infer<typeof ShapeSchema>

/** Dove una freccia ha la punta: in nessun capo, alla fine (`target`), o a entrambi. */
export const ArrowHeadSchema = z.enum(["none", "end", "both"])
export type ArrowHead = z.infer<typeof ArrowHeadSchema>

/**
 * Una freccia fra due forme (spec 3b §3): gli estremi sono chiavi di forme **senza** prefisso, perché
 * gli archi stanno dentro la famiglia. Lo schema rifiuta una freccia da una forma verso sé stessa, e
 * **non** controlla che le forme esistano: una freccia pendente è un problema di validazione
 * (`shape-dangling-arrow`), non un file illeggibile.
 */
export const ArrowSchema = z
  .object({ source: Identifier, target: Identifier, head: ArrowHeadSchema, dashed: z.boolean() })
  .refine((a) => a.source !== a.target, { message: "una freccia non collega una forma a sé stessa" })
export type Arrow = z.infer<typeof ArrowSchema>

/** Un lato scelto a mano: positivo, o `null` finché la forma segue la misura del testo. */
const ChosenSide = z.number().positive().nullable()

/**
 * La view di una forma: la `NodeViewSchema` comune più la misura minima scelta a mano (spec 3b §3).
 * `collapsed` a una forma non si applica e resta `false`. Chi legge solo `x`/`y` (spostamento,
 * Disponi, export) la tratta come la view di ogni altra famiglia.
 */
export const ShapeViewSchema = NodeViewSchema.extend({ w: ChosenSide, h: ChosenSide })
export type ShapeView = z.infer<typeof ShapeViewSchema>

/** Chiavi = uuid, per le forme e per le frecce: l'etichetta cambia a ogni battitura. */
export const ShapeModelSchema = z.object({
  shapes: z.record(z.string(), ShapeSchema),
  arrows: z.record(z.string(), ArrowSchema),
})
export type ShapeModel = z.infer<typeof ShapeModelSchema>

export const ShapeDiagramSchema = z.object({
  model: ShapeModelSchema,
  view: z.object({ nodes: z.record(z.string(), ShapeViewSchema) }),
})
export type ShapeDiagram = z.infer<typeof ShapeDiagramSchema>

/** Una parte di forme vuota: la forma di una famiglia senza elementi. */
export function emptyShapeDiagram(): ShapeDiagram {
  return { model: { shapes: {}, arrows: {} }, view: { nodes: {} } }
}
```

Crea `src/model/shape/validate.ts`:

```ts
import type { Issue } from "../issue"
import type { ShapeModel } from "./schema"

/** I problemi delle forme: solo la freccia pendente (spec 3b §9). `edge` è la chiave della freccia, senza prefisso. */
export function validateShapes(model: ShapeModel): Issue[] {
  return Object.entries(model.arrows).flatMap(([key, arrow]): Issue[] =>
    arrow.source in model.shapes && arrow.target in model.shapes
      ? []
      : [{ code: "shape-dangling-arrow", severity: "error", edge: key, message: "La freccia collega una forma che non c'è." }],
  )
}
```

`src/model/issue.ts`: in fondo all'unione `IssueCode`, dopo `// note` e `"note-dangling-anchor"`:

```ts
  // forme
  | "shape-dangling-arrow"
```

`src/model/shared.ts`: `export const SCHEMA_VERSION = 8`.

`src/model/document.ts`: importa `emptyShapeDiagram, ShapeDiagramSchema` da `./shape/schema`; `DiagramSchema` guadagna `shape: ShapeDiagramSchema,` come **primo** campo (lo stesso ordine di `FAMILIES`); `createDocument` diventa

```ts
/** Il solo modo di creare un documento: cinque famiglie vuote e nessun collegamento. */
export function createDocument(name: string, id: string = crypto.randomUUID()): DevDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: { shape: emptyShapeDiagram(), er: emptyErDiagram(), class: emptyClassDiagram(), flow: emptyFlowDiagram(), note: emptyNoteDiagram(), links: {} },
  }
}
```

- [ ] **Step 2: I test del modello**

Crea `src/model/shape/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ArrowSchema, ShapeDiagramSchema, ShapeSchema, ShapeViewSchema } from "./schema"

const at = (w: number | null = null, h: number | null = null) => ({ x: 0, y: 0, collapsed: false, w, h })

describe("schema delle forme", () => {
  it("accetta forme, view con la misura scelta e frecce", () => {
    const part = {
      model: {
        shapes: { a: { kind: "rect", label: "" }, b: { kind: "ellipse", label: "API" }, c: { kind: "text", label: "titolo" } },
        arrows: { f: { source: "a", target: "b", head: "end", dashed: false } },
      },
      view: { nodes: { a: at(200, null), b: at(), c: at() } },
    }
    expect(ShapeDiagramSchema.safeParse(part).success).toBe(true)
  })

  it("rifiuta una freccia da una forma a sé stessa", () => {
    expect(ArrowSchema.safeParse({ source: "a", target: "a", head: "end", dashed: false }).success).toBe(false)
  })

  it("rifiuta un tipo di forma sconosciuto e una misura scelta non positiva", () => {
    expect(ShapeSchema.safeParse({ kind: "triangle", label: "" }).success).toBe(false)
    expect(ShapeViewSchema.safeParse(at(0, null)).success).toBe(false)
  })
})
```

Crea `src/model/shape/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { validateShapes } from "./validate"

describe("validazione delle forme", () => {
  it("una freccia con un estremo che non c'è è shape-dangling-arrow; le altre no", () => {
    const issues = validateShapes({
      shapes: { a: { kind: "rect", label: "" }, b: { kind: "ellipse", label: "" } },
      arrows: {
        buona: { source: "a", target: "b", head: "end", dashed: false },
        rotta: { source: "a", target: "sparita", head: "end", dashed: false },
      },
    })
    expect(issues).toEqual([{ code: "shape-dangling-arrow", severity: "error", edge: "rotta", message: "La freccia collega una forma che non c'è." }])
  })
})
```

Run: `pnpm vitest run src/model/shape`
Expected: PASS (schema e validazione sono nuovi e completi).

- [ ] **Step 3: La migrazione 7 → 8**

In `src/model/migrations.ts`, dopo `notesIntoFamily` e prima della tabella:

```ts
/**
 * 7 → 8: il documento guadagna la parte delle forme, vuota (spec 3b §4). Il letterale, e non
 * `emptyShapeDiagram()`, per la stessa ragione di `unifyDiagram`: la migrazione descrive il formato
 * della versione 8, e non deve cambiare se in futuro cambia il default di un documento nuovo.
 */
const addShapes: Migration = (raw) => {
  const diagram = raw.diagram
  if (!isObj(diagram)) return raw
  return { ...raw, diagram: { ...diagram, shape: { model: { shapes: {}, arrows: {} }, view: { nodes: {} } } } }
}
```

e nella tabella, dopo `[6, notesIntoFamily],`:

```ts
  [7, addShapes],
```

In `src/model/migrations.test.ts`:
- ogni `expect(….schemaVersion).toBe(7)` diventa `toBe(8)`;
- nell'helper `v6` di `describe("migrazione 6 → 7")`, dopo `delete doc.diagram.note`, aggiungi `delete doc.diagram.shape` (un file v6 non ha la parte delle forme);
- in fondo al file aggiungi:

```ts
describe("migrazione 7 → 8", () => {
  it("un file v7 guadagna la parte delle forme, vuota, e il resto non cambia", () => {
    const nuovo = createDocument("Prova", "v7doc")
    const v7 = JSON.parse(toJson(nuovo)) as { diagram: Record<string, unknown> }
    delete v7.diagram.shape
    const r = parseDocument(JSON.stringify({ ...v7, schemaVersion: 7 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(8)
    expect(r.document.diagram.shape).toEqual({ model: { shapes: {}, arrows: {} }, view: { nodes: {} } })
    expect(r.document.diagram).toEqual(nuovo.diagram)
  })
})
```

`createDocument`, `toJson` e `parseDocument` sono già importati dal file (li usa `describe("migrazione 6 → 7")`); se un import manca, aggiungilo dalla stessa fonte usata lì.

Aggiorna poi le altre asserzioni sulla versione: `grep -rn "toBe(7)" src` elenca quelle rimaste (per esempio in `src/model/class/schema.test.ts`), e il commento sopra ciascuna, se nomina l'ultima migrazione, diventa «la 7 → 8 aggiunge la parte delle forme». I test che confrontano l'elenco delle famiglie di un documento nuovo (per esempio in `src/io/document-io.test.ts`) guadagnano `"shape"` in testa.

Run: `pnpm vitest run src/model`
Expected: PASS.

- [ ] **Step 4: Àncore, estremi e nomi**

`src/model/note/validate.ts`, in `anchorExists`, prima di `case "note":`:

```ts
    case "shape":
      return d.shape.model.shapes[key] !== undefined
```

e nel docblock l'elenco diventa «un'entità, una classe, un nodo di flusso, un pool o una forma (spec 3a §2, spec 3b §3)».

`src/model/note/validate.test.ts`: aggiungi nel `describe` di `anchorExists` (o in fondo, con lo stesso stile dei test vicini):

```ts
  it("un'àncora a una forma esiste finché la forma c'è", () => {
    const doc = createDocument("t", "t")
    doc.diagram.shape.model.shapes["s1"] = { kind: "rect", label: "" }
    expect(anchorExists(doc, "shape/s1")).toBe(true)
    expect(anchorExists(doc, "shape/sparita")).toBe(false)
  })
```

`src/model/links/validate.ts`, in `endExists`, prima di `case "note":`:

```ts
    case "shape":
      return false
```

e il docblock diventa «`true` se l'estremo esiste: un'entità, una classe o un nodo di flusso. Una nota o una forma non sono mai l'estremo di un collegamento.»

`src/model/links/labels.ts`: `endName` diventa

```ts
/** Un'etichetta su una riga, o `empty` se non resta niente. */
function oneLine(label: string, empty: string): string {
  const line = label.replace(/\s+/g, " ").trim()
  return line === "" ? empty : line
}

/**
 * Il nome leggibile di un estremo o di un'àncora, per i messaggi e per i pannelli. Entità e classi
 * hanno per chiave il nome; un nodo di flusso e una forma hanno per chiave un uuid, quindi si mostra
 * la loro etichetta, su una riga; un pool, anche lui con un uuid, si mostra col suo nome.
 */
export function endName(doc: DevDocument, key: string): string {
  const { family, key: bare } = splitKey(key)
  if (family === "shape") {
    const shape = doc.diagram.shape.model.shapes[bare]
    return shape ? oneLine(shape.label, "(senza testo)") : "(forma eliminata)"
  }
  if (family !== "flow") return bare
  const pool = doc.diagram.flow.model.pools[bare]
  if (pool) return pool.name === "" ? "(senza nome)" : pool.name
  const node = doc.diagram.flow.model.nodes[bare]
  if (!node) return "(nodo eliminato)"
  return oneLine(node.label, "(senza etichetta)")
}
```

`src/model/links/labels.test.ts`: aggiungi (importa `createDocument` da `../document` se non c'è già):

```ts
  it("una forma si nomina col suo testo su una riga, o «(senza testo)», o «(forma eliminata)»", () => {
    const doc = createDocument("t", "t")
    doc.diagram.shape.model.shapes["a"] = { kind: "rect", label: "API\nGateway" }
    doc.diagram.shape.model.shapes["b"] = { kind: "text", label: "" }
    expect(endName(doc, "shape/a")).toBe("API Gateway")
    expect(endName(doc, "shape/b")).toBe("(senza testo)")
    expect(endName(doc, "shape/x")).toBe("(forma eliminata)")
  })
```

Run: `pnpm vitest run src/model`
Expected: PASS.

- [ ] **Step 5: Accesso e geometria**

Crea `src/editor/shape-access.ts`:

```ts
import type { DevDocument } from "@/model/document"
import type { ShapeDiagram } from "@/model/shape/schema"

/** La parte delle forme del documento: c'è sempre, vuota se non ci sono forme. */
export function shapeDiagram(doc: DevDocument): ShapeDiagram {
  return doc.diagram.shape
}
```

Crea `src/editor/shape/geometry.ts`:

```ts
import type { Shape, ShapeDiagram, ShapeView } from "@/model/shape/schema"
import { CHAR_W, GRID, PAD_X, ROW_H, type Rect, type Size } from "../geometry"

/** Quello che un testo vuoto mostra sul canvas (spec 3b §5): senza, sarebbe invisibile e impossibile da afferrare. */
export const TEXT_PLACEHOLDER = "Testo"

/** Minimo di rettangolo ed ellisse con l'etichetta vuota: gli stessi di un nodo di flusso, afferrabili. */
const MIN_SHAPE_W = 60
const MIN_SHAPE_H = 40

/**
 * Un'ellisse che contiene il rettangolo `w × h` del testo ha gli assi √2 volte i suoi lati: con quel
 * fattore gli angoli del rettangolo cadono esattamente sull'ellisse.
 */
const ELLIPSE_FACTOR = Math.SQRT2

const toGrid = (v: number): number => Math.ceil(v / GRID) * GRID

/** Il testo che la forma mostra: l'etichetta, o il segnaposto per un testo vuoto (scostamento 2 del piano). */
export function shapeText(shape: Pick<Shape, "kind" | "label">): string {
  return shape.kind === "text" && shape.label === "" ? TEXT_PLACEHOLDER : shape.label
}

/**
 * La misura che il testo chiede, senza quella scelta a mano: larghezza dalla riga più lunga, altezza
 * dal numero di righe, entrambe arrotondate alla griglia, così il bordo destro e quello inferiore
 * restano sulla griglia come il sinistro e il superiore. Rettangolo ed ellisse hanno un minimo
 * afferrabile; l'ellisse è √2 volte il rettangolo del testo; il testo non ha minimo oltre al segnaposto.
 */
export function shapeTextSize(shape: Pick<Shape, "kind" | "label">): Size {
  const lines = shapeText(shape).split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  const w = chars * CHAR_W + 2 * PAD_X
  const h = lines.length * ROW_H
  switch (shape.kind) {
    case "text":
      return { w: toGrid(w), h: toGrid(h) }
    case "rect":
      return { w: Math.max(MIN_SHAPE_W, toGrid(w)), h: Math.max(MIN_SHAPE_H, toGrid(h)) }
    case "ellipse":
      return { w: Math.max(MIN_SHAPE_W, toGrid(w * ELLIPSE_FACTOR)), h: Math.max(MIN_SHAPE_H, toGrid(h * ELLIPSE_FACTOR)) }
  }
}

/** La misura vera (spec 3b §3): lato per lato, la più grande fra quella del testo e quella scelta a mano. */
export function shapeSize(shape: Pick<Shape, "kind" | "label">, view: Pick<ShapeView, "w" | "h">): Size {
  const text = shapeTextSize(shape)
  return { w: Math.max(text.w, view.w ?? 0), h: Math.max(text.h, view.h ?? 0) }
}

export function shapeRect(shape: Pick<Shape, "kind" | "label">, view: ShapeView): Rect {
  return { x: view.x, y: view.y, ...shapeSize(shape, view) }
}

/**
 * L'ordine di disegno (spec 3b §5): dalla forma più grande alla più piccola, per area, così una zona
 * creata dopo non copre mai una forma più piccola che le sta sopra. A parità d'area vale l'ordine
 * delle chiavi (`sort` è stabile). Solo le forme che hanno sia il modello sia la view. È la sola
 * definizione: la usano il layer del canvas e `shapeOps.nodeKeys`, quindi anche l'export SVG.
 */
export function shapeDrawOrder(d: ShapeDiagram): string[] {
  const area = (key: string): number => {
    const { w, h } = shapeSize(d.model.shapes[key]!, d.view.nodes[key]!)
    return w * h
  }
  // ponytail: l'area si ricalcola a ogni confronto, O(n log n) misure; una mappa se servisse su lavagne enormi.
  return Object.keys(d.view.nodes)
    .filter((key) => key in d.model.shapes)
    .sort((a, b) => area(b) - area(a))
}
```

Crea `src/editor/shape/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { ShapeDiagram } from "@/model/shape/schema"
import { shapeDrawOrder, shapeSize, shapeTextSize } from "./geometry"

const at = (w: number | null = null, h: number | null = null) => ({ x: 0, y: 0, collapsed: false, w, h })

describe("misura delle forme", () => {
  it("rettangolo ed ellisse vuoti hanno il minimo afferrabile; il testo vuoto misura il segnaposto", () => {
    expect(shapeTextSize({ kind: "rect", label: "" })).toEqual({ w: 60, h: 40 })
    expect(shapeTextSize({ kind: "ellipse", label: "" })).toEqual({ w: 60, h: 40 })
    // «Testo»: 5 × 7,8 + 20 = 59 → 60; una riga, 22 → 30.
    expect(shapeTextSize({ kind: "text", label: "" })).toEqual({ w: 60, h: 30 })
  })

  it("l'ellisse è √2 volte il rettangolo del testo, arrotondata alla griglia", () => {
    // 15 caratteri: 15 × 7,8 + 20 = 137 → 140; × √2 = 193,7 → 200.
    expect(shapeTextSize({ kind: "rect", label: "servizio ordini" }).w).toBe(140)
    expect(shapeTextSize({ kind: "ellipse", label: "servizio ordini" }).w).toBe(200)
  })

  it("la misura vera è, lato per lato, la più grande fra testo e misura scelta", () => {
    const shape = { kind: "rect" as const, label: "servizio ordini" }
    expect(shapeSize(shape, { w: 300, h: null })).toEqual({ w: 300, h: 40 })
    expect(shapeSize(shape, { w: 50, h: 200 })).toEqual({ w: 140, h: 200 })
  })
})

describe("ordine di disegno", () => {
  it("dalla forma più grande alla più piccola, anche se la grande è stata creata dopo", () => {
    const d: ShapeDiagram = {
      model: { shapes: { piccola: { kind: "rect", label: "" }, zona: { kind: "rect", label: "" } }, arrows: {} },
      view: { nodes: { piccola: at(), zona: at(400, 300) } },
    }
    expect(shapeDrawOrder(d)).toEqual(["zona", "piccola"])
  })
})
```

Run: `pnpm vitest run src/editor/shape/geometry.test.ts`
Expected: PASS.

- [ ] **Step 6: I comandi delle forme**

Crea `src/editor/shape/commands.ts`:

```ts
import type { LayoutEdge, LayoutGraph, LayoutNode } from "@/model/layout"
import type { Arrow, ShapeDiagram, ShapeKind, ShapeModel } from "@/model/shape/schema"
import type { Recipe } from "../document-store"
import { snap, type Point } from "../geometry"
import { shapeDiagram } from "../shape-access"
import { shapeSize } from "./geometry"

const DUPLICATE_OFFSET = 20

/** Una forma nuova, con l'etichetta vuota e la misura del testo (`w`/`h` a `null`). La chiave è un uuid. */
export function addShape(at: Point, kind: ShapeKind): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const d = shapeDiagram(draft)
      d.model.shapes[key] = { kind, label: "" }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false, w: null, h: null }
    },
  }
}

export function setShapeLabel(key: string, label: string): Recipe {
  return (draft) => {
    const shape = shapeDiagram(draft).model.shapes[key]
    // Si scrive solo se cambia davvero: riaprire e richiudere l'editor senza toccare niente
    // lascerebbe altrimenti una voce di annulla fantasma.
    if (shape && shape.label !== label) shape.label = label
  }
}

/** Elimina le forme e le frecce date, e le frecce che toccano una forma eliminata (spec 3b §5). */
export function deleteShapeItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null {
  if (nodeKeys.length === 0 && edgeKeys.length === 0) return null
  const nodes = new Set(nodeKeys)
  return (draft) => {
    const d = shapeDiagram(draft)
    for (const key of edgeKeys) delete d.model.arrows[key]
    for (const [key, arrow] of Object.entries(d.model.arrows)) {
      if (nodes.has(arrow.source) || nodes.has(arrow.target)) delete d.model.arrows[key]
    }
    for (const key of nodeKeys) {
      delete d.model.shapes[key]
      delete d.view.nodes[key]
    }
  }
}

/**
 * Copia le forme con un uuid nuovo e lo scarto di sempre, misura scelta compresa, e copia le frecce
 * che collegano **due** forme copiate, sulle copie (spec 3b §5). Una freccia verso una forma non
 * copiata resta solo sull'originale.
 */
export function duplicateShapes(model: ShapeModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const copies = new Map(keys.filter((k) => k in model.shapes).map((from) => [from, crypto.randomUUID()] as const))
  const arrows: [string, Arrow][] = Object.values(model.arrows).flatMap((arrow): [string, Arrow][] => {
    const source = copies.get(arrow.source)
    const target = copies.get(arrow.target)
    return source && target ? [[crypto.randomUUID(), { ...arrow, source, target }]] : []
  })
  return {
    keys: [...copies.values()],
    recipe: (draft) => {
      const d = shapeDiagram(draft)
      for (const [from, to] of copies) {
        const shape = d.model.shapes[from]
        const view = d.view.nodes[from]
        if (!shape || !view) continue
        d.model.shapes[to] = { ...shape }
        d.view.nodes[to] = { ...view, x: view.x + DUPLICATE_OFFSET, y: view.y + DUPLICATE_OFFSET }
      }
      for (const [key, arrow] of arrows) d.model.arrows[key] = arrow
    },
  }
}

/**
 * Il grafo da disporre (spec 3b §6): ogni forma sul canvas con la sua misura vera, allargata
 * compresa, e le frecce come archi, nel loro verso. Le frecce con un estremo fuori dal grafo si
 * saltano: a ELK un arco senza uno dei due estremi fa rifiutare l'intero grafo.
 */
export function shapeLayoutGraph(d: ShapeDiagram): LayoutGraph {
  const nodes: LayoutNode[] = Object.entries(d.model.shapes).flatMap(([key, shape]) => {
    const view = d.view.nodes[key]
    return view ? [{ id: key, ...shapeSize(shape, view) }] : []
  })
  const present = new Set(nodes.map((n) => n.id))
  const edges: LayoutEdge[] = Object.entries(d.model.arrows).flatMap(([id, arrow]) =>
    present.has(arrow.source) && present.has(arrow.target) ? [{ id, source: arrow.source, target: arrow.target }] : [],
  )
  return { nodes, edges, direction: "DOWN" }
}
```

Crea `src/editor/shape/commands.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { documentStore } from "../document-store"
import { shapeDiagram } from "../shape-access"
import { addShape, deleteShapeItems, duplicateShapes, setShapeLabel, shapeLayoutGraph } from "./commands"

const state = () => documentStore.getState()
const part = () => shapeDiagram(state().doc)
const at = (x: number, y: number, w: number | null = null, h: number | null = null) => ({ x, y, collapsed: false, w, h })

/** Tre forme: `a` → `b` con una freccia, e `c` collegata a `a`. */
function tre(): void {
  const doc = createDocument("t", "t")
  doc.diagram.shape.model.shapes = { a: { kind: "rect", label: "A" }, b: { kind: "ellipse", label: "B" }, c: { kind: "text", label: "C" } }
  doc.diagram.shape.model.arrows = {
    ab: { source: "a", target: "b", head: "end", dashed: false },
    ca: { source: "c", target: "a", head: "both", dashed: true },
  }
  doc.diagram.shape.view.nodes = { a: at(0, 0, 300, null), b: at(400, 0), c: at(0, 300) }
  state().load(doc)
}

beforeEach(() => state().load(createDocument("t", "t")))

describe("comandi delle forme", () => {
  it("addShape crea la forma col tipo dato, l'etichetta vuota e la view sulla griglia senza misura scelta", () => {
    const { key, recipe } = addShape({ x: 13, y: 27 }, "ellipse")
    state().dispatch(recipe)
    expect(part().model.shapes[key]).toEqual({ kind: "ellipse", label: "" })
    expect(part().view.nodes[key]).toEqual({ x: 10, y: 30, collapsed: false, w: null, h: null })
  })

  it("setShapeLabel con la stessa etichetta non aggiunge una voce di annulla", () => {
    tre()
    expect(state().dispatch(setShapeLabel("a", "A"))).toBe(false)
    expect(state().dispatch(setShapeLabel("a", "API"))).toBe(true)
    expect(part().model.shapes["a"]!.label).toBe("API")
  })

  it("eliminare una forma elimina le frecce che la toccano, e un solo annulla le riporta", () => {
    tre()
    state().dispatch(deleteShapeItems(["a"], [])!)
    expect(part().model.shapes["a"]).toBeUndefined()
    expect(part().model.arrows).toEqual({})
    state().undo()
    expect(Object.keys(part().model.arrows).sort()).toEqual(["ab", "ca"])
  })

  it("eliminare una freccia la toglie e lascia le forme", () => {
    tre()
    state().dispatch(deleteShapeItems([], ["ab"])!)
    expect(Object.keys(part().model.arrows)).toEqual(["ca"])
    expect(Object.keys(part().model.shapes).sort()).toEqual(["a", "b", "c"])
  })

  it("duplicare copia le frecce fra forme copiate, non quelle verso una forma non copiata", () => {
    tre()
    const dup = duplicateShapes(part().model, ["a", "b"])
    state().dispatch(dup.recipe)
    const [a2, b2] = dup.keys
    expect(part().view.nodes[a2!]).toEqual(at(20, 20, 300, null))
    const copiate = Object.values(part().model.arrows).filter((arrow) => dup.keys.includes(arrow.source) || dup.keys.includes(arrow.target))
    expect(copiate).toEqual([{ source: a2, target: b2, head: "end", dashed: false }])
  })

  it("il grafo del layout ha le misure vere e le frecce come archi", () => {
    tre()
    const graph = shapeLayoutGraph(part())
    expect(graph.nodes.find((n) => n.id === "a")).toEqual({ id: "a", w: 300, h: 40 })
    expect(graph.edges).toEqual([{ id: "ab", source: "a", target: "b" }, { id: "ca", source: "c", target: "a" }])
    expect(graph.direction).toBe("DOWN")
  })
})
```

Run: `pnpm vitest run src/editor/shape/commands.test.ts`
Expected: PASS.

- [ ] **Step 7: `shapeOps` e l'instradamento**

Crea `src/editor/kinds/shape.ts`:

```ts
import type { DevDocument } from "@/model/document"
import { ShapeKindSchema } from "@/model/shape/schema"
import { validateShapes } from "@/model/shape/validate"
import { addShape, deleteShapeItems, duplicateShapes, shapeLayoutGraph } from "../shape/commands"
import { shapeDrawOrder, shapeRect } from "../shape/geometry"
import { shapeDiagram } from "../shape-access"
import type { DiagramOps, EdgeEnds } from "./ops"

/**
 * `DiagramOps` per le forme (spec 3b): cablaggio verso `shape/commands.ts` e `shape/geometry.ts`.
 * `nodeKeys` è nell'ordine di disegno, dalla forma più grande: lo legge anche l'export SVG.
 * La geometria e il gesto delle frecce arrivano col Task 2 del piano (scostamento 4): fino ad allora
 * `edgeGeometry` e `addEdge` tornano `null`.
 */
export function shapeOps(doc: DevDocument): DiagramOps {
  const diagram = () => shapeDiagram(doc)

  return {
    nodeKeys: () => shapeDrawOrder(diagram()),

    rectOf: (key, at) => {
      const shape = diagram().model.shapes[key]
      const view = diagram().view.nodes[key]
      if (!shape || !view) return null
      return shapeRect(shape, at ? { ...view, ...at } : view)
    },

    edgesTouching: (keys): EdgeEnds[] =>
      Object.entries(diagram().model.arrows)
        .filter(([, arrow]) => keys.has(arrow.source) || keys.has(arrow.target))
        .map(([key, arrow]) => ({ key, source: arrow.source, target: arrow.target })),

    edgeGeometry: () => null,

    addNode: (at, variant) => ({ ...addShape(at, ShapeKindSchema.safeParse(variant).data ?? "rect"), edit: "body" }),

    addEdge: () => null,

    deleteItems: (nodeKeys, edgeKeys) => deleteShapeItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateShapes(diagram().model, keys),

    layoutGraph: () => shapeLayoutGraph(diagram()),

    validate: () => validateShapes(diagram().model),
  }
}
```

`src/editor/kinds/ops.ts`: importa `shapeOps` da `./shape` e in `familyOps` aggiungi, prima di `case "er":`,

```ts
    case "shape":
      return shapeOps(doc)
```

`src/editor/links/commands.ts`: `FAMILY_NOUN` diventa

```ts
const FAMILY_NOUN: Record<Family, string> = { shape: "una forma", er: "un'entità", class: "una classe", flow: "un nodo di flusso", note: "una nota" }
```

- [ ] **Step 8: I test di `CanvasOps` con le forme**

In `src/editor/kinds/canvas-ops.test.ts` aggiungi in fondo (importa `shapeDiagram` da `../shape-access` e `noteDiagram` da `../note-access` se mancano):

```ts
describe("canvasOps e le forme (spec 3b)", () => {
  const add = (family: "shape" | "er" | "note", at: { x: number; y: number }, variant?: string) => {
    const { key, recipe } = canvasOps(state().doc).addNode(at, family, variant)
    state().dispatch(recipe)
    return key
  }

  it("lo strumento crea la forma della sua variante e apre il testo", () => {
    const created = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "shape", "ellipse")
    expect(created.edit).toBe("body")
    state().dispatch(created.recipe)
    expect(shapeDiagram(state().doc).model.shapes[splitKey(created.key).key]).toEqual({ kind: "ellipse", label: "" })
  })

  it("Collega fra una forma e un'entità è rifiutato con l'avviso", () => {
    const s = add("shape", { x: 0, y: 0 }, "rect")
    const e = add("er", { x: 300, y: 0 })
    expect(canvasOps(state().doc).addEdge(s, e)).toEqual({ type: "rejected", notice: "Non esiste un collegamento fra una forma e un'entità." })
  })

  it("una nota si ancora a una forma; eliminare la forma stacca la nota, e un annulla riporta forma, frecce e àncora", () => {
    const s = add("shape", { x: 0, y: 0 }, "rect")
    const altra = add("shape", { x: 300, y: 0 }, "rect")
    // La freccia si scrive a mano: il gesto arriva col Task 2.
    state().dispatch((draft) => {
      shapeDiagram(draft).model.arrows["f"] = { source: splitKey(s).key, target: splitKey(altra).key, head: "end", dashed: false }
    })
    const n = add("note", { x: 0, y: 200 })
    const anchored = canvasOps(state().doc).addEdge(n, s)
    if (anchored?.type !== "created") throw new Error("atteso un ancoraggio")
    state().dispatch(anchored.recipe)
    const nota = () => noteDiagram(state().doc).model.notes[splitKey(n).key]!
    expect(nota().anchor).toBe(s)

    state().dispatch(canvasOps(state().doc).deleteItems([s], [])!)
    expect(nota().anchor).toBeNull()
    expect(shapeDiagram(state().doc).model.arrows).toEqual({})

    state().undo()
    expect(nota().anchor).toBe(s)
    expect(Object.keys(shapeDiagram(state().doc).model.arrows)).toEqual(["f"])
  })
})
```

Run: `pnpm vitest run src/editor`
Expected: PASS. Se un test esistente fallisce perché conta le famiglie o i loro blocchi in ordine, e la causa è solo `"shape"` in testa a `FAMILIES`, aggiorna l'asserzione; se fallisce per un altro motivo, fermati e riportalo.

- [ ] **Step 9: La vista della forma e l'editor del testo**

Crea `src/ui/canvas/Shape.tsx`:

```tsx
import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { ROW_H } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { shapeSize, shapeText } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import type { Shape, ShapeView } from "@/model/shape/schema"
import { registerNode } from "./dom-registry"

interface Props {
  /** La chiave con prefisso: la forma si registra e si colpisce con quella. */
  id: string
  shape: Shape
  view: ShapeView
  selected: boolean
}

/**
 * Vista pura e memoizzata di una forma (spec 3b §5). Rettangolo ed ellisse hanno bordo e fondo del
 * tema, come i nodi di flusso; il testo non ha né l'uno né l'altro, solo un rettangolo trasparente
 * che lo rende afferrabile anche fra una lettera e l'altra. Il testo si centra, come nei nodi di
 * flusso: il centro è l'unico punto che sta dentro tutte e tre le forme. Un testo vuoto mostra il
 * segnaposto in grigio.
 */
export const ShapeNodeView = memo(function ShapeNodeView({ id, shape, view, selected }: Props) {
  const { w, h } = shapeSize(shape, view)
  const text = shapeText(shape)
  const lines = text === "" ? [] : text.split("\n")
  const placeholder = shape.kind === "text" && shape.label === ""
  const stroke = selected ? "var(--primary)" : "var(--border)"
  const strokeWidth = selected ? 2 : 1
  const startY = h / 2 - ((lines.length - 1) * ROW_H) / 2
  return (
    <g
      data-node-id={id}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
      {shape.kind === "rect" && <rect width={w} height={h} fill="var(--card)" stroke={stroke} strokeWidth={strokeWidth} />}
      {shape.kind === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="var(--card)" stroke={stroke} strokeWidth={strokeWidth} />}
      {shape.kind === "text" && (
        <rect width={w} height={h} fill="transparent" stroke={selected ? "var(--primary)" : "none"} strokeDasharray="4 2" />
      )}
      {/* `data-node-body`: il contratto del livello di dettaglio, vedi `ViewportGroup`. */}
      {lines.length > 0 && (
        <g data-node-body>
          <text
            x={w / 2}
            y={startY}
            textAnchor="middle"
            dominantBaseline="central"
            fill={placeholder ? "var(--muted-foreground)" : "var(--foreground)"}
            xmlSpace="preserve"
          >
            {lines.map((line, i) => (
              <tspan key={i} x={w / 2} dy={i === 0 ? 0 : ROW_H}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}
    </g>
  )
})

/** Componente connesso: un selettore per forma, così un cambiamento altrove non la tocca. */
export function ShapeNode({ nodeKey }: { nodeKey: string }) {
  const id = qualify("shape", nodeKey)
  const shape = useStore(documentStore, (s) => shapeDiagram(s.doc).model.shapes[nodeKey])
  const view = useStore(documentStore, (s) => shapeDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", id)))
  if (!shape || !view) return null
  return <ShapeNodeView id={id} shape={shape} view={view} selected={selected} />
}
```

Crea `src/ui/canvas/Shape.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ShapeNodeView } from "./Shape"

const view = { x: 10, y: 20, collapsed: false, w: null, h: null }
const html = (kind: "rect" | "ellipse" | "text", label: string) =>
  renderToStaticMarkup(<ShapeNodeView id="shape/a" shape={{ kind, label }} view={view} selected={false} />)

describe("ShapeNodeView", () => {
  it("il rettangolo e l'ellisse hanno la loro figura e il testo", () => {
    expect(html("rect", "API")).toContain("<rect")
    expect(html("rect", "API")).toContain("API")
    expect(html("ellipse", "DB")).toContain("<ellipse")
  })

  it("un testo vuoto mostra il segnaposto in grigio", () => {
    const out = html("text", "")
    expect(out).toContain("Testo")
    expect(out).toContain("var(--muted-foreground)")
    expect(out).not.toContain("<ellipse")
  })
})
```

Crea `src/ui/canvas/ShapeEditor.tsx`:

```tsx
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { editingIn } from "@/editor/families"
import { sessionStore } from "@/editor/session-store"
import { setShapeLabel } from "@/editor/shape/commands"
import { shapeSize } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import { TextEditorOverlay } from "./TextEditorOverlay"

/**
 * Overlay dell'editor sulla forma in editing: solo dati e commit, il markup è `TextEditorOverlay`,
 * come `NoteEditor` e `FlowNodeEditor`. Si apre alla creazione (`edit: "body"`) e al doppio clic.
 */
export function ShapeEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const own = editingIn(editing, "shape")
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const shape = useStore(documentStore, (s) => (own?.target === "body" ? shapeDiagram(s.doc).model.shapes[own.key] : undefined))
  const view = useStore(documentStore, (s) => (own?.target === "body" ? shapeDiagram(s.doc).view.nodes[own.key] : undefined))
  if (!own || own.target !== "body" || !shape || !view) return null

  const close = () => sessionStore.getState().setEditing(null)
  const { w, h } = shapeSize(shape, view)

  return (
    <TextEditorOverlay
      ariaLabel="Testo della forma"
      x={view.x}
      y={view.y}
      w={w}
      h={h}
      viewport={viewport}
      defaultValue={shape.label}
      onCommit={(value) => {
        documentStore.getState().dispatch(setShapeLabel(own.key, value))
        close()
      }}
      onCancel={close}
    />
  )
}
```

- [ ] **Step 10: Il pannello della forma**

`src/ui/panels/NoteProperties.tsx`: `NoteTextField` prende un `fieldId` facoltativo:

```tsx
/**
 * Il campo «Testo» di una nota o di una forma: una `textarea` commessa sul blur, l'alternativa al
 * doppio clic sul canvas. **Alternativa, non secondo editor:** finché l'editor sul canvas è aperto su
 * *questo* elemento il campo è in sola lettura e lo dice, perché due campi modificabili per lo stesso
 * dato divergerebbero. `id` è la chiave con prefisso dell'elemento, quella che l'editing in corso
 * porta; `fieldId` è l'id HTML del campo, diverso per nota e forma.
 */
export function NoteTextField({ id, text, onCommit, fieldId = "note-text" }: { id: string; text: string; onCommit: (text: string) => void; fieldId?: string }) {
  const editingHere = useStore(sessionStore, (s) => s.editing?.key === id && s.editing.target === "body")
  return (
    <div className="grid gap-1">
      <Label htmlFor={fieldId}>Testo</Label>
      <CommitTextarea
        id={fieldId}
        key={text}
        value={text}
        readOnly={editingHere}
        onCommit={onCommit}
        className="min-h-24 resize-none rounded-md border bg-background p-2 text-sm read-only:opacity-50"
      />
      {editingHere && <p className="text-xs text-muted-foreground">Modifica in corso sul canvas.</p>}
    </div>
  )
}
```

Crea `src/ui/panels/ShapeProperties.tsx`:

```tsx
import { useStore } from "zustand"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { sessionStore } from "@/editor/session-store"
import { setShapeLabel } from "@/editor/shape/commands"
import { shapeDiagram } from "@/editor/shape-access"
import { NoteTextField } from "./NoteProperties"

const dispatch = (recipe: Recipe) => documentStore.getState().dispatch(recipe)

function ShapeBody({ shapeKey: key }: { shapeKey: string }) {
  const shape = useStore(documentStore, (s) => shapeDiagram(s.doc).model.shapes[key])
  if (!shape) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <NoteTextField fieldId="shape-text" id={qualify("shape", key)} text={shape.label} onCommit={(label) => dispatch(setShapeLabel(key, label))} />
    </div>
  )
}

/** Corpo del pannello per le forme (spec 3b §7). Il pannello della freccia arriva col Task 2. */
export function ShapeProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const key = familySelectedKeys(selection, "node", "shape")[0]
  if (key === undefined) return null
  return <ShapeBody key={key} shapeKey={key} />
}
```

- [ ] **Step 11: La vista della famiglia, il registro e i layer**

Crea `src/ui/canvas/kinds/shape.tsx`:

```tsx
import { Circle, RectangleHorizontal, Type } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { shapeDrawOrder } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import type { Shape, ShapeView } from "@/model/shape/schema"
import { ShapeProperties } from "@/ui/panels/ShapeProperties"
import { ShapeNode, ShapeNodeView } from "../Shape"
import type { DiagramView, NodeViewProps } from "./registry"

/** Le forme nell'ordine di disegno, dalla più grande (spec 3b §5): lo stesso di `shapeOps.nodeKeys`. */
function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => shapeDrawOrder(shapeDiagram(s.doc))))
  return (
    <g data-layer="shapes">
      {keys.map((key) => <ShapeNode key={key} nodeKey={key} />)}
    </g>
  )
}

/** Le frecce arrivano col Task 2 del piano: fino ad allora il layer è vuoto. */
function EdgesLayer() {
  return <g data-layer="edges" />
}

/** Adattatore verso la vista pura, dietro la forma generica di `DiagramView`: `node` e `view` arrivano generici da `buildSvg`. */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  return <ShapeNodeView id={qualify("shape", nodeKey)} shape={node as Shape} view={view as ShapeView} selected={selected} />
}

/** Le frecce arrivano col Task 2 del piano. */
function EdgeView() {
  return null
}

/**
 * `DiagramView` per le forme (spec 3b): tre strumenti, e i nodi disegnati sotto tutto (`backdrop`).
 * Un testo vuoto non esce nell'export: sul canvas mostra il segnaposto, in un file sarebbe solo spazio.
 */
export const shapeView: DiagramView = {
  NodesLayer,
  EdgesLayer,
  NodeView,
  EdgeView,
  Properties: ShapeProperties,
  backdrop: true,
  hiddenInExport: (node) => {
    const shape = node as Shape
    return shape.kind === "text" && shape.label === ""
  },
  tools: [
    { label: "Rettangolo", key: "q", Icon: RectangleHorizontal, tool: "node", family: "shape", variant: "rect" },
    { label: "Ellisse", key: "o", Icon: Circle, tool: "node", family: "shape", variant: "ellipse" },
    { label: "Testo", key: "t", Icon: Type, tool: "node", family: "shape", variant: "text" },
  ],
}
```

`src/ui/canvas/kinds/registry.ts`:
- importa `shapeView` da `./shape`;
- `FAMILY_LABEL` diventa `{ shape: "Forme", er: "ER", class: "Classi", flow: "Flusso", note: "Note" }`;
- in `DiagramView`, dopo `tools: ToolDef[]`, aggiungi:

```ts
  /**
   * I nodi della famiglia si disegnano **sotto tutto**: sotto i pool, sotto gli archi di ogni
   * famiglia, sotto i nodi delle altre (spec 3b §3). Serve alle forme, perché una zona non copra ciò
   * che racchiude. Assente: i nodi stanno sopra tutti gli archi, nell'ordine di `FAMILIES`.
   */
  backdrop?: boolean
  /** `true` per un nodo che il canvas mostra ma l'export salta (un testo vuoto, spec 3b §8). Assente: tutti escono. */
  hiddenInExport?: (node: unknown) => boolean
```

- in `viewFor`, prima di `case "er":`:

```ts
    case "shape":
      return shapeView
```

`src/ui/canvas/kinds/registry.test.ts`: aggiungi in fondo (importa `Circle`, `RectangleHorizontal`, `Type` da `lucide-react`):

```ts
describe("forme", () => {
  it("le forme dichiarano Rettangolo, Ellisse e Testo, e si disegnano sotto tutto", () => {
    const view = viewFor("shape")
    expect(view.tools).toEqual([
      { label: "Rettangolo", key: "q", Icon: RectangleHorizontal, tool: "node", family: "shape", variant: "rect" },
      { label: "Ellisse", key: "o", Icon: Circle, tool: "node", family: "shape", variant: "ellipse" },
      { label: "Testo", key: "t", Icon: Type, tool: "node", family: "shape", variant: "text" },
    ])
    expect(view.backdrop).toBe(true)
    expect(viewFor("er").backdrop).toBeUndefined()
  })

  it("nessun tasto è preso da due strumenti, e nessuno è una scorciatoia globale", () => {
    const keys = canvasTools(FAMILIES).map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const reserved of ["v", "f", "l"]) expect(keys).not.toContain(reserved)
  })

  it("un testo vuoto non esce nell'export, un testo scritto sì", () => {
    const hidden = viewFor("shape").hiddenInExport!
    expect(hidden({ kind: "text", label: "" })).toBe(true)
    expect(hidden({ kind: "text", label: "titolo" })).toBe(false)
    expect(hidden({ kind: "rect", label: "" })).toBe(false)
  })
})
```

`src/ui/canvas/Canvas.tsx`: importa `ShapeEditor` da `./ShapeEditor`; i layer dentro `ViewportGroup` diventano

```tsx
          <rect data-canvas x={-GRID_EXTENT} y={-GRID_EXTENT} width={2 * GRID_EXTENT} height={2 * GRID_EXTENT} fill="url(#dd-grid)" />
          {/* Le famiglie `backdrop` sotto tutto, anche sotto pool e archi: una zona non copre ciò che
              racchiude (spec 3b §3). */}
          {FAMILIES.filter((f) => viewFor(f).backdrop).map((f) => {
            const { NodesLayer } = viewFor(f)
            return <NodesLayer key={`nodes-${f}`} />
          })}
          {/* I pool non sono un `DiagramView.NodesLayer`: sono un layer che solo il flowchart popola,
              sotto archi e nodi (spec 2b §3). */}
          <PoolsLayer />
          {/* Tutti gli archi sotto tutti i nodi: un arco ER non deve coprire una classe (spec §5). */}
          {FAMILIES.map((f) => {
            const { EdgesLayer } = viewFor(f)
            return <EdgesLayer key={`edges-${f}`} />
          })}
          {/* I collegamenti fra famiglie: sopra gli archi interni, sotto ogni nodo (spec 4a §6). */}
          <LinksLayer />
          {FAMILIES.filter((f) => !viewFor(f).backdrop).map((f) => {
            const { NodesLayer } = viewFor(f)
            return <NodesLayer key={`nodes-${f}`} />
          })}
          {children}
          <Overlay />
```

e dopo `<FlowNodeEditor />` monta `<ShapeEditor />`.

`src/ui/canvas/InlineEditor.tsx`, in `nameEditorFor`, prima di `case "er":`:

```tsx
    case "shape":
      return null
```

e nel docblock «`null` per il flowchart, per le note e per le forme, che un nome non ce l'hanno».

`src/ui/canvas/use-canvas-interaction.ts`, nel gestore del doppio clic, il ramo del corpo diventa:

```ts
      // Un nodo di flowchart, una nota e una forma non hanno un nome distinto dal corpo: qualunque
      // punto del nodo apre l'editor di testo, a differenza dell'header che l'ER usa per il nome.
      if (family === "flow" || family === "note" || family === "shape") {
        session().setEditing({ key: hit.key, target: "body" })
        return
      }
```

`src/ui/use-keyboard-shortcuts.ts`: nel docblock, la riga degli strumenti diventa
`* v tool selezione · le lettere degli strumenti vengono da \`canvasTools\` (Q O T forme · E entità · C I U classi · 1–5 forme del flusso · P pool · N nota · R collega)`.

- [ ] **Step 12: L'export SVG e l'export testuale**

`src/ui/export/svg.tsx`:
- importa `shapeDiagram` da `@/editor/shape-access`;
- in `nodeModelsOf`, `edgeModelsOf` e `viewNodesOf` aggiungi, prima di `case "er":`, rispettivamente:

```ts
    case "shape":
      return shapeDiagram(doc).model.shapes
```

```ts
    case "shape":
      return shapeDiagram(doc).model.arrows
```

```ts
    case "shape":
      return shapeDiagram(doc).view.nodes
```

- in `buildSvg`, dentro `sections`, le chiavi filtrano i nodi che l'export salta, e `nodeModels` si legge prima:

```ts
  const sections = FAMILIES.map((family) => {
    const ops = familyOps(doc, family)
    const view = viewFor(family)
    const nodeModels = nodeModelsOf(doc, family)
    // Un nodo che il canvas mostra ma l'export salta (un testo vuoto, spec 3b §8) non entra né nel
    // disegno né nei limiti del file.
    const keys = ops.nodeKeys().filter((key) => !view.hiddenInExport?.(nodeModels[key]))
    const rects = new Map<string, Rect>()
    for (const key of keys) {
      const rect = ops.rectOf(key)
      if (rect) rects.set(key, rect)
    }
    const edges = ops.edgesTouching(new Set(keys))
    return {
      family,
      ops,
      keys,
      rects,
      edges,
      offsets: edgeOffsets(edges),
      view,
      nodeModels,
      edgeModels: edgeModelsOf(doc, family),
      viewNodes: viewNodesOf(doc, family),
    }
  })
```

- il rendering dei nodi si estrae in una funzione locale usata due volte, sotto e sopra:

```tsx
  // Le famiglie `backdrop` sotto tutto, anche sotto pool e archi, come nel canvas (spec 3b §3).
  const nodesOf = (list: typeof sections) =>
    list.flatMap((s) =>
      s.keys.map((key) => {
        const rect = s.rects.get(key)
        const view = s.viewNodes[key]
        const node = s.nodeModels[key]
        if (!rect || !view || !node) return null
        return <s.view.NodeView key={qualify(s.family, key)} nodeKey={key} node={node} view={view} selected={false} />
      }),
    )
```

e nel markup, subito dopo il `<rect data-background … />` e prima dei pool:

```tsx
      <g data-layer="backdrop">{nodesOf(sections.filter((s) => s.view.backdrop))}</g>
```

mentre il `<g data-layer="nodes">` in fondo diventa `<g data-layer="nodes">{nodesOf(sections.filter((s) => !s.view.backdrop))}</g>`. Aggiorna il docblock di `buildSvg`: l'ordine è «le forme sotto tutto, poi le corsie, poi tutti gli archi, poi i collegamenti fra famiglie, poi i nodi delle altre famiglie».

`src/ui/export/svg.test.ts`: aggiungi in fondo:

```ts
describe("buildSvg e le forme (spec 3b)", () => {
  it("le forme escono sotto tutto, prima di archi e nodi delle altre famiglie; un testo vuoto non esce e non allarga il file", () => {
    const doc = docOf("er", diagram())
    doc.diagram.shape.model.shapes = { z: { kind: "rect", label: "zona" }, t: { kind: "text", label: "" } }
    doc.diagram.shape.view.nodes = {
      z: { x: 0, y: 0, collapsed: false, w: 800, h: 800 },
      t: { x: 5000, y: 5000, collapsed: false, w: null, h: null },
    }
    const svg = buildSvg(doc, { vars: {} })!
    const zona = svg.indexOf('data-node-id="shape/z"')
    expect(zona).toBeGreaterThan(-1)
    expect(zona).toBeLessThan(svg.indexOf('data-layer="edges"'))
    expect(zona).toBeLessThan(svg.indexOf('data-node-id="er/utenti"'))
    expect(svg).not.toContain('data-node-id="shape/t"')
    // Il testo vuoto a (5000, 5000) non conta nei limiti: il file finisce ben prima.
    const width = Number(/width="([\d.]+)"/.exec(svg)![1])
    expect(width).toBeLessThan(5000)
  })
})
```

`src/ui/export/TextExportDialog.tsx`:
- `type ExportFamily = Exclude<Family, "note" | "shape">` col docblock «Le famiglie che hanno un formato di testo: le note escono dentro quello delle classi, o in nessuno (spec 3a §8); le forme in nessuno (spec 3b §8).»;
- sotto `hasLinks`:

```ts
  // Le forme non hanno formato di testo (spec 3b §8): lo si dice, con i formati e senza.
  const hasShapes = useStore(documentStore, (s) => familyHasContent(s.doc, "shape"))
```

- nella lista dei limiti, dopo la riga dei collegamenti:

```tsx
              {hasShapes && <li data-export-shapes-note>Le forme escono solo come immagine (SVG o PNG).</li>}
```

- il ramo senza formati diventa:

```tsx
        ) : hasShapes || Object.keys(models.notes).length > 0 ? (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {hasShapes && <p>Le forme escono solo come immagine: usa l'export SVG o PNG.</p>}
            {Object.keys(models.notes).length > 0 && (
              <p>Le note libere escono solo nel Mermaid delle classi, che chiede almeno una classe: qui non ce n'è nessuna.</p>
            )}
          </div>
        ) : (
```

`src/ui/export/TextExportDialog.test.tsx`: aggiungi nel `describe`:

```tsx
  it("con sole forme dice che escono solo come immagine, non che il documento è vuoto", () => {
    const doc = createDocument("t", "t")
    doc.diagram.shape.model.shapes["a"] = { kind: "rect", label: "API" }
    doc.diagram.shape.view.nodes["a"] = { x: 0, y: 0, collapsed: false, w: null, h: null }
    documentStore.getState().load(doc)
    render()
    const dialog = document.querySelector("[data-text-export-dialog]")!
    expect(dialog.textContent).toContain("Le forme escono solo come immagine")
    expect(dialog.textContent).not.toContain("Il documento è vuoto")
  })
```

- [ ] **Step 13: Verifica e commit**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: tutto verde, senza warning.

```bash
git add -A src
git commit -m "feat(forme): la famiglia delle forme, sotto tutto nel canvas e nell'export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Le frecce

Il task dà vita alle frecce che il Task 1 ha messo nel modello: il gesto Collega fra due forme, la geometria con le punte, il disegno col tratteggio, il pannello con punte, tratteggio e «Inverti», e l'export.

**Files:**
- Modify: `src/editor/edge-routing.ts`, `src/editor/edge-routing.test.ts`, `src/editor/flow/geometry.ts`
- Modify: `src/editor/shape/geometry.ts`, `src/editor/shape/geometry.test.ts`
- Modify: `src/editor/shape/commands.ts`, `src/editor/shape/commands.test.ts`
- Modify: `src/editor/kinds/shape.ts`, `src/editor/kinds/canvas-ops.test.ts`
- Create: `src/ui/canvas/ShapeArrow.tsx`
- Modify: `src/ui/canvas/Shape.test.tsx`
- Modify: `src/ui/canvas/kinds/shape.tsx`, `src/ui/panels/ShapeProperties.tsx`
- Create: `src/ui/panels/ShapeProperties.test.tsx`
- Modify: `src/ui/export/svg.test.ts`

**Interfaces:**
- Consumes (Task 1): `Arrow`, `ArrowHead`, `ArrowHeadSchema`, `ShapeModel`, `shapeDiagram`, `shapeOps`, `shapeView`, `ShapeProperties`.
- Produces:
  - Da `@/editor/edge-routing`: `filledArrowPath(at: Point, dir: Dir): string` (spostata da `flow/geometry.ts`, dove resta usata).
  - Da `@/editor/shape/geometry`: `arrowGeometry(source: Rect, target: Rect, arrow: Pick<Arrow, "head">, offset?: number): EdgeGeometry`, `arrowOffsets(arrows: Readonly<Record<string, Arrow>>): Map<string, number>`.
  - Da `@/editor/shape/commands`: `addArrow(model: ShapeModel, source: string, target: string): { key; recipe } | null`, `setArrowHead(key, head: ArrowHead): Recipe`, `setArrowDashed(key, dashed: boolean): Recipe`, `invertArrow(key): Recipe`.
  - Da `@/ui/canvas/ShapeArrow`: `ArrowEdgeView({ arrowKey, arrow, source, target, selected, offset })`, `ArrowEdge({ arrowKey, offset })`.

- [ ] **Step 1: La punta piena diventa condivisa**

In `src/editor/flow/geometry.ts` togli `FLOW_ARROW_LEN`, `FLOW_ARROW_HALF_W` e `filledArrowPath` (con il loro commento), e importa `filledArrowPath` da `../edge-routing` insieme a quello che già si importa da lì. In `src/editor/edge-routing.ts`, dopo `pathFromPoints`, aggiungi:

```ts
/** Lunghezza e semilarghezza della freccia piena: la punta degli archi di flowchart e delle frecce delle forme. */
const FILLED_ARROW_LEN = 10
const FILLED_ARROW_HALF_W = 5

/**
 * Una punta piena con la cima in `at`, che si apre lungo `dir` — il versore che esce dal nodo lungo
 * l'arco, lo stesso di `routeEdge` per `sourceDir` e `targetDir`: la cima tocca il bordo del nodo, la
 * base sta sull'arco. Serve a entrambi i capi.
 */
export function filledArrowPath(at: Point, dir: Dir): string {
  const px = -dir.y
  const py = dir.x
  const p = (d: number, s: number): Point => ({ x: at.x + dir.x * d + px * s, y: at.y + dir.y * d + py * s })
  return `${pathFromPoints([at, p(FILLED_ARROW_LEN, -FILLED_ARROW_HALF_W), p(FILLED_ARROW_LEN, FILLED_ARROW_HALF_W)])} Z`
}
```

In `src/editor/edge-routing.test.ts` aggiungi:

```ts
describe("filledArrowPath", () => {
  it("la cima sta nel punto dato e la base si apre lungo la direzione", () => {
    expect(filledArrowPath({ x: 100, y: 50 }, { x: 1, y: 0 })).toBe("M100 50 L110 45 L110 55 Z")
  })
})
```

(importa `filledArrowPath` dal modulo sotto test).

Run: `pnpm vitest run src/editor/edge-routing.test.ts src/editor/flow`
Expected: PASS (gli archi di flowchart disegnano la stessa punta di prima).

- [ ] **Step 2: La geometria delle frecce**

In `src/editor/shape/geometry.ts` aggiungi gli import `import { edgeOffsets, filledArrowPath, memoOnIdentity, pathFromPoints, routeEdge, type EdgeGeometry } from "../edge-routing"` e `type Arrow` da `@/model/shape/schema`, poi in fondo:

```ts
/**
 * Tutta la geometria di una freccia (spec 3b §5): il percorso ortogonale di tutti gli archi
 * (`routeEdge`, mai un cappio: lo schema rifiuta una freccia verso sé stessa), una punta piena a ogni
 * capo che `head` chiede, e l'etichetta — che una freccia non ha — sul segmento centrale, perché
 * `EdgeGeometry` la vuole. Serve al disegno statico e all'anteprima del drag.
 */
export function arrowGeometry(source: Rect, target: Rect, arrow: Pick<Arrow, "head">, offset = 0): EdgeGeometry {
  const route = routeEdge(source, target, false, offset)
  const pts = route.points
  const mid = Math.floor((pts.length - 1) / 2)
  const a = pts[mid]!
  const b = pts[mid + 1]!
  return {
    d: pathFromPoints(pts),
    sourceMarker: arrow.head === "both" ? filledArrowPath(pts[0]!, route.sourceDir) : "",
    targetMarker: arrow.head === "none" ? "" : filledArrowPath(pts[pts.length - 1]!, route.targetDir),
    label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  }
}

/** Gli scarti di fascio delle frecce: più frecce fra le stesse due forme si affiancano (spec 3b §3). Gemella di `flowEdgeOffsets`. */
export const arrowOffsets = memoOnIdentity((arrows: Readonly<Record<string, Arrow>>) =>
  edgeOffsets(Object.entries(arrows).map(([key, a]) => ({ key, source: a.source, target: a.target }))),
)
```

In `src/editor/shape/geometry.test.ts` aggiungi (importa `arrowGeometry`, `arrowOffsets`):

```ts
describe("geometria delle frecce", () => {
  const a = { x: 0, y: 0, w: 100, h: 40 }
  const b = { x: 300, y: 0, w: 100, h: 40 }
  const start = (d: string) => d.split(" L")[0]!.slice(1)
  const end = (d: string) => d.split(" L").at(-1)!

  it("la punta segue head: nessuna, solo alla fine, a entrambi i capi", () => {
    expect(arrowGeometry(a, b, { head: "none" })).toMatchObject({ sourceMarker: "", targetMarker: "" })
    const fine = arrowGeometry(a, b, { head: "end" })
    expect(fine.sourceMarker).toBe("")
    expect(fine.targetMarker.startsWith(`M${end(fine.d)}`)).toBe(true)
    const entrambe = arrowGeometry(a, b, { head: "both" })
    expect(entrambe.sourceMarker.startsWith(`M${start(entrambe.d)}`)).toBe(true)
    expect(entrambe.targetMarker).not.toBe("")
  })

  it("due frecce fra le stesse forme hanno scarti diversi", () => {
    const offsets = arrowOffsets({
      f1: { source: "a", target: "b", head: "end", dashed: false },
      f2: { source: "a", target: "b", head: "end", dashed: false },
    })
    expect(offsets.get("f1")).not.toBe(offsets.get("f2"))
  })
})
```

Run: `pnpm vitest run src/editor/shape/geometry.test.ts`
Expected: PASS.

- [ ] **Step 3: I comandi delle frecce**

In `src/editor/shape/commands.ts` aggiungi `type ArrowHead` all'import da `@/model/shape/schema`, poi:

```ts
/**
 * Una freccia nuova dal gesto Collega (spec 3b §5): con la punta alla fine e la linea continua.
 * `null` fra una forma e sé stessa, o se un estremo non è una forma. Due frecce fra le stesse forme
 * sono ammesse: si affiancano.
 */
export function addArrow(model: ShapeModel, source: string, target: string): { key: string; recipe: Recipe } | null {
  if (source === target || !(source in model.shapes) || !(target in model.shapes)) return null
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      shapeDiagram(draft).model.arrows[key] = { source, target, head: "end", dashed: false }
    },
  }
}

export function setArrowHead(key: string, head: ArrowHead): Recipe {
  return (draft) => {
    const arrow = shapeDiagram(draft).model.arrows[key]
    if (arrow && arrow.head !== head) arrow.head = head
  }
}

export function setArrowDashed(key: string, dashed: boolean): Recipe {
  return (draft) => {
    const arrow = shapeDiagram(draft).model.arrows[key]
    if (arrow && arrow.dashed !== dashed) arrow.dashed = dashed
  }
}

/** Scambia i capi: la punta «alla fine» passa all'altra forma senza cancellare e rifare la freccia (spec 3b §7). */
export function invertArrow(key: string): Recipe {
  return (draft) => {
    const arrow = shapeDiagram(draft).model.arrows[key]
    if (arrow) [arrow.source, arrow.target] = [arrow.target, arrow.source]
  }
}
```

In `src/editor/shape/commands.test.ts` aggiungi (importa `addArrow`, `invertArrow`, `setArrowDashed`, `setArrowHead`):

```ts
describe("comandi delle frecce", () => {
  it("addArrow crea una freccia con la punta alla fine; verso sé stessa o verso una forma che non c'è, niente", () => {
    tre()
    const created = addArrow(part().model, "b", "c")!
    state().dispatch(created.recipe)
    expect(part().model.arrows[created.key]).toEqual({ source: "b", target: "c", head: "end", dashed: false })
    expect(addArrow(part().model, "a", "a")).toBeNull()
    expect(addArrow(part().model, "a", "sparita")).toBeNull()
  })

  it("punte e tratteggio si scrivono solo se cambiano; invertire scambia i capi", () => {
    tre()
    expect(state().dispatch(setArrowHead("ab", "end"))).toBe(false)
    expect(state().dispatch(setArrowHead("ab", "both"))).toBe(true)
    expect(state().dispatch(setArrowDashed("ab", false))).toBe(false)
    expect(state().dispatch(setArrowDashed("ab", true))).toBe(true)
    state().dispatch(invertArrow("ab"))
    expect(part().model.arrows["ab"]).toEqual({ source: "b", target: "a", head: "both", dashed: true })
  })
})
```

- [ ] **Step 4: `shapeOps` con le frecce**

In `src/editor/kinds/shape.ts`:
- importa `addArrow` da `../shape/commands` e `arrowGeometry, arrowOffsets` da `../shape/geometry`;
- `edgeGeometry` e `addEdge` diventano:

```ts
    edgeGeometry: (key, a, b) => {
      const model = diagram().model
      const arrow = model.arrows[key]
      return arrow ? arrowGeometry(a, b, arrow, arrowOffsets(model.arrows).get(key) ?? 0) : null
    },
```

```ts
    addEdge: (source, target) => addArrow(diagram().model, source, target),
```

- dal docblock togli la frase sul Task 2.

In `src/editor/kinds/canvas-ops.test.ts`, nel `describe("canvasOps e le forme (spec 3b)")`, aggiungi:

```ts
  it("Collega fra due forme crea una freccia; da una forma a sé stessa niente", () => {
    const a = add("shape", { x: 0, y: 0 }, "rect")
    const b = add("shape", { x: 300, y: 0 }, "ellipse")
    const r = canvasOps(state().doc).addEdge(a, b)
    if (r?.type !== "created") throw new Error("attesa una freccia")
    state().dispatch(r.recipe)
    expect(shapeDiagram(state().doc).model.arrows[splitKey(r.key).key]).toEqual({ source: splitKey(a).key, target: splitKey(b).key, head: "end", dashed: false })
    expect(canvasOps(state().doc).addEdge(a, a)).toBeNull()
  })
```

e nel test «una nota si ancora a una forma…» la freccia si crea col gesto invece che a mano: sostituisci il blocco `state().dispatch((draft) => { … })` e il suo commento con

```ts
    const arrow = canvasOps(state().doc).addEdge(s, altra)
    if (arrow?.type !== "created") throw new Error("attesa una freccia")
    state().dispatch(arrow.recipe)
    const arrowKey = splitKey(arrow.key).key
```

e l'ultima asserzione con `expect(Object.keys(shapeDiagram(state().doc).model.arrows)).toEqual([arrowKey])`.

Run: `pnpm vitest run src/editor`
Expected: PASS.

- [ ] **Step 5: Il disegno della freccia**

Crea `src/ui/canvas/ShapeArrow.tsx`:

```tsx
import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import type { Rect } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { arrowGeometry } from "@/editor/shape/geometry"
import { shapeDiagram } from "@/editor/shape-access"
import type { Arrow } from "@/model/shape/schema"
import { registerEdge } from "./dom-registry"
import { useNodeRect } from "./use-node-rect"

interface Props {
  arrowKey: string
  arrow: Arrow
  source: Rect
  target: Rect
  selected: boolean
  /** Scarto del fascio: arriva dal layer, che è l'unico a vedere tutte le frecce. */
  offset: number
}

/**
 * Sulla forma di `FlowEdgeView`: il percorso di `arrowGeometry`, una punta piena per ogni capo che
 * `head` chiede, e la linea tratteggiata se `dashed`, con lo stesso `6 4` delle altre linee
 * tratteggiate del canvas. Nessuna etichetta: una freccia non ne ha (spec 3b §2).
 */
export const ArrowEdgeView = memo(function ArrowEdgeView({ arrowKey, arrow, source, target, selected, offset }: Props) {
  const id = qualify("shape", arrowKey)
  const geo = arrowGeometry(source, target, arrow, offset)
  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  return (
    <g
      data-edge-id={id}
      ref={(el) => {
        registerEdge(id, el)
        return () => registerEdge(id, null)
      }}
    >
      <path data-edge-hit d={geo.d} fill="none" stroke="transparent" strokeWidth={12} />
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray={arrow.dashed ? "6 4" : undefined} />
      <path data-edge-source d={geo.sourceMarker} fill={stroke} stroke={stroke} strokeWidth={1.5} />
      <path data-edge-target d={geo.targetMarker} fill={stroke} stroke={stroke} strokeWidth={1.5} />
    </g>
  )
})

export function ArrowEdge({ arrowKey, offset }: { arrowKey: string; offset: number }) {
  const arrow = useStore(documentStore, (s) => shapeDiagram(s.doc).model.arrows[arrowKey])
  const source = useNodeRect(arrow && qualify("shape", arrow.source))
  const target = useNodeRect(arrow && qualify("shape", arrow.target))
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", qualify("shape", arrowKey))))
  // Una freccia pendente non si disegna, come un collegamento pendente (spec 3b §9).
  if (!arrow || !source || !target) return null
  return <ArrowEdgeView arrowKey={arrowKey} arrow={arrow} source={source} target={target} selected={selected} offset={offset} />
}
```

In `src/ui/canvas/kinds/shape.tsx`:
- importa `arrowOffsets` da `@/editor/shape/geometry`, `type Arrow` da `@/model/shape/schema`, `ArrowEdge, ArrowEdgeView` da `../ShapeArrow` e `type EdgeViewProps` da `./registry`;
- `EdgesLayer` ed `EdgeView` diventano:

```tsx
/** Gli scarti di fascio si leggono qui, non in `ArrowEdge`: dipendono da tutte le frecce. */
function EdgesLayer() {
  const arrows = useStore(documentStore, (s) => shapeDiagram(s.doc).model.arrows)
  const offsets = arrowOffsets(arrows)
  return (
    <g data-layer="edges">
      {Object.keys(arrows).map((key) => <ArrowEdge key={key} arrowKey={key} offset={offsets.get(key) ?? 0} />)}
    </g>
  )
}
```

```tsx
function EdgeView({ edgeKey, relation, source, target, selected, offset }: EdgeViewProps) {
  return <ArrowEdgeView arrowKey={edgeKey} arrow={relation as Arrow} source={source} target={target} selected={selected} offset={offset} />
}
```

In `src/ui/canvas/Shape.test.tsx` aggiungi (importa `ArrowEdgeView` da `./ShapeArrow`):

```tsx
describe("ArrowEdgeView", () => {
  const a = { x: 0, y: 0, w: 100, h: 40 }
  const b = { x: 300, y: 0, w: 100, h: 40 }
  const arrow = (dashed: boolean) =>
    renderToStaticMarkup(<ArrowEdgeView arrowKey="f" arrow={{ source: "a", target: "b", head: "end", dashed }} source={a} target={b} selected={false} offset={0} />)

  it("la linea è tratteggiata solo se dashed", () => {
    expect(arrow(true)).toContain('stroke-dasharray="6 4"')
    expect(arrow(false)).not.toContain("stroke-dasharray")
  })

  it("si registra con la chiave con prefisso", () => {
    expect(arrow(false)).toContain('data-edge-id="shape/f"')
  })
})
```

- [ ] **Step 6: Il pannello della freccia**

`src/ui/panels/ShapeProperties.tsx` diventa:

```tsx
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { sessionStore } from "@/editor/session-store"
import { invertArrow, setArrowDashed, setArrowHead, setShapeLabel } from "@/editor/shape/commands"
import { shapeDiagram } from "@/editor/shape-access"
import { ArrowHeadSchema, type ArrowHead } from "@/model/shape/schema"
import { NoteTextField } from "./NoteProperties"

const dispatch = (recipe: Recipe) => documentStore.getState().dispatch(recipe)

/** Le voci della select «Punte», nell'ordine di `ArrowHeadSchema`. */
const ARROW_HEAD_LABEL: Readonly<Record<ArrowHead, string>> = { none: "Nessuna", end: "Alla fine", both: "Entrambe" }

function ShapeBody({ shapeKey: key }: { shapeKey: string }) {
  const shape = useStore(documentStore, (s) => shapeDiagram(s.doc).model.shapes[key])
  if (!shape) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <NoteTextField fieldId="shape-text" id={qualify("shape", key)} text={shape.label} onCommit={(label) => dispatch(setShapeLabel(key, label))} />
    </div>
  )
}

/** Punte, tratteggio e verso di una freccia (spec 3b §7): ogni modifica è un passo di annulla. */
function ArrowBody({ arrowKey: key }: { arrowKey: string }) {
  const arrow = useStore(documentStore, (s) => shapeDiagram(s.doc).model.arrows[key])
  if (!arrow) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-1">
        <Label htmlFor="arrow-head">Punte</Label>
        <select
          id="arrow-head"
          value={arrow.head}
          onChange={(e) => dispatch(setArrowHead(key, ArrowHeadSchema.parse(e.target.value)))}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {ArrowHeadSchema.options.map((head) => <option key={head} value={head}>{ARROW_HEAD_LABEL[head]}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="arrow-dashed" type="checkbox" checked={arrow.dashed} onChange={(e) => dispatch(setArrowDashed(key, e.target.checked))} />
        Tratteggiata
      </label>
      <Button variant="outline" size="sm" onClick={() => dispatch(invertArrow(key))}>
        Inverti
      </Button>
    </div>
  )
}

/** Corpo del pannello per le forme (spec 3b §7): una forma o una freccia, come garantisce `PropertiesPanel`. */
export function ShapeProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const node = familySelectedKeys(selection, "node", "shape")[0]
  if (node !== undefined) return <ShapeBody key={node} shapeKey={node} />
  const edge = familySelectedKeys(selection, "edge", "shape")[0]
  return edge === undefined ? null : <ArrowBody key={edge} arrowKey={edge} />
}
```

Crea `src/ui/panels/ShapeProperties.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { selId, sessionStore } from "@/editor/session-store"
import { shapeDiagram } from "@/editor/shape-access"
import { createDocument } from "@/model/document"
import { ShapeProperties } from "./ShapeProperties"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const arrow = () => shapeDiagram(documentStore.getState().doc).model.arrows["f"]!

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.shape.model.shapes = { a: { kind: "rect", label: "A" }, b: { kind: "ellipse", label: "B" } }
  doc.diagram.shape.model.arrows = { f: { source: "a", target: "b", head: "end", dashed: false } }
  doc.diagram.shape.view.nodes = { a: { x: 0, y: 0, collapsed: false, w: null, h: null }, b: { x: 300, y: 0, collapsed: false, w: null, h: null } }
  documentStore.getState().load(doc)
  sessionStore.getState().setSelection([selId("edge", qualify("shape", "f"))])
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(<ShapeProperties />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("pannello della freccia", () => {
  it("«Punte» ha le tre voci e cambia la punta", () => {
    const select = container.querySelector<HTMLSelectElement>("#arrow-head")!
    expect([...select.options].map((o) => o.textContent)).toEqual(["Nessuna", "Alla fine", "Entrambe"])
    act(() => {
      select.value = "both"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(arrow().head).toBe("both")
  })

  it("«Tratteggiata» e «Inverti» cambiano la freccia", () => {
    act(() => container.querySelector<HTMLInputElement>("#arrow-dashed")!.click())
    expect(arrow().dashed).toBe(true)
    const inverti = [...container.querySelectorAll("button")].find((b) => b.textContent === "Inverti")!
    act(() => inverti.click())
    expect(arrow()).toMatchObject({ source: "b", target: "a" })
  })
})
```

- [ ] **Step 7: L'export delle frecce**

In `src/ui/export/svg.test.ts`, nel `describe("buildSvg e le forme (spec 3b)")`, aggiungi:

```ts
  it("le frecce escono con punte e tratteggio; una freccia pendente non esce e non rompe l'export", () => {
    const doc = createDocument("export", "export")
    doc.diagram.shape.model.shapes = { a: { kind: "rect", label: "A" }, b: { kind: "ellipse", label: "B" } }
    doc.diagram.shape.model.arrows = {
      f: { source: "a", target: "b", head: "both", dashed: true },
      rotta: { source: "a", target: "sparita", head: "end", dashed: false },
    }
    doc.diagram.shape.view.nodes = {
      a: { x: 0, y: 0, collapsed: false, w: null, h: null },
      b: { x: 300, y: 0, collapsed: false, w: null, h: null },
    }
    const svg = buildSvg(doc, { vars: {} })!
    expect(svg).toContain('data-edge-id="shape/f"')
    expect(svg).toContain('stroke-dasharray="6 4"')
    expect(svg).not.toContain('data-edge-id="shape/rotta"')
    // Le frecce stanno nel layer degli archi, sopra le forme che collegano.
    expect(svg.indexOf('data-edge-id="shape/f"')).toBeGreaterThan(svg.indexOf('data-node-id="shape/a"'))
  })
```

Run: `pnpm vitest run src/ui`
Expected: PASS.

- [ ] **Step 8: Verifica e commit**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: tutto verde, senza warning.

```bash
git add -A src
git commit -m "feat(forme): le frecce fra forme, con punte, tratteggio e inversione

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Il ridimensionamento

Una forma selezionata da sola mostra una maniglia nell'angolo in basso a destra; il gesto è quello dei pool (`DiagramOps.resize`, guida durante il trascinamento, un passo di annulla al rilascio).

**Files:**
- Modify: `src/editor/shape/geometry.ts`, `src/editor/shape/geometry.test.ts`
- Modify: `src/editor/shape/commands.ts`, `src/editor/shape/commands.test.ts`
- Modify: `src/editor/kinds/shape.ts`, `src/editor/kinds/ops.ts`, `src/editor/kinds/canvas-ops.ts`, `src/editor/kinds/canvas-ops.test.ts`
- Modify: `src/ui/canvas/Shape.tsx`, `src/ui/canvas/Shape.test.tsx`

**Interfaces:**
- Consumes (Task 1): `shapeTextSize`, `shapeSize`, `shapeDiagram`, `shapeOps`, `ShapeNodeView`, `ShapeNode`.
- Produces:
  - Da `@/editor/shape/geometry`: `resizedShape(shape, view, dx: number, dy: number): { size: Size; w: number | null; h: number | null }`.
  - Da `@/editor/shape/commands`: `resizeShape(key: string, w: number | null, h: number | null): Recipe`.
  - `shapeOps.resize(key, lane, dx, dy)` (la `lane` è ignorata: una forma ha una maniglia sola).
  - `ShapeNodeView` guadagna la prop `handle?: boolean`.

- [ ] **Step 1: La regola del ridimensionamento**

In `src/editor/shape/geometry.ts` aggiungi `snap` all'import da `../geometry`, poi:

```ts
/**
 * Il ridimensionamento dall'angolo (spec 3b §5): la misura vera più il trascinamento, allineata alla
 * griglia e mai sotto quella del testo. `w`/`h` sono le misure scelte da scrivere nella view: `null`
 * dove la misura nuova non supera quella del testo, così portare la maniglia fino al testo riporta la
 * forma alla misura automatica (scostamento 3 del piano). `size` è il rettangolo da mostrare come guida.
 */
export function resizedShape(
  shape: Pick<Shape, "kind" | "label">,
  view: Pick<ShapeView, "w" | "h">,
  dx: number,
  dy: number,
): { size: Size; w: number | null; h: number | null } {
  const text = shapeTextSize(shape)
  const now = shapeSize(shape, view)
  const w = Math.max(text.w, snap(now.w + dx))
  const h = Math.max(text.h, snap(now.h + dy))
  return { size: { w, h }, w: w > text.w ? w : null, h: h > text.h ? h : null }
}
```

In `src/editor/shape/geometry.test.ts` aggiungi (importa `resizedShape`):

```ts
describe("ridimensionamento", () => {
  const vuoto = { kind: "rect" as const, label: "" }

  it("allarga della distanza trascinata, allineata alla griglia", () => {
    // 60 × 40 + (103, 47) → 163 → 160, 87 → 90.
    expect(resizedShape(vuoto, { w: null, h: null }, 103, 47)).toEqual({ size: { w: 160, h: 90 }, w: 160, h: 90 })
  })

  it("non scende sotto il testo, e fino al testo torna alla misura automatica", () => {
    expect(resizedShape(vuoto, { w: 200, h: 100 }, -500, -500)).toEqual({ size: { w: 60, h: 40 }, w: null, h: null })
  })
})
```

- [ ] **Step 2: Il comando e `shapeOps.resize`**

In `src/editor/shape/commands.ts` aggiungi:

```ts
/** Scrive la misura scelta a mano di una forma: un solo passo di annulla, e niente se non cambia. */
export function resizeShape(key: string, w: number | null, h: number | null): Recipe {
  return (draft) => {
    const view = shapeDiagram(draft).view.nodes[key]
    if (!view) return
    if (view.w !== w) view.w = w
    if (view.h !== h) view.h = h
  }
}
```

In `src/editor/kinds/shape.ts` importa `resizeShape` da `../shape/commands` e `resizedShape` da `../shape/geometry`, e aggiungi dopo `layoutGraph`:

```ts
    // Una forma ha una maniglia sola, nell'angolo in basso a destra: `lane` non si usa (spec 3b §5).
    resize: (key, _lane, dx, dy) => {
      const d = diagram()
      const shape = d.model.shapes[key]
      const view = d.view.nodes[key]
      if (!shape || !view) return null
      const next = resizedShape(shape, view, dx, dy)
      return { rect: { x: view.x, y: view.y, ...next.size }, recipe: resizeShape(key, next.w, next.h) }
    },
```

Nel docblock di `DiagramOps.resize` (`src/editor/kinds/ops.ts`) sostituisci la prima frase con: «Il ridimensionamento da una maniglia: di un pool dal suo bordo destro (`lane` `null`) o di una sua corsia dal bordo inferiore (`lane` = id della corsia, spec 2b §5); di una forma dal suo angolo in basso a destra, con `lane` sempre `null` (spec 3b §5).» Nel docblock di `CanvasOps.resize` (`src/editor/kinds/canvas-ops.ts`) «di un frame» diventa «di un frame o di una forma».

In `src/editor/shape/commands.test.ts` aggiungi (importa `resizeShape`):

```ts
describe("resizeShape", () => {
  it("scrive la misura scelta, e la stessa misura non aggiunge una voce di annulla", () => {
    tre()
    expect(state().dispatch(resizeShape("b", 200, 120))).toBe(true)
    expect(part().view.nodes["b"]).toMatchObject({ w: 200, h: 120 })
    expect(state().dispatch(resizeShape("b", 200, 120))).toBe(false)
  })
})
```

In `src/editor/kinds/canvas-ops.test.ts`, nel `describe("canvasOps e le forme (spec 3b)")`, aggiungi:

```ts
  it("resize allarga la forma in un passo di annulla, e riportata al testo torna automatica", () => {
    const s = add("shape", { x: 0, y: 0 }, "rect")
    const view = () => shapeDiagram(state().doc).view.nodes[splitKey(s).key]!
    const grande = canvasOps(state().doc).resize(s, null, 100, 60)!
    expect(grande.rect).toEqual({ x: 0, y: 0, w: 160, h: 100 })
    state().dispatch(grande.recipe)
    expect(view()).toMatchObject({ w: 160, h: 100 })
    const indietro = canvasOps(state().doc).resize(s, null, -100, -60)!
    state().dispatch(indietro.recipe)
    expect(view()).toMatchObject({ w: null, h: null })
    state().undo()
    expect(view()).toMatchObject({ w: 160, h: 100 })
  })
```

Run: `pnpm vitest run src/editor`
Expected: PASS.

- [ ] **Step 3: La maniglia**

In `src/ui/canvas/Shape.tsx`:
- aggiungi alle props `/** Mostra la maniglia di ridimensionamento: solo per la forma selezionata da sola. */ handle?: boolean`;
- sopra il componente: `/** Lato della maniglia di ridimensionamento, in unità mondo: lo stesso dei pool. */ const HANDLE = 8`;
- nella firma `({ id, shape, view, selected, handle = false }: Props)`;
- come ultimo figlio del `<g>`, dopo il testo:

```tsx
      {/* `data-resize` con la chiave della forma: `hitTest` la guarda prima del nodo, come per i pool (spec 3b §5). */}
      {handle && (
        <rect
          data-resize={id}
          x={w - HANDLE / 2}
          y={h - HANDLE / 2}
          width={HANDLE}
          height={HANDLE}
          fill="var(--primary)"
          style={{ cursor: "nwse-resize" }}
        />
      )}
```

- `ShapeNode` legge anche se la forma è selezionata da sola:

```tsx
  const alone = useStore(sessionStore, (s) => s.selection.size === 1 && s.selection.has(selId("node", id)))
  if (!shape || !view) return null
  return <ShapeNodeView id={id} shape={shape} view={view} selected={selected} handle={alone} />
```

In `src/ui/canvas/Shape.test.tsx`, nel `describe("ShapeNodeView")`, aggiungi:

```tsx
  it("la maniglia c'è solo quando la si chiede, con la chiave della forma", () => {
    const con = renderToStaticMarkup(<ShapeNodeView id="shape/a" shape={{ kind: "rect", label: "" }} view={view} selected={true} handle />)
    expect(con).toContain('data-resize="shape/a"')
    expect(html("rect", "")).not.toContain("data-resize")
  })
```

- [ ] **Step 4: Verifica e commit**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: tutto verde, senza warning.

```bash
git add -A src
git commit -m "feat(forme): la maniglia allarga una forma, mai sotto il suo testo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: E2E delle forme, README e debito tecnico

**Files:**
- Create: `scripts/e2e/forme.mjs`
- Modify: `scripts/e2e/run.mjs`
- Modify: `README.md`
- Modify: `docs/debito-tecnico.md`

**Interfaces:**
- Consumes: tutto il comportamento dei task precedenti, dal browser. Una forma sul canvas è `[data-node-id^="shape/"]`, una freccia `[data-edge-id^="shape/"]` con i path `[data-edge-line]`, `[data-edge-source]`, `[data-edge-target]`; l'editor del testo `[aria-label="Testo della forma"]`; la maniglia `[data-resize^="shape/"]`; il pannello della freccia ha `#arrow-head`, `#arrow-dashed` e il pulsante «Inverti»; la barra degli avvisi è `[data-notice-bar]`.
- Produces: nessuna firma.

- [ ] **Step 1: Lo scenario delle forme**

Crea `scripts/e2e/forme.mjs`:

```js
/**
 * End-to-end delle forme generiche (spec 3b §11): Rettangolo (`Q`) ed Ellisse (`O`) nascono col testo
 * aperto; Collega fra le due crea una freccia; dal pannello si cambiano punte e tratteggio e la si
 * inverte; la maniglia allarga il rettangolo e ⌘Z lo riporta com'era; una nota si ancora al
 * rettangolo; «Disponi» tiene freccia e nota; Collega fra una forma e un'entità è rifiutato.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/forme.mjs`. `HEADLESS=0` per vedere.
 */
import { expectText, isMainModule, startEnv } from "./helpers.mjs"

const SHAPE = '[data-node-id^="shape/"]'
const ARROW = '[data-edge-id^="shape/"]'
const NOTE = '[data-node-id^="note/"]'

/** Rettangolo schermo di un locator. */
async function boxOf(locator) {
  const box = await locator.first().boundingBox()
  if (!box) throw new Error("elemento senza riquadro")
  return { x: box.x, y: box.y, w: box.width, h: box.height }
}

/** Trascina con eventi veri da `from` a `to`. */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** Un punto schermo **sulla** freccia, a metà della sua lunghezza: il centro del riquadro di una linea a gomito cade nel vuoto. */
async function pointOnArrow(page) {
  return page.evaluate((sel) => {
    const path = document.querySelector(`${sel} [data-edge-hit]`)
    const p = path.getPointAtLength(path.getTotalLength() / 2)
    const m = path.getScreenCTM()
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
  }, ARROW)
}

/** L'attributo `d` di un path della freccia. */
const arrowPath = (page, part) => page.locator(`${ARROW} [data-edge-${part}]`).getAttribute("d")

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

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on("pageerror", (e) => pageErrors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()))
  await page.addInitScript(() => {
    window.__rejections = []
    addEventListener("unhandledrejection", (e) => window.__rejections.push(String(e.reason?.stack ?? e.reason)))
  })

  const shapeEditor = page.locator('[aria-label="Testo della forma"]')
  const rettangolo = page.locator(SHAPE, { hasText: "API Gateway" })
  const ellisse = page.locator(SHAPE, { hasText: "Ordini" })

  /** Scrive nell'editor della forma appena aperto e lo chiude. */
  async function write(text) {
    await shapeEditor.waitFor()
    await shapeEditor.fill(text)
    await shapeEditor.blur()
    await shapeEditor.waitFor({ state: "detached" })
  }

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")
    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("Rettangolo (Q) ed Ellisse (O) nascono con il testo aperto", async () => {
      await page.keyboard.press("q")
      await page.mouse.click(canvas.x + 200, canvas.y + 150)
      await write("API Gateway")
      await page.keyboard.press("o")
      await page.mouse.click(canvas.x + 650, canvas.y + 150)
      await write("Ordini")
      await expectText(page, SHAPE, "API Gateway")
      await expectText(page, SHAPE, "Ordini")
    })

    await step("Collega dal rettangolo all'ellisse crea una freccia con la punta alla fine", async () => {
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(rettangolo)), center(await boxOf(ellisse)))
      await page.waitForSelector(ARROW)
      if ((await arrowPath(page, "source")) !== "") throw new Error("la freccia nuova ha una punta anche all'inizio")
      if (!(await arrowPath(page, "target"))) throw new Error("la freccia nuova non ha la punta alla fine")
    })

    await step("dal pannello: punte, tratteggio e «Inverti»", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      const p = await pointOnArrow(page)
      await page.mouse.click(p.x, p.y)
      await page.selectOption("#arrow-head", "both")
      await page.waitForFunction((sel) => document.querySelector(`${sel} [data-edge-source]`)?.getAttribute("d") !== "", ARROW)
      await page.check("#arrow-dashed")
      await page.waitForFunction((sel) => document.querySelector(`${sel} [data-edge-line]`)?.getAttribute("stroke-dasharray") === "6 4", ARROW)
      const before = await arrowPath(page, "line")
      await page.getByRole("button", { name: "Inverti" }).click()
      await page.waitForFunction(([sel, d]) => document.querySelector(`${sel} [data-edge-line]`)?.getAttribute("d") !== d, [ARROW, before])
      await page.selectOption("#arrow-head", "none")
      await page.waitForFunction((sel) => document.querySelector(`${sel} [data-edge-target]`)?.getAttribute("d") === "", ARROW)
    })

    await step("la maniglia allarga il rettangolo, e ⌘Z lo riporta com'era", async () => {
      await page.keyboard.press("Escape")
      const c = center(await boxOf(rettangolo))
      await page.mouse.click(c.x, c.y)
      const handle = page.locator('[data-resize^="shape/"]')
      await handle.waitFor()
      const before = await boxOf(rettangolo)
      await drag(page, center(await boxOf(handle)), { x: before.x + before.w + 120, y: before.y + before.h + 60 })
      await page.waitForFunction(
        ([sel, w]) => [...document.querySelectorAll(sel)].some((el) => el.textContent.includes("API Gateway") && el.getBoundingClientRect().width > w + 50),
        [SHAPE, before.w],
      )
      await page.keyboard.press("ControlOrMeta+z")
      await page.waitForFunction(
        ([sel, w]) => [...document.querySelectorAll(sel)].some((el) => el.textContent.includes("API Gateway") && Math.abs(el.getBoundingClientRect().width - w) < 2),
        [SHAPE, before.w],
      )
    })

    await step("una nota si ancora al rettangolo", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("n")
      await page.mouse.click(canvas.x + 200, canvas.y + 450)
      const noteEditor = page.locator('[aria-label="Testo della nota"]')
      await noteEditor.waitFor()
      await noteEditor.fill("da rivedere")
      await noteEditor.blur()
      await noteEditor.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(page.locator(NOTE))), center(await boxOf(rettangolo)))
      await page.waitForSelector('[data-edge-id^="note/"]')
      await expectText(page, "body", "Ancorata a:")
    })

    await step("«Disponi» tiene la freccia fra le forme e la nota accanto al rettangolo", async () => {
      await page.keyboard.press("Escape")
      const gap = async () => {
        const n = await boxOf(page.locator(NOTE))
        const r = await boxOf(rettangolo)
        return { x: Math.round(n.x - r.x), y: Math.round(n.y - r.y) }
      }
      const before = await gap()
      const spread = async () => (await boxOf(ellisse)).x - (await boxOf(rettangolo)).x
      const spreadBefore = await spread()
      await page.getByRole("button", { name: "Disponi" }).click()
      // Le due forme stanno fianco a fianco; con la freccia come arco dall'alto in basso, Disponi le
      // mette una sopra l'altra, e la distanza orizzontale fra loro crolla. Non si aspetta che si muova
      // una forma in particolare: l'origine del blocco la decide l'impacchettamento. Il worker di
      // elkjs nasce alla prima richiesta, come in `layout.mjs`.
      await page.waitForFunction(
        ([sel, d0]) => {
          const x = (text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text))?.getBoundingClientRect().x
          const d = x("Ordini") - x("API Gateway")
          return Math.abs(d - d0) > 50
        },
        [SHAPE, spreadBefore],
        { timeout: 30_000 },
      )
      if ((await page.locator(ARROW).count()) !== 1) throw new Error("la freccia è sparita con Disponi")
      const after = await gap()
      if (Math.abs(after.x - before.x) > 2 || Math.abs(after.y - before.y) > 2) {
        throw new Error(`la nota non ha seguito il rettangolo: scarto prima ${JSON.stringify(before)}, dopo ${JSON.stringify(after)}`)
      }
    })

    await step("Collega fra una forma e un'entità è rifiutato con l'avviso", async () => {
      await page.keyboard.press("e")
      await page.mouse.click(canvas.x + 900, canvas.y + 650)
      await page.keyboard.press("Escape") // chiude l'editor del nome
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(rettangolo)), center(await boxOf(page.locator('[data-node-id^="er/"]'))))
      await expectText(page, "[data-notice-bar]", "Non esiste un collegamento fra una forma e un'entità.")
      if ((await page.locator('[data-edge-id^="link/"]').count()) !== 0) throw new Error("è nato un collegamento fra una forma e un'entità")
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (forme):", e)
  }
  console.log(failed ? "\ne2e forme: FAIL" : "\ne2e forme: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/forme.mjs` esegue solo questo scenario. */
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

Lo script non è mai stato eseguito: selettori, coordinate e attese possono chiedere aggiustamenti contro l'app vera. Mantieni **ogni verifica**; se un comportamento dell'app non corrisponde e la spec dà ragione allo script, non cambiare l'app: fermati e riportalo.

- [ ] **Step 2: `run.mjs`**

In `scripts/e2e/run.mjs`: importa `run as runForme` da `./forme.mjs` (in ordine alfabetico fra gli import), lancialo dopo `runNote` (`const formeOk = await runForme(browser, base)`), aggiungi `&& formeOk` alla somma finale, e nel docblock in testa, se elenca gli scenari, aggiungi `node scripts/e2e/forme.mjs`.

- [ ] **Step 3: README**

In `README.md`:
- in «Disegna», dopo il punto **Note** e prima di **Collegamenti fra famiglie**, aggiungi:

```markdown
- **Forme**: una lavagna libera accanto alle famiglie tipizzate — rettangolo (`Q`), ellisse (`O`) e
  testo (`T`), con frecce fra loro disegnate con Collega. Le forme non hanno semantica né
  validazione di dominio: servono a schemi di architettura, zone e titoli. Stanno sotto tutto, anche
  sotto archi e pool, così una zona non copre ciò che racchiude; nascono della misura del loro testo
  e si allargano dalla maniglia nell'angolo. Una freccia ha la punta alla fine, a entrambi i capi o
  in nessuno, continua o tratteggiata, e si inverte dal pannello. Escono in SVG e PNG, non in
  Mermaid; «Disponi» le dispone in un blocco loro, e una zona disegnata attorno ad altri elementi non
  li racchiude più dopo.
```

- nell'ultimo paragrafo di **Collegamenti fra famiglie** («I collegamenti seguono le rinomine…»), aggiungi in fondo: «Collega fra una forma e un elemento di un'altra famiglia non crea niente, e lo dice.»
- nella tabella delle scorciatoie, dopo la riga di `V`:

```markdown
| `Q` · `O` · `T` | rettangolo · ellisse · testo (forme) |
```

- nella lista degli scenari di «Test end-to-end», dopo il punto **Nota**, aggiungi un punto **Forme** con lo stesso stile degli altri: «crea un rettangolo e un'ellisse, li collega con una freccia, ne cambia punte e tratteggio e la inverte dal pannello, allarga il rettangolo dalla maniglia e annulla, ci ancora una nota, verifica che «Disponi» tenga freccia e nota, e che Collega fra una forma e un'entità sia rifiutato.»

- [ ] **Step 4: Debito tecnico**

In `docs/debito-tecnico.md`, nella sezione d'archivio dove stanno le voci per step (quella che ha già «La nota unica»), aggiungi nello stesso stile una voce **«Le forme generiche (3b)»** con questi punti, ciascuno con la motivazione del rinvio:

- **Disponi e le zone.** Un rettangolo disegnato attorno a elementi di altre famiglie finisce nel blocco delle forme, e gli elementi che racchiudeva nei blocchi delle loro famiglie: dopo Disponi la zona non li racchiude più. Tenere le zone fuori da Disponi non risolve niente, perché i nodi si sposterebbero comunque. Da riprendere se le zone attorno alle famiglie diventano l'uso principale (spec 3b §10).
- **Una zona non porta con sé ciò che contiene** quando la si trascina: il contenitore vero resta il pool.
- **La selezione a riquadro non parte da dentro una zona**: il clic sul fondo prende la zona, come sul fondo di un pool.
- **Niente colori, niente etichetta sulle frecce, niente Mermaid per le forme, `kind` fisso**: scelte del brainstorming (spec 3b §12), non dimenticanze.

- [ ] **Step 5: Verifica e commit**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: tutto verde; `pnpm e2e` con dodici scenari, `forme` compreso.

```bash
git add scripts/e2e/forme.mjs scripts/e2e/run.mjs README.md docs/debito-tecnico.md
git commit -m "test(e2e): le forme generiche, README e debito tecnico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
