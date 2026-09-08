# Debito tecnico

Difetti noti e osservazioni accettate, travasate dai ledger dei tre piani
eseguiti con subagent-driven-development (`.superpowers/sdd/`, directory
git-ignored ora cancellata). I ledger contenevano la motivazione di ogni
rinvio e il costo-se-sbagliato: qui resta la sostanza, non la cronaca.

Ogni voce è stata **riverificata sul codice** il 2026-09-09: i riferimenti
`file:riga` sono veri a quella data, non copiati dai ledger.

Le voci in **Da correggere** sono difetti reali senza una data. Le voci in
**Archivio** sono decisioni prese con cognizione: si riaprono solo se danno
fastidio, e la voce esiste perché nessuno le riscopra come se fossero nuove.

---

## Da correggere

### DT-1 · `entityKey` è ambigua se il nome contiene un punto

`src/model/document.ts:30` — la chiave è `schema.nome`, quindi un'entità
chiamata `my.table` senza schema è indistinguibile da `table` nello schema
`my`. Lo schema zod `Identifier` non vieta il punto.

Non è ipotetico: **lo stesso assunto ha prodotto un difetto reale** nel
mapping dell'import DDL, dove una tabella `"my.table"` veniva creata e poi
la sua stessa FK scartata con l'avviso «punta a "my.table", che non è nel
diagramma». Là è stato corretto leggendo il nome nudo dal campo `name` della
`SqlTable` invece di spezzare la chiave sul primo punto; nell'editor la
chiave resta ambigua alla fonte.

### DT-2 · `spaceHeld` resta `true` se la finestra perde il focus

`src/ui/canvas/use-canvas-interaction.ts:97,233,243` — `spaceHeld` si
azzera solo sul `keyup` di Space. Nel progetto **non esiste alcun listener
`blur` o `visibilitychange`** (verificato con grep su tutto `src/`): se
l'utente tiene premuto Space e cambia finestra, al rientro il canvas è in
pan permanente e nulla lo sblocca fino al prossimo Space.

### DT-3 · La collisione di rename fallisce senza dirlo

`src/ui/panels/PropertiesPanel.tsx:59-64` — `rename()` dispiega la ricetta e
aggiorna la selezione **solo** se `dispatch` restituisce `true`. Sul `false`
di una collisione non accade niente: nessun avviso, e `CommitInput` continua
a mostrare il testo non salvato come se fosse stato accettato. Stesso
comportamento in `src/ui/canvas/InlineEditor.tsx:28`.

### DT-4 · Possibile flash del tema al primo render

`src/ui/use-theme.ts:16` applica la classe `dark` in un `useEffect`, e
`index.html` non ha alcuno script bloccante che la imposti prima. Con
`prefers-color-scheme: dark` il primo frame può essere chiaro.

### DT-5 · `removeAttribute` lascia riferimenti pendenti

`src/editor/commands/er.ts:123` fa solo lo `splice` dell'attributo: i nomi
rimasti in `RelationshipEnd.attributes` non vengono ripuliti.

**Attenuante verificata:** non è una perdita silenziosa. La regola
`dangling-relationship` in `src/model/er/validate.ts:63-66` intercetta il
caso e lo segnala come `error` nel pannello problemi. Il fix è comunque una
riga nel comando, e il posto giusto è lì e non nella validazione.

### DT-6 · Lo script di prestazione non è usabile come gate CI

`scripts/perf/fps.mjs` non imposta `process.exitCode` su FAIL: esce 0 anche
quando una soglia sfora, quindi in una pipeline passerebbe sempre. La label
del verdetto ha anche `20` scritto a mano invece di interpolare
`THRESHOLD_MS`.

---

## Archivio

### Modello ed editor ER

- `entityKey` ambigua col punto → promossa a **DT-1**.
- `migrateDocument` restituisce l'alias dell'input quando non ci sono
  migrazioni da applicare (nessuna copia difensiva).
- Round trip di serializzazione con entità qualificata da schema: non
  coperto da test.
- `validateEr` concentra cinque controlli in un blocco di ~55 righe.
  Estraibili se il file cresce, non prima.
- `entity-name-clash` confronta solo con la prima entità della chiave
  case-insensitive: con tre collisioni non le raggruppa.
- `fk-without-relationship` valuta le relazioni uscenti a livello di entità,
  non per singolo attributo — è il codice del piano, accettato. Falsi
  negativi su entità con più FK e una sola relazione.
- `routeEdge` riconosce l'auto-relazione per **uguaglianza di valore** dei
  `Rect` (`sameRect`, `src/editor/edge-routing.ts:14,18`), non per identità
  delle entità: due nodi perfettamente sovrapposti diventano un self-loop.
- Il clamp di `zoomAt` è testato solo a `MAX_SCALE`.
- `duplicateEntities` usa i suffissi `_copy2`/`_copy3`
  (`src/editor/commands/er.ts:188`) mentre `uniqueKey` usa `_2`/`_3`:
  incoerenza di convenzione, nessun test la copre.
- `documentStore` è un singleton di modulo. Una factory servirebbe solo per
  editor multipli: YAGNI.
- `PointerInfo.alt` è dichiarato e popolato ma mai letto; il ramo 2 di
  `PointerInfo.button` è irraggiungibile.
- Nessun test sul marquee additivo (shift+drag sul vuoto), sullo shift+click
  su relazione, sulla soglia esatta `MARQUEE_MIN=3`.
- L'hook delle interazioni non ha test automatici: l'invariante «un comando
  al rilascio» non ha rete di regressione.
- La guardia «il target è un campo di testo» è duplicata fra
  `use-canvas-interaction.ts` e `use-keyboard-shortcuts.ts`. Una riga: un
  modulo condiviso sarebbe astrazione prematura.
- `selection.ts` da estrarre da `session-store.ts`, e i due listener
  `keydown` su `window` da unificare — entrambi rinviati dal piano 1.

### Rendering e UI

- Ref callback inline in `EntityNode`/`RelationshipEdge`: deregister e
  register a ogni update, `useCallback` lo eviterebbe.
- `data-node-header` è su `rect` e su `text`: `querySelector` prende il
  `rect`.
- `render.test.tsx` non copre l'entità senza attributi né la relazione verso
  un'entità mancante.
- Flash del tema → promosso a **DT-4**.
- Il `data-slot` dei trigger diventa `"tooltip-trigger"` per lo spread di
  Radix; i pulsanti disabilitati non mostrano tooltip
  (`pointer-events-none`).
- Collisione di rename silenziosa → promossa a **DT-3**.
- L'helper `dispatch` di `PropertiesPanel` ignora il boolean di ritorno
  (oggi innocuo altrove, vedi DT-3).
- Il `Flag` usa un `<label>` nativo invece del componente `Label`.

### Persistenza

- `idb` e `fake-indexeddb` sono pinnate esatte invece che con `^` come il
  resto del manifest. Disomogeneità cosmetica, e un pin esatto sulla
  persistenza è più prudente, non meno.
- Nessun test di `listRecent()` su database vuoto: il ramo è percorso di
  fatto da `restoreLast` senza record.
- Tabella di verità di `detectCapabilities` asimmetrica; combinazione
  `pickers`/`hasHandle`/`forceNew` ridondante non testata; non-null
  assertion su `window.showOpenFilePicker!` (il gating sulle capacità è
  responsabilità del chiamante, per progetto).
- Il `BroadcastChannel` del lock non viene chiuso se il callback lanciasse
  fra `addEventListener` e `await held`. Su quel percorso non esiste un
  `throw`: avvolgere codice concorrente in un `try/finally` per uno scenario
  immaginario introdurrebbe il bug che dice di prevenire.
- Il test «un `onCede` che fallisce non blocca la cessione» passa anche
  senza il fix: gli `expect` non discriminano, il RED viene solo dal
  rilevatore globale di Vitest. L'asserzione esplicita richiederebbe un
  handler `process.on("unhandledRejection")`, che in worker condivisi
  catturerebbe i rigetti di altri test — un test fragile diventerebbe un
  test che mente.
- Autosave: due `flush()` ravvicinati producono due `put` quasi identici;
  dopo l'autodisabilitazione si continuano a programmare timer a vuoto;
  `stop()` non attende una scrittura in volo, che se fallisce imposta ancora
  l'avviso. Il docblock prescrive già `flush()` atteso prima di `stop()`.
- `openWithPicker` senza test: composizione pura, ma è l'unico percorso che
  né i test né l'e2e raggiungono.
- `document-io.ts` è a 272 righe: il ledger diceva 256 «al limite», da
  allora è cresciuto di 16.
- La funzione `handoff()` per unificare i tre percorsi di cambio documento è
  stata rifiutata: tre `flush()` espliciti sono più leggibili di
  un'astrazione che nasconde l'ordine delle operazioni, e l'ordine è
  precisamente ciò che il difetto corretto lì aveva sbagliato. Se nascesse un
  quarto percorso, qualcuno potrebbe dimenticare il flush.
- Se `tryOwn` rigettasse **dopo** che `mountRecord` ha montato un record
  valido, il testo «si parte da uno nuovo» sarebbe impreciso: il documento è
  stato ripristinato, solo il lock no. Doppio guasto.
- Il flag `readOnly` sopravvive un istante al cambio documento (finestra
  sub-millisecondo); l'avviso di archivio non disponibile non si ripete dopo
  un `mount`; `setLastOpenedId` sta nello stesso `safe` di `db.put`; il
  messaggio «l'altra scheda non risponde» è fuorviante quando è un'altra
  richiedente a vincere la corsa.
- e2e: il `waitForTimeout(800)` è slegato da `AUTOSAVE_DELAY_MS` — è l'unico
  punto senza un segnale osservabile, perché l'autosave non distingue
  «scritto» da «sporco», e il margine 2× è dichiarato nel commento;
  `waitForEvent("download")` è senza timeout esplicito; i 10 s della revoca
  del blob sono arbitrari.

### Import DDL

- Un re-import di contenuto **identico** aggiunge comunque una voce di
  storia: Immer genera le patch per identità di riferimento e gli oggetti
  `Entity` sono ricreati da zero a ogni parse. Il no-op regge solo per
  `importEr({}, [])`. Premere «Importa» è un'azione deliberata: che sia
  annullabile è difendibile, e il rimedio — confronto strutturale su ogni
  entità prima della scrittura — è complessità vera per un caso benigno.
- In MySQL un `REFERENCES` senza lista di colonne fa rifiutare a
  `node-sql-parser` l'**intero** `CREATE TABLE`, inline e su
  `FOREIGN KEY(...)`: la tabella sparisce del tutto. È un limite del parser
  di terze parti, non del nostro codice, e non è `refColumns` vuoto (in
  Postgres il caso è gestito risolvendo sulla PK del target). Se salta fuori
  su un dump reale, la via è normalizzare il testo prima di `astify`.
- `worker.format: "es"` non è stato toccato: sarebbe la leva per il code
  splitting nel worker (il formato `iife` di default lo disabilita, un solo
  chunk da 332 KB contiene entrambi i parser) ma rischierebbe l'interop di
  `node-sql-parser`, l'unica cosa fragile della catena.
- `kindOf` ha un fallback `"sconosciuto"` che è codice morto: un `Node` ha
  sempre una chiave.
- `parse.worker.ts` e `spawn.ts` non hanno test propri e nessun test li
  importa. Il ramo MySQL è coperto end-to-end nel browser; **non** sono
  coperti il caricamento da file e il toggle manuale del dialetto.

### Tooling

- ~~La regola ESLint di layering è su `**/*.ts` e non copre i `.tsx` in
  `model`/`editor`.~~ **Non è più vero:** `eslint.config.js` usa
  `**/*.{ts,tsx}` per tutti e quattro gli strati (righe 32, 45, 57).
  Risolto lungo la strada, senza che nessuno lo registrasse.
  `no-restricted-imports` blocca anche gli `import type`: voluto.
- `noUncheckedIndexedAccess` non è abilitato in `tsconfig` (verificato).
- Script di prestazione → promosso a **DT-6**.
- Non esiste `ErrorBoundary` né un gestore di `unhandledrejection`: la
  correzione dell'avvio ha chiuso il percorso noto, non la classe.

---

## Perduto

I **12 rilievi Minor** della review finale del piano 1 non sono recuperabili.
Il ledger ne registrava solo il numero — i 5 Important sono stati corretti e
sono nella storia git — e il testo del revisore non è mai stato scritto su
file: esisteva solo nel transcript di quella sessione, che non è più sul
disco (verificato: nella cartella dei progetti resta un solo `.jsonl`, di
questa sessione).

È esattamente la perdita che questo documento esiste per impedire da qui in
avanti. **Regola:** un rilievo che si decide di non correggere si scrive
qui nello stesso momento in cui si decide, non «alla fine del piano».
