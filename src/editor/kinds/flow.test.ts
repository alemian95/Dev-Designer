import { produce } from "immer"
import { describe, expect, it } from "vitest"
import { expectLaneInvariant } from "@/editor/flow/lane-invariant"
import { withPool } from "@/editor/flow/pool-fixture"
import { createDocument } from "@/model/document"
import { familyOps } from "./ops"

describe("flowOps.addNode", () => {
  it("fuori da ogni pool crea un nodo libero dove si è cliccato, e apre l'editor del corpo", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe, edit } = familyOps(doc, "flow").addNode({ x: 10, y: 10 }, "decision")
    const d = produce(doc, recipe).diagram.flow
    expect(d.model.nodes[key]).toEqual({ label: "", shape: "decision", lane: null })
    expect(d.view.nodes[key]).toEqual({ x: 10, y: 10, collapsed: false })
    expect(edit).toBe("body")
  })

  it("senza variante crea un processo", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 0 })
    expect(produce(doc, recipe).diagram.flow.model.nodes[key]!.shape).toBe("process")
  })

  it("dentro una corsia crea il nodo in quella corsia", () => {
    const doc = withPool(createDocument("test", "id-1"), ["l1", "l2"], 100)
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 150 })
    expect(produce(doc, recipe).diagram.flow.model.nodes[key]!.lane).toBe("l2")
  })

  it("il confine fra due corsie va a quella di sotto", () => {
    const doc = withPool(createDocument("test", "id-1"), ["l1", "l2"], 100)
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 100 })
    expect(produce(doc, recipe).diagram.flow.model.nodes[key]!.lane).toBe("l2")
  })

  it("sulla striscia di intestazione il nodo nasce libero", () => {
    const doc = withPool(createDocument("test", "id-1"))
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: -10, y: 50 })
    expect(produce(doc, recipe).diagram.flow.model.nodes[key]!.lane).toBeNull()
  })

  it("un clic vicino al bordo della corsia fa rientrare il nodo, su entrambi gli assi", () => {
    // Corsia [0, 640) × [0, 160), processo 60 × 40: x massima 560, y massima 100.
    const doc = withPool(createDocument("test", "id-1"))
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 630, y: 150 }, "process")
    const d = produce(doc, recipe).diagram.flow
    expect(d.model.nodes[key]!.lane).toBe("l1")
    expect(d.view.nodes[key]).toEqual({ x: 560, y: 100, collapsed: false })
    expectLaneInvariant(d)
  })

  it("addEdge torna null se un estremo non esiste", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 0 }, "process")
    expect(familyOps(produce(doc, recipe), "flow").addEdge(key, "fantasma")).toBeNull()
  })
})

describe("rectOf", () => {
  it("torna il rettangolo del nodo alla sua posizione salvata", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 40, y: 40 }, "process")
    expect(familyOps(produce(doc, recipe), "flow").rectOf(key)).toEqual({ x: 40, y: 40, w: 60, h: 40 })
  })

  it("torna null per una chiave inesistente", () => {
    expect(familyOps(createDocument("test", "id-1"), "flow").rectOf("fantasma")).toBeNull()
  })

  // È il solo caso in cui `at` fa la differenza: l'anteprima del drag lo passa per disegnare il
  // nodo dove il gesto lo sta portando, non dove sta ancora scritto in `view.nodes`.
  it("con `at` usa la posizione data, non quella salvata in `view`", () => {
    const doc = createDocument("test", "id-1")
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 40, y: 40 }, "process")
    expect(familyOps(produce(doc, recipe), "flow").rectOf(key, { x: 200, y: 300 })).toEqual({ x: 200, y: 300, w: 60, h: 40 })
  })
})
