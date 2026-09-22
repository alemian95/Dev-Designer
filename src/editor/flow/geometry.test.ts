import { describe, expect, it } from "vitest"
import type { FlowDiagram, FlowNode } from "@/model/flow/schema"
import { flowNodeSize, laneAt, shapePath } from "./geometry"

const node = (over: Partial<FlowNode> = {}): FlowNode => ({ label: "Verifica", shape: "process", lane: "l1", ...over })

describe("flowNodeSize", () => {
  it("cresce con la riga più lunga", () => {
    const corta = flowNodeSize(node({ label: "ok" }))
    const lunga = flowNodeSize(node({ label: "una etichetta molto più lunga di quella corta" }))
    expect(lunga.w).toBeGreaterThan(corta.w)
  })

  it("cresce in altezza con il numero di righe", () => {
    const una = flowNodeSize(node({ label: "a" }))
    const tre = flowNodeSize(node({ label: "a\nb\nc" }))
    expect(tre.h).toBeGreaterThan(una.h)
  })

  it("il rombo è circa il doppio del rettangolo a parità di testo: deve contenerlo", () => {
    const processo = flowNodeSize(node({ shape: "process" }))
    const decisione = flowNodeSize(node({ shape: "decision" }))
    expect(decisione.w).toBe(processo.w * 2)
    expect(decisione.h).toBe(processo.h * 2)
  })

  it("un'etichetta vuota non produce un nodo invisibile", () => {
    const vuoto = flowNodeSize(node({ label: "" }))
    expect(vuoto.w).toBeGreaterThanOrEqual(60)
    expect(vuoto.h).toBeGreaterThanOrEqual(40)
  })
})

describe("shapePath", () => {
  it("ogni forma produce un path non vuoto", () => {
    for (const shape of ["terminal", "process", "decision", "io", "subprocess", "note"] as const) {
      expect(shapePath(shape, 100, 50).length).toBeGreaterThan(0)
    }
  })
})

describe("laneAt", () => {
  const d = {
    type: "flow",
    model: { lanes: [{ id: "l1", name: "a" }, { id: "l2", name: "b" }], nodes: {}, edges: {} },
    view: { nodes: {}, lanes: { l1: { y: 0, h: 100 }, l2: { y: 100, h: 100 } } },
  } as FlowDiagram

  it("trova la corsia che contiene la coordinata", () => {
    expect(laneAt(d, 50)).toBe("l1")
    expect(laneAt(d, 150)).toBe("l2")
  })

  it("il confine appartiene alla corsia di sotto, senza buchi né sovrapposizioni", () => {
    expect(laneAt(d, 100)).toBe("l2")
  })

  it("fuori da ogni banda torna null: chi chiama decide, qui non si indovina", () => {
    expect(laneAt(d, -10)).toBeNull()
    expect(laneAt(d, 5000)).toBeNull()
  })
})
