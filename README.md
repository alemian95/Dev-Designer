# Dev Designer

Editor web **solo frontend** di diagrammi per sviluppatori: ER, flowchart, UML class e UML sequence.
Nessun backend, nessun account: il documento vive nel browser e si importa/esporta come file.

## Stato

Fondamenta e spike completati. Non c'è ancora l'editor: il branch corrente porta lo scaffold del
progetto e i risultati dello spike su rendering SVG e parsing DDL.

- [Spec di design](docs/superpowers/specs/2026-09-06-dev-designer-design.md)
- [Piano: scaffold e spike](docs/superpowers/plans/2026-09-06-scaffold-e-spike.md)
- [Risultati dello spike](docs/superpowers/spikes/2026-09-06-spike-results.md)

## Stack

- React 19 + TypeScript 6, build con Vite 8.
- Tailwind CSS 4 con shadcn/ui e Radix per la cornice dell'interfaccia.
- Canvas SVG scritto a mano, un componente React per nodo.
- Import DDL: `libpg-query` (WASM) per PostgreSQL, `node-sql-parser` per MySQL/MariaDB, entrambi in worker.
- Test con Vitest, lint con ESLint 10.

## Comandi

Richiede Node >= 22 e pnpm 10.

```bash
pnpm install   # installa le dipendenze
pnpm dev       # dev server Vite
pnpm build     # type check (tsc -b) + build di produzione
pnpm lint      # ESLint
pnpm test      # Vitest
```

## Misura prestazioni

```bash
pnpm perf [N]  # FPS a frame dipinti su un documento sintetico di N entità (default 300)
```

Costruisce la build di produzione, la serve con `vite preview` e guida il **Chrome di sistema** in
finestra visibile con eventi mouse reali, misurando il tempo fra frame consecutivi in cinque scenari
(drag, drag di tutta la selezione, pan, marquee, zoom) più il marquee su tutto il diagramma. Stampa una
tabella e il verdetto rispetto al criterio (p95 ≤ 20 ms, cioè ≥ 50 FPS).

Prerequisito: **Google Chrome installato** — i browser di Playwright non vengono scaricati. Durante la
misura la finestra di Chrome non va toccata né coperta: Chrome strozza i frame delle finestre nascoste.

Risultati: [Misura FPS a frame dipinti](docs/perf/2026-09-06-fps-frame-dipinti.md).
