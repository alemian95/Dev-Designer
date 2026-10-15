import { describe, expect, it } from "vitest"
import { analyseMermaid } from "./analyse"

describe("analyseMermaid", () => {
  it("restituisce il frammento ER con gli avvisi del parser prima di quelli del map", () => {
    const result = analyseMermaid("erDiagram\n  direction LR\n  p[P]\n")
    expect(result.ok && result.fragment.warnings.map((w) => w.message.split(":")[0])).toEqual([
      "Direzione ignorata",
      "Alias delle entità scartati, il nome resta l'id",
    ])
  })

  it("restituisce il frammento delle classi, con lo stesso ordine degli avvisi", () => {
    const result = analyseMermaid("classDiagram\n  direction LR\n  class A[\"Etichetta\"]\n")
    expect(result).toMatchObject({ ok: true, kind: "class" })
    expect(result.ok && result.fragment.warnings.map((w) => w.message.split(":")[0])).toEqual([
      "Direzione ignorata",
      "Etichette delle classi scartate, il nome resta l'id",
    ])
  })

  it("rifiuta testo vuoto, tipi sconosciuti e il flowchart, non ancora supportato", () => {
    expect(analyseMermaid("  ")).toEqual({ ok: false, message: "Il testo è vuoto.", at: null })
    expect(analyseMermaid("sequenceDiagram")).toMatchObject({ ok: false, at: null })
    expect(analyseMermaid("flowchart LR\n  A --> B")).toMatchObject({ ok: false, at: null })
  })

  it("trasforma un errore di sintassi in un esito con l'offset", () => {
    expect(analyseMermaid("erDiagram\n  A {\n")).toEqual({ ok: false, message: "Blocco «{» senza «}»", at: 14 })
    expect(analyseMermaid("classDiagram\n  class A {\n")).toEqual({ ok: false, message: "Blocco «{» senza «}»", at: 23 })
  })
})
