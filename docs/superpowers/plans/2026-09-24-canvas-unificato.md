# Canvas unificato (step 2a) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entità, classi e nodi di flusso convivono nello stesso documento e nello stesso canvas, ognuno con la semantica, la validazione e l'export della sua famiglia.

**Architecture:** il piano applica il cambiamento in due fasi, e ogni task lascia test unitari ed e2e verdi.

- **Fase A (Task 1–4), modello di oggi.** Il codice impara a ragionare per famiglie e per chiavi con prefisso (`er/utenti`), mentre il documento ha ancora un solo tipo: `documentFamilies(doc)` restituisce `[doc.diagram.type]`.
- **Fase B (Task 5–7), modello unificato.** Il modello passa a `diagram: { er, class, flow }`, `documentFamilies` lascia il posto a `FAMILIES`, e il resto è layout ed e2e.

Il confine fra le famiglie è `CanvasOps`, che smista le chiamate e aggiunge o toglie il prefisso. I moduli di famiglia non vedono mai il prefisso.

**Tech Stack:** React 19 + TypeScript strict (`noUncheckedIndexedAccess`), zustand (vanilla store), Immer (recipe con patch), zod 4, Vitest, e2e con Playwright su `vite preview` (`pnpm e2e`).

**Spec:** `docs/superpowers/specs/2026-09-24-canvas-unificato-design.md`

## Scostamenti dalla spec, decisi scrivendo il piano

1. **Niente `FamilyContext`** (spec §5). Ogni vista di nodo o di arco appartiene già a una famiglia sola: `EntityNodeView` è solo ER. Quindi scrive il prefisso con il letterale della sua famiglia (`qualify("er", nodeKey)`). Un contesto React avrebbe solo portato in giro un valore che ogni componente conosce già.
2. **`applyLayout` non normalizza più l'origine.** Lo fa la funzione pura di impacchettamento dei blocchi (Task 6), che ha bisogno di posizionare ogni blocco nel punto giusto. Senza questo spostamento, `applyLayout` riporterebbe ogni blocco in `(40, 40)`.
3. **Il reset del DOM al rilascio del drag avviene sempre**, non solo per il flowchart (Task 3). Con una selezione mista una famiglia può avere `commitDrag` e un'altra no. Il reset è innocuo anche per ER e classi: React riscrive comunque i nodi la cui view è cambiata.
4. **`toolId` include la famiglia.** Le due note sono entrambe `node` con variante `note`, e senza la famiglia avrebbero lo stesso id nel `ToggleGroup`.

## Global Constraints

- Lingua: commenti, docblock, messaggi e nomi dei test in italiano; identificatori in inglese, come nel codice esistente.
- Nessuna dipendenza nuova.
- `src/editor` non importa React né `src/io` (regola ESLint esistente). `src/model` non importa `src/editor`.
- Formato delle chiavi con prefisso: `${family}/${key}`. Si spezza al **primo** `/`. Solo `qualify`/`splitKey` in `src/editor/families.ts` costruiscono o spezzano chiavi.
- Ordine canonico delle famiglie: `FAMILIES = ["er", "class", "flow"]`, definito solo in `src/model/family.ts`.
- Scorciatoie: Entità `E`, Classe `C`, Interfaccia `I`, Enum `U`, Nota di classe `N`, forme del flusso `1`–`6`, Collega `R`, Seleziona `V`. Tasti ed etichette sono unici su tutta la sidebar.
- Etichette degli strumenti: «Entità», «Classe», «Interfaccia», «Enum», «Nota di classe», «Terminale», «Processo», «Decisione», «Input/Output», «Sottoprocesso», «Nota di flusso», «Collega».
- Etichette dei gruppi della sidebar: ER, Classi, Flusso.
- `SCHEMA_VERSION` passa da 2 a 3 (Task 5).
- `LAYOUT_FAMILY_GAP = 120`, `LAYOUT_MARGIN = 40` (il `MARGIN` di oggi in `commands/view.ts`).
- Ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. I messaggi seguono lo stile del repo: `feat(ambito): …` in italiano.
- Verifiche a fine task: `pnpm tsc -b`, `pnpm lint`, `pnpm test` ed `pnpm e2e` verdi.

## Review Focus

Casi che la spec implica ma che nessun test dei task copre di default. Per ciascuno, il test è stato aggiunto al task che possiede il codice:

1. **Chiave interna con `/`.** Un nome di classe o di entità che contiene `/` deve restare intatto dopo `splitKey(qualify(f, k))`. → Task 1, test «una chiave interna con / resta intatta».
2. **Annullare un'eliminazione mista.** Eliminare insieme un'entità e un nodo di flusso, poi premere ⌘Z una volta sola, deve riportarli entrambi. → Task 3, test «deleteItems misto: un solo passo di annulla».
3. **Rinomina di un'entità selezionata.** Dopo la rinomina, la selezione deve seguire la nuova chiave **con prefisso**, altrimenti il pannello proprietà si svuota. → Task 3, test su `renameEntityWithNotice`.
4. **Un file v2 riaperto dai recenti o dal disco.** Il buffer in IndexedDB è in formato v2 e deve aprirsi migrato, non fallire. → Task 5, test di `parseDocument` su un JSON v2 per ognuno dei tre tipi.
5. **Disponi con un worker che fallisce su una sola famiglia.** Non deve spostare niente, nemmeno le famiglie già calcolate. → Task 6, test «un fallimento non applica niente».

---

## Mappa dei file

**Nuovi**

| File | Responsabilità |
|---|---|
| `src/model/family.ts` | `FAMILIES`, `Family` |
| `src/editor/families.ts` | `qualify`, `splitKey`, `familySelectedKeys`, `editingIn`, `documentFamilies` (solo fase A) |
| `src/editor/kinds/canvas-ops.ts` | `CanvasOps`, `canvasOps(doc)`, `familyHasContent` |
| `src/editor/layout-pack.ts` | `LAYOUT_MARGIN`, `LAYOUT_FAMILY_GAP`, `packBlocks` |
| `scripts/e2e/misto.mjs` | scenario e2e con le tre famiglie |

**Modificati (principali)**

| File | Cambiamento |
|---|---|
| `src/editor/session-store.ts` | `family` nello strumento attivo |
| `src/editor/interaction.ts` | `create-node` porta la famiglia |
| `src/editor/kinds/ops.ts` | `familyOps(doc, family)`; `opsFor` sparisce nel Task 5 |
| `src/editor/actions.ts`, `src/ui/canvas/interaction-runner.ts` | parlano con `canvasOps` |
| `src/ui/canvas/kinds/{registry,er,class,flow}.tsx` | `ToolDef.family`, `LINK_TOOL`, `canvasTools`, strumenti rinominati |
| viste e editor in `src/ui/canvas/*` | chiavi DOM e selezione con prefisso |
| `src/ui/panels/*` | pannello scelto per famiglia, chiavi senza prefisso |
| `src/ui/export/{svg.tsx,actions.ts,TextExportDialog.tsx}` | tutte le famiglie |
| `src/model/{document,migrations,shared}.ts`, `src/model/*/schema.ts` | modello unificato, migrazione 2→3 |
| `src/editor/{er,class,flow}-access.ts` | accessor sulle parti |
| `src/editor/commands/view.ts` | la famiglia come primo argomento |
| `src/io/document-io.ts`, `src/ui/DocumentMenu.tsx` | `newDocument()`, «Nuovo documento» |
| `src/ui/layout-actions.ts` | Disponi per famiglia |

---

### Task 1: Famiglie e chiavi con prefisso

**Files:**
- Create: `src/model/family.ts`
- Create: `src/editor/families.ts`
- Test: `src/editor/families.test.ts`

**Interfaces:**
- Consumes: `parseSelId`, `SelectionKind`, `SessionState` da `src/editor/session-store.ts`; `DevDocument` da `src/model/document.ts`.
- Produces:
  - `FAMILIES: readonly ["er", "class", "flow"]`, `type Family`
  - `qualify(family: Family, key: string): string`
  - `splitKey(qualified: string): { family: Family; key: string }` (lancia un'eccezione su una chiave senza famiglia valida)
  - `familySelectedKeys(selection: ReadonlySet<string>, kind: SelectionKind, family: Family): string[]` (chiavi **senza** prefisso)
  - `editingIn(editing: SessionState["editing"], family: Family): { key: string; target: NonNullable<SessionState["editing"]>["target"] } | null` (chiave senza prefisso)
  - `documentFamilies(doc: DevDocument): readonly Family[]` (solo fase A: `[doc.diagram.type]`)

- [ ] **Step 1: Scrivi il test che fallisce**

`src/editor/families.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createErDocument } from "@/model/er/schema"
import { createFlowDocument } from "@/model/flow/schema"
import { documentFamilies, editingIn, familySelectedKeys, qualify, splitKey } from "./families"
import { selId } from "./session-store"

describe("qualify / splitKey", () => {
  it("si invertono l'una con l'altra", () => {
    expect(qualify("er", "public.utenti")).toBe("er/public.utenti")
    expect(splitKey("er/public.utenti")).toEqual({ family: "er", key: "public.utenti" })
  })

  it("una chiave interna con / resta intatta", () => {
    // Review Focus 1: si taglia al primo `/`, e il nome della famiglia non ne contiene mai.
    expect(splitKey(qualify("class", "Ordine/Riga"))).toEqual({ family: "class", key: "Ordine/Riga" })
  })

  it("una chiave senza famiglia valida è un errore, non un'ipotesi", () => {
    expect(() => splitKey("utenti")).toThrow()
    expect(() => splitKey("sequence/x")).toThrow()
  })
})

describe("familySelectedKeys", () => {
  it("dà le chiavi di un tipo e di una famiglia, senza prefisso", () => {
    const selection = new Set([selId("node", "er/a"), selId("node", "flow/n1"), selId("edge", "er/r1"), selId("node", "er/b")])
    expect(familySelectedKeys(selection, "node", "er")).toEqual(["a", "b"])
    expect(familySelectedKeys(selection, "edge", "er")).toEqual(["r1"])
    expect(familySelectedKeys(selection, "node", "class")).toEqual([])
  })
})

describe("editingIn", () => {
  it("dà l'editing senza prefisso solo alla sua famiglia", () => {
    const editing = { key: "flow/n1", target: "body" as const }
    expect(editingIn(editing, "flow")).toEqual({ key: "n1", target: "body" })
    expect(editingIn(editing, "class")).toBeNull()
    expect(editingIn(null, "flow")).toBeNull()
  })
})

describe("documentFamilies (fase A)", () => {
  it("è il tipo del documento", () => {
    expect(documentFamilies(createErDocument("x"))).toEqual(["er"])
    expect(documentFamilies(createFlowDocument("x"))).toEqual(["flow"])
  })
})
```

- [ ] **Step 2: Verifica che fallisca**

Run: `pnpm vitest run src/editor/families.test.ts`
Expected: FAIL, `Failed to resolve import "./families"`

- [ ] **Step 3: Implementa**

`src/model/family.ts`:

```ts
/**
 * Le famiglie di elementi che un documento contiene. L'ordine è quello canonico, e tutto ciò che
 * le scorre lo rispetta: layer del canvas, blocchi del layout, formati di export, validazione.
 */
export const FAMILIES = ["er", "class", "flow"] as const
export type Family = (typeof FAMILIES)[number]
```

`src/editor/families.ts`:

```ts
import type { DevDocument } from "@/model/document"
import { FAMILIES, type Family } from "@/model/family"
import { parseSelId, type SelectionKind, type SessionState } from "./session-store"

/**
 * Chiave con prefisso di famiglia: `er/utenti`, `class/Ordine`, `flow/n3`. È la sola forma di
 * chiave che canvas, selezione, editing e `dom-registry` conoscono. I moduli di famiglia (comandi,
 * `DiagramOps`, validatori, emettitori, pannelli) lavorano senza prefisso: lo aggiunge `CanvasOps`
 * all'andata e lo toglie al ritorno. Nessun altro file costruisce o spezza chiavi a mano.
 */
export function qualify(family: Family, key: string): string {
  return `${family}/${key}`
}

/**
 * Si taglia al **primo** `/`: il nome di famiglia non ne contiene mai, quindi una chiave interna
 * con `/` resta intatta. Una chiave senza famiglia valida è un difetto dell'app e si segnala con
 * un'eccezione, invece di finire assegnata a una famiglia a caso.
 */
export function splitKey(qualified: string): { family: Family; key: string } {
  const i = qualified.indexOf("/")
  const family = i < 0 ? "" : qualified.slice(0, i)
  if (!(FAMILIES as readonly string[]).includes(family)) throw new Error(`chiave senza famiglia: ${qualified}`)
  return { family: family as Family, key: qualified.slice(i + 1) }
}

/** Le chiavi selezionate di un tipo che appartengono a una famiglia, senza prefisso: servono ai pannelli di famiglia. */
export function familySelectedKeys(selection: ReadonlySet<string>, kind: SelectionKind, family: Family): string[] {
  return [...selection].flatMap((id) => {
    const sel = parseSelId(id)
    if (sel.kind !== kind) return []
    const split = splitKey(sel.key)
    return split.family === family ? [split.key] : []
  })
}

type Editing = NonNullable<SessionState["editing"]>

/** L'editing in corso, senza prefisso, se riguarda questa famiglia; altrimenti `null`. */
export function editingIn(editing: SessionState["editing"], family: Family): { key: string; target: Editing["target"] } | null {
  if (!editing) return null
  const split = splitKey(editing.key)
  return split.family === family ? { key: split.key, target: editing.target } : null
}

/**
 * Le famiglie presenti nel documento. **Solo per la fase A** del piano: finché il documento ha un
 * tipo, è quel tipo. Il Task 5 la rimuove e i chiamanti usano `FAMILIES`.
 */
export function documentFamilies(doc: DevDocument): readonly Family[] {
  return [doc.diagram.type]
}
```

- [ ] **Step 4: Verifica che passi**

Run: `pnpm vitest run src/editor/families.test.ts && pnpm tsc -b && pnpm lint`
Expected: PASS, nessun errore

- [ ] **Step 5: Commit**

```bash
git add src/model/family.ts src/editor/families.ts src/editor/families.test.ts
git commit -m "feat(editor): famiglie e chiavi con prefisso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Strumenti per famiglia e «Collega» unico

**Files:**
- Modify: `src/editor/session-store.ts`
- Modify: `src/editor/interaction.ts:39-48,74-78`
- Modify: `src/ui/canvas/interaction-runner.ts` (`step`: passa `family` nel contesto)
- Modify: `src/ui/canvas/kinds/registry.ts`
- Modify: `src/ui/canvas/kinds/er.tsx`, `class.tsx`, `flow.tsx` (solo `tools`)
- Modify: `src/ui/ToolSidebar.tsx`
- Modify: `src/ui/use-keyboard-shortcuts.ts`
- Modify: `src/ui/panels/PropertiesPanel.tsx` (frase senza selezione)
- Modify: `scripts/e2e/flow.mjs:159`, `scripts/e2e/class.mjs:180`, `scripts/e2e/class-note.mjs:107,165`
- Test: `src/ui/canvas/kinds/registry.test.ts`, `src/editor/interaction.test.ts`, `src/io/document-io.test.ts:114`

**Interfaces:**
- Consumes: `Family`, `FAMILIES` (Task 1), `documentFamilies` (Task 1).
- Produces:
  - `SessionState.family: Family | null`
  - `setTool(tool: Tool, family?: Family | null, variant?: string | null): void`
  - `Context.family?: Family | null`
  - `Effect "create-node": { type: "create-node"; at: Point; family: Family; variant?: string }`
  - `ToolDef.family: Family | null`
  - `toolId(def: Pick<ToolDef, "tool" | "family" | "variant">): string`
  - `LINK_TOOL: ToolDef`, `FAMILY_LABEL: Record<Family, string>`
  - `canvasTools(families: readonly Family[]): ToolDef[]` (strumenti delle famiglie nell'ordine dato, poi `LINK_TOOL`)
  - `useDocumentFamilies(): readonly Family[]` (hook, solo fase A)
  - `viewFor(family: Family): DiagramView`

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/ui/canvas/kinds/registry.test.ts` aggiorna le aspettative sugli strumenti e aggiungi due blocchi. Nel test «torna viste distinte…» sostituisci le due `expect(...tools).toEqual([...])` con:

```ts
    expect(er.tools).toEqual([{ label: "Entità", key: "e", Icon: Square, tool: "node", family: "er" }])
    expect(cls.tools).toEqual([
      { label: "Classe", key: "c", Icon: Box, tool: "node", family: "class" },
      { label: "Interfaccia", key: "i", Icon: SquareDashed, tool: "node", family: "class", variant: "interface" },
      { label: "Enum", key: "u", Icon: ListOrdered, tool: "node", family: "class", variant: "enum" },
      { label: "Nota di classe", key: "n", Icon: StickyNote, tool: "node", family: "class", variant: "note" },
    ])
```

(Se nello stesso file c'è un'aspettativa sugli strumenti del flowchart, aggiornala nello stesso modo: `family: "flow"` su ogni forma, la forma `note` con etichetta «Nota di flusso», e niente «Arco».) Poi aggiungi in fondo:

```ts
describe("canvasTools", () => {
  it("mette gli strumenti delle famiglie nell'ordine dato, poi Collega", () => {
    const tools = canvasTools(["er", "flow"])
    expect(tools[0]!.label).toBe("Entità")
    expect(tools.at(-1)).toBe(LINK_TOOL)
    expect(tools.filter((t) => t.tool === "edge")).toEqual([LINK_TOOL])
  })

  it("su tutte le famiglie tasti, etichette e id sono unici", () => {
    const tools = canvasTools(FAMILIES)
    const unique = (xs: string[]) => new Set(xs).size === xs.length
    expect(unique(tools.map((t) => t.key))).toBe(true)
    expect(unique(tools.map((t) => t.label))).toBe(true)
    expect(unique(tools.map(toolId))).toBe(true)
    // «v» è Seleziona, che non sta in `canvasTools`: nessuno strumento può rubarla.
    expect(tools.some((t) => t.key === "v")).toBe(false)
  })
})

describe("toolId", () => {
  it("distingue due note di famiglie diverse", () => {
    expect(toolId({ tool: "node", family: "class", variant: "note" })).toBe("node:class:note")
    expect(toolId({ tool: "node", family: "flow", variant: "note" })).toBe("node:flow:note")
    expect(toolId({ tool: "select", family: null })).toBe("select")
    expect(toolId(LINK_TOOL)).toBe("edge")
  })
})
```

Aggiorna gli import del file di test: `import { canvasTools, LINK_TOOL, toolId, viewFor } from "./registry"` e `import { FAMILIES } from "@/model/family"`. Togli `Spline` se non serve più.

In `src/editor/interaction.test.ts` aggiorna i test «strumento nodo con variante». Ogni contesto con `tool: "node"` riceve `family: "flow"` (o `"er"` dove la variante manca), e ogni effetto atteso `create-node` riceve lo stesso `family`:

```ts
      { tool: "node", family: "flow", variant: "decision", selection: new Set() },
    )
    expect(step.effects).toEqual([{ type: "create-node", at: { x: 10, y: 20 }, family: "flow", variant: "decision" }])
```

Aggiungi:

```ts
  it("senza famiglia lo strumento nodo non crea niente", () => {
    const step = reduce(IDLE, down({ hit: { kind: "canvas" }, world: { x: 10, y: 20 } }), ctx({ tool: "node", family: null }))
    expect(step.effects.some((e) => e.type === "create-node")).toBe(false)
  })
```

(`down` e `ctx` sono gli helper in testa al file: `down(info, spaceHeld?)` costruisce l'evento, `ctx(over)` il contesto con `tool: "select"` di default.)

In `src/io/document-io.test.ts:114` cambia `setTool("node", "note")` in `setTool("node", "class", "note")`, e l'aspettativa corrispondente in `expect(sessionStore.getState().family).toBeNull()` accanto a quella su `variant`.

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm vitest run src/ui/canvas/kinds/registry.test.ts src/editor/interaction.test.ts`
Expected: FAIL (manca `canvasTools`, `family` non è negli effetti)

- [ ] **Step 3: Implementa**

`src/editor/session-store.ts`: aggiungi `import type { Family } from "@/model/family"`, il campo e la firma:

```ts
  tool: Tool
  /** Famiglia dello strumento nodo attivo: sceglie dove `addNode` crea il nodo. `null` per Seleziona e Collega. */
  family: Family | null
  /** Variante dello strumento corrente: la forma, per le famiglie che ne hanno più d'una. Opaca qui. */
  variant: string | null
```

```ts
  setTool: (tool: Tool, family?: Family | null, variant?: string | null) => void
```

```ts
  tool: "select",
  family: null,
  variant: null,
```

```ts
  setTool: (tool, family = null, variant = null) => set({ tool, family, variant }),
```

`src/editor/interaction.ts`: `import type { Family } from "@/model/family"`, poi:

```ts
  | { type: "create-node"; at: Point; family: Family; variant?: string }
```

```ts
export interface Context {
  tool: Tool
  family?: Family | null
  variant?: string
  selection: ReadonlySet<string>
}
```

```ts
  if (ctx.tool === "node") {
    if (info.hit.kind === "canvas" && ctx.family) {
      return { mode: IDLE, effects: [{ type: "create-node", at: info.world, family: ctx.family, variant: ctx.variant }] }
    }
  }
```

`src/ui/canvas/interaction-runner.ts`, in `step`:

```ts
    const result = reduce(mode, event, {
      tool: session().tool,
      family: session().family,
      variant: session().variant ?? undefined,
      selection: session().selection,
    })
```

Il ramo `create-node` resta com'è (`opsFor(doc).addNode(fx.at, fx.variant)`): nella fase A il documento ha una famiglia sola, e la famiglia la userà `canvasOps` nel Task 3.

`src/ui/canvas/kinds/registry.ts`:

```ts
import { Spline, type LucideIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { documentFamilies } from "@/editor/families"
import type { Family } from "@/model/family"
```

```ts
export interface ToolDef {
  label: string
  key: string
  Icon: LucideIcon
  tool: Tool
  /** Famiglia in cui lo strumento crea: `null` per Collega, che non crea nodi. */
  family: Family | null
  /** Passata ad `addNode`: la forma, per le famiglie che ne hanno più d'una. */
  variant?: string
}

/**
 * Identità di uno strumento nel ToggleGroup. La famiglia serve: «Nota di classe» e «Nota di flusso»
 * sono entrambe `node` con variante `note`, e senza la famiglia avrebbero lo stesso id.
 */
export function toolId(def: Pick<ToolDef, "tool" | "family" | "variant">): string {
  return [def.tool, def.family, def.variant].filter(Boolean).join(":")
}

/**
 * Lo strumento per collegare, uno solo per tutte le famiglie: il tipo di arco lo decidono gli
 * estremi (`CanvasOps.addEdge`), non lo strumento.
 */
export const LINK_TOOL: ToolDef = { label: "Collega", key: "r", Icon: Spline, tool: "edge", family: null }

/** Nome del gruppo della sidebar: è anche il nome accessibile del `role="group"`. */
export const FAMILY_LABEL: Record<Family, string> = { er: "ER", class: "Classi", flow: "Flusso" }

/** Gli strumenti del canvas nell'ordine della sidebar: famiglia per famiglia, poi Collega. «Seleziona» non è qui: non crea niente. */
export function canvasTools(families: readonly Family[]): ToolDef[] {
  return [...families.flatMap((family) => viewFor(family).tools), LINK_TOOL]
}
```

Cambia `viewFor(type: Diagram["type"])` in `viewFor(family: Family)` e togli l'import di `Diagram` se non serve più. Aggiungi, accanto a `useDiagramView`:

```ts
/** Le famiglie del documento aperto (fase A: il suo tipo). Il Task 5 la sostituisce con `FAMILIES`. */
export function useDocumentFamilies(): readonly Family[] {
  return useStore(documentStore, useShallow((s) => documentFamilies(s.doc)))
}
```

`src/ui/canvas/kinds/er.tsx`: `tools: [{ label: "Entità", key: "e", Icon: Square, tool: "node", family: "er" }]`. Togli `Spline` dagli import se non si usa più.

`src/ui/canvas/kinds/class.tsx`:

```ts
  tools: [
    { label: "Classe", key: "c", Icon: Box, tool: "node", family: "class" },
    { label: "Interfaccia", key: "i", Icon: SquareDashed, tool: "node", family: "class", variant: "interface" },
    // «u» e non «e»: «e» è Entità, e sulla sidebar unica le scorciatoie devono essere uniche.
    { label: "Enum", key: "u", Icon: ListOrdered, tool: "node", family: "class", variant: "enum" },
    { label: "Nota di classe", key: "n", Icon: StickyNote, tool: "node", family: "class", variant: "note" },
  ],
```

`src/ui/canvas/kinds/flow.tsx`:

```ts
  tools: FLOW_SHAPES.map((shape, i) => ({
    // La nota ha un'etichetta sua solo qui: il select delle forme nel pannello resta «Nota».
    label: shape === "note" ? "Nota di flusso" : FLOW_SHAPE_LABEL[shape],
    key: String(i + 1),
    Icon: FLOW_SHAPE_ICON[shape],
    tool: "node" as const,
    family: "flow" as const,
    variant: shape,
  })),
```

Togli `Spline` dagli import.

`src/ui/ToolSidebar.tsx`: sostituisci il corpo del componente con:

```tsx
export function ToolSidebar() {
  const tool = useStore(sessionStore, (s) => s.tool)
  const family = useStore(sessionStore, (s) => s.family)
  const variant = useStore(sessionStore, (s) => s.variant)
  const setTool = useStore(sessionStore, (s) => s.setTool)
  const families = useDocumentFamilies()
  const tools = canvasTools(families)
  const current = toolId({ tool, family, variant: variant ?? undefined })

  return (
    <nav aria-label="Strumenti" className="flex flex-col items-center border-r py-2">
      <ToggleGroup
        type="single"
        orientation="vertical"
        className="flex-col"
        value={current}
        onValueChange={(v) => {
          if (!v) return
          if (v === "select") return setTool("select")
          const def = tools.find((t) => toolId(t) === v)
          if (def) setTool(def.tool, def.family, def.variant ?? null)
        }}
      >
        <Hint label="Seleziona (V)" side="right"><ToggleGroupItem value="select" aria-label="Seleziona" className={TOOL_ITEM}><MousePointer2 /></ToggleGroupItem></Hint>
        {families.map((f) => (
          <div key={f} role="group" aria-label={FAMILY_LABEL[f]} className="mt-1 flex flex-col border-t pt-1">
            {tools.filter((t) => t.family === f).map((def) => <ToolItem key={toolId(def)} def={def} />)}
          </div>
        ))}
        <div className="mt-1 flex flex-col border-t pt-1"><ToolItem def={LINK_TOOL} /></div>
      </ToggleGroup>
    </nav>
  )
}
```

Import: `import { canvasTools, FAMILY_LABEL, LINK_TOOL, toolId, useDocumentFamilies, type ToolDef } from "./canvas/kinds/registry"`. Togli `useDiagramView`. Aggiorna il docblock: «Seleziona, gli strumenti di ogni famiglia del documento in gruppi, e Collega».

`src/ui/use-keyboard-shortcuts.ts`: sostituisci la riga `const tools = viewFor(doc.doc.diagram.type).tools` con `const tools = canvasTools(documentFamilies(doc.doc))` e la chiamata con `session.setTool(def.tool, def.family, def.variant ?? null)`. Import: `canvasTools` da `./canvas/kinds/registry`, `documentFamilies` da `@/editor/families`; togli `viewFor`. Nel docblock in fondo sostituisci la riga delle lettere con: «le lettere degli strumenti vengono da `canvasTools` (E entità · C I U N classi · 1–6 forme del flusso · R collega)».

`src/ui/panels/PropertiesPanel.tsx`: togli `indeterminateArticle` e il calcolo di `nodeLabel`/`edgeLabel`/`vuoto`. La frase diventa:

```tsx
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? "Seleziona un elemento sul canvas." : `${selection.size} elementi selezionati`}
    </p>
  )
```

Aggiorna il docblock: niente più biforcazione per tipo, la frase è unica.

E2E: in `scripts/e2e/flow.mjs:159` `{ name: "Arco" }` → `{ name: "Collega" }`; in `scripts/e2e/class.mjs:180` e `scripts/e2e/class-note.mjs:165` `{ name: "Relazione" }` → `{ name: "Collega" }`; in `scripts/e2e/class-note.mjs:107` `{ name: "Nota" }` → `{ name: "Nota di classe" }`.

- [ ] **Step 4: Verifica che passi**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: tutto verde. Se `tsc` segnala altri usi di `setTool(tool, variant)` o di `ToolDef` senza `family`, correggili con la stessa forma: `setTool(tool, family, variant)`, e `family` esplicito su ogni `ToolDef`.

- [ ] **Step 5: Verifica nel browser**

`pnpm dev` (o il preview già aperto): documento ER con i gruppi «ER» e Collega; documento di classi con Enum su `U`; flowchart con «Nota di flusso» su `6`. Il tasto `R` attiva Collega, e collegare due entità crea una relazione.

- [ ] **Step 6: Commit**

```bash
git add -A src scripts/e2e
git commit -m "feat(ui): strumenti per famiglia e un solo Collega

Ogni strumento dichiara la sua famiglia e la sessione la ricorda: sarà
lei a dire dove nasce un nodo quando le famiglie convivono. Relazione e
Arco diventano un solo Collega (R); Enum passa a U, le note diventano
«Nota di classe» e «Nota di flusso», perché su una sidebar sola tasti ed
etichette devono essere unici.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Chiavi con prefisso da un capo all'altro

Il task più grande della fase A. Al termine, ogni chiave che canvas, selezione, editing, `dom-registry` e pannello Problemi conoscono ha il prefisso. Il documento ha ancora una famiglia sola, quindi per l'utente non cambia niente, e gli e2e lo confermano.

**Files:**
- Modify: `src/editor/kinds/ops.ts` (aggiungi `familyOps`)
- Create: `src/editor/kinds/canvas-ops.ts`
- Test: `src/editor/kinds/canvas-ops.test.ts`
- Modify: `src/editor/actions.ts`, `src/editor/actions.test.ts`
- Modify: `src/ui/canvas/interaction-runner.ts`, `src/ui/canvas/interaction-runner.test.ts`
- Modify: viste `src/ui/canvas/{EntityNode,ClassNode,ClassNote,FlowNode,RelationshipEdge,ClassEdge,FlowEdge}.tsx`
- Modify: editor `src/ui/canvas/{InlineEditor,MembersEditor,NoteEditor,FlowNodeEditor}.tsx`
- Modify: `src/ui/canvas/use-canvas-interaction.ts` (doppio click)
- Modify: `src/ui/canvas/kinds/er.tsx` (`Properties`), `src/ui/panels/{ClassProperties,FlowProperties,PropertiesPanel,IssuesPanel}.tsx`
- Modify: `src/ui/entity-rename.ts`, `src/ui/class-rename.ts`
- Test: `src/ui/entity-rename.test.ts` (nuovo)

**Interfaces:**
- Consumes: `qualify`, `splitKey`, `familySelectedKeys`, `editingIn`, `documentFamilies` (Task 1); `Effect "create-node"` con `family` (Task 2).
- Produces:
  - `familyOps(doc: DevDocument, family: Family): DiagramOps` in `ops.ts`. `opsFor(doc)` diventa `familyOps(doc, doc.diagram.type)` e sparisce nel Task 5.
  - In `canvas-ops.ts`:

    ```ts
    export interface CanvasOps {
      nodeKeys(): string[]
      rectOf(key: string, at?: Point): Rect | null
      edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
      edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
      addNode(at: Point, family: Family, variant?: string): { key: string; recipe: Recipe; edit: EditTarget }
      addEdge(source: string, target: string): { key: string; recipe: Recipe } | null
      commitDrag(keys: readonly string[], dx: number, dy: number): Recipe | null
      deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
      duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
      validate(): Issue[]
    }
    export function canvasOps(doc: DevDocument): CanvasOps
    ```

    Tutte le chiavi in ingresso e in uscita hanno il prefisso.

- [ ] **Step 1: Scrivi il test che fallisce di `canvas-ops`**

`src/editor/kinds/canvas-ops.test.ts`. Nella fase A un documento ha una famiglia sola, quindi i casi misti si provano costruendo il documento a mano in un test del Task 5 (vedi Step 1 di quel task). Qui si fissano instradamento e prefisso:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument } from "@/model/er/schema"
import { addEntity, addRelationship, removeAttribute } from "../commands/er"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { canvasOps } from "./canvas-ops"

const state = () => documentStore.getState()

/**
 * Due entità e una relazione, create coi comandi veri. Le chiavi le sceglie `addEntity`. Passa da
 * `erDiagram` e non da `doc.diagram.model`: così il file resta valido anche dopo il Task 5, dove
 * l'accessor legge la parte `er`.
 */
function erConDueEntita() {
  state().load(createErDocument("t", "t"))
  const a = addEntity(erDiagram(state().doc).model.entities, { x: 0, y: 0 })
  state().dispatch(a.recipe)
  const b = addEntity(erDiagram(state().doc).model.entities, { x: 300, y: 0 })
  state().dispatch(b.recipe)
  const rel = addRelationship(erDiagram(state().doc).model.relationships, a.key, b.key)
  state().dispatch(rel.recipe)
  return { a: a.key, b: b.key, rel: rel.key }
}

beforeEach(() => state().load(createErDocument("t", "t")))

describe("canvasOps (una famiglia)", () => {
  it("nodeKeys e edgesTouching danno chiavi con prefisso", () => {
    const { a, b, rel } = erConDueEntita()
    const ops = canvasOps(state().doc)
    expect(ops.nodeKeys().sort()).toEqual([`er/${a}`, `er/${b}`].sort())
    expect(ops.edgesTouching(new Set([`er/${a}`]))).toEqual([{ key: `er/${rel}`, source: `er/${a}`, target: `er/${b}` }])
  })

  it("rectOf ed edgeGeometry accettano chiavi con prefisso", () => {
    const { a, b, rel } = erConDueEntita()
    const ops = canvasOps(state().doc)
    const ra = ops.rectOf(`er/${a}`)!
    const rb = ops.rectOf(`er/${b}`)!
    expect(ra.x).toBe(0)
    expect(ops.edgeGeometry(`er/${rel}`, ra, rb)).not.toBeNull()
  })

  it("addNode crea nella famiglia data e restituisce la chiave con prefisso", () => {
    const { key, recipe, edit } = canvasOps(state().doc).addNode({ x: 10, y: 10 }, "er")
    expect(key.startsWith("er/")).toBe(true)
    expect(edit).toBe("name")
    state().dispatch(recipe)
    expect(canvasOps(state().doc).nodeKeys()).toContain(key)
  })

  it("addEdge fra due nodi della stessa famiglia collega, fra famiglie diverse no", () => {
    const { a, b } = erConDueEntita()
    const ops = canvasOps(state().doc)
    const r = ops.addEdge(`er/${a}`, `er/${b}`)
    expect(r?.key.startsWith("er/")).toBe(true)
    // Nella fase A non esiste un secondo nodo di un'altra famiglia; basta la chiave per il rifiuto,
    // che avviene prima di interrogare la famiglia.
    expect(ops.addEdge(`er/${a}`, "flow/n1")).toBeNull()
  })

  it("deleteItems e duplicateNodes accettano e restituiscono chiavi con prefisso", () => {
    const { a, b } = erConDueEntita()
    const dup = canvasOps(state().doc).duplicateNodes([`er/${a}`])
    expect(dup.keys).toHaveLength(1)
    expect(dup.keys[0]!.startsWith("er/")).toBe(true)
    state().dispatch(canvasOps(state().doc).deleteItems([`er/${b}`], [])!)
    expect(canvasOps(state().doc).nodeKeys()).not.toContain(`er/${b}`)
  })

  it("commitDrag sposta con una sola recipe", () => {
    const { a } = erConDueEntita()
    state().dispatch(canvasOps(state().doc).commitDrag([`er/${a}`], 40, 0)!)
    expect(canvasOps(state().doc).rectOf(`er/${a}`)!.x).toBe(40)
  })

  it("validate mette il prefisso sugli obiettivi", () => {
    const { a } = erConDueEntita()
    // Un'entità nuova ha già la PK `id` (DEFAULT_ATTRIBUTE): togliendola il problema è certo.
    state().dispatch(removeAttribute(a, 0))
    const issues = canvasOps(state().doc).validate()
    expect(issues.some((i) => i.code === "entity-without-pk" && i.node === `er/${a}`)).toBe(true)
    for (const i of issues) {
      if (i.node) expect(i.node.startsWith("er/")).toBe(true)
      if (i.edge) expect(i.edge.startsWith("er/")).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Verifica che fallisca**

Run: `pnpm vitest run src/editor/kinds/canvas-ops.test.ts`
Expected: FAIL, `Failed to resolve import "./canvas-ops"`

- [ ] **Step 3: Implementa `familyOps` e `canvasOps`**

In `src/editor/kinds/ops.ts` sostituisci `opsFor` con:

```ts
/** Le `DiagramOps` di una famiglia del documento, chiuse sullo snapshot. Chiavi senza prefisso. */
export function familyOps(doc: DevDocument, family: Family): DiagramOps {
  switch (family) {
    case "er":
      return erOps(doc)
    case "class":
      return classOps(doc)
    case "flow":
      return flowOps(doc)
  }
}

/** Solo fase A: le ops dell'unica famiglia del documento. Il Task 5 la rimuove. */
export function opsFor(doc: DevDocument): DiagramOps {
  return familyOps(doc, doc.diagram.type)
}
```

con `import type { Family } from "@/model/family"`.

`src/editor/kinds/canvas-ops.ts`:

```ts
import type { DevDocument } from "@/model/document"
import type { Family } from "@/model/family"
import type { Issue } from "@/model/issue"
import { moveNodes } from "../commands/view"
import type { Recipe } from "../document-store"
import type { EdgeGeometry } from "../edge-routing"
import { documentFamilies, qualify, splitKey } from "../families"
import type { Point, Rect } from "../geometry"
import { familyOps, type EdgeEnds, type EditTarget } from "./ops"

/**
 * Il solo contratto con cui canvas e azioni condivise parlano: gli stessi metodi di `DiagramOps`,
 * ma su **chiavi con prefisso** e su tutte le famiglie del documento. Ogni chiamata va alla famiglia
 * della chiave, e le chiavi che tornano riprendono il prefisso. Le famiglie non vedono mai il
 * prefisso (spec §4).
 */
export interface CanvasOps {
  nodeKeys(): string[]
  rectOf(key: string, at?: Point): Rect | null
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
  addNode(at: Point, family: Family, variant?: string): { key: string; recipe: Recipe; edit: EditTarget }
  /** `null` fra famiglie diverse: i collegamenti fra famiglie arrivano con lo step 4. */
  addEdge(source: string, target: string): { key: string; recipe: Recipe } | null
  /** Una recipe sola per tutta la selezione, anche mista: un passo di annulla. */
  commitDrag(keys: readonly string[], dx: number, dy: number): Recipe | null
  deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
  duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
  validate(): Issue[]
}

/** Raggruppa chiavi con prefisso per famiglia, togliendo il prefisso. L'ordine delle chiavi resta quello dato. */
function byFamily(keys: Iterable<string>): Map<Family, string[]> {
  const out = new Map<Family, string[]>()
  for (const qualified of keys) {
    const { family, key } = splitKey(qualified)
    const list = out.get(family)
    if (list) list.push(key)
    else out.set(family, [key])
  }
  return out
}

/** Più recipe di famiglia sullo stesso draft, in sequenza: un solo passo di annulla. `null` se non ce n'è nessuna. */
function combine(recipes: readonly (Recipe | null)[]): Recipe | null {
  const present = recipes.filter((r): r is Recipe => r !== null)
  if (present.length === 0) return null
  return (draft) => {
    for (const recipe of present) recipe(draft)
  }
}

const NOOP: Recipe = () => {}

export function canvasOps(doc: DevDocument): CanvasOps {
  const families = documentFamilies(doc)
  const ops = (family: Family) => familyOps(doc, family)

  return {
    nodeKeys: () => families.flatMap((f) => ops(f).nodeKeys().map((k) => qualify(f, k))),

    rectOf: (qualified, at) => {
      const { family, key } = splitKey(qualified)
      return ops(family).rectOf(key, at)
    },

    edgesTouching: (keys) =>
      [...byFamily(keys)].flatMap(([f, ks]) =>
        ops(f)
          .edgesTouching(new Set(ks))
          .map((e) => ({ key: qualify(f, e.key), source: qualify(f, e.source), target: qualify(f, e.target) })),
      ),

    edgeGeometry: (qualified, a, b) => {
      const { family, key } = splitKey(qualified)
      return ops(family).edgeGeometry(key, a, b)
    },

    addNode: (at, family, variant) => {
      const created = ops(family).addNode(at, variant)
      return { ...created, key: qualify(family, created.key) }
    },

    addEdge: (source, target) => {
      const a = splitKey(source)
      const b = splitKey(target)
      if (a.family !== b.family) return null
      const created = ops(a.family).addEdge(a.key, b.key)
      return created && { ...created, key: qualify(a.family, created.key) }
    },

    commitDrag: (keys, dx, dy) =>
      combine(
        [...byFamily(keys)].map(([f, ks]) => {
          const o = ops(f)
          return o.commitDrag ? o.commitDrag(ks, dx, dy) : moveNodes(ks, dx, dy)
        }),
      ),

    deleteItems: (nodeKeys, edgeKeys) => {
      const nodes = byFamily(nodeKeys)
      const edges = byFamily(edgeKeys)
      const touched = new Set([...nodes.keys(), ...edges.keys()])
      return combine([...touched].map((f) => ops(f).deleteItems(nodes.get(f) ?? [], edges.get(f) ?? [])))
    },

    duplicateNodes: (keys) => {
      const parts = [...byFamily(keys)].map(([f, ks]) => {
        const dup = ops(f).duplicateNodes(ks)
        return { keys: dup.keys.map((k) => qualify(f, k)), recipe: dup.recipe }
      })
      return { keys: parts.flatMap((p) => p.keys), recipe: combine(parts.map((p) => p.recipe)) ?? NOOP }
    },

    validate: () =>
      families.flatMap((f) =>
        ops(f)
          .validate()
          .map((issue) => ({
            ...issue,
            ...(issue.node !== undefined && { node: qualify(f, issue.node) }),
            ...(issue.edge !== undefined && { edge: qualify(f, issue.edge) }),
          })),
      ),
  }
}
```

Run: `pnpm vitest run src/editor/kinds/canvas-ops.test.ts`
Expected: PASS

- [ ] **Step 4: Porta azioni e runner su `canvasOps`**

`src/editor/actions.ts`: sostituisci `opsFor(documentStore.getState().doc)` con `canvasOps(documentStore.getState().doc)` in `deleteSelection`, `duplicateSelection`, `selectAllNodes`, `fitToContent`. Import: `import { canvasOps } from "./kinds/canvas-ops"`; togli `opsFor`. Non serve cambiare altro: le chiavi della selezione hanno già il prefisso, e quelle restituite anche.

`src/ui/canvas/interaction-runner.ts`: sostituisci ogni `opsFor(documentStore.getState().doc)` con `canvasOps(documentStore.getState().doc)`. Il ramo `commit-drag` diventa:

```ts
      case "commit-drag": {
        if (dragTargets) resetDragTargets(dragTargets)
        const recipe = canvasOps(documentStore.getState().doc).commitDrag(fx.keys, fx.dx, fx.dy)
        if (recipe) documentStore.getState().dispatch(recipe)
        break
      }
```

Aggiorna il docblock di `resetDragTargets`. Il reset ora avviene **sempre**: una selezione mista può contenere nodi di una famiglia con `commitDrag` e nodi di un'altra senza, e il reset è innocuo per ER e classi, perché React riscrive i nodi la cui view è cambiata e quelli rimasti fermi sono già tornati alla posizione di partenza. Togli l'import di `moveNodes`.

Il ramo `create-node` diventa:

```ts
      case "create-node": {
        const { key, recipe, edit } = canvasOps(documentStore.getState().doc).addNode(fx.at, fx.family, fx.variant)
```

(il resto del ramo è invariato).

Import: `import { canvasOps } from "@/editor/kinds/canvas-ops"` e `import type { EdgeEnds } from "@/editor/kinds/ops"`.

- [ ] **Step 5: Viste con chiavi DOM e selezione con prefisso**

In ognuna delle sette viste, la vista pura usa la chiave con prefisso per `data-*-id` e `register*`, e il componente connesso la usa per la selezione. Ogni vista conosce la sua famiglia e la scrive come letterale. Import in ognuna: `import { qualify } from "@/editor/families"`.

`src/ui/canvas/EntityNode.tsx` (famiglia `"er"`), nella vista pura:

```tsx
export const EntityNodeView = memo(function EntityNodeView({ nodeKey, entity, view, selected }: Props) {
  const id = qualify("er", nodeKey)
  ...
    <g
      data-node-id={id}
      transform={`translate(${view.x} ${view.y})`}
      ref={(el) => {
        registerNode(id, el)
        return () => registerNode(id, null)
      }}
    >
```

nel connesso:

```tsx
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("node", qualify("er", nodeKey))))
```

Stessa sostituzione in:
- `ClassNode.tsx` e `ClassNote.tsx` con `"class"` (`data-node-id`, `registerNode`, `selId("node", …)`);
- `FlowNode.tsx` con `"flow"`;
- `RelationshipEdge.tsx` con `"er"`: `data-edge-id={id}`, `registerEdge(id, …)`, `selId("edge", qualify("er", edgeKey))`;
- `ClassEdge.tsx` con `"class"`, stessi tre punti;
- `FlowEdge.tsx` con `"flow"`, stessi tre punti.

In `ClassEdge.tsx:74` e `FlowEdge.tsx:57` gli hook dei rettangoli usano le ops di famiglia, su chiavi senza prefisso:

```ts
    useShallow((s) => (key ? familyOps(s.doc, "class").rectOf(key) : null)),
```

(`"flow"` in `FlowEdge.tsx`), con `import { familyOps } from "@/editor/kinds/ops"` al posto di `opsFor`. Aggiorna nei due docblock il riferimento `opsFor(doc).rectOf` con `familyOps(doc, …).rectOf`.

- [ ] **Step 6: Editor e doppio click**

`src/ui/canvas/MembersEditor.tsx`:

```ts
  const editing = useStore(sessionStore, (s) => s.editing)
  const own = editingIn(editing, "class")
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const cls = useStore(documentStore, (s) => (own?.target === "body" ? classDiagram(s.doc).model.classes[own.key] : undefined))
  const view = useStore(documentStore, (s) => (own?.target === "body" ? classDiagram(s.doc).view.nodes[own.key] : undefined))
  ...
  if (!own || own.target !== "body" || !cls || !view) return null
```

Nel resto del componente sostituisci ogni `editing.key` con `own.key`. Import: `import { editingIn } from "@/editor/families"`. Stessa forma in:
- `NoteEditor.tsx` (`"class"`, `model.notes`);
- `FlowNodeEditor.tsx` (`"flow"`, `flowDiagram(s.doc).model.nodes`/`view.nodes`). Nel commit: `setNodeLabel(own.key, value)`.

`src/ui/canvas/InlineEditor.tsx`:
- `EntityNameEditor`, `ClassNameEditor` e `FlowEdgeLabelEditor` ricevono ora `editing` **senza prefisso**. Il tipo della prop resta `Editing`, perché `{ key, target }` ha la stessa forma.
- In `FlowEdgeLabelEditor` il selettore diventa `flowDiagram(s.doc).model.edges[editing.key]`, senza la guardia sul tipo, e `const ops = familyOps(s.doc, "flow")` al posto di `opsFor(s.doc)`.
- `nameEditorFor(type: Diagram["type"], …)` diventa `nameEditorFor(family: Family, …)`, con lo stesso switch.
- `InlineEditor` diventa:

```tsx
export function InlineEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const close = () => sessionStore.getState().setEditing(null)
  if (!editing) return null
  const { family, key } = splitKey(editing.key)
  const own = { key, target: editing.target }
  if (own.target === "label") return family === "flow" ? <FlowEdgeLabelEditor editing={own} viewport={viewport} close={close} /> : null
  if (own.target !== "name") return null
  return nameEditorFor(family, own, viewport, close)
}
```

Import: `splitKey` da `@/editor/families`, `familyOps` da `@/editor/kinds/ops`, `type Family` da `@/model/family`. Togli `opsFor` e `Diagram`.

`src/ui/canvas/use-canvas-interaction.ts`, `onDblClick`:

```ts
    const onDblClick = (e: MouseEvent) => {
      const el = elementAt(e)
      const hit = hitTest(el)
      if (hit.kind === "canvas") return
      const { family, key } = splitKey(hit.key)
      // Solo il flusso ha un'etichetta sull'arco (spec §8 del flowchart): va prima della guardia
      // sul nodo qui sotto, che altrimenti la scarterebbe.
      if (family === "flow" && hit.kind === "edge") {
        session().setEditing({ key: hit.key, target: "label" })
        return
      }
      if (hit.kind !== "node") return
      const headerHit = !!el?.closest("[data-node-header]")
      if (family === "class") {
        session().setEditing({ key: hit.key, target: classEditTarget(key, headerHit) })
        return
      }
      if (family === "flow") {
        session().setEditing({ key: hit.key, target: "body" })
        return
      }
      if (headerHit) session().setEditing({ key: hit.key, target: "name" })
    }
```

Mantieni i commenti esistenti sui singoli rami. `setEditing` riceve la chiave **con** prefisso, mentre `classEditTarget` la riceve **senza**. Import `splitKey`.

- [ ] **Step 7: Pannelli e rinomine**

`src/ui/canvas/kinds/er.tsx`, `Properties`: `selectedKeys(selection, "node")` → `familySelectedKeys(selection, "node", "er")`, e lo stesso per `"edge"`. Stessa sostituzione in `ClassProperties.tsx:188,194` (`"class"`) e `FlowProperties.tsx:98,100` (`"flow"`). In `ClassProperties.tsx:103` e `FlowProperties.tsx:26`:

```ts
  const editingHere = useStore(sessionStore, (s) => s.editing?.key === qualify("class", key) && s.editing.target === "body")
```

(`"flow"` nel secondo).

`src/ui/panels/PropertiesPanel.tsx`: il pannello viene scelto dalla famiglia della selezione:

```tsx
  if (single) {
    const { family } = splitKey((nodes[0] ?? edges[0])!)
    const { Properties } = viewFor(family)
    return <Properties />
  }
```

Il ramo `EmptyProperties` resta su `useDiagramView()` fino al Task 4.

`src/ui/panels/IssuesPanel.tsx`: `opsFor(doc).validate()` → `canvasOps(doc).validate()`. Le chiavi degli obiettivi hanno già il prefisso, quindi `select` resta com'è.

`src/ui/entity-rename.ts`: `setSelection([selId("node", qualify("er", newKey))])`. `src/ui/class-rename.ts`: `setSelection([selId("node", qualify("class", newName))])`.

- [ ] **Step 8: Test sulla rinomina (Review Focus 3)**

`src/ui/entity-rename.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { addEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { selId, sessionStore } from "@/editor/session-store"
import { createErDocument } from "@/model/er/schema"
import { renameEntityWithNotice } from "./entity-rename"

beforeEach(() => documentStore.getState().load(createErDocument("t", "t")))

describe("renameEntityWithNotice", () => {
  it("la selezione segue la nuova chiave, con il prefisso", () => {
    const { key, recipe } = addEntity({}, { x: 0, y: 0 })
    documentStore.getState().dispatch(recipe)
    sessionStore.getState().setSelection([selId("node", qualify("er", key))])
    expect(renameEntityWithNotice(key, "clienti")).toBe(true)
    expect([...sessionStore.getState().selection]).toEqual([selId("node", "er/clienti")])
  })
})
```

- [ ] **Step 9: Aggiorna i test esistenti sulle chiavi**

Run: `pnpm tsc -b && pnpm test`

Correggi i fallimenti con queste regole, senza cambiare cosa i test verificano:
- `src/editor/actions.test.ts`: le selezioni costruite con `selId("node", k)` diventano `selId("node", qualify("er", k))` (o la famiglia del documento del test), e le chiavi attese in uscita prendono lo stesso prefisso.
- `src/ui/canvas/interaction-runner.test.ts`: `registerNode(k, …)`/`registerEdge(k, …)` e le `keys` degli effetti prendono il prefisso della famiglia del documento (`qualify("er", "dentro")`), e così le chiavi attese nelle `scritture`. Se un test afferma che per l'ER **non** avviene il reset al rilascio, va rovesciato: il reset ora avviene sempre (scostamento 3).
- `src/ui/canvas/use-canvas-interaction.test.tsx`, `class-render.test.tsx`, `render.test.tsx`: dove leggono `data-node-id`/`data-edge-id` o `editing.key`, si aspettano il prefisso.
- `src/ui/panels/FlowProperties.test.tsx`: la selezione impostata dal test prende il prefisso `flow/`.

Expected alla fine: `pnpm test` tutto verde.

- [ ] **Step 10: Verifica completa**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: tutto verde. Gli e2e non cambiano, perché leggono `data-node-id` solo come presenza o lo rileggono dal DOM.

Nel browser: crea, sposta, rinomina (doppio click sull'header), elimina, duplica, annulla, sia su un ER sia su un flowchart. Il clic su un problema nel pannello deve selezionare il nodo.

- [ ] **Step 11: Commit**

```bash
git add -A src
git commit -m "feat(editor): chiavi con prefisso di famiglia da un capo all'altro

CanvasOps è il solo contratto del canvas: smista ogni chiamata alla
famiglia della chiave e rimette il prefisso a ciò che torna. Selezione,
editing, dom-registry e problemi usano er/…, class/…, flow/…; comandi,
pannelli e viste di famiglia restano senza. Il reset del DOM al rilascio
del drag diventa incondizionato: una selezione mista mescola famiglie con
e senza commitDrag.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: La UI scorre le famiglie del documento

Canvas, export e dialoghi smettono di leggere `doc.diagram.type` e scorrono `documentFamilies(doc)`. Nella fase A la lista contiene una famiglia sola, quindi non cambia niente di visibile. Il Task 5 cambia solo la sorgente della lista.

**Files:**
- Modify: `src/ui/canvas/Canvas.tsx`
- Modify: `src/ui/canvas/LanesLayer.tsx`
- Modify: `src/ui/export/svg.tsx`, `src/ui/export/svg.test.ts`
- Modify: `src/ui/export/actions.ts`
- Modify: `src/ui/export/TextExportDialog.tsx`
- Modify: `src/ui/DocumentMenu.tsx`, `src/ui/import/ImportDdlDialog.tsx`
- Modify: `src/ui/panels/PropertiesPanel.tsx`
- Modify: `src/ui/canvas/kinds/registry.ts` (rimuovi `useDiagramView`)
- Modify: `src/editor/kinds/canvas-ops.ts` (aggiungi `familyHasContent`)

**Interfaces:**
- Consumes: `documentFamilies`, `canvasOps`, `familyOps`, `viewFor`, `useDocumentFamilies`.
- Produces:
  - `familyHasContent(doc: DevDocument, family: Family): boolean` in `canvas-ops.ts`
  - `buildSvg(doc: DevDocument, options: BuildSvgOptions): string | null` (prima riceveva `Diagram`)

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/kinds/canvas-ops.test.ts` aggiungi:

```ts
describe("familyHasContent", () => {
  it("è vero quando la famiglia ha almeno un nodo", () => {
    expect(familyHasContent(state().doc, "er")).toBe(false)
    erConDueEntita()
    expect(familyHasContent(state().doc, "er")).toBe(true)
  })
})
```

(import `familyHasContent` accanto a `canvasOps`).

In `src/ui/export/svg.test.ts` sostituisci ogni `buildSvg(doc.diagram, …)` con `buildSvg(doc, …)`. I test esistenti continuano a verificare lo stesso output.

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm vitest run src/editor/kinds/canvas-ops.test.ts src/ui/export/svg.test.ts`
Expected: FAIL (`familyHasContent` non esportata; errore di tipo su `buildSvg(doc)`)

- [ ] **Step 3: Implementa**

`src/editor/kinds/canvas-ops.ts`, in fondo:

```ts
/** La famiglia ha almeno un nodo. È la sola definizione di «ha contenuto»: export, menu e documento la usano. */
export function familyHasContent(doc: DevDocument, family: Family): boolean {
  return familyOps(doc, family).nodeKeys().length > 0
}
```

`src/ui/canvas/Canvas.tsx`:

```tsx
  const families = useDocumentFamilies()
  ...
          <LanesLayer />
          {/* Tutti gli archi sotto tutti i nodi: un arco ER non deve coprire una classe (spec §5). */}
          {families.map((f) => {
            const { EdgesLayer } = viewFor(f)
            return <EdgesLayer key={`edges-${f}`} />
          })}
          {families.map((f) => {
            const { NodesLayer } = viewFor(f)
            return <NodesLayer key={`nodes-${f}`} />
          })}
```

Import: `useDocumentFamilies, viewFor` da `./kinds/registry`. Togli `useDiagramView`. Aggiorna il commento sulle corsie: «`LanesLayer` decide da sé se montarsi».

`src/ui/canvas/LanesLayer.tsx`: nei selettori sostituisci `s.doc.diagram.type === "flow"` con `documentFamilies(s.doc).includes("flow")`. `const type = …` diventa `const hasFlow = useStore(documentStore, (s) => documentFamilies(s.doc).includes("flow"))` e `if (!hasFlow) return null`.

`src/ui/export/svg.tsx`: riscrivi l'impianto su più famiglie. Le funzioni e il corpo di `buildSvg`:

```tsx
import { classDiagram } from "@/editor/class-access"
import { erDiagram } from "@/editor/er-access"
import { documentFamilies } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { familyOps } from "@/editor/kinds/ops"
import type { DevDocument } from "@/model/document"
import type { Family } from "@/model/family"
import type { NodeView as NodeViewModel } from "@/model/shared"

/** I nodi grezzi di una famiglia: vedi la nota sopra `buildSvg`. */
function nodeModelsOf(doc: DevDocument, family: Family): Record<string, unknown> {
  switch (family) {
    case "er":
      return erDiagram(doc).model.entities
    case "class":
      return { ...classDiagram(doc).model.classes, ...classDiagram(doc).model.notes }
    case "flow":
      return flowDiagram(doc).model.nodes
  }
}

/** Gli archi grezzi di una famiglia, stessa ragione di `nodeModelsOf`. */
function edgeModelsOf(doc: DevDocument, family: Family): Record<string, unknown> {
  switch (family) {
    case "er":
      return erDiagram(doc).model.relationships
    case "class":
      return classDiagram(doc).model.relations
    case "flow":
      return flowDiagram(doc).model.edges
  }
}

/** Le view dei nodi di una famiglia: la forma è la stessa per tutte (`NodeViewSchema`). */
function viewNodesOf(doc: DevDocument, family: Family): Record<string, NodeViewModel> {
  switch (family) {
    case "er":
      return erDiagram(doc).view.nodes
    case "class":
      return classDiagram(doc).view.nodes
    case "flow":
      return flowDiagram(doc).view.nodes
  }
}

export function buildSvg(doc: DevDocument, { vars, fontFace }: BuildSvgOptions): string | null {
  const families = documentFamilies(doc)
  // Una sezione per famiglia: chiavi, rettangoli e archi restano senza prefisso, perché le viste
  // pure di ogni famiglia li vogliono così (e il prefisso nei `data-*-id` lo mettono loro).
  const sections = families.map((family) => {
    const ops = familyOps(doc, family)
    const keys = ops.nodeKeys()
    const rects = new Map<string, Rect>()
    for (const key of keys) {
      const rect = ops.rectOf(key)
      if (rect) rects.set(key, rect)
    }
    const edges = ops.edgesTouching(new Set(keys))
    return { family, ops, keys, rects, edges, offsets: edgeOffsets(edges), view: viewFor(family), nodeModels: nodeModelsOf(doc, family), edgeModels: edgeModelsOf(doc, family), viewNodes: viewNodesOf(doc, family) }
  })

  const flow = families.includes("flow") ? flowDiagram(doc) : null
  const laneExtent = flow ? laneBandExtent(flow) : null
  const laneRects: Rect[] = []
  if (flow && laneExtent) {
    for (const lane of flow.model.lanes) {
      const band = flow.view.lanes[lane.id]
      if (band) laneRects.push({ x: laneExtent.x, y: band.y, w: laneExtent.w, h: band.h })
    }
  }

  const bounds = rectsBounds([...sections.flatMap((s) => [...s.rects.values()]), ...laneRects])
  if (!bounds) return null
  // … x, y, w, h come oggi …

  const body = renderToStaticMarkup(
    <>
      <rect data-background x={x} y={y} width={w} height={h} fill="var(--background)" />
      {flow && laneExtent && <LanesLayerView lanes={flow.model.lanes} bands={flow.view.lanes} x={laneExtent.x} w={laneExtent.w} />}
      <g data-layer="edges">
        {sections.flatMap((s) =>
          s.edges.map((edge) => {
            const source = s.rects.get(edge.source)
            const target = s.rects.get(edge.target)
            const relation = s.edgeModels[edge.key]
            if (!source || !target || !relation || !s.ops.edgeGeometry(edge.key, source, target)) return null
            return <s.view.EdgeView key={`${s.family}/${edge.key}`} edgeKey={edge.key} relation={relation} source={source} target={target} selected={false} offset={s.offsets.get(edge.key) ?? 0} />
          }),
        )}
      </g>
      <g data-layer="nodes">
        {sections.flatMap((s) =>
          s.keys.map((key) => {
            const rect = s.rects.get(key)
            const view = s.viewNodes[key]
            const node = s.nodeModels[key]
            if (!rect || !view || !node) return null
            return <s.view.NodeView key={`${s.family}/${key}`} nodeKey={key} node={node} view={view} selected={false} />
          }),
        )}
      </g>
    </>,
  )
```

Il resto del file (`style`, `svg`, `resolveVars`, `xmlAttr`) resta com'è. Togli `opsForDiagram`, l'import di `opsFor`, `Diagram` e `SCHEMA_VERSION` se non servono più. Aggiorna il docblock di `buildSvg`: «scorre le famiglie del documento nello stesso ordine del canvas: le corsie sotto tutto, poi tutti gli archi, poi tutti i nodi».

`src/ui/export/actions.ts`: `hasNodes` diventa `canvasOps(doc).nodeKeys().length > 0` (import `canvasOps`, togli lo switch), e `currentSvg` chiama `buildSvg(documentStore.getState().doc, …)`.

`src/ui/export/TextExportDialog.tsx`. Ogni formato appartiene a una famiglia, e il dialogo offre i formati delle famiglie **con contenuto**:

```ts
import type { Family } from "@/model/family"

type Format = Dialect | "mermaid" | "class-mermaid" | "flow-mermaid"

/** La famiglia di ogni formato: un formato si offre solo se la sua famiglia ha contenuto. */
const FORMAT_FAMILY: Record<Format, Family> = {
  postgres: "er",
  mysql: "er",
  mermaid: "er",
  "class-mermaid": "class",
  "flow-mermaid": "flow",
}

/** I modelli delle famiglie, letti dal selettore: tre riferimenti stabili, confrontati da `useShallow`. */
interface Models {
  er: ErModel | null
  class: ClassModel | null
  flow: FlowModel | null
}

function emit(models: Models, format: Format): EmitResult {
  const empty = { text: "", warnings: [] }
  switch (format) {
    case "postgres":
    case "mysql":
      return models.er ? emitDdl(models.er, format) : empty
    case "mermaid":
      return models.er ? emitMermaid(models.er) : empty
    case "class-mermaid":
      return models.class ? emitClassMermaid(models.class) : empty
    case "flow-mermaid":
      return models.flow ? emitFlowMermaid(models.flow) : empty
  }
}
```

`FORMATS`: le etichette diventano `mermaid: { label: "Mermaid ER", … }`, `"class-mermaid": { label: "Mermaid classi", … }`, `"flow-mermaid": { label: "Mermaid flowchart", … }` (con le famiglie mescolate, tre «Mermaid» non sarebbero distinguibili). `MODEL_LIMITS` resta `Record<Family, string>`. `DIALOG_DESCRIPTION` sparisce: la descrizione diventa la frase fissa «Il DDL dello schema o i diagrammi in Mermaid, una famiglia per formato.».

Nel componente:

```ts
  const models = useStore(
    documentStore,
    useShallow((s): Models => {
      const families = documentFamilies(s.doc)
      const has = (f: Family) => families.includes(f) && familyHasContent(s.doc, f)
      return {
        er: has("er") ? erDiagram(s.doc).model : null,
        class: has("class") ? classDiagram(s.doc).model : null,
        flow: has("flow") ? flowDiagram(s.doc).model : null,
      }
    }),
  )
  if (!open) return null
  const formats = (Object.keys(FORMAT_FAMILY) as Format[]).filter((f) => models[FORMAT_FAMILY[f]] !== null)
  const effectiveFormat = formats.includes(format) ? format : (formats[0] ?? format)
  const chosen = FORMATS[effectiveFormat]
  const { text, warnings } = formats.length > 0 ? emit(models, effectiveFormat) : { text: "", warnings: [] }
```

Nel JSX: `DialogDescription` con la frase fissa; il limite `{formats.length > 0 && <li>{MODEL_LIMITS[FORMAT_FAMILY[effectiveFormat]]}</li>}`; se `formats.length === 0` mostra al posto dell'anteprima `<p className="text-sm text-muted-foreground">Il documento è vuoto: non c'è niente da esportare.</p>` e disattiva «Copia» e «Scarica». Togli `hasEmitter`, `ModelState`, l'import di `TextFormat` e `useDiagramView`. L'ordine dei formati è quello delle chiavi di `FORMAT_FAMILY`, cioè l'ordine di `FAMILIES`.

`src/ui/DocumentMenu.tsx`: `const isEr = useStore(documentStore, (s) => s.doc.diagram.type === "er")` → `const isEr = useDocumentFamilies().includes("er")` (import dal registro).

`src/ui/import/ImportDdlDialog.tsx:98`: `doc.diagram.type === "er" ? …` → `documentFamilies(doc).includes("er") ? …`.

`src/ui/panels/PropertiesPanel.tsx`: il ramo senza selezione:

```tsx
  const families = useDocumentFamilies()
  const Empty = families.map(viewFor).find((v) => v.EmptyProperties)?.EmptyProperties
  if (selection.size === 0 && Empty) return <Empty />
```

`src/ui/canvas/kinds/registry.ts`: rimuovi `useDiagramView`. Non ha più chiamanti: verificalo con `grep -rn useDiagramView src`, che deve dare solo i commenti di `registry.test.ts` (aggiornali per citare `viewFor`).

- [ ] **Step 4: Verifica**

Run: `grep -rn "diagram\.type" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
Expected: solo `src/editor/families.ts`, `src/editor/kinds/ops.ts`, `src/editor/{er,class,flow}-access.ts`, `src/model/migrations.ts` e `src/io/document-io.ts` (`blankDocument`/`newDocument`). Sono i punti che toccherà il Task 5.

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: tutto verde

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(ui): canvas, export e dialoghi scorrono le famiglie

Il canvas monta i layer di ogni famiglia (archi sotto, nodi sopra),
l'SVG fa lo stesso, e l'export testo offre i formati delle famiglie che
hanno contenuto. Oggi la lista è ancora il tipo del documento: il modello
unificato cambierà solo la sorgente.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Il modello unificato

**Files:**
- Modify: `src/model/shared.ts` (`SCHEMA_VERSION = 3`)
- Modify: `src/model/{er,class,flow}/schema.ts`
- Modify: `src/model/document.ts`
- Modify: `src/model/migrations.ts`, `src/model/migrations.test.ts`
- Modify: `src/editor/{er,class,flow}-access.ts`
- Modify: `src/editor/commands/view.ts`, `src/editor/commands/view.test.ts`
- Modify: `src/editor/kinds/{ops,canvas-ops}.ts`, `src/editor/families.ts`
- Modify: `src/editor/document-store.ts`, `src/perf/stress.ts`
- Modify: `src/io/document-io.ts`, `src/io/document-io.test.ts`
- Modify: `src/ui/DocumentMenu.tsx`, `src/ui/canvas/LanesLayer.tsx`, `src/ui/panels/PropertiesPanel.tsx`, `src/ui/panels/IssuesPanel.tsx`, `src/ui/export/svg.tsx`, `src/ui/import/ImportDdlDialog.tsx`, `src/ui/canvas/kinds/{registry,er}.tsx`, `src/ui/panels/ClassProperties.tsx`, `src/ui/layout-actions.ts`, `src/ui/use-keyboard-shortcuts.ts`, `src/ui/export/TextExportDialog.tsx`
- Modify: tutti i test che usano `createErDocument`/`createClassDocument`/`createFlowDocument` o `doc.diagram.model|view|type`
- Modify: `scripts/e2e/{persistenza,class,class-note,flow}.mjs`

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces:
  - `DevDocument.diagram: { er: ErDiagram; class: ClassDiagram; flow: FlowDiagram }`, dove ogni parte è `{ model, view }` senza `type`
  - `createDocument(name: string, id?: string): DevDocument` in `src/model/document.ts`
  - `emptyErDiagram()`, `emptyClassDiagram()`, `emptyFlowDiagram()` negli schemi di famiglia
  - `moveNodes(family, keys, dx, dy)`, `setCollapsed(family, key, collapsed)`, `applyLayout(family, positions)`
  - `DocumentIo.newDocument(): Promise<void>`
  - Rimossi: `opsFor`, `documentFamilies`, `useDocumentFamilies`, `createErDocument`, `createClassDocument`, `createFlowDocument`, `ErDocument`, `ClassDocument`, `FlowDocument`

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/model/migrations.test.ts` (Review Focus 4) aggiungi:

```ts
import { parseDocument } from "./serialize"

/** Un documento v2 com'era su disco: un tipo solo. */
const v2 = (diagram: unknown) => JSON.stringify({ schemaVersion: 2, id: "d1", name: "vecchio", diagram })

describe("migrazione 2 → 3", () => {
  it("un ER v2 diventa la parte er, con le altre due vuote", () => {
    const r = parseDocument(v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(3)
    expect(r.document.diagram.class.model.classes).toEqual({})
    expect(r.document.diagram.flow.model.lanes).toHaveLength(1)
  })

  it("un class diagram v2 conserva le sue classi", () => {
    const cls = { name: "Ordine", stereotype: "class", attributes: [], methods: [] }
    const r = parseDocument(v2({ type: "class", model: { classes: { Ordine: cls }, relations: {}, notes: {} }, view: { nodes: { Ordine: { x: 0, y: 0, collapsed: false } } } }))
    expect(r.ok && Object.keys(r.document.diagram.class.model.classes)).toEqual(["Ordine"])
  })

  it("un flowchart v2 conserva corsie e nodi", () => {
    const flow = {
      type: "flow",
      model: { lanes: [{ id: "l1", name: "A" }], nodes: { n1: { label: "x", shape: "process", lane: "l1" } }, edges: {} },
      view: { nodes: { n1: { x: 0, y: 0, collapsed: false } }, lanes: { l1: { y: 0, h: 160 } } },
    }
    const r = parseDocument(v2(flow))
    expect(r.ok && r.document.diagram.flow.model.lanes.map((l) => l.name)).toEqual(["A"])
    expect(r.ok && Object.keys(r.document.diagram.er.model.entities)).toEqual([])
  })

  it("la migrazione è pura: due esecuzioni danno lo stesso documento", () => {
    const text = v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } })
    expect(parseDocument(text)).toEqual(parseDocument(text))
  })
})
```

(I quattro campi della classe sono esattamente quelli di `ClassNodeSchema`: `name`, `stereotype`, `attributes`, `methods`.)

In `src/editor/kinds/canvas-ops.test.ts` aggiungi il caso misto (Review Focus 2):

```ts
describe("canvasOps (famiglie mescolate)", () => {
  it("deleteItems misto: un solo passo di annulla", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).deleteItems([entity.key, node.key], [])!)
    expect(canvasOps(state().doc).nodeKeys()).toEqual([])
    expect(state().past.length).toBe(past + 1)
    state().undo()
    expect(canvasOps(state().doc).nodeKeys().sort()).toEqual([entity.key, node.key].sort())
  })

  it("Collega fra un'entità e un nodo di flusso non crea niente", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    expect(canvasOps(state().doc).addEdge(entity.key, node.key)).toBeNull()
  })

  it("commitDrag misto: una recipe, ogni famiglia con la sua regola", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).commitDrag([entity.key, node.key], 20, 0)!)
    expect(state().past.length).toBe(past + 1)
    expect(canvasOps(state().doc).rectOf(entity.key)!.x).toBe(20)
  })
})
```

con `import { createDocument } from "@/model/document"`.

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm vitest run src/model/migrations.test.ts src/editor/kinds/canvas-ops.test.ts`
Expected: FAIL (`createDocument` non esiste; nessuna migrazione dalla versione 2)

- [ ] **Step 3: Schemi, documento, migrazione**

`src/model/shared.ts`: `export const SCHEMA_VERSION = 3`.

`src/model/er/schema.ts`: togli `type: z.literal("er")` da `ErDiagramSchema`; togli `ErDocument` e `createErDocument`; aggiungi:

```ts
/** Una parte ER vuota: la forma di una famiglia senza elementi (spec §3). */
export function emptyErDiagram(): ErDiagram {
  return { model: { entities: {}, relationships: {} }, view: { nodes: {} } }
}
```

`src/model/class/schema.ts`: togli `type: z.literal("class")`, `ClassDocument` e `createClassDocument`; aggiungi `emptyClassDiagram()` che restituisce `{ model: { classes: {}, relations: {}, notes: {} }, view: { nodes: {} } }`.

`src/model/flow/schema.ts`: togli `type: z.literal("flow")`, `FlowDocument` e `createFlowDocument`; aggiungi:

```ts
/** Una parte di flusso vuota: una corsia sola, perché `lanes` è `.min(1)` (spec §3). */
export function emptyFlowDiagram(): FlowDiagram {
  const laneId = crypto.randomUUID()
  return {
    model: { lanes: [{ id: laneId, name: nextLaneName([]) }], nodes: {}, edges: {} },
    view: { nodes: {}, lanes: { [laneId]: { y: 0, h: LANE_MIN_H } } },
  }
}
```

Aggiorna i commenti che citano `createFlowDocument` (quelli di `LANE_MIN_H` e `nextLaneName`) con `emptyFlowDiagram`. Togli gli import di `DevDocument` e `SCHEMA_VERSION` dagli schemi, se non servono più.

`src/model/document.ts`:

```ts
import * as z from "zod"
import { ClassDiagramSchema, emptyClassDiagram } from "./class/schema"
import { emptyErDiagram, ErDiagramSchema } from "./er/schema"
import { emptyFlowDiagram, FlowDiagramSchema } from "./flow/schema"
import { Identifier, SCHEMA_VERSION } from "./shared"

/**
 * Il contenuto di un documento: una parte per famiglia, sempre presenti (spec §3). Una famiglia
 * senza elementi ha la sua parte vuota, non un campo mancante.
 */
export const DiagramSchema = z.object({ er: ErDiagramSchema, class: ClassDiagramSchema, flow: FlowDiagramSchema })
export type Diagram = z.infer<typeof DiagramSchema>

export const DocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Identifier,
  name: z.string(),
  diagram: DiagramSchema,
})
/** "Document" collide con il DOM: il documento dell'app si chiama DevDocument. */
export type DevDocument = z.infer<typeof DocumentSchema>

/** Il solo modo di creare un documento: tre parti vuote. */
export function createDocument(name: string, id: string = crypto.randomUUID()): DevDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: { er: emptyErDiagram(), class: emptyClassDiagram(), flow: emptyFlowDiagram() },
  }
}
```

`src/model/migrations.ts`, aggiungi la migrazione e registrala:

```ts
/** L'id della corsia che la migrazione dà a una parte di flusso vuota: fisso, perché la migrazione è pura. */
const MIGRATED_LANE_ID = "corsia-1"

/**
 * 2 → 3: il diagramma di un tipo diventa la parte della sua famiglia, e le altre due nascono vuote.
 * Le parti vuote sono letterali e non chiamate a `createDocument`: la migrazione descrive il formato
 * della versione 3, e non deve cambiare se in futuro cambia il default di un documento nuovo.
 * Un `type` sconosciuto passa com'è, e il rifiuto lo dà lo schema.
 */
const unifyDiagram: Migration = (raw) => {
  const diagram = raw.diagram
  if (diagram === null || typeof diagram !== "object") return raw
  const { type, ...part } = diagram as Record<string, unknown>
  if (type !== "er" && type !== "class" && type !== "flow") return raw
  const parts: Record<string, unknown> = {
    er: { model: { entities: {}, relationships: {} }, view: { nodes: {} } },
    class: { model: { classes: {}, relations: {}, notes: {} }, view: { nodes: {} } },
    flow: {
      model: { lanes: [{ id: MIGRATED_LANE_ID, name: "Corsia 1" }], nodes: {}, edges: {} },
      view: { nodes: {}, lanes: { [MIGRATED_LANE_ID]: { y: 0, h: 160 } } },
    },
  }
  parts[type] = part
  return { ...raw, diagram: parts }
}
```

```ts
const migrations: ReadonlyMap<number, Migration> = new Map([[1, addClassNotes], [2, unifyDiagram]])
```

`addClassNotes` (1→2) legge ancora `d.type`: è corretto, perché gira su documenti v1 che il tipo ce l'hanno.

- [ ] **Step 4: Accessor, comandi di vista, ops**

`src/editor/er-access.ts`:

```ts
/** La parte ER del documento: c'è sempre, vuota se il documento non ha entità. */
export function erDiagram(doc: DevDocument): ErDiagram {
  return doc.diagram.er
}
```

Stessa forma per `classDiagram` (`doc.diagram.class`) e `flowDiagram` (`doc.diagram.flow`); aggiorna i loro docblock.

`src/editor/commands/view.ts`:

```ts
/** La view di una famiglia: `view.nodes` ha la stessa forma in tutte. */
export function diagramView(doc: DevDocument, family: Family): { nodes: Record<string, NodeView> } {
  return doc.diagram[family].view
}

export function moveNodes(family: Family, keys: readonly string[], dx: number, dy: number): Recipe | null {
  if (dx === 0 && dy === 0) return null
  return (draft) => {
    const d = diagramView(draft, family)
    // … corpo invariato …
  }
}

export function setCollapsed(family: Family, key: string, collapsed: boolean): Recipe {
  return (draft) => {
    const node = diagramView(draft, family).nodes[key]
    if (node) node.collapsed = collapsed
  }
}
```

`applyLayout(positions)` diventa `applyLayout(family: Family, positions: LayoutPositions)`, con `diagramView(draft, family)`, e per ora **mantiene** la normalizzazione a `MARGIN` (la sposta il Task 6).

Chiamanti:
- `canvas-ops.ts`: `moveNodes(f, ks, dx, dy)`;
- `kinds/er.tsx:76`: `setCollapsed("er", key, v)`;
- `ClassProperties.tsx:77`: `setCollapsed("class", key, v)`;
- `layout-actions.ts:28`: `applyLayout(documentFamilies…)`. Qui il documento ha ancora un solo blocco da disporre: usa `const family = FAMILIES.find((f) => familyHasContent(doc, f))` e se manca esci. Il Task 6 riscrive questa funzione per intero.

`src/editor/kinds/ops.ts`: rimuovi `opsFor`. `src/editor/families.ts`: rimuovi `documentFamilies` e il suo test in `families.test.ts`. `canvas-ops.ts`: `const families = documentFamilies(doc)` → `FAMILIES` (import da `@/model/family`).

Tutti i chiamanti di `documentFamilies(x)` e `useDocumentFamilies()` passano a `FAMILIES`: `LanesLayer.tsx`, `svg.tsx`, `TextExportDialog.tsx`, `ImportDdlDialog.tsx`, `use-keyboard-shortcuts.ts`, `Canvas.tsx`, `ToolSidebar.tsx`, `PropertiesPanel.tsx`, `DocumentMenu.tsx`. Rimuovi `useDocumentFamilies` da `registry.ts`. Con `grep -rn "documentFamilies\|useDocumentFamilies\|opsFor" src` devono restare zero occorrenze.

- [ ] **Step 5: Le regole che cambiano con il modello**

`src/ui/canvas/LanesLayer.tsx`: le bande si montano solo se il flusso ha almeno un nodo (spec §5):

```ts
  const hasFlowNodes = useStore(documentStore, (s) => familyHasContent(s.doc, "flow"))
  const lanes = useStore(documentStore, (s) => flowDiagram(s.doc).model.lanes)
  const bands = useStore(documentStore, (s) => flowDiagram(s.doc).view.lanes)
  const extent = useStore(documentStore, useShallow((s) => laneBandExtent(flowDiagram(s.doc))))
  if (!hasFlowNodes) return null
```

Togli `EMPTY_LANES`/`EMPTY_BANDS` e aggiorna il docblock: «le corsie esistono sempre nel modello, ma si vedono solo quando c'è un nodo di flusso».

`src/ui/export/svg.tsx`: `const flow = familyHasContent(doc, "flow") ? flowDiagram(doc) : null`.

`src/ui/panels/PropertiesPanel.tsx`: il pannello delle corsie compare senza selezione se il flusso ha nodi:

```tsx
  const hasFlowNodes = useStore(documentStore, (s) => familyHasContent(s.doc, "flow"))
  if (selection.size === 0 && hasFlowNodes) return <FlowLanesPanel />
```

(import `FlowLanesPanel` da `./FlowProperties`). Rimuovi `EmptyProperties` da `DiagramView` e da `flowView`: non ha più lettori. Aggiorna il docblock di `registry.ts`.

`src/ui/panels/IssuesPanel.tsx`: la dipendenza del `useMemo` diventa `[doc.diagram.er.model, doc.diagram.class.model, doc.diagram.flow.model]`, con il commento aggiornato: tre modelli, ognuno stabile finché la sua famiglia non cambia.

`src/ui/export/TextExportDialog.tsx`: `has(f)` diventa `familyHasContent(s.doc, f)`.

`src/ui/import/ImportDdlDialog.tsx:96-98`: `const present = new Set(Object.keys(erDiagram(doc).model.entities))`, e il commento sopra spiega che la parte ER c'è sempre.

`src/io/document-io.ts`:
- togli gli import dei tre creatori e `blankDocument`;
- `newDocument(type?)` diventa:

```ts
  async function newDocument(): Promise<void> {
    await activate(createDocument("Senza titolo"), { fileName: null, handle: null, lastSavedAt: null, dirty: false }, { savedToFileAt: null })
  }
```

- nell'interfaccia: `/** Un documento vuoto: le tre famiglie senza elementi. */ newDocument(): Promise<void>`;
- `hasContent(doc)` diventa `FAMILIES.some((f) => familyHasContent(doc, f))`, importando `familyHasContent` da `@/editor/kinds/canvas-ops`. Aggiorna il suo docblock: una nota di classe da sola ora conta come contenuto, come ogni nodo.

`src/ui/DocumentMenu.tsx`:
- il sottomenu «Nuovo» diventa `<DropdownMenuItem onSelect={() => void documentIo.newDocument()}><FilePlus2 /> Nuovo documento</DropdownMenuItem>`;
- togli gli import `DropdownMenuSub*`, `Box`, `Square`, `Workflow` se non servono più;
- «Importa DDL…» diventa `disabled={readOnly}`;
- togli `isEr` e il commento sopra.

`src/editor/document-store.ts:37`: `createDocument("Senza titolo")`. `src/perf/stress.ts`: `createDocument`, tipo di ritorno `DevDocument`, e `doc.diagram.model` → `doc.diagram.er.model` (lo stesso per `view`).

- [ ] **Step 6: Test esistenti**

Run: `pnpm tsc -b`

Correggi ogni errore nei test con queste regole meccaniche:
- `createErDocument(n, id)`, `createClassDocument(n, id)` e `createFlowDocument(n, id)` diventano `createDocument(n, id)`, importato da `@/model/document`;
- nei test che creavano un documento di **una** famiglia, `doc.diagram.model` e `doc.diagram.view` diventano `doc.diagram.<famiglia>.model` e `.view`. Per scegliere la famiglia guarda il creatore che il test usava;
- `ErDocument`/`ClassDocument`/`FlowDocument` diventano `DevDocument`;
- le asserzioni `expect(doc.diagram.type).toBe("x")` vanno tolte. Se il test verificava il tipo creato da `newDocument("flow")`, sostituisci il test con: «newDocument crea un documento con le tre parti vuote» (`expect(Object.keys(doc.diagram).sort()).toEqual(["class", "er", "flow"])`);
- in `commands/view.test.ts` le chiamate prendono la famiglia: `moveNodes("er", …)`, `setCollapsed("er", …)`, `applyLayout("er", …)`;
- `ops.test.ts`: `opsFor(doc)` → `familyOps(doc, "er")` (o `"class"`/`"flow"` secondo il documento del contratto);
- nei test della fase A che usavano un documento di classi o di flusso per ottenere `documentFamilies = ["class"]`, le chiavi attese restano le stesse, ma ora `canvasOps(doc).nodeKeys()` scorre tutte le famiglie. Un test che conta i nodi continua a funzionare, perché le altre famiglie sono vuote.

Poi Run: `pnpm test`
Expected: tutto verde

- [ ] **Step 7: E2E**

- `scripts/e2e/class.mjs:85-86`, `class-note.mjs:96-97`, `flow.mjs:100-101`, `persistenza.mjs:96`: le coppie `menuitem "Nuovo"` → `menuitem "<tipo>"` diventano un solo `page.getByRole("menuitem", { name: "Nuovo documento" }).click()`. Aggiorna i nomi degli step («Nuovo documento: il canvas è vuoto») e il commento in `persistenza.mjs:91` (non è più un sottomenu).
- `scripts/e2e/flow.mjs`: il documento nuovo non mostra corsie finché non c'è un nodo di flusso, e il pannello delle corsie compare con il primo nodo. Riordina gli step:
  1. «Nuovo documento: nessuna corsia visibile». Attendi `document.querySelectorAll('[data-layer="lanes"] rect').length === 0`.
  2. Crea il Terminale nella prima corsia (lo step che oggi viene dopo «aggiungi una seconda corsia»). La banda (`y` 0–160) compare con il nodo: attendi un `rect` di corsia.
  3. «aggiungi una seconda corsia dal pannello»: deseleziona con `Escape` prima di cercare «Aggiungi», perché il pannello delle corsie compare solo senza selezione.
  4. Il resto invariato.

  Se le coordinate di un click cadevano sulla seconda corsia prima che esistesse, verifica che il nodo finisca dove lo step si aspetta.

Run: `pnpm build && pnpm e2e`
Expected: tutti gli scenari PASS

- [ ] **Step 8: Verifica nel browser**

Nuovo documento. Crea un'entità (E), una classe (C) e un processo (2): tutti e tre compaiono. La banda della corsia compare con il processo. Collega entità → classe non fa niente, entità → entità crea una relazione. Salva, ricarica, ritrova i tre elementi. Apri un file `.dd.json` salvato prima di questo branch: si apre con i suoi elementi.

- [ ] **Step 9: Commit**

```bash
git add -A src scripts/e2e
git commit -m "feat(model): un documento, tutte le famiglie

Il diagramma a union sul tipo diventa { er, class, flow }, con le parti
sempre presenti; la migrazione 2 → 3 sposta il diagramma di un tipo nella
parte della sua famiglia. «Nuovo» è una voce sola, l'import DDL è sempre
disponibile, e le corsie si vedono dal primo nodo di flusso.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Disponi per famiglia

**Files:**
- Create: `src/editor/layout-pack.ts`
- Test: `src/editor/layout-pack.test.ts`
- Modify: `src/editor/commands/view.ts` (`applyLayout` senza normalizzazione; `MARGIN` si sposta)
- Modify: `src/editor/commands/view.test.ts`
- Modify: `src/ui/layout-actions.ts`

**Interfaces:**
- Consumes: `familyOps`, `familyHasContent`, `FAMILIES`, `layoutEngine` da `@/io/app-io` (solo in `layout-actions.ts`), `applyLayout(family, positions)`.
- Produces, tutto in `src/editor/layout-pack.ts`:
  - `LAYOUT_MARGIN = 40`, `LAYOUT_FAMILY_GAP = 120`
  - `interface Block { family: Family; nodes: LayoutNode[]; positions: LayoutPositions }`
  - `packBlocks(blocks: readonly Block[]): Map<Family, LayoutPositions>`: posizioni traslate, con il primo blocco che parte da `(LAYOUT_MARGIN, LAYOUT_MARGIN)` e gli altri in fila a destra, allineati in alto
  - `layoutAll(doc: DevDocument, layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<Recipe | null>`. Il motore è iniettato: sta in `editor`, che non può importare `io`. Per lo stesso motivo il test gira in ambiente node: `app-io.ts` legge `window` quando viene importato.

- [ ] **Step 1: Scrivi i test che falliscono**

`src/editor/layout-pack.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { LAYOUT_FAMILY_GAP, LAYOUT_MARGIN, packBlocks } from "./layout-pack"

const node = (id: string, w = 100, h = 50) => ({ id, w, h })

describe("packBlocks", () => {
  it("il primo blocco parte dal margine, qualunque sia l'origine di ELK", () => {
    const out = packBlocks([{ family: "er", nodes: [node("a"), node("b")], positions: { a: { x: 12, y: 30 }, b: { x: 212, y: 130 } } }])
    expect(out.get("er")).toEqual({ a: { x: LAYOUT_MARGIN, y: LAYOUT_MARGIN }, b: { x: LAYOUT_MARGIN + 200, y: LAYOUT_MARGIN + 100 } })
  })

  it("i blocchi stanno in fila da sinistra a destra, separati dal margine fra famiglie, allineati in alto", () => {
    const out = packBlocks([
      { family: "er", nodes: [node("a", 100)], positions: { a: { x: 0, y: 0 } } },
      { family: "flow", nodes: [node("n", 80)], positions: { n: { x: 500, y: 90 } } },
    ])
    expect(out.get("flow")).toEqual({ n: { x: LAYOUT_MARGIN + 100 + LAYOUT_FAMILY_GAP, y: LAYOUT_MARGIN } })
  })

  it("la larghezza di un blocco è l'ingombro reale dei nodi, non la sola posizione", () => {
    const out = packBlocks([
      { family: "er", nodes: [node("a", 100), node("b", 300)], positions: { a: { x: 0, y: 0 }, b: { x: 50, y: 200 } } },
      { family: "class", nodes: [node("c")], positions: { c: { x: 0, y: 0 } } },
    ])
    // Il blocco ER va da 0 a 350 (b parte a 50 ed è largo 300).
    expect(out.get("class")!.c!.x).toBe(LAYOUT_MARGIN + 350 + LAYOUT_FAMILY_GAP)
  })
})
```

In fondo allo stesso `src/editor/layout-pack.test.ts` (Review Focus 5):

```ts
import { createDocument } from "@/model/document"
import type { LayoutGraph } from "@/model/layout"
import { documentStore } from "./document-store"
import { canvasOps } from "./kinds/canvas-ops"
import { layoutAll } from "./layout-pack"

function misto() {
  documentStore.getState().load(createDocument("t", "t"))
  for (const [family, variant, x] of [["er", undefined, 0], ["er", undefined, 300], ["flow", "process", 0], ["flow", "process", 300]] as const) {
    const { recipe } = canvasOps(documentStore.getState().doc).addNode({ x, y: 40 }, family, variant)
    documentStore.getState().dispatch(recipe)
  }
  return documentStore.getState().doc
}

/** Un motore finto che mette i nodi in fila a passo 200: deterministico, senza worker. */
const fila = async (g: LayoutGraph) => Object.fromEntries(g.nodes.map((n, i) => [n.id, { x: i * 200, y: 0 }]))

describe("layoutAll", () => {
  it("dispone ogni famiglia e mette i blocchi in fila, in una sola recipe", async () => {
    const doc = misto()
    const recipe = await layoutAll(doc, fila)
    expect(recipe).not.toBeNull()
    const past = documentStore.getState().past.length
    documentStore.getState().dispatch(recipe!)
    expect(documentStore.getState().past.length).toBe(past + 1)
    const ops = canvasOps(documentStore.getState().doc)
    const er = ops.nodeKeys().filter((k) => k.startsWith("er/")).map((k) => ops.rectOf(k)!)
    const flow = ops.nodeKeys().filter((k) => k.startsWith("flow/")).map((k) => ops.rectOf(k)!)
    const erRight = Math.max(...er.map((r) => r.x + r.w))
    expect(Math.min(...flow.map((r) => r.x))).toBeGreaterThan(erRight)
  })

  it("un fallimento non applica niente", async () => {
    const doc = misto()
    let calls = 0
    const failsOnSecond = async (g: LayoutGraph) => {
      calls++
      if (calls === 2) throw new Error("worker giù")
      return fila(g)
    }
    await expect(layoutAll(doc, failsOnSecond)).rejects.toThrow("worker giù")
  })
})
```

Gli import di questo secondo blocco vanno uniti a quelli in testa al file.

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm vitest run src/editor/layout-pack.test.ts`
Expected: FAIL (`./layout-pack` non esiste)

- [ ] **Step 3: Implementa**

`src/editor/layout-pack.ts`:

```ts
import type { DevDocument } from "@/model/document"
import { FAMILIES, type Family } from "@/model/family"
import type { LayoutGraph, LayoutNode, LayoutPositions } from "@/model/layout"
import { applyLayout } from "./commands/view"
import type { Recipe } from "./document-store"
import { familyHasContent } from "./kinds/canvas-ops"
import { familyOps } from "./kinds/ops"

/** Distanza dall'origine del risultato: un diagramma appiccicato al bordo (0, 0) si legge male. */
export const LAYOUT_MARGIN = 40

/** Spazio fra il blocco di una famiglia e il successivo. */
export const LAYOUT_FAMILY_GAP = 120

/** Il risultato del layout di una famiglia: le sue posizioni, e gli ingombri che danno la larghezza del blocco. */
export interface Block {
  family: Family
  nodes: LayoutNode[]
  positions: LayoutPositions
}

/**
 * Mette i blocchi in fila da sinistra a destra, nell'ordine dato, allineati in alto (spec §7).
 * Ogni blocco si trasla in modo che il suo angolo in alto a sinistra cada al punto che gli spetta:
 * il primo in `(LAYOUT_MARGIN, LAYOUT_MARGIN)`, i successivi dopo il bordo destro del precedente più
 * `LAYOUT_FAMILY_GAP`. Funzione pura: le posizioni non si allineano alla griglia, lo fa chi le scrive.
 */
export function packBlocks(blocks: readonly Block[]): Map<Family, LayoutPositions> {
  const out = new Map<Family, LayoutPositions>()
  let left = LAYOUT_MARGIN
  for (const block of blocks) {
    const placed = block.nodes.flatMap((n) => {
      const p = block.positions[n.id]
      return p ? [{ id: n.id, p, w: n.w }] : []
    })
    if (placed.length === 0) continue
    const minX = Math.min(...placed.map((n) => n.p.x))
    const minY = Math.min(...placed.map((n) => n.p.y))
    const maxX = Math.max(...placed.map((n) => n.p.x + n.w))
    out.set(block.family, Object.fromEntries(placed.map((n) => [n.id, { x: n.p.x - minX + left, y: n.p.y - minY + LAYOUT_MARGIN }])))
    left += maxX - minX + LAYOUT_FAMILY_GAP
  }
  return out
}

/**
 * Il layout di tutte le famiglie con contenuto, in una recipe sola (spec §7). Ogni famiglia va al
 * motore con la sua direzione (ADR 0007); una famiglia di un nodo solo non ci va, e il nodo viene
 * solo traslato. Le chiamate partono in parallelo e **tutto o niente**: se una fallisce, la promise
 * rifiuta e non si applica niente. Il motore è iniettato: `editor` non può importare `io`.
 */
export async function layoutAll(doc: DevDocument, layout: (g: LayoutGraph) => Promise<LayoutPositions>): Promise<Recipe | null> {
  const families = FAMILIES.filter((f) => familyHasContent(doc, f))
  const blocks: Block[] = await Promise.all(
    families.map(async (family) => {
      const graph = familyOps(doc, family).layoutGraph()
      const positions = graph.nodes.length > 1 ? await layout(graph) : Object.fromEntries(graph.nodes.map((n) => [n.id, { x: 0, y: 0 }]))
      return { family, nodes: graph.nodes, positions }
    }),
  )
  const recipes = [...packBlocks(blocks)].map(([family, positions]) => {
    const ops = familyOps(doc, family)
    return ops.layoutRecipe ? ops.layoutRecipe(positions) : applyLayout(family, positions)
  })
  if (recipes.length === 0) return null
  return (draft) => {
    for (const recipe of recipes) recipe(draft)
  }
}
```

`src/editor/commands/view.ts`: `applyLayout(family, positions)` scrive le posizioni ricevute **allineate alla griglia**, senza normalizzare l'origine. Togli `MARGIN`, `minX`/`minY`, e nel ciclo scrivi `node.x = snap(p.x); node.y = snap(p.y)`. Aggiorna il docblock: l'origine la decide `packBlocks`, qui si scrive e si allinea. Il resto del docblock (chiavi scomparse, nessuna patch se identico) resta.

`src/editor/commands/view.test.ts`: i test di `applyLayout` che verificavano la traslazione a `MARGIN` ora verificano che le posizioni siano scritte così come sono, allineate alla griglia (per esempio `{ x: 13, y: 27 }` → `{ x: 10, y: 30 }`). La traslazione è coperta da `layout-pack.test.ts`.

`src/ui/layout-actions.ts`:

```ts
import { useStore } from "zustand"
import { fitToContent } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { canvasOps } from "@/editor/kinds/canvas-ops"
import { layoutAll } from "@/editor/layout-pack"
import { layoutEngine } from "@/io/app-io"
import { documentSession } from "@/io/document-session"

/** Dispone il canvas: un layout per famiglia → blocchi in fila → una sola dispatch → vista adattata. */
export async function autoLayout(): Promise<void> {
  const session = documentSession.getState()
  if (session.layingOut || session.readOnly) return
  // Guardia per la scorciatoia da tastiera, che non ha uno stato disabilitato.
  if (canvasOps(documentStore.getState().doc).nodeKeys().length < 2) return

  documentSession.getState().patch({ layingOut: true })
  try {
    const recipe = await layoutAll(documentStore.getState().doc, (g) => layoutEngine.layout(g))
    if (recipe) documentStore.getState().dispatch(recipe)
    fitToContent()
  } catch {
    documentSession.getState().patch({ notice: "Non è stato possibile disporre il diagramma." })
  } finally {
    documentSession.getState().patch({ layingOut: false })
  }
}

export function useCanAutoLayout(): boolean {
  const hasEnoughNodes = useStore(documentStore, (s) => canvasOps(s.doc).nodeKeys().length > 1)
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const layingOut = useStore(documentSession, (s) => s.layingOut)
  return hasEnoughNodes && !readOnly && !layingOut
}
```

Mantieni i commenti esistenti di `autoLayout` e `useCanAutoLayout` dove valgono ancora: sul worker che fallisce senza toccare il documento, e sui selettori che restituiscono booleani. Il layout del documento misto parte dal documento com'era alla pressione del pulsante, come oggi.

Nota per il flusso: `applyFlowLayout` rifà righe e bande con `placeInLanes`, che ignora la `y` ricevuta e parte dalla banda in cima. Quindi il blocco del flusso è allineato in `x`, mentre in `y` segue le bande, che partono da 0. Va bene così: le bande sono larghe quanto il canvas.

- [ ] **Step 4: Verifica**

Run: `pnpm vitest run src/editor/layout-pack.test.ts src/editor/commands/view.test.ts && pnpm tsc -b && pnpm lint && pnpm test && pnpm build && pnpm e2e`
Expected: tutto verde. Gli e2e `layout`, `class-note` e `flow` premono «Disponi» su documenti di una famiglia sola, e continuano a vedere nodi senza sovrapposizioni.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(layout): Disponi famiglia per famiglia, i blocchi in fila

ELK ha una direzione per grafo e quella direzione è della famiglia: ogni
famiglia si dispone da sé, e packBlocks mette i blocchi da sinistra a
destra allineati in alto. Tutto in una recipe, e tutto o niente se una
chiamata al worker fallisce. applyLayout non normalizza più l'origine:
la decide packBlocks.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Scenario e2e misto, documentazione

**Files:**
- Create: `scripts/e2e/misto.mjs`
- Modify: `scripts/e2e/run.mjs`
- Modify: `README.md` (introduzione, scorciatoie, sezione sui tipi)
- Modify: `docs/debito-tecnico.md` (Archivio: limiti accettati del 2a)

**Interfaces:**
- Consumes: gli helper di `scripts/e2e/helpers.mjs` (`launch`, `startEnv`, le attese sul menu). Leggi `scripts/e2e/class.mjs` per la forma di uno scenario: `export async function run(browser, base)`, `step(nome, fn)` e la guardia di esecuzione diretta in fondo.
- Produces: `run` esportata da `misto.mjs`.

- [ ] **Step 1: Scrivi lo scenario**

`scripts/e2e/misto.mjs`:

```js
/**
 * End-to-end del canvas unificato: un'entità, una classe e un nodo di flusso nello stesso documento.
 * Prova quello che senza un browser vero non esiste: che le chiavi del DOM portino la famiglia, che
 * Collega fra famiglie diverse non faccia niente mentre dentro una famiglia collega, che il documento
 * misto sopravviva a un ricaricamento, che Disponi metta le famiglie in fila senza sovrapposizioni, e
 * che l'export testo offra i formati di tutte e tre.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/misto.mjs`. `HEADLESS=0` per vedere.
 */
import { expectNodes, isMainModule, nodeRects, overlappingPairs, pickFromMenu, signature, startEnv } from "./helpers.mjs"

/** Centro in coordinate schermo del primo nodo la cui chiave inizia con `prefix`. */
async function centerOf(page, prefix, index = 0) {
  const rect = (await nodeRects(page)).filter((r) => r.id.startsWith(prefix))[index]
  if (!rect) throw new Error(`nessun nodo ${prefix}…[${index}]`)
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
}

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

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("Nuovo documento: il canvas è vuoto", async () => {
      await pickFromMenu(page, page.getByRole("menuitem", { name: "Nuovo documento" }))
      await expectNodes(page, 0)
    })

    const canvas = await page.locator("svg.dd-canvas").boundingBox()
    /** Crea un nodo con la scorciatoia e chiude l'editor che la creazione apre da sé. */
    async function create(key, x, y, n) {
      await page.keyboard.press(key)
      await page.mouse.click(canvas.x + x, canvas.y + y)
      await expectNodes(page, n)
      await page.keyboard.press("Escape")
      // Solo gli editor sul canvas: il pannello proprietà ha altri campi con `aria-label`, e restano.
      await page.waitForFunction(() => !document.querySelector('[aria-label="Nome entità"], [aria-label="Nome classe"], [aria-label="Testo del nodo"]'))
    }

    await step("un'entità, una classe e un processo sullo stesso canvas", async () => {
      await create("e", 200, 320, 1)
      await create("c", 650, 320, 2)
      // Il processo finisce nella banda della prima corsia (y 0–160 nel mondo): sta sopra gli altri due.
      await create("2", 400, 60, 3)
      const ids = (await nodeRects(page)).map((r) => r.id.split("/")[0]).sort()
      if (ids.join(",") !== "class,er,flow") throw new Error(`famiglie inattese: ${ids.join(",")}`)
    })

    await step("Collega fra un'entità e una classe non crea niente", async () => {
      await page.keyboard.press("r")
      await drag(page, await centerOf(page, "er/"), await centerOf(page, "class/"))
      await page.waitForTimeout(300)
      if ((await page.locator("[data-edge-id]").count()) !== 0) throw new Error("è nato un arco fra due famiglie")
      await page.keyboard.press("Escape")
    })

    await step("una seconda entità, e Collega fra le due crea una relazione ER", async () => {
      await create("e", 200, 560, 4)
      await page.keyboard.press("r")
      await drag(page, await centerOf(page, "er/", 0), await centerOf(page, "er/", 1))
      await page.waitForSelector('[data-edge-id^="er/"]')
    })

    await step("ricarica: i quattro nodi e la relazione ci sono ancora", async () => {
      await page.waitForTimeout(800) // oltre il debounce dell'autosave (400 ms)
      await page.reload()
      await page.waitForSelector("[data-canvas]")
      await expectNodes(page, 4)
      await page.waitForSelector('[data-edge-id^="er/"]')
    })

    await step("Disponi: le famiglie in fila da sinistra a destra, nessuna sovrapposizione", async () => {
      const before = await signature(page)
      await page.getByRole("button", { name: "Disponi" }).click()
      await page.waitForFunction((b) => {
        const now = [...document.querySelectorAll("[data-node-id]")].map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`).sort().join("|")
        return now !== b
      }, before, { timeout: 15000 })
      const rects = await nodeRects(page)
      const overlaps = overlappingPairs(rects)
      if (overlaps.length > 0) throw new Error(`nodi sovrapposti: ${overlaps.join(", ")}`)
      const of = (p) => rects.filter((r) => r.id.startsWith(p))
      const right = (rs) => Math.max(...rs.map((r) => r.x + r.w))
      const left = (rs) => Math.min(...rs.map((r) => r.x))
      if (!(right(of("er/")) < left(of("class/")))) throw new Error("il blocco ER non sta a sinistra delle classi")
      if (!(right(of("class/")) < left(of("flow/")))) throw new Error("il blocco delle classi non sta a sinistra del flusso")
    })

    await step("Esporta testo offre i formati delle tre famiglie", async () => {
      await pickFromMenu(page, page.getByRole("menuitem", { name: "Esporta testo…" }))
      await page.waitForSelector("[data-text-export-dialog]")
      for (const name of ["PostgreSQL", "MySQL", "Mermaid ER", "Mermaid classi", "Mermaid flowchart"]) {
        if ((await page.getByRole("radio", { name, exact: true }).count()) !== 1) throw new Error(`manca il formato ${name}`)
      }
      await page.getByRole("radio", { name: "Mermaid classi", exact: true }).click()
      await page.waitForFunction(() => document.querySelector("[data-export-preview]")?.textContent.startsWith("classDiagram"))
      await page.keyboard.press("Escape")
      await page.waitForSelector("[data-text-export-dialog]", { state: "detached" })
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (misto):", e)
  }
  console.log(failed ? "\ne2e misto: FAIL" : "\ne2e misto: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/misto.mjs` esegue solo questo scenario. */
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

Se un click di `create` cade su un nodo già esistente, invece che sul canvas vuoto, e `expectNodes` non vede crescere il conteggio, sposta le coordinate: servono solo a tenere i nodi separati prima di Disponi.

In `scripts/e2e/run.mjs` importa `run as runMisto` da `./misto.mjs`, eseguilo dopo `runFlow` (`const mistoOk = await runMisto(browser, base)`), aggiungi `&& mistoOk` a `ok`, e aggiorna il docblock (l'elenco degli scenari e il comando `node scripts/e2e/misto.mjs`).

- [ ] **Step 2: Esegui**

Run: `pnpm build && node scripts/e2e/misto.mjs`
Expected: `e2e misto: PASS`. Poi `pnpm e2e`: tutti PASS.

- [ ] **Step 3: Documentazione**

`README.md`:
- l'introduzione (riga 3) diventa: «Editor web di diagrammi per sviluppatori: entità **ER**, **classi UML** e **flowchart** sullo stesso canvas, ognuno con le sue regole.»;
- la tabella delle scorciatoie (righe 69–75) diventa:

| Tasti | Strumento |
|---|---|
| `V` | selezione |
| `E` | entità (ER) |
| `C` · `I` · `U` · `N` | classe · interfaccia · enum · nota di classe |
| `1`..`6` | forme del flusso (terminale, processo, decisione, input/output, sottoprocesso, nota) |
| `R` | Collega: il tipo di arco dipende dagli estremi |

- nella sezione alla riga 85 («tre — ER, class diagram e flowchart…») spiega che un documento contiene tutte e tre le famiglie, che `CanvasOps` smista le chiamate per famiglia, e che le chiavi del canvas hanno il prefisso `famiglia/`;
- aggiungi `misto` all'elenco degli scenari e2e (verso la riga 179–203), con una riga su cosa prova.

`docs/debito-tecnico.md`, nell'Archivio, una voce per ognuno dei limiti accettati del 2a (spec §12), con data 2026-09-24:
- le bande delle corsie attraversano tutto il canvas, anche sotto entità e classi (le risolve lo step 2b);
- il pannello delle corsie compare solo dal primo nodo di flusso, quindi non si possono preparare le corsie prima;
- due note (di classe e di flusso), che unificherà lo step 3;
- Disponi mette le famiglie in fila senza ragionare sulla vicinanza; da rivalutare con i collegamenti dello step 4.

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e README.md docs/debito-tecnico.md
git commit -m "test(e2e): scenario misto; docs del canvas unificato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Verifica finale del branch

- [ ] `pnpm tsc -b && pnpm lint && pnpm test && pnpm build && pnpm e2e`: tutto verde
- [ ] `grep -rn "diagram\.type\|opsFor\|documentFamilies\|createErDocument\|createClassDocument\|createFlowDocument" src scripts`: solo `src/model/migrations.ts` (le due migrazioni leggono il `type` dei documenti vecchi)
- [ ] Nel browser: un file `.dd.json` di `master` si apre; un documento misto si salva, si ricarica, si dispone e si esporta
