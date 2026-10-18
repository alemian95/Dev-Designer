# Famiglia sequence: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una famiglia `sequence` nel canvas unificato. Le sequenze si creano e si modificano sul canvas e nel pannello, si importano da `sequenceDiagram` ed escono come `sequenceDiagram` e come SVG.

**Architecture:**
- **Modello**: dato puro con una migrazione 8 → 9 (`src/model/sequence/`).
- **Layout**: una funzione pura `sequenceLayout`, che usano disegno, hit-test, SVG e dimensioni.
- **Comandi**: comandi immer per famiglia (`src/editor/sequence/`).
- **Registri**: le voci `sequenceOps` e `sequenceView`.
- **Sotto-elementi**: un partecipante o un passo si indirizza con la chiave `<sequenza>/<id>`. Questa chiave passa da `rectOf`, dalla selezione, dal drag, dalle àncore e da `deleteItems`, quindi non serve toccare la macchina di interazione.
- **Formati**: import ed export si aggiungono come voci dei registri della spec 1.

**Tech Stack:** TypeScript, React 19, zustand + immer, zod, vitest (jsdom solo per l'oracolo), Playwright per gli e2e, `mermaid@12.2.0` fra le devDependency.

**Spec:** `docs/superpowers/specs/2026-10-18-famiglia-sequence-design.md` (qui «spec»). Le decisioni stanno nei ticket della mappa #21: #25, #26, #27, #28 e #29. Precedente: l'aggiunta di `shape`, commit `8286102`. Prototipo del layout: `git show origin/prototype/sequence-canvas:src/ui/canvas/kinds/sequence.prototype.html` (`colsOf`, `rowH`, `layoutAuto`). Ricerca sulla grammatica: `git show origin/research/grammatica-state-sequence:docs/research/grammatica-state-sequence.md`, §2.

**Punto di partenza:** `master` a `0f3990e` o successivo.

## Global Constraints

- **Retrocompatibilità.**
  - I documenti, gli import e gli export che esistono oggi non cambiano comportamento.
  - Tutti i test esistenti e l'e2e esistente passano senza modifiche. Fanno eccezione i test che fissano `SCHEMA_VERSION` o l'elenco di `FAMILIES`.
  - La migrazione 8 → 9 aggiunge solo la parte vuota, letterale.
- **Estendibilità.**
  - La famiglia entra come voci dei registri.
  - Un `Record<Family, …>` o uno switch esaustivo segnala la famiglia mancante a tsc.
  - Niente cast `as` per aggirare i tipi. L'unico ammesso è quello già esistente dei `NodeView` del registro, `node as X`.
- **`"sequence"` in fondo a `FAMILIES`.**
- **Testi**: in italiano, presi alla lettera dalla spec dove li fissa.
- **Comandi**: un gesto è una sola Recipe, quindi un solo undo.
- **Parser**: sincrono, senza dipendenze a runtime. Gli avvisi sono aggregati con `aggregate`; gli errori sono `MermaidSyntaxError` con l'offset. Solo errori che dà anche Mermaid (spec §5).
- **Comandi da lanciare**:
  - `pnpm vitest run <path> --exclude '.claude/**'`
  - `pnpm exec tsc -b`
  - `pnpm lint`
  - `pnpm e2e`
- **Commit**: ogni messaggio termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Eliminare un partecipante a cui è ancorata una Nota, oppure l'intera sequenza**: la Nota si stacca anche quando l'àncora è `sequence/<seq>/<p>` e si elimina la sequenza. Test nel Task 5.
2. **Trascinare un passo in una sezione vuota o fuori da un blocco annidato**: il passo cade nel punto d'inserimento più vicino al rilascio, mai dentro sé stesso. Test nel Task 4 (comando) e nel Task 5 (`commitDrag`).
3. **Testo con `;`, `#` e a capo che fa export → import**: torna identico. Test nel Task 10.
4. **Un `sequenceDiagram` con partecipanti dichiarati ma senza messaggi**: si importa e l'export riscrive i partecipanti. Test nel Task 8 e nel Task 10.
5. **Un documento della versione 8 aperto e salvato**: passa alla versione 9, le altre famiglie restano identiche byte per byte nel JSON, e un undo dopo l'apertura non porta indietro la migrazione. Test nel Task 1.

---

### Task 1: Modello, validazione, migrazione e famiglia vuota nei registri

Spec §3, §9. La famiglia esiste vuota ovunque, ma non ha ancora UI, strumenti o formati.

**Files:**
- Create: `src/model/sequence/schema.ts`, `schema.test.ts`, `validate.ts`, `validate.test.ts`
- Create: `src/editor/sequence-access.ts`, `src/editor/kinds/sequence.ts`
- Create: `src/ui/canvas/kinds/sequence.tsx`. Nella versione minima ha layer vuoti, `tools: []` e `Properties` che restituisce `null`.
- Modify: `src/model/family.ts:5`, `src/model/shared.ts:4`, `src/model/document.ts:14-41`, `src/model/migrations.ts` (tabella e `addSequences`), `src/model/issue.ts`, `src/model/note/validate.ts:12` (`anchorExists`), `src/model/links/validate.ts:12` (`endExists`: `false`), `src/model/links/labels.ts:31` (`endName`), `src/editor/kinds/ops.ts:105`, `src/editor/links/commands.ts:19` (`FAMILY_NOUN`: `"una sequenza"`), `src/ui/canvas/kinds/registry.ts:68,98` (`FAMILY_LABEL`: `"Sequenze"`), `src/ui/export/svg.tsx:35-81`, `src/ui/canvas/InlineEditor.tsx:135` (`null` per ora), `src/ui/export/TextExportDialog.tsx:35` (`sequence` in `Exclude` fino al Task 9)
- Test: `src/model/migrations.test.ts`, `src/model/note/validate.test.ts`, `src/model/links/labels.test.ts`, più i test che fissano versione e famiglie

**Interfaces:**
- Produces, in `schema.ts`:
  - `ParticipantSchema`, `MessageStepSchema`, `NoteStepSchema` e `BlockStepSchema`; `StepSchema` è `z.lazy` sull'unione discriminata per `kind`.
  - `SectionSchema`, `SequenceSchema`, `SequenceModelSchema = z.object({ sequences: z.record(z.string(), SequenceSchema) })` e `SequenceDiagramSchema = z.object({ model, view: z.object({ nodes: z.record(z.string(), NodeViewSchema) }) })`.
  - Tipi `Participant`, `Step`, `MessageStep`, `NoteStep`, `BlockStep`, `Section`, `Sequence`, `SequenceModel`, `SequenceDiagram`.
  - Gli enum: `LineSchema = ["solid", "dashed"]`, `HeadSchema = ["none", "filled", "cross", "open", "double"]`, `PlacementSchema = ["left", "right", "over"]`, `OperatorSchema = ["loop", "alt", "opt", "par", "critical", "break"]` e `ParticipantKindSchema = ["participant", "actor"]`.
  - `SINGLE_SECTION: ReadonlySet<Operator> = new Set(["loop", "opt", "break"])`
  - `INVALID_NAME = /[<>:,;+()\\/]/`
  - `emptySequenceDiagram(): SequenceDiagram`
  - La forma esatta è quella della spec §3.1. Lo schema non controlla i riferimenti.
- Produces, in `validate.ts`: `validateSequences(model: SequenceModel): Issue[]`. `node` è la chiave della sequenza, senza prefisso. Codici:
  - `"sequence-dangling-participant"`
  - `"sequence-note-participants"`
  - `"sequence-block-sections"`
  - `"sequence-duplicate-name"`
  - `"sequence-invalid-name"`, anche con `name` vuoto
  - `"sequence-duplicate-id"`

  Severità: `"error"` per tutti, tranne `sequence-invalid-name`, che è `"warning"`.
- Produces: `sequenceDiagram(doc): SequenceDiagram` in `sequence-access.ts`, e `sequenceOps(doc): DiagramOps` nella versione minima. In questo task `nodeKeys` sono le chiavi di `view.nodes`; `rectOf` restituisce `null`; `edgesTouching` restituisce `[]`; `edgeGeometry` restituisce `null`; `addNode` lancia «non ancora»; `addEdge` restituisce `null`; `deleteItems` restituisce `null`; `duplicateNodes` restituisce `{ keys: [], recipe: () => {} }`; `layoutGraph` restituisce nodi vuoti; `validate` chiama `validateSequences`.
- `anchorExists`: la chiave `<seq>` esiste se esiste la sequenza; la chiave `<seq>/<pid>` esiste se esiste quel partecipante nella sequenza.
- `endName`:
  - per la sequenza, il titolo, oppure «(sequenza senza titolo)»;
  - per un partecipante, l'etichetta o il nome;
  - per una sequenza o un partecipante assenti, «(sequenza eliminata)» o «(partecipante eliminato)».

- [ ] **Step 1: Test (falliscono)**
  - Schema:
    - una sequenza completa con blocchi annidati passa;
    - un `head` sconosciuto, un `kind` sconosciuto o `participants: []` in una nota vengono rifiutati.
  - Validazione, un `it` per codice, con il testo del messaggio.
  - Migrazione (Review Focus 5): un documento v8 diventa v9 con la parte `sequence` vuota, e il resto è `toEqual` all'originale.
  - `createDocument` ha la parte `sequence` vuota.
  - `anchorExists` e `endName`: i quattro casi qui sopra.
- [ ] **Step 2:** `pnpm vitest run src/model --exclude '.claude/**'` → FAIL.
- [ ] **Step 3: Implementa.** Aggiungi `"sequence"` in fondo a `FAMILIES` e porta `SCHEMA_VERSION` a 9. Aggiungi `[8, addSequences]`, sul modello di `addShapes`, `migrations.ts:225`. Poi segui gli errori di tsc nei file elencati: ognuno riceve la sua voce minima.
- [ ] **Step 4:** `pnpm vitest run --exclude '.claude/**' && pnpm exec tsc -b && pnpm lint && pnpm e2e` → verde.
- [ ] **Step 5: Commit** — `feat(sequence): modello, validazione e migrazione 8 → 9`

---

### Task 2: `sequenceLayout`

Spec §4.1.

**Files:**
- Create: `src/editor/sequence/layout.ts`, `layout.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SequenceLayout {
  width: number; height: number              // dimensione del nodo, origine (0,0) in alto a sinistra
  header: Rect                               // fascia «sd <titolo>», la parte che trascina la sequenza
  columns: Record<string, { x: number; w: number; head: Rect }>   // per id partecipante; x = asse della linea di vita
  rows: Record<string, Rect>                 // per id di messaggio o nota di sequenza
  blocks: Record<string, { rect: Rect; label: Rect; sections: Record<string, Rect> }>  // per id di blocco
  slots: { container: string; index: number; y: number; depth: number }[]  // punti d'inserimento; container = "root" o id sezione
}
export function sequenceLayout(seq: Sequence, measure?: (text: string) => number): SequenceLayout
```

Le metriche sono quelle del prototipo:
- larghezza di una colonna: `max(96, testo + 28)`;
- spazio fra colonne: `GAP`;
- altezza di una riga: 40 per un messaggio, 58 per un messaggio a sé stesso, 44 per una nota;
- intestazione di un blocco: 30; separatore fra sezioni: 24; sezione vuota: 18;
- rientro per livello: 6.

Mettile in costanti esportate. `measure` di default stima `chars * CHAR_W`, come `noteSize`. Una sequenza senza partecipanti ha comunque una dimensione minima.

- [ ] **Step 1: Test (falliscono).**
  - Colonne nell'ordine dei partecipanti, senza sovrapposizioni.
  - Righe in ordine verticale crescente, comprese le righe dentro i blocchi.
  - Il rettangolo di un blocco contiene le sue sezioni, e quelle contengono le loro righe.
  - Un blocco annidato è più stretto del padre.
  - Una sezione vuota ha un'altezza maggiore di 0.
  - `slots`: una voce in più per ogni contenitore, rispetto al numero dei suoi passi.
  - La dimensione cresce con un partecipante e con un passo.
- [ ] **Step 2:** FAIL → **Step 3: Implementa** → **Step 4:** PASS
- [ ] **Step 5: Commit** — `feat(sequence): layout interno ricavato dall'ordine`

---

### Task 3: Disegno di sola lettura sul canvas e nell'SVG

Spec §4.1, §8.3.

**Files:**
- Create: `src/editor/sequence/geometry.ts`: `sequenceRect(seq, view): Rect` e `subRect(seq, view, subId): Rect | null`, cioè intestazione del partecipante, riga o etichetta del blocco, in coordinate del canvas.
- Create: `src/ui/canvas/Sequence.tsx`: `SequenceNodeView` (pura) e `SequenceNode` (connessa), sul modello di `Shape.tsx`.
- Modify: `src/editor/kinds/sequence.ts`:
  - `rectOf(key)` gestisce `<seq>` (`sequenceRect`) e `<seq>/<sub>` (`subRect`);
  - `nodeKeys` restituisce solo le chiavi delle sequenze;
  - `layoutGraph` restituisce un nodo per sequenza con la dimensione di `sequenceLayout`, nessun arco, `direction: "DOWN"`.
- Modify: `src/ui/canvas/kinds/sequence.tsx`: `NodesLayer`, `NodeView`, `EdgesLayer` vuoto.
- Test: `src/editor/sequence/geometry.test.ts`, `src/editor/kinds/sequence.test.ts` (`verificaContrattoOps`, adattato: una sequenza non ha archi di canvas, quindi il caso «arco» usa due sequenze e nessun arco, come le note), `src/ui/canvas/Sequence.test.tsx`, `src/ui/export/svg.test.ts` (nuovo `describe`).

**Interfaces:**
- Consumes: `sequenceLayout` (Task 2).
- **Contratto DOM**, che il Task 5 e l'e2e usano:
  - la cornice ha `data-node-id="sequence/<seq>"`;
  - l'intestazione di ogni partecipante, ogni riga (messaggio o nota di sequenza) e l'etichetta di ogni blocco hanno `data-node-id="sequence/<seq>/<id>"`;
  - la linea di vita ha `data-lifeline="sequence/<seq>/<pid>"`;
  - il testo modificabile ha `data-sequence-text`.
- Il disegno è quello della spec §4.1:
  - attore come omino, partecipante come riquadro;
  - linee di vita tratteggiate;
  - frecce disegnate secondo `line` e `head`;
  - messaggio a sé stesso come anello;
  - nota di sequenza come foglio con l'angolo piegato;
  - blocchi come riquadri con l'operatore e le condizioni;
  - `autonumber` come numero davanti al testo del messaggio.

- [ ] **Step 1: Test (falliscono).**
  - `rectOf` di `<seq>` e di `<seq>/<pid>`.
  - `rectOf` di un sotto-elemento inesistente restituisce `null`.
  - Il render contiene un `data-node-id` per ogni partecipante e per ogni riga.
  - `buildSvg` di un documento con una sequenza contiene le linee di vita e i testi.
- [ ] **Step 2:** FAIL → **Step 3: Implementa** → **Step 4:** PASS, poi tsc e lint.
- [ ] **Step 5: Commit** — `feat(sequence): disegno della sequenza sul canvas e nell'SVG`

---

### Task 4: Comandi

Spec §4.2, solo la parte dei dati: recipe pure, senza UI.

**Files:**
- Create: `src/editor/sequence/commands.ts`, `commands.test.ts`
- Create: `src/editor/sequence/tree.ts` con `locate(seq, stepId): { container: string; index: number } | null`, `stepAt(seq, id)`, `sectionsOf(seq)` e `descendants(step): string[]`. Sono le funzioni pure del prototipo.

**Interfaces:**
- Produces. Ogni funzione restituisce `Recipe`, oppure `{ key, recipe }` quando crea qualcosa. Le chiavi sono senza prefisso; `seq` è la chiave della sequenza.

```ts
addSequence(at: Point): { key: string; recipe: Recipe }      // due partecipanti «A», «B» e un messaggio A→B vuoto (scelta del piano, spec §4.3)
deleteSequences(keys: readonly string[]): Recipe
duplicateSequences(model: SequenceModel, keys: readonly string[]): { keys: string[]; recipe: Recipe }  // uuid nuovi ovunque, DUPLICATE_OFFSET
setSequenceTitle(seq, title): Recipe;  setAutonumber(seq, on: boolean): Recipe
addParticipant(seq, after: string | null): { key: string; recipe: Recipe }   // nome libero «P<n>»
renameParticipant(seq, pid, name): Recipe | null              // null se il nome è vuoto, già usato o con INVALID_NAME
setParticipantLabel(seq, pid, label: string | null): Recipe;  setParticipantKind(seq, pid, kind): Recipe
moveParticipant(seq, pid, toIndex: number): Recipe
deleteParticipant(seq, pid): Recipe                           // con i passi che lo coinvolgono (anche dentro i blocchi)
addMessage(seq, from, to, where: { container: string; index: number }): { key: string; recipe: Recipe }
addNoteStep(seq, after: string): { key: string; recipe: Recipe }   // `over` del mittente del passo, o del primo partecipante
setStep(seq, stepId, patch: Partial<MessageStep> | Partial<NoteStep>): Recipe
moveStep(seq, stepId, to: { container: string; index: number }): Recipe | null   // null se `to` è dentro lo step stesso
deleteSteps(seq, stepIds: readonly string[]): Recipe
wrapInBlock(seq, stepIds: readonly string[], operator: Operator): { key: string; recipe: Recipe }  // passi contigui dello stesso contenitore
setOperator(seq, blockId, operator): Recipe                   // verso SINGLE_SECTION: sezioni fuse nella prima (scelta della spec §4.2)
addSection(seq, blockId): Recipe | null;  removeSection(seq, sectionId): Recipe | null   // null se l'operatore non lo permette
setCondition(seq, sectionId, condition): Recipe
dropTarget(seq, layout: SequenceLayout, y: number, exclude: string): { container: string; index: number }  // lo slot più vicino a y, fuori da `exclude` e dai suoi discendenti
```

Ogni recipe che non cambia niente non scrive niente, quindi non lascia un undo fantasma, come `setShapeLabel`.

- [ ] **Step 1: Test (falliscono)**, un `it` per comando, sul modello di `src/editor/shape/commands.test.ts`.
  - Review Focus 2:
    - `moveStep` dentro una sezione vuota;
    - `moveStep` fuori da un blocco annidato;
    - `moveStep` dentro sé stesso restituisce `null`;
    - `dropTarget` esclude i discendenti.
  - `deleteParticipant` toglie anche messaggi e note di sequenza annidati.
  - `setOperator` da `alt` con due sezioni a `loop` fonde le sezioni.
  - `renameParticipant` rifiuta un duplicato e i caratteri di `INVALID_NAME`.
  - Ogni comando si annulla con un solo `undo`.
- [ ] **Step 2:** FAIL → **Step 3: Implementa** → **Step 4:** PASS
- [ ] **Step 5: Commit** — `feat(sequence): comandi su partecipanti, passi e blocchi`

---

### Task 5: Integrazione nel canvas

Spec §4.2, §4.3, §3.2.

**Files:**
- Modify: `src/editor/kinds/sequence.ts`, versione completa:
  - `addNode` → `addSequence`, con `edit: null`;
  - `addEdge` (vedi la regola sotto);
  - `commitDrag`, `deleteItems`, `duplicateNodes`;
  - `refuseNode` restituisce sempre `null`.
- Modify: `src/editor/kinds/canvas-ops.ts`, in `deleteItems` (`:240-255`): stacca anche le Note la cui àncora comincia con `<chiave eliminata>/`. È una regola generica sul prefisso, senza nominare la famiglia (Review Focus 1).
- Modify: `src/ui/canvas/kinds/sequence.tsx`, in `tools`: `{ label: "Sequenza", key: "s", Icon: <icona lucide di sequenza>, tool: "node", family: "sequence" }`. Se `s` è già usato, scegli un tasto libero: lo verifica `registry.test.ts:128`.
- Modify: `src/ui/canvas/use-canvas-interaction.ts:181`: `family === "sequence"` → `setEditing({ key: hit.key, target: "body" })`.
- Create: `src/ui/canvas/SequenceEditor.tsx`. Modifica sul posto del testo del sotto-elemento in `editing`: nome o etichetta del partecipante, testo del messaggio o della nota di sequenza, condizione della sezione dall'etichetta del blocco, titolo dall'intestazione. Montalo in `src/ui/canvas/Canvas.tsx:65-69`.
- Modify: `src/ui/canvas/Sequence.tsx`, la linea d'inserimento durante il drag di un sotto-elemento. Legge `sessionStore.dragging` e la posizione del puntatore che serve al drag già esistente, e disegna lo slot di `dropTarget`.
- Test: `src/editor/kinds/canvas-ops.test.ts` (nuovo `describe("canvasOps e le sequenze")`), `src/ui/canvas/kinds/registry.test.ts`

**Interfaces:**
- Consumes: i comandi (Task 4) e `subRect` (Task 3).
- **Regola dei sotto-elementi**: la chiave `<seq>/<sub>` è un nodo per selezione, drag, `rectOf` e àncore, ma non compare in `nodeKeys`. Quindi non entra nella selezione a riquadro e non entra in Disponi.
  - `commitDrag(keys, dx, dy)`:
    - **intestazione di un partecipante**: `moveParticipant` all'indice della colonna più vicina a `x` più `dx`;
    - **passo**: `moveStep` verso `dropTarget` alla `y` del rilascio;
    - **solo chiavi di sequenze**: `moveNodes("sequence", …)`;
    - **misto**: muove solo le sequenze.
  - `addEdge(source, target)`:
    - **due partecipanti della stessa sequenza**: `addMessage` in fondo alla successione, anche con `source === target`, che dà un messaggio a sé stesso;
    - **altrimenti**: `null`.
  - È **una scelta del piano**: «trascinare da una linea di vita a un'altra» (spec §4.2) si fa con lo strumento Collega fra le due intestazioni. Così si evita una modalità d'interazione nuova. Il riordino successivo è il drag del passo.
  - Se `canvasOps.addEdge` rifiuta `source === target` prima di chiedere alla famiglia, il messaggio a sé stesso passa solo dal pannello (Task 6). Scrivilo nel report.
  - `deleteItems(nodeKeys)`:
    - **chiave di sequenza**: `deleteSequences`;
    - **chiave di sotto-elemento**: `deleteParticipant` o `deleteSteps`;
    - tutto in una sola Recipe.

- [ ] **Step 1: Test (falliscono)**
  - Lo strumento crea una sequenza. Disponi la mette in fila senza cambiarne l'interno.
  - Collega fra due intestazioni crea un messaggio. Collega fra una sequenza e un'entità viene rifiutato con «Non esiste un collegamento fra una sequenza e un'entità.».
  - Una Nota si ancora a un partecipante, e la linea parte dalla sua intestazione.
  - Eliminare il partecipante stacca la Nota. Eliminare la sequenza stacca anche le Note ancorate ai suoi partecipanti. Un undo riporta tutto (Review Focus 1).
  - `commitDrag` di un passo verso un blocco. `commitDrag` di un'intestazione verso un'altra colonna.
  - Le chiavi dei sotto-elementi non sono in `nodeKeys`.
- [ ] **Step 2:** FAIL → **Step 3: Implementa** → **Step 4:** `pnpm vitest run --exclude '.claude/**' && pnpm exec tsc -b && pnpm lint && pnpm e2e` → verde.
- [ ] **Step 5: Commit** — `feat(sequence): sequenze sul canvas, strumento, drag e àncore sui partecipanti`

---

### Task 6: Pannello delle proprietà

Spec §4.2.

**Files:**
- Create: `src/ui/panels/SequenceProperties.tsx` e `SequenceProperties.test.tsx`, sul modello di `ShapeProperties.tsx`.
- Modify: `src/ui/canvas/kinds/sequence.tsx`, `Properties: SequenceProperties`.

**Interfaces:**
- Consumes: i comandi (Task 4) e `familySelectedKeys(selection, "node", "sequence")[0]`. Il valore è una chiave di sequenza o di sotto-elemento.
- Corpi del pannello, con gli `id` che usa l'e2e:
  - **sequenza**: `#sequence-title`, `#sequence-autonumber`, «+ partecipante»;
  - **partecipante**: `#participant-name`, che mostra l'errore e non scrive se `renameParticipant` restituisce `null`; `#participant-label`; `#participant-kind`;
  - **messaggio**: `#message-text`, `#message-line`, `#message-head`, `#message-from`, `#message-to`;
  - **nota di sequenza**: `#note-step-text`, `#note-step-placement`, uno o due partecipanti;
  - **blocco**: `#block-operator`, un campo condizione per sezione, «+ sezione» e «− sezione» quando l'operatore lo permette.
- Pulsanti comuni ai passi: «+ messaggio dopo», «+ nota dopo», «Avvolgi in blocco» (`loop`), «Elimina».

- [ ] **Step 1: Test (falliscono)**: un test per ogni corpo, che modifica un campo e verifica il modello. Il nome duplicato viene rifiutato con un messaggio. «Avvolgi in blocco» crea un `loop` intorno al passo.
- [ ] **Step 2:** FAIL → **Step 3: Implementa** → **Step 4:** PASS
- [ ] **Step 5: Commit** — `feat(sequence): pannello delle proprietà`

---

### Task 7: Parser di `sequenceDiagram`

Spec §5, ricerca §2.1–2.2.

**Files:**
- Create: `src/io/mermaid/sequence-parse.ts`, `sequence-parse.test.ts`, `sequence-fixtures.ts` (`SEQUENCE_VALID`)

**Interfaces:**
- Produces:

```ts
export interface SequenceAstParticipant { name: string; label: string | null; kind: "participant" | "actor"; at: number }
export type SequenceAstStep =
  | { kind: "message"; from: string; to: string; text: string; arrow: string; at: number }   // arrow = la freccia come scritta
  | { kind: "note"; placement: "left" | "right" | "over"; participants: string[]; text: string; at: number }
  | { kind: "block"; operator: string; sections: { condition: string; steps: SequenceAstStep[]; at: number }[]; at: number }
export interface SequenceAst {
  title: string | null
  autonumber: boolean
  participants: SequenceAstParticipant[]    // ordine di prima comparsa, ridichiarazione già risolta
  steps: SequenceAstStep[]
}
export function parseSequence(text: string): { ast: SequenceAst; warnings: ParseWarning[] }
```

- Le regole sono quelle della spec §5. Gli avvisi di sintassi (attivazioni, `rect`, `box`, `create`/`destroy`, `link*`, `properties`, `details`, `acc*`, `wrap:`, `()`, `par_over`, `autonumber` con argomenti, `@{…}`) li emette il parser, con i testi del map (Task 8) fissati qui.
- I passi di un `rect` restano nel contenitore del `rect`.
- Il parser non usa `stripNoise`: in sequence `%%` e `#` hanno regole proprie. Usa `stripFrontMatter` da `common.ts`.

- [ ] **Step 1: Test (falliscono)**, un `it` per regola della spec §5:
  - `;` che separa le istruzioni;
  - `#` che tronca il testo;
  - `%` come commento;
  - testo con `:` e `%`;
  - testo vuoto;
  - un messaggio senza `:` dà errore;
  - nomi con spazi e `-`;
  - alias fra virgolette, che restano;
  - ridichiarazione;
  - partecipante implicito;
  - parole chiave maiuscole;
  - entità e `<br>`;
  - le 10 frecce e le 16 mezze frecce;
  - blocchi annidati, con sezioni a condizione vuota;
  - `end` mancante, `end` in più e `else` sotto `loop` danno errore;
  - `deactivate` di un inattivo dà errore;
  - `create` senza messaggio dà errore;
  - due `box` sullo stesso partecipante danno errore.
- [ ] **Step 2:** FAIL → **Step 3: Implementa** → **Step 4:** PASS, più un `it.each(Object.entries(SEQUENCE_VALID))` che le analizza senza errori, come per lo state.
- [ ] **Step 5: Commit** — `feat(import-mermaid): parser di sequenceDiagram`

---

### Task 8: Map, voci dei registri e innesto

Spec §6, §7.

**Files:**
- Create: `src/io/mermaid/sequence-map.ts`, `sequence-map.test.ts`
- Modify:
  - `src/io/mermaid/formats.ts` (`FragmentByFamily.sequence`, voce `sequenceDiagram`);
  - `src/io/mermaid/analyse.ts` (`readyOf`, `case "sequence"`);
  - `src/ui/import/mermaid-families.tsx` (voce `sequence`);
  - `src/editor/commands/import-mermaid.ts`: esporta `originBelow` e aggiungi `rekeySequence` e `importMermaidSequence`.
- Test: `src/editor/commands/import-mermaid.test.ts` (nuovo `describe`), `src/ui/import/mermaid-families.test.tsx`, `src/io/mermaid/formats.test.ts`. Quest'ultimo scorre già il registro: aggiorna solo il testo atteso dell'errore.

**Interfaces:**
- Produces:
  - `SequenceFragment = { sequence: Sequence; warnings: ParseWarning[] }`. Gli id provvisori sono i nomi; quelli definitivi li assegna `rekeySequence`.
  - `mapSequence(ast, text): SequenceFragment`
  - `rekeySequence(seq): Sequence`: uuid nuovi per partecipanti, passi e sezioni, con i riferimenti riscritti.
  - `importMermaidSequence(seq, at: Point): { key: string; recipe: Recipe }`
- Mappatura con la tabella della spec §6:
  - mezze frecce → `filled` con la stessa linea, con avviso;
  - `title` → `title`.
- Voce `sequence` di `FAMILY_IMPORTS`, con i testi della spec §7 alla lettera:
  - `noun: "sequenza"`;
  - `fates: () => ({})`;
  - `importable` vale 1, oppure 0 se non ci sono partecipanti;
  - `prepare` chiama `importMermaidSequence(rekeySequence(fr.sequence), originBelow(nodeRects(doc)))`, con `elements: 1` e `fallback: null`;
  - `summary`;
  - `tally` restituisce `{ relations: <messaggi totali>, notes: 0, pools: <partecipanti totali> }`. Il campo `pools` qui porta i partecipanti.
  - `report` con «Importata **1** sequenza con **N** partecipanti e **M** messaggi.», dove N e M vengono da `delta.pools` e `delta.relations`.
  - Usare `pools` per i partecipanti è un adattamento del piano. Se il revisore lo trova fuorviante, la correzione è rinominare `Tally` in modo generico, non aggiungere codice per famiglia nel dialog.
- Voce del formato: `sequenceDiagram: format({ keywords: ["sequenceDiagram"], label: "sequence", named: "un sequenceDiagram", family: "sequence", analyse })`.

- [ ] **Step 1: Test (falliscono)**
  - Map: un test per ogni riga della tabella della spec §6, compreso il Review Focus 4, cioè partecipanti senza messaggi.
  - `rekeySequence`: nessun id del testo resta, e i riferimenti sono coerenti.
  - Innesto: la sequenza va sotto il contenuto esistente. Un secondo import la duplica. Un undo la toglie.
  - Registro: riepilogo, pulsante «Importa 1 sequenza» e frase finale alla lettera.
  - `ImportMermaidDialog.tsx` non cambia: `git diff --stat` non lo tocca.
- [ ] **Step 2:** FAIL → **Step 3: Implementa** → **Step 4:** `pnpm vitest run --exclude '.claude/**' && pnpm exec tsc -b && pnpm lint` → verde.
- [ ] **Step 5: Commit** — `feat(import-mermaid): import di sequenceDiagram nella famiglia sequence`

---

### Task 9: Export testo e dialog

Spec §8.1, §8.2.

**Files:**
- Create: `src/io/emit/sequence-mermaid.ts`, `sequence-mermaid.test.ts`
- Modify: `src/ui/export/TextExportDialog.tsx`:
  - togli `sequence` dall'`Exclude`;
  - aggiungi `Format "sequence-mermaid"`;
  - aggiungi le voci `FORMAT_FAMILY`, `Models.sequence: SequenceModel | null`, `emit`, `FORMATS` («Mermaid sequenze») e `MODEL_LIMITS`.
- Modify: `TextExportDialog.test.tsx`

**Interfaces:**
- Produces:
  - `emitSequenceMermaid(seq: Sequence, seqKey: string, notes: Readonly<Record<string, Note>>): EmitResult`, per una sola sequenza;
  - `emitSequences(model: SequenceModel, notes): EmitResult & { extension: "mmd" | "md" }`. Con una sequenza restituisce il testo della sequenza; con più di una restituisce il `.md` della spec §8.2, cioè `## <titolo>` oppure `## Sequenza N`.
- `FORMATS` riceve un campo facoltativo `extensionOf?: (result) => string`, che solo il formato sequence usa. Lo legge il punto del dialog che oggi legge `extension`. È una scelta del piano: l'estensione dipende dal contenuto, ma il dialog non nomina la famiglia.
- Note della famiglia note ancorate a `sequence/…`: un avviso aggregato, «N note ancorate a una sequenza non sono uscite: i sequenceDiagram di Mermaid non hanno note libere.», con la forma singolare per N = 1, come `flow-mermaid.ts:116`.
- `MODEL_LIMITS.sequence`: «Le Note ancorate non escono; le Note di sequenza sì. Più sequenze escono come blocchi di un file Markdown.»

- [ ] **Step 1: Test (falliscono)**
  - Le 10 frecce.
  - Partecipanti dichiarati con `actor` e `as`.
  - `title` e `autonumber`.
  - Blocchi annidati con `else`, `and` e `option`, e una condizione vuota.
  - L'escape `#59;`, `#35;`, `<br>`.
  - Un nome non valido diventa `p1` con avviso.
  - Le Note scartate con avviso.
  - Due sequenze danno un `.md` con due blocchi.
  - Nel dialog: il formato compare solo con sequenze presenti, e l'estensione è `md` con due sequenze.
- [ ] **Step 2:** FAIL → **Step 3: Implementa** → **Step 4:** PASS, poi tsc e lint.
- [ ] **Step 5: Commit** — `feat(export): export sequenceDiagram`

---

### Task 10: Oracolo, round-trip e linearità

Spec §8.4, §10.

**Files:**
- Modify: `src/io/mermaid/oracle.test.ts`, nuovo `describe("oracolo Mermaid: sequenceDiagram")`.
- Create: `src/io/mermaid/sequence-round-trip.test.ts`
- Modify: `src/io/mermaid/sequence-parse.test.ts`, test di linearità.

- [ ] **Step 1: Test.**
  - **Oracolo**, per ogni fixture di `SEQUENCE_VALID`:
    - `mermaid.parse` la accetta;
    - dopo `await mermaid.parse(text)`, `getDiagramFromText(text).db` dà `getActors()`: ordine, nome, etichetta (`description` senza le virgolette che Mermaid tiene) e genere uguali ai nostri;
    - `getMessages()`, ripiegata in blocchi con le coppie start/end (`db.LINETYPE`) e decodificata dai segnaposto (`ﬂ°°` → `&#`, `ﬂ°` → `&`, `¶ß` → `;`), dà messaggi, note e blocchi uguali ai nostri;
    - restano fuori i costrutti persi con avviso.
  - **Round-trip** (Review Focus 3 e 4):
    - per ogni fixture: analyse, poi `emitSequenceMermaid`, poi `mermaid.parse` accetta (nell'oracolo, perché `mermaid` si importa solo lì), poi analyse dà lo stesso `Sequence` a meno degli id;
    - lo stesso giro su modelli costruiti a mano con testi che contengono `;`, `#` e a capo, e con un partecipante senza messaggi.
  - **Linearità**: 5.000 messaggi in meno di 2000 ms, come `flow-parse.test.ts:178`.
- [ ] **Step 2:** i test girano. Un fallimento vero è un bug del Task 7, 8 o 9: correggi lì, con un test, e scrivilo nel report.
- [ ] **Step 3: Commit** — `test(import-mermaid): oracolo e round-trip di sequenceDiagram`

---

### Task 11: E2E

Spec §10.

**Files:**
- Create: `scripts/e2e/sequenza.mjs`, sul modello di `scripts/e2e/forme.mjs`, registrato in `scripts/e2e/run.mjs` come `runForme`.
- Modify: `scripts/e2e/import-mermaid.mjs`, con un passo di import della sequenza.

- [ ] **Step 1: Scrivi lo scenario.**
  1. Lo strumento Sequenza crea una sequenza con due partecipanti e un messaggio.
  2. Collega fra le due intestazioni aggiunge un messaggio.
  3. Il drag dell'intestazione di `B` prima di `A` cambia l'ordine delle colonne.
  4. ⌘Z lo ripristina.
  5. Il pannello cambia la punta del messaggio.
  6. Una Nota ancorata a un partecipante si stacca quando il partecipante viene eliminato.
  7. L'import Mermaid della sequenza del redattore (spec mappa, ticket #21) mostra il riepilogo «4 partecipanti, 11 messaggi, 0 blocchi». Il numero esatto va verificato sul testo; poi «Importa 1 sequenza».
  8. L'export testo «Mermaid sequenze» contiene `sequenceDiagram`. Con due sequenze l'estensione proposta è `.md`.
- [ ] **Step 2:** `pnpm e2e` → tutti i passi `ok`. Quelli esistenti restano invariati.
- [ ] **Step 3: Commit** — `test(e2e): scenario della famiglia sequence`

---

## Note per chi esegue

- **Ordine**: è quello della spec §12. Ogni task è verde e committabile da solo. Dopo il Task 1 la build va pubblicata solo insieme al resto, perché un documento salvato in v9 non si apre con una build precedente.
- **Scelte del piano dove la spec lascia aperto**, da confermare in review:
  - I sotto-elementi si indirizzano con la chiave `<seq>/<sub>` invece di estendere `SelectionKind`.
  - I messaggi si creano con lo strumento Collega fra due intestazioni.
  - Il tasto dello strumento è `s`.
  - `Tally.pools` porta il numero dei partecipanti.
  - `FORMATS.extensionOf` dà l'estensione `.md` con più sequenze.
  - La sequenza dello strumento ha i partecipanti «A» e «B» e un messaggio vuoto.
  - Le mezze frecce si importano come `filled`.
  - `## Sequenza N` per una sequenza senza titolo.
- **Fuori da questo piano**: gli `if` non esaustivi della spec §9, che il piano tocca solo dove la famiglia lo richiede (dblclick, editor in `Canvas.tsx`). Diventano voci di registro in un refactor a parte, se il revisore finale lo chiede.
