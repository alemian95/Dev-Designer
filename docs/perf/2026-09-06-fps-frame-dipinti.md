# Misura FPS a frame dipinti — 300 e 600 entità

Il criterio del piano: **a 300 entità, in build di produzione, il p95 del tempo di frame ≤ 20 ms
(≥ 50 FPS)** negli scenari drag, drag di tutta la selezione, pan, marquee e zoom. È il debito che lo
spike aveva lasciato aperto: là gli FPS reali **non erano stati misurati**
([risultati dello spike](../superpowers/spikes/2026-09-06-spike-results.md), sezione A).

**Esito: FAIL.** Quattro scenari su cinque passano con largo margine; lo **zoom** sfonda il criterio di
due volte (p95 34–42 ms contro 20). A 600 entità cadono anche il drag di tutta la selezione e lo zoom
peggiora ancora.

Dopo la misura una correzione ha tolto dal percorso di `pointermove` due letture che forzavano stile e
layout: la **rimisura** sta al §3bis, la conseguenza sul Task 12 al §7. Il verdetto non cambia.

## 1. Cosa misura e come

Lo script è `scripts/perf/fps.mjs`, si esegue con `pnpm perf [N]` e fa, nell'ordine:

1. `vite build` — **build di produzione**. Niente dev server, niente doppia invocazione del render:
   `<StrictMode>` è ancora in `src/main.tsx` ma in produzione React non ripete le funzioni di render,
   quindi non pesa sulla misura.
2. avvia `vite preview` e apre `http://localhost:4173/?stress=N`, cioè il documento sintetico a N
   entità da 12 attributi e ~2 relazioni ciascuna (`src/perf/stress.ts`);
3. lancia il **Chrome di sistema** (`channel: "chrome"`) **in finestra visibile**, senza emulazione del
   viewport (`viewport: null`, niente `Emulation.setDeviceMetricsOverride`): la pagina è dipinta sul
   display vero, alla densità vera;
4. inietta un ciclo `requestAnimationFrame` che accumula i timestamp dei frame;
5. per ogni scenario azzera i frame, esegue l'interazione con **eventi mouse e tastiera reali** (CDP
   `Input.dispatchMouseEvent`, non eventi sintetici JavaScript) e ricava dai timestamp il **tempo fra
   frame consecutivi**: FPS medio, p95, massimo.

**Perché "frame dipinti".** Il tempo fra due `requestAnimationFrame` consecutivi è il ritmo con cui il
browser produce i frame: se un frame costa 40 ms di stile, layout e paint, il rAF successivo arriva 40 ms
dopo. Non è tempo di scripting — è tutto il lavoro del frame. Che il lavoro pesante non sia scripting lo
conferma il profiler di Chrome (CDP `Performance.getMetrics`, riportato dallo script a fine misura): nello
zoom a 300 entità, su 2.440 ms di task **1.716 ms sono layout** e solo 33 ms scripting. La differenza con
la sezione A dello spike è tutta qui: là si misurava il costo di React dentro l'handler di `pointermove`,
con il pannello del browser nascosto e quindi **senza frame dipinti**; qui si misura il frame intero.

**Ogni scenario dimostra di essere avvenuto.** Il drag verifica che il nodo si sia spostato, il pan che il
transform del viewport sia cambiato, il marquee che qualcosa sia stato selezionato, lo zoom che la scala
sia scesa. Se la verifica fallisce lo scenario non produce numeri: solleva. Non è pignoleria — durante lo
sviluppo dello script un'interazione che non partiva ha prodotto un tranquillo «120 FPS, p95 9,3 ms», che
è il ritmo del display a schermo fermo.

**Scelte di misura, dichiarate:**

- **Un giro di riscaldamento non misurato** precede quello buono: il primo drag paga il JIT e la prima
  resa di ogni layer.
- **Prima di ogni scenario** la vista è reimpostata (mod+0) e la selezione svuotata (Esc): gli scenari
  sono indipendenti, non si sommano.
- Il **puntatore è portato sul punto di partenza nella preparazione**, fuori dalla finestra misurata, con
  una pausa prima del `down`: senza quella pausa capita che la pagina ignori del tutto il pointerdown.
- Il **p95 è la definizione operativa di "FPS minimo"**. Il **max** di ogni riga è un singolo frame e
  contiene GC, primo paint di un layer, commit di una selezione: va letto, non usato come criterio.

**Differenze rispetto allo script del piano**, tutte nella direzione di una misura più severa o più
onesta:

- **Zoom**: il piano prevedeva 30 tacche di rotella da `deltaY = ±40`. Con quel valore la scala sbatte
  contro i limiti (0,1 e 4) dopo 4–9 tacche e le altre 50 non ridisegnano niente, diluendo il p95 con
  frame vuoti. Qui le tacche sono da `deltaY = ±8`: 30 tacche portano la scala da 1 a 0,1 e 30 la
  riportano a 1, **tutte efficaci**. È lo scenario più pesante, non il più comodo.
- **Marquee**: la pennellata preparatoria di pan (serve solo a liberare l'angolo del canvas) sta nella
  preparazione, non dentro la misura del marquee.
- **Sesto scenario, `marqueeAll`**: il marquee alla scala 1 seleziona solo le entità inquadrate — a 300
  entità sono 8 — mentre lo spike indicava come caso peggiore la selezione di *tutte* insieme. Lo script
  lo misura a parte, dopo un fit (`f`) che porta l'intero diagramma nell'inquadratura. Non fa parte dei
  cinque scenari del criterio: è in più.
- `mod+A` resta **dentro** lo scenario `dragAll`, come nel piano: il suo costo (un frame) si vede nella
  colonna max.

**Instabilità nota dell'automazione.** In circa un'esecuzione su quattro un pointerdown viene ignorato
dalla pagina e lo scenario non parte (causa non chiarita: succede solo dentro l'automazione, mai a mano, e
nessun errore compare nella console della pagina — lo script la ascolta). Le verifiche lo intercettano e
lo scenario viene **ripetuto una volta sola, dichiarandolo** in output con `[ripetuto 2×]`. Nessuna delle
esecuzioni riportate qui sotto ha avuto bisogno della ripetizione.

## 2. Ambiente

| | |
|---|---|
| Macchina | MacBook Pro, Apple M3 Pro (11 core CPU, 14 GPU), 18 GB, macOS 26.1 (25B78) |
| Display | Built-in Liquid Retina XDR, 3024×1964, **ProMotion**: i rAF a riposo stanno a **~120 FPS** |
| Browser | Google Chrome 152.0.7977.77 di sistema, finestra visibile, guidato da Playwright 1.63 |
| Viewport | **1400×787 CSS px**, devicePixelRatio **2** (vedi nota) |
| Build | `vite build` (Vite 8) servita da `vite preview`, Node 22.23.2 |
| Commit dell'app misurato | `753e62b` |
| Ripetizioni | 4 esecuzioni indipendenti a 300 entità, 2 a 600 |

**Un secondo ambiente, al §3bis.** La rimisura dopo la correzione delle letture che forzano il layout
è su un display a **60 Hz** e devicePixelRatio **1**: pavimento a riposo 17,4 ms invece di 9,3. I p95
delle due sezioni non si confrontano fra loro — il §3bis porta il proprio "prima", misurato sullo
stesso display.

**Nota sul viewport.** Il piano chiedeva 1400×900. Su questo schermo (1512×982 punti logici) una finestra
di Chrome non può avere 900 px di area utile: fra barra dei menu, barra delle schede e barra degli
indirizzi restano 787 px. Lo script ridimensiona la finestra vera per avvicinarsi il più possibile al
bersaglio e **stampa il viewport davvero ottenuto**. L'area dipinta è quindi ~13% più piccola di quella
del piano: è un bias, e va nella direzione **ottimistica**.

**Nota sul display a 120 Hz.** A schermo fermo i frame arrivano ogni ~9,3 ms: è il pavimento della
misura, non un merito dell'applicazione. Un display a 120 Hz rende il test **più severo**, non più
facile: il browser tenta 120 frame al secondo, quindi ogni frame ha un budget di 8,3 ms e non 16,7. Il
criterio (p95 ≤ 20 ms) non cambia.

## 3. Risultati

### 300 entità

Esecuzione di riferimento (`pnpm perf 300`, la quarta; le altre tre stanno nella tabella di dispersione).

| Scenario | FPS medio | p95 ms/frame | max ms/frame |
|---|---|---|---|
| drag | 111,2 | 10,4 | 42,2 |
| dragAll | 84,9 | 18,0 | 59,3 |
| pan | 119,1 | 10,3 | 18,4 |
| marquee | 117,2 | 10,3 | 34,4 |
| zoom | 50,2 | **41,7** | 50,8 |
| marqueeAll (extra) | 116,4 | 10,3 | 41,8 |

Riposo, senza interazione: 120 FPS, p95 9,3 ms.

Dispersione del p95 sulle 4 esecuzioni (in ms):

| Scenario | esec. 1 | esec. 2 | esec. 3 | esec. 4 | intervallo |
|---|---|---|---|---|---|
| drag | 9,4 | 9,4 | 9,4 | 10,4 | 9,4–10,4 |
| dragAll | 17,5 | 17,5 | 17,6 | 18,0 | 17,5–18,0 |
| pan | 9,3 | 9,3 | 9,4 | 10,3 | 9,3–10,3 |
| marquee | 9,3 | 9,4 | 9,4 | 10,3 | 9,3–10,3 |
| zoom | 40,9 | 41,6 | 41,6 | 41,7 | 40,9–41,7 |
| marqueeAll | 9,3 | 9,3 | 9,3 | 10,3 | 9,3–10,3 |

La misura è **stabile**: nessuno scenario oscilla più di 1 ms fra un'esecuzione e l'altra, e la differenza
di 1 ms è la stessa che si osserva sul pavimento a riposo (adattamento del refresh ProMotion). Tre
esecuzioni con una versione precedente dello script, senza il sesto scenario, avevano dato per lo zoom
34,3 / 35,2 / 41,7 ms: l'ordine di grandezza è quello, il verdetto non cambia.

Dove va il tempo, dal profiler di Chrome (ms sull'intero scenario, esecuzione di riferimento):

| Scenario | durata | script | stile | layout |
|---|---|---|---|---|
| drag | 737,5 | 74,2 | 21,8 | 91,0 |
| dragAll | 2.554,5 | 444,2 | **1.225,4** | 134,7 |
| pan | 339,2 | 115,6 | 9,2 | 2,4 |
| marquee | 604,9 | 71,3 | 8,4 | 30,3 |
| zoom | 2.439,5 | 33,3 | 4,2 | **1.716,5** |
| marqueeAll | 593,1 | 75,4 | 9,8 | 31,1 |

### 600 entità

| Scenario | FPS medio | p95 ms/frame | max ms/frame |
|---|---|---|---|
| drag | 112,6 | 9,3 | 83,3 |
| dragAll | 48,2 | **34,3** | 124,3 |
| pan | 118,9 | 9,4 | 16,3 |
| marquee | 116,6 | 9,3 | 67,6 |
| zoom | 27,2 | **75,9** | 84,2 |
| marqueeAll (extra) | 116,1 | 9,3 | 75,0 |

Seconda esecuzione, per confronto: drag 9,3 · dragAll 34,3 · pan 9,3 · marquee 9,3 · zoom 75,9 ·
marqueeAll 9,3. Identica.

A 600 entità il `marqueeAll` seleziona 525 entità su 600, non tutte: il fit si ferma alla scala minima
(0,1) e il diagramma non entra tutto nell'inquadratura. È un limite dell'applicazione, non della misura.

## 3bis. Rimisura dopo la correzione delle letture che forzano il layout

La review finale del branch ha trovato, nel percorso di `pointermove`, due letture del DOM che forzano
il ricalcolo sincrono di stile e layout: `svg.getBoundingClientRect()` per le coordinate schermo e
`document.elementFromPoint` per l'hit test. Arrivavano subito dopo che `previewDrag` aveva riscritto
centinaia di `transform` e di path, e a ogni evento, che è più spesso dei frame. La correzione
(commit `9ace358`) mette in cache il rect — lo invalida il `ResizeObserver` — e rende l'hit test un
getter memoizzato, perché il reducer lo legge solo su `down` e su `up`, mai in `onMove`.

La domanda aperta era: **quanto di quel costo era forced layout?** Risposta: poco sul frame, molto sullo
scripting.

**Attenzione al confronto.** Questa rimisura è su un display a **60 Hz** (pavimento a riposo 17,4 ms) e
devicePixelRatio **1**, non sul pannello ProMotion a 120 Hz del §2 (pavimento 9,3 ms, dPR 2). I p95
assoluti **non sono confrontabili** con quelli del §3: a 60 Hz ogni scenario tranne lo zoom sta già sul
pavimento, e il p95 non ha più risoluzione per mostrare un miglioramento. Per questo il "prima" è stato
rimisurato **nella stessa sessione e sullo stesso display**, mettendo da parte la correzione con
`git stash`, e il confronto utile è sulle colonne del profiler.

Ambiente della rimisura: viewport **1400×888 CSS px**, devicePixelRatio **1**, display a 60 Hz, Chrome
152.0.0.0, riposo p95 17,4 ms. Prima = `9ace358` con la correzione messa da parte, 2 esecuzioni; dopo =
`9ace358`, 3 esecuzioni.

### p95 del tempo di frame a 300 entità, prima e dopo

| Scenario | p95 prima | p95 dopo | Verdetto |
|---|---|---|---|
| drag | 17,5 · 17,2 | 17,6 · 17,0 · 17,4 | PASS → PASS |
| dragAll | 16,8 · 17,4 | 17,4 · 17,3 · 17,4 | PASS → PASS |
| pan | 17,3 · 17,5 | 17,5 · 17,4 · 17,3 | PASS → PASS |
| marquee | 17,5 · 17,3 | 17,5 · 17,2 · 17,5 | PASS → PASS |
| zoom | 33,6 · 33,8 | **33,8 · 33,5 · 33,6** | FAIL → **FAIL** |
| marqueeAll (extra) | 17,3 · 17,3 | 16,8 · 17,3 · 17,3 | PASS → PASS |

**Il p95 non si muove**, ed era prevedibile: tutti gli scenari tranne lo zoom sono al pavimento del
display già prima, e lo zoom non passa dal codice corretto (la rotella non chiama `info()`).
**Lo zoom resta un FAIL**, a 33,5–33,8 ms su una soglia di 20.

### Dove va il tempo, prima e dopo (ms sull'intero scenario, dal profiler)

Esecuzione di riferimento per lato; fra parentesi l'intervallo sulle altre.

| Scenario | script prima | script dopo | stile prima | stile dopo | layout prima | layout dopo |
|---|---|---|---|---|---|---|
| drag | 109,6 (110,2) | **35,8** (31,8–36,2) | 28,9 | 32,7 | 123,6 | 117,1 |
| dragAll | 431,8 (437,0) | **402,2** (390,6–413,1) | 1.199,4 | **1.217,4** | 103,5 | 121,3 |
| pan | 165,9 (177,8) | **89,8** (88,4–119,5) | 14,2 | 12,8 | 3,6 | 3,4 |
| marquee | 110,4 (109,8) | **20,0** (18,1–21,1) | 13,5 | 15,2 | 41,8 | 43,5 |
| zoom | 24,6 (33,6) | 26,4 (28,5–30,3) | 4,0 | 4,0 | 1.739,7 | 1.699,0 |
| marqueeAll | 78,8 (75,4) | **19,9** (20,7–21,5) | 10,5 | 11,9 | 31,3 | 31,7 |

**Il tempo di scripting crolla dove le due letture stavano nel percorso**: marquee 110 → 20 ms (−82%),
drag 110 → 33 (−70%), marqueeAll 76 → 20 (−74%), pan 178 → 99 (−45%). Sono ~2 secondi di interazione
per scenario, quindi in valore assoluto si parla di decine di millisecondi risparmiati su centinaia di
eventi: reale, misurato, e comunque molto sotto il budget di un frame. Lo zoom è invariato, come deve
essere: non passa da `info()`.

**Il ricalcolo di stile di `dragAll` non si muove: 1.199 → 1.217 ms.** È la risposta alla domanda
aperta, e la risposta è **no**: quel costo non era forced layout dovuto alle letture. È il lavoro di
scrivere ogni frame il `transform` di 300 nodi e la geometria di ~580 edge sul DOM. Togliere le letture
non lo tocca, perché la scrittura resta.

### 600 entità dopo la correzione

| Scenario | FPS medio | p95 ms/frame | max ms/frame | (p95 al §3, 120 Hz) |
|---|---|---|---|---|
| drag | 55,6 | 17,4 | 83,8 | 9,3 |
| dragAll | 38,9 | **34,0** | 116,6 | **34,3** |
| pan | 59,5 | 17,3 | 33,3 | 9,4 |
| marquee | 58,6 | 16,8 | 66,7 | 9,3 |
| zoom | 23,7 | **83,3** | 100,5 | **75,9** |
| marqueeAll (extra) | 58,1 | 17,3 | 82,5 | 9,3 |

Gli scenari che al §3 erano al pavimento del display qui stanno al pavimento dell'altro display, e non
dicono niente di nuovo. I due che sfondano il criterio sfondano di nuovo, con gli stessi ordini di
grandezza: `dragAll` 34,0 ms (era 34,3) e zoom 83,3 ms (era 75,9 — peggio, ma su un display e un dPR
diversi: la differenza non è attribuibile alla correzione, che a 600 entità come a 300 non tocca il
percorso dello zoom). **Nessun verdetto cambia.**

## 4. Verdetto

Criterio: **p95 ≤ 20 ms per ogni scenario, a 300 entità**.

| Scenario | p95 a 300 | Verdetto |
|---|---|---|
| drag | 10,4 ms | **PASS** |
| dragAll (drag di tutta la selezione) | 18,0 ms | **PASS**, con poco margine |
| pan | 10,3 ms | **PASS** |
| marquee | 10,3 ms | **PASS** (ma seleziona solo le 8 entità inquadrate) |
| zoom | 41,7 ms | **FAIL** — il doppio del criterio |
| marqueeAll (extra, fuori criterio) | 10,3 ms | PASS sul p95; un singolo frame da 42 ms |

**Esito complessivo a 300 entità: FAIL**, per lo zoom.

A 600 entità falliscono zoom (75,9 ms) e dragAll (34,3 ms).

La correzione delle letture che forzano il layout (§3bis) **non cambia nessuno di questi verdetti**:
lo zoom resta un FAIL a 300 entità, e a 600 restano fuori zoom e dragAll.

Il **p95 è la definizione operativa di "FPS minimo"** del criterio: il **max** contiene il singolo frame
sporco (GC, primo paint, commit di una selezione) e non è un buon giudice. Va però letto, perché un frame
solo da 42 ms si vede: `marqueeAll` passa il p95 con 10,3 ms e ha un max di 41,8 ms, che è esattamente il
costo di selezionare 300 entità in un colpo — uno scatto percepibile, non un problema di fluidità
continua. Stessa lettura per il max di `dragAll` (59 ms) e di `drag` (42 ms): sono i frame di commit e di
primo render della selezione.

## 5. Lettura

**Lo scenario peggiore è lo zoom, e non è il paint: è il layout.** A 300 entità lo zoom consuma 1.716 ms
di layout su 2.440 ms di task, contro 33 ms di scripting. Il pan, che cambia lo **stesso attributo**
`transform` sullo stesso gruppo, costa 2,4 ms di layout in tutto: la differenza fra i due è che il pan
cambia solo la traslazione, lo zoom cambia la **scala**. Un cambio di scala obbliga il browser a
rifare il layout dell'intero albero SVG.

La diagnostica `scripts/perf/zoom-bands.mjs` misura lo zoom banda di scala per banda di scala, insieme al
numero di entità davvero inquadrate:

| banda | frame | p95 ms | max ms | entità in vista |
|---|---|---|---|---|
| 1 → 0,5 | 305 | 35,1 | 43,2 | 28 |
| 0,5 → 0,25 | 310 | 35,3 | 50,3 | 66 |
| 0,25 → 0,125 | 356 | 33,9 | 42,4 | 180 |
| 0,125 → 0,1 | 124 | 32,5 | 34,3 | 216 |

**Il costo per frame non cambia** fra 28 e 216 entità inquadrate. Cambia invece con il numero di entità
**nel DOM**: 41,7 ms a 300 entità, 75,9 ms a 600, cioè quasi il doppio per il doppio dei nodi. Il costo
dello zoom è proporzionale a quello che sta nel documento, non a quello che si vede.

**Il secondo scenario più caro è `dragAll`, e lì il costo è il ricalcolo di stile**: 1.225 ms su 2.554.
Trascinando 300 entità selezionate, ogni frame riscrive il `transform` di 300 nodi e la geometria di ~580
edge sul DOM — anche di quelli fuori dall'inquadratura, che sono la stragrande maggioranza (alla scala 1
se ne vedono 8 su 300). È lavoro pagato per intero su elementi che nessuno guarda.

**Confronto con la sezione A dello spike.** Lo spike misurava, a 300 entità, 4,6–5,7 ms di scripting per
evento in drag (p95 fino a 14,2) e 3,5–4,6 in pan, e concludeva «l'asse React non è il collo di bottiglia
a quella scala». **La conclusione regge**: qui il drag e il pan stanno *sul pavimento del display*
(10,3–10,4 ms, contro 9,3 ms a schermo fermo), cioè il loro costo è invisibile. Regge anche la riserva
che lo spike si era tenuto: il costo di **paint e layout** era ignoto e andava misurato, ed è proprio lì
che il criterio si rompe. Le tre correzioni sull'asse React previste dallo spike — transform del viewport
fuori dal render, edge memoizzati, stato del drag fuori da React — sono tutte già implementate (Task 8) e
si vedono: il pan a 600 entità costa 9,3 ms per frame.

Cade invece l'aspettativa che il marquee fosse il caso peggiore: la selezione di 300 entità in un colpo
costa **un** frame da ~42 ms, non una sequenza di frame lenti.

## 6. Cosa non è misurato

- **Nessun altro display.** La misura è su un pannello a 120 Hz: a 60 Hz il budget per frame
  raddoppierebbe e drag, pan e marquee resterebbero comunque sotto la soglia; lo zoom no.
- **Nessuna macchina lenta.** Un M3 Pro è hardware veloce. Il criterio di 20 ms non ha margine per
  macchine più lente: i risultati qui non dicono niente su un portatile di fascia bassa.
- **Viewport 1400×787 invece di 1400×900** (limite fisico dello schermo, §2): ~13% di area dipinta in
  meno del previsto, quindi numeri leggermente ottimistici.
- **Solo Chrome.** Firefox e Safari non sono stati misurati, e il layout SVG è esattamente il punto dove
  i motori differiscono di più.
- **Entità tutte espanse.** Le entità collassate della spec §4.3, che sono la leva prevista oltre le
  centinaia di entità, non sono state misurate.
- **Marquee alla scala 1 su un documento largo**: seleziona solo le 8 entità inquadrate. Il caso della
  selezione totale è coperto da `marqueeAll` e da `dragAll`.
- **Nessun profilo del paint separato dal layout**: la scomposizione disponibile (`Performance.getMetrics`)
  distingue script, stile e layout, non il paint e la rasterizzazione. Il tempo di frame li contiene
  tutti, ma l'attribuzione al paint sarebbe una deduzione, non una misura.
- **Editing, import, undo/redo**: fuori dagli scenari del criterio.

## 7. Conseguenza per il Task 12 (culling del viewport): rinviato

**Il Task 12 (culling del viewport) è rinviato.** Lo scenario che fallisce è lo zoom, e
`scripts/perf/zoom-bands.mjs` dimostra che il suo costo dipende dal numero di nodi nel DOM, non da
quanti sono inquadrati: il culling non lo tocca. A 300 entità — il criterio del piano — gli altri
quattro scenari passano. La leva giusta per lo zoom è un livello di dettaglio (entità collassate oltre
una soglia di scala), che il piano non prevede: va nel piano successivo.

**I numeri su cui si regge la decisione.**

*Il culling non attacca lo scenario che fallisce.* La diagnostica per bande di scala (§5) misura
32,5–35,3 ms per frame **indipendentemente** dal numero di entità inquadrate, che nelle quattro bande va
da 28 a 216. Il costo cambia invece con i nodi nel documento: 41,7 ms a 300 entità, 75,9 ms a 600, quasi
il doppio per il doppio dei nodi. E alla scala minima, dove lo zoom è più caro, **tutto il diagramma è
dentro l'inquadratura: non c'è niente da tagliare.** Il culling migliorerebbe le bande in cui si vede
poco, e quelle bande sono già a 35 ms.

*A 300 entità gli altri quattro scenari passano.* drag 10,4 · dragAll 18,0 · pan 10,3 · marquee 10,3 ms,
tutti sotto la soglia di 20 (§4). Il criterio del piano è 300 entità: su quel criterio il culling non
compra niente che manchi.

*La motivazione residua del culling si è indebolita ancora.* L'argomento migliore per il culling era
`dragAll`, che a 300 entità passava con 2 ms di margine spendendo 1.225 ms di ricalcolo di stile per
riscrivere ogni frame 300 nodi e ~580 edge, dei quali alla scala 1 se ne vedono 8. La rimisura (§3bis)
mostra che quel costo **non era forced layout** — tolte le due letture che forzavano il layout, il
ricalcolo di stile di `dragAll` resta 1.217 ms contro 1.199 — quindi è tutto scrittura sul DOM, e il
culling la ridurrebbe davvero. Ma resta l'unico scenario che il culling aiuta, resta sotto la soglia a
300 entità, e la correzione ha intanto tolto da tutti gli scenari di puntatore il 45–82% del tempo di
scripting senza toccare il DOM. Non basta a giustificare un task di culling ora.

**Il limite noto, dichiarato.** Oltre le ~300 entità il **drag di tutta la selezione sfora**: a 600
entità è 34 ms di p95 contro una soglia di 20, e a 300 passa con appena 2 ms di margine. Lo **zoom sfora
già a 300 entità** (33,5–41,7 ms secondo il display, contro 20) e a 600 arriva a 75–83 ms. Sono limiti
accettati consapevolmente per questo piano, non problemi risolti.

**Ordine per il piano successivo:**

1. **Livello di dettaglio sulla scala** — entità collassate, o senza testo degli attributi, sotto una
   soglia di scala. È l'unica leva che attacca lo zoom, ed è lo scenario che fa fallire il criterio. La
   spec §4.3 già anticipa le entità collassate; il piano non aveva un task per usarle come LOD.
2. **Culling del viewport** (l'ex Task 12), come leva su `dragAll` e prerequisito per alzare la scala di
   lavoro oltre le 300 entità. Il punto d'ingresso esiste già: `visibleWorldRect` in
   `src/editor/viewport.ts`, che resta in codice con un commento che rimanda a questa decisione.

Il tetto voluto resta 60 FPS e non oltre: nessuna delle due leve va spinta più in là.

## Riprodurre

```bash
pnpm perf 300      # misura del criterio: build, preview, Chrome visibile, tabella e verdetto
pnpm perf 600
pnpm build && node scripts/perf/zoom-bands.mjs 300   # diagnostica dello zoom per bande di scala
```

Serve **Google Chrome installato** (lo script usa `channel: "chrome"`; i browser di Playwright non sono
scaricati in questo repo). Si apre una finestra di Chrome: **non toccarla e non coprirla** durante la
misura, altrimenti Chrome strozza i rAF. Lo script se ne accorge — se a riposo i frame sono già lenti lo
dichiara e la misura va buttata.
