# Gli agganci degli archi — design

Data: 2026-09-29
Branch: `feat/agganci-archi`, da `master` (`698e4a7`)
Spec di riferimento: `2026-09-06-dev-designer-design.md` (§4.3: routing ortogonale senza evitamento
ostacoli), `2026-09-24-collegamenti-tipizzati-design.md` (§4: Collega fra famiglie diverse),
`2026-09-26-forme-generiche-design.md` (§3: le frecce delle forme)
Sottosistema: dove un arco tocca un nodo. Tocca il modello di tutti gli archi, il routing,
l'interazione Collega, il canvas e l'export.

## 1. Obiettivo

Oggi l'attacco di un arco lo decide solo `routeEdge`, dalla posizione relativa dei centri dei due
nodi, e il fascio (`edgeOffsets`) separa soltanto archi fra la **stessa coppia** di nodi. Due archi che
arrivano da sorgenti diverse sullo stesso lato di un nodo attaccano nello stesso punto e si
sovrappongono per un tratto: nel flowchart, dove più passi confluiscono in uno, è il caso comune.

Questa spec aggiunge due cose:

- **Agganci visibili alla draw.io**: 16 punti per nodo (3 per lato a ¼, ½, ¾, più i 4 spigoli). Un
  capo di arco si può fissare su uno di questi punti, alla creazione o dopo.
- **Fascio per lato**: i capi lasciati automatici che toccano lo stesso lato dello stesso nodo si
  distribuiscono lungo il lato, ordinati per non incrociarsi, qualunque sia il nodo all'altro capo e
  qualunque la famiglia dell'arco.

**Finita quando** lo scenario dello screenshot di partenza (due nodi diversi collegati allo stesso lato
di un terzo) si disegna con due attacchi distinti senza toccare niente, e si può fissare e spostare a
mano l'aggancio di ogni capo di ognuno dei cinque tipi di arco: relazioni ER, relazioni class, archi
del flowchart, frecce delle forme, link fra famiglie (`maps`, `accesses`, `calls`).

## 2. Fuori scopo

- **Le note ancorate**: la linea di una nota non è un arco e resta com'è.
- **Cambiare il bersaglio trascinando un capo** su un altro nodo: si cancella e si ricrea l'arco.
- **Porte per ELK**: Disponi sposta i nodi e conserva gli agganci scelti (§7).
- **Punti liberi sul perimetro**: solo i 16 punti fissi.
- **Evitamento ostacoli**: il router continua a non aggirare i nodi (limite `ponytail:` esistente).
- **Retrocompatibilità**: nessuno usa ancora l'app, nessuna migrazione dedicata (§3).
- **Misura di prestazione**: per scelta dell'utente, voce nel debito tecnico (§9).

## 3. Modello

Uno schema condiviso in `src/model/shared.ts`:

```ts
export const AnchorSchema = z.enum([
  "n1", "n2", "n3", "e1", "e2", "e3", "s1", "s2", "s3", "w1", "w2", "w3", // lati: ¼, ½, ¾ in senso orario
  "nw", "ne", "se", "sw",                                                 // spigoli
])
export const EdgeAnchorsSchema = z.object({ source: AnchorSchema.nullable(), target: AnchorSchema.nullable() })
export const AUTO_ANCHORS: EdgeAnchors = { source: null, target: null }
export const anchorsOf = (edge: { anchors?: EdgeAnchors }): EdgeAnchors => edge.anchors ?? AUTO_ANCHORS
```

La cifra conta in senso orario lungo il perimetro: `n1` è il punto di `n` più vicino a `nw`, `e1`
quello di `e` più vicino a `ne`, `s1` quello di `s` più vicino a `se`, `w1` quello di `w` più vicino a
`sw`.

**Ogni tipo di arco ha lo stesso campo facoltativo** `anchors?: EdgeAnchors`: `Relationship` (ER), `ClassRelation`,
`FlowEdge`, `Arrow`, e ogni variante dell'unione `Link`. `null` è il capo automatico, e il campo assente vale
due capi automatici: si legge sempre con `anchorsOf`. Stesso nome e stessa forma ovunque, così il codice
generico (`assignPorts`, `CanvasOps`) lo legge senza conoscere la famiglia. Facoltativo e non con un
`.default()` di zod, sul precedente di `navigable` (`class/schema.ts`): con il default il tipo in uscita
lo renderebbe obbligatorio, e ogni punto che costruisce un arco (comandi, import DDL, fixture) andrebbe
toccato. `writeAnchors(edge, anchors)` scrive il campo, e lo toglie quando torna a due capi automatici.

**Niente `SCHEMA_VERSION` nuova né migrazione.**

**Nessuna regola di validazione nuova.** Uno spigolo su una forma che non ne offre (un `nw` su un
rombo) non è un errore: si proietta sul contorno (§4). Cambiare la forma di un nodo non obbliga a
ripulire gli archi.

**Comandi.** Ogni famiglia con archi implementa `DiagramOps.setEdgeAnchors(key, anchors): Recipe`,
e i link hanno `setLinkAnchors(id, anchors)` in `links/commands.ts`: scrivono la coppia intera con
`writeAnchors`. Sopra, in `CanvasOps`, un solo punto decide:

- `setEdgeAnchor(edgeKey, end: "source" | "target", anchor: Anchor | null): Recipe | null`: una voce
  di undo, `null` se l'arco non esiste o l'aggancio è già quello.
- `addEdge(source, target, anchors?)`: la recipe della famiglia (o di `connectAcross`) più
  `setEdgeAnchors` sull'arco appena creato, in una recipe sola. Se `connectAcross` rovescia il verso,
  gli agganci si scambiano con lui. Un collegamento già presente si seleziona e basta, come oggi: gli
  agganci del gesto non lo toccano. L'àncora di una nota li ignora.

## 4. Geometria: dal capo al porto

Un **porto** è `{ point: Point; dir: Dir }`: il punto sul contorno e il versore che esce dal nodo, lo
stesso `Dir` di oggi.

**Il contorno.** `DiagramOps` riceve un metodo facoltativo `outlineOf(key): Outline`, con
`Outline = "rect" | "diamond" | "ellipse" | "stadium" | { skew: number }`. Assente: `"rect"`. Il
flowchart lo ricava da `FlowShape` (`decision` → rombo, `terminal` → stadio, `io` → parallelogramma con
`IO_SKEW`, `process` e `subprocess` → rettangolo), le forme da `kind` (`ellipse` → ellisse, `rect` e
`text` → rettangolo). ER e class non lo implementano.

**`anchorPort(rect, outline, anchor, toward?)`** in `edge-routing.ts`:

- Il punto nominale sta sul riquadro: `n2` è il centro del lato superiore, `nw` l'angolo in alto a
  sinistra.
- Il punto di un lato si proietta sul contorno vero muovendosi verso l'interno, perpendicolare al
  lato. `dir` è la normale uscente del lato.
- Uno spigolo, sul rettangolo, resta l'angolo; sul parallelogramma diventa il vertice vero dalla stessa
  parte. Su rombo, ellisse e stadio si proietta sul contorno lungo la diagonale verso il centro. `dir` è
  quella, fra le due normali uscenti dello spigolo (per `nw`: sinistra e su), che punta di più verso
  `toward`, il centro del nodo all'altro capo; a parità, l'orizzontale.
- Rombo, ellisse e stadio non mostrano gli spigoli (§6): offrono 12 punti. Rettangolo e
  parallelogramma ne offrono 16.

**`assignPorts(edges, rectOf, outlineOf): Map<string, { source: Port; target: Port }>`** sostituisce
`edgeOffsets`. `edges` è un elenco di `{ key, source, target, anchors }` con chiavi di nodo qualificate
(`flow/…`), perché un fascio mescola le famiglie: un link e un arco di flowchart che toccano lo stesso
lato dello stesso nodo si separano fra loro.

1. **Capo fissato**: il porto viene da `anchorPort`.
2. **Capo automatico**: il lato è quello rivolto verso l'altro estremo, con la regola di oggi (l'asse
   dominante fra i due centri decide fra `e`/`w` e `n`/`s`).
3. **Fascio per lato**: per ogni coppia (nodo, lato), i capi fissati restano al loro punto e spezzano
   il lato in intervalli; gli estremi del lato rientrano di `EDGE_INSET` (6), come oggi. Ogni capo
   automatico cade nell'intervallo che contiene la coordinata **del centro del nodo all'altro capo**
   lungo il lato (`x` per `n`/`s`, `y` per `e`/`w`), portata dentro il lato se sta fuori. Dentro un
   intervallo `[a, b]` i `k` capi automatici si ordinano per quella coordinata (a parità, per chiave
   dell'arco: l'ordine è stabile) e vanno in `a + (i + 1)(b − a)/(k + 1)`. Poi il punto si proietta sul
   contorno come sopra. Un capo fissato su uno spigolo appartiene al lato del
   suo `dir`. Un capo automatico solo sul suo lato cade a metà, come oggi.
4. **Cappio** (`source === target`): i capi automatici escono da `e` ed entrano da `n`, come oggi, e
   partecipano ai fasci di quei due lati. Il suo `stub` (§5) è `SELF_LOOP_OFFSET` (30) più 14 per ogni
   cappio precedente sullo stesso nodo: due cappi con lo stesso tratto si sovrapporrebbero sul lato
   lungo.

**L'ordinamento usa il centro dell'altro nodo, non il suo porto.** Così il porto su un nodo X dipende
solo dal rettangolo di X, da quelli dei suoi vicini diretti e dagli agganci salvati, e l'anteprima del
drag resta locale (§8). Ordinando sul porto l'assegnazione diventerebbe un punto fisso su tutto il
grafo.

Un arco il cui estremo non ha rettangolo (nodo mancante) non riceve porti e non si disegna, come oggi.

## 5. Routing fra due porti

`routePorts(ports: EdgePorts): EdgeRoute` sostituisce `routeEdge(a, b, loop, offset)`, con
`EdgePorts = { source: Port; target: Port; stub: number }` e lo stesso `EdgeRoute` di oggi (`points`,
`sourceDir`, `targetDir`): le geometrie di famiglia cambiano solo la chiamata. Il percorso è sempre
ortogonale, il primo segmento esce lungo `source.dir` e l'ultimo entra lungo l'opposto di `target.dir`.

- **Dritto o Z**: i porti si guardano in faccia (`p0.dir = −p3.dir`, e `p3` sta davanti a `p0`). Stesso
  risultato di oggi: un segmento se sono allineati, altrimenti due pieghe sulla mediana.
- **L**: direzioni perpendicolari e ognuno dei due porti sta davanti all'altro sul proprio asse. Una
  piega.
- **Altrimenti** (stessa direzione, o opposte ma rivolte all'indietro): da ogni porto esce un tratto di
  `stub` (16 px, `STUB`, salvo i cappi) e i due tratti si congiungono con una o due pieghe (U o S
  attorno ai tratti).

Le geometrie di famiglia (`edgeGeometry` ER, `classEdgeGeometry`, `flowEdgeGeometry`, `arrowGeometry`,
`linkGeometry`) ricevono `(ports, arco)` invece di `(rectA, rectB, arco, offset)` e usano `p.dir` per i
marker. Il resto (etichette sul segmento centrale o sul primo) non cambia.

## 6. Interazione

**Agganci visibili.** Uno strato dell'`Overlay` disegna i punti di aggancio di **un solo nodo**, con
raggio 4 px e area di clic 8 px, costanti sullo schermo (divisi per la scala). Il nodo è:

- quello sotto il puntatore, con qualsiasi strumento, ricavato da un `pointerover` delegato sul root
  (scatta solo entrando in un elemento: `busy()` resta com'è, e nessun nodo porta 16 cerchi nel DOM);
- durante `connect`, il nodo bersaglio sotto il puntatore;
- durante `reanchor`, il nodo del capo che si sposta.

Un frame (pool) non mostra agganci: non si collega.

**Hit test.** Due `Hit` nuovi, letti dai `data-*` degli elementi dell'overlay come gli altri:
`{ kind: "anchor"; node: string; anchor: Anchor }` e `{ kind: "edge-end"; edge: string; end: "source" | "target" }`.

**Collega** (`interaction.ts`):

- down su un `anchor`, con qualsiasi strumento: `connect { source, sourceAnchor }`;
- down sul corpo di un nodo con lo strumento Collega: come oggi, `sourceAnchor: null`;
- up su un `anchor` di un altro nodo: `commit-connect { source, target, sourceAnchor, targetAnchor }`;
- up sul corpo di un nodo: `targetAnchor: null`;
- l'anteprima parte dal punto dell'aggancio sorgente, se c'è, altrimenti dal centro come oggi.

**Spostare un capo.** Con un solo arco selezionato, l'overlay disegna una maniglia su ognuno dei suoi
due porti. Down su una maniglia: `reanchor { edge, end, node }`. Al rilascio:

- su un `anchor` di `node`: `set-anchor` con quell'aggancio;
- sul corpo di `node`: `set-anchor` con `null`;
- altrove: niente.

Esc annulla. L'anteprima, durante il gesto, è una linea dal porto dell'altro capo al puntatore, come
per Collega.

## 7. Rendering, export, Disponi

**Una sola fonte dei porti.** `canvasPorts(doc)` restituisce i porti di tutti gli archi del canvas, link
e linee delle note compresi, memoizzato sul documento. Canvas, export SVG/PNG e `InlineEditor` (dove
sta l'etichetta) leggono da lì. Le linee delle note restano fuori dal fascio: ricevono `autoPorts`, il
centro del lato come oggi. La memo riusa l'oggetto `EdgePorts` di un arco quando i numeri non cambiano,
così ogni arco sul canvas si sottoscrive ai propri porti e si ridisegna solo quando cambiano.

`DiagramOps.edgeGeometry(key, ports)` sostituisce `(key, a, b)`. I componenti di famiglia
(`layers.tsx`, `kinds/flow.tsx`, `kinds/class.tsx`, `ShapeArrow.tsx`, `LinkEdge.tsx`, …) smettono di
calcolare scarti propri. Spariscono `edgeOffsets`, `erEdgeOffsets`, `classEdgeOffsets`,
`flowEdgeOffsets`, `arrowOffsets` e `BUNDLE_GAP`.

**Disponi** sposta i nodi e non tocca gli `anchors`. Un aggancio che dopo il layout guarda dalla parte
sbagliata fa girare l'arco attorno al nodo (§5, caso U): si corregge a mano o con un undo.

## 8. Anteprima del drag

All'inizio del gesto `DragTargets` misura una volta i rettangoli di tutti i nodi agli estremi di un arco,
e raccoglie gli archi che toccano i nodi trascinati **e quelli che toccano i loro vicini diretti**: per
la regola di §4 sono gli unici i cui porti possono cambiare. A ogni frame i porti si calcolano su tutti
gli archi con i rettangoli dell'anteprima (un sottoinsieme darebbe fasci incompleti sui nodi al bordo),
e si scrive con `setEdgeGeometry` solo quell'insieme, e di quello solo ciò che cade nell'inquadratura,
come oggi. `resetDragTargets` riscrive lo stesso insieme con i porti a riposo. Il resize non cambia: gli
archi li ridisegna React al rilascio.

## 9. Prestazioni

Non si misura, per scelta dell'utente. Il rischio va nel debito tecnico: `memoOnIdentity` su
`edgeOffsets` è nato da una misura (`dragAll` da 25,9 a 125,1 ms di p95 senza memo), e trascinando
tutto `assignPorts` gira su tutti gli archi a ogni frame, O(E log E).

## 10. Errori

- Un aggancio sconosciuto nel file lo rifiuta zod, come ogni campo.
- `setEdgeAnchor` su un arco inesistente torna `null`: niente voce di undo.
- Un arco pendente non ha porti e non si disegna; la validazione «pendente» resta quella di oggi.

## 11. Test

TDD, vitest.

- `anchorPort`: i 16 punti del rettangolo; la proiezione su rombo, ellisse, stadio, parallelogramma;
  lo spigolo sulle forme senza spigoli; `dir` dello spigolo verso `toward`.
- `routePorts`: dritto, Z, L, U. Invarianti su tutti: segmenti ortogonali, primo segmento lungo
  `p0.dir`, ultimo lungo `−p3.dir`.
- `assignPorts`: lo screenshot riprodotto (due sorgenti diverse, stesso lato del bersaglio → due punti
  distinti); l'ordine senza incroci; i fissati che spezzano il lato; il cappio; una coppia con due archi
  paralleli (il caso che copriva `edgeOffsets`); archi di famiglie diverse sullo stesso lato; la
  località (spostando un nodo cambiano solo i porti suoi e dei vicini).
- `interaction.ts`: `connect` con e senza aggancio ai due capi; `reanchor` con i tre esiti ed Esc.
- Comandi: `setEdgeAnchor` e `addEdge` con agganci, per ogni famiglia e per i link, undo compreso.
- e2e: collegare da un aggancio a un aggancio, spostare un capo sul corpo (torna automatico), undo e
  redo.
