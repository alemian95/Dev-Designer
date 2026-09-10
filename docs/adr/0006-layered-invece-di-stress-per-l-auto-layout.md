# 0006. `layered` invece di `stress` per l'auto layout

Date: 2026-09-09

## Status

Accepted

## Context

La spec madre decide ELK come motore di layout («Auto layout | ELK.js in worker |
Problema difficile già risolto») ma non quale dei suoi algoritmi usare, che è la
scelta che determina l'aspetto di ogni diagramma dell'app — l'ER adesso, il class
diagram e il flowchart dopo.

ELK offre `layered` (Sugiyama, a livelli, con una direzione), `stress` e `force`
(organici, senza direzione), `mrtree` (alberi) e altri. La documentazione non
dice quale regga su uno schema di database, e la forma di quei grafi — pochi hub
molto connessi, cicli, densità intorno a una foreign key per tabella — non
somiglia né a un albero né a un grafo casuale.

I dump reali a disposizione non bastavano a distinguerli: 14 tabelle con 5
foreign key e 24 con 10 sono troppo sparsi, e su grafi così qualunque algoritmo
produce zero incroci. Il dump sintetico committato è peggio: è una catena
lineare, e `layered` lo dispone su un'unica riga di 106 000 px.

## Decision

Misurare invece di decidere a memoria. Uno spike usa e getta ha generato un DDL
di forma realistica (tre tabelle hub verso cui punta metà delle foreign key,
cicli, densità 1,3) a 30 e 200 tabelle, ha eseguito ogni algoritmo con le misure
dei nodi vere dell'app (`entitySize`) e ha misurato quattro cose: tempo, area
del risultato, incroci fra archi e **coppie di nodi sovrapposti**.

| Algoritmo | 30 tab.: ms | area | incroci | sovrapp. | 200 tab.: ms | area | incroci |
|---|---|---|---|---|---|---|---|
| **layered DOWN** | 40 | 9,9 Mpx | 15 | 0 | **157** | 112 Mpx | 1327 |
| layered RIGHT | 161 | 8,8 Mpx | 13 | 0 | 316 | 266 Mpx | 1282 |
| stress | 129 | 1,7 Mpx | 9 | **165** | 3466 | 5,3 Mpx | 718 |
| stress + sporeOverlap | 136 | 7,5 Mpx | 10 | 0 | **5522** | 76 Mpx | 1250 |
| force | 105 | 12,3 Mpx | 53 | 0 | 3273 | 658 Mpx | 3371 |
| mrtree | 21 | 9,1 Mpx | 64 | 0 | 106 | 65 Mpx | 4154 |

Si adotta **`layered` con `elk.direction: DOWN`**.

`force` e `mrtree` escono per la qualità: 3-4× gli incroci a parità di tutto il
resto.

`stress` esce per una ragione che le metriche di qualità non mostravano.
Sull'area e sugli incroci era il migliore di tutti, e sarebbe stato la scelta
ovvia guardando le prime tre colonne: **tratta i nodi come punti**, quindi le
scatole si sovrappongono — 165 coppie a 30 tabelle, 5218 a 200. Recuperarlo
richiede una seconda passata `org.eclipse.elk.sporeOverlap` che separa i nodi
già posizionati, e allora il costo sale a 5,5 s su 200 tabelle: trentacinque
volte il tempo di `layered` per un risultato equivalente sugli incroci.

`DOWN` invece di `RIGHT` perché a 200 tabelle dà metà dell'area (112 contro 266
Mpx) e metà del tempo (157 ms contro 316), a parità di incroci, e perché con gli
archi orientati padre→figlia mette le tabelle referenziate in alto: la
convenzione di SchemaSpy e dbdiagram.

Le opzioni di wrapping (`elk.layered.wrapping.strategy` `SINGLE_EDGE` e
`MULTI_EDGE` con `elk.aspectRatio`) sono state provate e **non hanno effetto**
su questi grafi: le posizioni dei nodi sono identiche a quelle senza wrapping,
verificato confrontando l'insieme delle coordinate. Non si usano.

## Consequences

Su uno schema grande il layout resta lungo — 20 692 × 5 404 px a 200 tabelle — e
si legge zoomando, non a schermo pieno. È accettato: l'alternativa misurata
costa 5,5 s e la compattezza si paga in incroci quasi identici.

La direzione ha un significato semantico, quindi l'adattatore
documento→grafo **deve invertire** gli archi rispetto al modello, dove `source`
è la figlia (lato della foreign key). Invertirli è la decisione, non un
dettaglio: senza inversione i padri finiscono in fondo e la convenzione si
ribalta.

`layered` è anche l'algoritmo che serviranno il flowchart e l'ereditarietà del
class diagram, quindi la scelta non va rifatta per ogni tipo di diagramma e
l'adattatore si scrive una volta.

Chi rimetterà in discussione questa decisione — perché arriva un tipo di
diagramma che `layered` dispone male — ha in questa tabella la baseline da
battere, e nella spec (§9) l'assertion che ha smascherato `stress`: **nessuna
coppia di nodi sovrapposta**. Un layout che impila le scatole passa qualunque
altro controllo di qualità.

Lo spike non è stato committato: era uno script che parsava il DDL con espressioni
regolari e disegnava SVG grezzi, utile a rispondere a una domanda e a nient'altro.
Questa tabella è ciò che ne resta, e il motivo per cui l'ADR esiste.
