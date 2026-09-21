# Note ancorate — design

> Estende `2026-09-10-class-diagram-design.md` (documento madre) e
> `2026-09-11-class-diagram-ampiezza-design.md` (primo giro di ampiezza), di
> cui **riapre** due tagli dichiarati: §2 e §16 della madre, §2 e §4 del primo
> giro. Le sezioni si citano per numero e non se ne ripetono le decisioni.

## 1. Obiettivo

Una nota può dichiarare la classe che commenta. Oggi è testo appoggiato sul
canvas: il legame esiste solo nella testa di chi l'ha scritta, sparisce
dall'export, e «Disponi» può lasciarla sotto un nodo che nel frattempo si è
spostato.

È il debito che il primo giro di ampiezza aveva contratto a voce alta. Il suo
§4 chiude così il paragrafo sul layout:

> La scelta giusta sarebbe muovere la nota con ciò a cui è ancorata, e
> l'ancoraggio è la voce che §2 esclude: è il prezzo dichiarato di quel taglio.

Questa spec paga quel prezzo. Le due voci dell'Archivio del debito tecnico —
«una nota non si ancora a una classe» e «le note restano fuori dal layout» —
sono la stessa mancanza vista da due lati e si chiudono insieme.

## 2. Confini

**Una nota, una classe.** L'UML permette a una nota di collegarsi a più
elementi; Mermaid rappresenta `note for X` e basta. Si tiene il minimo dei due:
un secondo trascinamento sostituisce l'ancoraggio invece di aggiungerne uno.
Nessun avviso da scrivere, nessuna emissione da degradare.

**Non si ancora a una relazione.** In UML una nota può commentare un arco. Qui
l'estremo è sempre un nodo: `edgesTouching` e `rectOf` parlano di nodi, e un
estremo che è un arco cambierebbe la forma della geometria per un caso che
Mermaid non emette comunque.

**Nessun testo strutturato nella nota.** Resta testo libero. Il legame è
l'unica struttura che si aggiunge.

## 3. Il modello: una settima specie

`RelationKindSchema` guadagna `"note-link"`. L'ancoraggio è una voce di
`model.relations` con la chiave della nota in `source.class`, la classe in
`target.class`, `multiplicity` e `role` vuoti — la stessa forma che
`addRelation` produce già oggi per ogni arco nuovo.

**Perché un arco e non un campo sulla nota.** La forma alternativa —
`ClassNoteSchema { text, anchor?: string }` — è più onesta sul tipo: oggi
`ClassEndSchema` dichiara `class: Identifier`, e con `note-link` quel campo
porta la chiave di una nota. Si è misurato il costo delle due, ed è la forma
onesta a costare di più:

| | campo sulla nota | settima specie |
|---|---|---|
| canvas | seconda pipeline di archi | gratis |
| export SVG/PNG | seconda pipeline, e `buildSvg` perde la neutralità | gratis |
| selezione, cancellazione, undo, fascio | da rifare | gratis |
| layout ELK | da cablare a mano | gratis |
| costo | due pipeline parallele | cinque guardie |

Il fatto che decide è questo: `EdgesLayer` del canvas itera
`Object.keys(model.relations)` (`ui/canvas/kinds/class.tsx`) e `buildSvg`
disegna gli archi da `ops.edgesTouching()` incrociato con `edgeModels`, che per
il class diagram **è** `model.relations` (`ui/export/svg.tsx`). Un ancoraggio
fuori da quel record è invisibile a entrambi. Farlo comparire vorrebbe dire una
seconda via per gli archi nel canvas e un'altra dentro `buildSvg` — che per
progetto non sa che tipo di diagramma sta disegnando: la §3 della madre dichiara
`nodeModels`/`edgeModels` l'**unico** punto dove i nomi del modello contano, e
un terzo lo toglierebbe da lì.

Il §2 della madre aveva già nominato la ragione esatta senza trarne la
conseguenza: `note for Cliente` «sembra una riga tratteggiata e invece è un
arco». È un arco. Modellarlo come tale è ciò che rende il resto gratuito.

**Nessuna migrazione.** Aggiungere un valore a un enum zod non tocca i documenti
esistenti: nessuno di essi contiene `note-link`. `SCHEMA_VERSION` resta 2, e
`migrations.ts` non guadagna uno step. È lo stesso trattamento che ha avuto
`navigable` nel primo giro di ampiezza, per la stessa ragione — l'assenza
significa il comportamento di sempre.

## 4. Il gesto

Lo strumento relazione, dalla nota alla classe. Nessun concetto nuovo da
imparare: è il gesto delle altre sei relazioni.

`addEdge` in `editor/kinds/class.ts` oggi torna `null` quando un estremo è una
nota, e quel ramo diventa la chiamata a un `addNoteLink` nuovo in
`editor/class/commands.ts`. Tre regole:

1. **La direzione si normalizza.** Trascinato dalla classe alla nota, l'arco
   nasce comunque con la nota in `source`. Chi disegna non deve indovinare il
   verso di un legame che in UML non ne ha.
2. **Nota → nota resta `null`.** Nessun dispatch e nessuna selezione, come il
   ramo di oggi: non c'è niente di sensato da creare.
3. **Al più un ancoraggio per nota.** `addNoteLink` cancella l'eventuale
   `note-link` che ha già quella nota per sorgente, poi crea il nuovo. Un
   secondo trascinamento è una correzione, non un'aggiunta.

`commit-connect` (`ui/canvas/interaction-runner.ts`) resta com'è: riceve
`{ key, recipe }`, dispatcha e seleziona l'arco nuovo. Un ancoraggio è un arco
come gli altri e ha una chiave da selezionare.

## 5. Render: quello che arriva gratis

Due righe, e nessuna nel canvas:

- `isDashed` (`editor/class/geometry.ts`) include `note-link`, e il tratteggio
  esce — la notazione UML per il legame di una nota;
- `umlMarkerPath` guadagna un `return ""` per `note-link`, **esplicito**: la
  coda della funzione è `return openArrowPath(at, dir)`, cioè il ramo della
  dipendenza, e una specie che cadesse lì erediterebbe la sua freccia. Il legame
  di una nota non ha punta a nessuno dei due estremi.

Tutto il resto funziona perché `rectOf` risolve già sia le classi sia le note
(il primo giro di ampiezza gliel'ha insegnato per lo strumento nota):
`edgesTouching`, `edgeGeometry`, `classEdgeOffsets`, il layer del canvas, il
render statico e `buildSvg` non distinguono un ancoraggio da un'associazione.

## 6. Export Mermaid

Per una nota ancorata, `note "testo"` diventa `note for Cliente "testo"`. Per
una libera resta `note "testo"`.

L'ancoraggio si legge dalle relazioni, quindi in `emitClassMermaid`
(`io/emit/class-mermaid.ts`):

- il ciclo sulle relazioni filtra via `note-link` prima di chiamare
  `relationLine`, che resta la funzione che serializza le sei specie vere: un
  ancoraggio emesso anche lì sarebbe un arco duplicato nel file;
- il ciclo sulle note cerca il proprio `note-link` e, trovandolo, emette la
  forma `for`, col nome della classe passato per `safeName` come ogni altro
  riferimento a classe nel file.

Le cinque sostituzioni sul testo della nota (§4 del primo giro, misurate su
`mermaid@11`) non cambiano: riguardano il testo, non la testata della riga.

**La documentazione va corretta dove diceva il contrario.** §16 della madre
elenca le note fra il fuori scope e §2 del primo giro taglia l'ancoraggio: le
due voci vanno aggiornate con un rimando qui, non cancellate — la ragione per
cui erano state prese vale ancora, è cambiato solo il momento.

## 7. Layout

`classLayoutGraph` (`editor/class/commands.ts`) cammina anche `model.notes`:
ogni nota con una voce in `view.nodes` diventa un `LayoutNode` dimensionato con
`noteRect`, e l'arco `note-link` entra nel grafo come gli altri, con la stessa
inversione sorgente/target che la funzione applica già (ADR 0006, «padri in
alto»: la classe commentata sta sopra la sua nota).

**Anche le note libere entrano**, come nodi isolati. È una revisione cosciente
del §4 del primo giro, che le teneva fuori con questo argomento:

> una nota non ha archi, quindi finirebbe piazzata dove capita, lontana da ciò
> che annota. Tenendola fuori, «Disponi» muove le classi e lascia la nota
> dov'è — che è altrettanto sbagliato, ma almeno è prevedibile.

L'argomento era giusto quando **ogni** nota era libera: «dove capita» valeva per
tutte. Da qui in avanti la nota che commenta qualcosa è ancorata e atterra
accanto alla propria classe; quella libera è l'eccezione — una legenda, un
titolo — e per lei si sceglie di non sovrapporsi mai, invece di restare ferma
dov'era. «Disponi» sposta tutto: è ciò che il comando dichiara di fare.

## 8. Validazione e cancellazione

`dangling-relation` (`model/class/validate.ts`) cerca oggi entrambi gli estremi
in `model.classes`. Per un `note-link` la sorgente si cerca in `model.notes`: un
ancoraggio verso una classe che non c'è resta un errore da segnalare, un
ancoraggio la cui nota non c'è più anche.

`findGeneralizationCycles` filtra già per specie e salta `note-link` da sé.

Cancellare una **classe** ripulisce i suoi ancoraggi senza una riga nuova: il
ciclo di `deleteClassItems` cancella ogni relazione che tocca una chiave
cancellata. Cancellare una **nota** no, ed è una riga: il commento «le note non
hanno archi: nessuna relazione da ripulire di rimbalzo» smette di essere vero e
va tolto insieme al difetto che descriveva. È la classe di guasto di DT-5,
riferimenti pendenti lasciati nel modello.

Il pannello proprietà e il selettore di specie **non offrono** `note-link`: un
ancoraggio si crea col gesto e non si converte in un'associazione, né
un'associazione in ancoraggio. Selezionato, mostra che cos'è e nient'altro da
modificare — non ha nome, molteplicità né ruoli.

## 9. Test

- `addNoteLink`: crea con la nota in sorgente; normalizza la direzione trascinata
  al contrario; sostituisce l'ancoraggio che la nota aveva già; torna `null` su
  nota → nota.
- `deleteClassItems`: cancellata la nota, il suo ancoraggio non resta nel modello.
- `validateClass`: ancoraggio verso una classe inesistente → un `dangling-relation`;
  un ancoraggio sano non produce nessun issue.
- `emitClassMermaid`: la nota ancorata esce `note for X "…"`, la libera `note "…"`,
  e la specie `note-link` non compare fra le righe di relazione.
- `classLayoutGraph`: tutte le note sono nodi; l'ancorata porta il suo arco.
- `isDashed`/`umlMarkerPath`: tratteggiata, senza punta ai due estremi.
- e2e, nello scenario `class-note` che già crea una nota e la esporta: si ancora
  la nota alla classe con lo strumento relazione, si verifica che l'export
  contenga `note for`, e che «Disponi» non lasci la nota sovrapposta a un nodo.

## 10. Fuori scope

Nota ancorata a una relazione; una nota con più ancoraggi; ancoraggio nell'ER
(che non ha note); import di `note for` da Mermaid — è il task che viene dopo
questo, e avrà la sua spec.
