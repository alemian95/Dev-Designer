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
