# Debito tecnico

Difetti noti e osservazioni accettate, travasate dai ledger dei tre piani
eseguiti con subagent-driven-development (`.superpowers/sdd/`, directory
git-ignored ora cancellata). I ledger contenevano la motivazione di ogni
rinvio e il costo-se-sbagliato: qui resta la sostanza, non la cronaca.

Ogni voce è stata **riverificata sul codice** il 2026-09-09: i riferimenti
`file:riga` sono veri a quella data, non copiati dai ledger.

Le voci in **Da correggere** sono difetti reali senza una data. **Corretti**
tiene quelle chiuse, con il modo in cui sono state chiuse: serve a non
riaprire una discussione già fatta, e in un caso a ricordare che il difetto
non era dove sembrava. Le voci in **Archivio** sono decisioni prese con
cognizione: si riaprono solo se danno fastidio, e la voce esiste perché
nessuno le riscopra come se fossero nuove.

---

## Da correggere

Niente, al 2026-09-09. Le sei voci DT-1..DT-6 sono state corrette nel commit
`eeca340`; restano qui sotto in **Corretti** perché una di esse è stata
corretta in un posto diverso da quello che questo documento indicava, e la
ragione vale più della voce.

---

## Corretti

### DT-1 · chiave ambigua → collisione silenziosa nell'import

**Il documento sbagliava mira.** Diceva di vietare il punto dentro un nome.
Ma l'import DDL *sostiene* deliberatamente un nome con il punto e ne risolve
le FK, con un test che pretende zero avvisi: vietarlo avrebbe rimosso una
capacità aggiunta di proposito, e il primo tentativo di fix ha infatti rotto
quel test.

Il difetto vero era un altro: due tabelle diverse possono produrre la stessa
chiave — `utenti` nello schema `pub` e `pub.utenti` senza schema — e la
seconda sovrascriveva la prima **senza alcun avviso**. Corretto in `map.ts`
con una guardia sulla collisione: si salta con un avviso e sopravvive la
prima. La rinomina non aveva bisogno di nulla: rifiutava già una collisione
di chiave (`er.ts`), e ora lo dice anche all'utente (DT-3).

*Lezione per le voci future: annotare il difetto osservato, non la
correzione immaginata.*

### DT-2 · `spaceHeld` non si azzerava al blur

Listener `blur` su `window`. Il `keyup` non arriva se il fuoco lascia la
finestra col tasto premuto, e al rientro il canvas restava in pan senza modo
di uscirne. Nessun test unitario possibile senza jsdom: provato in un browser
con input reale, e con la controprova (senza il blur lo stesso drag pana).

### DT-3 · la rinomina falliva in silenzio

L'avviso passa da `NoticeBar`, e `CommitInput` ripristina il campo quando
`onCommit` torna `false` — prima il campo continuava a mostrare il testo
rifiutato come se fosse stato accettato. Il caso «nessun cambiamento» non è
un fallimento e non avvisa: si riconosce dalla chiave, che resta identica
solo se nome e schema lo sono entrambi.

### DT-4 · lampo del tema al primo render

Script bloccante in `<head>`, con la stessa chiave di `use-theme.ts`.
Provato con un `MutationObserver` installato a document-start: una sola
mutazione della classe, con `readyState` «loading» e `#root` non ancora
esistente.

### DT-5 · `removeAttribute` lasciava riferimenti pendenti

Pota il nome dagli estremi delle relazioni, confrontando **anche l'entità**:
due attributi omonimi di entità diverse si poterebbero a vicenda. Se
l'estremo resta vuoto la relazione diventa «disegnata a mano» (ADR 0003) e un
re-import non la pota più — conseguenza accettata: è preferibile a un
riferimento pendente, e cancellare la relazione di nascosto sarebbe peggio di
entrambi.

### DT-6 · lo script di prestazione non era usabile come gate CI

`process.exitCode = 1` su FAIL, e le due soglie scritte a mano interpolano
`THRESHOLD_MS`.

---

## Nuove voci

### DT-7 · `use-theme.ts` non protegge l'accesso a `localStorage`

`initial()` in [use-theme.ts](../src/ui/use-theme.ts) chiama
`localStorage.getItem` senza `try/catch`. Dove i dati del sito sono bloccati
del tutto l'accesso lancia, e qui il lancio è durante il primo render:
pagina bianca. Lo script inline aggiunto per DT-4 si protegge, l'hook no.
Notato lavorando su DT-4, non corretto perché fuori dai sei fix chiesti.

---

## Archivio

### Modello ed editor ER

- `entityKey` ambigua col punto → **corretta** come collisione di chiave, vedi DT-1.
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
- `spaceHeld` che non si azzera al blur → **corretto**, vedi DT-2.
- `removeAttribute` che lascia riferimenti pendenti → **corretto**, vedi DT-5.
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
- Flash del tema → **corretto**, vedi DT-4.
- Il `data-slot` dei trigger diventa `"tooltip-trigger"` per lo spread di
  Radix; i pulsanti disabilitati non mostrano tooltip
  (`pointer-events-none`).
- Collisione di rename silenziosa → **corretta**, vedi DT-3.
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
- Script di prestazione → **corretto**, vedi DT-6.
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
