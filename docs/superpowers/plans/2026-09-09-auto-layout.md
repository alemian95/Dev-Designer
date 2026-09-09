# Auto layout con ELK — piano di implementazione

> **Per gli esecutori agentici:** SOTTO-SKILL RICHIESTA: usa
> `superpowers:subagent-driven-development` (consigliata) o
> `superpowers:executing-plans` per eseguire questo piano task per task. I passi
> usano le caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** un pulsante «Disponi» che ricalcola le posizioni di tutte le
entità del diagramma con ELK, in una sola voce di undo, e adatta la vista al
risultato.

**Architettura:** i tipi del grafo in `src/model/layout.ts`, perché li usano due
strati che non si vedono fra loro (`editor` non può importare `io`). Un
adattatore puro in `src/editor/commands/layout.ts` che traduce il diagramma in
grafo e le posizioni in una recipe Immer. Un worker in `src/io/layout` che parla
un protocollo nostro e tiene elkjs come dettaglio interno. L'azione che li cuce
sta in `src/ui`, il solo strato che vede entrambi.

**Stack:** TypeScript 6 strict, Vitest 5, React 19, `elkjs@0.12.0` (già
installato nel commit `1501ac7`).

**Spec:** `docs/superpowers/specs/2026-09-09-auto-layout-design.md`
**ADR:** `docs/adr/0006-layered-invece-di-stress-per-l-auto-layout.md` — la
scelta dell'algoritmo e le misure che la giustificano.

## Vincoli globali

- **Testo UI, commenti e messaggi di commit in italiano**; identificatori in
  inglese. È la convenzione di tutto il repository.
- **Strati imposti da ESLint** (`eslint.config.js`, righe 34-66): `src/model`
  non vede niente; **`src/editor` non può importare `@/io/**`**; `src/io` non
  può importare `react` né `@/ui/**`. Questo vincolo, non l'estetica, decide
  dove vanno i tipi del grafo e dove va l'azione.
- **I dump reali dell'utente (`spike/fixtures/postgres.sql`,
  `spike/fixtures/mysql.sql`) sono git-ignored e non entrano in alcun test**,
  nemmeno per frammenti: nessun nome di tabella o colonna che venga da lì. I
  test usano nomi inventati inline.
- **Identità git personale**: `alessandromian95@gmail.com`, già configurata su
  questo repository.
- **Il branch è `feat/auto-layout`**, già creato, con la spec e l'ADR già
  committati. `git push` e i merge sono decisioni dell'utente: non farli.
- **Comandi**: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e` (che fa già
  `vite build` da sé, ma **non** `tsc`: il typecheck è solo in `pnpm build`).
- **Il progetto non ha jsdom**: nessun test di componenti React. Ciò che va
  provato nel browser si prova con una scena e2e sulla build di produzione.
- **Una sola voce di undo** per un layout: una `dispatch`, mai una per nodo.

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/model/layout.ts` | `LayoutNode`, `LayoutEdge`, `LayoutGraph`, `LayoutPositions`: il vocabolario condiviso fra editor e io |
| `src/editor/commands/layout.ts` | `layoutGraph` (diagramma → grafo) e `applyLayout` (posizioni → recipe). Puro |
| `src/io/layout/client.ts` | protocollo del worker e `createLayoutEngine`: promessa, timeout, abbandono |
| `src/io/layout/elk.worker.ts` | elkjs e le opzioni dell'ADR 0006. Non conosce il documento |
| `src/io/layout/spawn.ts` | il `?worker` di Vite, isolato dai test |
| `src/io/app-io.ts` | l'istanza reale del motore |
| `src/ui/layout-actions.ts` | l'azione: grafo → worker → dispatch → adatta la vista |
| `src/ui/Toolbar.tsx` | il pulsante «Disponi» |
| `src/ui/use-keyboard-shortcuts.ts` | la scorciatoia `L` |
| `scripts/e2e/layout.mjs` | quinta scena e2e |

---

### Task 1: i tipi condivisi e l'adattatore puro

Il cuore della feature, e la parte interamente testabile senza browser. Si fa
per prima: il worker senza adattatore non ha niente da disporre.

**Files:**
- Create: `src/model/layout.ts`
- Create: `src/editor/commands/layout.ts`
- Test: `src/editor/commands/layout.test.ts`

**Interfaces:**
- Consuma: `ErDiagram`, `Entity` da `@/model/document`; `entitySize`, `snap` da
  `../er-geometry`; `Recipe` da `../document-store`; `erDiagram` da
  `../er-access`.
- Produce: `LayoutNode { id, w, h }`, `LayoutEdge { id, source, target }`,
  `LayoutGraph { nodes, edges }`, `LayoutPositions = Record<string, { x, y }>`
  (Task 2 e 3 li importano da `@/model/layout`);
  `layoutGraph(diagram: ErDiagram): LayoutGraph`;
  `applyLayout(positions: LayoutPositions): Recipe`.

- [ ] **Passo 1: i tipi condivisi**

I tipi stanno in `model` e non in `io` per un motivo verificabile: ESLint vieta
a `src/editor` di importare `@/io/**` (riga 49 di `eslint.config.js`), e
l'adattatore che produce il grafo vive in `editor`.

`src/model/layout.ts`:

```ts
/**
 * Vocabolario del layout automatico: rettangoli e archi, nient'altro.
 *
 * Sta in `model` perché lo usano due strati che non si vedono fra loro —
 * `editor/commands/layout.ts` lo produce e `io/layout` lo consuma, e ESLint
 * vieta a `editor` di importare `io`. Non descrive nulla che finisca su disco:
 * il documento non memorizza grafi, li ricalcola.
 */

/** Un nodo da disporre: la chiave dell'entità e l'ingombro che ha sul canvas. */
export interface LayoutNode {
  id: string
  w: number
  h: number
}

/** Un arco **già nel verso del layout**: `source` va sopra, `target` sotto. */
export interface LayoutEdge {
  id: string
  source: string
  target: string
}

export interface LayoutGraph {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
}

/** Posizioni calcolate, per chiave di entità. Sono le coordinate di ELK, non ancora quelle del canvas. */
export type LayoutPositions = Record<string, { x: number; y: number }>
```

- [ ] **Passo 2: i test dell'adattatore, prima dell'adattatore**

`src/editor/commands/layout.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument, type Attribute } from "@/model/document"
import type { LayoutPositions } from "@/model/layout"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { HEADER_H, ROW_H } from "../er-geometry"
import { applyLayout, layoutGraph } from "./layout"

const state = () => documentStore.getState()
const er = () => erDiagram(state().doc)
const attr = (name: string, over: Partial<Attribute> = {}): Attribute => ({
  name,
  type: "int",
  primaryKey: false,
  foreignKey: false,
  nullable: false,
  unique: false,
  ...over,
})

describe("layout automatico", () => {
  beforeEach(() => {
    const doc = createErDocument("t", "t")
    doc.diagram.model.entities.cliente = {
      name: "cliente",
      attributes: [attr("id", { primaryKey: true }), attr("etichetta")],
    }
    doc.diagram.view.nodes.cliente = { x: 0, y: 0, collapsed: false }
    doc.diagram.model.entities.ordine = {
      name: "ordine",
      attributes: [attr("id", { primaryKey: true }), attr("cliente_id", { foreignKey: true })],
    }
    doc.diagram.view.nodes.ordine = { x: 500, y: 500, collapsed: false }
    // `source` è la figlia (lato della foreign key), `target` il padre referenziato.
    doc.diagram.model.relationships.ordine_cliente = {
      source: { entity: "ordine", attributes: ["cliente_id"], cardinality: "many" },
      target: { entity: "cliente", attributes: ["id"], cardinality: "one" },
      identifying: false,
    }
    documentStore.getState().load(doc)
  })

  describe("layoutGraph", () => {
    it("un nodo per entità, con l'ingombro che ha sul canvas", () => {
      const { nodes } = layoutGraph(er())
      expect(nodes.map((n) => n.id).sort()).toEqual(["cliente", "ordine"])
      // Due attributi: header + due righe + il margine sotto l'ultima.
      expect(nodes.every((n) => n.h === HEADER_H + 2 * ROW_H + 6)).toBe(true)
      expect(nodes.every((n) => n.w >= 160)).toBe(true)
    })

    it("un nodo collassato è alto quanto il suo solo header", () => {
      documentStore.getState().dispatch((draft) => {
        erDiagram(draft).view.nodes.cliente.collapsed = true
      })
      const nodo = layoutGraph(er()).nodes.find((n) => n.id === "cliente")
      expect(nodo?.h).toBe(HEADER_H)
    })

    it("inverte gli archi: il padre è la sorgente, così con direction DOWN sta sopra", () => {
      // Nel modello l'arco va ordine → cliente; nel grafo deve andare cliente → ordine.
      expect(layoutGraph(er()).edges).toEqual([{ id: "ordine_cliente", source: "cliente", target: "ordine" }])
    })

    it("un'entità senza nodo nella view non entra nel grafo", () => {
      documentStore.getState().dispatch((draft) => {
        erDiagram(draft).model.entities.fantasma = { name: "fantasma", attributes: [attr("id")] }
      })
      expect(layoutGraph(er()).nodes.map((n) => n.id)).not.toContain("fantasma")
    })

    it("salta la relazione con un estremo che non è nel diagramma", () => {
      documentStore.getState().dispatch((draft) => {
        erDiagram(draft).model.relationships.rotta = {
          source: { entity: "ordine", attributes: ["x"], cardinality: "many" },
          target: { entity: "assente", attributes: ["id"], cardinality: "one" },
          identifying: false,
        }
      })
      expect(layoutGraph(er()).edges.map((e) => e.id)).toEqual(["ordine_cliente"])
    })

    it("una foreign key su se stessa produce un arco con i due estremi uguali", () => {
      documentStore.getState().dispatch((draft) => {
        erDiagram(draft).model.relationships.gerarchia = {
          source: { entity: "cliente", attributes: ["padre_id"], cardinality: "many" },
          target: { entity: "cliente", attributes: ["id"], cardinality: "zero-or-one" },
          identifying: false,
        }
      })
      const arco = layoutGraph(er()).edges.find((e) => e.id === "gerarchia")
      expect(arco).toEqual({ id: "gerarchia", source: "cliente", target: "cliente" })
    })
  })

  describe("applyLayout", () => {
    const posizioni: LayoutPositions = { cliente: { x: 12.4, y: 7 }, ordine: { x: 212.4, y: 207 } }

    it("trasla a (40, 40) e allinea alla griglia da 10", () => {
      expect(documentStore.getState().dispatch(applyLayout(posizioni))).toBe(true)
      expect(er().view.nodes.cliente).toEqual({ x: 40, y: 40, collapsed: false })
      expect(er().view.nodes.ordine).toEqual({ x: 240, y: 240, collapsed: false })
    })

    it("una sola voce di undo per tutto il layout", () => {
      documentStore.getState().dispatch(applyLayout(posizioni))
      expect(state().past).toHaveLength(1)
      documentStore.getState().undo()
      expect(er().view.nodes.cliente).toEqual({ x: 0, y: 0, collapsed: false })
      expect(er().view.nodes.ordine).toEqual({ x: 500, y: 500, collapsed: false })
    })

    it("riapplicare le stesse posizioni non produce una voce di undo fantasma", () => {
      documentStore.getState().dispatch(applyLayout(posizioni))
      expect(documentStore.getState().dispatch(applyLayout(posizioni))).toBe(false)
      expect(state().past).toHaveLength(1)
    })

    it("ignora una chiave che nel frattempo non esiste più, senza toccare le altre", () => {
      const conFantasma: LayoutPositions = { ...posizioni, sparita: { x: 999, y: 999 } }
      expect(documentStore.getState().dispatch(applyLayout(conFantasma))).toBe(true)
      expect(er().view.nodes.sparita).toBeUndefined()
      expect(er().view.nodes.cliente).toEqual({ x: 40, y: 40, collapsed: false })
    })

    it("nessuna posizione applicabile: nessuna modifica", () => {
      expect(documentStore.getState().dispatch(applyLayout({ sparita: { x: 1, y: 2 } }))).toBe(false)
    })
  })
})
```

- [ ] **Passo 3: eseguire i test e vederli fallire**

Comando: `pnpm test src/editor/commands/layout.test.ts`
Atteso: FAIL, `Failed to resolve import "./layout"`.

- [ ] **Passo 4: l'adattatore**

`src/editor/commands/layout.ts`:

```ts
import type { ErDiagram } from "@/model/document"
import type { LayoutEdge, LayoutGraph, LayoutNode, LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { entitySize, snap } from "../er-geometry"

/** Distanza dall'origine del risultato: un diagramma appiccicato al bordo (0, 0) si legge male. */
const MARGIN = 40

/**
 * Traduce il diagramma nel grafo da disporre.
 *
 * Le entità senza nodo nella view sono escluse: non sono sul canvas, e dargli una posizione le
 * farebbe comparire dal nulla. Le relazioni con un estremo fuori dal grafo sono saltate, come già
 * fanno i due emettitori — a ELK un arco senza uno dei due estremi fa rifiutare l'intero grafo.
 */
export function layoutGraph(diagram: ErDiagram): LayoutGraph {
  const nodes: LayoutNode[] = []
  for (const [key, entity] of Object.entries(diagram.model.entities)) {
    const view = diagram.view.nodes[key]
    // Un nodo collassato occupa lo spazio che occupa davvero, non quello che occuperebbe aperto.
    if (view) nodes.push({ id: key, ...sizeOf(entity, view.collapsed) })
  }

  const present = new Set(nodes.map((n) => n.id))
  const edges: LayoutEdge[] = []
  for (const [key, rel] of Object.entries(diagram.model.relationships)) {
    // Invertito rispetto al modello: là `source` è la figlia (lato della foreign key), e con
    // `direction: DOWN` ELK mette la sorgente sopra. La convenzione scelta vuole i padri in alto
    // (ADR 0006), quindi la sorgente del grafo è il `target` del modello.
    const source = rel.target.entity
    const target = rel.source.entity
    if (present.has(source) && present.has(target)) edges.push({ id: key, source, target })
  }

  // Le relazioni disegnate a mano (`attributes` vuoto, ADR 0003) non sono distinte: sono archi come
  // gli altri, e ignorarle disporrebbe il diagramma senza connessioni che l'utente vede.
  return { nodes, edges }
}

function sizeOf(entity: ErDiagram["model"]["entities"][string], collapsed: boolean): { w: number; h: number } {
  const { w, h } = entitySize(entity, collapsed)
  return { w, h }
}

/**
 * Scrive le posizioni calcolate nella view, in una sola recipe: un ⌘Z rimette tutte quelle di prima.
 *
 * Le coordinate di ELK partono dalla sua origine e sono float. Qui si traslano perché il risultato
 * parta da `MARGIN` e si allineano alla griglia, come ogni altra posizione dell'app — una posizione
 * fuori griglia si nota al primo trascinamento, che riallinea il nodo di qualche pixel.
 *
 * Le chiavi che nella view non esistono più (l'entità è stata cancellata mentre il worker
 * calcolava) si ignorano: il nodo non si ricrea. Riscrivere lo stesso valore non genera patch —
 * Immer confronta i primitivi — quindi un secondo layout identico non aggiunge una voce di undo.
 */
export function applyLayout(positions: LayoutPositions): Recipe {
  return (draft) => {
    const d = erDiagram(draft)
    const entries = Object.entries(positions).filter(([key]) => key in d.view.nodes)
    if (entries.length === 0) return

    const minX = Math.min(...entries.map(([, p]) => p.x))
    const minY = Math.min(...entries.map(([, p]) => p.y))
    for (const [key, p] of entries) {
      const node = d.view.nodes[key]
      node.x = snap(p.x - minX + MARGIN)
      node.y = snap(p.y - minY + MARGIN)
    }
  }
}
```

- [ ] **Passo 5: test verdi e typecheck**

Comandi, in quest'ordine:

```bash
pnpm test src/editor/commands/layout.test.ts
pnpm build
pnpm lint
```

Atteso: tutti i test del file passano; `tsc` pulito; ESLint pulito. Se ESLint
segnala l'import di `@/model/layout` da `editor`, il tipo è nel posto sbagliato:
`model` è visibile a tutti, quindi il messaggio sarebbe un errore di percorso,
non di strato.

Se `sizeOf` sembra un giro inutile: serve perché `entitySize` restituisce
`Size`, e `LayoutNode` ha gli stessi due campi ma non è quel tipo. Se `tsc`
accetta `...entitySize(entity, view.collapsed)` direttamente, elimina `sizeOf`
e usa la forma breve.

- [ ] **Passo 6: commit**

```bash
git add src/model/layout.ts src/editor/commands/layout.ts src/editor/commands/layout.test.ts
git commit -m "feat(editor): diagramma → grafo di layout e posizioni → recipe

I tipi del grafo stanno in model perché editor non può importare io (ESLint), e
l'adattatore vive in editor. Gli archi sono invertiti rispetto al modello: là
source è la figlia, e con direction DOWN la sorgente va sopra, mentre la
convenzione dell'ADR 0006 vuole i padri in alto."
```

---

### Task 2: il worker e il suo client

**Files:**
- Create: `src/io/layout/client.ts`
- Create: `src/io/layout/elk.worker.ts`
- Create: `src/io/layout/spawn.ts`
- Test: `src/io/layout/client.test.ts`

**Interfaces:**
- Consuma: `LayoutEdge`, `LayoutNode`, `LayoutPositions` da `@/model/layout`.
- Produce: `LayoutRequest`, `LayoutResponse`, `LayoutWorker`, `LayoutEngine`,
  `LAYOUT_TIMEOUT_MS`, `createLayoutEngine(spawn, timeoutMs?)` da
  `./client`; `spawnLayoutWorker()` da `./spawn` (Task 3 le importa entrambe).

**Attenzione, il punto fragile di tutto il piano.** elkjs è un bundle UMD
generato da GWT, e il suo README elenca fra i problemi ricorrenti proprio
l'integrazione con i bundler («`g is not defined`», «Can't resolve web-worker»).
Qui lo si importa dentro un worker compilato da Vite in formato `iife`. Se il
caricamento fallisce, il sintomo arriverà nella scena e2e del Task 4 come un
rigetto del motore, **non** in questi test, che usano un worker finto. La via di
riserva, se serve, è `elkjs/lib/elk-api` con
`workerFactory: () => new Worker(new URL("elkjs/lib/elk-worker.min.js", import.meta.url), { type: "module" })`,
che sposta il caricamento su un worker gestito da ELK stesso: costa il doppio
salto di messaggi e va documentata come deroga alla §3 della spec.

- [ ] **Passo 1: i test del client, prima del client**

`src/io/layout/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import type { LayoutEdge, LayoutNode } from "@/model/layout"
import { createLayoutEngine, type LayoutRequest, type LayoutResponse, type LayoutWorker } from "./client"

const NODES: LayoutNode[] = [{ id: "a", w: 160, h: 50 }, { id: "b", w: 160, h: 50 }]
const EDGES: LayoutEdge[] = [{ id: "e", source: "a", target: "b" }]
const POSIZIONI = { a: { x: 0, y: 0 }, b: { x: 0, y: 110 } }

/** Worker finto: registra le richieste e lascia al test il momento in cui rispondere. */
class FakeWorker implements LayoutWorker {
  sent: LayoutRequest[] = []
  terminated = false
  private listeners = new Map<string, Array<(e: unknown) => void>>()

  postMessage(message: LayoutRequest): void {
    this.sent.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  addEventListener(type: string, listener: (e: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener as (e: unknown) => void])
  }

  emit(type: string, event: unknown): void {
    for (const l of this.listeners.get(type) ?? []) l(event)
  }

  reply(response: LayoutResponse): void {
    this.emit("message", { data: response })
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("createLayoutEngine", () => {
  it("risolve con le posizioni del worker", async () => {
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w)
    const pending = engine.layout(NODES, EDGES)
    expect(w.sent[0]).toMatchObject({ id: 1, nodes: NODES, edges: EDGES })
    w.reply({ id: 1, ok: true, positions: POSIZIONI })
    await expect(pending).resolves.toEqual(POSIZIONI)
  })

  it("rigetta col messaggio quando il worker riporta un errore", async () => {
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w)
    const pending = engine.layout(NODES, EDGES)
    w.reply({ id: 1, ok: false, message: "grafo rifiutato" })
    await expect(pending).rejects.toThrow("grafo rifiutato")
  })

  it("un errore di caricamento rigetta invece di lasciare la promessa appesa", async () => {
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w)
    const pending = engine.layout(NODES, EDGES)
    w.emit("error", new Event("error"))
    await expect(pending).rejects.toThrow(/non è stato caricato/)
  })

  it("il worker che non risponde in tempo viene terminato e la promessa rigettata", async () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w, 1000)
    const pending = engine.layout(NODES, EDGES)
    vi.advanceTimersByTime(1000)
    await expect(pending).rejects.toThrow(/non ha risposto in tempo/)
    expect(w.terminated).toBe(true)
  })

  it("una seconda richiesta abbandona la prima: una voce di undo per gesto, non due", async () => {
    const workers: FakeWorker[] = []
    const engine = createLayoutEngine(() => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    })
    const primo = engine.layout(NODES, EDGES)
    const secondo = engine.layout(NODES, [])
    await expect(primo).rejects.toThrow(/abbandonato/)
    expect(workers[0].terminated).toBe(true)
    // Il worker abbandonato è inutilizzabile: la seconda richiesta ne ha fatto nascere uno pulito.
    expect(workers).toHaveLength(2)
    workers[1].reply({ id: 2, ok: true, positions: POSIZIONI })
    await expect(secondo).resolves.toEqual(POSIZIONI)
  })

  it("scarta la risposta in ritardo di una richiesta abbandonata", async () => {
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w)
    const pending = engine.layout(NODES, EDGES)
    w.reply({ id: 1, ok: true, positions: POSIZIONI })
    await expect(pending).resolves.toEqual(POSIZIONI)
    // Nessuna richiesta in volo: una risposta che arriva ora non deve far esplodere niente.
    expect(() => w.reply({ id: 1, ok: true, positions: POSIZIONI })).not.toThrow()
  })

  it("riusa il worker fra due layout consecutivi", async () => {
    const workers: FakeWorker[] = []
    const engine = createLayoutEngine(() => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    })
    const primo = engine.layout(NODES, EDGES)
    workers[0].reply({ id: 1, ok: true, positions: POSIZIONI })
    await primo
    const secondo = engine.layout(NODES, EDGES)
    workers[0].reply({ id: 2, ok: true, positions: POSIZIONI })
    await secondo
    // Avviare elkjs costa: il worker si tiene finché non fallisce.
    expect(workers).toHaveLength(1)
  })
})
```

- [ ] **Passo 2: eseguire i test e vederli fallire**

Comando: `pnpm test src/io/layout/client.test.ts`
Atteso: FAIL, `Failed to resolve import "./client"`.

- [ ] **Passo 3: il client**

`src/io/layout/client.ts`:

```ts
import type { LayoutEdge, LayoutNode, LayoutPositions } from "@/model/layout"

export interface LayoutRequest {
  id: number
  nodes: LayoutNode[]
  edges: LayoutEdge[]
}

export type LayoutResponse =
  | { id: number; ok: true; positions: LayoutPositions }
  | { id: number; ok: false; message: string }

/**
 * Il sottoinsieme di `Worker` che serve; un `Worker` vero lo soddisfa, e i test iniettano un finto.
 * Stessa forma di `ParseWorker` in `io/ddl/parse-client.ts`, per la stessa ragione: il worker non
 * esiste in Node, dove girano i test.
 */
export interface LayoutWorker {
  postMessage: (message: LayoutRequest) => void
  terminate: () => void
  addEventListener: (type: "message" | "error" | "messageerror", listener: (event: never) => void) => void
}

export interface LayoutEngine {
  /**
   * Una `layout` chiamata mentre la precedente non si è risolta **abbandona quest'ultima**: la
   * rigetta e termina il worker. Chi chiama non deve aspettarsi una risposta utile da ogni
   * richiesta avviata, solo dall'ultima.
   */
  layout: (nodes: LayoutNode[], edges: LayoutEdge[]) => Promise<LayoutPositions>
}

/** 10 s: il massimo misurato è 316 ms su 200 tabelle (ADR 0006), quindi il margine è trenta volte. */
export const LAYOUT_TIMEOUT_MS = 10_000

interface Pending {
  id: number
  resolve: (positions: LayoutPositions) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Crea il worker al primo layout e lo tiene per i successivi: avviare elkjs (465 kB gzip) costa, e
 * un layout si ripete.
 *
 * Più semplice di `createParser`, che serve un dialog: qui c'è **al più una richiesta in volo**,
 * perché la nuova abbandona la precedente, quindi basta una variabile invece di una mappa. Non
 * esiste `dispose`: il motore vive quanto l'app, non quanto una finestra.
 */
export function createLayoutEngine(spawn: () => LayoutWorker, timeoutMs: number = LAYOUT_TIMEOUT_MS): LayoutEngine {
  let worker: LayoutWorker | null = null
  let nextId = 1
  let pending: Pending | null = null

  const fail = (message: string): void => {
    if (!pending) return
    clearTimeout(pending.timer)
    pending.reject(new Error(message))
    pending = null
  }

  /**
   * Un worker che ha fallito, che è stato abbandonato o che non ha risposto è inutilizzabile:
   * resta bloccato sul calcolo di prima. Si termina, e il prossimo layout ne fa nascere uno pulito.
   */
  const discard = (message: string): void => {
    fail(message)
    worker?.terminate()
    worker = null
  }

  const settle = (event: MessageEvent<LayoutResponse>): void => {
    // Risposta di una richiesta scaduta o abbandonata: si scarta senza far niente.
    if (pending?.id !== event.data.id) return
    const p = pending
    pending = null
    clearTimeout(p.timer)
    if (event.data.ok) p.resolve(event.data.positions)
    else p.reject(new Error(event.data.message))
  }

  const ensure = (): LayoutWorker => {
    if (worker) return worker
    const w = spawn()
    w.addEventListener("message", settle as (event: never) => void)
    w.addEventListener("error", (() => discard("il motore di layout non è stato caricato")) as (event: never) => void)
    // `messageerror` è un singolo messaggio non deserializzabile, non il worker: resta valido.
    w.addEventListener("messageerror", (() => fail("risposta del motore di layout illeggibile")) as (event: never) => void)
    worker = w
    return w
  }

  return {
    layout: (nodes, edges) =>
      new Promise<LayoutPositions>((resolve, reject) => {
        // Due layout di seguito produrrebbero due voci di undo per un gesto che l'utente ha inteso
        // come uno: il primo si abbandona.
        if (pending) discard("layout abbandonato: superato da uno più recente")
        const id = nextId++
        const timer = setTimeout(() => discard("il motore di layout non ha risposto in tempo"), timeoutMs)
        pending = { id, resolve, reject, timer }
        ensure().postMessage({ id, nodes, edges })
      }),
  }
}
```

- [ ] **Passo 4: test verdi**

Comando: `pnpm test src/io/layout/client.test.ts`
Atteso: 7 test passati.

- [ ] **Passo 5: il worker**

`src/io/layout/elk.worker.ts`:

```ts
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js"
import type { LayoutPositions } from "@/model/layout"
import type { LayoutRequest, LayoutResponse } from "./client"

/**
 * In un worker `self` non è `Window`: il tipo `DedicatedWorkerGlobalScope` sta in `lib.webworker`,
 * che questo progetto non carica (ha `lib` DOM, e mescolarle dà dichiarazioni duplicate). Qui si
 * dichiara il minimo che serve, che ombreggia il globale solo per questo modulo. Stessa scelta di
 * `io/ddl/parse.worker.ts`.
 */
declare const self: {
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null
  postMessage: (message: LayoutResponse) => void
}

/**
 * Le opzioni sono una decisione del progetto (ADR 0006), non un parametro di chi chiama: `layered`
 * perché è l'unico algoritmo misurato che non sovrappone i nodi e sta sotto i 320 ms a 200 tabelle,
 * `DOWN` perché dà metà dell'area di `RIGHT` e mette i padri in alto.
 */
const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
}

// Una sola istanza: `new ELK()` senza `workerUrl` calcola qui dentro, che è già il worker.
const elk = new ELK()

self.onmessage = (event) => {
  const { id, nodes, edges } = event.data
  const run = async (): Promise<LayoutResponse> => {
    try {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: OPTIONS,
        children: nodes.map((n) => ({ id: n.id, width: n.w, height: n.h })),
        edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      }
      const laid = await elk.layout(graph)
      const positions: LayoutPositions = {}
      for (const child of laid.children ?? []) {
        // ELK dichiara x e y opzionali: un nodo senza posizione non si inventa, si omette, e
        // `applyLayout` lascia dov'era quello che non riceve.
        if (child.x !== undefined && child.y !== undefined) positions[child.id] = { x: child.x, y: child.y }
      }
      return { id, ok: true, positions }
    } catch (e) {
      return { id, ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
  void run().then((response) => self.postMessage(response))
}
```

`src/io/layout/spawn.ts`:

```ts
import type { LayoutWorker } from "./client"
import LayoutWorkerConstructor from "./elk.worker?worker"

/**
 * Vive in un file suo perché `?worker` è una trasformazione di Vite: importarlo da `client.ts` lo
 * tirerebbe dentro i test, che girano in Node dove `Worker` non esiste. Stessa ragione, e stesso
 * cast, di `io/ddl/spawn.ts`: le firme sovraccariche di `Worker.addEventListener` non sono
 * assegnabili alla forma ristretta di `LayoutWorker`, che un `Worker` vero soddisfa a runtime.
 */
export const spawnLayoutWorker = (): LayoutWorker => new LayoutWorkerConstructor() as unknown as LayoutWorker
```

- [ ] **Passo 6: typecheck, lint e prova che il worker sia un chunk a parte**

```bash
pnpm build
pnpm lint
ls -la dist/assets/ | grep -i "elk\|worker"
```

Atteso: `tsc` e ESLint puliti, e in `dist/assets/` un file `elk.worker-*.js`
grosso (~1,5 MB) **separato** da `index-*.js`.

Se `tsc` protesta sul tipo di ritorno di `elk.layout` (la sua dichiarazione usa
`T['children'][number]`, che sotto `strict` è scomodo), annota il risultato come
`ElkNode` in una variabile prima di leggere `children` invece di aggiungere un
`as any`.

**Se `index-*.js` è cresciuto**, elkjs è finito nel bundle principale: il worker
non è isolato e il passo non è finito. Il valore da cui si parte è **515,72 kB /
162,94 kB gzip** (commit `0a07172`).

- [ ] **Passo 7: commit**

```bash
git add src/io/layout/
git commit -m "feat(io): worker di layout con elkjs e il suo client

Il worker parla un protocollo nostro — rettangoli dentro, posizioni fuori — così
elkjs resta un dettaglio interno al file e il thread principale non ne importa
niente: sono i 465 kB gzip che restano fuori dal bundle iniziale.

Il client è più semplice di createParser: al più una richiesta in volo, quindi
una variabile invece di una mappa, e nessun dispose perché il motore vive quanto
l'app."
```

---

### Task 3: l'azione, il pulsante e la scorciatoia

**Files:**
- Create: `src/ui/layout-actions.ts`
- Modify: `src/io/app-io.ts`
- Modify: `src/ui/Toolbar.tsx`
- Modify: `src/ui/use-keyboard-shortcuts.ts`

**Interfaces:**
- Consuma: `createLayoutEngine` da `@/io/layout/client`, `spawnLayoutWorker` da
  `@/io/layout/spawn`, `layoutGraph`/`applyLayout` da
  `@/editor/commands/layout`, `fitToContent` da `@/editor/actions`,
  `documentStore` da `@/editor/document-store`, `erDiagram` da
  `@/editor/er-access`, `documentSession` da `@/io/document-session`.
- Produce: `layoutEngine` da `@/io/app-io`; `autoLayout()` e
  `useCanAutoLayout()` da `@/ui/layout-actions`.

L'azione sta in `ui` e non in `editor/actions.ts` per il vincolo di ESLint:
`editor` non può importare `@/io/**`, e questa azione ha bisogno del motore.
`ui/document-actions.ts` è il precedente esatto.

- [ ] **Passo 1: l'istanza del motore**

In `src/io/app-io.ts`, aggiungi l'import e l'istanza accanto alle altre:

```ts
import { createLayoutEngine } from "./layout/client"
import { spawnLayoutWorker } from "./layout/spawn"

/** Il worker nasce al primo layout, non all'avvio: elkjs pesa 465 kB gzip. */
export const layoutEngine = createLayoutEngine(spawnLayoutWorker)
```

- [ ] **Passo 2: l'azione**

`src/ui/layout-actions.ts`:

```ts
import { useStore } from "zustand"
import { fitToContent } from "@/editor/actions"
import { applyLayout, layoutGraph } from "@/editor/commands/layout"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { layoutEngine } from "@/io/app-io"
import { documentSession } from "@/io/document-session"

/**
 * Dispone il diagramma: grafo → worker → una sola dispatch → vista adattata.
 *
 * Un fallimento del worker non tocca il documento: o arrivano le posizioni o non se ne applica
 * nessuna, perché un layout a metà è peggio di quello di prima. L'avviso passa dalla barra che
 * esiste già.
 */
export async function autoLayout(): Promise<void> {
  const session = documentSession.getState()
  if (session.layingOut || session.readOnly) return
  const graph = layoutGraph(erDiagram(documentStore.getState().doc))
  // Con meno di due nodi non c'è niente da disporre, e il pulsante è già disabilitato: questa è la
  // guardia per la scorciatoia da tastiera, che non ha uno stato disabilitato.
  if (graph.nodes.length < 2) return

  documentSession.getState().patch({ layingOut: true })
  try {
    const positions = await layoutEngine.layout(graph.nodes, graph.edges)
    documentStore.getState().dispatch(applyLayout(positions))
    // Anche se il layout non ha cambiato niente: la vista si adatta comunque, ed è ciò che
    // l'utente ha chiesto premendo il pulsante.
    fitToContent()
  } catch {
    documentSession.getState().patch({ notice: "Non è stato possibile disporre il diagramma." })
  } finally {
    documentSession.getState().patch({ layingOut: false })
  }
}

/** Vero quando c'è qualcosa da disporre e nessun layout in corso. Serve al pulsante. */
export function useCanAutoLayout(): boolean {
  // I selettori restituiscono booleani, non il documento: così il pulsante non si ridisegna a ogni
  // modifica del diagramma, ma solo quando la risposta cambia.
  const abbastanzaNodi = useStore(documentStore, (s) => Object.keys(erDiagram(s.doc).view.nodes).length > 1)
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const layingOut = useStore(documentSession, (s) => s.layingOut)
  return abbastanzaNodi && !readOnly && !layingOut
}
```

- [ ] **Passo 3: il flag di stato nella sessione**

In `src/io/document-session.ts`, aggiungi il campo a `DocumentSessionState` e il
suo valore iniziale, accanto a `notice`:

```ts
  /** Un layout è in corso: il pulsante «Disponi» resta premuto e disabilitato finché non finisce. */
  layingOut: boolean
```

e nello store: `layingOut: false,`.

- [ ] **Passo 4: il pulsante**

In `src/ui/Toolbar.tsx`: aggiungi `LayoutGrid` all'import da `lucide-react`
(alfabetico, fra `Copy` e `Maximize2`), importa l'azione, e metti il pulsante
**dopo** «Adatta», che è la sua parente più vicina:

```tsx
import { autoLayout, useCanAutoLayout } from "./layout-actions"
```

```tsx
      <Hint label="Disponi (L)">
        <Button variant="ghost" size="icon" aria-label="Disponi" disabled={!canLayout} onClick={() => void autoLayout()}>
          <LayoutGrid />
        </Button>
      </Hint>
```

con `const canLayout = useCanAutoLayout()` fra gli altri hook in cima al
componente.

- [ ] **Passo 5: la scorciatoia**

In `src/ui/use-keyboard-shortcuts.ts`, accanto alle altre lettere senza
modificatore (`v`, `e`, `r`, `f`):

```ts
  else if (!mod && key === "l") void autoLayout()
```

Il layout **modifica** il documento, quindi va aggiunto anche a
`touchesDocument`, la condizione che decide se la scorciatoia va ignorata in
sola lettura: aggiungi `(!mod && key === "l")` al suo `||`. Verifica la forma
esatta di quella riga prima di modificarla (oggi è la riga 23) — se la tua
lettura non combacia con questa descrizione, adatta la modifica a ciò che leggi,
non a ciò che c'è scritto qui.

- [ ] **Passo 6: verifica**

```bash
pnpm test
pnpm build
pnpm lint
```

Atteso: tutta la suite verde, `tsc` e ESLint puliti, e `index-*.js` **non**
cresciuto oltre pochi kB rispetto a 515,72 kB — il pulsante e l'azione, non
elkjs.

- [ ] **Passo 7: commit**

```bash
git add src/io/app-io.ts src/io/document-session.ts src/ui/layout-actions.ts src/ui/Toolbar.tsx src/ui/use-keyboard-shortcuts.ts
git commit -m "feat(ui): il pulsante Disponi

L'azione sta in ui e non in editor/actions.ts perché ESLint vieta a editor di
importare io, e qui serve il motore di layout: stesso motivo per cui esiste
ui/document-actions.ts.

Un fallimento del worker non tocca il documento: l'avviso passa dalla barra che
esiste già, e le posizioni di prima restano."
```

---

### Task 4: la scena e2e, che è il primo collaudo vero di elkjs nel browser

I test dei Task 1 e 2 girano in Node con un worker finto: **nessuno di loro
prova che elkjs si carichi**. Questa scena è l'unico posto dove quel rischio si
manifesta, e per questo verifica le tre cose che un layout rotto sbaglierebbe.

**Files:**
- Create: `scripts/e2e/layout.mjs`
- Modify: `scripts/e2e/run.mjs`

**Interfaces:**
- Consuma: `expectMenu`, `expectNodes`, `isMainModule`, `pickFromMenu`,
  `startEnv` da `./helpers.mjs`.
- Produce: `run(browser, base)` che restituisce `true` se tutti i passi passano,
  come le altre quattro scene.

- [ ] **Passo 1: la scena**

`scripts/e2e/layout.mjs`. La struttura (contesto proprio, raccolta degli errori
di pagina, `step`, guardia di esecuzione diretta) è quella di
`scripts/e2e/export.mjs`: copiala da lì e sostituisci il corpo del `try` con i
passi qui sotto.

```js
/**
 * End-to-end dell'auto layout: importa un DDL → sposta un nodo dove il layout non lo metterebbe →
 * clicca Disponi → verifica il risultato → annulla.
 *
 * È il solo collaudo che prova che **elkjs si carica davvero**: i test unitari usano un worker
 * finto, quindi un bundle UMD che non si risolve nel worker passerebbe tutta la suite e fallirebbe
 * solo qui. Le tre asserzioni sono quelle che un layout rotto sbaglia: le posizioni cambiano,
 * nessuna coppia di nodi si sovrappone, e un ⌘Z rimette esattamente quelle di prima.
 *
 * L'asserzione sulle sovrapposizioni non è di routine: nello spike dell'ADR 0006 è quella che ha
 * smascherato `stress`, che su area e incroci sembrava il vincitore e impilava le scatole.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/layout.mjs`. `HEADLESS=0` per vedere.
 */
```

I passi, dentro il `try`:

```js
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("importa un DDL: tre entità e due relazioni da disporre", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: /Importa DDL/ }).click()
      await page.waitForSelector("[data-import-dialog]")
      await page.locator('[aria-label="DDL"]').click()
      await page.evaluate((text) => {
        const area = document.querySelector('[aria-label="DDL"]')
        const data = new DataTransfer()
        data.setData("text", text)
        area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
      }, DDL)
      await page.waitForSelector("[data-import-summary]", { timeout: 30_000 })
      await page.getByRole("button", { name: /^Importa 3 tabelle$/ }).click()
      await expectNodes(page, 3)
      await page.getByRole("button", { name: "Chiudi" }).click()
      await page.waitForSelector("[data-import-dialog]", { state: "detached" })
    })

    let prima
    await step("sposta un nodo dove il layout non lo metterebbe", async () => {
      // Trascinare è già coperto da altre scene: qui serve solo una posizione di partenza che il
      // layout dovrà cambiare, e la griglia dell'import non la fornisce da sé.
      const box = await page.locator("[data-node-id]").first().boundingBox()
      await page.mouse.move(box.x + 20, box.y + 10)
      await page.mouse.down()
      await page.mouse.move(box.x + 620, box.y + 410, { steps: 8 })
      await page.mouse.up()
      prima = await firma(page)
    })

    await step("Disponi: le posizioni cambiano e nessun nodo si sovrappone", async () => {
      await page.getByRole("button", { name: "Disponi" }).click()
      // Il worker nasce alla prima richiesta e elkjs pesa ~1,5 MB: l'attesa è generosa di proposito.
      await page.waitForFunction((before) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now !== before
      }, prima, { timeout: 30_000 })

      const sovrapposte = coppieSovrapposte(await rettangoli(page))
      if (sovrapposte.length > 0) throw new Error(`nodi sovrapposti dopo il layout: ${sovrapposte.join(", ")}`)
    })

    await step("un solo ⌘Z rimette tutte le posizioni di prima", async () => {
      await page.keyboard.press("Meta+z")
      await page.waitForFunction((atteso) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now === atteso
      }, prima, { timeout: 10_000 })
    })
```

Con in cima al file il DDL e i tre aiuti:

```js
const DDL = `CREATE TABLE mittente (id bigint PRIMARY KEY, etichetta text NOT NULL);
CREATE TABLE recapito (id bigint PRIMARY KEY, mittente_id bigint NOT NULL REFERENCES mittente(id));
CREATE TABLE nota (id bigint PRIMARY KEY, recapito_id bigint NOT NULL REFERENCES recapito(id));`

/** Firma delle posizioni letta dal DOM: chiave e attributo `transform`, ordinati. */
async function firma(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-node-id]")]
      .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
      .sort()
      .join("|"),
  )
}

/**
 * Rettangoli dei nodi in coordinate schermo, letti da `getBoundingClientRect` sul `<rect>`.
 *
 * Niente parsing del `transform`: il suo formato è un dettaglio del renderer, e sbagliare la
 * regex darebbe un test che passa senza verificare niente. Lo zoom è una trasformazione uniforme,
 * quindi due nodi si sovrappongono sullo schermo se e solo se si sovrappongono nel mondo — e dopo
 * il layout la vista si adatta, quindi sono tutti dentro il viewport.
 */
async function rettangoli(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-node-id]")].map((g) => {
      const r = g.querySelector("rect").getBoundingClientRect()
      return { id: g.getAttribute("data-node-id"), x: r.x, y: r.y, w: r.width, h: r.height }
    }),
  )
}

/** Le coppie di nodi che si sovrappongono. Vuoto è l'unico risultato accettabile. */
function coppieSovrapposte(rects) {
  const out = []
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`${a.id}/${b.id}`)
    }
  return out
}
```

**Verificato, non da indovinare:** `EntityNode.tsx:23-24` renderizza ogni nodo
come `<g data-node-id="…" transform="translate(x y)">` e il **primo** `<rect>`
dentro quel gruppo è quello a piena misura (gli altri sono l'header e le righe).
Quindi `firma` e `rettangoli` come sono scritte sopra funzionano: la prima
confronta il `transform` come stringa opaca, la seconda misura in coordinate
schermo, e nessuna delle due interpreta il formato.

**Verificato anche il ⌘Z:** `use-keyboard-shortcuts.ts:16` definisce
`mod = e.metaKey || e.ctrlKey`, quindi `Meta+z` funziona su qualunque
piattaforma e non serve distinguere.

- [ ] **Passo 2: registrare la scena**

In `scripts/e2e/run.mjs`: importa `run as runLayout` da `./layout.mjs`,
eseguila **dopo** le altre quattro (l'ordine conta solo per la leggibilità
dell'output, ma la lista dei nomi nella docstring va aggiornata), e includi il
suo esito nell'`&&` finale.

- [ ] **Passo 3: eseguire la scena da sola, poi tutte**

```bash
pnpm build
node scripts/e2e/layout.mjs
pnpm e2e
```

Atteso: `e2e layout: PASS`, e poi cinque righe PASS con `exit=0`.

**Se qui elkjs non si carica** — l'avviso «Non è stato possibile disporre il
diagramma.» compare, o la pagina registra un errore sul worker — non aggirare il
problema disattivando il passo: è esattamente il rischio previsto nel Task 2, e
la via di riserva documentata là (`elk-api` + `workerFactory`) è la modifica da
fare, aggiungendo una riga alla §3 della spec che dice perché.

- [ ] **Passo 4: prova del contrario, obbligatoria**

Un e2e che passa non dimostra di verificare qualcosa. Sabotaggio temporaneo, e
poi ripristino:

```bash
# in src/ui/layout-actions.ts, come prima riga del corpo di autoLayout: `return`
pnpm build && node scripts/e2e/layout.mjs   # atteso: FAIL sul passo «Disponi»
git checkout src/ui/layout-actions.ts
pnpm build && node scripts/e2e/layout.mjs   # atteso: PASS
```

- [ ] **Passo 5: commit**

```bash
git add scripts/e2e/layout.mjs scripts/e2e/run.mjs
git commit -m "test(e2e): quinta scena, l'auto layout nel browser

È il primo posto dove elkjs si carica davvero: i test unitari usano un worker
finto, quindi un bundle che non si risolve passerebbe tutta la suite. Verifica
che le posizioni cambino, che nessuna coppia di nodi si sovrapponga — l'errore
che nello spike ha smascherato stress — e che un ⌘Z rimetta quelle di prima.

Verificato per sabotaggio: con autoLayout che non fa niente, la scena fallisce."
```

---

### Task 5: chiudere i rimandi nei documenti

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-dev-designer-design.md`
- Modify: `docs/debito-tecnico.md` (solo se la revisione ha aperto voci)

- [ ] **Passo 1: l'ordine di consegna della spec madre**

Nel punto 1 (righe 66-69) l'auto layout è l'ultima cosa dichiarata fuori.
Diventa:

```markdown
1. ~~Shell + ER completo (disegno, validazione, import DDL, export DDL e
   Mermaid).~~ Fatto: import DDL, export immagini (SVG, PNG), export testo (DDL
   PostgreSQL e MySQL, Mermaid), copia del PNG negli appunti e auto layout con
   ELK.
2. Class diagram.
```

- [ ] **Passo 2: la riga dello stack**

Nella tabella delle decisioni di stack, la riga «Auto layout | ELK.js in worker
| Problema difficile già risolto» resta vera, ma il motivo va reso specifico ora
che è misurato: «`layered` in worker | Il solo algoritmo misurato che non
sovrappone i nodi (ADR 0006)».

- [ ] **Passo 3: le voci di debito**

Se la revisione dei task precedenti ha lasciato scoperte — un caso non testato,
una semplificazione consapevole — aprile in `docs/debito-tecnico.md` sotto
`## Da correggere`, con il formato delle voci esistenti (cosa, dove, perché
conta, cosa costerebbe sistemarla). Se non ce ne sono, **non inventarne**:
quella sezione vuota è un'informazione.

- [ ] **Passo 4: commit**

```bash
git add docs/
git commit -m "docs: l'auto layout chiude il punto 1 dell'ordine di consegna"
```

---

## Verifica finale

Sul risultato completo del branch, non su un task:

```bash
pnpm test
pnpm lint
pnpm build
pnpm e2e
```

Tutto verde, cinque scene e2e PASS, e la misura che conta più di tutte:

```bash
ls -la dist/assets/index-*.js
```

**`index-*.js` deve essere rimasto sotto i ~520 kB** (partiva da 515,72 kB,
162,94 kB gzip). Se è di un megabyte, elkjs è nel bundle principale: la feature
funziona e il primo caricamento dell'app è triplicato, che è il modo peggiore di
consegnarla.

Poi `superpowers:finishing-a-development-branch`, e la decisione su merge e push
resta dell'utente.
