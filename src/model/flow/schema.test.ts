import { describe, expect, it } from "vitest"
import { createFlowDocument, FlowModelSchema } from "./schema"

const lane = { id: "l1", name: "Cliente" }
const node = { label: "Verifica", shape: "process" as const, lane: "l1" }

describe("FlowModelSchema", () => {
  it("accetta un modello coerente", () => {
    const r = FlowModelSchema.safeParse({ lanes: [lane], nodes: { n1: node }, edges: {} })
    expect(r.success).toBe(true)
  })

  it("rifiuta un modello senza corsie: ogni nodo ne ha una, e senza corsie non ce ne sarebbe", () => {
    const r = FlowModelSchema.safeParse({ lanes: [], nodes: {}, edges: {} })
    expect(r.success).toBe(false)
  })

  it("rifiuta un nodo la cui corsia non esiste", () => {
    const r = FlowModelSchema.safeParse({
      lanes: [lane],
      nodes: { n1: { ...node, lane: "fantasma" } },
      edges: {},
    })
    expect(r.success).toBe(false)
  })

  it("accetta un'etichetta d'arco vuota: è il caso normale di un arco appena creato", () => {
    const r = FlowModelSchema.safeParse({
      lanes: [lane],
      nodes: { n1: node, n2: node },
      edges: { e1: { source: "n1", target: "n2", label: "" } },
    })
    expect(r.success).toBe(true)
  })
})

describe("createFlowDocument", () => {
  it("nasce con una corsia sola, nessun nodo e la banda già nella view", () => {
    const doc = createFlowDocument("Processo", "id-1")
    expect(doc.diagram.type).toBe("flow")
    expect(doc.diagram.model.lanes).toHaveLength(1)
    expect(doc.diagram.model.nodes).toEqual({})
    const laneId = doc.diagram.model.lanes[0]!.id
    expect(doc.diagram.view.lanes[laneId]).toEqual({ y: 0, h: 160 })
  })
})
