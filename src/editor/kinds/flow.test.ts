import { produce } from "immer"
import { describe, expect, it } from "vitest"
import { expectLaneInvariant } from "@/editor/flow/lane-invariant"
import { withPool } from "@/editor/flow/pool-fixture"
import { createDocument } from "@/model/document"
import { POOL_VARIANT } from "./flow"
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

describe("flowOps e i pool", () => {
  it("lo strumento Pool fuori da ogni pool crea un pool, senza aprire un editor", () => {
    const doc = createDocument("test", "id-1")
    const ops = familyOps(doc, "flow")
    expect(ops.refuseNode?.({ x: 0, y: 0 }, POOL_VARIANT)).toBeNull()
    const { key, recipe, edit } = ops.addNode({ x: 0, y: 0 }, POOL_VARIANT)
    expect(produce(doc, recipe).diagram.flow.model.pools[key]!.name).toBe("Pool 1")
    expect(edit).toBeNull()
  })

  it("il secondo pool si chiama «Pool 2»", () => {
    const doc = withPool(createDocument("test", "id-1"))
    const { key, recipe } = familyOps(doc, "flow").addNode({ x: 0, y: 1000 }, POOL_VARIANT)
    expect(produce(doc, recipe).diagram.flow.model.pools[key]!.name).toBe("Pool 2")
  })

  it("lo strumento Pool dentro un pool rifiuta, con il suo avviso", () => {
    const doc = withPool(createDocument("test", "id-1"))
    expect(familyOps(doc, "flow").refuseNode?.({ x: 100, y: 50 }, POOL_VARIANT)).toBe("Un pool non sta dentro un altro pool.")
  })

  it("un nodo dentro un pool non è mai rifiutato", () => {
    const doc = withPool(createDocument("test", "id-1"))
    expect(familyOps(doc, "flow").refuseNode?.({ x: 100, y: 50 }, "process")).toBeNull()
  })

  it("i pool sono frame e non nodi, e rectOf ne dà il rettangolo", () => {
    const ops = familyOps(withPool(createDocument("test", "id-1")), "flow")
    expect(ops.frameKeys?.()).toEqual(["p1"])
    expect(ops.nodeKeys()).toEqual([])
    expect(ops.rectOf("p1")).toEqual({ x: -32, y: 0, w: 672, h: 160 })
    expect(ops.rectOf("p1", { x: 5, y: 6 })).toEqual({ x: 5, y: 6, w: 672, h: 160 })
  })

  it("con un pool si trascinano anche i suoi nodi, una volta sola", () => {
    const base = withPool(createDocument("test", "id-1"))
    const { key, recipe } = familyOps(base, "flow").addNode({ x: 100, y: 20 }, "process")
    const ops = familyOps(produce(base, recipe), "flow")
    expect(ops.withFollowers?.(["p1", key])?.sort()).toEqual(["p1", key].sort())
    expect(ops.withFollowers?.(["p1"])).toHaveLength(2)
  })
})

describe("flowOps.resize", () => {
  it("il bordo destro dà la guida del pool e la recipe con la larghezza limitata", () => {
    const doc = withPool(createDocument("test", "id-1"))
    const r = familyOps(doc, "flow").resize?.("p1", null, -500, 0)
    expect(r?.rect).toEqual({ x: -32, y: 0, w: 640, h: 160 })
    expect(produce(doc, r!.recipe).diagram.flow.view.pools["p1"]!.w).toBe(640)
  })

  it("il bordo di una corsia dà la guida della corsia", () => {
    const doc = withPool(createDocument("test", "id-1"), ["l1", "l2"], 200)
    const r = familyOps(doc, "flow").resize?.("p1", "l2", 0, 100)
    expect(r?.rect).toMatchObject({ id: "l2", y: 200, h: 300 })
  })

  it("una corsia di un altro pool non si ridimensiona da qui", () => {
    const doc = withPool(createDocument("test", "id-1"))
    expect(familyOps(doc, "flow").resize?.("p9", "l1", 0, 100)).toBeNull()
  })
})
