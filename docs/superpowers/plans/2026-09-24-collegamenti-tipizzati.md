# Collegamenti tipizzati (step 4a) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una classe si collega a un'entità con «mappa su». Il collegamento sta in una parte nuova del documento, segue rinomine ed eliminazioni, si disegna sul canvas e si valida (attributi senza colonna, tipi incompatibili, una classe una tabella).

**Architecture:** il modello guadagna `diagram.links`, con estremi con prefisso di famiglia e uno schema che ne controlla la forma, e passa alla versione 4. L'editor aggiunge i comandi dei collegamenti in `src/editor/links/`, e `CanvasOps` li instrada: le chiavi `link/<uuid>` si riconoscono prima di `splitKey`. La UI aggiunge un layer, un pannello e l'avviso di rifiuto nel gesto Collega.

**Tech Stack:** React 19 + TypeScript strict (`noUncheckedIndexedAccess`), zustand (vanilla store), Immer (recipe con patch), zod 4, Vitest, e2e con Playwright su `vite preview` (`pnpm e2e`).

**Spec:** `docs/superpowers/specs/2026-09-24-collegamenti-tipizzati-design.md`

## Scostamenti dalla spec, decisi scrivendo il piano

1. **`qualify` e `splitKey` scendono in `src/model/family.ts`.** La spec li vuole in `src/editor/families.ts`, ma lo schema (Task 1) e la validazione (Task 2) stanno nel modello, che non può importare `src/editor`, e devono leggere il prefisso degli estremi. Riscrivere il taglio del prefisso nel modello creerebbe una seconda definizione del formato. `src/editor/families.ts` li **ri-esporta**, quindi nessun import esistente cambia. `linkKey`/`linkId` restano in `src/editor/families.ts`, come vuole la spec.
2. **Un rifiuto in più: la nota di classe.** La spec rifiuta interfaccia ed enum verso un'entità, ma anche una nota è un nodo della famiglia `class`. Il gesto la rifiuta con «Una nota non si mappa su una tabella.».
3. **La rinomina passa da `followRename`, non da una chiamata diretta a `retargetLinks`.** `renameEntity` e `renameClass` rispondono a una collisione con una recipe che non fa niente. Se si componessero con `retargetLinks` senza guardia, una collisione sposterebbe i collegamenti sull'entità che esiste già. `followRename(rename, family, oldKey, newKey)` in `src/editor/links/commands.ts` sposta i collegamenti solo se la rinomina ha davvero tolto il nodo `oldKey`. I due helper della UI la compongono, come chiede la spec.
4. **La regola degli stereotipi vive solo nel gesto.** La spec non chiede di validare una classe che diventa interfaccia dopo il collegamento, quindi la regola «solo `class` e `abstract`» sta in `connectAcross` e non nel modello. **La review finale l'ha rovesciato (F1):** la regola sta ora nel modello (`unmappableNotice`, `src/model/links/mappable.ts`), il gesto la usa per l'avviso di rifiuto e `validateLinks` la stessa fonte per l'errore `link-unmappable` su un collegamento già esistente.
5. **`validateLinks` restituisce l'id del collegamento senza namespace** (`edge: "<uuid>"`), come le famiglie restituiscono chiavi senza prefisso. Il namespace `link/` lo aggiunge `CanvasOps.validate`. `node` porta invece la chiave con prefisso della classe (`class/Ordine`), perché è la forma in cui il collegamento la conserva.
6. **Il tipo di `CanvasOps.addEdge`** (la spec lo lascia al piano) è `ConnectResult | null`: `{ type: "created"; key; recipe }`, `{ type: "existing"; key }` oppure `{ type: "rejected"; notice }`. `null` resta il «niente, in silenzio» dentro una famiglia (nota → nota), come oggi.

## Global Constraints

- Lingua: commenti, docblock, messaggi e nomi dei test in italiano; identificatori in inglese, come nel codice esistente.
- Nessuna dipendenza nuova.
- `src/model` non importa `src/editor`, `src/io` né `src/ui`. `src/editor` non importa React né `src/io`. Sono regole ESLint già attive.
- Formato delle chiavi: famiglie `${family}/${key}`, tagliate al **primo** `/`; collegamenti `link/${uuid}`. Solo `qualify`/`splitKey`/`inFamily` (in `src/model/family.ts`) e `linkKey`/`linkId` (in `src/editor/families.ts`) costruiscono o riconoscono chiavi.
- `SCHEMA_VERSION` passa da 3 a 4.
- Testi esatti, da copiare così:
  - Etichetta sul canvas: `mappa su`. Titolo del pannello: `Mappa su` (stessa stringa, iniziale maiuscola via CSS).
  - Pulsante: `Elimina collegamento`.
  - Rifiuti: `Non esiste un collegamento fra ${nome A} e ${nome B}.` con nomi `un'entità`, `una classe`, `un nodo di flusso`, nell'ordine del gesto; `Un'interfaccia non si mappa su una tabella.`; `Un enum non si mappa su una tabella.`; `Una nota non si mappa su una tabella.`.
  - Validazione: `«${classe}.${attributo}» non ha una colonna in «${entità}»`; `«${classe}.${attributo}: ${tipo}» non è compatibile con «${entità}.${colonna} ${tipo colonna}»`; `Il collegamento «mappa su» fra «${classe}» e «${entità}» punta a un elemento che non esiste più`; `«${classe}» mappa su ${n} tabelle: una classe si mappa su una tabella sola`.
  - Export testo: `I collegamenti fra famiglie non hanno una notazione in questo formato.`
- Ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. I messaggi seguono lo stile del repo: `feat(ambito): …` in italiano.
- Verifiche a fine task: `pnpm tsc -b`, `pnpm lint` e `pnpm test` verdi. `pnpm e2e` verde dal Task 6 in poi (il Task 6 cambia il comportamento che `misto.mjs` controlla, e lo aggiorna).
- **Non lanciare `pnpm perf`.**

## Review Focus

Casi che la spec implica ma che nessun test dei task copre di default. Per ciascuno, il test è stato aggiunto al task che possiede il codice:

1. **Rinomina in collisione.** Rinominare un'entità collegata con il nome di un'altra entità che esiste già non deve spostare il collegamento sull'altra. → Task 3, test «una rinomina che collide non sposta niente»; Task 5, test su `renameEntityWithNotice`.
2. **Un tipo che si chiama come una proprietà di `Object`.** Un attributo di tipo `constructor` o `toString` non deve né rompere la validazione né abbinarsi a niente. → Task 2, test «un tipo che si chiama constructor non avvisa».
3. **Doppio clic su un collegamento.** `onDblClick` chiama `splitKey` sulla chiave colpita, che su `link/…` lancia. Deve non fare niente. → Task 6, test nel file dell'hook.
4. **Una selezione che contiene un collegamento.** `familySelectedKeys` chiama `splitKey` su ogni chiave selezionata, e un pannello di famiglia montato con un collegamento in selezione lancerebbe. → Task 1, test «salta i collegamenti».
5. **Annullare l'eliminazione di un'entità collegata.** Un solo ⌘Z deve riportare l'entità **e** il collegamento. → Task 4, test «deleteItems di un'entità elimina anche il collegamento, in un solo passo di annulla».

---

### Task 1: Modello — la parte `links`, la versione 4 e le chiavi `link/`

**Files:**
- Modify: `src/model/family.ts`
- Modify: `src/editor/families.ts`
- Create: `src/model/links/schema.ts`
- Modify: `src/model/document.ts`
- Modify: `src/model/shared.ts`
- Modify: `src/model/migrations.ts`
- Create: `src/model/links/schema.test.ts`
- Modify: `src/model/migrations.test.ts`, `src/model/class/schema.test.ts`, `src/model/document.test.ts`, `src/editor/families.test.ts`

**Interfaces:**
- Produces:
  - `qualify(family: Family, key: string): string`, `splitKey(qualified: string): { family: Family; key: string }`, `inFamily(qualified: string, family: Family): boolean`, tutte da `@/model/family` (le prime due ri-esportate da `@/editor/families`).
  - `LinkKindSchema` (`z.enum(["maps-to"])`), `type LinkKind`, `LINK_ENDS: Readonly<Record<LinkKind, { source: Family; target: Family }>>`, `LinkSchema`, `type Link = { kind: LinkKind; source: string; target: string }`, `LinksSchema`, `linkRule(from: Family, to: Family): { kind: LinkKind; reversed: boolean } | null`, da `@/model/links/schema`.
  - `DevDocument["diagram"]["links"]: Record<string, Link>`; `createDocument` restituisce `links: {}`.
  - `linkKey(id: string): string`, `linkId(key: string): string | null`, da `@/editor/families`.

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/model/links/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { LinkSchema, linkRule } from "./schema"

describe("LinkSchema", () => {
  it("accetta «mappa su» da una classe a un'entità", () => {
    expect(LinkSchema.safeParse({ kind: "maps-to", source: "class/Ordine", target: "er/ordini" }).success).toBe(true)
  })

  it("rifiuta «mappa su» da un'entità a una classe", () => {
    expect(LinkSchema.safeParse({ kind: "maps-to", source: "er/ordini", target: "class/Ordine" }).success).toBe(false)
  })

  it("rifiuta «mappa su» fra due classi", () => {
    expect(LinkSchema.safeParse({ kind: "maps-to", source: "class/Ordine", target: "class/Riga" }).success).toBe(false)
  })

  it("rifiuta un estremo con la sola famiglia e nessuna chiave", () => {
    expect(LinkSchema.safeParse({ kind: "maps-to", source: "class/", target: "er/ordini" }).success).toBe(false)
  })

  it("rifiuta un tipo sconosciuto", () => {
    expect(LinkSchema.safeParse({ kind: "calls", source: "class/Ordine", target: "er/ordini" }).success).toBe(false)
  })
})

describe("linkRule", () => {
  it("classe → entità è «mappa su» nel suo verso", () => {
    expect(linkRule("class", "er")).toEqual({ kind: "maps-to", reversed: false })
  })

  it("entità → classe è lo stesso tipo, da rovesciare", () => {
    expect(linkRule("er", "class")).toEqual({ kind: "maps-to", reversed: true })
  })

  it("una coppia senza tipo dà null", () => {
    expect(linkRule("flow", "er")).toBeNull()
    expect(linkRule("class", "flow")).toBeNull()
  })
})
```

In `src/model/migrations.test.ts`:
- le tre righe `expect(doc.schemaVersion).toBe(3)` / `expect(r.document.schemaVersion).toBe(3)` diventano `toBe(4)`;
- il titolo `"un documento già alla versione corrente (3) passa senza toccare niente"` diventa `"un documento già alla versione corrente (4) passa senza toccare niente"`;
- aggiungi `import { toJson } from "./serialize"` accanto all'import di `parseDocument` (stesso modulo: unisci in `import { parseDocument, toJson } from "./serialize"`);
- aggiungi in fondo:

```ts
/** Un documento v3 com'era su disco: le tre famiglie, senza la parte dei collegamenti. */
function v3Text(): string {
  const doc = JSON.parse(toJson(createDocument("Prova", "v3doc"))) as { schemaVersion: number; diagram: Record<string, unknown> }
  delete doc.diagram.links
  return JSON.stringify({ ...doc, schemaVersion: 3 })
}

describe("migrazione 3 → 4", () => {
  it("un documento v3 prende la parte dei collegamenti, vuota", () => {
    const r = parseDocument(v3Text())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(4)
    expect(r.document.diagram.links).toEqual({})
  })

  it("un documento v2 arriva alla 4 passando dalla 3", () => {
    const r = parseDocument(v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } }))
    expect(r.ok && r.document.diagram.links).toEqual({})
  })
})
```

In `src/model/class/schema.test.ts`, nel test «classi ed entità nello stesso documento validano insieme», `expect(SCHEMA_VERSION).toBe(3)` diventa `expect(SCHEMA_VERSION).toBe(4)` e il commento sopra diventa `// La versione è quella corrente: la migrazione 3 → 4 aggiunge i collegamenti fra famiglie.`

In `src/model/document.test.ts` aggiungi, dentro il primo `describe` esistente:

```ts
  it("createDocument nasce senza collegamenti", () => {
    expect(createDocument("x", "id").diagram.links).toEqual({})
  })
```

In `src/editor/families.test.ts` aggiorna l'import in `import { editingIn, familySelectedKeys, linkId, linkKey, qualify, splitKey } from "./families"` e aggiungi:

```ts
describe("linkKey / linkId", () => {
  it("si invertono l'una con l'altra", () => {
    expect(linkKey("l1")).toBe("link/l1")
    expect(linkId(linkKey("l1"))).toBe("l1")
  })

  it("linkId su una chiave di famiglia dà null", () => {
    expect(linkId("er/utenti")).toBeNull()
    expect(linkId("class/link")).toBeNull()
  })

  it("una chiave di collegamento non è una chiave di famiglia", () => {
    expect(() => splitKey(linkKey("l1"))).toThrow()
  })
})
```

e, dentro `describe("familySelectedKeys")`:

```ts
  it("salta i collegamenti: non appartengono a nessuna famiglia", () => {
    // Review Focus 4: senza il salto, `splitKey` lancerebbe su `link/l1`.
    const selection = new Set([selId("edge", linkKey("l1")), selId("edge", "er/r1")])
    expect(familySelectedKeys(selection, "edge", "er")).toEqual(["r1"])
  })
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/model src/editor/families.test.ts`
Expected: FAIL. `./schema` non esiste, `linkKey` non è esportato, la versione è ancora 3.

- [ ] **Step 3: Sposta `qualify` e `splitKey` nel modello**

`src/model/family.ts` diventa:

```ts
/**
 * Le famiglie di elementi che un documento contiene. L'ordine è quello canonico, e tutto ciò che
 * le scorre lo rispetta: layer del canvas, blocchi del layout, formati di export, validazione.
 */
export const FAMILIES = ["er", "class", "flow"] as const
export type Family = (typeof FAMILIES)[number]

/**
 * Chiave con prefisso di famiglia: `er/utenti`, `class/Ordine`, `flow/n3`. È la sola forma di
 * chiave che canvas, selezione, editing e `dom-registry` conoscono, ed è quella con cui un
 * collegamento fra famiglie conserva i suoi estremi. I moduli di famiglia (comandi, `DiagramOps`,
 * validatori, emettitori, pannelli) lavorano senza prefisso: lo aggiunge `CanvasOps` all'andata e
 * lo toglie al ritorno. Sta nel modello perché lo schema dei collegamenti lo legge; `editor/families.ts`
 * lo ri-esporta. Nessun altro file costruisce o spezza chiavi a mano.
 */
export function qualify(family: Family, key: string): string {
  return `${family}/${key}`
}

/**
 * `true` se `qualified` è una chiave non vuota di `family`. Non lancia, a differenza di `splitKey`:
 * serve allo schema, che davanti a un file con gli estremi sbagliati deve rifiutarlo, non esplodere.
 */
export function inFamily(qualified: string, family: Family): boolean {
  const prefix = qualify(family, "")
  return qualified.startsWith(prefix) && qualified.length > prefix.length
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
```

In `src/editor/families.ts`:
- togli le due funzioni `qualify` e `splitKey` con i loro docblock;
- sostituisci le due righe di import in testa al file (`FAMILIES` non serve più) con:

```ts
import { splitKey, type Family } from "@/model/family"
import { parseSelId, type SelectionKind, type SessionState } from "./session-store"

// `qualify` e `splitKey` stanno nel modello (lo schema dei collegamenti legge il prefisso): qui si
// ri-esportano, così canvas, pannelli e comandi continuano a importarli da un posto solo.
export { qualify, splitKey } from "@/model/family"

const LINK_PREFIX = "link/"

/**
 * Chiave sul canvas di un collegamento fra famiglie: `link/<uuid>`. `link` non è una famiglia ma un
 * namespace a parte, quindi `splitKey` continua a rifiutarla. Queste due funzioni sono le sole che
 * costruiscono o riconoscono una chiave di collegamento.
 */
export function linkKey(id: string): string {
  return `${LINK_PREFIX}${id}`
}

/** L'id del collegamento, se `key` è una chiave di collegamento; altrimenti `null`. */
export function linkId(key: string): string | null {
  return key.startsWith(LINK_PREFIX) ? key.slice(LINK_PREFIX.length) : null
}
```

- in `familySelectedKeys`, subito dopo `if (sel.kind !== kind) return []`, aggiungi:

```ts
    // Un collegamento non appartiene a nessuna famiglia: nessun pannello di famiglia lo vede.
    if (linkId(sel.key) !== null) return []
```

- [ ] **Step 4: Crea lo schema dei collegamenti**

`src/model/links/schema.ts`:

```ts
import * as z from "zod"
import { inFamily, type Family } from "../family"
import { Identifier } from "../shared"

/** I tipi di collegamento fra famiglie. Lo step 4b aggiunge i suoi a questa unione. */
export const LinkKindSchema = z.enum(["maps-to"])
export type LinkKind = z.infer<typeof LinkKindSchema>

/**
 * Le famiglie agli estremi di ogni tipo, nel verso del tipo: la sola definizione. La usano lo schema,
 * per rifiutare un file con gli estremi sbagliati, e `linkRule`, per il gesto Collega.
 */
export const LINK_ENDS: Readonly<Record<LinkKind, { source: Family; target: Family }>> = {
  "maps-to": { source: "class", target: "er" },
}

/**
 * Un collegamento: gli estremi sono chiavi **con prefisso** (`class/Ordine`, `er/ordini`), il solo
 * punto in cui il prefisso entra nel modello, perché un collegamento attraversa le famiglie per
 * definizione. Lo schema controlla la forma, non che gli estremi esistano: un collegamento pendente
 * è un problema di validazione (`links/validate.ts`), non un file illeggibile.
 */
export const LinkSchema = z
  .object({ kind: LinkKindSchema, source: Identifier, target: Identifier })
  .refine((l) => inFamily(l.source, LINK_ENDS[l.kind].source) && inFamily(l.target, LINK_ENDS[l.kind].target), {
    message: "gli estremi del collegamento non appartengono alle famiglie del suo tipo",
  })
export type Link = z.infer<typeof LinkSchema>

/** La parte `links` del documento, per id (uuid): un collegamento non ha un nome. */
export const LinksSchema = z.record(z.string(), LinkSchema)

/**
 * Il tipo di collegamento che nasce fra due famiglie, in qualunque ordine, e se il gesto va
 * rovesciato per rispettarne il verso. `null`: la coppia non ha un tipo.
 */
export function linkRule(from: Family, to: Family): { kind: LinkKind; reversed: boolean } | null {
  for (const kind of LinkKindSchema.options) {
    const ends = LINK_ENDS[kind]
    if (ends.source === from && ends.target === to) return { kind, reversed: false }
    if (ends.source === to && ends.target === from) return { kind, reversed: true }
  }
  return null
}
```

- [ ] **Step 5: Documento, versione e migrazione**

In `src/model/document.ts`:
- aggiungi `import { LinksSchema } from "./links/schema"`;
- `DiagramSchema` diventa `z.object({ er: ErDiagramSchema, class: ClassDiagramSchema, flow: FlowDiagramSchema, links: LinksSchema })`, e il suo docblock diventa:

```ts
/**
 * Il contenuto di un documento: una parte per famiglia e la parte dei collegamenti fra famiglie,
 * sempre presenti (spec 2a §3, spec 4a §3). Una parte senza elementi è vuota, non un campo mancante.
 */
```
- in `createDocument`, `diagram` diventa `{ er: emptyErDiagram(), class: emptyClassDiagram(), flow: emptyFlowDiagram(), links: {} }`, e il docblock `/** Il solo modo di creare un documento: tre parti vuote. */` diventa `/** Il solo modo di creare un documento: tre famiglie e nessun collegamento. */`.

In `src/model/shared.ts`: `export const SCHEMA_VERSION = 4`.

In `src/model/migrations.ts`, prima della tabella `migrations`:

```ts
/** 3 → 4: il documento guadagna la parte dei collegamenti fra famiglie, vuota (spec 4a §3). */
const addLinks: Migration = (raw) => {
  const diagram = raw.diagram
  if (diagram === null || typeof diagram !== "object") return raw
  return { ...raw, diagram: { ...(diagram as Record<string, unknown>), links: {} } }
}
```

e la tabella diventa `new Map([[1, addClassNotes], [2, unifyDiagram], [3, addLinks]])`.

- [ ] **Step 6: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS. Se `tsc` segnala un letterale di documento senza `links` in un test, aggiungi `links: {}` a quel letterale.

- [ ] **Step 7: Commit**

```bash
git add src/model src/editor/families.ts src/editor/families.test.ts
git commit -m "$(cat <<'EOF'
feat(model): la parte links del documento e la versione 4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Validazione dei collegamenti

**Files:**
- Create: `src/model/sql-type.ts`
- Modify: `src/io/emit/sql-types.ts`
- Create: `src/model/links/types.ts`
- Create: `src/model/links/validate.ts`
- Modify: `src/model/issue.ts`
- Create: `src/model/links/types.test.ts`, `src/model/links/validate.test.ts`

**Interfaces:**
- Consumes: `Link`, `splitKey` (Task 1).
- Produces:
  - `baseType(type: string): string` da `@/model/sql-type` (e ancora da `@/io/emit/sql-types`, ri-esportata).
  - `type TypeCategory`, `classTypeCategory(type: string): TypeCategory | null`, `sqlTypeCategories(type: string): readonly TypeCategory[] | null`, `typesCompatible(classType: string, sqlType: string): boolean`, da `@/model/links/types`.
  - `validateLinks(doc: DevDocument): Issue[]` da `@/model/links/validate`. `edge` è l'id **senza** namespace; `node` è la chiave con prefisso della classe.
  - `IssueCode` con `"link-dangling" | "class-maps-multiple" | "link-attribute-missing" | "link-type-mismatch"`.

- [ ] **Step 1: Scrivi i test che falliscono**

`src/model/links/types.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { classTypeCategory, sqlTypeCategories, typesCompatible } from "./types"

describe("classTypeCategory", () => {
  it.each([
    ["int", "integer"], ["?int", "integer"], ["int|null", "integer"], ["null|int", "integer"], ["INT | NULL", "integer"],
    ["float", "decimal"], ["string", "string"], ["bool", "boolean"], ["Carbon", "datetime"],
    ["DateTimeImmutable", "datetime"], ["array", "json"], ["uuid", "uuid"],
  ])("%s → %s", (type, category) => {
    expect(classTypeCategory(type)).toBe(category)
  })

  it("un tipo personalizzato, o vuoto, non ha categoria", () => {
    expect(classTypeCategory("StatoOrdine")).toBeNull()
    expect(classTypeCategory("")).toBeNull()
  })
})

describe("sqlTypeCategories", () => {
  it("riduce il tipo alla forma base prima di cercarlo", () => {
    expect(sqlTypeCategories("bigint(20) unsigned")).toEqual(["integer"])
    expect(sqlTypeCategories("NUMERIC(10,2)")).toEqual(["decimal"])
    expect(sqlTypeCategories("timestamp with time zone")).toEqual(["datetime"])
  })

  it("tinyint ammette anche il booleano; json e uuid anche la stringa", () => {
    expect(sqlTypeCategories("tinyint(1)")).toEqual(["integer", "boolean"])
    expect(sqlTypeCategories("jsonb")).toEqual(["json", "string"])
    expect(sqlTypeCategories("uuid")).toEqual(["uuid", "string"])
  })

  it("un tipo sconosciuto non ha categorie", () => {
    expect(sqlTypeCategories("geometry")).toBeNull()
  })
})

describe("typesCompatible", () => {
  it("compatibili se la categoria della classe è fra quelle della colonna", () => {
    expect(typesCompatible("float", "double precision")).toBe(true)
    expect(typesCompatible("string", "uuid")).toBe(true)
    expect(typesCompatible("string", "numeric")).toBe(false)
  })

  it("un tipo non riconosciuto da una delle due parti non è un'incompatibilità", () => {
    expect(typesCompatible("StatoOrdine", "varchar")).toBe(true)
    expect(typesCompatible("string", "geometry")).toBe(true)
  })
})
```

`src/model/links/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { ClassAttribute } from "../class/schema"
import { createDocument, type DevDocument } from "../document"
import type { Attribute } from "../er/schema"
import { validateLinks } from "./validate"

const col = (name: string, type: string): Attribute => ({ name, type, primaryKey: false, foreignKey: false, nullable: false, unique: false })
const attr = (name: string, type: string, isStatic = false): ClassAttribute => ({ name, type, visibility: "public", isStatic })

/** Un'entità `ordini` e una classe `Ordine`, collegate da «mappa su» con id `l1`. */
function documento(columns: Attribute[], attributes: ClassAttribute[]): DevDocument {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: columns }
  doc.diagram.class.model.classes["Ordine"] = { name: "Ordine", stereotype: "class", attributes, methods: [] }
  doc.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
  return doc
}

describe("validateLinks", () => {
  it("un documento senza collegamenti non ha problemi", () => {
    expect(validateLinks(createDocument("x"))).toEqual([])
  })

  it("un attributo senza colonna è un avviso sul collegamento", () => {
    expect(validateLinks(documento([col("id", "bigint")], [attr("note", "string")]))).toEqual([
      { code: "link-attribute-missing", severity: "warning", message: "«Ordine.note» non ha una colonna in «ordini»", edge: "l1" },
    ])
  })

  it("created_at e createdAt sono lo stesso campo", () => {
    expect(validateLinks(documento([col("created_at", "timestamp")], [attr("createdAt", "Carbon")]))).toEqual([])
  })

  it("un attributo static non è una colonna", () => {
    expect(validateLinks(documento([], [attr("tabella", "string", true)]))).toEqual([])
  })

  it("tipi incompatibili sono un avviso con i due tipi", () => {
    expect(validateLinks(documento([col("totale", "numeric(10,2)")], [attr("totale", "string")]))).toEqual([
      {
        code: "link-type-mismatch",
        severity: "warning",
        message: "«Ordine.totale: string» non è compatibile con «ordini.totale numeric(10,2)»",
        edge: "l1",
      },
    ])
  })

  it("tinyint accetta un bool", () => {
    expect(validateLinks(documento([col("attivo", "tinyint(1)")], [attr("attivo", "bool")]))).toEqual([])
  })

  it("?int e int|null sono interi", () => {
    expect(validateLinks(documento([col("n", "int")], [attr("n", "?int")]))).toEqual([])
    expect(validateLinks(documento([col("n", "int")], [attr("n", "int|null")]))).toEqual([])
  })

  it("un tipo sconosciuto non avvisa", () => {
    expect(validateLinks(documento([col("stato", "enum('a','b')")], [attr("stato", "StatoOrdine")]))).toEqual([])
  })

  it("un tipo che si chiama constructor non avvisa", () => {
    // Review Focus 2: una tabella dei tipi su un oggetto letterale troverebbe `Object.prototype.constructor`.
    expect(validateLinks(documento([col("x", "varchar")], [attr("x", "constructor")]))).toEqual([])
    expect(validateLinks(documento([col("x", "toString")], [attr("x", "string")]))).toEqual([])
  })

  it("un collegamento pendente è un errore, senza avvisi sugli attributi", () => {
    const doc = documento([], [attr("note", "string")])
    delete doc.diagram.er.model.entities["ordini"]
    expect(validateLinks(doc)).toEqual([
      {
        code: "link-dangling",
        severity: "error",
        message: "Il collegamento «mappa su» fra «Ordine» e «ordini» punta a un elemento che non esiste più",
        edge: "l1",
      },
    ])
  })

  it("una classe con due «mappa su» è un errore sulla classe", () => {
    const doc = documento([], [])
    doc.diagram.er.model.entities["righe"] = { name: "righe", attributes: [] }
    doc.diagram.links["l2"] = { kind: "maps-to", source: "class/Ordine", target: "er/righe" }
    expect(validateLinks(doc)).toEqual([
      {
        code: "class-maps-multiple",
        severity: "error",
        message: "«Ordine» mappa su 2 tabelle: una classe si mappa su una tabella sola",
        node: "class/Ordine",
      },
    ])
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/model/links`
Expected: FAIL. `./types` e `./validate` non esistono.

- [ ] **Step 3: Sposta `baseType` nel modello**

Crea `src/model/sql-type.ts` con la funzione `baseType` **spostata così com'è** da `src/io/emit/sql-types.ts`, docblock compreso. Il primo paragrafo del docblock diventa:

```ts
/**
 * Nome base di un tipo SQL, **solo** per il confronto con insiemi di nomi: il tipo emesso resta
 * sempre la stringa del modello, intatta. Sta nel modello perché lo usano sia gli avvisi dell'export
 * (`io/emit/sql-types.ts`) sia la validazione dei collegamenti (`model/links/types.ts`).
 *
```

(il resto del docblock, sui tipi a più parole e sul letterale con la parentesi, resta uguale.)

In `src/io/emit/sql-types.ts`, togli la funzione e il suo docblock, e sotto la riga `import type { Dialect } from "@/io/ddl/schema"` aggiungi:

```ts
import { baseType } from "@/model/sql-type"

// Ri-esportata: i test degli avvisi dell'export la importano da qui, e restano com'erano.
export { baseType }
```

- [ ] **Step 4: La tabella dei tipi**

`src/model/links/types.ts`:

```ts
import { baseType } from "../sql-type"

/** La categoria in cui si riducono sia il tipo di un attributo sia quello di una colonna. */
export type TypeCategory = "integer" | "decimal" | "string" | "boolean" | "datetime" | "json" | "uuid"

// Mappe e non oggetti letterali: un tipo che si chiama `constructor` o `toString` troverebbe la
// proprietà di `Object.prototype` e passerebbe per un tipo noto.
/** Ogni nome della lista, con lo stesso valore: le voci di una mappa. */
const each = <V,>(names: readonly string[], value: V) => names.map((name) => [name, value] as const)

/** Lato classe, in minuscolo. */
const CLASS_TYPES: ReadonlyMap<string, TypeCategory> = new Map<string, TypeCategory>([
  ...each(["int", "integer"], "integer"),
  ...each(["float", "double", "decimal"], "decimal"),
  ...each(["string"], "string"),
  ...each(["bool", "boolean"], "boolean"),
  ...each(["datetime", "datetimeimmutable", "datetimeinterface", "carbon", "carbonimmutable", "date"], "datetime"),
  ...each(["array", "json"], "json"),
  ...each(["uuid"], "uuid"),
])

/** Lato SQL, per nome base (`baseType`). Un tipo ammette un **insieme** di categorie. */
const SQL_TYPES: ReadonlyMap<string, readonly TypeCategory[]> = new Map<string, readonly TypeCategory[]>([
  ...each(["int", "integer", "bigint", "smallint", "mediumint", "serial", "bigserial", "smallserial", "int2", "int4", "int8"], ["integer"]),
  // Il booleano di MySQL, con Laravel.
  ...each(["tinyint"], ["integer", "boolean"]),
  ...each(["decimal", "numeric", "real", "double precision", "double", "float", "float4", "float8"], ["decimal"]),
  ...each(["varchar", "character varying", "char", "character", "text", "mediumtext", "longtext", "tinytext", "citext"], ["string"]),
  ...each(["boolean", "bool"], ["boolean"]),
  ...each(["date", "datetime", "timestamp", "timestamptz", "timestamp with time zone", "timestamp without time zone", "time"], ["datetime"]),
  ...each(["json", "jsonb"], ["json", "string"]),
  ...each(["uuid"], ["uuid", "string"]),
])

/** La categoria del tipo di un attributo: si tolgono `?` in testa e `|null`/`null|`, maiuscole ignorate. */
export function classTypeCategory(type: string): TypeCategory | null {
  const bare = type
    .trim()
    .replace(/^\?/, "")
    .replace(/^null\s*\|\s*/i, "")
    .replace(/\s*\|\s*null$/i, "")
    .trim()
    .toLowerCase()
  return CLASS_TYPES.get(bare) ?? null
}

/** Le categorie che una colonna di questo tipo ammette. */
export function sqlTypeCategories(type: string): readonly TypeCategory[] | null {
  return SQL_TYPES.get(baseType(type)) ?? null
}

/**
 * `false` solo quando entrambi i tipi sono riconosciuti e la categoria dell'attributo non è fra quelle
 * della colonna. Un tipo personalizzato, o vuoto, non deve produrre falsi allarmi (spec 4a §5).
 */
export function typesCompatible(classType: string, sqlType: string): boolean {
  const cls = classTypeCategory(classType)
  const sql = sqlTypeCategories(sqlType)
  return cls === null || sql === null || sql.includes(cls)
}
```

- [ ] **Step 5: I codici e il validatore**

In `src/model/issue.ts`, dopo la riga del flowchart (`| "flow-unreachable" | "flow-branch-unlabeled" | "flow-no-terminal"`), aggiungi:

```ts
  // collegamenti fra famiglie
  | "link-dangling" | "class-maps-multiple" | "link-attribute-missing" | "link-type-mismatch"
```

`src/model/links/validate.ts`:

```ts
import type { DevDocument } from "../document"
import { splitKey } from "../family"
import type { Issue } from "../issue"
import { typesCompatible } from "./types"

/** Nome di attributo o di colonna nella forma di confronto: `createdAt`, `created_at` e `CreatedAt` coincidono. */
const normalize = (name: string): string => name.toLowerCase().replaceAll("_", "")

/**
 * I problemi dei collegamenti fra famiglie. Legge il documento intero: servono le due famiglie e i
 * collegamenti. Oggi il solo tipo è «mappa su» (classe → entità); il 4b aggiungerà i suoi.
 *
 * **Obiettivi dei problemi.** `edge` è l'id del collegamento **senza** il namespace `link/`, che
 * aggiunge `CanvasOps.validate`, come fa con il prefisso delle famiglie. `node` è la chiave con
 * prefisso della classe, perché è la forma in cui il collegamento la conserva.
 */
export function validateLinks(doc: DevDocument): Issue[] {
  const { links, class: classPart, er } = doc.diagram
  const issues: Issue[] = []
  const bySource = new Map<string, number>()
  for (const [id, link] of Object.entries(links)) {
    const s = splitKey(link.source)
    const t = splitKey(link.target)
    const cls = classPart.model.classes[s.key]
    const entity = er.model.entities[t.key]
    if (!cls || !entity) {
      // Manca uno dei due lati da confrontare: niente avvisi sugli attributi.
      issues.push({
        code: "link-dangling",
        severity: "error",
        message: `Il collegamento «mappa su» fra «${s.key}» e «${t.key}» punta a un elemento che non esiste più`,
        edge: id,
      })
      continue
    }
    bySource.set(link.source, (bySource.get(link.source) ?? 0) + 1)
    for (const attribute of cls.attributes) {
      if (attribute.isStatic) continue
      const column = entity.attributes.find((c) => normalize(c.name) === normalize(attribute.name))
      if (!column) {
        issues.push({
          code: "link-attribute-missing",
          severity: "warning",
          message: `«${s.key}.${attribute.name}» non ha una colonna in «${t.key}»`,
          edge: id,
        })
      } else if (!typesCompatible(attribute.type, column.type)) {
        issues.push({
          code: "link-type-mismatch",
          severity: "warning",
          message: `«${s.key}.${attribute.name}: ${attribute.type}» non è compatibile con «${t.key}.${column.name} ${column.type}»`,
          edge: id,
        })
      }
    }
  }
  for (const [source, count] of bySource) {
    if (count < 2) continue
    issues.push({
      code: "class-maps-multiple",
      severity: "error",
      message: `«${splitKey(source).key}» mappa su ${count} tabelle: una classe si mappa su una tabella sola`,
      node: source,
    })
  }
  return issues
}
```

- [ ] **Step 6: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS, compreso `src/io/emit/sql-types.test.ts` senza modifiche.

- [ ] **Step 7: Commit**

```bash
git add src/model src/io/emit/sql-types.ts
git commit -m "$(cat <<'EOF'
feat(model): validazione dei collegamenti «mappa su»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Comandi e geometria dei collegamenti

**Files:**
- Create: `src/editor/links/commands.ts`
- Create: `src/editor/links/geometry.ts`
- Modify: `src/editor/class/geometry.ts` (esporta `openArrowPath`)
- Create: `src/editor/links/commands.test.ts`, `src/editor/links/geometry.test.ts`

**Interfaces:**
- Consumes: `Link`, `linkRule` (Task 1), `linkKey` (Task 1), `familyOps` (`src/editor/kinds/ops.ts`), `classDiagram` (`src/editor/class-access.ts`).
- Produces:
  - `type ConnectResult = { type: "created"; key: string; recipe: Recipe } | { type: "existing"; key: string } | { type: "rejected"; notice: string }` (le `key` sono `link/<uuid>`).
  - `connectAcross(doc: DevDocument, from: string, to: string): ConnectResult` (chiavi con prefisso di due famiglie diverse).
  - `retargetLinks(oldKey: string, newKey: string): Recipe`.
  - `followRename(rename: Recipe, family: Family, oldKey: string, newKey: string): Recipe` (chiavi **senza** prefisso).
  - `deleteLinks(ids: readonly string[]): Recipe`.
  - `linksTouching(links: Readonly<Record<string, Link>>, keys: ReadonlySet<string>): [string, Link][]`.
  - `linkGeometry(source: Rect, target: Rect): EdgeGeometry`.

- [ ] **Step 1: Scrivi i test che falliscono**

`src/editor/links/commands.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import { renameEntity } from "../commands/er"
import { documentStore } from "../document-store"
import { connectAcross, deleteLinks, followRename, linksTouching, retargetLinks } from "./commands"

const state = () => documentStore.getState()
const links = () => state().doc.diagram.links

/** Un'entità `ordini`, una seconda entità `clienti`, e una classe, un'interfaccia, un enum e una nota. */
function documento(): DevDocument {
  const doc = createDocument("t", "t")
  // Un oggetto nuovo per nodo: una view condivisa fra due chiavi diventerebbe un alias nel documento.
  const at = () => ({ x: 0, y: 0, collapsed: false })
  for (const name of ["ordini", "clienti"]) {
    doc.diagram.er.model.entities[name] = { name, attributes: [] }
    doc.diagram.er.view.nodes[name] = at()
  }
  for (const [name, stereotype] of [["Ordine", "class"], ["Pagabile", "interface"], ["Stato", "enum"]] as const) {
    doc.diagram.class.model.classes[name] = { name, stereotype, attributes: [], methods: [] }
    doc.diagram.class.view.nodes[name] = at()
  }
  doc.diagram.class.model.notes["n1"] = { text: "" }
  doc.diagram.class.view.nodes["n1"] = at()
  return doc
}

beforeEach(() => state().load(documento()))

describe("connectAcross", () => {
  it("classe → entità crea «mappa su» da classe a entità", () => {
    const r = connectAcross(state().doc, "class/Ordine", "er/ordini")
    if (r.type !== "created") throw new Error(`atteso created, arrivato ${r.type}`)
    expect(r.key.startsWith("link/")).toBe(true)
    state().dispatch(r.recipe)
    expect(Object.values(links())).toEqual([{ kind: "maps-to", source: "class/Ordine", target: "er/ordini" }])
  })

  it("entità → classe dà lo stesso collegamento, nel verso del tipo", () => {
    const r = connectAcross(state().doc, "er/ordini", "class/Ordine")
    if (r.type !== "created") throw new Error(`atteso created, arrivato ${r.type}`)
    state().dispatch(r.recipe)
    expect(Object.values(links())).toEqual([{ kind: "maps-to", source: "class/Ordine", target: "er/ordini" }])
  })

  it("una coppia senza tipo è rifiutata, con le famiglie nell'ordine del gesto", () => {
    expect(connectAcross(state().doc, "flow/n1", "er/ordini")).toEqual({
      type: "rejected",
      notice: "Non esiste un collegamento fra un nodo di flusso e un'entità.",
    })
    expect(connectAcross(state().doc, "class/Ordine", "flow/n1")).toEqual({
      type: "rejected",
      notice: "Non esiste un collegamento fra una classe e un nodo di flusso.",
    })
  })

  it("un'interfaccia, un enum e una nota non si mappano su una tabella", () => {
    expect(connectAcross(state().doc, "class/Pagabile", "er/ordini")).toEqual({ type: "rejected", notice: "Un'interfaccia non si mappa su una tabella." })
    expect(connectAcross(state().doc, "er/ordini", "class/Stato")).toEqual({ type: "rejected", notice: "Un enum non si mappa su una tabella." })
    expect(connectAcross(state().doc, "class/n1", "er/ordini")).toEqual({ type: "rejected", notice: "Una nota non si mappa su una tabella." })
  })

  it("un secondo gesto fra gli stessi nodi seleziona quello che c'è", () => {
    const first = connectAcross(state().doc, "class/Ordine", "er/ordini")
    if (first.type !== "created") throw new Error("atteso created")
    state().dispatch(first.recipe)
    expect(connectAcross(state().doc, "er/ordini", "class/Ordine")).toEqual({ type: "existing", key: first.key })
  })

  it("verso un'altra entità nasce un secondo collegamento: il problema lo dice la validazione", () => {
    for (const target of ["er/ordini", "er/clienti"]) {
      const r = connectAcross(state().doc, "class/Ordine", target)
      if (r.type !== "created") throw new Error("atteso created")
      state().dispatch(r.recipe)
    }
    expect(Object.keys(links())).toHaveLength(2)
  })
})

/** Mette nel documento un collegamento `l1` da `class/Ordine` a `er/ordini`. */
function collega() {
  state().dispatch((draft) => {
    draft.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
  })
}

describe("retargetLinks e followRename", () => {
  it("retargetLinks sposta gli estremi che nominano la chiave vecchia", () => {
    collega()
    state().dispatch(retargetLinks("er/ordini", "er/righe"))
    expect(links()["l1"]!.target).toBe("er/righe")
  })

  it("la rinomina porta con sé il collegamento, in un solo passo di annulla", () => {
    collega()
    const past = state().past.length
    expect(state().dispatch(followRename(renameEntity("ordini", "righe")!, "er", "ordini", "righe"))).toBe(true)
    expect(links()["l1"]!.target).toBe("er/righe")
    expect(state().past.length).toBe(past + 1)
    state().undo()
    expect(links()["l1"]!.target).toBe("er/ordini")
  })

  it("una rinomina che collide non sposta niente", () => {
    // Review Focus 1: `renameEntity` su un nome già preso è una recipe che non scrive.
    collega()
    expect(state().dispatch(followRename(renameEntity("ordini", "clienti")!, "er", "ordini", "clienti"))).toBe(false)
    expect(links()["l1"]!.target).toBe("er/ordini")
  })
})

describe("deleteLinks e linksTouching", () => {
  it("deleteLinks toglie solo i collegamenti dati", () => {
    collega()
    state().dispatch(deleteLinks(["l1"]))
    expect(links()).toEqual({})
  })

  it("linksTouching dà i collegamenti con un estremo fra le chiavi", () => {
    collega()
    expect(linksTouching(links(), new Set(["er/ordini"]))).toEqual([["l1", links()["l1"]]])
    expect(linksTouching(links(), new Set(["er/clienti"]))).toEqual([])
  })
})
```

`src/editor/links/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { linkGeometry } from "./geometry"

describe("linkGeometry", () => {
  it("percorso ortogonale, freccia aperta sul target e nessun marker sul source", () => {
    const geo = linkGeometry({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 100, w: 100, h: 40 })
    // Da destra del source a sinistra del target, con due pieghe: quattro punti.
    expect(geo.d).toBe("M100 20 L200 20 L200 120 L300 120")
    expect(geo.sourceMarker).toBe("")
    expect(geo.targetMarker).not.toBe("")
    // Etichetta a metà del primo segmento, come nel flowchart.
    expect(geo.label).toEqual({ x: 150, y: 20 })
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/editor/links`
Expected: FAIL. `./commands` e `./geometry` non esistono.

- [ ] **Step 3: Esporta la freccia aperta**

In `src/editor/class/geometry.ts`, `function openArrowPath(at: Point, dir: Dir): string` diventa `export function openArrowPath(at: Point, dir: Dir): string`, e il suo docblock diventa `/** Freccia aperta: due segmenti che convergono su \`at\`. La usano la dipendenza, l'associazione navigabile e i collegamenti fra famiglie. */`.

- [ ] **Step 4: La geometria**

`src/editor/links/geometry.ts`:

```ts
import { openArrowPath } from "../class/geometry"
import { pathFromPoints, routeEdge, type EdgeGeometry } from "../edge-routing"
import type { Rect } from "../geometry"

/**
 * Lo stesso instradamento ortogonale degli archi, con scarto 0: fra gli stessi due nodi non esistono
 * due collegamenti (`connectAcross` seleziona quello che c'è), quindi non serve un fascio. Freccia
 * aperta verso il target, nessun marker sul source, etichetta a metà del primo segmento come nel
 * flowchart. Mai un cappio: i due estremi sono di famiglie diverse.
 */
export function linkGeometry(source: Rect, target: Rect): EdgeGeometry {
  const route = routeEdge(source, target, false)
  const pts = route.points
  const p0 = pts[0]!
  const p1 = pts[1]!
  return {
    d: pathFromPoints(pts),
    sourceMarker: "",
    targetMarker: openArrowPath(pts[pts.length - 1]!, route.targetDir),
    label: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
  }
}
```

- [ ] **Step 5: I comandi**

`src/editor/links/commands.ts`:

```ts
import type { Stereotype } from "@/model/class/schema"
import type { DevDocument } from "@/model/document"
import type { Family } from "@/model/family"
import { linkRule, type Link, type LinkKind } from "@/model/links/schema"
import { classDiagram } from "../class-access"
import type { Recipe } from "../document-store"
import { linkKey, qualify, splitKey } from "../families"
import { familyOps } from "../kinds/ops"

/** L'esito del gesto Collega fra due famiglie diverse (spec 4a §4). Le chiavi sono `link/<uuid>`. */
export type ConnectResult =
  | { type: "created"; key: string; recipe: Recipe }
  | { type: "existing"; key: string }
  | { type: "rejected"; notice: string }

/** Come si nomina un nodo di ogni famiglia nell'avviso di rifiuto. */
const FAMILY_NOUN: Record<Family, string> = { er: "un'entità", class: "una classe", flow: "un nodo di flusso" }

/** Gli stereotipi che non si persistono in una tabella. `class` e `abstract` possono avere «mappa su». */
const UNMAPPABLE: Partial<Record<Stereotype, string>> = {
  interface: "Un'interfaccia non si mappa su una tabella.",
  enum: "Un enum non si mappa su una tabella.",
}

/** Il motivo per cui un estremo non ammette il tipo, o `null` se lo ammette. `source` è già nel verso del tipo. */
function refusal(doc: DevDocument, kind: LinkKind, source: string): string | null {
  switch (kind) {
    case "maps-to": {
      const key = splitKey(source).key
      const cls = classDiagram(doc).model.classes[key]
      // Nella famiglia `class` un nodo che non è una classe è una nota.
      if (!cls) return "Una nota non si mappa su una tabella."
      return UNMAPPABLE[cls.stereotype] ?? null
    }
  }
}

/**
 * Collega due nodi di famiglie diverse. La direzione si normalizza sul verso del tipo, qualunque sia
 * il verso del trascinamento. Un collegamento già presente fra gli stessi due nodi non si duplica: si
 * seleziona. Una classe con «mappa su» verso due entità diverse invece si può creare, e la segnala la
 * validazione (`class-maps-multiple`): un errore visibile è più chiaro di un gesto rifiutato.
 */
export function connectAcross(doc: DevDocument, from: string, to: string): ConnectResult {
  const a = splitKey(from).family
  const b = splitKey(to).family
  const rule = linkRule(a, b)
  if (!rule) return { type: "rejected", notice: `Non esiste un collegamento fra ${FAMILY_NOUN[a]} e ${FAMILY_NOUN[b]}.` }
  const [source, target] = rule.reversed ? [to, from] : [from, to]
  const refused = refusal(doc, rule.kind, source)
  if (refused) return { type: "rejected", notice: refused }
  const existing = Object.entries(doc.diagram.links).find(
    ([, l]) => l.kind === rule.kind && l.source === source && l.target === target,
  )
  if (existing) return { type: "existing", key: linkKey(existing[0]) }
  const id = crypto.randomUUID()
  return {
    type: "created",
    key: linkKey(id),
    recipe: (draft) => {
      draft.diagram.links[id] = { kind: rule.kind, source, target }
    },
  }
}

/** Gli estremi che nominano `oldKey` passano a `newKey`. Chiavi con prefisso. */
export function retargetLinks(oldKey: string, newKey: string): Recipe {
  return (draft) => {
    for (const link of Object.values(draft.diagram.links)) {
      if (link.source === oldKey) link.source = newKey
      if (link.target === oldKey) link.target = newKey
    }
  }
}

/**
 * La rinomina `rename` e i collegamenti che la seguono, in una recipe sola: un passo di annulla, e
 * nessuno stato intermedio. Chiavi **senza** prefisso, quelle dei comandi di famiglia.
 *
 * I collegamenti si spostano solo se la rinomina ha davvero tolto il nodo `oldKey`. `renameEntity`
 * e `renameClass` rispondono a una collisione con una recipe che non scrive niente: senza la guardia,
 * una collisione sposterebbe i collegamenti sul nodo che esiste già.
 */
export function followRename(rename: Recipe, family: Family, oldKey: string, newKey: string): Recipe {
  const has = (doc: DevDocument, key: string) => familyOps(doc, family).nodeKeys().includes(key)
  return (draft) => {
    const had = has(draft, oldKey)
    rename(draft)
    if (had && !has(draft, oldKey)) retargetLinks(qualify(family, oldKey), qualify(family, newKey))(draft)
  }
}

/** Elimina i collegamenti dati; un id che non c'è non scrive niente. */
export function deleteLinks(ids: readonly string[]): Recipe {
  return (draft) => {
    for (const id of ids) delete draft.diagram.links[id]
  }
}

/** I collegamenti con almeno un estremo fra `keys` (chiavi con prefisso), con il loro id. */
export function linksTouching(links: Readonly<Record<string, Link>>, keys: ReadonlySet<string>): [string, Link][] {
  return Object.entries(links).filter(([, l]) => keys.has(l.source) || keys.has(l.target))
}
```

- [ ] **Step 6: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/editor/links src/editor/class/geometry.ts
git commit -m "$(cat <<'EOF'
feat(editor): comandi e geometria dei collegamenti fra famiglie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `CanvasOps` con i collegamenti

**Files:**
- Modify: `src/editor/kinds/canvas-ops.ts`
- Modify: `src/editor/kinds/canvas-ops.test.ts`

**Interfaces:**
- Consumes: `connectAcross`, `ConnectResult`, `deleteLinks`, `linksTouching` (Task 3), `linkGeometry` (Task 3), `validateLinks` (Task 2), `linkId`, `linkKey` (Task 1).
- Produces:
  - `CanvasOps.addEdge(source, target): ConnectResult | null`. Dentro una famiglia: `{ type: "created", key, recipe }` oppure `null`. Fra famiglie: il risultato di `connectAcross`.
  - `CanvasOps.edgesTouching` include i collegamenti (`key: link/<uuid>`); `edgeGeometry` accetta chiavi `link/…`; `deleteItems` accetta chiavi `link/…` fra gli archi ed elimina i collegamenti dei nodi eliminati; `validate` aggiunge i problemi dei collegamenti con `edge: link/<uuid>`.
  - `export type { ConnectResult }` da `canvas-ops.ts`.

- [ ] **Step 1: Aggiorna i test esistenti e scrivi quelli nuovi**

In `src/editor/kinds/canvas-ops.test.ts`:

Il test `"addEdge fra due nodi della stessa famiglia collega, fra famiglie diverse no"` diventa:

```ts
  it("addEdge fra due nodi della stessa famiglia collega, fra due famiglie senza tipo rifiuta", () => {
    const { a, b } = erConDueEntita()
    const ops = canvasOps(state().doc)
    const r = ops.addEdge(`er/${a}`, `er/${b}`)
    expect(r?.type === "created" && r.key.startsWith("er/")).toBe(true)
    // Basta la chiave per il rifiuto, che avviene prima di interrogare la famiglia: il caso con un
    // nodo di flusso vero è in «famiglie mescolate», sotto.
    expect(ops.addEdge(`er/${a}`, "flow/n1")).toEqual({
      type: "rejected",
      notice: "Non esiste un collegamento fra un'entità e un nodo di flusso.",
    })
  })
```

Il test `"Collega fra un'entità e un nodo di flusso non crea niente"` diventa:

```ts
  it("Collega fra un'entità e un nodo di flusso non crea niente, e dice perché", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    expect(canvasOps(state().doc).addEdge(entity.key, node.key)?.type).toBe("rejected")
  })
```

Aggiungi in fondo al file:

```ts
describe("canvasOps (collegamenti)", () => {
  /** Un'entità e una classe create coi comandi veri, e il collegamento fra le due. */
  function collegati() {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const cls = canvasOps(state().doc).addNode({ x: 400, y: 0 }, "class", "class")
    state().dispatch(cls.recipe)
    const link = canvasOps(state().doc).addEdge(cls.key, entity.key)
    if (link?.type !== "created") throw new Error("atteso created")
    state().dispatch(link.recipe)
    return { entity: entity.key, cls: cls.key, link: link.key }
  }

  it("addEdge fra classe ed entità crea il collegamento, in qualunque verso", () => {
    const { entity, cls, link } = collegati()
    expect(link.startsWith("link/")).toBe(true)
    expect(canvasOps(state().doc).addEdge(entity, cls)).toEqual({ type: "existing", key: link })
  })

  it("edgesTouching include i collegamenti, con chiave link/", () => {
    const { entity, cls, link } = collegati()
    expect(canvasOps(state().doc).edgesTouching(new Set([entity]))).toEqual([{ key: link, source: cls, target: entity }])
  })

  it("edgeGeometry disegna un collegamento, e un id che non c'è dà null", () => {
    const { entity, cls, link } = collegati()
    const ops = canvasOps(state().doc)
    expect(ops.edgeGeometry(link, ops.rectOf(cls)!, ops.rectOf(entity)!)).not.toBeNull()
    expect(ops.edgeGeometry("link/fantasma", ops.rectOf(cls)!, ops.rectOf(entity)!)).toBeNull()
  })

  it("deleteItems di un collegamento elimina solo lui", () => {
    const { entity, cls, link } = collegati()
    state().dispatch(canvasOps(state().doc).deleteItems([], [link])!)
    expect(state().doc.diagram.links).toEqual({})
    expect(canvasOps(state().doc).nodeKeys().sort()).toEqual([cls, entity].sort())
  })

  it("deleteItems di un'entità elimina anche il collegamento, in un solo passo di annulla", () => {
    // Review Focus 5.
    const { entity, link } = collegati()
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).deleteItems([entity], [])!)
    expect(state().doc.diagram.links).toEqual({})
    expect(state().past.length).toBe(past + 1)
    state().undo()
    expect(canvasOps(state().doc).nodeKeys()).toContain(entity)
    expect(Object.keys(state().doc.diagram.links).map((id) => `link/${id}`)).toEqual([link])
  })

  it("validate aggiunge i problemi dei collegamenti, con obiettivo link/", () => {
    const { link } = collegati()
    // Un attributo della classe senza colonna nell'entità: un avviso certo.
    state().dispatch((draft) => {
      const cls = Object.values(draft.diagram.class.model.classes)[0]!
      cls.attributes.push({ name: "note", type: "string", visibility: "public", isStatic: false })
    })
    const issues = canvasOps(state().doc).validate()
    expect(issues.some((i) => i.code === "link-attribute-missing" && i.edge === link)).toBe(true)
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/editor/kinds/canvas-ops.test.ts`
Expected: FAIL. `addEdge` restituisce ancora `null` o `{ key, recipe }` senza `type`.

- [ ] **Step 3: Implementa**

In `src/editor/kinds/canvas-ops.ts`:

Import (sostituisci quelli di `families` ed `edge-routing` e aggiungi i nuovi):

```ts
import type { DevDocument } from "@/model/document"
import { FAMILIES, type Family } from "@/model/family"
import type { Issue } from "@/model/issue"
import { validateLinks } from "@/model/links/validate"
import { moveNodes } from "../commands/view"
import type { Recipe } from "../document-store"
import type { EdgeGeometry } from "../edge-routing"
import { linkId, linkKey, qualify, splitKey } from "../families"
import type { Point, Rect } from "../geometry"
import { connectAcross, deleteLinks, linksTouching, type ConnectResult } from "../links/commands"
import { linkGeometry } from "../links/geometry"
import { familyOps, type EdgeEnds, type EditTarget } from "./ops"

export type { ConnectResult }
```

Docblock dell'interfaccia: sostituisci la prima frase con `Il solo contratto con cui canvas e azioni condivise parlano: gli stessi metodi di \`DiagramOps\`, ma su **chiavi con prefisso**, su tutte le famiglie del documento e sui collegamenti fra famiglie (chiavi \`link/…\`, spec 4a §4).` e aggiungi alla fine del docblock: `Le chiavi \`link/…\` si riconoscono con \`linkId\` **prima** di \`splitKey\`, che le rifiuta.`

Nell'interfaccia, la firma di `addEdge` e il suo commento diventano:

```ts
  /**
   * Dentro una famiglia: l'arco della famiglia, oppure `null` se i due nodi non si possono collegare
   * (due note). Fra famiglie diverse: un collegamento tipizzato creato, uno già presente da
   * selezionare, oppure un rifiuto con il suo avviso (`connectAcross`).
   */
  addEdge(source: string, target: string): ConnectResult | null
```

e il commento di `validate` diventa `/** Solo le famiglie con contenuto: una famiglia vuota non ha problemi da segnalare. Poi i collegamenti. */`.

Nell'implementazione:

```ts
    edgesTouching: (keys) => [
      ...[...byFamily(keys)].flatMap(([f, ks]) =>
        ops(f)
          .edgesTouching(new Set(ks))
          .map((e) => ({ key: qualify(f, e.key), source: qualify(f, e.source), target: qualify(f, e.target) })),
      ),
      ...linksTouching(doc.diagram.links, keys).map(([id, l]) => ({ key: linkKey(id), source: l.source, target: l.target })),
    ],

    edgeGeometry: (qualified, a, b) => {
      const id = linkId(qualified)
      if (id !== null) return doc.diagram.links[id] ? linkGeometry(a, b) : null
      const { family, key } = splitKey(qualified)
      return ops(family).edgeGeometry(key, a, b)
    },
```

```ts
    addEdge: (source, target) => {
      const a = splitKey(source)
      const b = splitKey(target)
      if (a.family !== b.family) return connectAcross(doc, source, target)
      const created = ops(a.family).addEdge(a.key, b.key)
      return created ? { type: "created" as const, key: qualify(a.family, created.key), recipe: created.recipe } : null
    },
```

```ts
    deleteItems: (nodeKeys, edgeKeys) => {
      // I collegamenti selezionati, e quelli che toccano un nodo eliminato: nella stessa recipe delle
      // famiglie, così un solo annulla riporta indietro tutto (spec 4a §4, «Coerenza»).
      const selectedLinks = edgeKeys.flatMap((k) => linkId(k) ?? [])
      const cascade = linksTouching(doc.diagram.links, new Set(nodeKeys)).map(([id]) => id)
      const linkIds = [...new Set([...selectedLinks, ...cascade])]
      const nodes = byFamily(nodeKeys)
      const edges = byFamily(edgeKeys.filter((k) => linkId(k) === null))
      const touched = new Set([...nodes.keys(), ...edges.keys()])
      return combine([
        ...[...touched].map((f) => ops(f).deleteItems(nodes.get(f) ?? [], edges.get(f) ?? [])),
        linkIds.length > 0 ? deleteLinks(linkIds) : null,
      ])
    },
```

```ts
    validate: () => [
      ...FAMILIES.filter((f) => familyHasContent(doc, f)).flatMap((f) =>
        ops(f)
          .validate()
          .map((issue) => ({
            ...issue,
            ...(issue.node !== undefined && { node: qualify(f, issue.node) }),
            ...(issue.edge !== undefined && { edge: qualify(f, issue.edge) }),
          })),
      ),
      // `validateLinks` dà l'id senza namespace, e la chiave della classe già con prefisso.
      ...validateLinks(doc).map((issue) => ({ ...issue, ...(issue.edge !== undefined && { edge: linkKey(issue.edge) }) })),
    ],
```

- [ ] **Step 4: Aggiorna il chiamante nel runner, quanto basta per compilare**

In `src/ui/canvas/interaction-runner.ts`, nel `case "commit-connect"`, sostituisci il corpo con quello che segue. L'avviso di rifiuto arriva al Task 6: qui il rifiuto resta silenzioso, come prima.

```ts
      case "commit-connect": {
        const result = canvasOps(documentStore.getState().doc).addEdge(fx.source, fx.target)
        if (!result || result.type === "rejected") break
        if (result.type === "created") documentStore.getState().dispatch(result.recipe)
        session().setSelection([selId("edge", result.key)])
        session().setTool("select")
        break
      }
```

- [ ] **Step 5: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/editor/kinds/canvas-ops.ts src/editor/kinds/canvas-ops.test.ts src/ui/canvas/interaction-runner.ts
git commit -m "$(cat <<'EOF'
feat(canvas): CanvasOps instrada i collegamenti fra famiglie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: La rinomina porta con sé i collegamenti

**Files:**
- Modify: `src/ui/entity-rename.ts`
- Modify: `src/ui/class-rename.ts`
- Modify: `src/ui/entity-rename.test.ts`
- Create: `src/ui/class-rename.test.ts`

**Interfaces:**
- Consumes: `followRename(rename, family, oldKey, newKey)` (Task 3).
- Produces: nessuna firma nuova. `renameEntityWithNotice` e `renameClassWithNotice` spostano i collegamenti nella stessa recipe della rinomina.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/ui/entity-rename.test.ts`, aggiungi dentro `describe("renameEntityWithNotice")`:

```ts
  it("il collegamento segue l'entità rinominata, in un solo passo di annulla", () => {
    const { key, recipe } = addEntity({}, { x: 0, y: 0 })
    documentStore.getState().dispatch(recipe)
    documentStore.getState().dispatch((draft) => {
      draft.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: qualify("er", key) }
    })
    const past = documentStore.getState().past.length
    expect(renameEntityWithNotice(key, "ordini")).toBe(true)
    expect(documentStore.getState().doc.diagram.links["l1"]!.target).toBe("er/ordini")
    expect(documentStore.getState().past.length).toBe(past + 1)
    documentStore.getState().undo()
    expect(documentStore.getState().doc.diagram.links["l1"]!.target).toBe(qualify("er", key))
  })

  it("una rinomina che collide non sposta il collegamento", () => {
    // Review Focus 1.
    const a = addEntity({}, { x: 0, y: 0 })
    documentStore.getState().dispatch(a.recipe)
    documentStore.getState().dispatch((draft) => {
      draft.diagram.er.model.entities["clienti"] = { name: "clienti", attributes: [] }
      draft.diagram.er.view.nodes["clienti"] = { x: 300, y: 0, collapsed: false }
      draft.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: qualify("er", a.key) }
    })
    expect(renameEntityWithNotice(a.key, "clienti")).toBe(false)
    expect(documentStore.getState().doc.diagram.links["l1"]!.target).toBe(qualify("er", a.key))
  })
```

`src/ui/class-rename.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { addClass } from "@/editor/class/commands"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { renameClassWithNotice } from "./class-rename"

beforeEach(() => documentStore.getState().load(createDocument("t", "t")))

describe("renameClassWithNotice", () => {
  it("il collegamento segue la classe rinominata, e l'annulla lo riporta indietro", () => {
    const { key, recipe } = addClass({}, { x: 0, y: 0 })
    documentStore.getState().dispatch(recipe)
    documentStore.getState().dispatch((draft) => {
      draft.diagram.links["l1"] = { kind: "maps-to", source: qualify("class", key), target: "er/ordini" }
    })
    expect(renameClassWithNotice(key, "Ordine")).toBe(true)
    expect(documentStore.getState().doc.diagram.links["l1"]!.source).toBe("class/Ordine")
    documentStore.getState().undo()
    expect(documentStore.getState().doc.diagram.links["l1"]!.source).toBe(qualify("class", key))
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/ui/entity-rename.test.ts src/ui/class-rename.test.ts`
Expected: FAIL. Il collegamento resta sulla chiave vecchia.

- [ ] **Step 3: Implementa**

In `src/ui/entity-rename.ts`, aggiungi `import { followRename } from "@/editor/links/commands"` e sostituisci `if (documentStore.getState().dispatch(recipe)) {` con:

```ts
  // I collegamenti seguono la chiave nuova nella stessa recipe: un passo di annulla (spec 4a §4).
  if (documentStore.getState().dispatch(followRename(recipe, "er", key, newKey))) {
```

In `src/ui/class-rename.ts`, aggiungi lo stesso import e sostituisci `if (documentStore.getState().dispatch(recipe)) {` con:

```ts
  // I collegamenti seguono la chiave nuova nella stessa recipe: un passo di annulla (spec 4a §4).
  if (documentStore.getState().dispatch(followRename(recipe, "class", key, newName))) {
```

- [ ] **Step 4: Lancia tutti i test e i controlli**

Run: `pnpm tsc -b && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/entity-rename.ts src/ui/class-rename.ts src/ui/entity-rename.test.ts src/ui/class-rename.test.ts
git commit -m "$(cat <<'EOF'
feat(canvas): la rinomina di entità e classi porta con sé i collegamenti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Collega sul canvas — avviso di rifiuto e doppio clic

**Files:**
- Modify: `src/ui/canvas/interaction-runner.ts`
- Modify: `src/ui/canvas/use-canvas-interaction.ts`
- Modify: `src/ui/canvas/interaction-runner.test.ts`
- Modify: `src/ui/canvas/use-canvas-interaction.test.tsx`
- Modify: `scripts/e2e/misto.mjs`

**Interfaces:**
- Consumes: `CanvasOps.addEdge(): ConnectResult | null` (Task 4), `linkId` (Task 1), `documentSession` (`src/io/document-session.ts`, campo `notice`).
- Produces: nessuna firma nuova.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/ui/canvas/interaction-runner.test.ts`, aggiungi `import { documentSession } from "@/io/document-session"` e, in fondo al file:

```ts
describe("Collega fra famiglie", () => {
  /** Un'entità `ordini` e un'interfaccia `Pagabile`, lontane fra loro. */
  function documentoMisto(): DevDocument {
    const doc = createDocument("m", "m")
    doc.diagram.er.model.entities["ordini"] = entita("ordini")
    doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
    for (const [name, stereotype] of [["Ordine", "class"], ["Pagabile", "interface"]] as const) {
      doc.diagram.class.model.classes[name] = { name, stereotype, attributes: [], methods: [] }
      doc.diagram.class.view.nodes[name] = { x: 400, y: name === "Ordine" ? 0 : 300, collapsed: false }
    }
    return doc
  }

  /** Il gesto Collega da `source` a `target`, con lo strumento attivo. */
  function collega(source: string, target: string) {
    sessionStore.getState().setTool("edge")
    const runner = createInteractionRunner()
    runner.step(giu({ hit: { kind: "node", key: source } }))
    runner.step(muovi({ world: { x: 10, y: 10 } }))
    runner.step(su({ hit: { kind: "node", key: target } }))
  }

  beforeEach(() => {
    documentStore.getState().load(documentoMisto())
    documentSession.getState().patch({ notice: null })
  })

  afterEach(() => {
    sessionStore.getState().setTool("select")
    documentSession.getState().patch({ notice: null })
  })

  it("un rifiuto mostra l'avviso, non crea niente e lascia lo strumento attivo", () => {
    collega(qualify("class", "Pagabile"), qualify("er", "ordini"))
    expect(documentSession.getState().notice).toBe("Un'interfaccia non si mappa su una tabella.")
    expect(documentStore.getState().doc.diagram.links).toEqual({})
    expect(sessionStore.getState().tool).toBe("edge")
  })

  it("un collegamento nuovo si crea e si seleziona", () => {
    collega(qualify("class", "Ordine"), qualify("er", "ordini"))
    const [id] = Object.keys(documentStore.getState().doc.diagram.links)
    expect([...sessionStore.getState().selection]).toEqual([selId("edge", `link/${id}`)])
    expect(sessionStore.getState().tool).toBe("select")
  })

  it("un collegamento già presente si seleziona, senza un passo di annulla in più", () => {
    collega(qualify("class", "Ordine"), qualify("er", "ordini"))
    const past = documentStore.getState().past.length
    sessionStore.getState().setSelection([])
    collega(qualify("er", "ordini"), qualify("class", "Ordine"))
    const [id] = Object.keys(documentStore.getState().doc.diagram.links)
    expect(documentStore.getState().past.length).toBe(past)
    expect([...sessionStore.getState().selection]).toEqual([selId("edge", `link/${id}`)])
  })
})
```

Nota per chi implementa: il `beforeEach` di file registra nodi finti ER e una selezione; il `beforeEach` di questo `describe` gira dopo e ricarica il documento, quindi le chiavi registrate sopra non esistono più nel documento e l'anteprima del gesto non scrive niente. Se `muovi` con lo strumento `edge` richiede un `hit` diverso, leggi `onMove` in `src/editor/interaction.ts` (modo `connect`) e adegua solo i dati dell'evento, non il codice.

In `src/ui/canvas/use-canvas-interaction.test.tsx`, dentro `describe("il resto del cablaggio")`:

```ts
  it("il doppio click su un collegamento non apre niente e non lancia", () => {
    // Review Focus 3: `splitKey` su `link/…` lancerebbe dentro il listener.
    const errori: unknown[] = []
    const onError = (e: ErrorEvent) => {
      errori.push(e.error)
      e.preventDefault()
    }
    window.addEventListener("error", onError)
    const arco = document.createElementNS("http://www.w3.org/2000/svg", "g")
    arco.setAttribute("data-edge-id", "link/l1")
    svg.append(arco)
    sotto = arco
    svg.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }))
    window.removeEventListener("error", onError)
    expect(errori).toEqual([])
    expect(sessionStore.getState().editing).toBeNull()
  })
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/ui/canvas/interaction-runner.test.ts src/ui/canvas/use-canvas-interaction.test.tsx`
Expected: FAIL. Nessun avviso sul rifiuto, e il doppio clic lancia `chiave senza famiglia: link/l1`.

- [ ] **Step 3: Implementa**

In `src/ui/canvas/interaction-runner.ts`, aggiungi `import { documentSession } from "@/io/document-session"` e sostituisci il `case "commit-connect"` con:

```ts
      case "commit-connect": {
        // `null`: dentro una famiglia i due nodi non si collegano (nota → nota), e non c'è niente da
        // dire. Un rifiuto fra famiglie invece si spiega nella barra degli avvisi, e lo strumento resta
        // attivo per riprovare (spec 4a §4). Un collegamento già presente si seleziona soltanto.
        const result = canvasOps(documentStore.getState().doc).addEdge(fx.source, fx.target)
        if (!result) break
        if (result.type === "rejected") {
          documentSession.getState().patch({ notice: result.notice })
          break
        }
        if (result.type === "created") documentStore.getState().dispatch(result.recipe)
        session().setSelection([selId("edge", result.key)])
        session().setTool("select")
        break
      }
```

In `src/ui/canvas/use-canvas-interaction.ts`, aggiungi `linkId` all'import da `@/editor/families` (`import { linkId, splitKey } from "@/editor/families"`) e, in `onDblClick`, subito dopo `if (hit.kind === "canvas") return`:

```ts
      // Un collegamento fra famiglie non ha niente da modificare sul canvas (spec 4a §7), e la sua
      // chiave non ha una famiglia: `splitKey` la rifiuterebbe.
      if (linkId(hit.key) !== null) return
```

- [ ] **Step 4: Aggiorna l'e2e del canvas misto**

In `scripts/e2e/misto.mjs`, prima di tutto aggiungi `expectText` all'import da `./helpers.mjs`. Poi:
- nel docblock in testa, `che Collega fra famiglie diverse non faccia niente mentre dentro una famiglia collega` diventa `che Collega fra un'entità e un nodo di flusso non crei niente e lo dica, mentre dentro una famiglia collega`;
- il passo `"Collega fra un'entità e una classe non crea niente"` diventa:

```js
    await step("Collega fra un'entità e un nodo di flusso non crea niente, e lo dice", async () => {
      await page.keyboard.press("r")
      await drag(page, await centerOf(page, "er/"), await centerOf(page, "flow/"))
      await expectText(page, "[data-notice-bar]", "Non esiste un collegamento fra un'entità e un nodo di flusso.")
      if ((await page.locator("[data-edge-id]").count()) !== 0) throw new Error("è nato un arco fra due famiglie senza tipo")
      await page.keyboard.press("Escape")
    })
```

- [ ] **Step 5: Lancia tutti i test, i controlli e l'e2e**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/canvas scripts/e2e/misto.mjs
git commit -m "$(cat <<'EOF'
feat(canvas): Collega fra famiglie avvisa quando rifiuta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Disegno dei collegamenti, sul canvas e nell'export SVG

**Files:**
- Create: `src/ui/canvas/LinkEdge.tsx`
- Modify: `src/ui/canvas/Canvas.tsx`
- Modify: `src/ui/export/svg.tsx`
- Modify: `src/ui/canvas/render.test.tsx`
- Modify: `src/ui/export/svg.test.ts`

**Interfaces:**
- Consumes: `linkGeometry` (Task 3), `linkKey` (Task 1), `canvasOps(doc).rectOf` (chiavi con prefisso), `registerEdge` (`dom-registry.ts`), `Link`, `LinkKind` (Task 1).
- Produces:
  - `LINK_LABEL: Record<LinkKind, string>` (`{ "maps-to": "mappa su" }`).
  - `LinkEdgeView({ id, link, source, target, selected })`: vista pura.
  - `LinksLayer()`: layer sottoscritto, montato dal canvas.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/ui/canvas/render.test.tsx`, aggiungi `import { LinkEdgeView } from "./LinkEdge"` e in fondo:

```ts
describe("LinkEdgeView", () => {
  it("tratteggiato, con la chiave link/, l'etichetta e gli attributi dell'anteprima del drag", () => {
    const html = renderToStaticMarkup(
      <LinkEdgeView
        id="l1"
        link={{ kind: "maps-to", source: "class/Ordine", target: "er/ordini" }}
        source={{ x: 0, y: 0, w: 100, h: 40 }}
        target={{ x: 300, y: 0, w: 100, h: 40 }}
        selected={false}
      />,
    )
    expect(html).toContain('data-edge-id="link/l1"')
    expect(html).toContain("data-edge-hit")
    expect(html).toContain("data-edge-line")
    expect(html).toContain("data-edge-target")
    expect(html).toContain("data-edge-label")
    expect(html).toContain('stroke-dasharray="6 4"')
    expect(html).toContain(">mappa su<")
  })
})
```

In `src/ui/export/svg.test.ts`, in fondo:

```ts
describe("collegamenti nell'export", () => {
  /** Il diagramma ER di prova, una classe `Ordine` e un collegamento verso `ordini`. */
  function conCollegamento(target = "er/ordini"): DevDocument {
    const doc = docOf("er", diagram())
    return {
      ...doc,
      diagram: {
        ...doc.diagram,
        class: {
          model: { classes: { Ordine: { name: "Ordine", stereotype: "class", attributes: [], methods: [] } }, relations: {}, notes: {} },
          view: { nodes: { Ordine: { x: 900, y: 200, collapsed: false } } },
        },
        links: { l1: { kind: "maps-to", source: "class/Ordine", target } },
      },
    }
  }

  it("i collegamenti stanno fra gli archi di famiglia e i nodi", () => {
    const svg = buildSvg(conCollegamento(), { vars })!
    const edges = svg.indexOf('data-layer="edges"')
    const links = svg.indexOf('data-layer="links"')
    const nodes = svg.indexOf('data-layer="nodes"')
    expect(edges).toBeGreaterThan(-1)
    expect(links).toBeGreaterThan(edges)
    expect(nodes).toBeGreaterThan(links)
    expect(svg).toContain('data-edge-id="link/l1"')
  })

  it("un collegamento pendente non si disegna", () => {
    expect(buildSvg(conCollegamento("er/fantasma"), { vars })!).not.toContain('data-edge-id="link/l1"')
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `pnpm vitest run src/ui/canvas/render.test.tsx src/ui/export/svg.test.ts`
Expected: FAIL. `./LinkEdge` non esiste.

- [ ] **Step 3: La vista e il layer**

`src/ui/canvas/LinkEdge.tsx`:

```tsx
import { memo } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { documentStore } from "@/editor/document-store"
import { linkKey } from "@/editor/families"
import type { Rect } from "@/editor/geometry"
import { canvasOps } from "@/editor/kinds/canvas-ops"
import { linkGeometry } from "@/editor/links/geometry"
import { selId, sessionStore } from "@/editor/session-store"
import type { Link, LinkKind } from "@/model/links/schema"
import { registerEdge } from "./dom-registry"

/** L'etichetta di ogni tipo, sul canvas e (con l'iniziale maiuscola) nel pannello. */
export const LINK_LABEL: Record<LinkKind, string> = { "maps-to": "mappa su" }

interface Props {
  id: string
  link: Link
  source: Rect
  target: Rect
  selected: boolean
}

/**
 * Vista pura di un collegamento fra famiglie, sulla forma di `FlowEdgeView`: tratteggiata, freccia
 * aperta verso il target, etichetta sul primo segmento. Gli attributi `data-edge-*` sono quelli
 * degli archi, quindi l'anteprima del drag la aggiorna senza codice nuovo (spec 4a §6).
 */
export const LinkEdgeView = memo(function LinkEdgeView({ id, link, source, target, selected }: Props) {
  const key = linkKey(id)
  const geo = linkGeometry(source, target)
  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  return (
    <g
      data-edge-id={key}
      ref={(el) => {
        registerEdge(key, el)
        return () => registerEdge(key, null)
      }}
    >
      <path data-edge-hit d={geo.d} fill="none" stroke="transparent" strokeWidth={12} />
      <path data-edge-line d={geo.d} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.5} strokeDasharray="6 4" />
      <path data-edge-target d={geo.targetMarker} fill="none" stroke={stroke} strokeWidth={1.5} />
      <text data-edge-label x={geo.label.x} y={geo.label.y - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
        {LINK_LABEL[link.kind]}
      </text>
    </g>
  )
})

/** Il rettangolo di un estremo, di qualunque famiglia: `useShallow` per la stessa ragione di `ClassEdge`. */
function useNodeRect(key: string | undefined): Rect | null {
  return useStore(documentStore, useShallow((s) => (key ? canvasOps(s.doc).rectOf(key) : null)))
}

function LinkEdge({ id }: { id: string }) {
  const link = useStore(documentStore, (s) => s.doc.diagram.links[id])
  const source = useNodeRect(link?.source)
  const target = useNodeRect(link?.target)
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", linkKey(id))))
  // Un collegamento pendente non si disegna: lo segnala la validazione, e dal pannello Problemi si seleziona.
  if (!link || !source || !target) return null
  return <LinkEdgeView id={id} link={link} source={source} target={target} selected={selected} />
}

/** I collegamenti, sopra gli archi di famiglia e sotto ogni nodo (spec 4a §6). */
export function LinksLayer() {
  const ids = useStore(documentStore, useShallow((s) => Object.keys(s.doc.diagram.links)))
  return (
    <g data-layer="links">
      {ids.map((id) => <LinkEdge key={id} id={id} />)}
    </g>
  )
}
```

In `src/ui/canvas/Canvas.tsx`, aggiungi `import { LinksLayer } from "./LinkEdge"` e, fra il `FAMILIES.map` degli `EdgesLayer` e quello dei `NodesLayer`:

```tsx
          {/* I collegamenti fra famiglie: sopra gli archi interni, sotto ogni nodo (spec 4a §6). */}
          <LinksLayer />
```

- [ ] **Step 4: L'export SVG**

In `src/ui/export/svg.tsx`:
- aggiungi `import { canvasOps } from "@/editor/kinds/canvas-ops"` (accanto all'import di `familyHasContent`, stesso modulo: `import { canvasOps, familyHasContent } from "@/editor/kinds/canvas-ops"`) e `import { LinkEdgeView } from "@/ui/canvas/LinkEdge"`;
- nel docblock di `buildSvg`, `le corsie sotto tutto, poi tutti gli archi, poi tutti i nodi` diventa `le corsie sotto tutto, poi tutti gli archi, poi i collegamenti fra famiglie, poi tutti i nodi`;
- subito prima di `const body = renderToStaticMarkup(`:

```tsx
  // Gli estremi dei collegamenti sono chiavi con prefisso, di famiglie diverse: li risolve `CanvasOps`.
  const allOps = canvasOps(doc)
```

- fra il `</g>` del layer `edges` e `<g data-layer="nodes">`:

```tsx
      <g data-layer="links">
        {Object.entries(doc.diagram.links).map(([id, link]) => {
          const source = allOps.rectOf(link.source)
          const target = allOps.rectOf(link.target)
          // Un collegamento pendente non si disegna, come sul canvas.
          if (!source || !target) return null
          return <LinkEdgeView key={id} id={id} link={link} source={source} target={target} selected={false} />
        })}
      </g>
```

- [ ] **Step 5: Lancia tutti i test, i controlli e l'e2e**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: PASS.

- [ ] **Step 6: Verifica a vista**

Avvia la preview `dev` (`.claude/launch.json`, porta 5174). Crea un'entità e una classe, collegale con `R` trascinando dalla classe all'entità: compare il tratteggio con «mappa su» e la freccia aperta verso l'entità. Trascina l'entità: il collegamento la segue durante il drag. Fai uno screenshot.

- [ ] **Step 7: Commit**

```bash
git add src/ui/canvas/LinkEdge.tsx src/ui/canvas/Canvas.tsx src/ui/export/svg.tsx src/ui/canvas/render.test.tsx src/ui/export/svg.test.ts
git commit -m "$(cat <<'EOF'
feat(canvas): i collegamenti si disegnano sul canvas e nell'export SVG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Pannello del collegamento, pannello Problemi, export testo

**Files:**
- Create: `src/ui/panels/LinkProperties.tsx`
- Modify: `src/ui/panels/PropertiesPanel.tsx`
- Modify: `src/ui/panels/IssuesPanel.tsx`
- Modify: `src/ui/export/TextExportDialog.tsx`
- Create: `src/ui/panels/LinkProperties.test.tsx`

**Interfaces:**
- Consumes: `linkId` (Task 1), `validateLinks` (Task 2), `LINK_LABEL` (Task 7), `deleteSelection` (`src/editor/actions.ts`), `splitKey`.
- Produces: `LinkProperties({ linkId })`.

- [ ] **Step 1: Scrivi il test che fallisce**

`src/ui/panels/LinkProperties.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { documentStore } from "@/editor/document-store"
import { selId, sessionStore } from "@/editor/session-store"
import { PropertiesPanel } from "./PropertiesPanel"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
  doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.class.model.classes["Ordine"] = {
    name: "Ordine",
    stereotype: "class",
    attributes: [{ name: "note", type: "string", visibility: "public", isStatic: false }],
    methods: [],
  }
  doc.diagram.class.view.nodes["Ordine"] = { x: 400, y: 0, collapsed: false }
  doc.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
  documentStore.getState().load(doc)
  sessionStore.getState().setSelection([selId("edge", "link/l1")])
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(<PropertiesPanel />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  sessionStore.getState().setSelection([])
})

describe("pannello del collegamento", () => {
  it("mostra il tipo, gli estremi e i problemi del collegamento", () => {
    expect(container.textContent).toContain("mappa su")
    expect(container.textContent).toContain("Ordine → ordini")
    expect(container.textContent).toContain("«Ordine.note» non ha una colonna in «ordini»")
  })

  it("«Elimina collegamento» lo toglie dal documento e svuota la selezione", () => {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Elimina collegamento")!
    act(() => button.click())
    expect(documentStore.getState().doc.diagram.links).toEqual({})
    expect(sessionStore.getState().selection.size).toBe(0)
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `pnpm vitest run src/ui/panels/LinkProperties.test.tsx`
Expected: FAIL. `PropertiesPanel` chiama `splitKey("link/l1")` e lancia.

- [ ] **Step 3: Il pannello**

`src/ui/panels/LinkProperties.tsx`:

```tsx
import { useMemo } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { deleteSelection } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { splitKey } from "@/editor/families"
import { validateLinks } from "@/model/links/validate"
import { LINK_LABEL } from "@/ui/canvas/LinkEdge"

/**
 * Il pannello di un collegamento fra famiglie (spec 4a §7): il tipo, i due estremi, i problemi di quel
 * collegamento e il pulsante per eliminarlo. Nel 4a non c'è niente da modificare: il tipo è uno solo.
 * I problemi sono quelli del pannello Problemi filtrati sul collegamento; `validateLinks` basta, perché
 * nessun problema di famiglia ha un collegamento come obiettivo.
 */
export function LinkProperties({ linkId: id }: { linkId: string }) {
  const link = useStore(documentStore, (s) => s.doc.diagram.links[id])
  const doc = useStore(documentStore, (s) => s.doc)
  const issues = useMemo(() => validateLinks(doc).filter((i) => i.edge === id), [doc, id])
  if (!link) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-sm font-medium first-letter:uppercase">{LINK_LABEL[link.kind]}</p>
      <p className="text-xs text-muted-foreground">
        {splitKey(link.source).key} → {splitKey(link.target).key}
      </p>
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

In `src/ui/panels/PropertiesPanel.tsx`:
- l'import da `@/editor/families` diventa `import { linkId, splitKey } from "@/editor/families"`, e aggiungi `import { LinkProperties } from "./LinkProperties"`;
- il ramo `if (single) { … }` diventa:

```tsx
  if (single) {
    const key = (nodes[0] ?? edges[0])!
    // Un collegamento non ha famiglia: si riconosce prima di `splitKey`, che lo rifiuterebbe.
    const link = linkId(key)
    if (link !== null) return <LinkProperties key={link} linkId={link} />
    const { Properties } = viewFor(splitKey(key).family)
    return <Properties />
  }
```

- [ ] **Step 4: Pannello Problemi ed export testo**

In `src/ui/panels/IssuesPanel.tsx`, l'array delle dipendenze di `useMemo` diventa `[doc.diagram.er.model, doc.diagram.class.model, doc.diagram.flow.model, doc.diagram.links]`, e la prima frase del commento sopra `useMemo` diventa `// La dipendenza è ristretta ai modelli di proposito: tre modelli, uno per famiglia, più i collegamenti, ognuno stabile finché non cambia.`

In `src/ui/export/TextExportDialog.tsx`:
- sotto il `useStore` di `models`, prima di `if (!open) return null`:

```tsx
  // DDL e Mermaid non hanno una notazione fra tipi di diagramma diversi (spec 4a §8): lo si dice.
  const hasLinks = useStore(documentStore, (s) => Object.keys(s.doc.diagram.links).length > 0)
```
- subito dopo `<li>{MODEL_LIMITS[FORMAT_FAMILY[effectiveFormat]]}</li>`:

```tsx
              {hasLinks && <li data-export-links-note>I collegamenti fra famiglie non hanno una notazione in questo formato.</li>}
```

- [ ] **Step 5: Lancia tutti i test, i controlli e l'e2e**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: PASS.

- [ ] **Step 6: Verifica a vista**

Nella preview `dev`: seleziona un collegamento con un clic. Il pannello mostra «Mappa su», `Ordine → …`, i problemi e «Elimina collegamento». Premi Canc: il collegamento sparisce. Con un collegamento nel documento, apri «Esporta testo…» e controlla la riga sui collegamenti. Fai uno screenshot del pannello.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels src/ui/export/TextExportDialog.tsx
git commit -m "$(cat <<'EOF'
feat(ui): pannello del collegamento e nota nell'export testo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: E2E dei collegamenti e documentazione

**Files:**
- Create: `scripts/e2e/collegamenti.mjs`
- Modify: `scripts/e2e/run.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: tutto il comportamento dei task precedenti, dal browser.
- Produces: lo scenario `run(browser, base)` esportato da `collegamenti.mjs`.

- [ ] **Step 1: Scrivi lo scenario**

`scripts/e2e/collegamenti.mjs`. Sulla forma di `misto.mjs`: stessa gestione di `step`, errori della pagina e guardia di esecuzione diretta.

```js
/**
 * End-to-end dei collegamenti fra famiglie (spec 4a §9): una classe «mappa su» un'entità. Prova quello
 * che senza un browser vero non esiste: il gesto Collega fra due famiglie, il pannello Problemi che si
 * aggiorna, il collegamento che resta attaccato a una rinomina e sopravvive a un ricaricamento, Canc
 * che lo elimina, e l'avviso quando il gesto viene rifiutato.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/collegamenti.mjs`. `HEADLESS=0` per vedere.
 */
import { expectNodes, expectText, isMainModule, nodeRects, pickFromMenu, startEnv } from "./helpers.mjs"

/** Centro in coordinate schermo del nodo con questa chiave esatta. */
async function centerOfId(page, id) {
  const rect = (await nodeRects(page)).find((r) => r.id === id)
  if (!rect) throw new Error(`nessun nodo ${id}`)
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
}

const LINK = '[data-edge-id^="link/"]'

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
    const entityName = page.locator('[aria-label="Nome entità"]')
    const className = page.locator('[aria-label="Nome classe"]')
    const members = page.locator('[aria-label="Membri della classe"]')

    await step("un'entità ordini con la colonna totale", async () => {
      await page.keyboard.press("e")
      await page.mouse.click(canvas.x + 200, canvas.y + 320)
      await entityName.waitFor()
      await entityName.fill("ordini")
      await entityName.press("Enter")
      await expectNodes(page, 1)
      // La creazione seleziona l'entità: il pannello proprietà è il suo.
      await page.getByRole("button", { name: "Aggiungi" }).click()
      const name = page.getByLabel("Nome attributo").last()
      await name.fill("totale")
      await name.press("Enter")
      const type = page.getByLabel("Tipo").last()
      await type.fill("numeric")
      await type.press("Enter")
      await expectText(page, '[data-node-id="er/ordini"]', "totale")
    })

    await step("una classe Ordine con totale e note", async () => {
      await page.keyboard.press("c")
      await page.mouse.click(canvas.x + 650, canvas.y + 320)
      await className.waitFor()
      await className.fill("Ordine")
      await className.press("Enter")
      await className.waitFor({ state: "detached" })
      const at = await centerOfId(page, "class/Ordine")
      await page.mouse.dblclick(at.x, at.y)
      await members.waitFor()
      await members.fill("+ totale: float\n+ note: string")
      await members.blur()
      await members.waitFor({ state: "detached" })
      await expectText(page, '[data-node-id="class/Ordine"]', "note")
    })

    await step("Collega classe → entità: nasce «mappa su», e Problemi segnala note", async () => {
      await page.keyboard.press("r")
      await drag(page, await centerOfId(page, "class/Ordine"), await centerOfId(page, "er/ordini"))
      await page.waitForSelector(LINK)
      await expectText(page, LINK, "mappa su")
      await expectText(page, "button", "«Ordine.note» non ha una colonna in «ordini»")
      // `totale` ha la sua colonna, con un tipo compatibile: nessun avviso su di lui.
      const onTotale = await page.getByText("Ordine.totale").count()
      if (onTotale !== 0) throw new Error("un avviso su Ordine.totale, che ha la sua colonna")
    })

    await step("rinomina dell'entità: il collegamento resta attaccato", async () => {
      const at = await centerOfId(page, "er/ordini")
      await page.mouse.click(at.x, at.y)
      const name = page.locator("#entity-name")
      await name.fill("righe")
      await name.press("Enter")
      await page.waitForSelector('[data-node-id="er/righe"]')
      if ((await page.locator(LINK).count()) !== 1) throw new Error("il collegamento non c'è più dopo la rinomina")
      await expectText(page, "button", "«Ordine.note» non ha una colonna in «righe»")
    })

    await step("ricarica: il collegamento c'è ancora", async () => {
      await page.waitForTimeout(800) // oltre il debounce dell'autosave (400 ms)
      await page.reload()
      await page.waitForSelector("[data-canvas]")
      await expectNodes(page, 2)
      await page.waitForSelector(LINK)
    })

    await step("Canc elimina il collegamento selezionato", async () => {
      // Il clic sul problema seleziona il suo obiettivo, cioè il collegamento.
      await page.getByRole("button", { name: /«Ordine\.note» non ha una colonna/ }).click()
      await page.keyboard.press("Delete")
      await page.waitForSelector(LINK, { state: "detached" })
    })

    await step("Collega fra un'interfaccia e l'entità: avviso, e nessun collegamento", async () => {
      await page.keyboard.press("i")
      await page.mouse.click(canvas.x + 650, canvas.y + 600)
      await className.waitFor()
      await className.press("Escape")
      await className.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, await centerOfId(page, "class/interface"), await centerOfId(page, "er/righe"))
      await expectText(page, "[data-notice-bar]", "Un'interfaccia non si mappa su una tabella.")
      if ((await page.locator(LINK).count()) !== 0) throw new Error("è nato un collegamento da un'interfaccia")
      await page.keyboard.press("Escape")
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (collegamenti):", e)
  }
  console.log(failed ? "\ne2e collegamenti: FAIL" : "\ne2e collegamenti: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/collegamenti.mjs` esegue solo questo scenario. */
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

Note per chi implementa, da verificare contro l'app vera e non da indovinare:
- Il nome di default di un'interfaccia nuova è `interface` (`uniqueKey(classes, stereotype)` in `addClass`), quindi la sua chiave DOM è `class/interface`. Controllalo con `nodeRects` se il passo fallisce.
- Il clic per selezionare `er/ordini` deve cadere sul nodo, non sul collegamento: il collegamento attacca a metà del lato del nodo, non al centro, quindi il centro è libero. Se il passo fallisce qui, clicca sull'header (in alto nel rettangolo).
- Se il `fill` di «Tipo» colpisce un campo di un altro pannello, restringi il locator al pannello proprietà.
- Se un passo fallisce, correggi lo scenario solo quando il difetto è nello scenario. Se il difetto è nell'app, correggi l'app e aggiungi un test unitario che lo fissi.

- [ ] **Step 2: Aggiungi lo scenario a `run.mjs`**

In `scripts/e2e/run.mjs`:
- `import { run as runCollegamenti } from "./collegamenti.mjs"` fra gli import, in ordine alfabetico;
- dopo `const mistoOk = await runMisto(browser, base)`: `const collegamentiOk = await runCollegamenti(browser, base)`;
- `ok = … && mistoOk` diventa `ok = … && mistoOk && collegamentiOk`;
- nel docblock, `del flowchart e del canvas misto` diventa `del flowchart, del canvas misto e dei collegamenti fra famiglie`, e alla lista dei comandi singoli aggiungi `` `node scripts/e2e/collegamenti.mjs` `` dopo quello di `misto.mjs` (la congiunzione «o» passa sull'ultimo).

- [ ] **Step 3: Lancia l'e2e**

Run: `pnpm e2e`
Expected: PASS, compreso `e2e collegamenti: PASS`.

- [ ] **Step 4: README**

In `README.md`:
- in «Disegna», dopo il punto **Flowchart**, aggiungi:

```markdown
- **Collegamenti fra famiglie**: una classe si collega a un'entità con «mappa su» — lo strumento
  Collega, trascinando in qualunque verso — e l'app verifica che ogni attributo della classe abbia la
  sua colonna (`createdAt` e `created_at` sono lo stesso campo) e un tipo compatibile, e che una
  classe non mappi su più tabelle. Il collegamento segue le rinomine e sparisce con i suoi nodi. Fra
  due famiglie che non hanno un tipo di collegamento, il gesto lo dice invece di non fare niente.
```

- nella riga della tabella delle scorciatoie, `| \`R\` | Collega: il tipo di arco dipende dagli estremi |` resta com'è;
- in «Test end-to-end», il punto **Canvas misto** dice ora `che «Collega» fra un'entità e un nodo di flusso non crei niente e lo dica, mentre dentro la stessa famiglia colleghi (una seconda entità)` al posto di `che «Collega» fra un'entità e una classe non crei niente mentre dentro la stessa famiglia colleghi (una seconda entità)`; dopo quel punto aggiungi:

```markdown
- **Collegamenti**: crea un'entità `ordini` con la colonna `totale` e una classe `Ordine` con
  `totale` e `note`, le collega con «mappa su» e verifica che il pannello Problemi segnali solo
  `Ordine.note`. Poi rinomina l'entità e verifica che il collegamento resti attaccato, ricarica,
  elimina il collegamento con Canc, e infine prova a collegare un'interfaccia all'entità e verifica
  l'avviso.
```

- la frase finale `Exit code 1 se un passo di uno dei nove scenari non regge.` diventa `… dei dieci scenari …`.

- [ ] **Step 5: Controlli finali**

Run: `pnpm tsc -b && pnpm lint && pnpm test && pnpm e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/e2e README.md
git commit -m "$(cat <<'EOF'
test(e2e): scenario dei collegamenti fra famiglie, e README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
