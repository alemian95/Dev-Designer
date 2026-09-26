# Le forme generiche — design (step 3b)

Data: 2026-09-26
Branch: `feat/forme-generiche`, da `master` (`fa288b2`)
Spec di riferimento: `2026-09-24-canvas-unificato-design.md` (§1: la roadmap, lo step 3; §5: l'ordine
delle famiglie è l'ordine dei layer), `2026-09-26-nota-unica-design.md` (§2: una nota si ancora agli
elementi generici senza lavoro in più), `2026-09-25-pool-corsie-design.md` (§5: il ridimensionamento
da una maniglia), `2026-09-24-collegamenti-tipizzati-design.md` (§4: Collega fra famiglie diverse)
Sottosistema: una lavagna libera accanto alle famiglie tipizzate. Rettangoli, ellissi, testi e
frecce che non hanno semantica, validazione di dominio né export testuale.

## 1. Obiettivo

Le famiglie del canvas hanno tutte un significato: entità, classi, passi di un processo, note.
Manca un modo per disegnare quello che nessuna famiglia copre, per esempio uno schema di
architettura fatto di scatole e frecce, o un titolo scritto sopra un gruppo di elementi. La 3b
aggiunge una quinta famiglia, `shape`, con tre forme e una freccia:

- **Rettangolo** ed **ellisse**: nodi con un'etichetta, un bordo e un fondo.
- **Testo**: un nodo con la sola etichetta, senza bordo e senza fondo.
- **Freccia**: un arco fra due forme, con punta e tratteggio a scelta.

Sono elementi **liberi**: niente validazione di dominio, niente corsie, niente regole su chi si
collega a chi dentro la famiglia, niente Mermaid. Non sono una copia del flowchart: un rettangolo non
è un passo di un processo, e il flowchart non ha né ellissi né testo libero.

**La 3b è finita quando** dalla sidebar si disegna uno schema libero di scatole, ellissi, testi e
frecce accanto alle famiglie tipizzate, senza che validazione ed export testuale di quelle famiglie
cambino, e un file v7 si riapre identico.

La roadmap del canvas unificato, aggiornata:

| Step | Contenuto | Stato |
|---|---|---|
| 1, 2a, 2b, 3a, 4a, 4b | sidebar, canvas unificato, pool, nota unica, collegamenti tipizzati | fatti |
| **3b** | **Forme generiche: rettangolo, ellisse, testo, freccia** | **questa spec** |

## 2. Confini

- **Le frecce collegano solo forme.** Gli archi stanno dentro la famiglia, come in tutte le altre.
  Collega fra una forma e un elemento di un'altra famiglia viene rifiutato: i collegamenti fra
  famiglie restano soltanto tipizzati (4a). Una freccia verso un'entità o una classe, se servirà,
  si aggiungerà come tipo di collegamento in più, senza rifare niente.
- **Niente colori.** Forme e frecce seguono il tema chiaro o scuro, come il resto del canvas. Una
  tavolozza si può aggiungere dopo senza toccare il modello delle frecce.
- **Niente etichetta sulle frecce.** Per scrivere accanto a una freccia c'è la forma Testo.
- **Niente Mermaid.** Le forme escono solo in SVG e PNG. Mermaid serve a portare un diagramma con
  significato in un README; una lavagna si porta come immagine.
- **Una zona non è un contenitore.** Un rettangolo grande disegnato attorno ad altri elementi non li
  porta con sé quando si sposta, e Disponi non lo conosce (§10). Il contenitore vero resta il pool.

## 3. Il modello

### La famiglia `shape`

`FAMILIES` diventa `["shape", "er", "class", "flow", "note"]`. Le forme stanno **sotto tutto**:
sotto i nodi delle altre famiglie, ma anche sotto i pool e sotto **tutti gli archi**, perché un
rettangolo usato come zona non deve coprire né le entità o i nodi che racchiude né le relazioni e gli
archi fra loro. Il canvas disegna quindi, dal basso: le forme, i pool, gli archi di tutte le famiglie
(le frecce delle forme comprese), i collegamenti, i nodi delle altre famiglie nell'ordine di
`FAMILIES`, le note. La vista della famiglia lo dichiara (`DiagramView.backdrop`), e l'export SVG
segue lo stesso ordine. Le frecce stanno quindi sopra le forme che collegano: finiscono sul bordo, e
una freccia che attraversa una zona resta visibile. Lo stesso ordine di `FAMILIES` decide il gruppo
della sidebar (`ToolSidebar`, `canvasTools(FAMILIES)`): «Forme» è il primo gruppo.

Il documento guadagna `diagram.shape`:

```ts
diagram.shape = {
  model: {
    shapes: Record<string, Shape>,
    arrows: Record<string, Arrow>,
  },
  view: { nodes: Record<string, ShapeView> },
}
```

Le chiavi di forme e frecce sono uuid. Sul canvas diventano `shape/<uuid>`, con `qualify`.

### Forma

```ts
Shape = { kind: "rect" | "ellipse" | "text", label: string }
```

- `label` può andare su più righe, come l'etichetta di un nodo di flusso.
- `kind` non cambia dopo la creazione. Un'ellisse al posto di un rettangolo è un'altra forma.

### View di una forma

```ts
ShapeView = NodeView & { w: number | null, h: number | null }
```

`NodeView` è la `NodeViewSchema` comune (`{ x, y, collapsed }`); `collapsed` a una forma non si
applica e resta `false`. `w` e `h` sono la **misura minima scelta a mano**, `null` finché la forma
non viene allargata. La misura vera di una forma è, per ciascun lato, la più grande fra quella del
testo e quella scelta. Una forma appena creata ha quindi già la misura giusta, e una forma allargata
resta allargata. Chi legge soltanto `x`/`y` (spostamento, Disponi, export) non vede differenze.

### Freccia

```ts
Arrow = { source: string, target: string, head: "none" | "end" | "both", dashed: boolean }
```

- `source` e `target` sono chiavi di forme **senza** prefisso: gli archi stanno dentro la famiglia.
- Una freccia nasce con `head: "end"` e `dashed: false`.
- Lo schema rifiuta `source === target`: una freccia da una forma verso sé stessa non ha un disegno
  sensato, e il gesto non la crea.
- Più frecce fra le stesse due forme sono ammesse, e sul canvas si affiancano come gli altri archi.

## 4. Versione 8 e migrazione

`SCHEMA_VERSION` passa da 7 a 8. La migrazione 7 → 8 aggiunge `diagram.shape` vuota:
`{ model: { shapes: {}, arrows: {} }, view: { nodes: {} } }`. Non c'è niente da travasare.

## 5. Gesti

### Gli strumenti

Nella sidebar, gruppo **«Forme»**:

| Strumento | Tasto | Crea |
|---|---|---|
| Rettangolo | `q` | una forma `rect` |
| Ellisse | `o` | una forma `ellipse` |
| Testo | `t` | una forma `text` |

Sono le lettere libere più vicine al nome: `e`, `c`, `i`, `u`, `n`, `p`, `r`, `v`, `f`, `l` e le cifre
sono già prese. Il clic sul canvas crea la forma con l'etichetta vuota e apre subito l'editor
dell'etichetta, come per i nodi di flusso (`edit: "body"`). Il doppio clic su una forma lo riapre.

### Il disegno

- **Rettangolo ed ellisse** hanno bordo e fondo nei colori del tema, come i nodi di flusso.
  L'etichetta sta al centro.
- **Testo** non ha né bordo né fondo. Un testo con l'etichetta vuota mostra sul canvas la parola
  «Testo» in grigio, per non restare invisibile e irraggiungibile. L'export lo salta (§8).
- **L'ordine dentro la famiglia** va dalla forma più grande alla più piccola, per area: una zona
  creata dopo non copre mai una forma più piccola che le sta sopra. Il clic segue il disegno: su una
  forma dentro una zona prende la forma, sul fondo libero della zona prende la zona.

### Il ridimensionamento

Una forma selezionata **da sola** mostra una maniglia nell'angolo in basso a destra. Il gesto è
quello dei pool (spec 2b §5, `DiagramOps.resize`): durante il trascinamento una guida mostra il
rettangolo nuovo, al rilascio un solo passo di annulla scrive `w` e `h`, allineati alla griglia. La
forma non scende mai sotto la misura del testo: trascinare la maniglia verso l'interno oltre quella
misura la lascia alla misura del testo.

### Le frecce

- **Collega** (`r`) da una forma a un'altra crea una freccia da quella di partenza a quella d'arrivo.
- Collega da una forma verso sé stessa non crea niente.
- Collega fra una forma e un elemento di un'altra famiglia viene **rifiutato** con l'avviso di
  sempre (`connectAcross`): «Non esiste un collegamento fra una forma e un'entità.» e simili. La
  forma si nomina «una forma».
- Collega da una **nota** verso una forma la ancora, come verso qualunque elemento (spec 3a §5).
- Il percorso è ortogonale, come per gli altri archi (`routeEdge`). La punta segue `head`, la linea
  segue `dashed`.

### Eliminazione, duplicazione, spostamento

Vengono dall'impianto a famiglie e funzionano come per gli altri nodi:

- Eliminare una forma elimina le frecce che la toccano e stacca le note ancorate, in un solo passo di
  annulla. Eliminare una freccia la toglie e basta.
- Duplicare più forme copia anche le frecce che le collegano fra loro. Una freccia verso una forma
  non duplicata non si copia.
- Selezionare col riquadro, spostare, annullare: come gli altri nodi. Una zona trascinata non porta
  con sé le forme che contiene.

## 6. Disponi

Le forme formano un blocco loro in `layoutAll`, come le altre famiglie. Il motore di layout le
dispone usando le frecce come archi e rispetta la misura vera di ogni forma, allargata compresa.
Il blocco delle forme è il primo, perché `FAMILIES` comincia da `shape`. Una nota ancorata a una
forma la segue con le regole della 3a (`followAnchors`, e l'ingombro del blocco che include le note
ancorate).

## 7. Pannello

- **Forma:** il campo «Testo», con la stessa sola lettura durante l'editing sul canvas degli altri
  campi di testo.
- **Freccia:**
  - «Punte», un select con Nessuna, Alla fine, Entrambe (`none`, `end`, `both`);
  - «Tratteggiata», una casella;
  - il pulsante «Inverti», che scambia `source` e `target`. Senza, per girare una freccia con la punta
    alla fine bisognerebbe cancellarla e rifarla.

Ogni modifica è un passo di annulla.

## 8. Export

- **SVG e PNG** includono forme e frecce, con punte e tratteggio, nello stesso ordine del canvas. Un
  testo con l'etichetta vuota non esce.
- **Export testuale.** Nessun formato. Il dialogo dice in una riga che le forme escono solo come
  immagine, nello stesso posto dei limiti degli altri modelli. Se il documento contiene **solo**
  forme (e magari note), il messaggio lo dice, e non dice «Il documento è vuoto».
- **Note ancorate a una forma.** Non escono nel Mermaid delle classi, come le note ancorate a entità
  e nodi di flusso (spec 3a §8).

## 9. Validazione

Un problema solo: `shape-dangling-arrow`, «La freccia collega una forma che non c'è.». Nasce solo da
un file scritto a mano: l'app elimina le frecce insieme alle forme. Una freccia pendente non si
disegna, come un collegamento pendente.

## 10. Limiti che la 3b accetta

- **Disponi e le zone.** Un rettangolo disegnato attorno a entità o nodi di flusso finisce nel
  blocco delle forme, e gli elementi che racchiudeva vanno nei blocchi delle loro famiglie: dopo
  Disponi la zona non li racchiude più. Tenere le zone fuori da Disponi non risolverebbe niente,
  perché i nodi si sposterebbero comunque. Se le zone attorno alle famiglie diventano l'uso
  principale, andranno affrontate a parte.
- **Una zona non porta con sé ciò che contiene** quando la si trascina.
- **Una selezione a riquadro non parte da dentro una zona:** il clic sul fondo della zona prende la
  zona, e trascinarlo la sposta. Il riquadro parte dal canvas libero, come oggi dal fondo di un pool.
- **Le frecce collegano solo forme** e non hanno etichetta.
- **Niente colori.**
- **Niente Mermaid** per le forme.
- **`kind` non cambia** dopo la creazione.

## 11. Test

**Unitari:**

- schema: forma, view con `w`/`h`, freccia; rifiuto di una freccia da una forma a sé stessa;
- migrazione 7 → 8, compreso un file v1 che attraversa tutta la catena;
- validazione: `shape-dangling-arrow`;
- geometria: la misura vera è la più grande fra testo e misura scelta, lato per lato; l'ellisse ha
  il rettangolo di ingombro della sua misura;
- comandi: creazione delle tre forme; ridimensionamento con la misura minima del testo e
  l'allineamento alla griglia; punte, tratteggio e inversione, ciascuno un passo di annulla;
  duplicazione con le frecce interne e senza quelle verso l'esterno; eliminazione a cascata;
- `CanvasOps`: Collega fra due forme crea una freccia, verso sé stessa niente, fra una forma e
  un'entità un rifiuto con l'avviso «una forma»; una nota si ancora a una forma;
- ordine di disegno per area decrescente;
- Disponi: il blocco delle forme rispetta le misure allargate;
- export SVG: forme, frecce con punte e tratteggio, testo vuoto assente; il dialogo dell'export
  testuale con sole forme.

**E2E, lo scenario nuovo `forme.mjs`:**

1. lo strumento Rettangolo crea una forma e ne apre il testo; lo stesso con Ellisse;
2. Collega dal rettangolo all'ellisse crea una freccia;
3. dal pannello si cambiano punte e tratteggio, e «Inverti» scambia i capi;
4. la maniglia allarga il rettangolo, e ⌘Z lo riporta alla misura di prima;
5. una nota si ancora al rettangolo;
6. «Disponi» tiene la freccia fra le due forme e la nota accanto al rettangolo;
7. Collega fra una forma e un'entità viene rifiutato con l'avviso.

## 12. Decisioni prese nel brainstorming

| Domanda | Scelta | Scartate |
|---|---|---|
| A cosa servono | Disegnare schemi liberi, senza semantica | Solo annotare e raggruppare il diagramma esistente |
| Cosa collega una freccia | Solo forme fra loro | Qualunque elemento: scavalcherebbe i collegamenti tipizzati del 4a |
| Misura delle forme | Dal testo, allargabile a mano | Solo dal testo; solo a mano, con a capo automatico |
| Stile | Punte e tratteggio sulle frecce | Nessuno stile; anche un colore per le forme |
| Export testuale | Nessuno, solo immagine | Un «Mermaid lavagna» come flowchart di Mermaid |
| Architettura | Quinta famiglia `shape` | Forme nuove dentro il flowchart; uno strato fuori dalle famiglie |
| Layer | Forme sotto tutto, anche sotto pool e archi, le più grandi per prime | Forme sopra i nodi, o solo sotto i nodi: una zona coprirebbe ciò che racchiude, o gli archi fra i nodi |
