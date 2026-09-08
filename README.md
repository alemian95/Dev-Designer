# Dev Designer

Editor web **solo frontend** di diagrammi per sviluppatori: ER, flowchart, UML class e UML sequence.
Nessun backend, nessun account: il documento vive nel browser e si importa/esporta come file.

## Stato

C'è un editor ER funzionante, e i documenti sopravvivono alla chiusura della pagina. Quello che c'è:

- **Modello del documento** validato con Zod e **undo/redo a patch** (Immer `produceWithPatches`: la
  storia non tiene snapshot del documento, tiene le patch e le loro inverse).
- **Validazione live** del documento, con i problemi elencati in un pannello.
- **Canvas SVG** scritto a mano, un solo `<svg>`: pan, zoom, drag di uno o più nodi, selezione a
  rettangolo, creazione di entità, connessione fra entità. Pan, zoom e drag non passano da React —
  scrivono direttamente sul DOM.
- **Toolbar** con gli strumenti e le azioni, **scorciatoie da tastiera**, tema chiaro/scuro.
- **Pannello proprietà** (entità, attributi, relazioni) e **pannello problemi**; rinomina inline
  dell'entità con doppio click sull'header.
- **Persistenza**: autosave in IndexedDB come rete di sicurezza, e al ritorno si riapre l'ultimo
  documento com'era. Il file su disco resta la verità, l'archivio del browser è solo la rete.
- **Apri e salva** su file `.dd.json`: File System Access API dove c'è (con l'handle riusato dai
  salvataggi successivi), altrimenti upload e download. `?fallback=1` forza il secondo percorso.
- **Sola lettura fra schede**: un documento lo scrive una scheda sola, le altre lo mostrano con un
  avviso e un pulsante "prendi il controllo" — la proprietaria fa un ultimo salvataggio prima di
  cedere, così non si perde niente.
- **Misura di prestazioni** riproducibile su documenti sintetici fino a 600 entità.
- **Import DDL**: incolla o carica un dump PostgreSQL o MySQL/MariaDB, si scelgono le tabelle e
  entrano nel diagramma aperto in un solo passo annullabile, con cardinalità dedotte dalle foreign
  key e disposizione a griglia per le entità nuove. Una tabella già presente viene sostituita
  tenendo la sua posizione sul canvas. Limiti: nessun auto layout (i punti di piega restano quelli
  del routing ortogonale esistente), i vincoli UNIQUE su più colonne si perdono nell'import.

Quello che **non** c'è ancora: export. Sui limiti di scala misurati — lo zoom sfonda il criterio già
a 300 entità — vedi la misura qui sotto.

- [Spec di design](docs/superpowers/specs/2026-09-06-dev-designer-design.md)
- [Spec: persistenza dei documenti](docs/superpowers/specs/2026-09-07-persistenza-design.md)
- [Spec: import DDL](docs/superpowers/specs/2026-09-08-import-ddl-design.md)
- [Piano: persistenza](docs/superpowers/plans/2026-09-07-persistenza.md) — il piano di questo branch
- [Piano: modello del documento ed editor ER](docs/superpowers/plans/2026-09-06-modello-documento-ed-editor-er.md)
- [Piano: scaffold e spike](docs/superpowers/plans/2026-09-06-scaffold-e-spike.md)
- [Risultati dello spike](docs/superpowers/spikes/2026-09-06-spike-results.md)

## Stack

- React 19 + TypeScript 6, build con Vite 8.
- **Zustand** (store vanilla, fuori da React) per lo stato del documento e della sessione, **Immer**
  per i comandi e le patch di undo/redo, **Zod** per lo schema del documento.
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

## Test end-to-end

```bash
pnpm e2e       # persistenza e import DDL provati in un browser vero
```

Compila una volta sola, poi avvia un solo `vite preview` e un solo Chrome di sistema headless
condivisi dai due scenari, eseguiti in sequenza (mai in parallelo: entrambi toccano il lock fra
schede e IndexedDB sulla stessa origine, e due scenari concorrenti si disturberebbero a vicenda) —
ciascuno nel proprio contesto di browser, per isolare l'IndexedDB dell'uno da quello dell'altro:

- **Persistenza**: disegna un'entità, ricarica e la ritrova dal buffer IndexedDB, salva come
  download, apre un documento nuovo, ricarica il file e la ritrova, rifiuta un file non valido, apre
  una seconda scheda in sola lettura e le fa prendere il controllo. Gira su `?fallback=1` perché i
  dialoghi nativi della File System Access API non sono pilotabili da automazione — quel percorso
  resta una prova manuale.
- **Import DDL**: incolla un DDL, lo analizza, importa due entità e una relazione, annulla con ⌘Z e
  ritrova il canvas vuoto, poi re-importa due volte e verifica che la relazione non si duplichi.

`HEADLESS=0` per vedere il browser. Exit code 1 se un passo di uno dei due scenari non regge.

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
