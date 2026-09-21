import { produce } from "immer"
import { beforeEach, describe, expect, it } from "vitest"
import { createClassDocument, type ClassAttribute, type ClassDocument } from "@/model/class/schema"
import { classDiagram } from "../class-access"
import { documentStore, type Recipe } from "../document-store"
import {
  addNote,
  addNoteLink,
  addRelation,
  deleteClassItems,
  duplicateClasses,
  renameClass,
  setMembers,
  setNoteText,
} from "./commands"

/** Applica una recipe a un documento senza passare dallo store: comodo per i test che non
 *  hanno bisogno di undo/redo, solo del documento risultante. */
function applica(doc: ClassDocument, recipe: Recipe): ClassDocument {
  return produce(doc, recipe)
}

const state = () => documentStore.getState()

/** Il diagramma di classi dello store. Solleva se il documento è di un altro tipo. */
function cd() {
  const d = state().doc.diagram
  if (d.type !== "class") throw new Error(`atteso un class diagram, trovato ${d.type}`)
  return d
}

const id: ClassAttribute = { name: "id", type: "int", visibility: "public", isStatic: false }

describe("comandi delle classi", () => {
  beforeEach(() => {
    const doc = createClassDocument("t", "t")
    doc.diagram.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [id], methods: [] }
    doc.diagram.model.classes["Persona"] = { name: "Persona", stereotype: "abstract", attributes: [], methods: [] }
    doc.diagram.view.nodes["Cliente"] = { x: 0, y: 100, collapsed: false }
    doc.diagram.view.nodes["Persona"] = { x: 0, y: 0, collapsed: false }
    doc.diagram.model.relations["r1"] = {
      kind: "generalization",
      source: { class: "Cliente", multiplicity: "", role: "" },
      target: { class: "Persona", multiplicity: "", role: "" },
    }
    state().load(doc)
  })

  it("setMembers non produce patch se i membri sono identici", () => {
    // Immer non genera patch a valore identico, quindi il dispatch torna false e
    // riaprire la textarea senza cambiare nulla non lascia una voce di undo.
    expect(state().dispatch(setMembers("Cliente", { attributes: [id], methods: [] }))).toBe(false)
  })

  it("renameClass su un nome che collide non produce patch", () => {
    // Non torna null: la firma non riceve il record delle classi, quindi la
    // collisione si vede solo dentro la recipe, che esce senza scrivere. È
    // quello che fa `renameEntity` (er.ts:58). `null` è per il nome vuoto.
    expect(renameClass("Cliente", "")).toBeNull()
    expect(state().dispatch(renameClass("Cliente", "Persona")!)).toBe(false)
    expect(Object.keys(cd().model.classes).sort()).toEqual(["Cliente", "Persona"])
  })

  it("renameClass aggiorna anche il target di una relazione, non solo il source", () => {
    // Il test qui sotto rinomina Cliente, che in `r1` è il `source`: il ramo del `target` non era
    // mai percorso, e `renameClass` deve toccarli entrambi.
    state().dispatch(renameClass("Persona", "Essere")!)
    const d = cd()
    expect(d.model.relations["r1"]?.target.class).toBe("Essere")
    expect(d.model.relations["r1"]?.source.class).toBe("Cliente")
    expect(d.model.classes["Persona"]).toBeUndefined()
  })

  it("renameClass rinomina entrambi i capi di un'autorelazione", () => {
    // Con `source` e `target` sulla stessa classe, un `renameClass` che aggiornasse un capo solo
    // lascerebbe una relazione con un estremo pendente — e il caso non era coperto.
    state().dispatch((draft) => {
      classDiagram(draft).model.relations["r2"] = {
        kind: "association",
        source: { class: "Cliente", multiplicity: "", role: "" },
        target: { class: "Cliente", multiplicity: "", role: "" },
      }
    })
    state().dispatch(renameClass("Cliente", "Acquirente")!)
    expect(cd().model.relations["r2"]).toEqual({
      kind: "association",
      source: { class: "Acquirente", multiplicity: "", role: "" },
      target: { class: "Acquirente", multiplicity: "", role: "" },
    })
  })

  it("addRelation nasce come associazione, coi capi vuoti", () => {
    // Il `kind` di default e i capi vuoti non erano fissati da nessun test: `addRelation` è il
    // solo modo in cui lo strumento relazione crea un arco, e cambiarne il default in silenzio
    // cambierebbe cosa disegna ogni trascinamento fra due classi.
    const { key, recipe } = addRelation(cd().model.relations, "Cliente", "Persona")
    state().dispatch(recipe)
    expect(cd().model.relations[key]).toEqual({
      kind: "association",
      source: { class: "Cliente", multiplicity: "", role: "" },
      target: { class: "Persona", multiplicity: "", role: "" },
    })
  })

  it("renameClass sposta anche la view e gli estremi delle relazioni", () => {
    // La chiave è il nome: rinominare vuol dire ricreare la voce sotto un'altra
    // chiave, e ogni relazione che la nominava va aggiornata. È il caso che
    // l'ER risolve con entityKey e qui va risolto a mano.
    state().dispatch(renameClass("Cliente", "Acquirente")!)
    const d = cd()
    expect(d.model.classes["Acquirente"]?.name).toBe("Acquirente")
    expect(d.model.classes["Cliente"]).toBeUndefined()
    expect(d.view.nodes["Acquirente"]).toEqual({ x: 0, y: 100, collapsed: false })
    expect(d.view.nodes["Cliente"]).toBeUndefined()
    expect(d.model.relations["r1"]?.source.class).toBe("Acquirente")
  })

  it("duplicateClasses usa i suffissi di uniqueKey e non ne inventa altri", () => {
    const primo = duplicateClasses(cd().model, ["Cliente"])
    state().dispatch(primo.recipe)
    expect(primo.keys).toEqual(["Cliente_2"])
    const secondo = duplicateClasses(cd().model, ["Cliente"])
    state().dispatch(secondo.recipe)
    // `_3`, non `_copy2`: quel suffisso è l'incoerenza di duplicateEntities
    // registrata nel debito tecnico e non va replicata.
    expect(secondo.keys).toEqual(["Cliente_3"])
    expect(cd().model.classes["Cliente_2"]?.attributes).toEqual([id])
  })

  it("cancellare una classe porta via le relazioni che la toccavano", () => {
    expect(deleteClassItems([], [], [])).toBeNull()
    state().dispatch(deleteClassItems(["Persona"], [], [])!)
    const d = cd()
    expect(d.model.classes["Persona"]).toBeUndefined()
    expect(d.view.nodes["Persona"]).toBeUndefined()
    // r1 aveva Persona come target: sparisce con lei, non resta appesa.
    expect(Object.keys(d.model.relations)).toEqual([])
  })
})

describe("comandi delle note", () => {
  const vuoto = () => createClassDocument("Prova", "doc-1")

  it("addNote crea la nota e la sua view, con una chiave che non è il testo", () => {
    const doc = vuoto()
    const { key, recipe } = addNote({ x: 37, y: 52 })
    const dopo = applica(doc, recipe)
    expect(dopo.diagram.model.notes[key]).toEqual({ text: "" })
    // Snappata alla griglia come le classi.
    expect(dopo.diagram.view.nodes[key]).toEqual({ x: 40, y: 50, collapsed: false })
  })

  it("setNoteText scrive il testo e non tocca altro", () => {
    const { key, recipe } = addNote({ x: 0, y: 0 })
    const doc = applica(vuoto(), recipe)
    const dopo = applica(doc, setNoteText(key, "prima\nseconda"))
    expect(dopo.diagram.model.notes[key]!.text).toBe("prima\nseconda")
  })

  it("setNoteText su una chiave che non esiste non scrive niente", () => {
    const doc = vuoto()
    expect(applica(doc, setNoteText("assente", "x")).diagram.model.notes).toEqual({})
  })

  it("deleteClassItems cancella la nota e la sua view", () => {
    const { key, recipe } = addNote({ x: 0, y: 0 })
    const doc = applica(vuoto(), recipe)
    const dopo = applica(doc, deleteClassItems([], [], [key])!)
    expect(dopo.diagram.model.notes).toEqual({})
    expect(dopo.diagram.view.nodes[key]).toBeUndefined()
  })

  it("deleteClassItems su una classe non tocca una nota indipendente", () => {
    // Copre il caso che il test precedente non tocca: la nota non ha archi, ma va comunque
    // provato che cancellare una classe non la trascina via di rimbalzo.
    const base = vuoto()
    base.diagram.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
    base.diagram.view.nodes["Cliente"] = { x: 0, y: 0, collapsed: false }
    const { key, recipe } = addNote({ x: 0, y: 0 })
    const doc = applica(base, recipe)
    const dopo = applica(doc, deleteClassItems(["Cliente"], [], [])!)
    expect(dopo.diagram.model.classes["Cliente"]).toBeUndefined()
    expect(dopo.diagram.model.notes[key]).toEqual({ text: "" })
    expect(dopo.diagram.view.nodes[key]).toEqual({ x: 0, y: 0, collapsed: false })
  })

  it("deleteClassItems torna null solo se non c'è niente da cancellare, note comprese", () => {
    expect(deleteClassItems([], [], [])).toBeNull()
    expect(deleteClassItems([], [], ["n1"])).not.toBeNull()
  })

  it("duplicateClasses copia anche le note, con una chiave nuova e lo scarto", () => {
    const { key, recipe } = addNote({ x: 100, y: 100 })
    const doc = applica(applica(vuoto(), recipe), setNoteText(key, "promemoria"))
    const { keys, recipe: dup } = duplicateClasses(doc.diagram.model, [key])
    const dopo = applica(doc, dup)
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toBe(key)
    expect(dopo.diagram.model.notes[keys[0]!]).toEqual({ text: "promemoria" })
    expect(dopo.diagram.view.nodes[keys[0]!]!.x).toBe(120)
  })
})

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
})
