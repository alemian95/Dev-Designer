# 0002. Worker unico con `import()` dinamico dell'adapter di dialetto

Date: 2026-09-08

## Status

Accepted

## Context

Il parse del DDL non può bloccare l'interfaccia. I numeri dello spike sono
modesti — 136 ms per 200 tabelle — ma non sono il caso da difendere: un dump
completo con i dati, quello che si incolla per sbaglio, è di un altro ordine di
grandezza, e in ogni caso l'utente deve poter annullare un'analisi in corso
chiudendo il dialog.

Servono due parser, uno per dialetto, e sono molto diversi fra loro:
`libpg-query` carica un binario WASM da ~1,1 MB, `node-sql-parser` è un pacchetto
UMD/CJS. La sua interoperabilità dentro un module worker sotto Vite era l'unica
vera incognita tecnica del progetto: in Node ESM puro l'import nominato
fallisce, e nel worker andava verificata nel browser, non dedotta.

Lo spike aveva lasciato scritto che il suo worker non aveva `onerror`,
`onmessageerror` né timeout, e che un fallimento di caricamento del `.wasm`
lasciava la promessa appesa per sempre, con il dialog bloccato e senza messaggio.

## Decision

Adottiamo un **solo** worker (`src/io/ddl/parse.worker.ts`, `82ff992`) che
carica l'adapter del dialetto richiesto con un `import()` dinamico, e
`parse-client.ts` sul thread principale ne governa il ciclo di vita e la
protezione: `onerror` e `onmessageerror` respingono la promessa con un messaggio
leggibile, un timeout di 30 s la chiude, `dispose()` chiama `terminate()`, e un
worker rotto o scaduto viene terminato e rimpiazzato alla `parse()` successiva.

Non cambiamo `worker.format`, che resta il valore di default di Vite.

## Consequences

Il protocollo dei messaggi e tutto il ponteggio di protezione esistono in un
posto solo. Due worker separati li avrebbero raddoppiati.

Il code splitting fra i due parser **non avviene**, contrariamente a quanto la
motivazione originale dell'`import()` dinamico supponeva. Verificato su `dist/`
dopo `pnpm build` e corretto nella documentazione (`19a1086`): il formato di
default dei worker in Vite è `iife`, che disabilita il code splitting, e in
`dist/` c'è un solo `parse.worker-*.js` da 332 KB contenente entrambi i parser,
senza alcun `import(` residuo. Chi importa Postgres scarica comunque tutto
`node-sql-parser`, e viceversa. Ciò che resta davvero pigro è il `.wasm` di
libpg-query, che non è incorporato nel chunk e si carica alla prima parse: ed è
quello il peso da non scaricare a vuoto.

`worker.format: "es"` renderebbe vero lo splitting, ma è anche l'unica leva che
governa l'interop di `node-sql-parser` dentro il worker — il punto più fragile
della catena, verificato a mano una volta sola e oggi funzionante. Chi lo
cambierà deve rifare quella verifica nel browser, per entrambi i dialetti.

Il worker non è raggiungibile dai test unitari: nessun test lo importa, e quindi
il dispatch per dialetto e l'incapsulamento degli errori esistono soltanto nel
browser. Ne segue un obbligo permanente sull'end-to-end, che deve esercitare
**entrambi** i dialetti in un browser vero (`d53569c`): è la sola rete sotto il
ramo MySQL, che è anche quello con l'incognita di interop.

Una `parse()` chiamata mentre la precedente non si è risolta abbandona
quest'ultima, rigettandola e terminando il worker su cui girava, e nel dialog una
guardia di generazione ignora comunque ogni risoluzione non più corrente
(`70acbcb`). Il contratto di `DdlParser.parse` è quindi esplicitamente **non
concorrente**: non esiste più uno stato con due richieste pendenti insieme.
