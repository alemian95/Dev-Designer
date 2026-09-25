import { enablePatches, produce, produceWithPatches } from "immer"
import { describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import { LANE_MIN_H, POOL_MIN_W } from "@/model/flow/schema"
import { snap } from "@/editor/geometry"
import {
  addFlowEdge,
  addFlowNode,
  addLane,
  addPool,
  applyFlowLayout,
  deleteFlowItems,
  deleteLane,
  duplicateFlowNodes,
  moveFlowNodes,
  moveLane,
  renameLane,
  renamePool,
  resizeLane,
  resizePool,
  setEdgeLabel,
  setNodeLabel,
  setNodeLane,
  setNodeShape,
} from "./commands"
import { flowNodeSize, laneRect } from "./geometry"
import { expectLaneInvariant } from "./lane-invariant"
import { LANE_PAD } from "./layout"
import { withPool } from "./pool-fixture"

// Per leggere se una recipe produce patch: è la proprietà su cui `document-store.ts` scarta una
// dispatch, e un `toBe` per riferimento non basta.
enablePatches()

/** Un documento con il pool `p1` e le corsie date: il corpo parte da (0, 0) ed è largo 640 (`withPool`). */
const docWith = (lanes: readonly string[] = ["l1"], h = 160): DevDocument => withPool(createDocument("test", "id-1"), lanes, h)
const apply = (doc: DevDocument, recipe: (d: DevDocument) => void): DevDocument => produce(doc, recipe)
const fd = (doc: DevDocument) => doc.diagram.flow
const lanesOf = (doc: DevDocument) => fd(doc).model.pools["p1"]!.lanes.map((l) => l.name)
const topOf = (doc: DevDocument, lane: string) => laneRect(fd(doc), lane)!.y

describe("addFlowNode", () => {
  it("crea il nodo nella corsia data, con la forma data e l'etichetta vuota", () => {
    const { key, recipe } = addFlowNode({ x: 33, y: 47 }, "decision", "l1")
    const d = fd(apply(docWith(), recipe))
    expect(d.model.nodes[key]).toEqual({ label: "", shape: "decision", lane: "l1" })
    expect(d.view.nodes[key]).toEqual({ x: 30, y: 50, collapsed: false })
  })

  it("con `null` crea un nodo libero", () => {
    const { key, recipe } = addFlowNode({ x: 0, y: 0 }, "process", null)
    expect(fd(apply(createDocument("t", "t"), recipe)).model.nodes[key]!.lane).toBeNull()
  })
})

describe("addFlowEdge", () => {
  it("torna null se un estremo non esiste", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "process", null)
    const next = apply(createDocument("t", "t"), a.recipe)
    expect(addFlowEdge(fd(next).model, a.key, "fantasma")).toBeNull()
  })

  it("ammette due archi fra la stessa coppia: sono i due rami di una decisione", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "decision", null)
    const b = addFlowNode({ x: 200, y: 0 }, "process", null)
    let next = apply(apply(createDocument("t", "t"), a.recipe), b.recipe)
    next = apply(next, addFlowEdge(fd(next).model, a.key, b.key)!.recipe)
    next = apply(next, addFlowEdge(fd(next).model, a.key, b.key)!.recipe)
    expect(Object.keys(fd(next).model.edges)).toHaveLength(2)
  })
})

describe("deleteFlowItems", () => {
  it("cancellando un nodo porta via gli archi che lo toccano", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "process", null)
    const b = addFlowNode({ x: 200, y: 0 }, "process", null)
    let next = apply(apply(createDocument("t", "t"), a.recipe), b.recipe)
    const e = addFlowEdge(fd(next).model, a.key, b.key)!
    next = apply(apply(next, e.recipe), deleteFlowItems([a.key], [])!)
    expect(fd(next).model.nodes[a.key]).toBeUndefined()
    expect(fd(next).model.edges[e.key]).toBeUndefined()
    expect(fd(next).view.nodes[a.key]).toBeUndefined()
  })

  it("torna null quando non c'è niente da cancellare: evita una voce di undo fantasma", () => {
    expect(deleteFlowItems([], [])).toBeNull()
  })
})

describe("deleteLane", () => {
  it("rifiuta di cancellare l'ultima corsia del pool: si cancella il pool", () => {
    expect(deleteLane(fd(docWith()).model, "l1", "l1")).toBeNull()
  })

  it("sposta i nodi della corsia cancellata in quella indicata, dentro la sua banda", () => {
    const n = addFlowNode({ x: 0, y: 120 }, "process", "l2")
    let next = apply(docWith(["l1", "l2"], 100), n.recipe)
    next = apply(next, deleteLane(fd(next).model, "l2", "l1")!)
    expect(lanesOf(next)).toEqual(["l1"])
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
    expect(fd(next).view.lanes["l2"]).toBeUndefined()
    expectLaneInvariant(fd(next))
  })

  it("le corsie sotto quella cancellata salgono, e i loro nodi con loro", () => {
    // Review Focus 3.
    const n3 = addFlowNode({ x: 0, y: 220 }, "process", "l3")
    let next = apply(docWith(["l1", "l2", "l3"], 100), n3.recipe)
    next = apply(next, deleteLane(fd(next).model, "l2", "l1")!)
    expect(topOf(next, "l3")).toBe(100)
    expect(fd(next).view.nodes[n3.key]!.y).toBe(120)
    expectLaneInvariant(fd(next))
  })

  it("rifiuta un `moveTo` di un altro pool, o che non esiste", () => {
    const doc = docWith(["l1", "l2"])
    doc.diagram.flow.model.pools["p2"] = { name: "Pool 2", lanes: [{ id: "m1", name: "m1" }] }
    doc.diagram.flow.view.pools["p2"] = { x: 0, y: 500, w: 640 }
    doc.diagram.flow.view.lanes["m1"] = { h: 160 }
    expect(deleteLane(fd(doc).model, "l1", "m1")).toBeNull()
    expect(deleteLane(fd(doc).model, "l1", "fantasma")).toBeNull()
    expect(deleteLane(fd(doc).model, "l1", "l2")).not.toBeNull()
  })
})

describe("setNodeShape", () => {
  it("cambia la forma senza toccare etichetta e corsia", () => {
    const n = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const d = fd(apply(apply(docWith(), n.recipe), setNodeShape(n.key, "decision")))
    expect(d.model.nodes[n.key]).toEqual({ label: "", shape: "decision", lane: "l1" })
    expectLaneInvariant(d)
  })

  /**
   * `y: 130` con un `process` vuoto (`h: 40`) tiene il centro dentro la corsia [0, 160); diventato
   * `decision` (`h: 80`) il centro uscirebbe. L'intervallo utile è [20, 160 − 20 − 80] = [20, 60].
   */
  it("il cambio di forma che allarga il nodo lo fa rientrare nella corsia", () => {
    const n = addFlowNode({ x: 0, y: 130 }, "process", "l1")
    const d = fd(apply(apply(docWith(), n.recipe), setNodeShape(n.key, "decision")))
    expect(d.view.nodes[n.key]!.y).toBe(60)
    expectLaneInvariant(d)
  })

  it("su un nodo libero cambia solo la forma", () => {
    const n = addFlowNode({ x: 0, y: 130 }, "process", null)
    const d = fd(apply(apply(docWith(), n.recipe), setNodeShape(n.key, "decision")))
    expect(d.view.nodes[n.key]).toEqual({ x: 0, y: 130, collapsed: false })
  })
})

describe("setNodeLabel", () => {
  it("cambia l'etichetta del nodo", () => {
    const n = addFlowNode({ x: 0, y: 0 }, "process", null)
    const next = apply(apply(createDocument("t", "t"), n.recipe), setNodeLabel(n.key, "verifica ordine"))
    expect(fd(next).model.nodes[n.key]!.label).toBe("verifica ordine")
  })
})

describe("setNodeLane", () => {
  it("porta il nodo nella corsia data, centrato in verticale", () => {
    const n = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const next = apply(apply(docWith(["l1", "l2"], 100), n.recipe), setNodeLane(n.key, "l2"))
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l2")
    // Corsia l2 da 100 a 200, nodo alto 40: il centro della corsia dà 130.
    expect(fd(next).view.nodes[n.key]!.y).toBe(snap(100 + 50 - 20))
    expectLaneInvariant(fd(next))
  })

  it("porta dentro anche la x, se il nodo sta fuori dalla corsia in orizzontale", () => {
    const n = addFlowNode({ x: 900, y: 20 }, "process", null)
    const next = apply(apply(docWith(), n.recipe), setNodeLane(n.key, "l1"))
    // Corpo della corsia [0, 640), nodo largo 60: la x massima è 640 − 20 − 60 = 560.
    expect(fd(next).view.nodes[n.key]!.x).toBe(560)
    expectLaneInvariant(fd(next))
  })

  it("con `null` libera il nodo e lo lascia dov'è", () => {
    const n = addFlowNode({ x: 40, y: 40 }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), setNodeLane(n.key, null))
    expect(fd(next).model.nodes[n.key]!.lane).toBeNull()
    expect(fd(next).view.nodes[n.key]).toEqual({ x: 40, y: 40, collapsed: false })
  })

  it("non fa nulla quando la corsia data è già quella del nodo", () => {
    const n = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const next = apply(docWith(), n.recipe)
    expect(apply(next, setNodeLane(n.key, "l1"))).toBe(next)
  })
})

describe("setEdgeLabel", () => {
  it("cambia l'etichetta dell'arco, e scarta gli spazi ai margini", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "decision", null)
    const b = addFlowNode({ x: 200, y: 0 }, "process", null)
    let next = apply(apply(createDocument("t", "t"), a.recipe), b.recipe)
    const e = addFlowEdge(fd(next).model, a.key, b.key)!
    next = apply(apply(next, e.recipe), setEdgeLabel(e.key, "  sì  "))
    expect(fd(next).model.edges[e.key]!.label).toBe("sì")
    next = apply(next, setEdgeLabel(e.key, "   "))
    expect(fd(next).model.edges[e.key]!.label).toBe("")
  })
})

describe("addLane", () => {
  it("aggiunge la corsia in fondo al pool, alta il minimo", () => {
    const next = apply(docWith(), addLane("p1", "Corsia 2"))
    expect(lanesOf(next)).toEqual(["l1", "Corsia 2"])
    const nuova = fd(next).model.pools["p1"]!.lanes[1]!.id
    expect(fd(next).view.lanes[nuova]).toEqual({ h: LANE_MIN_H })
    expect(topOf(next, nuova)).toBe(160)
  })

  it("le corsie sopra e i loro nodi non si muovono", () => {
    const n = addFlowNode({ x: 0, y: LANE_PAD }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), addLane("p1", "Corsia 2"))
    expect(fd(next).view.nodes[n.key]!.y).toBe(LANE_PAD)
    expectLaneInvariant(fd(next))
  })

  it("su un pool che non c'è non fa niente", () => {
    const doc = docWith()
    expect(apply(doc, addLane("fantasma", "x"))).toBe(doc)
  })
})

describe("renameLane", () => {
  it("rinomina la corsia", () => {
    expect(lanesOf(apply(docWith(), renameLane("l1", "Preparazione")))).toEqual(["Preparazione"])
  })
})

describe("moveLane", () => {
  it("sposta la corsia nella posizione data, dentro il pool", () => {
    expect(lanesOf(apply(docWith(["a", "b", "c"]), moveLane("p1", 0, 2)))).toEqual(["b", "c", "a"])
  })

  it("trasla i nodi della corsia spostata, senza riallinearli né ricentrarli", () => {
    const doc = docWith(["a", "b"], 100)
    doc.diagram.flow.view.lanes["b"] = { h: 200 }
    const n1 = addFlowNode({ x: 0, y: 20 }, "process", "a")
    const n2 = addFlowNode({ x: 100, y: 60 }, "process", "a")
    const next = apply(apply(apply(doc, n1.recipe), n2.recipe), moveLane("p1", 0, 1))
    // "a" ora sta sotto "b" (alta 200): parte da 200, delta 200.
    expect(topOf(next, "a")).toBe(200)
    expect(fd(next).view.nodes[n1.key]!.y).toBe(220)
    expect(fd(next).view.nodes[n2.key]!.y).toBe(260)
    expectLaneInvariant(fd(next))
  })

  it("con tre corsie e un nodo in ognuna, l'invariante vale dopo lo spostamento", () => {
    let next = docWith(["a", "b", "c"])
    for (const lane of ["a", "b", "c"]) {
      next = apply(next, addFlowNode({ x: 0, y: topOf(next, lane) + LANE_PAD }, "process", lane).recipe)
    }
    expectLaneInvariant(fd(apply(next, moveLane("p1", 2, 0))))
  })

  it("indici fuori dal pool non fanno niente", () => {
    const doc = docWith()
    expect(apply(doc, moveLane("p1", 0, 5))).toBe(doc)
  })
})

describe("duplicateFlowNodes", () => {
  it("copia i nodi con l'offset, nella stessa corsia", () => {
    const n = addFlowNode({ x: 10, y: 10 }, "process", "l1")
    const next = apply(docWith(), n.recipe)
    const { keys, recipe } = duplicateFlowNodes(fd(next).model, [n.key])
    const d = fd(apply(next, recipe))
    expect(d.model.nodes[keys[0]!]).toEqual({ label: "", shape: "process", lane: "l1" })
    expect(d.view.nodes[keys[0]!]).toEqual({ x: 30, y: 30, collapsed: false })
    expectLaneInvariant(d)
  })

  /** y = 90, corsia [0, 160), nodo alto 40: l'intervallo utile è [20, 100], e +20 porterebbe a 110. */
  it("la copia che esce dalla corsia per l'offset ci rientra", () => {
    const n = addFlowNode({ x: 10, y: 90 }, "process", "l1")
    const next = apply(docWith(), n.recipe)
    const { keys, recipe } = duplicateFlowNodes(fd(next).model, [n.key])
    const d = fd(apply(next, recipe))
    expect(d.view.nodes[keys[0]!]!.y).toBe(100)
    expectLaneInvariant(d)
  })

  it("la copia di un nodo libero resta libera, con l'offset", () => {
    const n = addFlowNode({ x: 10, y: 10 }, "process", null)
    const next = apply(createDocument("t", "t"), n.recipe)
    const { keys, recipe } = duplicateFlowNodes(fd(next).model, [n.key])
    const d = fd(apply(next, recipe))
    expect(d.model.nodes[keys[0]!]!.lane).toBeNull()
    expect(d.view.nodes[keys[0]!]).toEqual({ x: 30, y: 30, collapsed: false })
  })
})

describe("applyFlowLayout", () => {
  it("scrive posizioni, pool e corsie in una sola applicazione, lasciando stare i nodi assenti dalla view", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const b = addFlowNode({ x: 0, y: 0 }, "process", "l2")
    const c = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    let next = apply(apply(apply(docWith(["l1", "l2"]), a.recipe), b.recipe), c.recipe)
    next = apply(next, (draft) => {
      delete fd(draft).view.nodes[c.key]
    })
    const d = fd(apply(next, applyFlowLayout({ [a.key]: { x: 10, y: 999 }, [b.key]: { x: 20, y: 999 }, [c.key]: { x: 30, y: 999 } }, { x: 0, y: 0 })))
    expect(d.view.nodes[a.key]).toMatchObject({ x: 10, y: LANE_PAD })
    expect(d.view.nodes[b.key]).toMatchObject({ x: 20, y: laneRect(d, "l2")!.y + LANE_PAD })
    expect(d.view.nodes[c.key]).toBeUndefined()
    expect(d.view.pools["p1"]!.y).toBe(0)
    expect(d.view.lanes["l1"]).toEqual({ h: LANE_MIN_H })
  })

  it("trasla di `offset` nodi e pool insieme, anche un pool senza nodi", () => {
    const a = addFlowNode({ x: 0, y: 0 }, "process", "l1")
    const base = fd(apply(apply(docWith(["l1"]), a.recipe), applyFlowLayout({ [a.key]: { x: 10, y: 0 } }, { x: 0, y: 0 })))
    const moved = fd(apply(apply(docWith(["l1"]), a.recipe), applyFlowLayout({ [a.key]: { x: 10, y: 0 } }, { x: 300, y: 70 })))
    expect(moved.view.nodes[a.key]).toMatchObject({ x: base.view.nodes[a.key]!.x + 300, y: base.view.nodes[a.key]!.y + 70 })
    expect(moved.view.pools["p1"]).toEqual({ ...base.view.pools["p1"]!, x: base.view.pools["p1"]!.x + 300, y: base.view.pools["p1"]!.y + 70 })
    expectLaneInvariant(moved)

    const empty = fd(apply(docWith(["l1"]), applyFlowLayout({}, { x: 300, y: 70 })))
    expect(empty.view.pools["p1"]).toMatchObject({ x: 300, y: 70 })
  })
})

/** Il pool `p1` con due corsie: l1 da 0 a 100, l2 da 100 a 200; il corpo da x = 0 a 640. */
const dueCorsie = () => docWith(["l1", "l2"], 100)

describe("moveFlowNodes", () => {
  it("un nodo trascinato in un'altra corsia cambia corsia", () => {
    const n = addFlowNode({ x: 0, y: 20 }, "process", "l1")
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], 0, 100)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l2")
    expect(fd(next).view.nodes[n.key]!.y).toBe(120)
    expectLaneInvariant(fd(next))
  })

  it("un nodo trascinato fuori da ogni pool diventa libero, dove l'ha lasciato", () => {
    const n = addFlowNode({ x: 0, y: 50 }, "process", "l1")
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], 0, -500)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBeNull()
    expect(fd(next).view.nodes[n.key]!.y).toBe(-450)
  })

  it("un nodo libero trascinato dentro una corsia la prende", () => {
    const n = addFlowNode({ x: 900, y: 20 }, "process", null)
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], -800, 0)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
  })

  it("decide il centro, non lo spigolo", () => {
    // y 50 → 90: il bordo superiore è ancora in l1, il centro (110) è già in l2.
    const n = addFlowNode({ x: 0, y: 50 }, "process", "l1")
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], 0, 40)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l2")
  })

  it("con il centro sulla striscia di intestazione il nodo è libero", () => {
    // x 0 → −60: il centro (−30) cade sulla striscia, fra −32 e 0.
    const n = addFlowNode({ x: 0, y: 20 }, "process", "l1")
    const next = apply(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], -60, 0)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBeNull()
  })

  it("trascinando più nodi insieme, ognuno prende la corsia dove cade lui", () => {
    const a = addFlowNode({ x: 0, y: 20 }, "process", "l1")
    const b = addFlowNode({ x: 0, y: 60 }, "process", "l1")
    const next = apply(apply(apply(dueCorsie(), a.recipe), b.recipe), moveFlowNodes([a.key, b.key], 0, 50)!)
    expect(fd(next).model.nodes[a.key]!.lane).toBe("l1")
    expect(fd(next).model.nodes[b.key]!.lane).toBe("l2")
  })

  it("dx e dy nulli non danno una recipe", () => {
    expect(moveFlowNodes(["x"], 0, 0)).toBeNull()
  })

  it("uno spostamento che la griglia annulla non produce patch", () => {
    const n = addFlowNode({ x: 0, y: 20 }, "process", "l1")
    const [, patches] = produceWithPatches(apply(dueCorsie(), n.recipe), moveFlowNodes([n.key], 3, 0)!)
    expect(patches).toHaveLength(0)
  })
})

describe("addPool e renamePool", () => {
  it("crea un pool allineato alla griglia, con una corsia «Corsia 1» alta il minimo", () => {
    const { key, recipe } = addPool({ x: 33, y: 47 }, "Pool 1")
    const d = fd(apply(createDocument("t", "t"), recipe))
    expect(d.model.pools[key]).toEqual({ name: "Pool 1", lanes: [{ id: expect.any(String), name: "Corsia 1" }] })
    expect(d.view.pools[key]).toEqual({ x: 30, y: 50, w: POOL_MIN_W })
    expect(d.view.lanes[d.model.pools[key]!.lanes[0]!.id]).toEqual({ h: LANE_MIN_H })
  })

  it("rinomina il pool", () => {
    expect(fd(apply(docWith(), renamePool("p1", "Ordini"))).model.pools["p1"]!.name).toBe("Ordini")
  })
})

describe("moveFlowNodes con i pool", () => {
  it("spostare un pool porta con sé i suoi nodi, senza cambiarne la corsia", () => {
    const n = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), moveFlowNodes(["p1"], 200, 300)!)
    // La fixture mette il pool a x = −32, fuori griglia: lo spostamento lo riallinea (−32 + 200 → 170),
    // e il nodo si sposta dello stesso delta effettivo, 202, senza riallinearsi per conto suo.
    expect(fd(next).view.pools["p1"]).toMatchObject({ x: 170, y: 300 })
    expect(fd(next).view.nodes[n.key]).toMatchObject({ x: 302, y: 320 })
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
    expectLaneInvariant(fd(next))
  })

  it("il pool fuori griglia e i suoi nodi si spostano dello stesso delta: la distanza non cambia", () => {
    const n = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    const before = apply(docWith(), n.recipe)
    const next = apply(before, moveFlowNodes(["p1"], 203, 57)!)
    const gap = (doc: DevDocument) => ({
      x: fd(doc).view.nodes[n.key]!.x - fd(doc).view.pools["p1"]!.x,
      y: fd(doc).view.nodes[n.key]!.y - fd(doc).view.pools["p1"]!.y,
    })
    expect(gap(next)).toEqual(gap(before))
  })

  it("un nodo vicino al bordo della corsia resta nella sua corsia anche disegnato", () => {
    // Il pool sta a y = 4, fuori griglia: l1 va da 4 a 104. Il nodo ha il centro a 101, 3 px sopra
    // il bordo. Lo spostamento riporta il pool a y = 0: un nodo allineato per conto suo (81 → 80)
    // finirebbe col centro a 100, sul bordo di l2, con la corsia ancora «l1».
    let doc = docWith(["l1", "l2"], 100)
    const n = addFlowNode({ x: 100, y: 0 }, "process", "l1")
    const { h } = flowNodeSize(fd(apply(doc, n.recipe)).model.nodes[n.key]!)
    doc = apply(apply(doc, n.recipe), (draft) => {
      fd(draft).view.pools["p1"]!.y = 4
      fd(draft).view.nodes[n.key]!.y = 101 - h / 2
    })
    const next = apply(doc, moveFlowNodes(["p1"], 200, 0)!)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
    expectLaneInvariant(fd(next))
  })

  it("un nodo libero sotto il pool non viene catturato, e non si sposta", () => {
    // Review Focus 2.
    const libero = addFlowNode({ x: 100, y: 20 }, "process", null)
    const next = apply(apply(docWith(), libero.recipe), moveFlowNodes(["p1"], 200, 0)!)
    expect(fd(next).view.nodes[libero.key]).toMatchObject({ x: 100, y: 20 })
    expect(fd(next).model.nodes[libero.key]!.lane).toBeNull()
  })

  it("un nodo del pool che è anche fra le chiavi si sposta una volta sola", () => {
    const n = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), moveFlowNodes(["p1", n.key], 200, 0)!)
    // Una volta sola, del delta del pool: −32 → 170, quindi 202 e non 402.
    expect(fd(next).view.nodes[n.key]!.x).toBe(302)
  })
})

describe("resizePool e resizeLane", () => {
  it("il pool si allarga, allineato alla griglia", () => {
    const d = fd(apply(docWith(), resizePool("p1", 1003)))
    expect(d.view.pools["p1"]!.w).toBe(1000)
  })

  it("il pool non scende sotto POOL_MIN_W, né sotto i suoi nodi", () => {
    // Review Focus 4.
    expect(fd(apply(docWith(), resizePool("p1", 100))).view.pools["p1"]!.w).toBe(POOL_MIN_W)
    const n = addFlowNode({ x: 900, y: 20 }, "process", null)
    let next = apply(apply(docWith(), n.recipe), setNodeLane(n.key, "l1"))
    next = apply(next, resizePool("p1", 3000))
    next = apply(next, moveFlowNodes([n.key], 1500, 0)!)
    // Il nodo sta a x = 560 + 1500 = 2060, largo 60: il bordo del pool resta oltre 2060 + 60 + 20.
    next = apply(next, resizePool("p1", 100))
    const pool = fd(next).view.pools["p1"]!
    expect(pool.x + pool.w).toBeGreaterThanOrEqual(2060 + 60 + LANE_PAD)
    expect(fd(next).model.nodes[n.key]!.lane).toBe("l1")
  })

  it("una corsia si abbassa e le corsie sotto scendono con i loro nodi", () => {
    const n2 = addFlowNode({ x: 0, y: 120 }, "process", "l2")
    const next = apply(apply(docWith(["l1", "l2"], 100), n2.recipe), resizeLane("l1", 300))
    expect(fd(next).view.lanes["l1"]).toEqual({ h: 300 })
    expect(topOf(next, "l2")).toBe(300)
    expect(fd(next).view.nodes[n2.key]!.y).toBe(320)
    expectLaneInvariant(fd(next))
  })

  it("una corsia non scende sotto LANE_MIN_H, né sotto i suoi nodi", () => {
    // Review Focus 4.
    expect(fd(apply(docWith(), resizeLane("l1", 10))).view.lanes["l1"]).toEqual({ h: LANE_MIN_H })
    const doc = docWith(["l1"], 400)
    const n = addFlowNode({ x: 0, y: 300 }, "process", "l1")
    const next = apply(apply(doc, n.recipe), resizeLane("l1", 10))
    expect(fd(next).view.lanes["l1"]!.h).toBeGreaterThanOrEqual(300 + 40 + LANE_PAD)
    expectLaneInvariant(fd(next))
  })
})

describe("deleteFlowItems con i pool", () => {
  it("elimina il pool e le sue corsie, e i suoi nodi restano dove sono, liberi", () => {
    const n = addFlowNode({ x: 100, y: 20 }, "process", "l1")
    const next = apply(apply(docWith(), n.recipe), deleteFlowItems(["p1"], [])!)
    expect(fd(next).model.pools).toEqual({})
    expect(fd(next).view.pools).toEqual({})
    expect(fd(next).view.lanes).toEqual({})
    expect(fd(next).model.nodes[n.key]!.lane).toBeNull()
    expect(fd(next).view.nodes[n.key]).toMatchObject({ x: 100, y: 20 })
  })
})
