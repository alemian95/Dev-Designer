# Parser per l'import Mermaid

Ricerca per l'issue #2 (mappa #1, «Import da Mermaid»). Domanda: con quale parser leggere
`erDiagram`, `classDiagram` e `flowchart` nel browser.

Data: 2026-10-15. Versioni guardate: `mermaid@12.2.0` (latest, pubblicata il 2026-10-13),
`mermaid@11.17.2` (ultima 11.x), `@mermaid-js/parser@2.0.1`. Lo spike è in una cartella
temporanea fuori dal repo e non è stato committato; i numeri sotto vengono da lì.

## Raccomandazione

**Parser scritto a mano sul sottoinsieme che il modello sa rappresentare, con `mermaid` solo come
`devDependency` e oracolo nei test.** Nessuna dipendenza a runtime.

Le ragioni, in ordine di peso:

1. `@mermaid-js/parser` non copre nessuno dei tre diagrammi, e lo stesso progetto mermaid
   propone di deprecarlo (vedi §2).
2. Il parser interno di `mermaid` funziona, ma costa almeno **361 KB gzip** in ESM con code
   splitting, e **1,49 MB gzip** in un worker in formato `iife`, che è quello che il progetto usa
   oggi (ADR 0002). Inoltre `classDiagram` e `flowchart` **non girano senza DOM** perché passano da
   DOMPurify, e l'unica API che restituisce il db è marcata `@internal` e deprecata (vedi §1).
3. Il db di mermaid è pensato per il rendering, non per ricostruire il sorgente: entità codificate
   con segnaposto interni, generici già trasformati in `&lt;…&gt;`, escape `\+` nei membri, enum
   numerici. Serve comunque uno strato di traduzione verso la rappresentazione intermedia, e quello
   strato dipende da dettagli non documentati.
4. Un parser a mano produce direttamente la rappresentazione intermedia neutra (ADR 0001) e pesa
   poche decine di KB. La decisione su worker o main thread smette così di dipendere dal peso.
5. Installare `mermaid` come `devDependency` risolve un debito che il progetto ha già: gli
   emettitori oggi non vengono mai validati contro mermaid (`src/io/emit/flow-mermaid.ts`, docblock
   di `escapeLabel`: «il progetto non ha mermaid installato per misurare»). Lo stesso oracolo
   verifica che il nostro parser accetti ciò che mermaid accetta, sul corpus dei test.

## 1. Il parser interno di `mermaid` (jison)

### Stato del codice

- In `mermaid@12.2.0` i tre diagrammi sono ancora jison: `flowchart/parser/flow.jison` (635
  righe), `class/parser/classDiagram.jison` (440), `er/parser/erDiagram.jison` (336).
  Fonte: `packages/mermaid/src/diagrams/{flowchart,class,er}/parser/` al tag `mermaid@12.2.0` su
  github.com/mermaid-js/mermaid.
- È aperta una migrazione da jison (e Langium) a **Chevrotain**: PR #7855 (pie, primo passo, aperta
  dal 2026-06-16) e PR #7875 (flowchart, draft, «stacked on pie», ultimo aggiornamento
  2026-08-07). Entrambe dichiarano che «the `db` API, types, and renderer are unchanged — only how
  the same db is filled». Non sono mergiate.
- `mermaid@12.0.0` (2026-09-10) è una major: ES2024, Safari 17.4+, ELK incluso e layout di default
  (release notes `mermaid@12.0.0`). Non tocca i parser.

### Come si arriva al db

Il package esporta solo `.` (`dist/mermaid.core.mjs`) e un `./*` aperto sui file di `dist/`. I
diagrammi sono chunk con hash nel nome (`dist/chunks/mermaid.core/erDiagram-KYQIGQAA.mjs`): un
import profondo cambia nome a ogni versione e porta dentro comunque `d3` e il renderer (il chunk ER
fa `import { select } from "d3"`). Non è una strada.

L'unica via pratica è:

```js
await mermaid.parse(text)                                   // registra i diagrammi e valida
const diagram = await mermaid.mermaidAPI.getDiagramFromText(text)
diagram.db.getEntities() / getClasses() / getVertices() …
```

- `mermaid.parse()` è pubblica ma restituisce solo `{ diagramType, config }` (`dist/types.d.ts`,
  `ParseResult`). Serve anche perché registra i diagrammi: senza, `getDiagramFromText` fallisce con
  «No diagram type detected» (misurato).
- `mermaid.mermaidAPI` è annotato `@deprecated … @internal` in `dist/mermaid.d.ts`, e
  `mermaidAPI` in `dist/mermaidAPI.d.ts` è `@internal - Use mermaid.function instead`.
- `Diagram.db` è tipizzato `DiagramDefinition['db']`: i getter (`getEntities`, `getRelations`,
  `getVertices`…) non sono documentati né tipizzati per diagramma.
- Il db è uno stato condiviso del singleton `mermaid`: si azzera a ogni parse, quindi le chiamate
  vanno serializzate.

### Senza DOM: cosa succede (misurato in Node 22, senza `window` né `document`)

| Diagramma | Esito |
|---|---|
| `erDiagram` | funziona |
| `classDiagram` | `DOMPurify.addHook is not a function` |
| `flowchart` | `DOMPurify.addHook is not a function` |

Il motivo è `sanitizeText` (chunk comune di mermaid): chiama sempre `DOMPurify.sanitize`, e
DOMPurify senza `window` restituisce un oggetto senza `addHook`/`sanitize`. Un Web Worker è nella
stessa situazione, perché non ha `document`; il comportamento nel worker vero non è stato provato
nel browser, ma il punto che fallisce è lo stesso.

Con `dompurify` sostituito da un alias a uno shim identità (`sanitize: s => s`), tutti e tre i
diagrammi funzionano senza DOM. È accettabile perché il testo non finisce mai in HTML, ma è un
alias di bundler su una dipendenza interna di mermaid: fragile per costruzione. Inoltre in Vite
`resolve.alias` vale anche per la build principale.

Il caricamento del modulo non tocca il DOM: l'import di `mermaid` in Node riesce.

### Peso (esbuild 0.25, `--minify`, `platform=browser`, solo l'entry che chiama `getDiagramFromText`)

| Build | min | gzip |
|---|---|---|
| ESM con splitting: entry statico | 998 KB | 217 KB |
| + chunk `erDiagram` | +307 KB | +92 KB |
| + chunk `classDiagram` | +328 KB | +98 KB |
| + chunk `flowDiagram` | +387 KB | +118 KB |
| entry + i tre diagrammi | 1.465 KB | 361 KB |
| **IIFE (un solo file, come i worker di Vite oggi)** | **5.134 KB** | **1.455 KB** |
| `@mermaid-js/parser`, solo `parse("pie")`, IIFE | 636 KB | 135 KB |

Il formato IIFE è quello che conta per il worker del progetto: ADR 0002 documenta che con il
`worker.format` di default (`iife`) Vite non fa code splitting nel worker. Se il parse Mermaid
entrasse in `src/io/ddl/parse.worker.ts`, **ogni import DDL scaricherebbe anche i ~5 MB di
mermaid**, e viceversa. `worker.format` è globale per tutti i worker, quindi anche un secondo
worker sarebbe IIFE. Passare a `"es"` è la leva che ADR 0002 lascia ferma per l'interop di
`node-sql-parser`.

Il db include i renderer perché la definizione di ogni diagramma porta `parser`, `db`, `renderer`
e `styles` insieme. Nell'IIFE finiscono katex, cytoscape, ELK e tutti gli altri diagrammi.
`mermaid@12` dipende da `elkjs ^0.9.3`, mentre il progetto ha già `elkjs 0.12.0`: sarebbero due copie.

Esiste anche `@mermaid-js/tiny@12.2.0` (un solo `dist/mermaid.tiny.js`, senza ELK): ha lo stesso
problema di DOMPurify e nessuna API diversa.

### Forma del db (misurata su 12.2.0)

- **ER**: `getEntities()` è una `Map` nome → `{ id, label, alias, attributes: [{ type, name,
  keys: ["PK"|"FK"|"UK"], comment }] }`; `getRelationships()` dà `[{ entityA, entityB, roleA,
  relSpec: { cardA, cardB, relType } }]`, con `entityA/B` uguali all'**id** interno
  (`entity-CUSTOMER-0`), non al nome. Le cardinalità sono `ONLY_ONE`, `ZERO_OR_ONE`,
  `ZERO_OR_MORE`, `ONE_OR_MORE` (più `MD_PARENT`), e `relType` vale `IDENTIFYING` oppure
  `NON_IDENTIFYING`. Trappola: `cardA` è la cardinalità scritta **dal lato di `entityB`**
  (`erDiagram.jison:312`, `$$ = { cardA: $3, relType: $2, cardB: $1 }`). Misurato:
  `CUSTOMER ||--o{ ORDER` dà `cardA: ZERO_OR_MORE`, `cardB: ONLY_ONE`.
- **Class**: `getClasses()` dà, per classe, `members[]` e `methods[]` con `{ visibility,
  classifier, id, text, parameters, returnType }`, più `annotations[]`. Il testo è già pronto per il
  rendering: `+List~int~ xs` diventa `text: "\\+List&lt;int&gt; xs"`, e `id: "List~int~ xs"` è
  l'unico campo vicino al sorgente. Il campo `type` del membro non esiste: tipo e nome restano
  da separare. `getRelations()` dà `{ id1, id2, title, relationTitle1/2, relation: { type1, type2,
  lineType } }`, con `type1/2` e `lineType` numerici.
- **Flowchart**: `getVertices()` dà `{ id, text, type }`, dove `type` è il nome di mermaid
  (`stadium`, `diamond`, `lean_right`, `subroutine`, `square`…); `getEdges()` dà `{ start, end, type:
  "arrow_point"…, stroke, length, text }`; `getSubGraphs()` dà `{ id, title, nodes[] }`, dove
  l'annidamento si legge dai `nodes` che contengono id di altri subgraph, in ordine dal più interno.
  Le entità restano **codificate con segnaposto interni**: `#quot;` diventa `ﬂ°quot¶ß` e `#124;`
  diventa `ﬂ°°124¶ß`. Mermaid li decodifica solo in fase di rendering, quindi il consumatore
  dovrebbe reimplementare `decodeEntities`, che non è esportata.

### Tempo

Tre diagrammi piccoli, primo parse compreso: 22–38 ms in Node.

## 2. `@mermaid-js/parser` (Langium)

- Versione 2.0.1 (2026-10-02), licenza MIT. Il package dichiara `dependencies:
  { "@chevrotain/types" }`, con Langium e Chevrotain incorporati nel bundle.
- `DiagramAST` in `dist/src/index.d.ts`: `Info | Packet | Pie | Architecture | GitGraph |
  EventModel | Radar | Railroad | RailroadEbnf | RailroadAbnf | RailroadPeg | Treemap | TreeView |
  Wardley | Cynefin`. **Né flowchart, né class, né ER.**
- Non c'è traccia di una migrazione dei tre diagrammi verso Langium: nessuna issue o PR su
  `langium flowchart` nel repo. La direzione dichiarata va altrove: PR #7855 sposta i parser su
  Chevrotain «co-located» nella cartella del diagramma, «no separate parser package», e scrive che
  «`@mermaid-js/parser` gets a deprecation notice». La PR non è mergiata, ma basta a escludere
  questa strada.
- Peso di riferimento: 135 KB gzip in IIFE per il solo `pie`.

## 3. Parser scritto a mano

### Cosa deve leggere

Come minimo ciò che emettono `src/io/emit/{er,class,flow}-mermaid.ts`, cioè il round-trip della
mappa. In più, il Mermaid scritto a mano, per i costrutti che il modello sa rappresentare. Il
resto va riconosciuto e scartato con un avviso, senza far fallire il parse. Dalle grammature jison
di 12.2.0, i costrutti esterni da riconoscere sono:

- **Comuni**: commenti `%%`, frontmatter `---`, direttive `%%{…}%%`, `accTitle`/`accDescr`,
  `direction`, righe `style`/`classDef`/`class`/`click`/`linkStyle`, da scartare con un avviso.
- **ER**: le forme a parole delle cardinalità (`one or more`, `zero or many`, `1+`, `many(0)`…,
  `erDiagram.jison:58-80`), `..` per la relazione non identificante, alias `A["etichetta"]`, chiavi
  multiple `PK, FK`, commento fra virgolette, `:::classe`.
- **Class**: membri dentro le graffe e nella forma `Classe : +membro`, generici `~T~`, classifier
  `$`/`*`, annotazioni `<<interface>>`, cardinalità `"1" --> "*"`, tutti i tipi di relazione
  (`<|--`, `*--`, `o--`, `-->`, `..>`, `..|>`, lollipop), `namespace`, `note` e `note for`.
- **Flowchart**: concatenazione `a --> b --> c` e `a & b --> c`, tutte le varianti di freccia
  (`---`, `-.->`, `==>`, `--o`, `--x`, `<-->`, lunghezze variabili), etichetta `-- testo -->` oltre a
  `-->|testo|`, etichette non quotate, forme oltre alle cinque del modello (da mappare con un
  avviso), la sintassi `@{ shape: … }`, stringhe markdown fra backtick, `subgraph` annidati con id
  facoltativo.

### Costi

- **Codice**: tre parser a discesa ricorsiva, o a righe con un lexer piccolo, perché la sintassi
  è quasi tutta per riga. Stima: 700–1.000 righe più i test, cioè l'ordine di grandezza degli
  emettitori attuali (551 righe). Il flowchart è il più costoso per via di concatenazione, frecce
  ed etichette.
- **Divergenza da mermaid**: è il rischio vero. Mermaid potrebbe accettare un testo che noi
  rifiutiamo o leggiamo diversamente. Lo si tiene sotto controllo con `mermaid` in
  `devDependencies`: nei test (vitest con ambiente `jsdom`, già installato) `mermaid.parse()` valida
  sia l'uscita degli emettitori sia le fixture del nostro parser. Lo spike conferma che in
  ambiente con DOM la pipeline funziona; in Node puro funziona solo l'ER.
- **Manutenzione**: la sintassi di questi tre diagrammi cambia poco. La migrazione a Chevrotain
  dichiara parità token per token su 1.587 diagrammi (PR #7875). Le aggiunte di mermaid verrebbero
  scoperte come avvisi, non come rotture.
- **Peso**: decine di KB, nessuna dipendenza nuova. Il parse è lineare: anche sul main thread
  non blocca l'interfaccia per testi realistici.

### Variante scartata: compilare le grammatiche jison di mermaid con un `yy` nostro

Le `.jison` sono MIT e generano un parser standalone che chiama un oggetto `yy`. Servirebbero però
15–22 metodi `yy` per grammatica (per il flowchart: `addVertex`, `addLink`, `addSubGraph`,
`destructLink`, `lex`, `updateLink`…), e parte della semantica vive nel db, non nella grammatica:
il parsing dei membri di classe, per esempio, sta in `ClassMember`. Il generatore `jison`
(0.4.18) non è più mantenuto. Si copierebbe la complessità di mermaid senza le sue garanzie.

## 4. Licenze

- `mermaid`, `@mermaid-js/parser`, `@mermaid-js/tiny`: MIT. Dipendenze rilevanti di mermaid:
  `dompurify` (MPL-2.0 OR Apache-2.0), `d3` (ISC), `katex` e `cytoscape` (MIT), `elkjs` (EPL-2.0
  OR GPL-3.0-or-later; il progetto lo usa già).
- Parser a mano: nessun vincolo. Se si copiano frammenti delle grammatiche jison, come la tabella
  delle cardinalità ER, va conservata la nota MIT di mermaid.
- `mermaid` come sola `devDependency` non entra nel bundle, quindi nessun obbligo di attribuzione
  nel prodotto.

## 5. Fatti per gli altri ticket della mappa

- **#3, rappresentazione intermedia**: con il parser a mano la forma è nostra e può seguire ADR
  0001 (adapter → IR neutra → `map`). Se invece si sceglie mermaid, l'IR deve nascondere: id
  interni al posto dei nomi nelle relazioni ER, `cardA`/`cardB` invertiti rispetto al testo, testo
  dei membri già escapato per il rendering, entità codificate con segnaposto nel flowchart,
  annidamento dei subgraph ricavato dai `nodes`. In entrambi i casi l'IR deve portare gli avvisi
  per i costrutti scartati (stile, click, forme sconosciute), come `ParseWarning` nel DDL.
- **Nebbia «worker e bundle»**: con mermaid a runtime il peso decide da solo. 1,49 MB gzip in
  IIFE rende inaccettabile il worker unico di ADR 0002, perché lo farebbe pagare a chi importa DDL.
  Sul main thread restano 361 KB gzip in chunk pigri, ma class e flowchart passano da DOMPurify.
  Con il parser a mano il peso sparisce dalla decisione: il worker esistente si può usare senza
  costo, per uniformità, annullamento e timeout, oppure si può restare sul main thread. La scelta
  diventa di protocollo, non di bundle.

## Fonti

- npm: `npm view mermaid` (12.2.0, dipendenze, `exports`), `npm view @mermaid-js/parser` (2.0.1),
  `npm view @mermaid-js/tiny`.
- Codice installato: `mermaid@12.2.0/dist/{mermaid,mermaidAPI,types,Diagram}.d.ts`,
  `dist/chunks/mermaid.core/chunk-DSNLSHJZ.mjs` (`sanitizeText`),
  `@mermaid-js/parser@2.0.1/dist/src/index.d.ts` (`DiagramAST`).
- GitHub mermaid-js/mermaid, tag `mermaid@12.2.0`: `packages/mermaid/src/diagrams/flowchart/parser/flow.jison`,
  `class/parser/classDiagram.jison`, `er/parser/erDiagram.jison`, `packages/parser/README.md`.
- Release notes `mermaid@12.0.0`; PR #7855 (pie → Chevrotain), #7875 (flowchart → Chevrotain,
  draft), #8333 (Langium 4.4, mergiata).
- Nel repo: `package.json` (`mermaid` non è una dipendenza), ADR 0001, ADR 0002,
  `src/io/ddl/parse.worker.ts`, `src/io/emit/*-mermaid.ts`.
