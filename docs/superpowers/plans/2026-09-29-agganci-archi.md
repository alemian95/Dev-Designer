# Gli agganci degli archi — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni nodo offre 16 agganci alla draw.io per fissare dove un arco lo tocca, e i capi lasciati automatici si distribuiscono per lato invece di sovrapporsi.

**Architecture:** un solo punto calcola dove ogni arco tocca i suoi nodi: `assignPorts` (`src/editor/ports.ts`), una funzione pura che da capi, agganci salvati e rettangoli dà un *porto* (punto + direzione d'uscita) per capo, con il fascio per lato fra tutte le famiglie e i link. `routePorts` traccia il percorso ortogonale fra due porti. `canvasPorts(doc)` è la sola fonte dei porti a riposo per canvas, export ed editor d'etichetta; l'anteprima del drag ricalcola con i rettangoli spostati. L'interazione aggiunge due `Hit` (aggancio, capo d'arco) e due modi (`connect` con aggancio, `reanchor`).

**Tech Stack:** React 19, TypeScript 6 strict, Zustand 5 vanilla + Immer, zod 4, vitest, Playwright (e2e in `scripts/e2e/`).

**Spec:** `docs/superpowers/specs/2026-09-29-agganci-archi-design.md` — leggerla prima di ogni task.

## Global Constraints

- Strati imposti da `no-restricted-imports`: `model` (nulla) → `editor` (model, zustand, immer) → `io` → `ui`. `src/editor/**` non importa React.
- Niente `SCHEMA_VERSION` nuova, niente migrazione: `anchors` è **facoltativo** e si legge con `anchorsOf` (spec §3).
- Commenti e messaggi in italiano, identificatori in inglese, stessa densità di docblock del codice attorno.
- Nessuna dipendenza nuova.
- **Niente `pnpm perf`**: scelta dell'utente, la voce è già nel debito tecnico (spec §9).
- Ogni commit termina con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, anche se l'implementer gira su un altro modello.
- Verifica di ogni task: `pnpm test`, `pnpm lint`, `pnpm exec tsc -b` verdi. Il task 8 aggiunge `pnpm e2e`.
- Le note ancorate restano fuori dal fascio e dagli agganci (spec §2): le loro linee ricevono `autoPorts`, la geometria di oggi.

## Review Focus

1. **«Inverti» su una freccia con agganci**: i capi si scambiano, quindi anche gli agganci devono scambiarsi, o la punta resta attaccata al punto scelto per l'altra forma. Test nel task 5 (`invertArrow`).
2. **Uno spigolo salvato su un nodo che cambia forma** (un `process` con `nw` diventato `decision`): il disegno non si rompe, il punto cade sul contorno del rombo. Test nel task 2 (spigolo sul rombo) e nel task 3 (capo fissato su rombo).
3. **Rinomina di un'entità o di una classe** con archi agganciati: la chiave del nodo cambia, gli agganci restano sull'arco. Test nel task 5.
4. **Undo di `setEdgeAnchor`** e di un Collega con agganci: una voce sola, e l'annulla riporta il capo automatico. Test nel task 5.
5. **Collega verso un collegamento già presente** fra le stesse due famiglie: si seleziona quello che c'è e gli agganci del gesto non lo toccano (spec §3). Test nel task 5.

---

## Mappa dei file

| File | Responsabilità | Task |
| --- | --- | --- |
| `src/model/shared.ts` | `AnchorSchema`, `EdgeAnchors`, `AUTO_ANCHORS`, `anchorsOf`, `writeAnchors` | 1 |
| `src/model/{er,class,flow,shape,links}/schema.ts` | campo `anchors?` su ogni arco | 1 |
| `src/editor/ports.ts` (nuovo) | contorni, `anchorPort`, `offeredAnchors`, `autoPorts`, `assignPorts`, `samePorts` | 2, 3 |
| `src/editor/edge-routing.ts` | `routePorts`; via `routeEdge`, `edgeOffsets`, `slide`, `selfLoop`, `BUNDLE_GAP` | 4, 5 |
| geometrie di famiglia (`er/`, `class/`, `flow/`, `shape/`, `links/`, `note/`) | ricevono `EdgePorts` | 5 |
| `src/editor/kinds/ops.ts`, `kinds/*.ts` | `edgeGeometry(key, ports)`, `outlineOf`, `setEdgeAnchors`, `anchors` in `EdgeEnds` | 5 |
| `src/editor/kinds/canvas-ops.ts` | `allEdges`, `portsOf`, `anchorPoint(s)`, `hasAnchors`, `setEdgeAnchor`, `addEdge(…, anchors)`, `canvasPorts` | 5 |
| componenti degli archi, `svg.tsx`, `InlineEditor.tsx`, `interaction-runner.ts` (drag) | leggono i porti da `canvasPorts` | 5 |
| `src/editor/interaction.ts` | `Hit` e `Mode` nuovi, effetti | 6 |
| `src/editor/session-store.ts` | `anchorsFor` | 7 |
| `src/ui/canvas/AnchorsLayer.tsx` (nuovo), `use-canvas-interaction.ts`, `interaction-runner.ts`, `Canvas.tsx` | agganci visibili, hover, hit test, effetti | 7 |
| `scripts/e2e/agganci.mjs` (nuovo), `run.mjs`, `README.md`, `docs/debito-tecnico.md` | e2e e documenti | 8 |

---

### Task 1: il modello degli agganci

**Files:**
- Modify: `src/model/shared.ts`
- Modify: `src/model/er/schema.ts` (`RelationshipSchema`), `src/model/class/schema.ts` (`ClassRelationSchema`), `src/model/flow/schema.ts:29` (`FlowEdgeSchema`), `src/model/shape/schema.ts` (`ArrowSchema`), `src/model/links/schema.ts` (`ends`)
- Test: `src/model/shared.test.ts` (nuovo)

**Interfaces:**
- Produces: `AnchorSchema`, `type Anchor`, `EdgeAnchorsSchema`, `type EdgeAnchors = { source: Anchor | null; target: Anchor | null }`, `AUTO_ANCHORS`, `anchorsOf(edge: { anchors?: EdgeAnchors }): EdgeAnchors`, `writeAnchors(edge: { anchors?: EdgeAnchors }, anchors: EdgeAnchors): void`. Ogni tipo d'arco ha `anchors?: EdgeAnchors`.

- [ ] **Step 1: scrivi il test che fallisce**

`src/model/shared.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ClassRelationSchema } from "./class/schema"
import { RelationshipSchema } from "./er/schema"
import { FlowEdgeSchema } from "./flow/schema"
import { LinkSchema } from "./links/schema"
import { AUTO_ANCHORS, anchorsOf, writeAnchors, type EdgeAnchors } from "./shared"
import { ArrowSchema } from "./shape/schema"

const anchors: EdgeAnchors = { source: "n1", target: null }

describe("anchorsOf", () => {
  it("un arco senza campo ha due capi automatici", () => {
    expect(anchorsOf({})).toEqual({ source: null, target: null })
  })

  it("un arco con il campo lo restituisce", () => {
    expect(anchorsOf({ anchors })).toEqual(anchors)
  })
})

describe("writeAnchors", () => {
  it("scrive la coppia", () => {
    const edge: { anchors?: EdgeAnchors } = {}
    writeAnchors(edge, anchors)
    expect(edge.anchors).toEqual(anchors)
  })

  it("due capi automatici tolgono il campo: il file resta com'era prima degli agganci", () => {
    const edge: { anchors?: EdgeAnchors } = { anchors }
    writeAnchors(edge, AUTO_ANCHORS)
    expect("anchors" in edge).toBe(false)
  })
})

describe("gli schemi degli archi conservano gli agganci", () => {
  const cases: [string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }, Record<string, unknown>][] = [
    ["relazione ER", RelationshipSchema, {
      source: { entity: "a", attributes: [], cardinality: "many" },
      target: { entity: "b", attributes: [], cardinality: "one" },
      identifying: false,
    }],
    ["relazione di classe", ClassRelationSchema, {
      kind: "association",
      source: { class: "A", multiplicity: "", role: "" },
      target: { class: "B", multiplicity: "", role: "" },
    }],
    ["arco di flusso", FlowEdgeSchema, { source: "a", target: "b", label: "" }],
    ["freccia", ArrowSchema, { source: "a", target: "b", head: "end", dashed: false }],
    ["collegamento", LinkSchema, { kind: "accesses", source: "flow/a", target: "er/b", mode: "read" }],
  ]

  for (const [name, schema, edge] of cases) {
    it(`${name}: senza campo è valido, con il campo lo conserva, con un aggancio sconosciuto no`, () => {
      expect(schema.safeParse(edge).success).toBe(true)
      const parsed = schema.safeParse({ ...edge, anchors })
      expect(parsed.success).toBe(true)
      expect((parsed.data as { anchors?: EdgeAnchors }).anchors).toEqual(anchors)
      expect(schema.safeParse({ ...edge, anchors: { source: "centro", target: null } }).success).toBe(false)
    })
  }
})
```

- [ ] **Step 2: eseguilo e verifica che fallisca**

Run: `pnpm vitest run src/model/shared.test.ts`
Expected: FAIL, `anchorsOf` non esiste.

- [ ] **Step 3: implementa**

In `src/model/shared.ts`, dopo `NodeViewSchema`:

```ts
/**
 * I 16 punti di aggancio di un nodo (spec agganci §3): tre per lato a ¼, ½ e ¾, contati in senso
 * orario lungo il perimetro (`n1` è il più vicino a `nw`, `e1` a `ne`, `s1` a `se`, `w1` a `sw`), e i
 * quattro spigoli.
 */
export const AnchorSchema = z.enum(["n1", "n2", "n3", "e1", "e2", "e3", "s1", "s2", "s3", "w1", "w2", "w3", "nw", "ne", "se", "sw"])
export type Anchor = z.infer<typeof AnchorSchema>

/** Gli agganci dei due capi di un arco: `null` è il capo automatico, che sceglie il lato da sé. */
export const EdgeAnchorsSchema = z.object({ source: AnchorSchema.nullable(), target: AnchorSchema.nullable() })
export type EdgeAnchors = z.infer<typeof EdgeAnchorsSchema>

export const AUTO_ANCHORS: EdgeAnchors = { source: null, target: null }

/**
 * Gli agganci di un arco di qualunque famiglia. Il campo è facoltativo — assente vale due capi
 * automatici — sul precedente di `navigable` (`class/schema.ts`): un `.default()` lo renderebbe
 * obbligatorio nel tipo, e ogni punto che costruisce un arco andrebbe toccato (spec §3).
 */
export function anchorsOf(edge: { anchors?: EdgeAnchors }): EdgeAnchors {
  return edge.anchors ?? AUTO_ANCHORS
}

/** Scrive gli agganci su un arco, e toglie il campo quando tornano entrambi automatici. */
export function writeAnchors(edge: { anchors?: EdgeAnchors }, anchors: EdgeAnchors): void {
  if (anchors.source === null && anchors.target === null) delete edge.anchors
  else edge.anchors = { source: anchors.source, target: anchors.target }
}
```

Poi aggiungi `anchors: EdgeAnchorsSchema.optional()` (importando `EdgeAnchorsSchema` da `../shared`) come ultimo campo di:
- `RelationshipSchema` (`src/model/er/schema.ts`), dopo `identifying`;
- `ClassRelationSchema` (`src/model/class/schema.ts`), dopo `target`;
- `FlowEdgeSchema` (`src/model/flow/schema.ts:29`): `z.object({ source: Identifier, target: Identifier, label: z.string(), anchors: EdgeAnchorsSchema.optional() })`;
- `ArrowSchema` (`src/model/shape/schema.ts`), dentro lo `z.object` prima del `.refine`;
- `ends` in `src/model/links/schema.ts`: `const ends = { source: Identifier, target: Identifier, anchors: EdgeAnchorsSchema.optional() }`.

Un commento di una riga su ciascuno: `/** Dove l'arco tocca i suoi nodi (spec agganci §3). Assente: due capi automatici. */`.

- [ ] **Step 4: verifica**

Run: `pnpm vitest run src/model && pnpm exec tsc -b`
Expected: PASS, nessun errore di tipo (il campo facoltativo non tocca chi costruisce archi).

- [ ] **Step 5: commit**

```bash
git add src/model
git commit -m "feat(model): gli agganci facoltativi su ogni tipo di arco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: il porto di un aggancio sul contorno vero

**Files:**
- Create: `src/editor/ports.ts`
- Test: `src/editor/ports.test.ts`

**Interfaces:**
- Consumes: `Anchor` (task 1); `Dir`, `UP`, `DOWN`, `LEFT`, `RIGHT` da `./edge-routing`; `Point`, `Rect` da `./geometry`.
- Produces:
  - `type Outline = "rect" | "diamond" | "ellipse" | "stadium" | { skew: number }`
  - `interface Port { point: Point; dir: Dir }`
  - `interface EdgePorts { source: Port; target: Port; stub: number }`
  - `const STUB = 16`, `SELF_LOOP_OFFSET = 30`, `LOOP_GAP = 14`, `EDGE_INSET = 6`
  - `type Side = "n" | "e" | "s" | "w"`
  - `anchorPort(rect: Rect, outline: Outline, anchor: Anchor, toward?: Point): Port`
  - `offeredAnchors(outline: Outline): readonly Anchor[]`
  - `autoPorts(a: Rect, b: Rect): EdgePorts`
  - `samePorts(a: EdgePorts, b: EdgePorts): boolean`

- [ ] **Step 1: scrivi il test che fallisce**

`src/editor/ports.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { DOWN, LEFT, RIGHT, UP } from "./edge-routing"
import { anchorPort, autoPorts, offeredAnchors, samePorts, STUB } from "./ports"

const R = { x: 0, y: 0, w: 100, h: 40 }
const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 2)
  expect(p.y).toBeCloseTo(y, 2)
}

describe("anchorPort sul rettangolo", () => {
  it("i punti dei lati stanno a ¼, ½, ¾ in senso orario, con la normale uscente", () => {
    expect(anchorPort(R, "rect", "n1")).toEqual({ point: { x: 25, y: 0 }, dir: UP })
    expect(anchorPort(R, "rect", "e2")).toEqual({ point: { x: 100, y: 20 }, dir: RIGHT })
    expect(anchorPort(R, "rect", "s1")).toEqual({ point: { x: 75, y: 40 }, dir: DOWN })
    expect(anchorPort(R, "rect", "w1")).toEqual({ point: { x: 0, y: 30 }, dir: LEFT })
  })

  it("uno spigolo esce dalla normale che guarda di più verso l'altro capo", () => {
    expect(anchorPort(R, "rect", "nw", { x: 500, y: 0 })).toEqual({ point: { x: 0, y: 0 }, dir: UP })
    expect(anchorPort(R, "rect", "nw", { x: -500, y: 20 })).toEqual({ point: { x: 0, y: 0 }, dir: LEFT })
    expect(anchorPort(R, "rect", "se", { x: 400, y: 60 }).dir).toEqual(RIGHT)
  })

  it("senza `toward` lo spigolo esce in orizzontale", () => {
    expect(anchorPort(R, "rect", "ne").dir).toEqual(RIGHT)
  })
})

describe("anchorPort sui contorni non rettangolari", () => {
  it("rombo: il punto scende sul lato obliquo, la punta resta la punta", () => {
    close(anchorPort(R, "diamond", "n1").point, 25, 10)
    close(anchorPort(R, "diamond", "n2").point, 50, 0)
    close(anchorPort(R, "diamond", "e2").point, 100, 20)
  })

  it("ellisse: il punto sta sulla curva", () => {
    close(anchorPort(R, "ellipse", "n1").point, 25, 20 - 20 * Math.sqrt(0.75))
    close(anchorPort(R, "ellipse", "w2").point, 0, 20)
  })

  it("stadio: dritto sul tratto piano, sulla curva sulle estremità", () => {
    close(anchorPort(R, "stadium", "n1").point, 25, 0)
    close(anchorPort(R, "stadium", "e2").point, 100, 20)
    close(anchorPort(R, "stadium", "e1").point, 80 + Math.sqrt(300), 10)
  })

  it("parallelogramma: i lati obliqui e i vertici veri", () => {
    const skew = { skew: 16 }
    close(anchorPort(R, skew, "n1").point, 25, 0)
    close(anchorPort(R, skew, "w2").point, 8, 20)
    close(anchorPort(R, skew, "e2").point, 92, 20)
    close(anchorPort(R, skew, "nw").point, 16, 0)
    close(anchorPort(R, skew, "se").point, 84, 40)
  })

  it("uno spigolo su un rombo cade sul contorno, in diagonale verso il centro", () => {
    close(anchorPort(R, "diamond", "nw").point, 25, 10)
    close(anchorPort(R, "ellipse", "se").point, 50 + 50 * Math.SQRT1_2, 20 + 20 * Math.SQRT1_2)
  })
})

describe("offeredAnchors", () => {
  it("rettangolo e parallelogramma offrono 16 punti, le forme senza spigoli 12", () => {
    expect(offeredAnchors("rect")).toHaveLength(16)
    expect(offeredAnchors({ skew: 16 })).toHaveLength(16)
    for (const o of ["diamond", "ellipse", "stadium"] as const) {
      expect(offeredAnchors(o)).toHaveLength(12)
      expect(offeredAnchors(o)).not.toContain("nw")
    }
  })
})

describe("autoPorts", () => {
  it("la geometria di oggi: il centro dei due lati che si guardano", () => {
    const p = autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 100, w: 100, h: 50 })
    expect(p).toEqual({ source: { point: { x: 100, y: 25 }, dir: RIGHT }, target: { point: { x: 300, y: 125 }, dir: LEFT }, stub: STUB })
  })

  it("nodi impilati: dal basso verso l'alto", () => {
    const p = autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 20, y: 300, w: 100, h: 50 })
    expect(p.source).toEqual({ point: { x: 50, y: 50 }, dir: DOWN })
    expect(p.target).toEqual({ point: { x: 70, y: 300 }, dir: UP })
  })
})

describe("samePorts", () => {
  it("confronta i numeri, non l'identità", () => {
    const a = autoPorts(R, { ...R, x: 300 })
    expect(samePorts(a, autoPorts(R, { ...R, x: 300 }))).toBe(true)
    expect(samePorts(a, autoPorts(R, { ...R, x: 310 }))).toBe(false)
  })
})
```

- [ ] **Step 2: eseguilo e verifica che fallisca**

Run: `pnpm vitest run src/editor/ports.test.ts`
Expected: FAIL, `./ports` non esiste.

- [ ] **Step 3: implementa**

`src/editor/ports.ts`:

```ts
import type { Anchor } from "@/model/shared"
import { DOWN, LEFT, RIGHT, UP, type Dir } from "./edge-routing"
import type { Point, Rect } from "./geometry"

/**
 * Il contorno vero di un nodo (spec agganci §4): dove cade un aggancio che sul riquadro sarebbe nel
 * vuoto. `{ skew }` è il parallelogramma dell'`io`, con la sua inclinazione fissa.
 */
export type Outline = "rect" | "diamond" | "ellipse" | "stadium" | { skew: number }

/** Dove un capo d'arco tocca il suo nodo, e il versore con cui ne esce. */
export interface Port {
  point: Point
  dir: Dir
}

/** I due porti di un arco, e quanto il percorso si allontana dal nodo prima di piegare (spec §5). */
export interface EdgePorts {
  source: Port
  target: Port
  stub: number
}

/** Il tratto d'uscita di un arco che non può piegare subito. */
export const STUB = 16
/** Il tratto del primo cappio su un nodo: quanto il cappio di oggi. */
export const SELF_LOOP_OFFSET = 30
/** Quanto cresce il tratto di ogni cappio successivo sullo stesso nodo. */
export const LOOP_GAP = 14
/** Quanto un capo automatico resta lontano dallo spigolo, dove il marker si confonderebbe col profilo. */
export const EDGE_INSET = 6

export type Side = "n" | "e" | "s" | "w"

export const SIDE_DIR: Readonly<Record<Side, Dir>> = { n: UP, e: RIGHT, s: DOWN, w: LEFT }

const SIDE_ANCHORS: readonly Anchor[] = ["n1", "n2", "n3", "e1", "e2", "e3", "s1", "s2", "s3", "w1", "w2", "w3"]
const ALL_ANCHORS: readonly Anchor[] = [...SIDE_ANCHORS, "nw", "ne", "se", "sw"]

type Corner = "nw" | "ne" | "se" | "sw"
const isCorner = (a: Anchor): a is Corner => a === "nw" || a === "ne" || a === "se" || a === "sw"

/** Gli agganci che un contorno mostra: gli spigoli solo dove esistono davvero (spec §4). */
export function offeredAnchors(outline: Outline): readonly Anchor[] {
  return outline === "rect" || typeof outline === "object" ? ALL_ANCHORS : SIDE_ANCHORS
}

/** Il lato che un versore d'uscita indica. */
export function sideOf(dir: Dir): Side {
  if (dir.x > 0) return "e"
  if (dir.x < 0) return "w"
  return dir.y < 0 ? "n" : "s"
}

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** La coordinata lungo il lato di un punto: `x` per `n`/`s`, `y` per `e`/`w`. */
export const alongSide = (side: Side, p: Point): number => (side === "n" || side === "s" ? p.x : p.y)

/** Gli estremi utili di un lato, rientrati di `EDGE_INSET` (mai oltre la metà: un nodo basso resta usabile). */
export function sideSpan(r: Rect, side: Side): [number, number] {
  const horizontal = side === "n" || side === "s"
  const [min, size] = horizontal ? [r.x, r.w] : [r.y, r.h]
  const inset = Math.min(EDGE_INSET, size / 2)
  return [min + inset, min + size - inset]
}

/** La coordinata nominale del punto `k`/4 di un lato, in senso orario. */
function sideCoord(r: Rect, side: Side, k: number): number {
  const f = k / 4
  switch (side) {
    case "n":
      return r.x + r.w * f
    case "e":
      return r.y + r.h * f
    case "s":
      return r.x + r.w * (1 - f)
    case "w":
      return r.y + r.h * (1 - f)
  }
}

/** Il parallelogramma dell'`io`: vertici (skew, 0), (w, 0), (w − skew, h), (0, h), come `shapePath`. */
function skewPoint(r: Rect, skew: number, side: Side, t: number): Point {
  if (side === "n") {
    const lx = t - r.x
    return { x: t, y: r.y + (lx >= skew ? 0 : (r.h * (skew - lx)) / skew) }
  }
  if (side === "s") {
    const lx = t - r.x
    return { x: t, y: r.y + (lx <= r.w - skew ? r.h : (r.h * (r.w - lx)) / skew) }
  }
  const ly = t - r.y
  return side === "e" ? { x: r.x + r.w - (skew * ly) / r.h, y: t } : { x: r.x + skew * (1 - ly / r.h), y: t }
}

/**
 * Il punto del contorno sul lato `side` alla coordinata `t` (una `x` per `n`/`s`, una `y` per
 * `e`/`w`): dal riquadro si scende verso l'interno, perpendicolari al lato, finché si incontra la
 * forma vera.
 */
export function sidePoint(r: Rect, outline: Outline, side: Side, t: number): Point {
  if (typeof outline === "object") return outline.skew > 0 ? skewPoint(r, outline.skew, side, t) : sidePoint(r, "rect", side, t)
  const c = center(r)
  const hw = r.w / 2
  const hh = r.h / 2
  const horizontal = side === "n" || side === "s"
  const sign = side === "n" || side === "w" ? -1 : 1
  // `half` è la semi-misura lungo la normale, `u` la distanza dal centro lungo il lato, in unità della semi-misura del lato.
  const half = horizontal ? hh : hw
  const offset = horizontal ? t - c.x : t - c.y
  const u = offset / (horizontal ? hw : hh)
  let reach: number
  switch (outline) {
    case "rect":
      reach = half
      break
    case "diamond":
      reach = half * Math.max(0, 1 - Math.abs(u))
      break
    case "ellipse":
      reach = half * Math.sqrt(Math.max(0, 1 - u * u))
      break
    case "stadium": {
      const rad = Math.min(hw, hh)
      const d = Math.max(0, Math.abs(offset) - ((horizontal ? hw : hh) - rad))
      reach = half - rad + Math.sqrt(Math.max(0, rad * rad - d * d))
      break
    }
  }
  return horizontal ? { x: t, y: c.y + sign * reach } : { x: c.x + sign * reach, y: t }
}

/** Uno spigolo sul contorno: l'angolo del rettangolo, il vertice del parallelogramma, o la diagonale verso il centro. */
function cornerPoint(r: Rect, outline: Outline, corner: Corner): Point {
  const sx = corner === "ne" || corner === "se" ? 1 : -1
  const sy = corner === "se" || corner === "sw" ? 1 : -1
  const c = center(r)
  const hw = r.w / 2
  const hh = r.h / 2
  if (typeof outline === "object") {
    if (sy < 0) return { x: sx < 0 ? r.x + outline.skew : r.x + r.w, y: r.y }
    return { x: sx < 0 ? r.x : r.x + r.w - outline.skew, y: r.y + r.h }
  }
  switch (outline) {
    case "rect":
      return { x: c.x + sx * hw, y: c.y + sy * hh }
    case "diamond":
      return { x: c.x + (sx * hw) / 2, y: c.y + (sy * hh) / 2 }
    case "ellipse":
      return { x: c.x + sx * hw * Math.SQRT1_2, y: c.y + sy * hh * Math.SQRT1_2 }
    case "stadium": {
      const rad = Math.min(hw, hh)
      return { x: c.x + sx * (hw - rad + rad * Math.SQRT1_2), y: c.y + sy * (hh - rad + rad * Math.SQRT1_2) }
    }
  }
}

/** Fra le due normali uscenti dello spigolo, quella che guarda di più verso `toward`; a parità, l'orizzontale. */
function cornerDir(corner: Corner, point: Point, toward: Point | undefined): Dir {
  const horizontal: Dir = corner === "ne" || corner === "se" ? RIGHT : LEFT
  const vertical: Dir = corner === "se" || corner === "sw" ? DOWN : UP
  if (!toward) return horizontal
  const vx = (toward.x - point.x) * horizontal.x
  const vy = (toward.y - point.y) * vertical.y
  return vx >= vy ? horizontal : vertical
}

/**
 * Il porto di un aggancio fissato (spec §4): il punto nominale sul riquadro portato sul contorno vero,
 * con la normale uscente del suo lato. `toward` — il centro del nodo all'altro capo — decide solo da
 * che parte esce uno spigolo.
 */
export function anchorPort(rect: Rect, outline: Outline, anchor: Anchor, toward?: Point): Port {
  if (isCorner(anchor)) {
    const point = cornerPoint(rect, outline, anchor)
    return { point, dir: cornerDir(anchor, point, toward) }
  }
  const side = anchor[0] as Side
  return { point: sidePoint(rect, outline, side, sideCoord(rect, side, Number(anchor[1]))), dir: SIDE_DIR[side] }
}

const OPPOSITE: Readonly<Record<Side, Side>> = { n: "s", s: "n", e: "w", w: "e" }
export const opposite = (side: Side): Side => OPPOSITE[side]

/** Il lato di `a` rivolto verso `b`: l'asse dominante fra i due centri, la regola di sempre. */
export function autoSide(a: Rect, b: Rect): Side {
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "e" : "w"
  return dy >= 0 ? "s" : "n"
}

/**
 * I porti senza fascio né agganci: il centro dei due lati che si guardano, sul riquadro. È la
 * geometria di prima degli agganci, e resta quella delle linee delle note (spec §2).
 */
export function autoPorts(a: Rect, b: Rect): EdgePorts {
  const sa = autoSide(a, b)
  const sb = opposite(sa)
  const mid = (r: Rect, side: Side) => {
    const c = center(r)
    return sidePoint(r, "rect", side, alongSide(side, c))
  }
  return { source: { point: mid(a, sa), dir: SIDE_DIR[sa] }, target: { point: mid(b, sb), dir: SIDE_DIR[sb] }, stub: STUB }
}

const samePort = (a: Port, b: Port): boolean =>
  a.point.x === b.point.x && a.point.y === b.point.y && a.dir.x === b.dir.x && a.dir.y === b.dir.y

/** Due coppie di porti con gli stessi numeri: serve a `canvasPorts` per riusare l'oggetto di prima. */
export function samePorts(a: EdgePorts, b: EdgePorts): boolean {
  return a.stub === b.stub && samePort(a.source, b.source) && samePort(a.target, b.target)
}
```

- [ ] **Step 4: verifica**

Run: `pnpm vitest run src/editor/ports.test.ts && pnpm lint`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/editor/ports.ts src/editor/ports.test.ts
git commit -m "feat(ports): il porto di un aggancio sul contorno vero della forma

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `assignPorts`, il fascio per lato

**Files:**
- Modify: `src/editor/ports.ts`
- Modify: `src/editor/edge-routing.ts` (`EdgeEnds` riceve `anchors?`)
- Test: `src/editor/ports.test.ts`

**Interfaces:**
- Consumes: `EdgeAnchors`, `anchorsOf` (task 1); tutto il task 2.
- Produces: `EdgeEnds` in `edge-routing.ts` diventa `{ key: string; source: string; target: string; anchors?: EdgeAnchors }`; `assignPorts(edges: readonly EdgeEnds[], rectOf: (key: string) => Rect | null, outlineOf: (key: string) => Outline): Map<string, EdgePorts>`.

- [ ] **Step 1: scrivi il test che fallisce**

In coda a `src/editor/ports.test.ts` (aggiungi `assignPorts`, `SELF_LOOP_OFFSET`, `LOOP_GAP` all'import da `./ports`, `type EdgeEnds` da `./edge-routing`, `type Rect` da `./geometry`, `type Outline`):

```ts
describe("assignPorts", () => {
  const rects: Record<string, Rect> = {
    a: { x: 0, y: 0, w: 100, h: 50 },
    b: { x: 400, y: 0, w: 100, h: 50 },
    t: { x: 200, y: 300, w: 120, h: 40 },
    c: { x: 1000, y: 1000, w: 100, h: 50 },
    d: { x: 1300, y: 1000, w: 100, h: 50 },
  }
  const rectOf = (k: string) => rects[k] ?? null
  const rect = (): Outline => "rect"
  const run = (edges: EdgeEnds[], outlineOf: (k: string) => Outline = rect, r = rectOf) => assignPorts(edges, r, outlineOf)

  it("lo screenshot: due sorgenti diverse sullo stesso lato del bersaglio attaccano in due punti", () => {
    const ports = run([
      { key: "ea", source: "a", target: "t" },
      { key: "eb", source: "b", target: "t" },
    ])
    // Il lato `n` di `t` va da 206 a 314: due capi a un terzo e due terzi, quello da sinistra a sinistra.
    expect(ports.get("ea")!.target).toEqual({ point: { x: 242, y: 300 }, dir: UP })
    expect(ports.get("eb")!.target).toEqual({ point: { x: 278, y: 300 }, dir: UP })
    // Un capo solo sul suo lato resta a metà, come prima degli agganci.
    expect(ports.get("ea")!.source).toEqual({ point: { x: 50, y: 50 }, dir: DOWN })
  })

  it("un arco solo fra due nodi ha la geometria di prima", () => {
    const ports = run([{ key: "e", source: "a", target: "b" }])
    expect(ports.get("e")).toEqual(autoPorts(rects.a!, rects.b!))
  })

  it("due archi fra la stessa coppia si separano, nello stesso ordine ai due capi", () => {
    const ports = run([
      { key: "e1", source: "a", target: "b" },
      { key: "e2", source: "a", target: "b" },
    ])
    const [p1, p2] = [ports.get("e1")!, ports.get("e2")!]
    expect(p1.source.point.y).not.toBe(p2.source.point.y)
    expect(p1.source.point.y < p2.source.point.y).toBe(p1.target.point.y < p2.target.point.y)
  })

  it("archi di famiglie diverse sullo stesso lato si separano fra loro", () => {
    const ports = run([
      { key: "flow/e", source: "a", target: "t" },
      { key: "link/l", source: "b", target: "t" },
    ])
    expect(ports.get("flow/e")!.target.point).not.toEqual(ports.get("link/l")!.target.point)
  })

  it("un capo fissato resta al suo punto e i capi automatici gli lasciano spazio", () => {
    const ports = run([
      { key: "fisso", source: "a", target: "t", anchors: { source: null, target: "n2" } },
      { key: "auto", source: "b", target: "t" },
    ])
    expect(ports.get("fisso")!.target).toEqual({ point: { x: 260, y: 300 }, dir: UP })
    // `b` sta a destra: il suo capo cade nell'intervallo fra il fissato e lo spigolo destro.
    expect(ports.get("auto")!.target.point).toEqual({ x: 287, y: 300 })
  })

  it("un capo fissato su un rombo cade sul contorno del rombo", () => {
    const ports = run([{ key: "e", source: "a", target: "t", anchors: { source: null, target: "nw" } }], (k) => (k === "t" ? "diamond" : "rect"))
    const p = ports.get("e")!.target.point
    expect(p.x).toBeCloseTo(230, 2)
    expect(p.y).toBeCloseTo(310, 2)
  })

  it("il cappio esce da destra, entra dall'alto, e il secondo cappio gira più largo", () => {
    const ports = run([
      { key: "l1", source: "a", target: "a" },
      { key: "l2", source: "a", target: "a" },
    ])
    expect(ports.get("l1")!.source.dir).toEqual(RIGHT)
    expect(ports.get("l1")!.target.dir).toEqual(UP)
    expect(ports.get("l1")!.stub).toBe(SELF_LOOP_OFFSET)
    expect(ports.get("l2")!.stub).toBe(SELF_LOOP_OFFSET + LOOP_GAP)
    expect(ports.get("l1")!.source.point).not.toEqual(ports.get("l2")!.source.point)
  })

  it("un arco con un estremo senza rettangolo non ha porti", () => {
    expect(run([{ key: "e", source: "a", target: "manca" }]).has("e")).toBe(false)
  })

  it("località: spostare un nodo non tocca i porti degli archi lontani da lui e dai suoi vicini", () => {
    const edges: EdgeEnds[] = [
      { key: "at", source: "a", target: "t" },
      { key: "cd", source: "c", target: "d" },
    ]
    const before = run(edges)
    const moved = (k: string) => (k === "a" ? { ...rects.a!, x: 150 } : rectOf(k))
    const after = run(edges, rect, moved)
    expect(after.get("cd")).toEqual(before.get("cd"))
    expect(after.get("at")).not.toEqual(before.get("at"))
  })
})
```

- [ ] **Step 2: eseguilo e verifica che fallisca**

Run: `pnpm vitest run src/editor/ports.test.ts`
Expected: FAIL, `assignPorts` non esiste.

- [ ] **Step 3: implementa**

In `src/editor/edge-routing.ts` estendi `EdgeEnds` (importa `type EdgeAnchors` da `@/model/shared`):

```ts
/** I due estremi di un arco, per chiave, e dove si agganciano: quanto basta a sapere chi collega chi. */
export interface EdgeEnds {
  key: string
  source: string
  target: string
  /** Assente: due capi automatici (`anchorsOf`). */
  anchors?: EdgeAnchors
}
```

In `src/editor/ports.ts` (importa `anchorsOf` da `@/model/shared` e `type EdgeEnds` da `./edge-routing`):

```ts
/** Un capo d'arco in attesa del suo punto: il lato su cui cade, e da dove l'altro capo lo tira. */
interface PendingEnd {
  edge: string
  end: "source" | "target"
  rect: Rect
  outline: Outline
  side: Side
  /** Il punto già deciso di un capo fissato, `null` per un capo automatico. */
  fixed: Point | null
  /** La coordinata lungo il lato che ordina i capi: del punto per un fissato, del centro all'altro capo per un automatico. */
  along: number
}

/**
 * I porti di tutti gli archi dati (spec agganci §4): una sola passata che decide dove ogni capo tocca
 * il suo nodo, fra tutte le famiglie insieme — un link e un arco di flowchart sullo stesso lato si
 * separano fra loro.
 *
 * 1. Un capo fissato va al suo aggancio (`anchorPort`).
 * 2. Un capo automatico va sul lato rivolto verso l'altro estremo (`autoSide`); fra due capi
 *    automatici il bersaglio prende il lato opposto, esattamente come prima degli agganci.
 * 3. Per ogni coppia (nodo, lato) i capi fissati spezzano il lato in intervalli, e ogni capo
 *    automatico cade in quello che contiene il centro del nodo all'altro capo; dentro un intervallo i
 *    capi si ordinano per quella coordinata (a parità, per chiave) e si distribuiscono a passo uniforme.
 *
 * **L'ordine usa il centro dell'altro nodo, non il suo porto:** così il porto su un nodo dipende solo
 * dai rettangoli suoi e dei vicini diretti, e l'anteprima del drag sa quali archi riscrivere.
 *
 * Un arco con un estremo senza rettangolo non riceve porti: non si disegna, come prima.
 */
export function assignPorts(
  edges: readonly EdgeEnds[],
  rectOf: (key: string) => Rect | null,
  outlineOf: (key: string) => Outline,
): Map<string, EdgePorts> {
  const stubs = new Map<string, number>()
  const loops = new Map<string, number>()
  const groups = new Map<string, PendingEnd[]>()
  const push = (node: string, pending: PendingEnd) => {
    const k = `${node}\u0000${pending.side}`
    const list = groups.get(k)
    if (list) list.push(pending)
    else groups.set(k, [pending])
  }

  for (const e of edges) {
    const a = rectOf(e.source)
    const b = rectOf(e.target)
    if (!a || !b) continue
    const loop = e.source === e.target
    let stub = STUB
    if (loop) {
      const i = loops.get(e.source) ?? 0
      loops.set(e.source, i + 1)
      stub = SELF_LOOP_OFFSET + i * LOOP_GAP
    }
    stubs.set(e.key, stub)
    const anchors = anchorsOf(e)
    const autoSource: Side = loop ? "e" : autoSide(a, b)
    const autoTarget: Side = loop ? "n" : opposite(autoSource)
    const ends = [
      { end: "source" as const, node: e.source, rect: a, anchor: anchors.source, auto: autoSource, toward: center(b) },
      { end: "target" as const, node: e.target, rect: b, anchor: anchors.target, auto: autoTarget, toward: center(a) },
    ]
    for (const { end, node, rect, anchor, auto, toward } of ends) {
      const outline = outlineOf(node)
      if (anchor !== null) {
        const port = anchorPort(rect, outline, anchor, toward)
        const side = sideOf(port.dir)
        push(node, { edge: e.key, end, rect, outline, side, fixed: port.point, along: alongSide(side, port.point) })
      } else {
        push(node, { edge: e.key, end, rect, outline, side: auto, fixed: null, along: alongSide(auto, toward) })
      }
    }
  }

  const found = new Map<string, Partial<Record<"source" | "target", Port>>>()
  const place = (p: PendingEnd, point: Point) => {
    const ports = found.get(p.edge) ?? {}
    ports[p.end] = { point, dir: SIDE_DIR[p.side] }
    found.set(p.edge, ports)
  }

  for (const group of groups.values()) {
    const { rect, outline, side } = group[0]!
    const [lo, hi] = sideSpan(rect, side)
    const clampSide = (v: number) => Math.min(hi, Math.max(lo, v))
    const fixed = group.filter((p) => p.fixed !== null)
    for (const p of fixed) place(p, p.fixed!)
    const bounds = [lo, ...fixed.map((p) => clampSide(p.along)).sort((x, y) => x - y), hi]
    const buckets: PendingEnd[][] = bounds.slice(1).map(() => [])
    for (const p of group) {
      if (p.fixed !== null) continue
      const at = clampSide(p.along)
      // L'intervallo è quello dopo l'ultimo capo fissato che sta prima (o esattamente su) questo capo.
      const i = bounds.slice(1, -1).filter((b) => b <= at).length
      buckets[i]!.push(p)
    }
    buckets.forEach((bucket, i) => {
      const a = bounds[i]!
      const b = bounds[i + 1]!
      bucket
        .sort((x, y) => x.along - y.along || (x.edge < y.edge ? -1 : x.edge > y.edge ? 1 : 0))
        .forEach((p, j) => place(p, sidePoint(rect, outline, side, a + ((j + 1) * (b - a)) / (bucket.length + 1))))
    })
  }

  const out = new Map<string, EdgePorts>()
  for (const [key, ports] of found) {
    if (ports.source && ports.target) out.set(key, { source: ports.source, target: ports.target, stub: stubs.get(key)! })
  }
  return out
}
```

Nota per chi implementa: `group[0]` di un gruppo ha lo stesso `rect` e lo stesso `outline` di tutti gli altri, perché la chiave del gruppo è il nodo; per un cappio `rect` è lo stesso oggetto ai due capi.

- [ ] **Step 4: verifica**

Run: `pnpm vitest run src/editor && pnpm lint && pnpm exec tsc -b`
Expected: PASS. Se «lo screenshot» dà numeri diversi, controlla `sideSpan` (206–314 per `t`) prima di cambiare il test.

- [ ] **Step 5: commit**

```bash
git add src/editor/ports.ts src/editor/ports.test.ts src/editor/edge-routing.ts
git commit -m "feat(ports): il fascio per lato, fra tutte le famiglie e con i capi fissati

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `routePorts`, il percorso fra due porti

**Files:**
- Modify: `src/editor/edge-routing.ts`
- Test: `src/editor/edge-routing.test.ts`

**Interfaces:**
- Consumes: `EdgePorts` (task 2, tipo solo: `import type` per evitare un ciclo di valori).
- Produces: `routePorts(ports: EdgePorts): EdgeRoute`. `routeEdge` resta fino al task 5.

- [ ] **Step 1: scrivi il test che fallisce**

In `src/editor/edge-routing.test.ts` aggiungi (importa `routePorts`, `UP`, `DOWN`; `autoPorts`, `STUB`, `type EdgePorts`, `type Port` da `./ports`):

```ts
/** Invarianti di ogni percorso: segmenti ortogonali, primo lungo `source.dir`, ultimo lungo `−target.dir`. */
function checkRoute(ports: EdgePorts) {
  const { points } = routePorts(ports)
  expect(points[0]).toEqual(ports.source.point)
  expect(points[points.length - 1]).toEqual(ports.target.point)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    expect(a.x === b.x || a.y === b.y).toBe(true)
    expect(a.x === b.x && a.y === b.y).toBe(false)
  }
  const dirOf = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) })
  expect(dirOf(points[0]!, points[1]!)).toEqual(ports.source.dir)
  const last = dirOf(points[points.length - 2]!, points[points.length - 1]!)
  expect(last).toEqual({ x: -ports.target.dir.x || 0, y: -ports.target.dir.y || 0 })
  return points
}

const port = (x: number, y: number, dir: Port["dir"]): Port => ({ point: { x, y }, dir })
const ports = (source: Port, target: Port, stub = STUB): EdgePorts => ({ source, target, stub })

describe("routePorts", () => {
  it("porti che si guardano: la Z di prima", () => {
    const p = autoPorts({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 100, w: 100, h: 50 })
    expect(checkRoute(p)).toEqual([{ x: 100, y: 25 }, { x: 200, y: 25 }, { x: 200, y: 125 }, { x: 300, y: 125 }])
  })

  it("allineati: un segmento solo", () => {
    expect(checkRoute(ports(port(100, 25, RIGHT), port(300, 25, LEFT)))).toHaveLength(2)
  })

  it("perpendicolari e davanti l'uno all'altro: una L", () => {
    expect(checkRoute(ports(port(100, 25, RIGHT), port(300, 125, UP)))).toEqual([{ x: 100, y: 25 }, { x: 300, y: 25 }, { x: 300, y: 125 }])
  })

  it("stessa direzione: una U oltre il più esterno dei due", () => {
    expect(checkRoute(ports(port(100, 25, RIGHT), port(300, 125, RIGHT)))).toEqual([
      { x: 100, y: 25 }, { x: 316, y: 25 }, { x: 316, y: 125 }, { x: 300, y: 125 },
    ])
  })

  it("opposte ma voltate: una S fra i due tratti", () => {
    checkRoute(ports(port(300, 25, RIGHT), port(100, 125, LEFT)))
  })

  it("perpendicolari senza L possibile: esce, gira, rientra", () => {
    checkRoute(ports(port(100, 25, RIGHT), port(50, 0, UP)))
  })

  it("il cappio: esce a destra, gira sopra e rientra dall'alto, largo quanto il suo tratto", () => {
    const pts = checkRoute(ports(port(100, 12.5, RIGHT), port(75, 0, UP), 30))
    expect(pts).toEqual([{ x: 100, y: 12.5 }, { x: 130, y: 12.5 }, { x: 130, y: -30 }, { x: 75, y: -30 }, { x: 75, y: 0 }])
  })

  it("verticali che si guardano: la Z verticale", () => {
    checkRoute(ports(port(50, 50, DOWN), port(70, 300, UP)))
  })

  it("restituisce le direzioni dei porti per i marker", () => {
    const r = routePorts(ports(port(100, 25, RIGHT), port(300, 125, UP)))
    expect(r.sourceDir).toEqual(RIGHT)
    expect(r.targetDir).toEqual(UP)
  })
})
```

- [ ] **Step 2: eseguilo e verifica che fallisca**

Run: `pnpm vitest run src/editor/edge-routing.test.ts`
Expected: FAIL, `routePorts` non esiste.

- [ ] **Step 3: implementa**

In `src/editor/edge-routing.ts` (aggiungi `import type { EdgePorts } from "./ports"`), accanto a `routeEdge`:

```ts
/** Quanto `p` sta davanti a `from` lungo `d`: positivo davanti, negativo dietro. */
const ahead = (p: Point, from: Point, d: Dir): number => (p.x - from.x) * d.x + (p.y - from.y) * d.y

const step = (p: Point, d: Dir, by: number): Point => ({ x: p.x + d.x * by, y: p.y + d.y * by })

/** Toglie i punti doppi e quelli in mezzo a due segmenti allineati: il percorso resta lo stesso, con meno pieghe. */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    const prev = out[out.length - 2]
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) out.pop()
    out.push(p)
  }
  return out
}

/**
 * Il percorso ortogonale fra due porti (spec agganci §5). Il primo segmento esce lungo
 * `source.dir`, l'ultimo entra lungo l'opposto di `target.dir`.
 *
 * - **Si guardano** (direzioni opposte, il bersaglio davanti): la Z di prima degli agganci, o un
 *   segmento solo se sono allineati.
 * - **Perpendicolari**, con l'angolo davanti a entrambi: una L.
 * - **Altrimenti** ogni porto esce di `stub` e i due tratti si uniscono girando attorno: una U con
 *   la stessa direzione, una S con direzioni opposte voltate, un giro con quelle perpendicolari.
 */
export function routePorts({ source, target, stub }: EdgePorts): EdgeRoute {
  const a = source.point
  const b = target.point
  const d0 = source.dir
  const d3 = target.dir
  const h0 = d0.x !== 0
  const h3 = d3.x !== 0
  let points: Point[]
  if (h0 === h3) {
    const facing = d0.x === -d3.x && d0.y === -d3.y && ahead(b, a, d0) > 0
    const same = d0.x === d3.x && d0.y === d3.y
    if (facing) {
      if (h0) {
        const mid = (a.x + b.x) / 2
        points = [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b]
      } else {
        const mid = (a.y + b.y) / 2
        points = [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b]
      }
    } else if (same) {
      if (h0) {
        const x = d0.x > 0 ? Math.max(a.x, b.x) + stub : Math.min(a.x, b.x) - stub
        points = [a, { x, y: a.y }, { x, y: b.y }, b]
      } else {
        const y = d0.y > 0 ? Math.max(a.y, b.y) + stub : Math.min(a.y, b.y) - stub
        points = [a, { x: a.x, y }, { x: b.x, y }, b]
      }
    } else {
      const s0 = step(a, d0, stub)
      const s3 = step(b, d3, stub)
      if (h0) {
        const mid = (a.y + b.y) / 2
        points = [a, s0, { x: s0.x, y: mid }, { x: s3.x, y: mid }, s3, b]
      } else {
        const mid = (a.x + b.x) / 2
        points = [a, s0, { x: mid, y: s0.y }, { x: mid, y: s3.y }, s3, b]
      }
    }
  } else {
    const corner = h0 ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
    if (ahead(corner, a, d0) > 0 && ahead(corner, b, d3) > 0) {
      points = [a, corner, b]
    } else {
      const s0 = step(a, d0, stub)
      const s3 = step(b, d3, stub)
      points = h0 ? [a, s0, { x: s0.x, y: s3.y }, s3, b] : [a, s0, { x: s3.x, y: s0.y }, s3, b]
    }
  }
  return { points: simplify(points), sourceDir: d0, targetDir: d3 }
}
```

- [ ] **Step 4: verifica**

Run: `pnpm vitest run src/editor/edge-routing.test.ts && pnpm lint`
Expected: PASS. Il test del cappio fissa la forma del cappio di oggi (`selfLoop`) con attacchi dati.

- [ ] **Step 5: commit**

```bash
git add src/editor/edge-routing.ts src/editor/edge-routing.test.ts
git commit -m "feat(routing): il percorso ortogonale fra due porti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: il passaggio ai porti (editor, canvas, export, drag)

Il task più largo: cambia firma a `edgeGeometry` in tutte le famiglie e ai componenti che la chiamano. Va fatto in un colpo solo perché fra i due lati il progetto non compila. I passi sono per area: dopo ognuno, `pnpm exec tsc -b` indica il prossimo punto rotto.

**Files:**
- Modify: `src/editor/edge-routing.ts`, `src/editor/er/geometry.ts`, `src/editor/class/geometry.ts`, `src/editor/flow/geometry.ts`, `src/editor/shape/geometry.ts`, `src/editor/links/geometry.ts`, `src/editor/note/geometry.ts`
- Modify: `src/editor/kinds/{ops,er,class,flow,shape,note,canvas-ops}.ts`
- Modify: `src/editor/flow/commands.ts`, `src/editor/shape/commands.ts`, `src/editor/links/commands.ts`
- Modify: `src/ui/canvas/{layers,RelationshipEdge,ClassEdge,FlowEdge,ShapeArrow,LinkEdge,NoteAnchor,InlineEditor,interaction-runner}.tsx|ts`, `src/ui/canvas/kinds/{registry,er,class,flow,shape,note}.tsx|ts`, `src/ui/export/svg.tsx`
- Create: `src/ui/canvas/use-edge-ports.ts`
- Test: i `*.test.ts(x)` delle stesse aree, più `src/editor/kinds/canvas-ops.test.ts` e `src/editor/shape/commands.test.ts`

**Interfaces:**
- Consumes: task 1–4.
- Produces:
  - geometrie: `edgeGeometry(ports: EdgePorts, rel: Relationship)`, `classEdgeGeometry(ports, relation)`, `flowEdgeGeometry(ports, edge)`, `arrowGeometry(ports, arrow)`, `linkGeometry(ports)`, `anchorGeometry(ports)`; `flowOutline(shape: FlowShape): Outline`, `shapeOutline(kind: ShapeKind): Outline`.
  - `DiagramOps`: `edgeGeometry(key: string, ports: EdgePorts): EdgeGeometry | null`; `outlineOf?(key: string): Outline`; `setEdgeAnchors?(key: string, anchors: EdgeAnchors): Recipe`.
  - comandi: `setFlowEdgeAnchors(key, anchors): Recipe`, `setArrowAnchors(key, anchors): Recipe`, `setLinkAnchors(id, anchors): Recipe`; `connectAcross(doc, from, to, anchors = AUTO_ANCHORS)`.
  - `CanvasOps`: `allEdges(): EdgeEnds[]`; `outlineOf(key): Outline`; `portsOf(edges, rectOf): Map<string, EdgePorts>`; `edgeGeometry(key, ports): EdgeGeometry | null`; `hasAnchors(key): boolean`; `anchorPoint(node, anchor): Point | null`; `anchorPoints(node): { anchor: Anchor; point: Point }[]`; `addEdge(source, target, anchors?: EdgeAnchors)`; `setEdgeAnchor(edgeKey, end: "source" | "target", anchor: Anchor | null): Recipe | null`.
  - `canvasPorts(doc: DevDocument): ReadonlyMap<string, EdgePorts>` in `canvas-ops.ts`.
  - `EdgeViewProps` = `{ edgeKey: string; relation: unknown; ports: EdgePorts; selected: boolean }`.
  - `useEdgePorts(qualifiedKey: string): EdgePorts | null`.

- [ ] **Step 1: i test dei comandi che falliscono**

In `src/editor/kinds/canvas-ops.test.ts` aggiungi agli import `renameEntity` (da `../commands/er`, accanto ad `addEntity`), `linkId` (da `../families`), `autoPorts` (da `../ports`), `anchorsOf` (da `@/model/shared`) e `canvasPorts` (da `./canvas-ops`), poi:

```ts
describe("gli agganci (spec agganci §3)", () => {
  it("setEdgeAnchor scrive un capo, in una voce di annulla, e l'annulla torna automatico", () => {
    const { rel } = erConDueEntita()
    const recipe = canvasOps(state().doc).setEdgeAnchor(`er/${rel}`, "target", "n1")
    expect(recipe).not.toBeNull()
    state().dispatch(recipe!)
    expect(anchorsOf(erDiagram(state().doc).model.relationships[rel]!)).toEqual({ source: null, target: "n1" })
    state().undo()
    expect(erDiagram(state().doc).model.relationships[rel]!.anchors).toBeUndefined()
  })

  it("setEdgeAnchor con lo stesso aggancio o su un arco che non c'è non produce niente", () => {
    const { rel } = erConDueEntita()
    expect(canvasOps(state().doc).setEdgeAnchor(`er/${rel}`, "source", null)).toBeNull()
    expect(canvasOps(state().doc).setEdgeAnchor("er/manca", "source", "n1")).toBeNull()
  })

  it("addEdge con agganci li scrive sull'arco nuovo, nella stessa voce", () => {
    const { a, b } = erConDueEntita()
    const result = canvasOps(state().doc).addEdge(`er/${a}`, `er/${b}`, { source: "e2", target: "w2" })
    if (result?.type !== "created") throw new Error("atteso un arco nuovo")
    state().dispatch(result.recipe)
    expect(erDiagram(state().doc).model.relationships[splitKey(result.key).key]!.anchors).toEqual({ source: "e2", target: "w2" })
    state().undo()
    expect(erDiagram(state().doc).model.relationships[splitKey(result.key).key]).toBeUndefined()
  })

  it("la rinomina di un'entità lascia gli agganci sull'arco", () => {
    const { a, rel } = erConDueEntita()
    state().dispatch(canvasOps(state().doc).setEdgeAnchor(`er/${rel}`, "source", "s1")!)
    state().dispatch(renameEntity(a, "rinominata")!)
    const moved = Object.values(erDiagram(state().doc).model.relationships)
    expect(moved).toHaveLength(1)
    expect(moved[0]!.anchors).toEqual({ source: "s1", target: null })
  })

  it("canvasPorts riusa l'oggetto dei porti di un arco che non si è mosso", () => {
    const { rel } = erConDueEntita()
    const before = canvasPorts(state().doc).get(`er/${rel}`)
    expect(before).toBeDefined()
    const c = addEntity(erDiagram(state().doc).model.entities, { x: 2000, y: 2000 })
    state().dispatch(c.recipe)
    expect(canvasPorts(state().doc).get(`er/${rel}`)).toBe(before)
  })

  it("le linee delle note hanno i porti di autoPorts, fuori dal fascio", () => {
    const { a } = erConDueEntita()
    const note = canvasOps(state().doc).addNode({ x: 0, y: 300 }, "note")
    state().dispatch(note.recipe)
    const anchored = canvasOps(state().doc).addEdge(note.key, `er/${a}`)
    if (anchored?.type !== "created") throw new Error("attesa una nota ancorata")
    state().dispatch(anchored.recipe)
    const ops = canvasOps(state().doc)
    expect(canvasPorts(state().doc).get(note.key)).toEqual(autoPorts(ops.rectOf(note.key)!, ops.rectOf(`er/${a}`)!))
  })

  /** Un'entità e un nodo di flusso, con prefisso: fra loro nasce un `accesses` nel verso flusso → entità. */
  function entitaENodo() {
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 0 }, "flow", "process")
    state().dispatch(node.recipe)
    return { entity: entity.key, node: node.key }
  }

  it("un collegamento creato al contrario scambia anche gli agganci", () => {
    const { entity, node } = entitaENodo()
    const r = canvasOps(state().doc).addEdge(entity, node, { source: "n1", target: "s1" })
    if (r?.type !== "created") throw new Error("atteso un collegamento nuovo")
    state().dispatch(r.recipe)
    const link = state().doc.diagram.links[linkId(r.key)!]!
    expect(link.source).toBe(node)
    expect(link.anchors).toEqual({ source: "s1", target: "n1" })
  })

  it("Collega verso un collegamento già presente lo seleziona e non gli cambia gli agganci", () => {
    const { entity, node } = entitaENodo()
    const first = canvasOps(state().doc).addEdge(node, entity)
    if (first?.type !== "created") throw new Error("atteso un collegamento nuovo")
    state().dispatch(first.recipe)
    expect(canvasOps(state().doc).addEdge(node, entity, { source: "n1", target: "s1" })).toEqual({ type: "existing", key: first.key })
    expect(state().doc.diagram.links[linkId(first.key)!]!.anchors).toBeUndefined()
  })
})
```

In `src/editor/shape/commands.test.ts` (Review Focus 1):

```ts
it("invertArrow scambia anche gli agganci, che seguono i capi", () => {
  tre()
  state().dispatch((draft) => {
    shapeDiagram(draft).model.arrows["ab"]!.anchors = { source: "e2", target: null }
  })
  state().dispatch(invertArrow("ab"))
  expect(part().model.arrows["ab"]!.anchors).toEqual({ source: null, target: "e2" })
})
```

- [ ] **Step 2: eseguili e verifica che falliscano**

Run: `pnpm vitest run src/editor/kinds/canvas-ops.test.ts src/editor/shape/commands.test.ts`
Expected: FAIL (`setEdgeAnchor`, `canvasPorts` non esistono; `invertArrow` non scambia gli agganci).

- [ ] **Step 3: le geometrie di famiglia ricevono i porti**

In ognuna, `routeEdge(source, target, loop, offset)` diventa `routePorts(ports)` e la firma perde rettangoli e scarto. Il corpo resta identico.

`src/editor/edge-routing.ts`:

```ts
/** Tutta la geometria di un edge dai suoi porti e la relazione. Usata sia da React sia dagli aggiornamenti imperativi. */
export function edgeGeometry(ports: EdgePorts, rel: Relationship): EdgeGeometry {
  const route = routePorts(ports)
  // … resto invariato
}
```

Poi **cancella** da `edge-routing.ts`: `routeEdge`, `selfLoop`, `slide`, `clamp`, `center`, `pairKey`, `edgeOffsets`, `BUNDLE_GAP`, `SELF_LOOP_OFFSET`, `EDGE_INSET` (le ultime due vivono in `ports.ts`) e il commento `ponytail:` sopra `routeEdge`, che va spostato sopra `routePorts` così com'è. `memoOnIdentity` resta. Aggiorna il docblock di `EdgeGeometry.label` se nomina l'`offset`.

`src/editor/class/geometry.ts`: `classEdgeGeometry(ports: EdgePorts, relation: ClassRelation)`, `routePorts(ports)`; togli `classEdgeOffsets` e dal docblock la frase sull'`offset`.

`src/editor/flow/geometry.ts`: `flowEdgeGeometry(ports: EdgePorts, edge: FlowEdge)`; togli `flowEdgeOffsets`. Il docblock sull'etichetta del primo segmento cambia così: «il primo segmento parte dall'attacco che il fascio per lato (`assignPorts`) ha già separato». Aggiungi:

```ts
/** Il contorno di una forma di flusso per gli agganci (spec agganci §4): lo stesso disegno di `shapePath`. */
export function flowOutline(shape: FlowShape): Outline {
  switch (shape) {
    case "decision":
      return "diamond"
    case "terminal":
      return "stadium"
    case "io":
      return { skew: IO_SKEW }
    case "process":
    case "subprocess":
      return "rect"
  }
}
```

`src/editor/shape/geometry.ts`: `arrowGeometry(ports: EdgePorts, arrow: Pick<Arrow, "head">)`; togli `arrowOffsets`. Aggiungi:

```ts
/** Il contorno di una forma per gli agganci: l'ellisse è un'ellisse, rettangolo e testo un rettangolo. */
export function shapeOutline(kind: ShapeKind): Outline {
  return kind === "ellipse" ? "ellipse" : "rect"
}
```

`src/editor/er/geometry.ts`: togli `erEdgeOffsets` (e gli import che restano orfani).

`src/editor/links/geometry.ts`: `linkGeometry(ports: EdgePorts)`; il docblock perde «con scarto 0 … non serve un fascio» e dice che il link partecipa al fascio per lato con gli archi di famiglia.

`src/editor/note/geometry.ts`: `anchorGeometry(ports: EdgePorts)`; il docblock dice che i porti arrivano da `autoPorts`, fuori dal fascio.

- [ ] **Step 4: i comandi degli agganci**

`src/editor/flow/commands.ts`:

```ts
/** Gli agganci di un arco (spec agganci §3): la coppia intera, un passo di annulla. */
export function setFlowEdgeAnchors(key: string, anchors: EdgeAnchors): Recipe {
  return (draft) => {
    const edge = flowDiagram(draft).model.edges[key]
    if (edge) writeAnchors(edge, anchors)
  }
}
```

`src/editor/shape/commands.ts`: `setArrowAnchors(key, anchors)` sulla stessa forma, su `shapeDiagram(draft).model.arrows[key]`. E `invertArrow`:

```ts
/** Scambia i capi, e con loro gli agganci: la punta «alla fine» passa all'altra forma senza cancellare e rifare la freccia (spec 3b §7). */
export function invertArrow(key: string): Recipe {
  return (draft) => {
    const arrow = shapeDiagram(draft).model.arrows[key]
    if (!arrow) return
    ;[arrow.source, arrow.target] = [arrow.target, arrow.source]
    const { source, target } = anchorsOf(arrow)
    writeAnchors(arrow, { source: target, target: source })
  }
}
```

`src/editor/links/commands.ts`:

```ts
/** Gli agganci di un collegamento: la coppia intera. Su un id che non c'è non scrive niente. */
export function setLinkAnchors(id: string, anchors: EdgeAnchors): Recipe {
  return (draft) => {
    const link = draft.diagram.links[id]
    if (link) writeAnchors(link, anchors)
  }
}
```

e `connectAcross(doc, from, to, anchors: EdgeAnchors = AUTO_ANCHORS)`: dopo `const [source, target] = …` aggiungi `const ends = rule.reversed ? { source: anchors.target, target: anchors.source } : anchors`, e nella recipe `const link = newLink(rule.kind, source, target); writeAnchors(link, ends); draft.diagram.links[id] = link`. Il ramo `existing` non cambia: gli agganci del gesto non toccano un collegamento che c'è già. Una riga nel docblock lo dice.

- [ ] **Step 5: `DiagramOps` e le famiglie**

`src/editor/kinds/ops.ts`, nel contratto:

```ts
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  /** La geometria di un arco dai suoi porti (`canvasPorts`, o l'anteprima del drag). `null` se l'arco non c'è. */
  edgeGeometry(key: string, ports: EdgePorts): EdgeGeometry | null
  /** Il contorno del nodo per gli agganci (spec agganci §4). Assente: `"rect"`. */
  outlineOf?(key: string): Outline
  /** Scrive gli agganci di un arco della famiglia. Assente: la famiglia non ha archi agganciabili (le note). */
  setEdgeAnchors?(key: string, anchors: EdgeAnchors): Recipe
```

In ogni `kinds/*.ts`:
- `edgesTouching` aggiunge `anchors` al risultato: ER `anchors: rel.anchors`, class `anchors: rel.anchors`, flow `anchors: edge.anchors`, shape `anchors: arrow.anchors`.
- `edgeGeometry: (key, ports) => { const rel = model.relationships[key]; return rel ? edgeGeometry(ports, rel) : null }` e così per le altre; niente più `…Offsets(...)`.
- ER: `setEdgeAnchors: (key, anchors) => updateRelationship(key, (r) => writeAnchors(r, anchors))`.
- class: `setEdgeAnchors: (key, anchors) => updateRelation(key, (r) => writeAnchors(r, anchors))`.
- flow: `setEdgeAnchors: setFlowEdgeAnchors`, `outlineOf: (key) => { const node = diagram().model.nodes[key]; return node ? flowOutline(node.shape) : "rect" }`.
- shape: `setEdgeAnchors: setArrowAnchors`, `outlineOf: (key) => { const s = diagram().model.shapes[key]; return s ? shapeOutline(s.kind) : "rect" }`.
- note: `edgeGeometry: (key, ports) => (diagram().model.notes[key]?.anchor ? anchorGeometry(ports) : null)`.

Aggiorna i docblock di `kinds/flow.ts` ed `kinds/er.ts` che parlano dello «scarto di fascio letto dal modello intero»: ora i porti arrivano dal chiamante.

- [ ] **Step 6: `CanvasOps` e `canvasPorts`**

In `src/editor/kinds/canvas-ops.ts`, nel contratto `CanvasOps` sostituisci `edgeGeometry(key, a, b)` e `addEdge(source, target)`, e aggiungi:

```ts
  /** Tutti gli archi del canvas, con prefisso: famiglie, collegamenti, linee delle note. */
  allEdges(): EdgeEnds[]
  /** Il contorno di un nodo per gli agganci. */
  outlineOf(key: string): Outline
  /**
   * I porti degli archi dati con i rettangoli di `rectOf` (spec agganci §4): il fascio per lato su
   * famiglie e collegamenti insieme, `autoPorts` per le linee delle note, che restano fuori.
   * `canvasPorts` lo chiama a riposo, l'anteprima del drag con i rettangoli spostati.
   */
  portsOf(edges: readonly EdgeEnds[], rectOf: (key: string) => Rect | null): Map<string, EdgePorts>
  edgeGeometry(key: string, ports: EdgePorts): EdgeGeometry | null
  /** Vero per un nodo che mostra gli agganci: non un frame, non una nota, non un collegamento (spec §6). */
  hasAnchors(key: string): boolean
  /** Il punto di un aggancio del nodo, per l'anteprima di Collega. `null` se il nodo non c'è. */
  anchorPoint(node: string, anchor: Anchor): Point | null
  /** Gli agganci che il nodo offre, con il loro punto: quelli che il canvas disegna. */
  anchorPoints(node: string): { anchor: Anchor; point: Point }[]
  /** … docblock di prima, più: `anchors` sono gli agganci del gesto, scritti nella stessa recipe. */
  addEdge(source: string, target: string, anchors?: EdgeAnchors): ConnectResult | null
  /** Sposta l'aggancio di un capo: `null` torna automatico. `null` se l'arco non c'è, è una linea di nota, o l'aggancio è già quello. */
  setEdgeAnchor(edgeKey: string, end: "source" | "target", anchor: Anchor | null): Recipe | null
```

Implementazione, dentro `canvasOps(doc)`:

```ts
  /** Una linea di nota: la chiave del suo arco è quella della nota (`anchorsTouching`). */
  const isNoteLine = (qualified: string): boolean => linkId(qualified) === null && inFamily(qualified, "note")

  const outlineOf = (qualified: string): Outline => {
    const { family, key } = splitKey(qualified)
    return ops(family).outlineOf?.(key) ?? "rect"
  }

  const rectOf = (qualified: string, at?: Point): Rect | null => {
    const { family, key } = splitKey(qualified)
    return ops(family).rectOf(key, at)
  }

  const edgesTouching = (keys: ReadonlySet<string>): EdgeEnds[] => [
    ...[...byFamily(keys)].flatMap(([f, ks]) =>
      ops(f)
        .edgesTouching(new Set(ks))
        .map((e) => ({ ...e, key: qualify(f, e.key), source: qualify(f, e.source), target: qualify(f, e.target) })),
    ),
    ...linksTouching(doc.diagram.links, keys).map(([id, l]) => ({ key: linkKey(id), source: l.source, target: l.target, anchors: l.anchors })),
    ...anchorsTouching(doc, keys),
  ]

  const nodeKeys = () => FAMILIES.flatMap((f) => ops(f).nodeKeys().map((k) => qualify(f, k)))
  const frameKeys = () => FAMILIES.flatMap((f) => (ops(f).frameKeys?.() ?? []).map((k) => qualify(f, k)))
  const allEdges = () => edgesTouching(new Set([...nodeKeys(), ...frameKeys()]))

  /** Scrive la coppia di agganci su un arco o un collegamento; `null` per le linee delle note. */
  const writeEdgeAnchors = (qualified: string, anchors: EdgeAnchors): Recipe | null => {
    const id = linkId(qualified)
    if (id !== null) return setLinkAnchors(id, anchors)
    const { family, key } = splitKey(qualified)
    return ops(family).setEdgeAnchors?.(key, anchors) ?? null
  }

  const withAnchors = (key: string, recipe: Recipe, anchors: EdgeAnchors): Recipe =>
    anchors.source === null && anchors.target === null ? recipe : (combine([recipe, writeEdgeAnchors(key, anchors)]) ?? recipe)
```

e nell'oggetto restituito usa `nodeKeys`, `frameKeys`, `rectOf`, `edgesTouching` (al posto delle versioni inline di prima), più:

```ts
    allEdges,
    outlineOf,

    portsOf: (edges, rectAt) => {
      const out = assignPorts(edges.filter((e) => !isNoteLine(e.key)), rectAt, outlineOf)
      for (const e of edges) {
        if (!isNoteLine(e.key)) continue
        const a = rectAt(e.source)
        const b = rectAt(e.target)
        if (a && b) out.set(e.key, autoPorts(a, b))
      }
      return out
    },

    edgeGeometry: (qualified, ports) => {
      const id = linkId(qualified)
      if (id !== null) return doc.diagram.links[id] ? linkGeometry(ports) : null
      const { family, key } = splitKey(qualified)
      return ops(family).edgeGeometry(key, ports)
    },

    hasAnchors: (qualified) => linkId(qualified) === null && !inFamily(qualified, "note") && !isFrame(qualified) && rectOf(qualified) !== null,

    anchorPoint: (node, anchor) => {
      const r = rectOf(node)
      return r ? anchorPort(r, outlineOf(node), anchor).point : null
    },

    anchorPoints: (node) => {
      const r = rectOf(node)
      if (!r) return []
      const outline = outlineOf(node)
      return offeredAnchors(outline).map((anchor) => ({ anchor, point: anchorPort(r, outline, anchor).point }))
    },

    addEdge: (source, target, anchors = AUTO_ANCHORS) => {
      // … le due guardie di prima (nota, frame) invariate; l'àncora di una nota ignora gli agganci.
      const a = splitKey(source)
      const b = splitKey(target)
      if (a.family !== b.family) return connectAcross(doc, source, target, anchors)
      const created = ops(a.family).addEdge(a.key, b.key)
      if (!created) return null
      const key = qualify(a.family, created.key)
      return { type: "created" as const, key, recipe: withAnchors(key, created.recipe, anchors) }
    },

    setEdgeAnchor: (edgeKey, end, anchor) => {
      if (isNoteLine(edgeKey)) return null
      const edge = allEdges().find((e) => e.key === edgeKey)
      if (!edge) return null
      const current = anchorsOf(edge)
      if (current[end] === anchor) return null
      return writeEdgeAnchors(edgeKey, { ...current, [end]: anchor })
    },
```

Nota: `withAnchors` su un arco appena creato funziona perché la recipe della famiglia corre prima sullo stesso draft, e `setEdgeAnchors` lo trova già lì.

Sotto `canvasOps`, la fonte unica dei porti a riposo:

```ts
/**
 * I porti di tutti gli archi del canvas a riposo (spec agganci §7): la sola fonte per il canvas,
 * l'export e l'editor d'etichetta. Memo sul documento, che Immer sostituisce a ogni cambiamento.
 *
 * **Riusa l'oggetto dei porti di un arco quando i numeri non cambiano**: ogni arco sul canvas si
 * sottoscrive ai propri porti con un `useStore` per identità, e senza questo ogni battitura in un
 * pannello ridisegnerebbe tutti gli archi.
 */
export const canvasPorts: (doc: DevDocument) => ReadonlyMap<string, EdgePorts> = (() => {
  let previous = new Map<string, EdgePorts>()
  return memoOnIdentity((doc: DevDocument) => {
    const ops = canvasOps(doc)
    const next = ops.portsOf(ops.allEdges(), (key) => ops.rectOf(key))
    for (const [key, ports] of next) {
      const old = previous.get(key)
      if (old && samePorts(old, ports)) next.set(key, old)
    }
    previous = next
    return next
  })
})()
```

Import nuovi in `canvas-ops.ts`: `memoOnIdentity` da `../edge-routing`; `anchorPort`, `assignPorts`, `autoPorts`, `offeredAnchors`, `samePorts`, `type EdgePorts`, `type Outline` da `../ports`; `inFamily` da `../families` (o da `@/model/family`, dove lo importa già il resto del file); `setLinkAnchors` da `../links/commands`; `AUTO_ANCHORS`, `anchorsOf`, `type Anchor`, `type EdgeAnchors` da `@/model/shared`.

- [ ] **Step 7: i componenti del canvas leggono i porti**

`src/ui/canvas/use-edge-ports.ts` (nuovo):

```ts
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { canvasPorts } from "@/editor/kinds/canvas-ops"
import type { EdgePorts } from "@/editor/ports"

/**
 * I porti di un arco di qualunque famiglia, dalla chiave con prefisso, dalla fonte unica
 * (`canvasPorts`). Per identità: `canvasPorts` riusa l'oggetto quando i numeri non cambiano, quindi
 * l'arco si ridisegna solo quando si muove davvero. `null`: l'arco non si disegna (un estremo manca).
 */
export function useEdgePorts(key: string): EdgePorts | null {
  return useStore(documentStore, (s) => canvasPorts(s.doc).get(key) ?? null)
}
```

`src/ui/canvas/kinds/registry.ts`, `EdgeViewProps`:

```ts
/** Props di `DiagramView.EdgeView`: stessa ragione di `NodeViewProps` per `relation`. */
export interface EdgeViewProps {
  edgeKey: string
  relation: unknown
  /** Dove l'arco tocca i suoi nodi (`canvasPorts`): prop e non calcolo interno, perché dipende da tutti gli archi. */
  ports: EdgePorts
  selected: boolean
}
```

Ogni vista pura riceve `ports` al posto di `source`, `target`, `offset` e chiama la sua geometria con `ports`. Ogni componente sottoscritto legge `useEdgePorts(chiave con prefisso)` al posto delle due `useNodeRect`/`useEntityRect`, e non riceve più `offset`. Per esempio `RelationshipEdge.tsx`:

```tsx
interface Props {
  edgeKey: string
  relationship: Relationship
  ports: EdgePorts
  selected: boolean
}

export const RelationshipEdgeView = memo(function RelationshipEdgeView({ edgeKey, relationship, ports, selected }: Props) {
  const id = qualify("er", edgeKey)
  const geo = edgeGeometry(ports, relationship)
  // … markup invariato
})

export function RelationshipEdge({ edgeKey }: { edgeKey: string }) {
  const relationship = useStore(documentStore, (s) => erDiagram(s.doc).model.relationships[edgeKey])
  const ports = useEdgePorts(qualify("er", edgeKey))
  const selected = useStore(sessionStore, (s) => s.selection.has(selId("edge", qualify("er", edgeKey))))
  if (!relationship || !ports) return null
  return <RelationshipEdgeView edgeKey={edgeKey} relationship={relationship} ports={ports} selected={selected} />
}
```

`useEntityRect` in quel file sparisce. Stessa trasformazione in:
- `ClassEdge.tsx` (`qualify("class", edgeKey)`),
- `FlowEdge.tsx` (`qualify("flow", edgeKey)`),
- `ShapeArrow.tsx` (`qualify("shape", arrowKey)`),
- `LinkEdge.tsx` (`linkKey(id)`; `LinkEdgeView` riceve `ports`),
- `NoteAnchor.tsx` (`qualify("note", noteKey)`; `AnchorEdgeView` riceve `ports`).

Se `useNodeRect` resta senza chiamanti, cancella `use-node-rect.ts` (verifica con `grep -rn useNodeRect src`).

I layer non calcolano più scarti e si sottoscrivono alle sole chiavi. Per esempio `EdgesLayer` in `layers.tsx`:

```tsx
/** Le relazioni: il layer itera le chiavi, ogni arco legge i propri porti da `canvasPorts`. */
export function EdgesLayer() {
  const keys = useStore(documentStore, useShallow((s) => Object.keys(erDiagram(s.doc).model.relationships)))
  return (
    <g data-layer="edges">
      {keys.map((key) => <RelationshipEdge key={key} edgeKey={key} />)}
    </g>
  )
}
```

Stessa cosa per `EdgesLayer` in `kinds/class.tsx`, `kinds/flow.tsx`, `kinds/shape.tsx`. Gli adattatori `EdgeView` di `kinds/{er,class,flow,shape,note}.tsx` passano `ports={ports}` invece di `source`/`target`/`offset`.

- [ ] **Step 8: export, editor d'etichetta, anteprima del drag**

`src/ui/export/svg.tsx`: togli `edgeOffsets` e il campo `offsets` delle sezioni. Prima di `body`, `const ports = canvasPorts(doc)`. Nel layer `edges`:

```tsx
          s.edges.map((edge) => {
            const relation = s.edgeModels[edge.key]
            const p = ports.get(qualify(s.family, edge.key))
            // I due estremi devono essere fra i nodi esportati (un testo vuoto non lo è, spec 3b §8), e
            // `edgeGeometry` verifica che l'arco esista davvero nel modello.
            if (!s.rects.has(edge.source) || !s.rects.has(edge.target) || !relation || !p || !s.ops.edgeGeometry(edge.key, p)) return null
            return <s.view.EdgeView key={qualify(s.family, edge.key)} edgeKey={edge.key} relation={relation} ports={p} selected={false} />
          }),
```

Nel layer `anchors`: `const p = ports.get(qualify("note", key)); if (!p) return null; return <AnchorEdgeView … ports={p} … />`. Nel layer `links`: `const p = ports.get(linkKey(id)); if (!p) return null; return <LinkEdgeView … ports={p} … />` (importa `linkKey` da `@/editor/families`).

`src/ui/canvas/InlineEditor.tsx`, `FlowEdgeLabelEditor`:

```tsx
  const point = useStore(
    documentStore,
    useShallow((s) => {
      if (!edge) return null
      const ports = canvasPorts(s.doc).get(qualify("flow", editing.key))
      return ports ? (familyOps(s.doc, "flow").edgeGeometry(editing.key, ports)?.label ?? null) : null
    }),
  )
```

Aggiorna il docblock: la posizione viene da `canvasPorts`, la stessa fonte di `FlowEdge.tsx`.

`src/ui/canvas/interaction-runner.ts`:

```ts
interface DragTargets {
  nodes: { key: string; x: number; y: number }[]
  /** Gli archi da riscrivere: quelli dei nodi trascinati e dei loro vicini diretti (spec agganci §8). */
  edges: EdgeEnds[]
  /** Tutti gli archi del canvas: i porti si calcolano su tutti, o i fasci sui nodi al bordo sarebbero incompleti. */
  all: EdgeEnds[]
  /** … docblock di prima: ora i rettangoli di tutti i nodi agli estremi di un arco, misurati alla presa. */
  rects: Map<string, Rect>
}

function collectDragTargets(keys: readonly string[]): DragTargets {
  const ops = canvasOps(documentStore.getState().doc)
  const all = ops.allEdges()
  const moved = new Set(keys)
  const near = new Set(keys)
  for (const e of all) {
    if (moved.has(e.source)) near.add(e.target)
    if (moved.has(e.target)) near.add(e.source)
  }
  const edges = all.filter((e) => near.has(e.source) || near.has(e.target))
  const rects = new Map<string, Rect>()
  const measure = (key: string) => {
    if (rects.has(key)) return
    const r = ops.rectOf(key)
    if (r) rects.set(key, r)
  }
  for (const key of keys) measure(key)
  for (const edge of all) {
    measure(edge.source)
    measure(edge.target)
  }
  return {
    nodes: keys.flatMap((key) => {
      const r = rects.get(key)
      return r ? [{ key, x: r.x, y: r.y }] : []
    }),
    edges,
    all,
    rects,
  }
}
```

In `previewDrag`, dopo `rectAt`: `const ports = ops.portsOf(targets.all, rectAt)`; nel ciclo sugli archi `const p = ports.get(edge.key); if (!p) continue; const geo = ops.edgeGeometry(edge.key, p)`. Il filtro sull'inquadratura resta. In `resetDragTargets`: `const ports = canvasPorts(documentStore.getState().doc)` e lo stesso ciclo con `ports.get(edge.key)`.

Aggiorna il docblock di `DragTargets.rects` (non più solo «trascinato o all'estremo di un arco toccato»).

- [ ] **Step 9: i test esistenti**

`pnpm exec tsc -b` elenca i test rotti dalla firma nuova. Regola meccanica, perché `autoPorts` è esattamente la geometria di prima con scarto 0:

- `X(rectA, rectB, arco)` e `X(rectA, rectB, arco, 0)` → `X(autoPorts(rectA, rectB), arco)`; le attese non cambiano.
- `ops.edgeGeometry(key, a, b)` → `ops.edgeGeometry(key, autoPorts(a, b))`.
- viste pure con `source`/`target`/`offset` nei test di render → `ports={autoPorts(source, target)}`.
- **cancella** i test che fissano gli scarti di fascio o il cappio con `routeEdge(a, a, true)` (le suite `edgeOffsets`, «routeEdge con lo scarto del fascio», «l'auto-relazione la dichiara il chiamante» in `edge-routing.test.ts`, e i test `…Offsets` delle famiglie): li coprono `assignPorts` (task 3) e `routePorts` (task 4). Le suite `routeEdge` con rettangoli diventano `routePorts(autoPorts(a, b))` con le stesse attese.
- `interaction-runner.test.ts`: l'insieme degli archi riscritti ora comprende quelli dei vicini. Se un'attesa sui tocchi cambia, verifica che l'arco in più tocchi un vicino di un nodo trascinato e aggiorna l'attesa con un commento che lo dice; il criterio dell'inquadratura resta com'è.

- [ ] **Step 10: verifica**

Run: `pnpm exec tsc -b && pnpm test && pnpm lint`
Expected: tutto verde. Poi `grep -rn "edgeOffsets\|Offsets(\|BUNDLE_GAP\|routeEdge(" src` non trova niente.

- [ ] **Step 11: verifica a occhio**

Avvia il dev server (`preview_start`, o `.claude/launch.json` se c'è) e ricrea lo scenario dello screenshot: tre nodi di flusso, due archi da nodi diversi verso lo stesso lato del terzo. I due archi devono arrivare in due punti diversi. Trascina un nodo e controlla che l'anteprima segua senza salti al rilascio.

- [ ] **Step 12: commit**

```bash
git add -A src
git commit -m "feat(archi): i porti al posto degli scarti di fascio, dal canvas all'export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: la macchina a stati degli agganci

**Files:**
- Modify: `src/editor/interaction.ts`
- Test: `src/editor/interaction.test.ts`

**Interfaces:**
- Consumes: `Anchor`, `EdgeAnchors` (task 1).
- Produces:
  - `type EdgeEnd = "source" | "target"`
  - `Hit` in più: `{ kind: "anchor"; node: string; anchor: Anchor }`, `{ kind: "edge-end"; edge: string; end: EdgeEnd; node: string }`
  - `Mode`: `connect` diventa `{ type: "connect"; source: string; sourceAnchor: Anchor | null }`; in più `{ type: "reanchor"; edge: string; end: EdgeEnd; node: string }`
  - `Effect`: `preview-connect` diventa `{ type: "preview-connect"; source: string; anchor: Anchor | null; to: Point | null }`; `commit-connect` diventa `{ type: "commit-connect"; source: string; target: string; anchors: EdgeAnchors }`; in più `{ type: "show-anchors"; node: string | null }`, `{ type: "preview-reanchor"; edge: string; end: EdgeEnd; to: Point | null }`, `{ type: "commit-anchor"; edge: string; end: EdgeEnd; anchor: Anchor | null }`

- [ ] **Step 1: scrivi il test che fallisce**

In `src/editor/interaction.test.ts`, con gli helper già in testa al file (`info`, `ctx`, `down`, `move`, `up`), aggiungi `import type { Anchor } from "@/model/shared"` e:

```ts
describe("gli agganci (spec agganci §6)", () => {
  const anchorHit = (node: string, anchor: Anchor): Hit => ({ kind: "anchor", node, anchor })
  const endHit: Hit = { kind: "edge-end", edge: "flow/e", end: "target", node: "flow/b" }
  const at = { x: 10, y: 10 }

  it("down su un aggancio apre Collega da quel punto, anche con Seleziona", () => {
    const step = reduce(IDLE, down({ hit: anchorHit("flow/a", "e2"), world: at }), ctx({ tool: "select" }))
    expect(step.mode).toEqual({ type: "connect", source: "flow/a", sourceAnchor: "e2" })
    expect(step.effects).toContainEqual({ type: "preview-connect", source: "flow/a", anchor: "e2", to: at })
  })

  it("con lo strumento nodo un aggancio non apre niente", () => {
    const step = reduce(IDLE, down({ hit: anchorHit("flow/a", "e2") }), ctx({ tool: "node", family: "flow" }))
    expect(step.mode.type).not.toBe("connect")
  })

  it("Collega dal corpo del nodo parte con il capo automatico", () => {
    const step = reduce(IDLE, down({ hit: { kind: "node", key: "flow/a" } }), ctx({ tool: "edge" }))
    expect(step.mode).toEqual({ type: "connect", source: "flow/a", sourceAnchor: null })
  })

  it("durante Collega il nodo sotto il puntatore mostra i suoi agganci", () => {
    const mode: Mode = { type: "connect", source: "flow/a", sourceAnchor: null }
    expect(reduce(mode, move({ hit: { kind: "node", key: "flow/b" } }), ctx({ tool: "edge" })).effects).toContainEqual({ type: "show-anchors", node: "flow/b" })
    expect(reduce(mode, move({ hit: anchorHit("flow/b", "n1") }), ctx({ tool: "edge" })).effects).toContainEqual({ type: "show-anchors", node: "flow/b" })
    expect(reduce(mode, move({ hit: { kind: "canvas" } }), ctx({ tool: "edge" })).effects).toContainEqual({ type: "show-anchors", node: null })
  })

  it("up su un aggancio crea l'arco con i due agganci, up sul corpo con il bersaglio automatico", () => {
    const mode: Mode = { type: "connect", source: "flow/a", sourceAnchor: "e2" }
    const onAnchor = reduce(mode, up({ hit: anchorHit("flow/b", "w2") }), ctx({ tool: "edge" }))
    expect(onAnchor.effects).toContainEqual({ type: "commit-connect", source: "flow/a", target: "flow/b", anchors: { source: "e2", target: "w2" } })
    expect(onAnchor.effects).toContainEqual({ type: "show-anchors", node: null })
    const onBody = reduce(mode, up({ hit: { kind: "node", key: "flow/b" } }), ctx({ tool: "edge" }))
    expect(onBody.effects).toContainEqual({ type: "commit-connect", source: "flow/a", target: "flow/b", anchors: { source: "e2", target: null } })
  })

  it("down sulla maniglia di un capo apre il suo spostamento e mostra gli agganci del suo nodo", () => {
    const step = reduce(IDLE, down({ hit: endHit }), ctx({ tool: "select" }))
    expect(step.mode).toEqual({ type: "reanchor", edge: "flow/e", end: "target", node: "flow/b" })
    expect(step.effects).toContainEqual({ type: "show-anchors", node: "flow/b" })
  })

  const reanchor: Mode = { type: "reanchor", edge: "flow/e", end: "target", node: "flow/b" }

  it("spostare un capo su un aggancio del suo nodo lo fissa lì", () => {
    const step = reduce(reanchor, up({ hit: anchorHit("flow/b", "n3") }), ctx())
    expect(step.effects).toContainEqual({ type: "commit-anchor", edge: "flow/e", end: "target", anchor: "n3" })
    expect(step.mode).toEqual(IDLE)
  })

  it("spostare un capo sul corpo del suo nodo lo rimette automatico", () => {
    const step = reduce(reanchor, up({ hit: { kind: "node", key: "flow/b" } }), ctx())
    expect(step.effects).toContainEqual({ type: "commit-anchor", edge: "flow/e", end: "target", anchor: null })
  })

  it("rilasciato altrove, o su un altro nodo, non cambia niente", () => {
    const hits: Hit[] = [{ kind: "canvas" }, anchorHit("flow/c", "n1"), { kind: "node", key: "flow/c" }]
    for (const hit of hits) {
      expect(reduce(reanchor, up({ hit }), ctx()).effects.some((e) => e.type === "commit-anchor")).toBe(false)
    }
  })

  it("Esc durante lo spostamento nasconde anteprima e agganci", () => {
    const step = reduce(reanchor, { type: "cancel" }, ctx())
    expect(step.mode).toEqual(IDLE)
    expect(step.effects).toEqual([
      { type: "preview-reanchor", edge: "flow/e", end: "target", to: null },
      { type: "show-anchors", node: null },
    ])
  })
})
```

Aggiorna le attese esistenti di Collega: `preview-connect` ha `anchor: null`, `commit-connect` ha `anchors: { source: null, target: null }`, il modo `connect` ha `sourceAnchor: null`.

- [ ] **Step 2: eseguilo e verifica che fallisca**

Run: `pnpm vitest run src/editor/interaction.test.ts`
Expected: FAIL.

- [ ] **Step 3: implementa**

In `src/editor/interaction.ts` (importa `type Anchor`, `type EdgeAnchors` da `@/model/shared`) aggiorna i tipi come in **Interfaces**, con un docblock per ciascun `Hit` nuovo:

```ts
/** I due capi di un arco. */
export type EdgeEnd = "source" | "target"

export type Hit =
  | { kind: "node"; key: string; backdrop?: boolean }
  | { kind: "edge"; key: string }
  | { kind: "resize"; key: string; lane: string | null }
  /** Un punto di aggancio del nodo `node` (spec agganci §6). */
  | { kind: "anchor"; node: string; anchor: Anchor }
  /** La maniglia di un capo dell'arco selezionato; `node` è il nodo di quel capo. */
  | { kind: "edge-end"; edge: string; end: EdgeEnd; node: string }
  | { kind: "canvas" }
```

In `onDown`, dopo la guardia sul pulsante e **prima** del blocco `ctx.tool === "node"`:

```ts
  // Un aggancio o la maniglia di un capo valgono con qualsiasi strumento che non crei nodi: gli
  // agganci non si mostrano sotto lo strumento nodo (spec agganci §6), e questa guardia lo ripete.
  if (ctx.tool !== "node" && info.hit.kind === "anchor") {
    const { node, anchor } = info.hit
    return { mode: { type: "connect", source: node, sourceAnchor: anchor }, effects: [{ type: "preview-connect", source: node, anchor, to: info.world }] }
  }
  if (ctx.tool !== "node" && info.hit.kind === "edge-end") {
    const { edge, end, node } = info.hit
    return {
      mode: { type: "reanchor", edge, end, node },
      effects: [{ type: "show-anchors", node }, { type: "preview-reanchor", edge, end, to: info.world }],
    }
  }
```

Il ramo `ctx.tool === "edge"` sul corpo del nodo diventa `{ type: "connect", source: info.hit.key, sourceAnchor: null }` con `preview-connect` `anchor: null`. Nello `switch (info.hit.kind)` finale aggiungi `case "anchor": case "edge-end": return { mode: IDLE, effects: [] }` (vi arriva solo lo strumento nodo).

`onMove`:

```ts
    case "connect":
      // Qui, e solo qui, `onMove` legge `hit`: il getter memoizzato di `use-canvas-interaction.ts`
      // costa un `elementFromPoint`, che il drag non paga e Collega sì — per mostrare gli agganci del bersaglio.
      return {
        mode,
        effects: [
          { type: "preview-connect", source: mode.source, anchor: mode.sourceAnchor, to: info.world },
          { type: "show-anchors", node: hoveredNode(info.hit) },
        ],
      }
    case "reanchor":
      return { mode, effects: [{ type: "preview-reanchor", edge: mode.edge, end: mode.end, to: info.world }] }
```

con, in testa al file:

```ts
/** Il nodo sotto il puntatore per gli agganci: il nodo colpito, o quello dell'aggancio colpito. */
function hoveredNode(hit: Hit): string | null {
  if (hit.kind === "node") return hit.key
  if (hit.kind === "anchor") return hit.node
  return null
}
```

`onUp`:

```ts
    case "connect": {
      const effects: Effect[] = [
        { type: "preview-connect", source: mode.source, anchor: mode.sourceAnchor, to: null },
        { type: "show-anchors", node: null },
      ]
      const hit = info.hit
      if (hit.kind === "node") {
        effects.push({ type: "commit-connect", source: mode.source, target: hit.key, anchors: { source: mode.sourceAnchor, target: null } })
      } else if (hit.kind === "anchor") {
        effects.push({ type: "commit-connect", source: mode.source, target: hit.node, anchors: { source: mode.sourceAnchor, target: hit.anchor } })
      }
      return { mode: IDLE, effects }
    }
    case "reanchor": {
      const effects: Effect[] = [
        { type: "preview-reanchor", edge: mode.edge, end: mode.end, to: null },
        { type: "show-anchors", node: null },
      ]
      const hit = info.hit
      // Si cambia solo l'aggancio sul nodo di quel capo, mai il bersaglio (spec agganci §2).
      if (hit.kind === "anchor" && hit.node === mode.node) effects.push({ type: "commit-anchor", edge: mode.edge, end: mode.end, anchor: hit.anchor })
      else if (hit.kind === "node" && hit.key === mode.node) effects.push({ type: "commit-anchor", edge: mode.edge, end: mode.end, anchor: null })
      return { mode: IDLE, effects }
    }
```

`onCancel`:

```ts
    case "connect":
      return { mode: IDLE, effects: [{ type: "preview-connect", source: mode.source, anchor: mode.sourceAnchor, to: null }, { type: "show-anchors", node: null }] }
    case "reanchor":
      return { mode: IDLE, effects: [{ type: "preview-reanchor", edge: mode.edge, end: mode.end, to: null }, { type: "show-anchors", node: null }] }
```

- [ ] **Step 4: verifica**

Run: `pnpm vitest run src/editor/interaction.test.ts && pnpm lint`
Expected: PASS. `tsc -b` segnala ora `interaction-runner.ts` e `use-canvas-interaction.ts` (effetti e `Hit` nuovi): li sistema il task 7. **Non committare con `tsc` rosso**: passa subito al task 7 nello stesso branch, oppure aggiungi nel runner i `case` minimi (`show-anchors`, `preview-reanchor`, `commit-anchor` che non fanno niente, `commit-connect` che passa `fx.anchors`) e in `onDblClick` la guardia su `anchor`/`edge-end`. Consigliata la seconda: il commit resta verde, e il task 7 li riempie.

- [ ] **Step 5: commit**

```bash
git add src/editor/interaction.ts src/editor/interaction.test.ts src/ui/canvas/interaction-runner.ts src/ui/canvas/use-canvas-interaction.ts
git commit -m "feat(interazione): Collega da un aggancio e lo spostamento di un capo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: gli agganci sul canvas

**Files:**
- Modify: `src/editor/session-store.ts`
- Create: `src/ui/canvas/AnchorsLayer.tsx`
- Modify: `src/ui/canvas/Canvas.tsx`, `src/ui/canvas/use-canvas-interaction.ts`, `src/ui/canvas/interaction-runner.ts`
- Test: `src/ui/canvas/interaction-runner.test.ts`, `src/ui/canvas/use-canvas-interaction.test.tsx`

**Interfaces:**
- Consumes: task 5 (`canvasOps(...).hasAnchors`, `anchorPoint`, `anchorPoints`, `addEdge(…, anchors)`, `setEdgeAnchor`, `allEdges`, `canvasPorts`), task 6 (effetti e `Hit`).
- Produces: `SessionState.anchorsFor: string | null`, `setAnchorsFor(key: string | null): void`; `AnchorsLayer`; DOM: `[data-anchor][data-anchor-node]`, `[data-edge-end][data-edge-end-edge][data-edge-end-node]`.

- [ ] **Step 1: scrivi i test che falliscono**

In `src/ui/canvas/interaction-runner.test.ts`, con gli helper del file (`giu`, `muovi`, `su`) e gli import che ha già (`createDocument`, `addFlowNode`, `flowDiagram`, `withPool`, `qualify`, `documentStore`, `sessionStore`):

```ts
describe("gli agganci nel runner (spec agganci §6)", () => {
  /** Due nodi di flusso creati coi comandi veri, con prefisso; strumento Seleziona. */
  function dueNodi() {
    documentStore.getState().load(createDocument("t", "t"))
    sessionStore.getState().setTool("select")
    const a = addFlowNode({ x: 0, y: 0 }, "process", null)
    documentStore.getState().dispatch(a.recipe)
    const b = addFlowNode({ x: 400, y: 0 }, "process", null)
    documentStore.getState().dispatch(b.recipe)
    return { a: qualify("flow", a.key), b: qualify("flow", b.key) }
  }
  const edges = () => flowDiagram(documentStore.getState().doc).model.edges

  it("Collega da un aggancio a un aggancio crea l'arco con i due agganci", () => {
    const { a, b } = dueNodi()
    const runner = createInteractionRunner()
    runner.step(giu({ hit: { kind: "anchor", node: a, anchor: "e2" } }))
    runner.step(su({ hit: { kind: "anchor", node: b, anchor: "w2" } }))
    const created = Object.values(edges())
    expect(created).toHaveLength(1)
    expect(created[0]!.anchors).toEqual({ source: "e2", target: "w2" })
  })

  it("lo spostamento di un capo scrive l'aggancio in una voce di annulla", () => {
    const { a, b } = dueNodi()
    const runner = createInteractionRunner()
    runner.step(giu({ hit: { kind: "anchor", node: a, anchor: "e2" } }))
    runner.step(su({ hit: { kind: "node", key: b } }))
    const [key] = Object.keys(edges())
    runner.step(giu({ hit: { kind: "edge-end", edge: qualify("flow", key!), end: "target", node: b } }))
    runner.step(su({ hit: { kind: "anchor", node: b, anchor: "n1" } }))
    expect(edges()[key!]!.anchors).toEqual({ source: "e2", target: "n1" })
    documentStore.getState().undo()
    expect(edges()[key!]!.anchors).toEqual({ source: "e2", target: null })
  })

  it("durante Collega un pool non mostra agganci, un nodo sì, e Esc li nasconde", () => {
    const { a, b } = dueNodi()
    documentStore.getState().dispatch((draft) => {
      withPool(draft)
    })
    sessionStore.getState().setTool("edge")
    const runner = createInteractionRunner()
    runner.step(giu({ hit: { kind: "node", key: a } }))
    runner.step(muovi({ hit: { kind: "node", key: "flow/p1" } }))
    expect(sessionStore.getState().anchorsFor).toBeNull()
    runner.step(muovi({ hit: { kind: "node", key: b } }))
    expect(sessionStore.getState().anchorsFor).toBe(b)
    runner.step({ type: "cancel" })
    expect(sessionStore.getState().anchorsFor).toBeNull()
  })
})
```

In `src/ui/canvas/use-canvas-interaction.ts` esporta `hitTest` (`export function hitTest`), e in `src/ui/canvas/use-canvas-interaction.test.tsx` (importa `hitTest`) aggiungi, sfruttando il `nodo` finto del `beforeEach`:

```ts
describe("hitTest degli agganci", () => {
  const SVG = "http://www.w3.org/2000/svg"

  it("un aggancio vince sul nodo che lo contiene", () => {
    const g = document.createElementNS(SVG, "g")
    g.setAttribute("data-anchor", "n1")
    g.setAttribute("data-anchor-node", "flow/a")
    const dot = document.createElementNS(SVG, "circle")
    g.append(dot)
    nodo.append(g)
    expect(hitTest(dot)).toEqual({ kind: "anchor", node: "flow/a", anchor: "n1" })
  })

  it("la maniglia di un capo porta arco, capo e nodo", () => {
    const g = document.createElementNS(SVG, "g")
    g.setAttribute("data-edge-end", "source")
    g.setAttribute("data-edge-end-edge", "flow/e")
    g.setAttribute("data-edge-end-node", "flow/a")
    svg.append(g)
    expect(hitTest(g)).toEqual({ kind: "edge-end", edge: "flow/e", end: "source", node: "flow/a" })
  })
})
```

- [ ] **Step 2: eseguili e verifica che falliscano**

Run: `pnpm vitest run src/ui/canvas`
Expected: FAIL.

- [ ] **Step 3: la sessione**

`src/editor/session-store.ts`, in `SessionState`:

```ts
  /**
   * Il nodo che mostra i suoi punti di aggancio (spec agganci §6), con prefisso, o `null`. Uno solo
   * alla volta: quello sotto il puntatore, il bersaglio di Collega, o il nodo del capo che si sposta.
   */
  anchorsFor: string | null
  setAnchorsFor: (key: string | null) => void
```

e nello store `anchorsFor: null`, `setAnchorsFor: (anchorsFor) => set({ anchorsFor })`.

- [ ] **Step 4: gli effetti nel runner**

In `src/ui/canvas/interaction-runner.ts`, nel `run`:

```ts
      case "preview-connect": {
        const ops = canvasOps(documentStore.getState().doc)
        const from = fx.to ? (fx.anchor ? ops.anchorPoint(fx.source, fx.anchor) : nodeCenter(fx.source)) : null
        showConnect(from, fx.to)
        break
      }
      case "show-anchors": {
        const node = fx.node !== null && canvasOps(documentStore.getState().doc).hasAnchors(fx.node) ? fx.node : null
        if (session().anchorsFor !== node) session().setAnchorsFor(node)
        break
      }
      case "preview-reanchor": {
        // L'anteprima parte dal porto dell'altro capo, quello che non si muove (spec agganci §6).
        const ports = canvasPorts(documentStore.getState().doc).get(fx.edge)
        const other = ports ? (fx.end === "source" ? ports.target : ports.source) : null
        showConnect(fx.to && other ? other.point : null, fx.to)
        break
      }
      case "commit-anchor": {
        const recipe = canvasOps(documentStore.getState().doc).setEdgeAnchor(fx.edge, fx.end, fx.anchor)
        if (recipe) documentStore.getState().dispatch(recipe)
        break
      }
```

e in `commit-connect`: `addEdge(fx.source, fx.target, fx.anchors)`.

- [ ] **Step 5: hover e hit test**

`src/ui/canvas/use-canvas-interaction.ts`, in `hitTest`, **prima** delle maniglie di resize:

```ts
  // Gli agganci e le maniglie dei capi stanno sopra i nodi (`AnchorsLayer`): vanno guardati per primi.
  const anchor = el?.closest("[data-anchor]")
  if (anchor) return { kind: "anchor", node: anchor.getAttribute("data-anchor-node")!, anchor: anchor.getAttribute("data-anchor") as Anchor }
  const end = el?.closest("[data-edge-end]")
  if (end) {
    return {
      kind: "edge-end",
      edge: end.getAttribute("data-edge-end-edge")!,
      end: end.getAttribute("data-edge-end") as EdgeEnd,
      node: end.getAttribute("data-edge-end-node")!,
    }
  }
```

In `onDblClick`, la prima guardia diventa `if (hit.kind === "canvas" || hit.kind === "anchor" || hit.kind === "edge-end") return`.

L'hover, dentro l'effetto:

```ts
    /**
     * Il nodo sotto il puntatore mostra i suoi agganci (spec agganci §6). `pointerover` e non
     * `pointermove`: scatta solo entrando in un elemento, e `busy()` resta quello di prima. Durante un
     * gesto decide il runner (`show-anchors`): il pointer capture ritarget gli eventi all'svg.
     * Passando dal nodo a uno dei suoi agganci, che sporgono oltre il bordo, gli agganci restano.
     */
    const onPointerOver = (e: PointerEvent) => {
      if (runner.busy()) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest("[data-anchor], [data-edge-end]")) return
      const key = session().tool === "node" ? null : (target?.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null)
      const next = key !== null && canvasOps(documentStore.getState().doc).hasAnchors(key) ? key : null
      if (session().anchorsFor !== next) session().setAnchorsFor(next)
    }
    const onPointerLeave = () => {
      if (!runner.busy() && session().anchorsFor !== null) session().setAnchorsFor(null)
    }
```

registrati con `svg.addEventListener("pointerover", onPointerOver)` e `svg.addEventListener("pointerleave", onPointerLeave)`, e rimossi nel cleanup come gli altri.

- [ ] **Step 6: `AnchorsLayer`**

`src/ui/canvas/AnchorsLayer.tsx`:

```tsx
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { canvasOps, canvasPorts } from "@/editor/kinds/canvas-ops"
import { parseSelId, sessionStore } from "@/editor/session-store"
import { inFamily } from "@/model/family"

/** Raggio del punto e dell'area di clic, in pixel dello schermo: si dividono per la scala. */
const DOT_R = 4
const HIT_R = 8

/** L'unico arco selezionato, se la selezione è esattamente un arco che si aggancia (non la linea di una nota). */
function singleEdge(selection: ReadonlySet<string>): string | null {
  if (selection.size !== 1) return null
  const { kind, key } = parseSelId([...selection][0]!)
  return kind === "edge" && !inFamily(key, "note") ? key : null
}

/**
 * I punti di aggancio di un nodo solo, e le maniglie dei capi dell'arco selezionato (spec agganci
 * §6). Sopra i nodi, con i propri eventi puntatore: `hitTest` li riconosce dai `data-*` prima di ogni
 * altra cosa. Si sottoscrive al documento intero, e va bene: è un layer, non uno per nodo, e disegna
 * al più 16 punti e due maniglie.
 */
export function AnchorsLayer() {
  const node = useStore(sessionStore, (s) => s.anchorsFor)
  const scale = useStore(sessionStore, (s) => s.viewport.scale)
  const edge = useStore(sessionStore, (s) => singleEdge(s.selection))
  const doc = useStore(documentStore, (s) => s.doc)
  if (node === null && edge === null) return null
  const ops = canvasOps(doc)
  const dot = DOT_R / scale
  const hit = HIT_R / scale
  const points = node !== null ? ops.anchorPoints(node) : []
  const ends = edge !== null ? ops.allEdges().find((e) => e.key === edge) : undefined
  const ports = edge !== null ? canvasPorts(doc).get(edge) : undefined
  return (
    <g data-layer="attach-points">
      {points.map(({ anchor, point }) => (
        <g key={anchor} data-anchor={anchor} data-anchor-node={node!} cursor="crosshair">
          <circle cx={point.x} cy={point.y} r={hit} fill="transparent" />
          <circle cx={point.x} cy={point.y} r={dot} fill="var(--background)" stroke="var(--primary)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {ends && ports &&
        (["source", "target"] as const).map((end) => {
          const p = ports[end].point
          return (
            <g key={end} data-edge-end={end} data-edge-end-edge={edge!} data-edge-end-node={ends[end]} cursor="move">
              <circle cx={p.x} cy={p.y} r={hit} fill="transparent" />
              <rect x={p.x - dot} y={p.y - dot} width={2 * dot} height={2 * dot} fill="var(--primary)" />
            </g>
          )
        })}
    </g>
  )
}
```

`Viewport.scale` e `parseSelId` sono quelli di `src/editor/viewport.ts` e `session-store.ts`. In `Canvas.tsx` monta `<AnchorsLayer />` subito dopo i `NodesLayer` non-backdrop e prima di `{children}`, con un commento: «Agganci e maniglie dei capi: sopra i nodi, perché si afferrano (spec agganci §6).»

- [ ] **Step 7: verifica**

Run: `pnpm exec tsc -b && pnpm test && pnpm lint`
Expected: PASS.

Poi a occhio, col dev server: con Seleziona, passando sopra un nodo compaiono i punti; trascinando da un punto a un punto di un altro nodo nasce un arco agganciato lì; selezionando l'arco compaiono due maniglie, e trascinandone una su un altro punto dello stesso nodo il capo si sposta. Passando sopra un pool o una nota non compare niente. Con lo strumento nodo attivo non compare niente.

- [ ] **Step 8: commit**

```bash
git add src/editor/session-store.ts src/ui/canvas
git commit -m "feat(canvas): gli agganci visibili, Collega da un punto e le maniglie dei capi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: e2e e documenti

**Files:**
- Create: `scripts/e2e/agganci.mjs`
- Modify: `scripts/e2e/run.mjs`, `README.md`, `docs/debito-tecnico.md`

- [ ] **Step 1: scrivi lo scenario**

`scripts/e2e/agganci.mjs`, sulla forma di `scripts/e2e/forme.mjs` (stessi `step`, `boxOf`, `drag`, raccolta degli errori della pagina, `isMainModule` in fondo). Passi:

1. «due nodi da sorgenti diverse arrivano in due punti del bersaglio»: tre rettangoli (`q`), due in alto a sinistra e a destra e uno sotto in mezzo; Collega (`r`) dal primo al terzo e dal secondo al terzo, trascinando da centro a centro. L'ultimo punto del `d` di `[data-edge-line]` dei due archi è diverso.
2. «Collega da un aggancio a un aggancio»: con Seleziona (`v`), `hover` sul primo rettangolo; `page.locator('[data-anchor="e2"]')` compare; trascina dal suo centro al centro di `[data-anchor="w2"]` del secondo rettangolo (prima `hover` sul secondo per farlo comparire, poi `drag` fino a lì: durante il gesto gli agganci del bersaglio li mostra il runner). Il nuovo arco parte dal lato destro del primo rettangolo: il primo punto del suo `d` ha la `x` del bordo destro.
3. «spostare un capo sul corpo lo rimette automatico, ⌘Z lo riporta»: clic sull'arco del passo 2 (usa `pointOnArrow` come in `forme.mjs`); le maniglie `[data-edge-end]` sono due; trascina `[data-edge-end="target"]` al centro del secondo rettangolo; il `d` cambia. `Meta+z` (o `Control+z` fuori da macOS, come negli altri scenari) riporta il `d` di prima.

Registra lo scenario in `scripts/e2e/run.mjs` come gli altri (`import { run as runAgganci } from "./agganci.mjs"`, `const agganciOk = await runAgganci(browser, base)`, e `&& agganciOk` in `ok`).

- [ ] **Step 2: eseguilo**

Run: `pnpm e2e`
Expected: tutti gli scenari passano, `agganci` compreso. Se uno scenario esistente si rompe perché un arco ora attacca altrove (per esempio un test che clicca a metà di un arco), aggiorna il punto di clic calcolandolo dal path come `pointOnArrow`, non con coordinate fisse.

- [ ] **Step 3: i documenti**

- `README.md`: nella parte che descrive il canvas e Collega, una frase sugli agganci: «Passando sopra un nodo compaiono i punti di aggancio: trascinando da un punto l'arco parte da lì, e selezionato un arco se ne spostano i capi. I capi lasciati automatici si distribuiscono lungo il lato.» Stesso registro del README (solo cosa fa il software).
- `docs/debito-tecnico.md`, sotto «Gli agganci degli archi (2026-09-29)», aggiungi quello che l'implementazione ha rinviato davvero e solo quello, nel formato delle altre voci (cosa, perché rinviato, costo-se-sbagliato). Candidati da verificare prima di scriverli: le maniglie dei capi non seguono l'anteprima del drag (si ridisegnano al rilascio); Disponi non passa gli agganci a ELK (spec §2); il router continua a non aggirare i nodi, e un aggancio sul lato «sbagliato» dopo Disponi fa girare l'arco attorno al nodo (spec §7).

- [ ] **Step 4: commit**

```bash
git add scripts/e2e README.md docs/debito-tecnico.md
git commit -m "test(e2e): gli agganci degli archi; README e debito tecnico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
