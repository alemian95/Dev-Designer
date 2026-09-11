# Class diagram, primo giro di ampiezza — design

> Estende `2026-09-10-class-diagram-design.md`, che resta il documento madre:
> qui si citano le sue sezioni per numero e non se ne ripetono le decisioni.

## 1. Obiettivo

Quattro voci, scelte perché il diagramma serve a **progettare prima di
scrivere** e a **comunicare a qualcun altro** — non a documentare codice che
esiste già. L'import da sorgente resta quindi fuori, e con lui cade il motivo
principale per cui si sarebbe voluta una porta d'ingresso automatica.

1. **Note** libere sul canvas.
2. **Navigabilità** delle associazioni.
3. **Export Mermaid onesto**: oggi perde dati in silenzio e in un caso non si
   rende affatto.
4. **Sottolineato dello statico**, la forma normativa UML.

Le prime due aggiungono cose da disegnare; la terza chiude un difetto che
esiste già; la quarta è resa.

## 2. Confini

**Il package resta fuori**, ed è la voce più grossa che resta fuori. Non è una
dimenticanza: cambia `rectOf` e i bounds, cambia il drag — trascinare un
contenitore muove il contenuto — obbliga ELK a un layout gerarchico e obbliga
`buildSvg` a inquadrare i contenitori. Vale una spec sua.

**La nota non si ancora a una classe.** Vedi §4: `note for Cliente` sembra una
riga tratteggiata e invece è un arco, con le conseguenze che §4 elenca.

**I valori di default e le property string non diventano campi del modello.**
Restano testo dentro il tipo, come sono oggi. §6 si limita a non mentire su di
loro in export.

## 3. Le misure su cui poggia la §6

La §9 del documento madre dice che la sintassi Mermaid viene dalla
documentazione corrente e non dalla memoria. Qui si va oltre: la
documentazione è stata **contraddetta dalla misura in due punti**, quindi la
tabella che segue viene da `mermaid@11` fatto girare davvero su ciò che
`emitClassMermaid` produce oggi.

| sorgente nostra | riga emessa oggi | cosa rende `mermaid@11` |
|---|---|---|
| `+ ordini: List<Ordine>` | `+List<Ordine> ordini` | **`+List ordini`** — il parametro sparisce |
| `+ trova(id: int): Collection<Cliente>` | `+trova(int id) Collection<Cliente>` | **`+trova(int id) : Collection`** |
| — | `+List~Ordine~ ordini` | `+List<Ordine> ordini` ✓ |
| — | `+Map~string, int~ mappa` | `+Map<string, int> mappa` ✓ |
| — | `+Map~string, List~int~~ mappa` (annidato) | **`+Map<string, List<int~> mappa`** — mangled: Mermaid non sa rendere un generico annidato dentro un altro |
| `+ nome: string {readOnly}` | `+string {readOnly} nome` | **errore di parsing, nessun diagramma** |
| `- saldo: decimal = 0` | `-decimal = 0 saldo` | `-decimal = 0 saldo`, passa |
| `+ /eta: int` | `+int /eta` | `+int /eta`, passa |

Due conseguenze, entrambe contro la documentazione:

- **I generici con la virgola funzionano.** La pagina di Mermaid dice che i
  generici separati da virgola non sono supportati; `Map~string, int~` rende
  `Map<string, int>`. La regola di §6 non ha quindi un caso speciale per la
  virgola.
- **Una sola graffa in un tipo non rompe la propria riga: rompe l'intero
  export.** L'errore è `Expecting 'STRUCT_STOP', 'MEMBER', got
  'OPEN_IN_STRUCT'`. Non è un difetto cosmetico di una riga, è un file
  inutilizzabile.
- **Un generico annidato non è rappresentabile.** Non è un problema di
  escaping: `Map<string, List<int>>` tradotto in tilde produce un doppio
  livello (`Map~string, List~int~~`) che Mermaid non sa disambiguare, e rende
  testo mangled. Si continua a emettere la forma a tilde — è comunque la meno
  peggio, ed è quella che l'utente incolla — ma con un avviso: §6 lo tratta
  come terza categoria, accanto ad angolari sbilanciate e graffe.

## 4. Note

### Una nota è un nodo

`ClassModel` guadagna un terzo record, e la nota vive in `view.nodes` insieme
alle classi:

```ts
export const ClassNoteSchema = z.object({ text: z.string() })
export type ClassNote = z.infer<typeof ClassNoteSchema>

export const ClassModelSchema = z.object({
  classes: z.record(z.string(), ClassNodeSchema),
  relations: z.record(z.string(), ClassRelationSchema),
  notes: z.record(z.string(), ClassNoteSchema),
})
```

**La chiave è un uuid, non il testo.** Le classi hanno per chiave il proprio
nome (§4 del documento madre, che spiega perché non serve un `.refine`); una
nota non ha nome, e usare il testo come chiave renderebbe ogni battitura una
rinomina.

**Perché un nodo e non una terza specie.** `DiagramOps.nodeKeys()` legge già
`Object.keys(view.nodes)`. Dando alla nota una voce lì, selezione, drag,
marquee, duplica, cancella e undo funzionano senza una riga nuova nel canvas né
nelle azioni condivise. Cambia un solo metodo del seam, `rectOf`, che oggi
cerca in `model.classes` e torna `null` per una chiave che non c'è.

Lo spazio delle chiavi di `view.nodes` diventa quindi l'unione di nomi di
classe e uuid. Una classe chiamata come un uuid collide — è accettato: lo
stesso spazio è già condiviso e il caso richiede che l'utente scriva a mano
trentasei caratteri esadecimali con i trattini al posto giusto.

### Geometria e modifica

`noteSize(note)` con la stessa formula di `classSize` (§6 del documento madre):
larghezza dal carattere più lungo fra le righe, arrotondata alla griglia;
altezza dal numero di righe. Forma UML: rettangolo con l'angolo in alto a
destra piegato.

Doppio click apre una `textarea` di testo libero. **Nessun parser**, quindi
nessuno dei due comportamenti che `MembersEditor` ha dovuto costruire: niente
rifiuto sul blur, niente riapertura col cursore sulla riga sbagliata. Si
commette sul blur e basta. `collapsed` non si applica: una nota collassata non
vuol dire niente.

### Lo strumento

`Tool` è una union chiusa e diventa `"select" | "node" | "edge" | "note"`;
`DiagramView.tools` guadagna una terza voce **opzionale**, perché l'ER non ha
note e non deve dichiararne una:

```ts
tools: {
  node: ToolDef
  edge: ToolDef
  note?: ToolDef
}
```

`Toolbar.tsx` e `use-keyboard-shortcuts.ts` montano la terza voce solo se c'è.
`PropertiesPanel.tsx` compone oggi il messaggio di stato vuoto da
`tools.node.label` e `tools.edge.label`: con tre strumenti la frase va scritta
per esteso invece che composta, o diventa illeggibile.

### Quello che il seam deve imparare

| metodo | cosa cambia |
|---|---|
| `rectOf` | cerca anche in `model.notes`, e usa `noteSize` |
| `deleteItems` | le chiavi di nota arrivano mescolate a quelle di classe: `deleteClassItems` separa in tre invece che in due |
| `duplicateNodes` | una nota duplicata prende un uuid nuovo, non `uniqueKey` |
| `addNode` | invariato: la nota ha il proprio metodo, `addNote?`, **opzionale** — l'ER non ha note e non lo implementa |
| `layoutGraph` | **le note restano fuori** — vedi sotto |
| `validate` | invariato: una nota non produce nessun `Issue`, nemmeno vuota |

Il click con lo strumento nota non arriva al canvas direttamente: passa dal riduttore puro
`reduce` (`src/editor/interaction.ts`), che produce un `Effect` `create-note` eseguito dal hook.
Quell'effetto apre l'editor con `target: "body"` e non `"name"`, perché una nota non ha nome —
`editing.target` resta quindi la union di due casi che è oggi.

**Le note non entrano nel grafo di layout, e questo ha un costo che si
accetta.** ELK dispone un grafo di nodi e archi; una nota non ha archi, quindi
finirebbe piazzata dove capita, lontana da ciò che annota. Tenendola fuori,
«Disponi» muove le classi e lascia la nota dov'è — che è altrettanto sbagliato,
ma almeno è prevedibile e riparabile trascinandola. La scelta giusta sarebbe
muovere la nota con ciò a cui è ancorata, e l'ancoraggio è la voce che §2
esclude: è il prezzo dichiarato di quel taglio.

### Export

Mermaid: `note "testo"`, fuori dai blocchi `class`. Cinque sostituzioni sul
testo, tutte misurate su `mermaid@11` con lo stesso metodo di §3 (un secondo
giro di misura, successivo al primo):

- `&` diventa `#amp;`, **per prima** fra tutte: se un utente scrive già una
  propria entità (`&lt;`) e si escapasse prima `<`, il risultato sarebbe
  indistinguibile da un `<` vero appena escapato, e Mermaid la decodificherebbe
  due volte perdendo il testo originale. Escapando `&` per prima, `&lt;` esce
  `#amp;lt;` e rende `&lt;` letterale — esatto, misurato;
- `<` diventa `#lt;` e `>` diventa `#gt;`: senza queste due, l'HTML grezzo
  nella nota viene interpretato da Mermaid e il testo si perde (`<b>` apre un
  tag vero, non compare come testo);
- `"` diventa `#quot;`: **è stata misurata dentro una `note`** e rende la
  virgoletta vera. Non è più necessario scendere all'apice singolo, che era la
  scelta presa finché l'entità restava ipotetica;
- l'a capo vero diventa `<br>`, **dopo** le quattro sostituzioni precedenti:
  se girasse prima, il tag che emettiamo verrebbe a sua volta escapato in
  `#lt;br#gt;` e non andrebbe più a capo. `\n` letterale (la vecchia scelta) è
  stato scartato: misurato, rende un backslash-n visibile nell'etichetta, non
  un a capo.

`buildSvg` (`ui/export/svg.tsx`) è l'unico punto che legge i record grezzi del
modello, e la §3 del documento madre lo dice esplicitamente. Lì `nodeModels`
diventa l'unione di `classes` e `notes`, e `classView.NodeView` distingue i due
casi sulla presenza del campo `text`. Un discriminante esplicito
(`kind: "note"`) costringerebbe anche `ClassNode` a portarne uno per restare
una union pulita: non si paga un campo su ogni classe per un ramo solo.

## 5. Navigabilità

```ts
export const ClassRelationSchema = z.object({
  kind: RelationKindSchema,
  name: z.string().optional(),
  /** Solo per `association`: il `target` è raggiungibile dal `source`. Assente = non navigabile. */
  navigable: z.boolean().optional(),
  source: ClassEndSchema,
  target: ClassEndSchema,
})
```

Opzionale, quindi **nessuna migrazione**: assente significa non navigabile, che
è il comportamento di oggi.

Significativo **solo per `association`**. Gli altri cinque tipi hanno già la
punta che gli spetta dalla tabella di §7 del documento madre, e la dipendenza è
diretta per definizione. Il pannello mostra la casella solo per
l'associazione.

Render: freccia aperta sul `target`, la stessa forma che `umlMarkerPath` già
produce per `dependency`. Il ramo dell'associazione in `umlMarkerPath` smette
di essere un `return ""` incondizionato.

Mermaid: `-->` invece di `--`.

**Questo non contraddice il Ruling 16 del piano precedente: lo completa.**
Allora `--` era la scelta corretta *perché* `ClassRelation` non registrava il
verso, e `-->` avrebbe affermato una navigabilità che nessuno aveva dichiarato.
Registrandola, `-->` diventa un'affermazione vera. `--` resta ciò che si emette
per l'associazione non navigabile, che è il default.

## 6. Export onesto

Tre comportamenti distinti, uno per riga della tabella di §3.

### Generici: si traducono

I tipi emessi convertono le parentesi angolari in tilde. Nessun caso speciale
per la virgola: §3 l'ha misurato.

**La trappola è `=>`.** Un tipo come `(int) => void` è legale nella nostra
sintassi — il parser dei membri lo gestisce esplicitamente, ed è il quinto bug
del Task 8 — e una sostituzione cieca di `>` lo trasformerebbe in `(int) =~
void`. La regola esclude quindi il `>` preceduto da `=` o `-`:

```ts
type.replace(/</g, "~").replace(/(?<![=-])>/g, "~")
```

Se dopo la sostituzione il numero di tilde è dispari, il tipo non era una
forma generica bilanciata: si emette il tipo originale e si alza un avviso,
invece di produrre una sintassi a metà.

### Graffe: si rimuovono, e si avvisa

Un tipo che contiene `{` o `}` fa fallire il parsing dell'intero diagramma. Si
rimuove **ogni gruppo `{…}` graffe comprese**, si normalizzano gli spazi
rimasti e si taglia agli estremi, così `string {readOnly}` esce come `string` e
non come `string ` con uno spazio in coda. Una graffa spaiata — `string {read`
— si rimuove dalla graffa in poi, perché è comunque il carattere che rompe il
parser. L'avviso nomina i membri toccati.

**Avvisare senza rimuovere non è un'alternativa**: lascerebbe l'utente con un
file che non si rende, che è il caso peggiore fra i due. L'emettitore DDL fa
già esattamente questo — emette un tipo di ripiego e lo dichiara nei
`warnings`, otto casi diversi — e la coerenza fra i due emettitori è un valore
di suo.

### `= valore`: passa

Nessun intervento e **nessun avviso**. Mermaid lo rende letteralmente. Il tipo
resta semanticamente sbagliato — `decimal = 0` non è un tipo — ma questo è il
prezzo dichiarato di non modellare i valori di default (§2), non un difetto
dell'export.

### Il canale

`EmitResult.warnings` esiste già ed è mostrato dal dialogo di export testo.
L'emettitore delle classi ne usa oggi uno solo.

## 7. Sottolineato dello statico

Va fatto **per ultimo e isolato**, così si può abbandonare senza toccare il
resto: è il più piccolo per valore e il più insidioso per rischio.

Il rischio non è il `text-decoration`. È che `{static}` deve sparire dalla riga
**resa** e restare nel testo canonico della `textarea`, che è la sintassi che
`parseMembers` rilegge. `classSize` misura le righe per calcolare la larghezza
del nodo: se misura la riga canonica e il renderer ne disegna un'altra, il nodo
è largo quanto una riga che nessuno vede. È lo stesso difetto chiuso dal fix I2
del piano precedente, dove `classSize` faceva una passata sola di
`memberLines` e il renderer due.

`memberLines` restituisce quindi righe già rese, con gli indici del tratto da
sottolineare:

```ts
export interface MemberLine {
  /** Riga come va disegnata: senza `{static}`, già allineata a colonne. */
  text: string
  /** Estremi del nome dentro `text`, o `null` se il membro non è statico. */
  underline: { from: number; to: number } | null
}
```

`classSize` continua a usare `text.length` e non cambia forma. Il renderer
spezza in tre `<tspan>` solo le righe con `underline` non nullo; le altre
restano un `<text>` unico.

`{abstract}` **non** cambia: è notazione UML legittima, e il corsivo sarebbe
indistinguibile dal corsivo del nome di una classe astratta.

## 8. Migrazione dello schema

`notes` è un campo obbligatorio di `ClassModel`, quindi un documento salvato
prima non passa più la validazione zod. `SCHEMA_VERSION` passa da 1 a 2 e
`migrations` guadagna la sua prima voce vera — la mappa oggi è vuota, e questa
è la prima occasione in cui il meccanismo serve davvero.

Lo step dalla 1 alla 2 aggiunge `notes: {}` **solo ai diagrammi di tipo
`class`**: un documento ER non ha un `ClassModel` da migrare, e toccarlo
aggiungerebbe un campo che il suo schema rifiuta.

`navigable` è opzionale e non richiede niente.

Un campo `notes` opzionale eviterebbe la migrazione, ma poi ogni lettore
dovrebbe ramificare su `undefined` per sempre. La migrazione si scrive una
volta; il ramo si paga a ogni accesso.

## 9. Test

Valgono le regole del documento madre (§13): niente jsdom, viste pure con
`renderToStaticMarkup`, interazione solo in e2e, nomi inventati e mai un
frammento dei dump SQL reali.

Quello che va coperto e che altrimenti passerebbe:

- **`runMigrations` dalla 1 alla 2**, su un documento ER e su uno class: è la
  prima migrazione del progetto e il meccanismo non è mai stato esercitato.
- **La traduzione dei generici**, con `(int) => void` fra i casi: senza quel
  caso la regressione del `=>` non fallisce da nessuna parte.
- **La rimozione delle graffe**, verificando che l'avviso nomini i membri.
- **`classSize` contro il renderer** sulle righe statiche: la larghezza
  calcolata deve corrispondere alla riga resa, non a quella canonica. È il
  difetto che la §7 dichiara come rischio principale.
- **Un e2e** che crea una nota, ne cambia il testo e la trascina: la
  `textarea` di una nota e il drag di un nodo che non è una classe non
  esistono in nessun test unitario. La scena delle classi esiste già e questa
  le si aggiunge accanto.

## 10. Prestazioni

Nessuna delle quattro voci tocca il percorso a 60 FPS. Le note non hanno archi,
quindi non entrano in `edgesTouching` né in `setEdgeGeometry`; la navigabilità
è un ramo in `umlMarkerPath`, che gira già per arco; l'export non è interattivo;
i `tspan` si costruiscono nel render di React, non nell'anteprima imperativa del
drag.

Resta valido il criterio di §14 del documento madre: `pnpm perf` come controllo
di non regressione, con `zoom` già FAIL documentato.

## 11. Fuori scope

Package e namespace, ancoraggio delle note a una classe, valori di default e
property string come campi del modello, classi generiche (`Box<T>`
nell'header), associazioni n-arie, classi di associazione, qualificatori,
notazione lollipop per le interfacce, import da Mermaid o da codice sorgente,
anti-sovrapposizione globale degli archi (registrata in
`docs/debito-tecnico.md`), allineamento a colonne del `:`.
