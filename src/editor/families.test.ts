import { describe, expect, it } from "vitest"
import { createErDocument } from "@/model/er/schema"
import { createFlowDocument } from "@/model/flow/schema"
import { documentFamilies, editingIn, familySelectedKeys, qualify, splitKey } from "./families"
import { selId } from "./session-store"

describe("qualify / splitKey", () => {
  it("si invertono l'una con l'altra", () => {
    expect(qualify("er", "public.utenti")).toBe("er/public.utenti")
    expect(splitKey("er/public.utenti")).toEqual({ family: "er", key: "public.utenti" })
  })

  it("una chiave interna con / resta intatta", () => {
    // Review Focus 1: si taglia al primo `/`, e il nome della famiglia non ne contiene mai.
    expect(splitKey(qualify("class", "Ordine/Riga"))).toEqual({ family: "class", key: "Ordine/Riga" })
  })

  it("una chiave senza famiglia valida è un errore, non un'ipotesi", () => {
    expect(() => splitKey("utenti")).toThrow()
    expect(() => splitKey("sequence/x")).toThrow()
  })
})

describe("familySelectedKeys", () => {
  it("dà le chiavi di un tipo e di una famiglia, senza prefisso", () => {
    const selection = new Set([selId("node", "er/a"), selId("node", "flow/n1"), selId("edge", "er/r1"), selId("node", "er/b")])
    expect(familySelectedKeys(selection, "node", "er")).toEqual(["a", "b"])
    expect(familySelectedKeys(selection, "edge", "er")).toEqual(["r1"])
    expect(familySelectedKeys(selection, "node", "class")).toEqual([])
  })
})

describe("editingIn", () => {
  it("dà l'editing senza prefisso solo alla sua famiglia", () => {
    const editing = { key: "flow/n1", target: "body" as const }
    expect(editingIn(editing, "flow")).toEqual({ key: "n1", target: "body" })
    expect(editingIn(editing, "class")).toBeNull()
    expect(editingIn(null, "flow")).toBeNull()
  })
})

describe("documentFamilies (fase A)", () => {
  it("è il tipo del documento", () => {
    expect(documentFamilies(createErDocument("x"))).toEqual(["er"])
    expect(documentFamilies(createFlowDocument("x"))).toEqual(["flow"])
  })
})
