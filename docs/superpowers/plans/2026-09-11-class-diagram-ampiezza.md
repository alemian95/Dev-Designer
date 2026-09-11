# Class diagram, primo giro di ampiezza — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare al class diagram le note libere, la navigabilità delle associazioni, un export Mermaid che non perde dati in silenzio, e il sottolineato UML dello statico.

**Architecture:** Tutto passa dalla giuntura a due metà già esistente — `DiagramOps` (`src/editor/kinds/`) per dati e comandi, `DiagramView` (`src/ui/canvas/kinds/`) per i componenti. La nota è un **nodo**: vive in `view.nodes` accanto alle classi, così selezione, drag, marquee, duplica, cancella e undo arrivano dal canvas condiviso senza una riga nuova. L'unico metodo del seam che cambia davvero è `rectOf`.

**Tech Stack:** Vite 8 (rolldown), React 19.2, TypeScript 6 strict, Tailwind v4, shadcn/ui, Zustand 5 vanilla, zod 4, Immer, Vitest 5, ESLint 10 flat config, pnpm, Playwright, elkjs.

**Spec:** `docs/superpowers/specs/2026-09-11-class-diagram-ampiezza-design.md` (estende `docs/superpowers/specs/2026-09-10-class-diagram-design.md`, il documento madre).

## Global Constraints

- **Lingua:** testo dell'interfaccia, commenti, docstring, descrizioni dei test e messaggi di commit in **italiano**; identificatori in **inglese**.
- **Dump reali vietati:** `spike/fixtures/postgres.sql` e `spike/fixtures/mysql.sql` sono git-ignorati. Non aprirli. Nessun frammento — nomi di tabella o di colonna compresi — può comparire in un test. I nomi dei test sono inventati.
- **`vitest run` non fa typecheck; `pnpm build` (`tsc -b && vite build`) sì.** Un test verde può rompere la build. Il caso già visto: `as const` su una fixture rende `attributes: []` un `readonly []`, non assegnabile a `ClassAttribute[]`. Dopo ogni task girano **entrambi**.
- **`noUnusedLocals` e `noUnusedParameters` sono attivi** in `tsconfig.app.json`.
- **Niente jsdom.** Le viste pure si testano con `renderToStaticMarkup` da `react-dom/server`. L'interazione vera si testa solo in e2e (`pnpm e2e`).
- **Niente Prettier.** Righe lunghe sono normali in questo repo (le più lunghe arrivano a 186 caratteri).
- **Regole di import fra livelli**, imposte da `no-restricted-imports` in `eslint.config.js`: `src/model` non importa React, lo store, `@/editor/**`, `@/ui/**`, `@/io/**`; `src/editor` non importa React né `@/ui/**` né `@/io/**`; `src/io` non importa React né `@/ui/**`.
- **I selettori Zustand non devono allocare.** `useStore` usa `useSyncExternalStore`, che confronta gli snapshot **per riferimento**: un selettore che costruisce un oggetto nuovo a ogni chiamata fa esplodere l'intero albero React. Usare `useShallow` quando si seleziona una lista o un oggetto.
- **`documentStore.dispatch(recipe)` torna `false`** quando Immer non produce patch. Una recipe che non scrive non lascia una voce di undo.
- **Per ogni task che tocca un componente sempre montato, `pnpm e2e` è la verifica**, non `pnpm test`: un selettore che alloca passa test, build e lint e fallisce solo nel browser.
- **Prestazioni:** `pnpm perf` è un controllo di **non regressione**, non un criterio da superare. `zoom` è già FAIL documentato.
- **Comandi:** `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e`, `pnpm perf [N]`.
- **Git:** identità personale `alessandromian95@gmail.com`. `git push` e i merge sono decisione dell'utente: non eseguirli.

## Struttura dei file

| file | responsabilità | task |
|---|---|---|
| `src/model/shared.ts` | `SCHEMA_VERSION` passa a 2 | 1 |
| `src/model/migrations.ts` | primo step di migrazione, 1→2 | 1 |
| `src/model/class/schema.ts` | `ClassNoteSchema`, `notes`, `navigable` | 1 |
| `src/editor/class/geometry.ts` | `noteSize`, `noteRect`, `notePath`; ramo navigabile in `umlMarkerPath` | 2, 8 |
| `src/editor/class/commands.ts` | `addNote`, `setNoteText`, cancella e duplica a tre vie | 3 |
| `src/editor/kinds/ops.ts` | `DiagramOps.addNote?`, opzionale | 6 |
| `src/editor/kinds/class.ts` | `rectOf` cerca anche le note; `addNote`; layout le esclude | 4, 6 |
| `src/editor/interaction.ts` | effetto `create-note` e ramo del riduttore | 6 |
| `src/ui/canvas/ClassNote.tsx` | `ClassNoteView` (pura) e `ClassNoteNode` (connesso) | 5 |
| `src/ui/canvas/kinds/class.tsx` | `NodesLayer` monta le note; `NodeView` distingue | 5 |
| `src/ui/canvas/NoteEditor.tsx` | textarea di testo libero | 6 |
| `src/editor/session-store.ts` | `Tool` guadagna `"note"` | 6 |
| `src/ui/canvas/kinds/registry.ts` | `tools.note` opzionale | 6 |
| `src/ui/Toolbar.tsx`, `src/ui/use-keyboard-shortcuts.ts`, `src/ui/panels/PropertiesPanel.tsx` | terzo strumento | 6 |
| `src/ui/canvas/use-canvas-interaction.ts` | doppio click su una nota apre il corpo | 6 |
| `src/io/emit/class-mermaid.ts` | `note`, `-->`, generici, graffe | 7, 8, 9 |
| `src/ui/panels/ClassProperties.tsx` | casella navigabile, pannello della nota | 6, 8 |
| `src/model/class/members.ts` | `memberLines` torna `MemberLine[]` | 10 |
| `src/ui/canvas/ClassNode.tsx` | `tspan` sottolineato | 10 |
| `scripts/e2e/class-note.mjs` | settima scena | 11 |

---

### Task 1: Schema, migrazione, navigabilità

**Files:**
- Modify: `src/model/shared.ts`
- Modify: `src/model/migrations.ts`
- Modify: `src/model/class/schema.ts`
- Test: `src/model/migrations.test.ts`, `src/model/class/schema.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces: `ClassNote = { text: string }`; `ClassModel.notes: Record<string, ClassNote>`; `ClassRelation.navigable?: boolean`; `SCHEMA_VERSION === 2`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/model/class/schema.test.ts`, in coda:

```ts
describe("note e navigabilità", () => {
  it("un modello senza notes non passa più", () => {
    const senza = { classes: {}, relations: {} }
    expect(ClassModelSchema.safeParse(senza).success).toBe(false)
  })

  it("una nota è testo libero, anche vuoto e multiriga", () => {
    const modello = { classes: {}, relations: {}, notes: { n1: { text: "" }, n2: { text: "prima\nseconda" } } }
    expect(ClassModelSchema.parse(modello).notes.n2!.text).toBe("prima\nseconda")
  })

  it("navigable è opzionale: una relazione senza il campo resta valida", () => {
    const rel = { kind: "association", source: { class: "A", multiplicity: "", role: "" }, target: { class: "B", multiplicity: "", role: "" } }
    const parsed = ClassRelationSchema.parse(rel)
    expect(parsed.navigable).toBeUndefined()
    expect(ClassRelationSchema.parse({ ...rel, navigable: true }).navigable).toBe(true)
  })

  it("createClassDocument nasce con notes vuoto e alla versione corrente", () => {
    const doc = createClassDocument("Prova", "id-fisso")
    expect(doc.diagram.model.notes).toEqual({})
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
  })
})
```

In `src/model/migrations.test.ts`, in coda (se il file non esiste, crearlo con gli import di `migrateDocument` e `SCHEMA_VERSION`):

```ts
describe("migrazione 1 → 2", () => {
  const v1Class = {
    schemaVersion: 1,
    id: "a",
    name: "Prova",
    diagram: { type: "class", model: { classes: {}, relations: {} }, view: { nodes: {} } },
  }
  const v1Er = {
    schemaVersion: 1,
    id: "b",
    name: "Prova",
    diagram: { type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } },
  }

  it("aggiunge notes a un diagramma di classi", () => {
    const out = migrateDocument(v1Class)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(2)
    expect((doc.diagram as { model: { notes: unknown } }).model.notes).toEqual({})
  })

  it("non tocca il modello di un ER, che non ha notes nel suo schema", () => {
    const out = migrateDocument(v1Er)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(2)
    expect((doc.diagram as { model: Record<string, unknown> }).model).toEqual({ entities: {}, relationships: {} })
  })

  it("un documento già alla 2 passa senza toccare niente", () => {
    const v2 = { ...v1Class, schemaVersion: 2, diagram: { ...v1Class.diagram, model: { classes: {}, relations: {}, notes: {} } } }
    expect(migrateDocument(v2)).toEqual({ ok: true, value: v2 })
  })
})
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/model/class/schema.test.ts src/model/migrations.test.ts`
Expected: FAIL — `notes` non esiste nello schema, `SCHEMA_VERSION` è 1, non c'è nessuno step di migrazione.

- [ ] **Step 3: Alza la versione**

In `src/model/shared.ts`:

```ts
/** Versione del formato su disco. Incrementare insieme a una migrazione in migrations.ts. */
export const SCHEMA_VERSION = 2
```

- [ ] **Step 4: Scrivi lo step di migrazione**

In `src/model/migrations.ts`, sostituisci la mappa vuota:

```ts
/**
 * 1 → 2: il class diagram guadagna `model.notes`, obbligatorio. Tocca **solo** i diagrammi di
 * tipo `class`: un ER non ha un `ClassModel` e aggiungergli il campo gli farebbe fallire lo schema.
 */
const addClassNotes: Migration = (raw) => {
  const diagram = raw.diagram
  if (diagram === null || typeof diagram !== "object") return raw
  const d = diagram as Record<string, unknown>
  if (d.type !== "class") return raw
  const model = d.model
  if (model === null || typeof model !== "object") return raw
  return { ...raw, diagram: { ...d, model: { ...(model as Record<string, unknown>), notes: {} } } }
}

const migrations: ReadonlyMap<number, Migration> = new Map([[1, addClassNotes]])
```

- [ ] **Step 5: Estendi lo schema delle classi**

In `src/model/class/schema.ts`, dopo `ClassRelationSchema` e prima di `ClassModelSchema`:

```ts
/**
 * Una nota è testo libero appoggiato sul canvas. Nessun campo di ancoraggio: §2 della spec taglia
 * `note for Cliente`, che sembra una riga tratteggiata e invece è un arco.
 */
export const ClassNoteSchema = z.object({ text: z.string() })
export type ClassNote = z.infer<typeof ClassNoteSchema>
```

`ClassModelSchema` guadagna il terzo record:

```ts
export const ClassModelSchema = z.object({
  classes: z.record(z.string(), ClassNodeSchema),
  relations: z.record(z.string(), ClassRelationSchema),
  /** Chiave = uuid, non il testo: una nota non ha nome, e il testo cambia a ogni battitura. */
  notes: z.record(z.string(), ClassNoteSchema),
})
```

`ClassRelationSchema` guadagna il campo opzionale, sotto `name`:

```ts
  /** Solo per `association`: il `target` è raggiungibile dal `source`. Assente = non navigabile,
   *  che è il comportamento di sempre — per questo è opzionale e non richiede una migrazione. */
  navigable: z.boolean().optional(),
```

E `createClassDocument` nasce con il record vuoto:

```ts
    diagram: { type: "class", model: { classes: {}, relations: {}, notes: {} }, view: { nodes: {} } },
```

- [ ] **Step 6: Esegui i test, poi la build**

Run: `pnpm test` — Expected: PASS. Altri test falliranno se costruiscono un `ClassModel` a mano senza `notes`: aggiungere `notes: {}` a ogni fixture che il compilatore segnala.
Run: `pnpm build` — Expected: nessun errore TS. È il passo che trova le fixture rimaste indietro: `vitest run` non fa typecheck.
Run: `pnpm lint` — Expected: pulito.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(model): le note entrano nel modello, la navigabilità nelle relazioni"
```

---

### Task 2: Geometria della nota

**Files:**
- Modify: `src/editor/class/geometry.ts`
- Test: `src/editor/class/geometry.test.ts`

**Interfaces:**
- Consumes: `ClassNote` (Task 1).
- Produces: `noteSize(note: ClassNote): Size`, `noteRect(note: ClassNote, view: NodeView): Rect`, `notePath(w: number, h: number): { body: string; fold: string }`, `NOTE_FOLD`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/class/geometry.test.ts`, in coda:

```ts
describe("noteSize", () => {
  it("larghezza dalla riga più lunga, altezza dal numero di righe", () => {
    const corta = noteSize({ text: "ok" })
    const lunga = noteSize({ text: "una riga molto più lunga della precedente" })
    expect(lunga.w).toBeGreaterThan(corta.w)
    expect(noteSize({ text: "a\nb\nc" }).h).toBeGreaterThan(noteSize({ text: "a" }).h)
  })

  it("una nota vuota ha comunque una dimensione cliccabile", () => {
    const { w, h } = noteSize({ text: "" })
    expect(w).toBeGreaterThanOrEqual(MIN_W / 2)
    expect(h).toBeGreaterThan(0)
  })

  it("la larghezza è arrotondata alla griglia, come le classi", () => {
    expect(noteSize({ text: "abcdefghijklmnopqrstuvwxyz" }).w % GRID).toBe(0)
  })
})

describe("notePath", () => {
  it("il corpo salta l'angolo in alto a destra e la piega lo chiude", () => {
    const { body, fold } = notePath(200, 80)
    // Il corpo non passa per (200, 0): quell'angolo è tagliato dalla piega.
    expect(body).not.toContain("M200 0")
    expect(body).toContain(`${200 - NOTE_FOLD} 0`)
    // La piega è un triangolo chiuso.
    expect(fold.trim().endsWith("Z")).toBe(true)
  })
})
```

Gli import in testa al file guadagnano `noteSize`, `notePath`, `NOTE_FOLD` da `./geometry` e `GRID`, `MIN_W` da `../geometry` (già presenti).

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/editor/class/geometry.test.ts`
Expected: FAIL con `noteSize is not a function`.

- [ ] **Step 3: Implementa**

In `src/editor/class/geometry.ts`, dopo `classRect`:

```ts
/** Lato del triangolo piegato nell'angolo in alto a destra della nota. */
export const NOTE_FOLD = 12

/** Margine interno verticale della nota, sopra e sotto il blocco di righe. */
const NOTE_PAD_Y = 6

/**
 * Dimensione di una nota, con la stessa formula di `classSize` (§6 del documento madre): larghezza
 * dal carattere più lungo arrotondata alla griglia, altezza dal numero di righe. Il minimo è metà
 * di quello di una classe — una nota vuota deve restare cliccabile, non larga quanto una classe.
 */
export function noteSize(note: ClassNote): Size {
  const lines = note.text.split("\n")
  const chars = Math.max(0, ...lines.map((l) => l.length))
  const w = Math.max(MIN_W / 2, Math.ceil((chars * CHAR_W + 2 * PAD_X + NOTE_FOLD) / GRID) * GRID)
  return { w, h: lines.length * ROW_H + 2 * NOTE_PAD_Y }
}

export function noteRect(note: ClassNote, view: NodeView): Rect {
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
```

L'import dei tipi in testa guadagna `ClassNote`; quello da `../geometry` guadagna `Size` se non c'è già.

- [ ] **Step 4: Esegui i test**

Run: `npx vitest run src/editor/class/geometry.test.ts` — Expected: PASS.
Run: `pnpm build && pnpm lint` — Expected: puliti.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(class): geometria della nota, rettangolo con l'angolo piegato"
```

---

### Task 3: Comandi della nota

**Files:**
- Modify: `src/editor/class/commands.ts`
- Test: `src/editor/class/commands.test.ts`

**Interfaces:**
- Consumes: `ClassNote` (Task 1), `noteSize` non serve qui.
- Produces: `addNote(at: Point): { key: string; recipe: Recipe }`, `setNoteText(key: string, text: string): Recipe`, `deleteClassItems(classKeys, relationKeys, noteKeys)`, `duplicateClasses` che copia anche le note.

**Attenzione:** `deleteClassItems` cambia **firma** — guadagna un terzo parametro. Il chiamante è `classOps.deleteItems` (Task 4), che riceve `nodeKeys` mescolate e le separa lì.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/class/commands.test.ts`, in coda. Il file ha già un helper per applicare una recipe a un documento; se si chiama diversamente, usare quello — qui lo chiamiamo `applica`:

```ts
describe("comandi delle note", () => {
  const vuoto = () => createClassDocument("Prova", "doc-1")

  it("addNote crea la nota e la sua view, con una chiave che non è il testo", () => {
    const doc = vuoto()
    const { key, recipe } = addNote({ x: 37, y: 52 })
    const dopo = applica(doc, recipe)
    expect(dopo.diagram.model.notes[key]).toEqual({ text: "" })
    // Snappata alla griglia come le classi.
    expect(dopo.diagram.view.nodes[key]).toEqual({ x: 40, y: 50, collapsed: false })
  })

  it("setNoteText scrive il testo e non tocca altro", () => {
    const { key, recipe } = addNote({ x: 0, y: 0 })
    const doc = applica(vuoto(), recipe)
    const dopo = applica(doc, setNoteText(key, "prima\nseconda"))
    expect(dopo.diagram.model.notes[key]!.text).toBe("prima\nseconda")
  })

  it("setNoteText su una chiave che non esiste non scrive niente", () => {
    const doc = vuoto()
    expect(applica(doc, setNoteText("assente", "x")).diagram.model.notes).toEqual({})
  })

  it("deleteClassItems cancella la nota e la sua view", () => {
    const { key, recipe } = addNote({ x: 0, y: 0 })
    const doc = applica(vuoto(), recipe)
    const dopo = applica(doc, deleteClassItems([], [], [key])!)
    expect(dopo.diagram.model.notes).toEqual({})
    expect(dopo.diagram.view.nodes[key]).toBeUndefined()
  })

  it("deleteClassItems torna null solo se non c'è niente da cancellare, note comprese", () => {
    expect(deleteClassItems([], [], [])).toBeNull()
    expect(deleteClassItems([], [], ["n1"])).not.toBeNull()
  })

  it("duplicateClasses copia anche le note, con una chiave nuova e lo scarto", () => {
    const { key, recipe } = addNote({ x: 100, y: 100 })
    const doc = applica(applica(vuoto(), recipe), setNoteText(key, "promemoria"))
    const { keys, recipe: dup } = duplicateClasses(doc.diagram.model, [key])
    const dopo = applica(doc, dup)
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toBe(key)
    expect(dopo.diagram.model.notes[keys[0]!]).toEqual({ text: "promemoria" })
    expect(dopo.diagram.view.nodes[keys[0]!]!.x).toBe(120)
  })
})
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/editor/class/commands.test.ts`
Expected: FAIL — `addNote is not a function`, e `deleteClassItems` accetta due argomenti.

- [ ] **Step 3: Implementa i due comandi nuovi**

In `src/editor/class/commands.ts`, dopo `addRelation`:

```ts
/**
 * Nuova nota vuota. La chiave è un uuid e non deriva dal testo: il testo cambia a ogni battitura,
 * e una chiave che lo segue farebbe di ogni carattere una rinomina (§4 della spec).
 */
export function addNote(at: Point): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const d = classDiagram(draft)
      d.model.notes[key] = { text: "" }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

export function setNoteText(key: string, text: string): Recipe {
  return (draft) => {
    const note = classDiagram(draft).model.notes[key]
    // Si scrive solo se cambia davvero: riaprire e richiudere l'editor senza toccare niente
    // lascerebbe altrimenti una voce di undo fantasma.
    if (note && note.text !== text) note.text = text
  }
}
```

- [ ] **Step 4: Estendi cancella e duplica**

`deleteClassItems` guadagna il terzo parametro:

```ts
export function deleteClassItems(
  classKeys: readonly string[],
  relationKeys: readonly string[],
  noteKeys: readonly string[],
): Recipe | null {
  if (classKeys.length === 0 && relationKeys.length === 0 && noteKeys.length === 0) return null
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
    // Le note non hanno archi: nessuna relazione da ripulire di rimbalzo.
    for (const key of noteKeys) {
      delete d.model.notes[key]
      delete d.view.nodes[key]
    }
  }
}
```

In `duplicateClasses`, una chiave che non è in `model.classes` oggi viene saltata (`if (!(from in model.classes)) continue`). Ora può essere una nota. Il piano di copia diventa due liste:

```ts
export function duplicateClasses(model: ClassModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const taken: Record<string, true> = Object.fromEntries(Object.keys(model.classes).map((k) => [k, true]))
  const plan: { from: string; to: string }[] = []
  const notePlan: { from: string; to: string }[] = []
  for (const from of keys) {
    if (from in model.classes) {
      const to = uniqueKey(taken, from)
      taken[to] = true
      plan.push({ from, to })
    } else if (from in model.notes) {
      // Una nota non ha nome, quindi niente `uniqueKey` col suffisso `_2`: un uuid nuovo.
      notePlan.push({ from, to: crypto.randomUUID() })
    }
  }
  return {
    keys: [...plan.map((p) => p.to), ...notePlan.map((p) => p.to)],
    recipe: (draft) => {
      const d = classDiagram(draft)
      for (const { from, to } of plan) {
        const cls = d.model.classes[from]
        const view = d.view.nodes[from]
        if (!cls) continue
        d.model.classes[to] = {
          ...cls,
          name: to,
          attributes: cls.attributes.map((a) => ({ ...a })),
          methods: cls.methods.map((m) => ({ ...m })),
        }
        d.view.nodes[to] = {
          x: (view?.x ?? 0) + DUPLICATE_OFFSET,
          y: (view?.y ?? 0) + DUPLICATE_OFFSET,
          collapsed: view?.collapsed ?? false,
        }
      }
      for (const { from, to } of notePlan) {
        const note = d.model.notes[from]
        const view = d.view.nodes[from]
        if (!note) continue
        d.model.notes[to] = { ...note }
        d.view.nodes[to] = {
          x: (view?.x ?? 0) + DUPLICATE_OFFSET,
          y: (view?.y ?? 0) + DUPLICATE_OFFSET,
          collapsed: view?.collapsed ?? false,
        }
      }
    },
  }
}
```

- [ ] **Step 5: Esegui i test e la build**

Run: `pnpm test` — Expected: PASS. `classOps.deleteItems` non compila ancora contro la nuova firma: se `pnpm build` lo segnala, passare `[]` come terzo argomento **provvisorio** e sistemarlo nel Task 4.
Run: `pnpm build && pnpm lint`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(class): comandi della nota, e cancella/duplica imparano a distinguerla"
```

---

### Task 4: Il seam impara le note

**Files:**
- Modify: `src/editor/kinds/class.ts`
- Test: `src/editor/kinds/ops.test.ts`

**Interfaces:**
- Consumes: `noteRect` (Task 2), `addNote`/`deleteClassItems`/`duplicateClasses` (Task 3).
- Produces: `classOps.rectOf` risolve anche le chiavi di nota; `deleteItems` separa le chiavi; `layoutGraph` esclude le note.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/kinds/ops.test.ts`, in coda:

```ts
describe("classOps e le note", () => {
  /** Documento con una classe e una nota, entrambe con una view. Nomi inventati. */
  function docConNota() {
    const doc = createClassDocument("Prova", "doc-1")
    doc.diagram.model.classes.Cliente = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
    doc.diagram.view.nodes.Cliente = { x: 0, y: 0, collapsed: false }
    doc.diagram.model.notes["n-1"] = { text: "promemoria" }
    doc.diagram.view.nodes["n-1"] = { x: 300, y: 0, collapsed: false }
    return doc
  }

  it("nodeKeys elenca classi e note insieme: leggono entrambe da view.nodes", () => {
    expect(opsFor(docConNota()).nodeKeys().sort()).toEqual(["Cliente", "n-1"])
  })

  it("rectOf risolve una chiave di nota, non solo una di classe", () => {
    const ops = opsFor(docConNota())
    expect(ops.rectOf("n-1")).not.toBeNull()
    expect(ops.rectOf("n-1")!.x).toBe(300)
    expect(ops.rectOf("assente")).toBeNull()
  })

  it("rectOf su una nota rispetta `at`, che serve all'anteprima del drag", () => {
    expect(opsFor(docConNota()).rectOf("n-1", { x: 10, y: 20 })!.x).toBe(10)
  })

  it("edgesTouching non trova niente per una nota: non ha archi", () => {
    expect(opsFor(docConNota()).edgesTouching(new Set(["n-1"]))).toEqual([])
  })

  it("layoutGraph esclude le note: senza archi ELK le piazzerebbe dove capita", () => {
    const g = opsFor(docConNota()).layoutGraph()
    expect(g.nodes.map((n) => n.id)).toEqual(["Cliente"])
  })

  it("deleteItems separa le chiavi di nota da quelle di classe", () => {
    const doc = docConNota()
    const recipe = opsFor(doc).deleteItems(["Cliente", "n-1"], [])
    expect(recipe).not.toBeNull()
  })
})
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/editor/kinds/ops.test.ts`
Expected: FAIL — `rectOf("n-1")` torna `null`, `layoutGraph` va bene già (le note non sono in `model.classes`), `deleteItems` passa le chiavi di nota come classi.

- [ ] **Step 3: Implementa**

In `src/editor/kinds/class.ts`:

```ts
    rectOf: (key, at) => {
      const view = diagram().view.nodes[key]
      if (!view) return null
      const at_ = at ? { ...view, ...at } : view
      const cls = diagram().model.classes[key]
      if (cls) return classRect(cls, at_)
      // `view.nodes` è lo spazio di chiavi condiviso fra classi e note (§4 della spec): una chiave
      // che non è una classe può essere una nota, e solo qui si sa quale delle due.
      const note = diagram().model.notes[key]
      return note ? noteRect(note, at_) : null
    },

    deleteItems: (nodeKeys, edgeKeys) => {
      const notes = diagram().model.notes
      const noteKeys = nodeKeys.filter((k) => k in notes)
      const classKeys = nodeKeys.filter((k) => !(k in notes))
      return deleteClassItems(classKeys, edgeKeys, noteKeys)
    },
```

`layoutGraph` non cambia: `classLayoutGraph` itera `model.classes`, quindi le note ne restano fuori da sé. Aggiungere però il commento che lo dichiara, perché è una scelta e non un caso:

```ts
    // Le note restano fuori dal grafo: non hanno archi, e ELK le piazzerebbe lontano da ciò che
    // annotano. «Disponi» le lascia dove sono — il prezzo dichiarato di non averle ancorate (§4).
    layoutGraph: (): LayoutGraph => classLayoutGraph(diagram()),
```

- [ ] **Step 4: Esegui tutto**

Run: `pnpm test && pnpm build && pnpm lint` — Expected: puliti. Il terzo argomento provvisorio del Task 3 è ora quello vero.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(class): il seam risolve le chiavi di nota, e il layout le lascia stare"
```

---

### Task 5: Render della nota

**Files:**
- Create: `src/ui/canvas/ClassNote.tsx`
- Modify: `src/ui/canvas/kinds/class.tsx`
- Modify: `src/ui/export/svg.tsx`
- Test: `src/ui/canvas/class-render.test.tsx`, `src/ui/export/svg.test.ts`

**Interfaces:**
- Consumes: `noteSize`, `notePath`, `NOTE_FOLD` (Task 2).
- Produces: `ClassNoteView` (pura, prop-driven) e `ClassNoteNode` (connesso allo store).

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/ui/canvas/class-render.test.tsx`, in coda:

```ts
describe("ClassNoteView", () => {
  const nota = { text: "prima\nseconda" }

  it("disegna corpo e piega, e una riga di testo per riga di nota", () => {
    const html = renderToStaticMarkup(<ClassNoteView nodeKey="n-1" note={nota} view={{ x: 10, y: 20, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="n-1"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain("data-note-fold")
    expect(html).toContain(">prima<")
    expect(html).toContain(">seconda<")
  })

  it("una nota vuota non produce righe di testo ma esiste come nodo", () => {
    const html = renderToStaticMarkup(<ClassNoteView nodeKey="n-1" note={{ text: "" }} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="n-1"')
    expect(html).not.toContain("<text")
  })

  it("la selezione cambia il contorno, come per le classi", () => {
    const sel = renderToStaticMarkup(<ClassNoteView nodeKey="n-1" note={nota} view={{ x: 0, y: 0, collapsed: false }} selected={true} />)
    expect(sel).toContain("var(--primary)")
  })
})
```

In `src/ui/export/svg.test.ts`, dentro `describe("buildSvg (class diagram)")`:

```ts
  it("esporta anche le note, che sono nodi come le classi", () => {
    const d = classDiagram()
    d.model.notes = { "n-1": { text: "da rivedere" } }
    d.view.nodes["n-1"] = { x: 700, y: 700, collapsed: false }
    const svg = buildSvg(d, { vars })!
    expect(svg).toContain('data-node-id="n-1"')
    expect(svg).toContain(">da rivedere<")
  })
```

Nota: la fixture `classDiagram()` in quel file va estesa con `notes: {}`, se il Task 1 non l'ha già fatto.

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/ui/canvas/class-render.test.tsx src/ui/export/svg.test.ts`
Expected: FAIL — `ClassNoteView` non esiste.

- [ ] **Step 3: Scrivi il componente**

Crea `src/ui/canvas/ClassNote.tsx`:

```tsx
import { memo } from "react"
import { useStore } from "zustand"
import { classDiagram } from "@/editor/class-access"
import { noteSize, notePath } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { PAD_X, ROW_H } from "@/editor/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import type { ClassNote } from "@/model/class/schema"
import type { NodeView } from "@/model/shared"
import { registerNode } from "./dom-registry"

interface Props {
  nodeKey: string
  note: ClassNote
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
export const ClassNoteView = memo(function ClassNoteView({ nodeKey, note, view, selected }: Props) {
  const { w, h } = noteSize(note)
  const { body, fold } = notePath(w, h)
  const lines = note.text === "" ? [] : note.text.split("\n")
  const stroke = selected ? "var(--primary)" : "var(--border)"
  return (
    <g
      data-node-id={nodeKey}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(nodeKey, el)
        return () => registerNode(nodeKey, null)
      }}
    >
      <path d={body} fill="var(--card)" stroke={stroke} strokeWidth={selected ? 2 : 1} />
      <path data-note-fold d={fold} fill="var(--muted)" stroke={stroke} strokeWidth={selected ? 2 : 1} />
      {lines.map((line, i) => (
        <text key={i} x={PAD_X} y={6 + ROW_H * i + ROW_H / 2} dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
          {line}
        </text>
      ))}
    </g>
  )
})

/** Componente connesso: un selettore per nota, così un cambiamento altrove non la tocca. */
export function ClassNoteNode({ nodeKey }: { nodeKey: string }) {
  const note = useStore(documentStore, (s) => classDiagram(s.doc).model.notes[nodeKey])
  const view = useStore(documentStore, (s) => classDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", nodeKey)))
  if (!note || !view) return null
  return <ClassNoteView nodeKey={nodeKey} note={note} view={view} selected={selected} />
}
```

- [ ] **Step 4: Montala nel layer e nella vista**

In `src/ui/canvas/kinds/class.tsx`, `NodesLayer` monta le due specie:

```tsx
function NodesLayer() {
  const classKeys = useStore(documentStore, useShallow((s) => Object.keys(classDiagram(s.doc).model.classes)))
  const noteKeys = useStore(documentStore, useShallow((s) => Object.keys(classDiagram(s.doc).model.notes)))
  return (
    <g data-layer="nodes">
      {classKeys.map((key) => <ClassNode key={key} nodeKey={key} />)}
      {noteKeys.map((key) => <ClassNoteNode key={key} nodeKey={key} />)}
    </g>
  )
}
```

**Due selettori e non uno.** Un selettore solo che tornasse `{classes, notes}` allocherebbe un oggetto nuovo a ogni chiamata: `useSyncExternalStore` confronta per riferimento e l'albero React esploderebbe. `useShallow` copre una lista, non un oggetto costruito al volo.

E `NodeView` distingue le due specie:

```tsx
/**
 * `node` arriva come `unknown` da `buildSvg`, che non sa cosa contenga il modello. La nota si
 * riconosce dal campo `text`; un discriminante esplicito (`kind: "note"`) costringerebbe anche
 * `ClassNode` a portarne uno per restare una union pulita — un campo su ogni classe per un ramo
 * solo (§4 della spec).
 */
function NodeView({ nodeKey, node, view, selected }: NodeViewProps) {
  if (typeof node === "object" && node !== null && "text" in node) {
    return <ClassNoteView nodeKey={nodeKey} note={node as ClassNoteModel} view={view} selected={selected} />
  }
  return <ClassNodeView nodeKey={nodeKey} node={node as ClassNodeModel} view={view} selected={selected} />
}
```

- [ ] **Step 5: Fai vedere le note all'export**

In `src/ui/export/svg.tsx`, `nodeModels` diventa l'unione:

```ts
  const nodeModels: Record<string, unknown> =
    diagram.type === "er" ? diagram.model.entities : { ...diagram.model.classes, ...diagram.model.notes }
```

- [ ] **Step 6: Esegui tutto, e-2-e compreso**

Run: `pnpm test && pnpm build && pnpm lint` — Expected: puliti.
Run: `pnpm e2e` — Expected: 6/6 PASS. `NodesLayer` è sempre montato: un selettore che alloca passa gli altri tre comandi e fallisce solo qui.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(canvas): la nota si disegna, sul canvas e nell'export"
```

---

### Task 6: Lo strumento nota e il suo editor

**Files:**
- Modify: `src/editor/session-store.ts`, `src/ui/canvas/kinds/registry.ts`, `src/ui/canvas/kinds/class.tsx`, `src/ui/canvas/kinds/er.tsx`
- Modify: `src/ui/Toolbar.tsx`, `src/ui/use-keyboard-shortcuts.ts`, `src/ui/panels/PropertiesPanel.tsx`, `src/ui/panels/ClassProperties.tsx`
- Modify: `src/ui/canvas/use-canvas-interaction.ts`
- Create: `src/ui/canvas/NoteEditor.tsx`
- Test: `src/ui/canvas/kinds/registry.test.ts`

**Interfaces:**
- Consumes: `addNote`, `setNoteText` (Task 3), `noteSize` (Task 2).
- Produces: `Tool` include `"note"`; `DiagramView.tools.note?: ToolDef`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/ui/canvas/kinds/registry.test.ts`, in coda:

```ts
describe("terzo strumento", () => {
  it("la vista delle classi dichiara lo strumento nota, quella ER no", () => {
    expect(viewFor("class").tools.note).toBeDefined()
    expect(viewFor("er").tools.note).toBeUndefined()
  })

  it("le scorciatoie dei tre strumenti sono distinte", () => {
    const t = viewFor("class").tools
    const keys = [t.node.key, t.edge.key, t.note!.key]
    expect(new Set(keys).size).toBe(3)
    // `v` è riservata a «Seleziona» in `use-keyboard-shortcuts.ts`.
    expect(keys).not.toContain("v")
  })
})
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/ui/canvas/kinds/registry.test.ts`
Expected: FAIL — `tools.note` non esiste.

- [ ] **Step 3: Allarga la union e il registro**

`src/editor/session-store.ts`:

```ts
export type Tool = "select" | "node" | "edge" | "note"
```

`src/ui/canvas/kinds/registry.ts`:

```ts
interface ToolDef { label: string; key: string; Icon: LucideIcon }

export interface DiagramView {
  // … invariato …
  tools: {
    node: ToolDef
    edge: ToolDef
    /** Terza specie di nodo, oggi solo nel class diagram: l'ER non ha note e non ne dichiara. */
    note?: ToolDef
  }
  textFormats: TextFormat[]
}
```

`src/ui/canvas/kinds/class.tsx`, dentro `classView.tools`, e `StickyNote` importata da `lucide-react`:

```ts
    note: { label: "Nota", key: "n", Icon: StickyNote },
```

`erView.tools` non cambia: l'ER non dichiara la terza voce.

- [ ] **Step 4: Monta il terzo strumento dove serve**

`src/ui/Toolbar.tsx`, dopo `ToolItem value="edge"`:

```tsx
        {view.tools.note && <ToolItem value="note" def={view.tools.note} />}
```

`src/ui/use-keyboard-shortcuts.ts`, accanto agli altri due:

```ts
  else if (!mod && tools.note && key === tools.note.key) session.setTool("note")
```

`src/ui/panels/PropertiesPanel.tsx`: la frase composta non regge tre strumenti. Sostituire la composizione con una frase per tipo di diagramma, scritta per esteso:

```tsx
  const vuoto = view.tools.note
    ? "Seleziona una classe, una relazione o una nota."
    : `Seleziona ${indeterminateArticle(nodeLabel)}${nodeLabel} o ${indeterminateArticle(edgeLabel)}${edgeLabel}.`
```

- [ ] **Step 5: Crea la nota al click e aprine l'editor**

Il click con uno strumento attivo **non** è gestito nel hook: passa dal riduttore puro `reduce` in `src/editor/interaction.ts`, che produce un `Effect` che il hook esegue. Servono quindi tre pezzi.

`src/editor/interaction.ts`, la union `Effect` guadagna il caso e `reduce` il ramo, accanto a quelli di `"node"` ed `"edge"`:

```ts
  | { type: "create-note"; at: Point }
```

```ts
  if (ctx.tool === "note") {
    if (info.hit.kind === "canvas") return { mode: IDLE, effects: [{ type: "create-note", at: info.world }] }
  }
```

`src/editor/kinds/ops.ts`, `DiagramOps` guadagna un metodo **opzionale** — l'ER non ha note e non lo implementa, e lo strumento che lo chiama esiste solo dove `tools.note` è dichiarato:

```ts
  /** Terza specie di nodo, oggi solo nel class diagram. Assente dove il tipo non ha note. */
  addNote?(at: Point): { key: string; recipe: Recipe }
```

`classOps` lo cabla su `addNote` (Task 3); `erOps` resta com'è.

`src/ui/canvas/use-canvas-interaction.ts`, il `case` nuovo accanto a `create-node` — **`target: "body"` e non `"name"`**, perché una nota non ha nome:

```ts
        case "create-note": {
          const ops = opsFor(documentStore.getState().doc)
          if (!ops.addNote) break
          const { key, recipe } = ops.addNote(fx.at)
          documentStore.getState().dispatch(recipe)
          session().setSelection([selId("node", key)])
          session().setTool("select")
          session().setEditing({ key, target: "body" })
          break
        }
```

E `classEditTarget` guadagna il ramo della nota, altrimenti un doppio click sulla parte alta di una nota chiede l'editor del **nome** e questo cerca una classe che non esiste:

```ts
function classEditTarget(key: string, headerHit: boolean): "name" | "body" {
  const diagram = classDiagram(documentStore.getState().doc)
  // Una nota non ha nome: qualunque punto del suo rettangolo apre il corpo.
  if (diagram.model.notes[key]) return "body"
  const cls = diagram.model.classes[key]
  // … resto invariato …
}
```

- [ ] **Step 6: Scrivi `NoteEditor.tsx`**

**`editing.target` non cambia forma.** Resta `"name" | "body"`: una nota si modifica sempre nel corpo. `MembersEditor` e `NoteEditor` convivono perché ciascuno cerca la chiave nel proprio record e torna `null` se non la trova — `MembersEditor` in `model.classes`, `NoteEditor` in `model.notes`. Una chiave sta in uno solo dei due.

```tsx
import { useStore } from "zustand"
import { setNoteText } from "@/editor/class/commands"
import { classDiagram } from "@/editor/class-access"
import { noteSize } from "@/editor/class/geometry"
import { documentStore } from "@/editor/document-store"
import { FONT_SIZE } from "@/editor/geometry"
import { sessionStore } from "@/editor/session-store"
import { worldToScreen } from "@/editor/viewport"

/**
 * Textarea sovrapposta a una nota in editing, posizionata come `MembersEditor` — `worldToScreen`,
 * dimensioni da `noteSize`.
 *
 * **Senza parser, quindi senza i due comportamenti che `MembersEditor` ha dovuto costruire**: non
 * c'è un testo che possa essere rifiutato, quindi nessun rifiuto sul blur e nessuna riapertura col
 * caret su una riga d'errore. Si commette sul blur, Escape chiude scartando.
 */
export function NoteEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const note = useStore(documentStore, (s) =>
    editing?.target === "body" && s.doc.diagram.type === "class" ? classDiagram(s.doc).model.notes[editing.key] : undefined,
  )
  const view = useStore(documentStore, (s) =>
    editing?.target === "body" && s.doc.diagram.type === "class" ? classDiagram(s.doc).view.nodes[editing.key] : undefined,
  )
  if (!editing || editing.target !== "body" || !note || !view) return null

  const close = () => sessionStore.getState().setEditing(null)
  const { w, h } = noteSize(note)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })

  return (
    <textarea
      aria-label="Testo della nota"
      autoFocus
      defaultValue={note.text}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        documentStore.getState().dispatch(setNoteText(editing.key, e.currentTarget.value))
        close()
      }}
      onKeyDown={(e) => {
        // Escape scarta; Enter no — una nota è multiriga per natura, a differenza di un nome.
        if (e.key === "Escape") {
          e.preventDefault()
          close()
        }
      }}
      style={{
        position: "absolute",
        left: tl.x,
        top: tl.y,
        width: w * viewport.scale,
        height: h * viewport.scale,
        fontSize: FONT_SIZE * viewport.scale,
      }}
      className="resize-none rounded border bg-card p-1 font-mono text-foreground outline-none ring-2 ring-primary"
    />
  )
}
```

`aria-label="Testo della nota"` è il selettore che userà l'e2e del Task 11. Il componente si monta accanto a `MembersEditor`, nello stesso punto dell'albero.

- [ ] **Step 7: Aggiungi il pannello della nota**

In `src/ui/panels/ClassProperties.tsx`, il caso «una nota selezionata» mostra una `textarea` col testo, commessa sul blur — lo stesso comando `setNoteText`. È l'alternativa al doppio click, come il campo «Membri» lo è per le classi.

- [ ] **Step 8: Esegui tutto**

Run: `pnpm test && pnpm build && pnpm lint` — Expected: puliti.
Run: `pnpm e2e` — Expected: 6/6 PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): strumento nota, suo editor e sua riga nel pannello"
```

---

### Task 7: Le note nell'export Mermaid

**Files:**
- Modify: `src/io/emit/class-mermaid.ts`
- Test: `src/io/emit/class-mermaid.test.ts`

**Interfaces:**
- Consumes: `ClassModel.notes` (Task 1).
- Produces: righe `note "…"` in coda al blocco emesso.

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
describe("note", () => {
  const modello = (notes: Record<string, { text: string }>) => ({ classes: {}, relations: {}, notes })

  it("una nota diventa una riga note, fuori da qualunque blocco class", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "da rivedere" } }))
    expect(text).toContain('note "da rivedere"')
    expect(text).not.toContain("class {")
  })

  it("gli a capo veri diventano \\n letterali", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "prima\nseconda" } }))
    expect(text).toContain('note "prima\\nseconda"')
    // Una riga sola nell'output: l'a capo vero romperebbe la sintassi.
    expect(text.split("\n").filter((l) => l.includes("note ")).length).toBe(1)
  })

  it("le virgolette doppie diventano singole, o chiuderebbero la stringa", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: 'il campo "id"' } }))
    expect(text).toContain(`note "il campo 'id'"`)
  })

  it("una nota vuota non produce nessuna riga", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "" } }))
    expect(text).not.toContain("note ")
  })
})
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/io/emit/class-mermaid.test.ts`
Expected: FAIL — nessuna riga `note`.

- [ ] **Step 3: Implementa**

```ts
/**
 * Testo di una nota dentro `note "…"`. Due sostituzioni, entrambe deterministiche: l'a capo vero
 * romperebbe la riga, la virgoletta doppia chiuderebbe la stringa. L'entità `#quot;` che Mermaid
 * documenta altrove **non è stata misurata dentro una `note`** (§4 della spec): finché non lo è,
 * non si emette una sintassi sperata.
 */
function noteText(text: string): string {
  return text.replaceAll('"', "'").replaceAll("\n", "\\n")
}
```

E in `emitClassMermaid`, dopo il ciclo dei blocchi `class`:

```ts
  for (const key of Object.keys(model.notes).sort()) {
    const text = model.notes[key]!.text
    // Una nota vuota non ha niente da dire: `note ""` è rumore nel file emesso.
    if (text !== "") out.push(`  note "${noteText(text)}"`)
  }
```

- [ ] **Step 4: Esegui i test**

Run: `pnpm test && pnpm build && pnpm lint` — Expected: puliti.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(export): le note escono in Mermaid"
```

---

### Task 8: Navigabilità dell'associazione

**Files:**
- Modify: `src/editor/class/geometry.ts`
- Modify: `src/ui/canvas/ClassEdge.tsx`, `src/editor/kinds/class.ts`
- Modify: `src/ui/panels/ClassProperties.tsx`
- Modify: `src/io/emit/class-mermaid.ts`
- Test: `src/editor/class/geometry.test.ts`, `src/ui/canvas/class-render.test.tsx`, `src/io/emit/class-mermaid.test.ts`

**Interfaces:**
- Consumes: `ClassRelation.navigable` (Task 1).
- Produces: `umlMarkerPath(at, dir, kind, navigable?)`.

**Attenzione:** `umlMarkerPath` è chiamata da `classEdgeGeometry`, che ha già la relazione sotto mano. Il quarto parametro è opzionale così le chiamate esistenti nei test non cambiano.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/class/geometry.test.ts`:

```ts
describe("associazione navigabile", () => {
  it("l'associazione non navigabile resta nuda, quella navigabile prende la freccia", () => {
    expect(umlMarkerPath({ x: 0, y: 0 }, UP, "association")).toBe("")
    expect(umlMarkerPath({ x: 0, y: 0 }, UP, "association", true).length).toBeGreaterThan(0)
  })

  it("la freccia dell'associazione navigabile è la stessa della dipendenza", () => {
    const dip = umlMarkerPath({ x: 10, y: 10 }, RIGHT, "dependency")
    expect(umlMarkerPath({ x: 10, y: 10 }, RIGHT, "association", true)).toBe(dip)
  })

  it("navigable non tocca gli altri tipi: hanno già la loro punta", () => {
    const gen = umlMarkerPath({ x: 0, y: 0 }, UP, "generalization")
    expect(umlMarkerPath({ x: 0, y: 0 }, UP, "generalization", true)).toBe(gen)
  })

  it("classEdgeGeometry passa navigable al marker", () => {
    const source: Rect = { x: 0, y: 0, w: 100, h: 60 }
    const target: Rect = { x: 240, y: 0, w: 100, h: 60 }
    const rel: ClassRelation = { kind: "association", navigable: true, source: { class: "A", multiplicity: "", role: "" }, target: { class: "B", multiplicity: "", role: "" } }
    expect(classEdgeGeometry(source, target, rel).targetMarker.length).toBeGreaterThan(0)
  })
})
```

In `src/io/emit/class-mermaid.test.ts`:

```ts
it("l'associazione navigabile esce con -->, quella nuda con --", () => {
  const rel = (navigable?: boolean) => ({
    classes: { A: { name: "A", stereotype: "class" as const, attributes: [], methods: [] }, B: { name: "B", stereotype: "class" as const, attributes: [], methods: [] } },
    relations: { r: { kind: "association" as const, ...(navigable === undefined ? {} : { navigable }), source: { class: "A", multiplicity: "", role: "" }, target: { class: "B", multiplicity: "", role: "" } } },
    notes: {},
  })
  expect(emitClassMermaid(rel(true)).text).toContain("A --> B")
  expect(emitClassMermaid(rel(false)).text).toContain("A -- B")
  expect(emitClassMermaid(rel()).text).toContain("A -- B")
})
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/editor/class/geometry.test.ts src/io/emit/class-mermaid.test.ts`
Expected: FAIL — `umlMarkerPath` accetta tre argomenti e l'associazione esce sempre `--`.

- [ ] **Step 3: Implementa il marker**

In `src/editor/class/geometry.ts`, `umlMarkerPath` guadagna il quarto parametro e il ramo dell'associazione.

La freccia aperta oggi è l'ultima riga di `umlMarkerPath`, raggiunta per esclusione dalla dipendenza. Va estratta in una funzione, perché ora ha due chiamanti — due copie verbatim dello stesso path sono esattamente ciò che il fix `classEdgeGeometry` del giro precedente ha dovuto disfare:

```ts
/** Freccia aperta: due segmenti che convergono su `at`. La usano la dipendenza e l'associazione navigabile. */
function openArrowPath(at: Point, dir: Dir): string {
  const px = -dir.y
  const py = dir.x
  const p = (d: number, s: number): Point => ({ x: at.x + dir.x * d + px * s, y: at.y + dir.y * d + py * s })
  return `${pathFromPoints([p(ARROW_LEN, -ARROW_HALF_W), at])} ${pathFromPoints([at, p(ARROW_LEN, ARROW_HALF_W)])}`
}
```

`umlMarkerPath` diventa quindi:

```ts
export function umlMarkerPath(at: Point, dir: Dir, kind: RelationKind, navigable = false): string {
  // L'associazione è l'unico tipo il cui marker dipende dal modello e non solo dal `kind`: la
  // navigabilità è un'affermazione che il diagramma fa, non una proprietà della specie di arco.
  if (kind === "association") return navigable ? openArrowPath(at, dir) : ""

  const px = -dir.y
  const py = dir.x
  const p = (d: number, s: number): Point => ({ x: at.x + dir.x * d + px * s, y: at.y + dir.y * d + py * s })

  if (kind === "generalization" || kind === "realization") {
    return `${pathFromPoints([at, p(TRIANGLE_LEN, -TRIANGLE_HALF_W), p(TRIANGLE_LEN, TRIANGLE_HALF_W)])} Z`
  }

  if (kind === "composition" || kind === "aggregation") {
    return `${pathFromPoints([at, p(DIAMOND_LEN / 2, -DIAMOND_HALF_W), p(DIAMOND_LEN, 0), p(DIAMOND_LEN / 2, DIAMOND_HALF_W)])} Z`
  }

  return openArrowPath(at, dir)
}
```

`classEdgeGeometry` passa il campo:

```ts
    targetMarker: umlMarkerPath(to, route.targetDir, relation.kind, relation.navigable),
```

- [ ] **Step 4: Implementa l'export**

In `src/io/emit/class-mermaid.ts`, `relationLine` sceglie il token:

```ts
  // `-->` solo quando il modello registra la navigabilità. Finché non la registrava, `--` era la
  // scelta corretta perché `-->` avrebbe affermato un verso che nessuno aveva dichiarato (§5 della
  // spec di ampiezza, che completa il Ruling 16 invece di contraddirlo).
  const token = rel.kind === "association" && rel.navigable ? "-->" : RELATION_TOKEN[rel.kind]
```

**Attenzione al lato:** `TARGET_LEFT` non contiene `association`, quindi il `source` va a sinistra e `-->` punta dal `source` al `target`, che è il verso giusto.

- [ ] **Step 5: Aggiungi la casella nel pannello**

In `ClassProperties.tsx`, sotto il selettore del tipo, visibile **solo** per l'associazione:

```tsx
      {rel.kind === "association" && (
        <Flag label="Navigabile" checked={rel.navigable ?? false} onChange={(v) => dispatch(updateRelation(key, (r) => { r.navigable = v || undefined }))} />
      )}
```

`v || undefined` e non `v`: un `false` esplicito nel documento salvato direbbe la stessa cosa dell'assenza, occupando spazio e producendo una patch di undo per niente.

- [ ] **Step 6: Esegui tutto**

Run: `pnpm test && pnpm build && pnpm lint && pnpm e2e` — Expected: puliti, 6/6.

- [ ] **Step 7: Aggiorna la spec madre**

In `docs/superpowers/specs/2026-09-10-class-diagram-design.md`, §9: la nota che spiega perché l'associazione esce `--` va completata, non cancellata. `--` resta il caso non navigabile; `-->` è il caso navigabile, ora che il modello lo registra.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(class): l'associazione può dichiararsi navigabile"
```

---

### Task 9: Export onesto sui tipi

**Files:**
- Modify: `src/io/emit/class-mermaid.ts`
- Test: `src/io/emit/class-mermaid.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces: i tipi emessi traducono i generici e perdono le graffe, con un avviso aggregato.

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
describe("tipi che Mermaid non porta com'è", () => {
  const conTipo = (type: string) => ({
    classes: { A: { name: "A", stereotype: "class" as const, attributes: [{ name: "campo", type, visibility: "public" as const, isStatic: false }], methods: [] } },
    relations: {},
    notes: {},
  })

  it("i generici passano alle tilde, che è la sintassi che Mermaid interpreta", () => {
    expect(emitClassMermaid(conTipo("List<Ordine>")).text).toContain("+List~Ordine~ campo")
  })

  it("anche con la virgola: misurato su mermaid@11, contro quel che dice la doc", () => {
    expect(emitClassMermaid(conTipo("Map<string, int>")).text).toContain("+Map~string, int~ campo")
  })

  it("il `>` di `=>` non è una parentesi angolare e non si tocca", () => {
    // È il quinto difetto del Task 8 del piano precedente: il parser gestisce `(int) => void`
    // apposta, e una sostituzione cieca lo trasformerebbe in `(int) =~ void`.
    const { text } = emitClassMermaid(conTipo("(int) => void"))
    expect(text).toContain("=>")
    expect(text).not.toContain("=~")
  })

  it("un tipo con angolari sbilanciate esce com'era, con un avviso", () => {
    const { text, warnings } = emitClassMermaid(conTipo("List<Ordine"))
    expect(text).toContain("List<Ordine")
    expect(warnings.join(" ")).toContain("A.campo")
  })

  it("le graffe si rimuovono: una sola fa fallire il parsing dell'intero diagramma", () => {
    const { text, warnings } = emitClassMermaid(conTipo("string {readOnly}"))
    expect(text).toContain("+string campo")
    expect(text).not.toContain("{")
    expect(warnings.join(" ")).toContain("A.campo")
  })

  it("una graffa spaiata si rimuove dalla graffa in poi", () => {
    expect(emitClassMermaid(conTipo("string {read")).text).toContain("+string campo")
  })

  it("gli avvisi sono aggregati, non uno per membro", () => {
    const modello = conTipo("string {readOnly}")
    modello.classes.A.attributes.push({ name: "altro", type: "int {x}", visibility: "public", isStatic: false })
    expect(emitClassMermaid(modello).warnings.filter((w) => w.includes("graffe"))).toHaveLength(1)
  })

  it("`= valore` passa senza avviso: Mermaid lo rende letteralmente", () => {
    const { text, warnings } = emitClassMermaid(conTipo("decimal = 0"))
    expect(text).toContain("+decimal = 0 campo")
    expect(warnings).toEqual([])
  })
})
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/io/emit/class-mermaid.test.ts`
Expected: FAIL — i tipi escono verbatim.

- [ ] **Step 3: Implementa la traduzione**

```ts
/**
 * Traduce le parentesi angolari di un generico nelle tilde che Mermaid interpreta. Senza questa
 * traduzione `List<Ordine>` **rende `List`**: il parametro sparisce, in silenzio — misurato su
 * `mermaid@11`, §3 della spec di ampiezza. Nessun caso speciale per la virgola: la stessa misura
 * mostra che `Map~string, int~` funziona, contro quel che dice la documentazione.
 *
 * Il `>` preceduto da `=` o `-` resta com'è: `(int) => void` è un tipo legale nella nostra
 * sintassi, e sostituirlo produrrebbe `(int) =~ void`.
 *
 * Torna `null` se il risultato non è bilanciato — tilde in numero dispari: meglio il tipo
 * originale e un avviso che una sintassi a metà.
 */
function genericsToTildes(type: string): string | null {
  const out = type.replace(/</g, "~").replace(/(?<![=-])>/g, "~")
  const tildes = (out.match(/~/g) ?? []).length
  return tildes % 2 === 0 ? out : null
}

/** Rimuove ogni gruppo `{…}` graffe comprese, e la graffa spaiata con tutto ciò che la segue. */
function stripBraces(type: string): string {
  return type.replace(/\{[^}]*\}/g, "").replace(/[{}].*$/, "").replace(/\s+/g, " ").trim()
}
```

`typeAndName` resta la forma comune, ma il tipo ci arriva già trattato: la trasformazione e la raccolta degli avvisi vivono in un passaggio che conosce il nome della classe e del membro, perché l'avviso li nomina.

- [ ] **Step 4: Collega gli avvisi**

Due avvisi aggregati, nella forma degli otto dell'emettitore DDL:

```ts
  if (unbalanced.length > 0) {
    warnings.push(`${unbalanced.length} tipi hanno parentesi angolari sbilanciate e sono usciti com'erano: ${unbalanced.join(", ")}`)
  }
  if (braced.length > 0) {
    warnings.push(`${braced.length} tipi contenevano graffe, rimosse perché fanno fallire il parsing dell'intero diagramma: ${braced.join(", ")}`)
  }
```

- [ ] **Step 5: Esegui e verifica contro Mermaid vero**

Run: `pnpm test && pnpm build && pnpm lint` — Expected: puliti.

Verifica manuale, una volta: incollare l'output di un diagramma con `List<Ordine>` e `string {readOnly}` in un rendering di `mermaid@11` e controllare che il parametro compaia e che il diagramma si renda. È la stessa prova che ha prodotto la §3 della spec; senza, i test dicono solo che emettiamo ciò che abbiamo deciso di emettere.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(export): i generici non si perdono più, le graffe non rompono il file"
```

---

### Task 10: Sottolineato dello statico

**Files:**
- Modify: `src/model/class/members.ts`
- Modify: `src/editor/class/geometry.ts`, `src/ui/canvas/ClassNode.tsx`
- Test: `src/model/class/members.test.ts`, `src/ui/canvas/class-render.test.tsx`

**Interfaces:**
- Consumes: niente.
- Produces: `memberLines(m: Members): MemberLine[]` dove `MemberLine = { text: string; underline: { from: number; to: number } | null }`.

**Questo task è isolato di proposito e va per ultimo: si può abbandonare senza toccare gli altri nove.**

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/model/class/members.test.ts`:

```ts
describe("memberLines e lo statico", () => {
  const attributo = (name: string, isStatic: boolean) => ({ name, type: "int", visibility: "public" as const, isStatic })

  it("la riga resa non contiene più {static}: al suo posto il nome va sottolineato", () => {
    const [riga] = memberLines({ attributes: [attributo("contatore", true)], methods: [] })
    expect(riga!.text).not.toContain("{static}")
    expect(riga!.underline).not.toBeNull()
  })

  it("gli estremi del sottolineato ritagliano esattamente il nome", () => {
    const [riga] = memberLines({ attributes: [attributo("contatore", true)], methods: [] })
    const { from, to } = riga!.underline!
    expect(riga!.text.slice(from, to)).toBe("contatore")
  })

  it("un membro non statico non ha sottolineato", () => {
    const [riga] = memberLines({ attributes: [attributo("id", false)], methods: [] })
    expect(riga!.underline).toBeNull()
  })

  it("{abstract} resta nel testo: è notazione UML legittima", () => {
    const metodo = { name: "render", type: "string", visibility: "public" as const, isStatic: false, isAbstract: true, parameters: [] }
    const [riga] = memberLines({ attributes: [], methods: [metodo] })
    expect(riga!.text).toContain("{abstract}")
  })

  it("memberText non cambia: {static} resta nella sintassi che il parser rilegge", () => {
    const testo = memberText({ attributes: [attributo("contatore", true)], methods: [] })
    expect(testo).toContain("{static}")
    const round = parseMembers(testo)
    expect(round.ok && round.value.attributes[0]!.isStatic).toBe(true)
  })

  it("le colonne restano allineate sulle righe rese, non su quelle canoniche", () => {
    const righe = memberLines({ attributes: [attributo("a", true), attributo("bbbbbb", false)], methods: [] })
    const colonne = righe.map((r) => r.text.indexOf(":"))
    expect(new Set(colonne).size).toBe(1)
  })
})
```

In `src/ui/canvas/class-render.test.tsx`:

```ts
it("una riga statica esce in tspan col sottolineato, le altre restano un testo solo", () => {
  const conStatico: ClassNode = {
    name: "Contatore", stereotype: "class",
    attributes: [{ name: "totale", type: "int", visibility: "public", isStatic: true }, { name: "id", type: "int", visibility: "public", isStatic: false }],
    methods: [],
  }
  const html = renderToStaticMarkup(<ClassNodeView nodeKey="Contatore" node={conStatico} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
  expect(html).toContain("text-decoration")
  expect(html).not.toContain("{static}")
})

it("la larghezza calcolata corrisponde alla riga resa, non a quella canonica", () => {
  // È il difetto del fix I2 del piano precedente, in un'altra forma: `classSize` misura le righe
  // per decidere la larghezza del nodo, e se misurasse `{static}` — che il renderer non disegna —
  // il nodo sarebbe largo quanto una riga che nessuno vede.
  const conStatico: ClassNode = {
    name: "C", stereotype: "class",
    attributes: [{ name: "totale", type: "int", visibility: "public", isStatic: true }],
    methods: [],
  }
  const senza: ClassNode = { ...conStatico, attributes: [{ ...conStatico.attributes[0]!, isStatic: false }] }
  expect(classSize(conStatico, false).w).toBe(classSize(senza, false).w)
})
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run src/model/class/members.test.ts src/ui/canvas/class-render.test.tsx`
Expected: FAIL — `memberLines` torna stringhe, e le righe contengono `{static}`.

- [ ] **Step 3: Cambia `memberLines`**

```ts
export interface MemberLine {
  /** Riga come va disegnata: senza `{static}`, già allineata a colonne. */
  text: string
  /** Estremi del nome dentro `text`, o `null` se il membro non è statico. */
  underline: { from: number; to: number } | null
}
```

`modifiersText` resta per `memberText`, che è la forma canonica della textarea e **non cambia**: `{static}` è la sintassi che `parseMembers` rilegge, e toglierla dal testo romperebbe il round trip. `memberLines` invece costruisce il prefisso senza `{static}`, tiene `{abstract}`, e registra dove comincia e finisce il nome.

- [ ] **Step 4: Aggiorna i due consumatori**

`classSize` usa `.text.length` al posto di `.length` sulle righe. `ClassNodeView` spezza in tre `<tspan>` — prefisso, nome sottolineato, resto — solo le righe con `underline` non nullo; le altre restano un `<text>` unico.

- [ ] **Step 5: Esegui tutto**

Run: `pnpm test && pnpm build && pnpm lint && pnpm e2e` — Expected: puliti, 6/6.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(canvas): lo statico si sottolinea, come vuole UML"
```

---

### Task 11: Scena e2e della nota

**Files:**
- Create: `scripts/e2e/class-note.mjs`
- Modify: `scripts/e2e/run.mjs` — importa `run as runClassNote` e aggiunge il suo esito all'`&&` che oggi combina sei scenari
- Test: la scena stessa

**Interfaces:**
- Consumes: `aria-label="Testo della nota"` (Task 6), lo strumento «Nota» (Task 6).

- [ ] **Step 1: Scrivi la scena**

Modellata su `scripts/e2e/class.mjs`, che resta il riferimento per struttura e helper (`expectMenu`, `expectNodes`, `startEnv`, `signature`). Cinque passi:

1. «Nuovo ▸ Class diagram», canvas vuoto.
2. Strumento «Nota», un click: nasce un nodo e la `textarea` si apre da sé.
3. Si scrive un testo su due righe e si commette col blur: il testo compare sul nodo e **la geometria cambia** — misurare il rettangolo prima e dopo, come fa `class.mjs` per i membri.
4. Si trascina la nota: si sposta, e un `⌘Z` la rimette dov'era.
5. «Esporta testo…»: il testo della nota compare nell'output come riga `note "…"`.

I tre comportamenti che senza un browser vero non esistono: la `textarea` della nota prende il fuoco e commette sul blur; il drag di un nodo **che non è una classe** passa per lo stesso `rectOf` del seam, ed è l'unico punto dove si vede che `rectOf` risolve le chiavi di nota; l'undo di un drag di nota.

- [ ] **Step 2: Esegui**

Run: `pnpm e2e` — Expected: 7/7 PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(e2e): settima scena, la nota dal click all'export"
```

---

### Task 12: Chiusura

**Files:**
- Modify: `docs/debito-tecnico.md`
- Modify: `docs/superpowers/specs/2026-09-06-dev-designer-design.md` se l'ordine di consegna va aggiornato

- [ ] **Step 1: Misura le prestazioni**

Run: `pnpm perf`
Expected: nessuna regressione rispetto alla misura registrata prima di cominciare. `zoom` resta FAIL, che è documentato. Se `dragAll` peggiora, il sospetto principale è `NodesLayer`: due selettori invece di uno.

- [ ] **Step 2: Registra ciò che resta**

In `docs/debito-tecnico.md`, sotto `### Class diagram`, aggiungere le voci che questo piano lascia aperte di proposito: l'ancoraggio della nota a una classe, le note escluse dal layout, i valori di default che restano testo dentro il tipo. Il package è già nella §11 della spec e non va duplicato qui.

- [ ] **Step 3: Verifica finale**

Run: `pnpm test && pnpm build && pnpm lint && pnpm e2e`
Expected: tutto verde, 7/7 e2e.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: cosa resta aperto dopo il primo giro di ampiezza"
```

---

## Note per chi esegue

**L'ordine non è arbitrario.** I task 1-7 sono una catena: lo schema regge i comandi, i comandi reggono il seam, il seam regge il render, il render regge lo strumento. I task 8, 9 e 10 sono indipendenti fra loro e dalla catena: si possono riordinare o abbandonare senza rompere niente. Il 10 è quello da abbandonare per primo se il tempo stringe.

**Il rischio più concreto è nel Task 5**, non nel 10: `NodesLayer` è sempre montato, e un selettore che alloca un oggetto nuovo a ogni chiamata passa `pnpm test`, `pnpm build` e `pnpm lint` e fa esplodere l'intero albero React solo nel browser. È già successo una volta in questo progetto, nel Task 14 del piano precedente, e si è visto solo perché `pnpm e2e` ha fallito tutte e cinque le scene allo stesso modo.

**Il secondo rischio è nel Task 10**, e non è il `text-decoration`: è la corrispondenza fra la larghezza che `classSize` calcola e la riga che il renderer disegna. Il test che la copre è quello che confronta `classSize` con e senza `isStatic`.
