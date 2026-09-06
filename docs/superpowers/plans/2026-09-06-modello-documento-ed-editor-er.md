# Modello del documento ed editor ER — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un editor ER funzionante nel browser: entità con attributi tipizzati, relazioni crow's foot, pan/zoom/fit, selezione singola/multipla/a rettangolo, drag, duplica, elimina, undo/redo, scorciatoie, validazione live, tema chiaro/scuro; con la misura FPS a frame dipinti a 300 entità che lo spike non ha fatto.

**Architecture:** quattro strati con dipendenze verso il basso (`model` → `editor` → `ui`), imposte da ESLint. Il documento è uno schema zod (`model`) tenuto in uno store Zustand vanilla; ogni modifica è un comando Immer che produce patch e patch inverse (undo senza snapshot). Lo stato transitorio (viewport, selezione, tool, editing) sta in un secondo store. Il renderer è un solo `<svg>` con tre layer; il `transform` del viewport e le posizioni durante il drag sono scritti sul DOM in modo imperativo, fuori dal render di React, come prescritto dalle decisioni dello spike. Una state machine pura (`editor/interaction.ts`) traduce gli eventi pointer in effetti; un hook li esegue.

**Tech Stack:** Vite 8, React 19, TypeScript 6 strict, Tailwind v4 + shadcn/ui (preset `b5tJDL2z0i`, stile `radix-lyra`), Zustand 5.0.x, Immer 11.1.x, Zod 4.5.x, Vitest 5, Playwright 1.63 (solo come libreria per la misura FPS). Font JetBrains Mono già nel preset.

**Spec:** `docs/superpowers/specs/2026-09-06-dev-designer-design.md` (§2 Shell + ER, §4.1–4.3, §4.5). Decisioni vincolanti da `docs/superpowers/spikes/2026-09-06-spike-results.md`, sezione "Decisioni per il piano successivo".

**Fuori da questo piano (piano 3, "Shell: persistenza, file, import ed export"):** IndexedDB e autosave, apri/salva su file, importer DDL, export SVG/PNG/DDL/Mermaid, copia/incolla via clipboard, auto layout ELK, entità senza `view` (l'import produce solo il `model`), plugin wasm condizionale, tsconfig dedicato ai test con `node:fs`. Il modello dati e `toJson`/`parseDocument` nascono qui perché sono `model`, non `io`.

## Global Constraints

- TypeScript `strict`, nessun `any` non motivato; `pnpm build` (`tsc -b && vite build`), `pnpm lint`, `pnpm test` verdi a ogni commit.
- Strati: `src/model` importa solo `zod`; `src/editor` importa `model`, `zustand`, `immer`, mai `react` né `src/ui`; React compare solo in `src/ui` (e in `src/main.tsx`). La regola è imposta da `no-restricted-imports` in `eslint.config.js` (Task 1).
- Nessuna misura di testo nel DOM: larghezza testo = caratteri × `CHAR_W`, con `CHAR_W = FONT_SIZE * 0.6` (JetBrains Mono, avanzamento 600/1000 em).
- Rendering: un solo `<svg>`; il `transform` del viewport si applica con `setAttribute` da una subscription allo store, non da un render React; durante il drag le posizioni si scrivono sul DOM tramite `src/ui/canvas/dom-registry.ts`; il documento riceve **un** comando al rilascio.
- Selettori Zustand che restituiscono oggetti o array nuovi vanno avvolti in `useShallow` (zustand v5 usa `useSyncExternalStore`: un riferimento nuovo a ogni chiamata è un loop infinito).
- Criterio prestazioni (Task 11): a 300 entità, in build di produzione, il **p95 del tempo di frame ≤ 20 ms** (≥ 50 FPS) in drag, drag di tutta la selezione, pan, marquee e zoom. Il tetto voluto dall'utente è 60 FPS: non si ottimizza oltre.
- Nuove dipendenze ammesse: `zustand`, `immer`, `zod` (dependencies), `playwright` (devDependency). Nessun'altra.
- Componenti shadcn ammessi in questo piano: `button` (esiste), `input`, `label`, `separator`, `toggle-group` (porta con sé `toggle`, sua dipendenza obbligatoria), `tooltip`. Checkbox e select sono elementi HTML nativi.
- Testi UI, commenti, docstring e commit in italiano; identificatori in inglese. Commit in stile `feat: …`, `test: …`, `docs: …`, `chore: …`.
- Identità git: prima del primo commit verificare `git config --local user.email` = `alessandromian95@gmail.com` (altrimenti eseguire `git-config-personal`).
- Per API di librerie non riportate qui, leggere il file generato o la documentazione ufficiale, non andare a memoria (in particolare i componenti shadcn generati in `src/components/ui/`).

---

## Struttura dei file

```
src/model/document.ts            schema zod + tipi + entityKey + createErDocument
src/model/migrations.ts          SCHEMA_VERSION → catena di migrazioni pure
src/model/serialize.ts           toJson (chiavi ordinate) / parseDocument
src/model/er/validate.ts         validateEr(model) → Issue[]
src/editor/er-geometry.ts        costanti font, dimensioni entità, Rect, snap
src/editor/edge-routing.ts       routing ortogonale, crow's foot, edgeGeometry
src/editor/viewport.ts           Viewport, screen↔world, zoomAt, fitToRect
src/editor/er-access.ts          erDiagram(doc) guard
src/editor/document-store.ts     store documento + undo/redo a patch
src/editor/commands/er.ts        comandi ER (recipe Immer)
src/editor/session-store.ts      viewport, selezione, tool, editing, canvasSize
src/editor/interaction.ts        state machine pura pointer → effetti
src/editor/actions.ts            azioni condivise toolbar/tastiera
src/ui/canvas/dom-registry.ts    mappa key → elemento SVG, applicatori imperativi
src/ui/canvas/ViewportGroup.tsx  <g> con transform imperativo
src/ui/canvas/EntityNode.tsx     nodo entità (connesso + vista pura)
src/ui/canvas/RelationshipEdge.tsx edge relazione (connesso + vista pura)
src/ui/canvas/layers.tsx         NodesLayer, EdgesLayer
src/ui/canvas/Overlay.tsx        marquee e anteprima connessione
src/ui/canvas/Canvas.tsx         <svg> radice
src/ui/canvas/use-canvas-interaction.ts  hook eventi → reducer → effetti
src/ui/canvas/InlineEditor.tsx   input HTML sovrapposto per il nome
src/ui/Toolbar.tsx, use-keyboard-shortcuts.ts, use-theme.ts
src/ui/panels/PropertiesPanel.tsx, IssuesPanel.tsx, CommitInput.tsx
src/perf/stress.ts               documento sintetico a N entità (?stress=N)
scripts/perf/fps.mjs             harness Playwright a frame dipinti
docs/perf/2026-09-06-fps-frame-dipinti.md  risultati Task 11
```

---

### Task 1: Dipendenze, componenti shadcn e regola ESLint degli strati

**Files:**
- Modify: `package.json` (via pnpm), `eslint.config.js`
- Create: `src/components/ui/{input,label,separator,toggle,toggle-group,tooltip}.tsx` (generati da shadcn; `toggle` è dipendenza di `toggle-group`)

**Interfaces:**
- Produces: alias `@/model/*`, `@/editor/*`, `@/ui/*` già risolti da `tsconfig` e `vite.config.ts`; regola ESLint che rende errore un import di React in `src/model` o `src/editor`.

- [ ] **Step 1: Verificare identità git e installare le dipendenze**

```bash
git config --local user.email
pnpm add zustand@^5.0.15 immer@^11.1.18 zod@^4.5.4
pnpm add -D playwright@^1.63.0
```

Atteso: email `alessandromian95@gmail.com`; `package.json` con le quattro dipendenze. Non installare i browser di Playwright: il Task 11 usa il Chrome di sistema (`channel: "chrome"`).

- [ ] **Step 2: Aggiungere i componenti shadcn**

```bash
pnpm dlx shadcn@latest add input label separator toggle-group tooltip -y
```

Atteso: sei file in `src/components/ui/` (`toggle.tsx` arriva come dipendenza di `toggle-group`). Leggerli: le API (`asChild`, `type="single"`, nomi degli export) servono ai Task 9 e 10.

- [ ] **Step 3: Regola degli strati in `eslint.config.js`**

Aggiungere dopo l'override di `src/components/ui/**`:

```js
  {
    // Strato model: TypeScript puro. Solo zod.
    files: ['src/model/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', 'react/*', 'zustand', 'zustand/*', 'immer',
            '@/editor/**', '@/ui/**', '@/io/**', '**/editor/**', '**/ui/**', '**/io/**'],
          message: 'src/model è TypeScript puro: niente React, store o strati superiori.',
        }],
      }],
    },
  },
  {
    // Strato editor: conosce model, zustand e immer. Mai React né ui.
    files: ['src/editor/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', 'react/*', '@/ui/**', '@/io/**', '**/ui/**', '**/io/**'],
          message: 'src/editor non conosce React né src/ui.',
        }],
      }],
    },
  },
```

- [ ] **Step 4: Provare che la regola morde, poi rimuovere la sonda**

```bash
mkdir -p src/model && printf 'import { useState } from "react"\nexport const x = useState\n' > src/model/_probe.ts
pnpm lint; echo "exit=$?"
rm src/model/_probe.ts
pnpm lint && pnpm build && pnpm test
```

Atteso: il primo `pnpm lint` fallisce con il messaggio della regola su `_probe.ts` (`exit=1`); dopo la rimozione tutto verde.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml eslint.config.js src/components/ui
git commit -m "chore: zustand, immer, zod, playwright e componenti shadcn; regola ESLint degli strati"
```

---

### Task 2: Modello del documento — schema zod, chiavi naturali, serializzazione, migrazioni

**Files:**
- Create: `src/model/document.ts`, `src/model/migrations.ts`, `src/model/serialize.ts`
- Test: `src/model/document.test.ts`, `src/model/serialize.test.ts`

**Interfaces:**
- Produces: tutto ciò che è esportato qui sotto. In particolare `entityKey(entity)`, `createErDocument(name, id?)`, `DevDocument`, `ErDocument`, `toJson(doc)`, `parseDocument(text)`.

- [ ] **Step 1: Test dello schema**

`src/model/document.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createErDocument, DocumentSchema, entityKey, ErModelSchema, SCHEMA_VERSION } from "./document"

describe("document schema", () => {
  it("un documento ER nuovo è valido", () => {
    const doc = createErDocument("Prova", "doc-1")
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("entityKey usa schema.nome quando c'è lo schema", () => {
    expect(entityKey({ name: "orders" })).toBe("orders")
    expect(entityKey({ name: "orders", schema: "sales" })).toBe("sales.orders")
  })

  it("rifiuta un'entità la cui chiave non corrisponde a schema.nome", () => {
    const model = {
      entities: { wrong: { name: "orders", attributes: [] } },
      relationships: {},
    }
    expect(ErModelSchema.safeParse(model).success).toBe(false)
  })

  it("rifiuta un tipo di diagramma sconosciuto", () => {
    const doc = { ...createErDocument("x", "id"), diagram: { type: "mindmap" } }
    expect(DocumentSchema.safeParse(doc).success).toBe(false)
  })
})
```

- [ ] **Step 2: Eseguire, deve fallire**

Run: `pnpm vitest run src/model/document.test.ts`
Expected: FAIL, modulo `./document` inesistente.

- [ ] **Step 3: Scrivere `src/model/document.ts`**

```ts
import * as z from "zod"

/** Versione del formato su disco. Incrementare insieme a una migrazione in migrations.ts. */
export const SCHEMA_VERSION = 1

const Identifier = z.string().min(1)

export const CardinalitySchema = z.enum(["one", "zero-or-one", "many", "zero-or-many"])
export type Cardinality = z.infer<typeof CardinalitySchema>

export const AttributeSchema = z.object({
  name: Identifier,
  /** Tipo nel dialetto d'origine, come stringa. Nessun sistema di tipi unificato. */
  type: z.string(),
  primaryKey: z.boolean(),
  foreignKey: z.boolean(),
  nullable: z.boolean(),
  unique: z.boolean(),
})
export type Attribute = z.infer<typeof AttributeSchema>

export const EntitySchema = z.object({
  name: Identifier,
  schema: Identifier.optional(),
  attributes: z.array(AttributeSchema),
})
export type Entity = z.infer<typeof EntitySchema>

/** Chiave naturale dell'entità: `schema.nome`, o solo `nome`. È la chiave dei record model e view. */
export function entityKey(entity: Pick<Entity, "name" | "schema">): string {
  return entity.schema ? `${entity.schema}.${entity.name}` : entity.name
}

export const RelationshipEndSchema = z.object({
  /** Chiave dell'entità (entityKey). */
  entity: Identifier,
  /** Nomi degli attributi coinvolti; vuoto per relazioni disegnate a mano. */
  attributes: z.array(Identifier),
  cardinality: CardinalitySchema,
})
export type RelationshipEnd = z.infer<typeof RelationshipEndSchema>

export const RelationshipSchema = z.object({
  name: z.string().optional(),
  /** Lato della FK (figlia). */
  source: RelationshipEndSchema,
  /** Lato referenziato (padre). */
  target: RelationshipEndSchema,
  identifying: z.boolean(),
})
export type Relationship = z.infer<typeof RelationshipSchema>

export const ErModelSchema = z
  .object({
    entities: z.record(z.string(), EntitySchema),
    relationships: z.record(z.string(), RelationshipSchema),
  })
  .refine((m) => Object.entries(m.entities).every(([key, e]) => key === entityKey(e)), {
    message: "la chiave di ogni entità deve essere schema.nome",
    path: ["entities"],
  })
export type ErModel = z.infer<typeof ErModelSchema>

export const NodeViewSchema = z.object({ x: z.number(), y: z.number(), collapsed: z.boolean() })
export type NodeView = z.infer<typeof NodeViewSchema>

export const ErViewSchema = z.object({ nodes: z.record(z.string(), NodeViewSchema) })
export type ErView = z.infer<typeof ErViewSchema>

export const ErDiagramSchema = z.object({
  type: z.literal("er"),
  model: ErModelSchema,
  view: ErViewSchema,
})
export type ErDiagram = z.infer<typeof ErDiagramSchema>

/** Flowchart, class e sequence si aggiungono qui nei piani successivi. */
export const DiagramSchema = z.discriminatedUnion("type", [ErDiagramSchema])
export type Diagram = z.infer<typeof DiagramSchema>

export const DocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Identifier,
  name: z.string(),
  diagram: DiagramSchema,
})
/** "Document" collide con il DOM: il documento dell'app si chiama DevDocument. */
export type DevDocument = z.infer<typeof DocumentSchema>
export type ErDocument = DevDocument & { diagram: ErDiagram }

export function createErDocument(name: string, id: string = crypto.randomUUID()): ErDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: { type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } },
  }
}
```

- [ ] **Step 4: Eseguire, deve passare**

Run: `pnpm vitest run src/model/document.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Test di serializzazione e migrazioni**

`src/model/serialize.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createErDocument, SCHEMA_VERSION } from "./document"
import { migrateDocument } from "./migrations"
import { parseDocument, toJson } from "./serialize"

describe("toJson", () => {
  it("ordina le chiavi in modo stabile e termina con newline", () => {
    const doc = createErDocument("Prova", "doc-1")
    doc.diagram.model.entities.zeta = { name: "zeta", attributes: [] }
    doc.diagram.model.entities.alpha = { name: "alpha", attributes: [] }
    const json = toJson(doc)
    expect(json.indexOf('"alpha"')).toBeLessThan(json.indexOf('"zeta"'))
    expect(json.indexOf('"diagram"')).toBeLessThan(json.indexOf('"id"'))
    expect(json.endsWith("\n")).toBe(true)
  })

  it("il round trip restituisce un documento uguale", () => {
    const doc = createErDocument("Prova", "doc-1")
    doc.diagram.model.entities.users = {
      name: "users",
      attributes: [{ name: "id", type: "int", primaryKey: true, foreignKey: false, nullable: false, unique: false }],
    }
    doc.diagram.view.nodes.users = { x: 10, y: 20, collapsed: false }
    const result = parseDocument(toJson(doc))
    expect(result).toEqual({ ok: true, document: doc })
  })
})

describe("parseDocument", () => {
  it("segnala JSON non valido", () => {
    expect(parseDocument("{").ok).toBe(false)
  })

  it("rifiuta una versione più recente di quella supportata", () => {
    const doc = { ...createErDocument("x", "id"), schemaVersion: SCHEMA_VERSION + 1 }
    const result = parseDocument(JSON.stringify(doc))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/più recente/)
  })

  it("rifiuta un documento che non rispetta lo schema", () => {
    const result = parseDocument(JSON.stringify({ schemaVersion: 1, id: "x", name: "n", diagram: { type: "er" } }))
    expect(result.ok).toBe(false)
  })
})

describe("migrateDocument", () => {
  it("non tocca un documento già alla versione corrente", () => {
    const doc = createErDocument("x", "id")
    expect(migrateDocument(doc)).toEqual({ ok: true, value: doc })
  })

  it("rifiuta schemaVersion mancante", () => {
    expect(migrateDocument({ id: "x" }).ok).toBe(false)
  })
})
```

- [ ] **Step 6: Eseguire, deve fallire**

Run: `pnpm vitest run src/model/serialize.test.ts`
Expected: FAIL, moduli inesistenti.

- [ ] **Step 7: Scrivere `src/model/migrations.ts`**

```ts
import { SCHEMA_VERSION } from "./document"

type RawDocument = Record<string, unknown>
type Migration = (raw: RawDocument) => RawDocument

/** migrations[v] porta un documento dalla versione v alla v+1. Oggi vuota: la versione 1 è la prima. */
const migrations: readonly Migration[] = []

export type MigrateResult = { ok: true; value: unknown } | { ok: false; error: string }

/** Porta un documento grezzo (già JSON.parse) alla SCHEMA_VERSION corrente. Non valida: lo fa zod dopo. */
export function migrateDocument(raw: unknown): MigrateResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "il documento deve essere un oggetto JSON" }
  }
  let doc = raw as RawDocument
  const version = doc.schemaVersion
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "schemaVersion mancante o non valida" }
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: `schemaVersion ${version} più recente di quella supportata (${SCHEMA_VERSION})` }
  }
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = migrations[v]
    if (!step) return { ok: false, error: `manca la migrazione dalla versione ${v}` }
    doc = { ...step(doc), schemaVersion: v + 1 }
  }
  return { ok: true, value: doc }
}
```

- [ ] **Step 8: Scrivere `src/model/serialize.ts`**

```ts
import { DocumentSchema, type DevDocument } from "./document"
import { migrateDocument } from "./migrations"

export type ParseResult = { ok: true; document: DevDocument } | { ok: false; error: string }

/** Replacer di JSON.stringify: ordina alfabeticamente le chiavi di ogni oggetto, così il diff in git è leggibile. */
function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value
  const obj = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]))
}

export function toJson(doc: DevDocument): string {
  return JSON.stringify(doc, sortKeys, 2) + "\n"
}

/** Il file da disco è un confine di fiducia: JSON → migrazione → validazione zod. */
export function parseDocument(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `JSON non valido: ${(e as Error).message}` }
  }
  const migrated = migrateDocument(raw)
  if (!migrated.ok) return migrated
  const result = DocumentSchema.safeParse(migrated.value)
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  }
  return { ok: true, document: result.data }
}
```

- [ ] **Step 9: Eseguire tutto, deve passare**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/model
git commit -m "feat(model): schema zod del documento, chiavi naturali, serializzazione e migrazioni"
```

---

### Task 3: Validazione live dell'ER

**Files:**
- Create: `src/model/er/validate.ts`
- Test: `src/model/er/validate.test.ts`

**Interfaces:**
- Consumes: `ErModel` dal Task 2.
- Produces: `validateEr(model: ErModel): Issue[]`, `Issue { code, severity, message, entity?, relationship? }`, `IssueCode`.

- [ ] **Step 1: Test**

`src/model/er/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { Attribute, ErModel } from "../document"
import { validateEr } from "./validate"

const attr = (name: string, over: Partial<Attribute> = {}): Attribute => ({
  name, type: "int", primaryKey: false, foreignKey: false, nullable: false, unique: false, ...over,
})

const model = (over: Partial<ErModel>): ErModel => ({ entities: {}, relationships: {}, ...over })

describe("validateEr", () => {
  it("un modello corretto non ha issue", () => {
    const m = model({
      entities: {
        users: { name: "users", attributes: [attr("id", { primaryKey: true })] },
        posts: { name: "posts", attributes: [attr("id", { primaryKey: true }), attr("user_id", { foreignKey: true })] },
      },
      relationships: {
        posts_users: {
          source: { entity: "posts", attributes: ["user_id"], cardinality: "many" },
          target: { entity: "users", attributes: ["id"], cardinality: "one" },
          identifying: false,
        },
      },
    })
    expect(validateEr(m)).toEqual([])
  })

  it("segnala entità senza PK", () => {
    const issues = validateEr(model({ entities: { t: { name: "t", attributes: [attr("a")] } } }))
    expect(issues).toContainEqual(expect.objectContaining({ code: "entity-without-pk", entity: "t", severity: "warning" }))
  })

  it("segnala attributi duplicati come errore", () => {
    const issues = validateEr(model({ entities: { t: { name: "t", attributes: [attr("a", { primaryKey: true }), attr("a")] } } }))
    expect(issues).toContainEqual(expect.objectContaining({ code: "duplicate-attribute", entity: "t", severity: "error" }))
  })

  it("segnala FK senza relazione in uscita", () => {
    const issues = validateEr(model({ entities: { t: { name: "t", attributes: [attr("id", { primaryKey: true }), attr("x_id", { foreignKey: true })] } } }))
    expect(issues).toContainEqual(expect.objectContaining({ code: "fk-without-relationship", entity: "t" }))
  })

  it("segnala relazioni verso entità o attributi inesistenti", () => {
    const issues = validateEr(model({
      entities: { a: { name: "a", attributes: [attr("id", { primaryKey: true })] } },
      relationships: {
        r: {
          source: { entity: "a", attributes: ["missing"], cardinality: "many" },
          target: { entity: "ghost", attributes: [], cardinality: "one" },
          identifying: false,
        },
      },
    }))
    const dangling = issues.filter((i) => i.code === "dangling-relationship" && i.relationship === "r")
    expect(dangling).toHaveLength(2)
  })

  it("segnala nomi che differiscono solo per maiuscole", () => {
    const issues = validateEr(model({
      entities: {
        User: { name: "User", attributes: [attr("id", { primaryKey: true })] },
        user: { name: "user", attributes: [attr("id", { primaryKey: true })] },
      },
    }))
    expect(issues).toContainEqual(expect.objectContaining({ code: "entity-name-clash" }))
  })
})
```

- [ ] **Step 2: Eseguire, deve fallire**

Run: `pnpm vitest run src/model/er/validate.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Step 3: Scrivere `src/model/er/validate.ts`**

```ts
import type { ErModel } from "../document"

export type IssueCode =
  | "entity-without-pk"
  | "duplicate-attribute"
  | "fk-without-relationship"
  | "dangling-relationship"
  | "entity-name-clash"

export type IssueSeverity = "error" | "warning"

export interface Issue {
  code: IssueCode
  severity: IssueSeverity
  message: string
  /** Chiave dell'entità coinvolta, se c'è. */
  entity?: string
  /** Chiave della relazione coinvolta, se c'è. */
  relationship?: string
}

/** Validazione live del modello ER. Funzione pura: nessun accesso allo store. */
export function validateEr(model: ErModel): Issue[] {
  const issues: Issue[] = []
  const byLowerKey = new Map<string, string>()

  for (const [key, entity] of Object.entries(model.entities)) {
    const lower = key.toLowerCase()
    const clash = byLowerKey.get(lower)
    if (clash) {
      issues.push({ code: "entity-name-clash", severity: "warning", entity: key, message: `"${key}" e "${clash}" differiscono solo per maiuscole` })
    } else {
      byLowerKey.set(lower, key)
    }

    if (!entity.attributes.some((a) => a.primaryKey)) {
      issues.push({ code: "entity-without-pk", severity: "warning", entity: key, message: `"${key}" non ha una primary key` })
    }

    const seen = new Set<string>()
    for (const a of entity.attributes) {
      if (seen.has(a.name)) {
        issues.push({ code: "duplicate-attribute", severity: "error", entity: key, message: `attributo "${a.name}" duplicato in "${key}"` })
      }
      seen.add(a.name)
    }

    const hasOutgoing = Object.values(model.relationships).some((r) => r.source.entity === key)
    for (const a of entity.attributes) {
      if (a.foreignKey && !hasOutgoing) {
        issues.push({ code: "fk-without-relationship", severity: "warning", entity: key, message: `"${key}.${a.name}" è FK ma nessuna relazione parte da "${key}"` })
      }
    }
  }

  for (const [key, rel] of Object.entries(model.relationships)) {
    for (const end of [rel.source, rel.target]) {
      const entity = model.entities[end.entity]
      if (!entity) {
        issues.push({ code: "dangling-relationship", severity: "error", relationship: key, message: `relazione "${key}": entità "${end.entity}" inesistente` })
        continue
      }
      for (const name of end.attributes) {
        if (!entity.attributes.some((a) => a.name === name)) {
          issues.push({ code: "dangling-relationship", severity: "error", relationship: key, message: `relazione "${key}": attributo "${end.entity}.${name}" inesistente` })
        }
      }
    }
  }

  return issues
}
```

- [ ] **Step 4: Eseguire, deve passare**

Run: `pnpm vitest run src/model/er/validate.test.ts && pnpm lint`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add src/model/er
git commit -m "feat(model): validazione live dell'ER"
```

---

### Task 4: Geometria — dimensioni entità, routing ortogonale, crow's foot, viewport

**Files:**
- Create: `src/editor/er-geometry.ts`, `src/editor/edge-routing.ts`, `src/editor/viewport.ts`
- Test: `src/editor/er-geometry.test.ts`, `src/editor/edge-routing.test.ts`, `src/editor/viewport.test.ts`

**Interfaces:**
- Consumes: `Attribute`, `Entity`, `NodeView`, `Relationship`, `Cardinality`, `entityKey` (Task 2).
- Produces: `FONT_SIZE, CHAR_W, HEADER_H, ROW_H, PAD_X, MIN_W, GRID, Point, Rect, Size, snap, attributeLines, entitySize, entityRect, rectsBounds, rectsIntersect`; `routeEdge, pathFromPoints, crowsFootPath, edgeGeometry, EdgeGeometry`; `Viewport, IDENTITY, MIN_SCALE, MAX_SCALE, screenToWorld, worldToScreen, panBy, zoomAt, fitToRect, transformAttr, visibleWorldRect`.

- [ ] **Step 1: Test geometria entità**

`src/editor/er-geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { Attribute, Entity } from "@/model/document"
import { attributeLines, CHAR_W, entityRect, entitySize, HEADER_H, MIN_W, PAD_X, rectsBounds, rectsIntersect, ROW_H, snap } from "./er-geometry"

const attr = (name: string, type: string, over: Partial<Attribute> = {}): Attribute => ({
  name, type, primaryKey: false, foreignKey: false, nullable: false, unique: false, ...over,
})

describe("attributeLines", () => {
  it("allinea marker, nome e tipo in colonne", () => {
    const lines = attributeLines([attr("id", "bigint", { primaryKey: true }), attr("customer_id", "int", { foreignKey: true, nullable: true }), attr("email", "varchar(255)", { unique: true })])
    expect(lines).toEqual([
      "PK id           bigint",
      "FK customer_id  int?",
      "   email        varchar(255) U",
    ])
  })
})

describe("entitySize", () => {
  const entity: Entity = { name: "t", attributes: [attr("id", "int", { primaryKey: true }), attr("name", "varchar(255)")] }

  it("collassata: solo l'header, larghezza minima", () => {
    expect(entitySize(entity, true)).toEqual({ w: MIN_W, h: HEADER_H })
  })

  it("espansa: una riga per attributo, larghezza dal testo più lungo arrotondata alla griglia", () => {
    const longest = Math.max(...attributeLines(entity.attributes).map((l) => l.length))
    const { w, h } = entitySize(entity, false)
    expect(h).toBe(HEADER_H + 2 * ROW_H + 6)
    expect(w).toBeGreaterThanOrEqual(longest * CHAR_W + 2 * PAD_X)
    expect(w % 10).toBe(0)
  })

  it("entityRect combina view e dimensioni", () => {
    expect(entityRect(entity, { x: 10, y: 20, collapsed: true })).toEqual({ x: 10, y: 20, w: MIN_W, h: HEADER_H })
  })
})

describe("rect helpers", () => {
  it("snap arrotonda alla griglia", () => {
    expect(snap(14)).toBe(10)
    expect(snap(15)).toBe(20)
  })
  it("rectsBounds racchiude tutti i rettangoli e null se vuoto", () => {
    expect(rectsBounds([])).toBeNull()
    expect(rectsBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 10, h: 10 }])).toEqual({ x: 0, y: -5, w: 30, h: 15 })
  })
  it("rectsIntersect", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 10, h: 10 })).toBe(false)
  })
})
```

- [ ] **Step 2: Scrivere `src/editor/er-geometry.ts`**

```ts
import { entityKey, type Attribute, type Entity, type NodeView } from "@/model/document"

export const FONT_SIZE = 13
/** JetBrains Mono ha avanzamento 600/1000 em: larghezza carattere = 0,6 × font size. Nessuna misura nel DOM. */
export const CHAR_W = FONT_SIZE * 0.6
export const HEADER_H = 28
export const ROW_H = 22
export const PAD_X = 10
export const MIN_W = 160
export const GRID = 10

export interface Point { x: number; y: number }
export interface Size { w: number; h: number }
export interface Rect extends Point, Size {}

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}

export function attributeMarker(a: Attribute): string {
  if (a.primaryKey && a.foreignKey) return "PF"
  if (a.primaryKey) return "PK"
  if (a.foreignKey) return "FK"
  return "  "
}

export function attributeTypeText(a: Attribute): string {
  return `${a.type}${a.nullable ? "?" : ""}${a.unique ? " U" : ""}`
}

/** Una riga per attributo, colonne allineate con spazi: il font è monospace, il layout è deterministico. */
export function attributeLines(attributes: readonly Attribute[]): string[] {
  const nameW = Math.max(0, ...attributes.map((a) => a.name.length))
  return attributes.map((a) => `${attributeMarker(a)} ${a.name.padEnd(nameW)}  ${attributeTypeText(a)}`)
}

export function entitySize(entity: Entity, collapsed: boolean): Size {
  const lines = collapsed ? [] : attributeLines(entity.attributes)
  const chars = Math.max(entityKey(entity).length, ...lines.map((l) => l.length))
  const w = Math.max(MIN_W, Math.ceil((chars * CHAR_W + 2 * PAD_X) / GRID) * GRID)
  const h = HEADER_H + lines.length * ROW_H + (lines.length ? 6 : 0)
  return { w, h }
}

export function entityRect(entity: Entity, view: NodeView): Rect {
  return { x: view.x, y: view.y, ...entitySize(entity, view.collapsed) }
}

export function rectsBounds(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const x1 = Math.min(...rects.map((r) => r.x))
  const y1 = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.w))
  const y2 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}
```

- [ ] **Step 3: Test routing e crow's foot**

`src/editor/edge-routing.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { Relationship } from "@/model/document"
import { crowsFootPath, edgeGeometry, pathFromPoints, routeEdge } from "./edge-routing"

const rel: Relationship = {
  source: { entity: "a", attributes: [], cardinality: "many" },
  target: { entity: "b", attributes: [], cardinality: "one" },
  identifying: false,
}

describe("routeEdge", () => {
  it("entità affiancate: esce da destra, entra da sinistra, due pieghe", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 100, w: 100, h: 50 })
    expect(r.sourceDir).toEqual({ x: 1, y: 0 })
    expect(r.targetDir).toEqual({ x: -1, y: 0 })
    expect(r.points).toEqual([{ x: 100, y: 25 }, { x: 200, y: 25 }, { x: 200, y: 125 }, { x: 300, y: 125 }])
  })

  it("stessa altezza: segmento dritto", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 })
    expect(r.points).toHaveLength(2)
  })

  it("entità impilate: esce dal basso, entra dall'alto", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 20, y: 300, w: 100, h: 50 })
    expect(r.sourceDir).toEqual({ x: 0, y: 1 })
    expect(r.targetDir).toEqual({ x: 0, y: -1 })
    expect(r.points[0]).toEqual({ x: 50, y: 50 })
  })

  it("relazione su se stessa: anello a destra e rientro dall'alto", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 }
    const r = routeEdge(a, a)
    expect(r.points).toHaveLength(5)
    expect(r.targetDir).toEqual({ x: 0, y: -1 })
  })
})

describe("crowsFootPath", () => {
  it("one: una sola barra", () => {
    expect(crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "one")).toBe("M12 -6 L12 6")
  })
  it("many: tre linee più la barra", () => {
    const d = crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "many")
    expect(d.split("M")).toHaveLength(5)
  })
  it("zero-or-one: barra più cerchio", () => {
    expect(crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "zero-or-one")).toContain("a4 4 0 1 0 8 0")
  })
})

describe("edgeGeometry", () => {
  it("produce path, marker ed etichetta", () => {
    const g = edgeGeometry({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 }, rel)
    expect(g.d).toBe(pathFromPoints([{ x: 100, y: 25 }, { x: 300, y: 25 }]))
    expect(g.label).toEqual({ x: 200, y: 25 })
    expect(g.sourceMarker).toContain("M")
    expect(g.targetMarker).toBe("M288 31 L288 19")
  })
})
```

- [ ] **Step 4: Scrivere `src/editor/edge-routing.ts`**

```ts
import type { Cardinality, Relationship } from "@/model/document"
import type { Point, Rect } from "./er-geometry"

export interface Dir { x: -1 | 0 | 1; y: -1 | 0 | 1 }
export interface EdgeRoute { points: Point[]; sourceDir: Dir; targetDir: Dir }

const RIGHT: Dir = { x: 1, y: 0 }
const LEFT: Dir = { x: -1, y: 0 }
const UP: Dir = { x: 0, y: -1 }
const DOWN: Dir = { x: 0, y: 1 }
const SELF_LOOP_OFFSET = 30

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** Routing ortogonale con al più due pieghe, senza evitamento ostacoli (spec §4.3). */
export function routeEdge(a: Rect, b: Rect): EdgeRoute {
  if (sameRect(a, b)) return selfLoop(a)
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const p0 = { x: dx >= 0 ? a.x + a.w : a.x, y: ca.y }
    const p3 = { x: dx >= 0 ? b.x : b.x + b.w, y: cb.y }
    const midX = (p0.x + p3.x) / 2
    const points = p0.y === p3.y ? [p0, p3] : [p0, { x: midX, y: p0.y }, { x: midX, y: p3.y }, p3]
    return { points, sourceDir: dx >= 0 ? RIGHT : LEFT, targetDir: dx >= 0 ? LEFT : RIGHT }
  }
  const p0 = { x: ca.x, y: dy >= 0 ? a.y + a.h : a.y }
  const p3 = { x: cb.x, y: dy >= 0 ? b.y : b.y + b.h }
  const midY = (p0.y + p3.y) / 2
  const points = p0.x === p3.x ? [p0, p3] : [p0, { x: p0.x, y: midY }, { x: p3.x, y: midY }, p3]
  return { points, sourceDir: dy >= 0 ? DOWN : UP, targetDir: dy >= 0 ? UP : DOWN }
}

function selfLoop(a: Rect): EdgeRoute {
  const o = SELF_LOOP_OFFSET
  const right = a.x + a.w
  const midY = a.y + a.h / 2
  const midX = a.x + a.w / 2
  return {
    points: [{ x: right, y: midY }, { x: right + o, y: midY }, { x: right + o, y: a.y - o }, { x: midX, y: a.y - o }, { x: midX, y: a.y }],
    sourceDir: RIGHT,
    targetDir: UP,
  }
}

export function pathFromPoints(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
}

/**
 * Marker crow's foot. `point` sta sul bordo dell'entità, `dir` è il versore che esce dall'entità lungo l'edge.
 * Distanze lungo l'edge: barra a 12, punta del piede a 16, seconda barra a 20, cerchio a 24.
 */
export function crowsFootPath(point: Point, dir: Dir, cardinality: Cardinality): string {
  const px = -dir.y
  const py = dir.x
  const at = (d: number, s: number): Point => ({ x: point.x + dir.x * d + px * s, y: point.y + dir.y * d + py * s })
  const seg = (a: Point, b: Point): string => `M${a.x} ${a.y} L${b.x} ${b.y}`
  const many = cardinality === "many" || cardinality === "zero-or-many"
  const optional = cardinality.startsWith("zero")
  const parts: string[] = []
  if (many) {
    const tip = at(16, 0)
    for (const s of [-6, 0, 6]) parts.push(seg(tip, at(0, s)))
  } else {
    parts.push(seg(at(12, -6), at(12, 6)))
  }
  if (optional) {
    const c = at(24, 0)
    const r = 4
    parts.push(`M${c.x - r} ${c.y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`)
  } else if (many) {
    parts.push(seg(at(20, -6), at(20, 6)))
  }
  return parts.join(" ")
}

export interface EdgeGeometry {
  d: string
  sourceMarker: string
  targetMarker: string
  /** Punto medio del segmento centrale, per l'etichetta. */
  label: Point
}

/** Tutta la geometria di un edge da due rettangoli e la relazione. Usata sia da React sia dagli aggiornamenti imperativi. */
export function edgeGeometry(source: Rect, target: Rect, rel: Relationship): EdgeGeometry {
  const route = routeEdge(source, target)
  const pts = route.points
  const mid = Math.floor((pts.length - 1) / 2)
  const a = pts[mid]!
  const b = pts[mid + 1]!
  return {
    d: pathFromPoints(pts),
    sourceMarker: crowsFootPath(pts[0]!, route.sourceDir, rel.source.cardinality),
    targetMarker: crowsFootPath(pts[pts.length - 1]!, route.targetDir, rel.target.cardinality),
    label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  }
}
```

- [ ] **Step 5: Test viewport**

`src/editor/viewport.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { fitToRect, IDENTITY, MAX_SCALE, panBy, screenToWorld, transformAttr, visibleWorldRect, worldToScreen, zoomAt } from "./viewport"

describe("viewport", () => {
  it("screen ↔ world sono inverse", () => {
    const vp = { x: 100, y: 50, scale: 2 }
    const p = { x: 37, y: -12 }
    expect(screenToWorld(vp, worldToScreen(vp, p))).toEqual(p)
  })

  it("zoomAt tiene fermo il punto sotto il cursore", () => {
    const vp = { x: 100, y: 50, scale: 1 }
    const screen = { x: 400, y: 300 }
    const before = screenToWorld(vp, screen)
    const after = screenToWorld(zoomAt(vp, screen, 2), screen)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it("zoomAt rispetta i limiti", () => {
    expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE)
  })

  it("fitToRect centra il contenuto e non supera scala 1", () => {
    const vp = fitToRect({ x: 0, y: 0, w: 100, h: 100 }, { w: 1000, h: 800 })
    expect(vp.scale).toBe(1)
    expect(vp.x).toBe(450)
    expect(vp.y).toBe(350)
    expect(fitToRect(null, { w: 1000, h: 800 })).toEqual(IDENTITY)
  })

  it("panBy e transformAttr", () => {
    expect(panBy(IDENTITY, 10, -5)).toEqual({ x: 10, y: -5, scale: 1 })
    expect(transformAttr({ x: 10, y: -5, scale: 2 })).toBe("translate(10 -5) scale(2)")
  })

  it("visibleWorldRect", () => {
    expect(visibleWorldRect({ x: 100, y: 0, scale: 2 }, { w: 400, h: 200 })).toEqual({ x: -50, y: 0, w: 200, h: 100 })
  })
})
```

- [ ] **Step 6: Scrivere `src/editor/viewport.ts`**

```ts
import type { Point, Rect, Size } from "./er-geometry"

/** screen = world × scale + (x, y). */
export interface Viewport { x: number; y: number; scale: number }

export const IDENTITY: Viewport = { x: 0, y: 0, scale: 1 }
export const MIN_SCALE = 0.1
export const MAX_SCALE = 4

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

/** Zoom attorno a un punto dello schermo: il punto del mondo sotto il cursore resta fermo. */
export function zoomAt(vp: Viewport, screen: Point, factor: number): Viewport {
  const scale = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE)
  const world = screenToWorld(vp, screen)
  return { scale, x: screen.x - world.x * scale, y: screen.y - world.y * scale }
}

/** Inquadra `bounds` nel canvas. Non ingrandisce oltre 1: un diagramma piccolo resta a grandezza naturale. */
export function fitToRect(bounds: Rect | null, size: Size, padding = 40): Viewport {
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) return IDENTITY
  const scale = clamp(Math.min((size.w - 2 * padding) / bounds.w, (size.h - 2 * padding) / bounds.h), MIN_SCALE, 1)
  return {
    scale,
    x: (size.w - bounds.w * scale) / 2 - bounds.x * scale,
    y: (size.h - bounds.h * scale) / 2 - bounds.y * scale,
  }
}

export function transformAttr(vp: Viewport): string {
  return `translate(${vp.x} ${vp.y}) scale(${vp.scale})`
}

export function visibleWorldRect(vp: Viewport, size: Size): Rect {
  const tl = screenToWorld(vp, { x: 0, y: 0 })
  return { x: tl.x, y: tl.y, w: size.w / vp.scale, h: size.h / vp.scale }
}
```

- [ ] **Step 7: Eseguire tutto**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS. Se un valore atteso dei test di routing/crow's foot non coincide con l'implementazione, correggere l'implementazione (la spec dei numeri è nei commenti di `crowsFootPath`), non il test.

- [ ] **Step 8: Commit**

```bash
git add src/editor
git commit -m "feat(editor): geometria entità, routing ortogonale con crow's foot e viewport"
```

---

### Task 5: Store del documento con undo a patch e comandi ER

**Files:**
- Create: `src/editor/er-access.ts`, `src/editor/document-store.ts`, `src/editor/commands/er.ts`
- Test: `src/editor/document-store.test.ts`, `src/editor/commands/er.test.ts`

**Interfaces:**
- Consumes: Task 2 (tipi), `snap`, `Point` (Task 4).
- Produces: `erDiagram(doc): ErDiagram`; `documentStore` (zustand vanilla) con `{ doc, past, future, dispatch(recipe): boolean, undo(), redo(), load(doc) }`, `Recipe = (draft: DevDocument) => void`, `HISTORY_LIMIT`; comandi: `uniqueKey, DEFAULT_ATTRIBUTE, addEntity(entities, at) → { key, recipe }, renameEntity(key, name, schema?) → Recipe | null, moveNodes(keys, dx, dy) → Recipe | null, setCollapsed(key, collapsed), addAttribute(key), updateAttribute(key, index, patch) → Recipe | null, removeAttribute(key, index), moveAttribute(key, from, to) → Recipe | null, addRelationship(relationships, sourceKey, targetKey) → { key, recipe }, updateRelationship(key, mutate), deleteItems(entityKeys, relationshipKeys) → Recipe | null, duplicateEntities(model, keys) → { keys, recipe }`.

- [ ] **Step 1: `src/editor/er-access.ts`**

```ts
import type { DevDocument, ErDiagram } from "@/model/document"

/** Oggi il documento è sempre ER; il guard resta perché la union crescerà. */
export function erDiagram(doc: DevDocument): ErDiagram {
  if (doc.diagram.type !== "er") throw new Error(`atteso un diagramma ER, trovato ${doc.diagram.type}`)
  return doc.diagram
}
```

- [ ] **Step 2: Test dello store**

`src/editor/document-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument } from "@/model/document"
import { documentStore, HISTORY_LIMIT } from "./document-store"
import { erDiagram } from "./er-access"

const addEntity = (key: string) => (draft: Parameters<typeof erDiagram>[0]) => {
  const d = erDiagram(draft)
  d.model.entities[key] = { name: key, attributes: [] }
  d.view.nodes[key] = { x: 0, y: 0, collapsed: false }
}

describe("documentStore", () => {
  beforeEach(() => documentStore.getState().load(createErDocument("t", "t")))

  it("dispatch applica la modifica e la mette nella pila undo", () => {
    expect(documentStore.getState().dispatch(addEntity("a"))).toBe(true)
    expect(Object.keys(erDiagram(documentStore.getState().doc).model.entities)).toEqual(["a"])
    expect(documentStore.getState().past).toHaveLength(1)
  })

  it("un comando senza effetto non entra nella storia", () => {
    expect(documentStore.getState().dispatch(() => {})).toBe(false)
    expect(documentStore.getState().past).toHaveLength(0)
  })

  it("undo e redo ripristinano il documento", () => {
    const initial = documentStore.getState().doc
    documentStore.getState().dispatch(addEntity("a"))
    const afterA = documentStore.getState().doc
    documentStore.getState().dispatch(addEntity("b"))
    documentStore.getState().undo()
    expect(documentStore.getState().doc).toEqual(afterA)
    documentStore.getState().undo()
    expect(documentStore.getState().doc).toEqual(initial)
    documentStore.getState().redo()
    expect(documentStore.getState().doc).toEqual(afterA)
  })

  it("un nuovo comando svuota il redo", () => {
    documentStore.getState().dispatch(addEntity("a"))
    documentStore.getState().undo()
    documentStore.getState().dispatch(addEntity("c"))
    expect(documentStore.getState().future).toHaveLength(0)
  })

  it("la storia è limitata", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) documentStore.getState().dispatch(addEntity(`e${i}`))
    expect(documentStore.getState().past).toHaveLength(HISTORY_LIMIT)
  })

  it("il documento non è mutabile dall'esterno", () => {
    documentStore.getState().dispatch(addEntity("a"))
    const doc = documentStore.getState().doc
    expect(() => { (doc as { name: string }).name = "x" }).toThrow()
  })
})
```

- [ ] **Step 3: Scrivere `src/editor/document-store.ts`**

```ts
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer"
import { createStore } from "zustand/vanilla"
import { createErDocument, type DevDocument } from "@/model/document"

enablePatches()

/** Un comando è una recipe Immer sul documento. Produce patch e patch inverse: l'undo non usa snapshot. */
export type Recipe = (draft: DevDocument) => void

interface HistoryEntry { patches: Patch[]; inverse: Patch[] }

export const HISTORY_LIMIT = 200

export interface DocumentState {
  doc: DevDocument
  past: HistoryEntry[]
  future: HistoryEntry[]
  /** Applica il comando. Ritorna false se non ha prodotto patch (no-op). */
  dispatch: (recipe: Recipe) => boolean
  undo: () => void
  redo: () => void
  /** Sostituisce il documento e azzera la storia (apertura, nuovo, stress). */
  load: (doc: DevDocument) => void
}

export const documentStore = createStore<DocumentState>()((set, get) => ({
  doc: createErDocument("Senza titolo"),
  past: [],
  future: [],
  dispatch: (recipe) => {
    const [doc, patches, inverse] = produceWithPatches(get().doc, recipe)
    if (patches.length === 0) return false
    set((s) => ({ doc, past: [...s.past.slice(-(HISTORY_LIMIT - 1)), { patches, inverse }], future: [] }))
    return true
  },
  undo: () => {
    const { doc, past, future } = get()
    const entry = past[past.length - 1]
    if (!entry) return
    set({ doc: applyPatches(doc, entry.inverse), past: past.slice(0, -1), future: [entry, ...future] })
  },
  redo: () => {
    const { doc, past, future } = get()
    const [entry, ...rest] = future
    if (!entry) return
    set({ doc: applyPatches(doc, entry.patches), past: [...past, entry], future: rest })
  },
  load: (doc) => {
    // produce senza modifiche: congela il documento in profondità come farebbe il primo dispatch.
    const [frozen] = produceWithPatches(doc, () => {})
    set({ doc: frozen, past: [], future: [] })
  },
}))
```

Nota: `applyPatches` su uno stato congelato restituisce un nuovo stato congelato; il test "non è mutabile" verifica il congelamento dopo `load` + `dispatch`.

- [ ] **Step 4: Eseguire i test dello store**

Run: `pnpm vitest run src/editor/document-store.test.ts`
Expected: PASS (6 test). Se il test del congelamento fallisce dopo `load`, forzare con `import { freeze } from "immer"` e `freeze(doc, true)` al posto della produce vuota.

- [ ] **Step 5: Test dei comandi**

`src/editor/commands/er.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument, type Attribute } from "@/model/document"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import {
  addAttribute, addEntity, addRelationship, deleteItems, duplicateEntities, moveAttribute, moveNodes,
  removeAttribute, renameEntity, setCollapsed, uniqueKey, updateAttribute, updateRelationship,
} from "./er"

const state = () => documentStore.getState()
const er = () => erDiagram(state().doc)
const attr = (name: string, over: Partial<Attribute> = {}): Attribute => ({
  name, type: "int", primaryKey: false, foreignKey: false, nullable: false, unique: false, ...over,
})

describe("comandi ER", () => {
  beforeEach(() => {
    const doc = createErDocument("t", "t")
    doc.diagram.model.entities.users = { name: "users", attributes: [attr("id", { primaryKey: true }), attr("email")] }
    doc.diagram.view.nodes.users = { x: 0, y: 0, collapsed: false }
    doc.diagram.model.entities.posts = { name: "posts", attributes: [attr("id", { primaryKey: true }), attr("user_id", { foreignKey: true })] }
    doc.diagram.view.nodes.posts = { x: 300, y: 0, collapsed: false }
    doc.diagram.model.relationships.posts_users = {
      source: { entity: "posts", attributes: ["user_id"], cardinality: "many" },
      target: { entity: "users", attributes: ["id"], cardinality: "one" },
      identifying: false,
    }
    state().load(doc)
  })

  it("uniqueKey aggiunge un suffisso numerico", () => {
    expect(uniqueKey({ a: 1 }, "b")).toBe("b")
    expect(uniqueKey({ a: 1, a_2: 1 }, "a")).toBe("a_3")
  })

  it("addEntity crea entità e view con posizione snappata e un attributo id PK", () => {
    const { key, recipe } = addEntity(er().model.entities, { x: 13, y: 27 })
    state().dispatch(recipe)
    expect(key).toBe("entity")
    expect(er().view.nodes.entity).toEqual({ x: 10, y: 30, collapsed: false })
    expect(er().model.entities.entity?.attributes[0]).toMatchObject({ name: "id", primaryKey: true })
  })

  it("renameEntity rinomina chiave, view e relazioni", () => {
    state().dispatch(renameEntity("users", "accounts")!)
    expect(er().model.entities.accounts?.name).toBe("accounts")
    expect(er().model.entities.users).toBeUndefined()
    expect(er().view.nodes.accounts).toBeDefined()
    expect(er().model.relationships.posts_users?.target.entity).toBe("accounts")
  })

  it("renameEntity con schema cambia la chiave in schema.nome", () => {
    state().dispatch(renameEntity("users", "users", "auth")!)
    expect(er().model.entities["auth.users"]).toMatchObject({ name: "users", schema: "auth" })
  })

  it("renameEntity rifiuta nome vuoto e collisione", () => {
    expect(renameEntity("users", "  ")).toBeNull()
    expect(state().dispatch(renameEntity("users", "posts")!)).toBe(false)
  })

  it("moveNodes sposta con snap e ignora spostamento nullo", () => {
    expect(moveNodes(["users"], 0, 0)).toBeNull()
    state().dispatch(moveNodes(["users", "posts"], 23, -7)!)
    expect(er().view.nodes.users).toMatchObject({ x: 20, y: -10 })
    expect(er().view.nodes.posts).toMatchObject({ x: 320, y: -10 })
  })

  it("setCollapsed", () => {
    state().dispatch(setCollapsed("users", true))
    expect(er().view.nodes.users?.collapsed).toBe(true)
  })

  it("attributi: add con nome unico, update, move, remove", () => {
    state().dispatch(addAttribute("users"))
    state().dispatch(addAttribute("users"))
    expect(er().model.entities.users?.attributes.map((a) => a.name)).toEqual(["id", "email", "attribute", "attribute_2"])
    state().dispatch(updateAttribute("users", 1, { name: "mail", nullable: true })!)
    expect(er().model.entities.users?.attributes[1]).toMatchObject({ name: "mail", nullable: true })
    expect(updateAttribute("users", 1, { name: " " })).toBeNull()
    state().dispatch(moveAttribute("users", 3, 0)!)
    expect(er().model.entities.users?.attributes[0]?.name).toBe("attribute_2")
    state().dispatch(removeAttribute("users", 0))
    expect(er().model.entities.users?.attributes).toHaveLength(3)
  })

  it("addRelationship con chiave derivata e default many→one", () => {
    const { key, recipe } = addRelationship(er().model.relationships, "posts", "users")
    state().dispatch(recipe)
    expect(key).toBe("posts_users_2")
    expect(er().model.relationships[key]).toEqual({
      source: { entity: "posts", attributes: [], cardinality: "many" },
      target: { entity: "users", attributes: [], cardinality: "one" },
      identifying: false,
    })
  })

  it("updateRelationship", () => {
    state().dispatch(updateRelationship("posts_users", (r) => { r.identifying = true; r.name = "scrive" }))
    expect(er().model.relationships.posts_users).toMatchObject({ identifying: true, name: "scrive" })
  })

  it("deleteItems rimuove entità, view e relazioni collegate", () => {
    expect(deleteItems([], [])).toBeNull()
    state().dispatch(deleteItems(["users"], [])!)
    expect(er().model.entities.users).toBeUndefined()
    expect(er().view.nodes.users).toBeUndefined()
    expect(er().model.relationships.posts_users).toBeUndefined()
  })

  it("duplicateEntities copia con nome _copy, offset e senza relazioni", () => {
    const { keys, recipe } = duplicateEntities(er().model, ["users"])
    state().dispatch(recipe)
    expect(keys).toEqual(["users_copy"])
    expect(er().model.entities.users_copy?.attributes).toEqual(er().model.entities.users?.attributes)
    expect(er().view.nodes.users_copy).toEqual({ x: 20, y: 20, collapsed: false })
    expect(Object.keys(er().model.relationships)).toEqual(["posts_users"])
  })
})
```

- [ ] **Step 6: Scrivere `src/editor/commands/er.ts`**

```ts
import { entityKey, type Attribute, type Entity, type ErModel, type Relationship } from "@/model/document"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { snap, type Point } from "../er-geometry"

export const DEFAULT_ATTRIBUTE: Attribute = { name: "id", type: "int", primaryKey: true, foreignKey: false, nullable: false, unique: false }
const NEW_ATTRIBUTE: Attribute = { name: "attribute", type: "varchar", primaryKey: false, foreignKey: false, nullable: false, unique: false }
const DUPLICATE_OFFSET = 20

/** `base` se libera, altrimenti `base_2`, `base_3`, … */
export function uniqueKey(existing: Record<string, unknown>, base: string): string {
  if (!(base in existing)) return base
  let i = 2
  while (`${base}_${i}` in existing) i++
  return `${base}_${i}`
}

function uniqueAttributeName(attributes: readonly Attribute[], base: string): string {
  return uniqueKey(Object.fromEntries(attributes.map((a) => [a.name, true])), base)
}

export function addEntity(entities: Record<string, unknown>, at: Point): { key: string; recipe: Recipe } {
  const key = uniqueKey(entities, "entity")
  return {
    key,
    recipe: (draft) => {
      const d = erDiagram(draft)
      d.model.entities[key] = { name: key, attributes: [{ ...DEFAULT_ATTRIBUTE }] }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

/** Rinomina: la chiave naturale cambia, quindi si spostano entità, view e riferimenti delle relazioni. Collisione = no-op. */
export function renameEntity(key: string, name: string, schema?: string): Recipe | null {
  const newName = name.trim()
  if (!newName) return null
  const newSchema = schema?.trim() || undefined
  return (draft) => {
    const d = erDiagram(draft)
    const entity = d.model.entities[key]
    if (!entity) return
    const newKey = entityKey({ name: newName, schema: newSchema })
    if (newKey !== key && newKey in d.model.entities) return
    if (newKey === key) {
      entity.name = newName
      entity.schema = newSchema
      return
    }
    const moved: Entity = { ...entity, name: newName, schema: newSchema }
    delete d.model.entities[key]
    d.model.entities[newKey] = moved
    const view = d.view.nodes[key]
    if (view) {
      delete d.view.nodes[key]
      d.view.nodes[newKey] = { ...view }
    }
    for (const rel of Object.values(d.model.relationships)) {
      if (rel.source.entity === key) rel.source.entity = newKey
      if (rel.target.entity === key) rel.target.entity = newKey
    }
  }
}

export function moveNodes(keys: readonly string[], dx: number, dy: number): Recipe | null {
  if (dx === 0 && dy === 0) return null
  return (draft) => {
    const d = erDiagram(draft)
    for (const key of keys) {
      const node = d.view.nodes[key]
      if (!node) continue
      node.x = snap(node.x + dx)
      node.y = snap(node.y + dy)
    }
  }
}

export function setCollapsed(key: string, collapsed: boolean): Recipe {
  return (draft) => {
    const node = erDiagram(draft).view.nodes[key]
    if (node) node.collapsed = collapsed
  }
}

export function addAttribute(key: string): Recipe {
  return (draft) => {
    const entity = erDiagram(draft).model.entities[key]
    if (!entity) return
    entity.attributes.push({ ...NEW_ATTRIBUTE, name: uniqueAttributeName(entity.attributes, NEW_ATTRIBUTE.name) })
  }
}

export function updateAttribute(key: string, index: number, patch: Partial<Attribute>): Recipe | null {
  const name = patch.name?.trim()
  if (patch.name !== undefined && !name) return null
  return (draft) => {
    const attribute = erDiagram(draft).model.entities[key]?.attributes[index]
    if (!attribute) return
    Object.assign(attribute, patch, name !== undefined ? { name } : {})
  }
}

export function removeAttribute(key: string, index: number): Recipe {
  return (draft) => {
    erDiagram(draft).model.entities[key]?.attributes.splice(index, 1)
  }
}

export function moveAttribute(key: string, from: number, to: number): Recipe | null {
  if (from === to) return null
  return (draft) => {
    const attributes = erDiagram(draft).model.entities[key]?.attributes
    if (!attributes || from < 0 || to < 0 || from >= attributes.length || to >= attributes.length) return
    const [item] = attributes.splice(from, 1)
    attributes.splice(to, 0, item!)
  }
}

export function addRelationship(relationships: Record<string, unknown>, sourceKey: string, targetKey: string): { key: string; recipe: Recipe } {
  const key = uniqueKey(relationships, `${sourceKey}_${targetKey}`)
  return {
    key,
    recipe: (draft) => {
      erDiagram(draft).model.relationships[key] = {
        source: { entity: sourceKey, attributes: [], cardinality: "many" },
        target: { entity: targetKey, attributes: [], cardinality: "one" },
        identifying: false,
      }
    },
  }
}

export function updateRelationship(key: string, mutate: (rel: Relationship) => void): Recipe {
  return (draft) => {
    const rel = erDiagram(draft).model.relationships[key]
    if (rel) mutate(rel)
  }
}

export function deleteItems(entityKeys: readonly string[], relationshipKeys: readonly string[]): Recipe | null {
  if (entityKeys.length === 0 && relationshipKeys.length === 0) return null
  const entities = new Set(entityKeys)
  return (draft) => {
    const d = erDiagram(draft)
    for (const key of relationshipKeys) delete d.model.relationships[key]
    for (const [key, rel] of Object.entries(d.model.relationships)) {
      if (entities.has(rel.source.entity) || entities.has(rel.target.entity)) delete d.model.relationships[key]
    }
    for (const key of entityKeys) {
      delete d.model.entities[key]
      delete d.view.nodes[key]
    }
  }
}

/** Copia le entità con suffisso `_copy` e offset; le relazioni non si duplicano. */
export function duplicateEntities(model: ErModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const taken: Record<string, true> = Object.fromEntries(Object.keys(model.entities).map((k) => [k, true]))
  const plan: { from: string; to: string; name: string }[] = []
  for (const from of keys) {
    const entity = model.entities[from]
    if (!entity) continue
    let i = 1
    let name = `${entity.name}_copy`
    while (entityKey({ name, schema: entity.schema }) in taken) name = `${entity.name}_copy${++i}`
    const to = entityKey({ name, schema: entity.schema })
    taken[to] = true
    plan.push({ from, to, name })
  }
  return {
    keys: plan.map((p) => p.to),
    recipe: (draft) => {
      const d = erDiagram(draft)
      for (const { from, to, name } of plan) {
        const entity = d.model.entities[from]
        const view = d.view.nodes[from]
        if (!entity) continue
        d.model.entities[to] = { ...entity, name, attributes: entity.attributes.map((a) => ({ ...a })) }
        d.view.nodes[to] = { x: (view?.x ?? 0) + DUPLICATE_OFFSET, y: (view?.y ?? 0) + DUPLICATE_OFFSET, collapsed: view?.collapsed ?? false }
      }
    },
  }
}
```

- [ ] **Step 7: Eseguire tutto**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS. Attenzione a `renameEntity`: si copia l'entità con lo spread **prima** di cancellare la vecchia chiave e si assegna un oggetto nuovo, mai lo stesso draft in due punti dell'albero.

- [ ] **Step 8: Commit**

```bash
git add src/editor
git commit -m "feat(editor): store del documento con undo a patch e comandi ER"
```

---

### Task 6: Store di sessione e state machine delle interazioni

**Files:**
- Create: `src/editor/session-store.ts`, `src/editor/interaction.ts`
- Test: `src/editor/interaction.test.ts`

**Interfaces:**
- Consumes: `Viewport`, `IDENTITY` (Task 4), `Point`, `Rect`, `Size`.
- Produces: `Tool = "select" | "entity" | "relation"`, `SelectionKind`, `selId(kind, key)`, `parseSelId(id)`, `selectedKeys(selection, kind)`, `sessionStore` con `{ viewport, selection: ReadonlySet<string>, tool, editing: { key } | null, canvasSize: Size, setViewport, setSelection, setTool, setEditing, setCanvasSize }`; `Hit`, `Mode`, `IDLE`, `PointerInfo`, `InteractionEvent`, `Effect`, `Context`, `reduce(mode, event, ctx) → { mode, effects }`.

- [ ] **Step 1: Scrivere `src/editor/session-store.ts`**

```ts
import { createStore } from "zustand/vanilla"
import type { Size } from "./er-geometry"
import { IDENTITY, type Viewport } from "./viewport"

export type Tool = "select" | "entity" | "relation"
export type SelectionKind = "entity" | "relationship"

/** Gli id di selezione hanno un prefisso di tipo: entità e relazioni possono avere la stessa chiave. */
export const selId = (kind: SelectionKind, key: string): string => `${kind}:${key}`

export function parseSelId(id: string): { kind: SelectionKind; key: string } {
  const i = id.indexOf(":")
  return { kind: id.slice(0, i) as SelectionKind, key: id.slice(i + 1) }
}

export function selectedKeys(selection: ReadonlySet<string>, kind: SelectionKind): string[] {
  return [...selection].map(parseSelId).filter((s) => s.kind === kind).map((s) => s.key)
}

/** Stato transitorio: non entra nell'undo né nel file (spec §4.2). */
export interface SessionState {
  viewport: Viewport
  selection: ReadonlySet<string>
  tool: Tool
  /** Entità con il nome in editing inline. */
  editing: { key: string } | null
  canvasSize: Size
  setViewport: (viewport: Viewport) => void
  setSelection: (ids: Iterable<string>) => void
  setTool: (tool: Tool) => void
  setEditing: (editing: { key: string } | null) => void
  setCanvasSize: (size: Size) => void
}

export const sessionStore = createStore<SessionState>()((set) => ({
  viewport: IDENTITY,
  selection: new Set<string>(),
  tool: "select",
  editing: null,
  canvasSize: { w: 0, h: 0 },
  setViewport: (viewport) => set({ viewport }),
  setSelection: (ids) => set({ selection: new Set(ids) }),
  setTool: (tool) => set({ tool }),
  setEditing: (editing) => set({ editing }),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
}))
```

- [ ] **Step 2: Test del reducer**

`src/editor/interaction.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { IDLE, reduce, type Context, type InteractionEvent, type Mode, type PointerInfo } from "./interaction"
import { selId } from "./session-store"

const info = (over: Partial<PointerInfo>): PointerInfo => ({
  screen: { x: 0, y: 0 }, world: { x: 0, y: 0 }, button: 0, shift: false, alt: false, hit: { kind: "canvas" }, ...over,
})
const ctx = (over: Partial<Context> = {}): Context => ({ tool: "select", selection: new Set(), ...over })
const down = (i: Partial<PointerInfo>, spaceHeld = false): InteractionEvent => ({ type: "down", info: info(i), spaceHeld })
const move = (i: Partial<PointerInfo>): InteractionEvent => ({ type: "move", info: info(i) })
const up = (i: Partial<PointerInfo>): InteractionEvent => ({ type: "up", info: info(i) })

function run(events: InteractionEvent[], c: Context = ctx()) {
  let mode: Mode = IDLE
  const effects = []
  for (const e of events) {
    const r = reduce(mode, e, c)
    mode = r.mode
    effects.push(...r.effects)
  }
  return { mode, effects }
}

describe("reduce", () => {
  it("tasto centrale o spazio: pan", () => {
    const r = run([down({ button: 1, screen: { x: 10, y: 10 } }), move({ screen: { x: 15, y: 12 } }), up({})])
    expect(r.effects).toEqual([{ type: "pan-by", dx: 5, dy: 2 }])
    expect(r.mode).toEqual(IDLE)
    expect(run([down({}, true)]).mode.type).toBe("pan")
  })

  it("click su entità la seleziona e avvia il drag; il rilascio senza movimento non committa", () => {
    const r = run([down({ hit: { kind: "entity", key: "a" }, world: { x: 5, y: 5 } }), up({ world: { x: 5, y: 5 } })])
    expect(r.effects).toEqual([{ type: "select", ids: [selId("entity", "a")] }])
  })

  it("drag di un'entità: anteprima a ogni move, un solo commit al rilascio", () => {
    const r = run([
      down({ hit: { kind: "entity", key: "a" }, world: { x: 0, y: 0 } }),
      move({ world: { x: 10, y: 5 } }),
      move({ world: { x: 30, y: 15 } }),
      up({ world: { x: 30, y: 15 } }),
    ])
    expect(r.effects).toEqual([
      { type: "select", ids: [selId("entity", "a")] },
      { type: "preview-drag", keys: ["a"], dx: 10, dy: 5 },
      { type: "preview-drag", keys: ["a"], dx: 30, dy: 15 },
      { type: "commit-drag", keys: ["a"], dx: 30, dy: 15 },
    ])
  })

  it("drag di un'entità già selezionata trascina tutta la selezione senza riselezionare", () => {
    const selection = new Set([selId("entity", "a"), selId("entity", "b"), selId("relationship", "r")])
    const r = run([down({ hit: { kind: "entity", key: "a" } }), move({ world: { x: 1, y: 0 } })], ctx({ selection }))
    expect(r.effects).toEqual([{ type: "preview-drag", keys: ["a", "b"], dx: 1, dy: 0 }])
  })

  it("shift+click aggiunge o toglie dalla selezione", () => {
    const selection = new Set([selId("entity", "a")])
    expect(run([down({ hit: { kind: "entity", key: "b" }, shift: true })], ctx({ selection })).effects[0])
      .toEqual({ type: "select", ids: [selId("entity", "a"), selId("entity", "b")] })
    const r = run([down({ hit: { kind: "entity", key: "a" }, shift: true })], ctx({ selection }))
    expect(r.effects).toEqual([{ type: "select", ids: [] }])
    expect(r.mode).toEqual(IDLE)
  })

  it("click su relazione la seleziona", () => {
    expect(run([down({ hit: { kind: "relationship", key: "r" } })]).effects).toEqual([{ type: "select", ids: [selId("relationship", "r")] }])
  })

  it("marquee sul canvas: svuota la selezione, anteprima, commit con rettangolo normalizzato", () => {
    const r = run([down({ world: { x: 100, y: 100 } }), move({ world: { x: 40, y: 130 } }), up({ world: { x: 40, y: 130 } })])
    expect(r.effects).toEqual([
      { type: "select", ids: [] },
      { type: "preview-marquee", rect: { x: 40, y: 100, w: 60, h: 30 } },
      { type: "preview-marquee", rect: null },
      { type: "commit-marquee", rect: { x: 40, y: 100, w: 60, h: 30 }, additive: false },
    ])
  })

  it("marquee minuscolo è un click a vuoto: nessun commit", () => {
    const r = run([down({ world: { x: 0, y: 0 } }), up({ world: { x: 1, y: 1 } })])
    expect(r.effects.filter((e) => e.type === "commit-marquee")).toEqual([])
  })

  it("tool entity: click sul canvas crea l'entità", () => {
    const r = run([down({ world: { x: 12, y: 8 } })], ctx({ tool: "entity" }))
    expect(r.effects).toEqual([{ type: "create-entity", at: { x: 12, y: 8 } }])
    expect(r.mode).toEqual(IDLE)
  })

  it("tool relation: da entità a entità committa la connessione", () => {
    const r = run([
      down({ hit: { kind: "entity", key: "a" }, world: { x: 0, y: 0 } }),
      move({ world: { x: 50, y: 50 } }),
      up({ hit: { kind: "entity", key: "b" }, world: { x: 50, y: 50 } }),
    ], ctx({ tool: "relation" }))
    expect(r.effects).toEqual([
      { type: "preview-connect", source: "a", to: { x: 0, y: 0 } },
      { type: "preview-connect", source: "a", to: { x: 50, y: 50 } },
      { type: "preview-connect", source: "a", to: null },
      { type: "commit-connect", source: "a", target: "b" },
    ])
  })

  it("tool relation rilasciato sul canvas: solo pulizia dell'anteprima", () => {
    const r = run([down({ hit: { kind: "entity", key: "a" } }), up({})], ctx({ tool: "relation" }))
    expect(r.effects.at(-1)).toEqual({ type: "preview-connect", source: "a", to: null })
  })

  it("cancel durante il drag riporta i nodi a zero", () => {
    const r = run([down({ hit: { kind: "entity", key: "a" } }), move({ world: { x: 9, y: 9 } }), { type: "cancel" }])
    expect(r.effects.at(-1)).toEqual({ type: "preview-drag", keys: ["a"], dx: 0, dy: 0 })
    expect(r.mode).toEqual(IDLE)
  })
})
```

- [ ] **Step 3: Eseguire, deve fallire**

Run: `pnpm vitest run src/editor/interaction.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Step 4: Scrivere `src/editor/interaction.ts`**

```ts
import type { Point, Rect } from "./er-geometry"
import { selId, selectedKeys, type Tool } from "./session-store"

export type Hit = { kind: "entity"; key: string } | { kind: "relationship"; key: string } | { kind: "canvas" }

/** Stato della macchina: uno solo alla volta sul root SVG (spec §4.3). */
export type Mode =
  | { type: "idle" }
  | { type: "pan"; last: Point }
  | { type: "drag"; keys: string[]; start: Point; moved: boolean }
  | { type: "marquee"; start: Point; additive: boolean }
  | { type: "connect"; source: string }

export const IDLE: Mode = { type: "idle" }

export interface PointerInfo {
  screen: Point
  world: Point
  button: 0 | 1 | 2
  shift: boolean
  alt: boolean
  hit: Hit
}

export type InteractionEvent =
  | { type: "down"; info: PointerInfo; spaceHeld: boolean }
  | { type: "move"; info: PointerInfo }
  | { type: "up"; info: PointerInfo }
  | { type: "cancel" }

/** Gli effetti sono dati: li esegue l'hook della UI. Il reducer resta puro e testabile. */
export type Effect =
  | { type: "select"; ids: string[] }
  | { type: "pan-by"; dx: number; dy: number }
  | { type: "preview-drag"; keys: string[]; dx: number; dy: number }
  | { type: "commit-drag"; keys: string[]; dx: number; dy: number }
  | { type: "preview-marquee"; rect: Rect | null }
  | { type: "commit-marquee"; rect: Rect; additive: boolean }
  | { type: "preview-connect"; source: string; to: Point | null }
  | { type: "commit-connect"; source: string; target: string }
  | { type: "create-entity"; at: Point }

export interface Context {
  tool: Tool
  selection: ReadonlySet<string>
}

export interface Step { mode: Mode; effects: Effect[] }

const MARQUEE_MIN = 3

function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

export function reduce(mode: Mode, event: InteractionEvent, ctx: Context): Step {
  switch (event.type) {
    case "down":
      return onDown(event.info, event.spaceHeld, ctx)
    case "move":
      return onMove(mode, event.info)
    case "up":
      return onUp(mode, event.info)
    case "cancel":
      return onCancel(mode)
  }
}

function onDown(info: PointerInfo, spaceHeld: boolean, ctx: Context): Step {
  if (info.button === 1 || spaceHeld) return { mode: { type: "pan", last: info.screen }, effects: [] }
  if (info.button !== 0) return { mode: IDLE, effects: [] }

  if (ctx.tool === "entity") {
    if (info.hit.kind === "canvas") return { mode: IDLE, effects: [{ type: "create-entity", at: info.world }] }
  }
  if (ctx.tool === "relation") {
    if (info.hit.kind === "entity") {
      return { mode: { type: "connect", source: info.hit.key }, effects: [{ type: "preview-connect", source: info.hit.key, to: info.world }] }
    }
    return { mode: IDLE, effects: [] }
  }

  switch (info.hit.kind) {
    case "entity": {
      const id = selId("entity", info.hit.key)
      if (ctx.selection.has(id)) {
        if (info.shift) return { mode: IDLE, effects: [{ type: "select", ids: [...ctx.selection].filter((s) => s !== id) }] }
        return { mode: { type: "drag", keys: selectedKeys(ctx.selection, "entity"), start: info.world, moved: false }, effects: [] }
      }
      const ids = info.shift ? [...ctx.selection, id] : [id]
      return {
        mode: { type: "drag", keys: selectedKeys(new Set(ids), "entity"), start: info.world, moved: false },
        effects: [{ type: "select", ids }],
      }
    }
    case "relationship": {
      const id = selId("relationship", info.hit.key)
      const ids = info.shift
        ? ctx.selection.has(id) ? [...ctx.selection].filter((s) => s !== id) : [...ctx.selection, id]
        : [id]
      return { mode: IDLE, effects: [{ type: "select", ids }] }
    }
    case "canvas":
      return {
        mode: { type: "marquee", start: info.world, additive: info.shift },
        effects: info.shift ? [] : [{ type: "select", ids: [] }],
      }
  }
}

function onMove(mode: Mode, info: PointerInfo): Step {
  switch (mode.type) {
    case "idle":
      return { mode, effects: [] }
    case "pan":
      return {
        mode: { type: "pan", last: info.screen },
        effects: [{ type: "pan-by", dx: info.screen.x - mode.last.x, dy: info.screen.y - mode.last.y }],
      }
    case "drag": {
      const dx = info.world.x - mode.start.x
      const dy = info.world.y - mode.start.y
      return { mode: { ...mode, moved: true }, effects: [{ type: "preview-drag", keys: mode.keys, dx, dy }] }
    }
    case "marquee":
      return { mode, effects: [{ type: "preview-marquee", rect: normalizeRect(mode.start, info.world) }] }
    case "connect":
      return { mode, effects: [{ type: "preview-connect", source: mode.source, to: info.world }] }
  }
}

function onUp(mode: Mode, info: PointerInfo): Step {
  switch (mode.type) {
    case "idle":
    case "pan":
      return { mode: IDLE, effects: [] }
    case "drag": {
      if (!mode.moved) return { mode: IDLE, effects: [] }
      const dx = info.world.x - mode.start.x
      const dy = info.world.y - mode.start.y
      return { mode: IDLE, effects: [{ type: "commit-drag", keys: mode.keys, dx, dy }] }
    }
    case "marquee": {
      const rect = normalizeRect(mode.start, info.world)
      const effects: Effect[] = [{ type: "preview-marquee", rect: null }]
      if (rect.w >= MARQUEE_MIN || rect.h >= MARQUEE_MIN) effects.push({ type: "commit-marquee", rect, additive: mode.additive })
      return { mode: IDLE, effects }
    }
    case "connect": {
      const effects: Effect[] = [{ type: "preview-connect", source: mode.source, to: null }]
      if (info.hit.kind === "entity") effects.push({ type: "commit-connect", source: mode.source, target: info.hit.key })
      return { mode: IDLE, effects }
    }
  }
}

function onCancel(mode: Mode): Step {
  switch (mode.type) {
    case "drag":
      return { mode: IDLE, effects: [{ type: "preview-drag", keys: mode.keys, dx: 0, dy: 0 }] }
    case "marquee":
      return { mode: IDLE, effects: [{ type: "preview-marquee", rect: null }] }
    case "connect":
      return { mode: IDLE, effects: [{ type: "preview-connect", source: mode.source, to: null }] }
    default:
      return { mode: IDLE, effects: [] }
  }
}
```

- [ ] **Step 5: Eseguire tutto**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS (13 test nuovi).

- [ ] **Step 6: Commit**

```bash
git add src/editor
git commit -m "feat(editor): store di sessione e state machine pura delle interazioni"
```

---

### Task 7: Renderer SVG statico — nodi, edge, viewport imperativo, modalità stress

**Files:**
- Create: `src/ui/canvas/dom-registry.ts`, `src/ui/canvas/ViewportGroup.tsx`, `src/ui/canvas/EntityNode.tsx`, `src/ui/canvas/RelationshipEdge.tsx`, `src/ui/canvas/layers.tsx`, `src/ui/canvas/Canvas.tsx`, `src/ui/App.tsx`, `src/perf/stress.ts`
- Modify: `src/main.tsx`, `src/index.css`
- Delete: `src/App.tsx` (sostituito da `src/ui/App.tsx`)
- Test: `src/ui/canvas/render.test.tsx`

**Interfaces:**
- Consumes: `documentStore`, `erDiagram`, `sessionStore`, `selId`, geometria (Task 4-6).
- Produces: `registerNode(key, el)`, `registerEdge(key, el)`, `setNodePosition(key, x, y)`, `setEdgeGeometry(key, geo)`; componenti `EntityNode` / `EntityNodeView`, `RelationshipEdge` / `RelationshipEdgeView`, `NodesLayer`, `EdgesLayer`, `ViewportGroup`, `Canvas` (accetta `children` da inserire nel gruppo viewport, usati dal Task 8 per l'overlay); attributi DOM `data-node-id`, `data-node-header`, `data-edge-id`, `data-edge-hit|line|source|target|label`; `buildStressDocument(n)`.

- [ ] **Step 1: `src/ui/canvas/dom-registry.ts`**

```ts
import type { EdgeGeometry } from "@/editor/edge-routing"

/**
 * Elementi SVG per chiave. Serve al drag: le posizioni si scrivono sul DOM senza passare da React,
 * e il documento riceve un solo comando al rilascio (spec §4.2-4.3, decisioni dello spike).
 */
const nodes = new Map<string, SVGGElement>()
const edges = new Map<string, SVGGElement>()

export function registerNode(key: string, el: SVGGElement | null): void {
  if (el) nodes.set(key, el)
  else nodes.delete(key)
}

export function registerEdge(key: string, el: SVGGElement | null): void {
  if (el) edges.set(key, el)
  else edges.delete(key)
}

export function setNodePosition(key: string, x: number, y: number): void {
  nodes.get(key)?.setAttribute("transform", `translate(${x} ${y})`)
}

export function setEdgeGeometry(key: string, geo: EdgeGeometry): void {
  const g = edges.get(key)
  if (!g) return
  g.querySelector("[data-edge-hit]")?.setAttribute("d", geo.d)
  g.querySelector("[data-edge-line]")?.setAttribute("d", geo.d)
  g.querySelector("[data-edge-source]")?.setAttribute("d", geo.sourceMarker)
  g.querySelector("[data-edge-target]")?.setAttribute("d", geo.targetMarker)
  const label = g.querySelector("[data-edge-label]")
  if (label) {
    label.setAttribute("x", String(geo.label.x))
    label.setAttribute("y", String(geo.label.y - 6))
  }
}
```

- [ ] **Step 2: `src/ui/canvas/ViewportGroup.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from "react"
import { sessionStore } from "@/editor/session-store"
import { transformAttr } from "@/editor/viewport"

/** Il transform del viewport si applica dal DOM, fuori dal render: pan e zoom non ri-renderizzano l'albero. */
export function ViewportGroup({ children }: { children: ReactNode }) {
  const ref = useRef<SVGGElement>(null)
  useEffect(() => {
    const apply = () => ref.current?.setAttribute("transform", transformAttr(sessionStore.getState().viewport))
    apply()
    return sessionStore.subscribe((s, prev) => {
      if (s.viewport !== prev.viewport) apply()
    })
  }, [])
  return <g ref={ref} data-viewport>{children}</g>
}
```

- [ ] **Step 3: `src/ui/canvas/EntityNode.tsx`**

```tsx
import { memo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { attributeLines, entitySize, HEADER_H, PAD_X, ROW_H } from "@/editor/er-geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { entityKey, type Entity, type NodeView } from "@/model/document"
import { registerNode } from "./dom-registry"

interface Props {
  nodeKey: string
  entity: Entity
  view: NodeView
  selected: boolean
}

/** Vista pura e memoizzata: ri-renderizza solo se cambiano entità, view o selezione di questo nodo. */
export const EntityNodeView = memo(function EntityNodeView({ nodeKey, entity, view, selected }: Props) {
  const { w, h } = entitySize(entity, view.collapsed)
  const lines = view.collapsed ? [] : attributeLines(entity.attributes)
  return (
    <g
      data-node-id={nodeKey}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(nodeKey, el)
        return () => registerNode(nodeKey, null)
      }}
    >
      <rect width={w} height={h} rx={4} fill="var(--card)" stroke={selected ? "var(--primary)" : "var(--border)"} strokeWidth={selected ? 2 : 1} />
      <rect data-node-header width={w} height={HEADER_H} rx={4} fill="var(--muted)" />
      {lines.length > 0 && <line x1={0} y1={HEADER_H} x2={w} y2={HEADER_H} stroke="var(--border)" />}
      <text data-node-header x={w / 2} y={HEADER_H / 2} textAnchor="middle" dominantBaseline="central" fontWeight={600} fill="var(--foreground)">
        {entityKey(entity)}
      </text>
      {lines.map((line, i) => (
        <text key={i} x={PAD_X} y={HEADER_H + 3 + ROW_H * i + ROW_H / 2} dominantBaseline="central" fill="var(--foreground)" xmlSpace="preserve">
          {line}
        </text>
      ))}
    </g>
  )
})

/** Componente connesso: un selettore per nodo, così un cambiamento altrove non lo tocca. */
export function EntityNode({ nodeKey }: { nodeKey: string }) {
  const entity = useStore(documentStore, (s) => erDiagram(s.doc).model.entities[nodeKey])
  const view = useStore(documentStore, (s) => erDiagram(s.doc).view.nodes[nodeKey])
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("entity", nodeKey)))
  if (!entity || !view) return null
  return <EntityNodeView nodeKey={nodeKey} entity={entity} view={view} selected={selected} />
}
```

- [ ] **Step 4: `src/ui/canvas/RelationshipEdge.tsx`**

```tsx
import { memo } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { edgeGeometry } from "@/editor/edge-routing"
import { erDiagram } from "@/editor/er-access"
import { entityRect, type Rect } from "@/editor/er-geometry"
import { selId, sessionStore } from "@/editor/session-store"
import type { Relationship } from "@/model/document"
import { registerEdge } from "./dom-registry"

interface Props {
  edgeKey: string
  relationship: Relationship
  source: Rect
  target: Rect
  selected: boolean
}

export const RelationshipEdgeView = memo(function RelationshipEdgeView({ edgeKey, relationship, source, target, selected }: Props) {
  const geo = edgeGeometry(source, target, relationship)
  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  return (
    <g
      data-edge-id={edgeKey}
      ref={(el) => {
        registerEdge(edgeKey, el)
        return () => registerEdge(edgeKey, null)
      }}
    >
      <path data-edge-hit d={geo.d} fill="none" stroke="transparent" strokeWidth={12} />
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray={relationship.identifying ? undefined : "6 4"} />
      <path data-edge-source d={geo.sourceMarker} fill="none" stroke={stroke} strokeWidth={1.5} />
      <path data-edge-target d={geo.targetMarker} fill="none" stroke={stroke} strokeWidth={1.5} />
      {relationship.name && (
        <text data-edge-label x={geo.label.x} y={geo.label.y - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {relationship.name}
        </text>
      )}
    </g>
  )
})

/** Rect di un'entità dallo store; useShallow evita un riferimento nuovo a ogni chiamata. */
function useEntityRect(key: string | undefined): Rect | null {
  return useStore(
    documentStore,
    useShallow((s) => {
      if (!key) return null
      const d = erDiagram(s.doc)
      const entity = d.model.entities[key]
      const view = d.view.nodes[key]
      return entity && view ? entityRect(entity, view) : null
    }),
  )
}

export function RelationshipEdge({ edgeKey }: { edgeKey: string }) {
  const relationship = useStore(documentStore, (s) => erDiagram(s.doc).model.relationships[edgeKey])
  const source = useEntityRect(relationship?.source.entity)
  const target = useEntityRect(relationship?.target.entity)
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("relationship", edgeKey)))
  if (!relationship || !source || !target) return null
  return <RelationshipEdgeView edgeKey={edgeKey} relationship={relationship} source={source} target={target} selected={selected} />
}
```

- [ ] **Step 5: `src/ui/canvas/layers.tsx`**

```tsx
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { EntityNode } from "./EntityNode"
import { RelationshipEdge } from "./RelationshipEdge"

export function NodesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(erDiagram(s.doc).model.entities)))
  return (
    <g data-layer="nodes">
      {keys.map((key) => <EntityNode key={key} nodeKey={key} />)}
    </g>
  )
}

export function EdgesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(erDiagram(s.doc).model.relationships)))
  return (
    <g data-layer="edges">
      {keys.map((key) => <RelationshipEdge key={key} edgeKey={key} />)}
    </g>
  )
}
```

- [ ] **Step 6: `src/ui/canvas/Canvas.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from "react"
import { FONT_SIZE, GRID } from "@/editor/er-geometry"
import { sessionStore } from "@/editor/session-store"
import { EdgesLayer, NodesLayer } from "./layers"
import { ViewportGroup } from "./ViewportGroup"

const GRID_EXTENT = 50_000

/** Un solo <svg>. `children` finisce nel gruppo viewport sopra i nodi (overlay, Task 8). */
export function Canvas({ children }: { children?: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) sessionStore.getState().setCanvasSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <svg ref={svgRef} className="dd-canvas h-full w-full" fontFamily="var(--font-mono)" fontSize={FONT_SIZE}>
        <defs>
          <pattern id="dd-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="var(--border)" strokeWidth={0.5} />
          </pattern>
        </defs>
        <ViewportGroup>
          <rect data-canvas x={-GRID_EXTENT} y={-GRID_EXTENT} width={2 * GRID_EXTENT} height={2 * GRID_EXTENT} fill="url(#dd-grid)" />
          <EdgesLayer />
          <NodesLayer />
          {children}
        </ViewportGroup>
      </svg>
    </div>
  )
}
```

Nota per il Task 8: l'hook delle interazioni riceverà `svgRef`; qui basta il ref e il `ResizeObserver`.

- [ ] **Step 7: `src/ui/App.tsx`, `src/perf/stress.ts`, `src/main.tsx`, `src/index.css`**

`src/ui/App.tsx` (il layout completo arriva nei Task 9-10):

```tsx
import { Canvas } from "./canvas/Canvas"

export default function App() {
  return (
    <div className="h-screen bg-background text-foreground">
      <Canvas />
    </div>
  )
}
```

`src/perf/stress.ts`:

```ts
import { createErDocument, type Attribute, type ErDocument } from "@/model/document"

const ATTRIBUTES_PER_ENTITY = 12
const COL_GAP = 260
const ROW_GAP = 340

function attribute(j: number): Attribute {
  return {
    name: j === 0 ? "id" : `col_${j}`,
    type: j === 0 ? "bigint" : j % 3 === 0 ? "varchar(255)" : "int",
    primaryKey: j === 0,
    foreignKey: j === 1,
    nullable: j % 2 === 1,
    unique: j === 2,
  }
}

/** Documento sintetico a N entità da 12 attributi, con ~2 relazioni per entità (vicina a sinistra e sopra). */
export function buildStressDocument(n: number): ErDocument {
  const doc = createErDocument(`Stress ${n}`, "stress")
  const cols = Math.ceil(Math.sqrt(n))
  for (let i = 0; i < n; i++) {
    const key = `t${i}`
    doc.diagram.model.entities[key] = { name: key, attributes: Array.from({ length: ATTRIBUTES_PER_ENTITY }, (_, j) => attribute(j)) }
    doc.diagram.view.nodes[key] = { x: (i % cols) * COL_GAP, y: Math.floor(i / cols) * ROW_GAP, collapsed: false }
    if (i > 0) {
      doc.diagram.model.relationships[`r${i}`] = {
        source: { entity: key, attributes: ["col_1"], cardinality: "many" },
        target: { entity: `t${i - 1}`, attributes: ["id"], cardinality: "one" },
        identifying: false,
      }
    }
    if (i >= cols) {
      doc.diagram.model.relationships[`c${i}`] = {
        source: { entity: key, attributes: ["col_1"], cardinality: "zero-or-many" },
        target: { entity: `t${i - cols}`, attributes: ["id"], cardinality: "one" },
        identifying: true,
      }
    }
  }
  return doc
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { documentStore } from '@/editor/document-store'
import { buildStressDocument } from '@/perf/stress'
import App from '@/ui/App'

// `?stress=N` carica un documento sintetico: serve alla misura FPS (Task 11) e alla prova manuale.
const stress = Number(new URLSearchParams(location.search).get('stress'))
if (Number.isInteger(stress) && stress > 0) documentStore.getState().load(buildStressDocument(stress))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/index.css`, in coda a `@layer base`:

```css
  .dd-canvas {
    display: block;
    user-select: none;
    touch-action: none;
  }
```

Eliminare `src/App.tsx`.

- [ ] **Step 8: Test di rendering delle viste pure**

`src/ui/canvas/render.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { entitySize, HEADER_H, MIN_W } from "@/editor/er-geometry"
import type { Entity, Relationship } from "@/model/document"
import { EntityNodeView } from "./EntityNode"
import { RelationshipEdgeView } from "./RelationshipEdge"

const entity: Entity = {
  name: "users",
  schema: "auth",
  attributes: [
    { name: "id", type: "bigint", primaryKey: true, foreignKey: false, nullable: false, unique: false },
    { name: "email", type: "varchar(255)", primaryKey: false, foreignKey: false, nullable: false, unique: true },
  ],
}

describe("EntityNodeView", () => {
  it("disegna header, titolo qualificato e una riga per attributo", () => {
    const html = renderToStaticMarkup(<EntityNodeView nodeKey="auth.users" entity={entity} view={{ x: 10, y: 20, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="auth.users"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain(">auth.users<")
    expect(html).toContain("PK id     bigint")
    expect(html).toContain(`width="${entitySize(entity, false).w}"`)
  })

  it("collassata: solo header, larghezza minima, bordo primario se selezionata", () => {
    const html = renderToStaticMarkup(<EntityNodeView nodeKey="auth.users" entity={entity} view={{ x: 0, y: 0, collapsed: true }} selected />)
    expect(html).toContain(`width="${MIN_W}" height="${HEADER_H}"`)
    expect(html).not.toContain("PK id")
    expect(html).toContain('stroke="var(--primary)"')
  })
})

describe("RelationshipEdgeView", () => {
  const rel: Relationship = {
    name: "scrive",
    source: { entity: "a", attributes: [], cardinality: "many" },
    target: { entity: "b", attributes: [], cardinality: "zero-or-one" },
    identifying: false,
  }
  it("disegna linea tratteggiata, marker ed etichetta", () => {
    const html = renderToStaticMarkup(<RelationshipEdgeView edgeKey="r" relationship={rel} source={{ x: 0, y: 0, w: 100, h: 50 }} target={{ x: 300, y: 0, w: 100, h: 50 }} selected={false} />)
    expect(html).toContain('data-edge-id="r"')
    expect(html).toContain('stroke-dasharray="6 4"')
    expect(html).toContain("data-edge-source")
    expect(html).toContain(">scrive<")
  })
  it("identificante: linea continua", () => {
    const html = renderToStaticMarkup(<RelationshipEdgeView edgeKey="r" relationship={{ ...rel, identifying: true }} source={{ x: 0, y: 0, w: 100, h: 50 }} target={{ x: 300, y: 0, w: 100, h: 50 }} selected={false} />)
    expect(html).not.toContain("stroke-dasharray")
  })
})
```

- [ ] **Step 9: Eseguire, poi provare nel browser**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS. Se `renderToStaticMarkup` serializza `xmlSpace` in modo diverso, verificare che il test cerchi il testo della riga, non l'attributo.

Run: `pnpm dev` e aprire `http://localhost:5173/?stress=12`.
Expected: 12 entità in griglia con attributi allineati, edge ortogonali con marker crow's foot, tratteggiati i non identificanti; nessun errore in console. Fermare il server.

- [ ] **Step 10: Commit**

```bash
git add -A src
git commit -m "feat(ui): renderer SVG di entità e relazioni con viewport imperativo e modalità stress"
```

---

### Task 8: Interazioni — pan, zoom, drag, marquee, connessione, creazione

**Files:**
- Create: `src/ui/canvas/use-canvas-interaction.ts`, `src/ui/canvas/Overlay.tsx`
- Modify: `src/ui/canvas/dom-registry.ts` (overlay), `src/ui/canvas/Canvas.tsx` (hook + overlay), `src/ui/App.tsx`

**Interfaces:**
- Consumes: `reduce`, `Effect`, `Mode`, `IDLE`, `PointerInfo` (Task 6); `documentStore`, comandi (Task 5); `sessionStore`; `setNodePosition`, `setEdgeGeometry` (Task 7); `zoomAt`, `panBy`, `screenToWorld`; `entityRect`, `rectsIntersect`, `snap`.
- Produces: `registerOverlay(el)`, `showMarquee(rect | null)`, `showConnect(from, to)` nel registry; `useCanvasInteraction(svgRef)`; `Overlay`.

- [ ] **Step 1: Overlay nel registry**

Aggiungere a `src/ui/canvas/dom-registry.ts`:

```ts
import type { Point, Rect } from "@/editor/er-geometry"

let overlay: SVGGElement | null = null

export function registerOverlay(el: SVGGElement | null): void {
  overlay = el
}

export function showMarquee(rect: Rect | null): void {
  const el = overlay?.querySelector("[data-marquee]")
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

export function showConnect(from: Point | null, to: Point | null): void {
  const el = overlay?.querySelector("[data-connect]")
  if (!el) return
  if (!from || !to) {
    el.setAttribute("visibility", "hidden")
    return
  }
  el.setAttribute("visibility", "visible")
  el.setAttribute("d", `M${from.x} ${from.y} L${to.x} ${to.y}`)
}
```

- [ ] **Step 2: `src/ui/canvas/Overlay.tsx`**

```tsx
import { registerOverlay } from "./dom-registry"

/** Layer overlay: marquee e anteprima connessione, aggiornati dal DOM durante l'interazione. */
export function Overlay() {
  return (
    <g
      data-layer="overlay"
      pointerEvents="none"
      ref={(el) => {
        registerOverlay(el)
        return () => registerOverlay(null)
      }}
    >
      <rect data-marquee visibility="hidden" fill="var(--primary)" fillOpacity={0.1} stroke="var(--primary)" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
      <path data-connect visibility="hidden" fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
    </g>
  )
}
```

- [ ] **Step 3: `src/ui/canvas/use-canvas-interaction.ts`**

```ts
import { useEffect, type RefObject } from "react"
import { addEntity, addRelationship, moveNodes } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { edgeGeometry } from "@/editor/edge-routing"
import { erDiagram } from "@/editor/er-access"
import { entityRect, rectsIntersect, snap, type Point, type Rect } from "@/editor/er-geometry"
import { IDLE, reduce, type Effect, type Hit, type InteractionEvent, type Mode, type PointerInfo } from "@/editor/interaction"
import { selId, sessionStore } from "@/editor/session-store"
import { panBy, screenToWorld, zoomAt } from "@/editor/viewport"
import { setEdgeGeometry, setNodePosition, showConnect, showMarquee } from "./dom-registry"

const ZOOM_WHEEL_FACTOR = 0.01

interface DragTargets {
  nodes: { key: string; x: number; y: number }[]
  edges: { key: string; source: string; target: string }[]
}

function hitTest(target: EventTarget | null): Hit {
  const el = target instanceof Element ? target : null
  const node = el?.closest("[data-node-id]")
  if (node) return { kind: "entity", key: node.getAttribute("data-node-id")! }
  const edge = el?.closest("[data-edge-id]")
  if (edge) return { kind: "relationship", key: edge.getAttribute("data-edge-id")! }
  return { kind: "canvas" }
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
}

function collectDragTargets(keys: readonly string[]): DragTargets {
  const d = erDiagram(documentStore.getState().doc)
  const set = new Set(keys)
  return {
    nodes: keys.flatMap((key) => {
      const v = d.view.nodes[key]
      return v ? [{ key, x: v.x, y: v.y }] : []
    }),
    edges: Object.entries(d.model.relationships)
      .filter(([, r]) => set.has(r.source.entity) || set.has(r.target.entity))
      .map(([key, r]) => ({ key, source: r.source.entity, target: r.target.entity })),
  }
}

/** Anteprima del drag: posizioni snappate sui nodi e geometria ricalcolata sugli edge toccati, tutto sul DOM. */
function previewDrag(targets: DragTargets, dx: number, dy: number): void {
  const d = erDiagram(documentStore.getState().doc)
  const moved = new Map(targets.nodes.map((n) => [n.key, { x: snap(n.x + dx), y: snap(n.y + dy) }]))
  for (const [key, p] of moved) setNodePosition(key, p.x, p.y)
  const rectOf = (key: string): Rect | null => {
    const entity = d.model.entities[key]
    const view = d.view.nodes[key]
    if (!entity || !view) return null
    return entityRect(entity, { ...view, ...moved.get(key) })
  }
  for (const edge of targets.edges) {
    const rel = d.model.relationships[edge.key]
    const a = rectOf(edge.source)
    const b = rectOf(edge.target)
    if (rel && a && b) setEdgeGeometry(edge.key, edgeGeometry(a, b, rel))
  }
}

function entityCenter(key: string): Point | null {
  const d = erDiagram(documentStore.getState().doc)
  const entity = d.model.entities[key]
  const view = d.view.nodes[key]
  if (!entity || !view) return null
  const r = entityRect(entity, view)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

function entitiesIn(rect: Rect): string[] {
  const d = erDiagram(documentStore.getState().doc)
  return Object.entries(d.model.entities)
    .filter(([key, entity]) => {
      const view = d.view.nodes[key]
      return view && rectsIntersect(entityRect(entity, view), rect)
    })
    .map(([key]) => key)
}

export function useCanvasInteraction(svgRef: RefObject<SVGSVGElement | null>): void {
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let mode: Mode = IDLE
    let spaceHeld = false
    let dragTargets: DragTargets | null = null

    const session = () => sessionStore.getState()
    const toScreen = (e: MouseEvent): Point => {
      const r = svg.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const info = (e: PointerEvent): PointerInfo => {
      const screen = toScreen(e)
      return {
        screen,
        world: screenToWorld(session().viewport, screen),
        button: (e.button === 1 || e.button === 2 ? e.button : 0) as 0 | 1 | 2,
        shift: e.shiftKey,
        alt: e.altKey,
        hit: hitTest(e.target),
      }
    }

    const run = (fx: Effect): void => {
      switch (fx.type) {
        case "select":
          session().setSelection(fx.ids)
          break
        case "pan-by":
          session().setViewport(panBy(session().viewport, fx.dx, fx.dy))
          break
        case "preview-drag":
          dragTargets ??= collectDragTargets(fx.keys)
          previewDrag(dragTargets, fx.dx, fx.dy)
          break
        case "commit-drag": {
          dragTargets = null
          const recipe = moveNodes(fx.keys, fx.dx, fx.dy)
          if (recipe) documentStore.getState().dispatch(recipe)
          break
        }
        case "preview-marquee":
          showMarquee(fx.rect)
          break
        case "commit-marquee": {
          const ids = entitiesIn(fx.rect).map((k) => selId("entity", k))
          session().setSelection(fx.additive ? [...session().selection, ...ids] : ids)
          break
        }
        case "preview-connect":
          showConnect(fx.to ? entityCenter(fx.source) : null, fx.to)
          break
        case "commit-connect": {
          const { key, recipe } = addRelationship(erDiagram(documentStore.getState().doc).model.relationships, fx.source, fx.target)
          documentStore.getState().dispatch(recipe)
          session().setSelection([selId("relationship", key)])
          session().setTool("select")
          break
        }
        case "create-entity": {
          const { key, recipe } = addEntity(erDiagram(documentStore.getState().doc).model.entities, fx.at)
          documentStore.getState().dispatch(recipe)
          session().setSelection([selId("entity", key)])
          session().setTool("select")
          session().setEditing({ key })
          break
        }
      }
    }

    const step = (event: InteractionEvent): void => {
      const result = reduce(mode, event, { tool: session().tool, selection: session().selection })
      mode = result.mode
      for (const fx of result.effects) run(fx)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return
      if (session().editing) return // l'input inline gestisce il blur da solo
      svg.setPointerCapture(e.pointerId)
      if (e.button === 1) e.preventDefault()
      step({ type: "down", info: info(e), spaceHeld })
    }
    const onPointerMove = (e: PointerEvent) => {
      if (mode.type !== "idle") step({ type: "move", info: info(e) })
    }
    const onPointerUp = (e: PointerEvent) => {
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId)
      step({ type: "up", info: info(e) })
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const vp = session().viewport
      if (e.ctrlKey || e.metaKey) session().setViewport(zoomAt(vp, toScreen(e), Math.exp(-e.deltaY * ZOOM_WHEEL_FACTOR)))
      else session().setViewport(panBy(vp, -e.deltaX, -e.deltaY))
    }
    const onDblClick = (e: MouseEvent) => {
      const header = e.target instanceof Element ? e.target.closest("[data-node-header]") : null
      const hit = hitTest(e.target)
      if (header && hit.kind === "entity") session().setEditing({ key: hit.key })
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return
      if (e.code === "Space") {
        spaceHeld = true
        e.preventDefault()
      }
      if (e.key === "Escape") step({ type: "cancel" })
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld = false
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()
    const onPointerCancel = () => step({ type: "cancel" })

    svg.addEventListener("pointerdown", onPointerDown)
    svg.addEventListener("pointermove", onPointerMove)
    svg.addEventListener("pointerup", onPointerUp)
    svg.addEventListener("pointercancel", onPointerCancel)
    svg.addEventListener("wheel", onWheel, { passive: false })
    svg.addEventListener("dblclick", onDblClick)
    svg.addEventListener("contextmenu", onContextMenu)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      svg.removeEventListener("pointerdown", onPointerDown)
      svg.removeEventListener("pointermove", onPointerMove)
      svg.removeEventListener("pointerup", onPointerUp)
      svg.removeEventListener("pointercancel", onPointerCancel)
      svg.removeEventListener("wheel", onWheel)
      svg.removeEventListener("dblclick", onDblClick)
      svg.removeEventListener("contextmenu", onContextMenu)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [svgRef])
}
```


- [ ] **Step 4: Collegare hook e overlay in `Canvas.tsx`**

In `Canvas`: importare `useCanvasInteraction` e `Overlay`; chiamare `useCanvasInteraction(svgRef)` dopo `useRef`; rendere `<Overlay />` come ultimo figlio del `ViewportGroup` (dopo `{children}`).

- [ ] **Step 5: Prova manuale**

Run: `pnpm dev`, aprire `http://localhost:5173/?stress=12`.

Verificare, nell'ordine:
1. rotella → pan; ctrl/cmd + rotella → zoom attorno al cursore; tasto centrale o spazio + trascina → pan;
2. click su entità → bordo primario; trascina → si muove con snap alla griglia e gli edge la seguono; al rilascio resta dove è;
3. shift+click aggiunge; trascinare un'entità selezionata muove tutta la selezione;
4. trascinare sul vuoto → rettangolo tratteggiato; al rilascio le entità intersecate sono selezionate;
5. Escape durante un drag → i nodi tornano a posto;
6. `pnpm test && pnpm lint && pnpm build` verdi.

Il tool `entity` e `relation` si provano nel Task 9 (servono i pulsanti). Fermare il server.

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat(ui): interazioni del canvas con anteprima imperativa e un comando al rilascio"
```

---

### Task 9: Toolbar, azioni condivise, scorciatoie da tastiera, tema

**Files:**
- Create: `src/editor/actions.ts`, `src/ui/Toolbar.tsx`, `src/ui/use-keyboard-shortcuts.ts`, `src/ui/use-theme.ts`
- Modify: `src/ui/App.tsx`
- Test: `src/editor/actions.test.ts`

**Interfaces:**
- Consumes: `documentStore`, comandi, `sessionStore`, `selectedKeys`, `fitToRect`, `zoomAt`, `rectsBounds`, `entityRect`.
- Produces: `deleteSelection()`, `duplicateSelection()`, `selectAllEntities()`, `fitToContent()`, `zoomBy(factor)`, `resetView()`; `useKeyboardShortcuts()`; `useTheme() → { theme, toggle }`; `Toolbar`.

- [ ] **Step 1: Test delle azioni**

`src/editor/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument } from "@/model/document"
import { deleteSelection, duplicateSelection, fitToContent, selectAllEntities, zoomBy } from "./actions"
import { documentStore } from "./document-store"
import { erDiagram } from "./er-access"
import { selId, sessionStore } from "./session-store"
import { IDENTITY } from "./viewport"

describe("actions", () => {
  beforeEach(() => {
    const doc = createErDocument("t", "t")
    for (const [key, x] of [["a", 0], ["b", 300]] as const) {
      doc.diagram.model.entities[key] = { name: key, attributes: [] }
      doc.diagram.view.nodes[key] = { x, y: 0, collapsed: true }
    }
    doc.diagram.model.relationships.r = {
      source: { entity: "a", attributes: [], cardinality: "many" },
      target: { entity: "b", attributes: [], cardinality: "one" },
      identifying: false,
    }
    documentStore.getState().load(doc)
    sessionStore.setState({ selection: new Set(), viewport: IDENTITY, canvasSize: { w: 1000, h: 800 } })
  })

  it("selectAllEntities seleziona solo le entità", () => {
    selectAllEntities()
    expect([...sessionStore.getState().selection].sort()).toEqual([selId("entity", "a"), selId("entity", "b")])
  })

  it("deleteSelection elimina e svuota la selezione", () => {
    sessionStore.getState().setSelection([selId("entity", "a")])
    deleteSelection()
    expect(erDiagram(documentStore.getState().doc).model.entities.a).toBeUndefined()
    expect(erDiagram(documentStore.getState().doc).model.relationships.r).toBeUndefined()
    expect(sessionStore.getState().selection.size).toBe(0)
  })

  it("duplicateSelection seleziona le copie", () => {
    sessionStore.getState().setSelection([selId("entity", "a"), selId("relationship", "r")])
    duplicateSelection()
    expect([...sessionStore.getState().selection]).toEqual([selId("entity", "a_copy")])
  })

  it("fitToContent inquadra le entità; zoomBy scala attorno al centro", () => {
    fitToContent()
    expect(sessionStore.getState().viewport.scale).toBe(1)
    expect(sessionStore.getState().viewport.x).toBe((1000 - 460) / 2)
    zoomBy(2)
    expect(sessionStore.getState().viewport.scale).toBe(2)
  })
})
```

- [ ] **Step 2: `src/editor/actions.ts`**

```ts
import { deleteItems, duplicateEntities } from "./commands/er"
import { documentStore } from "./document-store"
import { erDiagram } from "./er-access"
import { entityRect, rectsBounds } from "./er-geometry"
import { selId, selectedKeys, sessionStore } from "./session-store"
import { fitToRect, IDENTITY, zoomAt } from "./viewport"

/** Azioni condivise da toolbar e tastiera. Leggono gli store direttamente: niente React qui. */

export function deleteSelection(): void {
  const session = sessionStore.getState()
  const recipe = deleteItems(selectedKeys(session.selection, "entity"), selectedKeys(session.selection, "relationship"))
  if (recipe && documentStore.getState().dispatch(recipe)) session.setSelection([])
}

export function duplicateSelection(): void {
  const session = sessionStore.getState()
  const entities = selectedKeys(session.selection, "entity")
  if (entities.length === 0) return
  const { keys, recipe } = duplicateEntities(erDiagram(documentStore.getState().doc).model, entities)
  if (documentStore.getState().dispatch(recipe)) session.setSelection(keys.map((k) => selId("entity", k)))
}

export function selectAllEntities(): void {
  const keys = Object.keys(erDiagram(documentStore.getState().doc).model.entities)
  sessionStore.getState().setSelection(keys.map((k) => selId("entity", k)))
}

export function fitToContent(): void {
  const d = erDiagram(documentStore.getState().doc)
  const rects = Object.entries(d.model.entities).flatMap(([key, entity]) => {
    const view = d.view.nodes[key]
    return view ? [entityRect(entity, view)] : []
  })
  const session = sessionStore.getState()
  session.setViewport(fitToRect(rectsBounds(rects), session.canvasSize))
}

export function zoomBy(factor: number): void {
  const session = sessionStore.getState()
  const center = { x: session.canvasSize.w / 2, y: session.canvasSize.h / 2 }
  session.setViewport(zoomAt(session.viewport, center, factor))
}

export function resetView(): void {
  sessionStore.getState().setViewport(IDENTITY)
}
```

- [ ] **Step 3: `src/ui/use-theme.ts`**

```ts
import { useCallback, useEffect, useState } from "react"

type Theme = "light" | "dark"
const KEY = "dev-designer.theme"

function initial(): Theme {
  const saved = localStorage.getItem(KEY)
  if (saved === "light" || saved === "dark") return saved
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** Classe `dark` su <html>: i token shadcn e il canvas SVG leggono le stesse variabili. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initial)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem(KEY, theme)
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [])
  return { theme, toggle }
}
```

- [ ] **Step 4: `src/ui/use-keyboard-shortcuts.ts`**

```ts
import { useEffect } from "react"
import { deleteSelection, duplicateSelection, fitToContent, resetView, selectAllEntities, zoomBy } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { sessionStore } from "@/editor/session-store"

function inTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
}

/**
 * Scorciatoie globali. mod = cmd su macOS, ctrl altrove.
 * mod+z undo · mod+shift+z / mod+y redo · mod+d duplica · mod+a seleziona tutto · canc/backspace elimina
 * v/e/r tool · f fit · mod+= / mod+- zoom · mod+0 reset · esc deseleziona e torna al tool select
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (inTextInput(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      const session = sessionStore.getState()
      const doc = documentStore.getState()
      const key = e.key.toLowerCase()
      let handled = true
      if (mod && key === "z" && e.shiftKey) doc.redo()
      else if (mod && key === "z") doc.undo()
      else if (mod && key === "y") doc.redo()
      else if (mod && key === "d") duplicateSelection()
      else if (mod && key === "a") selectAllEntities()
      else if (mod && (key === "=" || key === "+")) zoomBy(1.25)
      else if (mod && key === "-") zoomBy(0.8)
      else if (mod && key === "0") resetView()
      else if (!mod && (e.key === "Delete" || e.key === "Backspace")) deleteSelection()
      else if (!mod && key === "v") session.setTool("select")
      else if (!mod && key === "e") session.setTool("entity")
      else if (!mod && key === "r") session.setTool("relation")
      else if (!mod && key === "f") fitToContent()
      else if (e.key === "Escape") {
        session.setSelection([])
        session.setTool("select")
      } else handled = false
      if (handled) e.preventDefault()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
```

- [ ] **Step 5: `src/ui/Toolbar.tsx`**

Leggere prima `src/components/ui/toggle-group.tsx` e `tooltip.tsx` generati nel Task 1 e adattare i nomi/props a quelli reali (`asChild` o `render`, `type="single"`, `TooltipProvider`).

```tsx
import { Copy, Maximize2, Moon, MousePointer2, Redo2, Spline, Square, Sun, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react"
import type { ReactNode } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { deleteSelection, duplicateSelection, fitToContent, zoomBy } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { sessionStore, type Tool } from "@/editor/session-store"
import { useTheme } from "./use-theme"

function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ZoomLabel() {
  const scale = useStore(sessionStore, (s) => s.viewport.scale)
  return <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
}

export function Toolbar() {
  const tool = useStore(sessionStore, (s) => s.tool)
  const setTool = useStore(sessionStore, (s) => s.setTool)
  const canUndo = useStore(documentStore, (s) => s.past.length > 0)
  const canRedo = useStore(documentStore, (s) => s.future.length > 0)
  const hasSelection = useStore(sessionStore, (s) => s.selection.size > 0)
  const { theme, toggle } = useTheme()

  return (
    <header className="flex h-12 items-center gap-2 border-b px-3">
      <span className="mr-2 text-sm font-semibold">Dev Designer</span>
      <ToggleGroup type="single" value={tool} onValueChange={(v) => v && setTool(v as Tool)}>
        <Hint label="Seleziona (V)"><ToggleGroupItem value="select" aria-label="Seleziona"><MousePointer2 /></ToggleGroupItem></Hint>
        <Hint label="Entità (E)"><ToggleGroupItem value="entity" aria-label="Entità"><Square /></ToggleGroupItem></Hint>
        <Hint label="Relazione (R)"><ToggleGroupItem value="relation" aria-label="Relazione"><Spline /></ToggleGroupItem></Hint>
      </ToggleGroup>
      <Separator orientation="vertical" className="h-6" />
      <Hint label="Annulla (⌘Z)"><Button variant="ghost" size="icon" disabled={!canUndo} onClick={() => documentStore.getState().undo()}><Undo2 /></Button></Hint>
      <Hint label="Ripeti (⇧⌘Z)"><Button variant="ghost" size="icon" disabled={!canRedo} onClick={() => documentStore.getState().redo()}><Redo2 /></Button></Hint>
      <Separator orientation="vertical" className="h-6" />
      <Hint label="Duplica (⌘D)"><Button variant="ghost" size="icon" disabled={!hasSelection} onClick={duplicateSelection}><Copy /></Button></Hint>
      <Hint label="Elimina (⌫)"><Button variant="ghost" size="icon" disabled={!hasSelection} onClick={deleteSelection}><Trash2 /></Button></Hint>
      <Separator orientation="vertical" className="h-6" />
      <Hint label="Riduci (⌘-)"><Button variant="ghost" size="icon" onClick={() => zoomBy(0.8)}><ZoomOut /></Button></Hint>
      <ZoomLabel />
      <Hint label="Ingrandisci (⌘+)"><Button variant="ghost" size="icon" onClick={() => zoomBy(1.25)}><ZoomIn /></Button></Hint>
      <Hint label="Adatta (F)"><Button variant="ghost" size="icon" onClick={fitToContent}><Maximize2 /></Button></Hint>
      <div className="ml-auto" />
      <Hint label={theme === "dark" ? "Tema chiaro" : "Tema scuro"}>
        <Button variant="ghost" size="icon" onClick={toggle}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
      </Hint>
    </header>
  )
}
```

- [ ] **Step 6: `src/ui/App.tsx`**

```tsx
import { TooltipProvider } from "@/components/ui/tooltip"
import { Canvas } from "./canvas/Canvas"
import { Toolbar } from "./Toolbar"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

export default function App() {
  useKeyboardShortcuts()
  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[auto_1fr] bg-background text-foreground">
        <Toolbar />
        <Canvas />
      </div>
    </TooltipProvider>
  )
}
```

Se il `tooltip.tsx` generato non esporta `TooltipProvider`, ometterlo.

- [ ] **Step 7: Verifica**

Run: `pnpm test && pnpm lint && pnpm build`, poi `pnpm dev` su `/?stress=6`.
Verificare: tool Entità + click sul vuoto → nuova entità selezionata (l'editing inline arriva nel Task 10: per ora il tool torna a select); tool Relazione + trascina da un'entità all'altra → edge nuovo selezionato; undo/redo dai pulsanti e da tastiera; Canc elimina; ⌘D duplica; F adatta; il tema scuro cambia anche il canvas. Fermare il server.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat(ui): toolbar, azioni condivise, scorciatoie da tastiera e tema"
```

---

### Task 10: Pannello proprietà, editing inline del nome, pannello problemi

**Files:**
- Create: `src/ui/panels/CommitInput.tsx`, `src/ui/panels/PropertiesPanel.tsx`, `src/ui/panels/IssuesPanel.tsx`, `src/ui/canvas/InlineEditor.tsx`
- Modify: `src/ui/canvas/Canvas.tsx` (rende `<InlineEditor />` nel div sopra l'svg), `src/ui/App.tsx`

**Interfaces:**
- Consumes: comandi (Task 5), `validateEr` (Task 3), `sessionStore.editing`, `worldToScreen`, `entitySize`, `HEADER_H`, `FONT_SIZE`, componenti shadcn `Input`, `Label`, `Button`.
- Produces: `CommitInput`, `PropertiesPanel`, `IssuesPanel`, `InlineEditor`.

- [ ] **Step 1: `src/ui/panels/CommitInput.tsx`**

```tsx
import { useState, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"

interface Props extends Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "onKeyDown"> {
  value: string
  /** Chiamato su Enter e su blur, solo se il testo è cambiato. */
  onCommit: (value: string) => void
}

/**
 * Input controllato localmente che committa un comando solo alla fine dell'editing: un comando, una voce di undo.
 * Il genitore passa `key={value}`: quando il valore cambia dall'esterno il componente si rimonta con il testo nuovo.
 */
export function CommitInput({ value, onCommit, ...rest }: Props) {
  const [text, setText] = useState(value)
  const commit = () => {
    if (text !== value) onCommit(text)
  }
  return (
    <Input
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          setText(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
```


- [ ] **Step 2: `src/ui/panels/PropertiesPanel.tsx`**

```tsx
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { addAttribute, moveAttribute, removeAttribute, renameEntity, setCollapsed, updateAttribute, updateRelationship } from "@/editor/commands/er"
import { documentStore, type Recipe } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { selId, selectedKeys, sessionStore } from "@/editor/session-store"
import { CardinalitySchema, entityKey, type Attribute, type Cardinality } from "@/model/document"
import { CommitInput } from "./CommitInput"

const dispatch = (recipe: Recipe | null) => {
  if (recipe) documentStore.getState().dispatch(recipe)
}

const CARDINALITY_LABEL: Record<Cardinality, string> = {
  one: "1 (uno)",
  "zero-or-one": "0..1 (zero o uno)",
  many: "1..* (uno o molti)",
  "zero-or-many": "0..* (zero o molti)",
}

function Flag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function AttributeRow({ entity, index, attribute, count }: { entity: string; index: number; attribute: Attribute; count: number }) {
  const patch = (p: Partial<Attribute>) => dispatch(updateAttribute(entity, index, p))
  return (
    <li className="flex flex-col gap-1 rounded border p-2">
      <div className="flex gap-1">
        <CommitInput key={attribute.name} value={attribute.name} onCommit={(name) => patch({ name })} aria-label="Nome attributo" className="h-7 text-xs" />
        <CommitInput key={`t-${attribute.type}`} value={attribute.type} onCommit={(type) => patch({ type })} aria-label="Tipo" className="h-7 text-xs" />
      </div>
      <div className="flex items-center gap-2">
        <Flag label="PK" checked={attribute.primaryKey} onChange={(primaryKey) => patch({ primaryKey })} />
        <Flag label="FK" checked={attribute.foreignKey} onChange={(foreignKey) => patch({ foreignKey })} />
        <Flag label="NULL" checked={attribute.nullable} onChange={(nullable) => patch({ nullable })} />
        <Flag label="UNIQUE" checked={attribute.unique} onChange={(unique) => patch({ unique })} />
        <span className="ml-auto flex">
          <Button variant="ghost" size="icon" className="size-6" disabled={index === 0} aria-label="Sposta su" onClick={() => dispatch(moveAttribute(entity, index, index - 1))}><ArrowUp /></Button>
          <Button variant="ghost" size="icon" className="size-6" disabled={index === count - 1} aria-label="Sposta giù" onClick={() => dispatch(moveAttribute(entity, index, index + 1))}><ArrowDown /></Button>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Rimuovi" onClick={() => dispatch(removeAttribute(entity, index))}><X /></Button>
        </span>
      </div>
    </li>
  )
}

function EntityProperties({ entityKey: key }: { entityKey: string }) {
  const entity = useStore(documentStore, (s) => erDiagram(s.doc).model.entities[key])
  const view = useStore(documentStore, (s) => erDiagram(s.doc).view.nodes[key])
  if (!entity || !view) return null
  const rename = (name: string, schema: string | undefined) => {
    const recipe = renameEntity(key, name, schema)
    if (recipe && documentStore.getState().dispatch(recipe)) {
      sessionStore.getState().setSelection([selId("entity", entityKey({ name: name.trim(), schema: schema?.trim() || undefined }))])
    }
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-1">
        <Label htmlFor="entity-name">Nome</Label>
        <CommitInput key={entity.name} id="entity-name" value={entity.name} onCommit={(name) => rename(name, entity.schema)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="entity-schema">Schema</Label>
        <CommitInput key={entity.schema ?? ""} id="entity-schema" value={entity.schema ?? ""} onCommit={(schema) => rename(entity.name, schema)} placeholder="(nessuno)" />
      </div>
      <Flag label="Collassata" checked={view.collapsed} onChange={(v) => dispatch(setCollapsed(key, v))} />
      <div className="flex items-center justify-between">
        <Label>Attributi</Label>
        <Button variant="outline" size="sm" onClick={() => dispatch(addAttribute(key))}><Plus /> Aggiungi</Button>
      </div>
      <ul className="flex flex-col gap-2">
        {entity.attributes.map((a, i) => (
          <AttributeRow key={i} entity={key} index={i} attribute={a} count={entity.attributes.length} />
        ))}
      </ul>
    </div>
  )
}

function CardinalitySelect({ id, value, onChange }: { id: string; value: Cardinality; onChange: (v: Cardinality) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(CardinalitySchema.parse(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm">
      {CardinalitySchema.options.map((c) => <option key={c} value={c}>{CARDINALITY_LABEL[c]}</option>)}
    </select>
  )
}

function RelationshipProperties({ relationshipKey: key }: { relationshipKey: string }) {
  const rel = useStore(documentStore, (s) => erDiagram(s.doc).model.relationships[key])
  if (!rel) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">{rel.source.entity} → {rel.target.entity}</p>
      <div className="grid gap-1">
        <Label htmlFor="rel-name">Nome</Label>
        <CommitInput key={rel.name ?? ""} id="rel-name" value={rel.name ?? ""} onCommit={(name) => dispatch(updateRelationship(key, (r) => { r.name = name.trim() || undefined }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-source">Cardinalità lato {rel.source.entity}</Label>
        <CardinalitySelect id="rel-source" value={rel.source.cardinality} onChange={(c) => dispatch(updateRelationship(key, (r) => { r.source.cardinality = c }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-target">Cardinalità lato {rel.target.entity}</Label>
        <CardinalitySelect id="rel-target" value={rel.target.cardinality} onChange={(c) => dispatch(updateRelationship(key, (r) => { r.target.cardinality = c }))} />
      </div>
      <Flag label="Identificante" checked={rel.identifying} onChange={(v) => dispatch(updateRelationship(key, (r) => { r.identifying = v }))} />
    </div>
  )
}

export function PropertiesPanel() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const entities = selectedKeys(selection, "entity")
  const relationships = selectedKeys(selection, "relationship")
  if (entities.length === 1 && relationships.length === 0) return <EntityProperties key={entities[0]} entityKey={entities[0]!} />
  if (relationships.length === 1 && entities.length === 0) return <RelationshipProperties key={relationships[0]} relationshipKey={relationships[0]!} />
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? "Seleziona un'entità o una relazione." : `${selection.size} elementi selezionati`}
    </p>
  )
}
```

`CardinalitySchema.options` è l'array dei valori di uno `z.enum` in zod 4; se il nome differisce nella versione installata, leggere `node_modules/zod/**/enum.d.ts` e adattare.

- [ ] **Step 3: `src/ui/panels/IssuesPanel.tsx`**

```tsx
import { useMemo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { selId, sessionStore } from "@/editor/session-store"
import { validateEr, type Issue } from "@/model/er/validate"

function select(issue: Issue) {
  if (issue.entity) sessionStore.getState().setSelection([selId("entity", issue.entity)])
  else if (issue.relationship) sessionStore.getState().setSelection([selId("relationship", issue.relationship)])
}

/** Validazione live: ricalcolata quando cambia il model, non a ogni render. */
export function IssuesPanel() {
  const model = useStore(documentStore, (s) => erDiagram(s.doc).model)
  const issues = useMemo(() => validateEr(model), [model])
  return (
    <section className="border-t">
      <h2 className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Problemi ({issues.length})</h2>
      {issues.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">Nessun problema.</p>
      ) : (
        <ul className="max-h-64 overflow-auto">
          {issues.map((issue, i) => (
            <li key={i}>
              <button type="button" onClick={() => select(issue)} className="flex w-full gap-2 px-3 py-1 text-left text-xs hover:bg-accent">
                <span className={issue.severity === "error" ? "text-destructive" : "text-amber-500"}>{issue.severity === "error" ? "●" : "▲"}</span>
                <span>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: `src/ui/canvas/InlineEditor.tsx`**

```tsx
import { useStore } from "zustand"
import { renameEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { entitySize, FONT_SIZE, HEADER_H } from "@/editor/er-geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { worldToScreen } from "@/editor/viewport"
import { entityKey } from "@/model/document"

/** Input HTML sovrapposto all'header dell'entità in editing. Un comando al commit; Escape annulla. */
export function InlineEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const entity = useStore(documentStore, (s) => (editing ? erDiagram(s.doc).model.entities[editing.key] : undefined))
  const view = useStore(documentStore, (s) => (editing ? erDiagram(s.doc).view.nodes[editing.key] : undefined))
  if (!editing || !entity || !view) return null

  const { w } = entitySize(entity, view.collapsed)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })
  const close = () => sessionStore.getState().setEditing(null)
  const commit = (value: string) => {
    const recipe = renameEntity(editing.key, value, entity.schema)
    if (recipe && documentStore.getState().dispatch(recipe)) {
      sessionStore.getState().setSelection([selId("entity", entityKey({ name: value.trim(), schema: entity.schema }))])
    }
    close()
  }

  return (
    <input
      autoFocus
      defaultValue={entity.name}
      aria-label="Nome entità"
      className="absolute border border-primary bg-card text-center font-mono text-foreground outline-none"
      style={{ left: tl.x, top: tl.y, width: w * viewport.scale, height: HEADER_H * viewport.scale, fontSize: FONT_SIZE * viewport.scale }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          e.currentTarget.value = entity.name
          close()
        }
      }}
    />
  )
}
```

Attenzione: su Escape il `blur` successivo non deve committare: `close()` azzera `editing`, il componente si smonta e il blur arriva su un input già rimosso; se in prova il rename parte comunque, tenere un flag `cancelled` in una ref e saltare il commit.

- [ ] **Step 5: Comporre `Canvas.tsx` e `App.tsx`**

In `Canvas`, dentro il `div` relativo, dopo l'`<svg>`: `<InlineEditor />`.

`src/ui/App.tsx`:

```tsx
import { TooltipProvider } from "@/components/ui/tooltip"
import { Canvas } from "./canvas/Canvas"
import { IssuesPanel } from "./panels/IssuesPanel"
import { PropertiesPanel } from "./panels/PropertiesPanel"
import { Toolbar } from "./Toolbar"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

export default function App() {
  useKeyboardShortcuts()
  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[auto_1fr] bg-background text-foreground">
        <Toolbar />
        <div className="grid min-h-0 grid-cols-[1fr_320px]">
          <Canvas />
          <aside className="flex min-h-0 flex-col border-l">
            <div className="min-h-0 flex-1 overflow-auto"><PropertiesPanel /></div>
            <IssuesPanel />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  )
}
```

- [ ] **Step 6: Verifica**

Run: `pnpm test && pnpm lint && pnpm build`, poi `pnpm dev` su `/` (documento vuoto).
Verificare: E + click → entità nuova con l'input del nome già aperto; digitare `users` + Enter → titolo aggiornato, entità ancora selezionata; doppio click sull'header riapre l'editing; Escape annulla; nel pannello: rinomina, schema `auth` → titolo `auth.users`, aggiungi/modifica/riordina/rimuovi attributi, PK/FK/NULL/UNIQUE cambiano le righe nel nodo; togliere la PK → il pannello Problemi mostra l'avviso e il click lo seleziona; R + trascina fra due entità → relazione; cambiare cardinalità e "Identificante" aggiorna marker e tratteggio; undo ripercorre ogni passo. Fermare il server.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(ui): pannello proprietà, editing inline del nome e pannello problemi"
```

---

### Task 11: Misura FPS con frame dipinti a 300 entità

**Files:**
- Create: `scripts/perf/fps.mjs`, `docs/perf/2026-09-06-fps-frame-dipinti.md`
- Modify: `package.json` (script `perf`), `docs/superpowers/spikes/2026-09-06-spike-results.md` (rimando), `README.md` (sezione misura)

**Interfaces:**
- Consumes: `?stress=N` (Task 7), attributi `data-node-id`, `data-node-header`, scorciatoia mod+A (Task 9), pan con tasto centrale e zoom con ctrl+rotella (Task 8).
- Produces: `pnpm perf [N]` che stampa una tabella e la riga Markdown per il documento.

- [ ] **Step 1: `scripts/perf/fps.mjs`**

```js
// Misura a frame dipinti: build di produzione servita da `vite preview`, Chrome di sistema visibile,
// eventi mouse reali. Per scenario: FPS medio, p95 e massimo del tempo di frame (rAF-to-rAF).
import { spawn } from "node:child_process"
import { chromium } from "playwright"

const N = Number(process.argv[2] ?? 300)
const PORT = 4173
const URL = `http://localhost:${PORT}/?stress=${N}`
const W = 1400
const H = 900

const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
try {
  await waitFor(URL)
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  await page.goto(URL)
  await page.waitForSelector("[data-node-id]")
  await page.evaluate(() => {
    window.__frames = []
    const loop = (t) => { window.__frames.push(t); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
  })
  await page.waitForTimeout(500)

  const results = {
    drag: await measure(page, dragOne),
    dragAll: await measure(page, dragAll),
    pan: await measure(page, pan),
    marquee: await measure(page, marquee),
    zoom: await measure(page, zoom),
  }
  console.table(results)
  console.log(`\n| Scenario | FPS medio | p95 ms/frame | max ms/frame |\n|---|---|---|---|`)
  for (const [name, r] of Object.entries(results)) console.log(`| ${name} | ${r.fpsAvg} | ${r.p95} | ${r.max} |`)
  const worst = Math.max(...Object.values(results).map((r) => r.p95))
  console.log(`\nN=${N} · p95 peggiore ${worst} ms → ${worst <= 20 ? "PASS" : "FAIL"} (criterio p95 ≤ 20 ms)`)
  await browser.close()
} finally {
  preview.kill()
}

async function launch() {
  const headless = process.env.HEADLESS === "1"
  try {
    return await chromium.launch({ channel: "chrome", headless })
  } catch {
    console.warn("Chrome di sistema non trovato: uso il Chromium di Playwright (pnpm exec playwright install chromium)")
    return chromium.launch({ headless })
  }
}

async function waitFor(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch { /* server non ancora pronto */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`vite preview non risponde su ${url}`)
}

async function measure(page, scenario) {
  await page.evaluate(() => { window.__frames = [] })
  const t0 = performance.now()
  await scenario(page)
  const ms = performance.now() - t0
  const frames = await page.evaluate(() => window.__frames)
  const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b)
  const p95 = gaps[Math.floor(gaps.length * 0.95)] ?? 0
  return { frames: frames.length, fpsAvg: +(frames.length / (ms / 1000)).toFixed(1), p95: +p95.toFixed(1), max: +(gaps.at(-1) ?? 0).toFixed(1) }
}

async function headerCenter(page, key) {
  const box = await page.locator(`[data-node-id="${key}"] [data-node-header]`).first().boundingBox()
  if (!box) throw new Error(`entità ${key} non visibile`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragOne(page) {
  const { x, y } = await headerCenter(page, "t0")
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 300, y + 200, { steps: 120 })
  await page.mouse.up()
}

async function dragAll(page) {
  await page.keyboard.press("ControlOrMeta+a")
  const { x, y } = await headerCenter(page, "t0")
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 300, y + 200, { steps: 120 })
  await page.mouse.up()
  await page.keyboard.press("Escape")
}

async function pan(page) {
  await page.mouse.move(W / 2, H / 2)
  await page.mouse.down({ button: "middle" })
  await page.mouse.move(W / 2 - 400, H / 2 - 300, { steps: 120 })
  await page.mouse.up({ button: "middle" })
}

async function marquee(page) {
  await page.mouse.move(W / 2, H / 2)
  await page.mouse.down({ button: "middle" })
  await page.mouse.move(W / 2 + 120, H / 2 + 120, { steps: 10 })
  await page.mouse.up({ button: "middle" })
  await page.mouse.move(20, 20)
  await page.mouse.down()
  await page.mouse.move(W - 40, H - 40, { steps: 120 })
  await page.mouse.up()
  await page.keyboard.press("Escape")
}

async function zoom(page) {
  await page.mouse.move(W / 2, H / 2)
  await page.keyboard.down("Control")
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -40)
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 40)
  await page.keyboard.up("Control")
}
```

In `package.json`, scripts: `"perf": "vite build && node scripts/perf/fps.mjs"`.

- [ ] **Step 2: Eseguire la misura**

```bash
pnpm perf 300
pnpm perf 600
```

Si apre una finestra di Chrome: non toccarla durante la misura. Se `channel: "chrome"` fallisce e non si vuole installare il Chromium di Playwright, installare Chrome oppure `pnpm exec playwright install chromium`. Annotare le due tabelle e la macchina (`sysctl -n machdep.cpu.brand_string`, versione di Chrome da `chrome://version` o `/Applications/Google Chrome.app/Contents/Info.plist`).

- [ ] **Step 3: Scrivere `docs/perf/2026-09-06-fps-frame-dipinti.md`**

Struttura obbligatoria, in italiano, con i numeri reali (nessun segnaposto):

1. **Cosa misura e come**: build di produzione (`vite build` + `vite preview`), StrictMode irrilevante in produzione, Chrome di sistema visibile, eventi mouse reali via Playwright, tempo fra `requestAnimationFrame` consecutivi (frame dipinti, layout e paint inclusi). Differenza con la sezione A dello spike (solo scripting, pannello nascosto).
2. **Ambiente**: macchina, Chrome, viewport 1400×900, commit misurato (`git rev-parse --short HEAD`).
3. **Tabelle** a 300 e a 600 entità, cinque scenari, colonne FPS medio / p95 / max.
4. **Verdetto** contro il criterio (p95 ≤ 20 ms a 300 entità in ogni scenario), esplicitando che il p95 è la definizione operativa di "FPS minimo" (il max include GC e primo paint).
5. **Lettura**: quale scenario è il peggiore e perché (attendersi marquee e dragAll); confronto con i ms di scripting dello spike a 300.
6. **Cosa non è misurato**: display a 120 Hz (rAF cappa ai 60 del display: se lo schermo è a 120 Hz dichiararlo), macchine lente, entità collassate, Firefox/Safari.
7. **Conseguenza per il Task 12**: PASS → il culling è rinviato (motivare); FAIL → il culling si esegue.

Aggiornare `docs/superpowers/spikes/2026-09-06-spike-results.md`: sostituire la frase «La misura con i frame effettivamente dipinti (FPS reali, layout e paint inclusi) **non è stata fatta**.» con un rimando al nuovo documento. Aggiungere al `README.md` una sezione "Misura prestazioni" con `pnpm perf [N]` e il prerequisito Chrome.

- [ ] **Step 4: Commit**

```bash
git add scripts/perf package.json docs README.md
git commit -m "perf: misura FPS a frame dipinti su 300 e 600 entità"
```

---

### Task 12 (condizionale): Culling del viewport

**Eseguire solo se il Task 11 riporta FAIL (p95 > 20 ms in almeno uno scenario a 300 entità).** Se PASS, il task si chiude con la sola nota nel documento del Task 11, nessun codice.

**Files:**
- Create: `src/editor/culling.ts`, test `src/editor/culling.test.ts`
- Modify: `src/editor/session-store.ts` (campo `cullRect`), `src/ui/canvas/ViewportGroup.tsx`, `src/ui/canvas/layers.tsx`

**Interfaces:**
- Produces: `nextCullRect(current: Rect | null, visible: Rect): Rect | null` (null = nessun cambiamento), `sessionStore.cullRect: Rect | null`, `setCullRect`.

- [ ] **Step 1: Test**

`src/editor/culling.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { nextCullRect } from "./culling"

describe("nextCullRect", () => {
  const visible = { x: 0, y: 0, w: 100, h: 100 }
  it("al primo giro espande il visibile di un viewport per lato", () => {
    expect(nextCullRect(null, visible)).toEqual({ x: -100, y: -100, w: 300, h: 300 })
  })
  it("non cambia finché il visibile resta dentro il margine", () => {
    const cull = nextCullRect(null, visible)
    expect(nextCullRect(cull, { x: 50, y: 80, w: 100, h: 100 })).toBeNull()
  })
  it("ricalcola quando il visibile esce dal margine", () => {
    const cull = nextCullRect(null, visible)
    expect(nextCullRect(cull, { x: 150, y: 0, w: 100, h: 100 })).toEqual({ x: 50, y: -100, w: 300, h: 300 })
  })
})
```

- [ ] **Step 2: `src/editor/culling.ts`**

```ts
import type { Rect } from "./er-geometry"

/**
 * Rettangolo di culling con isteresi: un viewport di margine per lato, ricalcolato solo quando
 * l'inquadratura ne esce. Così il pan non ri-renderizza i layer a ogni frame, ma solo ogni tanto.
 */
export function nextCullRect(current: Rect | null, visible: Rect): Rect | null {
  const inside = current
    && visible.x >= current.x && visible.y >= current.y
    && visible.x + visible.w <= current.x + current.w && visible.y + visible.h <= current.y + current.h
  if (inside) return null
  return { x: visible.x - visible.w, y: visible.y - visible.h, w: visible.w * 3, h: visible.h * 3 }
}
```

- [ ] **Step 3: Collegare**

- `session-store.ts`: aggiungere `cullRect: Rect | null` (iniziale `null`) e `setCullRect(rect: Rect | null)`.
- `ViewportGroup.tsx`: nella subscription, dopo `apply()`, calcolare `visibleWorldRect(viewport, canvasSize)` e, se `nextCullRect(cullRect, visible)` non è null, chiamare `setCullRect`. Ripetere anche quando cambia `canvasSize`.
- `layers.tsx`: `NodesLayer` seleziona con `useShallow` le chiavi delle entità il cui `entityRect` interseca `cullRect` (tutte, se `cullRect` è null); `EdgesLayer` tiene gli edge con almeno un'estremità fra le entità visibili.

- [ ] **Step 4: Rimisurare e documentare**

`pnpm perf 300` e `pnpm perf 600`; aggiungere al documento del Task 11 una sezione "Dopo il culling" con le nuove tabelle e il nuovo verdetto.

- [ ] **Step 5: Commit**

```bash
git add src docs
git commit -m "perf: culling del viewport con isteresi"
```

---

## Self-review del piano

**Copertura della spec (§2 Shell + ER, limitata a questo piano):** canvas pan/zoom/fit/griglia con snap (Task 4, 7, 8, 9), selezione singola/multipla/a rettangolo (6, 8), sposta/elimina/duplica/undo/redo/scorciatoie (5, 8, 9), editing inline + pannello proprietà (10), tema (9); ER: entità con attributi e flag (2, 10), relazioni crow's foot identificanti o no (4, 7, 10), validazione live (3, 10), entità collassabili (2, 10). Modello §4.1: union discriminata, model/view separati, chiave naturale, tipi come stringhe, versioning, validazione all'apertura, JSON con chiavi ordinate (2). Stato e undo §4.2 (5, 6). Rendering §4.3: un svg, matrice sul `<g>`, tre layer, componente per kind memoizzato, drag fuori da React, state machine unica, ancore sui lati con una o due pieghe, font monospace senza misure (4, 6, 7, 8). Test §4.5: model/editor con Vitest, renderer via `renderToStaticMarkup` (7); l'e2e Playwright è rinviato al piano 3 con la persistenza. Fuori piano dichiarato in testa.

**Segnaposto:** nessun TBD; i numeri del Task 11 sono per definizione da misurare e il documento li richiede reali.

**Coerenza dei nomi:** `nodeKey`/`edgeKey` come prop dei componenti (non `key`, riservata a React); `selId`/`selectedKeys` usati identici in 6, 8, 9, 10; `erDiagram` in 5-10; `entityRect`/`edgeGeometry` in 7 e 8; `setCanvasSize` in 6 e 7, letto in 9; `registerOverlay`/`showMarquee`/`showConnect` in 8. `documentStore.getState().dispatch` ritorna `boolean`, usato come guardia in 9 e 10.
