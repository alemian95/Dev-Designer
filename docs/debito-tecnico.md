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

Niente, al 2026-09-22, con i cinque gate verdi sull'albero pulito: vedi
«Prima del flowchart» in fondo all'Archivio. DT-1..DT-6 sono state corrette nel commit `eeca340`,
DT-7 e le minori aperte dalla revisione di `feat/export-testo` subito dopo;
restano qui sotto in **Corretti** perché due di esse sono state corrette in un
posto diverso da quello che questo documento indicava, e la ragione vale più
della voce. DT-8..DT-10 sono state scelte dall'Archivio il 2026-09-13, per
priorità: un difetto riproducibile in tre click, l'unica incoerenza che il
codice dichiara sbagliata su sé stesso, e la classe di guasto che lasciava la
pagina bianca.

DT-11, DT-12 e DT-13 sono le voci che seguivano, chiuse lo stesso giorno, e DT-14
è il gate di prestazione che DT-11 ha fatto scoprire rosso.

DT-20..DT-24 sono il giro del 2026-09-17, scelte dall'Archivio con lo stesso
criterio: prima i due difetti che un utente vede nel pannello problemi, poi il
flag di type safety che mancava, poi i buchi di copertura lasciati dal primo
piano. DT-25 non era in lista: si è presentata da sé, come una corsa rossa su
venti, ed era un test instabile — la cosa peggiore da lasciare in giro il
giorno dopo aver acceso la CI. L'ultima è un'archiviazione e non una correzione: la voce indicava un
difetto che non c'è, e ora c'è il test che tiene vero il contratto che conta.

DT-26 e DT-27 sono del 2026-09-21 e non vengono dall'Archivio: vengono da **un
database vero**, un dump phpMyAdmin di Chamilo da 240 tabelle passato per
l'import. Nessuna delle due era in lista, e nessuna delle due si sarebbe vista
su una fixture sintetica — che è uniforme, mentre uno schema reale non lo è mai.

DT-28 è dello stesso giorno ed è il primo passo del giro di ampiezza: una voce
d'Archivio scelta di proposito, che misurandola si è rivelata la punta di un
difetto più grande di com'era scritta.

DT-29 è del 2026-09-21 come le precedenti tre, ma viene dal giro delle note
ancorate e chiude le due voci d'Archivio sull'ancoraggio e sul layout delle
note, il cui rimedio comune si è rivelato essere un arco, non un campo nuovo.

DT-30 è del 2026-09-24, dalla review finale del piano dei collegamenti
tipizzati fra famiglie (`.superpowers/sdd/2026-09-24-collegamenti-tipizzati/`):
un limite noto della tabella dei tipi, lasciato aperto perché il caso che lo
tocca non si è ancora presentato.

### DT-30 · `char`/`character` danno solo la categoria string: un uuid MySQL può produrre un falso `link-type-mismatch`

La tabella dei tipi SQL di
[types.ts](../src/model/links/types.ts:32) mette `char`/`character` (con
`varchar` e gli altri tipi testuali) nella sola categoria `string`. In
PostgreSQL non è un problema: chi vuole un uuid usa il tipo nativo `uuid`, già
mappato su `["uuid", "string"]`. In MySQL, che non ha un tipo uuid nativo, la
convenzione comune è una colonna `char(36)`: una classe con un attributo
`uuid` collegata a quella colonna riceve un `link-type-mismatch` («non è
compatibile»), anche se il valore che ci finisce dentro è esattamente un uuid.

Non si corregge ora perché nessuna fixture né il dump reale importato finora
(Chamilo, DT-26/DT-27) usa questa convenzione: aggiungerla sulla fiducia
rischierebbe l'errore opposto, un vero mismatch fra un `char` generico e un
`uuid` che passa silenzioso. Si corregge dando a `char`/`character`
`["string", "uuid"]` — la stessa forma di `json`/`jsonb`, poco sopra nella
stessa mappa — quando un caso reale lo chiede.

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
di uscirne. Provato in un browser con input reale, e con la controprova
(senza il blur lo stesso drag pana). «Nessun test unitario possibile senza
jsdom», diceva questa voce: **ora c'è**, vedi DT-19.

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

### DT-7 · `use-theme.ts` non protegge l'accesso a `localStorage`

`try/catch` su entrambi gli accessi in [use-theme.ts](../src/ui/use-theme.ts),
non solo su `getItem` come diceva la voce: dove i dati del sito sono bloccati
anche `setItem` lancia, e lì il lancio è dentro l'effect — stessa pagina
bianca per una strada diversa. Quando questa voce è stata scritta non c'era
dove eseguire un test — simulare lo storage bloccato in Playwright costa più
del difetto — ma da DT-19 jsdom c'è, e questo sarebbe il primo posto dove usarlo.

### DT-8 · lo strumento sopravviveva al cambio di diagramma

`mount()` azzerava selezione ed editing — chiavi di un altro documento — ma
non `session.tool`, che non ha chiavi e ha però un *tipo di diagramma*:
`note` esiste solo nel class diagram. Passando a un ER lo strumento restava
attivo e il click sul canvas non faceva nulla, senza niente a schermo che lo
spiegasse. Una riga in [document-io.ts](../src/io/document-io.ts), accanto
alle due che c'erano già. Il test in `document-io.test.ts` arma `note` prima
del `restoreLast` e pretende `select` dopo: verificato RED togliendo la riga
(`expected 'note' to be 'select'`), e riprovato nel browser sul percorso
reale, «Nuovo ▸ Diagramma ER» con lo strumento nota premuto.

### DT-9 · due editor montati sul testo della stessa nota

Il doppio click su una nota già selezionata — e anche la creazione di una nota
nuova, che apre l'overlay da sé — monta insieme `NoteEditor` e la `textarea`
di `NoteProperties`: due campi modificabili sullo stesso dato, cioè ciò che il
commento del campo «Membri» nello stesso file scarta per le classi.

**La voce d'Archivio sospettava una divergenza dei valori: non c'è.** Provato
nel browser: `key={note.text}` rimonta il campo del pannello appena l'overlay
commette sul blur, e mettere a fuoco il pannello è precisamente ciò che
*provoca* quel blur — la scrittura perduta non si riesce a produrre. Il
difetto vero è che dalla schermata non si legge quale dei due comandi il
testo. Finché l'overlay è aperto su quella nota il campo del pannello è
`readOnly`, opaco, e lo dichiara («Modifica in corso sul canvas»). *Di nuovo
la lezione di DT-1: correggere il difetto osservato, non quello immaginato.*

### DT-10 · nessuna rete sotto l'albero di render

Non esisteva né un `ErrorBoundary` né un gestore di `unhandledrejection`: la
correzione dell'avvio aveva chiuso il percorso noto — il `try` attorno a
`restoreLast()` in `main.tsx` — non la classe. In un'app senza backend una
pagina bianca è lavoro perso, e nessun posto dove leggere cosa sia successo.

[ErrorBoundary.tsx](../src/ui/ErrorBoundary.tsx) avvolge `<App />`: mostra il
messaggio, offre il ricarico e in `componentDidCatch` forza `autosave.flush()`
così il ricarico riparte dall'ultima modifica e non dall'ultimo debounce
scaduto. Il flush non è atteso e l'archivio può essere indisponibile, quindi
il testo promette solo ciò che `restoreLast` garantisce comunque: l'ultimo
stato *presente nell'archivio*. Lo stack resta in console — l'eccezione non si
nasconde.

I rigetti non gestiti non passano da un render e il boundary non li vede: un
listener in `main.tsx` li porta nella `NoticeBar` senza `preventDefault`,
quindi l'avviso si aggiunge alla console invece di sostituirla. Entrambi
provati nel browser: un `throw` temporaneo in `App` rende il pannello invece
della pagina bianca, un `Promise.reject` produce «Operazione non riuscita: …»
nella barra.

### DT-11 · due archi fra la stessa coppia si sovrapponevano esattamente

Ogni arco attaccava al centro del proprio lato, quindi due relazioni fra le
stesse due classi si disegnavano una sull'altra, etichette comprese: se ne
vedeva una sola e l'altra non si poteva nemmeno selezionare.

**La voce d'Archivio diceva che serviva far conoscere a `routeEdge` il fascio
di archi che tocca un nodo. Non serve, e infatti non è stato fatto.** Quel che
il fascio sa e il routing no è *un numero per arco*: lo scarto laterale
rispetto agli altri archi della stessa coppia. `edgeOffsets`
([edge-routing.ts](../src/editor/edge-routing.ts)) lo calcola una volta sul
modello, `routeEdge` lo riceve come parametro e si limita ad applicarlo, e la
§7 della spec resta dov'era. Zero — il default — è esattamente la geometria di
prima, quindi un arco unico non si sposta di un pixel: i 546 test esistenti
sono passati senza toccarne uno.

Un fascio si apre simmetrico attorno all'asse; i cappi crescono concentrici,
perché un cappio ha un solo nodo e non ha un lato opposto su cui bilanciarsi.

Tre cose trovate misurando, non ragionando:

- **Il rientro dallo spigolo era troppo largo.** A `BUNDLE_GAP` la banda utile
  si chiude a zero su un nodo alto quanto il solo header (28), e due archi fra
  due entità senza attributi uscivano di nuovo identici — visto nell'export
  prima che in un test. Ora è 6, con un test sul caso a 28.
- **L'export ricalcolava il fascio per conto proprio.** Parte dagli stessi
  estremi che il canvas passa a `edgeOffsets`, altrimenti il file scaricato
  mostrerebbe un diagramma diverso da quello a schermo. Un test in
  `svg.test.ts` lo tiene fermo.
- **`ops.edgeGeometry` rifaceva la mappa intera a ogni arco a ogni frame.**
  Regressione vera, misurata dal gate: `dragAll` da 25,9 a 125,1 ms di p95.
  `erEdgeOffsets`/`classEdgeOffsets` sono memoizzate sull'identità della mappa
  delle relazioni — Immer sostituisce l'oggetto a ogni cambiamento e non muta
  mai sul posto, quindi stesso riferimento significa davvero stesso contenuto.
  Con il memo: 26,3 e 26,6 ms su due misure, cioè il valore di partenza.

Resta fuori, e resta vero, il punto gemello dell'Archivio: le etichette di
archi **diversi** che convergono sullo stesso lato da direzioni diverse
possono ancora accavallarsi. Il fascio risolve la coppia, non la convergenza.

### DT-12 · l'autosave armava timer a vuoto dopo essersi disabilitato

Una voce d'Archivio ne metteva insieme tre. **Due delle tre non erano
difetti, e vale più la verifica della correzione.**

- **I timer a vuoto erano reali**: dopo il primo errore `flush` esce subito,
  ma la sottoscrizione continuava ad armare un `setTimeout` a ogni comando —
  uno per comando, per tutta la vita della scheda. Un `if (disabled) return`
  dopo il `patch({ dirty: true })`, che invece va segnato comunque: il
  documento è davvero cambiato e la barra lo dice. Il test guarda
  `vi.getTimerCount()`, che è l'unica cosa osservabile: senza la riga resta un
  timer armato (verificato RED).
- **«`stop()` non attende la scrittura in volo» è irraggiungibile.** L'unico
  chiamante nell'app è `main.tsx`, nel ramo `?stress=N`, *prima* di
  `documentStore.load`: a quel punto nessun comando è mai stato eseguito e
  nessuna scrittura può essere in volo. Il resto sono i test. La promessa non
  viene comunque annullata da `stop()`, quindi la scrittura arriva a
  destinazione lo stesso: il difetto immaginato era un avviso impostato su una
  sessione in smontaggio, in un percorso che non esiste.
- **«Due `flush()` ravvicinati producono due `put` quasi identici» è vero e
  non si corregge.** I `put` sono idempotenti — stesso `id`, stesso contenuto
  — e l'unico rimedio sarebbe incatenare le scritture. Ma `flush` ha un
  contratto preciso ai tre cambi di documento: deve aver scritto *lo stato di
  adesso* quando la promessa si risolve. Restituire la scrittura già in volo
  romperebbe quel contratto, e incatenarle aggiunge una coda per uno spreco
  che nessuno paga.

### DT-13 · `parseMembers` non passa i nomi per `.parse()` dello schema

La voce d'Archivio temeva che un nome rifiutato dallo schema arrivasse al
validatore molto più tardi, con una riga di errore diversa da quella dove
l'utente ha sbagliato. **Il timore è giusto, il buco è vuoto:** `Identifier` è
`z.string().min(1)` (`src/model/shared.ts`) e `parseMembers` rifiuta già il
nome vuoto nei tre punti che ne producono uno — attributo, metodo, parametro.
Non esiste un input che l'uno accetti e l'altro no, quindi infilare una
`.parse()` dentro il parser sarebbe cerimonia pura.

Il pezzo che mancava davvero è la prova che le due definizioni restino
d'accordo. Due test in `members.test.ts`: il primo fa passare l'uscita del
parser per `ClassNodeSchema.parse()`, il secondo fissa che il nome vuoto lo
rifiuta il parser, con la sua riga. Il primo è verificato RED aggiungendo una
regex a `Identifier`: fallisce lì invece che in produzione, che è il solo
lavoro che questa voce chiedeva.

### DT-14 · il gate di prestazione era rosso, e nessuno l'aveva scritto

Registrato in Archivio poche ore prima, misurando la base di DT-11: `dragAll`
p95 25,9 ms e `zoom` 33,5 ms contro un criterio di 20. `pnpm perf` falliva da
tempo imprecisato, quindi un FAIL nuovo non si sarebbe distinto dai due
vecchi — cioè il gate reso utilizzabile in CI da DT-6 non poteva passare.

**Ora passano tutti e sei gli scenari, a 300 e a 600 entità**, ciascuno al
pavimento del display. Il verbale con tutte le misure sta in
[docs/perf/2026-09-13-gate-verde.md](perf/2026-09-13-gate-verde.md); qui le
due sostanze.

- **`dragAll`**: la diagnosi era già scritta nel §5 del documento del 6
  settembre e non era mai stata agita — «lavoro pagato per intero su elementi
  che nessuno guarda». `previewDrag` salta la scrittura fuori
  dall'inquadratura, col criterio sul rettangolo **dopo** lo spostamento
  (un nodo che entra va scritto), e misura i rettangoli una volta alla presa
  invece di due volte per arco a ogni frame. Da 25,9 a 9,9 ms.
- **`zoom`**: il costo è layout di testo ed è **per glifo** — 3.900 `<text>`
  svuotati costano 207 ms contro 2.082 pieni. Nessuna proprietà CSS lo tocca
  (provate `text-rendering` nelle tre varianti, `font-kerning`,
  `shape-rendering`, `contain`, e il transform CSS al posto dell'attributo
  SVG). L'unica leva è togliere i glifi dal layout: `ViewportGroup` mette
  `data-zooming` mentre la scala cambia e una regola in `index.css` fa uscire
  dal layout il testo del corpo dei nodi. Da 33,5 a 10,2 ms.

**La trappola vale più del risultato.** `display: none` sul `<g>` che contiene
i testi non serve a niente: `getComputedStyle` dice «none», il gruppo sparisce
a schermo, e in Chrome i `<text>` discendenti **restano nel layout SVG** —
1.683 ms contro i 1.662 senza regola. La regola deve colpire i `<text>`, e
allora il layout crolla a 162 ms. La prima misura sembrava dire che la leva
era sbagliata; era sbagliato il selettore. Il conteggio dei glifi ancora in
layout è la misura che non mente, `getComputedStyle` no: descrive l'elemento a
cui si chiede, non il lavoro che il motore fa.

Restava aperto il culling del drag senza test automatico: **chiuso da DT-18**,
che ha tirato la macchina a stati fuori dall'hook e le ha dato i suoi.

### DT-15 · una specie dedotta per esclusione dall'altra

In `deleteItems` (`src/editor/kinds/class.ts`) le note si riconoscevano dalla
propria mappa e le classi per esclusione (`!(k in notes)`): una chiave che non
fosse né l'una né l'altra finiva fra le classi invece di essere scartata.
Irraggiungibile — le chiavi vengono da `nodeKeys()`, che enumera `view.nodes`
— e infatti nessun test poteva provarlo: la correzione è allineare il filtro a
`rectOf`, trenta righe sopra nello stesso file, che già verifica
l'appartenenza positiva a ciascuna delle due mappe. Dedurre per esclusione è
vero solo finché le specie restano due, e `view.nodes` è lo spazio di chiavi
*condiviso* proprio perché possa ospitarne altre.

### DT-16 · l'auto-relazione riconosciuta per uguaglianza di rettangoli

`routeEdge` distingueva il cappio dall'arco normale confrontando i due `Rect`
per valore (`sameRect`). Due nodi **diversi** delle stesse dimensioni,
trascinati sulla stessa cella della griglia, producono rettangoli identici — e
con lo snap non è un caso di laboratorio: l'arco fra loro veniva disegnato come
un cappio su uno solo dei due.

Se un estremo è lo stesso nodo lo sa il modello, che è il solo posto dove è
vero: `loop` è ora un parametro **obbligatorio**, e `edgeGeometry` /
`classEdgeGeometry` lo ricavano da `rel.source.entity === rel.target.entity`
(rispettivamente `.class`). `sameRect` è sparito. Obbligatorio e non con un
default: il compilatore ha trovato tutti e quindici i punti da aggiornare, che
un default avrebbe lasciato silenziosamente al comportamento vecchio.

Due test nuovi: lo stesso rettangolo passato con `loop` falso non produce più
cinque punti, e `edgeGeometry` dà due percorsi diversi per la stessa coppia di
rettangoli a seconda di cosa dice il modello. Il cappio vero è stato anche
riprovato in pagina su un'auto-relazione ER — cinque punti, esce a destra e
rientra dall'alto — perché nessun e2e lo copre.

### DT-17 · i buchi di copertura del class diagram

Sette prove mancanti, tutte su comportamento già corretto e verificato a mano.
Ora ci sono, e la voce si chiude.

- **`enum` nei tre punti che lo trattano.** `classSize`: il test si intitolava
  «interface ed enum» e nel corpo asseriva `interface` e `abstract` — ora
  asserisce tutti e quattro gli stereotipi. Il render di `ClassNodeView` con
  `enum`, che senza la sua riga occuperebbe un'altezza che `classSize` non
  prevede. E il metodo astratto *dentro* un `enum`, dove annotazione di
  stereotipo e classificatore in coda al membro — due meccanismi in punti
  diversi dell'emettitore — non erano mai stati provati insieme.
- **`renameClass` sul `target` e sull'autorelazione.** Era provato solo sul
  `source`: il ramo del `target` non veniva mai percorso, e una relazione con
  entrambi i capi sulla stessa classe avrebbe potuto restare con un estremo
  pendente.
- **`addRelation` col `kind` di default.** È il solo modo in cui lo strumento
  relazione crea un arco: cambiarne il default in silenzio cambierebbe cosa
  disegna ogni trascinamento fra due classi.
- **Il ramo `_` di `safeName`**, che prefissa i nomi che iniziano con una
  cifra — Mermaid non li accetta.

**La voce sbagliava un numero:** `END_LABEL_OFFSET` non è 14 ma **24**, perché
`DIAMOND_LEN` è 16. Il test lo fissa al valore vero e, accanto, l'invariante
che quel numero serve a garantire — l'etichetta del capo cade oltre la punta
del rombo — scritta a parte dal numero, così un domani si vede quale dei due
si sta cambiando.

### DT-18 · l'hook delle interazioni non aveva rete di regressione

Due voci in una: l'Archivio diceva che «l'invariante *un comando al rilascio*
non ha rete di regressione», e DT-14 aveva aggiunto che il culling del drag era
verificato solo in pagina. Nessuna delle due si poteva chiudere com'era il
codice: `reduce` ha i suoi tredici test, ma tutto quello che veniva **dopo** —
l'applicazione degli effetti, l'anteprima, il comando al rilascio — viveva in
una `useEffect` di 380 righe, raggiungibile solo da un browser.

**La correzione non è un test, è una separazione.** `interaction-runner.ts`
tiene la macchina a stati e i suoi effetti;
[use-canvas-interaction.ts](../src/ui/canvas/use-canvas-interaction.ts) tiene
solo ciò che ha bisogno del browser per esistere — `getBoundingClientRect`,
`elementFromPoint`, il pointer capture, il cablaggio degli eventi. 381 righe
diventano 211 e 211. Non è una giuntura inventata per i test: erano due
responsabilità dentro la stessa chiusura, e una delle due non ne aveva
nessuna, di dipendenze dal DOM.

**Niente jsdom.** Ogni scrittura dell'anteprima passa già dal registro di
`dom-registry`, che è una mappa da chiave a elemento e su una chiave non
registrata non fa nulla: registrando finti elementi si vede *esattamente* cosa
l'anteprima ha toccato, senza un DOM e senza spiare funzioni. È la stessa
giuntura che usa il canvas vero — la si usa, non la si simula.

Otto test in `interaction-runner.test.ts`. Il culling ha la fixture che
contiene i tre casi interessanti in un solo spostamento: un nodo che **esce**
dall'inquadratura, uno che **entra**, uno che resta fuori; e tre archi — uno
che attraversa lo schermo con entrambi gli estremi lontani (il caso per cui il
criterio è l'ingombro e non gli estremi), uno con un capo solo in vista, uno
interamente sotto. Un quarto test prende l'altra metà: il nodo mai scritto sul
DOM ha comunque il modello giusto dopo il rilascio, perché il DOM saltato è
un'anteprima, non lo stato.

Tutti verificati RED, ciascuno contro il guasto che sorveglia: senza le due
guardie di visibilità cadono i due test del culling; senza lo scarto dello
snapshot cade quello delle due prese di seguito; e sostituendo l'anteprima con
un comando per movimento — la regressione che l'invariante esiste per
impedire — ne cadono quattro.

**Resta aperto**, e non è coperto da qui: il cablaggio degli eventi del
browser. Che un `pointerdown` col tasto destro non avvii un drag, che il
pointer capture venga rilasciato, che il rect in cache si invalidi al resize —
tutto ciò che sta ancora nell'hook ha bisogno di un DOM per essere provato, e
un DOM questo progetto non ce l'ha.

### DT-19 · il cablaggio degli eventi non era coperto, e non si poteva

DT-18 aveva tirato la macchina a stati fuori dall'hook e lasciato scritto
quel che restava scoperto: il cablaggio degli eventi del browser. Che un
`pointerdown` col tasto destro non apra niente, che il pointer capture venga
rilasciato, che il rect in cache si invalidi al resize — tutto ciò ha bisogno
di un DOM per essere provato.

**`jsdom` è ora una dipendenza di sviluppo**, ed è usato da un file solo, con
`// @vitest-environment jsdom` in testa invece che da una configurazione
globale: tutti gli altri test restano nell'ambiente `node`, che è più veloce e
non finge di essere un browser. L'ambiente costa il 9% del tempo di
`pnpm test`.

**Tre cose jsdom non le implementa** — `setPointerCapture` e compagni,
`elementFromPoint`, `ResizeObserver` — e vanno messe a mano. Non sono
scorciatoie: due delle tre sono proprio ciò che il test vuole osservare. Il
capture diventa un registro, che è anche il modo per asserire il protocollo;
`elementFromPoint` è il modo in cui il test decide cosa sta sotto il cursore,
che nel browser dipende dal layout e qui non esiste. Anche
`getBoundingClientRect` è sovrascritto, perché **quante volte viene chiamato**
è metà di ciò che questo file verifica.

Diciotto test in `use-canvas-interaction.test.tsx`: pointer capture, il rect
in cache e le sue tre invalidazioni, la rotella con e senza modificatori, lo
spazio che pana, Escape, il doppio click, il menu contestuale, il
`pointercancel`, lo smontaggio dei listener.

Otto mutazioni dell'hook, una riga ciascuna, e **ognuna è caduta sul test che
la sorveglia** — niente capture, nessun filtro sul pulsante, rect senza cache,
move anche a riposo, niente `onBlur`, niente guardia sul campo di testo,
niente invalidazione al resize, niente cleanup allo smontaggio. Il rect senza
cache ne fa cadere tre, che è giusto: tre test guardano lo stesso meccanismo
da tre lati.

**Chiude anche mezza DT-2.** La voce diceva «nessun test unitario possibile
senza jsdom: provato in un browser». Ora il blur della finestra che azzera lo
spazio ha il suo test, con la stessa controprova che allora era stata fatta a
mano.

**Resta possibile e non fatto:** DT-7 diceva «senza jsdom non c'è dove
eseguire un test» per il `try/catch` sugli accessi a `localStorage` di
`use-theme.ts`. Ora ci sarebbe. Non l'ho scritto perché non è cablaggio di
eventi, ed è la prossima voce che l'arrivo di jsdom rende raggiungibile.

### DT-20 · `fk-without-relationship` taceva su una FK su due

Il controllo valutava le relazioni uscenti **a livello di entità**: bastava una
relazione qualsiasi che partisse da `posts` perché nessuna delle sue FK fosse
segnalata. Con due FK verso tabelle diverse e una sola relazione disegnata, la
seconda restava invisibile — falso negativo, in un pannello che esiste per dire
cosa manca.

Ora il controllo è per attributo: una FK è coperta se una relazione uscente la
nomina fra i propri `source.attributes`.

**L'eccezione è la ragione per cui la voce era rimasta aperta.** Una relazione
disegnata a mano ha `attributes` vuoto per l'ADR 0003, e non nomina colonne per
costruzione: pretendere che ne nomini una trasformerebbe il falso negativo in un
falso positivo su ogni arco tracciato sul canvas. Continua quindi a coprire
tutte le FK dell'entità. Il test che lo pretende passava già prima del fix ed è
stato scritto apposta prima: è la rete che impedisce al rimedio di essere
peggiore del difetto.

### DT-21 · `entity-name-clash` nascondeva il terzo nome, e taceva sul primo

Il confronto teneva una sola chiave per forma minuscola, la prima vista: con
`User`, `user` e `USER` i messaggi citavano sempre `User`, e il terzo nome non
compariva in nessuno dei due. In più la prima entità del gruppo non prendeva mai
un issue — e siccome il pannello naviga per `node` dell'issue, era l'unica delle
tre non raggiungibile da lì.

Ora il gruppo si calcola prima del ciclo, ogni entità coinvolta prende il suo
issue e il messaggio cita tutte le altre.

### DT-22 · `noUncheckedIndexedAccess` non era acceso

Acceso, `tsc` ha segnalato 50 punti: 11 nel codice e 39 nei test. **Nessuno era
un bug** — ogni accesso indicizzato era davvero garantito da qualcosa — ma in
tutti e 11 il garante era un commento, o la lettura di due funzioni insieme.

Le correzioni hanno spostato la garanzia dal lettore al compilatore: in
`applyLayout` filtro e lettura del nodo sono lo stesso passo; `placeNew` itera
le entries invece delle chiavi; in `map.ts` l'insieme delle chiavi note diventa
una mappa chiave→entità, perché era il nome dell'entità che serviva e leggerlo
da due mappe con un `??` era esattamente il punto che il tipo non sapeva
risolvere. In `sql-text.ts` i gruppi di regex obbligatori si leggono con una
guardia invece che per indice.

Nei test le 39 correzioni sono `?.` sugli accessi: nessuna indebolisce
un'asserzione, perché `undefined` non passa né un `toEqual` né un `toBe(false)`
— verificato una per una sulle cinque che avrebbero potuto.

### DT-23 · i buchi di copertura sulle interazioni

Il primo piano lasciava senza test il marquee additivo (shift+drag sul vuoto),
lo shift+click su una relazione e la soglia esatta `MARQUEE_MIN`: c'era solo un
test su un marquee «minuscolo», che non dice dove sta il confine.

Tre test nuovi in `interaction.test.ts`, che passano senza toccare il codice:
sono rete, non correzione. Che mordano è verificato per mutazione —
`MARQUEE_MIN = 1` fa cadere i due test della soglia, `additive: false` cablato
fa cadere quello del marquee additivo.

### DT-24 · l'alias di `migrateDocument`: il difetto non è dove la voce lo cercava

La voce d'archivio diceva: quando non c'è nessuna migrazione da applicare,
`migrateDocument` restituisce l'input invece di una copia. Vero, e innocuo:
l'unico chiamante di produzione è `parseDocument`, che gli passa un oggetto
appena uscito da `JSON.parse` — non condiviso con nessuno — e ne consegna il
risultato a zod, che **copia**. Chi mette le mani sul documento vede la copia di
zod, mai quell'alias. Una `structuredClone` difensiva costerebbe una copia a
ogni apertura per proteggere da uno scenario che non esiste.

Il contratto che conta davvero è un altro, e non era scritto da nessuna parte:
che le migrazioni **non mutino l'input**. Quello ora ha il suo test, e il
docblock dice esplicito che il ritorno può essere l'input stesso, e che un
chiamante nuovo che volesse mutarlo deve copiarselo.

### DT-25 · il test di scalabilità dell'SQL misurava il tempo sbagliato

Scoperto per caso mentre si chiudevano le altre: una corsa della suite su
venti è fallita, e il test era «il tempo raddoppiando l'input non è
quadratico» di `sql-text.test.ts`. Riprodotto a comando lanciando più suite in
parallelo — tre su tre fallivano.

Il test cronometrava `performance.now()`, cioè **tempo trascorso**. Se lo
scheduler toglie la CPU al processo dentro la misura grande e non dentro quella
piccola, il rapporto salta pur restando la funzione lineare. L'autore aveva già
combattuto questa fragilità alzando l'input a 800/1600 tabelle per uscire dal
rumore del timer, ma il rumore del timer e la contesa per la CPU sono due cose
diverse, e la seconda non si batte facendo durare di più la misura. Nemmeno il
minimo di tre giri basta: con quattro suite la CPU resta satura per l'intera
durata e nessun giro esce pulito.

Ora la misura è il **tempo CPU** (`process.cpuUsage()`): quando lo scheduler
toglie la CPU, il tempo trascorso avanza e il tempo CPU no — che è esattamente
la differenza fra «quanto lavoro ha fatto» e «quanto ha aspettato». Con cinque
suite in parallelo il test non cade più.

Vale perché questo file gira in ambiente node e ogni file di test sta nel
proprio processo: `cpuUsage()` è del processo, e con i worker in thread
conterebbe anche il lavoro degli altri file. Scritto nel docblock, perché è la
condizione che rende valida la misura.

**Osservato e non chiuso:** a cinque suite parallele cade invece
`round-trip.test.ts` per il timeout di 5 s di Vitest — un parse MySQL con un
quinto della CPU non fa in tempo. È saturazione della macchina, non un difetto:
in CI gira una suite sola. Si scrive qui perché chi vedrà quel rosso sappia
cosa guardare.

### DT-26 · una tabella da 42 colonne alzava tutte le righe dell'import

`placeNew` disponeva le entità nuove in una griglia a passo **uniforme**, con la
cella pari all'entità più grande del lotto. Su un lotto uniforme è invisibile;
su uno schema vero non lo è. Il dump di Chamilo ha mediana 7 attributi e una
tabella da 42: la cella diventava 450 × 998 px per tutte e 240, la tela usciva
7240 × 15038 px — quasi diciassette schermate in altezza — **piena al 12,8 %**.
Chi importava si trovava un canvas quasi vuoto da percorrere a zoom minimo, e
non c'era modo di capire che la colpa era di una tabella sola.

Ora le colonne restano allineate (larghezza uniforme: è ciò che le rende
leggibili) ma la verticale è impacchettata — ogni colonna riprende sotto
l'ultima entità che ci è finita. Stesso lotto: 4718 px di altezza, **41 % di
riempimento**, 3,2 volte più basso. Quattro righe di codice, nessuna nuova
astrazione.

Due test tengono la proprietà: che una sola entità alta non abbassi la riga
delle altre, e che dentro una colonna due entità non si sovrappongano. Il
secondo serve perché il passo non è più una costante ma una somma, ed è
esattamente lì che un errore di un `+ GUTTER` produrrebbe sovrapposizioni.

**Osservato e non chiuso:** l'impacchettamento non bilancia le colonne. Le
entità restano in ordine di lettura, quindi la colonna che si prende la tabella
gigante resta più lunga delle altre. Bilanciare vorrebbe dire ordinare per
altezza — e perdere l'ordine del dump, che è l'unico ordine che chi importa
riconosce. Non vale il cambio: chi vuole una disposizione vera preme «Disponi».

### DT-27 · il riepilogo dell'import parlava da programmatore, e si allarmava per niente

Lo stesso dump, sulla riga di riepilogo del dialog:

> 240 tabelle, 77 foreign key. Ignorati: 8 **set null**, 2 **transaction**, 588
> **alter altro** — e «1 avvisi dal parser».

Tre cose sbagliate in una riga sola.

**Le chiavi grezze.** Il docblock di `humanizeSkipped` dice che «una chiave
ignota non deve mai arrivare grezza all'utente», e ne arrivavano tre su tre.
`set:null` è la forma che `node-sql-parser` dà a un `SET` (la mappa aveva solo
`set:undefined`, che è la forma di Postgres), e `alter:altro` era una stringa
scritta a mano nell'adapter.

**I 588 «alter altro» non erano una cosa sola.** Erano 355 `ADD KEY` e 233
`MODIFY … AUTO_INCREMENT`: indici e modifiche di colonna, due categorie che
l'utente ha ragione di voler distinguere — perdere gli indici è atteso, perdere
le colonne no. Ora l'adapter conta con `action:resource` dell'AST, quindi
`add:index` e `modify:column`, ed entrambe hanno la loro etichetta.

**L'avviso che non era un avviso.** `SET NAMES utf8mb4` apre ogni dump di
phpMyAdmin, `node-sql-parser` non lo accetta pur accettando gli altri `SET`, e
finiva nel `catch` che produce «statement non riconosciuto». Chi importa legge
un avviso e cerca che cosa ha perso: non aveva perso niente. Ora un `SET` che il
parser rifiuta si conta fra i SET di sessione, come i suoi simili.

Sul dump reale il referto è: 240 tabelle, 77 foreign key, 9 SET di sessione, 2
blocchi di transazione, 355 indici, 233 modifiche di colonna, **zero avvisi**.

Due test esistenti usavano `SET NAMES` come esempio di statement non parsabile
e sono stati riscritti: il primo ora prova che il commento eseguibile è stato
*spogliato* guardando in quale secchio finisce il contenuto (SET di sessione e
non «commento eseguibile»), il secondo usa un `CREATE TABLE` troncato, che è
non parsabile davvero.

**Osservato e non chiuso:** un `MODIFY` che cambiasse il tipo o la nullabilità
di una colonna continua a essere ignorato, e il modello resta con ciò che dice
il `CREATE TABLE`. In un dump di phpMyAdmin il `MODIFY` porta solo
`AUTO_INCREMENT`, che non è modellato; applicarlo per davvero vorrebbe dire
riscrivere la colonna dall'AST dell'`ALTER`. Ora almeno il riepilogo dice
quante ne ha viste passare.

### DT-28 · le grafie in linea di un CREATE TABLE, di cui una faceva sparire la tabella

L'Archivio registrava un limite di terze parti: in MySQL una `REFERENCES` senza
lista di colonne — sintassi standard, significa «la PRIMARY KEY della tabella
puntata» — faceva rifiutare a `node-sql-parser` l'**intero** `CREATE TABLE`, e
la tabella spariva dal diagramma con tutte le sue colonne. Misurandola prima di
scrivere il codice, la voce si è rivelata la punta di un difetto più largo.

`readCreate` leggeva i vincoli da un solo ciclo, `if (d.resource !== "column")`,
ma il parser mette i vincoli **scritti in linea sulla colonna** sull'elemento
colonna stesso. Quindi valeva anche, senza che nessuna voce lo registrasse:

| grafia in linea | prima |
|---|---|
| `code varchar(20) UNIQUE` | letta (aveva il suo ramo) |
| `id int PRIMARY KEY` | **persa** — `primaryKey` vuoto, e `id` restava nullabile |
| `b_id int REFERENCES b (id)` | **persa** — nessuna relazione, anche con la lista colonne |

Le tre cose sono lo stesso difetto visto da tre lati, e la prima non si poteva
chiudere senza la seconda: la relazione si risolve sulla PK della tabella
puntata, e in un DDL scritto a mano — l'unico posto dove la grafia senza lista
compare, `mysqldump` non la emette mai — quella PK è spesso dichiarata in linea.

**La correzione.** Il parser è di terze parti e l'unica leva è il testo, quindi
`fillMissingRefColumns` ([sql-text.ts](../src/io/ddl/sql-text.ts)) riscrive
`REFERENCES tbl` in ``REFERENCES tbl (`__dd_unspecified__`)`` prima di `astify`.
Il segnaposto non è un'invenzione: `readForeignKey` lo toglie subito dopo, e il
`refColumns` **vuoto** che ne esce è esattamente l'ingresso che
[map.ts](../src/io/ddl/map.ts) risolve già sulla primary key del target — quella
risoluzione esisteva e vale per entrambi i dialetti, quindi la seconda passata
che sembrava necessaria non lo era. La riscrittura guarda solo i tratti di
codice (`spans`) e usa il cursore monotono di `splitStatements`, non `inCode`:
su un dump vero i tratti si contano a migliaia e cercarli tutti a ogni
`REFERENCES` sarebbe la stessa spesa quadratica che quella funzione evita.
`readCreate`, in più, legge ora `primary_key` e `reference_definition`
sull'elemento colonna.

Otto test: cinque sulla riscrittura (le due grafie, il nome qualificato, la
lista che precede un `ON DELETE`, il no-op quando la lista c'è, e la parola
`references` dentro una stringa o un commento), tre sull'adapter. La catena
intera, provata su DDL scritto a mano: `parent` e `child` entrano entrambe,
nessun avviso, e le due relazioni escono risolte su `parent(id)` con le
cardinalità giuste — `NOT NULL` dà `one`, la colonna nullabile `zero-or-one`.

**Non tocca Postgres**: `libpg-query` accetta già quella forma, ed è il motivo
per cui la risoluzione sulla PK stava in `map.ts` e non nell'adapter.

**Osservato e non chiuso:** una PK dichiarata in linea e una dichiarata come
vincolo di tabella nello stesso `CREATE TABLE` si sovrascrivono invece di
sommarsi — l'ultima vince. È DDL non valido (MySQL rifiuta due PRIMARY KEY), e
farlo andare d'accordo vorrebbe dire decidere quale delle due è quella giusta.

### DT-29 · una nota poteva dichiarare la sua classe, ma solo a parole

Le due voci d'Archivio erano corrette nella diagnosi e sbagliate nel rimedio
che davano per necessario: la prima chiedeva un campo di ancoraggio sulla
nota, la seconda un ingresso della nota nel grafo di layout. Nessuna delle due
serviva: bastava trattare l'ancoraggio come una relazione.

`addNoteLink` (`src/editor/class/commands.ts`) aggiunge una voce di
`model.relations` di specie `note-link`, con la chiave della nota in
`source` e quella della classe in `target` — non un campo su
`ClassNoteSchema`. La ragione è la stessa per cui una FK non vive come campo
sull'entità puntata nell'ER: il layer del canvas (`EdgesLayer`,
`src/ui/canvas/kinds/class.tsx`) e `buildSvg` (`src/ui/export/svg.tsx`)
iterano già `model.relations` per disegnare gli archi e per esportare
Mermaid, e un campo sulla nota avrebbe richiesto un secondo percorso di
lettura ovunque un arco già ne aveva uno. Lo strumento «Relazione» normalizza
da sé la direzione del trascinamento (nota → classe o classe → nota danno lo
stesso arco) e un secondo trascinamento sostituisce l'ancoraggio precedente
invece di aggiungersi: `addNoteLink` cancella la voce `note-link` vecchia
della stessa nota prima di scrivere quella nuova.

Con l'ancoraggio modellato come arco, il secondo taglio è caduto da sé:
`classLayoutGraph` cammina ora anche `model.notes` e include l'arco
`note-link` fra quelli che ELK dispone, quindi la nota ancorata segue la
classe che commenta invece di restare ferma mentre tutto il resto si muove.
Una nota senza ancoraggio resta un nodo isolato nel grafo — nessun arco la
tira da nessuna parte — ma anche questo è un miglioramento rispetto a prima:
un nodo isolato che ELK dispone non finisce mai sotto un altro nodo, mentre
prima «Disponi» lasciava le note esattamente dov'erano e una classe vicina
spostata poteva finirci sopra.

> **Osservato e non chiuso:** una nota si ancora a un elemento, non a una
> relazione, e ne ha al più uno. Il secondo limite viene da ciò che Mermaid sa
> rappresentare, non da ciò che l'UML permette; il primo — «si ancora a una
> classe» — è superato dalla nota unica, sotto.

**Riaperta il 2026-09-26 (step 3a, la nota unica,
`docs/superpowers/specs/2026-09-26-nota-unica-design.md`).** Su master l'ancoraggio viveva **dentro**
il grafo ELK della famiglia delle classi: `classLayoutGraph` includeva l'arco `note-link`, quindi
Disponi non poteva mai lasciare una nota ancorata sotto un'altra classe — ELK la vedeva come un nodo
con un arco, come le altre. La nota unica generalizza l'ancoraggio a un elemento di *qualunque*
famiglia (entità, classe, nodo di flusso o pool), non solo le classi: un arco nel grafo ELK di
un'altra famiglia non si può scrivere senza far dipendere quella famiglia dalla famiglia `note`, cosa
che la spec 3a esclude (§6). L'ancoraggio è uscito da ELK: `followAnchors`
(`src/editor/note/layout.ts`) fa seguire alla nota lo scarto dal suo elemento con un passo esplicito,
**dopo** che ELK ha disposto tutte le famiglie.

Questo riapre, in una forma più stretta, il secondo taglio che DT-29 aveva chiuso: **dentro** la
famiglia del suo elemento, una nota ancorata può di nuovo finire sotto un altro nodo dopo Disponi,
perché quella famiglia dispone col suo grafo ELK, che non vede le note. Il giro di correzione dello
step 3a ha chiuso solo la metà fra famiglie diverse: `layoutAll` (`src/editor/layout-pack.ts`) include
il rettangolo previsto di ogni nota ancorata nell'ingombro del blocco della famiglia della sua àncora,
così un blocco non vi si sovrappone più. Per chiudere anche l'altra metà servirebbe passare le note
ancorate al grafo ELK della famiglia della loro àncora, con un arco — la stessa idea di
`classLayoutGraph` su master, generalizzata a tutte e tre le famiglie — e cambierebbe la spec 3a §6.

### Minori chiuse il 2026-09-09

Le voci aperte dalla revisione finale di `feat/export-testo`, chiuse insieme.

- **Avvisi aggregati**: `mermaid.ts` emetteva un avviso per occorrenza in tre
  punti, contro il contratto di [result.ts](../src/io/emit/result.ts).
  Aggregati per categoria, con conteggio ed elenco. Toccato anche `ddl.ts`,
  che la voce dava per conforme: i suoi avvisi «relazione saltata» e «nome di
  vincolo già usato» erano anch'essi per occorrenza e scalano col numero di
  relazioni. Chiudere la voce lasciandoli lì avrebbe dichiarato onorato un
  contratto ancora rotto. Un test in `mermaid.test.ts` tiene fermo il
  comportamento: tre nomi anomali, tre backtick e due relazioni saltate
  devono dare tre avvisi, non otto.
- **`table.unique` duplicato** in `mysql.ts`: deduplicato in coda a
  `readCreate`, invece di coordinare i due percorsi che lo riempiono.
- **`baseType` su `enum('a)b')`**: il limite resta — tradurre il taglio delle
  parentesi in un vero parser di letterali non vale il prezzo — ma ora un
  test lo esercita e fissa il modo in cui fallisce, cioè in silenzio.
- **`TextExportDialog.tsx`**: `FORMATS` è un `Record<Format, …>`, quindi
  `FORMATS[format]` è totale e la non-null assertion è sparita; la chiave
  React degli avvisi è l'indice; l'`aria-label` ridondante sui
  `ToggleGroupItem` è stato tolto (l'e2e seleziona per testo visibile, che dà
  lo stesso nome accessibile).
- **`mysql.test.ts`**: il test dell'`UNIQUE` in linea asserisce `warnings` e
  `skipped` come il suo gemello, e il refuso nel commento è corretto.

### Minori chiuse il 2026-09-25

Voci d'Archivio chiuse dal 2b, pool e corsie
(`docs/superpowers/specs/2026-09-25-pool-corsie-design.md`): le corsie non sono più bande globali
ricavate dai nodi ma stanno dentro pool che hanno una posizione e una larghezza salvate.

- **Le bande delle corsie passavano sotto entità e classi** («Canvas unificato»). La banda prendeva
  x e larghezza dai soli nodi di flusso, e poteva disegnarsi sopra un nodo di un'altra famiglia. Un
  pool sta dove l'utente l'ha messo e non si allarga da solo; «Disponi» nel canvas misto lo conta nel
  blocco del flusso, che si impacchetta accanto agli altri con il loro stesso spazio
  (`layoutBounds`, `src/editor/layout-pack.ts`).
- **Il pannello delle corsie compariva solo dal primo nodo di flusso** («Canvas unificato»). Il
  pannello globale non c'è più: le corsie si gestiscono dal pannello del pool selezionato
  (`PoolLanes`, `src/ui/panels/FlowProperties.tsx`), e un pool si crea con lo strumento Pool anche su
  un documento senza nodi di flusso.
- **`fitToContent` ignorava le bande** («Correzione finale del flowchart»). Oggi i rettangoli da
  inquadrare vengono da `nodeRects` (`src/editor/kinds/canvas-ops.ts`), che comprende i frame di ogni
  famiglia: un pool vuoto o più largo dei suoi nodi entra nella vista.
- **Le corsie non si ridimensionavano** («Flowchart», metà della voce). Si ridimensionano dal bordo
  inferiore, con un minimo che non scende sotto i loro nodi (`resizeLane`, `clampLaneH`,
  `src/editor/flow/commands.ts`). L'altra metà, il riordino per trascinamento, resta in Archivio.

### Minori chiuse il 2026-09-26

Voce d'Archivio chiusa dallo step 3a, la nota unica
(`docs/superpowers/specs/2026-09-26-nota-unica-design.md`).

- **Due note, quella di classe e quella di flusso, restavano due implementazioni separate** («Canvas
  unificato»). Ora sono un'unica famiglia `note` (`src/model/note/schema.ts`), libera o ancorata a un
  elemento di qualunque famiglia — entità, classe, nodo di flusso o pool — con un solo schema, un solo
  componente sul canvas e un solo editor di testo, invece di vivere una nella famiglia delle classi e
  una in quella del flusso.

---

## Archivio

### Modello ed editor ER

- `entityKey` ambigua col punto → **corretta** come collisione di chiave, vedi DT-1.
- `migrateDocument` che restituisce l'alias dell'input → **esaminato**, vedi
  DT-24: innocuo con l'unico chiamante che c'è, e il contratto che conta — «non
  muta l'input» — ora ha il suo test.
- Round trip di serializzazione con entità qualificata da schema: non
  coperto da test.
- `validateEr` concentra cinque controlli in un blocco di ~55 righe.
  Estraibili se il file cresce, non prima.
- `entity-name-clash` che non raggruppa → **corretto**, vedi DT-21.
- `fk-without-relationship` valutato a livello di entità → **corretto**, vedi
  DT-20: ora è per attributo, con l'eccezione delle relazioni disegnate a mano.
- L'auto-relazione riconosciuta per uguaglianza di rettangoli → **corretto**,
  vedi DT-16.
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
- I test mancanti su marquee additivo, shift+click su relazione e soglia
  `MARQUEE_MIN` → **coperti**, vedi DT-23.
- L'hook delle interazioni senza rete di regressione → **corretto**, vedi
  DT-18: la macchina a stati è uscita dall'hook e ha i suoi test. Resta senza
  rete il solo cablaggio degli eventi del browser.
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
- I tre difetti dell'autosave → **esaminati**, vedi DT-12: uno corretto, e
  gli altri due archiviati con la ragione per cui non lo erano.
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
- ~~In MySQL un `REFERENCES` senza lista di colonne fa rifiutare a
  `node-sql-parser` l'**intero** `CREATE TABLE`, inline e su
  `FOREIGN KEY(...)`: la tabella sparisce del tutto.~~ **Corretto**, vedi
  DT-28, per la via che questa voce indicava — normalizzare il testo prima di
  `astify` — e insieme a due difetti vicini che la voce non sospettava.
- `worker.format: "es"` non è stato toccato: sarebbe la leva per il code
  splitting nel worker (il formato `iife` di default lo disabilita, un solo
  chunk da 332 KB contiene entrambi i parser) ma rischierebbe l'interop di
  `node-sql-parser`, l'unica cosa fragile della catena.
- `kindOf` ha un fallback `"sconosciuto"` che è codice morto: un `Node` ha
  sempre una chiave.
- `parse.worker.ts` e `spawn.ts` non hanno test propri e nessun test li
  importa. Il ramo MySQL è coperto end-to-end nel browser; **non** sono
  coperti il caricamento da file e il toggle manuale del dialetto.

- Le etichette del riepilogo sono tutte al plurale: con un solo statement
  ignorato si legge «1 indici». Renderle concordi vorrebbe dire una forma
  singolare per ognuna delle venti, per un caso che su un dump vero non capita
  quasi mai (i conteggi sono a due o tre cifre).
- Il dump di Chamilo dichiara 77 foreign key su 240 tabelle: le altre relazioni
  sono implicite (colonne `*_id` senza vincolo). Dedurle dal nome è tentante e
  sarebbe indovinare — l'import dice ciò che il database dichiara, non ciò che
  il progettista intendeva.

### Export testo

- **`serial` non produce avviso** pur avendo semantiche diverse nei due
  dialetti (in MySQL è `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`): appartiene
  a entrambi gli insiemi in [sql-types.ts](../src/io/emit/sql-types.ts).
  Deciso così per non tradurre la semantica — è il confine dell'emettitore,
  non un difetto.

### Tooling

- ~~La regola ESLint di layering è su `**/*.ts` e non copre i `.tsx` in
  `model`/`editor`.~~ **Non è più vero:** `eslint.config.js` usa
  `**/*.{ts,tsx}` per tutti e quattro gli strati (righe 32, 45, 57).
  Risolto lungo la strada, senza che nessuno lo registrasse.
  `no-restricted-imports` blocca anche gli `import type`: voluto.
- `noUncheckedIndexedAccess` non abilitato → **corretto**, vedi DT-22.
- Il gate di prestazione rosso su `dragAll` e `zoom` → **corretto**, vedi
  DT-14: ora passano tutti e sei gli scenari, a 300 e a 600 entità.
- Script di prestazione → **corretto**, vedi DT-6.
- `ErrorBoundary` e gestore di `unhandledrejection` assenti → **corretto**,
  vedi DT-10.
- Il blocco che importa un DDL è duplicato quasi verbatim fra
  `scripts/e2e/export-testo.mjs` e `export.mjs`, che a sua volta duplica
  invece di riusare un aiutante di `import.mjs`. Da estrarre in un
  `helpers.mjs` condiviso quando servirà un terzo scenario: ce ne sono due.

### Class diagram

- ~~`IssuesPanel` ricalcola la validazione a ogni dispatch sul documento, non
  solo ai cambi del modello.~~ **Risolto:** il selettore resta su `s.doc`
  (allargato lì nel Task 6, per restare neutro rispetto al tipo), ma
  `opsFor(doc).validate()` ora vive in uno `useMemo` la cui dipendenza è
  ristretta a `doc.diagram.model` — campo comune della union — invece che a
  `doc` intero: un commit di drag cambia `view.nodes` e lascia il modello
  com'era, quindi il ricalcolo non riparte. La dipendenza ristretta costa un
  `eslint-disable-next-line react-hooks/exhaustive-deps` puntuale, commentato
  sul posto; preferito a una cache mutabile a livello di modulo, che avrebbe
  risolto lo stesso problema introducendo stato globale dentro un file di
  componente senza bisogno reale. `TextExportDialog`, che aveva la stessa
  forma e non era registrata qui, è stata chiusa insieme: il suo `ModelState`
  viene dal selettore, con `useShallow`.
- `lastTopLevelColon` in `src/model/class/members.ts` non segnala le
  parentesi sbilanciate, mentre `splitTopLevel` — nata dalla stessa
  primitiva — sì: due funzioni con comportamenti diversi sullo stesso input
  malformato. Costo-se-sbagliato: teorico — l'input che le distingue
  (`+ x: a > b: int`) non è un tipo legittimo in nessun linguaggio.
- `parseMembers` che non passa per `.parse()` → **esaminato**, vedi DT-13: il
  buco che la voce temeva è vuoto, e ora c'è il test che lo tiene tale.
- Il calcolo della perpendicolare in `src/editor/class/geometry.ts`
  (`umlMarkerPath`) duplica in forma le tre righe equivalenti di
  `crowsFootPath` in `edge-routing.ts`. Con due soli consumatori resta dentro
  la regola «tre righe simili valgono più di un'astrazione prematura»; al
  terzo consumatore vale un `perpOf(dir)` condiviso.
- I due archi fra la stessa coppia che si sovrapponevano → **corretto**, vedi
  DT-11, che corregge anche il rimedio che questa voce dava per necessario.
- Le etichette di **archi diversi** possono ancora accavallarsi quando più
  archi convergono sullo stesso lato di un nodo a poca distanza: la
  collocazione di `endPoint` risolve solo i conflitti interni a un arco
  (etichetta contro marker, contro il proprio nodo, contro il nome della
  relazione). Un anti-sovrapposizione vero è globale, stessa causa del punto
  sopra.
- ~~`{static}` e `{abstract}` si rendono a testo dentro la riga del membro,
  invece della sottolineatura che UML prescrive per lo statico.~~ **Risolto:**
  `memberLines` (`src/model/class/members.ts`) torna `MemberLine[]` con un
  campo `underline: { from, to } | null` calcolato sugli estremi del nome, e
  `ClassNodeView` (`src/ui/canvas/ClassNode.tsx`) spezza il `<text>` in tre
  `<tspan>` quando `underline` non è nullo. `{abstract}` resta testo in
  chiaro, notazione UML legittima.
- Un utente che scrive nel testo di una nota la sintassi delle entità
  Mermaid stesse (`#amp;`, `#lt;`, `#gt;`, `#quot;`) verbatim se la vede
  decodificata in silenzio all'export: `noteText`
  (`src/io/emit/class-mermaid.ts:201`) non distingue quelle quattro sequenze
  da quelle che produce lui stesso escapando `&`, `<`, `>`, `"`, e Mermaid le
  interpreta come se fossero la sua stessa codifica. Escapare anche il `#`
  eliminerebbe l'ambiguità, ma introdurrebbe una quinta sostituzione nello
  stesso ordine vincolante delle altre quattro — rinviato perché il caso è
  un utente che digita sintassi di un altro programma dentro una nota di
  testo libero.
- I generici annidati (`Map<string, List<int>>`) non sono rappresentabili in
  `mermaid@11` in nessuna codifica: misurato, la forma a tilde che emettiamo
  rende `Map~string, List<int~>` (testo mangled), e la forma nuda
  renderebbe `Map>` (il contenuto del generico esterno sparisce). Si
  continua a emettere la forma a tilde con un avviso (`hasNestedGenerics`,
  `src/io/emit/class-mermaid.ts:94`) perché è comunque la meno peggio, non
  perché risolva il problema: non c'è niente di meglio da emettere finché
  Mermaid non cambia.
- Un tipo con parentesi angolari sbilanciate esce così com'era e viene
  segnalato nell'avviso aggregato, ma Mermaid alla resa perde comunque il
  testo dopo la `<` spaiata (misurato: `List<Foo` rende `List`). L'avviso
  dice che il tipo è sospetto, non che il file esportato lo mostrerà per
  intero.
- Lo strumento che sopravvive al cambio di diagramma → **corretto**, vedi DT-8.
- I due editor sullo stesso testo di una nota → **corretto**, vedi DT-9, che
  corregge anche la diagnosi di questa voce: non divergevano.
- La specie dedotta per esclusione in `deleteItems` → **corretto**, vedi DT-15.
- Due residui di igiene nei test di `src/editor/class/geometry.test.ts`: il
  caso «l'associazione non disegna punta» (riga 99) è ora un sottoinsieme
  del test «l'associazione non navigabile resta nuda, quella navigabile
  prende la freccia» (riga 116), che asserisce la stessa cosa in più; e la
  parità fra la freccia dell'associazione navigabile e quella della
  dipendenza («la freccia dell'associazione navigabile è la stessa della
  dipendenza», riga 121) è verificata su un solo punto e una sola direzione
  (`RIGHT`), non sulle quattro che il test della punta di generalizzazione
  usa poco sopra.
- L'allineamento a colonne di `memberLines` produce `+ conta()    : int`
  invece di `+ conta(): int`. Rende le righe scansionabili ma non è la forma
  che si vede negli altri strumenti UML.
- I buchi di copertura del class diagram → **coperti**, vedi DT-17, che
  corregge anche un numero sbagliato di questa voce: `END_LABEL_OFFSET` è 24.
- Le variabili locali `entities`/`relationships` nella `Properties()` di
  `src/ui/canvas/kinds/er.tsx` tengono il nome vecchio pur contenendo le
  chiavi filtrate per `"node"`/`"edge"` (`selectedKeys`). Non esportate,
  nessun effetto osservabile.
- ~~**Una nota non si ancora a una classe.** `ClassNoteSchema`
  (`src/model/class/schema.ts:93`) ha il solo campo `text`: nessun campo di
  ancoraggio verso la classe che la nota commenta. Il link `..` che UML
  prevede fra una nota e l'elemento a cui si riferisce non è modellato — il
  commento a fianco dello schema lo dice esplicito, «§2 della spec taglia
  `note for Cliente`», che sembrerebbe quel link ed è invece un arco. Deciso
  fuori scopo per questo giro: una nota resta testo libero appoggiato sul
  canvas, senza legame registrato con nessuna classe.~~ **Corretto**, vedi DT-29.
- ~~**Le note restano fuori dal layout.** `classLayoutGraph`
  (`src/editor/class/commands.ts:218-238`) cammina solo `model.classes`: una
  nota non diventa mai un nodo del grafo che ELK dispone, quindi «Disponi»
  la lascia esattamente dov'era. Se nel frattempo una classe vicina si è
  spostata, la nota può ritrovarsi sovrapposta a un nodo che prima non la
  toccava. Chiuderlo servirebbe l'ancoraggio della voce sopra, o in
  alternativa una passata di layout dedicata che allontani le note dai nodi
  disposti — nessuna delle due è stata scritta.~~ **Corretto**, vedi DT-29.
- **Il valore di default resta testo dentro il tipo.** `decimal = 0` (e
  forme simili) attraversa `parseMembers` ed `emitClassMermaid` come parte
  del campo `type`, mai come un valore di default modellato a parte: il test
  «`= valore` passa senza avviso» (`src/io/emit/class-mermaid.test.ts:277`)
  conferma solo che Mermaid lo rende letteralmente, non che il modello lo
  distingua dal resto del tipo. Chiuderlo richiederebbe un campo `default`
  separato in `ClassAttributeSchema`, con `parseMembers` che lo estrae
  invece di lasciarlo dentro la stringa del tipo.

### Prima del flowchart (2026-09-22)

I gate sono stati eseguiti tutti sull'albero pulito prima di aprire il terzo
tipo di diagramma: `lint` pulito, 636 test verdi su 44 file, `build` ok, i
sette scenari e2e PASS, e il gate di prestazione **PASS con p95 peggiore
9,3 ms** a N=300. Quest'ultimo era la sola misura che la CI non fa e che
nessuno aveva ripetuto dal 2026-09-13: serve come baseline, perché il
flowchart tocca canvas e routing condivisi e senza il numero di prima non si
saprebbe di chi è la colpa di un rosso dopo.

Tre voci di questo Archivio sono state riesaminate perché sembravano
prerequisiti del flowchart. **Nessuna lo era:**

- **Le etichette di archi diversi che si accavallano.** Il flowchart è il primo
  tipo in cui l'etichetta sull'arco è contenuto e non decorazione, quindi la
  voce diventa critica davvero — ma un anti-sovrapposizione globale progettato
  adesso si progetterebbe senza una sola etichetta vera sotto gli occhi. Si fa
  dentro il flowchart, contro le sue etichette, non prima.
- **La guardia «il target è un campo di testo» duplicata** fra
  `use-canvas-interaction.ts` e `use-keyboard-shortcuts.ts`. Resta dov'è: sta
  in due hook **condivisi**, non in codice per specie, quindi un terzo tipo non
  aggiunge una terza copia. La voce originale l'aveva già deciso, e la ragione
  non è cambiata.
- **`selection.ts` da estrarre e i due listener `keydown` da unificare.**
  Refactor puro, stesso motivo: nessuna copia in più con un tipo in più. I due
  listener trattano entrambi `Escape` e le due risposte oggi sono coerenti —
  il canvas annulla il gesto in corso, le scorciatoie svuotano selezione e
  strumento — quindi resta latente solo l'ordine di registrazione.

Quello che **è** un prerequisito è emerso dalla lettura e non era in nessuna
lista: la giuntura fra tipi è modellata su **due specie di nodo più una nota
opzionale**. `DiagramView.tools` è `{ node, edge, note? }`
(`src/ui/canvas/kinds/registry.ts`) e `DiagramOps` ha `addNode(at)` e
`addNote?(at)` (`src/editor/kinds/ops.ts`): nessuno dei due porta un parametro
di specie. Il flowchart ne ha sei — start/end, processo, decisione,
input/output, sottoprocesso, nota. Allargare quelle due forme è il **primo
task** del piano del flowchart, non un lavoro da fare al buio adesso: i quattro
`switch` esaustivi (`editor/kinds/ops.ts`, `ui/canvas/kinds/registry.ts`,
`io/document-io.ts`, `ui/export/actions.ts`) fanno fallire `tsc -b` su ogni
punto da toccare, quindi il compilatore fa da lista.

Corretto nello stesso giro: `pnpm test` girava con `--passWithNoTests`, e una
suite sparita per un glob rotto sarebbe passata verde in CI.

### Flowchart (2026-09-23)

Regola del registro seguita durante questo giro, non applicata a posteriori
alla sua fine: **un rilievo che si decide di non correggere si scrive nello
stesso momento in cui si decide**, non quando il piano chiude.

- **Gli archi all'indietro passano sopra i nodi.** Il router ortogonale
  (`src/editor/edge-routing.ts`) aggancia ai lati del rettangolo di ingombro e
  traccia il percorso più breve senza sapere che un altro nodo può stargli in
  mezzo — invariato dall'ER, dove le contro-frecce sono rare e la cosa non si è
  mai vista. In un flowchart il ciclo è il caso normale, quindi si vede
  (`ponytail:` sul posto, riga 114, nomina il soffitto: un router con
  aggiramento — A* sulla griglia dei rettangoli — non è una correzione a
  questo, è un router nuovo). Rinviato perché quel router nuovo è complessità
  vera per un limite che si legge subito guardando il disegno.
  Costo-se-sbagliato: leggibilità, non correttezza — un arco che attraversa un
  nodo si legge peggio ma il diagramma resta vero; cresce con la densità dei
  cicli, e su un flowchart fitto di ripetizioni può rendere un ramo
  all'indietro difficile da distinguere da uno che passa solo vicino.
- **Gli incroci sull'asse trasversale aumentano** rispetto a un layout senza
  corsie (spec §5). ELK dispone l'intero grafo ignorando le corsie e poi
  `placeInLanes` (`src/editor/flow/layout.ts`) corregge solo la y, degradando
  l'ordinamento di ELK a un ordinamento interno alla banda: la sua riduzione
  degli incroci sull'asse trasversale si perde nella correzione. È il prezzo
  della scelta architetturale A della spec (ELK dà il flusso, la corsia dà la
  trasversale), non un difetto di implementazione — l'alternativa (corsie come
  nodi composti di ELK) è stata scartata in fase di design perché avrebbe
  richiesto uno spike proprio. Costo-se-sbagliato: leggibilità su flowchart con
  molte corsie e molti archi che le attraversano; nessuna misura dice a che
  densità diventa fastidioso, perché non è mai stata cercata.
- **Le corsie non si riordinano per trascinamento.** Dal 2b (pool e corsie,
  2026-09-25) si ridimensionano dal bordo inferiore, e quella metà della voce è
  chiusa (vedi «Minori chiuse il 2026-09-25» in **Corretti**). Resta l'ordine:
  il pannello del pool (`PoolLanes`, `src/ui/panels/FlowProperties.tsx`) sposta
  una corsia solo con le due frecce su/giù. Deciso fuori scopo dalla spec (§2):
  due frecce bastano finché non danno fastidio, e il trascinamento di una corsia
  intera è un gesto nuovo che tocca lo stesso codice caldo del drag dei nodi.
  Costo-se-sbagliato: un
  flowchart con molte corsie che vanno riordinate spesso costringe a
  cancellare e ricreare invece di trascinare — attrito per chi disegna, non
  perdita di dati.
- **Le etichette di archi non in fascio che passano vicini per caso possono
  accavallarsi.** L'`offset` di fascio (`edgeOffsets`,
  `src/editor/edge-routing.ts`) separa le etichette di archi **fra la stessa
  coppia di nodi**, e con flusso a destra eredita gratis anche la separazione
  degli archi entranti allo stesso nodo da sinistra (spec §8) — è il caso che
  il class diagram aveva lasciato scoperto e che il flowchart chiude. Resta
  scoperto il caso di due archi **senza legame** il cui percorso passa vicino
  per coincidenza geometrica: nessun fascio li conosce come coppia, quindi
  nessuno scarto li separa. Un anti-sovrapposizione vero sarebbe globale —
  stessa causa, stesso rinvio della voce gemella in «Class diagram» qui sopra —
  e si guarda a feature viva, quando ci sarà un flowchart reale sotto gli
  occhi invece di un caso costruito apposta. Costo-se-sbagliato: due etichette
  illeggibili in un punto del canvas, raro perché richiede una coincidenza di
  layout, non sistematico.
- **Il flowchart non è nel gate di prestazione.** L'ultima misura è la
  baseline del 2026-09-22, **prima** di questa consegna: p95 peggiore 9,3 ms a
  N=300 su un documento ER (vedi «Prima del flowchart» qui sopra). Il
  generatore sintetico (`src/perf/stress.ts`) non genera flowchart — l'estenderlo
  era il passo 3 del piano di questo task, cancellato insieme alla rimisura
  (passo 4) per decisione esplicita di chi ha commissionato il lavoro — e il
  gate non è stato rieseguito. Il percorso di drag fra corsie
  (`moveFlowNodes`, `src/editor/flow/commands.ts`) e il layer delle bande
  (che non si ridisegnava durante il trascinamento; dal 2b l'ha sostituito
  `PoolsLayer`, `src/ui/canvas/PoolsLayer.tsx`, mai misurato neanche lui) sono stati controllati leggendo il
  codice in tre revisioni separate durante questo piano, non misurati: una
  lettura non è una misura, per quanto ripetuta. Rinviato per decisione
  esplicita, non per dimenticanza. Costo-se-sbagliato: una regressione nel
  drag o nelle bande passerebbe inosservata finché qualcuno non estende
  `stress.ts` e riesegue `pnpm perf` — servirebbe un flowchart sintetico da N
  nodi su 4 corsie, con archi che seguono il flusso e qualche ciclo
  all'indietro (il caso che il router paga, spec §13), non un documento ER
  travestito. Fino ad allora il numero di riferimento resta quello di prima
  del flowchart, che per costruzione non dice niente sul flowchart.
- **Un buco nella regola di raggiungibilità, a livello di spec.** Trovato
  rileggendo il Task 9: `flow-unreachable` parte dai nodi `terminal` **senza
  archi entranti** (`entryKeys`, `src/model/flow/validate.ts:86-90`) e il
  ciclo che segnala i nodi non raggiunti gira solo `if (entryKeys.length > 0)`
  (riga 90). Se un `terminal` esiste ma ha un arco entrante, `hasTerminal` è
  vero — quindi `flow-no-terminal` tace, correttamente, un terminale c'è — ma
  `entryKeys` è vuoto, quindi il diagramma non ha nessun ingresso e il blocco
  di raggiungibilità non gira **su nessun nodo**: `flow-unreachable` tace
  anche lui, non perché tutto sia raggiungibile ma perché la sua premessa
  manca. Nodi orfani altrove nel diagramma non vengono segnalati da nessuna
  delle due regole. Il commento sul posto (righe 83-85) descrive il
  comportamento — la regola tace quando la premessa manca — ma non la lettura
  che qui conta: la premessa può mancare anche con un terminale presente,
  se quel terminale non è un ingresso vero. Non corretto in questo giro
  perché è un buco di **regola**, non di codice che tradisce la regola: la
  correzione è una decisione di design (un secondo codice tipo
  `flow-terminal-not-entry`? o ridefinire «ingresso»?) che tocca la spec
  (§9), non una riga. Costo-se-sbagliato: falsi negativi silenziosi — un
  diagramma con un solo terminale collegato come uscita anziché come ingresso
  perde la sola rete che il progetto ha contro i frammenti staccati, e chi
  disegna non ha modo di saperlo dal pannello dei problemi.
- **Con due o più archi fra la stessa coppia di nodi, l'aggancio di una
  decisione esce dal rombo.** `routeEdge` (`src/editor/edge-routing.ts`)
  aggancia al centro del lato del rettangolo di ingombro quando l'`offset` di
  fascio è zero, e per un rombo quel punto centrale **è** la sua punta (spec
  §8) — un caso fortunato che non costa codice in più. Con un `offset` diverso
  da zero (due o più archi fra la stessa coppia) `slide`
  (`src/editor/edge-routing.ts:109-111`) sposta il punto di aggancio lungo il
  lato del rettangolo, ma il contorno
  vero del rombo si allontana da quel lato non appena ci si scosta dal centro:
  l'aggancio finisce fuori dal rombo, visibilmente scollegato. Stessa classe
  di limite già accettata per il parallelogramma, che aggancia leggermente
  fuori dai suoi lati obliqui (spec §8) — qui il caso è più visibile perché
  richiede due rami di una stessa decisione, che in un flowchart è comune.
  Rinviato perché correggerlo per il rombo da solo (proiettare l'aggancio sul
  contorno vero della forma, non sul rettangolo di ingombro) romperebbe la
  regola unica di `routeEdge` — vede due `Rect` e nulla della forma reale —
  che tiene il router disaccoppiato da come si disegna ciascuna forma
  (§8 della spec, stessa ragione per cui il parallelogramma è già accettato).
  Costo-se-sbagliato: un arco visibilmente staccato dal rombo su una
  decisione con due rami ravvicinati — leggibilità, non un dato sbagliato nel
  modello.

### Correzione finale del flowchart (2026-09-23)

Trovate durante il giro di correzione che ha chiuso C1/C2/I1/I2 (registro:
`.superpowers/sdd/2026-09-22-flowchart/final-fix-report.md`), non corrette
in quel giro per decisione esplicita del brief — fuori scopo, non
dimenticanza.

- **L'editor dell'etichetta d'arco è centrato su `label.y` con `FONT_SIZE`,
  il testo è disegnato a `label.y - 6` con font 11.** `FlowEdgeLabelEditor`
  (`src/ui/canvas/InlineEditor.tsx`) posiziona l'`<input>` sul punto
  etichetta usando `HEADER_H`/`FONT_SIZE` (13px), come gli editor di nome
  di entità e classi; `FlowEdgeView` (`src/ui/canvas/FlowEdge.tsx`) disegna
  il `<text>` a `y - 6` con `fontSize={11}` — due misure scelte a parte per
  lo stesso punto, mai riconciliate. Lo scarto è di qualche pixel verticale
  fra dove l'editor appare e dove il testo statico si legge subito dopo
  averlo chiuso. Costo-se-sbagliato: cosmetico — un salto minimo alla
  chiusura dell'editor, non un dato sbagliato.
- **`applyFlowLayout` non fa `snap` alla griglia come `applyLayout`.**
  `applyLayout` (`src/editor/commands/view.ts`) allinea alla griglia ogni
  posizione scritta da un layout (`node.x = snap(p.x - minX + MARGIN)`);
  `applyFlowLayout` (`src/editor/flow/commands.ts`) scrive `p.x`/`p.y` così
  come li calcola `placeInLanes` (`src/editor/flow/layout.ts`), senza
  `snap`. Dopo «Disponi» i nodi di un flowchart possono finire fuori
  griglia, e il primo trascinamento li fa saltare di qualche pixel per
  allinearsi — lo stesso sintomo che il docblock di `applyLayout` descrive
  per il caso che quella funzione previene. Il limite gemello di
  `fitToContent` sulle bande delle corsie è chiuso dal 2b (vedi «Minori chiuse
  il 2026-09-25» in **Corretti**). Costo-se-sbagliato: un salto di pochi pixel
  al primo drag dopo «Disponi» — non perde un dato.

### Canvas unificato (2026-09-24)

Limiti accettati scrivendo il primo giro del canvas unificato — un solo documento con le tre
famiglie (`doc.diagram = { er, class, flow }`), chiavi con prefisso `famiglia/` in tutto lo stack.
Nessuno dei quattro tocca la correttezza del modello: sono margini di questo giro, non difetti
scoperti dopo. Tre sono stati chiusi (vedi «Minori chiuse il 2026-09-25» e «Minori chiuse il
2026-09-26» in **Corretti**): le bande che passavano sotto entità e classi, il pannello delle corsie
che compariva solo dal primo nodo, e le due note (di classe e di flusso) come implementazioni separate.

- **«Disponi» mette le famiglie in fila senza ragionare sulla vicinanza.** `packBlocks`
  (`src/editor/layout-pack.ts`) impacchetta i blocchi da sinistra a destra nell'ordine canonico
  (`er`, `class`, `flow`), allineati in alto: non guarda se un arco collega un nodo di una famiglia a
  un nodo di un'altra — cosa che oggi non può succedere, «Collega» rifiuta un arco fra famiglie
  diverse — né se un utente vorrebbe due blocchi vicini per motivi che il documento non registra. Da
  rivalutare con lo step 4 della roadmap, i collegamenti tipizzati fra famiglie (spec del canvas
  unificato, §1): un layout che ragionasse sulla vicinanza avrebbe bisogno di sapere cosa, fra due
  blocchi, li rende vicini.

### Pool e corsie (2026-09-25)

Rilievi della review finale del 2b (`.superpowers/sdd/2026-09-25-pool-corsie/`) che il giro di
correzione ha deciso di non chiudere. Nessuno perde dati: sono ambiguità della spec, buchi di
copertura e piccole asimmetrie di interazione.

- **`POOL_MIN_W` vale due cose diverse.** La migrazione da v5 lo usa come larghezza minima del
  **corpo** delle corsie e ci aggiunge la striscia (`src/model/migrations.ts`: un pool migrato vuoto
  è largo 672), mentre Disponi e `addPool` lo usano come larghezza **totale** (640). Un documento
  migrato stretto perde 32 px al primo Disponi. Non si corregge nel codice perché è un'ambiguità della
  spec (§3 e §4 contro §6): va decisa lì quale delle due letture vale, poi una riga la allinea.
  Costo-se-sbagliato: un pool che si restringe di una striscia senza che nessuno l'abbia chiesto.
- **`resetDragTargets` non ha un test diretto del runner.**
  `src/ui/canvas/interaction-runner.ts` è l'unica rete contro il `transform` dell'anteprima rimasto
  sul DOM quando la griglia annulla un gesto (uno spostamento che si arrotonda a zero dà una recipe
  senza patch, e React non ridisegna). Rinviato perché il caso si vede solo con un finto DOM costruito
  apposta e la funzione è di tre righe. Costo-se-sbagliato: un nodo o un pool disegnato qualche pixel
  fuori dalla sua posizione vera fino al render successivo.
- **Pool e nodi condividono lo spazio delle chiavi senza un controllo di disgiunzione.**
  `FlowModelSchema` (`src/model/flow/schema.ts`) verifica che gli id delle corsie siano unici, non che
  una chiave di pool non sia anche una chiave di nodo: un nodo v5 chiamato `pool-1` renderebbe
  irraggiungibile il nodo o il pool della migrazione. Le chiavi che l'app genera sono uuid, quindi il
  caso nasce solo da un file scritto a mano; rinviato finché non se ne vede uno. Costo-se-sbagliato:
  un elemento che non si seleziona più, in un documento scritto fuori dall'app.
- **Il cablaggio della guida di ridimensionamento non ha test.** Gli effetti `preview-resize` e
  `clear-resize` del runner scrivono la guida sul DOM con `showGuide`
  (`src/ui/canvas/dom-registry.ts`), senza un test che lo verifichi, come già `showMarquee` per il
  riquadro di selezione. La regola del ridimensionamento è coperta da `flowOps.resize`; manca solo la
  scrittura sul DOM, che l'e2e dei pool esercita. Costo-se-sbagliato: una guida che non compare durante
  il gesto, con il ridimensionamento che al rilascio funziona lo stesso.
- **Un test di `resizePool` è tautologico.** In «il pool non scende sotto POOL_MIN_W, né sotto i suoi
  nodi» (`src/editor/flow/commands.test.ts`) l'asserzione `lane toBe("l1")` non può fallire:
  `resizePool` non scrive mai la corsia. Andrebbe sostituita da `expectLaneInvariant`, che verifica
  la cosa che conta, cioè che il nodo resti dentro la sua corsia anche disegnato. Rinviato perché la
  regola che la protegge, `clampPoolW`, ha già i suoi numeri nello stesso test. Costo-se-sbagliato: un
  test che resta verde se il ridimensionamento lasciasse un nodo fuori dal pool.
- **Con lo strumento Pool o di forma, intestazione e maniglie di un pool vincono sulla creazione.** Un
  clic sull'intestazione di un pool seleziona il pool invece di rifiutare con l'avviso, e un clic su una
  maniglia (8 px a cavallo dei bordi) avvia un ridimensionamento invece di creare. Il riduttore delle
  interazioni (`src/editor/interaction.ts`) crea solo su un clic sul canvas vuoto: un frame colpito
  cade nel ramo di selezione e trascinamento, una maniglia in quello del ridimensionamento. Rinviato perché nessuno dei due casi crea qualcosa di
  sbagliato: fa un'altra cosa innocua, e lo strumento resta attivo. Costo-se-sbagliato: un clic che non
  fa quello che l'utente si aspettava.
- **Disponi impila i pool senza spazio fra l'uno e l'altro.** `placeInLanes`
  (`src/editor/flow/layout.ts`) mette il pool successivo dove finisce l'ultima corsia del precedente,
  e i contorni si toccano. La spec (§6) non chiede uno spazio; aggiungerlo è una costante e una
  riga, da decidere quando un documento con più pool lo mostrerà. Costo-se-sbagliato: due pool che si
  leggono come uno solo finché non si guarda l'intestazione.
- **Un flusso fatto solo di pool vuoti abilita l'export Mermaid e dà un `flowchart LR` nudo.** Il pool
  vuoto conta come contenuto (`familyHasContent`, spec §6), quindi il formato si abilita, ma
  l'emettitore (`src/io/emit/flow-mermaid.ts`) non emette un pool senza nodi, e il testo resta la
  sola intestazione, senza avviso. Rinviato perché il risultato è corretto, solo povero. Si
  corregge con un avviso nell'emettitore, se qualcuno lo trova strano. Costo-se-sbagliato: un export
  vuoto senza spiegazione.
- **Collega che parte dall'intestazione di un pool disegna la linea di anteprima.** Al rilascio non
  si crea niente (Review Focus 1 del piano), ma durante il gesto la linea tratteggiata compare come se
  il collegamento fosse possibile. Rinviato perché l'anteprima non sa ancora che l'origine è un frame, e
  insegnarglielo tocca il riduttore delle interazioni per un caso che al rilascio è già innocuo.
  Costo-se-sbagliato: un'anteprima che promette un collegamento che non arriva.

### La nota unica (2026-09-26)

Rilievi della review finale dello step 3a (`.superpowers/sdd/2026-09-26-nota-unica/`), accettati nel
giro di correzione: vedi anche la voce riaperta in DT-29.

- **La linea di ancoraggio instrada verso i lati opposti anche quando la nota sta dentro il suo
  elemento.** `routeEdge` (`src/editor/edge-routing.ts:130`) sceglie i lati in base alla posizione
  relativa dei due rettangoli, senza un caso per un rettangolo dentro l'altro — una nota trascinata
  dentro il suo pool, per esempio: il percorso ortogonale torna indietro attraversando la nota invece
  di uscire dal lato più vicino. Rinviato perché il caso nasce solo trascinando la nota sopra il suo
  stesso elemento, cosa che l'utente fa di rado apposta. Costo-se-sbagliato: una linea che si legge
  male per un istante, nessun dato sbagliato.
- **Il conteggio delle note ancorate è ripetuto in due emettitori.** `er-mermaid.ts:123` e
  `flow-mermaid.ts:117` contano ciascuno per conto proprio le note ancorate alla propria famiglia, per
  l'avviso «N note ancorate … non sono uscite» (spec §8): la stessa forma di conteggio, scritta due
  volte perché finora bastava. Un helper `anchoredIn(notes, family)` la unificherebbe se arrivasse un
  terzo emettitore con lo stesso bisogno (YAGNI: due copie non sono ancora una duplicazione da
  correggere).

### Le forme generiche (3b)

Rilievi noti dallo sviluppo dello step 3b (`.superpowers/sdd/2026-09-26-forme-generiche/`), rinviati
deliberatamente: scelte di scope già decise nel brainstorming, o interazioni condivise con le zone che
il piano non chiedeva di risolvere qui.

- **Disponi e le zone.** Un rettangolo disegnato attorno a elementi di altre famiglie finisce nel
  blocco delle forme, e gli elementi che racchiudeva nei blocchi delle loro famiglie: dopo Disponi la
  zona non li racchiude più. Tenere le zone fuori da Disponi non risolve niente, perché i nodi si
  sposterebbero comunque. Da riprendere se le zone attorno alle famiglie diventano l'uso principale
  (spec 3b §10).
- **Una zona non porta con sé ciò che contiene** quando la si trascina: il contenitore vero resta il
  pool.
- **La selezione a riquadro non parte da dentro una zona**: il clic sul fondo prende la zona, come sul
  fondo di un pool.
- **Niente colori, niente etichetta sulle frecce, niente Mermaid per le forme, `kind` fisso**: scelte
  del brainstorming (spec 3b §12), non dimenticanze.
- **La maniglia di ridimensionamento vive nel layer backdrop**, sotto tutto come le forme stesse: un
  pool, l'area di hit di un arco o un nodo di un'altra famiglia sopra l'angolo in basso a destra di
  una zona la coprono, e la zona non si ridimensiona. Il rimedio è disegnare la maniglia della forma
  selezionata in un layer sopra i nodi, non nel backdrop (fix wave finale, brief §3).

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
