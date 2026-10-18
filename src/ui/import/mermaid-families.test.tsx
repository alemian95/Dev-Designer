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
/** Il testo del redattore (Review Focus 4 e e2e), con `TL#59;DR`: `TL;DR` lo rifiuta anche Mermaid, perché `;` chiude l'istruzione. */
const EDITOR_TEXT = `sequenceDiagram
    autonumber
    actor Redattore
    participant Orchestrator as Redazione Orchestrator
    participant Storage as Database / Knowledge Base
    participant LLM as LLM Engine (Prompting)
    Redattore->>Orchestrator: Richiesta generazione articolo (es. Formato: Newsletter, Topic: Ultimi 3 giorni)
    Orchestrator->>Storage: Query NewsCluster (ImpactScore >= 4, Stato: Unprocessed)
    Storage-->>Orchestrator: Ritorna lista cluster con rispettivi RawItems e fonti
    Orchestrator->>Orchestrator: Compone contesto & prompt con linee guida editoriali e fonti
    Orchestrator->>LLM: Invia prompt (Sintesi, Analisi comparativa, TL#59;DR, Richiesta citazioni)
    LLM-->>Orchestrator: Ritorna testo strutturato (Headline, TL#59;DR, Sezioni, Fonti referenziate)
    Orchestrator->>Orchestrator: Valida link e integra metadati citazioni
    Orchestrator->>Storage: Salva ArticleDraft (Stato: DRAFT)
    Orchestrator-->>Redattore: Presenta bozza formattata in Markdown per revisione
    Redattore->>Orchestrator: Approva / Modifica bozza
    Orchestrator->>Storage: Aggiorna stato in APPROVED
`
const SEQUENCE = ready(EDITOR_TEXT)

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

describe("bindImport: sequenza", () => {
  it("riepilogo, sostantivo e pulsante del testo del redattore", () => {
    const seq = bindImport(SEQUENCE)
    expect(seq.summary()).toBe("4 partecipanti, 11 messaggi, 0 blocchi")
    expect(seq.noun).toBe("sequenza")
    expect(`Importa ${seq.importable(new Set())} ${seq.noun}`).toBe("Importa 1 sequenza")
    expect(seq.fates(createDocument("t"))).toEqual({})
  })

  it("conta blocchi annidati e note di sequenza, queste solo se ci sono", () => {
    const text = "sequenceDiagram\n  loop l\n    alt a\n      A->>B: x\n      Note over A: n\n    end\n  end\n"
    expect(bindImport(ready(text)).summary()).toBe("2 partecipanti, 1 messaggi, 2 blocchi, 1 note")
  })

  it("una sequenza senza partecipanti non si importa; con soli partecipanti sì", () => {
    expect(bindImport(ready("sequenceDiagram\n")).importable(new Set())).toBe(0)
    expect(bindImport(ready("sequenceDiagram\n  participant A\n  actor B\n")).summary()).toBe("2 partecipanti, 0 messaggi, 0 blocchi")
  })

  it("resoconto dell'import", () => {
    expect(html(bindImport(SEQUENCE).report(1, { relations: 11, notes: 0, pools: 4 })))
      .toBe("Importata <strong>1</strong> sequenza con <strong>4</strong> partecipanti e <strong>11</strong> messaggi.")
  })

  it("innesta la sequenza e la conta nel documento", async () => {
    documentStore.getState().load(createDocument("t"))
    const seq = bindImport(SEQUENCE)
    expect(seq.tally(documentStore.getState().doc)).toEqual({ relations: 0, notes: 0, pools: 0 })
    const { recipe, elements, fallback } = await seq.prepare(documentStore.getState().doc, new Set(), async () => ({}))
    documentStore.getState().dispatch(recipe)
    expect({ elements, fallback }).toEqual({ elements: 1, fallback: null })
    expect(seq.tally(documentStore.getState().doc)).toEqual({ relations: 11, notes: 0, pools: 4 })
  })
})
