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
})
