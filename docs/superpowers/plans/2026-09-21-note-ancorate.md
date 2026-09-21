# Note ancorate — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una nota del class diagram può dichiarare la classe che commenta, e quel legame si vede sul canvas, esce nell'export e conta per «Disponi».

**Architecture:** l'ancoraggio è una **settima specie di relazione** (`note-link`) dentro `model.relations`, con la chiave della nota in `source.class` e la classe in `target.class`. Non è un campo sulla nota: il layer del canvas itera `model.relations` e `buildSvg` incrocia `edgesTouching` con lo stesso record, quindi un ancoraggio fuori di lì sarebbe invisibile a entrambi e obbligherebbe a due pipeline di archi parallele. Vivendo lì dentro, render, selezione, cancellazione, undo, fascio ed export SVG/PNG funzionano senza una riga nuova; il prezzo sono cinque guardie nei punti che enumerano le specie.

**Tech Stack:** TypeScript, zod, immer, React 19, zustand, vitest, Playwright (Chrome di sistema) per l'e2e.

**Spec:** [`docs/superpowers/specs/2026-09-21-note-ancorate-design.md`](../specs/2026-09-21-note-ancorate-design.md)

## Global Constraints

- **Nessuna migrazione.** `SCHEMA_VERSION` resta **2** e `src/model/migrations.ts` non guadagna nessuno step: aggiungere un valore a un enum zod non tocca i documenti esistenti, perché nessuno di essi contiene `note-link`.
- **Una nota, al più un ancoraggio.** Un secondo trascinamento sostituisce il primo, non ne aggiunge un altro.
- **La direzione si normalizza**: qualunque verso abbia il gesto, la nota finisce in `source`, la classe in `target`.
- **Regole di layering** (`eslint.config.js`): `src/model` non importa da `src/editor`; `src/editor` non importa React. Le guardie vanno nello strato dove il dato vive.
- **TDD obbligatorio**: nessun codice di produzione senza un test che è stato visto fallire per la ragione giusta.
- **Cancelli verdi prima di ogni commit**: `pnpm lint`, `pnpm test`, `pnpm build`.
- **Lingua**: commenti e messaggi di commit in italiano, identificatori in inglese.

---

## Struttura dei file

| file | responsabilità in questo piano |
|---|---|
| `src/model/class/schema.ts` | la specie `note-link`, il tipo `ClassRelationKind`, il predicato `isClassRelation`, la lista `CLASS_RELATION_KINDS` |
| `src/model/class/validate.ts` | `dangling-relation` sa che la sorgente di un ancoraggio è una nota |
| `src/editor/class/commands.ts` | `addNoteLink`; `deleteClassItems` porta via l'ancoraggio con la nota; `classLayoutGraph` include le note |
| `src/editor/class/geometry.ts` | tratteggio e assenza di punta per `note-link` |
| `src/editor/kinds/class.ts` | `addEdge` smette di rifiutare le note e chiama `addNoteLink` |
| `src/io/emit/class-mermaid.ts` | `note for X "…"`; la specie `note-link` non esce come riga di relazione |
| `src/ui/panels/ClassProperties.tsx` | il selettore non offre `note-link`; un ancoraggio selezionato non si modifica |
| `scripts/e2e/class-note.mjs` | lo scenario end-to-end guadagna l'ancoraggio |

Nessun file nuovo: ogni pezzo ha già il suo posto, e l'ancoraggio non introduce una responsabilità che non esista.

---

### Task 1: La specie nel modello, e i due punti che la esaurivano

**Files:**
- Modify: `src/model/class/schema.ts:52-55`
- Modify: `src/io/emit/class-mermaid.ts:28-38`
- Modify: `src/ui/panels/ClassProperties.tsx:33-54`
- Test: `src/model/class/schema.test.ts`

**Interfaces:**
- Consumes: niente (prima task).
- Produces: `RelationKind` include `"note-link"`; `type ClassRelationKind = Exclude<RelationKind, "note-link">`; `isClassRelation(rel: ClassRelation): rel is ClassRelation & { kind: ClassRelationKind }`; `CLASS_RELATION_KINDS: readonly ClassRelationKind[]`. Tutte le task successive usano questi quattro nomi.

Due mappe dichiarano oggi `Record<RelationKind, …>` ed è la ragione per cui questa task esiste da sola: aggiungere il valore all'enum le rompe a compilazione, ed è il compilatore a portarti nei due punti che devono decidere cosa farne. `RELATION_TOKEN` (Mermaid) **non** deve guadagnare una voce — un ancoraggio non è una riga di relazione — quindi si restringe il tipo; `RELATION_LABEL` (UI) **sì**, perché l'etichetta serve a dire all'utente che cos'ha selezionato.

- [ ] **Step 1: Scrivi il test che fallisce**

In `src/model/class/schema.test.ts`, in coda al file:

```ts
describe("note-link", () => {
  const end = (c: string) => ({ class: c, multiplicity: "", role: "" })

  it("è una specie di relazione valida", () => {
    expect(RelationKindSchema.parse("note-link")).toBe("note-link")
  })

  it("non è una relazione fra classi: isClassRelation la esclude", () => {
    expect(isClassRelation({ kind: "note-link", source: end("n1"), target: end("Cliente") })).toBe(false)
    expect(isClassRelation({ kind: "association", source: end("A"), target: end("B") })).toBe(true)
  })

  it("non compare fra le specie che il selettore offre: si crea col gesto, non si sceglie", () => {
    expect(CLASS_RELATION_KINDS).toEqual([
      "association", "generalization", "realization", "composition", "aggregation", "dependency",
    ])
  })
})
```

Aggiungi all'import in testa al file: `CLASS_RELATION_KINDS`, `isClassRelation`, `RelationKindSchema`.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/model/class/schema.test.ts`
Expected: FAIL — `isClassRelation is not a function` e `CLASS_RELATION_KINDS is not defined`. Se invece fallisce per un errore di import di un nome che esiste già, hai sbagliato a scrivere l'import: correggi e rilancia finché il rosso è quello atteso.

- [ ] **Step 3: Aggiungi la specie e i tre nomi**

In `src/model/class/schema.ts`, sostituisci il blocco `RelationKindSchema` (righe 52-55) con:

```ts
export const RelationKindSchema = z.enum([
  "association", "generalization", "realization", "composition", "aggregation", "dependency",
  // Settima specie, e l'unica che non collega due classi: il legame fra una nota e la classe che
  // commenta. `source.class` porta la chiave di una nota, e `multiplicity`/`role` restano vuoti —
  // un ancoraggio non ha verso, nome né cardinalità. Chi enumera le specie "vere" usa
  // `ClassRelationKind`, che la esclude per costruzione.
  "note-link",
])
export type RelationKind = z.infer<typeof RelationKindSchema>

/** Le sei specie che collegano due classi. Esclude l'ancoraggio di una nota. */
export type ClassRelationKind = Exclude<RelationKind, "note-link">

/** Le sei specie offerte dal selettore del pannello: l'ancoraggio si crea col gesto, non si sceglie. */
export const CLASS_RELATION_KINDS: readonly ClassRelationKind[] =
  RelationKindSchema.options.filter((k): k is ClassRelationKind => k !== "note-link")
```

In coda alla definizione di `ClassRelation` (dopo `export type ClassRelation = …`, riga ~78), aggiungi il predicato — sta qui e non nei consumatori perché la distinzione è del modello, e tre file la useranno:

```ts
/**
 * Restringe alle sei specie che collegano due classi. Serve dove la differenza conta davvero:
 * l'emettitore Mermaid (un ancoraggio non è una riga di relazione) e il validatore (la sorgente
 * di un ancoraggio si cerca fra le note, non fra le classi).
 */
export function isClassRelation(rel: ClassRelation): rel is ClassRelation & { kind: ClassRelationKind } {
  return rel.kind !== "note-link"
}
```

- [ ] **Step 4: Ripara le due mappe che il compilatore dichiara incomplete**

Run: `pnpm build`
Expected: due errori, uno per mappa. Riparali così.

In `src/io/emit/class-mermaid.ts` righe 28 e 38, **restringi il tipo** invece di aggiungere una voce:

```ts
const RELATION_TOKEN: Record<ClassRelationKind, string> = {
  generalization: "<|--",
  realization: "..|>",
  composition: "*--",
  aggregation: "o--",
  dependency: "..>",
  association: "--",
}

/** I `kind` che mettono il `target` (il padre/tutto) a sinistra; gli altri tre mettono il `source`. */
const TARGET_LEFT = new Set<ClassRelationKind>(["generalization", "composition", "aggregation"])
```

e cambia la firma di `relationLine` (riga 169) perché il compilatore garantisca che il chiamante abbia filtrato:

```ts
function relationLine(rel: ClassRelation & { kind: ClassRelationKind }, renamed: Map<string, string>): string {
```

Aggiorna l'import dei tipi in testa al file aggiungendo `ClassRelationKind`. Il chiamante si sistema nella Task 5; per ora `pnpm build` segnalerà l'unica chiamata a `relationLine` — **lasciala rossa non è ammesso**, quindi mettici subito la guardia che la Task 5 poi verifica col suo test:

```ts
  for (const key of Object.keys(model.relations).sort()) {
    const rel = model.relations[key]!
    if (!isClassRelation(rel)) continue
    out.push(relationLine(rel, renamed))
  }
```

In `src/ui/panels/ClassProperties.tsx` riga 33, **aggiungi la voce** (l'etichetta serve: la Task 7 la mostra):

```ts
const RELATION_LABEL: Record<RelationKind, string> = {
  association: "Associazione",
  generalization: "Generalizzazione",
  realization: "Realizzazione",
  composition: "Composizione",
  aggregation: "Aggregazione",
  dependency: "Dipendenza",
  "note-link": "Ancoraggio nota",
}
```

> Se le etichette esistenti nel file sono scritte diversamente, **lascia le loro stringhe com'erano** e aggiungi solo la riga `"note-link"`.

e alla riga 53 fai enumerare al selettore la lista ristretta:

```ts
      {CLASS_RELATION_KINDS.map((k) => <option key={k} value={k}>{RELATION_LABEL[k]}</option>)}
```

Aggiorna l'import da `@/model/class/schema` aggiungendo `CLASS_RELATION_KINDS` (e togli `RelationKindSchema` se non resta usato altrove nel file — è ancora usato nell'`onChange`, quindi va tenuto).

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run src/model/class/schema.test.ts`
Expected: PASS, i tre test.

Run: `pnpm lint && pnpm test && pnpm build`
Expected: tutto verde. Il conteggio dei test deve essere quello di prima **più tre**.

- [ ] **Step 6: Commit**

```bash
git add src/model/class/schema.ts src/model/class/schema.test.ts src/io/emit/class-mermaid.ts src/ui/panels/ClassProperties.tsx
git commit -m "feat(class): note-link, la specie che non collega due classi"
```

---

### Task 2: `addNoteLink` e il gesto che lo crea

**Files:**
- Modify: `src/editor/class/commands.ts` (nuova funzione esportata, dopo `addRelation`)
- Modify: `src/editor/kinds/class.ts:60-66`
- Test: `src/editor/class/commands.test.ts`

**Interfaces:**
- Consumes: `isClassRelation`, `ClassRelationKind` dalla Task 1 (qui serve solo la specie `"note-link"` come stringa).
- Produces: `addNoteLink(model: ClassModel, a: string, b: string): { key: string; recipe: Recipe } | null`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/class/commands.test.ts`, in coda al file. Il file ha già gli aiuti `applica` e `cd()` in testa: usali come fanno i test vicini.

```ts
describe("addNoteLink", () => {
  /** Un documento con una classe "Cliente" e una nota "n1", entrambe con una view. */
  function conNotaEClasse(): ClassDocument {
    const doc = createClassDocument("d", "id")
    return produce(doc, (d) => {
      const cd = classDiagram(d)
      cd.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
      cd.model.notes["n1"] = { text: "da rivedere" }
      cd.view.nodes["Cliente"] = { x: 0, y: 0, collapsed: false }
      cd.view.nodes["n1"] = { x: 100, y: 0, collapsed: false }
    })
  }

  it("crea l'ancoraggio con la nota in sorgente e la classe in target", () => {
    const doc = conNotaEClasse()
    const res = addNoteLink(classDiagram(doc).model, "n1", "Cliente")!
    const dopo = classDiagram(applica(doc, res.recipe))
    expect(dopo.model.relations[res.key]).toEqual({
      kind: "note-link",
      source: { class: "n1", multiplicity: "", role: "" },
      target: { class: "Cliente", multiplicity: "", role: "" },
    })
  })

  it("normalizza la direzione: trascinato dalla classe alla nota, la nota resta la sorgente", () => {
    const doc = conNotaEClasse()
    const res = addNoteLink(classDiagram(doc).model, "Cliente", "n1")!
    const rel = classDiagram(applica(doc, res.recipe)).model.relations[res.key]!
    expect(rel.source.class).toBe("n1")
    expect(rel.target.class).toBe("Cliente")
  })

  it("un secondo ancoraggio sostituisce il primo: una nota ne ha al più uno", () => {
    let doc = conNotaEClasse()
    doc = produce(doc, (d) => {
      classDiagram(d).model.classes["Ordine"] = { name: "Ordine", stereotype: "class", attributes: [], methods: [] }
      classDiagram(d).view.nodes["Ordine"] = { x: 200, y: 0, collapsed: false }
    })
    const primo = addNoteLink(classDiagram(doc).model, "n1", "Cliente")!
    doc = applica(doc, primo.recipe)
    const secondo = addNoteLink(classDiagram(doc).model, "n1", "Ordine")!
    const dopo = classDiagram(applica(doc, secondo.recipe))
    expect(Object.keys(dopo.model.relations)).toEqual([secondo.key])
    expect(dopo.model.relations[secondo.key]!.target.class).toBe("Ordine")
  })

  it("nota verso nota non produce niente", () => {
    const doc = produce(conNotaEClasse(), (d) => {
      classDiagram(d).model.notes["n2"] = { text: "altra" }
      classDiagram(d).view.nodes["n2"] = { x: 300, y: 0, collapsed: false }
    })
    expect(addNoteLink(classDiagram(doc).model, "n1", "n2")).toBeNull()
  })
})
```

Aggiungi `addNoteLink` all'import da `./commands` e, se non ci sono già, `classDiagram` da `../class-access` e `ClassDocument`/`createClassDocument` da `@/model/class/schema`.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/editor/class/commands.test.ts`
Expected: FAIL — `addNoteLink is not a function`, quattro volte.

- [ ] **Step 3: Scrivi `addNoteLink`**

In `src/editor/class/commands.ts`, subito dopo `addRelation`:

```ts
/**
 * L'ancoraggio di una nota alla classe che commenta: una voce di `model.relations` di specie
 * `note-link`, con la chiave della nota in `source`.
 *
 * `null` quando gli estremi sono due note o due classi, e quando la classe non esiste: l'unico
 * legame che ha senso è nota → classe. La **direzione si normalizza** — in UML quel legame non ha
 * verso, e chi disegna non deve indovinarlo — e una nota ne ha **al più uno**: un secondo
 * trascinamento è una correzione, non un'aggiunta.
 */
export function addNoteLink(model: ClassModel, a: string, b: string): { key: string; recipe: Recipe } | null {
  const aIsNote = a in model.notes
  if (aIsNote === b in model.notes) return null
  const note = aIsNote ? a : b
  const cls = aIsNote ? b : a
  if (!(cls in model.classes)) return null

  // Le chiavi che questa aggiunta rimpiazza. Escluse anche dal calcolo di `uniqueKey`, altrimenti
  // ri-ancorare alla stessa classe produrrebbe un `_2` per collidere con una voce che sta per sparire.
  const stale = new Set(
    Object.entries(model.relations)
      .filter(([, rel]) => rel.kind === "note-link" && rel.source.class === note)
      .map(([key]) => key),
  )
  const survivors = Object.fromEntries(Object.entries(model.relations).filter(([key]) => !stale.has(key)))
  const key = uniqueKey(survivors, `${note}_${cls}`)

  return {
    key,
    recipe: (draft) => {
      const relations = classDiagram(draft).model.relations
      for (const old of stale) delete relations[old]
      relations[key] = {
        kind: "note-link",
        source: { class: note, multiplicity: "", role: "" },
        target: { class: cls, multiplicity: "", role: "" },
      }
    },
  }
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/editor/class/commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Cabla il gesto**

In `src/editor/kinds/class.ts`, sostituisci il metodo `addEdge` (righe 60-66) e il commento che lo precede con:

```ts
    // Una nota non può essere estremo di una relazione fra classi, ma può esserlo di un
    // **ancoraggio**: è il gesto con cui si dichiara la classe che commenta. `addNoteLink`
    // normalizza la direzione e torna `null` per nota → nota, che resta senza effetto come prima.
    addEdge: (source, target) => {
      const model = diagram().model
      if (source in model.notes || target in model.notes) return addNoteLink(model, source, target)
      return addRelation(model.relations, source, target)
    },
```

Aggiungi `addNoteLink` all'import da `../class/commands`.

Aggiorna il docblock di `DiagramOps.addEdge` in `src/editor/kinds/ops.ts:29-32`, che oggi dichiara il contrario:

```ts
  /** `null` quando i due estremi non possono essere collegati: due note (un ancoraggio ha senso
   *  solo verso una classe), o una classe che non esiste. Una nota **e** una classe producono
   *  invece un ancoraggio (`note-link`, spec note ancorate §4). L'ER non ha note e continua a
   *  tornare sempre un valore. */
  addEdge(source: string, target: string): { key: string; recipe: Recipe } | null
```

- [ ] **Step 6: Cancelli verdi**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: tutto verde. Se un test esistente su `addEdge` asseriva che una nota torna `null`, **va aggiornato**: quel comportamento è ciò che questa task cambia di proposito. Cercalo con `grep -rn "addEdge" src --include="*.test.ts"` e riscrivi l'asserzione su nota → nota, che resta `null`.

- [ ] **Step 7: Commit**

```bash
git add src/editor/class/commands.ts src/editor/class/commands.test.ts src/editor/kinds/class.ts src/editor/kinds/ops.ts
git commit -m "feat(class): lo strumento relazione ancora una nota alla sua classe"
```

---

### Task 3: Integrità del modello — cancellazione e validazione

**Files:**
- Modify: `src/editor/class/commands.ts:137-160` (`deleteClassItems`)
- Modify: `src/model/class/validate.ts:95-101`
- Test: `src/editor/class/commands.test.ts`, `src/model/class/validate.test.ts`

**Interfaces:**
- Consumes: `addNoteLink` (Task 2) per costruire il caso nei test; `isClassRelation` (Task 1).
- Produces: nessun nome nuovo.

Cancellare una **classe** ripulisce già i suoi ancoraggi — il ciclo esistente cancella ogni relazione che tocca una chiave cancellata, e il `target` di un ancoraggio è una classe. Cancellare una **nota** no: la sua chiave sta in `source.class`, che quel ciclo confronta con l'insieme delle classi. È la classe di guasto di DT-5, riferimenti pendenti lasciati nel modello.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/class/commands.test.ts`, dentro il `describe("addNoteLink")` (i suoi aiuti servono qui):

```ts
  it("cancellata la nota, il suo ancoraggio non resta nel modello", () => {
    let doc = conNotaEClasse()
    const link = addNoteLink(classDiagram(doc).model, "n1", "Cliente")!
    doc = applica(doc, link.recipe)
    const dopo = classDiagram(applica(doc, deleteClassItems([], [], ["n1"])!))
    expect(dopo.model.notes).toEqual({})
    expect(dopo.model.relations).toEqual({})
  })

  it("cancellata la classe, l'ancoraggio se ne va col ciclo che c'era già", () => {
    let doc = conNotaEClasse()
    const link = addNoteLink(classDiagram(doc).model, "n1", "Cliente")!
    doc = applica(doc, link.recipe)
    const dopo = classDiagram(applica(doc, deleteClassItems(["Cliente"], [], [])!))
    expect(dopo.model.relations).toEqual({})
    expect(Object.keys(dopo.model.notes)).toEqual(["n1"])
  })
```

In `src/model/class/validate.test.ts`, in coda al file. L'aiuto `modello()` in testa mette sempre `notes: {}`: qui serve un modello con una nota, quindi si costruisce a mano.

```ts
describe("ancoraggi delle note", () => {
  const link = (nota: string, classe: string): ClassRelation =>
    ({ kind: "note-link", source: end(nota), target: end(classe) })

  const conNota = (relazioni: ClassRelation[], notes: Record<string, { text: string }> = { n1: { text: "x" } }): ClassModel => ({
    classes: { Cliente: classe("Cliente") },
    relations: Object.fromEntries(relazioni.map((r, i) => [`r${i}`, r])),
    notes,
  })

  it("un ancoraggio sano non produce nessun issue", () => {
    expect(validateClass(conNota([link("n1", "Cliente")]))).toEqual([])
  })

  it("ancoraggio verso una classe che non esiste: dangling-relation", () => {
    const issues = validateClass(conNota([link("n1", "Fantasma")]))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.code).toBe("dangling-relation")
    expect(issues[0]!.message).toContain("Fantasma")
  })

  it("ancoraggio da una nota che non esiste più: dangling-relation", () => {
    const issues = validateClass(conNota([link("sparita", "Cliente")]))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.code).toBe("dangling-relation")
    expect(issues[0]!.message).toContain("sparita")
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/editor/class/commands.test.ts src/model/class/validate.test.ts`
Expected: FAIL. In `commands.test.ts`, «cancellata la nota» trova la relazione ancora lì (`relations` non è `{}`); «cancellata la classe» dovrebbe già passare — se fallisce, fermati: significa che il ciclo esistente non fa quello che il piano assume, e il piano va corretto prima del codice. In `validate.test.ts`, i primi due falliscono perché l'ancoraggio sano produce oggi un `dangling-relation` fasullo (la nota `n1` non è fra le classi).

- [ ] **Step 3: La nota si porta via il suo ancoraggio**

In `src/editor/class/commands.ts`, dentro la recipe di `deleteClassItems`, sostituisci il ciclo sulle relazioni e il commento sulle note:

```ts
    const notes = new Set(noteKeys)
    for (const [key, rel] of Object.entries(d.model.relations)) {
      if (classes.has(rel.source.class) || classes.has(rel.target.class)) delete d.model.relations[key]
      // Una nota ora **ha** un arco: il suo ancoraggio se ne va con lei. La chiave di una nota sta
      // in `source.class`, che il confronto qui sopra cerca fra le classi e non trova mai.
      else if (rel.kind === "note-link" && notes.has(rel.source.class)) delete d.model.relations[key]
    }
```

e togli il commento `// Le note non hanno archi: nessuna relazione da ripulire di rimbalzo.` sopra il ciclo delle note: non è più vero.

- [ ] **Step 4: Il validatore sa dove cercare la sorgente di un ancoraggio**

In `src/model/class/validate.ts`, sostituisci il ciclo `dangling-relation` (righe 95-101):

```ts
  for (const [key, rel] of Object.entries(model.relations)) {
    if (isClassRelation(rel)) {
      for (const end of [rel.source, rel.target]) {
        if (!(end.class in model.classes)) {
          issues.push({ code: "dangling-relation", severity: "error", edge: key, message: `relazione "${key}": classe "${end.class}" inesistente` })
        }
      }
      continue
    }
    // L'ancoraggio di una nota: la sorgente si cerca fra le note, non fra le classi. Stesso codice
    // di issue — per chi legge il pannello è lo stesso guasto, un arco con un capo nel vuoto.
    if (!(rel.source.class in model.notes)) {
      issues.push({ code: "dangling-relation", severity: "error", edge: key, message: `ancoraggio "${key}": nota "${rel.source.class}" inesistente` })
    }
    if (!(rel.target.class in model.classes)) {
      issues.push({ code: "dangling-relation", severity: "error", edge: key, message: `ancoraggio "${key}": classe "${rel.target.class}" inesistente` })
    }
  }
```

Aggiungi `isClassRelation` all'import da `./schema`.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run src/editor/class/commands.test.ts src/model/class/validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Cancelli verdi e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/editor/class/commands.ts src/editor/class/commands.test.ts src/model/class/validate.ts src/model/class/validate.test.ts
git commit -m "fix(class): l'ancoraggio non sopravvive alla nota, e il pannello lo dice quando è rotto"
```

---

### Task 4: Tratteggiato, e senza punta a nessuno dei due capi

**Files:**
- Modify: `src/editor/class/geometry.ts:116-139`
- Test: `src/editor/class/geometry.test.ts`

**Interfaces:**
- Consumes: la specie `"note-link"` (Task 1).
- Produces: nessun nome nuovo; `isDashed("note-link") === true` e `umlMarkerPath(…, "note-link") === ""`.

**Attenzione, è il punto dove si sbaglia:** la coda di `umlMarkerPath` è `return openArrowPath(at, dir)`, cioè il ramo della **dipendenza**. Una specie che ci cadesse dentro erediterebbe la sua freccia invece di non avere punta. La guardia va scritta esplicitamente, e il test esiste per tenerla.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/class/geometry.test.ts`, in coda al file:

```ts
describe("ancoraggio di una nota", () => {
  it("la linea è tratteggiata, come vuole UML", () => {
    expect(isDashed("note-link")).toBe(true)
  })

  it("nessuna punta a nessuno dei due capi: non eredita la freccia della dipendenza", () => {
    const at = { x: 10, y: 10 }
    for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      expect(umlMarkerPath(at, dir, "note-link")).toBe("")
      // La dipendenza, per contrasto, la punta ce l'ha: se questo diventasse "" il test sopra
      // passerebbe per la ragione sbagliata.
      expect(umlMarkerPath(at, dir, "dependency")).not.toBe("")
    }
  })
})
```

Se il file importa `isDashed`/`umlMarkerPath` con nomi o forme diverse, adeguati a come lo fa già.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/editor/class/geometry.test.ts`
Expected: FAIL — `isDashed` torna `false`, e `umlMarkerPath` torna il path della freccia aperta invece di `""`.

- [ ] **Step 3: Implementa**

In `src/editor/class/geometry.ts`, dentro `umlMarkerPath`, **prima** del `return openArrowPath(at, dir)` finale:

```ts
  // Il legame di una nota non ha punta a nessuno dei due estremi. Esplicito e non per caduta: la
  // riga qui sotto è la freccia aperta della dipendenza, e senza questa guardia l'ancoraggio la
  // erediterebbe.
  if (kind === "note-link") return ""
```

e allarga `isDashed`:

```ts
/** `true` se la linea dell'arco va tratteggiata: realizzazione, dipendenza e ancoraggio di nota. */
export function isDashed(kind: RelationKind): boolean {
  return kind === "realization" || kind === "dependency" || kind === "note-link"
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/editor/class/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Cancelli verdi e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/editor/class/geometry.ts src/editor/class/geometry.test.ts
git commit -m "feat(class): l'ancoraggio si disegna tratteggiato e senza punta"
```

---

### Task 5: Export Mermaid — `note for Cliente`

**Files:**
- Modify: `src/io/emit/class-mermaid.ts:242-255`
- Test: `src/io/emit/class-mermaid.test.ts`

**Interfaces:**
- Consumes: `isClassRelation` (Task 1), già cablata nel ciclo delle relazioni allo Step 4 della Task 1.
- Produces: nessun nome nuovo.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/io/emit/class-mermaid.test.ts`, in coda al file. Adegua i nomi degli aiuti a quelli che il file usa già per costruire un `ClassModel`.

```ts
describe("note ancorate", () => {
  const end = (c: string) => ({ class: c, multiplicity: "", role: "" })
  const cliente = { name: "Cliente", stereotype: "class" as const, attributes: [], methods: [] }

  it("la nota ancorata esce come `note for`, la libera resta `note`", () => {
    const out = emitClassMermaid({
      classes: { Cliente: cliente },
      relations: { r0: { kind: "note-link", source: end("n1"), target: end("Cliente") } },
      notes: { n1: { text: "da rivedere" }, n2: { text: "legenda" } },
    })
    expect(out.text).toContain('note for Cliente "da rivedere"')
    expect(out.text).toContain('note "legenda"')
  })

  it("l'ancoraggio non esce anche come riga di relazione", () => {
    const out = emitClassMermaid({
      classes: { Cliente: cliente },
      relations: { r0: { kind: "note-link", source: end("n1"), target: end("Cliente") } },
      notes: { n1: { text: "x" } },
    })
    expect(out.text).not.toContain("n1")
  })

  it("un ancoraggio verso una classe che non c'è esce come nota libera, non come `note for` rotta", () => {
    const out = emitClassMermaid({
      classes: { Cliente: cliente },
      relations: { r0: { kind: "note-link", source: end("n1"), target: end("Fantasma") } },
      notes: { n1: { text: "x" } },
    })
    expect(out.text).toContain('note "x"')
    expect(out.text).not.toContain("Fantasma")
  })
})
```

> Se `emitClassMermaid` restituisce il testo sotto un campo diverso da `.text`, usa quello: guarda un test esistente nello stesso file.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/io/emit/class-mermaid.test.ts`
Expected: FAIL — esce `note "da rivedere"` senza il `for`. Il secondo test può già passare (la guardia della Task 1): va bene, è lì per non far regredire quella guardia.

- [ ] **Step 3: Implementa**

In `src/io/emit/class-mermaid.ts`, sostituisci il ciclo sulle note (righe 251-255):

```ts
  // L'ancoraggio sta fra le relazioni, non sulla nota: qui si ribalta in una mappa nota → classe,
  // una passata sola, perché il ciclo qui sotto è ordinato per chiave di nota e non di relazione.
  const anchorOf = new Map<string, string>()
  for (const rel of Object.values(model.relations)) {
    if (rel.kind === "note-link") anchorOf.set(rel.source.class, rel.target.class)
  }

  for (const key of Object.keys(model.notes).sort()) {
    const text = model.notes[key]!.text
    // Una nota vuota non ha niente da dire: `note ""` è rumore nel file emesso.
    if (text === "") continue
    const anchor = anchorOf.get(key)
    // Un ancoraggio verso una classe che non esiste esce come nota libera: `note for Fantasma`
    // sarebbe un file che Mermaid rifiuta, e il pannello problemi segnala già il guasto (§8).
    const head = anchor !== undefined && anchor in model.classes ? `note for ${safeName(anchor, renamed)}` : "note"
    out.push(`  ${head} "${noteText(text)}"`)
  }
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/io/emit/class-mermaid.test.ts`
Expected: PASS, e i test esistenti sulle note libere restano verdi.

- [ ] **Step 5: Cancelli verdi e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/io/emit/class-mermaid.ts src/io/emit/class-mermaid.test.ts
git commit -m "feat(export): la nota ancorata esce come note for, e dice a chi"
```

---

### Task 6: «Disponi» — tutte le note entrano nel grafo

**Files:**
- Modify: `src/editor/class/commands.ts:218-238` (`classLayoutGraph`)
- Test: `src/editor/class/commands.test.ts`

**Interfaces:**
- Consumes: `noteSize` da `./geometry`, `addNoteLink` (Task 2) nei test.
- Produces: nessun nome nuovo.

Il ciclo sugli archi **non cambia**: un `note-link` ha entrambi i capi in `present` appena le note diventano nodi, e prende la stessa inversione sorgente/target degli altri (ADR 0006 — la classe commentata sta sopra la sua nota).

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/editor/class/commands.test.ts`, dentro il `describe("addNoteLink")`:

```ts
  it("tutte le note sono nodi del grafo di layout, ancorate o no", () => {
    const doc = produce(conNotaEClasse(), (d) => {
      classDiagram(d).model.notes["n2"] = { text: "legenda" }
      classDiagram(d).view.nodes["n2"] = { x: 400, y: 0, collapsed: false }
    })
    const grafo = classLayoutGraph(classDiagram(doc))
    expect(grafo.nodes.map((n) => n.id).sort()).toEqual(["Cliente", "n1", "n2"])
    expect(grafo.nodes.every((n) => n.w > 0 && n.h > 0)).toBe(true)
  })

  it("l'ancoraggio è un arco del grafo, invertito come gli altri: la classe è la sorgente", () => {
    let doc = conNotaEClasse()
    const link = addNoteLink(classDiagram(doc).model, "n1", "Cliente")!
    doc = applica(doc, link.recipe)
    const grafo = classLayoutGraph(classDiagram(doc))
    expect(grafo.edges).toEqual([{ id: link.key, source: "Cliente", target: "n1" }])
  })

  it("una nota senza view resta fuori dal grafo, come una classe senza view", () => {
    const doc = produce(conNotaEClasse(), (d) => {
      classDiagram(d).model.notes["orfana"] = { text: "senza view" }
    })
    expect(classLayoutGraph(classDiagram(doc)).nodes.map((n) => n.id)).not.toContain("orfana")
  })
```

Aggiungi `classLayoutGraph` all'import da `./commands`.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/editor/class/commands.test.ts`
Expected: FAIL — il grafo ha il solo nodo `Cliente`, e `edges` è vuoto perché l'arco viene scartato (`present` non contiene `n1`).

- [ ] **Step 3: Implementa**

In `src/editor/class/commands.ts`, dentro `classLayoutGraph`, subito dopo il ciclo sulle classi e **prima** di `const present = …`:

```ts
  // Anche le note, ancorate o no. L'ancorata atterra accanto alla sua classe perché porta un arco;
  // la libera è un nodo isolato, che ELK colloca senza sovrapporla a niente — prima restava dov'era
  // e poteva finire sotto un nodo che nel frattempo si era spostato.
  for (const [key, note] of Object.entries(diagram.model.notes)) {
    if (diagram.view.nodes[key]) nodes.push({ id: key, ...noteSize(note) })
  }
```

Aggiungi `noteSize` all'import da `./geometry` (il file importa già `classSize` da lì).

Aggiorna il docblock di `classLayoutGraph`, che oggi dice che le note restano fuori: ora dice che entrano, e perché.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/editor/class/commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Cancelli verdi e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/editor/class/commands.ts src/editor/class/commands.test.ts
git commit -m "feat(layout): le note entrano nel grafo, e l'ancorata segue la sua classe"
```

---

### Task 7: Il pannello — un ancoraggio si guarda, non si modifica

**Files:**
- Modify: `src/ui/panels/ClassProperties.tsx:119-155` (`RelationProperties`)

**Interfaces:**
- Consumes: `RELATION_LABEL["note-link"]` e `CLASS_RELATION_KINDS` (Task 1).
- Produces: nessun nome nuovo.

Un ancoraggio non ha specie da cambiare, né nome, molteplicità o ruoli: mostrarne i campi inviterebbe a scrivere dati che l'export butta via. Il cablaggio React di questo pannello non ha test unitari nel repo (stessa ragione di DT-19): lo copre la Task 8 con un passo e2e.

- [ ] **Step 1: Aggiungi il ramo**

In `src/ui/panels/ClassProperties.tsx`, in testa a `RelationProperties`, subito dopo `if (!rel) return null`:

```tsx
  // Un ancoraggio si crea col gesto e si toglie cancellandolo: non ha specie da convertire (il
  // selettore non lo offre, `CLASS_RELATION_KINDS`), né nome, molteplicità o ruoli che l'export
  // sappia rappresentare. Il pannello dice che cos'è e a chi punta.
  if (rel.kind === "note-link") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs text-muted-foreground">{RELATION_LABEL["note-link"]}</p>
        <p className="text-sm">
          La nota commenta <span className="font-medium">{rel.target.class}</span>.
        </p>
      </div>
    )
  }
```

- [ ] **Step 2: Verifica a mano che il pannello non offra più il tipo**

Run: `pnpm dev`, poi nel browser: «Nuovo ▸ Class diagram», crea una classe, crea una nota, prendi lo strumento relazione e trascina dalla nota alla classe.

Expected: il tratteggio compare; l'arco risulta selezionato e il pannello mostra «Ancoraggio nota» e la frase, **senza** il menu «Tipo». Apri poi una relazione fra due classi e verifica che il menu «Tipo» ci sia ancora e non elenchi «Ancoraggio nota».

Se qualcosa non torna, fermati e aggiusta prima di commettere: è l'unico passo di questo piano verificato a occhio, e la Task 8 lo mette sotto rete.

- [ ] **Step 3: Cancelli verdi e commit**

```bash
pnpm lint && pnpm test && pnpm build
git add src/ui/panels/ClassProperties.tsx
git commit -m "feat(ui): il pannello di un ancoraggio dice che cos'è, e non finge di modificarlo"
```

---

### Task 8: End-to-end, e la documentazione che diceva il contrario

**Files:**
- Modify: `scripts/e2e/helpers.mjs` (estrazione di `nodeRects` e `overlappingPairs`)
- Modify: `scripts/e2e/layout.mjs` (li importa invece di definirli)
- Modify: `scripts/e2e/class-note.mjs`
- Modify: `docs/superpowers/specs/2026-09-10-class-diagram-design.md` (§16)
- Modify: `docs/superpowers/specs/2026-09-11-class-diagram-ampiezza-design.md` (§2 e §4)
- Modify: `docs/debito-tecnico.md`
- Modify: `README.md` (la riga che descrive le note del class diagram)

**Interfaces:**
- Consumes: tutto il resto del piano.
- Produces: nessun nome nuovo.

- [ ] **Step 1: Aggiungi i passi allo scenario**

In `scripts/e2e/class-note.mjs`, dopo il passo del trascinamento con annullamento e **prima** del passo di export, aggiungi. `rectByKey` è già definito nel file; per la classe serve il rettangolo per nome, come fa `class.mjs#rectByName` — se l'aiuto non è esportato da `helpers.mjs`, copiane la forma dentro questo file con un commento che dice da dove viene.

```js
    await step("una classe, e lo strumento relazione ancora la nota alla classe", async () => {
      await page.getByRole("radio", { name: "Classe" }).click()
      await page.mouse.click(600, 400)
      await page.keyboard.press("Escape") // chiude l'editor del nome che la creazione apre da sé

      await page.getByRole("radio", { name: "Relazione" }).click()
      const nota = await rectByKey(page, noteKey)
      const classe = await rectByName(page, "class")
      await page.mouse.move(nota.x + nota.w / 2, nota.y + nota.h / 2)
      await page.mouse.down()
      await page.mouse.move(classe.x + classe.w / 2, classe.y + classe.h / 2, { steps: 5 })
      await page.mouse.up()
      await page.waitForSelector("[data-edge-id]")

      // L'ancoraggio appena creato è selezionato (`commit-connect`): il pannello dice che cos'è e
      // **non** offre il menu «Tipo», che appartiene alle sei specie fra classi.
      await page.getByText("Ancoraggio nota").waitFor()
      if (await page.getByLabel("Tipo").count() !== 0) throw new Error("il pannello offre il tipo su un ancoraggio")
    })

    await step("«Disponi»: la nota si muove e non resta sotto nessun nodo", async () => {
      const before = await signature(page)
      await page.getByRole("button", { name: "Disponi" }).click()
      // Stessa attesa e stessa soglia generosa di `layout.mjs`: il worker nasce alla prima
      // richiesta e elkjs pesa ~1,5 MB.
      await page.waitForFunction((before) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now !== before
      }, before, { timeout: 30_000 })

      const overlapping = overlappingPairs(await nodeRects(page))
      if (overlapping.length > 0) throw new Error(`nodi sovrapposti dopo il layout: ${overlapping.join(", ")}`)
    })
```

> `noteKey` è la chiave della nota già ricavata dai passi precedenti dello scenario; se il file la tiene sotto un altro nome, usa quello.

**`nodeRects` e `overlappingPairs` vanno prima estratti**, perché oggi vivono dentro `scripts/e2e/layout.mjs` (righe 29-48) e questo è il secondo scenario che ne ha bisogno. Spostali in `scripts/e2e/helpers.mjs` esportandoli, **con una correzione obbligatoria**: `layout.mjs` li scrive con `g.querySelector("rect")`, e il corpo di una nota è un `<path>` (l'angolo piegato), non un `<rect>` — copiato così com'è, questo scenario chiamerebbe `getBoundingClientRect()` su `null`. In `helpers.mjs`:

```js
/**
 * Rettangoli di schermo di tutti i nodi. `rect, path` e non solo `rect`: il corpo di una nota del
 * class diagram è un `<path>` (l'angolo piegato), e `querySelector` prende comunque il primo che
 * matcha, che per una classe o un'entità resta il suo `rect`.
 */
export async function nodeRects(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-node-id]")].map((g) => {
      const r = g.querySelector("rect, path").getBoundingClientRect()
      return { id: g.getAttribute("data-node-id"), x: r.x, y: r.y, w: r.width, h: r.height }
    }),
  )
}

/** Le coppie di nodi che si sovrappongono. Vuoto è l'unico risultato accettabile. */
export function overlappingPairs(rects) {
  const out = []
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`${a.id}/${b.id}`)
    }
  return out
}
```

Poi in `layout.mjs` togli le due funzioni locali e importale da `./helpers.mjs`, aggiungendole all'import che c'è già. Lancia `node scripts/e2e/layout.mjs` da solo per verificare che quello scenario passi ancora prima di toccare `class-note.mjs`: se si rompe lì, il colpevole è l'estrazione, non lo scenario nuovo.

Nel passo di export che già esiste, cambia l'asserzione da `note "` a `note for`:

```js
      if (!testo.includes('note for')) throw new Error("l'export non ancora la nota alla classe")
```

Aggiorna il docblock in testa al file: elenca ora anche l'ancoraggio e il fatto che «Disponi» muove la nota — è il quarto comportamento che senza un browser vero non esiste, perché nei test unitari il worker di ELK è finto.

- [ ] **Step 2: Esegui l'e2e**

Run: `pnpm e2e`
Expected: sette scenari su sette PASS. Se `class-note` fallisce sul selettore di un ruolo (`radio`, `button`) i nomi accessibili sono diversi da quelli qui: leggili con `HEADLESS=0` e correggi lo script, non l'app.

- [ ] **Step 3: Correggi i tre punti di documentazione che dicevano il contrario**

In `docs/superpowers/specs/2026-09-10-class-diagram-design.md`, §16: togli `note` dall'elenco del fuori scope e aggiungi in coda alla sezione:

```markdown
Le note sono state consegnate dal primo giro di ampiezza (§4 di
`2026-09-11-class-diagram-ampiezza-design.md`) e l'ancoraggio alla classe da
`2026-09-21-note-ancorate-design.md`, che chiude anche il §2 qui sopra: `note
for Cliente` **è** un arco, come quel paragrafo diceva, ed è modellato come tale.
```

In `docs/superpowers/specs/2026-09-11-class-diagram-ampiezza-design.md`, §2, sotto «La nota non si ancora a una classe», aggiungi:

```markdown
> **Non è più vero dal 2026-09-21:** l'ancoraggio è stato consegnato da
> `2026-09-21-note-ancorate-design.md`. Il taglio resta registrato perché la
> ragione per cui fu preso vale ancora — era una spec di ampiezza, non di
> profondità — ed è cambiato solo il momento.
```

e in §4, sotto il paragrafo «Le note non entrano nel grafo di layout»:

```markdown
> **Rivisto dal 2026-09-21:** ora entrano, tutte. L'argomento qui sopra valeva
> finché *ogni* nota era libera; da quando esiste l'ancoraggio, la nota che
> commenta qualcosa atterra accanto alla propria classe, e la libera è
> l'eccezione, per cui si preferisce non sovrapporsi mai al restare ferma.
```

In `docs/debito-tecnico.md`, nell'Archivio del class diagram, barra le due voci in grassetto — «Una nota non si ancora a una classe» e «Le note restano fuori dal layout» — con la forma che il documento usa già (`~~testo~~ **Corretto**, vedi DT-29`), e scrivi `DT-29` in **Corretti**, prima di `### Minori chiuse il 2026-09-09`: cos'era, perché l'ancoraggio è un arco e non un campo sulla nota (il layer del canvas e `buildSvg` iterano `model.relations`), e l'osservazione rimasta aperta:

> **Osservato e non chiuso:** una nota si ancora a una classe, non a una
> relazione, e ne ha al più una. Entrambi i limiti vengono da ciò che Mermaid
> sa rappresentare, non da ciò che l'UML permette.

Aggiorna infine l'intro di **Da correggere** con una riga su DT-29, come il documento fa per ogni giro.

In `README.md`, la riga che descrive le note del class diagram dice che sono testo libero appoggiato sul canvas: aggiungi che una nota può dichiarare la classe che commenta, che il legame esce nell'export Mermaid come `note for`, e che «Disponi» tiene la nota accanto alla sua classe.

- [ ] **Step 4: Cancelli verdi, e tutti e cinque**

```bash
pnpm lint && pnpm test && pnpm build && pnpm e2e
```

Expected: lint pulito, test tutti verdi, build ok, sette scenari e2e PASS.

Run anche: `pnpm perf`
Expected: sei scenari sotto il criterio (p95 ≤ 20 ms). Le note entrano nel grafo di layout ma non nel percorso di drag, quindi non ci si aspetta nessuno spostamento: se un solo scenario sfonda, **fermati e dillo** invece di ritoccare la soglia.

- [ ] **Step 5: Commit**

```bash
git add scripts/e2e/class-note.mjs scripts/e2e/helpers.mjs scripts/e2e/layout.mjs docs README.md
git commit -m "test(e2e): la nota dichiara la sua classe, dal gesto all'export"
```

---

## Self-review del piano

**Copertura della spec**, sezione per sezione:

| spec | task |
|---|---|
| §3 modello, `note-link`, nessuna migrazione | Task 1 |
| §4 gesto (normalizzazione, nota→nota, al più uno) | Task 2 |
| §5 render (tratteggio, nessuna punta) | Task 4 |
| §6 export `note for` | Task 5 |
| §6 documentazione da correggere | Task 8 |
| §7 layout, tutte le note | Task 6 |
| §8 validazione e cancellazione | Task 3 |
| §8 pannello e selettore | Task 1 (selettore) + Task 7 (pannello) |
| §9 test | ogni task porta i propri; l'e2e è la Task 8 |

**Coerenza dei nomi**: `isClassRelation`, `ClassRelationKind`, `CLASS_RELATION_KINDS` e `addNoteLink` sono definiti nella task che li introduce (1 e 2) e usati con la stessa firma in 3, 5 e 6. `noteSize` e `uniqueKey` esistono già nel repo e non cambiano forma.

**Ordine**: la Task 1 deve restare la prima — è l'unica che fa compilare il resto. Le Task 4, 5, 6 sono indipendenti fra loro e si possono eseguire in qualunque ordine dopo la 1; la 3 richiede la 2 (i suoi test costruiscono l'ancoraggio con `addNoteLink`); la 7 richiede la 1; la 8 richiede tutte.
