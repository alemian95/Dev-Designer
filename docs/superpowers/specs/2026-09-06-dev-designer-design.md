# Dev Designer — Design

Data: 2026-09-06
Stato: bozza in revisione

## 1. Cos'è

Strumento web per sviluppatori dedicato al disegno di quattro tipi di diagramma:
ER, flowchart, UML class diagram, UML sequence diagram.

Non compete con gli editor generici. I nodi conoscono il dominio (un'entità ha
attributi tipizzati e chiavi, una classe ha visibilità e metodi) e il disegno
produce artefatti utili a un dev: DDL, Mermaid, PlantUML, SVG, PNG.

Applicazione **solo frontend**: file statici, nessun server. Il canvas è la
fonte di verità; il testo è import ed export.

## 2. Scope della prima versione

### Shell comune

- Documenti: nuovo, apri, salva, salva con nome, recenti. Autosave in IndexedDB
  con elenco dei documenti.
- Apri e salva su file con File System Access API dove disponibile, fallback
  download e upload altrove. Estensione propria, contenuto JSON.
- Canvas: pan, zoom, fit to content, griglia con snap, selezione singola,
  multipla e a rettangolo, sposta, elimina, copia e incolla, duplica, undo e
  redo, scorciatoie da tastiera.
- Editing del testo inline sul nodo, pannello proprietà per il resto.
- Export immagine: SVG, PNG, copia negli appunti.
- Export testo: Mermaid per tutti i tipi, DDL dall'ER (PostgreSQL e MySQL),
  PlantUML per il class diagram.
- Import: il formato proprio e DDL PostgreSQL e MySQL verso ER.
- Auto layout con ELK per i tipi a grafo.
- Tema chiaro e scuro.

### ER

- Entità con attributi: nome, tipo, primary key, foreign key, nullable, unique.
- Relazioni con cardinalità in notazione crow's foot, identificanti o no.
- Validazione live: nomi duplicati, FK senza destinazione, entità senza PK.
- Import DDL: l'utente sceglie quali tabelle portare nel diagramma. Entità
  collassabili.

### Flowchart

- Nodi: start e end, processo, decisione, input e output, sottoprocesso, nota.
- Edge ortogonali con label e frecce.

### Class diagram

- Classe, classe astratta, interfaccia, enum. Attributi con visibilità e tipo,
  metodi con parametri e tipo di ritorno.
- Relazioni: associazione, aggregazione, composizione, ereditarietà,
  realizzazione, dipendenza. Molteplicità e label.

### Sequence

- Partecipanti come attore o oggetto, lifeline, messaggi sincroni, asincroni,
  di ritorno e a se stessi. Barre di attivazione.
- Frammenti alt, opt e loop. Note.
- Riordino di partecipanti e messaggi per trascinamento; il layout si ricalcola.

### Ordine di consegna

1. ~~Shell + ER completo (disegno, validazione, import DDL, export DDL e
   Mermaid).~~ Fatto: import DDL, export immagini (SVG, PNG), export testo (DDL
   PostgreSQL e MySQL, Mermaid), copia del PNG negli appunti e auto layout con
   ELK.
2. Class diagram.
3. Flowchart.
4. Sequence.

### Fuori scope, deliberatamente

Account, cloud, collaborazione, storico versioni oltre l'undo, template, forme
libere, altri diagrammi UML, import da codice sorgente, import da Mermaid o
PlantUML, documento multi diagramma, backend di qualsiasi tipo.

## 3. Decisioni di stack

| Area | Scelta | Motivo |
|---|---|---|
| Linguaggio | TypeScript strict | Un solo linguaggio, tipi del documento condivisi |
| Build | Vite | WASM e web worker nativi, output statico |
| UI | React | Un componente per kind di nodo |
| Routing | nessuno; TanStack Router se cresce | Una lista documenti e un editor |
| Stato | Zustand | Store documento + store transitorio |
| Mutazioni e undo | Immer con patch | Comandi producono patch e inverse |
| Validazione | zod | Schema del file e tipi da una sola fonte |
| UI della cornice | shadcn/ui + Tailwind | Primitive Radix accessibili, codice nel repo, solo i componenti usati |
| Rendering | SVG scritto a mano dentro React | Hit testing dal DOM, testo nativo, export fedele |
| Font | monospace incorporato | Dimensioni deterministiche senza misurazione |
| Auto layout | `layered` in worker | Senza sovrapposizioni, veloce e con pochi incroci: le altre misurate perdono su almeno uno dei tre (ADR 0006) |
| Parser PostgreSQL | libpg-query (WASM) in worker | Il parser di Postgres stesso |
| Parser MySQL | node-sql-parser, da verificare nello spike | Fallback: parser proprio del sottoinsieme DDL |
| Persistenza | IndexedDB | Autosave e lista documenti |
| File | File System Access API + fallback | Apri e salva come su desktop |
| Export immagine | serializzazione SVG; PNG via canvas offscreen | Nessun secondo renderer |
| Test | Vitest, snapshot SVG, un e2e Playwright | Gli strati puri sono la maggior parte della logica |
| Hosting | qualsiasi CDN statica | Equivalenti a questo livello |

### Scartati e perché

- **Blazor WASM**: interop ad alta frequenza su pointer events, ecosistema
  diagrammi assente, startup pesante. Il paragone con Figma non regge: Figma ha
  un motore di rendering in WASM e la UI in React, Blazor mette la UI in WASM.
- **Next.js, TanStack Start**: esistono per il server. Un framework si sceglie
  per le cose che si usano, non per quelle che si spengono.
- **React Flow**: pensato per grafi a posizione libera; il sequence lo
  combatterebbe. Un solo renderer che conosciamo vale più di due.
- **Backend**: un editor di diagrammi vive nel browser. Il server entra quando
  servono account o collaborazione, che non sono nel piano.
- **Import da codice**: da un ORM lo schema non si deduce senza replicare le
  convenzioni di ogni framework. Il DDL è l'unica fonte affidabile per l'ER.
- **daisyUI, Bulma, Bootstrap, Tabler, PatternFly** per la cornice: i primi
  tre sono solo CSS e lasciano a noi menu, focus trap e tastiera; Tabler è un
  tema per dashboard; PatternFly è un design system enterprise pesante.

### UI della cornice

La cornice (toolbar, palette, pannello proprietà, menu, dialog, command
palette) usa shadcn/ui su Tailwind. Il canvas SVG non usa nessuna libreria UI.

- Lista chiusa di componenti: Button, Toggle Group, Dropdown Menu, Context
  Menu, Dialog, Popover, Tooltip, Command, Input, Select, Tabs, Scroll Area,
  Separator. Altri solo quando servono.
- I token del tema di shadcn sono variabili CSS e sono gli stessi usati dal
  canvas SVG: chiaro e scuro sono un solo sistema, l'export li risolve una
  volta sola.
- Il reset (preflight) di Tailwind tocca anche `svg`; il canvas ne è escluso
  con una regola dedicata.
- Il setup iniziale di shadcn (comando e preset) è fornito dall'utente dal
  configuratore del sito ufficiale.

## 4. Architettura

Quattro strati, dipendenze solo verso il basso. React compare in una sola
cartella.

```
model/     tipi, schema zod, migrazioni, validazione          TS puro
io/        importer DDL, exporter, file system, IndexedDB     TS puro + WASM
editor/    store Zustand, comandi, undo, state machine        TS puro
ui/        React, renderer grafo, renderer sequence           React
workers/   parser DDL, auto layout                            TS
```

`ui` conosce `editor`, `editor` conosce `model`, mai il contrario. La regola è
imposta da una regola eslint sulle import.

Thread principale: React, SVG, store, undo. Worker: parsing DDL e auto layout.
WASM: solo dentro i worker, solo libpg-query.

### 4.1 Modello del documento

- **Un diagramma per file.** Un progetto è una cartella di file.
- Intestazione: `schemaVersion` intero, `id`, `name`. Poi `diagram`,
  discriminated union sul tipo: `er`, `flowchart`, `class`, `sequence`.
- Ogni tipo ha due rami: **`model`** (semantica) e **`view`** (presentazione:
  posizioni, dimensioni, collassato, punti di piega degli edge). Il `view` è
  indicizzato per chiave dell'elemento semantico, così un import popola
  `model` e `view` insieme e un auto layout successivo ridispone solo le
  entità già presenti, senza crearne di nuove.
- **Identità per chiave naturale** sugli elementi importati: la tabella è
  `schema.nome`, la relazione è il nome del constraint o, in assenza, derivata
  da tabella e colonne. Nel class diagram il nome qualificato. Flowchart e
  sequence usano ID generati.
- **Tipi delle colonne come stringhe** nel dialetto d'origine. Nessun sistema
  di tipi unificato.
- **Versioning**: catena di funzioni pure di migrazione eseguite all'apertura.
- **Validazione all'apertura** con zod. Il file da disco è un confine di
  fiducia.
- **Formato su disco**: JSON con ID stabili e chiavi in ordine fisso, così il
  diff in git è leggibile.

Il core grafo (nodi con posizione, edge) è un dettaglio dei tre tipi a grafo,
non la radice del modello. Il sequence ha partecipanti e messaggi ordinati, non
nodi a posizione libera.

### 4.2 Stato e undo

- Il documento è l'unico stato persistente, in uno store Zustand.
- Ogni modifica passa da un **comando** (rinomina attributo, sposta nodi,
  aggiungi relazione). Il comando applica la modifica con Immer, che produce
  patch e patch inverse.
- **Undo** = pila di patch inverse, redo la pila opposta. Niente snapshot.
- **Stato transitorio fuori dal documento**: viewport, selezione, drag in
  corso, testo in editing. Non entra nell'undo né nel file.
- Un drag emette un solo comando al rilascio.
- Autosave in IndexedDB con debounce dopo ogni comando. Il file su disco si
  aggiorna solo con "salva".

### 4.3 Rendering

- Un solo `<svg>`; pan e zoom sono una matrice su un `<g>` radice. La
  conversione schermo/mondo sta in una sola funzione.
- Tre layer: edge, nodi, overlay (selezione, maniglie, anteprima edge).
- Un componente React per kind di nodo, puro e memoizzato, con selettori
  Zustand per nodo.
- Il drag scrive in uno store transitorio; il documento riceve un comando al
  rilascio.
- Una sola state machine sul root SVG: idle, pan, drag nodi, selezione a
  rettangolo, connessione, editing testo. Pointer events con capture, hit
  testing tramite `data-node-id` sul target.
- Edge: ancore sui lati del bounding box, routing ortogonale con una o due
  pieghe, senza evitamento ostacoli. Le rotte di ELK si scartano: il router
  le ricalcola dai rettangoli a ogni render, e al worker si chiedono solo le
  posizioni dei nodi.
- Sequence: funzione pura dal `model` alla geometria (x per partecipante, y per
  messaggio, altezza frammenti); il renderer disegna la geometria.
- Font monospace incorporato: larghezza testo = caratteri × larghezza
  carattere. Nessuna misurazione nel DOM, layout identico su ogni macchina.
- Export SVG: serializzazione dello stesso DOM con le variabili CSS del tema
  risolte. PNG disegnando l'SVG in un canvas offscreen.
- Tetto dichiarato: centinaia di entità. Oltre, entità collassate; uscita di
  sicurezza un renderer Canvas dietro lo stesso documento.

### 4.4 Import DDL

Dettagli di realizzazione nella spec dedicata:
`docs/superpowers/specs/2026-09-08-import-ddl-design.md`.

- Il contratto del client del worker è `(ddl: string, dialect: Dialect) =>
  Promise<DdlParseResult>`: produce solo tabelle, colonne e foreign key grezze.
  Il `model` (entità e relazioni) lo costruisce `map.ts` in un passo separato,
  perché fra l'analisi e la mappatura sta la scelta delle tabelle da importare.
  Tollerante: le istruzioni non riconosciute vengono saltate e segnalate.
- PostgreSQL: libpg-query in WASM. Gestisce un `pg_dump` intero, compresi gli
  `ALTER TABLE ... ADD CONSTRAINT` dove finiscono le FK.
- MySQL: node-sql-parser, verificato nello spike su un dump reale. Fallback:
  parser a discesa ricorsiva sul sottoinsieme DDL di `mysqldump`.
- Entrambi in worker, caricati solo all'apertura del dialog di import.
- L'import produce `model` e `view` insieme, con una disposizione a griglia
  (non ELK); l'auto layout resta un'azione separata e manuale, che ridispone
  solo le entità già in `view`.

### 4.5 Test

- `model`, `io`, funzione di layout del sequence: Vitest con fixture (dump veri
  in ingresso, modello atteso in uscita; e viceversa per gli exporter).
- Renderer: snapshot dell'SVG esportato per alcuni diagrammi fixture.
- Due scenari e2e Playwright (`pnpm e2e`), su una build e un server condivisi: la persistenza
  (disegna un'entità, ricarica, ritrova; salva, riapri, ritrova; due schede — sul percorso di
  fallback, perché i dialoghi nativi non sono pilotabili, vedi la spec della persistenza, §7) e
  l'import DDL (incolla, analizza, importa, annulla, re-importa senza duplicare).
- Nessun test per componente React.

## 5. Spike (codice da buttare, 1–2 giorni)

Risponde a quattro domande prima del piano:

1. Entità ER, drag, pan e zoom, connessione tra due entità in SVG a mano.
2. Trecento entità con attributi: frame rate durante drag e selezione multipla.
3. libpg-query in worker su un `pg_dump` reale: tempo di caricamento e parsing.
4. node-sql-parser su un `mysqldump` reale: se regge, strada A; altrimenti
   parser proprio.

Solo 2 e 4 possono cambiare il design.

## 6. Domande chiuse durante il brainstorming

- Testo o canvas come fonte di verità → **canvas**; testo è import/export.
- UML quali diagrammi → **class e sequence**.
- Sequence come quarto tipo di grafo → **no**, secondo editor che condivide la
  shell; per questo il documento non ha il grafo alla radice.
- Font → **monospace**.
- Dialetti DDL → **PostgreSQL e MySQL** entrambi nella prima versione.
- Import da codice → **no**.
