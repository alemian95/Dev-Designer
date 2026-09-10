# Class diagram UML — design

Data: 2026-09-10
Spec di riferimento: `docs/superpowers/specs/2026-09-06-dev-designer-design.md`
(§2, punto 2 dell'ordine di consegna; il punto 1 è chiuso)
Sottosistema: un secondo tipo di diagramma, e la giuntura che permette al canvas
di non sapere quale dei due sta disegnando.

## 1. Obiettivo

Un secondo tipo di documento: class diagram UML, con classi, membri tipizzati e
i sei tipi di relazione, disegnabile a mano e esportabile in Mermaid.

Il valore non è il disegno in sé — quello lo fa qualunque strumento. È che il
class diagram eredita, senza scriverlo di nuovo, tutto quello che il punto 1 ha
costruito e misurato: undo a patch, autosave, apri/salva su file, viewport,
routing ortogonale degli archi, auto layout con ELK, export SVG e PNG.

## 2. Confini: cosa il class diagram non è

**Non è un documento misto.** Un documento è ER o class, scelto alla creazione,
e non si converte. Il multi-diagramma è fuori scope per la spec madre.

**Non ha una porta d'ingresso automatica.** L'ER prende valore dall'import DDL;
qui l'import da codice sorgente, da Mermaid e da PlantUML sono fuori scope per
la spec madre. L'unico modo di riempire il diagramma è scriverlo, e questo
sposta tutto il peso della progettazione sull'ergonomia di scrittura (§5): se
digitare venti attributi è lento, lo strumento non si usa.

**Non è UML completo.** Vedi §16.

## 3. Architettura: la giuntura in due metà

Oggi ogni strato sopra il modello dà l'ER per scontato: `erDiagram(doc)` —
l'accessor che lancia se il tipo non è `"er"` — ha 57 chiamate in 24 file. Il
modello, però, è già pronto: `DiagramSchema` è una `discriminatedUnion("type",
[ErDiagramSchema])` con il commento che prevede gli altri tre tipi.

L'approccio scelto: **estrarre la giuntura al livello del canvas**. Il canvas,
il reducer delle interazioni, il registry DOM e i layer smettono di conoscere
l'ER e lavorano su un'interfaccia piccola, dichiarata una volta per tipo di
diagramma. `erDiagram()` sopravvive dove è corretto che stia — dentro i comandi
ER, la validazione ER, gli emettitori e i pannelli ER — e scompare da
`src/ui/canvas/**` e da `src/ui/layout-actions.ts`.

Scartati, e perché:

- **Due editor paralleli**, uno per tipo, montati su `doc.diagram.type`. Rischio
  zero sul percorso ER e consegna più rapida, ma duplica ~600 righe fra
  `interaction.ts`, `edge-routing.ts` e il registry — il codice più sottile del
  progetto — e da lì ogni fix di prestazioni e ogni voce del debito tecnico va
  applicata due volte. Al flowchart diventerebbe la terza copia.
- **Modello generico «nodi e archi» con payload tipizzati**, di cui l'ER diventa
  un caso. Più pulito sulla carta, ma è un refactoring big-bang di codice
  consegnato e funzionante: `SCHEMA_VERSION` 2 con una migrazione vera, comandi
  ER e validazione riscritti, e2e dell'ER da rifare. Per una feature che non lo
  richiede.

### Perché due metà e non un'interfaccia sola

ESLint vieta a `src/editor/**` di importare React (`eslint.config.js`, strato
editor). Dati e rendering non possono quindi stare nello stesso oggetto, e la
divisione non è una scelta di gusto.

**Metà dati e comandi — `src/editor/kinds/`.** TypeScript puro, e questo è il
motivo principale per volerla: il progetto non ha jsdom, quindi è la sola parte
della giuntura che i test unitari possono coprire.

```ts
export interface DiagramOps {
  nodeKeys(): string[]
  rectOf(key: string, at?: Point): Rect | null
  edgesTouching(keys: ReadonlySet<string>): EdgeEnds[]
  edgeGeometry(key: string, a: Rect, b: Rect): EdgeGeometry | null
  addNode(at: Point): { key: string; recipe: Recipe }
  addEdge(source: string, target: string): { key: string; recipe: Recipe }
  deleteItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null
  duplicateNodes(keys: readonly string[]): { keys: string[]; recipe: Recipe }
  layoutGraph(): LayoutGraph
  validate(): Issue[]
}

/** Chiuso sullo snapshot del documento: il chiamante lo ricrea a ogni lettura
 *  dello store, esattamente come fa oggi con `erDiagram()`. */
export function opsFor(doc: DevDocument): DiagramOps
```

I dieci metodi non sono inventati. Otto vengono dai punti in cui il codice
esistente sa cos'è un'entità: i sette di `use-canvas-interaction.ts`
(`collectDragTargets`, `previewDrag`, `entityCenter`, `entitiesIn`, e i tre
effetti che chiamano i comandi ER) più `deleteSelection` e `duplicateSelection`
in `actions.ts`. Gli altri due, `layoutGraph` e `validate`, sono le funzioni per
tipo che già esistono.

`selectAllNodes` e `fitToContent` **non** sono nell'interfaccia: si scrivono
sopra `nodeKeys()` e `rectOf()` senza aggiungere superficie.

### Tre comandi che non sono per tipo

`moveNodes`, `setCollapsed` e `applyLayout` toccano **soltanto `view.nodes`**, e
quella forma è identica nei due tipi di diagramma: chiamano `erDiagram()` solo
per restringere la union, non perché guardino il modello. Diventano quindi
codice condiviso in `src/editor/commands/view.ts`, sopra un accessore
`diagramView(draft)` che legge la proprietà comune della union, e escono dalla
superficie per tipo. Tre implementazioni in meno da scrivere due volte, e il
drag e l'auto layout restano un solo pezzo di codice per entrambi i tipi.

`opsFor` è chiuso sul documento invece di ricevere il diagramma a ogni metodo
perché l'hook rilegge già `documentStore.getState().doc` a ogni `pointermove`:
il costo è un object literal con closure per evento, nulla sul percorso a 60 FPS.

**Metà rendering — `src/ui/canvas/kinds/`.** Piccola, perché i layer si
sottoscrivono già da sé allo store.

```ts
export interface DiagramView {
  /** Layer sottoscritti allo store, per il canvas. */
  NodesLayer: ComponentType
  EdgesLayer: ComponentType
  /** Viste pure guidate dalle prop, per l'export immagini (§10). */
  NodeView: ComponentType<NodeViewProps>
  EdgeView: ComponentType<EdgeViewProps>
  /** Corpo del pannello proprietà. */
  Properties: ComponentType
  tools: {
    node: { label: string; key: string; Icon: LucideIcon }
    edge: { label: string; key: string; Icon: LucideIcon }
  }
  /** Formati dell'export testo: tre per l'ER, uno per le classi. */
  textFormats: TextFormat[]
}
export function viewFor(type: Diagram["type"]): DiagramView
```

### La rinomina del vocabolario, e cosa non rompe

`Hit.kind` e `SelectionKind` passano da `"entity" | "relationship"` a
`"node" | "edge"`; l'effetto `create-entity` diventa `create-node`; `Tool`
diventa `"select" | "node" | "edge"`; `selectAllEntities` diventa
`selectAllNodes`.

Tre cose che questo **non** rompe, verificate sul codice:

1. **Il contratto DOM è già neutro.** `hitTest` cerca `[data-node-id]` e
   `[data-edge-id]`, e gli script e2e usano solo quei selettori: nessuna
   asserzione e2e cambia.
2. **La selezione non è persistita.** Vive in `sessionStore`, che per progetto
   non entra né nell'undo né nel file, quindi il cambio di prefisso
   `entity:` → `node:` non ha niente da migrare.
3. **`interaction.ts` non chiama `erDiagram()`.** È già un reducer puro con i
   suoi test: cambiano le stringhe, non la logica.

Restano intoccati `dom-registry` (a meno del blocco in §7), `routeEdge`,
`viewport`, `document-store`, l'autosave e la persistenza.

## 4. Il modello

Chiave di una classe: **il nome nudo**. Nessun qualificatore di schema, quindi
nessun equivalente di `entityKey` e nessuna delle sue ambiguità.

```ts
export const VisibilitySchema = z.enum(["public", "private", "protected", "package"])
export const StereotypeSchema = z.enum(["class", "interface", "abstract", "enum"])

export const ClassAttributeSchema = z.object({
  name: Identifier,
  /** Tipo nel linguaggio di chi scrive, come stringa. Nessun sistema di tipi
   *  unificato: la stessa scelta dell'ER. Vuoto è legale (valori di enum). */
  type: z.string(),
  visibility: VisibilitySchema,
  isStatic: z.boolean(),
})

export const ParameterSchema = z.object({ name: Identifier, type: z.string() })

export const ClassMethodSchema = z.object({
  name: Identifier,
  /** Tipo di ritorno; vuoto per un costruttore. */
  type: z.string(),
  visibility: VisibilitySchema,
  isStatic: z.boolean(),
  isAbstract: z.boolean(),
  parameters: z.array(ParameterSchema),
})

export const ClassNodeSchema = z.object({
  name: Identifier,
  stereotype: StereotypeSchema,
  attributes: z.array(ClassAttributeSchema),
  methods: z.array(ClassMethodSchema),
})
```

**Due array e non uno.** UML ha due scomparti sotto l'header e due array li
rendono direttamente. L'alternativa — un array solo di membri con
`parameters: null` a distinguere attributo da metodo — è un tipo che mente sulla
propria forma, e ogni consumatore paga il ramo.

**`isStatic` e `isAbstract`, non `static` e `abstract`.** Legali come nomi di
proprietà, ma `const { static } = m` è un errore di sintassi: la mina non entra
nel renderer.

```ts
export const RelationKindSchema = z.enum([
  "association", "generalization", "realization", "composition", "aggregation", "dependency",
])

export const ClassEndSchema = z.object({
  /** Chiave della classe, cioè il suo nome. */
  class: Identifier,
  /** "1", "0..*", "1..n": testo libero, nessuna grammatica da validare. */
  multiplicity: z.string(),
  role: z.string(),
})

export const ClassRelationSchema = z.object({
  kind: RelationKindSchema,
  name: z.string().optional(),
  /** Il figlio: sottoclasse, implementatore, parte, dipendente. */
  source: ClassEndSchema,
  /** Il padre: superclasse, interfaccia, tutto, dipendenza. */
  target: ClassEndSchema,
})
```

**La convenzione `source`/`target` è deliberatamente la stessa dell'ER**, dove
`source` è il lato della foreign key (la figlia) e `target` il referenziato (il
padre). Due conseguenze, entrambe volute:

- `layoutGraph` inverte gli archi esattamente come già fa per l'ER, e le
  superclassi finiscono in alto senza una riga in più: la convenzione «padri in
  alto» dell'ADR 0006 vale già per la generalizzazione UML.
- Il rombo della composizione va sul *tutto*, che è il `target`. È l'errore che
  si fa di solito, e la convenzione lo risolve prima che si presenti (§7).

La `view` riusa `NodeViewSchema` così com'è: `{x, y, collapsed}`, dove
`collapsed` mostra il solo header. Nessun terzo stato «solo attributi».

```ts
export const ClassDiagramSchema = z.object({
  type: z.literal("class"),
  model: ClassModelSchema,   // { classes: Record<string, ClassNode>, relations: Record<string, ClassRelation> }
  view: z.object({ nodes: z.record(z.string(), NodeViewSchema) }),
})
export const DiagramSchema = z.discriminatedUnion("type", [ErDiagramSchema, ClassDiagramSchema])
```

**Nessuna migrazione.** La tabella delle migrazioni è vuota e la versione 1 è la
prima; i file esistenti sono tutti `type: "er"` e continuano a validare contro
la union allargata. `SCHEMA_VERSION` resta 1.

## 5. La sintassi dei membri e il parser

Doppio click sul **corpo** della classe: si apre una `textarea` sovrapposta al
nodo — stesso schema di `InlineEditor` (posizione da `worldToScreen`, commit sul
blur, Escape ripristina) — con una riga per membro.

| Testo | Significato |
|---|---|
| `+ id: int` | attributo pubblico di tipo `int` |
| `- nome: string` | privato |
| `# creatoIl: DateTime` | protetto |
| `~ interno: bool` | package |
| `nome: string` | visibilità assente: pubblico |
| `IN_CORSO` | attributo senza tipo — così si scrivono i valori di un enum |
| `+ salva(x: int, y: string): void` | metodo |
| `+ {static} conta(): int` | metodo statico |
| `+ {abstract} render(): string` | metodo astratto |
| `+ Persona(nome: string)` | tipo di ritorno assente: costruttore |

Le regole sono quattro:

1. La **visibilità** è il primo carattere se è uno di `+ - # ~`; altrimenti il
   membro è pubblico.
2. I **modificatori** stanno fra graffe subito dopo la visibilità, in qualsiasi
   ordine. Solo `static` e `abstract`.
3. Un membro è un **metodo se contiene `(`**, altrimenti un attributo.
4. Il **tipo** è ciò che segue l'ultimo `:` fuori dalle parentesi; se manca è
   stringa vuota, e un tipo vuoto si rende come niente, non come `: `.

I parametri si scrivono `nome: tipo`, separati da virgola. Un parametro senza
`:` è un nome con tipo vuoto, per coerenza con gli attributi.

I quattro caratteri di visibilità sono **gli stessi di Mermaid**, quindi l'export
di §9 è una mappatura e non una traduzione. Non vale il contrario: accettare in
ingresso la grafia di Mermaid (`$` statico, `*` astratto) **non è un obiettivo**
— l'import da Mermaid è fuori scope, e due grafie raddoppierebbero i casi del
parser per una capacità che nessuno ha chiesto.

### Come si fallisce

L'insieme dei fallimenti è chiuso e corto, perché i default sono permissivi:

- parentesi non bilanciate (`+ salva(x: int`);
- una graffa che non è `static` né `abstract`;
- nome vuoto (`+ : int`).

Quando una riga fallisce **il commit viene rifiutato**: la `textarea` resta
aperta col testo intatto e l'avviso dice quale riga e perché. È il
comportamento che `CommitInput` ha già quando `onCommit` torna `false` (la
correzione DT-3 in `docs/debito-tecnico.md`). Perdere in silenzio venti righe
appena scritte è l'unico esito inaccettabile.

Un **nome di membro duplicato non è un errore di parsing**: entra nel modello e
diventa un `Issue` nel pannello problemi (§8), come `duplicate-attribute` per
l'ER. Il diagramma resta scrivibile mentre lo si sistema.

### Il round trip è l'invariante

Il doppio click deve riaprire come testo dei membri che sono già strutturati,
quindi servono due funzioni distinte, e la distinzione è il punto:

- `memberText(members)` — la forma **canonica** per la `textarea`: `+ id: int`,
  spazio singolo.
- `memberLines(members)` — la forma **resa** sul nodo, colonne allineate con
  spazi come già fa `attributeLines`, perché il font è monospace e
  l'allineamento è deterministico senza misurare nel DOM.

Il test che conta più di ogni altro: `parseMembers(memberText(m))` uguale a `m`,
su un campione che copre tutte e dieci le righe della tabella.

**Dove sta:** `src/model/class/members.ts`, TypeScript puro senza dipendenze,
parser e serializzatore nello stesso file perché sono la coppia che deve
restare coerente.

**Cosa non entra nel testo dei membri:** il nome della classe (doppio click
sull'header, come oggi per l'entità) e lo stereotipo (select nel pannello: un
valore su quattro, un click contro tredici caratteri). Il corpo è solo membri.
Costo: `sessionStore.editing` passa da `{key}` a `{key, target: "name" | "body"}`.

## 6. Geometria e rendering del nodo

Tre scomparti invece dei due dell'entità: header, attributi, metodi. Lo
stereotipo si rende come lo rende UML — `«interface»` su una riga dentro
l'header per `interface` ed `enum`, nome in corsivo per `abstract`, niente per
`class` — quindi l'altezza dell'header è variabile.

```
h = HEADER_H + (stereotipo con riga propria ? STEREO_H : 0)
  + attributi.length * ROW_H + (attributi.length ? 6 : 0)
  + metodi.length    * ROW_H + (metodi.length    ? 6 : 0)
```

Con `collapsed`, i due scomparti dei membri valgono zero. La larghezza è la
formula di `entitySize` applicata al carattere più lungo fra nome, stereotipo e
righe dei membri: `max(MIN_W, ceil((chars * CHAR_W + 2 * PAD_X) / GRID) * GRID)`.

**Uno scomparto vuoto non si disegna.** UML lo consente, e una classe di soli
attributi con una fascia vuota sotto spreca spazio; è già il comportamento
dell'entità senza attributi.

## 7. Gli archi: sei tipi

| tipo | linea | punta |
|---|---|---|
| associazione | continua | nessuna |
| generalizzazione | continua | triangolo vuoto sulla superclasse |
| realizzazione | tratteggiata | triangolo vuoto sull'interfaccia |
| composizione | continua | rombo **pieno** sul tutto |
| aggregazione | continua | rombo **vuoto** sul tutto |
| dipendenza | tratteggiata | freccia aperta sulla dipendenza |

Con la convenzione di §4, **ogni punta cade sul `target` e il `source` è sempre
nudo**. `umlMarkerPath(point, dir, kind)` è quindi una funzione sola, contro le
due della zampa di gallina, e `routeEdge` — che lavora su due `Rect` e non sa
cosa colleghi — non cambia.

**Tratteggio e riempimento non toccano la geometria.** Sono prop statiche del
renderer (`strokeDasharray` e `fill` in `RelationshipEdge.tsx`), dipendono dal
`kind` e non dalla posizione: `setEdgeGeometry` riscrive solo attributi `d`.

**`EdgeGeometry` guadagna però due campi**, perché le molteplicità sono due
etichette vicino ai capi e durante un drag devono seguire l'arco:

```ts
export interface EdgeGeometry {
  d: string; sourceMarker: string; targetMarker: string; label: Point
  sourceEnd?: Point   // capo per la molteplicità; assente per l'ER
  targetEnd?: Point
}
```

e `setEdgeGeometry` guadagna un blocco condizionato, identico in forma a quello
che ha già per `data-edge-label` — che è già opzionale e già salta quando
l'elemento non c'è. Sono due `querySelector` in più per arco toccato dal drag,
sul percorso a 60 FPS: la misura di §14 lo verifica, e se costano le etichette
si spostano fuori dal `<g>` dell'arco.

## 8. Validazione

`validateClass(model): Issue[]`, funzione pura come `validateEr`. Le severità
seguono la convenzione in uso: **errore** per i difetti strutturali, **avviso**
per i consigli di modellazione.

| codice | severità | cosa trova |
|---|---|---|
| `class-name-clash` | avviso | due classi che differiscono solo per maiuscole |
| `duplicate-member` | errore | attributo con lo stesso nome, o metodo con nome **e tipi dei parametri** identici; un overload con parametri diversi è legale e non va segnalato |
| `dangling-relation` | errore | un estremo che punta a una classe inesistente |
| `generalization-cycle` | errore | `A` estende `B` estende `A`: DFS sugli archi di generalizzazione e realizzazione |
| `abstract-method-in-concrete-class` | avviso | un metodo `{abstract}` in una classe con stereotipo `class` |

Il ciclo di generalizzazione è **l'unica regola concettualmente nuova** del
progetto: nell'ER un ciclo di foreign key è legittimo, in una gerarchia di
ereditarietà no, e qualunque generatore di codice ci girerebbe dentro senza fine.

`Issue` si sposta in `src/model/issue.ts`, con `node?`/`edge?` al posto di
`entity?`/`relationship?` e `IssueCode` come union dei codici di entrambi i
tipi. L'`IssuesPanel` **non cambia**: legge `severity` e `message`, mai il
codice.

## 9. Export Mermaid

Unico export testuale delle classi. La sintassi viene dalla documentazione
corrente di Mermaid, non dalla memoria, e corregge due cose che sarebbero state
sbagliate: nei campi **il tipo precede il nome**, e i classificatori `$`
(statico) e `*` (astratto) vanno **in coda**, dopo il tipo di ritorno.

| nostro modello | riga emessa |
|---|---|
| attributo `+ id: int` | `+int id` |
| attributo senza tipo | `+IN_CORSO` |
| attributo statico | `+int contatore$` |
| metodo `+ salva(x: int, y: string): void` | `+salva(int x, string y) void` |
| metodo senza tipo di ritorno | `+Persona(string nome)` |
| metodo statico | `+conta() int$` |
| metodo astratto | `+render() string*` |
| stereotipo | `<<interface>>`, `<<abstract>>`, `<<enumeration>>`; `class` non emette niente |

Il nostro `enum` diventa `enumeration`: è il nome che Mermaid usa.

I parametri non sono documentati da Mermaid, che li rende come testo dentro le
parentesi. Si emette `tipo nome`, per coerenza con i campi.

### I lati delle relazioni

Si emettono **solo i token documentati**, e quelli non mettono il padre tutti
dallo stesso lato. La posizione cambia quindi per riga, e questa tabella è
normativa:

| nostro `kind` | riga emessa | a sinistra c'è |
|---|---|---|
| `generalization` | `Padre <\|-- Figlio` | il **target** (padre) |
| `realization` | `Implementatore ..\|> Interfaccia` | il **source** |
| `composition` | `Tutto *-- Parte` | il **target** (tutto) |
| `aggregation` | `Tutto o-- Parte` | il **target** |
| `dependency` | `Dipendente ..> Dipendenza` | il **source** |
| `association` | `A -- B` | il **source** |

Le molteplicità si scrivono fra apici **ai lati dell'arco**
(`Padre "1" <|-- "0..*" Figlio`), quindi l'emettitore deve appiccicarle al lato
dove quella classe è finita, riga per riga. **Invertirle su tre righe su sei è
il difetto più probabile della feature**, ed è la ragione della forma dei test
in §13. L'etichetta va in coda: `A -- B : possiede`.

**Dove sta:** `src/io/emit/class-mermaid.ts`. L'attuale `src/io/emit/mermaid.ts`
si rinomina `er-mermaid.ts`: ha due soli importatori, e in cambio non resta un
file chiamato «mermaid» che emette solo ER. Nessuna sottocartella: `src/io/emit`
ha quattro file, dividerlo sarebbe simmetria fine a sé stessa.

## 10. UI

**Creazione.** `createClassDocument(name)` accanto a `createErDocument`, e
`documentIo.newDocument()` guadagna `type` con default `"er"`, così ogni
chiamata esistente resta valida. «Nuovo» diventa un sottomenu di due voci:
«Diagramma ER» e «Class diagram».

**Strumenti.** I tre slot restano tre, ma etichetta, icona e tasto vengono dal
tipo di diagramma (`DiagramView.tools`): «Entità (E)» e «Relazione (R)» per
l'ER, «Classe (C)» e «Relazione (R)» per le classi. Il tasto è dichiarato dal
tipo invece di essere cablato nelle scorciatoie, perché «Classe (E)» sarebbe un
tooltip che mente.

**Lo strumento relazione crea sempre un'associazione**, e il tipo si cambia nel
pannello. È il motivo per cui `addEdge(source, target)` non ha un parametro
`kind`: sei strumenti in toolbar, o un menu a tendina sullo strumento, per una
cosa che si corregge con un click, è complessità che non paga.

**Pannello proprietà.** Mostra ciò che il testo dei membri **non** esprime:

- classe selezionata: nome, stereotipo (select di quattro), conteggio dei membri
  in sola lettura;
- relazione selezionata: tipo (select di sei), nome, e per ciascun estremo
  molteplicità e ruolo.

**Nessuna riga di form per membro**, deliberatamente: sarebbe la ricostruzione
integrale dell'alternativa scartata in §15, e due editor per lo stesso dato
divergono.

**Export immagini.** `svg.tsx` rende le varianti pure guidate dalle prop, non
quelle agganciate allo store: è la ragione per cui `DiagramView` porta sia i
layer sottoscritti sia `NodeView`/`EdgeView`.

## 11. Cosa arriva gratis

Ereditato senza scrivere codice nuovo: undo/redo a patch, autosave in IndexedDB,
apri e salva su file, sola lettura fra schede, viewport e zoom, `routeEdge`,
`dom-registry`, l'export SVG e PNG (col renderer di §6), e l'**auto layout** —
`LayoutGraph` è già `{id, w, h}` più archi, quindi ELK è agnostico, e
`layered DOWN` con i padri in alto è già la convenzione che una gerarchia di
ereditarietà vuole. Nessun ADR nuovo, nessuna opzione ELK diversa.

## 12. Riordino dei file

Tre spostamenti, tutti rinomine meccaniche di import, ognuno giustificato dal
fatto che il file in questione mescolerebbe due tipi di diagramma:

1. **Schemi del modello.** Gli schemi ER escono da `src/model/document.ts` (98
   righe, che diventerebbero ~200 con due tipi dentro) verso
   `src/model/er/schema.ts`; le classi in `src/model/class/schema.ts`. In
   `document.ts` restano la union e `DocumentSchema`; `SCHEMA_VERSION`,
   `Identifier` e `NodeView` scendono in `src/model/shared.ts`, che non importa
   nessun altro modulo. Non è pignoleria: i due `createXDocument` leggono
   `SCHEMA_VERSION` come valore, e tenerlo in `document.ts` chiude con la union un
   ciclo di **valori** — misurato in fase di implementazione, rompeva 12 file di
   test su 30. Precedente: `src/model/er/validate.ts` esiste già.
2. **Geometria.** `src/editor/er-geometry.ts` ha 18 importatori, e sei vogliono
   solo la metà condivisa. Diventa `src/editor/geometry.ts` (costanti, `snap`,
   `Point`/`Rect`/`Size`, `rectsBounds`, `rectsIntersect`) più
   `src/editor/er/geometry.ts` e `src/editor/class/geometry.ts`.
3. **`Issue`** in `src/model/issue.ts` (§8).

## 13. Test

Il progetto non ha jsdom, ma questo **non** significa che i componenti non si
testino: `src/ui/canvas/render.test.tsx` rende le viste guidate dalle prop con
`renderToStaticMarkup` di `react-dom/server` e asserisce sul markup — nessun DOM
richiesto. Quello che jsdom impedirebbe sono i test di *interazione*: eventi,
hook, fuoco, clipboard. Quelli vanno negli e2e sulla build di produzione.

La ripartizione segue quella linea: le viste pure si testano unitariamente, le
interazioni no.

**Unitari:**

- `members.ts`: il round trip `parseMembers(memberText(m)) === m` sulle dieci
  righe della tabella di §5, più i tre modi di fallire.
- `class/geometry.ts`: dimensioni con zero, uno e due scomparti pieni; i path
  delle punte per i sei tipi.
- `validateClass`: i cinque codici, e il ciclo di generalizzazione con un ciclo
  di lunghezza 2 e uno di lunghezza 3.
- `class-mermaid.ts`: **un caso per ciascuno dei sei tipi di relazione, con
  molteplicità asimmetriche** (`"1"` da un lato, `"0..*"` dall'altro). È il solo
  modo di far fallire uno scambio dei lati: con molteplicità uguali il test
  passerebbe anche invertite.
- `DiagramOps` delle classi, tutti e dieci i metodi — **e la stessa batteria
  eseguita contro le ops dell'ER**, che è ciò che dimostra che la giuntura non ha
  cambiato il comportamento esistente.
- `ClassNodeView` e `ClassEdgeView` con `renderToStaticMarkup`, come già fa
  `render.test.tsx` per l'ER: tre scomparti, scomparto vuoto non disegnato,
  stereotipo con e senza riga propria, e i sei tipi di arco con il tratteggio e
  il riempimento giusti.

**Regressione del refactoring:** i 332 test esistenti devono restare verdi
attraverso i tre spostamenti di §12. Se uno si rompe, la rinomina ha cambiato
semantica.

**Sesta scena e2e**, `scripts/e2e/class.mjs`, perché la `textarea` dei membri è
interazione — fuoco, digitazione, commit sul blur — e quella è esattamente la
categoria che senza jsdom non si prova altrove: crea un documento classe, due classi,
scrive i membri nel corpo, collega, cambia il tipo in generalizzazione dal
pannello, clicca «Disponi» e verifica che **il padre stia sopra il figlio**,
poi esporta Mermaid e controlla che la riga contenga `<|--` **con il padre a
sinistra**. Quell'ultima asserzione prende il difetto delle frecce invertite in
un browser vero, che è come si è preso quello dell'export SVG.

## 14. Prestazioni

`pnpm perf` sullo stesso N prima e dopo il refactoring della giuntura, con la
tabella allegata al piano. Serve per due ragioni concrete: le funzioni interne
di `use-canvas-interaction.ts` vengono riscritte, e `setEdgeGeometry` guadagna
due `querySelector` (§7). Il criterio resta quello della spec madre: p95 ≤ 20 ms.

## 15. Domande chiuse durante il brainstorming

- **Quanta notazione UML?** Standard pragmatico: visibilità, tipi, `static`,
  `abstract`, quattro stereotipi, sei relazioni con molteplicità e ruoli.
  Scartato il minimo «scatole e frecce con membri come testo libero», perché
  rende impossibile qualunque export analizzabile; scartato l'UML esteso
  (generici, package, note, classi di associazione), perché documentando codice
  reale non serve quasi mai.
- **Come si inseriscono i membri?** Testo strutturato sul nodo. Scartato «solo
  pannello proprietà», perché venti attributi sarebbero venti giri di click e
  non si potrebbe incollare niente.
- **Quali export?** Solo Mermaid. Valutati e scartati PlantUML (una seconda
  grafia da mantenere senza un uso reale) e la generazione di scheletri PHP o
  TypeScript (decisioni aperte su namespace, corpi dei metodi e un file per
  classe, per una capacità non richiesta).
- **Come convive con l'ER?** Giuntura al livello del canvas (§3). Scartati i due
  editor paralleli e il modello generico.
- **Un documento può contenere entrambi?** No: la spec madre mette il
  multi-diagramma fuori scope.

## 16. Fuori scope

Generici (`List<T>`), package, note, classi di associazione, classi annidate,
visibilità sui pacchetti, righe di form per membro nel pannello, PlantUML,
generazione di codice, import da Mermaid o da codice sorgente, documenti
multi-diagramma, conversione di un documento ER in class diagram.
