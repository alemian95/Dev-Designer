import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { createDocument } from "@/model/document"
import type { LayoutGraph } from "@/model/layout"
import { analyseMermaid, type MermaidReady } from "@/io/mermaid/analyse"
import { bindImport } from "./mermaid-families"

function ready(text: string): MermaidReady {
  const result = analyseMermaid(text)
  if (!result.ok) throw new Error(result.message)
  return result
}

const ER = ready("erDiagram\n  A ||--o{ B : has")
const CLASS = ready('classDiagram\n  class A\n  class B\n  A --> B\n  note "libera"')
const FLOW = ready("flowchart TD\n  subgraph P\n    a --> b\n  end\n  b --> c")
const STATE_TEXT = "stateDiagram-v2\n  state P {\n    a --> b\n  }\n  b --> c\n  note right of a : n\n"
const STATE = ready(STATE_TEXT)

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>)

describe("bindImport", () => {
  it("riepilogo e sostantivo per famiglia", () => {
    expect(bindImport(ER).summary()).toBe("2 entità, 1 relazioni")
    expect(bindImport(ER).noun).toBe("entità")
    expect(bindImport(CLASS).summary()).toBe("2 classi, 1 relazioni, 1 note")
    expect(bindImport(CLASS).noun).toBe("classi")
    expect(bindImport(FLOW).summary()).toBe("3 nodi, 2 archi, 1 pool")
    expect(bindImport(FLOW).noun).toBe("nodi")
  })

  it("resoconto dell'import per famiglia", () => {
    expect(html(bindImport(ER).report(2, { relations: 1, notes: 0, pools: 0 })))
      .toBe("Importate <strong>2</strong> entità e <strong>1</strong> relazioni.")
    expect(html(bindImport(CLASS).report(2, { relations: 1, notes: 1, pools: 0 })))
      .toBe("Importate <strong>2</strong> classi e <strong>1</strong> relazioni, con <strong>1</strong> note.")
    expect(html(bindImport(FLOW).report(3, { relations: 2, notes: 0, pools: 1 })))
      .toBe("Importati <strong>3</strong> nodi e <strong>2</strong> archi, con <strong>1</strong> pool.")
  })

  it("il flowchart non ha caselle e importa tutti i nodi", () => {
    const flow = bindImport(FLOW)
    expect(flow.fates(createDocument("t"))).toEqual({})
    expect(flow.importable(new Set())).toBe(3)
  })
})

describe("bindImport: flusso con note", () => {
  it("conta le note nel riepilogo e nel resoconto solo se ci sono", () => {
    expect(bindImport(STATE).summary()).toBe("3 nodi, 2 archi, 1 pool, 1 note")
    expect(html(bindImport(STATE).report(3, { relations: 2, notes: 1, pools: 1 })))
      .toBe("Importati <strong>3</strong> nodi e <strong>2</strong> archi, con <strong>1</strong> pool e <strong>1</strong> note.")
  })

  it("innesta le note e le conta nel documento", async () => {
    documentStore.getState().load(createDocument("t"))
    const state = bindImport(STATE)
    expect(state.tally(documentStore.getState().doc).notes).toBe(0)
    const fakeLayout = async (g: LayoutGraph) => Object.fromEntries(g.nodes.map((n, i) => [n.id, { x: i * 300, y: 0 }]))
    const { recipe } = await state.prepare(documentStore.getState().doc, new Set(), fakeLayout)
    documentStore.getState().dispatch(recipe)
    expect(state.tally(documentStore.getState().doc)).toEqual({ relations: 2, notes: 1, pools: 1 })
  })
})
