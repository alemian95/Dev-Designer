# Import DDL — design

Data: 2026-09-08
Spec di riferimento: `docs/superpowers/specs/2026-09-06-dev-designer-design.md` (§4.4)
Spike che lo precede: `docs/superpowers/spikes/2026-09-06-spike-results.md` (sezioni B e C)
Sottosistema: `io/ddl` più un comando in `editor` e un dialog in `ui`. L'auto
layout con ELK resta fuori: è un sottosistema a sé, con spec e piano propri.

## 1. Obiettivo

Portare uno schema SQL esistente dentro un diagramma ER senza ridisegnarlo a
mano. Si incolla o si carica un `pg_dump` o un `mysqldump`, si scelgono le
tabelle, e sul canvas compaiono entità con attributi, chiavi e relazioni con
cardinalità dedotte dalle foreign key.

Lo spike ha già dato il verdetto **go** su entrambi i parser e ha verificato sui
dump reali dell'utente i percorsi dell'AST, il caricamento del WASM e le
trappole dei due formati. Questo design non riparte da zero: raccoglie quelle
conclusioni e chiude i punti che lo spike aveva esplicitamente rimandato.

## 2. Confini

L'import **produce solo il modello**: entità, attributi, relazioni. Della `view`
riempie le sole posizioni delle entità nuove, con una disposizione
deterministica a griglia. Non c'è auto layout, non ci sono punti di piega
calcolati: il routing ortogonale già esistente si arrangia come fa oggi.

L'import **atterra sempre nel documento aperto**, come un comando qualunque:
una sola `dispatch`, quindi un solo ⌘Z lo annulla per intero. Chi vuole un
documento pulito fa Nuovo prima. Il caso «documento vuoto» è lo stesso codice,
semplicemente senza collisioni.

## 3. Flusso dei dati

```
testo SQL
  │  detect.ts            → dialetto preselezionato
  ▼
parse-client.ts  ──postMessage──▶  parse.worker.ts
  │                                   │ import() dinamico
  │                                   ├─ pg.ts     (libpg-query)
  │                                   └─ mysql.ts  (node-sql-parser)
  │                                   │ entrambi usano sql-text.ts
  ◀──────────── ParseResult ──────────┘
  │
  │  scelta delle tabelle nel dialog
  ▼
map.ts                → entità, relazioni, warning
  ▼
editor/commands/import.ts  → una Recipe, una dispatch, un undo
```

Il worker è **unico** e carica l'adapter del dialetto con `import()` dinamico.
Due worker separati raddoppierebbero il protocollo dei messaggi e la
protezione (`onerror`, timeout, `terminate`) senza guadagnare nulla: lo
splitting dei chunk resta lazy per dialetto perché è `import()` a produrlo, non
il numero di file worker. Chi importa Postgres non scarica `node-sql-parser`.

Il parse sta in un worker e non sul thread principale nonostante i numeri dello
spike (136 ms su 200 tabelle) perché serve poter **annullare**, e perché un dump
completo con i dati — quello che si incolla per sbaglio — è di un altro ordine
di grandezza. Il ponteggio del worker è una quarantina di righe.

I file, con una responsabilità ciascuno:

| file | responsabilità |
|---|---|
| `src/io/ddl/schema.ts` | la rappresentazione intermedia e i tipi condivisi |
| `src/io/ddl/sql-text.ts` | lo scanner del testo SQL |
| `src/io/ddl/detect.ts` | rilevamento del dialetto |
| `src/io/ddl/pg.ts` | AST di libpg-query → IR |
| `src/io/ddl/mysql.ts` | AST di node-sql-parser → IR |
| `src/io/ddl/parse.worker.ts` | il worker unico, con `import()` dell'adapter |
| `src/io/ddl/parse-client.ts` | lato main: ciclo di vita e protezione del worker |
| `src/io/ddl/map.ts` | IR + tabelle scelte + modello corrente → entità e relazioni |
| `src/editor/commands/import.ts` | la recipe dell'import e `placeNew` |
| `src/ui/import/ImportDdlDialog.tsx` | il dialog |

## 4. Rappresentazione intermedia

Il fulcro è una rappresentazione neutra rispetto al dialetto. Non è astrazione
speculativa: senza di essa l'inferenza delle cardinalità, il calcolo di
`identifying` e la costruzione delle `entityKey` andrebbero scritti e testati
due volte, uno per AST. Ed è la cucitura giusta per i test — `fixture .sql → IR
atteso` è un test leggibile, `fixture .sql → ErModel` no.

```ts
export interface SqlColumn {
  name: string
  /** Tipo come lo scrive il dialetto d'origine, ricomposto: `varchar(255)`, `bigint(20) unsigned`. */
  type: string
  nullable: boolean
}

export interface SqlForeignKey {
  /** Nome del vincolo, se il DDL lo dà. */
  name?: string
  columns: string[]
  refSchema?: string
  refTable: string
  refColumns: string[]
}

export interface SqlTable {
  name: string
  schema?: string
  columns: SqlColumn[]
  /** Vuoto se la tabella non ha PRIMARY KEY. */
  primaryKey: string[]
  /** Ogni vincolo UNIQUE come lista di colonne. */
  unique: string[][]
  foreignKeys: SqlForeignKey[]
}

export interface ParseWarning {
  message: string
  /** Offset nel testo, quando il parser lo dà (`sqlDetails` di libpg-query). */
  at?: number
}

export interface ParseResult {
  tables: SqlTable[]
  warnings: ParseWarning[]
  /** Statement riconosciuti e non usati, contati per tipo: `{ IndexStmt: 8, CreateSeqStmt: 9 }`. */
  skipped: Record<string, number>
}
```

`type` è la stringa del dialetto, come `AttributeSchema.type` (`z.string()`)
impone. Ricomposta, non normalizzata fra dialetti: da `libpg-query` si toglie il
prefisso `pg_catalog.` e restano `varchar(255)`, `numeric(10,2)`, `timestamp
with time zone`; da `node-sql-parser` si compone `dataType` minuscolo più
`length`/`scale` più `suffix`, e resta `bigint(20) unsigned`. Nessuna tabella di
conversione: `character varying` diventa `varchar` perché è così che il parser
di Postgres lo nomina, non per una scelta mia.

## 5. Scanner del testo SQL

`sql-text.ts` è un solo scanner a stati con due consumatori. Lo spike ha chiesto
questa cosa due volte con nomi diversi — filtrare i meta-comandi psql «fuori dai
literal» per Postgres, e spezzare gli statement MySQL «in modo consapevole di
stringhe e `DELIMITER`» — e sono lo stesso problema.

```ts
/** Toglie le righe di meta-comando psql fuori dai literal. Ritorna l'SQL e i comandi rimossi. */
export function stripPsqlMeta(sql: string): { sql: string; removed: string[] }

/** Spezza in statement rispettando stringhe, identificatori quotati, commenti e DELIMITER. */
export function splitStatements(sql: string): string[]

/** Spoglia il commento eseguibile che racchiude un chunk: da `/*!40101 X` fino alla chiusura resta `X`. */
export function stripExecutableComments(chunk: string): string
```

Lo scanner attraversa il testo un carattere alla volta con questi stati: codice,
stringa `'…'`, stringa `"…"`, identificatore `` `…` ``, dollar-quote
`$tag$…$tag$` di Postgres, commento di riga `-- …`, commento a blocchi `/* … */`
annidabile. Riconosce il raddoppio dell'apice (`''`) e l'escape con backslash.

I meta-comandi psql sono un **insieme chiuso** — `\restrict`, `\unrestrict`,
`\connect`, `\c`, `\.`, `\echo`, `\set`, `\unset`, `\i`, `\ir`, `\if`, `\else`,
`\endif`, `\encoding` — riconosciuto a inizio riga e solo in stato codice.
Tagliare ogni riga che comincia per `\`, come faceva lo spike, romperebbe una
stringa che contiene un backslash a capo.

`stripExecutableComments` **spoglia** il commento eseguibile invece di scartare
il chunk: `mysqldump` racchiude in `/*!NNNNN … */` e `/*M!NNNNN … */` anche DDL
che serve. Lo spike scartava 90 chunk su 139 del dump reale in silenzio.

Con uno splitting consapevole delle stringhe, incollare un dump **con i dati**
non produce più un errore di sintassi al primo `;` dentro un `INSERT`: gli
`INSERT` diventano statement ignorati e contati, come tutto il resto.

## 6. Rilevamento del dialetto

`detect.ts` conta gli indizi nei primi kilobyte del testo:

- Postgres: `-- PostgreSQL database dump`, `SET standard_conforming_strings`,
  `pg_catalog.`, `\restrict`, `OWNER TO`, `::` di cast, dollar-quote.
- MySQL: `-- MySQL dump`, `/*!40101`, `/*M!`, `ENGINE=`, `AUTO_INCREMENT`,
  identificatori fra backtick.

Vince il punteggio più alto; a pari merito o senza indizi, Postgres, perché
`libpg-query` è il parser che regge meglio lo SQL standard scritto a mano. Il
risultato **preseleziona** il `ToggleGroup` del dialog e resta correggibile: su
un dump vero non decidi niente, su uno snippet incollato decidi tu.

## 7. Gli adapter

Entrambi hanno la stessa firma, `(ddl: string) => ParseResult`, e sono **puri**:
nessun DOM, nessun worker, nessuna I/O. Si testano in Node.

`pg.ts` passa il testo per `stripPsqlMeta` e poi lo dà **tutto intero** a
`parse()` di libpg-query, che digerisce un `pg_dump` completo in un colpo: qui
non serve spezzare gli statement. Poi due passate. Prima i `CreateStmt`, che
danno tabelle, colonne, tipi e i vincoli scritti in linea (`PRIMARY KEY`,
`UNIQUE`, `REFERENCES`, `NOT NULL`). Poi gli `AlterTableStmt`, dove nei
`pg_dump` finisce la maggior parte dei vincoli — 32 statement su 85 nel dump
reale dello spike — per gli `ADD CONSTRAINT` di PK, UNIQUE e FK e per gli
`ALTER COLUMN SET NOT NULL`. Un `ALTER` su una tabella non raccolta diventa un
warning. Ogni altro tipo di nodo si conta in `skipped` sotto il proprio nome
(`IndexStmt`, `CreateSeqStmt`, …).

`mysql.ts` invece deve spezzare, perché `astify` accetta uno statement o una
lista, non un dump con i suoi meta-comandi: `splitStatements`, poi
`stripExecutableComments` su ogni chunk, poi `astify` con `database: "MySQL"`.
Nei `mysqldump` i vincoli stanno dentro il `CREATE TABLE` e si leggono dai
percorsi che lo spike ha verificato sull'output vero; si gestiscono anche gli
`ALTER TABLE ADD CONSTRAINT`, che alcune varianti emettono a parte. Un chunk che
non parsa diventa un warning con il suo messaggio di sintassi, non un
fallimento dell'intero import: è la tolleranza che la spec §4.4 chiede.

L'entry è `node-sql-parser/build/mysql`, non `build/mariadb`: lo spike aveva
lasciato aperto il confronto, ma `build/mysql` ha parsato il 100% (49/49) degli
statement di un dump **MariaDB** reale, compresi i 25 `CHECK (json_valid(...))`
che erano il rischio principale. Un secondo dialetto non guadagna niente e
aggiunge un bivio.

## 8. Mapping verso il modello ER

```ts
export interface MapInput {
  /** Solo le tabelle scelte nel dialog. */
  tables: SqlTable[]
  /** Il modello corrente: serve a risolvere i riferimenti verso entità già sul canvas. */
  model: ErModel
}

export interface MapOutput {
  /** Chiave = entityKey, come impone il refine di ErModelSchema. */
  entities: Record<string, Entity>
  /** Lista, non record: le chiavi si assegnano dentro la recipe (§9). */
  relationships: Relationship[]
  warnings: string[]
}

export function mapToEr(input: MapInput): MapOutput
```

**Tabella → entità.** `name` e `schema` (assente se il DDL non qualifica, come
nei `mysqldump`), attributi nell'ordine del DDL.

**Colonna → attributo.**

| campo | regola |
|---|---|
| `name` | nome della colonna |
| `type` | la stringa del dialetto, §4 |
| `primaryKey` | la colonna è nella PRIMARY KEY |
| `nullable` | `NOT NULL` assente **e** colonna non in PK — in entrambi i dialetti la PK implica NOT NULL, e MySQL non scrive `NOT NULL` sulle colonne di PK |
| `unique` | esiste un vincolo UNIQUE la cui lista di colonne è esattamente questa colonna |
| `foreignKey` | la colonna compare fra le colonne locali di una FK, anche se poi la relazione cade |

**Foreign key → relazione.** `source` è il lato figlio (chi ha la FK), `target`
il padre: l'ordine che `RelationshipSchema` già documenta.

| | valore | perché |
|---|---|---|
| cardinalità su `target` | `one` se tutte le colonne FK sono NOT NULL, `zero-or-one` se una è nullabile | una FK nullabile è un padre opzionale |
| cardinalità su `source` | `zero-or-many`, ma `zero-or-one` se le colonne FK sono PK o UNIQUE nel figlio | riconosce le 1:1 vere, frequenti nei dump reali |
| `identifying` | colonne FK ⊆ PK del figlio, con PK non vuota | la definizione standard |
| `name` | nome del vincolo, se c'è | `fk_orders_customer_id` è informativo |
| `source.attributes` | colonne locali | |
| `target.attributes` | colonne referenziate | |

**Risoluzione della tabella referenziata.** Con lo schema esplicito la chiave è
`schema.tabella`. Senza — il caso dei `mysqldump`, dove `db` è sempre `null` —
si cerca il nome fra le tabelle importate e fra le entità già nel modello: se
esattamente una lo porta, è quella; se più di una lo porta con schemi diversi,
la relazione cade con un warning che dice l'ambiguità. Le FK auto-referenziate
non hanno bisogno di casi speciali.

**FK verso una tabella non selezionata e non presente**: la relazione non viene
creata, l'attributo resta marcato `foreignKey`, e un warning elenca le FK
cadute. È coerente con la validazione live, che già segnala le «FK senza
destinazione», e lascia libero di importare solo il pezzo che interessa.

**Cosa si perde**, aggregato in un riepilogo e non in un warning per statement:
viste e viste materializzate, sequenze, indici non unici, trigger, funzioni,
tipi ed enum, commenti, grant, policy, partizioni, vincoli `CHECK`, valori
`DEFAULT`, azioni `ON DELETE`/`ON UPDATE`, `INSERT` e dati. Più i **vincoli
UNIQUE su più colonne**, che il modello non ha dove mettere: è l'unica perdita
d'informazione che vale la pena dichiarare esplicitamente all'utente, e ottiene
una riga di warning con il conteggio, non una per vincolo.

## 9. Il comando

Vive in `editor/commands/import.ts`, come `commands/er.ts`: `io/ddl` produce
dati puri, `editor` è l'unico strato che muta il documento.

```ts
export function importEr(
  entities: Record<string, Entity>,
  relationships: readonly Relationship[],
): Recipe
```

La recipe, in questo ordine:

1. **Entità.** Chiave già presente → sostituisce `model.entities[key]` e
   **lascia intatto** `view.nodes[key]`, quindi la posizione che le avevi dato
   sopravvive. Chiave nuova → crea l'entità e `view.nodes[key] = { ...pos,
   collapsed: false }` con la posizione da `placeNew` (§10).
2. **Potatura delle relazioni derivate.** Si eliminano le relazioni il cui
   `source.entity` è fra le entità in arrivo **e** che hanno
   `source.attributes` non vuoto. Quella seconda condizione distingue le
   relazioni nate da una FK da quelle disegnate a mano, sfruttando un invariante
   che `RelationshipEndSchema` già dichiara (*«vuoto per relazioni disegnate a
   mano»*). Senza la potatura il re-import duplicherebbe le relazioni; senza la
   condizione cancellerebbe le connessioni manuali.
3. **Inserimento.** Le chiavi si assegnano **qui**, non in `map.ts`: `uniqueKey`
   sul record già potato, con base `sourceKey_targetKey`, la stessa convenzione
   di `addRelationship`. Calcolarle prima della potatura del punto 2 le farebbe
   collidere con relazioni che stanno per sparire.

## 10. Posizionamento

`placeNew` sta nello stesso file del comando, esportata per i test: usa
`entitySize` e `rectsBounds` di `er-geometry`, quindi appartiene a `editor` e
`io/ddl` non ha bisogno di sapere niente di layout.

```ts
export function placeNew(entities: Record<string, Entity>, diagram: ErDiagram): Record<string, Point>
```

- Solo le entità **nuove** ricevono una posizione; le sostituite tengono la loro.
- Ordine di comparsa nel DDL: nei dump reali le tabelle correlate stanno vicine,
  quindi è un ordine migliore dell'alfabetico e resta deterministico.
- Griglia di `ceil(√n)` colonne. Cella = `entitySize` massima del lotto più una
  gronda di 40, tutto passato per `snap`.
- Origine sotto il `rectsBounds` di ciò che è già sul canvas, più la gronda: un
  import non copre mai il lavoro esistente. Canvas vuoto → `{ x: 40, y: 40 }`.

## 11. Worker: protocollo e protezione

```ts
interface ParseRequest { id: number; dialect: "postgres" | "mysql"; ddl: string }
type ParseResponse =
  | { id: number; ok: true; result: ParseResult }
  | { id: number; ok: false; message: string }
```

`parse-client.ts` espone `createParser(): { parse(ddl, dialect): Promise<ParseResult>; dispose(): void }`.
Il worker si crea alla prima `parse` e si distrugge con `dispose`.

Lo spike ha lasciato scritto che il suo worker non aveva niente di tutto questo,
e che un fallimento di caricamento del `.wasm` lasciava la promessa appesa per
sempre. Quindi: `onerror` e `onmessageerror` respingono la promessa con un
messaggio leggibile; un **timeout di 30 s** la chiude (200 tabelle costano
136 ms, il margine è tre ordini di grandezza); `dispose()` chiama `terminate()`,
così chiudere il dialog annulla davvero e non lascia lavoro orfano; le risposte
con `id` diverso da quello atteso si scartano, così un parse superato da un
altro non sovrascrive il risultato buono.

Gli errori di `libpg-query` portano `sqlDetails` con posizione e messaggio dello
statement fallito. Lo spike li collassava in `String(err)` perdendo tutto: qui
finiscono in `ParseWarning.at` e `message`, così il dialog può dire *dove* nel
dump è il problema.

## 12. Il dialog

Voce `Importa DDL…` nel menu documento, disabilitata in sola lettura come Salva.
Un solo pannello con due stati, non un wizard:

**Vuoto.** Un `<textarea>` dove incollare e un `<input type="file"
accept=".sql,.txt">` per caricare un dump da disco. Niente drag&drop.

**Analizzato.** Il dialetto rilevato in un `ToggleGroup`; la lista delle tabelle
con spunta, tutte selezionate, quelle già sul canvas marcate «già presente,
verrà aggiornata»; un campo di filtro sopra la lista, che su 200 tabelle è la
differenza fra usabile e no; una riga di riepilogo (*N tabelle, N relazioni, N
statement ignorati*); i warning in un blocco richiudibile.

L'analisi parte da sola quando si carica un file e sull'evento `paste`; per il
testo digitato e per un cambio di dialetto c'è un pulsante **Analizza**. Nessun
debounce da tarare e nessun parse di un dump incollato a metà.

Dopo l'import il dialog **non si chiude**: mostra l'esito con i warning e un
pulsante Chiudi. Chiudendosi butterebbe via i warning nel momento esatto in cui
diventano utili — sono il posto in cui scopri che tre FK sono cadute. Questo
evita anche di far passare gli avvisi dell'import per il canale `notice` di
`documentSession`, che è dedicato alla persistenza.

Gli statement ignorati si mostrano con un'etichetta italiana per i tipi
frequenti (`IndexStmt` → «indici», `CreateSeqStmt` → «sequenze», …) e con la
chiave grezza del parser per gli altri: un dizionario di una dozzina di voci,
non una traduzione esaustiva.

`dirty` e l'autosave non richiedono lavoro: l'import è una `dispatch`, e la
sottoscrizione dell'autosave la vede come qualunque altro comando.

## 13. Componenti e dipendenze

Nessuna dipendenza npm nuova: `libpg-query` e `node-sql-parser` sono già in
`package.json` dallo spike.

Due componenti shadcn da generare, **`dialog`** e **`checkbox`**. Il dialetto usa
il `toggle-group` che c'è già invece di una `select` nuova; il textarea è un
`<textarea>` con le classi di `input.tsx`, non un componente in più per un solo
campo.

## 14. Test

Le fixture sono i **dump sintetici già committati** (`spike/fixtures/*.synthetic.sql`),
importati con `?raw` — che `vite/client` già tipizza — invece di `node:fs`. Così
il tsconfig dedicato ai test che lo spike aveva rimandato non serve: quel debito
si chiude non pagandolo.

I costrutti insidiosi trovati nei dump reali entrano come **snippet in linea con
nomi di tabella e colonna inventati**. Nessun frammento dei dump reali finisce in
un test committato: quei file restano git-ignored, e restano una prova manuale.

- `sql-text`: `;` dentro stringhe, apici doppi e backtick; commenti `--` e
  `/* */`; spogliatura di `/*!` e `/*M!`; `DELIMITER`; dollar-quote con e senza
  tag; `\restrict` in stato codice e dentro un literal.
- `detect`: intestazione `pg_dump`, intestazione `mysqldump`, `CREATE TABLE`
  nudo (→ Postgres).
- `pg`: fixture → IR, con le due passate — i `CreateStmt` raccolti prima, gli
  `AlterTableStmt` (`ADD CONSTRAINT` di PK, UNIQUE e FK; `ALTER COLUMN SET NOT
  NULL`) applicati dopo, e un `ALTER` su tabella sconosciuta che diventa warning.
- `mysql`: fixture → IR sui percorsi AST che lo spike ha verificato — `nullable`
  assente vuol dire nullabile, le `KEY` non uniche stanno su `resource: "index"`,
  `constraint_type` si confronta case-insensitive, `CHECK (json_valid(...))` non
  rompe niente. Anche gli `ALTER TABLE ADD CONSTRAINT`, che alcune varianti di
  `mysqldump` emettono fuori dal `CREATE TABLE`.
- `map`: le quattro combinazioni di cardinalità, `identifying`, UNIQUE singolo
  contro composito, FK pendente, nome ambiguo, auto-riferimento.
- `import` (comando): sostituzione che tiene la posizione, potatura delle sole
  relazioni derivate, sopravvivenza di una relazione disegnata a mano, una sola
  `dispatch`, un solo undo che ripristina tutto.
- `placeNew`: determinismo a parità d'ingresso, nessuna sovrapposizione con i
  bounds esistenti.
- **e2e**: uno scenario nuovo sotto `pnpm e2e` — incolla un DDL breve, importa,
  due entità e una relazione sul canvas, ⌘Z, canvas vuoto. L'e2e della
  persistenza ha trovato bug che i test unitari non vedevano.

Nessun test per componente React, come da spec di progetto.

Da verificare come **primo passo del piano**, perché è l'unica incognita tecnica
rimasta: `node-sql-parser` è stato eseguito solo in Node, mai in un worker
`type: "module"` né dentro un bundle browser. Il pacchetto è UMD/CJS, cioè la
stessa classe di problema che il `.wasm` di `libpg-query` ha già dato. Se
l'interop nel worker non funziona, la via d'uscita è un `import()` dell'entry
`node-sql-parser/build/mysql` con `optimizeDeps.include`, e in ultima istanza il
solo ramo MySQL sul thread principale.

## 15. Build: il plugin del WASM

`libpgQueryWasm()` in `vite.config.ts` diventa **condizionale**, come lo spike ha
chiesto:

- emette il `.wasm` solo se un chunk della build importa davvero `libpg-query`
  (oggi quel megabyte finisce in `dist` anche senza importer);
- prende il percorso di atterraggio da `config.build.assetsDir` invece di
  `assets` scritto a mano;
- risolve il file con `createRequire(...).resolve(...)` **dentro gli hook** e non
  al caricamento della config, così una dipendenza mancante rompe l'import e non
  qualunque comando Vite.

## 16. Domande chiuse durante il brainstorming

- Auto layout ELK dentro questa spec → **no**, posizionamento a griglia
  deterministico; ELK è spec e piano suoi, poi applicabili a qualunque diagramma.
- Destinazione delle tabelle importate → **sempre il documento aperto**, un solo
  percorso di codice, annullabile con ⌘Z.
- Collisione di nome → **sostituisce tenendo la posizione**; per non toccare
  un'entità si toglie la spunta nel dialog.
- Dialetto → **rilevamento automatico con override**.
- FK verso una tabella non selezionata → **relazione saltata, con warning**.
- Un worker per dialetto o uno solo → **uno solo**, con `import()` dinamico.

## 17. Fuori scope

Auto layout con ELK. Export DDL, che è il verso opposto e ha regole sue.
Import da Mermaid o PlantUML. Import da codice sorgente, già escluso dalla spec
di progetto. Dialetti oltre PostgreSQL e MySQL/MariaDB. Confronto fra schema e
diagramma (un «diff» che mostri cosa è cambiato prima di applicarlo): il
re-import che sostituisce copre il bisogno pratico senza costruire una vista di
differenze.
