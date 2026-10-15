import type { ClassDiagram, ClassNode, ClassRelation } from "@/model/class/schema"
import type { DevDocument } from "@/model/document"
import type { Entity, ErDiagram, Relationship } from "@/model/er/schema"
import { splitKey } from "@/model/family"
import type { LayoutGraph, LayoutPositions } from "@/model/layout"
import type { Note } from "@/model/note/schema"
import { classLayoutGraph } from "../class/commands"
import { classDiagram } from "../class-access"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { rectsBounds, snap, type Point, type Rect } from "../geometry"
import { nodeRects } from "../kinds/canvas-ops"
import { nodesBounds } from "../layout-pack"
import { noteDiagram } from "../note-access"
import { noteSize } from "../note/geometry"
import { uniqueKey } from "./er"
import { GUTTER, placeInGrid, placeNew } from "./import"
import { layoutGraph } from "./layout"

/** Cosa succede a un'entità in arrivo, rispetto al documento (spec §7): lo mostra il dialog. */
export type ImportFate = "nuovo" | "sostituisce" | "identico"

/** Uguaglianza campo per campo: `JSON.stringify` dipenderebbe dall'ordine delle chiavi, che il DDL e Mermaid producono diverso. */
export function sameEntity(a: Entity, b: Entity): boolean {
  return (
    a.name === b.name &&
    a.schema === b.schema &&
    a.attributes.length === b.attributes.length &&
    a.attributes.every((x, i) => {
      const y = b.attributes[i]!
      return x.name === y.name && x.type === y.type && x.primaryKey === y.primaryKey && x.foreignKey === y.foreignKey &&
        x.nullable === y.nullable && x.unique === y.unique
    })
  )
}

/** Due relazioni dicono la stessa cosa (spec §5): estremi, colonne, cardinalità, nome e `identifying`. Gli agganci non contano. */
export function sameRelationship(a: Relationship, b: Relationship): boolean {
  const sameEnd = (x: Relationship["source"], y: Relationship["source"]) =>
    x.entity === y.entity && x.cardinality === y.cardinality && x.attributes.join() === y.attributes.join()
  return sameEnd(a.source, b.source) && sameEnd(a.target, b.target) && a.name === b.name && a.identifying === b.identifying
}

/**
 * L'esito di ogni entità in arrivo. Una presente che il testo nomina solo in una relazione
 * (`referenced`) è «identica»: il testo non dice niente del suo contenuto, e sostituirla la svuoterebbe.
 */
export function erImportFates(
  doc: DevDocument, entities: Readonly<Record<string, Entity>>, referenced: ReadonlySet<string> = new Set(),
): Record<string, ImportFate> {
  const present = erDiagram(doc).model.entities
  return Object.fromEntries(
    Object.entries(entities).map(([key, e]) => {
      const old = Object.hasOwn(present, key) ? present[key] : undefined
      return [key, old === undefined ? "nuovo" : referenced.has(key) || sameEntity(old, e) ? "identico" : "sostituisce"]
    }),
  )
}

/**
 * Le sole entità scelte e le relazioni i cui estremi sono tutti scelti o già nel documento
 * (spec §7): una relazione verso un'entità né importata né presente sarebbe pendente.
 */
export function selectErFragment(
  entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[], chosen: ReadonlySet<string>,
  present: ReadonlySet<string>,
): { entities: Record<string, Entity>; relationships: Relationship[] } {
  const picked = Object.fromEntries(Object.entries(entities).filter(([key]) => chosen.has(key)))
  const reachable = (key: string) => Object.hasOwn(picked, key) || present.has(key)
  return { entities: picked, relationships: relationships.filter((r) => reachable(r.source.entity) && reachable(r.target.entity)) }
}

export interface ErPlacement {
  positions: Record<string, Point>
  /** Il messaggio del ripiego sulla griglia, se c'è stato. */
  fallback: string | null
}

/**
 * Le posizioni delle entità **nuove** (spec §6): ELK sul solo frammento, con il grafo di «Disponi»,
 * poi il blocco sotto tutto ciò che è già sul canvas, con l'origine di `placeNew`. Se il motore
 * fallisce si ripiega sulla griglia di `placeNew`. Il motore è iniettato: `editor` non importa `io`.
 */
export async function placeErImport(
  doc: DevDocument, entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[],
  layout: (g: LayoutGraph) => Promise<LayoutPositions>,
): Promise<ErPlacement> {
  const diagram = erDiagram(doc)
  const fresh = Object.keys(entities).filter((key) => !Object.hasOwn(diagram.view.nodes, key))
  if (fresh.length === 0) return { positions: {}, fallback: null }
  const freshSet = new Set(fresh)

  const temporary: ErDiagram = {
    model: {
      entities: Object.fromEntries(fresh.map((key) => [key, entities[key]!])),
      relationships: Object.fromEntries(
        relationships.filter((r) => freshSet.has(r.source.entity) && freshSet.has(r.target.entity)).map((r, i) => [String(i), r]),
      ),
    },
    view: { nodes: Object.fromEntries(fresh.map((key) => [key, { x: 0, y: 0, collapsed: false }])) },
  }
  const graph = layoutGraph(temporary)
  const occupied = nodeRects(doc)
  const positions = await layoutBelow(graph, occupied, layout)
  if (positions === null) {
    return {
      positions: placeNew(temporary.model.entities, diagram, occupied),
      fallback: "La disposizione automatica non è riuscita: le entità nuove sono in griglia.",
    }
  }
  return { positions, fallback: null }
}

/**
 * ELK sul grafo dei soli nodi nuovi, poi il blocco traslato sotto `occupied`, con l'origine di
 * `placeNew` (spec §6). Un nodo solo non passa per il motore. `null` se il motore fallisce: il
 * ripiego sulla griglia lo sceglie il chiamante, che conosce le misure della sua famiglia.
 */
async function layoutBelow(
  graph: LayoutGraph, occupied: readonly Rect[], layout: (g: LayoutGraph) => Promise<LayoutPositions>,
): Promise<Record<string, Point> | null> {
  let raw: LayoutPositions
  try {
    raw = graph.nodes.length > 1 ? await layout(graph) : { [graph.nodes[0]!.id]: { x: 0, y: 0 } }
  } catch {
    return null
  }
  const block = nodesBounds(graph.nodes, raw)!
  const bounds = rectsBounds(occupied)
  const origin = bounds ? { x: bounds.x, y: bounds.y + bounds.h + GUTTER } : { x: GUTTER, y: GUTTER }
  return Object.fromEntries(
    Object.entries(raw).map(([key, p]) => [key, { x: snap(origin.x + p.x - block.x), y: snap(origin.y + p.y - block.y) }]),
  )
}

/**
 * Innesta un frammento ER letto da Mermaid (spec §5), in un solo comando. Un'entità presente viene
 * sostituita e tiene il suo nodo; una nuova prende la posizione da `positions`. Una relazione
 * uguale a una già presente si salta, e nessuna si pota: a differenza di `importEr`, qui le
 * relazioni non vengono da una FK e non ce n'è una derivata da rimpiazzare (ADR 0003).
 */
export function importMermaidEr(
  entities: Readonly<Record<string, Entity>>, relationships: readonly Relationship[], positions: Readonly<Record<string, Point>>,
): Recipe {
  return (draft) => {
    const d = erDiagram(draft)
    for (const [key, entity] of Object.entries(entities)) {
      d.model.entities[key] = entity
      const pos = positions[key]
      if (pos && !Object.hasOwn(d.view.nodes, key)) d.view.nodes[key] = { ...pos, collapsed: false }
    }
    for (const rel of relationships) {
      if (Object.values(d.model.relationships).some((old) => sameRelationship(old, rel))) continue
      d.model.relationships[uniqueKey(d.model.relationships, `${rel.source.entity}_${rel.target.entity}`)] = rel
    }
  }
}

/** Uguaglianza campo per campo, come `sameEntity`: l'ordine delle chiavi non conta, quello dei membri sì. */
export function sameClass(a: ClassNode, b: ClassNode): boolean {
  return (
    a.name === b.name &&
    a.stereotype === b.stereotype &&
    a.attributes.length === b.attributes.length &&
    a.attributes.every((x, i) => {
      const y = b.attributes[i]!
      return x.name === y.name && x.type === y.type && x.visibility === y.visibility && x.isStatic === y.isStatic
    }) &&
    a.methods.length === b.methods.length &&
    a.methods.every((x, i) => {
      const y = b.methods[i]!
      return x.name === y.name && x.type === y.type && x.visibility === y.visibility && x.isStatic === y.isStatic &&
        x.isAbstract === y.isAbstract && x.parameters.length === y.parameters.length &&
        x.parameters.every((p, j) => p.name === y.parameters[j]!.name && p.type === y.parameters[j]!.type)
    })
  )
}

/**
 * Due relazioni dicono la stessa cosa (spec §5): estremi, molteplicità, specie, nome e navigabilità.
 * Agganci e ruoli non contano: Mermaid non porta i ruoli, e il re-import del proprio export duplicherebbe.
 */
export function sameClassRelation(a: ClassRelation, b: ClassRelation): boolean {
  const sameEnd = (x: ClassRelation["source"], y: ClassRelation["source"]) =>
    x.class === y.class && x.multiplicity === y.multiplicity
  return sameEnd(a.source, b.source) && sameEnd(a.target, b.target) && a.kind === b.kind && a.name === b.name &&
    (a.navigable ?? false) === (b.navigable ?? false)
}

/** Una nota con lo stesso testo e la stessa àncora c'è già (spec §5). */
const sameNote = (a: Note, b: Note): boolean => a.text === b.text && a.anchor === b.anchor

/** L'esito di ogni classe in arrivo, con la stessa regola di `erImportFates` per quelle nominate solo in una relazione. */
export function classImportFates(
  doc: DevDocument, classes: Readonly<Record<string, ClassNode>>, referenced: ReadonlySet<string> = new Set(),
): Record<string, ImportFate> {
  const present = classDiagram(doc).model.classes
  return Object.fromEntries(
    Object.entries(classes).map(([key, c]) => {
      const old = Object.hasOwn(present, key) ? present[key] : undefined
      return [key, old === undefined ? "nuovo" : referenced.has(key) || sameClass(old, c) ? "identico" : "sostituisce"]
    }),
  )
}

/** Il frammento di classi pronto per l'innesto: le note hanno già la loro chiave. */
export interface ClassImport {
  classes: Record<string, ClassNode>
  relations: ClassRelation[]
  notes: Record<string, Note>
}

/**
 * Le sole classi scelte, e relazioni e note ancorate i cui estremi sono tutti scelti o già nel
 * documento (spec §7). Le note libere entrano sempre. Le note prendono qui la chiave, un uuid come
 * in `addNote`: serve già alla disposizione.
 */
export function selectClassFragment(
  classes: Readonly<Record<string, ClassNode>>, relations: readonly ClassRelation[], notes: readonly Note[],
  chosen: ReadonlySet<string>, present: ReadonlySet<string>,
): ClassImport {
  const picked = Object.fromEntries(Object.entries(classes).filter(([key]) => chosen.has(key)))
  const reachable = (key: string) => Object.hasOwn(picked, key) || present.has(key)
  return {
    classes: picked,
    relations: relations.filter((r) => reachable(r.source.class) && reachable(r.target.class)),
    notes: Object.fromEntries(
      notes.filter((n) => n.anchor === null || reachable(splitKey(n.anchor).key)).map((n) => [crypto.randomUUID(), n]),
    ),
  }
}

export interface ClassPlacement {
  classes: Record<string, Point>
  notes: Record<string, Point>
  /** Il messaggio del ripiego sulla griglia, se c'è stato. */
  fallback: string | null
}

/**
 * Le posizioni delle classi **nuove** e delle note da aggiungere (spec §6): lo stesso blocco di
 * `placeErImport`, con il grafo di «Disponi» delle classi. Le note entrano nel grafo come nodi, con
 * un arco dalla loro classe quando anche quella è nuova, così ELK le mette accanto.
 *
 * ponytail: una nota ancorata a una classe che c'era già finisce nel blocco nuovo, lontana dalla
 * sua classe. Se dà fastidio, va messa accanto al rettangolo della classe invece che nel grafo.
 */
export async function placeClassImport(
  doc: DevDocument, fragment: ClassImport, layout: (g: LayoutGraph) => Promise<LayoutPositions>,
): Promise<ClassPlacement> {
  const diagram = classDiagram(doc)
  const fresh = Object.keys(fragment.classes).filter((key) => !Object.hasOwn(diagram.view.nodes, key))
  const freshSet = new Set(fresh)
  const existingNotes = Object.values(noteDiagram(doc).model.notes)
  const notes = Object.entries(fragment.notes).filter(([, n]) => !existingNotes.some((old) => sameNote(old, n)))
  if (fresh.length === 0 && notes.length === 0) return { classes: {}, notes: {}, fallback: null }

  const temporary: ClassDiagram = {
    model: {
      classes: Object.fromEntries(fresh.map((key) => [key, fragment.classes[key]!])),
      relations: Object.fromEntries(
        fragment.relations.filter((r) => freshSet.has(r.source.class) && freshSet.has(r.target.class)).map((r, i) => [String(i), r]),
      ),
    },
    view: { nodes: Object.fromEntries(fresh.map((key) => [key, { x: 0, y: 0, collapsed: false }])) },
  }
  const graph = classLayoutGraph(temporary)
  for (const [key, note] of notes) {
    graph.nodes.push({ id: key, ...noteSize(note) })
    const anchor = note.anchor === null ? null : splitKey(note.anchor).key
    if (anchor !== null && freshSet.has(anchor)) graph.edges.push({ id: `note:${key}`, source: anchor, target: key })
  }

  const occupied = nodeRects(doc)
  const split = (positions: Record<string, Point>) => ({
    classes: Object.fromEntries(Object.entries(positions).filter(([key]) => freshSet.has(key))),
    notes: Object.fromEntries(Object.entries(positions).filter(([key]) => !freshSet.has(key))),
  })
  const positions = await layoutBelow(graph, occupied, layout)
  if (positions === null) {
    const sizes = graph.nodes.map((n) => [n.id, { w: n.w, h: n.h }] as const)
    return { ...split(placeInGrid(sizes, occupied)), fallback: "La disposizione automatica non è riuscita: gli elementi nuovi sono in griglia." }
  }
  return { ...split(positions), fallback: null }
}

/**
 * Innesta un frammento di classi letto da Mermaid (spec §5), in un solo comando. Una classe
 * presente viene sostituita e tiene il suo nodo; una nuova prende la posizione da `placement`. Una
 * relazione uguale a una presente si salta, e così una nota con lo stesso testo e la stessa
 * àncora; nessuna si pota.
 */
export function importMermaidClass(fragment: ClassImport, placement: Pick<ClassPlacement, "classes" | "notes">): Recipe {
  return (draft) => {
    const d = classDiagram(draft)
    for (const [key, cls] of Object.entries(fragment.classes)) {
      d.model.classes[key] = cls
      const pos = placement.classes[key]
      if (pos && !Object.hasOwn(d.view.nodes, key)) d.view.nodes[key] = { ...pos, collapsed: false }
    }
    for (const rel of fragment.relations) {
      if (Object.values(d.model.relations).some((old) => sameClassRelation(old, rel))) continue
      d.model.relations[uniqueKey(d.model.relations, `${rel.source.class}_${rel.target.class}`)] = rel
    }
    const n = noteDiagram(draft)
    for (const [key, note] of Object.entries(fragment.notes)) {
      const pos = placement.notes[key]
      if (!pos || Object.values(n.model.notes).some((old) => sameNote(old, note))) continue
      n.model.notes[key] = note
      n.view.nodes[key] = { ...pos, collapsed: false }
    }
  }
}
