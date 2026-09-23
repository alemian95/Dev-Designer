# 0007. La direzione di ELK è una proprietà del tipo di diagramma

Date: 2026-09-22

## Status

Accepted

Estende [0006](0006-layered-invece-di-stress-per-l-auto-layout.md), non lo
sostituisce: `layered` resta l'algoritmo, e `DOWN` resta la direzione dell'ER e
del class diagram per le ragioni misurate là.

## Context

Le opzioni passate a ELK sono oggi una costante di modulo in
`src/io/layout/elk.worker.ts`, e il commento sopra dice perché: «Le opzioni sono
una decisione del progetto (ADR 0006), non un parametro di chi chiama». Era
giusto finché i tipi di diagramma condividevano la stessa semantica di
direzione — nell'ER il padre sta sopra la figlia, nel class diagram la
superclasse sopra la sottoclasse. In entrambi il flusso scende.

Il flowchart con corsie non ha quella semantica. Le corsie sono bande
orizzontali, una per attore, e il flusso attraversa le bande da sinistra a
destra: è la forma che chi legge processi di business si aspetta, ed è
incompatibile con `DOWN`, che userebbe l'asse verticale per il flusso — lo
stesso asse su cui le corsie devono stare.

ADR 0006 aveva già previsto che qualcuno tornasse su quella riga: «Chi
rimetterà in discussione questa decisione — perché arriva un tipo di diagramma
che `layered` dispone male». Il caso è arrivato, ma non è quello: `layered` va
benissimo. È la direzione a non essere più una proprietà del progetto.

## Decision

`elk.direction` diventa un campo di `LayoutGraph`, prodotto dall'adattatore
documento→grafo di ciascun tipo e letto dal worker. Tutto il resto delle
opzioni — algoritmo e spaziature — resta una costante del progetto.

- ER e class diagram: `DOWN`, invariato, per l'area e il tempo misurati in 0006.
- Flowchart: `RIGHT`.

La misura di 0006 diceva che `RIGHT` costa il doppio in area e in tempo su uno
schema di database. Non è un'obiezione qui: quella misura è su 200 tabelle con
tre hub e densità 1,3, e un flowchart è un grafo lungo e stretto con pochi
nodi. La forma del grafo è diversa, quindi il costo misurato là non si
trasferisce — e se si trasferisse, non ci sarebbe comunque scelta: la direzione
del flusso è un requisito della notazione, non un'ottimizzazione.

## Consequences

La riga «le opzioni non sono un parametro di chi chiama» smette di valere per la
direzione e continua a valere per tutto il resto. È una distinzione sottile e
va tenuta: se domani anche le spaziature diventassero un parametro, il worker
tornerebbe a essere un passacarte e la decisione su come dispone questo
programma finirebbe sparsa nei tipi di diagramma, che è la cosa che 0006
voleva impedire.

Il flowchart è il primo tipo che dispone su un asse orizzontale. Il router
ortogonale degli archi e la geometria dei nodi non sono mai stati esercitati su
quell'asse: vanno riverificati, non riscritti, e i test di `edge-routing` vanno
estesi ai casi sinistra→destra invece che solo alto→basso.
