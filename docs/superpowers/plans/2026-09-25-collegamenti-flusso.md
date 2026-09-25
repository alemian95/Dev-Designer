# Collegamenti del flusso (step 4b) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un nodo di flusso si collega a un'entità con un accesso (legge, scrive, legge e scrive) e a una classe con «chiama», sull'infrastruttura dei collegamenti del 4a.

**Architecture:** il modello guadagna due tipi in `LinkKindSchema`/`LINK_ENDS`, e `LinkSchema` diventa un'unione discriminata perché solo `accesses` ha `mode`. Le etichette e i nomi leggibili degli estremi scendono nel modello (`src/model/links/labels.ts`), perché servono anche ai messaggi di validazione. L'editor aggiunge i rifiuti delle note e `setLinkMode`; la UI legge le etichette dal modello e il pannello guadagna la select del modo. Versione del file 5, con una migrazione che non cambia niente.

**Tech Stack:** React 19 + TypeScript strict (`noUncheckedIndexedAccess`), zustand (vanilla store), Immer (recipe con patch), zod 4, Vitest, e2e con Playwright su `vite preview` (`pnpm e2e`).

**Spec:** `docs/superpowers/specs/2026-09-25-collegamenti-flusso-design.md`

## Scostamenti dalla spec, decisi scrivendo il piano

1. **Il Task 1 cambia già il comportamento del gesto.** `linkRule` scorre `LINK_ENDS`, quindi appena i due tipi entrano nel modello il gesto flusso ↔ entità e flusso ↔ classe li crea. Il Task 1 aggiorna quindi anche i test (unit ed e2e `misto.mjs`) che si aspettavano il rifiuto «Non esiste un collegamento fra un'entità e un nodo di flusso.», e aggiunge `newLink`, senza cui `connectAcross` non compila con l'unione.
2. **Un nodo di flusso che diventa nota dopo il collegamento non si segnala.** È lo stesso caso dello stereotipo nel 4a (F1 della review finale), ma qui lo scopo è documentare e la spec non vuole codici di problema nuovi. Il Task 5 lo scrive fra i limiti della spec (§10).
3. **`endName` compatta gli spazi.** L'etichetta di un nodo di flusso può andare a capo (due righe): nel messaggio e nel pannello gli a capo e gli spazi ripetuti diventano uno spazio.

## Global Constraints

- Lingua: commenti, docblock, messaggi e nomi dei test in italiano; identificatori in inglese, come nel codice esistente.
- Nessuna dipendenza nuova.
- `src/model` non importa `src/editor`, `src/io` né `src/ui`. `src/editor` non importa React né `src/io`. Sono regole ESLint già attive.
- Formato delle chiavi: famiglie `${family}/${key}` (solo `qualify`/`splitKey`/`inFamily` in `src/model/family.ts`), collegamenti `link/${uuid}` (solo `linkKey`/`linkId` in `src/editor/families.ts`).
- `SCHEMA_VERSION` passa da 4 a 5.
- Testi esatti, da copiare così:
  - Etichette sul canvas: `mappa su`, `chiama`, `legge`, `scrive`, `legge e scrive`.
  - Titoli del pannello: `Mappa su`, `Accesso`, `Chiama`. Voci della select `Modo`: `Legge`, `Scrive`, `Legge e scrive`.
  - Rifiuti: `Una nota non legge né scrive una tabella.`; `Una nota non chiama una classe.`; `Una nota non si chiama.`.
  - Nomi degli estremi: `(senza etichetta)`, `(nodo eliminato)`.
  - Pendente: `Il collegamento «${etichetta}» fra «${A}» e «${B}» punta a un elemento che non esiste più`.
- Ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Messaggi in stile repo: `feat(ambito): …` in italiano.
- Verifiche a fine task: `pnpm tsc -b`, `pnpm lint`, `pnpm test` verdi; `pnpm e2e` verde nei Task 1 e 5 (quelli che toccano gli e2e).
- **Non lanciare `pnpm perf`.**

## Review Focus

Casi che la spec implica ma che i test di default non coprono. Per ciascuno il test sta nel task che possiede il codice:

1. **Il modo sopravvive al salvataggio.** Un `accesses` con `mode: "write"` serializzato e riletto torna `write`, non `read`. → Task 1, test «un accesso in scrittura torna uguale dal file».
2. **Un'etichetta su due righe.** `endName` di un nodo con `"Calcola\ntotale"` dà `Calcola totale`. → Task 1, test di `endName`.
3. **La rinomina di una classe sposta il `target` di un `calls`.** La rinomina di classi era provata solo su `maps-to`, dove la classe è `source`. → Task 2, test di coerenza.
4. **`setLinkMode` su un collegamento che non è un accesso.** Su un `maps-to` non deve scrivere un campo `mode` che lo schema poi rifiuterebbe. → Task 2, test di `setLinkMode`.
5. **Un secondo gesto dopo il cambio di modo.** Deve selezionare l'accesso esistente, non crearne uno nuovo con `read`. → Task 2, test di `connectAcross`.

---

### Task 1: Modello dei due tipi, versione 5, etichette, e il gesto che li crea

**Files:**
- Modify: `src/model/links/schema.ts`
- Modify: `src/model/links/schema.test.ts`
- Create: `src/model/links/labels.ts`
- Create: `src/model/links/labels.test.ts`
- Modify: `src/model/shared.ts`
- Modify: `src/model/migrations.ts`
- Modify: `src/model/migrations.test.ts`
- Modify: `src/model/class/schema.test.ts`
- Modify: `src/editor/links/commands.ts`
- Modify: `src/editor/links/commands.test.ts`
- Modify: `src/editor/kinds/canvas-ops.test.ts`
- Modify: `scripts/e2e/misto.mjs`

**Interfaces:**
- Produces:
  - `LinkKindSchema = z.enum(["maps-to", "accesses", "calls"])`, `type LinkKind`.
  - `AccessModeSchema = z.enum(["read", "write", "read-write"])`, `type AccessMode`, da `@/model/links/schema`.
  - `type Link = { kind: "maps-to"; source; target } | { kind: "accesses"; source; target; mode: AccessMode } | { kind: "calls"; source; target }`.
  - `LINK_ENDS` con le tre righe; `linkRule` invariato nella firma.
  - Da `@/model/links/labels`: `LINK_TITLE: Record<LinkKind, string>`, `ACCESS_MODE_LABEL: Record<AccessMode, string>`, `linkLabel(link: Link): string`, `endName(doc: DevDocument, key: string): string`.
  - `SCHEMA_VERSION = 5`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/model/links/schema.test.ts`, aggiungi dentro `describe("LinkSchema")`:

```ts
  it("accetta un accesso da un nodo di flusso a un'entità, con ognuno dei tre modi", () => {
    for (const mode of ["read", "write", "read-write"]) {
      expect(LinkSchema.safeParse({ kind: "accesses", source: "flow/n1", target: "er/ordini", mode }).success).toBe(true)
    }
  })

  it("rifiuta un accesso senza modo, o con un modo sconosciuto", () => {
    expect(LinkSchema.safeParse({ kind: "accesses", source: "flow/n1", target: "er/ordini" }).success).toBe(false)
    expect(LinkSchema.safeParse({ kind: "accesses", source: "flow/n1", target: "er/ordini", mode: "delete" }).success).toBe(false)
  })

  it("rifiuta un accesso da una classe, e un «chiama» verso un'entità", () => {
    expect(LinkSchema.safeParse({ kind: "accesses", source: "class/Ordine", target: "er/ordini", mode: "read" }).success).toBe(false)
    expect(LinkSchema.safeParse({ kind: "calls", source: "flow/n1", target: "er/ordini" }).success).toBe(false)
  })

  it("accetta «chiama» da un nodo di flusso a una classe", () => {
    expect(LinkSchema.safeParse({ kind: "calls", source: "flow/n1", target: "class/Ordine" }).success).toBe(true)
  })
```

e dentro `describe("linkRule")`, **sostituisci** il test `"una coppia senza tipo dà null"` con:

```ts
  it("flusso ↔ entità è un accesso, flusso ↔ classe è «chiama», in entrambi i versi", () => {
    expect(linkRule("flow", "er")).toEqual({ kind: "accesses", reversed: false })
    expect(linkRule("er", "flow")).toEqual({ kind: "accesses", reversed: true })
    expect(linkRule("flow", "class")).toEqual({ kind: "calls", reversed: false })
    expect(linkRule("class", "flow")).toEqual({ kind: "calls", reversed: true })
  })

  it("due famiglie uguali non hanno un tipo di collegamento", () => {
    expect(linkRule("er", "er")).toBeNull()
  })
```

Crea `src/model/links/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createDocument } from "../document"
import { parseDocument, toJson } from "../serialize"
import { ACCESS_MODE_LABEL, LINK_TITLE, endName, linkLabel } from "./labels"

describe("etichette dei collegamenti", () => {
  it("sul canvas: il tipo, e per l'accesso il modo", () => {
    expect(linkLabel({ kind: "maps-to", source: "class/A", target: "er/a" })).toBe("mappa su")
    expect(linkLabel({ kind: "calls", source: "flow/n1", target: "class/A" })).toBe("chiama")
    expect(linkLabel({ kind: "accesses", source: "flow/n1", target: "er/a", mode: "read" })).toBe("legge")
    expect(linkLabel({ kind: "accesses", source: "flow/n1", target: "er/a", mode: "write" })).toBe("scrive")
    expect(linkLabel({ kind: "accesses", source: "flow/n1", target: "er/a", mode: "read-write" })).toBe("legge e scrive")
  })

  it("titoli del pannello e voci della select del modo", () => {
    expect(LINK_TITLE).toEqual({ "maps-to": "Mappa su", accesses: "Accesso", calls: "Chiama" })
    expect(ACCESS_MODE_LABEL).toEqual({ read: "Legge", write: "Scrive", "read-write": "Legge e scrive" })
  })
})

describe("endName", () => {
  /** Un'entità, una classe e tre nodi di flusso: con etichetta, su due righe, senza etichetta. */
  function documento() {
    const doc = createDocument("t", "t")
    const lane = doc.diagram.flow.model.lanes[0]!.id
    doc.diagram.flow.model.nodes["n1"] = { label: "Calcola totale", shape: "process", lane }
    doc.diagram.flow.model.nodes["n2"] = { label: "Calcola\n  totale", shape: "process", lane }
    doc.diagram.flow.model.nodes["n3"] = { label: "  ", shape: "process", lane }
    return doc
  }

  it("entità e classi: il nome, cioè la chiave senza prefisso", () => {
    expect(endName(documento(), "er/ordini")).toBe("ordini")
    expect(endName(documento(), "class/Ordine")).toBe("Ordine")
  })

  it("nodo di flusso: l'etichetta, con a capo e spazi compattati", () => {
    // Review Focus 2.
    expect(endName(documento(), "flow/n1")).toBe("Calcola totale")
    expect(endName(documento(), "flow/n2")).toBe("Calcola totale")
  })

  it("nodo senza etichetta, e nodo che non esiste più", () => {
    expect(endName(documento(), "flow/n3")).toBe("(senza etichetta)")
    expect(endName(documento(), "flow/fantasma")).toBe("(nodo eliminato)")
  })
})

describe("persistenza del modo", () => {
  it("un accesso in scrittura torna uguale dal file", () => {
    // Review Focus 1.
    const doc = createDocument("t", "t")
    doc.diagram.links["l1"] = { kind: "accesses", source: "flow/n1", target: "er/ordini", mode: "write" }
    const r = parseDocument(toJson(doc))
    expect(r.ok && r.document.diagram.links["l1"]).toEqual({ kind: "accesses", source: "flow/n1", target: "er/ordini", mode: "write" })
  })
})
```

In `src/model/migrations.test.ts`:
- le quattro righe `expect(doc.schemaVersion).toBe(4)` / `expect(r.document.schemaVersion).toBe(4)` diventano `toBe(5)`;
- il titolo `"un documento già alla versione corrente (4) passa senza toccare niente"` diventa `"un documento già alla versione corrente (5) passa senza toccare niente"`;
- aggiungi in fondo:

```ts
describe("migrazione 4 → 5", () => {
  it("un documento v4 con un «mappa su» passa intatto, alla versione 5", () => {
    const doc = JSON.parse(toJson(createDocument("Prova", "v4doc"))) as { schemaVersion: number; diagram: { links: Record<string, unknown> } }
    doc.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
    const r = parseDocument(JSON.stringify({ ...doc, schemaVersion: 4 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(5)
    expect(r.document.diagram.links).toEqual({ l1: { kind: "maps-to", source: "class/Ordine", target: "er/ordini" } })
  })
})
```

In `src/model/class/schema.test.ts`, `expect(SCHEMA_VERSION).toBe(4)` diventa `expect(SCHEMA_VERSION).toBe(5)` e il commento sopra diventa `// La versione è quella corrente: la 4 → 5 non cambia forma, alza la versione per i collegamenti del flusso.`

In `src/editor/links/commands.test.ts`:
- nella fixture `documento()`, dopo la nota `n1`, aggiungi un nodo di flusso `p1`:

```ts
  const lane = doc.diagram.flow.model.lanes[0]!.id
  doc.diagram.flow.model.nodes["p1"] = { label: "Calcola totale", shape: "process", lane }
  doc.diagram.flow.view.nodes["p1"] = at()
```

  e aggiorna il docblock della fixture in `/** Un'entità \`ordini\`, una seconda entità \`clienti\`, una classe, un'interfaccia, un enum, una nota di classe e un processo \`p1\`. */`;
- **sostituisci** il test `"una coppia senza tipo è rifiutata, con le famiglie nell'ordine del gesto"` con:

```ts
  it("nodo → entità ed entità → nodo creano lo stesso accesso, in lettura", () => {
    for (const [from, to] of [["flow/p1", "er/ordini"], ["er/ordini", "flow/p1"]] as const) {
      state().load(documento())
      const r = connectAcross(state().doc, from, to)
      if (r.type !== "created") throw new Error(`atteso created, arrivato ${r.type}`)
      state().dispatch(r.recipe)
      expect(Object.values(links())).toEqual([{ kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read" }])
    }
  })

  it("nodo → classe e classe → nodo creano lo stesso «chiama», anche verso un'interfaccia", () => {
    for (const [from, to] of [["flow/p1", "class/Pagabile"], ["class/Pagabile", "flow/p1"]] as const) {
      state().load(documento())
      const r = connectAcross(state().doc, from, to)
      if (r.type !== "created") throw new Error(`atteso created, arrivato ${r.type}`)
      state().dispatch(r.recipe)
      expect(Object.values(links())).toEqual([{ kind: "calls", source: "flow/p1", target: "class/Pagabile" }])
    }
  })
```

In `src/editor/kinds/canvas-ops.test.ts`:
- il test `"addEdge fra due nodi della stessa famiglia collega, fra due famiglie senza tipo rifiuta"` diventa:

```ts
  it("addEdge fra due nodi della stessa famiglia collega, fra due famiglie crea un collegamento", () => {
    const { a, b } = erConDueEntita()
    const ops = canvasOps(state().doc)
    const r = ops.addEdge(`er/${a}`, `er/${b}`)
    expect(r?.type === "created" && r.key.startsWith("er/")).toBe(true)
    // Fra famiglie diverse decide `connectAcross`: il caso con un nodo di flusso vero è in
    // «famiglie mescolate», sotto.
    const across = ops.addEdge(`er/${a}`, "flow/n1")
    expect(across?.type === "created" && across.key.startsWith("link/")).toBe(true)
  })
```

- il test `"Collega fra un'entità e un nodo di flusso non crea niente, e dice perché"` diventa:

```ts
  it("Collega fra un'entità e un nodo di flusso crea un accesso in lettura", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    const r = canvasOps(state().doc).addEdge(entity.key, node.key)
    if (r?.type !== "created") throw new Error("atteso created")
    state().dispatch(r.recipe)
    expect(Object.values(state().doc.diagram.links)).toEqual([{ kind: "accesses", source: node.key, target: entity.key, mode: "read" }])
  })
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/model src/editor/links src/editor/kinds/canvas-ops.test.ts`
Expected: FAIL. `./labels` non esiste, `accesses` non è un tipo, la versione è ancora 4.

- [ ] **Step 3: Lo schema**

In `src/model/links/schema.ts`, sostituisci tutto quello che sta sopra il docblock di `linkRule` con:

```ts
import * as z from "zod"
import { inFamily, type Family } from "../family"
import { Identifier } from "../shared"

/** I tipi di collegamento fra famiglie: «mappa su» (4a), l'accesso e la chiamata del flusso (4b). */
export const LinkKindSchema = z.enum(["maps-to", "accesses", "calls"])
export type LinkKind = z.infer<typeof LinkKindSchema>

/**
 * Il modo di un accesso. Fra un nodo di flusso e un'entità c'è un solo accesso, qualunque cosa il
 * nodo ne faccia: il modo lo dice, e si cambia dal pannello (spec 4b §3).
 */
export const AccessModeSchema = z.enum(["read", "write", "read-write"])
export type AccessMode = z.infer<typeof AccessModeSchema>

/**
 * Le famiglie agli estremi di ogni tipo, nel verso del tipo: la sola definizione. La usano lo schema,
 * per rifiutare un file con gli estremi sbagliati, e `linkRule`, per il gesto Collega.
 */
export const LINK_ENDS: Readonly<Record<LinkKind, { source: Family; target: Family }>> = {
  "maps-to": { source: "class", target: "er" },
  accesses: { source: "flow", target: "er" },
  calls: { source: "flow", target: "class" },
}

const ends = { source: Identifier, target: Identifier }

/**
 * Un collegamento: gli estremi sono chiavi **con prefisso** (`class/Ordine`, `er/ordini`), il solo
 * punto in cui il prefisso entra nel modello, perché un collegamento attraversa le famiglie per
 * definizione. Un'unione discriminata su `kind`, perché solo l'accesso ha il modo. Lo schema controlla
 * la forma, non che gli estremi esistano: un collegamento pendente è un problema di validazione
 * (`links/validate.ts`), non un file illeggibile.
 */
export const LinkSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("maps-to"), ...ends }),
    z.object({ kind: z.literal("accesses"), ...ends, mode: AccessModeSchema }),
    z.object({ kind: z.literal("calls"), ...ends }),
  ])
  .refine((l) => inFamily(l.source, LINK_ENDS[l.kind].source) && inFamily(l.target, LINK_ENDS[l.kind].target), {
    message: "gli estremi del collegamento non appartengono alle famiglie del suo tipo",
  })
export type Link = z.infer<typeof LinkSchema>

/** La parte `links` del documento, per id (uuid): un collegamento non ha un nome. */
export const LinksSchema = z.record(z.string(), LinkSchema)
```

`linkRule` resta com'è.

- [ ] **Step 4: Le etichette e i nomi**

Crea `src/model/links/labels.ts`:

```ts
import type { DevDocument } from "../document"
import { splitKey } from "../family"
import type { AccessMode, Link, LinkKind } from "./schema"

/**
 * Le parole dei collegamenti, in un posto solo: le leggono il canvas, il pannello e i messaggi di
 * validazione, che stanno nel modello (spec 4b §3). Il titolo del pannello non dipende dal modo, così
 * non cambia mentre lo si modifica.
 */
export const LINK_TITLE: Readonly<Record<LinkKind, string>> = { "maps-to": "Mappa su", accesses: "Accesso", calls: "Chiama" }

/** Le voci della select del modo, nel pannello. */
export const ACCESS_MODE_LABEL: Readonly<Record<AccessMode, string>> = { read: "Legge", write: "Scrive", "read-write": "Legge e scrive" }

/** L'etichetta sul canvas e nei messaggi: il tipo, e per l'accesso il suo modo. Sempre in minuscolo. */
export function linkLabel(link: Link): string {
  return (link.kind === "accesses" ? ACCESS_MODE_LABEL[link.mode] : LINK_TITLE[link.kind]).toLowerCase()
}

/**
 * Il nome leggibile di un estremo, per i messaggi e per il pannello. Entità e classi hanno per chiave
 * il nome; un nodo di flusso ha per chiave un uuid, quindi si mostra la sua etichetta, su una riga.
 */
export function endName(doc: DevDocument, key: string): string {
  const { family, key: bare } = splitKey(key)
  if (family !== "flow") return bare
  const node = doc.diagram.flow.model.nodes[bare]
  if (!node) return "(nodo eliminato)"
  const label = node.label.replace(/\s+/g, " ").trim()
  return label === "" ? "(senza etichetta)" : label
}
```

- [ ] **Step 5: Versione e migrazione**

In `src/model/shared.ts`: `export const SCHEMA_VERSION = 5`.

In `src/model/migrations.ts`, dopo `addLinks`:

```ts
/**
 * 4 → 5: nessun cambiamento di forma. I tipi del flusso (spec 4b §3) allargano quello che un file può
 * contenere, e un file v4 è già un v5 valido. La versione sale perché un'app ferma alla 4 rifiuti un
 * file con i tipi nuovi dicendo che è più recente, invece che con un errore di schema.
 */
const sameShape: Migration = (raw) => raw
```

e la tabella diventa `new Map([[1, addClassNotes], [2, unifyDiagram], [3, addLinks], [4, sameShape]])`.

- [ ] **Step 6: Il gesto crea i tipi nuovi**

In `src/editor/links/commands.ts`:
- l'import dallo schema diventa `import { linkRule, type Link, type LinkKind } from "@/model/links/schema"` (già così: controlla solo che `Link` e `LinkKind` ci siano);
- sopra `connectAcross` aggiungi:

```ts
/** Il collegamento che nasce dal gesto: un accesso nasce in lettura, e il modo si cambia dal pannello. */
function newLink(kind: LinkKind, source: string, target: string): Link {
  return kind === "accesses" ? { kind, source, target, mode: "read" } : { kind, source, target }
}
```

- nella recipe di `connectAcross`, `draft.diagram.links[id] = { kind: rule.kind, source, target }` diventa `draft.diagram.links[id] = newLink(rule.kind, source, target)`;
- `refusal` ha oggi un `switch` con il solo `case "maps-to"`: aggiungi `default: return null` in coda allo `switch`, con il commento `// I tipi del flusso: i rifiuti delle note arrivano con il Task 2.` Il Task 2 lo sostituisce con i due casi veri.

- [ ] **Step 7: L'e2e del canvas misto**

In `scripts/e2e/misto.mjs`:
- nel docblock in testa, `che Collega fra un'entità e un nodo di flusso non crei niente e lo dica, mentre dentro una famiglia collega` diventa `che Collega fra un'entità e un nodo di flusso crei un accesso «legge», mentre dentro una famiglia crea una relazione`;
- il passo `"Collega fra un'entità e un nodo di flusso non crea niente, e lo dice"` diventa:

```js
    await step("Collega fra un'entità e un nodo di flusso crea «legge», e Canc lo toglie", async () => {
      await page.keyboard.press("r")
      await drag(page, await centerOf(page, "er/"), await centerOf(page, "flow/"))
      await expectText(page, '[data-edge-id^="link/"]', "legge")
      // Appena creato è selezionato: Canc lo toglie, e il resto dello scenario riparte senza archi.
      await page.keyboard.press("Delete")
      await page.waitForSelector('[data-edge-id^="link/"]', { state: "detached" })
    })
```

- [ ] **Step 8: Lancia tutti i test, i controlli e l'e2e**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: PASS. Se `tsc` segnala un letterale `Link` altrove (test o codice) che non compila più con l'unione, correggilo aggiungendo solo quello che l'unione richiede.

- [ ] **Step 9: Commit**

```bash
git add src/model src/editor/links src/editor/kinds/canvas-ops.test.ts scripts/e2e/misto.mjs
git commit -m "$(cat <<'EOF'
feat(model): accesso e «chiama» fra flusso, entità e classi, e la versione 5

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rifiuti delle note, `setLinkMode`, e la coerenza dei tipi nuovi

**Files:**
- Modify: `src/editor/links/commands.ts`
- Modify: `src/editor/links/commands.test.ts`
- Modify: `src/editor/kinds/canvas-ops.test.ts`

**Interfaces:**
- Consumes: `Link`, `AccessMode`, `LinkKind` (Task 1); `newLink` e la fixture `documento()` con `p1` (Task 1); `flowDiagram` (`src/editor/flow-access.ts`), `classDiagram` (`src/editor/class-access.ts`).
- Produces: `setLinkMode(id: string, mode: AccessMode): Recipe` da `@/editor/links/commands`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/links/commands.test.ts`:
- aggiungi `setLinkMode` all'import da `./commands`, e `import { renameClass } from "../class/commands"` fra gli import;
- nella fixture `documento()`, dopo `p1`, aggiungi una nota di flusso `f1`:

```ts
  doc.diagram.flow.model.nodes["f1"] = { label: "promemoria", shape: "note", lane }
  doc.diagram.flow.view.nodes["f1"] = at()
```

  e aggiorna il docblock della fixture aggiungendo `, e una nota di flusso \`f1\``;
- dentro `describe("connectAcross")`:

```ts
  it("le note non leggono, non scrivono, non chiamano e non si chiamano", () => {
    expect(connectAcross(state().doc, "flow/f1", "er/ordini")).toEqual({ type: "rejected", notice: "Una nota non legge né scrive una tabella." })
    expect(connectAcross(state().doc, "er/ordini", "flow/f1")).toEqual({ type: "rejected", notice: "Una nota non legge né scrive una tabella." })
    expect(connectAcross(state().doc, "flow/f1", "class/Ordine")).toEqual({ type: "rejected", notice: "Una nota non chiama una classe." })
    expect(connectAcross(state().doc, "class/n1", "flow/p1")).toEqual({ type: "rejected", notice: "Una nota non si chiama." })
  })

  it("dopo il cambio di modo un secondo gesto seleziona l'accesso che c'è", () => {
    // Review Focus 5: il confronto ignora il modo.
    const first = connectAcross(state().doc, "flow/p1", "er/ordini")
    if (first.type !== "created") throw new Error("atteso created")
    state().dispatch(first.recipe)
    const id = Object.keys(links())[0]!
    state().dispatch(setLinkMode(id, "write"))
    expect(connectAcross(state().doc, "er/ordini", "flow/p1")).toEqual({ type: "existing", key: first.key })
  })
```

- in fondo al file:

```ts
describe("setLinkMode", () => {
  /** Un accesso `a1` in lettura e un «mappa su» `m1`. */
  function accessi() {
    state().dispatch((draft) => {
      draft.diagram.links["a1"] = { kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read" }
      draft.diagram.links["m1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
    })
  }

  it("cambia il modo, e l'annulla lo riporta indietro", () => {
    accessi()
    expect(state().dispatch(setLinkMode("a1", "read-write"))).toBe(true)
    expect(links()["a1"]).toEqual({ kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read-write" })
    state().undo()
    expect(links()["a1"]).toEqual({ kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read" })
  })

  it("lo stesso modo, un id che non c'è o un collegamento di un altro tipo non scrivono niente", () => {
    // Review Focus 4: su un «mappa su» non deve comparire un campo `mode`.
    accessi()
    expect(state().dispatch(setLinkMode("a1", "read"))).toBe(false)
    expect(state().dispatch(setLinkMode("fantasma", "write"))).toBe(false)
    expect(state().dispatch(setLinkMode("m1", "write"))).toBe(false)
    expect(links()["m1"]).toEqual({ kind: "maps-to", source: "class/Ordine", target: "er/ordini" })
  })
})

describe("coerenza dei collegamenti del flusso", () => {
  it("rinominare una classe sposta il target di un «chiama»", () => {
    // Review Focus 3: nel 4a la classe rinominata era solo `source`.
    state().dispatch((draft) => {
      draft.diagram.links["c1"] = { kind: "calls", source: "flow/p1", target: "class/Ordine" }
    })
    state().dispatch(followRename(renameClass("Ordine", "Fattura")!, "class", "Ordine", "Fattura"))
    expect(links()["c1"]!.target).toBe("class/Fattura")
  })

  it("rinominare un'entità sposta il target di un accesso", () => {
    state().dispatch((draft) => {
      draft.diagram.links["a1"] = { kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "write" }
    })
    state().dispatch(followRename(renameEntity("ordini", "righe")!, "er", "ordini", "righe"))
    expect(links()["a1"]).toEqual({ kind: "accesses", source: "flow/p1", target: "er/righe", mode: "write" })
  })
})
```

In `src/editor/kinds/canvas-ops.test.ts`, dentro `describe("canvasOps (famiglie mescolate)")`:

```ts
  it("eliminare un nodo di flusso elimina i suoi collegamenti, in un solo passo di annulla", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    const link = canvasOps(state().doc).addEdge(node.key, entity.key)
    if (link?.type !== "created") throw new Error("atteso created")
    state().dispatch(link.recipe)
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).deleteItems([node.key], [])!)
    expect(state().doc.diagram.links).toEqual({})
    expect(state().past.length).toBe(past + 1)
    state().undo()
    expect(Object.keys(state().doc.diagram.links)).toHaveLength(1)
  })
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/editor/links src/editor/kinds/canvas-ops.test.ts`
Expected: FAIL. `setLinkMode` non esiste, e le note non sono rifiutate. (Il test di cascata e quelli di rinomina possono già passare: fissano un comportamento che esiste, spec 4b §5.)

- [ ] **Step 3: I rifiuti delle note**

In `src/editor/links/commands.ts`:
- aggiungi `import { flowDiagram } from "../flow-access"` e, all'import dallo schema, `type AccessMode`;
- `refusal` diventa:

```ts
/**
 * Il motivo per cui gli estremi non ammettono il tipo, o `null` se lo ammettono. `source` e `target`
 * sono già nel verso del tipo. La regola «solo class e abstract» vive nel modello (`unmappableNotice`,
 * review finale F1 del 4a): qui la si usa per l'avviso, e `validateLinks` la stessa fonte per l'errore
 * `link-unmappable`. Le note, di flusso e di classe, non partecipano ai collegamenti del flusso
 * (spec 4b §4).
 */
function refusal(doc: DevDocument, kind: LinkKind, source: string, target: string): string | null {
  switch (kind) {
    case "maps-to": {
      const key = splitKey(source).key
      const cls = classDiagram(doc).model.classes[key]
      // Nella famiglia `class` un nodo che non è una classe è una nota.
      if (!cls) return "Una nota non si mappa su una tabella."
      return unmappableNotice(cls.stereotype)
    }
    case "accesses":
      return isFlowNote(doc, source) ? "Una nota non legge né scrive una tabella." : null
    case "calls":
      if (isFlowNote(doc, source)) return "Una nota non chiama una classe."
      return classDiagram(doc).model.notes[splitKey(target).key] ? "Una nota non si chiama." : null
  }
}

/** `true` se `key` è un nodo di flusso con la forma della nota. */
function isFlowNote(doc: DevDocument, key: string): boolean {
  return flowDiagram(doc).model.nodes[splitKey(key).key]?.shape === "note"
}
```

- in `connectAcross`, `const refused = refusal(doc, rule.kind, source)` diventa `const refused = refusal(doc, rule.kind, source, target)`.

- [ ] **Step 4: `setLinkMode`**

In `src/editor/links/commands.ts`, dopo `deleteLinks`:

```ts
/**
 * Il modo di un accesso (spec 4b §6). Su un id che non c'è o su un collegamento di un altro tipo non
 * scrive niente; con lo stesso modo nemmeno, perché Immer non registra un'assegnazione che non cambia
 * il valore, e `dispatch` non aggiunge un passo di annulla.
 */
export function setLinkMode(id: string, mode: AccessMode): Recipe {
  return (draft) => {
    const link = draft.diagram.links[id]
    if (link?.kind === "accesses") link.mode = mode
  }
}
```

- [ ] **Step 5: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/editor/links src/editor/kinds/canvas-ops.test.ts
git commit -m "$(cat <<'EOF'
feat(editor): le note non si collegano al flusso, e il modo di un accesso si cambia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Validazione per tipo, con il messaggio del pendente generico

**Files:**
- Modify: `src/model/links/validate.ts`
- Modify: `src/model/links/validate.test.ts`

**Interfaces:**
- Consumes: `linkLabel`, `endName` (Task 1).
- Produces: `validateLinks(doc)` con la stessa firma. I codici non cambiano.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/model/links/validate.test.ts`, in fondo:

```ts
describe("validateLinks (collegamenti del flusso)", () => {
  /** L'entità `ordini`, la classe `Ordine` e un processo `p1`, con un accesso e un «chiama». */
  function flusso(): DevDocument {
    const doc = documento([], [])
    delete doc.diagram.links["l1"]
    const lane = doc.diagram.flow.model.lanes[0]!.id
    doc.diagram.flow.model.nodes["p1"] = { label: "Calcola totale", shape: "process", lane }
    doc.diagram.links["a1"] = { kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "write" }
    doc.diagram.links["c1"] = { kind: "calls", source: "flow/p1", target: "class/Ordine" }
    return doc
  }

  it("un accesso e un «chiama» validi non hanno problemi", () => {
    expect(validateLinks(flusso())).toEqual([])
  })

  it("un accesso e un «chiama» non hanno le regole degli attributi", () => {
    // La classe ha un attributo senza colonna: con un «mappa su» sarebbe un avviso, qui no.
    const doc = flusso()
    doc.diagram.class.model.classes["Ordine"]!.attributes.push(attr("note", "string"))
    expect(validateLinks(doc)).toEqual([])
  })

  it("con il nodo di flusso eliminato sono pendenti, con «(nodo eliminato)» nel messaggio", () => {
    const doc = flusso()
    delete doc.diagram.flow.model.nodes["p1"]
    expect(validateLinks(doc)).toEqual([
      {
        code: "link-dangling",
        severity: "error",
        message: "Il collegamento «scrive» fra «(nodo eliminato)» e «ordini» punta a un elemento che non esiste più",
        edge: "a1",
      },
      {
        code: "link-dangling",
        severity: "error",
        message: "Il collegamento «chiama» fra «(nodo eliminato)» e «Ordine» punta a un elemento che non esiste più",
        edge: "c1",
      },
    ])
  })

  it("con la classe eliminata, il «chiama» è pendente e nomina il nodo con la sua etichetta", () => {
    const doc = flusso()
    delete doc.diagram.class.model.classes["Ordine"]
    expect(validateLinks(doc)).toEqual([
      {
        code: "link-dangling",
        severity: "error",
        message: "Il collegamento «chiama» fra «Calcola totale» e «Ordine» punta a un elemento che non esiste più",
        edge: "c1",
      },
    ])
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/model/links/validate.test.ts`
Expected: FAIL. `validateLinks` tratta ogni collegamento come un «mappa su».

- [ ] **Step 3: Implementa**

In `src/model/links/validate.ts`:
- aggiungi `import { endName, linkLabel } from "./labels"`;
- sopra `validateLinks`:

```ts
/** `true` se l'estremo esiste: un'entità, una classe (non una nota) o un nodo di flusso. */
function endExists(doc: DevDocument, key: string): boolean {
  const { family, key: bare } = splitKey(key)
  switch (family) {
    case "er":
      return doc.diagram.er.model.entities[bare] !== undefined
    case "class":
      return doc.diagram.class.model.classes[bare] !== undefined
    case "flow":
      return doc.diagram.flow.model.nodes[bare] !== undefined
  }
}
```

- nel docblock di `validateLinks`, `Oggi il solo tipo è «mappa su» (classe → entità); il 4b aggiungerà i suoi.` diventa `Ogni tipo può essere pendente; solo «mappa su» ha regole sue (spec 4a §5). L'accesso e «chiama» servono a documentare e non ne hanno (spec 4b §7).`;
- il corpo del ciclo, dall'inizio fino a `bySource.set(...)` compreso, diventa:

```ts
  for (const [id, link] of Object.entries(links)) {
    if (!endExists(doc, link.source) || !endExists(doc, link.target)) {
      // Manca uno dei due lati: niente altri controlli su questo collegamento.
      issues.push({
        code: "link-dangling",
        severity: "error",
        message: `Il collegamento «${linkLabel(link)}» fra «${endName(doc, link.source)}» e «${endName(doc, link.target)}» punta a un elemento che non esiste più`,
        edge: id,
      })
      continue
    }
    if (link.kind !== "maps-to") continue
    const s = splitKey(link.source)
    const t = splitKey(link.target)
    const cls = classPart.model.classes[s.key]
    const entity = er.model.entities[t.key]
    // Già garantiti da `endExists`: il controllo serve solo a restringere il tipo.
    if (!cls || !entity) continue
    bySource.set(link.source, (bySource.get(link.source) ?? 0) + 1)
```

  Il resto del ciclo (stereotipo, attributi) e il ciclo di `class-maps-multiple` restano uguali.

- [ ] **Step 4: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS, compresi i test del 4a in `validate.test.ts` senza modifiche (il messaggio del «mappa su» pendente resta identico).

- [ ] **Step 5: Commit**

```bash
git add src/model/links/validate.ts src/model/links/validate.test.ts
git commit -m "$(cat <<'EOF'
feat(model): validazione dei collegamenti per tipo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Etichette dal modello sul canvas, e il pannello con il modo

**Files:**
- Delete: `src/ui/canvas/link-label.ts`
- Modify: `src/ui/canvas/LinkEdge.tsx`
- Modify: `src/ui/panels/LinkProperties.tsx`
- Modify: `src/ui/canvas/render.test.tsx`
- Modify: `src/ui/panels/LinkProperties.test.tsx`

**Interfaces:**
- Consumes: `linkLabel`, `LINK_TITLE`, `ACCESS_MODE_LABEL`, `endName` (Task 1); `AccessModeSchema` (Task 1); `setLinkMode` (Task 2).
- Produces: nessuna firma nuova. `LINK_LABEL` sparisce.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/ui/canvas/render.test.tsx`, dentro `describe("LinkEdgeView")`:

```ts
  it("un accesso in scrittura ha l'etichetta del suo modo", () => {
    const html = renderToStaticMarkup(
      <LinkEdgeView
        id="a1"
        link={{ kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "write" }}
        source={{ x: 0, y: 0, w: 100, h: 40 }}
        target={{ x: 300, y: 0, w: 100, h: 40 }}
        selected={false}
      />,
    )
    expect(html).toContain(">scrive<")
  })
```

In `src/ui/panels/LinkProperties.test.tsx`:
- il primo test cerca ora il titolo esatto, che non passa più da una classe CSS: `expect(container.textContent).toContain("mappa su")` diventa `expect(container.textContent).toContain("Mappa su")`;
- in fondo al file:

```tsx
describe("pannello di un collegamento del flusso", () => {
  /** Aggiunge il processo `p1` «Calcola totale», un accesso `a1` e un «chiama» `c1`, e seleziona `id`. */
  function seleziona(id: string) {
    act(() => {
      documentStore.getState().dispatch((draft) => {
        const lane = draft.diagram.flow.model.lanes[0]!.id
        draft.diagram.flow.model.nodes["p1"] = { label: "Calcola totale", shape: "process", lane }
        draft.diagram.flow.view.nodes["p1"] = { x: 0, y: 40, collapsed: false }
        draft.diagram.links["a1"] = { kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read" }
        draft.diagram.links["c1"] = { kind: "calls", source: "flow/p1", target: "class/Ordine" }
      })
      sessionStore.getState().setSelection([selId("edge", `link/${id}`)])
    })
  }

  it("un accesso mostra il titolo, gli estremi con l'etichetta del nodo e la select del modo", () => {
    seleziona("a1")
    expect(container.textContent).toContain("Accesso")
    expect(container.textContent).toContain("Calcola totale → ordini")
    const select = container.querySelector<HTMLSelectElement>("#link-mode")!
    expect(select.value).toBe("read")
    expect([...select.options].map((o) => o.textContent)).toEqual(["Legge", "Scrive", "Legge e scrive"])
  })

  it("cambiare il modo aggiorna il documento", () => {
    seleziona("a1")
    const select = container.querySelector<HTMLSelectElement>("#link-mode")!
    act(() => {
      select.value = "write"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(documentStore.getState().doc.diagram.links["a1"]).toEqual({ kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "write" })
  })

  it("un «chiama» mostra il titolo e nessuna select", () => {
    seleziona("c1")
    expect(container.textContent).toContain("Chiama")
    expect(container.textContent).toContain("Calcola totale → Ordine")
    expect(container.querySelector("#link-mode")).toBeNull()
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/ui/canvas/render.test.tsx src/ui/panels/LinkProperties.test.tsx`
Expected: FAIL. L'etichetta dell'accesso non esiste in `LINK_LABEL`, e il pannello non ha la select.

- [ ] **Step 3: Il canvas**

In `src/ui/canvas/LinkEdge.tsx`: `import { LINK_LABEL } from "./link-label"` diventa `import { linkLabel } from "@/model/links/labels"` (fra gli import `@/model`, dopo `import type { Link } from "@/model/links/schema"`), e `{LINK_LABEL[link.kind]}` diventa `{linkLabel(link)}`.

Elimina `src/ui/canvas/link-label.ts` (`git rm`).

- [ ] **Step 4: Il pannello**

`src/ui/panels/LinkProperties.tsx` diventa:

```tsx
import { useMemo } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { deleteSelection } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { setLinkMode } from "@/editor/links/commands"
import { ACCESS_MODE_LABEL, LINK_TITLE, endName } from "@/model/links/labels"
import { AccessModeSchema } from "@/model/links/schema"
import { validateLinks } from "@/model/links/validate"

/**
 * Il pannello di un collegamento fra famiglie (spec 4a §7, 4b §8): il tipo, i due estremi con i loro
 * nomi leggibili, per un accesso la select del modo, i problemi di quel collegamento e il pulsante
 * per eliminarlo. I problemi sono quelli del pannello Problemi filtrati sul collegamento;
 * `validateLinks` basta, perché nessun problema di famiglia ha un collegamento come obiettivo.
 */
export function LinkProperties({ linkId: id }: { linkId: string }) {
  const link = useStore(documentStore, (s) => s.doc.diagram.links[id])
  const doc = useStore(documentStore, (s) => s.doc)
  // Anche il problema sulla classe sorgente (`class-maps-multiple`, `node`) compare qui: aprendo uno
  // dei due collegamenti di una classe che ne ha troppi, si vede subito perché (F2, review finale 4a).
  const issues = useMemo(() => validateLinks(doc).filter((i) => i.edge === id || i.node === link?.source), [doc, id, link?.source])
  if (!link) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-sm font-medium">{LINK_TITLE[link.kind]}</p>
      <p className="text-xs text-muted-foreground">
        {endName(doc, link.source)} → {endName(doc, link.target)}
      </p>
      {link.kind === "accesses" && (
        <div className="grid gap-1">
          <Label htmlFor="link-mode">Modo</Label>
          <select
            id="link-mode"
            value={link.mode}
            onChange={(e) => documentStore.getState().dispatch(setLinkMode(id, AccessModeSchema.parse(e.target.value)))}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {AccessModeSchema.options.map((m) => <option key={m} value={m}>{ACCESS_MODE_LABEL[m]}</option>)}
          </select>
        </div>
      )}
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {issues.map((issue, i) => (
            <li key={i} className="flex gap-2">
              <span className={issue.severity === "error" ? "text-destructive" : "text-amber-500"}>{issue.severity === "error" ? "●" : "▲"}</span>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={() => deleteSelection()}>Elimina collegamento</Button>
    </div>
  )
}
```

(La select è una `<select>` nativa con le stesse classi di `StereotypeSelect` in `ClassProperties.tsx`.)

- [ ] **Step 5: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS. `grep -rn "LINK_LABEL\|link-label" src` non trova niente.

- [ ] **Step 6: Commit**

```bash
git add -A src/ui/canvas src/ui/panels
git commit -m "$(cat <<'EOF'
feat(ui): etichette dei collegamenti dal modello, e il modo dell'accesso nel pannello

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: E2E dei collegamenti del flusso, README e limiti della spec

**Files:**
- Modify: `scripts/e2e/collegamenti.mjs`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-25-collegamenti-flusso-design.md`

**Interfaces:**
- Consumes: tutto il comportamento dei task precedenti, dal browser.
- Produces: nessuna firma.

- [ ] **Step 1: I passi nuovi dello scenario**

In `scripts/e2e/collegamenti.mjs`:
- nel docblock in testa, dopo `e l'avviso quando il gesto viene rifiutato.` aggiungi la frase `Poi i collegamenti del flusso (spec 4b §9): un processo che legge l'entità, il modo cambiato dal pannello, un «chiama» verso la classe, e il rifiuto di una nota del flusso.`;
- sotto `centerOfId` aggiungi:

```js
/** Centro in coordinate schermo del nodo di flusso che mostra `text`. */
async function centerOfFlow(page, text) {
  const id = await page.evaluate((t) => [...document.querySelectorAll('[data-node-id^="flow/"]')].find((g) => g.textContent.includes(t))?.getAttribute("data-node-id"), text)
  if (!id) throw new Error(`nessun nodo di flusso con «${text}»`)
  return centerOfId(page, id)
}
```

- accanto agli altri locator (`entityName`, `className`, `members`) aggiungi `const nodeText = page.locator('[aria-label="Testo del nodo"]')`;
- dopo il passo `"Collega fra un'interfaccia e l'entità: avviso, e nessun collegamento"`, prima di `await context.close()`:

```js
    await step("un processo collegato all'entità: nasce «legge»", async () => {
      // `2` è il processo (spec flowchart §11); la prima corsia sta in alto (y 0–160 nel mondo).
      await page.keyboard.press("2")
      await page.mouse.click(canvas.x + 400, canvas.y + 60)
      await nodeText.waitFor()
      await nodeText.fill("Calcola totale")
      await nodeText.blur()
      await nodeText.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, await centerOfFlow(page, "Calcola totale"), await centerOfId(page, "er/righe"))
      await expectText(page, LINK, "legge")
      if ((await page.locator(LINK).count()) !== 1) throw new Error("atteso un solo collegamento")
    })

    await step("dal pannello il modo diventa «Scrive», e l'etichetta segue", async () => {
      // Appena creato, il collegamento è selezionato e il pannello è il suo.
      await page.locator("#link-mode").selectOption("write")
      await expectText(page, LINK, "scrive")
    })

    await step("lo stesso processo collegato alla classe: nasce «chiama»", async () => {
      await page.keyboard.press("r")
      await drag(page, await centerOfFlow(page, "Calcola totale"), await centerOfId(page, "class/Ordine"))
      await expectText(page, LINK, "chiama")
      if ((await page.locator(LINK).count()) !== 2) throw new Error("attesi due collegamenti")
    })

    await step("una nota del flusso verso l'entità: avviso, e nessun collegamento nuovo", async () => {
      await page.keyboard.press("6")
      await page.mouse.click(canvas.x + 900, canvas.y + 60)
      await nodeText.waitFor()
      await nodeText.fill("promemoria")
      await nodeText.blur()
      await nodeText.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, await centerOfFlow(page, "promemoria"), await centerOfId(page, "er/righe"))
      await expectText(page, "[data-notice-bar]", "Una nota non legge né scrive una tabella.")
      if ((await page.locator(LINK).count()) !== 2) throw new Error("è nato un collegamento da una nota")
      await page.keyboard.press("Escape")
    })
```

Note per chi implementa, da verificare contro l'app vera e non da indovinare:
- `2` e `6` sono i tasti di processo e nota di flusso (`src/ui/canvas/kinds/flow.tsx`, `key: String(i + 1)` sull'ordine di `FlowShapeSchema`).
- Se un clic per creare il nodo cade su un collegamento o su un nodo esistente, sposta le coordinate: i nodi dello scenario stanno a (200, 320), (650, 320) e (650, 600).
- Se il passo precedente lascia lo strumento Collega attivo (il rifiuto lo lascia attivo per scelta), l'`Escape` finale di quel passo lo riporta a Seleziona: controllalo prima di premere `2`.
- Se un passo fallisce, correggi lo scenario solo quando il difetto è nello scenario. Se il difetto è nell'app, correggi l'app e aggiungi un test unitario che lo fissi.

- [ ] **Step 2: Lancia l'e2e**

Run: `pnpm build && node scripts/e2e/collegamenti.mjs` mentre iteri, poi `pnpm e2e`.
Expected: PASS, compreso `e2e collegamenti: PASS` e `e2e misto: PASS`.

- [ ] **Step 3: README**

In `README.md`:
- il punto **Collegamenti fra famiglie** in «Disegna» diventa:

```markdown
- **Collegamenti fra famiglie**, con lo strumento Collega, trascinando in qualunque verso:
  - una classe **mappa su** un'entità, e l'app verifica che ogni attributo della classe abbia la sua
    colonna (`createdAt` e `created_at` sono lo stesso campo) e un tipo compatibile, e che una
    classe non mappi su più tabelle;
  - un nodo di flusso **accede** a un'entità — legge, scrive, o legge e scrive, scelto nel pannello —
    e **chiama** una classe.

  I collegamenti seguono le rinomine e spariscono con i loro nodi. Una nota non si collega: il gesto
  lo dice invece di non fare niente.
```

- nel punto **Canvas misto** della sezione «Test end-to-end», `che «Collega» fra un'entità e un nodo di flusso non crei niente e lo dica, mentre dentro la stessa famiglia colleghi (una seconda entità)` diventa `che «Collega» fra un'entità e un nodo di flusso crei un accesso «legge», mentre dentro la stessa famiglia crei una relazione (una seconda entità)`;
- il punto **Collegamenti** della stessa sezione diventa:

```markdown
- **Collegamenti**: crea un'entità `ordini` con la colonna `totale` e una classe `Ordine` con
  `totale` e `note`, le collega con «mappa su» e verifica che il pannello Problemi segnali solo
  `Ordine.note`. Poi rinomina l'entità e verifica che il collegamento resti attaccato, ricarica,
  elimina il collegamento con Canc, e prova a collegare un'interfaccia all'entità e verifica
  l'avviso. Infine collega un processo all'entità («legge», poi «scrive» dal pannello) e alla
  classe («chiama»), e verifica l'avviso per una nota del flusso.
```

- [ ] **Step 4: Il limite nella spec**

In `docs/superpowers/specs/2026-09-25-collegamenti-flusso-design.md`, nella §10, aggiungi in coda all'elenco:

```markdown
- Un nodo di flusso che diventa nota **dopo** essere stato collegato conserva i suoi collegamenti, e
  la validazione non lo segnala. Il gesto rifiuta la nota, ma la regola non si ricontrolla dopo: lo
  scopo è documentare, e la spec non vuole codici di problema nuovi (scostamento 2 del piano).
```

- [ ] **Step 5: Controlli finali**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/e2e/collegamenti.mjs README.md docs/superpowers/specs/2026-09-25-collegamenti-flusso-design.md
git commit -m "$(cat <<'EOF'
test(e2e): collegamenti del flusso, README e limiti della spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
