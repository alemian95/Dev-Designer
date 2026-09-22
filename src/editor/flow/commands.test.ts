import { produce } from "immer"
import { describe, expect, it } from "vitest"
import type { DevDocument } from "@/model/document"
import { createFlowDocument, type FlowModel } from "@/model/flow/schema"
import {
  addFlowEdge,
  addFlowNode,
  addLane,
  applyFlowLayout,
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

describe("restackLanes: la y di una banda è una conseguenza dell'ordine e delle altezze", () => {
  it("dopo aver cancellato la prima corsia, una nuova banda non si sovrappone a quelle rimaste", () => {
    const { doc, lane: a } = docWith()
    let next = apply(doc, addLane("B"))
    next = apply(next, addLane("C"))
    const b = fd(next).model.lanes[1]!.id
    next = apply(next, deleteLane(fd(next).model, a, b)!)
    next = apply(next, addLane("D"))
    const d = fd(next)
    expect(d.model.lanes.map((l) => l.name)).toEqual(["B", "C", "D"])
    const [bandaB, bandaC, bandaD] = d.model.lanes.map((l) => d.view.lanes[l.id]!)
    expect(bandaB!.y).toBe(0)
    expect(bandaC!.y).toBe(bandaB!.y + bandaB!.h)
    expect(bandaD!.y).toBe(bandaC!.y + bandaC!.h)
    expect(bandaD!.y).toBe(320)
  })

  it("moveLane riallinea le bande al nuovo ordine dell'array", () => {
    const { doc } = docWith()
    let next = apply(doc, addLane("B"))
    next = apply(next, addLane("C"))
    next = apply(next, moveLane(2, 0))
    const d = fd(next)
    expect(d.model.lanes.map((l) => l.name)).toEqual(["C", "Corsia 1", "B"])
    const [bandaC, bandaA, bandaB] = d.model.lanes.map((l) => d.view.lanes[l.id]!)
    expect(bandaC!.y).toBe(0)
    expect(bandaA!.y).toBe(bandaC!.y + bandaC!.h)
    expect(bandaB!.y).toBe(bandaA!.y + bandaA!.h)
  })

  it("preserva l'altezza di una corsia invece di riazzerarla al minimo", () => {
    const doc = createFlowDocument("test", "id-1")
    const laneId = doc.diagram.model.lanes[0]!.id
    doc.diagram.view.lanes[laneId] = { y: 0, h: 400 }
    const next = apply(doc, addLane("Corsia 2"))
    const d = fd(next)
    expect(d.view.lanes[laneId]).toEqual({ y: 0, h: 400 })
    const nuova = d.model.lanes[1]!
    expect(d.view.lanes[nuova.id]!.y).toBe(400)
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

describe("applyFlowLayout", () => {
  it("scrive posizioni e bande in una sola applicazione, lasciando stare i nodi assenti dalla view", () => {
    const { doc, lane: l1 } = docWith()
    let next = apply(doc, addLane("Corsia 2"))
    const l2 = fd(next).model.lanes[1]!.id
    const a = addFlowNode({ x: 0, y: 0 }, "process", l1)
    next = apply(next, a.recipe)
    const b = addFlowNode({ x: 0, y: 0 }, "process", l2)
    next = apply(next, b.recipe)
    const c = addFlowNode({ x: 0, y: 0 }, "process", l1)
    next = apply(next, c.recipe)
    // Un nodo del modello senza voce nella view: come uno che esiste ma non è mai stato disegnato.
    next = apply(next, (draft) => {
      delete fd(draft).view.nodes[c.key]
    })

    const positions = { [a.key]: { x: 10, y: 999 }, [b.key]: { x: 20, y: 999 }, [c.key]: { x: 30, y: 999 } }
    const after = apply(next, applyFlowLayout(positions))
    const d = fd(after)

    expect(d.view.nodes[a.key]!.x).toBe(10)
    expect(d.view.nodes[b.key]!.x).toBe(20)
    // La y è l'unica cosa che questo passo calcola: senza queste due, una regressione che
    // perdesse `view.y = p.y` tenendo `view.x = p.x` passerebbe inosservata.
    expect(d.view.nodes[a.key]!.y).toBe(20)
    expect(d.view.nodes[b.key]!.y).toBe(204)
    // La guardia `if (view)`: il nodo senza voce nella view non ne guadagna una.
    expect(d.view.nodes[c.key]).toBeUndefined()
    // Le bande, non solo le posizioni: la stessa applicazione riscrive entrambe.
    expect(d.view.lanes[l1]).toBeDefined()
    expect(d.view.lanes[l2]!.y).toBe(d.view.lanes[l1]!.h)
  })
})
