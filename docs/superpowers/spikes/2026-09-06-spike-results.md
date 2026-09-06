# Spike — risultati

Macchina: <modello, browser e versione>

## A. Canvas SVG a mano

| Scenario | Entità | FPS min | Note |
|---|---|---|---|
| drag | 300 | | |
| pan | 300 | | |
| zoom | 300 | | |
| drag | 600 | | |
| drag | 1000 | | |

Performance panel (drag, 300): rendering ms/frame = , scripting ms/frame =

**Verdetto A:** go / no-go — motivazione in una riga.

### Come misurare (da fare a mano, con il mouse)

`pnpm dev`, poi su `http://localhost:5173` in Chrome:

1. Con 300 entità: trascinare un'entità per 5 secondi con movimenti continui. Annotare il valore minimo del contatore FPS in toolbar.
2. Pan (trascinare sullo sfondo) per 5 secondi. Annotare il minimo FPS.
3. Zoom con la rotella avanti e indietro. Annotare il minimo FPS.
4. Ripetere il punto 1 con 600 e con 1000 entità (campo "entità" in toolbar).
5. DevTools → Performance → registrare 5 secondi di drag a 300 entità: annotare il tempo medio per frame di "Rendering" e "Scripting".

Criterio go: ≥ 50 FPS minimo in drag con 300 entità. Sotto i 30 FPS a 300 entità è no-go per l'SVG
a mano con React che ridisegna per nodo, e si valuta lo stato transitorio fuori da React
(mutare `transform` via ref durante il drag).

Scorciatoia senza mouse: il pulsante **auto-drag** in toolbar muove l'entità `t0` di 2 px per frame
per 5 secondi via `requestAnimationFrame` e stampa in console i frame completati e la media fps.
È un drag programmatico di un solo nodo: utile come indicatore, non sostituisce la misura a mano
(non include il costo di hit-testing né i movimenti reali del puntatore).

## B. libpg-query (Postgres)

`libpg-query@17.7.4` (pg 17). Misure su MacBook (Darwin 25.1, 11 core) con Chrome 148.

Due fixture, non una: il dump reale è il caso da superare, il sintetico a 200 tabelle è la scala del
criterio go/no-go.

- `spike/fixtures/postgres.sql` — reale (`pg_dump --schema-only`, server 18.3), 14 tabelle, 16.907 byte, 713 righe.
- `spike/fixtures/postgres.synthetic.sql` — sintetica (`node scripts/gen-pg-dump.mjs 200`), 200 tabelle, 153.831 byte.

| Ambiente | Fixture | Caricamento WASM ms | Parse ms | Statement | Errori |
|---|---|---|---|---|---|
| Node (vitest) | reale | 12 (init, misurato a parte) | 11-12 | 85 | 0 |
| Node (vitest) | sintetica | idem, una volta per processo | 17-23 | 802 | 0 |
| Browser dev | reale | ~20 (totale 56-57, parse 33-38) | 33-38 | 85 | 0 |
| Browser dev | sintetica | ~22 (totale 106-167, parse 84-143) | 84-143 | 802 | 0 |
| Browser build | reale | ~16 (totale 59, parse 43) | 43 | 85 | 0 |
| Browser build | sintetica | ~16-20 (totale 114-136) | 94-120 | 802 | 0 |

Il "caricamento WASM" della tabella è `totale − parse` misurato dalla toolbar (creazione del worker,
import del modulo, fetch e istanziazione del `.wasm`, un `postMessage` andata e ritorno). Misurato da
solo, `WebAssembly.compileStreaming(fetch(...))` sul binario da `dist/assets` costa **7-11 ms**: il
resto è avvio del worker. Nota: la primissima esecuzione su un dev server appena avviato ha dato 344 ms
totali (94 di parse) perché Vite trasforma il worker e le sue dipendenze al volo; dalla seconda in poi
rientra nei valori in tabella.

In Node `libpg-query` avvia l'istanziazione del modulo già all'import, quindi dentro il test
`loadModule()` ritorna subito e non è misurabile: il numero in tabella viene da uno script a parte
(`import` 9 ms + `loadModule()` 12 ms su un processo pulito).

Mappa dei tipi di statement (dal test Node):

- reale: `VariableSetStmt` 12, `SelectStmt` 1, `CreateStmt` 14, `CreateSeqStmt` 9, `AlterSeqStmt` 9, `AlterTableStmt` 32, `IndexStmt` 8.
- sintetica: `VariableSetStmt` 2, `CreateSchemaStmt` 1, `CreateStmt` 200, `CommentStmt` 200, `AlterTableStmt` 399.

**Meta-comandi psql.** `pg_dump` 18 racchiude il dump fra `\restrict <token>` e `\unrestrict <token>`.
Non sono SQL: passati a `parse()` fanno fallire l'intero dump con un errore di sintassi. Test e worker
scartano le righe che iniziano con `\` prima del parse — **2 righe filtrate** sul dump reale, 0 sul
sintetico. **L'importer definitivo deve fare lo stesso** (e in generale ignorare i meta-comandi psql,
`\connect` compreso).

Dimensione `.wasm` in dist: **1.150.984 byte (1.124 KB, 235,5 KB gzip)** in `dist/assets/libpg-query.wasm`.

**Caricamento: nessuna delle due strade del brief funziona; serve un plugin Vite** (~15 righe in
`vite.config.ts`). Emscripten cerca `libpg-query.wasm` in `scriptDirectory`, cioè accanto allo script
che lo carica: nel worker è `/src/spike/` in dev e `/assets/` nella build. Esiti provati nell'ordine:

1. **Default** — no. Il worker chiede `/src/spike/libpg-query.wasm`, il dev server risponde con
   `index.html` (fallback SPA) e si ottiene `CompileError: expected magic word 00 61 73 6d, found 3c 21 64 6f`
   (`<!do`). In build il `.wasm` non viene proprio emesso.
2. **`optimizeDeps.exclude: ["libpg-query"]`** — no, stesso errore: l'URL richiesta dipende da
   `self.location.href` del worker, non da come Vite serve la dipendenza.
3. **Copia in `public/`** — no. Il binario finisce su `/libpg-query.wasm`, ma il worker continua a
   chiedere `/src/spike/libpg-query.wasm` (verificato: `200 application/wasm` sul primo URL,
   `200 text/html` sul secondo).
4. **Plugin `libpgQueryWasm()` in `vite.config.ts`** — sì. In dev un middleware serve qualunque
   richiesta che finisce per `/libpg-query.wasm` con `Content-Type: application/wasm`; in build
   `emitFile` scrive il binario in `assets/`. `loadModule()` non espone `locateFile`, quindi non c'è
   modo di dirglielo dal codice applicativo.

Da portare nel piano successivo: il worker del parser ha bisogno di questo passo di build, e il punto
in cui il `.wasm` deve atterrare dipende da `build.assetsDir` (qui `assets`, hardcoded nel plugin).

**Verdetto B:** **go** — criterio: caricamento + parse < 3 s su 200 tabelle. Misurato nel browser
sulla build: ~136 ms totali (120 di parse) sulla fixture da 200 tabelle e 153 KB, cioè ~20x sotto il
criterio; il dump reale sta in ~60 ms. Il costo vero è il megabyte di `.wasm` da scaricare, che è
lazy (solo all'import) e comprimibile a 235 KB.

## C. node-sql-parser (MySQL)

`node-sql-parser@5.4.0`, entry per dialetto `node-sql-parser/build/mysql`, `astify(s, { database: "MySQL" })`
uno statement alla volta. Misure in Node (vitest 5) sulla stessa macchina della sezione B.

Come in B, due fixture: il dump reale è il caso da superare, il sintetico a 200 tabelle è la scala.

- `spike/fixtures/mysql.sql` — reale (`mysqldump --no-data`, **MariaDB 10.5.27**, dump 10.19), 24 tabelle, 22.942 byte, 531 righe.
- `spike/fixtures/mysql.synthetic.sql` — sintetica (`node scripts/gen-mysql-dump.mjs 200`), 200 tabelle, 249.284 byte.

| Fixture | Statement totali | Parsati | Falliti | ms |
|---|---|---|---|---|
| reale (24 tabelle) | 49 | 49 (100%) | 0 | 34 |
| sintetica (200 tabelle) | 401 | 400 (99,75%) | 1 | 112 |

Composizione degli statement riconosciuti: reale = 24 `drop:table` + 24 `create:table` + 1 chunk di soli
commenti (`-- Dump completed on ...`, che `astify` risolve in un array vuoto e conta come parsato);
sintetica = 200 `drop:table` + 200 `create:table`.

Falliti ricorrenti: **uno solo, e solo sulla fixture sintetica** —

- `SET NAMES utf8mb4` → `SyntaxError: Expected "#", "--", "/*", ":=", "=", or [ \t\n\r] but "u" found.`
  Il parser vuole `SET NAMES = utf8mb4`. Non è un caso reale: `mysqldump` emette sempre quello statement
  dentro `/*!40101 SET NAMES utf8mb4 */`, quindi il filtro dei commenti condizionali lo toglie di mezzo;
  è il generatore sintetico (fedele al brief) che lo scrive nudo. Sul dump reale: **zero fallimenti**.

**Commenti condizionali.** Lo split scarta le righe che iniziano con `/*!` (commenti eseguibili MySQL) **e
con `/*M!`** (varianti MariaDB): il dump reale si apre con `/*M!999999\- enable the sandbox mode */`, che
senza quel filtro finisce in testa al primo chunk e lo fa fallire. L'importer definitivo deve filtrare
entrambi i prefissi.

**`CHECK (json_valid(...))`: parsati, nessun fallimento.** Sono 25 constraint su 5 tabelle (le colonne JSON
generate da Laravel su MariaDB, che le materializza come `longtext ... CHECK (json_valid(col))`). Non
rompono il parse e non degradano l'AST: finiscono su `create_definitions[i].check` della colonna, con la
chiamata a funzione già in forma di albero. Idem `bigint(20) unsigned`, `tinyint(1)`, `longtext`,
`CHARACTER SET` / `COLLATE` per colonna, `DEFAULT -1`, e la tabella senza PRIMARY KEY (`customer_user`,
semplicemente non ha un `create_definitions[i]` con `constraint_type: "primary key"`).

Percorsi nell'AST di `CREATE TABLE` (verificati sull'output del test, non a memoria). Nota: su un solo
statement `astify` restituisce **l'oggetto**, non un array — l'array arriva solo con più statement.

- nome tabella: `ast.table[0].table` (`ast.table[0].db` è `null` sui dump `--no-data`)
- colonne: `ast.create_definitions[i]` con `resource === "column"`
  - nome: `.column.column` — tipo: `.definition.dataType` (maiuscolo: `BIGINT`, `VARCHAR`, `LONGTEXT`)
  - lunghezza/precisione: `.definition.length` (numero), `.definition.scale`
  - modificatori di tipo: `.definition.suffix` (es. `["UNSIGNED"]`)
  - nullable: `.nullable` **presente solo se NOT NULL** (`{ type: "not null", value: "not null" }`); se la
    colonna è nullabile la chiave manca del tutto
  - default: `.default_val.value` (`{ type: "number", value: 0 }`, `{ type: "null", value: null }`)
  - auto increment: `.auto_increment === "auto_increment"` (chiave assente altrimenti)
  - charset/collation: `.character_set.value.value`, `.collate.collate.name`
  - check di colonna: `.check` (`constraint_type: "check"`, `.definition[0]` è l'espressione)
- PRIMARY KEY: `resource === "constraint"`, `constraint_type === "primary key"`, colonne in
  `.definition[]` come `{ type: "column_ref", column }`
- UNIQUE KEY: `resource === "constraint"`, `constraint_type === "unique key"`, nome indice in `.index`,
  colonne in `.definition[]`
- KEY (indice non unico): attenzione, **`resource === "index"`** (non `"constraint"`) e nessun
  `constraint_type`; `keyword === "key"`, nome in `.index`, colonne in `.definition[]`
- FOREIGN KEY: `resource === "constraint"`, `constraint_type === "FOREIGN KEY"` (maiuscolo, a differenza
  di `"primary key"` / `"unique key"`), nome del vincolo in `.constraint`, colonne locali in `.definition[]`,
  e il riferimento in `.reference_definition`: tabella `.reference_definition.table[0].table`, colonne
  `.reference_definition.definition[]`, azioni `.reference_definition.on_action[]`
  (`{ type: "on delete", value: { type: "origin", value: "cascade" } }`)

Conteggi sul dump reale (24 `CREATE TABLE`): 178 colonne, 23 `primary key`, 11 `unique key`, 18 `index`,
10 `FOREIGN KEY`, 25 `check` di colonna, 1 tabella senza PK.

**Import.** La prima forma del brief funziona così com'è: `import { Parser } from "node-sql-parser/build/mysql"`
sotto vitest 5 / Vite 8 (il pacchetto è UMD/CJS, l'interop di Vite espone il named export). Non è servita
né la forma `import pkg from ...` né l'entry principale con `database: "MySQL"`. Lo shim di tipi
`src/spike/shims.d.ts` resta ma è **ridondante** con la 5.4.0: il pacchetto pubblica `build/mysql.d.ts` e
non ha campo `exports`, quindi `moduleResolution: bundler` risolve i tipi da solo (verificato: `tsc -b --force`
passa anche senza shim).

Dimensione del chunk `node-sql-parser/build/mysql`: **284,31 KB (59,92 KB gzip)**. Misurata con una sonda
temporanea (`import()` dinamico dal codice dell'app, poi rimossa) perché oggi la libreria è importata solo
dal test e non finisce in `dist`; sul disco il file `build/mysql.js` è 275.999 byte (51,3 KB gzip). Vite non
ha emesso alcun avviso di dimensione (il limite di default è 500 KB). È un chunk **lazy** e per dialetto:
l'entry unica `node-sql-parser` porterebbe dentro tutti i dialetti.

**Verdetto C:** **go** — criterio: ≥ 95% degli statement di un mysqldump reale parsati e AST che espone
colonne, PK e FK. Misurato: **100% (49/49) sul dump reale**, 99,75% sul sintetico con l'unico fallimento su
uno statement che `mysqldump` non emette mai in chiaro. L'AST espone nome tabella, colonne con tipo /
nullable / default / auto_increment, PRIMARY KEY, UNIQUE KEY, KEY e FOREIGN KEY con tabella e colonne
referenziate. **Nessun costrutto ricorrente fallisce**: in particolare i 25 `CHECK (json_valid(...))` su 5
tabelle — il rischio principale di questo dump MariaDB — sono parsati correttamente. Non serve un parser
proprio del sottoinsieme DDL.

Da portare nel piano successivo: filtrare `/*!` **e** `/*M!`; leggere le `KEY` da `resource: "index"`;
trattare l'assenza di `nullable` come "nullabile"; confrontare `constraint_type` in modo
case-insensitive (`"primary key"` minuscolo vs `"FOREIGN KEY"` maiuscolo).

## Decisioni per il piano successivo
