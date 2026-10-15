import { describe, expect, it } from "vitest"
import { aggregate, blocks, decodeEntities, detect, lineOf, stripNoise } from "./common"

describe("blocks", () => {
  it("restituisce il testo intero quando non ci sono blocchi mermaid", () => {
    expect(blocks("erDiagram\n  A")).toEqual([{ text: "erDiagram\n  A", offset: 0 }])
  })

  it("estrae ogni blocco ```mermaid di un markdown con l'offset del suo contenuto", () => {
    const md = "# T\n\n```mermaid\nerDiagram\n  A\n```\n\ntesto\n\n```mermaid\nclassDiagram\n```\n"
    const found = blocks(md)
    expect(found.map((b) => b.text)).toEqual(["erDiagram\n  A\n", "classDiagram\n"])
    expect(md.slice(found[0]!.offset, found[0]!.offset + 9)).toBe("erDiagram")
  })
})

describe("stripNoise", () => {
  it("toglie front-matter e commenti %% senza spostare gli offset", () => {
    const text = "---\ntitle: x\n---\nerDiagram\n  A %% nota\n  %%{init: {}}%%\n"
    const out = stripNoise(text)
    expect(out).toHaveLength(text.length)
    expect(out.indexOf("erDiagram")).toBe(text.indexOf("erDiagram"))
    expect(out).not.toContain("title")
    expect(out).not.toContain("nota")
    expect(out).not.toContain("init")
  })

  it("lascia stare un %% dentro le virgolette", () => {
    expect(stripNoise('A ||--o{ B : "50%% sconto"')).toContain("50%% sconto")
  })
})

describe("detect", () => {
  it("riconosce le tre famiglie dalla prima parola utile", () => {
    expect(detect("%% c\nerDiagram")).toBe("er")
    expect(detect("---\na: b\n---\nclassDiagram")).toBe("class")
    expect(detect("graph TD")).toBe("flow")
    expect(detect("flowchart LR")).toBe("flow")
  })

  it("restituisce la parola sconosciuta, o null sul testo vuoto", () => {
    expect(detect("sequenceDiagram\n  A->>B: x")).toEqual({ unknown: "sequenceDiagram" })
    expect(detect("  \n %% solo commento")).toBeNull()
  })
})

describe("lineOf e decodeEntities", () => {
  it("contano le righe da 1", () => {
    expect(lineOf("a\nb\nc", 0)).toBe(1)
    expect(lineOf("a\nb\nc", 4)).toBe(3)
  })

  it("decodificano le entità con nome e numeriche, e lasciano le sconosciute", () => {
    expect(decodeEntities("#lt;b#gt; #amp; #quot; #9829; #foo;")).toBe('<b> & " ♥ #foo;')
  })
})

describe("aggregate", () => {
  it("fa un avviso per categoria, con righe e nomi", () => {
    const text = "x\ny\nz"
    const out = aggregate(
      [{ category: "a", at: 0, subject: "P" }, { category: "a", at: 4, subject: "Q" }, { category: "b", at: 2 }],
      text,
      { a: "Persi", b: "Altro" },
    )
    expect(out).toEqual([
      { message: "Persi: P, Q (righe 1, 3)", at: 0 },
      { message: "Altro (riga 2)", at: 2 },
    ])
  })
})
