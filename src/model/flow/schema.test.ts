import { describe, expect, it } from "vitest"
import { emptyFlowDiagram, FlowModelSchema, nextName } from "./schema"

const pool = (...ids: string[]) => ({ name: "Pool 1", lanes: ids.map((id) => ({ id, name: id })) })
const node = (lane: string | null) => ({ label: "Verifica", shape: "process" as const, lane })

describe("FlowModelSchema", () => {
  it("accetta un flowchart senza pool, con i nodi liberi", () => {
    expect(FlowModelSchema.safeParse({ pools: {}, nodes: { n1: node(null) }, edges: {} }).success).toBe(true)
  })

  it("accetta un nodo nella corsia di un pool", () => {
    expect(FlowModelSchema.safeParse({ pools: { p1: pool("l1") }, nodes: { n1: node("l1") }, edges: {} }).success).toBe(true)
  })

  it("rifiuta un nodo la cui corsia non esiste in nessun pool", () => {
    expect(FlowModelSchema.safeParse({ pools: { p1: pool("l1") }, nodes: { n1: node("fantasma") }, edges: {} }).success).toBe(false)
  })

  it("rifiuta due corsie con lo stesso id in due pool", () => {
    expect(FlowModelSchema.safeParse({ pools: { p1: pool("l1"), p2: pool("l1") }, nodes: {}, edges: {} }).success).toBe(false)
  })

  it("rifiuta un pool senza corsie", () => {
    expect(FlowModelSchema.safeParse({ pools: { p1: pool() }, nodes: {}, edges: {} }).success).toBe(false)
  })

  it("accetta un'etichetta d'arco vuota: è il caso normale di un arco appena creato", () => {
    const r = FlowModelSchema.safeParse({
      pools: {},
      nodes: { n1: node(null), n2: node(null) },
      edges: { e1: { source: "n1", target: "n2", label: "" } },
    })
    expect(r.success).toBe(true)
  })
})

describe("emptyFlowDiagram", () => {
  it("nasce senza pool, senza nodi e senza bande", () => {
    expect(emptyFlowDiagram()).toEqual({ model: { pools: {}, nodes: {}, edges: {} }, view: { nodes: {}, pools: {}, lanes: {} } })
  })
})

describe("nextName", () => {
  it("propone il numero successivo al conteggio, senza nomi esistenti", () => {
    expect(nextName("Corsia", [])).toBe("Corsia 1")
  })

  it("propone N = conteggio + 1 quando quel nome non è già in uso", () => {
    expect(nextName("Corsia", [{ name: "Corsia 1" }, { name: "Corsia 2" }])).toBe("Corsia 3")
  })

  /** Cancellare un elemento di mezzo lascia un buco: `length + 1` riproporrebbe un nome già in uso. */
  it("salta un nome già in uso, anche se coincide col conteggio + 1", () => {
    expect(nextName("Corsia", [{ name: "Corsia 2" }])).toBe("Corsia 3")
  })

  it("un nome fuori schema non blocca la proposta", () => {
    expect(nextName("Corsia", [{ name: "Preparazione" }])).toBe("Corsia 2")
  })

  it("vale per i pool con il loro prefisso", () => {
    expect(nextName("Pool", [{ name: "Pool 1" }])).toBe("Pool 2")
  })
})
