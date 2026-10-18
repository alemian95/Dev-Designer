# Import di stateDiagram e registro dei formati Mermaid — design

Data: 2026-10-18
Mappa: [Mappa: import di state e sequence da Mermaid](https://github.com/alemian95/Dev-Designer/issues/21).
Ogni sezione rimanda al ticket che contiene la decisione e le alternative scartate.
Ricerca: [`docs/research/grammatica-state-sequence.md`](https://github.com/alemian95/Dev-Designer/blob/research/grammatica-state-sequence/docs/research/grammatica-state-sequence.md)
sul branch `research/grammatica-state-sequence`, da non mergiare.
Riferimenti: ADR 0001, 0007, 0008; spec `2026-10-15-import-mermaid-design.md` (qui «spec dell'import
Mermaid»); lessico in `GLOSSARY.md`.

## 1. Obiettivo

Importare un `stateDiagram` o uno `stateDiagram-v2` nella famiglia del flusso, come si importa oggi un
`flowchart`. Lo state importato è un flusso a tutti gli effetti: si modifica come un flusso ed esce come
`flowchart`. Non c'è una famiglia nuova e il formato del documento non cambia.

Prima dello state, un refactor a comportamento invariato porta l'import Mermaid su due registri, uno
dei formati Mermaid e uno dell'import per famiglia. Così lo state diventa una voce in più nel registro
dei formati, e la famiglia `sequence` della seconda spec della mappa sarà una voce in ciascun registro.

Regole del committente:

- **Retrocompatibilità**: nessun import, export o documento esistente cambia comportamento.
- **Estendibilità**: un formato o una famiglia nuovi sono voci di registro controllate da tsc, non `if`
  sparsi. Una voce dimenticata è un errore di compilazione.

## 2. Confini

- **Dentro**: i due registri (§3), il parser e il map di `stateDiagram`/`stateDiagram-v2` (§4, §5), le
  note dello state come note della famiglia `note`, l'innesto e la disposizione (§6), i testi del dialog
  ricavati dal registro, i test (§7).
- **Fuori**: la famiglia `sequence` (seconda spec della mappa), una famiglia propria per gli stati, un
  export `stateDiagram`, gli altri tipi Mermaid. L'export testo e `familyOps`/`viewFor` restano come
  sono (§3.4).

## 3. Due registri ([Registro dei formati Mermaid](https://github.com/alemian95/Dev-Designer/issues/22), ADR 0008)

Formato Mermaid e famiglia sono due assi diversi: `stateDiagram-v2` produce un frammento di flusso, come
`flowchart`. Per questo i registri sono due. Questa sezione è un **refactor a comportamento invariato**:
si consegna e si verifica prima di scrivere una riga dello state.

### 3.1 Registro dei formati

In `src/io/mermaid/formats.ts`, indicizzato per `MermaidFormat`, che sostituisce `MermaidKind`.

- Gli id sono le parole Mermaid canoniche: `erDiagram | classDiagram | flowchart`. Gli alias stanno in
  `keywords` (`graph` → `flowchart`); il confronto resta case-insensitive, come in `detect` oggi.
- Ogni voce porta `keywords`, il nome nel selettore dei blocchi (oggi «ER», «classi», «flowchart»), la
  `family` di destinazione e `analyse(text)`, che torna il frammento di quella famiglia con gli avvisi
  del parser prima di quelli del map.
- Il registro assorbe `detect` e `analyseKind`. `analyseMermaid` resta l'entrata generica e gestisce i
  tre esiti fuori registro: testo vuoto, formato sconosciuto, errore strutturale.

### 3.2 Registro dell'import per famiglia

In `src/ui/import/mermaid-families.ts`, indicizzato per `ImportFamily`. Il contratto `FamilyImport<Fr>`:

| Membro | Cosa fa |
|---|---|
| `fates(doc, fr)` | esiti previsti per chiave; `{}` per il flusso |
| `importable(fr, chosen)` | quanti elementi entrano con la scelta corrente |
| `prepare(doc, fr, chosen, layout)` | selezione, disposizione e Recipe → `{ recipe, elements, fallback }` |
| `summary(fr)` | il riepilogo dopo «Analizza» |
| `noun` | il sostantivo degli elementi nel pulsante e nel riepilogo finale |
| `tally(doc)` | i conteggi letti prima e dopo il dispatch |
| `report(elements, delta)` | la frase finale |

Le voci compongono le funzioni di `src/editor/commands/import-mermaid.ts`, che restano invariate.
`ImportMermaidDialog` non nomina più nessuna famiglia: legge la voce con una funzione generica in `F`,
che conserva il legame fra famiglia e frammento senza cast.

### 3.3 Tipi

La sola fonte è `FragmentByFamily = { er: ErFragment; class: ClassFragment; flow: FlowFragment }`, e le
sue chiavi sono `ImportFamily`. Entrambi i registri sono tipi mappati con `satisfies`, e
`MermaidAnalysis` si ricava dalla mappa. tsc segnala:

- una famiglia di `FragmentByFamily` senza voce nel registro dell'import;
- un formato senza voce nel registro dei formati;
- un formato il cui `analyse` torna il frammento di una famiglia diversa dalla sua `family`.

### 3.4 Testi e confini del refactor

- **Testi ricavati**: descrizione del dialog, placeholder ed errore «… non si importa: solo …» si
  costruiscono dal registro dei formati, con la congiunzione italiana. Con i tre formati attuali escono
  identici a oggi, carattere per carattere. Tutti gli altri testi non cambiano.
- **Export testo**: resta in `TextExportDialog`. L'emettitore dipende dalla famiglia e non dal formato
  d'ingresso (lo state esce come `flowchart`), e il dialog è già totale per tsc grazie ai suoi `Record`.
- **`familyOps` e `viewFor`**: non cambiano. L'import non è un'operazione del canvas.

### 3.5 Lo state nei registri

Dopo il refactor, lo state tocca il registro dei formati con una voce sola:

```ts
stateDiagram: {
  keywords: ["stateDiagram", "stateDiagram-v2"],
  label: "state",
  family: "flow",
  analyse: (text) => /* parseState + mapState */,
}
```

La voce `flow` del registro dell'import si estende alle note del frammento (§6). Nessun altro file del
dialog cambia.

## 4. Parser ([Grammatica Mermaid 12](https://github.com/alemian95/Dev-Designer/issues/23))

Scritto a mano, come gli altri tre (spec dell'import Mermaid §3.1–3.3): sincrono sul main thread, due
strati `state-parse.ts` → `StateAst` e `state-map.ts` → `FlowFragment`, modulo comune per front-matter,
`%%` e entità.

Fatti della grammatica di `mermaid@12.2.0` che il parser deve rispettare:

- **v1 = v2**: un solo detector e un solo db (`new StateDB(2)`). Due parole d'apertura, una grammatica.
- **Nessun terminatore**: `A --> B C --> D` sulla stessa riga sono due transizioni, e anche
  `stateDiagram-v2 A --> B` su una riga sola è valido.
- **Id**: qualunque carattere tranne `:`, spazio, `-` e `{`. `a.b`, `Città`, `B;` sono id; `a-b` è un
  errore.
- **Etichetta dopo `:`**: arriva a fine riga; un `:` singolo resta, `::` è un errore. `#`, `%%`, `"`,
  `<br>` e le frecce dentro l'etichetta restano testo. Si fa `trim`.
- **`;`**: è un carattere qualunque (§5, punto 10). Mermaid tronca l'etichetta al `;` e crea stati spuri;
  noi no.
- **Commenti**: `%%` e `#` saltati quando aprono un token; dopo un id chiudono l'id e il resto della
  riga è commento (`A --> B %% coda` → `A → B`).
- **Composti**: `state C {` … `}` e `state "Alias" as C {`, anche su una riga, annidati a piacere.
  `state Due parole {` è un errore.
- **Entità** `#59;`, `#quot;` ecc.: si decodificano come nel flowchart.

Gli unici errori sono quelli di Mermaid: id con `-`, `state Due parole {`, `--` alla radice, graffa non
chiusa, `::` in un'etichetta. Non se ne aggiungono altri.

## 5. Mappatura ([Mappatura di stateDiagram-v2 sul modello del flusso](https://github.com/alemian95/Dev-Designer/issues/24))

Lo state diventa un `FlowFragment`. Gli avvisi sono aggregati per categoria, come nel flowchart (spec
dell'import Mermaid §4.3).

| Mermaid | Flusso |
|---|---|
| `[*]` di partenza / di arrivo | un `terminal` «Inizio» e un `terminal` «Fine» per livello (radice e ogni composto), creati solo se usati. Tutti i `[*]` di partenza di un livello convergono sul suo «Inizio», come in Mermaid |
| stato | `process`. Etichetta = prima descrizione (`state "X" as L` o `A : testo`), altrimenti l'id; le descrizioni successive diventano righe in più |
| stato nato in un composto e citato fuori | un solo nodo, nel composto |
| `A --> B : t` | un arco con etichetta `t` |
| `state C { … }`, primo livello | un pool; gli stati diretti vanno nella corsia implicita con il nome del pool |
| composto figlio di un pool | una corsia del pool |
| composti dal terzo livello | i nodi salgono nella corsia antenata, con avviso |
| nome di pool e corsie | l'alias, altrimenti l'id |
| `[*]` di un composto | «Inizio»/«Fine» nella corsia del composto |
| transizione verso `C` | arriva all'«Inizio» interno di `C` |
| transizione da `C` | parte dalla «Fine» interna di `C` |
| transizione verso o da un composto senza quel terminale | scartata, con avviso |
| regioni `--` in un pool | una corsia per regione, «Regione N» |
| regioni `--` in un composto che è già una corsia | fuse nella corsia, con avviso |
| `--` alla radice | errore, come in Mermaid |
| `<<choice>>`, `[[choice]]` | `decision` con etichetta vuota |
| `<<fork>>`, `<<join>>` (e `[[…]]`) | `process` con l'id come etichetta, con avviso aggregato |
| `note left of`/`right of A : t`, nota a blocco | nota della famiglia `note` ancorata a `flow/<nodo>`; a `flow/<pool>` se l'àncora è un composto. Sinistra e destra si perdono senza avviso |
| `note "t" as N` (flottante) | scartata, con avviso |
| `direction`, intestazione senza direzione | ignorata (ADR 0007). Avviso se la direzione risultante non è `LR`, quindi anche quando manca (default TB), come nel flowchart |
| `classDef`, `class`, `:::`, `style`, `click` | scartati, con avviso aggregato |
| `accTitle`, `accDescr` | scartati, con l'avviso di accessibilità del flowchart |
| `hide empty description`, `scale`, `%%`, front-matter | ignorati senza avviso |

**Il `;`** è testo. Negli id si comporta come in Mermaid (`B;` è uno stato). Nelle etichette resta
intero, senza il troncamento di Mermaid: è l'unico punto in cui il nostro risultato diverge dal db di
Mermaid, e gli oracoli escludono questi casi.

**Testo**: entità decodificate, `<br>` e `<br/>` diventano un a capo, come nel flowchart.

## 6. Innesto e disposizione

### 6.1 `FlowFragment.notes`

`FlowFragment` riceve un campo `notes: Note[]`, con l'àncora espressa sulle chiavi del frammento
(`flow/<chiave>`) o `null`. Il map del flowchart lo lascia vuoto, quindi l'import di un `flowchart` non
cambia. Il campo vive solo nel frammento: il documento e il suo schema non cambiano.

### 6.2 Secondo import

La regola del flowchart (spec dell'import Mermaid §5): tutto si aggiunge sempre, con chiavi nuove.
`rekeyFlow` restituisce anche la mappa vecchia → nuova delle chiavi, che riscrive le àncore delle note.
Le note seguono la regola delle note delle classi (testo e àncora uguali → saltata); siccome le àncore
puntano a chiavi appena create, nei fatti entrano sempre.

### 6.3 Disposizione

La pipeline di «Disponi» del flusso su un `FlowDiagram` temporaneo, come `placeFlowImport` oggi (spec
dell'import Mermaid §6). Le note si dispongono accanto alla loro àncora, come quelle delle classi in
`placeClassImport`. Il ripiego sulla griglia resta quello del flowchart.

### 6.4 Dialog

Il flusso non ha caselle e si importa intero, quindi lo state neanche. Il selettore dei blocchi mostra
«state»; il riepilogo dopo «Analizza» conta anche le note; la frase finale le include quando ce ne sono.
I testi del flowchart restano carattere per carattere quelli di oggi.

## 7. Test

### 7.1 Refactor dei registri

- tsc, tutti i test esistenti e l'oracolo restano verdi **senza modifiche**: è la prova del comportamento
  invariato.
- **Test che scorre il registro**: per ogni formato e ogni sua parola d'apertura, `analyseMermaid` di un
  testo minimo torna la `family` dichiarata; l'errore «non si importa» elenca tutti i formati. Con lo
  state, il test copre `stateDiagram` e `stateDiagram-v2` senza righe in più.

### 7.2 State

- **Parser**: `fixture → StateAst`, con le varianti del §4 (riga unica, commenti a metà riga, id con
  punti e Unicode, composti su una riga, note a blocco multiriga) e gli errori con la riga.
- **Map**: `StateAst → FlowFragment + avvisi`, un test per ogni riga della tabella del §5.
- **Oracolo** `mermaid@12`, nella suite jsdom esistente (`src/io/mermaid/oracle.test.ts`): ogni fixture
  accettata dal nostro parser è accettata da `mermaid.parse()`, e il frammento si confronta con
  `getDiagramFromText(text).db.getData()`:
  - i nodi di `getData()`, tolti quelli con shape `note`, `noteGroup` e `divider`, sono i nostri nodi;
    `<padre>_start`/`<padre>_end` sono gli «Inizio»/«Fine» del livello;
  - la catena di `parentId` dà pool e corsia attesi, con la risalita dal terzo livello del §5;
  - gli archi di `getData()` sono i nostri archi, etichette comprese, a meno della riscrittura verso
    i terminali interni dei composti;
  - le etichette si decodificano dai segnaposto (`ﬂ°°` → `&#`, `ﬂ°` → `&`, `¶ß` → `;`) prima del
    confronto, come per il flowchart;
  - restano fuori: le etichette con `;` (§5), l'id casuale dell'ultima regione, `click` (bug di
    Mermaid) e il titolo da front-matter, che `getDiagramFromText` non porta.
- **Uscita come flowchart**: lo state importato, esportato con `flow-mermaid.ts`, supera `mermaid.parse()`
  e re-importato come `flowchart` ridà lo stesso modello a meno delle chiavi.
- **Linearità**: un input da 5.000 stati resta entro un tempo proporzionale, come per gli altri parser.
- **Comandi**: lo state si aggiunge sempre con chiavi nuove, le note seguono le chiavi riscritte, un solo
  undo.
- **E2E**: un caso state in `scripts/e2e/import-mermaid.mjs`: incolla → analizza → importa → pool e
  note presenti → annulla.

## 8. Moduli

```
src/io/mermaid/
  formats.ts             registro dei formati (assorbe detect e analyseKind)
  analyse.ts             analyseMermaid: vuoto, sconosciuto, errore strutturale
  state-parse.ts         → StateAst
  state-map.ts           → FlowFragment (con notes)
  state-fixtures.ts
src/ui/import/
  mermaid-families.ts    registro dell'import per famiglia
  ImportMermaidDialog.tsx  senza nomi di famiglia
src/editor/commands/import-mermaid.ts   rekeyFlow con la mappa delle chiavi; note nel flusso
```

Nomi e confini definitivi si fissano nel piano.

## 9. Rilascio

Non servono passi manuali: l'app è solo frontend, il formato del documento non cambia e non c'è
nessuna migrazione. `mermaid` resta fra le `devDependency`.

Ordine di consegna, ogni passo verde e committabile da solo:

1. registri a comportamento invariato (§3.1–3.4);
2. parser e map dello state senza composti né note;
3. composti, regioni e transizioni verso i composti;
4. note nel `FlowFragment` e nell'innesto;
5. voce nel registro, oracolo, e2e.

## 10. Da verificare nel piano

- La forma di `rekeyFlow` con la mappa delle chiavi, senza cambiare il comportamento del flowchart.
- Come `placeClassImport` dispone le note, e se la stessa funzione serve al flusso o va estratta.
- La forma della funzione generica in `F` del dialog che evita i cast (ADR 0008).
- L'elenco esatto degli avvisi aggregati dello state, con i testi, sul modello di `FlowMapCategory`.
