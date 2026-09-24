import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { addEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { selId, sessionStore } from "@/editor/session-store"
import { renameEntityWithNotice } from "./entity-rename"

beforeEach(() => documentStore.getState().load(createDocument("t", "t")))

describe("renameEntityWithNotice", () => {
  it("la selezione segue la nuova chiave, con il prefisso", () => {
    const { key, recipe } = addEntity({}, { x: 0, y: 0 })
    documentStore.getState().dispatch(recipe)
    sessionStore.getState().setSelection([selId("node", qualify("er", key))])
    expect(renameEntityWithNotice(key, "clienti")).toBe(true)
    expect([...sessionStore.getState().selection]).toEqual([selId("node", "er/clienti")])
  })

  it("il collegamento segue l'entità rinominata, in un solo passo di annulla", () => {
    const { key, recipe } = addEntity({}, { x: 0, y: 0 })
    documentStore.getState().dispatch(recipe)
    documentStore.getState().dispatch((draft) => {
      draft.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: qualify("er", key) }
    })
    const past = documentStore.getState().past.length
    expect(renameEntityWithNotice(key, "ordini")).toBe(true)
    expect(documentStore.getState().doc.diagram.links["l1"]!.target).toBe("er/ordini")
    expect(documentStore.getState().past.length).toBe(past + 1)
    documentStore.getState().undo()
    expect(documentStore.getState().doc.diagram.links["l1"]!.target).toBe(qualify("er", key))
  })

  it("una rinomina che collide non sposta il collegamento", () => {
    // Review Focus 1.
    const a = addEntity({}, { x: 0, y: 0 })
    documentStore.getState().dispatch(a.recipe)
    documentStore.getState().dispatch((draft) => {
      draft.diagram.er.model.entities["clienti"] = { name: "clienti", attributes: [] }
      draft.diagram.er.view.nodes["clienti"] = { x: 300, y: 0, collapsed: false }
      draft.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: qualify("er", a.key) }
    })
    expect(renameEntityWithNotice(a.key, "clienti")).toBe(false)
    expect(documentStore.getState().doc.diagram.links["l1"]!.target).toBe(qualify("er", a.key))
  })
})
