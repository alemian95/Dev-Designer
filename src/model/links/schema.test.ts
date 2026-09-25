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

  it("accetta un accesso da un nodo di flusso a un'entità, con ognuno dei tre modi", () => {
    for (const mode of ["read", "write", "read-write"]) {
      expect(LinkSchema.safeParse({ kind: "accesses", source: "flow/n1", target: "er/ordini", mode }).success).toBe(true)
    }
  })

  it("rifiuta un accesso senza modo, o con un modo sconosciuto", () => {
    expect(LinkSchema.safeParse({ kind: "accesses", source: "flow/n1", target: "er/ordini" }).success).toBe(false)
    expect(LinkSchema.safeParse({ kind: "accesses", source: "flow/n1", target: "er/ordini", mode: "delete" }).success).toBe(false)
  })

  it("rifiuta un accesso da una classe, e un «chiama» verso un'entità", () => {
    expect(LinkSchema.safeParse({ kind: "accesses", source: "class/Ordine", target: "er/ordini", mode: "read" }).success).toBe(false)
    expect(LinkSchema.safeParse({ kind: "calls", source: "flow/n1", target: "er/ordini" }).success).toBe(false)
  })

  it("accetta «chiama» da un nodo di flusso a una classe", () => {
    expect(LinkSchema.safeParse({ kind: "calls", source: "flow/n1", target: "class/Ordine" }).success).toBe(true)
  })
})

describe("linkRule", () => {
  it("classe → entità è «mappa su» nel suo verso", () => {
    expect(linkRule("class", "er")).toEqual({ kind: "maps-to", reversed: false })
  })

  it("entità → classe è lo stesso tipo, da rovesciare", () => {
    expect(linkRule("er", "class")).toEqual({ kind: "maps-to", reversed: true })
  })

  it("flusso ↔ entità è un accesso, flusso ↔ classe è «chiama», in entrambi i versi", () => {
    expect(linkRule("flow", "er")).toEqual({ kind: "accesses", reversed: false })
    expect(linkRule("er", "flow")).toEqual({ kind: "accesses", reversed: true })
    expect(linkRule("flow", "class")).toEqual({ kind: "calls", reversed: false })
    expect(linkRule("class", "flow")).toEqual({ kind: "calls", reversed: true })
  })

  it("due famiglie uguali non hanno un tipo di collegamento", () => {
    expect(linkRule("er", "er")).toBeNull()
  })
})
