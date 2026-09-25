# Pool e corsie facoltative — design (step 2b)

Data: 2026-09-25
Branch: `feat/pool-corsie`, da `master` (`81ead9a`)
Spec di riferimento: `2026-09-22-flowchart-design.md` (le corsie come bande, il drag fra corsie, il
layout con `placeInLanes`), `2026-09-24-canvas-unificato-design.md` (§1 e §12: il 2b risolve le bande
che attraversano tutto il canvas)
Sottosistema: le corsie smettono di essere obbligatorie. Un nodo di flusso può stare **libero** sul
canvas, e le corsie vivono dentro **pool** delimitati, più d'uno per documento.

## 1. Obiettivo

Oggi ogni nodo di flusso appartiene a una corsia, il documento nasce con una corsia e l'ultima non si
elimina, e le bande attraversano tutto il canvas, anche sotto entità e classi. Una corsia è un
**attore**: una persona, un ruolo, un reparto o un sistema che esegue un passo. Serve a documentare
processi con gli attori, e non serve a ragionare sulla logica di un algoritmo, dove l'attore è uno
solo.

Il 2b rende le corsie una scelta:

- un flowchart nuovo non ha corsie, e un nodo creato su un punto vuoto è libero;
- chi vuole gli attori crea un **pool**: un riquadro con un nome, una striscia di intestazione a
  sinistra e almeno una corsia;
- un documento può avere più pool, per più processi sullo stesso canvas;
- entità e classi non hanno più bande sotto, salvo quando ci si mettono sopra.

**Il 2b è finito quando** un flowchart di sola logica non mostra nessuna banda, entità e classi non
hanno corsie che le attraversano, un processo con attori si disegna in un pool, e un file v5 si
riapre con lo stesso aspetto, con in più l'intestazione del pool.

## 2. Confini

- **Non è BPMN.** Niente messaggi fra pool, pool annidati, gateway tipizzati, eventi. Un arco fra
  due pool è un arco normale del flowchart.
- **Nessuna regola di validazione nuova.** Una corsia vuota o un pool vuoto non sono errori.
- **Un pool non è un estremo di collegamento.** I collegamenti del 4b restano fra nodi, entità e
  classi.
- **Solo i nodi di flusso** entrano in un pool, nota del flusso compresa. Entità e classi ci passano
  sopra.
- **Nessun ridimensionamento dal bordo sinistro o superiore.** Il pool si sposta dall'intestazione
  e si allarga dal bordo destro; le corsie crescono dal bordo inferiore.

## 3. Il modello

```ts
LaneSchema = z.object({ id: Identifier, name: z.string() })                 // invariata
PoolSchema = z.object({ name: z.string(), lanes: z.array(LaneSchema).min(1) })
FlowNodeSchema = z.object({ label, shape, lane: Identifier.nullable() })     // null = nodo libero
FlowModelSchema = z.object({
  pools: z.record(z.string(), PoolSchema),
  nodes: z.record(z.string(), FlowNodeSchema),
  edges: z.record(z.string(), FlowEdgeSchema),
})
PoolViewSchema = z.object({ x: z.number(), y: z.number(), w: z.number() })
LaneViewSchema = z.object({ h: z.number() })                                // la y non c'è più
FlowViewSchema = z.object({
  nodes: z.record(z.string(), NodeViewSchema),
  pools: z.record(z.string(), PoolViewSchema),
  lanes: z.record(z.string(), LaneViewSchema),
})
```

- **I pool sono un `Record`**, per id (uuid): la loro posizione è libera e il loro ordine non
  significa niente. **Le corsie restano un array** dentro il pool, perché lì l'ordine è
  l'informazione (spec del flowchart §3).
- **Refine di `FlowModelSchema`:**
  - gli id delle corsie sono unici in tutto il documento, non solo nel pool;
  - un `lane` non nullo esiste in qualche pool.
- `lanes.min(1)` passa dal flowchart al pool: un flowchart senza pool è normale, un pool senza corsie
  no.
- **Ricavati, mai salvati:**
  - il pool di un nodo: si cerca la corsia fra i pool;
  - la `y` di ogni corsia: la `y` del pool più le altezze delle corsie precedenti.

  Una sola funzione, `laneRects(diagram)` in `editor/flow/geometry.ts`, dà i rettangoli assoluti
  delle corsie (x dal pool più `POOL_HEADER_W`, larghezza `w - POOL_HEADER_W`). La usano il canvas,
  l'hit test del drag e della creazione, `setNodeLane`, il layout e l'export. Sostituisce `laneAt`
  sui dati salvati e `laneBandExtent`, che spariscono.
- **Costanti** in `model/flow/schema.ts`, accanto a `LANE_MIN_H` (160, invariata):
  `POOL_MIN_W = 640` (prende il posto di `LANE_MIN_W`) e `POOL_HEADER_W = 32`, e `LANE_MARGIN = 40`,
  che la migrazione usa (scostamento 2 del piano).
- **Nomi:** `nextLaneName` si generalizza in una funzione che dà il primo «`<Prefisso>` N» libero,
  usata per «Pool N» (fra i pool del documento) e per «Corsia N» (fra le corsie del pool).
- **Documento nuovo:** `emptyFlowDiagram()` dà `pools: {}`, `view.pools: {}`, `view.lanes: {}`.

### Le metriche del testo scendono nel modello

La migrazione (§4) deve calcolare la larghezza dei nodi, ma sta in `src/model`, che non importa
`src/editor`. `flowNodeSize` passa quindi in `src/model/flow/size.ts`, e le metriche che usa
(`FONT_SIZE`, `CHAR_W`, `ROW_H`, `PAD_X`, `GRID`) in `src/model/metrics.ts`. Sono convenzioni pure,
senza DOM. `editor/geometry.ts` e `editor/flow/geometry.ts` le **riesportano**, così nessun chiamante
cambia import. Una stima dentro la migrazione sarebbe stata una seconda formula per la stessa misura.

## 4. Versione 6 e migrazione

`SCHEMA_VERSION` passa da 5 a 6, con la migrazione `lanesIntoPool` registrata alla versione 5.

- **Parte di flusso senza nodi:** le corsie spariscono, `pools: {}`, `view.lanes: {}`. Erano la
  corsia che `lanes.min(1)` imponeva.
- **Parte di flusso con nodi:** le corsie diventano un pool con id fisso `pool-1` (la migrazione è
  pura, come `MIGRATED_LANE_ID`) e nome «Pool 1», con le stesse corsie nello stesso ordine e le
  stesse altezze.
  - `y` del pool: la `y` della prima corsia.
  - `x` e `w`: il calcolo di `laneBandExtent` di oggi (ingombro dei nodi più `LANE_MARGIN`, larghezza
    minima 640), spostato a sinistra di `POOL_HEADER_W` e allargato della stessa misura. Il corpo
    delle bande resta dov'era; la striscia si aggiunge a sinistra.
  - I nodi non si muovono e tengono la loro corsia.

  Le bande del v5 sono già impilate senza buchi (`restackLanes`), quindi ricavare la `y` dalle altezze
  dà le stesse bande.
- Un'app ferma alla 5 rifiuta un file v6 con «schemaVersion 6 più recente di quella supportata (5)».

## 5. Gesti

### Creare

- **Pool:** strumento «Pool» nel gruppo del flusso, tasto `P`. Un clic su un punto vuoto crea un pool
  con l'angolo superiore sinistro sul clic (allineato alla griglia), una corsia «Corsia 1»,
  `w = POOL_MIN_W`, `h = LANE_MIN_H`. Un clic dentro un pool esistente non crea niente e mostra
  l'avviso **«Un pool non sta dentro un altro pool.»**
- **Nodo di flusso**, nota compresa: un clic dentro una corsia crea il nodo in quella corsia, un clic
  fuori da ogni pool lo crea libero. `nearestLane` sparisce: non c'è più una corsia da assegnare per
  forza.

### Trascinare un nodo

A fine movimento, per ogni nodo trascinato, con una selezione multipla ognuno per sé:

- se il centro cade in una corsia, il nodo prende quella corsia;
- se cade fuori da ogni pool, il nodo diventa libero (`lane: null`).

Posizione e appartenenza si scrivono in un solo passo di annulla, come oggi. Il nodo non viene più
trattenuto dentro la banda: `keepNodeInBand` resta solo per `setNodeLane` e `deleteLane`, che
spostano un nodo dentro una corsia scelta. Entità e classi non entrano mai in un pool.

### Il pool sul canvas

- **Selezione:** clic sulla striscia di intestazione, l'unica parte del pool che si afferra. Il corpo
  delle corsie resta trasparente ai clic, come le bande di oggi: selezione a riquadro e pan partono
  anche da lì. La chiave di selezione è `flow/<poolId>`; `CanvasOps` distingue un pool da un nodo di
  flusso cercando la chiave nei due record, come già distingue classi e note.
- **Spostare:** trascinare l'intestazione sposta il pool e **i suoi nodi**, in un solo passo di
  annulla, allineato alla griglia. Un nodo membro che è anche nella selezione si sposta una volta
  sola.
- **Ridimensionare:** il bordo destro del pool cambia `w`; il bordo inferiore di ogni corsia cambia
  la sua `h`, e le corsie sotto scendono con i loro nodi (lo fa già `restackLanes`). Il minimo è il
  più grande fra la misura minima (`POOL_MIN_W`, `LANE_MIN_H`) e l'ingombro dei nodi contenuti, così
  ridimensionare non cambia mai l'appartenenza.
- **Spostare o ridimensionare un pool non cattura nodi liberi.** L'appartenenza cambia solo creando o
  trascinando un nodo, o dal pannello. Un nodo libero può quindi trovarsi sotto un pool senza farne
  parte (§10).
- **Eliminare:** Canc su un pool selezionato elimina il pool e le sue corsie; i nodi diventano liberi
  e restano dove sono. Un solo passo di annulla.
- **Collega** che parte o arriva sull'intestazione di un pool non crea niente e non dà avvisi, come un
  gesto che finisce sul vuoto.

### Le corsie di un pool

Dal pannello del pool (§7), come oggi dal pannello globale:

- `addLane(poolId, name)`: in fondo al pool;
- `renameLane(id, name)`;
- `moveLane(poolId, from, to)`: dentro il pool;
- `deleteLane(model, id, moveTo)`: `moveTo` deve stare **nello stesso pool**; l'ultima corsia di un
  pool non si elimina, si elimina il pool.

## 6. Disponi

Resta una sola esecuzione di ELK su tutto il grafo di flusso, che ignora i pool come oggi ignora le
corsie: ELK dà l'asse del flusso e l'ordinamento (ADR 0007). `placeInLanes` si generalizza da «le
corsie in ordine» a una sequenza di bande:

1. **in cima, una banda senza nome per i nodi liberi**, con le stesse righe a colorazione di
   intervalli; non si disegna niente;
2. **sotto, i pool**, nell'ordine della loro `y` attuale (a parità, per id). Ogni corsia riceve
   l'altezza dai propri nodi, con minimo `LANE_MIN_H`. Tutti i pool prendono la stessa `x` e la stessa
   `w`: l'ingombro comune dei nodi di flusso più `LANE_MARGIN`, più `POOL_HEADER_W`, con minimo
   `POOL_MIN_W`.

Un flusso che attraversa due pool resta allineato sull'asse del flusso, e un documento migrato dopo
Disponi ha l'aspetto di oggi. Nel canvas misto il blocco del flusso comprende i pool, e un pool vuoto
conta come contenuto della famiglia `flow` (`familyHasContent`), come «Adatta alla vista».

## 7. Pannello

- **Pool selezionato:** il nome, modificabile, e la lista delle sue corsie con aggiungi, rinomina,
  sposta su e giù, elimina chiedendo dove spostare i nodi: il pannello delle corsie di oggi,
  spostato dentro il pool.
- **Niente selezionato:** il pannello delle corsie globale (`FlowLanesPanel`) sparisce, perché fuori
  da un pool non ci sono corsie.
- **Nodo di flusso selezionato:** la select «Corsia» ha in testa la voce «Nessuna» e raggruppa le
  corsie per pool con `<optgroup label="<nome del pool>">`.
  - una corsia sposta il nodo dentro la sua banda (`setNodeLane`): la `y` come oggi, e la `x` se il
    nodo sta fuori dalla banda in orizzontale, per esempio quando passa da un nodo libero o da un
    altro pool;
  - «Nessuna» lo libera dov'è (`setNodeLane(key, null)`).

## 8. Export

- **Mermaid** (`flowchart LR`): ogni pool è un `subgraph` con il suo nome, e dentro un `subgraph` per
  corsia, nell'ordine delle corsie. I pool escono per nome e, a parità, per id: l'emettitore riceve
  solo il modello, e lo stesso modello deve dare lo stesso testo anche dopo che un pool è stato
  spostato (scostamento 1 del piano). I nodi liberi stanno al livello più alto, prima dei pool. La
  disposizione la decide Mermaid, come oggi.
- **SVG e PNG:** i pool si disegnano con lo stesso componente del canvas (`LanesLayerView` diventa
  `PoolsLayerView`), e il riquadro dell'export comprende i pool.

## 9. Test

**Unitari:**

- Schema: un nodo libero è valido; una corsia inesistente no; due corsie con lo stesso id in due pool
  no; un pool senza corsie no; un flowchart senza pool sì.
- Migrazione 5 → 6: senza nodi sparisce tutto; con nodi nasce `pool-1` con le stesse corsie, le
  stesse altezze e le `y` di prima; i nodi non si muovono; `x`/`w` del pool coprono i nodi più la
  striscia.
- `laneRects`: le `y` si impilano dalle altezze; la x salta la striscia.
- Gesti: creare un nodo dentro una corsia e fuori; trascinarlo dentro, fra due pool, fuori; creare un
  pool, e il rifiuto dentro un pool; spostare un pool porta i suoi nodi e non i liberi che ci stanno
  sotto; il ridimensionamento si ferma all'ingombro dei nodi; eliminare un pool libera i nodi in un
  solo passo di annulla; `deleteLane` rifiuta un `moveTo` di un altro pool.
- Disponi: i liberi in cima, i pool sotto nell'ordine della `y`, stessa `x` e `w` per tutti.
- Mermaid: subgraph annidati, liberi al livello più alto.
- Pannello: la voce «Nessuna» e gli `<optgroup>`.

**E2E:** uno scenario nuovo, `pool.mjs`:

1. un processo libero, e nessuna banda sul canvas;
2. un pool con `P`; il processo trascinato dentro prende la corsia, trascinato fuori torna libero;
3. il pool spostato dall'intestazione porta con sé il nodo che contiene;
4. Canc sul pool: il pool sparisce e il nodo resta;
5. un file v5 caricato ha un pool «Pool 1» con le corsie di prima.

Si aggiornano `flow.mjs` e `misto.mjs` dove davano per scontata la corsia obbligatoria o le bande su
tutto il canvas.

## 10. Limiti che il 2b accetta

- Due pool si possono sovrapporre spostandone uno. Un nodo trascinato nella zona comune va al pool
  disegnato sopra.
- Un nodo libero può stare sotto un pool senza farne parte, dopo che il pool gli è stato spostato
  sopra o allargato fino a lui. Disponi lo rimette in cima.
- «Seleziona tutto» e «Duplica» ignorano i pool.
- Niente messaggi fra pool, niente pool annidati (§2).

## 11. Decisioni prese nel brainstorming

| Domanda | Scelta | Scartato |
|---|---|---|
| Quanti pool | più pool per documento | al massimo uno (due processi con attori non starebbero nello stesso documento) |
| Dimensione del pool | salvata (`x`, `y`, `w` e l'altezza di ogni corsia), con i bordi trascinabili | larghezza dai nodi come le bande di oggi (a destra e a sinistra il pool sarebbe una trappola); appartenenza solo dal pannello |
| Dove vive il pool | dentro la famiglia `flow`, con le corsie annidate | una famiglia `pool/…` (l'appartenenza attraverserebbe due famiglie per una cosa solo del flusso); tenere le bande e aggiungere solo `lane: null` (non risolve le bande sotto entità e classi) |
| Larghezza dei nodi nella migrazione | `flowNodeSize` e le metriche del testo nel modello, riesportate dall'editor | una stima dentro la migrazione (una seconda formula per la stessa misura) |
