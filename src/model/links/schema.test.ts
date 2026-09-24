import { describe, expect, it } from "vitest"
import { LinkSchema, linkRule } from "./schema"

describe("LinkSchema", () => {
  it("accetta «mappa su» da una classe a un'entità", () => {
    expect(LinkSchema.safeParse({ kind: "maps-to", source: "class/Ordine", target: "er/ordini" }).success).toBe(true)
  })

  it("rifiuta «mappa su» da un'entità a una classe", () => {
    expect(LinkSchema.safeParse({ kind: "maps-to", source: "er/ordini", target: "class/Ordine" }).success).toBe(false)
  })

  it("rifiuta «mappa su» fra due classi", () => {
    expect(LinkSchema.safeParse({ kind: "maps-to", source: "class/Ordine", target: "class/Riga" }).success).toBe(false)
  })

  it("rifiuta un estremo con la sola famiglia e nessuna chiave", () => {
    expect(LinkSchema.safeParse({ kind: "maps-to", source: "class/", target: "er/ordini" }).success).toBe(false)
  })

  it("rifiuta un tipo sconosciuto", () => {
    expect(LinkSchema.safeParse({ kind: "calls", source: "class/Ordine", target: "er/ordini" }).success).toBe(false)
  })
})

describe("linkRule", () => {
  it("classe → entità è «mappa su» nel suo verso", () => {
    expect(linkRule("class", "er")).toEqual({ kind: "maps-to", reversed: false })
  })

  it("entità → classe è lo stesso tipo, da rovesciare", () => {
    expect(linkRule("er", "class")).toEqual({ kind: "maps-to", reversed: true })
  })

  it("una coppia senza tipo dà null", () => {
    expect(linkRule("flow", "er")).toBeNull()
    expect(linkRule("class", "flow")).toBeNull()
  })
})
