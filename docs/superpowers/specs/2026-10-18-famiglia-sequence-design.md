# Famiglia sequence: modello, canvas, import ed export di sequenceDiagram — design

Data: 2026-10-18
Mappa: [Mappa: import di state e sequence da Mermaid](https://github.com/alemian95/Dev-Designer/issues/21).
Ogni sezione rimanda al ticket che contiene la decisione e le alternative scartate.
Ricerca: [`docs/research/grammatica-state-sequence.md`](https://github.com/alemian95/Dev-Designer/blob/research/grammatica-state-sequence/docs/research/grammatica-state-sequence.md)
§2, sul branch `research/grammatica-state-sequence`, da non mergiare.
Prototipo del canvas: [`sequence.prototype.html`](https://github.com/alemian95/Dev-Designer/blob/prototype/sequence-canvas/src/ui/canvas/kinds/sequence.prototype.html)
sul branch `prototype/sequence-canvas`, anche questo da non mergiare.
Riferimenti: spec `2026-09-24-canvas-unificato-design.md` (qui «spec del canvas»), spec
`2026-10-18-import-state-e-registro-mermaid-design.md` (qui «spec 1»), ADR 0001, 0007, 0008; il lessico
(Sequenza, Partecipante, Passo, Messaggio, Nota di sequenza, Blocco, Sezione) è in `GLOSSARY.md`.

## 1. Obiettivo

Una famiglia nuova, `sequence`, nel canvas unificato. Una **sequenza** si importa da un
`sequenceDiagram`, si modifica sul canvas e nel pannello, ed esce sia come `sequenceDiagram` sia come
SVG. Nello stesso documento possono stare più sequenze, accanto alle altre famiglie.

Regole del committente:

- **Retrocompatibilità**: i documenti, gli import e gli export che esistono oggi non cambiano
  comportamento. La migrazione aggiunge soltanto una parte vuota.
- **Estendibilità**: la famiglia entra come voci nei registri che esistono già (`familyOps`, `viewFor`,
  il registro dei formati, il registro dell'import per famiglia). Dove oggi ci sono `if` sparsi, la
  famiglia nuova li rende visibili invece di aggiungerne altri (§9).

## 2. Confini

- **Dentro**: modello e migrazione (§3), canvas e pannello (§4), parser e map di `sequenceDiagram`
  (§5, §6), innesto (§7), export testo e SVG (§8), test (§10).
- **Fuori**:
  - i collegamenti tipizzati fra `sequence` e le altre famiglie: Collega non vale per le sequenze;
  - le attivazioni, `rect`, `box`, `create`/`destroy` come elementi del modello: si importano con avviso
    (§6);
  - l'import di più blocchi di un `.md` in un passo solo;
  - gli altri tipi Mermaid.

## 3. Modello ([Schema del modello sequence e della sua view](https://github.com/alemian95/Dev-Designer/issues/27))

### 3.1 Parte del documento

```ts
diagram.sequence = {
  model: { sequences: Record<uuid, Sequence> },
  view: { nodes: Record<uuid, NodeView> },   // NodeViewSchema comune; collapsed sempre false
}

Sequence = { title: string; autonumber: boolean; participants: Participant[]; steps: Step[] }
Participant = { id: uuid; name: string; label: string | null; kind: "participant" | "actor" }
Step =
  | { kind: "message"; id: uuid; from: uuid; to: uuid; text: string;
      line: "solid" | "dashed"; head: "none" | "filled" | "cross" | "open" | "double" }
  | { kind: "note"; id: uuid; placement: "left" | "right" | "over"; participants: [uuid] | [uuid, uuid]; text: string }
  | { kind: "block"; id: uuid; operator: "loop" | "alt" | "opt" | "par" | "critical" | "break";
      sections: { id: uuid; condition: string; steps: Step[] }[] }
```

- **Chiave della sequenza**: un uuid. Il titolo può essere vuoto e non è unico.
- **Ordine**: `participants` e `steps` sono array ordinati, perché l'ordine è il significato:
  colonne da sinistra a destra, passi dall'alto in basso. Nessun partecipante e nessun passo ha una
  posizione.
- **Partecipante**: ha un `id` stabile. `name` è il nome Mermaid, unico nella sequenza, ed è quello
  che usa l'export. Rinominare cambia solo `name`.
- **Passi e sezioni** hanno un uuid, che serve a selezione, trascinamento, pannello e undo. I
  riferimenti ai partecipanti vanno per id.
- **Dimensione**: la `view` tiene solo la posizione della sequenza. La dimensione si ricava dal
  contenuto (§4.1), come per entità e classi.

### 3.2 Àncore delle Note

Una Nota della famiglia note può ancorarsi:

- alla sequenza intera, con `sequence/<sequenza>`;
- a un partecipante, con `sequence/<sequenza>/<partecipante>`, dove `<partecipante>` è l'id.

`splitKey` taglia al primo `/`, quindi la chiave interna resta intatta. Eliminare la sequenza o il
partecipante stacca la Nota, come succede oggi per gli altri elementi. Rinominare il partecipante non
tocca l'àncora. Per il canvas, il partecipante è un sotto-elemento della sequenza: la linea
d'ancoraggio parte dal rettangolo della sua intestazione (§4.1).

### 3.3 Invarianti

Ognuna è un `IssueCode` nuovo, come nelle altre famiglie: si segnala, ma non rende illeggibile il file.

- Un messaggio o una nota di sequenza che punta a un partecipante inesistente.
- Una nota di sequenza con zero partecipanti, o con più di due; con due partecipanti quando
  `placement` non è `over`; con due partecipanti uguali.
- Sezioni per operatore: `loop`, `opt` e `break` ne hanno esattamente una; `alt`, `par` e `critical`
  almeno una.
- `name` ripetuto nella sequenza.
- `name` vuoto, oppure con un carattere fra `< > : , ; + ( ) \ /`, che Mermaid non accetta in un nome
  (§8.1).
- Id ripetuto fra partecipanti, passi e sezioni della stessa sequenza.

### 3.4 Migrazione 8 → 9

- `SCHEMA_VERSION = 9`.
- `[8, addSequences]` aggiunge la parte vuota **letterale**
  `sequence: { model: { sequences: {} }, view: { nodes: {} } }`, sul modello di `addShapes`.
- `"sequence"` va **in fondo** a `FAMILIES`. Così l'ordine di layer, Disponi ed export delle famiglie
  che esistono già non cambia.
- Un documento salvato con la versione 9 non si apre con una build precedente: `runMigrations` rifiuta
  i file più recenti, come già succede oggi.

## 4. Canvas e pannello ([Come sta e si modifica un sequence sul canvas](https://github.com/alemian95/Dev-Designer/issues/26))

### 4.1 Disegno

Una sequenza è **un nodo unico**. Il suo interno si dispone da solo, a partire dall'ordine:

- una colonna per partecipante, larga quanto basta per l'etichetta, oppure per il nome se l'etichetta
  manca;
- un attore si disegna come omino, un partecipante come riquadro;
- le linee di vita scendono dall'intestazione fino in fondo;
- una riga per passo: un messaggio a sé stesso è più alto, i blocchi sono riquadri con l'operatore in
  alto a sinistra e le sezioni separate da linee tratteggiate con la condizione, e un blocco
  annidato si restringe di qualche pixel per ogni livello;
- `autonumber` numera i messaggi;
- la cornice porta l'etichetta «sd <titolo>».

Le metriche partono da quelle del prototipo (`colsOf`, `rowH`, `layoutAuto`) e si fissano nel piano.
Una funzione pura `sequenceLayout(seq): SequenceLayout` restituisce colonne, righe, blocchi e punti di
inserimento. La usano il disegno, l'hit-test, l'SVG e il calcolo della dimensione.

### 4.2 Interazione

| Gesto | Effetto |
|---|---|
| trascinare la cornice o l'etichetta «sd» | sposta la sequenza (`view.nodes`) |
| trascinare l'intestazione di un partecipante | lo riordina |
| trascinare un passo o l'etichetta di un blocco | lo riordina, anche dentro o fuori da un blocco o da una sezione; una linea mostra dove cade |
| trascinare da una linea di vita a un'altra | crea un messaggio (`solid`, `filled`, testo vuoto) nel punto di rilascio |
| trascinare da una linea di vita alla stessa | crea un messaggio a sé stesso |
| clic | seleziona un partecipante, un passo o un blocco; la sequenza intera si seleziona dalla cornice |
| doppio clic su un testo | lo modifica sul posto: nome o etichetta, testo di messaggio o nota, condizione |

Il **pannello delle proprietà** cambia con la selezione:

- **sequenza**: titolo, `autonumber`, «+ partecipante»;
- **partecipante**: nome (rifiuta i nomi del §3.3), etichetta, genere;
- **messaggio**: testo, linea, punta, mittente, destinatario;
- **nota di sequenza**: testo, lato, uno o due partecipanti;
- **blocco**: operatore, condizioni, «+ sezione»/«− sezione» dove l'operatore lo permette.

In più ci sono le azioni «+ messaggio dopo», «+ nota dopo», «Avvolgi in blocco» ed «Elimina».
Eliminare un partecipante elimina anche i passi che lo coinvolgono e stacca le Note ancorate. Cambiare
l'operatore di un blocco con più sezioni verso `loop`, `opt` o `break` fonde le sezioni nella prima.
Questa è una mia scelta: la mappa non lo prevede.

Ogni gesto è un solo comando annullabile.

### 4.3 Disponi e strumenti

- **Disponi**: ogni sequenza è un blocco della fila, come le altre famiglie. L'interno non passa da
  ELK e non cambia. `layoutGraph` dà nodi senza archi, con le dimensioni ricavate.
- **Strumento** nella sidebar: «Sequenza». Crea una sequenza con due partecipanti, `A` e `B`, e un
  messaggio. La scorciatoia è unica nella sidebar (spec del canvas §6); va scelta nel piano.
- **Collega** non vale per le sequenze, salvo che per ancorare una Nota.

## 5. Parser (ricerca §2)

Il parser segue lo stesso schema degli altri (spec 1 §4): `sequence-parse.ts` produce un
`SequenceAst`, `sequence-map.ts` produce un `SequenceFragment`. È sincrono e scritto a mano.

Fatti della grammatica di `mermaid@12.2.0` che il parser deve rispettare:

- **Separatori**: un a capo o un `;` chiudono l'istruzione, anche dopo un alias, una nota, un titolo
  o la condizione di un blocco.
- **Commenti**: `#…` e `%…` (anche un `%` singolo all'inizio di un token) vanno fino a fine riga; anche
  `%%` dopo un carattere apre un commento.
- **Testo dopo `:`**, in messaggi e note: arriva fino a `#`, `;` o fine riga, e il resto è commento.
  Dentro il testo restano `%`, `%%`, gli altri `:`, `<br>`, `<`, `>` e `"`. Il testo si ripulisce dagli
  spazi in testa e in coda. Un `:` senza testo dopo è valido (testo vuoto); un messaggio senza `:` è
  un errore.
- **Nomi**: ammettono spazi interni, `-` e Unicode; sono vietati `< > : , ; + ( ) \ /`. Gli spazi
  attorno a frecce e `:` si ignorano.
- **Alias** (`participant A as Nome`): le virgolette restano letterali, come in Mermaid; `#` tronca.
- **Ridichiarazione**: vince l'ultima dichiarazione, mentre la posizione resta quella della prima.
  Un partecipante non dichiarato nasce `participant` dove compare la prima volta.
- **Parole chiave**: maiuscole e minuscole non contano (`note`/`Note`, `loop`/`LOOP`), come nel lexer.
- **Entità** `#59;`, `#35;` e simili, e `<br>`: si decodificano come nel flowchart, con `<br>` che
  diventa un a capo.

Gli errori sono solo quelli che dà Mermaid ([Perimetro v1 della famiglia sequence](https://github.com/alemian95/Dev-Designer/issues/25)):

- `end` mancante, oppure `end` senza un blocco aperto;
- una freccia illeggibile;
- un messaggio senza `:`;
- `deactivate` di un partecipante non attivo;
- `create` senza il messaggio richiesto subito dopo;
- un partecipante in due `box`;
- `else`, `and` o `option` sotto l'operatore sbagliato.

## 6. Mappatura ([Perimetro v1 della famiglia sequence](https://github.com/alemian95/Dev-Designer/issues/25))

Il risultato è un `SequenceFragment`, cioè una `Sequence` con chiavi del testo (i nomi) al posto degli
id. Gli id li assegna `prepare` (§7). Gli avvisi sono aggregati per categoria.

| Mermaid | Sequenza |
|---|---|
| `participant` / `actor`, `as` | partecipante con `kind` e `label` (l'alias) |
| messaggio con una delle 10 frecce classiche | `line` × `head`, con la tabella del §8.1 |
| mezze frecce (type 41–58) | la freccia classica `filled` con la stessa linea, con avviso. È una mia scelta di «classica più vicina» |
| connessione centrale `()`, prefisso `wrap:`/`nowrap:` | tolti, il messaggio resta, con avviso |
| `Note left of / right of / over A[,B]` | nota di sequenza |
| `loop`/`alt`/`opt`/`par`/`critical`/`break` | blocco; `else`/`and`/`option` aprono le sezioni |
| `par_over` | `par`, con avviso |
| `autonumber` | `true`. Con inizio o passo, oppure `off` a metà: vale il primo `autonumber`, numerato da 1 a passo 1, con avviso |
| `title` | `title` della sequenza ([Schema del modello sequence e della sua view](https://github.com/alemian95/Dev-Designer/issues/27) corregge #25) |
| `activate`/`deactivate`, `+`/`-` sulle frecce | scartati, i messaggi restano, con avviso |
| `rect` | sparisce; i suoi passi restano dove si trovava, con avviso |
| `box` | sparisce; i partecipanti restano, con avviso |
| `create`/`destroy` | il partecipante è presente per tutta la sequenza, con avviso |
| `participant X@{ "type": … }` | `participant`, con avviso; `"alias"` diventa etichetta se manca `as` |
| `link`, `links`, `properties`, `details`, `accTitle`, `accDescr` | scartati, con avviso |
| `%%`, front-matter, `%%{init}%%` | ignorati senza avviso |

## 7. Innesto ([Secondo import di una sequenza](https://github.com/alemian95/Dev-Designer/issues/29))

- **Identità**: la sequenza importata si aggiunge sempre, con uuid nuovi per sequenza, partecipanti,
  passi e sezioni. Importare di nuovo lo stesso testo la duplica, come succede per il flusso.
- **Un blocco Mermaid dà una sequenza.** I blocchi di un `.md` si importano uno alla volta, con il
  selettore che c'è già.
- **Posizione**: la sequenza va sotto tutto il contenuto esistente, all'origine di `placeNew`
  (`originBelow`), senza passare da ELK. Tutto avviene in un solo comando annullabile.
- **Registri** (spec 1 §3):
  - `sequenceDiagram: format({ keywords: ["sequenceDiagram"], label: "sequence", named: "un sequenceDiagram", family: "sequence", analyse })`.
  - `FragmentByFamily` riceve `sequence: SequenceFragment`.
  - La voce `sequence` del registro dell'import per famiglia ha questi campi:
    - `fates = {}`;
    - `importable` vale 1, oppure 0 se non ci sono partecipanti;
    - `noun: "sequenza"`;
    - `summary`: `N partecipanti, M messaggi, K blocchi`, più `, J note` se ci sono note di sequenza;
    - `report`: `Importata <strong>1</strong> sequenza con <strong>N</strong> partecipanti e <strong>M</strong> messaggi.`
  - Il pulsante dice `Importa 1 sequenza`, e il dialog non cambia. Se servisse codice per la famiglia
    nel dialog, va corretto il registro.

## 8. Export ([Export sequenceDiagram e round-trip](https://github.com/alemian95/Dev-Designer/issues/28))

### 8.1 Testo

`emitSequenceMermaid(seq, notes): EmitResult` restituisce il testo e gli avvisi, nell'ordine:

1. `sequenceDiagram`;
2. `title <testo>` se il titolo non è vuoto, `autonumber` se vale `true`;
3. tutti i partecipanti, in ordine: `participant <name>` o `actor <name>`, più ` as <etichetta>` se
   c'è un'etichetta;
4. i passi, con due spazi di rientro per livello.

| Punta | Continua | Tratteggiata |
|---|---|---|
| `none` | `->` | `-->` |
| `filled` | `->>` | `-->>` |
| `cross` | `-x` | `--x` |
| `open` | `-)` | `--)` |
| `double` | `<<->>` | `<<-->>` |

- **Messaggio**: `A->>B: testo`; un testo vuoto esce come `A->>B:`.
- **Nota di sequenza**: `Note left of A: …`, `Note right of A: …`, `Note over A: …`,
  `Note over A,B: …`.
- **Blocco**:
  - l'operatore esce con la condizione della prima sezione;
  - le sezioni seguenti diventano `else` (alt), `and` (par) o `option` (critical);
  - si chiude con `end`;
  - una condizione vuota lascia solo la parola chiave.
- **Testi** (etichette, messaggi, note, condizioni, titolo):
  - `;` diventa `#59;`, `#` diventa `#35;` e un a capo diventa `<br>`;
  - niente virgolette, perché Mermaid le terrebbe come testo.
- **Nome non valido** (§3.3), raggiungibile solo da un JSON modificato a mano: esce come id sicuro
  `p1`, `p2`…, con il nome come etichetta e un avviso.
- **Note della famiglia note** ancorate a una sequenza o a un partecipante: non escono, e c'è un avviso,
  come per il flowchart.

### 8.2 Dialog dell'export testo

`TextExportDialog` riceve il formato «Mermaid (sequenza)», associato alla famiglia `sequence`:

- con una sola sequenza esce un `.mmd`;
- con più di una esce un `.md`: un blocco ```` ```mermaid ```` per sequenza, ognuno preceduto da
  `## <titolo>` (o `## Sequenza N` se il titolo è vuoto), nell'ordine delle chiavi.

L'import legge già i blocchi di un `.md`. Come per le altre famiglie, `MODEL_LIMITS` dice cosa si perde.

### 8.3 SVG

L'export SVG riusa il disegno della famiglia sul canvas (§4.1), come fanno tutte le altre famiglie:
il layout interno è uno solo. Vanno aggiunte le voci di `nodeModelsOf`, `edgeModelsOf` e
`viewNodesOf` in `src/ui/export/svg.tsx`.

### 8.4 Garanzia di round-trip

Per ogni modello valido, export seguito da import ridà lo stesso modello a meno degli uuid, compresi i
testi con `;`, `#` e gli a capo. Le sole eccezioni sono gli spazi ai bordi dei testi, che Mermaid
toglie, e i nomi non validi del §8.1.

## 9. Punti da toccare

Il precedente da seguire è l'aggiunta di `shape` (commit `8286102`). La famiglia nuova passa da:

- **switch e `Record` esaustivi**, dove tsc segnala la famiglia mancante:
  - `familyOps` (`editor/kinds/ops.ts`);
  - `viewFor` e `FAMILY_LABEL` (`ui/canvas/kinds/registry.ts`);
  - `nodeModelsOf`, `edgeModelsOf` e `viewNodesOf` (`ui/export/svg.tsx`);
  - `nameEditorFor` (`ui/canvas/InlineEditor.tsx`);
  - `anchorExists` (`model/note/validate.ts`);
  - `endExists` (`model/links/validate.ts`): una sequenza non è mai estremo di un collegamento;
  - `FAMILY_NOUN` (`editor/links/commands.ts`);
  - `DiagramSchema` e `createDocument` (`model/document.ts`);
  - i `Record` di `TextExportDialog`.
- **`if` non esaustivi**, da controllare a mano. Il piano decide, per ciascuno, se trasformarlo in una
  voce di registro (regola di estendibilità) o se lasciarlo con un test che copra la famiglia nuova:
  - `use-canvas-interaction.ts` (doppio clic);
  - `links/labels.ts` (`endName`);
  - `canvas-ops.ts` (rami di note e shape);
  - `Canvas.tsx` (gli editor di testo montati a mano);
  - `svg.tsx` (pool).
- **Àncora su un sotto-elemento**: oggi un'àncora punta a un nodo del canvas. `sequence/<seq>/<p>` è il
  primo caso di sotto-elemento. `anchorsTouching`, `nodeRects`/`rectOf` e le porte devono saper dare il
  rettangolo dell'intestazione del partecipante.
- **IssueCode**: le invarianti del §3.3.

## 10. Test

- **Modello**:
  - lo schema zod accetta il modello e rifiuta le forme sbagliate;
  - un test di validazione per ogni invariante del §3.3;
  - la migrazione 8 → 9 su un documento della versione 8 dà la parte vuota e lascia identico il resto.
- **Layout**: `sequenceLayout` su sequenze tipiche (messaggi, messaggio a sé stesso, blocchi
  annidati, sezioni vuote) dà colonne e righe nell'ordine giusto e senza sovrapposizioni.
- **Comandi**:
  - riordino di un partecipante e di un passo, anche dentro e fuori dai blocchi;
  - creazione di un messaggio;
  - eliminazione di un partecipante, con i passi che lo coinvolgono e le Note ancorate;
  - «Avvolgi in blocco»;
  - cambio di operatore;
  - ogni comando si annulla con un solo undo.
- **Parser**: da fixture a `SequenceAst`, con le regole del §5 (`;` e `#` nei testi, commenti, alias
  fra virgolette, ridichiarazione, parole chiave in maiuscolo) e gli errori con la riga.
- **Map**: da `SequenceAst` a `SequenceFragment` più avvisi, con un test per ogni riga del §6.
- **Oracolo** `mermaid@12`, nella suite jsdom esistente: ogni fixture accettata dal nostro parser è
  accettata anche da `mermaid.parse()`. Il frammento si confronta con:
  - `getActors()`, per ordine, nome, etichetta e genere;
  - `getMessages()`, ripiegata in blocchi con le coppie di inizio e fine e decodificata dai segnaposto.

  Restano fuori i costrutti persi con avviso.
- **Round-trip**: per ogni fixture, import → export → `mermaid.parse()` accetta → import ridà lo stesso
  modello a meno degli uuid (§8.4). Lo stesso giro parte anche da modelli costruiti a mano, con testi
  che contengono `;`, `#` e a capo.
- **Export**: le 10 frecce, i blocchi annidati, le Note scartate con avviso, più sequenze in un `.md`.
- **Linearità**: 5.000 messaggi restano entro un tempo proporzionale, come per gli altri parser.
- **Retrocompatibilità**: tutti i test esistenti restano verdi e l'e2e esistente passa senza modifiche.
- **E2E**: uno scenario `sequence` in `scripts/e2e/`:
  - crea una sequenza con lo strumento, aggiunge un messaggio, riordina un partecipante e annulla;
  - importa la sequenza del redattore della mappa ed esportala in testo;
  - fa il round-trip in un documento con più sequenze.

## 11. Moduli

```
src/model/sequence/        schema.ts (Sequence, Step…, emptySequenceDiagram), validate.ts
src/model/migrations.ts    [8, addSequences]
src/editor/sequence/       commands.ts, layout.ts (sequenceLayout), geometry.ts
src/editor/sequence-access.ts
src/editor/kinds/sequence.ts           DiagramOps
src/ui/canvas/kinds/sequence.tsx       DiagramView
src/ui/panels/SequenceProperties.tsx
src/io/mermaid/sequence-parse.ts, sequence-map.ts, sequence-fixtures.ts
src/io/emit/sequence-mermaid.ts
```

Nomi e confini definitivi si fissano nel piano.

## 12. Rilascio

- **Passi manuali**: nessuno, perché l'app è solo frontend. `mermaid` resta fra le `devDependency`.
- **Formato del documento**: passa da 8 a 9. Un documento aperto e salvato con la versione nuova non si
  apre più con una build precedente. È il comportamento già previsto da `runMigrations`, e va scritto
  nelle note di rilascio.

Ordine di consegna, con ogni passo verde e committabile da solo:

1. modello, validazione e migrazione, ancora senza UI: la famiglia esiste vuota in tutti i registri
   esaustivi;
2. `sequenceLayout` e disegno di sola lettura sul canvas e nell'SVG;
3. comandi e interazioni del §4.2, poi il pannello;
4. strumento nella sidebar e àncore delle Note sui partecipanti;
5. parser e map di `sequenceDiagram`, poi le voci nei due registri dell'import;
6. export testo e dialog, poi round-trip e oracolo;
7. e2e.

## 13. Da verificare nel piano

- Le metriche del layout, prese dal prototipo e aggiornate allo stile del canvas.
- La scorciatoia dello strumento, unica nella sidebar.
- Per ogni `if` non esaustivo del §9: diventa una voce di registro o resta con un test.
- Come `rectOf`, `outlineOf` e le porte espongono il rettangolo di un partecipante per le àncore.
- Il trascinamento con la linea d'inserimento: con quale meccanismo dell'interazione del canvas si
  innesta, cioè come `commitDrag` o come un drag interno al nodo.
- L'elenco esatto degli avvisi aggregati e dei loro testi, sul modello di `FlowMapCategory`.
- Le mie scelte segnate qui sopra:
  - le mezze frecce importate come `filled`;
  - le sezioni fuse nella prima quando l'operatore cambia;
  - la sequenza creata dallo strumento;
  - `## Sequenza N` per un titolo vuoto.
