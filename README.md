# Dev Designer

Editor web di diagrammi per sviluppatori: entità **ER**, **classi UML** e **flowchart** sullo stesso canvas, ognuno con le sue regole.

Nessun backend, nessun account, niente da configurare: il documento vive nel browser e si apre e si
salva come file, come in un editor di testo. Il deploy è automatico su Vercel a ogni push su
`master`.

## Cosa fa

### Disegna

Canvas SVG scritto a mano: pan, zoom, drag di uno o più nodi, selezione a rettangolo, creazione di
nodi e connessioni. Pan, zoom e drag non passano da React — scrivono direttamente sul DOM, ed è il
motivo per cui il gesto resta fluido anche su documenti grandi.

Attorno al canvas: toolbar, pannello proprietà, pannello dei problemi, tema chiaro/scuro, rinomina
inline con doppio click, undo/redo su ogni azione.

- **ER**: entità con attributi tipizzati, chiavi e relazioni con cardinalità.
- **UML class**: classi con stereotipo (`class`, `interface`, `abstract`, `enum`), attributi e metodi
  scritti come **testo** in un editor dedicato — non una riga di form per membro — con le regole di
  visibilità e modificatori dell'UML, lo statico sottolineato come prescrive la notazione. Le sei
  relazioni (associazione anche navigabile, generalizzazione, realizzazione, composizione,
  aggregazione, dipendenza), ciascuna con la punta e il tratto giusti, più le note. Una nota può
  dichiarare la classe che commenta — un tratteggio senza punta, con lo strumento relazione — e il
  legame esce nell'export Mermaid come `note for`; «Disponi» tiene la nota accanto alla sua classe.
- **Flowchart**: sei forme di nodo (terminale, processo, decisione, input/output, sottoprocesso,
  nota) organizzate in **corsie** — bande orizzontali con un nome, una per attore — e archi
  etichettabili col doppio click. «Disponi» dispone il flusso con ELK in direzione `RIGHT` (ADR
  0007) e poi corregge solo l'asse trasversale per far stare ogni nodo nella banda della sua
  corsia; trascinare un nodo in un'altra corsia scrive posizione e corsia in un solo passo di
  undo. Sei regole di validazione (archi penzolanti, decisioni con meno di due uscite, vicoli
  ciechi, nodi irraggiungibili, rami senza etichetta, nessun terminale) e export Mermaid
  `flowchart LR` con una `subgraph` per corsia.

La **validazione è live**: i problemi del documento compaiono in un pannello mentre si disegna, non a
un comando esplicito.

**«Disponi» (`L`)** ridispone tutto il diagramma con ELK (`layered`, dall'alto in basso) in un
worker, in un solo passo annullabile.

### Importa un database che esiste già

Incolla o carica un dump **PostgreSQL** o **MySQL/MariaDB**: si scelgono le tabelle e entrano nel
diagramma aperto in un solo passo annullabile, con le cardinalità dedotte dalle foreign key. Una
tabella già presente viene sostituita tenendo la sua posizione sul canvas, così un re-import dopo una
migrazione non scombina il lavoro di disposizione.

### Esporta

- **Immagini**: SVG e PNG del diagramma intero, più «Copia PNG» negli appunti. Escono sempre col tema
  chiaro — finiscono in README e PR, che hanno fondo chiaro — e col font incorporato nel file.
- **Testo**: DDL PostgreSQL, DDL MySQL e Mermaid `erDiagram` per l'ER; Mermaid `classDiagram` per le
  classi; Mermaid `flowchart LR` per il flowchart. Da copiare negli appunti o scaricare.

### Il documento è un file

Si apre e si salva come `.dd.json`, con la File System Access API dove c'è (handle riusato dai
salvataggi successivi) e con upload/download dove non c'è. `?fallback=1` forza il secondo percorso.

Sotto, come rete di sicurezza: **autosave in IndexedDB**, e al ritorno si riapre l'ultimo documento
com'era. Il file su disco resta la verità, l'archivio del browser è solo la rete.

Un documento lo scrive **una scheda sola**: le altre lo mostrano in sola lettura, con un avviso e un
pulsante «prendi il controllo» — la proprietaria fa un ultimo salvataggio prima di cedere, così non
si perde niente.

## Scorciatoie

| Tasti | Strumento |
|---|---|
| `V` | selezione |
| `E` | entità (ER) |
| `C` · `I` · `U` · `N` | classe · interfaccia · enum · nota di classe |
| `1`..`6` | forme del flusso (terminale, processo, decisione, input/output, sottoprocesso, nota) |
| `R` | Collega: il tipo di arco dipende dagli estremi |
| `F` · `L` | inquadra tutto · disponi |
| `⌘Z` · `⇧⌘Z` / `⌘Y` · `⌘D` · `⌫` | annulla · ripeti · duplica · elimina |
| `⌘S` · `⇧⌘S` · `⌘O` | salva · salva con nome · apri |
| `⌘=` · `⌘-` · `⌘0` · `⌘A` | zoom avanti · indietro · reset · seleziona tutto |
| `Esc` | deseleziona e torna alla selezione |

## Limiti noti

**Non c'è il sequence diagram.** La spec originale prevedeva quattro tipi: ne sono stati consegnati
tre — ER, class diagram e flowchart, e tutti e tre convivono in un solo documento (`doc.diagram = {
er, class, flow }`), non in tre file separati: `CanvasOps` smista ogni comando alla famiglia giusta
leggendo il prefisso `famiglia/` con cui ogni chiave del canvas nasce (`er/…`, `class/…`, `flow/…`).
La giuntura per aggiungerne un quarto esiste già (union sul tipo di diagramma, registro `kinds/`), ma
il lavoro non è fatto.

**È uno strumento da desktop.** Il canvas disabilita i gesti touch del browser: su tablet e telefono
non si usa. Sviluppato e collaudato su Chrome; su Firefox e Safari manca la File System Access API e
si cade sul percorso upload/download, che esiste ed è coperto dai test end-to-end ma non è provato a
mano su quei browser.

**Scala misurata fino a 600 entità**, con il criterio «p95 del tempo di frame ≤ 20 ms in build di
produzione» rispettato su tutti e sei gli scenari di gesto — vedi [la misura](docs/perf/2026-09-13-gate-verde.md).
Oltre non è misurato, e la misura è sull'ER: **il flowchart non è nel gate di prestazione**, vedi
[debito tecnico](docs/debito-tecnico.md).

Limiti puntuali, ciascuno con la sua ragione scritta:

- **Import DDL**: un vincolo `UNIQUE` su più colonne non è rappresentabile su un attributo e viene
  ignorato, con un avviso che dice quanti. In MySQL un `REFERENCES` senza lista di colonne fa
  rifiutare l'intero `CREATE TABLE` al parser di terze parti.
- **Class diagram**: i generici annidati non sono rappresentabili in Mermaid in nessuna codifica (si
  emette la forma meno peggio, con un avviso). Fuori scopo dichiarato: package, classi di
  associazione, classi annidate, PlantUML, generazione di codice, import da Mermaid o da codice
  sorgente, documenti multi-diagramma.
- **Flowchart**:
  - **Gli archi all'indietro passano sopra i nodi**: il router è ortogonale ma non evita gli
    ostacoli, e in un flowchart il ciclo è il caso normale, non quello raro che è in ER e class.
  - **Gli incroci sull'asse trasversale aumentano** rispetto a un layout senza corsie: è il prezzo
    di tenere ogni nodo nella corsia del suo attore — ELK dispone il flusso ignorando le corsie, e
    la sua riduzione degli incroci sull'asse trasversale si perde quando una banda lo corregge.
  - **Le corsie escono come riquadri in Mermaid**, non come bande orizzontali vere: Mermaid non ha
    un costrutto per bande, solo per contenitori annidati (`subgraph`). Avviso nel dialogo di
    export.
  - **Le note non escono in Mermaid**: entrerebbero nel flusso come un nodo qualunque e ne
    sposterebbero il layout, cioè mentirebbero. Avviso nel dialogo di export.
  - **Il rombo è grande** a parità di testo: deve contenere il rettangolo del testo lungo la
    diagonale, quindi occupa circa il doppio di un processo con lo stesso contenuto — le decisioni
    vanno scritte corte.
  - **Con due o più archi fra la stessa coppia di nodi, l'aggancio di una decisione esce dal
    rombo**: lo scarto di fascio fra archi paralleli sposta il punto di aggancio lungo il lato del
    rettangolo di ingombro, e per un rombo quel lato coincide con la sua punta solo esattamente al
    centro — la stessa classe di limite già accettata per il parallelogramma, che aggancia
    leggermente fuori dai suoi lati obliqui.

Tutto il resto sta in [debito tecnico](docs/debito-tecnico.md), che è il registro dei difetti noti e
delle semplificazioni accettate, con il motivo di ogni rinvio.

---

## Sviluppo

### Stack

- React 19 + TypeScript 6, build con Vite 8.
- **Zustand** (store vanilla, fuori da React) per lo stato del documento e della sessione, **Immer**
  per i comandi e per le patch di undo/redo — la storia non tiene snapshot del documento, tiene le
  patch e le loro inverse — **Zod** per lo schema del documento.
- Tailwind CSS 4 con shadcn/ui e Radix per la cornice dell'interfaccia.
- Canvas SVG scritto a mano, un componente React per nodo.
- Import DDL: `libpg-query` (WASM) per PostgreSQL, `node-sql-parser` per MySQL/MariaDB, in worker.
- Auto layout: `elkjs` in un worker. Le rotte degli archi non vengono da ELK: il router ortogonale le
  ricalcola dai rettangoli a ogni render, al worker si chiedono solo le posizioni dei nodi. La
  direzione è una proprietà del tipo di diagramma (ADR 0007): `DOWN` per ER e class diagram, `RIGHT`
  per il flowchart, che dispone lungo le sue corsie invece che verso il basso.
- Test con Vitest, lint con ESLint 10.

### Comandi

Richiede Node >= 22 e pnpm 10.

```bash
pnpm install   # installa le dipendenze
pnpm dev       # dev server Vite
pnpm build     # type check (tsc -b) + build di produzione
pnpm lint      # ESLint
pnpm test      # Vitest
```

Su ogni push su `master` e su ogni pull request, [la CI](.github/workflows/ci.yml) gira `lint`, `test`
e `build`. Gli altri due gate — `e2e` e `perf` — restano a mano: pilotano il Chrome di sistema e
misurano tempi di frame su un display reale, e su un runner condiviso darebbero rossi che non
significano niente. Il deploy su Vercel parte dal push: perché aspetti la CI va chiesto a Vercel
(Settings ▸ Git ▸ *Require checks to pass*), non al repository.

### Test end-to-end

```bash
pnpm e2e       # nove scenari provati in un browser vero
```

Compila una volta sola, poi avvia un solo `vite preview` e un solo Chrome di sistema headless
condivisi dai nove scenari, eseguiti in sequenza (mai in parallelo: la persistenza tocca il lock fra
schede e IndexedDB sulla stessa origine, e scenari concorrenti si disturberebbero a vicenda) —
ciascuno nel proprio contesto di browser, per isolare l'IndexedDB l'uno dall'altro:

- **Persistenza**: disegna un'entità, ricarica e la ritrova dal buffer IndexedDB, salva come
  download, apre un documento nuovo, ricarica il file e la ritrova, rifiuta un file non valido, apre
  una seconda scheda in sola lettura e le fa prendere il controllo. Gira su `?fallback=1` perché i
  dialoghi nativi della File System Access API non sono pilotabili da automazione — quel percorso
  resta una prova manuale.
- **Import DDL**: incolla un DDL, lo analizza, importa due entità e una relazione, annulla con ⌘Z e
  ritrova il canvas vuoto, poi re-importa due volte e verifica che la relazione non si duplichi.
- **Export immagini**: esporta SVG e PNG e copia il PNG negli appunti, col tema scuro attivo per
  provare che l'immagine esca comunque in chiaro. Sono le tre cose che senza un browser vero non
  esistono: il woff2 incorporato, i colori del tema letti con `getComputedStyle`, e la
  rasterizzazione dentro un `<img>`.
- **Export testo**: apre il dialog dalla voce di menu, controlla i tre formati, copia negli appunti e
  scarica.
- **Auto layout**: sposta un nodo dove il layout non lo metterebbe, clicca «Disponi», verifica che le
  posizioni cambino e che nessuna coppia di nodi si sovrapponga, poi annulla con ⌘Z. Insieme allo
  scenario del flowchart, è uno dei due soli collaudi che provano che **elkjs si carica davvero**: i
  test unitari usano un worker finto, quindi un bundle che non si risolve nel worker passerebbe tutta
  la suite e fallirebbe solo qui.
- **Class diagram**: crea due classi, apre l'editor dei membri con un doppio click sul corpo e ne
  verifica il commit sul blur (geometria compresa), scrive un testo non valido e verifica che
  l'editor resti aperto col testo intatto, collega le due classi con una generalizzazione e verifica
  che «Disponi» metta il padre sopra il figlio, poi esporta in Mermaid e verifica l'ordine dei lati
  nell'arco.
- **Nota**: crea una nota, ne commette il testo su due righe col blur, la trascina e la rimette con
  ⌘Z, la ancora a una classe con lo strumento relazione — verificando che il pannello dica
  «Ancoraggio nota» e non offra il menu «Tipo» — poi «Disponi» e verifica che non resti sotto nessun
  nodo, e infine verifica che esca come riga `note for` nell'export Mermaid.
- **Flowchart**: crea un flowchart, aggiunge una seconda corsia dal pannello, tre nodi di forme
  diverse (un terminale e un processo nella prima corsia, una decisione nella seconda), collega due
  nodi e scrive l'etichetta sull'arco col doppio click. «Disponi» verifica che ogni nodo stia nella
  banda della sua corsia e che nessuna coppia si sovrapponga — l'altro collaudo, insieme all'auto
  layout, che prova che elkjs si carica davvero. Poi trascina un nodo nell'altra corsia con eventi di
  mouse veri e verifica che ci resti, un solo ⌘Z lo rimette nella corsia di prima **e** dov'era —
  posizione e corsia sono un passo unico di undo (spec §6), ed è la sola asserzione di tutta la
  suite che li controlla insieme — e infine esporta in Mermaid e verifica che compaiano una
  `subgraph`, un rombo `{"…"}` e l'etichetta sull'arco.
- **Canvas misto**: crea un'entità, una classe e un nodo di flusso nello stesso documento e verifica
  che le chiavi del DOM portino il prefisso di famiglia, che «Collega» fra un'entità e una classe non
  crei niente mentre dentro la stessa famiglia colleghi (una seconda entità), che il documento misto
  sopravviva a un ricaricamento, che «Disponi» metta le tre famiglie in fila da sinistra a destra
  senza sovrapposizioni, e che «Esporta testo…» offra i formati di tutte e tre — PostgreSQL, MySQL,
  Mermaid ER, Mermaid classi, Mermaid flowchart.

Per lanciarne uno solo, dopo `pnpm build`: `node scripts/e2e/<nome>.mjs`.

`HEADLESS=0` per vedere il browser. Exit code 1 se un passo di uno dei nove scenari non regge.

### Misura prestazioni

```bash
pnpm perf [N]  # FPS a frame dipinti su un documento sintetico di N entità (default 300)
```

Costruisce la build di produzione, la serve con `vite preview` e guida il **Chrome di sistema** in
finestra visibile con eventi mouse reali, misurando il tempo fra frame consecutivi in cinque scenari
(drag, drag di tutta la selezione, pan, marquee, zoom) più il marquee su tutto il diagramma. Stampa
una tabella e il verdetto rispetto al criterio (p95 ≤ 20 ms, cioè ≥ 50 FPS), ed esce 1 se un solo
scenario lo sfonda: è un gate, non un rapporto.

Prerequisito: **Google Chrome installato** — i browser di Playwright non vengono scaricati. Durante
la misura la finestra di Chrome non va toccata né coperta: Chrome strozza i frame delle finestre
nascoste.

Risultati: [il gate verde](docs/perf/2026-09-13-gate-verde.md), e prima di quello
[la misura che lo trovò rosso](docs/perf/2026-09-06-fps-frame-dipinti.md).

### Documentazione

- [Spec di design](docs/superpowers/specs/2026-09-06-dev-designer-design.md) — architettura, stack e
  ordine di consegna
- [Spec: persistenza dei documenti](docs/superpowers/specs/2026-09-07-persistenza-design.md)
- [Spec: import DDL](docs/superpowers/specs/2026-09-08-import-ddl-design.md)
- [Spec: auto layout](docs/superpowers/specs/2026-09-09-auto-layout-design.md) — il §3 va letto prima
  di toccare `src/io/layout/`
- [Spec: export testo](docs/superpowers/specs/2026-09-09-export-testo-design.md)
- [Spec: class diagram](docs/superpowers/specs/2026-09-10-class-diagram-design.md) e il
  [primo giro di ampiezza](docs/superpowers/specs/2026-09-11-class-diagram-ampiezza-design.md)
- [Piani di implementazione](docs/superpowers/plans/)
- [Decisioni di architettura](docs/adr/) — sei ADR
- [Debito tecnico](docs/debito-tecnico.md) — difetti noti e semplificazioni accettate
- [Risultati dello spike](docs/superpowers/spikes/2026-09-06-spike-results.md)
