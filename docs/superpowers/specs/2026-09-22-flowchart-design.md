# Flowchart con corsie — design

Data: 2026-09-22
Spec di riferimento: `docs/superpowers/specs/2026-09-06-dev-designer-design.md`
(§2, punto 3 dell'ordine di consegna; i punti 1 e 2 sono chiusi)
Sottosistema: un terzo tipo di diagramma, la prima corsia del progetto, e
l'allargamento della giuntura che il terzo tipo rende necessario.

## 1. Obiettivo

Un terzo tipo di documento: flowchart con **corsie**, cinque forme di nodo, archi
etichettati, validazione live ed export in Mermaid `flowchart LR`.

Due usi lo guidano, dichiarati in fase di brainstorming:

1. **Ragionare su logica e branching** prima di scrivere il codice — contano la
   decisione con rami etichettati e la leggibilità del percorso.
2. **Documentare processi di business** con gli attori — contano le corsie e le
   forme complete.

Il primo uso da solo non avrebbe giustificato le corsie. Il secondo le rende il
cuore della feature, e infatti sono dentro fin dalla prima consegna: aggiungerle
dopo avrebbe voluto dire rifare layout e geometria.

Come per il class diagram, il valore non è il disegno: è che il flowchart
eredita senza riscriverlo tutto ciò che i punti 1 e 2 hanno costruito e
misurato — undo a patch, autosave, apri e salva su file, viewport, routing
ortogonale, auto layout con ELK, export SVG e PNG, pannello dei problemi.

## 2. Confini: cosa il flowchart non è

**Non è BPMN.** Niente pool annidati dentro altri pool, gateway tipizzati,
eventi di bordo, messaggi fra pool. Le corsie qui sono bande con un nome, e i
nodi ci stanno dentro.

**Non è un motore di processi.** Non si esegue, non si simula, non genera
codice. Un flowchart è un disegno con delle regole, e le regole servono a
trovare gli errori di chi disegna, non a far girare niente.

**Non importa da nulla.** Nessun import da Mermaid, da BPMN, da codice sorgente.
L'import DDL resta una funzione del solo ER.

**Non ha corsie ridimensionabili a mano** né riordinabili per trascinamento
nella prima consegna: due frecce nell'intestazione bastano finché non danno
fastidio.

## 3. La giuntura allargata

Il terzo tipo mette alla prova la giuntura costruita per il secondo. Il risultato
è che regge, ma va allargata in un punto — e l'allargamento è più piccolo di
quanto sembrasse prima di guardare il modello.

**Il problema apparente.** `DiagramView.tools` è `{ node, edge, note? }` e
`DiagramOps` ha `addNode(at)` più `addNote?(at)`: due specie di nodo più una
nota opzionale, senza parametro di specie. Il flowchart ne ha sei.

**Perché è più piccolo di così.** Le sei specie del flowchart non sono sei
specie: sono **un tipo di nodo con un campo `shape`**, esattamente come il class
diagram ha risolto quattro stereotipi con un campo `stereotype` su un nodo solo.
Se la forma è un campo, gli strumenti in toolbar non sono comandi diversi: sono
**varianti dello stesso comando**.

**Il cambiamento.**

- `DiagramView.tools` passa da un oggetto a forma fissa a una **lista** di
  `ToolDef`, ciascuna con la propria variante. L'ER ne dichiara 2, il class
  diagram 3, il flowchart 7 (cinque forme, la nota, l'arco).
- `DiagramOps.addNode(at)` diventa `addNode(at, variant?)`. La variante è una
  stringa opaca: la giuntura non sa cosa significhi, la interpreta solo il
  modulo `kinds/` del tipo che l'ha dichiarata.
- `DiagramOps.addNote?()` **sparisce**. La nota del class diagram diventa
  `addNode(at, "note")`.
- Lo stato della sessione tiene, accanto allo strumento corrente, la variante
  corrente.

La sparizione di `addNote?` è l'unico punto in cui questa feature mette le mani
in un tipo esistente, e non è un rattoppo: è la generalizzazione che il terzo
tipo ha reso vera invece che ipotetica. Un metodo opzionale in meno nel
contratto e un caso speciale in meno nel canvas.

**Come si trovano i punti da toccare.** I quattro `switch` esaustivi sul tipo di
diagramma — `editor/kinds/ops.ts`, `ui/canvas/kinds/registry.ts`,
`io/document-io.ts`, `ui/export/actions.ts` — fanno fallire `tsc -b` su ogni
punto che manca. Non c'è niente da cercare a mano, e non c'è modo di
dimenticarne uno.

**Nessuna migrazione.** `SCHEMA_VERSION` resta 2. La union dei tipi di diagramma
si allarga e ogni documento già scritto continua a validare: un formato nuovo
non è un formato cambiato.

## 4. Il modello

```
FlowShape  = "terminal" | "process" | "decision" | "io" | "subprocess" | "note"

Lane       = { id, name }
FlowNode   = { label, shape, lane }          // lane = id di una Lane
FlowEdge   = { source, target, label? }      // source/target = id di FlowNode

FlowchartModel = {
  lanes: Lane[]                              // array: l'ordine è un dato
  nodes: Record<id, FlowNode>
  edges: Record<id, FlowEdge>
}
FlowchartView  = {
  nodes: Record<id, NodeView>                // x, y, collapsed — condiviso
  lanes: Record<id, { y, h }>                // le bande
}
```

**Le chiavi sono id generati, non nomi.** La spec madre lo prescrive per
flowchart e sequence, e cambia due cose in meglio rispetto all'ER e al class
diagram: due nodi «Verifica credenziali» possono coesistere, e non serve nessuna
regola di validazione sui nomi in conflitto.

**Le corsie sono un array e non un `Record`.** Altrove la chiave è un nome
naturale e l'ordine non significa niente; qui l'ordine delle corsie è
l'informazione, e l'array è il posto dove vive senza poter divergere da
nient'altro. I nodi puntano alla corsia per `id` e non per indice, così
cancellarne una non rinumera le altre.

**La nota è una forma come le altre**, non una specie a parte. La nota del class
diagram è una specie perché si àncora a una classe; la nota di un flowchart è un
riquadro con del testo, e non serve altro.

**Ogni nodo appartiene a una corsia, sempre.** È un invariante del modello: il
documento nasce con una corsia, cancellare l'ultima è vietato, cancellare una
corsia con dentro dei nodi chiede dove spostarli. Non esiste `lane` nullo,
quindi non esiste una regola di validazione che lo cerchi. Un invariante che
regge vale più di una regola che avvisa.

## 5. Corsie e layout

L'auto layout è il punto in cui corsie ed ELK devono convivere, ed è il bivio
architetturale di tutta la feature. La scelta è **A: ELK dà il flusso, la corsia
dà la trasversale**.

**Il passo.** ELK gira con `layered` e `direction: RIGHT` (ADR 0007) sul grafo
intero, **ignorando le corsie**, e torna `LayoutPositions`. Poi una funzione pura
le corregge:

- **x** — l'asse del flusso: si tiene quella di ELK, intatta.
- **y** — la banda della corsia del nodo. Dentro la banda, i nodi che ELK aveva
  messo alla stessa colonna si impilano **nell'ordine della y che ELK gli aveva
  dato**.

Quel secondo punto è il cuore del disegno: la y di ELK non si butta, si
**degrada da coordinata a ordinamento**. Il lavoro che ELK ha fatto per ridurre
gli incroci sopravvive dove può ancora servire, cioè dentro la corsia.

**Perché non la gerarchia di ELK.** Dare le corsie a ELK come nodi composti
(`hierarchyHandling: INCLUDE_CHILDREN`) lo lascerebbe ottimizzare davvero, ma i
contenitori si dimensionano sul contenuto: uscirebbero riquadri di altezze
diverse, non bande; l'ordine delle corsie andrebbe forzato con vincoli; il grafo
di richiesta guadagnerebbe un livello; e la gerarchia su `layered` è il pezzo di
ELK che questo progetto non ha mai toccato. Sarebbe stato uno spike prima di un
design, non un design.

L'approccio scelto riusa invece la divisione che il progetto ha già fatto una
volta, quando ha deciso che **le rotte degli archi non vengono da ELK**: al
worker si chiede la posizione, non il disegno. Qui la regola si estende di un
passo — al worker si chiede **un asse solo**.

**Il costo, dichiarato.** Scartando la y di ELK si perde la sua riduzione degli
incroci sull'asse trasversale: due archi che ELK avrebbe separato possono
incrociarsi. È un costo inerente alle corsie e non all'approccio — un nodo deve
stare nella corsia del suo attore anche quando ciò genera un incrocio.

**Dove sta il codice.** `DiagramOps` guadagna un metodo opzionale
`adjustLayout?(positions): LayoutPositions`, identità quando manca — stesso
stampo che aveva `addNote?`. ER e class non lo implementano. Il flowchart sì, ed
è una **funzione pura** da posizioni più modello a posizioni: si prova senza
worker, senza DOM e senza ELK. `autoLayout()` in `ui/layout-actions.ts` non
cambia forma, guadagna un passaggio fra la risposta del worker e `applyLayout`.

**Le bande stanno nella view**, non derivate dalle posizioni dei nodi. Derivarle
sembrava più elegante, ma una corsia vuota non avrebbe né altezza né bersaglio
su cui lasciar cadere un nodo, e ogni trascinamento libero le farebbe respirare
sotto il cursore. Posizionate sono prevedibili: «Disponi» le ricalcola, creare
una corsia ne aggiunge una di altezza standard, e l'altezza di ciascuna è il
massimo fra il contenuto impilato e un minimo.

**Le bande non sono nodi.** Non si selezionano col marquee, non si duplicano,
non entrano nel grafo di layout. Sono un layer di sfondo del canvas: un
rettangolo e un'etichetta per corsia, disegnati sotto tutto, che non si
ridisegnano durante il trascinamento di un nodo.

## 6. Il drag fra corsie

È il punto in cui questa feature tocca il codice più caldo del progetto — il
gesto che scrive direttamente sul DOM fuori da React, e che il gate di
prestazione misura. Lo tocca il meno possibile.

Oggi il drag scrive **solo coordinate**, per ogni tipo di diagramma. Cambiare
corsia è scrivere un **dato**, e sarebbe il primo gesto a farlo. La soluzione è
non farlo durante il gesto:

- **durante** il trascinamento non cambia niente nel modello: il nodo si sposta
  sul DOM esattamente come oggi. Il gate non ha ragione di muoversi.
- **al rilascio**, dove già oggi la posizione si commette nello store con una
  dispatch, si guarda in quale banda è caduto il centro del nodo. Se è un'altra,
  il comando scrive **posizione e corsia insieme**: un solo passo di undo.
- se il centro cade fuori da ogni banda — sopra la prima o sotto l'ultima — il
  nodo resta nella corsia di partenza e rientra dentro la sua banda.

Il gesto non cambia: cambia solo cosa si scrive quando finisce.

## 7. Geometria e forme

Le cinque forme più la nota, dimensionate **dal testo**, che è su più righe.
Questo è esattamente il comportamento della nota del class diagram: geometria ed
editor inline si riusano invece di riscriverli. Un flowchart è fatto di etichette
brevi su due o tre righe, non di membri tipizzati — la macchina giusta esiste
già.

| forma | resa |
|---|---|
| `terminal` | rettangolo a estremi arrotondati (stadio) |
| `process` | rettangolo |
| `decision` | rombo |
| `io` | parallelogramma |
| `subprocess` | rettangolo con doppia barra verticale sui due lati |
| `note` | riquadro con angolo ripiegato, tratto sottile |

**Il rombo è grande.** Una decisione che contiene lo stesso testo di un processo
occupa circa il doppio, perché il rombo deve contenere il rettangolo del testo.
È la ragione per cui nei flowchart le decisioni si scrivono corte, e va scritto
qui invece di scoprirlo disegnando.

L'altezza standard di una banda contiene qualunque forma con un'etichetta di
due righe, rombo compreso: una corsia appena creata non nasce già troppo stretta
per il primo nodo che ci si mette dentro.

## 8. Gli archi e le etichette

**Il router non cambia.** Aggancia ai lati del rettangolo di ingombro, e per il
rombo il risultato è fortunato: il punto medio di ogni lato del rettangolo **è**
la punta del rombo, quindi l'aggancio cade dove deve senza codice in più. Il
parallelogramma aggancia leggermente fuori dai suoi lati obliqui, e si accetta.

Va invece **riverificato su un asse che nessun tipo usa oggi**: con flusso a
destra gli archi escono a destra ed entrano a sinistra. I test di
`edge-routing` vanno estesi ai casi sinistra→destra. Riverifica, non
riscrittura.

**Le etichette.** Si scrivono col doppio click sull'arco, stesso editor inline
dei membri e delle note. Si collocano sul primo segmento del percorso
ortogonale, spostate dello **stesso `offset` di fascio** che `edgeOffsets`
calcola già per gli archi.

Quell'ultimo dettaglio chiude una voce d'Archivio aperta dal class diagram — «le
etichette di archi diversi possono accavallarsi quando più archi convergono
sullo stesso lato» — nel caso che conta: con flusso a destra gli archi entranti
arrivano tutti dal lato sinistro e il fascio li separa già, quindi l'etichetta
**eredita gratis la separazione che il fascio ha calcolato**. Resta scoperto
solo il caso di archi non in fascio che passano vicini per caso, e quello si
guarda a feature viva.

**I rami di una decisione nascono vuoti**, non precompilati con «sì» e «no»:
precompilare vorrebbe dire scegliere una lingua per chi disegna. È la
validazione a segnalare i rami non etichettati.

**Limite noto accettato: gli archi all'indietro passano sopra i nodi.** Il router
è ortogonale ma non evita gli ostacoli. In ER e class le contro-frecce sono rare
e non si è mai visto; in un flowchart il ciclo è il caso normale, quindi si
vedrà. Non si risolve in questa consegna — l'anti-ostacolo è un router nuovo,
non una correzione — e va scritto nei limiti noti del README più un commento
`ponytail:` nel router che nomina il soffitto e la strada per alzarlo.

## 9. Validazione

Sei regole, tarate su ciò che in un flowchart si sbaglia davvero:

| codice | severità | cosa coglie |
|---|---|---|
| `flow-dangling-edge` | errore | arco con un estremo che non esiste |
| `flow-decision-arity` | errore | decisione con meno di due uscite: con una sola non è una decisione, è un processo |
| `flow-dead-end` | avviso | nodo non terminale senza uscite — il flusso finisce nel nulla |
| `flow-unreachable` | avviso | nodo non raggiungibile da nessun ingresso: il frammento staccato che nessuno vede |
| `flow-branch-unlabeled` | avviso | ramo in uscita da una decisione senza etichetta |
| `flow-no-terminal` | avviso | nessun nodo `terminal` in tutto il diagramma |

`flow-unreachable` parte dai nodi `terminal` **senza archi entranti**: sono gli
ingressi. Un diagramma senza ingressi produce `flow-no-terminal` e non
`flow-unreachable` su ogni nodo — la regola tace quando la sua premessa manca,
invece di gridare su tutto.

Nessuna regola per «nodo senza corsia»: è un invariante del modello (§4).

Il costo è una visita del grafo, O(n+e), sullo stesso percorso su cui girano già
`validateEr` e `validateClass`.

## 10. Export

### Immagini

Arrivano gratis dal canvas condiviso tranne un punto: **le bande vanno disegnate
anche in `buildSvg`**, che gira dentro `renderToStaticMarkup` e uno store non ce
l'ha. `buildSvg` riceve però il `Diagram` intero, quindi le bande le ha già in
`view.lanes`: va aggiunto il disegno, non il passaggio dei dati. È l'unico punto
dell'export immagini che questa feature tocca.

### Mermaid

`flowchart LR`, una `subgraph` per corsia, e un avviso che dice che in Mermaid le
corsie saranno riquadri e non bande.

| forma | Mermaid |
|---|---|
| `process` | `n1["testo"]` |
| `decision` | `n2{"testo"}` |
| `terminal` | `n3(["testo"])` |
| `io` | `n4[/"testo"/]` |
| `subprocess` | `n5[["testo"]]` |
| `note` | **omessa**, con avviso |

Gli archi etichettati sono nativi: `n1 -->|"sì"| n2`.

**La nota si omette** invece di uscire come riquadro: in Mermaid entrerebbe nel
flusso come un nodo qualunque e ne sposterebbe il layout, cioè mentirebbe.
Meglio dire che è rimasta fuori.

Tre dettagli che il class diagram ha già pagato una volta e qui si pagano
subito:

- il testo va **sempre fra virgolette** — `[`, `]`, `{` e `}` dentro
  un'etichetta rompono il parser di Mermaid;
- gli a capo diventano `<br/>`;
- gli **id si rigenerano in emissione** come `n1..nN` nell'ordine di uscita: il
  modello usa id generati, e un uuid dentro un Mermaid lo rende illeggibile a
  chi lo apre in una PR.

## 11. UI e scorciatoie

Sette strumenti sono troppi per le lettere ancora libere:

| tasto | strumento |
|---|---|
| `V` | selezione (invariato, comune a tutti i tipi) |
| `1`..`6` | terminale, processo, decisione, input/output, sottoprocesso, nota |
| `R` | arco |

Le lettere restano ai tipi che hanno pochi strumenti, i numeri vanno a quello che
ne ha molti.

Il pannello proprietà di un nodo mostra etichetta, forma e corsia — la forma è
modificabile anche dopo, ed è il modo per correggere un processo che doveva
essere una decisione senza ridisegnarlo.

Le corsie si gestiscono da un pannello loro: aggiungi, rinomina, elimina, e due
frecce per l'ordine. «Nuovo ▸ Flowchart» crea un documento con una corsia sola,
già nominata.

## 12. Test

**Unitari** — modello, validazione ed emettitore Mermaid, come per gli altri due
tipi. E soprattutto **`adjustLayout`**: è la funzione nuova più delicata e non ha
bisogno né di worker né di DOM, quindi il posto dove un bug si manifesta come «i
nodi sono nella corsia sbagliata» è interamente provabile a tavolino. Casi che
deve coprire: corsia vuota, tutti i nodi in una sola corsia, due nodi che ELK
mette nella stessa colonna e nella stessa corsia, nodo la cui corsia non esiste
(non deve accadere per l'invariante §4: il test verifica che la funzione non
esploda comunque).

`edge-routing` va esteso ai casi sinistra→destra (§8).

**Un ottavo scenario e2e**, per le tre cose che senza un browser vero non
esistono: le corsie con **ELK davvero caricato** — il worker finto passerebbe
anche con un bundle che non si risolve, ed è esattamente perché esiste lo
scenario `layout` — il drag fra corsie con eventi veri, e il `subgraph`
nell'export.

Lo scenario: «Nuovo ▸ Flowchart», due corsie, tre nodi di forme diverse, un arco
etichettato; «Disponi» e verifica che ogni nodo stia dentro la banda della sua
corsia e che nessuna coppia si sovrapponga; trascina un nodo nell'altra corsia e
verifica che ci resti; **un solo ⌘Z** e verifica che torni nella corsia di prima
*e* dov'era — è la prova che posizione e corsia sono un passo unico; export
testo e verifica che compaiano `subgraph`, un rombo e l'etichetta sull'arco.

## 13. Prestazioni

Il gate va rimisurato contro la **baseline del 2026-09-22: p95 peggiore 9,3 ms a
N=300**, sei scenari su sei PASS. È la prima volta che il progetto ha un
confronto vero invece di un numero assoluto.

Due punti da sorvegliare, entrambi nuovi:

- il **layer delle bande** è disegno in più sotto ogni frame. Non si ridisegna
  durante il trascinamento di un nodo, quindi non dovrebbe entrare nel gesto: il
  gate lo dirà.
- il passo delle corsie è O(n) sulle posizioni e gira **solo a «Disponi»**, fuori
  da ogni gesto.

Il generatore di documenti sintetici (`src/perf/stress.ts`) va esteso a produrre
un flowchart, altrimenti il gate misura il flowchart con un ER.

## 14. Domande chiuse durante il brainstorming

- Uso primario → **ragionare su branching** e **processi di business** insieme;
  documentare in una PR non è il movente.
- Corsie nella prima consegna → **sì**, con il costo dichiarato: modello con un
  livello in più e layout non più «ELK e basta».
- Orientamento → **flusso a destra, corsie a righe**, la forma classica del BPMN.
  ELK gira su `RIGHT` per questo tipo solo (ADR 0007).
- Corsie a ELK come gerarchia → **no**, §5.
- Come si mette una forma → **uno strumento per forma** in toolbar, non un campo
  nel pannello: è il più «strumento specifico» dei tre modi, ed è quello che
  costringe ad allargare la giuntura (§3).
- Export Mermaid delle corsie → **`subgraph` più avviso**, non perdita
  silenziosa e non rinuncia all'export testo.
- Etichette degli archi → editor inline al doppio click, come membri e note.
- Rami precompilati «sì»/«no» → **no**, §8.

## 15. Fuori scope

Pool annidati, gateway tipizzati, eventi di bordo, messaggi fra pool. Esecuzione
o simulazione del flusso. Generazione di codice. Import da Mermaid, da BPMN o da
codice sorgente. Corsie ridimensionabili a mano o riordinabili per
trascinamento. Documento multi-diagramma.

## 16. Limiti noti che questa consegna accetta

- **Gli archi all'indietro passano sopra i nodi** (§8): il router non evita gli
  ostacoli, e in un flowchart i cicli sono normali.
- **Gli incroci sull'asse trasversale aumentano** rispetto a un layout senza
  corsie (§5): è il prezzo delle corsie, non dell'approccio.
- **Le corsie in Mermaid sono riquadri, non bande** (§10), con avviso.
- **Le note non escono in Mermaid** (§10), con avviso.
- **Il rombo è grande** a parità di testo (§7).

Ognuno va nel README sotto «Limiti noti» con la sua ragione, e in
`docs/debito-tecnico.md` se e quando qualcuno decide di non chiuderlo.
