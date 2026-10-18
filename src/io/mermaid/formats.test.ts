import { describe, expect, it } from "vitest"
import { analyseMermaid } from "./analyse"
import { detectFormat, MERMAID_FORMATS } from "./formats"

describe("detectFormat", () => {
  it("riconosce i formati dalla prima parola utile, alias compresi", () => {
    expect(detectFormat("%% c\nerDiagram")).toBe("erDiagram")
    expect(detectFormat("---\na: b\n---\nclassDiagram")).toBe("classDiagram")
    expect(detectFormat("graph TD")).toBe("flowchart")
    expect(detectFormat("FLOWCHART LR")).toBe("flowchart")
  })

  it("restituisce la parola sconosciuta, o null sul testo vuoto", () => {
    expect(detectFormat("sequenceDiagram\n  A->>B: x")).toEqual({ unknown: "sequenceDiagram" })
    expect(detectFormat("  \n %% solo commento")).toBeNull()
  })
})

describe("registro dei formati", () => {
  // Un testo minimo per parola d'apertura: la tabella cresce con il registro, il test no.
  const MINIMAL = (keyword: string) => `${keyword}\n`
  it.each(Object.entries(MERMAID_FORMATS).flatMap(([id, f]) => f.keywords.map((k) => [id, k, f.family] as const)))(
    "%s: «%s» si analizza nella famiglia %s", (_, keyword, family) => {
      expect(analyseMermaid(MINIMAL(keyword))).toMatchObject({ ok: true, kind: family })
    })

  it("l'errore sui formati sconosciuti li elenca tutti", () => {
    expect(analyseMermaid("gantt")).toEqual({ ok: false, message: "«gantt» non si importa: solo erDiagram, classDiagram, flowchart e stateDiagram.", at: null })
  })
})
