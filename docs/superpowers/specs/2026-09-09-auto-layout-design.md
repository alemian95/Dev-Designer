# Auto layout con ELK — design

Data: 2026-09-09
Spec di riferimento: `docs/superpowers/specs/2026-09-06-dev-designer-design.md`
(§3, riga «Auto layout | ELK.js in worker | Problema difficile già risolto»; è
l'ultima cosa aperta del punto 1 dell'ordine di consegna)
Sottosistema: `io/layout` (worker e client) più un comando in `editor` e un
pulsante in `ui`.

## 1. Obiettivo

Un pulsante che dispone il diagramma in modo leggibile, al posto delle posizioni
che l'utente ha trascinato o che l'import ha messo in griglia.

Serve a due momenti diversi. Dopo un import di quaranta tabelle, dove la griglia
di `placeNew` è leggibile ma dice nulla sulla forma dello schema. E dopo mezz'ora
di lavoro a mano, quando il diagramma si è ingarbugliato e rimetterlo a posto
trascinando costa più che rifarlo.

Vale per ogni tipo di diagramma, non solo per l'ER: è la ragione per cui si fa
**prima** del class diagram e non dopo. Fatto ora, il class diagram lo eredita;
fatto dopo, l'adattatore documento→grafo va scritto due volte.

## 2. Cosa ha deciso lo spike

La scelta dell'algoritmo non era decidibile a tavolino, quindi è stata misurata:
`elkjs@0.12.0` su un grafo di forma realistica — tre tabelle hub, cicli, 1,3
foreign key per tabella — perché i dump reali a disposizione sono troppo sparsi
per distinguere gli algoritmi (14 tabelle e 5 FK, 24 e 10).

| Algoritmo | 30 tab.: ms | area | incroci | sovrapp. | 200 tab.: ms | area | incroci |
|---|---|---|---|---|---|---|---|
| **layered DOWN** | 40 | 9,9 Mpx | 15 | 0 | **157** | 112 Mpx | 1327 |
| layered RIGHT | 161 | 8,8 Mpx | 13 | 0 | 316 | 266 Mpx | 1282 |
| stress | 129 | 1,7 Mpx | 9 | **165** | 3466 | 5,3 Mpx | 718 |
| stress + sporeOverlap | 136 | 7,5 Mpx | 10 | 0 | **5522** | 76 Mpx | 1250 |
| force | 105 | 12,3 Mpx | 53 | 0 | 3273 | 658 Mpx | 3371 |
| mrtree | 21 | 9,1 Mpx | 64 | 0 | 106 | 65 Mpx | 4154 |

Tre risultati che contano più dei numeri:

- **`stress` da solo è inutilizzabile**: tratta i nodi come punti, quindi le
  scatole si sovrappongono — 165 coppie a 30 tabelle, 5218 a 200. Recuperabile
  solo con una seconda passata `org.eclipse.elk.sporeOverlap`, che porta il
  costo a 5,5 s a 200 tabelle.
- **`force` e `mrtree` fanno 3-4× gli incroci** di `layered` a parità di tutto
  il resto.
- **Le opzioni di wrapping di `layered` non hanno alcun effetto** su questo
  grafo: `SINGLE_EDGE` e `MULTI_EDGE` con `elk.aspectRatio` danno posizioni dei
  nodi identiche al layout senza wrapping — confrontato l'insieme delle
  coordinate, non solo le metriche. Su uno schema grande il risultato resta
  lungo, e si accetta: si zooma.

La scelta è `layered`, ed è registrata in **ADR 0006** con questi numeri, perché
il codice dello spike è usa e getta e altrimenti la prossima persona rifà le
misure.

## 3. Architettura

```
src/io/layout/
  elk.worker.ts   importa elk.bundled.js; riceve rettangoli e archi, risponde posizioni
  spawn.ts        il `?worker` di Vite, isolato
  client.ts       promessa, timeout, abbandono della richiesta precedente
src/editor/commands/
  layout.ts       documento → grafo, e posizioni → recipe. Puro
```

Il worker sta in `io/` perché lo impone `no-restricted-imports`
(`eslint.config.js`): `io` non vede `react` né `ui`. La logica pura sta in
`editor/commands`, dove è testabile senza browser — e senza jsdom, che il
progetto non ha.

Le tre parti in `io/layout` sono la stessa forma di `io/ddl`
(`parse.worker.ts`, `spawn.ts`, `parse-client.ts`) e per le stesse ragioni:
`spawn.ts` separato perché `?worker` è una trasformazione di Vite e importarla
dal client la tirerebbe nei test, dove `Worker` non esiste; il client con un
worker iniettabile perché è l'unico modo di testare timeout ed errori in Node.

Il worker parla un **protocollo nostro**, non quello di ELK: non usiamo
`elk-api.js` con `workerFactory` sul thread principale. Il worker riceve
rettangoli e restituisce posizioni, e ELK resta un dettaglio interno al file
`elk.worker.ts`. Costa una decina di righe e in cambio il thread principale non
importa nulla di elkjs — il che è anche ciò che tiene 465 kB gzip fuori dal
bundle iniziale (§8).

### Contratto del worker

```ts
export interface LayoutNode { id: string; w: number; h: number }
export interface LayoutEdge { id: string; source: string; target: string }

export interface LayoutRequest {
  id: number
  nodes: LayoutNode[]
  edges: LayoutEdge[]
}

export type LayoutResponse =
  | { id: number; ok: true; positions: Record<string, { x: number; y: number }> }
  | { id: number; ok: false; message: string }
```

`source` e `target` di `LayoutEdge` sono **già** nel verso del layout (padre →
figlia): l'inversione avviene nell'adattatore, dove è testabile, non nel worker.

Le opzioni di layout stanno nel worker, non nella richiesta: sono una decisione
del progetto, non un parametro di chi chiama.

```ts
const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
}
```

## 4. Dal documento al grafo

`layoutGraph(diagram: ErDiagram): { nodes: LayoutNode[]; edges: LayoutEdge[] }`,
funzione pura in `editor/commands/layout.ts`.

**Nodi.** Uno per entità che ha un nodo nella view, con `id` uguale alla chiave
dell'entità (`entityKey`) e misure da `entitySize(entity, view.collapsed)`. Un
nodo collassato occupa lo spazio che occupa davvero sul canvas, quindi il layout
lo dispone per quel che è, non per quel che sarebbe aperto.

Un'entità **senza** nodo nella view non entra: non è sul canvas, e darle una
posizione la farebbe comparire dal nulla.

**Archi.** Uno per relazione, `id` uguale alla chiave della relazione, e
**invertito rispetto al modello**: nel documento `source` è la figlia (lato
della foreign key) e `target` il padre referenziato, mentre il grafo vuole
`source: rel.target.entity` e `target: rel.source.entity`, perché con
`direction: DOWN` ELK mette la sorgente sopra. È la convenzione scelta nel
brainstorming: padri sopra, figlie sotto.

Una relazione con un estremo che non è fra i nodi viene **saltata**, come già
fanno i due emettitori: senza uno dei due estremi ELK rifiuterebbe il grafo.

Le relazioni disegnate a mano (`attributes` vuoto, ADR 0003) sono archi come
tutti gli altri: al layout la provenienza non serve, e trattarle diversamente
significherebbe che il diagramma si dispone ignorando connessioni che l'utente
vede.

Un'entità con una foreign key su se stessa produce un self-loop. ELK li accetta;
il canvas li disegna già (`selfLoop` in `edge-routing.ts`).

## 5. Dalle posizioni al documento

`applyLayout(positions: Record<string, Point>): Recipe`, pura, in `layout.ts`.

Tre trasformazioni, in questo ordine:

1. **Traslazione** perché il risultato parti da `(40, 40)`: le coordinate di ELK
   partono dalla sua origine, e senza questo un diagramma finirebbe appiccicato
   al bordo. Il valore assoluto non si vede — la vista si adatta subito dopo —
   ma coordinate positive e deterministiche rendono i test leggibili.
2. **`snap()` a 10 px**, come ogni altra posizione dell'app: ELK restituisce
   float, e una posizione fuori griglia si nota al primo trascinamento
   successivo, che riallinea il nodo di qualche pixel senza che l'utente capisca
   perché.
3. **Scrittura solo dei nodi che esistono** in `view.nodes`. Il worker potrebbe
   restituire una chiave che nel frattempo non c'è più (l'utente ha cancellato
   un'entità durante il calcolo): quella posizione si ignora, non si ricrea il
   nodo.

Una sola `dispatch`, quindi **un solo ⌘Z** rimette tutte le posizioni
precedenti. Non serve una guardia sul caso «il layout non ha cambiato niente»:
`dispatch` restituisce `false` e non tocca la storia se le patch sono zero
(`document-store.ts:41`), e assegnare a un numero lo stesso numero non genera
patch in Immer.

Subito dopo la `dispatch`, `fitToContent()` (`editor/actions.ts:28`): senza,
dopo un layout si guarda il vuoto, perché il diagramma è altrove.

Diagramma vuoto o con un solo nodo: niente richiesta al worker, niente comando,
niente voce di undo.

## 6. Errori e attesa

Il worker che fallisce, che non risponde entro il timeout, o che risponde
`ok: false`, produce **un avviso e nessuna modifica al documento**. Non esiste
un layout parziale: o arrivano tutte le posizioni o non se ne applica nessuna.

L'avviso passa da `documentSession.notice`, la barra che esiste già
(`ui/NoticeBar.tsx`): «Non è stato possibile disporre il diagramma.»

Timeout: **10 s**. Il massimo misurato è 316 ms su 200 tabelle, quindi il
margine è trenta volte. Non 30 s come il parser DDL: là il lavoro è WASM su un
dump di megabyte, qui è un grafo di qualche centinaio di nodi, e un'attesa di
mezzo minuto su un pulsante di layout non la si distingue da un blocco.

Durante il calcolo il pulsante è disabilitato. A 160-320 ms non serve uno
spinner, e metterlo farebbe lampeggiare qualcosa per un terzo di secondo.

Una seconda richiesta mentre la prima è in volo **abbandona la prima**: la
rigetta e termina il worker, come `createParser`. Applicare due layout di
seguito produrrebbe due voci di undo per un gesto che l'utente ha inteso come
uno.

## 7. UI

Un pulsante nella toolbar, accanto a «Adatta» che è la sua parente più vicina:
icona `LayoutGrid` (lucide), `aria-label="Disponi"`, tooltip «Disponi (L)»,
scorciatoia `!mod && key === "l"` in `use-keyboard-shortcuts.ts`, dove le
azioni sul canvas sono lettere singole senza modificatore (`v`, `e`, `r`, `f`).
`l` è libera.

Disabilitato quando il documento è in sola lettura (`documentSession.readOnly`):
è una modifica del documento, non una lettura come l'export. Disabilitato anche
con meno di due entità, dove non c'è niente da disporre.

Nessun dialog, nessuna scelta di algoritmo esposta. Un secondo layout esposto
nella UI si aggiunge quando esisterà un tipo di diagramma che lo chiede — il
sequence, dove il layout è vincolato dall'ordine dei messaggi.

## 8. Peso del bundle

`elkjs@0.12.0` è **1,6 MB minificato, 465 kB gzip**: tre volte il bundle attuale
dell'intera app (162 kB gzip). Non può entrare nel caricamento iniziale.

Il worker lo tiene fuori per costruzione: Vite lo emette come chunk separato,
scaricato alla prima richiesta di layout. È la stessa ragione per cui l'export
immagini vive dietro `import()` (`ui/export/lazy.ts`), con un ordine di
grandezza in più in gioco.

**Verifica obbligatoria in fase di implementazione**: `pnpm build` e confronto
del `dist/assets/index-*.js` con il valore prima della modifica. Se cresce, il
worker non è isolato e la modifica non è finita. Il valore da cui si parte è
515,72 kB / 162,94 kB gzip (`0a07172`).

## 9. Test

**Unit** (`editor/commands/layout.test.ts`), sulle funzioni pure:

- il grafo prodotto da un diagramma di tre entità e due relazioni: nodi con le
  misure di `entitySize`, archi **invertiti**, `id` uguali alle chiavi;
- un nodo collassato ha l'altezza del solo header;
- un'entità senza nodo nella view non compare fra i nodi;
- una relazione con un estremo fuori dal diagramma non compare fra gli archi;
- una foreign key su se stessa produce un arco con `source === target`;
- `applyLayout`: traslazione a `(40, 40)`, `snap` a 10 px, chiave sconosciuta
  ignorata, e una seconda applicazione delle stesse posizioni che non produce
  patch.

**Unit** (`io/layout/client.test.ts`), col worker finto, come `parse-client`:

- risposta corretta → promessa risolta con le posizioni;
- `ok: false` → promessa rigettata col messaggio;
- nessuna risposta → rigetto per timeout;
- `error` del worker → rigetto di tutte le promesse in volo;
- seconda richiesta → la prima rigettata e il worker terminato.

**E2e** (`scripts/e2e/layout.mjs`, nuovo scenario in `run.mjs`): importa il DDL
di due tabelle, sposta un nodo dove sicuramente non lo metterebbe il layout,
clicca «Disponi», e verifica tre cose sul DOM reale — che le posizioni siano
cambiate, che **nessuna coppia di nodi si sovrapponga**, e che un ⌘Z riporti
esattamente le posizioni di prima.

L'assertion sulle sovrapposizioni non è di routine: è quella che nello spike ha
smascherato `stress`, che sui numeri di area e incroci sembrava il vincitore. Un
layout che impila le scatole passa qualunque altro controllo.

## 10. Domande chiuse nel brainstorming

- **Quale algoritmo** — deciso con lo spike, non a tavolino: `layered`. §2.
- **Cosa attiva il layout** — solo un comando manuale. Non all'import: l'import
  diventerebbe asincrono e il dialog dovrebbe attendere, per una griglia che è
  già leggibile. Non a ogni modifica: il diagramma si riassesterebbe sotto le
  mani e le posizioni scelte a mano non sopravvivrebbero.
- **Layout sulla selezione** — fuori. Fissare i nodi non selezionati come
  vincoli richiede in ELK un sottografo separato, cioè un secondo adattatore e
  una seconda serie di casi, per un'esigenza che nessuno ha ancora espresso.
- **Direzione** — `DOWN` con archi invertiti: padri sopra, figlie sotto. È la
  convenzione di SchemaSpy e dbdiagram, ed è anche la più economica sui numeri
  (metà dell'area di `RIGHT` a 200 tabelle, 157 ms contro 316).

## 11. Fuori scope

Rotte degli archi calcolate da ELK: il canvas le ricava dai rettangoli a ogni
render (`edge-routing.ts`), quindi le rotte di ELK si buttano e al worker si
chiedono solo le posizioni dei nodi. Layout incrementale che rispetta le
posizioni esistenti. Layout della selezione. Scelta dell'algoritmo esposta
all'utente. Animazione della transizione fra le posizioni vecchie e nuove.
Gerarchie di nodi (`children` di ELK), che servirebbero a raggruppare per
schema: nessuno lo ha chiesto e il modello non ha gruppi.
