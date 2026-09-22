import { produce } from "immer"
import { describe, expect, it } from "vitest"
import { createFlowDocument } from "@/model/flow/schema"
import { opsFor } from "./ops"

describe("flowOps", () => {
  it("addNode crea il nodo nella prima corsia e apre l'editor del corpo", () => {
    const doc = createFlowDocument("test", "id-1")
    const lane = doc.diagram.model.lanes[0]!.id
    const { key, recipe, edit } = opsFor(doc).addNode({ x: 10, y: 10 }, "decision")
    const next = produce(doc, recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[key]).toEqual({ label: "", shape: "decision", lane })
    expect(edit).toBe("body")
  })

  it("addNode senza variante crea un nodo \"process\"", () => {
    const doc = createFlowDocument("test", "id-1")
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 0 })
    const next = produce(doc, recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[key]!.shape).toBe("process")
  })

  // La risoluzione vera della corsia dalla coordinata y arriva nel Task 6, quando
  // `editor/flow/geometry.ts` porta la geometria delle bande. Fino ad allora `laneAt`
  // (kinds/flow.ts) è uno stub che torna sempre la prima corsia: questo test resta rosso
  // finché quel task non lo accende.
  it.todo("addNode risolve la corsia dalla coordinata y del rilascio, non sempre la prima")

  it("addEdge torna null se un estremo non esiste", () => {
    const doc = createFlowDocument("test", "id-1")
    const { key, recipe } = opsFor(doc).addNode({ x: 0, y: 0 }, "process")
    const next = produce(doc, recipe)
    expect(opsFor(next).addEdge(key, "fantasma")).toBeNull()
  })
})
