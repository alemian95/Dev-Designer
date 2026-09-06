# Spike — risultati

Macchina: MacBook (Mac Apple Silicon, Darwin 25.1, 11 core). Sezione A misurata nel browser
integrato (Chromium in-app); sezioni B e C su Chrome 148 e Node 22 / vitest 5.

## A. Canvas SVG a mano

**Metodo e suo limite.** È misurato il **solo costo di scripting di React** per evento `pointermove`
(render + commit sul DOM), in millisecondi: layout e paint sono **esclusi**, perché la misura è stata
fatta con il pannello del browser **nascosto** e quindi senza frame dipinti. Non è un FPS reale, è il
tempo che React consuma dentro ogni evento di movimento. La prima esecuzione a 300 entità è stata
scartata per warm-up del JIT.

**Ambiente della misura.** `pnpm dev` — quindi **build di sviluppo di React**, non di produzione — con
`<StrictMode>` **attivo** in `src/main.tsx`, cioè con **doppia invocazione delle funzioni di render**;
pannello del browser **nascosto**; Chromium integrato nell'app; Mac Apple Silicon. Ne derivano **due bias
opposti, nessuno dei due quantificato**: dev build e StrictMode rendono i numeri **pessimistici** (lavoro
di render contato più volte e senza le ottimizzazioni della build di produzione); l'esclusione di layout e
paint li rende **ottimistici** (manca tutto il costo di disegno). I valori qui sotto vanno letti come
ordine di grandezza dell'asse scripting, non come una misura di frame rate.

| Entità | Drag ms/frame avg (p95) | Pan ms/frame avg (p95) |
|---|---|---|
| 150 | 2,4 (2,8) | 1,8 (3,2) |
| 300 | 4,6–5,7 (5,3–14,2) | 3,5–4,6 (5,3–12,5) |
| 600 | 10,7–11,6 (25–35) | 7,1 (12,9) |
| 1000 | 19,0 (48,8) | 12,5 (20,7) |
| 2000 | 37,5 (62,2) | 27,0 (43,2) |

**Lettura.** La crescita è lineare nel numero di entità: circa **18 µs per entità per spostamento in
drag** e **~13 µs in pan**. Il dato che conta è il pan: cambia un solo attributo `transform` sul gruppo del
viewport, eppure costa quasi quanto il drag. Vuol dire che a ogni evento viene **ri-renderizzato per
intero il componente radice** — il layer degli edge non è memoizzato, e anche con i nodi memoizzati
l'albero viene comunque attraversato.

**Verdetto A: go sull'asse scripting, con riserva.** A 300 entità lo scripting sta sotto gli **8 ms**,
cioè dentro il budget di 16 ms a 60 FPS con un margine doppio per macchine più lente — e con StrictMode e
dev build a carico della misura il numero reale è verosimilmente più basso. Questo dice che **l'asse React
non è il collo di bottiglia a quella scala**; non dice che il target della spec sia raggiunto. **Il criterio
del piano — «≥ 50 FPS minimo in drag con 300 entità» — resta non misurato**, e diventa il **primo task del
piano successivo**: sul canvas vero, in build di produzione, senza `<StrictMode>`, con il pannello visibile
e quindi con i frame effettivamente dipinti. Anche restando sull'asse scripting, il margine doppio vale
sull'**avg**: il **p95** a 300 entità arriva a 14,2 ms in drag, cioè quasi tutto il budget, e questo con
layout e paint ancora esclusi. La riserva è che il renderer definitivo deve fare tre cose, altrimenti il
costo di scripting per frame continua a crescere con il numero di entità:

1. tenere il `transform` del viewport **fuori dal render del componente radice** (ref, o componente
   minimo iscritto allo store transitorio);
2. **memoizzare il layer degli edge per singolo edge**;
3. tenere lo **stato del drag fuori da React**, come già previsto dalla spec.

Con questi tre accorgimenti il costo **di scripting** dovrebbe smettere di crescere con il numero di
entità — è un'**ipotesi**, non un risultato misurato, e vale **solo sull'asse React**. Il costo di **paint**
non lo tocca nessuna delle tre: a 300 entità restano da dipingere ~3.750 `<text>` e ~600 `<rect>`, e quanto
costino è **ignoto e va misurato**. La leva per il paint è un'altra: il **culling del viewport** (disegnare
solo ciò che sta dentro l'inquadratura), che la spec §4.3 già anticipa con il tetto dichiarato delle
centinaia di entità e le entità collassate oltre quella soglia.

La misura con i frame effettivamente dipinti (FPS reali, layout e paint inclusi) **è stata fatta dopo**,
nel piano successivo: [Misura FPS a frame dipinti](../../perf/2026-09-06-fps-frame-dipinti.md). Esito
**FAIL** a 300 entità per lo zoom (p95 41,7 ms contro il criterio di 20); drag, pan e marquee stanno sul
pavimento del display. Conferma la lettura di questa sezione — l'asse React non è il collo di bottiglia —
e la riserva che si teneva: il costo che rompe il criterio è **layout e paint**, non scripting.

**Riproducibilità.** Il canvas dello spike resta nella storia git al commit **`28a03a1`**. La tabella
avg/p95 qui sopra è stata prodotta con uno script eseguito nella console del browser, **non presente in
git**: è riportato qui sotto perché la misura sia ripetibile. Uso: `git checkout 28a03a1`, `pnpm dev`,
aprire la pagina e incollare lo script nella console del browser.

```js
SVGSVGElement.prototype.setPointerCapture = function () {}
const yieldMacro = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0) })
const setCount = (n) => { const i = document.querySelector('input[type="number"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, String(n)); i.dispatchEvent(new Event('input', { bubbles: true })) }
const ev = (t, type, x, y) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }))
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { avg: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2) } }
const settle = async () => { for (let i = 0; i < 20; i++) await yieldMacro() }
async function phase(down, move, x0, y0, watch, attr, n = 60) {
  ev(down, 'pointerdown', x0, y0); await settle(); const cost = []
  for (let i = 1; i <= n; i++) { const b = watch.getAttribute(attr); const t0 = performance.now(); ev(move, 'pointermove', x0 + i * 2, y0 + i); let y = 0; while (watch.getAttribute(attr) === b && y++ < 50) await yieldMacro(); cost.push(performance.now() - t0) }
  ev(move, 'pointerup', x0 + n * 2, y0 + n); await settle(); return stats(cost)
}
const out = {}
for (const n of [300, 150, 300, 600, 1000, 2000]) { // la prima esecuzione a 300 è warm-up e si scarta
  setCount(n); await settle(); await settle()
  const svg = document.querySelector('svg'), g = document.querySelector('[data-id="t0"]'), root = svg.firstElementChild
  const r = g.getBoundingClientRect(), sr = svg.getBoundingClientRect()
  out[n] = { drag: await phase(g, svg, r.left + 20, r.top + 10, g, 'transform'), pan: await phase(svg, svg, sr.left + 5, sr.bottom - 5, root, 'transform') }
}
console.log(JSON.stringify(out))
```

Avvertenza sul contatore in toolbar: il pulsante di **auto-drag** del canvas a `28a03a1` divide per
**5 secondi costanti** invece che per il tempo realmente trascorso, e non ha guardia contro il doppio
avvio. Il numero che mostra è quindi solo **indicativo**; i valori in tabella vengono dallo script qui
sopra, non da lui.

**Cosa non è stato misurato.** Oltre agli FPS reali (layout e paint inclusi): la **selezione multipla a
rettangolo** — la spec §5.2 la chiedeva esplicitamente, ma il canvas dello spike aveva solo la selezione
singola; è il **caso peggiore**, perché ri-renderizza tutti i nodi insieme — e lo **zoom**, che il piano
elencava fra gli scenari da cronometrare.

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
sintetico. Tagliare ogni riga che inizia con `\` è però una scorciatoia dello spike: **l'importer
definitivo deve filtrare un insieme chiuso di meta-comandi psql fuori dai literal**, come prescritto in
[Decisioni per il piano successivo](#decisioni-per-il-piano-successivo).

Dimensione `.wasm` in dist: **1.150.984 byte (1.124 KB)** in `dist/assets/libpg-query.wasm`, che
compresso misura **222,9 KB gzip** (`gzip -6`, 228.199 byte) e **164,6 KB brotli** (168.575 byte),
misurati sul binario emesso in `dist`. Il report di `vite build` stampa `gzip: 235.54 kB` per lo stesso
file: il numero è diverso prima di tutto perché l'unità è diversa — Vite usa kB decimali (÷1000), quindi
i 228.199 byte qui sopra sono **228,20 kB** nella sua unità, non 222,9 KiB — e per il resto (~3%) perché
i parametri di compressione non coincidono con `gzip -6`.

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
lazy (solo all'import) e comprimibile a 223 KB gzip / 165 KB brotli.

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

**Commenti condizionali.** Lo split scarta **l'intero chunk** che inizia con `/*!` (commenti eseguibili
MySQL) **o con `/*M!`** (varianti MariaDB): il dump reale si apre con `/*M!999999\- enable the sandbox
mode */`, che senza quel filtro finisce in testa al primo chunk e lo fa fallire. Il denominatore grezzo
sul dump reale è **139 chunk**, di cui **90 scartati** come commenti eseguibili e **49 misurati** (sono i
49 della tabella qui sopra). Attenzione: scartare il chunk intero è una scorciatoia dello spike, valida
qui perché in un `mysqldump --no-data` i commenti eseguibili contengono solo `SET`/`SAVEPOINT` di
sessione. Per l'**importer definitivo la regola giusta è spogliare il commento eseguibile dal chunk**
(togliere `/*!NNNNN` e `*/` e parsare quello che resta), non scartare il chunk: `mysqldump` racchiude in
quella forma anche DDL che serve, per esempio i modificatori di `CREATE TABLE`.

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
né la forma `import pkg from ...` né l'entry principale con `database: "MySQL"`. Lo shim di tipi che lo
spike aveva in `src/spike/shims.d.ts` è **ridondante** con la 5.4.0 — il pacchetto pubblica
`build/mysql.d.ts` e non ha campo `exports`, quindi `moduleResolution: bundler` risolve i tipi da solo
(verificato: `tsc -b --force` passa anche senza shim) — ed è stato rimosso con il resto dello spike:
l'importer definitivo non deve reintrodurlo.

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

**Limite dell'ambiente di misura.** `node-sql-parser` è stato eseguito **solo in Node / vitest**: mai in un
web worker `type: "module"`, mai dentro un bundle browser (la dimensione del chunk qui sopra viene da una
sonda, non da un uso reale). È la **prima cosa da verificare nel ramo MySQL del piano successivo**, perché
il pacchetto è **UMD/CJS** e l'interop dentro un worker a moduli è la stessa classe di problema incontrata
con il `.wasm` di libpg-query nella sezione B.

Da portare nel piano successivo: gestire `/*!` **e** `/*M!` spogliando il commento eseguibile dal chunk
invece di scartarlo; leggere le `KEY` da `resource: "index"`;
trattare l'assenza di `nullable` come "nullabile"; confrontare `constraint_type` in modo
case-insensitive (`"primary key"` minuscolo vs `"FOREIGN KEY"` maiuscolo).

**Limite dello split degli statement.** Lo split usato in questo spike è ingenuo: taglia sul `;` a fine
riga (`split(/;\s*\r?\n/)`) ed è valido **solo** per dump `mysqldump --no-data` di sole `CREATE TABLE`. Si
rompe sugli `INSERT` con `;` dentro le stringhe e su trigger/routine con `DELIMITER`. Il **100% (49/49)**
misurato sopra vale entro questo dominio e non dimostra la strategia di chunking in generale: l'importer
definitivo deve fare chunking consapevole di stringhe e `DELIMITER`, oppure accettare in ingresso solo dump
di schema e dichiararlo esplicitamente all'utente.

## Decisioni per il piano successivo

**Rendering: SVG a mano con React per nodo → confermato, con tre vincoli.** A 300 entità il costo di
scripting per evento sta sotto gli 8 ms (sezione A). Il renderer definitivo deve però tenere il
`transform` del viewport fuori dal render del componente radice, memoizzare il layer degli edge per
singolo edge e tenere lo stato del drag fuori da React: senza questi tre accorgimenti il costo **di
scripting** per frame cresce linearmente con il numero di entità (~18 µs per entità per spostamento).
Che con quei tre accorgimenti smetta di crescere è un'**ipotesi** e riguarda **solo lo scripting**: il
costo di **paint** (~3.750 `<text>` e ~600 `<rect>` a 300 entità) resta **ignoto e da misurare**, e la
leva per il paint è il **culling del viewport**, che la spec §4.3 già anticipa con le entità collassate.

- **La misura con i frame dipinti è il primo task del piano successivo** — fatta, esito FAIL:
  [Misura FPS a frame dipinti](../../perf/2026-09-06-fps-frame-dipinti.md). Il criterio del piano
  («≥ 50 FPS minimo in drag con 300 entità») non è stato misurato: va fatto sul canvas vero, in build di
  produzione, senza `<StrictMode>` e con il pannello visibile. Nello stesso giro vanno coperti anche
  **selezione multipla a rettangolo** e **zoom**, che lo spike non ha misurato.
- **Culling del viewport** come leva per il costo di paint: disegnare solo ciò che sta dentro
  l'inquadratura. Nessuno dei tre accorgimenti sull'asse React tocca il paint.

**Postgres: `libpg-query` → confermato.** Caricamento + parse ~136 ms su 200 tabelle contro un criterio
di 3 s (sezione B).

- **Caricamento del WASM: plugin `libpgQueryWasm()` in `vite.config.ts`** — middleware in dev che serve
  qualunque richiesta che finisce per `/libpg-query.wasm`, `emitFile` in build. Non è una scorciatoia
  dello spike ma la soluzione definitiva: `loadModule()` di libpg-query **non espone `locateFile`**,
  quindi non c'è modo di indicare il percorso dal codice applicativo, ed Emscripten cerca il binario
  accanto allo script che lo carica. Il plugin resta in repo dopo la rimozione dello spike, perché
  serve all'importer definitivo tanto quanto è servito allo spike. Nota: il percorso di atterraggio del
  binario è legato a `build.assetsDir` (`assets`, oggi hardcoded nel plugin).
- **Meta-comandi psql da filtrare prima del parse.** `pg_dump` 18 racchiude il dump fra `\restrict` e
  `\unrestrict`; non sono SQL e fanno fallire l'intero dump. L'importer deve scartare le righe che
  iniziano con `\` **fuori dai literal** (una stringa o un dollar-quote possono contenere un backslash a
  inizio riga), riconoscendo i meta-comandi come **insieme chiuso** (`\restrict`, `\unrestrict`,
  `\connect`, `\.`, …) invece di tagliare ogni backslash che incontra.

**MySQL/MariaDB: `node-sql-parser` → confermato.** 100% (49/49) degli statement del dump reale parsati,
AST completo su colonne, PK, UNIQUE, KEY e FK (sezione C). Non serve un parser proprio del sottoinsieme
DDL. Cose da portare nell'importer, tutte verificate sull'output reale del test:

- i percorsi AST della sezione C sono quelli buoni: usarli, non andare a memoria;
- `nullable` **è assente** sulle colonne nullabili (c'è solo quando la colonna è `NOT NULL`): trattare
  l'assenza come "nullabile", non come "sconosciuto";
- le `KEY` non uniche stanno su `resource: "index"`, non su `resource: "constraint"`;
- `constraint_type` ha **case incoerente** (`"primary key"` e `"unique key"` minuscoli, `"FOREIGN KEY"`
  maiuscolo): confrontare case-insensitive;
- esiste anche l'entry `node-sql-parser/build/mariadb`, da valutare contro `build/mysql` quando la
  sorgente è MariaDB (il dump reale di questo spike lo è);
- i commenti eseguibili `/*!` e `/*M!` vanno **spogliati dal chunk**, non scartati insieme al chunk;
- lo split degli statement deve essere consapevole di stringhe e `DELIMITER`, **oppure** l'importer
  accetta solo dump di schema e lo dichiara esplicitamente all'utente. Lo split di questo spike
  (`split(/;\s*\r?\n/)`) vale solo per `mysqldump --no-data`.

**Importer: il canale `warnings` nasce alimentato dai dati veri.** Il contratto della spec §4.4 è
`(ddl: string) => { model, warnings }`; l'importer deve riempire `warnings` fin dal primo giorno, con quello
che i parser già producono e che lo spike buttava via:

- **Postgres**: gli errori di `libpg-query` portano `sqlDetails` con **posizione e messaggio** dello
  statement che ha fallito. Lo spike li collassava in `String(err)`, perdendo tutto: l'importer deve
  propagarli nel warning, così l'utente sa *dove* nel dump è il problema.
- **MySQL**: gli **statement scartati dal chunking** (commenti eseguibili `/*!` e `/*M!`, chunk non
  parsabili) devono diventare warning, non sparire in silenzio — 90 chunk su 139 sono stati scartati sul
  dump reale senza che nulla lo segnalasse.

**Il worker dell'importer deve avere `onerror` e un timeout.** Il worker dello spike non li aveva: un
fallimento di caricamento del modulo o del `.wasm`, o un parse che non ritorna, lasciano la promessa
appesa per sempre e il dialog di import bloccato senza messaggio. Servono un handler `onerror` (e
`onmessageerror`) che respinga la promessa e un timeout che la chiuda con un errore leggibile.

**Fixture per i test dell'importer:** i dump sintetici in `spike/fixtures/*.synthetic.sql` (committati,
rigenerabili con `scripts/gen-pg-dump.mjs` e `scripts/gen-mysql-dump.mjs`) restano la fixture del
repo; i dump reali restano locali e non committati.

**Test e TypeScript.** `tsc -b` compila anche i test che stanno dentro `src/`, e lì `node:fs` non
risolve senza `/// <reference types="node" />` in testa a ogni file di test. Il piano successivo deve
introdurre un **tsconfig dedicato ai test** (o spostarli fuori da `src/`) invece di ripetere la
direttiva file per file.

**Debiti minori, rinviati alla revisione finale del piano successivo:**

- ~~`strict` non è dichiarato in nessuno dei tsconfig: TS 6 lo attiva di default, ma è meglio esplicito~~
  — **risolto** nella revisione finale del branch: `"strict": true` esplicito in `tsconfig.app.json` e
  `tsconfig.node.json`;
- ~~`README.md` è ancora il boilerplate del template Vite~~ — **risolto** nella revisione finale del branch;
- il font Oxanium è dichiarato dal preset (`--font-heading` in `src/index.css`, dipendenza
  `@fontsource-variable/oxanium`) ma nessun componente lo usa;
- ~~nessun pin di `packageManager` / `engines` in `package.json` (pnpm 10, Node 22 sono solo convenzione)~~
  — **risolto** nella revisione finale del branch;
- `createRequire(...).resolve("libpg-query/wasm/libpg-query.wasm")` in `vite.config.ts` viene eseguito
  al caricamento della config: se la dipendenza sparisce, a rompersi è qualunque comando Vite, non solo
  l'import (si risolve insieme al punto qui sotto);
- il plugin emette il `.wasm` in `dist/assets/` **incondizionatamente**: verificato dopo la rimozione
  dello spike, il binario da 1,1 MB finisce nella build anche se nessun modulo dell'app importa
  `libpg-query`. È peso morto finché l'importer non esiste. Il plugin `libpgQueryWasm` va quindi reso
  **condizionale** nel piano successivo: emettere il `.wasm` **solo se un chunk della build importa
  davvero `libpg-query`**, agganciare il percorso di atterraggio a `config.build.assetsDir` invece di
  hardcodare `assets`, e spostare la risoluzione del file (`createRequire(...).resolve(...)`, oggi eseguita
  al caricamento della config) **dentro gli hook** del plugin, così che una dipendenza mancante rompa
  l'import e non qualunque comando Vite.

**Sorprese (cose che la spec non prevedeva):**

- nessuna delle due strade previste per il `.wasm` (default Vite, copia in `public/`) funziona: è
  servito un plugin;
- `pg_dump` 18 emette meta-comandi psql che fanno fallire il parse dell'intero dump;
- il costo del pan è quasi pari a quello del drag, che è il sintomo del re-render della radice;
- lo shim di tipi per `node-sql-parser` non serve con la 5.4.0 (il pacchetto pubblica `build/mysql.d.ts`
  e non ha campo `exports`).
