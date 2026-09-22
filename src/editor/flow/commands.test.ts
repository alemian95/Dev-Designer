import { produce } from "immer"
import { describe, expect, it } from "vitest"
import type { DevDocument } from "@/model/document"
import { createFlowDocument, type FlowModel } from "@/model/flow/schema"
import {
  addFlowEdge,
  addFlowNode,
  addLane,
  deleteFlowItems,
  deleteLane,
  duplicateFlowNodes,
  moveLane,
  renameLane,
  setEdgeLabel,
  setNodeLabel,
  setNodeShape,
} from "./commands"

function docWith(): { doc: DevDocument; lane: string } {
  const doc = createFlowDocument("test", "id-1")
  return { doc, lane: doc.diagram.model.lanes[0]!.id }
}

const apply = (doc: DevDocument, recipe: (d: DevDocument) => void): DevDocument => produce(doc, recipe)

/** Il diagramma di flowchart del documento. Solleva se il documento è di un altro tipo. */
function fd(doc: DevDocument) {
  const d = doc.diagram
  if (d.type !== "flow") throw new Error("tipo sbagliato")
  return d
}

describe("addFlowNode", () => {
  it("crea il nodo nella corsia data, con la forma data e l'etichetta vuota", () => {
    const { doc, lane } = docWith()
    const { key, recipe } = addFlowNode({ x: 33, y: 47 }, "decision", lane)
    const next = apply(doc, recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[key]).toEqual({ label: "", shape: "decision", lane })
    expect(d.view.nodes[key]).toEqual({ x: 30, y: 50, collapsed: false })
  })
})

describe("addFlowEdge", () => {
  it("torna null se un estremo non esiste", () => {
    const { doc, lane } = docWith()
    const a = addFlowNode({ x: 0, y: 0 }, "process", lane)
    const next = apply(doc, a.recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(addFlowEdge(d.model, a.key, "fantasma")).toBeNull()
  })

  it("ammette due archi fra la stessa coppia: sono i due rami di una decisione", () => {
    const { doc, lane } = docWith()
    const a = addFlowNode({ x: 0, y: 0 }, "decision", lane)
    const b = addFlowNode({ x: 200, y: 0 }, "process", lane)
    let next = apply(apply(doc, a.recipe), b.recipe)
    const first = addFlowEdge((next.diagram as { model: FlowModel }).model, a.key, b.key)!
    next = apply(next, first.recipe)
    const second = addFlowEdge((next.diagram as { model: FlowModel }).model, a.key, b.key)!
    next = apply(next, second.recipe)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(Object.keys(d.model.edges)).toHaveLength(2)
  })
})

describe("deleteFlowItems", () => {
  it("cancellando un nodo porta via gli archi che lo toccano", () => {
    const { doc, lane } = docWith()
    const a = addFlowNode({ x: 0, y: 0 }, "process", lane)
    const b = addFlowNode({ x: 200, y: 0 }, "process", lane)
    let next = apply(apply(doc, a.recipe), b.recipe)
    const e = addFlowEdge((next.diagram as { model: FlowModel }).model, a.key, b.key)!
    next = apply(next, e.recipe)
    next = apply(next, deleteFlowItems([a.key], [])!)
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[a.key]).toBeUndefined()
    expect(d.model.edges[e.key]).toBeUndefined()
    expect(d.view.nodes[a.key]).toBeUndefined()
  })

  it("torna null quando non c'è niente da cancellare: evita una voce di undo fantasma", () => {
    expect(deleteFlowItems([], [])).toBeNull()
  })
})

describe("deleteLane", () => {
  it("rifiuta di cancellare l'ultima corsia: nessun nodo può restare senza", () => {
    const { doc, lane } = docWith()
    expect(deleteLane(fd(doc).model, lane, lane)).toBeNull()
  })

  it("sposta i nodi della corsia cancellata in quella indicata", () => {
    const { doc, lane } = docWith()
    let next = apply(doc, addLane("Corsia 2"))
    const seconda = fd(next).model.lanes[1]!.id
    const n = addFlowNode({ x: 0, y: 0 }, "process", seconda)
    next = apply(next, n.recipe)
    next = apply(next, deleteLane(fd(next).model, seconda, lane)!)
    const d = fd(next)
    expect(d.model.lanes).toHaveLength(1)
    expect(d.model.nodes[n.key]!.lane).toBe(lane)
    expect(d.view.lanes[seconda]).toBeUndefined()
  })

  it("su due corsie cancella quella indicata e torna una recipe, non null", () => {
    const { doc, lane } = docWith()
    const next = apply(doc, addLane("Corsia 2"))
    const model = fd(next).model
    const seconda = model.lanes[1]!.id
    expect(deleteLane(model, lane, seconda)).not.toBeNull()
  })

  it("rifiuta anche con un `moveTo` diverso e inesistente: il predicato è \"l'ultima corsia\", non \"id === moveTo\"", () => {
    const { doc, lane } = docWith()
    expect(deleteLane(fd(doc).model, lane, "fantasma")).toBeNull()
  })
})

describe("setNodeShape", () => {
  it("cambia la forma senza toccare etichetta e corsia", () => {
    const { doc, lane } = docWith()
    const n = addFlowNode({ x: 0, y: 0 }, "process", lane)
    const next = apply(apply(doc, n.recipe), setNodeShape(n.key, "decision"))
    const d = next.diagram
    if (d.type !== "flow") throw new Error("tipo sbagliato")
    expect(d.model.nodes[n.key]).toEqual({ label: "", shape: "decision", lane })
  })
})

describe("setNodeLabel", () => {
  it("cambia l'etichetta del nodo", () => {
    const { doc, lane } = docWith()
    const n = addFlowNode({ x: 0, y: 0 }, "process", lane)
    const next = apply(apply(doc, n.recipe), setNodeLabel(n.key, "verifica ordine"))
    expect(fd(next).model.nodes[n.key]!.label).toBe("verifica ordine")
  })
})

describe("setEdgeLabel", () => {
  it("cambia l'etichetta dell'arco", () => {
    const { doc, lane } = docWith()
    const a = addFlowNode({ x: 0, y: 0 }, "decision", lane)
    const b = addFlowNode({ x: 200, y: 0 }, "process", lane)
    let next = apply(apply(doc, a.recipe), b.recipe)
    const e = addFlowEdge(fd(next).model, a.key, b.key)!
    next = apply(next, e.recipe)
    next = apply(next, setEdgeLabel(e.key, "sì"))
    expect(fd(next).model.edges[e.key]!.label).toBe("sì")
  })
})

describe("addLane", () => {
  it("appende la banda sotto l'ultima corsia", () => {
    const { doc } = docWith()
    const next = apply(doc, addLane("Corsia 2"))
    const d = fd(next)
    expect(d.model.lanes).toHaveLength(2)
    const nuova = d.model.lanes[1]!
    expect(nuova.name).toBe("Corsia 2")
    const primaBanda = d.view.lanes[d.model.lanes[0]!.id]!
    const nuovaBanda = d.view.lanes[nuova.id]!
    expect(nuovaBanda.y).toBe(primaBanda.h)
  })
})

describe("renameLane", () => {
  it("rinomina la corsia", () => {
    const { doc, lane } = docWith()
    const next = apply(doc, renameLane(lane, "Preparazione"))
    expect(fd(next).model.lanes[0]!.name).toBe("Preparazione")
  })
})

describe("moveLane", () => {
  it("sposta la corsia nella posizione data", () => {
    const { doc } = docWith()
    let next = apply(doc, addLane("Corsia 2"))
    next = apply(next, addLane("Corsia 3"))
    next = apply(next, moveLane(0, 2))
    const nomi = fd(next).model.lanes.map((l) => l.name)
    expect(nomi).toEqual(["Corsia 2", "Corsia 3", "Corsia 1"])
  })
})

describe("duplicateFlowNodes", () => {
  it("copia i nodi con l'offset, nella stessa corsia", () => {
    const { doc, lane } = docWith()
    const n = addFlowNode({ x: 10, y: 10 }, "process", lane)
    const next = apply(doc, n.recipe)
    const { keys, recipe } = duplicateFlowNodes(fd(next).model, [n.key])
    const after = apply(next, recipe)
    const d = fd(after)
    expect(keys).toHaveLength(1)
    const copyKey = keys[0]!
    expect(d.model.nodes[copyKey]).toEqual({ label: "", shape: "process", lane })
    expect(d.view.nodes[copyKey]).toEqual({ x: 30, y: 30, collapsed: false })
    // L'originale resta intatto.
    expect(d.model.nodes[n.key]).toEqual({ label: "", shape: "process", lane })
  })
})
