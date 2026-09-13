# Il gate di prestazione torna verde — dragAll e zoom

Il criterio è quello di [2026-09-06](2026-09-06-fps-frame-dipinti.md): **a 300 entità, in build di
produzione, p95 del tempo di frame ≤ 20 ms**. Quel documento chiudeva con un FAIL sullo zoom; alla
ripresa del 2026-09-13 i FAIL erano due, `dragAll` (25,9 ms) e `zoom` (58,4 ms in quella sessione,
33,5 in quelle successive — la differenza è fra macchine e sessioni, non fra versioni).

**Esito: PASS su tutti e sei gli scenari, a 300 e a 600 entità**, con ogni scenario al pavimento
del display (~10 ms su un pannello a 120 Hz). `pnpm perf` esce 0.

| scenario | prima | dopo |
|---|---|---|
| drag | 10,2 | 9,9 |
| dragAll | **25,9** | 9,9 |
| pan | 10,1 | 10,3 |
| marquee | 9,9 | 10,2 |
| zoom | **33,5** | 10,2 |
| marqueeAll | 10,1 | 9,7 |

A 600 entità, dove il documento del 6 settembre misurava zoom 75,9 e dragAll 34,3: tutti e sei fra
9,7 e 10,2 ms.

## `dragAll`: si scrive solo ciò che si vede

La diagnosi stava già nel §5 del documento precedente, scritta e non agita: «ogni frame riscrive il
`transform` di 300 nodi e la geometria di ~580 edge sul DOM — anche di quelli fuori
dall'inquadratura, che sono la stragrande maggioranza (alla scala 1 se ne vedono 8 su 300). È lavoro
pagato per intero su elementi che nessuno guarda.»

`previewDrag` ora salta la scrittura quando il rettangolo **dopo** lo spostamento non tocca
l'inquadratura, allargata di un margine di 64 unità di mondo — un cappio di auto-relazione esce di
30 più il suo anello, un marker arriva a 24, e senza margine un nodo appena fuori lascerebbe mezzo
arco fermo a schermo.

Il criterio è il rettangolo *dopo* e non *prima*: un nodo che **entra** nell'inquadratura durante il
drag va scritto. Verificato in pagina su un documento da 40 entità, tutte selezionate, trascinate
verso l'alto di 920 unità: `t21` parte a y=1020, fuori schermo, e a metà drag è già scritto a
y=100; `t0` esce dall'alto e resta indietro a −340 mentre il puntatore è a −920; al rilascio React
rende tutto dalle posizioni del comando e i tre nodi sono a −920, −240, 100. Il DOM saltato è
un'anteprima, non lo stato.

Nello stesso passaggio i rettangoli dei nodi si misurano **una volta alla presa** invece che due
volte per arco a ogni frame: la dimensione di un nodo non dipende da dove sta, durante un drag
cambiano solo `x` e `y`. Prima ogni frame rifaceva ~1.200 misure di testo.

Effetto sul profiler: lo scenario `dragAll` passa da 15.294 ms a 717 ms di durata, con lo script da
12.233 a 73.

## `zoom`: il costo è il layout del testo, ed è per glifo

Il documento precedente aveva stabilito che il costo dello zoom è layout e che **cresce col numero
di nodi nel DOM, non con quelli inquadrati** — e su quella base aveva rinviato il culling (§7),
correttamente. Mancava un gradino: *quale parte* del DOM.

Misurato sul documento da 300 entità (3.900 `<text>`, 62.890 glifi), zoom reale con la rotella:

| condizione | p95 | layout |
|---|---|---|
| com'era | 33,4 ms | 1.662 ms |
| stessi `<text>`, contenuto svuotato | 10,0 ms | 207 ms |
| tutti i `<text>` rimossi | 9,9 ms | 40 ms |

**Il costo è per glifo, non per elemento.** Svuotare il contenuto lasciando i 3.900 elementi al
loro posto toglie il 90% del layout. Ne segue anche che unire le righe di un nodo in un solo
`<text>` con dei `<tspan>` non servirebbe a niente.

Prima di ridurre il DOM sono state provate — e scartate — le vie che non lo riducono:

| tentativo | p95 |
|---|---|
| attributo `transform` SVG (com'è) | 25,3 ms |
| `transform` CSS sul `<g>`, con e senza `will-change` | 25,2 · 25,7 ms |
| `transform` CSS sull'`<svg>`, con e senza `will-change` | 25,9 · 25,8 ms |
| `text-rendering: geometricPrecision` / `optimizeSpeed` / `optimizeLegibility` | 25,4 · 25,1 · 25,3 ms |
| `font-kerning: none`, `shape-rendering: optimizeSpeed`, `contain: strict` | 25,8 · 25,4 · 27,0 ms |

Nessuna sposta l'ago: il layout del testo SVG si rifà a ogni cambio di scala e non esiste una
proprietà che lo renda invariante.

**La soluzione: livello di dettaglio durante il gesto.** `ViewportGroup` mette `data-zooming` sul
gruppo del viewport mentre la scala cambia e lo toglie 120 ms dopo l'ultimo cambio; una regola in
`index.css` fa uscire dal layout il testo del corpo dei nodi (`data-node-body`). Dal **secondo**
cambio ravvicinato in poi, non dal primo: «Adatta», mod+0 o una tacca isolata costano un frame caro
e basta, e far sparire i corpi per 120 ms sarebbe un lampeggio senza contropartita.

### La trappola che è costata due misure

`display: none` sul `<g data-node-body>` **non serve a niente**: `getComputedStyle` dice «none», il
gruppo sparisce a schermo, e i `<text>` discendenti restano nel layout SVG di Chrome. Misurato,
sullo stesso zoom:

| regola | p95 | layout | glifi ancora in layout |
|---|---|---|---|
| nessuna | 33,4 ms | 1.662 ms | 62.890 |
| `[data-node-body] { display: none }` | 33,4 ms | 1.683 ms | 62.890 |
| `[data-node-body] text { display: none }` | **10,0 ms** | **162 ms** | 1.090 |
| `[data-node-body] text { visibility: hidden }` | 33,6 ms | 1.693 ms | 62.890 |
| `[data-node-body] text { font-size: 0 }` | 33,6 ms | 1.625 ms | 62.890 |

La regola deve colpire i `<text>`. `visibility` e `font-size: 0` non servono per la stessa ragione
di sempre: lasciano i glifi nel layout.

**Perché due misure.** La prima volta la regola era sul gruppo, il gate non si mosse, e sembrava che
la leva fosse sbagliata. La seconda diagnosi — un probe che confrontava le condizioni sullo *stesso*
zoom reale, contando i glifi ancora in layout invece di fidarsi di `getComputedStyle` — ha mostrato
che la leva era giusta e il selettore no. Il conteggio dei glifi è la misura che non mente:
`getComputedStyle` descrive l'elemento a cui si chiede, non il lavoro che il motore fa.

## Conseguenza per il §7 del documento precedente

Il rinvio del **culling del viewport** (Task 12) resta corretto per lo zoom, e la sua motivazione
regge intatta: alla scala minima tutto il diagramma è inquadrato e non c'è niente da tagliare. Ma
il culling è arrivato lo stesso, da un'altra porta e per un altro scenario: `previewDrag` ora è
culled, ed è ciò che ha sistemato `dragAll`. `visibleWorldRect` — la funzione lasciata in
`viewport.ts` senza chiamanti proprio come punto d'ingresso del culling — ha finalmente il suo.

## Cosa non è misurato

Valgono tutte le riserve del §6 del documento precedente: un solo display, una sola macchina, solo
Chrome, entità tutte espanse. In più, qui:

- **Nessuna misura del livello di dettaglio percepito.** Che 120 ms sia la soglia giusta fra «il
  gesto continua» e «il gesto è finito» è una scelta, provata a mano sulla rotella, non misurata su
  utenti o su dispositivi di puntamento diversi. Un trackpad con inerzia lunga potrebbe tenere i
  corpi via più a lungo di quanto sembri naturale.
- **Il culling del drag non ha un test automatico.** L'invariante «un nodo che entra
  nell'inquadratura viene scritto» è verificata in pagina (sopra), non in un test: l'hook delle
  interazioni non ha una rete di regressione, ed è un debito che questo lavoro non chiude.
