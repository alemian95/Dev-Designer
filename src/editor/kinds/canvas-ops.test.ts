import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { addEntity, addRelationship, removeAttribute } from "../commands/er"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { splitKey } from "../families"
import { flowDiagram } from "../flow-access"
import { withPool } from "../flow/pool-fixture"
import { canvasOps, familyHasContent } from "./canvas-ops"

const state = () => documentStore.getState()

/**
 * Due entità e una relazione, create coi comandi veri. Le chiavi le sceglie `addEntity`. Passa da
 * `erDiagram`, l'accessor della parte ER, e non legge il documento a mano.
 */
function erConDueEntita() {
  state().load(createDocument("t", "t"))
  const a = addEntity(erDiagram(state().doc).model.entities, { x: 0, y: 0 })
  state().dispatch(a.recipe)
  const b = addEntity(erDiagram(state().doc).model.entities, { x: 300, y: 0 })
  state().dispatch(b.recipe)
  const rel = addRelationship(erDiagram(state().doc).model.relationships, a.key, b.key)
  state().dispatch(rel.recipe)
  return { a: a.key, b: b.key, rel: rel.key }
}

beforeEach(() => state().load(createDocument("t", "t")))

describe("canvasOps (una famiglia)", () => {
  it("nodeKeys e edgesTouching danno chiavi con prefisso", () => {
    const { a, b, rel } = erConDueEntita()
    const ops = canvasOps(state().doc)
    expect(ops.nodeKeys().sort()).toEqual([`er/${a}`, `er/${b}`].sort())
    expect(ops.edgesTouching(new Set([`er/${a}`]))).toEqual([{ key: `er/${rel}`, source: `er/${a}`, target: `er/${b}` }])
  })

  it("rectOf ed edgeGeometry accettano chiavi con prefisso", () => {
    const { a, b, rel } = erConDueEntita()
    const ops = canvasOps(state().doc)
    const ra = ops.rectOf(`er/${a}`)!
    const rb = ops.rectOf(`er/${b}`)!
    expect(ra.x).toBe(0)
    expect(ops.edgeGeometry(`er/${rel}`, ra, rb)).not.toBeNull()
  })

  it("addNode crea nella famiglia data e restituisce la chiave con prefisso", () => {
    const { key, recipe, edit } = canvasOps(state().doc).addNode({ x: 10, y: 10 }, "er")
    expect(key.startsWith("er/")).toBe(true)
    expect(edit).toBe("name")
    state().dispatch(recipe)
    expect(canvasOps(state().doc).nodeKeys()).toContain(key)
  })

  it("addEdge fra due nodi della stessa famiglia collega, fra due famiglie crea un collegamento", () => {
    const { a, b } = erConDueEntita()
    const ops = canvasOps(state().doc)
    const r = ops.addEdge(`er/${a}`, `er/${b}`)
    expect(r?.type === "created" && r.key.startsWith("er/")).toBe(true)
    // Fra famiglie diverse decide `connectAcross`: il caso con un nodo di flusso vero è in
    // «famiglie mescolate», sotto.
    const across = ops.addEdge(`er/${a}`, "flow/n1")
    expect(across?.type === "created" && across.key.startsWith("link/")).toBe(true)
  })

  it("deleteItems e duplicateNodes accettano e restituiscono chiavi con prefisso", () => {
    const { a, b } = erConDueEntita()
    const dup = canvasOps(state().doc).duplicateNodes([`er/${a}`])
    expect(dup.keys).toHaveLength(1)
    expect(dup.keys[0]!.startsWith("er/")).toBe(true)
    state().dispatch(canvasOps(state().doc).deleteItems([`er/${b}`], [])!)
    expect(canvasOps(state().doc).nodeKeys()).not.toContain(`er/${b}`)
  })

  it("commitDrag sposta con una sola recipe", () => {
    const { a } = erConDueEntita()
    state().dispatch(canvasOps(state().doc).commitDrag([`er/${a}`], 40, 0)!)
    expect(canvasOps(state().doc).rectOf(`er/${a}`)!.x).toBe(40)
  })

  it("validate mette il prefisso sugli obiettivi", () => {
    const { a } = erConDueEntita()
    // Un'entità nuova ha già la PK `id` (DEFAULT_ATTRIBUTE): togliendola il problema è certo.
    state().dispatch(removeAttribute(a, 0))
    const issues = canvasOps(state().doc).validate()
    expect(issues.some((i) => i.code === "entity-without-pk" && i.node === `er/${a}`)).toBe(true)
    for (const i of issues) {
      if (i.node) expect(i.node.startsWith("er/")).toBe(true)
      if (i.edge) expect(i.edge.startsWith("er/")).toBe(true)
    }
  })

  it("un documento vuoto non ha problemi", () => {
    expect(canvasOps(createDocument("x")).validate()).toEqual([])
  })

  it("un documento con sole entità non ha problemi di flusso", () => {
    erConDueEntita()
    const issues = canvasOps(state().doc).validate()
    expect(issues.filter((i) => i.code.startsWith("flow-"))).toEqual([])
  })
})

describe("familyHasContent", () => {
  it("è vero quando la famiglia ha almeno un nodo", () => {
    expect(familyHasContent(state().doc, "er")).toBe(false)
    erConDueEntita()
    expect(familyHasContent(state().doc, "er")).toBe(true)
  })
})

describe("canvasOps (famiglie mescolate)", () => {
  it("deleteItems misto: un solo passo di annulla", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).deleteItems([entity.key, node.key], [])!)
    expect(canvasOps(state().doc).nodeKeys()).toEqual([])
    expect(state().past.length).toBe(past + 1)
    state().undo()
    expect(canvasOps(state().doc).nodeKeys().sort()).toEqual([entity.key, node.key].sort())
  })

  it("Collega fra un'entità e un nodo di flusso crea un accesso in lettura", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    const r = canvasOps(state().doc).addEdge(entity.key, node.key)
    if (r?.type !== "created") throw new Error("atteso created")
    state().dispatch(r.recipe)
    expect(Object.values(state().doc.diagram.links)).toEqual([{ kind: "accesses", source: node.key, target: entity.key, mode: "read" }])
  })

  it("commitDrag misto: una recipe, ogni famiglia con la sua regola", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    const flowKey = splitKey(node.key).key
    const laneBefore = flowDiagram(state().doc).model.nodes[flowKey]!.lane
    const xBefore = canvasOps(state().doc).rectOf(node.key)!.x
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).commitDrag([entity.key, node.key], 20, 0)!)
    expect(state().past.length).toBe(past + 1)
    expect(canvasOps(state().doc).rectOf(entity.key)!.x).toBe(20)
    expect(canvasOps(state().doc).rectOf(node.key)!.x).toBe(xBefore + 20)
    expect(flowDiagram(state().doc).model.nodes[flowKey]!.lane).toBe(laneBefore)
  })

  it("eliminare un nodo di flusso elimina i suoi collegamenti, in un solo passo di annulla", () => {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 40 }, "flow", "process")
    state().dispatch(node.recipe)
    const link = canvasOps(state().doc).addEdge(node.key, entity.key)
    if (link?.type !== "created") throw new Error("atteso created")
    state().dispatch(link.recipe)
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).deleteItems([node.key], [])!)
    expect(state().doc.diagram.links).toEqual({})
    expect(state().past.length).toBe(past + 1)
    state().undo()
    expect(Object.keys(state().doc.diagram.links)).toHaveLength(1)
  })

  it("un pool è un frame: non un nodo, ma contenuto della famiglia", () => {
    state().load(withPool(createDocument("t", "t")))
    const ops = canvasOps(state().doc)
    expect(ops.isFrame("flow/p1")).toBe(true)
    expect(ops.isFrame("er/p1")).toBe(false)
    expect(ops.nodeKeys()).toEqual([])
    expect(ops.frameKeys()).toEqual(["flow/p1"])
    expect(familyHasContent(state().doc, "flow")).toBe(true)
  })

  it("Collega da un pool non crea niente, nemmeno verso un'altra famiglia", () => {
    // Review Focus 1.
    state().load(withPool(createDocument("t", "t")))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 900 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 900, y: 900 }, "flow", "process")
    state().dispatch(node.recipe)
    expect(canvasOps(state().doc).addEdge("flow/p1", entity.key)).toBeNull()
    expect(canvasOps(state().doc).addEdge(entity.key, "flow/p1")).toBeNull()
    expect(canvasOps(state().doc).addEdge("flow/p1", node.key)).toBeNull()
  })

  it("trascinare un pool porta i suoi nodi in un solo passo, e un annulla riporta tutto", () => {
    // Review Focus 2.
    state().load(withPool(createDocument("t", "t")))
    const node = canvasOps(state().doc).addNode({ x: 100, y: 20 }, "flow", "process")
    state().dispatch(node.recipe)
    expect(canvasOps(state().doc).withFollowers(["flow/p1"]).sort()).toEqual(["flow/p1", node.key].sort())
    // Un nodo del pool già fra le chiavi non si ripete.
    expect(canvasOps(state().doc).withFollowers(["flow/p1", node.key]).sort()).toEqual(["flow/p1", node.key].sort())
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).commitDrag(["flow/p1"], 100, 0)!)
    expect(state().past.length).toBe(past + 1)
    // Il pool fuori griglia va da −32 a 70: il nodo si sposta dello stesso delta, 102.
    expect(canvasOps(state().doc).rectOf(node.key)!.x).toBe(202)
    state().undo()
    expect(canvasOps(state().doc).rectOf(node.key)!.x).toBe(100)
    expect(canvasOps(state().doc).rectOf("flow/p1")!.x).toBe(-32)
  })

  it("eliminare un pool lascia i suoi nodi, liberi", () => {
    state().load(withPool(createDocument("t", "t")))
    const node = canvasOps(state().doc).addNode({ x: 100, y: 20 }, "flow", "process")
    state().dispatch(node.recipe)
    state().dispatch(canvasOps(state().doc).deleteItems(["flow/p1"], [])!)
    expect(canvasOps(state().doc).frameKeys()).toEqual([])
    expect(canvasOps(state().doc).nodeKeys()).toEqual([node.key])
  })
})

describe("canvasOps (collegamenti)", () => {
  /** Un'entità e una classe create coi comandi veri, e il collegamento fra le due. */
  function collegati() {
    state().load(createDocument("t", "t"))
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const cls = canvasOps(state().doc).addNode({ x: 400, y: 0 }, "class", "class")
    state().dispatch(cls.recipe)
    const link = canvasOps(state().doc).addEdge(cls.key, entity.key)
    if (link?.type !== "created") throw new Error("atteso created")
    state().dispatch(link.recipe)
    return { entity: entity.key, cls: cls.key, link: link.key }
  }

  it("addEdge fra classe ed entità crea il collegamento, in qualunque verso", () => {
    const { entity, cls, link } = collegati()
    expect(link.startsWith("link/")).toBe(true)
    expect(canvasOps(state().doc).addEdge(entity, cls)).toEqual({ type: "existing", key: link })
  })

  it("edgesTouching include i collegamenti, con chiave link/", () => {
    const { entity, cls, link } = collegati()
    expect(canvasOps(state().doc).edgesTouching(new Set([entity]))).toEqual([{ key: link, source: cls, target: entity }])
  })

  it("edgeGeometry disegna un collegamento, e un id che non c'è dà null", () => {
    const { entity, cls, link } = collegati()
    const ops = canvasOps(state().doc)
    expect(ops.edgeGeometry(link, ops.rectOf(cls)!, ops.rectOf(entity)!)).not.toBeNull()
    expect(ops.edgeGeometry("link/fantasma", ops.rectOf(cls)!, ops.rectOf(entity)!)).toBeNull()
  })

  it("deleteItems di un collegamento elimina solo lui", () => {
    const { entity, cls, link } = collegati()
    state().dispatch(canvasOps(state().doc).deleteItems([], [link])!)
    expect(state().doc.diagram.links).toEqual({})
    expect(canvasOps(state().doc).nodeKeys().sort()).toEqual([cls, entity].sort())
  })

  it("deleteItems di un'entità elimina anche il collegamento, in un solo passo di annulla", () => {
    // Review Focus 5.
    const { entity, link } = collegati()
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).deleteItems([entity], [])!)
    expect(state().doc.diagram.links).toEqual({})
    expect(state().past.length).toBe(past + 1)
    state().undo()
    expect(canvasOps(state().doc).nodeKeys()).toContain(entity)
    expect(Object.keys(state().doc.diagram.links).map((id) => `link/${id}`)).toEqual([link])
  })

  it("validate aggiunge i problemi dei collegamenti, con obiettivo link/", () => {
    const { link } = collegati()
    // Un attributo della classe senza colonna nell'entità: un avviso certo.
    state().dispatch((draft) => {
      const cls = Object.values(draft.diagram.class.model.classes)[0]!
      cls.attributes.push({ name: "note", type: "string", visibility: "public", isStatic: false })
    })
    const issues = canvasOps(state().doc).validate()
    expect(issues.some((i) => i.code === "link-attribute-missing" && i.edge === link)).toBe(true)
  })
})

describe("canvasOps e le note (spec 3a §5)", () => {
  const add = (at: { x: number; y: number }, family: "er" | "note" | "flow", variant?: string) => {
    const { key, recipe } = canvasOps(state().doc).addNode(at, family, variant)
    state().dispatch(recipe)
    return key
  }
  const anchorOf = (note: string) => state().doc.diagram.note.model.notes[splitKey(note).key]!.anchor
  const connect = (from: string, to: string) => {
    const r = canvasOps(state().doc).addEdge(from, to)
    if (r?.type === "created") state().dispatch(r.recipe)
    return r
  }

  it("Collega da una nota a un'entità scrive l'àncora, e la chiave è quella della nota", () => {
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    const r = connect(note, entity)
    expect(r?.type).toBe("created")
    expect(r?.type === "created" && r.key).toBe(note)
    expect(anchorOf(note)).toBe(entity)
  })

  it("nel verso opposto ancora lo stesso, e verso l'àncora che ha già non crea niente", () => {
    // Review Focus 4.
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(entity, note)
    expect(anchorOf(note)).toBe(entity)
    expect(canvasOps(state().doc).addEdge(note, entity)).toEqual({ type: "existing", key: note })
  })

  it("un nuovo Collega sostituisce l'àncora", () => {
    const first = add({ x: 0, y: 0 }, "er")
    const second = add({ x: 400, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(note, first)
    connect(note, second)
    expect(anchorOf(note)).toBe(second)
  })

  it("una nota si ancora a un pool, ma un pool resta escluso da ogni altro collegamento", () => {
    state().load(withPool(createDocument("t", "t")))
    const note = add({ x: 0, y: 400 }, "note")
    const nodo = add({ x: 900, y: 0 }, "flow", "process")
    expect(connect("flow/p1", note)?.type).toBe("created")
    expect(anchorOf(note)).toBe("flow/p1")
    expect(canvasOps(state().doc).addEdge("flow/p1", nodo)).toBeNull()
  })

  it("due note non si collegano", () => {
    const a = add({ x: 0, y: 0 }, "note")
    const b = add({ x: 300, y: 0 }, "note")
    expect(canvasOps(state().doc).addEdge(a, b)).toBeNull()
  })

  it("la linea tocca sia la nota sia l'elemento, e ha una geometria senza marker", () => {
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(note, entity)
    const ops = canvasOps(state().doc)
    const line = { key: note, source: note, target: entity }
    expect(ops.edgesTouching(new Set([entity]))).toContainEqual(line)
    expect(ops.edgesTouching(new Set([note]))).toContainEqual(line)
    expect(ops.edgeGeometry(note, ops.rectOf(note)!, ops.rectOf(entity)!)?.targetMarker).toBe("")
  })

  it("Canc sulla linea stacca la nota, che resta", () => {
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(note, entity)
    state().dispatch(canvasOps(state().doc).deleteItems([], [note])!)
    expect(anchorOf(note)).toBeNull()
    expect(canvasOps(state().doc).nodeKeys()).toContain(note)
  })

  it("eliminare l'elemento stacca la nota, e un solo annulla riporta entrambi", () => {
    // Review Focus 3.
    const entity = add({ x: 0, y: 0 }, "er")
    const note = add({ x: 0, y: 300 }, "note")
    connect(note, entity)
    state().dispatch(canvasOps(state().doc).deleteItems([entity], [])!)
    expect(anchorOf(note)).toBeNull()
    state().undo()
    expect(anchorOf(note)).toBe(entity)
    expect(canvasOps(state().doc).nodeKeys()).toContain(entity)
  })

  it("eliminare un pool ancorato stacca la nota", () => {
    // Review Focus 2.
    state().load(withPool(createDocument("t", "t")))
    const note = add({ x: 0, y: 400 }, "note")
    connect(note, "flow/p1")
    state().dispatch(canvasOps(state().doc).deleteItems(["flow/p1"], [])!)
    expect(anchorOf(note)).toBeNull()
  })

  it("le note contano come contenuto", () => {
    add({ x: 0, y: 0 }, "note")
    expect(familyHasContent(state().doc, "note")).toBe(true)
  })
})
