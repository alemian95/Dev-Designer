# Dev Designer

Editor web di diagrammi per sviluppatori: entità **ER**, **classi UML** e **flowchart** sullo stesso
canvas, con **note** e **forme** libere.

Funziona tutto nel browser, senza backend né account. Il documento si apre e si salva come file. A
ogni push su `master` parte il deploy su Vercel.

## Cosa fa

### Disegna

Canvas SVG con pan, zoom, trascinamento di uno o più elementi, selezione a riquadro, creazione di
nodi e collegamenti. In alto la barra con annulla, ripeti, zoom, «Disponi» e tema chiaro o scuro; a
sinistra gli strumenti; a destra il pannello delle proprietà e quello dei problemi. I nomi si
modificano col doppio clic sul canvas. Ogni azione si annulla.

- **ER**: entità con attributi tipizzati, chiavi e relazioni con cardinalità.
- **Classi UML**: classi con stereotipo `class`, `interface`, `abstract` o `enum`. Attributi e metodi
  si scrivono come testo in un editor dedicato, con visibilità e modificatori UML; lo statico è
  sottolineato. Sei relazioni: associazione (anche navigabile), generalizzazione, realizzazione,
  composizione, aggregazione, dipendenza.
- **Flowchart**: terminale, processo, decisione, input/output e sottoprocesso; archi con etichetta,
  scritta col doppio clic. La validazione segnala archi penzolanti, decisioni con meno di due uscite,
  vicoli ciechi, nodi irraggiungibili, rami senza etichetta e flussi senza terminale.
- **Pool e corsie**, facoltativi: un pool si crea con `P`, ha un nome e una o più corsie. Si sposta
  dall'intestazione insieme ai suoi nodi, si allarga dal bordo destro; ogni corsia cresce dal bordo
  inferiore. Un nodo trascinato in una corsia ci entra, trascinato fuori torna libero. Spostare un
  nodo da una corsia all'altra è un solo passo di undo. Sul canvas possono stare più pool.
- **Note**: testo libero, da solo o ancorato con Collega a un'entità, una classe, un nodo di flusso,
  un pool o una forma. La linea tratteggiata segue l'elemento. Canc sulla linea o «Stacca» nel
  pannello staccano la nota; eliminare l'elemento la stacca.
- **Forme**: rettangolo (`Q`), ellisse (`O`) e testo (`T`), collegati da frecce con Collega. Stanno
  sotto tutti gli altri elementi, e dentro una forma si può creare qualunque elemento. Una forma
  nasce grande quanto il suo testo e si allarga dalla maniglia nell'angolo. La freccia ha la punta
  alla fine, a entrambi i capi o da nessuna parte, è continua o tratteggiata, e si inverte dal
  pannello.

Collega fra famiglie diverse crea **collegamenti tipizzati**:

- una classe **mappa su** un'entità: l'app segnala gli attributi senza colonna (`createdAt` e
  `created_at` sono lo stesso campo), i tipi incompatibili e le classi mappate su più tabelle;
- un nodo di flusso **accede** a un'entità (lettura, scrittura o entrambe, dal pannello) e **chiama**
  una classe.

I collegamenti seguono le rinomine e spariscono con i loro elementi. Collega fra una nota e un
elemento ancora la nota. Collega fra una forma e un elemento di un'altra famiglia viene rifiutato
con un avviso.

I problemi del documento compaiono nel pannello mentre si disegna.

**«Disponi» (`L`)** ridispone il documento con ELK in un solo passo annullabile: ER, classi e forme
dall'alto in basso, il flowchart verso destra dentro le sue corsie. Le famiglie finiscono in blocchi
affiancati da sinistra a destra; le note ancorate restano accanto al loro elemento.

### Importa un database

Da un dump **PostgreSQL** o **MySQL/MariaDB**, incollato o caricato, si scelgono le tabelle da
importare. Entrano nel documento aperto in un solo passo annullabile, con le cardinalità dedotte
dalle foreign key. Una tabella già presente viene sostituita e resta nella sua posizione.

### Esporta

- **Immagini**: SVG e PNG del documento intero, più «Copia PNG» negli appunti. Sempre col tema
  chiaro, col font incorporato.
- **Testo**, da copiare o scaricare:
  - ER: DDL PostgreSQL, DDL MySQL, Mermaid `erDiagram`;
  - classi: Mermaid `classDiagram`, con le note libere e quelle ancorate a una classe (`note for`);
  - flowchart: Mermaid `flowchart LR`, con una `subgraph` per ogni pool e per ogni corsia.

  Le forme escono solo come immagine. Il dialog di export avvisa di quello che resta fuori.

### Salva

Il documento è un file `.dd.json`. Con la File System Access API i salvataggi riscrivono lo stesso
file; senza, si usano upload e download (`?fallback=1` forza questo percorso).

Un autosave in IndexedDB riapre l'ultimo documento com'era.

Un documento si modifica da una scheda sola: le altre lo mostrano in sola lettura, con il pulsante
«prendi il controllo». La scheda che cede salva prima di passare la mano.

## Scorciatoie

| Tasti | Strumento |
|---|---|
| `V` | selezione |
| `E` | entità (ER) |
| `C` · `I` · `U` | classe · interfaccia · enum |
| `1`..`5` | terminale · processo · decisione · input/output · sottoprocesso |
| `P` | pool |
| `N` | nota |
| `Q` · `O` · `T` | rettangolo · ellisse · testo |
| `R` | Collega |
| `F` · `L` | adatta alla finestra · disponi |
| `⌘Z` · `⇧⌘Z` / `⌘Y` · `⌘D` · `⌫` | annulla · ripeti · duplica · elimina |
| `⌘S` · `⇧⌘S` · `⌘O` | salva · salva con nome · apri |
| `⌘=` · `⌘-` · `⌘0` · `⌘A` | zoom avanti · indietro · reset · seleziona tutto |
| `Esc` | deseleziona e torna alla selezione |

## Limiti noti

- **Niente sequence diagram.**
- **Solo desktop**: niente gesti touch. Collaudato su Chrome; su Firefox e Safari i file passano da
  upload e download.
- **Prestazioni misurate fino a 600 entità ER** (p95 del tempo di frame ≤ 20 ms in produzione:
  [la misura](docs/perf/2026-09-13-gate-verde.md)). Classi, flowchart, note e forme non sono
  misurati.
- **Import DDL**: i vincoli `UNIQUE` su più colonne vengono ignorati, con un avviso. In MySQL un
  `REFERENCES` senza lista di colonne fa scartare l'intero `CREATE TABLE`.
- **Classi**: i generici annidati escono in Mermaid in forma approssimata, con un avviso. Non ci sono
  package, classi di associazione, classi annidate, PlantUML, generazione di codice né import da
  Mermaid o da codice sorgente.
- **Flowchart**:
  - gli archi all'indietro passano sopra i nodi;
  - con le corsie, gli archi si incrociano più che senza;
  - in Mermaid le corsie diventano riquadri e le note ancorate al flusso non escono;
  - il rombo della decisione occupa circa il doppio di un processo con lo stesso testo;
  - con due o più archi fra gli stessi due nodi, l'aggancio su una decisione esce dal rombo.
- **Forme**: una forma disegnata attorno ad altri elementi non li sposta con sé, e dopo «Disponi» non
  li racchiude più.

Gli altri difetti noti sono nel [debito tecnico](docs/debito-tecnico.md).

---

## Sviluppo

### Stack

- React 19, TypeScript 6, Vite 8
- Zustand (store vanilla) per documento e sessione, Immer per comandi e undo/redo a patch, Zod per lo
  schema
- Tailwind CSS 4, shadcn/ui, Radix
- Canvas SVG, un componente React per nodo
- Import DDL in un worker: `libpg-query` (WASM) per PostgreSQL, `node-sql-parser` per MySQL/MariaDB
- Auto layout: `elkjs` in un worker (direzione per famiglia: ADR 0007); rotte degli archi dal router
  ortogonale
- Vitest, ESLint 10

### Comandi

Servono Node 22 o successivo e pnpm 10.

```bash
pnpm install   # installa le dipendenze
pnpm dev       # dev server Vite
pnpm build     # type check (tsc -b) + build di produzione
pnpm lint      # ESLint
pnpm test      # Vitest
```

[La CI](.github/workflows/ci.yml) esegue `lint`, `test` e `build` a ogni push su `master` e a ogni
pull request. `e2e` e `perf` si lanciano a mano.

### Test end-to-end

```bash
pnpm e2e       # dodici scenari nel Chrome di sistema
```

Compila una volta, avvia `vite preview` e un Chrome headless, ed esegue gli scenari in sequenza,
ognuno in un contesto di browser separato:

- **Persistenza**: autosave, salvataggio e riapertura del file, file non valido, seconda scheda in
  sola lettura che prende il controllo (sul percorso `?fallback=1`).
- **Import DDL**: import di entità e relazione, undo, reimport senza duplicati.
- **Export immagini**: SVG, PNG e copia negli appunti col tema scuro attivo.
- **Export testo**: i tre formati, copia e download.
- **Auto layout**: «Disponi» sposta i nodi senza sovrapporli, e si annulla.
- **Classi**: editor dei membri, testo non valido, generalizzazione, «Disponi», export Mermaid.
- **Nota**: ancoraggio a entità, nodo di flusso e pool, stacco, «Disponi», file della versione 6.
- **Forme**: freccia con punte, tratteggio e inversione, forma creata dentro un'altra,
  ridimensionamento e undo, nota ancorata, «Disponi», Collega rifiutato verso un'entità.
- **Flowchart**: pool con due corsie, nodi e archi etichettati, «Disponi» dentro le corsie,
  spostamento fra corsie con un solo undo, nodo portato fuori dal pool, export Mermaid.
- **Canvas misto**: entità, classe e nodo di flusso insieme, collegamenti fra famiglie,
  ricaricamento, «Disponi» a blocchi, formati di export di tutte le famiglie.
- **Collegamenti**: «mappa su» con la colonna mancante segnalata, rinomina, eliminazione, rifiuto di
  un'interfaccia, accesso e chiamata da un processo.
- **Pool**: nodo dentro e fuori dal pool, pool spostato col suo nodo, pool eliminato, file della
  versione precedente.

Un solo scenario, dopo `pnpm build`: `node scripts/e2e/<nome>.mjs`. `HEADLESS=0` mostra il browser.
Esce con codice 1 se un passo fallisce.

### Misura prestazioni

```bash
pnpm perf [N]  # tempo di frame su un documento sintetico di N entità (default 300)
```

Guida il Chrome di sistema in una finestra visibile sulla build di produzione e misura trascinamento,
trascinamento della selezione, pan, selezione a riquadro, zoom e selezione di tutto il diagramma.
Esce con codice 1 se uno scenario supera p95 20 ms. Richiede Google Chrome installato; durante la
misura la finestra non va coperta.

Risultati: [gate verde](docs/perf/2026-09-13-gate-verde.md),
[prima misura](docs/perf/2026-09-06-fps-frame-dipinti.md).

### Documentazione

- [Spec di design](docs/superpowers/specs/2026-09-06-dev-designer-design.md)
- Spec delle funzioni:
  [persistenza](docs/superpowers/specs/2026-09-07-persistenza-design.md),
  [import DDL](docs/superpowers/specs/2026-09-08-import-ddl-design.md),
  [auto layout](docs/superpowers/specs/2026-09-09-auto-layout-design.md) (§3 prima di toccare
  `src/io/layout/`),
  [export testo](docs/superpowers/specs/2026-09-09-export-testo-design.md),
  [classi](docs/superpowers/specs/2026-09-10-class-diagram-design.md),
  [classi, ampiezza](docs/superpowers/specs/2026-09-11-class-diagram-ampiezza-design.md),
  [flowchart](docs/superpowers/specs/2026-09-22-flowchart-design.md),
  [canvas unificato](docs/superpowers/specs/2026-09-24-canvas-unificato-design.md),
  [collegamenti tipizzati](docs/superpowers/specs/2026-09-24-collegamenti-tipizzati-design.md),
  [collegamenti del flusso](docs/superpowers/specs/2026-09-25-collegamenti-flusso-design.md),
  [pool e corsie](docs/superpowers/specs/2026-09-25-pool-corsie-design.md),
  [nota unica](docs/superpowers/specs/2026-09-26-nota-unica-design.md),
  [forme generiche](docs/superpowers/specs/2026-09-26-forme-generiche-design.md)
- [Piani di implementazione](docs/superpowers/plans/)
- [Decisioni di architettura](docs/adr/) (sette ADR)
- [Debito tecnico](docs/debito-tecnico.md)
- [Risultati dello spike](docs/superpowers/spikes/2026-09-06-spike-results.md)
