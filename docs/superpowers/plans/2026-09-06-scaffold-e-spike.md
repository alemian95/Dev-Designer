# Scaffold e Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettere in piedi il progetto Vite + React + TypeScript + Tailwind + shadcn/ui con il preset dell'utente, e rispondere con numeri alle quattro domande dello spike prima di scrivere il codice definitivo.

**Architecture:** Lo scaffolding segue la guida ufficiale shadcn per Vite ed è codice che resta. Lo spike vive in `src/spike/` ed è codice da buttare: una pagina SVG con N entità trascinabili e un contatore FPS, due test Vitest che parsano dump reali con libpg-query e node-sql-parser, un worker che carica libpg-query nel browser. Alla fine si scrive un report con go/no-go e si cancella `src/spike/`.

**Tech Stack:** pnpm 10, Node 22, Vite (template `react-ts`), React, TypeScript strict, Tailwind v4 via `@tailwindcss/vite`, shadcn/ui (preset `b5tJDL2z0i`), Vitest 5, libpg-query 17.x (WASM), node-sql-parser 5.x.

**Spec:** `docs/superpowers/specs/2026-09-06-dev-designer-design.md`

## Global Constraints

- Solo frontend: nessun server, nessuna API route, output `pnpm build` = cartella statica.
- TypeScript `strict` ovunque; nessun `any` non motivato.
- Package manager: `pnpm`. Node 22.
- Cartelle definitive: `src/model`, `src/io`, `src/editor`, `src/ui`, `src/workers`. Non si creano in questo piano: nascono con il primo file che le abita (piano successivo).
- Lo spike sta in `src/spike/` e viene cancellato nel Task 5. Nessun codice di `src/spike/` si promuove a definitivo.
- Font monospace per il testo dei diagrammi (anche nello spike, così la misura è quella vera).
- Dump reali dell'utente (`spike/fixtures/postgres.sql`, `spike/fixtures/mysql.sql`) non si committano: sono in `.gitignore`. I dump sintetici generati dagli script sì.
- Identità git: il repo ha già `user.name`/`user.email` locali personali (impostati con `git-config-personal`). Non toccare la config globale.
- Ogni task termina con un commit. Messaggi in italiano, prefisso convenzionale (`chore:`, `spike:`, `docs:`).

---

### Task 1: Scaffold Vite + Tailwind + shadcn con preset

**Files:**
- Create: tutto il template `react-ts` di create-vite (`package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/*`, `eslint.config.js`, `.gitignore`)
- Modify: `src/index.css`, `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts`, `src/App.tsx`, `package.json` (script `test`)
- Create (da shadcn): `components.json`, `src/components/ui/button.tsx`, `src/lib/utils.ts`

**Interfaces:**
- Produces: alias `@/*` → `src/*`; `pnpm dev`, `pnpm build`, `pnpm test` funzionanti; componente `Button` da `@/components/ui/button`.

- [ ] **Step 1: Scaffold del template in una cartella temporanea e copia nel progetto**

La cartella del progetto contiene già `.git` e `docs/`. `create-vite --overwrite` cancellerebbe tutto, quindi si scaffolda altrove e si copia.

```bash
TMP="$(mktemp -d)" && cd "$TMP" \
  && pnpm create vite@latest dev-designer --template react-ts --eslint --no-interactive \
  && rsync -a --exclude .git "$TMP/dev-designer/" /Users/a-mian-lateral/Dev/_p/dev-designer/ \
  && rm -rf "$TMP" && cd /Users/a-mian-lateral/Dev/_p/dev-designer && ls
```

Expected: `package.json`, `vite.config.ts`, `src/`, `index.html`, `eslint.config.js`, `.gitignore` nel progetto, `docs/` intatta.

- [ ] **Step 2: Installare le dipendenze e Tailwind (guida ufficiale shadcn per Vite)**

```bash
pnpm install && pnpm add tailwindcss @tailwindcss/vite && pnpm add -D @types/node vitest
```

- [ ] **Step 3: `src/index.css` → solo l'import di Tailwind**

Sostituire l'intero contenuto di `src/index.css` con:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Alias `@` in `tsconfig.json` e `tsconfig.app.json`**

In `tsconfig.json` (file "solution" del template, ha `files: []` e `references`) aggiungere:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

In `tsconfig.app.json`, dentro `compilerOptions` esistente, aggiungere le stesse due chiavi:

```json
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
```

- [ ] **Step 5: `vite.config.ts` con plugin Tailwind e alias**

Sostituire il file con (mantenendo il plugin React che il template ha già importato):

```ts
import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

- [ ] **Step 6: Inizializzare shadcn e applicare il preset dell'utente**

`init` è non interattivo grazie ai flag; `apply` richiede `components.json` già presente, per questo viene dopo.

```bash
pnpm dlx shadcn@latest init -b radix --no-monorepo -y \
  && pnpm dlx shadcn@latest apply --preset b5tJDL2z0i -y \
  && pnpm dlx shadcn@latest add button -y
```

Expected: `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`; `src/index.css` contiene i token del tema del preset (`--background`, `--foreground`, ...).

Se `init` chiede comunque qualcosa in modo interattivo, rilanciarlo aggiungendo `--css-variables`; se `apply` fallisce con "components.json not found", verificare di essere nella root del progetto.

- [ ] **Step 7: `src/App.tsx` minimale che usa il Button**

Sostituire il file con:

```tsx
import { Button } from "@/components/ui/button"

export default function App() {
  return (
    <main className="flex h-screen items-center justify-center bg-background text-foreground">
      <Button>Dev Designer</Button>
    </main>
  )
}
```

Cancellare `src/App.css` e `src/assets/react.svg` se il template li ha creati:

```bash
rm -f src/App.css src/assets/react.svg
```

- [ ] **Step 8: Script `test` in `package.json`**

Aggiungere agli `scripts`:

```json
    "test": "vitest run"
```

- [ ] **Step 9: Verificare build, lint e test**

```bash
pnpm build && pnpm lint && pnpm test
```

Expected: `vite build` produce `dist/`; lint senza errori; Vitest termina con "No test files found" ed exit code 0 (nessun test ancora). Se Vitest esce con codice 1 per assenza di test, aggiungere `--passWithNoTests` allo script.

- [ ] **Step 10: Avviare il dev server e controllare visivamente**

```bash
pnpm dev
```

Aprire `http://localhost:5173`: un bottone "Dev Designer" centrato con i colori del preset. Fermare il server.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite + Tailwind + shadcn con preset b5tJDL2z0i"
```

---

### Task 2: Spike A — canvas SVG a mano con 300 entità

**Files:**
- Create: `src/spike/fixtures.ts`
- Create: `src/spike/SpikeCanvas.tsx`
- Modify: `src/App.tsx`
- Create: `docs/superpowers/spikes/2026-09-06-spike-results.md`

**Interfaces:**
- Produces: componente `SpikeCanvas` montato in `App`; funzioni `makeEntities(n)` e `gridPositions(n)` riusate dal Task 3 e 4 per la toolbar.

- [ ] **Step 1: Fixture sintetiche**

`src/spike/fixtures.ts`:

```ts
export type Entity = { id: string; name: string; attrs: string[] }
export type Pos = { x: number; y: number }

export function makeEntities(n: number): Entity[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `table_${i}`,
    attrs: Array.from({ length: 8 + (i % 8) }, (_, j) => `col_${j}: varchar(255)`),
  }))
}

export function gridPositions(n: number): Record<string, Pos> {
  const cols = Math.ceil(Math.sqrt(n))
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `t${i}`,
      { x: (i % cols) * 280, y: Math.floor(i / cols) * 380 },
    ]),
  )
}
```

- [ ] **Step 2: Il canvas**

`src/spike/SpikeCanvas.tsx`:

```tsx
import { memo, useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent, WheelEvent } from "react"
import { gridPositions, makeEntities, type Entity, type Pos } from "./fixtures"

// ponytail: 14px monospace ≈ 8.4px per carattere; il valore vero si misura una volta con getComputedTextLength
const CHAR_W = 8.4
const ROW_H = 20
const FONT = "ui-monospace, SFMono-Regular, Menlo, monospace"

type View = { x: number; y: number; k: number }

function size(e: Entity) {
  const chars = Math.max(e.name.length, ...e.attrs.map((a) => a.length)) + 2
  return { w: chars * CHAR_W, h: ROW_H * (e.attrs.length + 1) }
}

const EntityNode = memo(function EntityNode({
  e,
  pos,
  selected,
}: {
  e: Entity
  pos: Pos
  selected: boolean
}) {
  const { w, h } = size(e)
  return (
    <g data-id={e.id} transform={`translate(${pos.x} ${pos.y})`} style={{ cursor: "grab" }}>
      <rect width={w} height={h} fill="var(--card)" stroke={selected ? "var(--primary)" : "var(--border)"} strokeWidth={selected ? 2 : 1} />
      <rect width={w} height={ROW_H} fill="var(--muted)" />
      <text x={CHAR_W} y={ROW_H - 6} fontFamily={FONT} fontSize={14} fontWeight="bold" fill="var(--foreground)">
        {e.name}
      </text>
      {e.attrs.map((a, i) => (
        <text key={a} x={CHAR_W} y={ROW_H * (i + 2) - 6} fontFamily={FONT} fontSize={14} fill="var(--foreground)">
          {a}
        </text>
      ))}
    </g>
  )
})

function useFps() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const tick = (t: number) => {
      frames++
      if (t - last >= 1000) {
        setFps(frames)
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

export function SpikeCanvas({ toolbar }: { toolbar?: React.ReactNode }) {
  const [count, setCount] = useState(300)
  const entities = useMemo(() => makeEntities(count), [count])
  const [positions, setPositions] = useState<Record<string, Pos>>(() => gridPositions(300))
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 })
  const [selected, setSelected] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
  const fps = useFps()

  useEffect(() => setPositions(gridPositions(count)), [count])

  const toWorld = (ev: PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k }
  }

  const onPointerDown = (ev: PointerEvent<SVGSVGElement>) => {
    svgRef.current!.setPointerCapture(ev.pointerId)
    const id = (ev.target as Element).closest<SVGGElement>("[data-id]")?.dataset.id
    if (id) {
      const p = toWorld(ev)
      drag.current = { id, ox: p.x - positions[id].x, oy: p.y - positions[id].y }
      setSelected(id)
    } else {
      pan.current = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }
      setSelected(null)
    }
  }

  const onPointerMove = (ev: PointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      const { id, ox, oy } = drag.current
      const p = toWorld(ev)
      setPositions((prev) => ({ ...prev, [id]: { x: p.x - ox, y: p.y - oy } }))
    } else if (pan.current) {
      const { sx, sy, vx, vy } = pan.current
      setView((v) => ({ ...v, x: vx + ev.clientX - sx, y: vy + ev.clientY - sy }))
    }
  }

  const onPointerUp = () => {
    drag.current = null
    pan.current = null
  }

  const onWheel = (ev: WheelEvent<SVGSVGElement>) => {
    const r = svgRef.current!.getBoundingClientRect()
    const mx = ev.clientX - r.left
    const my = ev.clientY - r.top
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1
    setView((v) => {
      const k = Math.min(4, Math.max(0.1, v.k * factor))
      return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }
    })
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex items-center gap-3 border-b p-2 font-mono text-sm">
        <span>FPS {fps}</span>
        <label>
          entità
          <input
            type="number"
            className="ml-1 w-20 border bg-background px-1"
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <span>zoom {view.k.toFixed(2)}</span>
        {toolbar}
      </div>
      <svg
        ref={svgRef}
        className="flex-1 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g>
            {entities.slice(1).map((e, i) => {
              const a = positions[entities[i].id]
              const b = positions[e.id]
              if (!a || !b) return null
              return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border)" />
            })}
          </g>
          <g>
            {entities.map((e) =>
              positions[e.id] ? (
                <EntityNode key={e.id} e={e} pos={positions[e.id]} selected={selected === e.id} />
              ) : null,
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
```

- [ ] **Step 3: Montare lo spike in `App.tsx`**

Sostituire `src/App.tsx` con:

```tsx
import { SpikeCanvas } from "./spike/SpikeCanvas"

export default function App() {
  return <SpikeCanvas />
}
```

- [ ] **Step 4: Verificare che compili**

```bash
pnpm build && pnpm lint
```

Expected: nessun errore TypeScript né lint. Se lint segnala `react-hooks/exhaustive-deps` su `useEffect(() => setPositions(gridPositions(count)), [count])`, va bene: la dipendenza è già lì.

- [ ] **Step 5: Misurare**

```bash
pnpm dev
```

In Chrome su `http://localhost:5173`:

1. Con 300 entità: trascinare un'entità per 5 secondi con movimenti continui. Annotare il valore minimo del contatore FPS.
2. Pan per 5 secondi. Annotare il minimo FPS.
3. Zoom con la rotella avanti e indietro. Annotare il minimo FPS.
4. Ripetere 1 con 600 e con 1000 entità.
5. DevTools → Performance → registrare 5 secondi di drag a 300 entità: annotare il tempo medio per frame di "Rendering" e "Scripting".

Criterio go: ≥ 50 FPS minimo in drag con 300 entità. Sotto i 30 FPS a 300 entità è no-go per l'SVG a mano con React che ridisegna per nodo, e si valuta lo stato transitorio fuori da React (mutare `transform` via ref durante il drag).

- [ ] **Step 6: Scrivere i numeri nel report**

Creare `docs/superpowers/spikes/2026-09-06-spike-results.md`:

```markdown
# Spike — risultati

Macchina: <modello, browser e versione>

## A. Canvas SVG a mano

| Scenario | Entità | FPS min | Note |
|---|---|---|---|
| drag | 300 | | |
| pan | 300 | | |
| zoom | 300 | | |
| drag | 600 | | |
| drag | 1000 | | |

Performance panel (drag, 300): rendering ms/frame = , scripting ms/frame =

**Verdetto A:** go / no-go — motivazione in una riga.

## B. libpg-query (Postgres)

## C. node-sql-parser (MySQL)

## Decisioni per il piano successivo
```

Compilare la tabella A con i valori misurati (le altre sezioni le riempiono i Task 3 e 4).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "spike: canvas SVG a mano con N entità e contatore FPS"
```

---

### Task 3: Spike B — libpg-query su un pg_dump reale

**Files:**
- Create: `scripts/gen-pg-dump.mjs`
- Create: `spike/fixtures/postgres.synthetic.sql` (generato)
- Create: `spike/fixtures/postgres.sql` (fornito dall'utente, non committato)
- Create: `src/spike/pg.test.ts`
- Create: `src/spike/pgWorker.ts`
- Modify: `src/App.tsx`, `.gitignore`, `vite.config.ts` (solo se necessario)
- Modify: `docs/superpowers/spikes/2026-09-06-spike-results.md`

**Interfaces:**
- Consumes: `SpikeCanvas` con prop `toolbar` dal Task 2.
- Produces: worker `pgWorker.ts` con protocollo `postMessage(sql: string)` → `{ ms: number; stmts: number }`.

- [ ] **Step 1: Installare libpg-query e ignorare i dump reali**

```bash
pnpm add libpg-query@17 && printf '\n# dump reali dell utente\nspike/fixtures/postgres.sql\nspike/fixtures/mysql.sql\n' >> .gitignore
```

- [ ] **Step 2: Generatore di dump sintetico in stile pg_dump**

`scripts/gen-pg-dump.mjs`:

```js
// Genera uno schema in stile `pg_dump --schema-only`: CREATE TABLE, poi FK con ALTER TABLE ADD CONSTRAINT.
import { writeFileSync, mkdirSync } from "node:fs"

const N = Number(process.argv[2] ?? 200)
const out = []
out.push("SET statement_timeout = 0;", "SET client_encoding = 'UTF8';", "CREATE SCHEMA app;", "")
for (let i = 0; i < N; i++) {
  out.push(`CREATE TABLE app.table_${i} (`)
  out.push(`    id bigint NOT NULL,`)
  for (let j = 0; j < 10; j++) out.push(`    col_${j} character varying(255)${j % 3 ? "" : " NOT NULL"},`)
  if (i > 0) out.push(`    table_${i - 1}_id bigint,`)
  out.push(`    created_at timestamp with time zone DEFAULT now() NOT NULL`)
  out.push(`);`, "")
  out.push(`COMMENT ON TABLE app.table_${i} IS 'tabella ${i}';`, "")
}
for (let i = 0; i < N; i++) {
  out.push(`ALTER TABLE ONLY app.table_${i} ADD CONSTRAINT table_${i}_pkey PRIMARY KEY (id);`)
  if (i > 0)
    out.push(
      `ALTER TABLE ONLY app.table_${i} ADD CONSTRAINT table_${i}_parent_fkey FOREIGN KEY (table_${i - 1}_id) REFERENCES app.table_${i - 1}(id);`,
    )
}
mkdirSync("spike/fixtures", { recursive: true })
writeFileSync("spike/fixtures/postgres.synthetic.sql", out.join("\n") + "\n")
console.log(`scritto spike/fixtures/postgres.synthetic.sql con ${N} tabelle`)
```

```bash
node scripts/gen-pg-dump.mjs 200
```

Se l'utente ha un dump reale, salvarlo in `spike/fixtures/postgres.sql` (ottenuto con `pg_dump --schema-only`). Il test usa quello se esiste, altrimenti il sintetico.

- [ ] **Step 3: Test Vitest in Node che misura il parsing**

`src/spike/pg.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs"
import { expect, test } from "vitest"
import { parse } from "libpg-query"

const file = ["spike/fixtures/postgres.sql", "spike/fixtures/postgres.synthetic.sql"].find(existsSync)

test("libpg-query parsa il dump intero", async () => {
  if (!file) throw new Error("nessuna fixture: esegui node scripts/gen-pg-dump.mjs")
  const sql = readFileSync(file, "utf8")

  const t0 = performance.now()
  const result = await parse(sql)
  const ms = Math.round(performance.now() - t0)

  const kinds = new Map<string, number>()
  for (const s of result.stmts) {
    const kind = Object.keys(s.stmt ?? {})[0] ?? "?"
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
  }
  console.log({ file, bytes: sql.length, ms, stmts: result.stmts.length, kinds: Object.fromEntries(kinds) })

  expect(kinds.get("CreateStmt") ?? 0).toBeGreaterThan(0)
  expect(kinds.get("AlterTableStmt") ?? 0).toBeGreaterThan(0)
})
```

- [ ] **Step 4: Eseguire il test e annotare**

```bash
pnpm test -- src/spike/pg.test.ts
```

Expected: PASS con in console `ms`, `stmts` e la mappa dei tipi (`CreateStmt`, `AlterTableStmt`, `CommentStmt`, `VariableSetStmt`, ...). Un errore di parse fa fallire il test con posizione e messaggio: annotarlo, è un dato dello spike.

- [ ] **Step 5: Worker per il browser**

`src/spike/pgWorker.ts`:

```ts
import { parse } from "libpg-query"

self.onmessage = async (ev: MessageEvent<string>) => {
  const t0 = performance.now()
  try {
    const result = await parse(ev.data)
    postMessage({ ms: Math.round(performance.now() - t0), stmts: result.stmts.length })
  } catch (err) {
    postMessage({ error: String(err) })
  }
}
```

- [ ] **Step 6: Bottone nella toolbar dello spike che carica un file e lo manda al worker**

Sostituire `src/App.tsx` con:

```tsx
import { useState } from "react"
import { SpikeCanvas } from "./spike/SpikeCanvas"

type PgResult = { ms: number; stmts: number } | { error: string }

function PgImport() {
  const [log, setLog] = useState("")
  const run = async (file: File) => {
    const sql = await file.text()
    const created = performance.now()
    const worker = new Worker(new URL("./spike/pgWorker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (ev: MessageEvent<PgResult>) => {
      const total = Math.round(performance.now() - created)
      setLog(`${file.name}: ${JSON.stringify(ev.data)} · totale con caricamento WASM ${total} ms`)
      worker.terminate()
    }
    worker.postMessage(sql)
  }
  return (
    <label className="ml-auto">
      pg_dump
      <input type="file" accept=".sql" className="ml-1" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
      <span className="ml-2 text-muted-foreground">{log}</span>
    </label>
  )
}

export default function App() {
  return <SpikeCanvas toolbar={<PgImport />} />
}
```

- [ ] **Step 7: Provare nel browser e risolvere il caricamento del `.wasm`**

```bash
pnpm dev
```

Selezionare `spike/fixtures/postgres.synthetic.sql` (o il dump reale). Expected: il log mostra `ms` di parsing e il totale con caricamento WASM.

Se la console mostra un 404 sul file `.wasm` o "WebAssembly.instantiate" fallisce:

1. Aggiungere in `vite.config.ts`:

```ts
  optimizeDeps: {
    exclude: ["libpg-query"],
  },
```

2. Se non basta, seguire il documento LOADING_WASM del progetto: copiare il binario in `public/` e annotare che serve uno step di build.

```bash
cp node_modules/libpg-query/wasm/libpg-query.wasm public/
```

Annotare quale delle tre strade ha funzionato: è un'informazione che il piano successivo deve conoscere.

- [ ] **Step 8: Verificare anche la build di produzione**

```bash
pnpm build && pnpm preview
```

Ripetere l'import su `http://localhost:4173`. Expected: stesso comportamento del dev server. Annotare la dimensione del chunk `.wasm` in `dist/` (`ls -la dist/assets | grep wasm`).

- [ ] **Step 9: Compilare la sezione B del report**

In `docs/superpowers/spikes/2026-09-06-spike-results.md`, sezione B:

```markdown
## B. libpg-query (Postgres)

Fixture: <reale/sintetica>, <n> tabelle, <bytes> byte.

| Ambiente | Caricamento WASM ms | Parse ms | Statement | Errori |
|---|---|---|---|---|
| Node (vitest) | n/a | | | |
| Browser dev | | | | |
| Browser build | | | | |

Dimensione `.wasm` in dist: <KB>. Caricamento: <funziona di default / optimizeDeps.exclude / copia in public>.

**Verdetto B:** go / no-go — criterio: caricamento + parse < 3 s su 200 tabelle.
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "spike: libpg-query in Node e in worker browser su pg_dump"
```

---

### Task 4: Spike C — node-sql-parser su un mysqldump reale

**Files:**
- Create: `scripts/gen-mysql-dump.mjs`
- Create: `spike/fixtures/mysql.synthetic.sql` (generato)
- Create: `spike/fixtures/mysql.sql` (fornito dall'utente, non committato)
- Create: `src/spike/mysql.test.ts`
- Create: `src/spike/shims.d.ts`
- Modify: `docs/superpowers/spikes/2026-09-06-spike-results.md`

**Interfaces:**
- Produces: conoscenza della forma dell'AST di `CREATE TABLE` (colonne, PK, FK) stampata dal test, da riportare nel report.

- [ ] **Step 1: Installare node-sql-parser**

```bash
pnpm add node-sql-parser@5
```

- [ ] **Step 2: Generatore di dump sintetico in stile mysqldump**

`scripts/gen-mysql-dump.mjs`:

```js
// Genera uno schema in stile `mysqldump --no-data`: tutto dentro CREATE TABLE, con i commenti condizionali di MySQL.
import { writeFileSync, mkdirSync } from "node:fs"

const N = Number(process.argv[2] ?? 200)
const out = ["/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;", "SET NAMES utf8mb4;", ""]
for (let i = 0; i < N; i++) {
  out.push(`DROP TABLE IF EXISTS \`table_${i}\`;`)
  out.push(`/*!40101 SET @saved_cs_client     = @@character_set_client */;`)
  out.push(`CREATE TABLE \`table_${i}\` (`)
  out.push(`  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,`)
  for (let j = 0; j < 10; j++) out.push(`  \`col_${j}\` varchar(255) COLLATE utf8mb4_unicode_ci ${j % 3 ? "DEFAULT NULL" : "NOT NULL"},`)
  if (i > 0) out.push(`  \`table_${i - 1}_id\` bigint unsigned DEFAULT NULL,`)
  out.push(`  \`created_at\` timestamp NULL DEFAULT NULL,`)
  out.push(`  PRIMARY KEY (\`id\`),`)
  out.push(`  UNIQUE KEY \`table_${i}_col_0_unique\` (\`col_0\`)${i > 0 ? "," : ""}`)
  if (i > 0) {
    out.push(`  KEY \`table_${i}_parent_foreign\` (\`table_${i - 1}_id\`),`)
    out.push(
      `  CONSTRAINT \`table_${i}_parent_foreign\` FOREIGN KEY (\`table_${i - 1}_id\`) REFERENCES \`table_${i - 1}\` (\`id\`) ON DELETE CASCADE`,
    )
  }
  out.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`)
  out.push(`/*!40101 SET character_set_client = @saved_cs_client */;`, "")
}
mkdirSync("spike/fixtures", { recursive: true })
writeFileSync("spike/fixtures/mysql.synthetic.sql", out.join("\n") + "\n")
console.log(`scritto spike/fixtures/mysql.synthetic.sql con ${N} tabelle`)
```

```bash
node scripts/gen-mysql-dump.mjs 200
```

Se l'utente ha un dump reale, salvarlo in `spike/fixtures/mysql.sql` (ottenuto con `mysqldump --no-data`).

- [ ] **Step 3: Shim di tipi per il build per dialetto**

`node-sql-parser` pubblica i tipi solo per l'entry principale. `src/spike/shims.d.ts`:

```ts
declare module "node-sql-parser/build/mysql" {
  export * from "node-sql-parser"
}
```

- [ ] **Step 4: Test che parsa statement per statement e stampa l'AST di una CREATE TABLE**

Il parsing per singolo statement è la stessa strategia tollerante che l'importer definitivo userà: un errore non blocca il resto.

`src/spike/mysql.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs"
import { expect, test } from "vitest"
import { Parser } from "node-sql-parser/build/mysql"

const file = ["spike/fixtures/mysql.sql", "spike/fixtures/mysql.synthetic.sql"].find(existsSync)

// ponytail: split su ";" a fine riga; regge su dump --no-data, non su INSERT con ";" nelle stringhe
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("/*!"))
}

test("node-sql-parser parsa il dump statement per statement", () => {
  if (!file) throw new Error("nessuna fixture: esegui node scripts/gen-mysql-dump.mjs")
  const sql = readFileSync(file, "utf8")
  const parser = new Parser()
  const statements = splitStatements(sql)

  const t0 = performance.now()
  let ok = 0
  const failed: string[] = []
  for (const s of statements) {
    try {
      parser.astify(s, { database: "MySQL" })
      ok++
    } catch (err) {
      failed.push(`${s.slice(0, 100).replace(/\s+/g, " ")} → ${String(err).slice(0, 120)}`)
    }
  }
  const ms = Math.round(performance.now() - t0)
  console.log({ file, statements: statements.length, ok, failed: failed.length, ms })
  console.log(failed.slice(0, 15).join("\n"))

  const create = statements.find((s) => /^CREATE TABLE/i.test(s))
  if (create) {
    const ast = parser.astify(create, { database: "MySQL" })
    console.log(JSON.stringify(ast, null, 1).slice(0, 4000))
  }

  const creates = statements.filter((s) => /^CREATE TABLE/i.test(s)).length
  expect(ok).toBeGreaterThan(0)
  expect(creates).toBeGreaterThan(0)
})
```

- [ ] **Step 5: Eseguire e leggere l'AST**

```bash
pnpm test -- src/spike/mysql.test.ts
```

Expected: PASS. In console: totale statement, quanti parsati, i primi 15 falliti con il messaggio, e l'AST della prima `CREATE TABLE`. Dall'AST individuare e annotare i percorsi di: nome tabella, lista colonne con tipo e nullable, `PRIMARY KEY`, `UNIQUE KEY`, `CONSTRAINT ... FOREIGN KEY ... REFERENCES`.

- [ ] **Step 6: Verificare che il build per dialetto passi nella build di produzione**

```bash
pnpm build
```

Expected: nessun errore di tipi grazie allo shim. Se Vite avvisa su dimensione del chunk, annotare i KB di `node-sql-parser` nel report.

- [ ] **Step 7: Compilare la sezione C del report**

```markdown
## C. node-sql-parser (MySQL)

Fixture: <reale/sintetica>, <n> tabelle.

| Statement totali | Parsati | Falliti | ms |
|---|---|---|---|
| | | | |

Falliti ricorrenti: <elenco dei pattern, es. "KEY ... USING BTREE", "GENERATED ALWAYS AS">

Percorsi nell'AST di CREATE TABLE:
- nome tabella: `ast.table[0].table`
- colonne: `ast.create_definitions[i]` con `resource === "column"` → `column.column`, `definition.dataType`, `nullable`
- PK / UNIQUE / KEY: `resource === "constraint"` con `constraint_type`
- FK: `resource === "constraint"`, `constraint_type === "FOREIGN KEY"`, `definition`, `reference_definition.table[0].table` e `.definition`
(correggere i percorsi con quelli reali stampati dal test)

Dimensione del chunk `node-sql-parser/build/mysql` in dist: <KB>.

**Verdetto C:** go / no-go — criterio: ≥ 95% degli statement di un mysqldump reale parsati e AST che espone colonne, PK e FK. Altrimenti parser proprio del sottoinsieme DDL.
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "spike: node-sql-parser statement per statement su mysqldump"
```

---

### Task 5: Report finale e rimozione dello spike

**Files:**
- Modify: `docs/superpowers/spikes/2026-09-06-spike-results.md`
- Delete: `src/spike/` (tutto)
- Modify: `src/App.tsx`
- Keep: `scripts/gen-*.mjs`, `spike/fixtures/*.synthetic.sql`, dipendenze `libpg-query` e `node-sql-parser` (servono al piano successivo)

- [ ] **Step 1: Sezione decisioni del report**

Completare l'ultima sezione con una riga per decisione:

```markdown
## Decisioni per il piano successivo

- Rendering: SVG a mano con React per nodo → confermato / da rivedere (stato transitorio fuori da React).
- Postgres: libpg-query → confermato; caricamento WASM tramite <strada che ha funzionato>.
- MySQL: node-sql-parser → confermato / sostituito da parser proprio del sottoinsieme DDL.
- Fixture per i test dell'importer: dump sintetici in `spike/fixtures/*.synthetic.sql` + dump reali locali non committati.
- Sorprese: <qualsiasi cosa non prevista dalla spec>
```

Se un verdetto è no-go, non proseguire: fermarsi e riaprire la sezione corrispondente della spec con l'utente.

- [ ] **Step 2: Rimuovere il codice dello spike**

```bash
git rm -r -q src/spike && rm -f public/libpg-query.wasm
```

Se il Task 3 ha richiesto la copia in `public/`, rimetterla nel piano successivo come step di build, non qui.

- [ ] **Step 3: `App.tsx` torna minimale**

```tsx
import { Button } from "@/components/ui/button"

export default function App() {
  return (
    <main className="flex h-screen items-center justify-center bg-background text-foreground">
      <Button>Dev Designer</Button>
    </main>
  )
}
```

- [ ] **Step 4: Verificare**

```bash
pnpm build && pnpm lint && pnpm test
```

Expected: build ok, lint ok, Vitest senza test file (exit 0 con `--passWithNoTests` se aggiunto nel Task 1).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: risultati spike e rimozione codice throwaway"
```

---

## Self-review

- **Copertura della spec:** la spec, sezione 5, chiede uno spike che risponda a quattro domande. Task 2 risponde a 1 e 2 (SVG a mano e 300 entità), Task 3 alla 3, Task 4 alla 4. Lo scaffolding con shadcn e preset (spec, "UI della cornice") è il Task 1. Il resto della spec è oggetto dei piani successivi.
- **Placeholder:** i campi vuoti nel report sono da compilare con misure, non codice da scrivere; i percorsi AST nella sezione C sono dichiaratamente da correggere con l'output reale del test.
- **Coerenza dei tipi:** `SpikeCanvas` accetta `toolbar?: React.ReactNode` (Task 2) e il Task 3 la usa con `<PgImport />`; `makeEntities`/`gridPositions` hanno la stessa firma in Task 2. Il protocollo del worker `{ ms, stmts } | { error }` è lo stesso in `pgWorker.ts` e in `PgImport`.
