# La nota unica — design (step 3a)

Data: 2026-09-26
Branch: `feat/nota-unica`, da `master` (`0d5e165`)
Spec di riferimento: `2026-09-24-canvas-unificato-design.md` (§1: la roadmap, lo step 3; §6: le due
note che restano due), `2026-09-24-collegamenti-tipizzati-design.md` (§1: la nota ancorabile a
tutto rinviata allo step 3), `2026-09-25-pool-corsie-design.md` (il pool come riquadro)
Sottosistema: le due note di oggi, quella del class diagram e la forma «nota» del flowchart,
diventano **una sola nota**, in una famiglia propria, ancorabile a qualunque elemento del canvas.

## 1. Obiettivo

Oggi le note sono due oggetti diversi:

- la **nota di classe** vive in `class.model.notes`, ha solo il testo, e si ancora a una classe con
  una relazione di specie `note-link`. Nel Mermaid esce come `note for Classe "…"`;
- la **nota di flusso** è un nodo di flusso con forma `note`: si collega con archi di flusso normali,
  può stare in una corsia, la validazione la salta, e il Mermaid la scarta con un avviso.

Entità, pool e nodi di un'altra famiglia non si annotano: Collega fra una nota e un elemento di
un'altra famiglia non crea niente.

La 3a le unisce:

- nella sidebar c'è **un solo strumento «Nota»**;
- una nota è **libera** oppure **ancorata a un solo elemento**: un'entità, una classe, un nodo di
  flusso o un pool;
- l'ancoraggio si fa con Collega e si vede come una linea tratteggiata.

**La 3a è finita quando** la sidebar ha un solo strumento Nota che funziona su tutto il canvas, un
file v6 si riapre con le stesse note al loro posto, e nessuna nota si perde nella migrazione.

La roadmap del canvas unificato, aggiornata:

| Step | Contenuto | Stato |
|---|---|---|
| 1, 2a, 2b, 4a, 4b | sidebar, canvas unificato, pool, collegamenti tipizzati | fatti |
| **3a** | **La nota unica, ancorabile a qualunque elemento** | **questa spec** |
| 3b | Elementi generici (rettangolo, ellisse, testo, freccia) | spec a parte |

## 2. Confini

- **Un'àncora sola per nota.** Un secondo Collega dalla stessa nota sostituisce l'àncora, non ne
  aggiunge un'altra (§12).
- **Si ancora solo a nodi e pool.** Archi, relazioni, collegamenti e altre note non sono àncore: una
  linea non ha un punto stabile a cui agganciarsi, e una nota su una nota non dice niente.
- **Una nota non è un estremo di collegamento tipizzato.** I collegamenti del 4a/4b restano fra
  nodi, entità e classi.
- **Nessun canale di avvisi per le migrazioni.** Quello che la migrazione scarta lo dice la spec
  (§10), non l'app.
- **Gli elementi generici sono la 3b.** Quando arriveranno, una nota si potrà ancorare anche a loro
  senza lavoro in più, perché l'àncora è una chiave con prefisso qualunque.

## 3. Il modello

### La famiglia `note`

`FAMILIES` diventa `["er", "class", "flow", "note"]`. Le note vanno **in fondo** perché l'ordine
di `FAMILIES` è anche l'ordine dei layer (spec del canvas unificato §5): le note stanno sopra tutti
i nodi, e le loro linee di ancoraggio, nel layer degli archi, sotto tutti i nodi. L'ordine conta
anche per Disponi (§6).

Nuovo `src/model/note/schema.ts`:

```ts
NoteSchema        = { text: string, anchor: string | null }
NoteModelSchema   = { notes: Record<string, Note> }
NoteDiagramSchema = { model: NoteModel, view: { nodes: Record<string, NodeView> } }
```

`view.nodes` usa `NodeViewSchema` come le altre famiglie: `collapsed` non si applica e resta `false`
(scostamento 1 del piano).

- `anchor` è una **chiave con prefisso** (`er/ordini`, `class/Ordine`, `flow/n3`, `flow/pool-1`),
  come gli estremi di un collegamento: è il secondo punto in cui il prefisso entra nel modello, per
  la stessa ragione, perché l'àncora attraversa le famiglie.
- Lo schema rifiuta un'àncora nella famiglia `note` (`inFamily(anchor, "note")`), e non controlla
  che l'elemento esista: un'àncora pendente è un problema di validazione (§9), non un file
  illeggibile. Una nota con l'àncora pendente si disegna senza linea.
- `diagram.note` nasce vuoto in un documento nuovo.
- Le misure della nota restano quelle di oggi: `noteSize` e `notePath` passano da
  `editor/class/geometry.ts` alla geometria della famiglia note.

### Cosa sparisce

- `note-link` da `RelationKindSchema`, e `notes` da `ClassModelSchema`. `isClassRelation` e il tipo
  `ClassRelationKind` perdono la ragione di esistere: ogni relazione fra classi collega due classi.
- `note` da `FlowShapeSchema`: una nota non è un passo del flusso. La validazione del flusso e
  l'emettitore Mermaid perdono le eccezioni che la scartavano.
- Lo strumento «Nota di classe» e la forma «Nota di flusso».

## 4. Versione 7 e migrazione

`SCHEMA_VERSION` passa da 6 a 7. La migrazione 6 → 7 è pura e fa tre cose, in quest'ordine.

1. **Le note di classe.** Ognuna diventa una nota con lo stesso id, lo stesso testo e la stessa
   posizione (da `class.view.nodes` a `note.view.nodes`). L'àncora è la classe del suo `note-link`,
   `class/<classe>`, se c'è; se ce n'è più d'uno (solo in un file scritto a mano: i comandi ne
   tengono al più uno) vale il primo in ordine di chiave. Tutte le relazioni `note-link` spariscono.
2. **Le note di flusso.** Ogni nodo con forma `note` diventa una nota con la sua etichetta come
   testo e la sua posizione.
   - L'àncora è l'**altro estremo del primo arco** che la tocca, in ordine di id dell'arco, purché
     non sia un'altra nota: `flow/<nodo>`.
   - Tutti gli archi che toccano una nota spariscono, compresi quelli fra due note.
   - L'appartenenza alla corsia si perde: una nota non sta nelle corsie.
3. **Gli id in conflitto.** Se lo stesso id compare fra le note di classe e fra le note di flusso
   (solo con file scritti a mano: gli id generati sono uuid), la nota di flusso prende il primo
   suffisso libero (`_2`, `_3`, …).

Una nota di flusso con più archi tiene la prima àncora e perde le altre **senza avviso**: le
migrazioni non hanno un canale per dirlo, e aggiungerlo per questo caso non vale il lavoro (§10).

La misura di una nota che era di flusso cambia leggermente, perché ora la dà `noteSize` invece di
`flowNodeSize`: l'angolo in alto a sinistra resta dov'era.

## 5. Gesti

### Lo strumento

- Un solo strumento **«Nota»**, tasto **`N`**, in un gruppo **«Note»** della sidebar (`role="group"`,
  `aria-label="Note"`), dopo il gruppo del flusso e prima di «Collega». Le forme del flusso tengono
  i tasti da `1` in poi, senza la nota.
- Un clic su un punto vuoto crea una nota libera e apre l'editor del testo sul canvas, come oggi la
  nota di classe. Il doppio clic su una nota lo riapre.

### L'ancoraggio

- **Collega** fra una nota e un'entità, una classe, un nodo di flusso o un pool, in qualunque verso,
  scrive `anchor` sulla nota e sostituisce l'àncora di prima. Un solo passo di annulla, nessun
  avviso. Collega verso l'àncora che la nota ha già non produce una voce di annulla.
- La guardia del 2b che esclude i pool da Collega (`isFrame`) si apre **solo** per le note: un pool
  resta escluso da ogni altro collegamento.
- Collega fra due note non crea niente, in silenzio, come oggi fra due note di classe.
- Un'àncora si toglie in due modi: selezionando la sua linea e premendo Canc, o dal pannello (§7).
  La nota si **stacca** e resta dov'è. È lo stesso gesto di oggi, quando un `note-link` selezionato
  si elimina.

### La linea di ancoraggio

Tratteggiata, dal bordo della nota al bordo dell'elemento ancorato, con la resa della linea
`note-link` di oggi. È un arco della famiglia `note`, con la chiave della nota: una nota ha al più
una linea, quindi la chiave non collide. Durante il trascinamento della nota o dell'elemento la
linea li segue, con lo stesso meccanismo che usano le linee dei collegamenti fra famiglie.

### Eliminazione, duplicazione, spostamento

- Eliminare l'elemento ancorato **stacca** le sue note, nella stessa recipe e quindi nella stessa
  voce di annulla. Eliminare una nota elimina solo lei.
- Una nota duplicata tiene la stessa àncora dell'originale, anche quando si duplicano insieme nota
  ed elemento (§10).
- Una nota **non segue** l'elemento quando lo si trascina: si sposta solo se è selezionata anche
  lei. La segue invece con Disponi (§6).
- Una rinomina di entità o classe sposta anche le àncore che la nominano (scostamento 6 del piano).

## 6. Disponi

- **Le note ancorate** mantengono lo scarto dall'angolo in alto a sinistra del loro elemento: se
  Disponi sposta l'entità, la nota la segue con lo stesso scarto di prima. Il passo delle note
  (`followAnchors`) è l'ultimo di Disponi: legge le posizioni vecchie dal documento di partenza e
  quelle nuove dal draft, dopo tutte le famiglie, quindi non dipende dall'ordine di `FAMILIES`
  (scostamento 2 del piano).
- **Le note libere** formano l'ultimo blocco del canvas misto, dopo il flusso, messe in fila dal
  motore di layout. Una famiglia fatta solo di note libere conta come contenuto.
- Una nota con l'àncora pendente si tratta come libera.
- Resta una sola recipe, quindi un solo passo di annulla.

## 7. Pannello

Con una nota selezionata:

- il campo **«Testo»**, multiriga, in sola lettura mentre l'editor sul canvas è aperto su quella
  nota, come oggi `NoteProperties`;
- la riga **«Ancorata a: Ordine»** con il pulsante **«Stacca»**, oppure **«Libera»** se la nota non ha
  àncora. Il nome dell'elemento viene dalle stesse etichette che il pannello dei collegamenti usa per
  i suoi estremi (`src/model/links/labels.ts`), estese al pool se non lo coprono.

Con la linea di ancoraggio selezionata, il pannello mostra la nota a cui appartiene e il pulsante
«Stacca».

## 8. Export

**Mermaid delle classi.** Le note ancorate a una classe escono come `note for Classe "…"`, le note
libere come `note "…"`, con la sintassi, l'escaping e l'ordine di oggi. L'emettitore delle classi
riceve anche le note, perché ora stanno in un'altra famiglia. Una nota vuota continua a non uscire.

**Mermaid del flowchart e dell'ER.** Le note ancorate a nodi di flusso, pool o entità non escono,
perché quelle sintassi non hanno note. Ciascun export lo dice con un avviso che le conta, come oggi
fa il flowchart con le note-forma.

**Solo note libere.** Se il documento non ha classi, l'export Mermaid delle classi non è disponibile,
e le note libere non escono (§10).

**SVG.** Note e linee di ancoraggio ci sono: la famiglia `note` è un layer come gli altri.

## 9. Validazione

- Un solo problema nuovo, `note-dangling-anchor`: «La nota è ancorata a un elemento che non c'è.».
  Nasce solo da un file scritto a mano, perché i comandi staccano le note quando l'àncora sparisce.
- Spariscono i controlli sui `note-link` nella validazione delle classi e le eccezioni per le note
  in quella del flusso.

## 10. Limiti che la 3a accetta

- Una nota di flusso con più archi, migrata, tiene solo il primo ancoraggio, senza avviso.
- Una nota duplicata tiene l'àncora dell'originale, anche se si duplica anche l'elemento.
- Una nota non segue il suo elemento durante un trascinamento, solo con Disponi.
- Le note ancorate fuori dalle classi non escono in nessun Mermaid.
- Con sole note libere, l'export Mermaid delle classi non è disponibile.
- Disponi può sovrapporre una nota ancorata a un altro elemento della **stessa** famiglia del suo
  àncora: il grafo ELK di quella famiglia non vede le note (DT-29). Non si sovrappone al blocco di
  un'**altra** famiglia: `layoutAll` (`layout-pack.ts`) include il rettangolo previsto di ogni nota
  ancorata nell'ingombro del blocco della sua famiglia, prima di impacchettarli con `packBlocks`.

## 11. Test

- **Unit:**
  - schema: àncora nella famiglia `note` rifiutata, àncora pendente accettata;
  - migrazione 6 → 7: nota di classe con e senza àncora, con due `note-link`; nota di flusso con
    zero, uno e più archi; arco fra due note; nota in una corsia; id in conflitto; un documento v7
    con una nota ancorata e una libera torna uguale dal file;
  - comandi: creare, ancorare, sostituire l'àncora, staccare, eliminare l'elemento ancorato;
  - operazioni del canvas e runner: Collega nota → entità, nota → pool, pool → nota, nota → nota,
    pool → nodo di flusso (ancora escluso);
  - Disponi: la nota segue l'àncora con lo stesso scarto; le note libere fanno l'ultimo blocco;
  - i tre emettitori Mermaid e l'SVG; il pannello.
- **E2E:** `class-note.mjs` diventa `note.mjs`: una nota ancorata a un'entità, a un nodo e a un pool,
  staccata con Canc e dal pannello, e che si stacca da sola quando si elimina l'elemento; l'upload di
  un file v6 con una nota di classe e una di flusso le riapre al loro posto. `flow.mjs` e `misto.mjs`
  si aggiornano dove usano la nota di flusso.

## 12. Decisioni prese nel brainstorming

| Decisione | Scelta | Scartate |
|---|---|---|
| Àncore per nota | una sola, un nuovo Collega la sostituisce | più d'una |
| Àncore ammesse | entità, classe, nodo di flusso, pool | anche archi e note |
| Elemento ancorato eliminato | la nota resta, libera | la nota sparisce con lui |
| Note libere nel Mermaid | nell'export delle classi, come oggi | in nessun export |
| Dove vive la nota | quarta famiglia `note`, àncora sulla nota | note come collegamenti; nota nella famiglia delle classi |
| Archi in più di una nota di flusso migrata | persi senza avviso, documentato | un canale di avvisi per le migrazioni |
