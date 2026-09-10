import { beforeEach, describe, expect, it } from "vitest"
import { createClassDocument, type ClassAttribute } from "@/model/class/schema"
import { documentStore } from "../document-store"
import { deleteClassItems, duplicateClasses, renameClass, setMembers } from "./commands"

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
    expect(deleteClassItems([], [])).toBeNull()
    state().dispatch(deleteClassItems(["Persona"], [])!)
    const d = cd()
    expect(d.model.classes["Persona"]).toBeUndefined()
    expect(d.view.nodes["Persona"]).toBeUndefined()
    // r1 aveva Persona come target: sparisce con lei, non resta appesa.
    expect(Object.keys(d.model.relations)).toEqual([])
  })
})
