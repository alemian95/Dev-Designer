# La nota unica (step 3a) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le due note di oggi (la nota di classe e la forma «nota» del flowchart) diventano una sola nota, in una quarta famiglia `note`, libera o ancorata a un solo elemento del canvas: entità, classe, nodo di flusso o pool.

**Architecture:** `FAMILIES` diventa `["er", "class", "flow", "note"]` e il documento guadagna `diagram.note = { model: { notes }, view: { nodes } }`. Una nota è `{ text, anchor: string | null }`, dove `anchor` è una chiave con prefisso. Dentro la famiglia la nota si comporta come un nodo qualunque (`DiagramOps`); la linea di ancoraggio, che attraversa le famiglie, la gestisce `CanvasOps` con le funzioni di `editor/note/anchor.ts`, come fa già con i collegamenti. La migrazione 6 → 7 travasa le note di classe e le note-forma del flusso, e le vecchie note spariscono dal modello.

**Tech Stack:** React 19 + TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedLocals`), zustand (vanilla store), Immer (recipe con patch), zod 4, Vitest, e2e con Playwright su `vite preview` (`pnpm e2e`).

**Spec:** `docs/superpowers/specs/2026-09-26-nota-unica-design.md`

## Scostamenti dalla spec, decisi scrivendo il piano

1. **`view.nodes` delle note usa `NodeViewSchema`** (`{ x, y, collapsed }`), non `{ x, y }`. `moveNodes`, `applyLayout`, `diagramView` e l'export leggono `view.nodes` con la stessa forma in ogni famiglia: una forma diversa avrebbe chiesto un ramo in ognuno. `collapsed` a una nota non si applica e resta `false`. Il Task 4 corregge la §3 della spec.
2. **Le note ancorate seguono con Disponi grazie a un passo finale esplicito** (`followAnchors`, in `layoutAll`), non grazie all'ordine di `FAMILIES`. Il passo legge le posizioni vecchie dal documento di partenza e quelle nuove dal draft dopo tutte le famiglie, quindi non dipende da quale famiglia gira per ultima. Il Task 4 corregge la §6.
3. **La famiglia nasce nel Task 1, il travaso arriva nel Task 2.** Nel Task 1 la migrazione 6 → 7 aggiunge soltanto la parte `note` vuota; il Task 2 la sostituisce con quella completa. Fra i due task le note di classe dei documenti esistenti si vedono, si spostano e si modificano dal pannello, ma il doppio clic non apre più il loro editor sul canvas; lo strumento «Nota di classe» sparisce già nel Task 1 per lasciare il tasto `N` alla nota unica.
4. **Dal Task 1 al Task 3 gli e2e `class-note.mjs` e `collegamenti.mjs` sono rossi per costruzione**: il primo usa lo strumento «Nota di classe», il secondo la forma «Nota di flusso» (tasto `6`). Li riscrive il Task 4, l'unico che lancia `pnpm e2e`.
5. **`anchorExists` vive nel modello** (`model/note/validate.ts`) ed è la sola regola «l'àncora nomina un elemento che c'è»: la usano la validazione, il gesto Collega e Disponi.
6. **Una rinomina sposta anche le àncore.** Entità e classi hanno per chiave il nome: rinominarle cambia la chiave, e senza correzione la nota diventerebbe pendente. `followRename` (`links/commands.ts`) già segue i collegamenti; ora segue anche le àncore (Review Focus 1).
7. **`endName` impara i pool**, perché il pannello della nota mostra il nome dell'elemento ancorato, e un pool ha per chiave un uuid.
8. **Lo schema rifiuta un'àncora senza famiglia** (per esempio `"ordini"` invece di `"er/ordini"`), oltre a quella nella famiglia `note`: un'àncora così non è pendente, è malformata, come un estremo di collegamento con la famiglia sbagliata.

## Global Constraints

- Lingua: commenti, docblock, messaggi e nomi dei test in italiano; identificatori in inglese, come nel codice esistente.
- Nessuna dipendenza nuova.
- `src/model` non importa `src/editor`, `src/io` né `src/ui`. `src/editor` non importa React né `src/io`. Sono regole ESLint già attive.
- Chiavi: famiglie `${family}/${key}` solo con `qualify`/`splitKey` (`src/editor/families.ts`, `src/model/family.ts`). La chiave sul canvas di una nota è `qualify("note", key)`, e la sua linea di ancoraggio ha **la stessa chiave** (nodi e archi hanno registri e selezioni separati: `selId("node", …)` e `selId("edge", …)`).
- `SCHEMA_VERSION` passa da 6 a 7.
- Testi esatti:
  - Strumento: etichetta `Nota`, tasto `n`, gruppo della sidebar `Note`.
  - Pannello: campo `Testo`; riga `Ancorata a: <nome>` con il pulsante `Stacca`, oppure `Libera`.
  - Problema: codice `note-dangling-anchor`, messaggio `La nota è ancorata a un elemento che non c'è.`
  - Avviso del Mermaid del flowchart: `1 nota ancorata al flusso non è uscita: i flowchart di Mermaid non hanno note.` / `N note ancorate al flusso non sono uscite: i flowchart di Mermaid non hanno note.`
  - Avviso del Mermaid ER: `1 nota ancorata a un'entità non è uscita: i diagrammi ER di Mermaid non hanno note.` / `N note ancorate a entità non sono uscite: i diagrammi ER di Mermaid non hanno note.`
- Ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Messaggi in stile repo: `feat(ambito): …` in italiano.
- Verifiche a fine task: `pnpm tsc -b`, `pnpm lint`, `pnpm test` verdi. `pnpm e2e` solo nel Task 4 (scostamento 4).
- **Non lanciare `pnpm perf`.**
- I dump reali `spike/fixtures/postgres.sql` e `mysql.sql` non compaiono mai in un test.

## Review Focus

Casi che la spec implica ma che i suoi test non nominano. Per ciascuno il test sta nel task che possiede il codice:

1. **Rinominare un'entità o una classe ancorata.** La chiave cambia col nome; la nota deve restare ancorata al nuovo nome, non diventare pendente. → Task 1, test di `followRename`.
2. **Eliminare un pool ancorato.** Il pool è un frame, non un nodo, ma la nota ancorata deve staccarsi come per un nodo. → Task 1, test di `canvasOps.deleteItems` su `flow/p1`.
3. **Annullare un'eliminazione che ha staccato delle note.** Un solo ⌘Z riporta l'elemento **e** le àncore. → Task 1, test di `canvasOps.deleteItems` con `undo`.
4. **Collega verso l'àncora che la nota ha già.** Nessuna voce di annulla vuota: il risultato è `existing`, non `created`. → Task 1, test di `canvasOps.addEdge`.
5. **Un file v6 con una nota di flusso collegata a un nodo dentro un pool.** La nota si ancora al nodo, il pool resta valido, gli archi della nota spariscono e gli altri no. → Task 2, test della migrazione.

---

### Task 1: La famiglia delle note

Il task aggiunge la quarta famiglia, con tutto quello che serve per crearla, disegnarla, ancorarla, staccarla, modificarla ed esportarla in SVG. Le note di classe e le note-forma del flusso restano nel modello: le travasa il Task 2.

**Files:**
- Create: `src/model/note/schema.ts`, `src/model/note/schema.test.ts`
- Create: `src/model/note/validate.ts`, `src/model/note/validate.test.ts`
- Modify: `src/model/family.ts`, `src/model/document.ts`, `src/model/shared.ts`, `src/model/issue.ts`
- Modify: `src/model/migrations.ts`, `src/model/migrations.test.ts`
- Modify: `src/model/links/labels.ts`, `src/model/links/labels.test.ts`, `src/model/links/validate.ts`
- Create: `src/editor/note-access.ts`
- Create: `src/editor/note/geometry.ts`, `src/editor/note/geometry.test.ts`
- Create: `src/editor/note/commands.ts`, `src/editor/note/commands.test.ts`
- Create: `src/editor/note/anchor.ts`
- Create: `src/editor/kinds/note.ts`
- Modify: `src/editor/kinds/ops.ts`, `src/editor/kinds/canvas-ops.ts`, `src/editor/kinds/canvas-ops.test.ts`
- Modify: `src/editor/links/commands.ts`, `src/editor/links/commands.test.ts`
- Modify: `src/editor/class/geometry.ts`, `src/editor/class/geometry.test.ts`, `src/editor/class/commands.ts`, `src/editor/kinds/class.ts`, `src/editor/flow/geometry.ts`
- Create: `src/ui/canvas/Note.tsx`, `src/ui/canvas/Note.test.tsx`, `src/ui/canvas/NoteAnchor.tsx`
- Create: `src/ui/canvas/kinds/note.tsx`
- Create: `src/ui/panels/NoteProperties.tsx`, `src/ui/panels/NoteProperties.test.tsx`
- Modify: `src/ui/canvas/ClassNote.tsx`, `src/ui/canvas/class-render.test.tsx`, `src/ui/canvas/kinds/class.tsx`, `src/ui/canvas/kinds/registry.ts`, `src/ui/canvas/kinds/registry.test.ts`
- Modify: `src/ui/canvas/LinkEdge.tsx`, `src/ui/canvas/NoteEditor.tsx`, `src/ui/canvas/InlineEditor.tsx`, `src/ui/canvas/use-canvas-interaction.ts`
- Modify: `src/ui/panels/ClassProperties.tsx`
- Modify: `src/ui/export/svg.tsx`, `src/ui/export/svg.test.ts`, `src/ui/export/TextExportDialog.tsx`

**Interfaces:**
- Produces:
  - Da `@/model/note/schema`: `NoteSchema`, `type Note = { text: string; anchor: string | null }`, `NoteModelSchema`, `type NoteModel = { notes: Record<string, Note> }`, `NoteDiagramSchema`, `type NoteDiagram`, `emptyNoteDiagram(): NoteDiagram`.
  - Da `@/model/note/validate`: `anchorExists(doc: DevDocument, anchor: string): boolean`, `validateNotes(doc: DevDocument): Issue[]`.
  - `FAMILIES = ["er", "class", "flow", "note"]`; `DiagramSchema` ha `note`; `SCHEMA_VERSION = 7`; `IssueCode` ha `"note-dangling-anchor"`.
  - Da `@/editor/note-access`: `noteDiagram(doc): NoteDiagram`.
  - Da `@/editor/note/geometry`: `noteSize(note: Pick<Note, "text">): Size`, `noteRect(note: Pick<Note, "text">, view: NodeView): Rect`, `notePath(w, h): { body; fold }`, `anchorGeometry(source: Rect, target: Rect): EdgeGeometry`. Spariscono da `@/editor/class/geometry`.
  - Da `@/editor/note/commands`: `addNote(at: Point): { key; recipe }`, `setNoteText(key, text): Recipe`, `detachNotes(keys: readonly string[]): Recipe`, `deleteNoteItems(nodeKeys, edgeKeys): Recipe | null`, `duplicateNotes(model: NoteModel, keys): { keys: string[]; recipe: Recipe }`, `noteLayoutGraph(doc: DevDocument): LayoutGraph`.
  - Da `@/editor/note/anchor`: `anchorNote(doc, from, to): ConnectResult | null`, `anchorsTouching(doc, keys: ReadonlySet<string>): EdgeEnds[]`, `detachAnchoredTo(doc, keys: ReadonlySet<string>): Recipe | null`, `retargetAnchors(oldKey, newKey): Recipe`. Chiavi con prefisso.
  - Da `@/editor/kinds/note`: `noteOps(doc): DiagramOps`.
  - Da `@/ui/canvas/Note`: `NoteView({ id, note, view, selected })` (`id` con prefisso), `NoteNode({ nodeKey })`.
  - Da `@/ui/canvas/NoteAnchor`: `AnchorEdgeView({ noteKey, source, target, selected })`, `AnchorEdge({ noteKey })`.
  - Da `@/ui/canvas/LinkEdge`: `useNodeRect(key: string | undefined): Rect | null` (esportato).
  - Da `@/ui/panels/NoteProperties`: `NoteTextField({ id, text, onCommit })` (la sola lettura la decide da sé, dall'editing in corso), `NoteProperties()`.

- [ ] **Step 1: Il modello della famiglia**

`src/model/family.ts`: `FAMILIES` diventa

```ts
export const FAMILIES = ["er", "class", "flow", "note"] as const
```

Nel docblock di `qualify` aggiungi l'esempio `note/…`: `` `er/utenti`, `class/Ordine`, `flow/n3`, `note/…` ``.

Crea `src/model/note/schema.ts`:

```ts
import * as z from "zod"
import { FAMILIES, inFamily } from "../family"
import { Identifier, NodeViewSchema } from "../shared"

/** `true` se `anchor` è la chiave con prefisso di un elemento di una famiglia che non è `note`. */
const anchorsElsewhere = (anchor: string): boolean => FAMILIES.some((f) => f !== "note" && inFamily(anchor, f))

/**
 * Una nota (spec 3a §3): testo libero, libera (`anchor: null`) o ancorata a **un solo** elemento.
 * `anchor` è la chiave con prefisso dell'elemento (`er/ordini`, `class/Ordine`, `flow/n3`,
 * `flow/<pool>`), come gli estremi di un collegamento: l'àncora attraversa le famiglie per
 * definizione. Lo schema rifiuta un'àncora senza famiglia o nella famiglia `note`, e **non**
 * controlla che l'elemento esista: un'àncora pendente è un problema di validazione
 * (`note-dangling-anchor`), non un file illeggibile.
 */
export const NoteSchema = z.object({
  text: z.string(),
  anchor: Identifier.nullable().refine((a) => a === null || anchorsElsewhere(a), {
    message: "l'àncora di una nota è la chiave con prefisso di un elemento di un'altra famiglia",
  }),
})
export type Note = z.infer<typeof NoteSchema>

/** Chiave = uuid: una nota non ha nome, e il testo cambia a ogni battitura. */
export const NoteModelSchema = z.object({ notes: z.record(z.string(), NoteSchema) })
export type NoteModel = z.infer<typeof NoteModelSchema>

/**
 * La `view` riusa `NodeViewSchema` come le altre famiglie: `collapsed` a una nota non si applica e
 * resta `false`, ma `moveNodes`, `applyLayout` e l'export leggono `view.nodes` con la stessa forma
 * in ogni famiglia, senza un ramo per le note.
 */
export const NoteDiagramSchema = z.object({
  model: NoteModelSchema,
  view: z.object({ nodes: z.record(z.string(), NodeViewSchema) }),
})
export type NoteDiagram = z.infer<typeof NoteDiagramSchema>

/** Una parte di note vuota: la forma di una famiglia senza elementi. */
export function emptyNoteDiagram(): NoteDiagram {
  return { model: { notes: {} }, view: { nodes: {} } }
}
```

`src/model/document.ts`: importa `emptyNoteDiagram, NoteDiagramSchema` da `./note/schema`; `DiagramSchema` diventa

```ts
export const DiagramSchema = z.object({
  er: ErDiagramSchema,
  class: ClassDiagramSchema,
  flow: FlowDiagramSchema,
  note: NoteDiagramSchema,
  links: LinksSchema,
})
```

e `createDocument` scrive `diagram: { er: emptyErDiagram(), class: emptyClassDiagram(), flow: emptyFlowDiagram(), note: emptyNoteDiagram(), links: {} }`. Il docblock di `createDocument` diventa «Il solo modo di creare un documento: quattro famiglie vuote e nessun collegamento.».

`src/model/shared.ts`: `export const SCHEMA_VERSION = 7`.

`src/model/issue.ts`: dopo la riga dei collegamenti aggiungi

```ts
  // note
  | "note-dangling-anchor"
```

- [ ] **Step 2: I test dello schema**

Crea `src/model/note/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createDocument, DocumentSchema } from "../document"
import { NoteSchema } from "./schema"

describe("NoteSchema", () => {
  it("una nota libera e una ancorata a un elemento di qualunque altra famiglia passano", () => {
    for (const anchor of [null, "er/ordini", "class/Ordine", "flow/n1", "flow/pool-1"]) {
      expect(NoteSchema.safeParse({ text: "x", anchor }).success).toBe(true)
    }
  })

  it("un'àncora nella famiglia delle note, o senza famiglia, rende la nota non valida", () => {
    expect(NoteSchema.safeParse({ text: "x", anchor: "note/n2" }).success).toBe(false)
    expect(NoteSchema.safeParse({ text: "x", anchor: "ordini" }).success).toBe(false)
    expect(NoteSchema.safeParse({ text: "x", anchor: "er/" }).success).toBe(false)
  })

  it("un'àncora pendente passa: la segnala la validazione, non lo schema", () => {
    const doc = createDocument("t", "t")
    doc.diagram.note.model.notes["n1"] = { text: "", anchor: "er/fantasma" }
    doc.diagram.note.view.nodes["n1"] = { x: 0, y: 0, collapsed: false }
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("un documento nuovo nasce con la parte delle note vuota", () => {
    expect(createDocument("t", "t").diagram.note).toEqual({ model: { notes: {} }, view: { nodes: {} } })
  })
})
```

- [ ] **Step 3: La validazione e l'esistenza dell'àncora**

Crea `src/model/note/validate.ts`:

```ts
import type { DevDocument } from "../document"
import { splitKey } from "../family"
import type { Issue } from "../issue"

/**
 * `true` se l'àncora nomina un elemento che c'è: un'entità, una classe, un nodo di flusso o un pool
 * (spec 3a §2). È la sola definizione: la usano la validazione qui sotto, il gesto Collega
 * (`editor/note/anchor.ts`) e Disponi, che tratta come libera una nota con l'àncora pendente.
 * `anchor` ha già il prefisso di una famiglia: lo garantisce `NoteSchema`, quindi `splitKey` non lancia.
 */
export function anchorExists(doc: DevDocument, anchor: string): boolean {
  const { family, key } = splitKey(anchor)
  const d = doc.diagram
  switch (family) {
    case "er":
      return d.er.model.entities[key] !== undefined
    case "class":
      return d.class.model.classes[key] !== undefined
    case "flow":
      return d.flow.model.nodes[key] !== undefined || d.flow.model.pools[key] !== undefined
    case "note":
      return false
  }
}

/** I problemi delle note: solo l'àncora pendente (spec 3a §9). `node` è la chiave della nota, senza prefisso. */
export function validateNotes(doc: DevDocument): Issue[] {
  return Object.entries(doc.diagram.note.model.notes).flatMap(([key, note]): Issue[] =>
    note.anchor !== null && !anchorExists(doc, note.anchor)
      ? [{ code: "note-dangling-anchor", severity: "error", node: key, message: "La nota è ancorata a un elemento che non c'è." }]
      : [],
  )
}
```

Crea `src/model/note/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "../document"
import { anchorExists, validateNotes } from "./validate"

/** Un'entità, una classe, un nodo di flusso e un pool. */
function documento(): DevDocument {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.class.model.classes["Ordine"] = { name: "Ordine", stereotype: "class", attributes: [], methods: [] }
  doc.diagram.flow.model.nodes["n1"] = { label: "Ordina", shape: "process", lane: null }
  doc.diagram.flow.model.pools["p1"] = { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] }
  return doc
}

describe("anchorExists", () => {
  it("riconosce entità, classi, nodi di flusso e pool", () => {
    const doc = documento()
    for (const anchor of ["er/ordini", "class/Ordine", "flow/n1", "flow/p1"]) expect(anchorExists(doc, anchor)).toBe(true)
  })

  it("un elemento che non c'è non è un'àncora, e nemmeno una nota", () => {
    const doc = documento()
    doc.diagram.note.model.notes["n2"] = { text: "", anchor: null }
    for (const anchor of ["er/clienti", "class/Cliente", "flow/n9", "note/n2"]) expect(anchorExists(doc, anchor)).toBe(false)
  })
})

describe("validateNotes", () => {
  it("una nota libera o ancorata a un elemento che c'è non ha problemi", () => {
    const doc = documento()
    doc.diagram.note.model.notes["a"] = { text: "", anchor: null }
    doc.diagram.note.model.notes["b"] = { text: "", anchor: "flow/p1" }
    expect(validateNotes(doc)).toEqual([])
  })

  it("un'àncora pendente dà note-dangling-anchor sulla nota", () => {
    const doc = documento()
    doc.diagram.note.model.notes["a"] = { text: "", anchor: "er/clienti" }
    expect(validateNotes(doc)).toEqual([
      { code: "note-dangling-anchor", severity: "error", node: "a", message: "La nota è ancorata a un elemento che non c'è." },
    ])
  })
})
```

- [ ] **Step 4: La migrazione 6 → 7, per ora solo la parte vuota**

In `src/model/migrations.ts`, prima della tabella:

```ts
/** 6 → 7: il documento guadagna la parte delle note, vuota (spec 3a §3). */
const addNotes: Migration = (raw) => {
  const diagram = raw.diagram
  if (!isObj(diagram)) return raw
  return { ...raw, diagram: { ...diagram, note: { model: { notes: {} }, view: { nodes: {} } } } }
}
```

e nella tabella aggiungi `[6, addNotes]` dopo `[5, lanesIntoPool]`.

In `src/model/migrations.test.ts`:
- ogni `toBe(6)` sulla versione diventa `toBe(7)` (sono sei);
- i titoli che dicono «alla 6» o «alla versione 6» dicono «alla 7» o «alla versione 7»;
- in fondo aggiungi:

```ts
describe("migrazione 6 → 7", () => {
  it("un documento v6 guadagna la parte delle note, vuota", () => {
    const doc = JSON.parse(toJson(createDocument("Prova", "v6doc"))) as { diagram: Record<string, unknown> }
    delete doc.diagram.note
    const r = parseDocument(JSON.stringify({ ...doc, schemaVersion: 6 }))
    expect(r.ok && r.document.diagram.note).toEqual({ model: { notes: {} }, view: { nodes: {} } })
  })
})
```

- [ ] **Step 5: I collegamenti conoscono la quarta famiglia, e il pool ha un nome**

`src/model/links/validate.ts`, in `endExists`: aggiungi il caso

```ts
    case "note":
      return false
```

e il docblock diventa «`true` se l'estremo esiste: un'entità, una classe (non una nota) o un nodo di flusso. Una nota non è mai l'estremo di un collegamento.».

`src/model/links/labels.ts`, `endName` diventa:

```ts
/**
 * Il nome leggibile di un estremo o di un'àncora, per i messaggi e per i pannelli. Entità e classi
 * hanno per chiave il nome; un nodo di flusso ha per chiave un uuid, quindi si mostra la sua
 * etichetta, su una riga; un pool, anche lui con un uuid, si mostra col suo nome.
 */
export function endName(doc: DevDocument, key: string): string {
  const { family, key: bare } = splitKey(key)
  if (family !== "flow") return bare
  const pool = doc.diagram.flow.model.pools[bare]
  if (pool) return pool.name === "" ? "(senza nome)" : pool.name
  const node = doc.diagram.flow.model.nodes[bare]
  if (!node) return "(nodo eliminato)"
  const label = node.label.replace(/\s+/g, " ").trim()
  return label === "" ? "(senza etichetta)" : label
}
```

In `src/model/links/labels.test.ts` aggiungi, nel `describe` di `endName` (o in fondo, in un `describe("endName")` nuovo se non c'è):

```ts
  it("un pool si nomina col suo nome, e senza nome lo dice", () => {
    const doc = createDocument("t", "t")
    doc.diagram.flow.model.pools["p1"] = { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] }
    doc.diagram.flow.model.pools["p2"] = { name: "", lanes: [{ id: "l2", name: "Cliente" }] }
    expect(endName(doc, "flow/p1")).toBe("Processo")
    expect(endName(doc, "flow/p2")).toBe("(senza nome)")
  })
```

(importa `createDocument` da `../document` se il file non lo importa già).

- [ ] **Step 6: Lancia i test del modello**

Run: `pnpm vitest run src/model`
Expected: PASS. `pnpm tsc -b` a questo punto fallisce negli strati sopra (`familyOps`, `viewFor`, gli `switch` sulle famiglie): li sistemano gli step che seguono.

- [ ] **Step 7: La geometria delle note si sposta nella sua famiglia**

Crea `src/editor/note-access.ts`:

```ts
import type { DevDocument } from "@/model/document"
import type { NoteDiagram } from "@/model/note/schema"

/** La parte delle note del documento: c'è sempre, vuota se non ci sono note. */
export function noteDiagram(doc: DevDocument): NoteDiagram {
  return doc.diagram.note
}
```

Crea `src/editor/note/geometry.ts` spostandoci da `src/editor/class/geometry.ts` le costanti `NOTE_FOLD` e `NOTE_PAD_Y` e le funzioni `noteSize`, `noteRect` e `notePath`, **con i loro docblock**, cambiando solo il tipo del parametro, e aggiungendo `anchorGeometry`:

```ts
import type { Note } from "@/model/note/schema"
import type { NodeView } from "@/model/shared"
import { pathFromPoints, routeEdge, type EdgeGeometry } from "../edge-routing"
import { CHAR_W, GRID, MIN_W, PAD_X, ROW_H, type Rect, type Size } from "../geometry"

/** Lato del triangolo piegato nell'angolo in alto a destra della nota. Nessun consumatore fuori da
 *  questo modulo: `noteSize` e `notePath` lo usano entrambi, ma solo qui dentro. */
const NOTE_FOLD = 12

/** Margine interno verticale della nota, sopra e sotto il blocco di righe. */
const NOTE_PAD_Y = 6

/**
 * Dimensione di una nota, sulla falsariga di `classSize` (§6 del documento madre): larghezza dal
 * carattere più lungo arrotondata alla griglia, altezza dal numero di righe. A differenza di
 * `classSize`, la larghezza aggiunge `NOTE_FOLD`: senza quello spazio la piega dell'angolo
 * morderebbe l'ultimo carattere della riga più lunga. Il minimo è metà di quello di una classe —
 * una nota vuota deve restare cliccabile, non larga quanto una classe.
 */
export function noteSize(note: Pick<Note, "text">): Size {
  const lines = note.text.split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  const w = Math.max(MIN_W / 2, Math.ceil((chars * CHAR_W + 2 * PAD_X + NOTE_FOLD) / GRID) * GRID)
  return { w, h: lines.length * ROW_H + 2 * NOTE_PAD_Y }
}

export function noteRect(note: Pick<Note, "text">, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...noteSize(note) }
}

/**
 * I due path della forma UML della nota: `body` è il contorno con l'angolo in alto a destra
 * tagliato, `fold` il triangolino che lo chiude. Due path e non uno perché il triangolo va
 * riempito di un colore diverso dal corpo, e un path solo non può avere due riempimenti.
 */
export function notePath(w: number, h: number): { body: string; fold: string } {
  const f = NOTE_FOLD
  return {
    body: `M0 0 L${w - f} 0 L${w} ${f} L${w} ${h} L0 ${h} Z`,
    fold: `M${w - f} 0 L${w} ${f} L${w - f} ${f} Z`,
  }
}

/**
 * La linea di ancoraggio (spec 3a §5): lo stesso instradamento ortogonale dei collegamenti, con
 * scarto 0 perché una nota ha una linea sola, e **nessun marker** a nessuno dei due capi — un
 * ancoraggio non ha verso, come il `note-link` di prima. Tratteggiata la rende chi disegna.
 */
export function anchorGeometry(source: Rect, target: Rect): EdgeGeometry {
  const route = routeEdge(source, target, false)
  const pts = route.points
  const p0 = pts[0]!
  const p1 = pts[1]!
  return { d: pathFromPoints(pts), sourceMarker: "", targetMarker: "", label: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 } }
}
```

In `src/editor/class/geometry.ts` cancella `NOTE_FOLD`, `NOTE_PAD_Y`, `noteSize`, `noteRect`, `notePath` e dall'import togli `ClassNote`. Aggiorna gli import di chi li usava:
- `src/editor/class/commands.ts`: `import { classSize } from "./geometry"` e `import { noteSize } from "../note/geometry"`;
- `src/editor/kinds/class.ts`: `noteRect` da `"../note/geometry"`, il resto da `"../class/geometry"`;
- `src/editor/flow/geometry.ts`: `import { notePath } from "../note/geometry"`;
- `src/ui/canvas/ClassNote.tsx` e `src/ui/canvas/NoteEditor.tsx` li aggiornano gli step 13 e 15.

In `src/editor/class/geometry.test.ts` sposta i `describe("noteSize")` e `describe("notePath")` in `src/editor/note/geometry.test.ts`, con import da `./geometry`. Il `describe("ancoraggio di una nota")` resta dov'è: riguarda il `note-link` delle classi e se ne va nel Task 2. In fondo a `src/editor/note/geometry.test.ts` aggiungi:

```ts
describe("anchorGeometry", () => {
  it("una linea senza marker a nessuno dei due capi", () => {
    const geo = anchorGeometry({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 0, w: 100, h: 40 })
    expect(geo.d).not.toBe("")
    expect(geo.sourceMarker).toBe("")
    expect(geo.targetMarker).toBe("")
  })
})
```

- [ ] **Step 8: I comandi delle note**

Crea `src/editor/note/commands.ts`:

```ts
import type { DevDocument } from "@/model/document"
import type { LayoutGraph, LayoutNode } from "@/model/layout"
import type { NoteModel } from "@/model/note/schema"
import { anchorExists } from "@/model/note/validate"
import type { Recipe } from "../document-store"
import { snap, type Point } from "../geometry"
import { noteDiagram } from "../note-access"
import { noteSize } from "./geometry"

const DUPLICATE_OFFSET = 20

/**
 * Nuova nota vuota e libera. La chiave è un uuid e non deriva dal testo: il testo cambia a ogni
 * battitura, e una chiave che lo segue farebbe di ogni carattere una rinomina.
 */
export function addNote(at: Point): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const d = noteDiagram(draft)
      d.model.notes[key] = { text: "", anchor: null }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

export function setNoteText(key: string, text: string): Recipe {
  return (draft) => {
    const note = noteDiagram(draft).model.notes[key]
    // Si scrive solo se cambia davvero: riaprire e richiudere l'editor senza toccare niente
    // lascerebbe altrimenti una voce di undo fantasma.
    if (note && note.text !== text) note.text = text
  }
}

/** Stacca le note dal loro elemento: restano dove sono, libere (spec 3a §5). Una nota già libera, o che non c'è, non scrive niente. */
export function detachNotes(keys: readonly string[]): Recipe {
  return (draft) => {
    const notes = noteDiagram(draft).model.notes
    for (const key of keys) {
      const note = notes[key]
      if (note && note.anchor !== null) note.anchor = null
    }
  }
}

/**
 * Elimina le note in `nodeKeys` e stacca quelle in `edgeKeys`: la linea di ancoraggio ha la chiave
 * della sua nota, e cancellare la linea vuol dire staccare la nota, non eliminarla (spec 3a §5).
 */
export function deleteNoteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null {
  if (nodeKeys.length === 0 && edgeKeys.length === 0) return null
  const detach = detachNotes(edgeKeys)
  return (draft) => {
    detach(draft)
    const d = noteDiagram(draft)
    for (const key of nodeKeys) {
      delete d.model.notes[key]
      delete d.view.nodes[key]
    }
  }
}

/** Copia le note con un uuid nuovo e lo scarto di sempre. La copia tiene l'àncora dell'originale (spec 3a §10). */
export function duplicateNotes(model: NoteModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const plan = keys.filter((k) => k in model.notes).map((from) => ({ from, to: crypto.randomUUID() }))
  return {
    keys: plan.map((p) => p.to),
    recipe: (draft) => {
      const d = noteDiagram(draft)
      for (const { from, to } of plan) {
        const note = d.model.notes[from]
        const view = d.view.nodes[from]
        if (!note) continue
        d.model.notes[to] = { ...note }
        d.view.nodes[to] = { x: (view?.x ?? 0) + DUPLICATE_OFFSET, y: (view?.y ?? 0) + DUPLICATE_OFFSET, collapsed: false }
      }
    },
  }
}

/**
 * Il grafo da disporre: solo le note libere, e quelle con l'àncora pendente, che per Disponi valgono
 * come libere (spec 3a §6). Nessun arco: le note libere non sono legate fra loro. Le note ancorate
 * restano fuori: seguono il loro elemento.
 */
export function noteLayoutGraph(doc: DevDocument): LayoutGraph {
  const d = noteDiagram(doc)
  const nodes: LayoutNode[] = Object.entries(d.model.notes).flatMap(([key, note]) =>
    d.view.nodes[key] && (note.anchor === null || !anchorExists(doc, note.anchor)) ? [{ id: key, ...noteSize(note) }] : [],
  )
  return { nodes, edges: [], direction: "DOWN" }
}
```

Crea `src/editor/note/commands.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { documentStore } from "../document-store"
import { noteDiagram } from "../note-access"
import { addNote, deleteNoteItems, detachNotes, duplicateNotes, noteLayoutGraph, setNoteText } from "./commands"

const state = () => documentStore.getState()
const notes = () => noteDiagram(state().doc).model.notes

/** Una nota ancorata all'entità `ordini`, che esiste. */
function notaAncorata(): string {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.note.model.notes["n1"] = { text: "ciao", anchor: "er/ordini" }
  doc.diagram.note.view.nodes["n1"] = { x: 0, y: 200, collapsed: false }
  state().load(doc)
  return "n1"
}

beforeEach(() => state().load(createDocument("t", "t")))

describe("comandi delle note", () => {
  it("addNote crea una nota libera e vuota, con la view allineata alla griglia", () => {
    const { key, recipe } = addNote({ x: 13, y: 27 })
    state().dispatch(recipe)
    expect(notes()[key]).toEqual({ text: "", anchor: null })
    expect(noteDiagram(state().doc).view.nodes[key]).toEqual({ x: 10, y: 30, collapsed: false })
  })

  it("setNoteText con lo stesso testo non aggiunge una voce di annulla", () => {
    const key = notaAncorata()
    expect(state().dispatch(setNoteText(key, "ciao"))).toBe(false)
    expect(state().dispatch(setNoteText(key, "addio"))).toBe(true)
    expect(notes()[key]!.text).toBe("addio")
  })

  it("detachNotes stacca la nota e la lascia dov'è; su una nota libera non scrive niente", () => {
    const key = notaAncorata()
    state().dispatch(detachNotes([key]))
    expect(notes()[key]!.anchor).toBeNull()
    expect(noteDiagram(state().doc).view.nodes[key]).toEqual({ x: 0, y: 200, collapsed: false })
    expect(state().dispatch(detachNotes([key]))).toBe(false)
  })

  it("deleteNoteItems elimina le note fra i nodi e stacca quelle fra gli archi", () => {
    const key = notaAncorata()
    state().dispatch(deleteNoteItems([], [key])!)
    expect(notes()[key]).toEqual({ text: "ciao", anchor: null })
    state().dispatch(deleteNoteItems([key], [])!)
    expect(notes()[key]).toBeUndefined()
    expect(noteDiagram(state().doc).view.nodes[key]).toBeUndefined()
    expect(deleteNoteItems([], [])).toBeNull()
  })

  it("duplicateNotes copia testo e àncora, con una chiave nuova e lo scarto", () => {
    const key = notaAncorata()
    const dup = duplicateNotes(noteDiagram(state().doc).model, [key])
    state().dispatch(dup.recipe)
    const copy = dup.keys[0]!
    expect(copy).not.toBe(key)
    expect(notes()[copy]).toEqual({ text: "ciao", anchor: "er/ordini" })
    expect(noteDiagram(state().doc).view.nodes[copy]).toEqual({ x: 20, y: 220, collapsed: false })
  })

  it("il grafo di layout ha solo le note libere e quelle con l'àncora pendente", () => {
    notaAncorata()
    const libera = addNote({ x: 0, y: 400 })
    state().dispatch(libera.recipe)
    const pendente = addNote({ x: 0, y: 600 })
    state().dispatch(pendente.recipe)
    state().dispatch((draft) => {
      noteDiagram(draft).model.notes[pendente.key]!.anchor = "er/fantasma"
    })
    expect(noteLayoutGraph(state().doc).nodes.map((n) => n.id).sort()).toEqual([libera.key, pendente.key].sort())
    expect(noteLayoutGraph(state().doc).edges).toEqual([])
  })
})
```

- [ ] **Step 9: L'ancoraggio, che attraversa le famiglie**

Crea `src/editor/note/anchor.ts`:

```ts
import type { DevDocument } from "@/model/document"
import { anchorExists } from "@/model/note/validate"
import type { Recipe } from "../document-store"
import type { EdgeEnds } from "../edge-routing"
import { qualify, splitKey } from "../families"
import type { ConnectResult } from "../links/commands"
import { noteDiagram } from "../note-access"
import { detachNotes } from "./commands"

/**
 * Le funzioni della linea di ancoraggio che hanno bisogno di vedere più famiglie: l'altro capo di
 * una linea sta sempre fuori dalla famiglia `note`. Le chiama `CanvasOps` (e `followRename`), come
 * fa con i collegamenti. Tutte le chiavi qui sono **con prefisso**.
 */

/**
 * Collega fra una nota e un altro elemento (spec 3a §5), in qualunque verso: l'àncora va sulla nota.
 * `null` quando nessuno o entrambi gli estremi sono note, o quando l'altro estremo non è un'àncora
 * possibile. La chiave del risultato è quella della nota, cioè della sua linea: il runner la
 * seleziona come un arco. Verso l'àncora che la nota ha già torna `existing`, così il gesto non
 * lascia una voce di annulla vuota.
 */
export function anchorNote(doc: DevDocument, from: string, to: string): ConnectResult | null {
  const a = splitKey(from)
  const b = splitKey(to)
  const aIsNote = a.family === "note"
  if (aIsNote === (b.family === "note")) return null
  const [noteKey, anchor] = aIsNote ? [a.key, to] : [b.key, from]
  const note = noteDiagram(doc).model.notes[noteKey]
  if (!note || !anchorExists(doc, anchor)) return null
  const key = qualify("note", noteKey)
  if (note.anchor === anchor) return { type: "existing", key }
  return {
    type: "created",
    key,
    recipe: (draft) => {
      const target = noteDiagram(draft).model.notes[noteKey]
      if (target) target.anchor = anchor
    },
  }
}

/**
 * Le linee di ancoraggio che toccano `keys`: quelle delle note fra le chiavi e quelle delle note
 * ancorate a un elemento fra le chiavi. Servono all'anteprima del drag, che ridisegna le linee
 * mentre la nota o il suo elemento si spostano, come `linksTouching` per i collegamenti.
 */
export function anchorsTouching(doc: DevDocument, keys: ReadonlySet<string>): EdgeEnds[] {
  return Object.entries(noteDiagram(doc).model.notes).flatMap(([key, note]) => {
    if (note.anchor === null) return []
    const source = qualify("note", key)
    return keys.has(source) || keys.has(note.anchor) ? [{ key: source, source, target: note.anchor }] : []
  })
}

/** Stacca le note ancorate a uno degli elementi `keys`, per l'eliminazione (spec 3a §5). `null` se non ce n'è nessuna. */
export function detachAnchoredTo(doc: DevDocument, keys: ReadonlySet<string>): Recipe | null {
  const hit = Object.entries(noteDiagram(doc).model.notes)
    .filter(([, note]) => note.anchor !== null && keys.has(note.anchor))
    .map(([key]) => key)
  return hit.length === 0 ? null : detachNotes(hit)
}

/** Le àncore che nominano `oldKey` passano a `newKey`: la rinomina di un'entità o di una classe ne cambia la chiave. */
export function retargetAnchors(oldKey: string, newKey: string): Recipe {
  return (draft) => {
    for (const note of Object.values(noteDiagram(draft).model.notes)) {
      if (note.anchor === oldKey) note.anchor = newKey
    }
  }
}
```

- [ ] **Step 10: Le operazioni della famiglia e del canvas**

Crea `src/editor/kinds/note.ts`:

```ts
import type { DevDocument } from "@/model/document"
import { validateNotes } from "@/model/note/validate"
import { addNote, deleteNoteItems, duplicateNotes, noteLayoutGraph } from "../note/commands"
import { anchorGeometry, noteRect } from "../note/geometry"
import { noteDiagram } from "../note-access"
import type { DiagramOps } from "./ops"

/**
 * `DiagramOps` per le note (spec 3a §3). Una nota è un nodo come gli altri; la sola cosa che la
 * distingue è la linea di ancoraggio, un «arco» con l'altro capo in un'altra famiglia. Qui se ne
 * conosce solo la geometria: quali linee toccano un insieme di chiavi, il gesto Collega e lo stacco a
 * cascata li decide `CanvasOps` con `note/anchor.ts`, perché vede tutte le famiglie.
 */
export function noteOps(doc: DevDocument): DiagramOps {
  const diagram = () => noteDiagram(doc)

  return {
    nodeKeys: () => Object.keys(diagram().view.nodes),

    rectOf: (key, at) => {
      const note = diagram().model.notes[key]
      const view = diagram().view.nodes[key]
      if (!note || !view) return null
      return noteRect(note, at ? { ...view, ...at } : view)
    },

    // L'altro capo di ogni linea sta in un'altra famiglia: le linee le trova `CanvasOps` (`anchorsTouching`).
    edgesTouching: () => [],

    // La linea ha la chiave della sua nota: una nota ne ha al più una (spec 3a §5).
    edgeGeometry: (key, a, b) => (diagram().model.notes[key]?.anchor ? anchorGeometry(a, b) : null),

    addNode: (at) => ({ ...addNote(at), edit: "body" }),

    // Due note non si collegano, e l'ancoraggio passa da `CanvasOps.addEdge` (`anchorNote`).
    addEdge: () => null,

    deleteItems: (nodeKeys, edgeKeys) => deleteNoteItems(nodeKeys, edgeKeys),

    duplicateNodes: (keys) => duplicateNotes(diagram().model, keys),

    layoutGraph: () => noteLayoutGraph(doc),

    validate: () => validateNotes(doc),
  }
}
```

`src/editor/kinds/ops.ts`: importa `noteOps` da `./note` e aggiungi a `familyOps` il caso

```ts
    case "note":
      return noteOps(doc)
```

`src/editor/kinds/canvas-ops.ts`:
- importa `import { anchorNote, anchorsTouching, detachAnchoredTo } from "../note/anchor"`;
- nell'interfaccia, il docblock di `addEdge` diventa: «Una nota e un altro elemento, in qualunque verso: l'àncora della nota (`anchorNote`), anche verso un pool. Dentro una famiglia: l'arco della famiglia, oppure `null` se i due nodi non si possono collegare. Fra famiglie diverse: un collegamento tipizzato creato, uno già presente da selezionare, oppure un rifiuto con il suo avviso (`connectAcross`).»;
- `edgesTouching` aggiunge in fondo all'array le linee di ancoraggio:

```ts
      ...linksTouching(doc.diagram.links, keys).map(([id, l]) => ({ key: linkKey(id), source: l.source, target: l.target })),
      ...anchorsTouching(doc, keys),
```

- `addEdge` diventa:

```ts
    addEdge: (source, target) => {
      // Una nota si ancora a qualunque elemento, pool compresi (spec 3a §5): si riconosce prima
      // della guardia dei frame, che per ogni altro collegamento resta chiusa (spec 2b §2).
      if (splitKey(source).family === "note" || splitKey(target).family === "note") return anchorNote(doc, source, target)
      // Un frame non è un estremo (spec 2b §2): niente arco, niente collegamento, niente avviso.
      if (isFrame(source) || isFrame(target)) return null
      const a = splitKey(source)
      const b = splitKey(target)
      if (a.family !== b.family) return connectAcross(doc, source, target)
      const created = ops(a.family).addEdge(a.key, b.key)
      return created ? { type: "created" as const, key: qualify(a.family, created.key), recipe: created.recipe } : null
    },
```

- in `deleteItems`, il commento diventa «I collegamenti selezionati, e quelli che toccano un nodo eliminato; le note ancorate a un nodo eliminato si staccano: tutto nella stessa recipe delle famiglie, così un solo annulla riporta indietro tutto (spec 4a §4, spec 3a §5).», e la `combine` finale diventa:

```ts
      return combine([
        ...[...touched].map((f) => ops(f).deleteItems(nodes.get(f) ?? [], edges.get(f) ?? [])),
        linkIds.length > 0 ? deleteLinks(linkIds) : null,
        detachAnchoredTo(doc, new Set(nodeKeys)),
      ])
```

In `src/editor/kinds/canvas-ops.test.ts` importa `withPool` (già importato) e aggiungi in fondo:

```ts
describe("canvasOps e le note (spec 3a §5)", () => {
  const add = (at: { x: number; y: number }, family: "er" | "note" | "flow", variant?: string) => {
    const { key, recipe } = canvasOps(state().doc).addNode(at, family, variant)
    state().dispatch(recipe)
    return key
  }
  const anchorOf = (note: string) => state().doc.diagram.note.model.notes[splitKey(note).key]!.anchor
  const connect = (from: string, to: string) => {
    const r = canvasOps(state().doc).addEdge(from, to)
    if (r?.type === "created") state().dispatch(r.recipe)
    return r
  }

  it("Collega da una nota a un'entità scrive l'àncora, e la chiave è quella della nota", () => {
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    const r = connect(note, entity)
    expect(r?.type).toBe("created")
    expect(r?.type === "created" && r.key).toBe(note)
    expect(anchorOf(note)).toBe(entity)
  })

  it("nel verso opposto ancora lo stesso, e verso l'àncora che ha già non crea niente", () => {
    // Review Focus 4.
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(entity, note)
    expect(anchorOf(note)).toBe(entity)
    expect(canvasOps(state().doc).addEdge(note, entity)).toEqual({ type: "existing", key: note })
  })

  it("un nuovo Collega sostituisce l'àncora", () => {
    const first = add({ x: 0, y: 0 }, "er")
    const second = add({ x: 400, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(note, first)
    connect(note, second)
    expect(anchorOf(note)).toBe(second)
  })

  it("una nota si ancora a un pool, ma un pool resta escluso da ogni altro collegamento", () => {
    state().load(withPool(createDocument("t", "t")))
    const note = add({ x: 0, y: 400 }, "note")
    const nodo = add({ x: 900, y: 0 }, "flow", "process")
    expect(connect("flow/p1", note)?.type).toBe("created")
    expect(anchorOf(note)).toBe("flow/p1")
    expect(canvasOps(state().doc).addEdge("flow/p1", nodo)).toBeNull()
  })

  it("due note non si collegano", () => {
    const a = add({ x: 0, y: 0 }, "note")
    const b = add({ x: 300, y: 0 }, "note")
    expect(canvasOps(state().doc).addEdge(a, b)).toBeNull()
  })

  it("la linea tocca sia la nota sia l'elemento, e ha una geometria senza marker", () => {
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(note, entity)
    const ops = canvasOps(state().doc)
    const line = { key: note, source: note, target: entity }
    expect(ops.edgesTouching(new Set([entity]))).toContainEqual(line)
    expect(ops.edgesTouching(new Set([note]))).toContainEqual(line)
    expect(ops.edgeGeometry(note, ops.rectOf(note)!, ops.rectOf(entity)!)?.targetMarker).toBe("")
  })

  it("Canc sulla linea stacca la nota, che resta", () => {
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(note, entity)
    state().dispatch(canvasOps(state().doc).deleteItems([], [note])!)
    expect(anchorOf(note)).toBeNull()
    expect(canvasOps(state().doc).nodeKeys()).toContain(note)
  })

  it("eliminare l'elemento stacca la nota, e un solo annulla riporta entrambi", () => {
    // Review Focus 3.
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(note, entity)
    state().dispatch(canvasOps(state().doc).deleteItems([entity], [])!)
    expect(anchorOf(note)).toBeNull()
    state().undo()
    expect(anchorOf(note)).toBe(entity)
    expect(canvasOps(state().doc).nodeKeys()).toContain(entity)
  })

  it("eliminare un pool ancorato stacca la nota", () => {
    // Review Focus 2.
    state().load(withPool(createDocument("t", "t")))
    const note = add({ x: 0, y: 400 }, "note")
    connect(note, "flow/p1")
    state().dispatch(canvasOps(state().doc).deleteItems(["flow/p1"], [])!)
    expect(anchorOf(note)).toBeNull()
  })

  it("le note contano come contenuto", () => {
    add({ x: 0, y: 0 }, "note")
    expect(familyHasContent(state().doc, "note")).toBe(true)
  })
})
```

- [ ] **Step 11: La rinomina segue anche le àncore**

`src/editor/links/commands.ts`:
- `FAMILY_NOUN` guadagna `note: "una nota"` (la usa solo il messaggio di rifiuto, che per una nota non si raggiunge mai: `CanvasOps` la instrada prima; la voce serve a tenere il `Record` totale);
- importa `import { retargetAnchors } from "../note/anchor"`;
- `followRename` diventa:

```ts
/**
 * La rinomina `rename`, e i collegamenti e le àncore delle note che la seguono, in una recipe sola:
 * un passo di annulla, e nessuno stato intermedio. Chiavi **senza** prefisso, quelle dei comandi di
 * famiglia.
 *
 * Collegamenti e àncore si spostano solo se la rinomina ha davvero tolto il nodo `oldKey`.
 * `renameEntity` e `renameClass` rispondono a una collisione con una recipe che non scrive niente:
 * senza la guardia, una collisione li sposterebbe sul nodo che esiste già.
 */
export function followRename(rename: Recipe, family: Family, oldKey: string, newKey: string): Recipe {
  const has = (doc: DevDocument, key: string) => familyOps(doc, family).nodeKeys().includes(key)
  return (draft) => {
    const had = has(draft, oldKey)
    rename(draft)
    if (had && !has(draft, oldKey)) {
      retargetLinks(qualify(family, oldKey), qualify(family, newKey))(draft)
      retargetAnchors(qualify(family, oldKey), qualify(family, newKey))(draft)
    }
  }
}
```

In `src/editor/links/commands.test.ts`, nel `describe` di `followRename` (o in fondo), aggiungi:

```ts
  it("una rinomina sposta anche le note ancorate, e una collisione no", () => {
    // Review Focus 1.
    const doc = documento()
    doc.diagram.note.model.notes["a1"] = { text: "", anchor: "class/Ordine" }
    doc.diagram.note.view.nodes["a1"] = { x: 0, y: 0, collapsed: false }
    state().load(doc)
    state().dispatch(followRename(renameClass("Ordine", "Pagabile")!, "class", "Ordine", "Pagabile"))
    expect(state().doc.diagram.note.model.notes["a1"]!.anchor).toBe("class/Ordine")
    state().dispatch(followRename(renameClass("Ordine", "Ordini")!, "class", "Ordine", "Ordini"))
    expect(state().doc.diagram.note.model.notes["a1"]!.anchor).toBe("class/Ordini")
  })
```

(`Pagabile` esiste già nel documento di prova, quindi la prima rinomina collide e non scrive niente.)

- [ ] **Step 12: Lancia i test dell'editor**

Run: `pnpm vitest run src/editor src/model`
Expected: PASS. `tsc` fallisce ancora negli `switch` della UI.

- [ ] **Step 13: Il disegno della nota e della sua linea**

Crea `src/ui/canvas/Note.tsx` spostandoci la vista pura da `ClassNote.tsx`:

```tsx
import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { PAD_X, ROW_H } from "@/editor/geometry"
import { notePath, noteSize } from "@/editor/note/geometry"
import { noteDiagram } from "@/editor/note-access"
import { selId, sessionStore } from "@/editor/session-store"
import type { NodeView } from "@/model/shared"
import { registerNode } from "./dom-registry"

interface Props {
  /** La chiave con prefisso: la nota si registra e si colpisce con quella. */
  id: string
  note: { text: string }
  view: NodeView
  selected: boolean
}

/**
 * Vista pura e memoizzata della nota: la forma UML, rettangolo con l'angolo in alto a destra
 * piegato. Due path e non uno — il triangolo della piega va riempito di un colore diverso dal
 * corpo, e un path solo non può avere due riempimenti.
 *
 * Nessuno scomparto, nessun header: una nota è testo e basta, e `collapsed` non le si applica.
 */
export const NoteView = memo(function NoteView({ id, note, view, selected }: Props) {
  const { w, h } = noteSize(note)
  const { body, fold } = notePath(w, h)
  const lines = note.text === "" ? [] : note.text.split("\n")
  const stroke = selected ? "var(--primary)" : "var(--border)"
  return (
    <g
      data-node-id={id}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
      <path d={body} fill="var(--card)" stroke={stroke} strokeWidth={selected ? 2 : 1} />
      <path data-note-fold d={fold} fill="var(--muted)" stroke={stroke} strokeWidth={selected ? 2 : 1} />
      {/* `data-node-body`: il contratto del livello di dettaglio, vedi `ViewportGroup`. Una nota è
          tutta testo, quindi mentre si zooma resta il solo foglio con l'orecchia. */}
      <g data-node-body>
        {lines.map((line, i) => (
          <text key={i} x={PAD_X} y={6 + ROW_H * i + ROW_H / 2} dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
            {line}
          </text>
        ))}
      </g>
    </g>
  )
})

/** Componente connesso: un selettore per nota, così un cambiamento altrove non la tocca. */
export function NoteNode({ nodeKey }: { nodeKey: string }) {
  const id = qualify("note", nodeKey)
  const note = useStore(documentStore, (s) => noteDiagram(s.doc).model.notes[nodeKey])
  const view = useStore(documentStore, (s) => noteDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", id)))
  if (!note || !view) return null
  return <NoteView id={id} note={note} view={view} selected={selected} />
}
```

`src/ui/canvas/ClassNote.tsx` resta solo con `ClassNoteNode`, che ora disegna con `NoteView`:

```tsx
import { useStore } from "zustand"
import { classDiagram } from "@/editor/class-access"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { selId, sessionStore } from "@/editor/session-store"
import { NoteView } from "./Note"

/** Una nota di classe di un documento esistente: la stessa vista della nota unica, con la chiave della famiglia delle classi. */
export function ClassNoteNode({ nodeKey }: { nodeKey: string }) {
  const id = qualify("class", nodeKey)
  const note = useStore(documentStore, (s) => classDiagram(s.doc).model.notes[nodeKey])
  const view = useStore(documentStore, (s) => classDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", id)))
  if (!note || !view) return null
  return <NoteView id={id} note={note} view={view} selected={selected} />
}
```

In `src/ui/canvas/kinds/class.tsx`: `NodeView` disegna la nota con `<NoteView id={qualify("class", nodeKey)} note={node as ClassNoteModel} view={view} selected={selected} />` (importa `NoteView` da `../Note` e `qualify` da `@/editor/families`; togli l'import di `ClassNoteView`), e dagli strumenti togli la riga `{ label: "Nota di classe", … }` e l'import di `StickyNote`.

In `src/ui/canvas/class-render.test.tsx` togli il `describe("ClassNoteView")` e l'import di `ClassNoteView`; il test `ClassEdge — connesso allo store` resta. Crea `src/ui/canvas/Note.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { NoteView } from "./Note"

describe("NoteView", () => {
  const nota = { text: "prima\nseconda" }

  it("disegna corpo e piega, e una riga di testo per riga di nota", () => {
    const html = renderToStaticMarkup(<NoteView id="note/n-1" note={nota} view={{ x: 10, y: 20, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="note/n-1"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain("data-note-fold")
    expect(html).toContain(">prima<")
    expect(html).toContain(">seconda<")
  })

  it("una nota vuota non produce righe di testo ma esiste come nodo", () => {
    const html = renderToStaticMarkup(<NoteView id="note/n-1" note={{ text: "" }} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="note/n-1"')
    expect(html).not.toContain("<text")
  })

  it("la selezione cambia il contorno", () => {
    const sel = renderToStaticMarkup(<NoteView id="note/n-1" note={nota} view={{ x: 0, y: 0, collapsed: false }} selected={true} />)
    expect(sel).toContain("var(--primary)")
  })
})
```

In `src/ui/canvas/LinkEdge.tsx` esporta `useNodeRect` (`export function useNodeRect(...)`), con il docblock «Il rettangolo di un nodo o di un frame di qualunque famiglia, dalla chiave con prefisso: lo usano i collegamenti e le linee di ancoraggio. `useShallow` per la stessa ragione di `ClassEdge`.».

Crea `src/ui/canvas/NoteAnchor.tsx`:

```tsx
import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import type { Rect } from "@/editor/geometry"
import { anchorGeometry } from "@/editor/note/geometry"
import { noteDiagram } from "@/editor/note-access"
import { selId, sessionStore } from "@/editor/session-store"
import { registerEdge } from "./dom-registry"
import { useNodeRect } from "./LinkEdge"

interface Props {
  noteKey: string
  source: Rect
  target: Rect
  selected: boolean
}

/**
 * Vista pura della linea di ancoraggio (spec 3a §5): tratteggiata, senza marker, con la chiave della
 * sua nota. Gli attributi `data-edge-*` sono quelli degli archi, quindi l'anteprima del drag la
 * aggiorna senza codice nuovo, come i collegamenti.
 */
export const AnchorEdgeView = memo(function AnchorEdgeView({ noteKey, source, target, selected }: Props) {
  const id = qualify("note", noteKey)
  const geo = anchorGeometry(source, target)
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
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray="6 4" />
    </g>
  )
})

/** La linea di una nota ancorata. Un'àncora pendente non si disegna: la segnala la validazione. */
export function AnchorEdge({ noteKey }: { noteKey: string }) {
  const id = qualify("note", noteKey)
  const anchor = useStore(documentStore, (s) => noteDiagram(s.doc).model.notes[noteKey]?.anchor ?? undefined)
  const source = useNodeRect(id)
  const target = useNodeRect(anchor)
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", id)))
  if (!source || !target) return null
  return <AnchorEdgeView noteKey={noteKey} source={source} target={target} selected={selected} />
}
```

- [ ] **Step 14: La vista della famiglia e il registro**

Crea `src/ui/canvas/kinds/note.tsx`:

```tsx
import { StickyNote } from "lucide-react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { noteDiagram } from "@/editor/note-access"
import type { Note } from "@/model/note/schema"
import { NoteProperties } from "@/ui/panels/NoteProperties"
import { NoteNode, NoteView as NotePureView } from "../Note"
import { AnchorEdge, AnchorEdgeView } from "../NoteAnchor"
import type { DiagramView, EdgeViewProps, NodeViewProps } from "./registry"
import { qualify } from "@/editor/families"

function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(noteDiagram(s.doc).model.notes)))
  return (
    <g data-layer="nodes">
      {keys.map((key) => <NoteNode key={key} nodeKey={key} />)}
    </g>
  )
}

/** Le linee delle note ancorate: stanno con gli archi, sotto ogni nodo (spec 3a §3). */
function EdgesLayer() {
  const anchored = useStore(
    documentStore,
    useShallow((s) => Object.entries(noteDiagram(s.doc).model.notes).flatMap(([key, note]) => (note.anchor ? [key] : []))),
  )
  return (
    <g data-layer="edges">
      {anchored.map((key) => <AnchorEdge key={key} noteKey={key} />)}
    </g>
  )
}

/** Adattatori verso le viste pure, dietro la forma generica di `DiagramView`: `node` arriva `unknown` da `buildSvg`. */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  return <NotePureView id={qualify("note", nodeKey)} note={node as Note} view={view} selected={selected} />
}

function EdgeView({ edgeKey, source, target, selected }: EdgeViewProps) {
  return <AnchorEdgeView noteKey={edgeKey} source={source} target={target} selected={selected} />
}

/** `DiagramView` per le note: uno strumento solo, «Nota» (spec 3a §5). */
export const noteView: DiagramView = {
  NodesLayer,
  EdgesLayer,
  NodeView,
  EdgeView,
  Properties: NoteProperties,
  tools: [{ label: "Nota", key: "n", Icon: StickyNote, tool: "node", family: "note" }],
}
```

(ordina gli import come fa il resto del progetto: `@/editor/families` insieme agli altri `@/editor`.)

`src/ui/canvas/kinds/registry.ts`: importa `noteView` da `./note`, aggiungi a `viewFor` il caso `case "note": return noteView`, e `FAMILY_LABEL` diventa `{ er: "ER", class: "Classi", flow: "Flusso", note: "Note" }`.

`src/ui/canvas/kinds/registry.test.ts`:
- nel primo test la lista di `cls.tools` perde la riga della «Nota di classe» (e l'import di `StickyNote` resta, perché lo usa il test nuovo qui sotto);
- il test «la vista delle classi dichiara la variante nota, quella ER no» diventa:

```ts
  it("la nota ha una famiglia sua: né le classi né l'ER hanno più una variante nota", () => {
    expect(viewFor("class").tools.some((t) => t.variant === "note")).toBe(false)
    expect(viewFor("er").tools.some((t) => t.variant === "note")).toBe(false)
    expect(viewFor("note").tools).toEqual([{ label: "Nota", key: "n", Icon: StickyNote, tool: "node", family: "note" }])
  })
```

- gli altri test restano: la nota di flusso esiste ancora fino al Task 2.

- [ ] **Step 15: Editor, doppio clic e pannello**

`src/ui/canvas/NoteEditor.tsx` passa alla famiglia `note`: `editingIn(editing, "note")`, `noteDiagram(s.doc).model.notes[own.key]` e `noteDiagram(s.doc).view.nodes[own.key]` al posto degli accessi alle classi, `setNoteText` da `@/editor/note/commands`, `noteSize` da `@/editor/note/geometry`. Il resto non cambia.

`src/ui/canvas/use-canvas-interaction.ts`, in `onDblClick`: il ramo del flusso diventa

```ts
      // Un nodo di flowchart e una nota non hanno un nome distinto dal corpo: qualunque punto del
      // nodo apre l'editor di testo, a differenza dell'header che l'ER usa per il nome dell'entità.
      if (family === "flow" || family === "note") {
        session().setEditing({ key: hit.key, target: "body" })
        return
      }
```

`src/ui/canvas/InlineEditor.tsx`, in `nameEditorFor`: aggiungi `case "note": return null` e nel docblock «`null` per il flowchart e per le note, che un nome non ce l'hanno».

Crea `src/ui/panels/NoteProperties.tsx`:

```tsx
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { detachNotes, setNoteText } from "@/editor/note/commands"
import { noteDiagram } from "@/editor/note-access"
import { sessionStore } from "@/editor/session-store"
import { endName } from "@/model/links/labels"
import { CommitTextarea } from "./CommitTextarea"

const dispatch = (recipe: Recipe) => documentStore.getState().dispatch(recipe)

/**
 * Il campo «Testo» di una nota: una `textarea` commessa sul blur, l'alternativa al doppio clic sul
 * canvas. **Alternativa, non secondo editor:** finché l'editor sul canvas è aperto su *questa* nota
 * il campo è in sola lettura e lo dice, perché due campi modificabili per lo stesso dato
 * divergerebbero. `id` è la chiave con prefisso della nota, quella che l'editing in corso porta.
 */
export function NoteTextField({ id, text, onCommit }: { id: string; text: string; onCommit: (text: string) => void }) {
  const editingHere = useStore(sessionStore, (s) => s.editing?.key === id && s.editing.target === "body")
  return (
    <div className="grid gap-1">
      <Label htmlFor="note-text">Testo</Label>
      <CommitTextarea
        id="note-text"
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

function NoteBody({ noteKey: key }: { noteKey: string }) {
  const note = useStore(documentStore, (s) => noteDiagram(s.doc).model.notes[key])
  const anchorName = useStore(documentStore, (s) => {
    const anchor = noteDiagram(s.doc).model.notes[key]?.anchor
    return anchor ? endName(s.doc, anchor) : null
  })
  if (!note) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <NoteTextField id={qualify("note", key)} text={note.text} onCommit={(text) => dispatch(setNoteText(key, text))} />
      {note.anchor === null ? (
        <p className="text-sm text-muted-foreground">Libera</p>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span>
            Ancorata a: <span className="font-medium">{anchorName}</span>
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => dispatch(detachNotes([key]))}>
            Stacca
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Corpo del pannello per le note (spec 3a §7): lo stesso con la nota selezionata o con la sua linea
 * di ancoraggio, che ha la stessa chiave — è la stessa nota vista da due punti.
 */
export function NoteProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const key = familySelectedKeys(selection, "node", "note")[0] ?? familySelectedKeys(selection, "edge", "note")[0]
  if (key === undefined) return null
  return <NoteBody key={key} noteKey={key} />
}
```

In `src/ui/panels/ClassProperties.tsx`, `NoteProperties` (quella delle note di classe) usa il campo nuovo invece di ripeterlo:

```tsx
function NoteProperties({ noteKey: key }: { noteKey: string }) {
  const note = useStore(documentStore, (s) => classDiagram(s.doc).model.notes[key])
  if (!note) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <NoteTextField id={qualify("class", key)} text={note.text} onCommit={(text) => dispatch(setNoteText(key, text))} />
    </div>
  )
}
```

(importa `NoteTextField` da `./NoteProperties`; togli gli import rimasti inutili, che `tsc` e `lint` segnalano; il docblock sopra la funzione si riduce a «Corpo del pannello per una nota di classe di un documento esistente: il campo «Testo» della nota unica.».)

Crea `src/ui/panels/NoteProperties.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { selId, sessionStore } from "@/editor/session-store"
import { createDocument } from "@/model/document"
import { NoteProperties } from "./NoteProperties"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.note.model.notes["a"] = { text: "ancorata", anchor: "er/ordini" }
  doc.diagram.note.view.nodes["a"] = { x: 0, y: 200, collapsed: false }
  doc.diagram.note.model.notes["l"] = { text: "libera", anchor: null }
  doc.diagram.note.view.nodes["l"] = { x: 0, y: 400, collapsed: false }
  documentStore.getState().load(doc)
  container = document.createElement("div")
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  sessionStore.getState().setSelection([])
})

const render = () => act(() => root.render(<NoteProperties />))

describe("NoteProperties", () => {
  it("una nota libera mostra il testo e «Libera»", () => {
    sessionStore.getState().setSelection([selId("node", "note/l")])
    render()
    expect(container.querySelector<HTMLTextAreaElement>("#note-text")?.value).toBe("libera")
    expect(container.textContent).toContain("Libera")
  })

  it("una nota ancorata dice a cosa, e «Stacca» la libera", () => {
    sessionStore.getState().setSelection([selId("node", "note/a")])
    render()
    expect(container.textContent).toContain("Ancorata a: ordini")
    const stacca = [...container.querySelectorAll("button")].find((b) => b.textContent === "Stacca")!
    act(() => stacca.click())
    expect(documentStore.getState().doc.diagram.note.model.notes["a"]!.anchor).toBeNull()
    expect(container.textContent).toContain("Libera")
  })

  it("con la linea di ancoraggio selezionata mostra la stessa nota", () => {
    sessionStore.getState().setSelection([selId("edge", "note/a")])
    render()
    expect(container.textContent).toContain("Ancorata a: ordini")
  })
})
```

- [ ] **Step 16: Export**

`src/ui/export/svg.tsx`:
- importa `noteDiagram` da `@/editor/note-access` e `AnchorEdgeView` da `@/ui/canvas/NoteAnchor`;
- `nodeModelsOf` ha il caso `case "note": return noteDiagram(doc).model.notes`;
- `edgeModelsOf` ha il caso `case "note": return {}` con il commento «Le linee di ancoraggio hanno l'altro capo in un'altra famiglia: le disegna il loro layer, qui sotto.»;
- `viewNodesOf` ha il caso `case "note": return noteDiagram(doc).view.nodes`;
- fra il `<g data-layer="edges">` e il `<g data-layer="links">` aggiungi il layer delle linee, nello stesso posto che hanno sul canvas (gli archi della famiglia `note`, prima dei collegamenti):

```tsx
      <g data-layer="anchors">
        {Object.entries(noteDiagram(doc).model.notes).map(([key, note]) => {
          if (note.anchor === null) return null
          const source = allOps.rectOf(qualify("note", key))
          const target = allOps.rectOf(note.anchor)
          // Un'àncora pendente non si disegna, come sul canvas.
          if (!source || !target) return null
          return <AnchorEdgeView key={key} noteKey={key} source={source} target={target} selected={false} />
        })}
      </g>
```

- il docblock di `buildSvg` aggiunge: «Le linee di ancoraggio delle note, come i collegamenti, hanno i capi in famiglie diverse: le risolve `CanvasOps`.».

In `src/ui/export/svg.test.ts` aggiungi (in fondo al `describe` delle classi o in uno nuovo):

```ts
describe("buildSvg e le note", () => {
  it("esporta la nota e la sua linea verso l'entità", () => {
    const doc = createDocument("export", "export")
    doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
    doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
    doc.diagram.note.model.notes["n1"] = { text: "da rivedere", anchor: "er/ordini" }
    doc.diagram.note.view.nodes["n1"] = { x: 400, y: 0, collapsed: false }
    const svg = buildSvg(doc, { vars })!
    expect(svg).toContain('data-node-id="note/n1"')
    expect(svg).toContain(">da rivedere<")
    expect(svg).toContain('data-edge-id="note/n1"')
  })

  it("un'àncora pendente non disegna la linea, ma la nota sì", () => {
    const doc = createDocument("export", "export")
    doc.diagram.note.model.notes["n1"] = { text: "sola", anchor: "er/fantasma" }
    doc.diagram.note.view.nodes["n1"] = { x: 0, y: 0, collapsed: false }
    const svg = buildSvg(doc, { vars })!
    expect(svg).toContain('data-node-id="note/n1"')
    expect(svg).not.toContain('data-edge-id="note/n1"')
  })
})
```

(`vars` è la costante che il file usa già per le altre chiamate a `buildSvg`.)

`src/ui/export/TextExportDialog.tsx`: le note non hanno un formato di testo proprio, quindi le mappe dei formati coprono solo le famiglie esportabili:

```ts
/** Le famiglie che hanno un formato di testo: le note escono dentro quello delle classi, o in nessuno (spec 3a §8). */
type ExportFamily = Exclude<Family, "note">
```

`FORMAT_FAMILY` diventa `Record<Format, ExportFamily>` e `MODEL_LIMITS` `Record<ExportFamily, string>`.

- [ ] **Step 17: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: tutto verde. Se `tsc` segnala un altro `switch` esaustivo o un `Record<Family, …>` che il piano non nomina, aggiungi il caso `note` con il comportamento più vicino a quello delle altre famiglie e scrivilo nel report.

- [ ] **Step 18: Commit**

```bash
git add -A src
git commit -m "feat(note): la famiglia delle note, libere o ancorate a qualunque elemento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Il travaso delle vecchie note, e la loro scomparsa dal modello

La migrazione 6 → 7 diventa quella completa: le note di classe e le note-forma del flusso entrano nella famiglia `note`. Poi `note-link`, `class.model.notes` e la forma `note` spariscono, e con loro il codice che li trattava. Gli export Mermaid leggono le note dalla famiglia nuova.

**Files:**
- Modify: `src/model/migrations.ts`, `src/model/migrations.test.ts`
- Modify: `src/model/class/schema.ts`, `src/model/class/schema.test.ts`, `src/model/class/validate.ts`, `src/model/class/validate.test.ts`
- Modify: `src/model/flow/schema.ts`, `src/model/flow/validate.ts`, `src/model/flow/validate.test.ts`
- Modify: `src/editor/class/commands.ts`, `src/editor/class/commands.test.ts`, `src/editor/class/geometry.ts`, `src/editor/class/geometry.test.ts`
- Modify: `src/editor/kinds/class.ts`, `src/editor/kinds/ops.test.ts`, `src/editor/flow/geometry.ts`
- Modify: `src/editor/links/commands.ts`, `src/editor/links/commands.test.ts`
- Modify: `src/io/emit/class-mermaid.ts`, `src/io/emit/class-mermaid.test.ts`, `src/io/emit/flow-mermaid.ts`, `src/io/emit/flow-mermaid.test.ts`, `src/io/emit/er-mermaid.ts`, `src/io/emit/er-mermaid.test.ts`
- Delete: `src/ui/canvas/ClassNote.tsx`
- Modify: `src/ui/canvas/kinds/class.tsx`, `src/ui/canvas/kinds/flow.tsx`, `src/ui/canvas/kinds/registry.ts`, `src/ui/canvas/kinds/registry.test.ts`, `src/ui/canvas/class-render.test.tsx`, `src/ui/canvas/use-canvas-interaction.ts`
- Modify: `src/ui/flow-shapes.ts`, `src/ui/panels/ClassProperties.tsx`
- Modify: `src/ui/export/svg.tsx`, `src/ui/export/svg.test.ts`, `src/ui/export/TextExportDialog.tsx`
- Modify (solo fixture): ogni test che scrive `notes: {}` in un `ClassModel` o una nota di classe; `tsc -b` li elenca tutti.

**Interfaces:**
- Consumes (Task 1): `Note`, `NoteModel`, la famiglia `note` nel documento, `noteDiagram`, `NoteTextField`, `anchorExists`.
- Produces:
  - `emitClassMermaid(model: ClassModel, notes: Readonly<Record<string, Note>> = {})`, `emitFlowMermaid(model: FlowModel, notes: Readonly<Record<string, Note>> = {})`, `emitMermaid(model: ErModel, notes: Readonly<Record<string, Note>> = {})`.
  - `ClassModel = { classes; relations }`; `RelationKind` senza `note-link`; `CLASS_RELATION_KINDS = RelationKindSchema.options`. Spariscono `ClassNote`, `ClassNoteSchema`, `ClassRelationKind`, `isClassRelation`.
  - `FlowShape` senza `note`.
  - `deleteClassItems(classKeys, relationKeys)`, senza il terzo parametro. Spariscono `addNote`, `setNoteText` e `addNoteLink` da `class/commands.ts`.

- [ ] **Step 1: La migrazione completa**

In `src/model/migrations.ts` sostituisci `addNotes` con:

```ts
/** Il primo id libero fra le note già travasate: una nota di flusso che collide con una di classe prende un suffisso. */
function freeNoteId(key: string, taken: Obj): string {
  if (!(key in taken)) return key
  let n = 2
  while (`${key}_${n}` in taken) n++
  return `${key}_${n}`
}

/**
 * 6 → 7: le note diventano una famiglia (spec 3a §4).
 *
 * 1. **Le note di classe** tengono id, testo e posizione. L'àncora è la classe del loro `note-link`
 *    (il primo in ordine di chiave, se un file scritto a mano ne ha più d'uno). I `note-link`
 *    spariscono dalle relazioni.
 * 2. **Le note di flusso** (nodi con forma `note`) diventano note con l'etichetta come testo e la
 *    stessa posizione. L'àncora è l'altro capo del primo arco che le tocca, in ordine di id, purché
 *    non sia un'altra nota. Tutti gli archi che toccano una nota spariscono; l'appartenenza alla
 *    corsia si perde con il nodo. Gli archi in più non lasciano traccia: una migrazione non ha modo
 *    di avvisare (spec 3a §10).
 * 3. **Un id in conflitto** con una nota di classe fa prendere alla nota di flusso il primo suffisso
 *    libero: succede solo con file scritti a mano, gli id generati sono uuid.
 */
const notesIntoFamily: Migration = (raw) => {
  const diagram = raw.diagram
  if (!isObj(diagram)) return raw
  const notes: Obj = {}
  const views: Obj = {}
  let classPart = diagram.class
  let flowPart = diagram.flow

  if (isObj(classPart) && isObj(classPart.model) && isObj(classPart.view)) {
    const { notes: classNotes, ...model } = classPart.model
    const relations = isObj(model.relations) ? model.relations : {}
    const classViews = isObj(classPart.view.nodes) ? classPart.view.nodes : {}
    const anchorOf = new Map<string, string>()
    const keptRelations: Obj = {}
    for (const key of Object.keys(relations).sort()) {
      const rel = relations[key]
      if (!isObj(rel) || rel.kind !== "note-link") {
        keptRelations[key] = rel
        continue
      }
      const note = isObj(rel.source) ? rel.source.class : undefined
      const cls = isObj(rel.target) ? rel.target.class : undefined
      if (typeof note === "string" && typeof cls === "string" && !anchorOf.has(note)) anchorOf.set(note, cls)
    }
    const keptViews: Obj = { ...classViews }
    for (const [key, note] of Object.entries(isObj(classNotes) ? classNotes : {})) {
      const cls = anchorOf.get(key)
      notes[key] = { text: isObj(note) && typeof note.text === "string" ? note.text : "", anchor: cls === undefined ? null : `class/${cls}` }
      if (classViews[key] !== undefined) views[key] = classViews[key]
      delete keptViews[key]
    }
    classPart = { ...classPart, model: { ...model, relations: keptRelations }, view: { ...classPart.view, nodes: keptViews } }
  }

  if (isObj(flowPart) && isObj(flowPart.model) && isObj(flowPart.view)) {
    const nodes = isObj(flowPart.model.nodes) ? flowPart.model.nodes : {}
    const edges = isObj(flowPart.model.edges) ? flowPart.model.edges : {}
    const flowViews = isObj(flowPart.view.nodes) ? flowPart.view.nodes : {}
    const isNote = (key: unknown): key is string => typeof key === "string" && isObj(nodes[key]) && (nodes[key] as Obj).shape === "note"
    const anchorOf = new Map<string, string>()
    const keptEdges: Obj = {}
    for (const key of Object.keys(edges).sort()) {
      const edge = edges[key]
      const source = isObj(edge) ? edge.source : undefined
      const target = isObj(edge) ? edge.target : undefined
      if (!isNote(source) && !isNote(target)) {
        keptEdges[key] = edge
        continue
      }
      if (isNote(source) && !isNote(target) && typeof target === "string" && !anchorOf.has(source)) anchorOf.set(source, target)
      if (isNote(target) && !isNote(source) && typeof source === "string" && !anchorOf.has(target)) anchorOf.set(target, source)
    }
    const keptNodes: Obj = {}
    const keptViews: Obj = {}
    for (const key of Object.keys(nodes).sort()) {
      if (!isNote(key)) {
        keptNodes[key] = nodes[key]
        if (flowViews[key] !== undefined) keptViews[key] = flowViews[key]
        continue
      }
      const node = nodes[key] as Obj
      const id = freeNoteId(key, notes)
      const other = anchorOf.get(key)
      notes[id] = { text: typeof node.label === "string" ? node.label : "", anchor: other === undefined ? null : `flow/${other}` }
      if (flowViews[key] !== undefined) views[id] = flowViews[key]
    }
    flowPart = {
      ...flowPart,
      model: { ...flowPart.model, nodes: keptNodes, edges: keptEdges },
      view: { ...flowPart.view, nodes: keptViews },
    }
  }

  return { ...raw, diagram: { ...diagram, class: classPart, flow: flowPart, note: { model: { notes }, view: { nodes: views } } } }
}
```

e nella tabella `[6, notesIntoFamily]`. Le view dei nodi di flusso rimasti conservano il loro ordine di chiave: un nodo senza view resta senza view, come prima.

- [ ] **Step 2: I test della migrazione**

In `src/model/migrations.test.ts` il `describe("migrazione 6 → 7")` del Task 1 diventa:

```ts
describe("migrazione 6 → 7", () => {
  /** Un documento v6 con le parti di classe e di flusso date, senza la parte delle note. */
  function v6(parts: { class?: unknown; flow?: unknown }): string {
    const doc = JSON.parse(toJson(createDocument("Prova", "v6doc"))) as { diagram: Record<string, unknown> }
    delete doc.diagram.note
    return JSON.stringify({ ...doc, schemaVersion: 6, diagram: { ...doc.diagram, ...parts } })
  }
  const at = (x: number, y: number) => ({ x, y, collapsed: false })
  const end = (c: string) => ({ class: c, multiplicity: "", role: "" })
  const ordine = { name: "Ordine", stereotype: "class", attributes: [], methods: [] }
  const flow = (nodes: Record<string, unknown>, edges: Record<string, unknown>, views: Record<string, unknown>, pools: Record<string, unknown> = {}, poolViews: Record<string, unknown> = {}, lanes: Record<string, unknown> = {}) => ({
    model: { pools, nodes, edges },
    view: { nodes: views, pools: poolViews, lanes },
  })

  it("una nota di classe ancorata diventa una nota con l'àncora, e il note-link sparisce", () => {
    const r = parseDocument(v6({
      class: {
        model: {
          classes: { Ordine: ordine },
          relations: { r1: { kind: "note-link", source: end("n1"), target: end("Ordine") } },
          notes: { n1: { text: "da rivedere" }, n2: { text: "legenda" } },
        },
        view: { nodes: { Ordine: at(0, 0), n1: at(300, 0), n2: at(300, 200) } },
      },
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { class: cls, note } = r.document.diagram
    expect(note.model.notes).toEqual({ n1: { text: "da rivedere", anchor: "class/Ordine" }, n2: { text: "legenda", anchor: null } })
    expect(note.view.nodes).toEqual({ n1: at(300, 0), n2: at(300, 200) })
    expect(cls.model.relations).toEqual({})
    expect(cls.view.nodes).toEqual({ Ordine: at(0, 0) })
  })

  it("con due note-link per la stessa nota vale il primo in ordine di chiave", () => {
    const r = parseDocument(v6({
      class: {
        model: {
          classes: { Ordine: ordine, Riga: { ...ordine, name: "Riga" } },
          relations: {
            b: { kind: "note-link", source: end("n1"), target: end("Riga") },
            a: { kind: "note-link", source: end("n1"), target: end("Ordine") },
          },
          notes: { n1: { text: "" } },
        },
        view: { nodes: { Ordine: at(0, 0), Riga: at(300, 0), n1: at(0, 300) } },
      },
    }))
    expect(r.ok && r.document.diagram.note.model.notes["n1"]!.anchor).toBe("class/Ordine")
  })

  it("una nota di flusso prende l'àncora dal primo arco, e gli archi che la toccano spariscono", () => {
    const r = parseDocument(v6({
      flow: flow(
        {
          a: { label: "Ordina", shape: "process", lane: null },
          b: { label: "Spedisce", shape: "process", lane: null },
          f: { label: "promemoria", shape: "note", lane: null },
        },
        {
          e2: { source: "f", target: "b", label: "" },
          e1: { source: "a", target: "f", label: "" },
          e3: { source: "a", target: "b", label: "" },
        },
        { a: at(0, 0), b: at(300, 0), f: at(0, 200) },
      ),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { flow: part, note } = r.document.diagram
    expect(note.model.notes).toEqual({ f: { text: "promemoria", anchor: "flow/a" } })
    expect(note.view.nodes).toEqual({ f: at(0, 200) })
    expect(Object.keys(part.model.nodes).sort()).toEqual(["a", "b"])
    expect(part.model.edges).toEqual({ e3: { source: "a", target: "b", label: "" } })
    expect(part.view.nodes).toEqual({ a: at(0, 0), b: at(300, 0) })
  })

  it("una nota di flusso senza archi, o collegata solo a un'altra nota, resta libera", () => {
    const r = parseDocument(v6({
      flow: flow(
        { f: { label: "uno", shape: "note", lane: null }, g: { label: "due", shape: "note", lane: null } },
        { e1: { source: "f", target: "g", label: "" } },
        { f: at(0, 0), g: at(300, 0) },
      ),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.diagram.note.model.notes).toEqual({ f: { text: "uno", anchor: null }, g: { text: "due", anchor: null } })
    expect(r.document.diagram.flow.model.edges).toEqual({})
  })

  it("una nota di flusso in una corsia si ancora al nodo nel pool, e il pool resta valido", () => {
    // Review Focus 5.
    const r = parseDocument(v6({
      flow: flow(
        { a: { label: "Ordina", shape: "process", lane: "l1" }, f: { label: "attenzione", shape: "note", lane: "l1" } },
        { e1: { source: "f", target: "a", label: "" } },
        { a: at(100, 20), f: at(300, 20) },
        { p1: { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] } },
        { p1: { x: -32, y: 0, w: 672 } },
        { l1: { h: 160 } },
      ),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.diagram.note.model.notes).toEqual({ f: { text: "attenzione", anchor: "flow/a" } })
    expect(r.document.diagram.flow.model.pools["p1"]).toEqual({ name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] })
    expect(r.document.diagram.flow.model.nodes).toEqual({ a: { label: "Ordina", shape: "process", lane: "l1" } })
  })

  it("una nota di flusso con lo stesso id di una nota di classe prende un suffisso", () => {
    const r = parseDocument(v6({
      class: { model: { classes: {}, relations: {}, notes: { x: { text: "di classe" } } }, view: { nodes: { x: at(0, 0) } } },
      flow: flow({ x: { label: "di flusso", shape: "note", lane: null } }, {}, { x: at(0, 300) }),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.diagram.note.model.notes).toEqual({ x: { text: "di classe", anchor: null }, x_2: { text: "di flusso", anchor: null } })
    expect(r.document.diagram.note.view.nodes).toEqual({ x: at(0, 0), x_2: at(0, 300) })
  })

  it("un documento v7 con una nota ancorata e una libera torna uguale dal file", () => {
    const doc = createDocument("t", "t")
    doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
    doc.diagram.er.view.nodes["ordini"] = at(0, 0)
    doc.diagram.note.model.notes["a"] = { text: "ancorata", anchor: "er/ordini" }
    doc.diagram.note.view.nodes["a"] = at(300, 0)
    doc.diagram.note.model.notes["l"] = { text: "libera", anchor: null }
    doc.diagram.note.view.nodes["l"] = at(300, 200)
    const r = parseDocument(toJson(doc))
    expect(r.ok && r.document.diagram.note).toEqual(doc.diagram.note)
  })
})
```

In testa al file, il test «aggiunge notes a un diagramma di classi» della migrazione 1 → 2 non può più leggere `class.model.notes` in fondo alla catena: diventa

```ts
  it("un diagramma di classi v1 arriva alla versione corrente con le note nella loro famiglia, vuote", () => {
    const out = migrateDocument(v1Class)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(7)
    expect((doc.diagram as { note: unknown }).note).toEqual({ model: { notes: {} }, view: { nodes: {} } })
    expect((doc.diagram as { class: { model: Record<string, unknown> } }).class.model).toEqual({ classes: {}, relations: {} })
  })
```

Ogni altro test della catena che, in fondo alla catena, legge `class.model.notes` o si aspetta una nota di classe va aggiornato allo stesso modo: le note si leggono in `diagram.note`.

- [ ] **Step 3: Le classi senza note**

`src/model/class/schema.ts`:
- `RelationKindSchema` perde `"note-link"` e il suo commento;
- spariscono `ClassRelationKind`, `isClassRelation`, `ClassNoteSchema`, `ClassNote` e il loro docblock;
- `CLASS_RELATION_KINDS` diventa `export const CLASS_RELATION_KINDS: readonly RelationKind[] = RelationKindSchema.options` con il docblock «Le sei specie offerte dal selettore del pannello.»;
- `ClassModelSchema` perde `notes`; il commento accanto a `model:` in `ClassDiagramSchema` diventa `// { classes: Record<string, ClassNode>, relations: Record<string, ClassRelation> }`;
- `emptyClassDiagram` torna `{ model: { classes: {}, relations: {} }, view: { nodes: {} } }`.

Ogni uso di `ClassRelationKind` diventa `RelationKind`, e ogni chiamata a `isClassRelation(rel)` sparisce (ogni relazione collega due classi). Chi sono: `tsc -b` li elenca.

`src/model/class/validate.ts`: il ciclo sulle relazioni diventa

```ts
  for (const [key, rel] of Object.entries(model.relations)) {
    for (const end of [rel.source, rel.target]) {
      if (!(end.class in model.classes)) {
        issues.push({ code: "dangling-relation", severity: "error", edge: key, message: `relazione "${key}": classe "${end.class}" inesistente` })
      }
    }
  }
```

`src/editor/class/geometry.ts`: `umlMarkerPath` perde la guardia `note-link` e il suo commento; `isDashed` diventa `kind === "realization" || kind === "dependency"` con il docblock «`true` se la linea dell'arco va tratteggiata: realizzazione e dipendenza.».

`src/editor/class/commands.ts`:
- spariscono `addNoteLink`, `addNote`, `setNoteText` e l'import di `noteSize`;
- `deleteClassItems` diventa

```ts
export function deleteClassItems(classKeys: readonly string[], relationKeys: readonly string[]): Recipe | null {
  if (classKeys.length === 0 && relationKeys.length === 0) return null
  const classes = new Set(classKeys)
  return (draft) => {
    const d = classDiagram(draft)
    for (const key of relationKeys) delete d.model.relations[key]
    for (const [key, rel] of Object.entries(d.model.relations)) {
      if (classes.has(rel.source.class) || classes.has(rel.target.class)) delete d.model.relations[key]
    }
    for (const key of classKeys) {
      delete d.model.classes[key]
      delete d.view.nodes[key]
    }
  }
}
```

- `duplicateClasses` perde `notePlan` e il suo ramo; il docblock diventa «Copia le classi con suffisso `_2`/`_3` di `uniqueKey`; le relazioni non si duplicano.»;
- `classLayoutGraph` perde il ciclo sulle note e il secondo paragrafo del docblock.

`src/editor/kinds/class.ts`:
- `rectOf` torna `const cls = diagram().model.classes[key]; return cls ? classRect(cls, at_) : null` senza il ramo della nota;
- `addNode: (at, variant) => ({ ...addClass(diagram().model.classes, at, StereotypeSchema.catch("class").parse(variant)), edit: "name" })`;
- `addEdge: (source, target) => addRelation(diagram().model.relations, source, target)`;
- `deleteItems: (nodeKeys, edgeKeys) => deleteClassItems(nodeKeys, edgeKeys)`;
- via gli import e i commenti che parlano di note.

`src/editor/kinds/ops.ts`: il docblock di `DiagramOps.addEdge` diventa «`null` quando i due estremi non possono essere collegati.»; in `src/editor/kinds/canvas-ops.ts` il docblock di `CanvasOps.addEdge` perde «(due note)».

`src/ui/panels/ClassProperties.tsx`: spariscono `NoteProperties`, il ramo `note-link` di `RelationProperties`, la voce `"note-link"` di `RELATION_LABEL`, l'import di `NoteTextField` e di `setNoteText`. `ClassProperties` diventa:

```tsx
export function ClassProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const nodes = familySelectedKeys(selection, "node", "class")
  if (nodes.length === 1) return <ClassNodeProperties key={nodes[0]} classKey={nodes[0]!} />
  const relations = familySelectedKeys(selection, "edge", "class")
  return <RelationProperties key={relations[0]} relationKey={relations[0]!} />
}
```

con il docblock senza il paragrafo su classi e note che condividono le chiavi.

Cancella `src/ui/canvas/ClassNote.tsx`. In `src/ui/canvas/kinds/class.tsx`: `NodesLayer` disegna solo le classi (un selettore solo, e via il paragrafo «Due selettori e non uno»), `NodeView` disegna solo `ClassNodeView`, e spariscono gli import di `ClassNoteNode`, `NoteView`, `ClassNote`.

`src/ui/canvas/use-canvas-interaction.ts`: in `classEditTarget` sparisce la riga `if (diagram.model.notes[key]) return "body"` con il suo commento.

- [ ] **Step 4: Il flusso senza la forma nota**

`src/model/flow/schema.ts`: `FlowShapeSchema = z.enum(["terminal", "process", "decision", "io", "subprocess"])`, con il docblock «Le cinque forme della notazione. La nota non è una forma: è la famiglia `note` (spec 3a).».

`src/editor/flow/geometry.ts`: `shapePath` perde il caso `note` e l'import di `notePath`; il docblock parla solo di `subprocess` («`subprocess` torna più di un sottopercorso nello stesso `d`: due barre verticali aperte…»).

`src/model/flow/validate.ts`: spariscono i due `if (node.shape === "note") continue` e i loro commenti.

`src/ui/flow-shapes.ts`: `FLOW_SHAPE_LABEL` e `FLOW_SHAPE_ICON` perdono la voce `note` (e l'import di `StickyNote`); il commento di `FLOW_SHAPES` dice «Le cinque forme».

`src/ui/canvas/kinds/flow.tsx`: gli strumenti usano sempre `FLOW_SHAPE_LABEL[shape]` (via la riga con il ternario e il suo commento); il commento sopra `tools` dice «Sei varianti: una per forma, e in fondo il pool. Per le forme l'ordine e il tasto (`1`..`5`) seguono `FLOW_SHAPES`…».

`src/ui/canvas/kinds/registry.ts`: il docblock di `toolId` diventa «Identità di uno strumento nel ToggleGroup: strumento, famiglia e variante, perché due famiglie possono dichiarare la stessa variante.».

`src/ui/canvas/kinds/registry.test.ts`:
- il test del flowchart dice «cinque forme più il pool» e `toHaveLength(6)`;
- il test «le sei varianti di forma…» si intitola «le varianti di forma sono esattamente quelle di FlowShapeSchema, il pool a parte»;
- il test «la nota del flusso ha un'etichetta sua…» sparisce;
- nella mappa tasto → forma sparisce `expect(byKey.get("6")).toBe("note")` e al suo posto `expect(byKey.has("6")).toBe(false)`;
- in `toolId` il primo caso usa `{ tool: "node", family: "class", variant: "interface" }` → `"node:class:interface"`, il secondo `{ tool: "node", family: "flow", variant: "decision" }` → `"node:flow:decision"`, e il titolo diventa «compone strumento, famiglia e variante».

- [ ] **Step 5: I collegamenti senza note**

`src/editor/links/commands.ts`: in una nota non si parte né si arriva più con un collegamento tipizzato (Collega fra una nota e un altro elemento è un ancoraggio, `CanvasOps` lo instrada prima). `refusal` diventa

```ts
/**
 * Il motivo per cui gli estremi non ammettono il tipo, o `null` se lo ammettono. `source` e `target`
 * sono già nel verso del tipo. Solo «mappa su» ha una regola: una classe si mappa solo se è `class` o
 * `abstract`, e la regola vive nel modello (`unmappableNotice`), la stessa fonte dell'errore
 * `link-unmappable` di `validateLinks`.
 */
function refusal(doc: DevDocument, kind: LinkKind, source: string): string | null {
  if (kind !== "maps-to") return null
  const cls = classDiagram(doc).model.classes[splitKey(source).key]
  return cls ? unmappableNotice(cls.stereotype) : null
}
```

la chiamata diventa `refusal(doc, rule.kind, source)`, e spariscono `isFlowNote` e l'import di `flowDiagram`.

`src/editor/links/commands.test.ts`: il documento di prova perde la nota di classe `n1` e la nota di flusso `f1` (e il docblock di `documento` non le nomina più); i test «un'interfaccia, un enum e una nota non si mappano su una tabella» e «le note non leggono, non scrivono, non chiamano e non si chiamano» perdono i casi con le note (il primo si intitola «un'interfaccia e un enum non si mappano su una tabella»; il secondo sparisce se gli restano solo casi di note).

- [ ] **Step 6: Gli export Mermaid leggono la famiglia delle note**

`src/io/emit/class-mermaid.ts`:
- `emitClassMermaid(model: ClassModel, notes: Readonly<Record<string, Note>> = {})`, con `import type { Note } from "@/model/note/schema"` e `import { splitKey } from "@/model/family"`;
- il ciclo sulle relazioni perde il `continue` su `isClassRelation`;
- il blocco delle note diventa:

```ts
  // Le note escono qui se sono libere o ancorate a una classe; quelle ancorate a un'altra famiglia
  // le conta l'export di quella famiglia (spec 3a §8).
  for (const key of Object.keys(notes).sort()) {
    const { text, anchor } = notes[key]!
    // Una nota vuota non ha niente da dire: `note ""` è rumore nel file emesso.
    if (text === "") continue
    if (anchor !== null && splitKey(anchor).family !== "class") continue
    const cls = anchor === null ? undefined : splitKey(anchor).key
    // Un'àncora verso una classe che non esiste esce come nota libera: `note for Fantasma` sarebbe
    // un file che Mermaid rifiuta, e il pannello Problemi segnala già il guasto.
    const head = cls !== undefined && cls in model.classes ? `note for ${safeName(cls, renamed)}` : "note"
    out.push(`  ${head} "${noteText(text)}"`)
  }
```

- sparisce la mappa `anchorOf` e il suo commento; il docblock dell'emettitore aggiunge «Le note arrivano a parte, dalla loro famiglia.».

`src/io/emit/flow-mermaid.ts`:
- `emitFlowMermaid(model: FlowModel, notes: Readonly<Record<string, Note>> = {})`;
- `SHAPE_TEMPLATE` perde il caso `note` (e il suo docblock torna a una riga: «Il template Mermaid per ciascuna forma. L'etichetta arriva già scappata da `escapeLabel`.»);
- `emittable` diventa `Object.keys(model.nodes).filter((key) => model.nodes[key]!.lane === lane).sort()`, senza il conteggio delle note; spariscono `noteCount`, `noteEdgeCount` e il loro commento;
- nel ciclo degli archi, un estremo senza id è sempre un estremo inesistente, già segnalato da `validateFlow`: il blocco diventa `if (sourceId === undefined || targetId === undefined) continue`, con il commento «Un estremo inesistente lo segnala già `validateFlow` (`flow-dangling-edge`): qui si scarta e basta.»;
- gli avvisi sulle note diventano uno solo:

```ts
  const anchored = Object.values(notes).filter((n) => n.anchor !== null && splitKey(n.anchor).family === "flow").length
  if (anchored > 0) {
    warnings.push(
      anchored === 1
        ? "1 nota ancorata al flusso non è uscita: i flowchart di Mermaid non hanno note."
        : `${anchored} note ancorate al flusso non sono uscite: i flowchart di Mermaid non hanno note.`,
    )
  }
```

- nel docblock dell'emettitore sparisce il paragrafo sulle note escluse dalla numerazione.

`src/io/emit/er-mermaid.ts`: `emitMermaid(model: ErModel, notes: Readonly<Record<string, Note>> = {})`, e prima del `return` l'avviso gemello:

```ts
  const anchored = Object.values(notes).filter((n) => n.anchor !== null && splitKey(n.anchor).family === "er").length
  if (anchored > 0) {
    warnings.push(
      anchored === 1
        ? "1 nota ancorata a un'entità non è uscita: i diagrammi ER di Mermaid non hanno note."
        : `${anchored} note ancorate a entità non sono uscite: i diagrammi ER di Mermaid non hanno note.`,
    )
  }
```

`src/ui/export/TextExportDialog.tsx`: `Models` guadagna `notes: Readonly<Record<string, Note>>`, letto nel selettore come `notes: noteDiagram(s.doc).model.notes` (un riferimento stabile, come i modelli); `emit` passa `models.notes` come secondo argomento a `emitMermaid`, `emitClassMermaid` ed `emitFlowMermaid`. Importa `noteDiagram` e il tipo `Note`.

`src/ui/export/svg.tsx`: `nodeModelsOf` per `class` torna `classDiagram(doc).model.classes`.

- [ ] **Step 7: I test degli export**

`src/io/emit/class-mermaid.test.ts`:
- il `modello(...)` in testa perde `notes: {}`;
- nel `describe("note")` l'helper diventa `const conNote = (notes: Record<string, { text: string }>) => Object.fromEntries(Object.entries(notes).map(([k, n]) => [k, { ...n, anchor: null }]))`, e ogni chiamata `emitClassMermaid(modello({ … }))` diventa `emitClassMermaid({ classes: {}, relations: {} }, conNote({ … }))`;
- il `describe("note ancorate")` diventa:

```ts
describe("note ancorate", () => {
  const cliente = classe("Cliente")
  const model = { classes: { Cliente: cliente }, relations: {} }

  it("la nota ancorata a una classe esce come `note for`, la libera resta `note`", () => {
    const out = emitClassMermaid(model, {
      n1: { text: "da rivedere", anchor: "class/Cliente" },
      n2: { text: "legenda", anchor: null },
    })
    expect(out.text).toContain('note for Cliente "da rivedere"')
    expect(out.text).toContain('note "legenda"')
  })

  it("una nota ancorata a un'entità o a un nodo di flusso non esce nel class diagram", () => {
    const out = emitClassMermaid(model, {
      n1: { text: "ER", anchor: "er/ordini" },
      n2: { text: "flusso", anchor: "flow/n1" },
    })
    expect(out.text).not.toContain("note")
  })

  it("un'àncora verso una classe che non c'è esce come nota libera, non come `note for` rotta", () => {
    const out = emitClassMermaid(model, { n1: { text: "x", anchor: "class/Fantasma" } })
    expect(out.text).toContain('note "x"')
    expect(out.text).not.toContain("Fantasma")
  })
})
```

`src/io/emit/flow-mermaid.test.ts`: il `describe("emitFlowMermaid: note omesse")` diventa:

```ts
describe("emitFlowMermaid: le note ancorate al flusso", () => {
  const model = { pools: {}, nodes: { n1: { label: "Ordina", shape: "process" as const, lane: null } }, edges: {} }

  it("non escono, e l'avviso le conta al singolare", () => {
    const { text, warnings } = emitFlowMermaid(model, { a: { text: "x", anchor: "flow/n1" } })
    expect(text).not.toContain("x")
    expect(warnings).toContain("1 nota ancorata al flusso non è uscita: i flowchart di Mermaid non hanno note.")
  })

  it("al plurale, contando anche quelle ancorate a un pool, e ignorando le altre", () => {
    const { warnings } = emitFlowMermaid(model, {
      a: { text: "", anchor: "flow/n1" },
      b: { text: "", anchor: "flow/p1" },
      c: { text: "", anchor: "class/Ordine" },
      d: { text: "", anchor: null },
    })
    expect(warnings).toContain("2 note ancorate al flusso non sono uscite: i flowchart di Mermaid non hanno note.")
  })

  it("senza note ancorate al flusso non c'è nessun avviso sulle note", () => {
    expect(emitFlowMermaid(model).warnings.some((w) => w.includes("nota") || w.includes("note"))).toBe(false)
  })
})
```

e ogni altro test del file che crea un nodo con `shape: "note"` perde quel nodo (i test che esistevano solo per le note se ne vanno con il `describe` sopra).

`src/io/emit/er-mermaid.test.ts`, in fondo:

```ts
describe("emitMermaid: le note ancorate alle entità", () => {
  const model = { entities: {}, relationships: {} }

  it("l'avviso le conta, al singolare e al plurale, e ignora le altre", () => {
    expect(emitMermaid(model, { a: { text: "", anchor: "er/ordini" } }).warnings).toContain(
      "1 nota ancorata a un'entità non è uscita: i diagrammi ER di Mermaid non hanno note.",
    )
    expect(
      emitMermaid(model, { a: { text: "", anchor: "er/ordini" }, b: { text: "", anchor: "er/clienti" }, c: { text: "", anchor: null } }).warnings,
    ).toContain("2 note ancorate a entità non sono uscite: i diagrammi ER di Mermaid non hanno note.")
  })
})
```

`src/ui/export/svg.test.ts`: il test «esporta anche le note, che sono nodi come le classi» sparisce (lo copre `buildSvg e le note` del Task 1).

- [ ] **Step 8: Il resto dei test**

Cancella questi test, che provano codice che non esiste più (i nuovi equivalenti stanno nei test del Task 1):
- `src/model/class/schema.test.ts`: il `describe("note-link")` intero, e nel `describe("note e navigabilità")` i test «un modello senza notes non passa più», «una nota è testo libero, anche vuoto e multiriga», «createDocument nasce con le note di classe vuote e alla versione corrente» (resta il test sulla navigabilità, e il `describe` si chiama «navigabilità»);
- `src/model/class/validate.test.ts`: il `describe("ancoraggi delle note")`;
- `src/model/flow/validate.test.ts`: «una nota non partecipa al flusso: né irraggiungibile né senza uscite»;
- `src/editor/kinds/ops.test.ts`: il `describe("classOps e le note")`;
- `src/editor/class/commands.test.ts`: i `describe("comandi delle note")` e `describe("addNoteLink")`, e nei test del grafo di layout i tre casi sulle note («tutte le note sono nodi del grafo di layout…», «l'ancoraggio è un arco del grafo…», «una nota senza view resta fuori dal grafo…»);
- `src/editor/class/geometry.test.ts`: il `describe("ancoraggio di una nota")`;
- `src/ui/canvas/class-render.test.tsx`: il `describe("ClassEdge — connesso allo store")` (esisteva per l'ancoraggio nota → classe) e gli import che restano inutili.

Poi `pnpm tsc -b`: ogni `notes: {}` rimasto in un `ClassModel` di un test, e ogni nota di classe scritta a mano in una fixture, è un errore di tipo. Togli il campo o la nota, senza cambiare il resto del test.

- [ ] **Step 9: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: tutto verde. Poi `grep -rn "note-link\|isClassRelation\|ClassRelationKind\|ClassNote\|shape: \"note\"" src` non trova niente fuori da `src/model/migrations.ts` e dai suoi test.

- [ ] **Step 10: Commit**

```bash
git add -A src
git commit -m "feat(note): le note di classe e di flusso entrano nella famiglia delle note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Disponi con le note

Le note ancorate seguono il loro elemento con lo stesso scarto; le note libere formano l'ultimo blocco, come fanno già grazie a `noteLayoutGraph`.

**Files:**
- Create: `src/editor/note/layout.ts`
- Modify: `src/editor/layout-pack.ts`, `src/editor/layout-pack.test.ts`

**Interfaces:**
- Consumes (Task 1): `noteDiagram`, `anchorExists`, `canvasOps`, `noteLayoutGraph` (dentro `noteOps.layoutGraph`).
- Produces: da `@/editor/note/layout`: `followAnchors(doc: DevDocument): Recipe | null`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/layout-pack.test.ts` aggiungi in fondo:

```ts
describe("layoutAll e le note (spec 3a §6)", () => {
  function conNota() {
    documentStore.getState().load(createDocument("t", "t"))
    const add = (family: "er" | "note", at: { x: number; y: number }) => {
      const { key, recipe } = canvasOps(documentStore.getState().doc).addNode(at, family)
      documentStore.getState().dispatch(recipe)
      return key
    }
    const a = add("er", { x: 500, y: 500 })
    const b = add("er", { x: 900, y: 500 })
    const nota = add("note", { x: 520, y: 700 })
    const connect = canvasOps(documentStore.getState().doc).addEdge(nota, a)
    if (connect?.type === "created") documentStore.getState().dispatch(connect.recipe)
    const libera = add("note", { x: 2000, y: 2000 })
    return { a, b, nota, libera }
  }

  it("la nota ancorata segue la sua entità con lo stesso scarto", async () => {
    const { a, nota } = conNota()
    const before = canvasOps(documentStore.getState().doc)
    const offset = { x: before.rectOf(nota)!.x - before.rectOf(a)!.x, y: before.rectOf(nota)!.y - before.rectOf(a)!.y }
    const recipe = await layoutAll(documentStore.getState().doc, fila)
    documentStore.getState().dispatch(recipe!)
    const after = canvasOps(documentStore.getState().doc)
    expect(after.rectOf(nota)!.x - after.rectOf(a)!.x).toBe(offset.x)
    expect(after.rectOf(nota)!.y - after.rectOf(a)!.y).toBe(offset.y)
    // L'entità si è spostata davvero: altrimenti il test passerebbe anche senza il passo delle note.
    expect(after.rectOf(a)!.x).not.toBe(before.rectOf(a)!.x)
  })

  it("la nota libera fa l'ultimo blocco, dopo l'ER, e tutto è un solo passo di annulla", async () => {
    const { b, libera } = conNota()
    const past = documentStore.getState().past.length
    const recipe = await layoutAll(documentStore.getState().doc, fila)
    documentStore.getState().dispatch(recipe!)
    const ops = canvasOps(documentStore.getState().doc)
    expect(ops.rectOf(libera)!.x).toBe(ops.rectOf(b)!.x + ops.rectOf(b)!.w + LAYOUT_FAMILY_GAP)
    expect(documentStore.getState().past.length).toBe(past + 1)
  })

  it("con sole note ancorate e nessuna libera, le note seguono lo stesso", async () => {
    const { a, nota, libera } = conNota()
    documentStore.getState().dispatch(canvasOps(documentStore.getState().doc).deleteItems([libera], [])!)
    const recipe = await layoutAll(documentStore.getState().doc, fila)
    documentStore.getState().dispatch(recipe!)
    const ops = canvasOps(documentStore.getState().doc)
    expect(ops.rectOf(nota)!.x - ops.rectOf(a)!.x).toBe(20)
  })
})
```

(`past` è la pila dell'annulla di `documentStore`; lo scarto dell'ultimo test è 520 − 500.)

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/editor/layout-pack.test.ts`
Expected: FAIL sul primo e sul terzo test (la nota resta dov'era); il secondo può già passare.

- [ ] **Step 3: Il passo delle note ancorate**

Crea `src/editor/note/layout.ts`:

```ts
import type { DevDocument } from "@/model/document"
import { anchorExists } from "@/model/note/validate"
import type { Recipe } from "../document-store"
import { snap } from "../geometry"
import { canvasOps } from "../kinds/canvas-ops"
import { noteDiagram } from "../note-access"

/**
 * Le note ancorate seguono il loro elemento con lo scarto che avevano prima di Disponi (spec 3a §6).
 * Lo scarto si misura sul documento di partenza, `doc`; la posizione nuova dell'elemento si legge sul
 * draft, **dopo** le recipe di tutte le famiglie: per questo il passo è l'ultimo di `layoutAll`, e non
 * dipende dall'ordine di `FAMILIES`. Una nota con l'àncora pendente è libera: la dispone il suo blocco.
 * `null` se nessuna nota è ancorata a un elemento che c'è.
 */
export function followAnchors(doc: DevDocument): Recipe | null {
  const before = canvasOps(doc)
  const d = noteDiagram(doc)
  const plan = Object.entries(d.model.notes).flatMap(([key, note]) => {
    const view = d.view.nodes[key]
    if (note.anchor === null || !view || !anchorExists(doc, note.anchor)) return []
    const anchor = before.rectOf(note.anchor)
    return anchor ? [{ key, anchor: note.anchor, dx: view.x - anchor.x, dy: view.y - anchor.y }] : []
  })
  if (plan.length === 0) return null
  return (draft) => {
    const after = canvasOps(draft)
    const views = noteDiagram(draft).view.nodes
    for (const { key, anchor, dx, dy } of plan) {
      const rect = after.rectOf(anchor)
      const view = views[key]
      if (!rect || !view) continue
      view.x = snap(rect.x + dx)
      view.y = snap(rect.y + dy)
    }
  }
}
```

In `src/editor/layout-pack.ts`: importa `followAnchors` da `./note/layout`, e in `layoutAll`, dopo aver costruito `recipes`:

```ts
  // Le note ancorate seguono i loro elementi, dopo che tutte le famiglie hanno scritto (spec 3a §6).
  const follow = followAnchors(doc)
  if (follow) recipes.push(follow)
  if (recipes.length === 0) return null
```

Nel docblock di `layoutAll` aggiungi: «Per ultime, le note ancorate seguono il loro elemento (`followAnchors`).».

- [ ] **Step 4: Lancia i test e verifica che passino**

Run: `pnpm vitest run src/editor/layout-pack.test.ts`
Expected: PASS.

- [ ] **Step 5: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: tutto verde.

- [ ] **Step 6: Commit**

```bash
git add src/editor/note/layout.ts src/editor/layout-pack.ts src/editor/layout-pack.test.ts
git commit -m "feat(layout): con Disponi le note ancorate seguono il loro elemento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: E2E della nota, README e spec

**Files:**
- Delete: `scripts/e2e/class-note.mjs`
- Create: `scripts/e2e/note.mjs`
- Modify: `scripts/e2e/collegamenti.mjs`, `scripts/e2e/run.mjs`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-26-nota-unica-design.md`

**Interfaces:**
- Consumes: tutto il comportamento dei task precedenti, dal browser. La nota sul canvas è `[data-node-id^="note/"]`, la sua linea `[data-edge-id^="note/"]`, l'editor del testo `[aria-label="Testo della nota"]`, il pannello ha `#note-text`, il testo «Ancorata a: …» e il pulsante «Stacca».
- Produces: nessuna firma.

- [ ] **Step 1: Lo scenario della nota**

Crea `scripts/e2e/note.mjs`:

```js
/**
 * End-to-end della nota unica (spec 3a §11): lo strumento «Nota» (`N`) crea una nota e ne apre il
 * testo da sé; Collega la ancora a un'entità, poi a un nodo di flusso, poi a un pool, e la linea
 * tratteggiata la segue mentre l'elemento si sposta; Canc sulla linea la stacca, «Stacca» nel
 * pannello pure, ed eliminare l'elemento la stacca da sola; «Disponi» la tiene accanto alla sua
 * entità; un file della versione 6 con una nota di classe e una di flusso le ritrova al loro posto.
 *
 * La pagina si apre su `${base}?fallback=1`, come `pool.mjs`: l'ultimo passo carica un file
 * dall'`#upload-input`, e Playwright non pilota i dialoghi nativi della File System Access API.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/note.mjs`. `HEADLESS=0` per vedere.
 */
import { expectNodes, expectText, isMainModule, startEnv } from "./helpers.mjs"

const NOTE = '[data-node-id^="note/"]'
const LINE = '[data-edge-id^="note/"]'

/** Rettangolo schermo del primo elemento che risponde al selettore. */
async function rectOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`nessun elemento per ${selector}`)
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

/** L'attributo `d` della linea di ancoraggio: cambia quando la linea si ridisegna. */
const lineD = (page) => page.locator(`${LINE} [data-edge-line]`).getAttribute("d")

/**
 * Un punto schermo **sulla** linea di ancoraggio, a metà della sua lunghezza. Il centro del suo
 * riquadro non basta: una linea a gomito ha il centro del riquadro nel vuoto, e il clic non la prende.
 */
async function pointOnLine(page) {
  return page.evaluate((sel) => {
    const path = document.querySelector(`${sel} [data-edge-hit]`)
    const p = path.getPointAtLength(path.getTotalLength() / 2)
    const m = path.getScreenCTM()
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
  }, LINE)
}

/** Un documento della versione 6: una classe con una nota ancorata, e un processo con una nota di flusso collegata. */
const V6 = {
  schemaVersion: 6,
  id: "v6",
  name: "vecchio",
  diagram: {
    er: { model: { entities: {}, relationships: {} }, view: { nodes: {} } },
    class: {
      model: {
        classes: { Ordine: { name: "Ordine", stereotype: "class", attributes: [], methods: [] } },
        relations: { r1: { kind: "note-link", source: { class: "n1", multiplicity: "", role: "" }, target: { class: "Ordine", multiplicity: "", role: "" } } },
        notes: { n1: { text: "nota di classe" } },
      },
      view: { nodes: { Ordine: { x: 40, y: 40, collapsed: false }, n1: { x: 40, y: 200, collapsed: false } } },
    },
    flow: {
      model: {
        pools: {},
        nodes: { a: { label: "Ordina", shape: "process", lane: null }, f: { label: "nota di flusso", shape: "note", lane: null } },
        edges: { e1: { source: "f", target: "a", label: "" } },
      },
      view: { nodes: { a: { x: 500, y: 40, collapsed: false }, f: { x: 500, y: 200, collapsed: false } }, pools: {}, lanes: {} },
    },
    links: {},
  },
}

/** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
export async function run(browser, base) {
  const BASE = `${base}?fallback=1`
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

  const noteEditor = page.locator('[aria-label="Testo della nota"]')

  try {
    await page.goto(BASE)
    await page.waitForSelector("[data-canvas]")
    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("strumento «Nota» (N): nasce una nota libera e il suo testo si apre da sé", async () => {
      await page.keyboard.press("n")
      await page.mouse.click(canvas.x + 200, canvas.y + 400)
      await noteEditor.waitFor()
      await noteEditor.fill("da verificare")
      await noteEditor.blur()
      await noteEditor.waitFor({ state: "detached" })
      await expectText(page, NOTE, "da verificare")
      await page.locator(NOTE).first().click()
      await expectText(page, "body", "Libera")
    })

    await step("Collega nota → entità: la linea compare e il pannello dice a cosa è ancorata", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("e")
      await page.mouse.click(canvas.x + 200, canvas.y + 80)
      await page.keyboard.press("Escape") // chiude l'editor del nome
      await page.keyboard.press("r")
      await drag(page, center(await rectOf(page, NOTE)), center(await rectOf(page, '[data-node-id^="er/"]')))
      await page.waitForSelector(LINE)
      await expectText(page, "body", "Ancorata a:")
    })

    await step("la linea segue l'entità mentre la si trascina", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      const before = await lineD(page)
      const entity = await rectOf(page, '[data-node-id^="er/"]')
      await drag(page, { x: entity.x + 20, y: entity.y + 10 }, { x: entity.x + 320, y: entity.y + 10 })
      await page.waitForFunction(
        ([sel, d]) => document.querySelector(`${sel} [data-edge-line]`)?.getAttribute("d") !== d,
        [LINE, before],
      )
    })

    await step("Canc sulla linea stacca la nota, che resta", async () => {
      const pt = await pointOnLine(page)
      await page.mouse.click(pt.x, pt.y)
      await page.keyboard.press("Delete")
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, LINE)
      if ((await page.locator(NOTE).count()) !== 1) throw new Error("la nota è sparita con la sua linea")
    })

    await step("si ancora a un nodo di flusso, e «Stacca» nel pannello la libera", async () => {
      await page.keyboard.press("2")
      await page.mouse.click(canvas.x + 700, canvas.y + 80)
      const nodeText = page.locator('[aria-label="Testo del nodo"]')
      await nodeText.waitFor()
      await nodeText.fill("Ordina")
      await nodeText.blur()
      await page.keyboard.press("r")
      await drag(page, center(await rectOf(page, NOTE)), center(await rectOf(page, '[data-node-id^="flow/"]:not([data-pool])')))
      await page.waitForSelector(LINE)
      await expectText(page, "body", "Ancorata a: Ordina")
      await page.getByRole("button", { name: "Stacca" }).click()
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, LINE)
      await expectText(page, "body", "Libera")
    })

    await step("si ancora a un pool, ed eliminare il pool la stacca da sola", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("p")
      await page.mouse.click(canvas.x + 300, canvas.y + 600)
      await page.waitForSelector("[data-pool]")
      await page.keyboard.press("r")
      const header = await rectOf(page, "[data-pool-header]")
      await drag(page, center(await rectOf(page, NOTE)), { x: header.x + header.w / 2, y: header.y + 20 })
      await page.waitForSelector(LINE)
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      await page.mouse.click(header.x + header.w / 2, header.y + 20)
      await page.keyboard.press("Delete")
      await page.waitForFunction(() => document.querySelectorAll("[data-pool]").length === 0)
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, LINE)
      if ((await page.locator(NOTE).count()) !== 1) throw new Error("la nota è sparita con il pool")
    })

    await step("«Disponi»: la nota ancorata resta accanto alla sua entità", async () => {
      await page.keyboard.press("r")
      await drag(page, center(await rectOf(page, NOTE)), center(await rectOf(page, '[data-node-id^="er/"]')))
      await page.waitForSelector(LINE)
      await page.keyboard.press("Escape")
      const gap = async () => {
        const n = await rectOf(page, NOTE)
        const e = await rectOf(page, '[data-node-id^="er/"]')
        return { x: Math.round(n.x - e.x), y: Math.round(n.y - e.y) }
      }
      const before = await gap()
      const entityBefore = await rectOf(page, '[data-node-id^="er/"]')
      await page.getByRole("button", { name: "Disponi" }).click()
      // Stessa attesa di `layout.mjs`: il worker di elkjs nasce alla prima richiesta.
      await page.waitForFunction(
        (x0) => Math.abs(document.querySelector('[data-node-id^="er/"]').getBoundingClientRect().x - x0) > 1,
        entityBefore.x,
        { timeout: 30_000 },
      )
      const after = await gap()
      if (Math.abs(after.x - before.x) > 2 || Math.abs(after.y - before.y) > 2) {
        throw new Error(`la nota non ha seguito l'entità: scarto prima ${JSON.stringify(before)}, dopo ${JSON.stringify(after)}`)
      }
    })

    await step("un file v6 caricato ha le note di classe e di flusso al loro posto, ancorate", async () => {
      await page.locator("#upload-input").setInputFiles({ name: "vecchio.dd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(V6)) })
      await expectText(page, NOTE, "nota di classe")
      await expectText(page, NOTE, "nota di flusso")
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 2, LINE)
      // La classe, il processo e le due note: la nota di flusso non è più un nodo del flusso.
      await expectNodes(page, 4)
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (note):", e)
  }
  console.log(failed ? "\ne2e note: FAIL" : "\ne2e note: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/note.mjs` esegue solo questo scenario. */
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

Note per chi esegue:
- l'aria-label dell'editor del testo di un nodo di flusso è quello che usa `collegamenti.mjs` per `nodeText`: se è diverso da `Testo del nodo`, usa quello di `collegamenti.mjs`;
- l'upload apre il documento caricato al posto di quello corrente, come in `pool.mjs`; se nel browser compare una conferma prima dell'upload, gestiscila come fa `pool.mjs`;
- se un passo fallisce, trova il perché (DOM, screenshot, codice). Se è lo script (coordinate, selettori, tempi), correggi lo script tenendo l'intento del passo; se è un difetto dell'app, non indebolire l'asserzione e riportalo.

Cancella `scripts/e2e/class-note.mjs`.

- [ ] **Step 2: I collegamenti non parlano più della nota di flusso**

In `scripts/e2e/collegamenti.mjs` il passo «una nota del flusso verso l'entità: avviso, e nessun collegamento nuovo» diventa:

```js
    await step("una nota verso l'entità: un ancoraggio, e nessun collegamento nuovo", async () => {
      await page.keyboard.press("n")
      await page.mouse.click(canvas.x + 700, canvas.y + 60)
      const noteText = page.locator('[aria-label="Testo della nota"]')
      await noteText.waitFor()
      await noteText.fill("promemoria")
      await noteText.blur()
      await noteText.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      const nota = await page.locator('[data-node-id^="note/"]').boundingBox()
      await drag(page, { x: nota.x + nota.width / 2, y: nota.y + nota.height / 2 }, await centerOfId(page, "er/righe"))
      await page.waitForSelector('[data-edge-id^="note/"]')
      if ((await page.locator(LINK).count()) !== 2) throw new Error("è nato un collegamento da una nota")
      await page.keyboard.press("Escape")
    })
```

e nel docblock in testa «il rifiuto di una nota del flusso» diventa «l'ancoraggio di una nota, che non è un collegamento».

- [ ] **Step 3: Registra lo scenario**

In `scripts/e2e/run.mjs`: l'import `runClassNote` da `./class-note.mjs` diventa `runNote` da `./note.mjs`; la chiamata `const classNoteOk = await runClassNote(browser, base)` diventa `const noteOk = await runNote(browser, base)` e passa **dopo** `poolOk`; nella somma finale `classNoteOk` diventa `noteOk`; nel docblock «del class diagram, della sua nota, del flowchart, …, e dei pool» diventa «del class diagram, del flowchart, del canvas misto, dei collegamenti fra famiglie, dei pool e della nota», e `node scripts/e2e/class-note.mjs` diventa `node scripts/e2e/note.mjs` in fondo all'elenco.

- [ ] **Step 4: Lancia l'e2e**

Run: `pnpm build && pnpm e2e`
Expected: undici scenari PASS, exit code 0.

- [ ] **Step 5: README**

In `README.md`:
- nel paragrafo del class diagram, la frase sulle note («…più le note. Una nota può … «Disponi» tiene la nota accanto alla sua classe.») diventa: «…ciascuna con la punta e il tratto giusti.»;
- nel paragrafo del flowchart, dall'elenco delle forme sparisce la nota;
- dopo il paragrafo dei pool aggiungi un punto:

```markdown
- **Note**: una nota è testo libero, libera o ancorata a un solo elemento — un'entità, una classe,
  un nodo di flusso o un pool — con Collega. La linea tratteggiata segue l'elemento; Canc sulla
  linea o «Stacca» nel pannello staccano la nota, ed eliminare l'elemento la stacca da sola. «Disponi»
  la tiene accanto al suo elemento. Nell'export Mermaid delle classi escono le note libere e quelle
  ancorate a una classe (`note for`); le altre sintassi non hanno note, e l'export lo dice.
```

- la frase «Una nota non si collega: il gesto …» nel paragrafo dei collegamenti diventa «Collega fra una nota e un elemento non crea un collegamento: ancora la nota.»;
- nella tabella delle scorciatoie: la riga `C · I · U · N` diventa `| `C` · `I` · `U` | classe · interfaccia · enum |`, la riga delle forme diventa `| `1`..`5` | forme del flusso (terminale, processo, decisione, input/output, sottoprocesso) |`, e una riga nuova `| `N` | nota |`;
- nei limiti del flowchart, «**Le note non escono in Mermaid**: …» diventa «**Le note ancorate al flusso non escono in Mermaid**: la sintassi dei flowchart non ha note.»;
- nella descrizione degli scenari e2e il punto «**Nota**: …» diventa «**Nota**: crea una nota, la ancora a un'entità, a un nodo di flusso e a un pool, verifica che la linea segua l'entità trascinata, la stacca con Canc e dal pannello, verifica che eliminare il pool la stacchi, che «Disponi» la tenga accanto alla sua entità, e che un file della versione 6 ritrovi le sue note ancorate.»; e nel punto dei collegamenti «verifica l'avviso per una nota del flusso» diventa «verifica che una nota trascinata su un'entità si ancori senza creare un collegamento».

- [ ] **Step 6: La spec**

In `docs/superpowers/specs/2026-09-26-nota-unica-design.md`:
- §3, lo schema: `NoteDiagramSchema = { model: NoteModel, view: { nodes: Record<string, NodeView> } }` al posto di `{ x, y }`, con la frase «`view.nodes` usa `NodeViewSchema` come le altre famiglie: `collapsed` non si applica e resta `false` (scostamento 1 del piano).»;
- §6, il primo punto: la frase «Il passo delle note legge le posizioni nuove già scritte sul draft dalle altre famiglie e quelle vecchie dal documento di partenza: funziona perché `note` è l'ultima di `FAMILIES`. Il codice lo dice in un commento, e un test fallisce se l'ordine cambia.» diventa «Il passo delle note (`followAnchors`) è l'ultimo di Disponi: legge le posizioni vecchie dal documento di partenza e quelle nuove dal draft, dopo tutte le famiglie, quindi non dipende dall'ordine di `FAMILIES` (scostamento 2 del piano).»;
- §5, alla fine di «Eliminazione, duplicazione, spostamento», aggiungi «Una rinomina di entità o classe sposta anche le àncore che la nominano (scostamento 6 del piano).».

- [ ] **Step 7: Controlli finali**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: tutto verde.

- [ ] **Step 8: Commit**

```bash
git add -A scripts/e2e README.md docs/superpowers/specs/2026-09-26-nota-unica-design.md
git commit -m "test(e2e): la nota unica, i collegamenti con l'ancoraggio, README e spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
