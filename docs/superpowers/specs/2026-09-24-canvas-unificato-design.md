# Canvas unificato — design (step 2a)

Data: 2026-09-24
Branch: `feat/canvas-unificato`
Spec di riferimento: `2026-09-06-dev-designer-design.md`, `2026-09-07-persistenza-design.md`,
`2026-09-10-class-diagram-design.md`, `2026-09-21-note-ancorate-design.md`, `2026-09-22-flowchart-design.md`
Sottosistema: il documento smette di avere un tipo. Entità, classi e nodi di flusso convivono sullo
stesso canvas, ognuno con la propria semantica.

## 1. Obiettivo

Oggi un documento è un diagramma di **un** tipo: ER, class diagram o flowchart. L'obiettivo è un
canvas unico in cui gli elementi delle tre famiglie stanno **insieme**. Non stanno in riquadri
separati, stanno mescolati. Resta però il valore del progetto: ogni famiglia mantiene i suoi
vincoli, la sua validazione e il suo export. Il risultato è simile a draw.io, ma con elementi
specifici invece che generici.

Il lavoro è diviso in step. Ogni step va sul branch in uno stato che funziona:

| Step | Contenuto | Stato |
|---|---|---|
| 1 | Strumenti in una sidebar a sinistra | fatto (`34ee84d`) |
| **2a** | **Le tre famiglie nello stesso documento e nello stesso canvas** | **questa spec** |
| 2b | Corsie facoltative: nodi di flusso liberi, corsie dentro pool delimitati | spec a parte |
| 3 | Elementi generici (rettangolo, ellisse, testo, freccia) e nota unica | spec a parte |
| 4 | Collegamenti **tipizzati** fra famiglie, con regole di validazione | spec a parte |

Il 2a lascia le corsie come sono oggi, cioè bande orizzontali. In questo modo la migrazione e il
nuovo modello si stabilizzano senza cambiare nello stesso momento anche la semantica del flowchart.

## 2. Confini

Il 2a **non** fa queste cose:

- **Collegamenti fra famiglie.** Collega fra un'entità e una classe non crea niente. Arrivano con lo
  step 4, come collegamenti tipizzati. Nel 2a gli archi esistono solo dentro una famiglia.
- **Pool e nodi di flusso senza corsia** (2b). Ogni nodo di flusso ha ancora una corsia, e
  `lanes.min(1)` resta com'è.
- **Nota unica** (step 3). La nota ancorabile del class diagram e la nota-forma del flowchart
  restano due strumenti diversi.
- **Layout che conosce le relazioni fra famiglie.** Senza collegamenti fra famiglie non ci sono
  relazioni da rispettare.

## 3. Il modello

### Il documento

Il `diagram` a union discriminata diventa un oggetto con una parte per famiglia:

```ts
diagram: {
  er:    { model: ErModel,    view: ErView }
  class: { model: ClassModel, view: ClassView }
  flow:  { model: FlowModel,  view: FlowView }
}
```

- Gli schemi di ogni parte sono quelli di oggi, senza il campo `type`: `ErDiagramSchema.omit({ type: true })`
  e lo stesso per le altre due. **I modelli interni non cambiano.**
- Le tre parti sono **sempre presenti**. Una famiglia senza elementi ha una parte vuota: nessun
  campo facoltativo, e quindi nessun `?.` sparso nel codice. La parte `flow` vuota ha comunque una
  corsia, perché lo vuole `lanes.min(1)` (§5 dice quando la banda si vede).
- `Family = "er" | "class" | "flow"`, con l'ordine canonico `FAMILIES = ["er", "class", "flow"]`
  definito in un solo punto (`src/model/document.ts`). Tutto ciò che scorre le famiglie usa questa
  costante: layer, layout, export, validazione.
- `createDocument(name, id?)` è l'unico modo di creare un documento e restituisce le tre parti
  vuote. `createErDocument`, `createClassDocument` e `createFlowDocument` spariscono. I loro usi
  (circa 110, quasi tutti nei test) vanno sostituiti meccanicamente.

### Gli accessor

`erDiagram(doc)`, `classDiagram(doc)` e `flowDiagram(doc)` restituiscono `doc.diagram.er`, `.class`
e `.flow`. Non sollevano più eccezioni: la parte c'è sempre. Il tipo restituito ha la stessa forma
`{ model, view }` di oggi, quindi **i comandi di famiglia** (`commands/er.ts`, `class/commands.ts`,
`flow/commands.ts`) **non cambiano**. È il punto su cui poggia tutto lo step.

I comandi di vista condivisi (`commands/view.ts`: `moveNodes`, `setCollapsed`, `applyLayout`) oggi
leggono "la" vista del documento. Ricevono la famiglia come primo argomento.

## 4. La giuntura composta

### Due livelli

- **`DiagramOps`** (per famiglia) resta il contratto di oggi, invariato. `erOps`, `classOps` e
  `flowOps` continuano a lavorare con chiavi senza prefisso.
- **`CanvasOps`** (nuovo, `src/editor/kinds/canvas-ops.ts`) è l'unico punto con cui parlano il
  canvas e le azioni condivise. Espone gli stessi metodi con **chiavi con prefisso**. Il suo compito
  è passare ogni chiamata alla famiglia giusta e rimettere il prefisso sulle chiavi che tornano
  indietro. `opsFor(doc)` viene sostituito da `canvasOps(doc)` in tutti i chiamanti (`actions.ts`,
  `interaction-runner.ts`, `layout-actions.ts`, export SVG, pannelli).

### Le chiavi

- Una chiave con prefisso ha la forma `${family}/${key}`, per esempio `er/public.utenti`,
  `class/Ordine`, `flow/n3`.
- Per separarla si taglia al **primo** `/`. Il nome della famiglia non contiene mai `/`, quindi una
  chiave interna che contiene `/` resta intatta.
- `qualify(family, key)` e `splitKey(prefixed)` stanno in un solo modulo. Nessun altro file
  costruisce o spezza chiavi a mano.
- **Regola di confine:** i moduli di famiglia (comandi, `DiagramOps`, validatori, emettitori,
  pannelli delle proprietà, viste dei nodi) non vedono mai il prefisso. Lo tolgono `CanvasOps` e
  il contesto di famiglia della UI (§5).

Selezione, editing inline, `dom-registry` e obiettivi dei problemi lavorano sulle chiavi con
prefisso: `selId("node", "er/utenti")` diventa `node:er/utenti`.

### I metodi composti

| Metodo | Comportamento |
|---|---|
| `nodeKeys()` | Concatena le chiavi di tutte le famiglie, con prefisso, nell'ordine di `FAMILIES`. |
| `rectOf`, `edgeGeometry` | Passa la chiamata alla famiglia della chiave. |
| `edgesTouching(keys)` | Divide le chiavi per famiglia, chiama ogni famiglia e unisce i risultati con prefisso. |
| `addNode(at, family, variant?)` | Riceve la famiglia esplicitamente: la porta lo strumento (§6). |
| `addEdge(source, target)` | Stessa famiglia: passa la chiamata a quella famiglia. Famiglie diverse: `null`, e il gesto non produce niente (step 4). |
| `deleteItems`, `duplicateNodes` | Dividono le chiavi per famiglia e producono **una sola recipe** che esegue in sequenza quelle delle famiglie sullo stesso draft, quindi un solo passo di annulla. `duplicateNodes` restituisce le nuove chiavi con prefisso. |
| `commitDrag(keys, dx, dy)` | Per ogni famiglia usa il suo `commitDrag` (oggi lo ha solo il flowchart), altrimenti `moveNodes(family, …)`. Una sola recipe. |
| `validate()` | Unisce i problemi di tutte le famiglie, con `node` ed `edge` con prefisso. |
| `layoutGraph` / `layoutRecipe` | Vedi §7. |

## 5. Canvas

### I layer

Dal basso verso l'alto:

1. le bande delle corsie;
2. gli archi, famiglia per famiglia nell'ordine di `FAMILIES`;
3. i nodi, nello stesso ordine.

Gli archi stanno tutti sotto tutti i nodi, così un arco ER non copre una classe.

Ogni layer di famiglia è avvolto in un `FamilyContext` (React) che dà il nome della famiglia. Le
viste dei nodi e degli archi, gli editor inline e la registrazione nel `dom-registry` lo usano per
aggiungere e togliere il prefisso. Le viste pure (`NodeView`/`EdgeView`, usate anche da `buildSvg`)
continuano a ricevere chiavi senza prefisso tramite le prop, e il contesto dà loro solo la famiglia.
Si usa un contesto e non una prop perché la famiglia servirebbe a una catena di componenti
(layer, vista, editor) che non ne fanno altro che passarla avanti.

### Le bande delle corsie

`LanesLayer` si monta **solo se la parte `flow` ha almeno un nodo**. Così un documento con sole
entità non mostra una "Corsia 1" sullo sfondo. Le bande mantengono la semantica di oggi: occupano
tutta la larghezza, e un nodo di flusso appartiene alla corsia in cui cade. Entità e classi
possono stare sopra una banda senza appartenerle: le corsie esistono solo per la famiglia `flow`.
Questo è un limite accettato del 2a (§12) e sparisce con i pool del 2b.

## 6. Strumenti e scorciatoie

- `ToolDef` guadagna il campo `family: Family | null`, e lo strumento attivo nella sessione diventa
  `{ tool, family, variant }`. «Seleziona» e «Collega» hanno `family: null`, perché non creano nodi.
  `addNode` riceve la famiglia da qui.
- **Un solo strumento per collegare**, «Collega» (`R`). Le tre voci Relazione/Arco di oggi
  spariscono. Il tipo di arco dipende dagli estremi (§4): entità–entità dà una relazione ER,
  classe–classe una relazione fra classi, nota–classe un ancoraggio, nodo–nodo di flusso un arco
  di flusso.
- La sidebar raggruppa gli strumenti per famiglia, con un separatore, nell'ordine di `FAMILIES`:
  «Seleziona» in cima, «Collega» in fondo. Ogni gruppo è un `role="group"` con `aria-label` (ER,
  Classi, Flusso).
- Le scorciatoie devono essere **uniche su tutta la sidebar**. Un unit test lo verifica sulla lista
  completa degli strumenti.

| Famiglia | Strumento | Tasto |
|---|---|---|
| — | Seleziona | V |
| ER | Entità | E |
| Classi | Classe | C |
| Classi | Interfaccia | I |
| Classi | Enum | **U** (oggi è E, in conflitto con Entità) |
| Classi | Nota | N |
| Flusso | Terminale, Processo, Decisione, Input/Output, Sottoprocesso, Nota | 1–6 |
| — | Collega | R |

- Anche le etichette devono essere uniche, perché sono i nomi accessibili: le due note diventano
  «Nota di classe» e «Nota di flusso». Gli e2e che cercano `{ name: "Nota" }` vanno aggiornati.

## 7. Disponi

ELK applica una sola direzione a tutto il grafo, e oggi quella direzione è una proprietà del tipo
di diagramma (ADR 0007). Quindi:

1. Per ogni famiglia con **almeno un nodo** si costruisce il suo `layoutGraph()`, con la direzione
   che ha oggi, e lo si manda al worker. Le chiamate partono in parallelo.
2. **Tutto o niente:** se una delle chiamate fallisce non si applica niente, come oggi.
3. Ogni risultato forma un blocco. Si calcola il suo riquadro, lo si trasla in modo che il bordo in
   alto sia a `y = 0`, e i blocchi si mettono in fila da sinistra a destra nell'ordine di
   `FAMILIES`, separati da `LAYOUT_FAMILY_GAP` (una costante in `src/editor/`). Una famiglia con un
   solo nodo è un blocco di un nodo: ELK non la riceve e il nodo viene solo traslato.
4. Il risultato è **una sola recipe**. Per il flusso si usa `layoutRecipe` sulle posizioni già
   traslate, così le bande vengono riscritte come oggi.
5. «Disponi» è attivo quando il canvas ha almeno due nodi in totale.

La funzione che dispone i blocchi è pura: riceve i riquadri e restituisce le traslazioni, ed è
testata da sola.

## 8. Export e import

- **SVG/PNG:** esportano tutto il canvas. `buildSvg` scorre `FAMILIES` con lo stesso ordine dei
  layer di §5.
- **«Esporta testo…»:** i formati proposti sono l'unione dei `textFormats` delle famiglie **che
  hanno contenuto**: DDL PostgreSQL/MySQL ed `erDiagram` se ci sono entità, `classDiagram` se ci
  sono classi, `flowchart` se ci sono nodi di flusso. Gli emettitori ricevono il modello della loro
  famiglia, come oggi, e non cambiano. Un documento vuoto non propone formati e il dialogo lo dice.
- **«Importa DDL…»:** sempre attivo, tranne in sola lettura. Aggiunge entità alla parte `er`.
  La regola "solo ER" di `DocumentMenu` sparisce.

## 9. File, menu, migrazione

- **Menu:** «Nuovo» diventa una voce sola, «Nuovo documento». `DocumentIo.newDocument(type?)`
  diventa `newDocument()`, e `blankDocument` sparisce.
- **`hasContent`** (in `document-io.ts`) diventa "almeno un elemento in una qualsiasi famiglia".
- **Migrazione 2 → 3:** `SCHEMA_VERSION` passa a 3. La migrazione è una funzione pura nella
  tabella `migrations`:
  - `{ type: "er", model, view }` diventa `{ er: { model, view }, class: vuota, flow: vuota }`;
  - lo stesso per `class` e `flow`.

  Le parti vuote sono letterali JSON nella migrazione, non chiamate a `createDocument`. Una
  migrazione descrive il formato della versione 3 e non deve cambiare se in futuro cambia il
  default di `createDocument`.
- **Compatibilità:** un file vecchio si apre, un file nuovo non si apre in una versione vecchia
  dell'app. Lo garantisce già il controllo `version > target` di `runMigrations`. Lo stesso vale per
  i buffer in IndexedDB, che passano da `parseDocument`.

## 10. Pannelli

- **Proprietà:** `PropertiesPanel` guarda la famiglia della selezione, se la selezione è un nodo o
  un arco solo, e monta il pannello di quella famiglia dentro il suo `FamilyContext`. Per ogni
  famiglia, `Properties` riceve le chiavi senza prefisso dal contesto.
- **Senza selezione:** si mostra il testo generico e, sotto, il pannello delle corsie
  (`EmptyProperties` del flusso) se la parte `flow` ha almeno un nodo.
- **Problemi:** una lista unica con i problemi di tutte le famiglie, da `CanvasOps.validate()`.
  Il clic su un problema seleziona la chiave con prefisso.

## 11. Test

**Unit:**
- `canvas-ops`: `qualify`/`splitKey` si invertono l'una con l'altra, anche con una chiave interna
  che contiene `/`. L'instradamento di ogni metodo. `addEdge` fra famiglie diverse restituisce
  `null`. `deleteItems` e `duplicateNodes` su una selezione mista danno un passo di annulla e
  chiavi con prefisso. `validate` mette il prefisso.
- Migrazione: un documento v2 per ognuno dei tre tipi arriva alla v3 e supera lo schema. Un
  documento v3 senza migrazioni viene restituito così com'è.
- Layout: la disposizione a blocchi (fila, margine, allineamento in alto, famiglia con un solo
  nodo). Una chiamata al worker che fallisce non applica niente.
- Strumenti: tasti ed etichette unici su tutta la sidebar.
- Export: formati di testo proposti in base al contenuto.

**E2E:**
- Si aggiornano gli scenari che usano «Nuovo ▸ …» e quelli che cercano lo strumento «Nota» o le
  vecchie voci Relazione/Arco.
- Uno scenario nuovo, `misto.mjs`: un'entità, una classe e un processo nello stesso documento; una
  relazione ER e un arco di flusso; Collega fra entità e classe non crea niente; salva, ricarica,
  Disponi (tre blocchi in fila, senza sovrapposizioni), «Esporta testo…» con i formati delle tre
  famiglie.

## 12. Limiti che il 2a accetta

- Le bande delle corsie attraversano tutto il canvas, anche sotto entità e classi (§5). Le
  risolvono i pool del 2b.
- Le note restano due (§6). Le unifica lo step 3.
- Disponi mette le famiglie una accanto all'altra e non ragiona sulla loro vicinanza (§7). Dopo lo
  step 4 si può rivalutare con il layout gerarchico di ELK.

## 13. Decisioni prese nel brainstorming

| Domanda | Scelta | Scartato |
|---|---|---|
| Frame affiancati o elementi mescolati? | Mescolati, e collegabili (step 4) | Frame per tipo |
| Grafo generico o unione di famiglie? | Unione di famiglie | Grafo generico: avrebbe richiesto di riscrivere modelli, validatori, emettitori e chiavi ER, e si sarebbe persa la specificità |
| Collegamenti fra famiglie | Tipizzati, con regole (step 4) | Solo visivi |
| Corsie nel canvas misto | Facoltative, dentro pool (2b) | Bande su tutto il canvas come soluzione definitiva |
| Uno step unico o 2a/2b? | Separati: prima il modello, poi la semantica delle corsie | Tutto insieme |
