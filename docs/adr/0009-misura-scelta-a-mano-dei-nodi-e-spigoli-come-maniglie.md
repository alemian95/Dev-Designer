# 0009. Misura scelta a mano dei nodi e spigoli come maniglie

Date: 2026-10-19

## Status

Accepted

## Context

Fino alla versione 9 del formato solo le forme si ridimensionano, da una
maniglia nello spigolo in basso a destra; entità, classi, nodi di flusso e note
ricavano la misura dal contenuto e salvano solo la posizione. Gli spigoli di un
nodo sono anche punti di aggancio degli archi (spec agganci §3): sul canvas
l'utente trova pallini anche agli angoli, li trascina per ridimensionare e
ottiene un collegamento.

Il committente chiede quadratini di ridimensionamento agli angoli e pallini per
le relazioni sui lati, per tutti gli elementi. Fra le due proposte (tutti gli
elementi, oppure le sole forme senza toccare il formato) sceglie tutti gli
elementi.

Le sequenze si dispongono da sole a partire dall'ordine (spec sequence §3.1,
§4.1), e i pool hanno già le loro maniglie sul bordo destro e sulle corsie
(spec 2b §5). In un primo momento le sequenze erano escluse; provandole, il
committente ha chiesto di ridimensionare anche dentro la sequenza.

## Decision

Ogni nodo di entità, classe, flusso, nota, forma e sequenza ha una misura
scelta a mano, `w`/`h`, che è un minimo sopra quella del contenuto: la misura
mostrata è la più grande fra le due, lato per lato, e un nodo collassato tiene
l'altezza del contenuto. Nelle famiglie diverse dalle forme i due campi sono
facoltativi, e assenti o `null` valgono "segue il contenuto". Riportare la
maniglia fino al contenuto torna alla misura automatica. I pool restano fuori.

Dentro una sequenza la misura scelta vale per la colonna di un partecipante
(solo larghezza), la riga di un messaggio (solo altezza) e il foglio di una nota;
la posizione resta del layout, che sposta colonne e righe vicine. I blocchi
seguono il loro contenuto.

Il nodo selezionato da solo mostra quattro maniglie, una per spigolo, con lo
spigolo opposto fermo. Gli agganci offerti diventano i tre per lato; gli
spigoli restano agganci validi per gli archi già salvati, ma non si scelgono
più. La versione del formato sale da 9 a 10 senza cambiare forma ai dati.

## Consequences

- Un file v9 è già un v10 valido; un'app ferma alla 9 rifiuta un file v10
  dicendo che è più recente, come per la 4 → 5.
- Ogni lettura della misura di un nodo (disegno, editor sul posto, archi,
  «Disponi», corsie, export SVG) deve passare la view: una che legge solo il
  contenuto disegna il nodo più piccolo di quanto è.
- Un nodo di flusso allargato rientra nella sua corsia, ma corsia e pool non si
  allargano per contenerlo.
- L'export Mermaid perde la misura scelta: il formato non la prevede.
- Un arco già agganciato a uno spigolo resta lì, ma per riagganciarlo a uno
  spigolo non c'è più un punto da afferrare.
- Le maniglie agli spigoli hanno misura fissa sullo schermo, come gli agganci;
  quelle dei pool restano in unità di mondo.
- Dentro una sequenza la guida durante il gesto mostra il riquadro nuovo, ma
  colonne e righe vicine si spostano solo al rilascio.
- Introdotto in `2f43691` (forme), `b27a181` (formato), `262f10d` (famiglie),
  `bae1d8d` (livello delle maniglie) e, per le sequenze, da `6644a5f` a
  `ee29b56`.
