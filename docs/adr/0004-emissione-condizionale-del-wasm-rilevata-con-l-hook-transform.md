# 0004. Emissione condizionale del `.wasm` di libpg-query rilevata con l'hook `transform`

Date: 2026-09-08

## Status

Accepted

## Context

Emscripten cerca `libpg-query.wasm` accanto allo script che lo carica
(`scriptDirectory`), e `loadModule()` non espone `locateFile`: il percorso del
binario non si può indicare dal codice applicativo. Serve quindi un plugin Vite
che serva il file in sviluppo e lo emetta in build — non è una comodità, è
l'unico modo di far trovare quel file.

Lo spike aveva scritto quel plugin nel modo più corto, e lasciato il debito: il
binario da ~1,1 MB finiva in `dist/` a ogni build, anche quando nessun modulo
importava `libpg-query`.

Rilevare l'uso reale della dipendenza non è però immediato. Il disegno del piano
prescriveva l'hook `resolveId`, che sotto Vite 8 **non viene mai invocato** per
gli specifier che il motore su rolldown risolve nativamente in Rust: verificato
strumentando il plugin, zero chiamate su 2097 moduli trasformati. L'hook che
viene invocato in modo affidabile è `transform`, che rolldown chiama per ogni
modulo che passa dal container dei plugin.

C'è poi una seconda complicazione: Vite compila i worker in una build separata,
con la propria lista di plugin (`worker.plugins`), e `libpg-query` è importato
**solo** dal worker che fa il parsing. Un plugin registrato in un solo elenco
non vede i moduli dell'altra build.

Il modo di fallire di tutto questo è silenzioso. Un binario che non viene
emesso non fa fallire la build: la rompe a runtime, alla prima analisi di un
DDL Postgres.

## Decision

Adottiamo il rilevamento tramite l'hook `transform` filtrato sull'id
(`80d26af`), con il plugin registrato **sia** in `plugins` **sia** in
`worker.plugins`: ogni istanza vede i moduli della propria build ed emette il
binario nella propria `generateBundle` soltanto se l'ha visto passare. Non
condividiamo stato fra le due istanze, avendo verificato che l'asset emesso
dall'istanza del worker atterra comunque nel `dist/` finale sotto `assetsDir`.

Manteniamo le altre due correzioni chieste dallo spike: il percorso di
atterraggio deriva da `config.build.assetsDir` invece della stringa `assets`
scritta a mano, e la risoluzione del file avviene **dentro** gli hook e non al
caricamento della config.

## Consequences

Una build che non raggiunge `libpg-query` non porta più il megabyte in `dist/`.
Va detto però che nell'applicazione come è oggi la condizione è sempre vera: il
dialog importa staticamente il worker, quindi il binario viene comunque emesso.
Il beneficio è per un futuro in cui l'importer venga rimosso o isolato
diversamente, non per la build corrente.

La correttezza poggia su un comportamento di rolldown che non è un contratto
pubblico documentato. Se un aggiornamento di Vite smettesse di invocare
`transform` per quel modulo, il binario sparirebbe da `dist/` **senza** che la
build fallisca. Ne segue un obbligo: **ogni aggiornamento maggiore di Vite
richiede di rieseguire le due verifiche opposte** — che il binario ci sia quando
la dipendenza è raggiungibile, e che non ci sia quando si rende irraggiungibile
l'import nel worker.

La rete che protegge da quel modo di fallire è `pnpm e2e`, e vale la pena sapere
perché: lo script fa una `vite build` vera, serve `dist/` e poi analizza un DDL
Postgres in un browser vero. Un binario mancante lo fa fallire. È l'unico
controllo automatico che copre questa decisione — non esiste né può esistere un
test unitario per il comportamento di una build.

Poiché la risoluzione del percorso sta dentro gli hook, una dipendenza mancante
rompe l'import e non qualunque comando Vite: con `libpg-query` rimosso da
`node_modules`, `vite --help` continua a terminare con successo.
