# Import Mermaid — design

Data: 2026-10-15
Mappa: [Mappa: import da Mermaid](https://github.com/alemian95/Dev-Designer/issues/1). Ogni sezione
rimanda al ticket che contiene la decisione e le alternative scartate.
Ricerca: [`docs/research/parser-mermaid.md`](https://github.com/alemian95/Dev-Designer/blob/research/parser-mermaid/docs/research/parser-mermaid.md)
sul branch `research/parser-mermaid`, da non mergiare.
Prototipo del dialog: branch `prototype/dialog-import-mermaid`, commit `a16d158`, da non mergiare.
Riferimenti: ADR 0001, 0002, 0003, 0007; spec `2026-09-08-import-ddl-design.md`.

## 1. Obiettivo

Portare un diagramma Mermaid esistente dentro il documento aperto senza ridisegnarlo. Si incolla o si
carica il testo di un `erDiagram`, un `classDiagram` o un `flowchart`/`graph`. Gli elementi entrano in
un solo passo annullabile, e un'entità o una classe già presente viene sostituita tenendo la posizione,
come nell'import DDL.

Si accetta anche il Mermaid scritto a mano o prodotto da altri strumenti, per i costrutti che il modello
sa rappresentare. Il resto genera avvisi. Il round-trip export → import è la garanzia minima, e lo
coprono i test.

## 2. Confini

- **Dentro**: le tre famiglie che hanno già un export (`src/io/emit/*-mermaid.ts`), le note di
  `classDiagram`, la disposizione degli elementi nuovi, il dialog.
- **Fuori**: gli altri tipi Mermaid (sequence, state, gantt…), PlantUML, le forme generiche, gli export
  nuovi. Un testo con un tipo diverso dai tre è un errore, non un avviso.

## 3. Flusso dei dati

```
testo (.mmd, .md, incollato)
  │  blocks()             → blocchi ```mermaid di un .md, o il testo intero
  │  detect()             → famiglia, dalla prima parola utile dopo front-matter e %%
  ▼
parse<Famiglia>(text)     → AST Mermaid della famiglia + ParseWarning sintattici   (main thread, sincrono)
  ▼
map<Famiglia>(ast)        → frammento del modello (+ note) + ParseWarning semantici
  ▼
layout del frammento      → posizioni (ELK, ripiego sulla griglia)                 (asincrono, worker ELK esistente)
  ▼
importMermaid<Famiglia>(frammento, posizioni, occupied)  → Recipe, un solo dispatch
```

### 3.1 Parser ([Parser per l'import Mermaid](https://github.com/alemian95/Dev-Designer/issues/2))

Il parser è **scritto a mano**, uno per famiglia, sul sottoinsieme che il modello rappresenta, e non ha
dipendenze a runtime. Il pacchetto `mermaid` è escluso: costa 361 KB gzip in ESM e 1,49 MB nel formato
`iife` dei worker Vite, senza DOM non legge class e flowchart, e l'unica API che restituisce il db è
interna e deprecata. `@mermaid-js/parser` non copre nessuna delle tre famiglie.

### 3.2 Dove gira ([Dove gira il parser Mermaid](https://github.com/alemian95/Dev-Designer/issues/8))

Il parser gira sul **main thread, in modo sincrono**, con l'interfaccia `parse(text) → risultato`. Non
servono worker, timeout o `dispose`: al loro posto c'è un test di linearità su un input grande
(5.000 nodi). Se un giorno servisse, passare al worker unico dell'ADR 0002 non cambia l'interfaccia.

### 3.3 Due strati per famiglia ([Rappresentazione intermedia](https://github.com/alemian95/Dev-Designer/issues/3))

Ogni famiglia ha due strati, nella forma dell'ADR 0001:

- **parser → AST Mermaid**, fedele al testo: estremi sinistro e destro con il token della testa, id
  grezzi, membri già spezzati, subgraph annidati come nel testo. Non conosce il modello.
- **map → frammento del modello**: applica le regole del §4 e non conosce né la sintassi né il
  documento aperto.

Non c'è un'IR condivisa fra le famiglie. Un **modulo comune** contiene `blocks()`, `detect()`, la
decodifica delle entità `#…;` (con nome e numeriche) e la lettura delle stringhe fra virgolette e fra
backtick. Lo usano tutti e tre i parser.

**Avvisi**: il parser segnala i costrutti sintattici scartati o non riconosciuti, con il numero di riga.
Il map segnala le perdite semantiche. Il tipo è `ParseWarning` dell'import DDL, e gli avvisi sono
aggregati per categoria come negli export.

**Errori**: un errore strutturale (graffa non chiusa, `end` mancante, freccia illeggibile) fa fallire
tutto il testo e indica la riga. Non c'è recupero parziale.

**Ignorati senza avviso**, in tutte e tre le famiglie: i commenti `%%` e il front-matter `config`.

## 4. Mappatura

### 4.1 `erDiagram` → `ErModel` ([Mappatura di erDiagram](https://github.com/alemian95/Dev-Designer/issues/4))

| Mermaid | Modello |
|---|---|
| `A <card>--<card> B` | `target` = A (sinistra, padre), `source` = B (destra, figlio), sempre. La cardinalità di ogni lato si legge dal marcatore accanto alla sua entità |
| `--` / `..` | `identifying: true` / `false` |
| cardinalità, simboli e parole (`only one`, `zero or one`, `one or more`, `zero or many`, `1`, `0+`, `1+`, `many(0)`, `many(1)`…) | i quattro valori di `CardinalitySchema`; `}\|` e `one or more` → `many`. L'elenco esatto viene dalla grammatica; una forma senza equivalente → avviso |
| `: "etichetta"` | `name`; vuota o assente → `name` assente |
| colonne della relazione | `attributes: []` su entrambi i lati, cioè «disegnata a mano» per l'ADR 0003 |
| `"pub.utenti"` | si spezza sul **primo** punto: schema `pub`, nome `utenti` |
| `CUSTOMER["Cliente"]` | il nome è l'id; l'alias → avviso |
| `tipo nome PK,FK,UK` | `type` verbatim, flag delle chiavi; `nullable = !primaryKey` |
| commento dell'attributo | avviso |
| entità che compare solo in una relazione | entità senza attributi |
| blocchi ripetuti | attributi concatenati nell'ordine in cui compaiono |
| attributo duplicato | si tiene il primo; avviso |
| `style`, `classDef`, `:::`, `direction`, `accTitle`/`accDescr`, `title` | avviso |

### 4.2 `classDiagram` → `ClassModel` + note ([Mappatura di classDiagram](https://github.com/alemian95/Dev-Designer/issues/5))

**Verso**: il lato con la **testa** è il `target`, comunque sia scritta la riga (`A <|-- B` ≡ `B --|> A`).
Il triangolo e la freccia indicano il padre, l'interfaccia o la dipendenza; il rombo indica il tutto.

| Token | `kind` |
|---|---|
| `--\|>` | generalization |
| `..\|>` | realization |
| `--*`, `..*` | composition |
| `--o`, `..o` | aggregation |
| `-->` | association, `navigable: true` |
| `..>` | dependency |
| `--` | association |
| `..` | association, con avviso |
| due teste (`<\|--\|>`, `*--o`), lollipop (`()--`) | scartata, con avviso |

**Membri**:

- visibilità da `+ - # ~`; senza simbolo → `public`;
- un membro con `(` è un metodo;
- attributi `tipo nome` oppure `nome: tipo`;
- metodi `nome(parametri) Ritorno`, con parametri `tipo nome`, `nome: tipo` o solo `nome`;
- `$` → statico, `*` → astratto; `*` su un attributo → avviso;
- i generici a tilde tornano tra `<>`.

**Il resto**:

- **Stereotipi**: `interface`, `abstract`, `enumeration`/`enum`, senza distinzione fra maiuscole e
  minuscole; qualsiasi altro → `class`, con avviso.
- **Classi generiche** (`class Square~Shape~`): il nome è `Square`, il parametro → avviso.
- **Estremi**: la molteplicità fra virgolette va al capo vicino; `role: ""`; `: etichetta` → `name`.
- **Note**: `note "…"` → nota libera, `note for X "…"` → nota ancorata a `class/X`. Si decodificano
  `#amp;` `#lt;` `#gt;` `#quot;`, e `<br>` diventa un a capo. Una `note for` su una classe inesistente
  diventa una nota libera, con avviso.
- **Scartati con avviso**: `namespace` (appiattito: le classi entrano), le etichette `class A["…"]`,
  `classDef`, `style`, `cssClass`, `:::`, `click`, `callback`, `link`, `direction`. I nomi fra backtick
  si leggono senza backtick.
- **Unioni**: blocchi ripetuti e righe `Classe : membro` si uniscono in ordine. Un attributo omonimo
  tiene il primo, con avviso. Per i metodi conta la firma (nome e tipi dei parametri), quindi
  l'overloading resta. Una classe che compare solo in una relazione diventa una classe vuota con
  stereotipo `class`.

### 4.3 `flowchart`/`graph` → `FlowModel` ([Mappatura di flowchart](https://github.com/alemian95/Dev-Designer/issues/6))

**Forme**

| Mermaid | `shape` |
|---|---|
| `A`, `A[…]` | process |
| `([…])`, `(…)`, `((…))`, `(((…)))` | terminal |
| `{…}` | decision |
| `[/…/]`, `[\…\]` | io |
| `[[…]]` | subprocess |
| `@{ shape: … }` | per nome: `stadium`/`terminal`, `rect`/`proc`, `diamond`/`decision`, `lean-r`/`lean-l`/`in-out`, `subproc`/`fr-rect` |
| ogni altra forma | process, con avviso |

**Archi**

- `-->`, `--->`, `-.->`, `==>` → un arco; lo stile di linea si perde, con avviso.
- `---`, `-.-`, `===`, `<-->`, `--o`, `--x` → un arco nel verso in cui è scritto, con avviso.
- `~~~` → scartato.
- Etichette `-->|t|` e `-- t -->`. Le catene e `&` si espandono in tutti gli archi.

**Subgraph**

- Un subgraph di primo livello diventa un **pool**, i suoi figli diventano **corsie**.
- I nodi diretti di un pool vanno in una corsia implicita con il nome del pool. Un pool senza figli ha
  una sola corsia.
- Oltre il secondo livello, i nodi vanno nella corsia antenata, con avviso.
- Un nodo dichiarato in più subgraph resta nel primo, con avviso.
- Gli archi da o verso un subgraph sono scartati, con avviso.
- Il nome di pool e corsie è il titolo, oppure l'id.

**Direzione**: `TD`/`TB`/`BT`/`RL`/`LR` e le `direction` interne si ignorano (ADR 0007). L'avviso compare
solo quando la direzione non è `LR`.

**Testo**

- Si decodificano le entità con nome e numeriche; `<br>` e `<br/>` diventano un a capo.
- Le stringhe markdown perdono i backtick esterni, con avviso.
- `fa:fa-…` resta testo.
- Un nodo senza etichetta prende l'id come etichetta.

**Scartati con avviso**: `classDef`, `class`, `:::`, `style`, `linkStyle`, `click`, id e animazioni degli
archi.

## 5. Innesto nel documento ([Identità e sostituzione](https://github.com/alemian95/Dev-Designer/issues/7))

Un comando per famiglia, sul modello di `importEr` (`src/editor/commands/import.ts`), restituisce una
`Recipe` pura. Le posizioni gli arrivano già calcolate, e tutto l'import è **un solo dispatch**.

- **Entità e classi**: l'identità è la chiave (`schema.nome` per le entità, il nome per le classi).
  Quella presente viene **sostituita per intero** e **tiene la posizione**. Il testo è la verità per
  quell'elemento: un'entità nata dal DDL e re-importata da Mermaid perde la nullabilità vera e le
  colonne delle relazioni.
- **Nominati solo in una relazione**: un'entità o una classe che il testo nomina solo in una relazione,
  senza dichiararla, e che è già nel documento, non si sostituisce: il testo non dice niente del suo
  contenuto, e la sostituzione la svuoterebbe. Il dialog la mostra come *identica, saltata*. Una nuova
  entra vuota, come da §4.1 e §4.2. Decisione del 2026-10-15, dopo la revisione dell'import delle classi.
- **Relazioni ER e di classe**: una relazione in arrivo identica a una presente si salta. Il confronto
  è su estremi, cardinalità o molteplicità, specie, nome e `identifying`/`navigable`. Non si pota
  niente, quindi re-importare lo stesso testo non cambia nulla. Una relazione modificata compare
  accanto alla vecchia.
- **Note delle classi**: una nota con testo e àncora uguali a una presente si salta.
- **Flowchart**: si aggiunge sempre. Nodi, archi, pool e corsie ricevono chiavi nuove (uuid). Re-importare
  lo stesso flowchart lo duplica.
- **Il resto non si tocca**: gli elementi assenti dal testo e le altre famiglie restano com'erano. I
  collegamenti fra famiglie (`links`) e le note ancorate a un elemento sostituito sopravvivono, perché
  la chiave non cambia.

## 6. Disposizione ([Posizionamento](https://github.com/alemian95/Dev-Designer/issues/9))

- Gli elementi **nuovi** passano per il grafo di «Disponi» della famiglia (`layoutGraph`,
  `flowLayoutGraph`), costruito sul **solo frammento**. Il blocco risultante si trasla sotto tutto il
  contenuto del canvas, con l'origine di `placeNew`.
- Per pool e corsie nuovi si costruisce un `FlowDiagram` temporaneo con il solo frammento e gli si
  applica la pipeline di «Disponi» del flowchart, con i minimi `POOL_MIN_W` e `LANE_MIN_H`.
- Se ELK fallisce o scade, si ripiega sulla griglia di `placeNew`, estesa alle tre famiglie. L'import va a
  buon fine, con un avviso.
- Gli elementi sostituiti restano dove sono, anche se le relazioni verso i nuovi diventano lunghe.

## 7. Dialog ([Dialog dell'import Mermaid](https://github.com/alemian95/Dev-Designer/issues/10))

Una voce di menu separata, **«Importa Mermaid…»**, accanto a «Importa DDL…», disabilitata in sola
lettura. Il dialog è gemello di `ImportDdlDialog`.

1. Si incolla il testo o si carica un file `.mmd`, `.mermaid`, `.md` o `.txt`.
2. Se il `.md` contiene più blocchi `mermaid`, un **selettore di blocco** mostra il tipo rilevato di
   ciascuno; all'apertura è selezionato il primo.
3. «Analizza» produce un riepilogo con la famiglia e i conteggi, gli avvisi (con la riga quando c'è) e la
   lista degli elementi con l'esito previsto: *nuovo*, *sostituisce*, *identico, saltato*.
4. Entità e classi hanno una casella; gli elementi identici partono deselezionati. Relazioni e note
   entrano solo se tutti i loro estremi sono scelti o sono già nel documento. Il **flowchart** non ha
   caselle e si importa intero.
5. Un errore strutturale mostra la riga e disabilita «Importa». «Importa N elementi» chiude con lo
   stesso riepilogo finale del DDL.

## 8. Test

- **Parser**: per famiglia, `fixture → AST` atteso, con le varianti di sintassi delle tabelle del §4 e
  gli errori strutturali con il numero di riga.
- **Map**: `AST → frammento + avvisi`, con un test per ogni riga delle tabelle del §4.
- **Round-trip**: per ogni famiglia, `modello → emit → parse → map` restituisce il modello, a meno di ciò
  che Mermaid non porta (nullabilità, colonne delle relazioni, ruoli, posizioni). È lo schema di
  `src/io/emit/round-trip.test.ts`.
- **Oracolo**: `mermaid@12` come `devDependency`, in una sola suite con `// @vitest-environment jsdom`
  nel file. Ogni fixture accettata dal nostro parser deve essere accettata anche da `mermaid.parse()`, e
  ogni export deve superare `mermaid.parse()`. La suite chiude anche il punto non misurato sul `|` in
  `flow-mermaid.ts`.
- **Linearità**: un input da 5.000 nodi resta entro un tempo proporzionale.
- **Comandi**: sostituzione con conservazione della posizione, deduplica di relazioni e note, flowchart
  aggiunto, un solo undo.
- **E2E**: uno script in `scripts/e2e/` per famiglia, come quelli dell'export.

## 9. Moduli

```
src/io/mermaid/
  common.ts            blocks, detect, entità, stringhe
  er-parse.ts          → ErAst          er-map.ts      → ErModel
  class-parse.ts       → ClassAst       class-map.ts   → ClassModel + note
  flow-parse.ts        → FlowAst        flow-map.ts    → FlowModel
src/editor/commands/   importMermaidEr, importMermaidClass, importMermaidFlow (accanto a importEr)
src/ui/import/ImportMermaidDialog.tsx
```

Nomi e confini definitivi si fissano nel piano.

## 10. Rilascio

Non servono passi manuali: l'app è solo frontend, `mermaid` entra solo fra le `devDependency` e il
formato del documento non cambia, quindi non c'è nessuna migrazione.

## 11. Da verificare nel piano

- L'elenco esatto delle forme di cardinalità ER e dei nomi `@{ shape: … }`, preso dalla grammatica di
  `mermaid@12.2`.
- Come la pipeline di «Disponi» del flowchart accetta un `FlowDiagram` temporaneo (§6).
- La regola di decodifica dei generici a tilde annidati (`Map~string, List~int~~`).
- L'ordine di consegna: una famiglia per volta, partendo dall'ER, che è la più piccola.
