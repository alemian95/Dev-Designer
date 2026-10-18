import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import type { LayoutGraph } from "@/model/layout"
import type { Sequence, Step } from "@/model/sequence/schema"
import { anchorsOf } from "@/model/shared"
import { addEntity, addRelationship, removeAttribute, renameEntity } from "../commands/er"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { linkId, qualify, splitKey } from "../families"
import { flowDiagram } from "../flow-access"
import { withPool } from "../flow/pool-fixture"
import { layoutAll } from "../layout-pack"
import { noteDiagram } from "../note-access"
import { sequenceLayout } from "../sequence/layout"
import { shapeDiagram } from "../shape-access"
import { autoPorts } from "../ports"
import { canvasOps, canvasPorts, familyHasContent } from "./canvas-ops"

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
    expect(ops.edgeGeometry(`er/${rel}`, autoPorts(ra, rb))).not.toBeNull()
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
    expect(ops.edgeGeometry(link, autoPorts(ops.rectOf(cls)!, ops.rectOf(entity)!))).not.toBeNull()
    expect(ops.edgeGeometry("link/fantasma", autoPorts(ops.rectOf(cls)!, ops.rectOf(entity)!))).toBeNull()
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
    expect(ops.edgeGeometry(note, autoPorts(ops.rectOf(note)!, ops.rectOf(entity)!))?.targetMarker).toBe("")
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

describe("canvasOps e le forme (spec 3b)", () => {
  const add = (family: "shape" | "er" | "note", at: { x: number; y: number }, variant?: string) => {
    const { key, recipe } = canvasOps(state().doc).addNode(at, family, variant)
    state().dispatch(recipe)
    return key
  }

  it("lo strumento crea la forma della sua variante e apre il testo", () => {
    const created = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "shape", "ellipse")
    expect(created.edit).toBe("body")
    state().dispatch(created.recipe)
    expect(shapeDiagram(state().doc).model.shapes[splitKey(created.key).key]).toEqual({ kind: "ellipse", label: "" })
  })

  it("Collega fra una forma e un'entità è rifiutato con l'avviso", () => {
    const s = add("shape", { x: 0, y: 0 }, "rect")
    const e = add("er", { x: 300, y: 0 })
    expect(canvasOps(state().doc).addEdge(s, e)).toEqual({ type: "rejected", notice: "Non esiste un collegamento fra una forma e un'entità." })
  })

  it("Collega fra due forme crea una freccia; da una forma a sé stessa niente", () => {
    const a = add("shape", { x: 0, y: 0 }, "rect")
    const b = add("shape", { x: 300, y: 0 }, "ellipse")
    const r = canvasOps(state().doc).addEdge(a, b)
    if (r?.type !== "created") throw new Error("attesa una freccia")
    state().dispatch(r.recipe)
    expect(shapeDiagram(state().doc).model.arrows[splitKey(r.key).key]).toEqual({ source: splitKey(a).key, target: splitKey(b).key, head: "end", dashed: false })
    expect(canvasOps(state().doc).addEdge(a, a)).toBeNull()
  })

  it("una nota si ancora a una forma; eliminare la forma stacca la nota, e un annulla riporta forma, frecce e àncora", () => {
    const s = add("shape", { x: 0, y: 0 }, "rect")
    const altra = add("shape", { x: 300, y: 0 }, "rect")
    const arrow = canvasOps(state().doc).addEdge(s, altra)
    if (arrow?.type !== "created") throw new Error("attesa una freccia")
    state().dispatch(arrow.recipe)
    const arrowKey = splitKey(arrow.key).key
    const n = add("note", { x: 0, y: 200 })
    const anchored = canvasOps(state().doc).addEdge(n, s)
    if (anchored?.type !== "created") throw new Error("atteso un ancoraggio")
    state().dispatch(anchored.recipe)
    const nota = () => noteDiagram(state().doc).model.notes[splitKey(n).key]!
    expect(nota().anchor).toBe(s)

    state().dispatch(canvasOps(state().doc).deleteItems([s], [])!)
    expect(nota().anchor).toBeNull()
    expect(shapeDiagram(state().doc).model.arrows).toEqual({})

    state().undo()
    expect(nota().anchor).toBe(s)
    expect(Object.keys(shapeDiagram(state().doc).model.arrows)).toEqual([arrowKey])
  })

  it("resize allarga la forma in un passo di annulla, e riportata al testo torna automatica", () => {
    const s = add("shape", { x: 0, y: 0 }, "rect")
    const view = () => shapeDiagram(state().doc).view.nodes[splitKey(s).key]!
    const grande = canvasOps(state().doc).resize(s, null, 100, 60)!
    expect(grande.rect).toEqual({ x: 0, y: 0, w: 160, h: 100 })
    state().dispatch(grande.recipe)
    expect(view()).toMatchObject({ w: 160, h: 100 })
    const indietro = canvasOps(state().doc).resize(s, null, -100, -60)!
    state().dispatch(indietro.recipe)
    expect(view()).toMatchObject({ w: null, h: null })
    state().undo()
    expect(view()).toMatchObject({ w: 160, h: 100 })
  })

  it("un resize via commit produce esattamente una voce di annulla", () => {
    const doc = createDocument("t", "t")
    doc.diagram.shape.model.shapes["s"] = { kind: "rect", label: "" }
    doc.diagram.shape.view.nodes["s"] = { x: 0, y: 0, collapsed: false, w: null, h: null }
    state().load(doc)
    const key = qualify("shape", "s")
    const view = () => shapeDiagram(state().doc).view.nodes["s"]!
    const r = canvasOps(state().doc).resize(key, null, 100, 60)!
    state().dispatch(r.recipe)
    expect(state().past.length).toBe(1)
    expect(view()).toMatchObject({ w: 160, h: 100 })
    state().undo()
    expect(view()).toMatchObject({ w: null, h: null })
    // Un secondo annulla non c'è più niente prima: non tocca più questo ridimensionamento.
    state().undo()
    expect(view()).toMatchObject({ w: null, h: null })
  })

  it("valida la famiglia shape anche con sole frecce: la freccia pendente emerge pur senza forme", () => {
    const a = add("shape", { x: 0, y: 0 }, "rect")
    const b = add("shape", { x: 300, y: 0 }, "rect")
    const edge = canvasOps(state().doc).addEdge(a, b)
    if (edge?.type !== "created") throw new Error("attesa una freccia")
    state().dispatch(edge.recipe)
    // Le forme spariscono senza passare da `deleteShapeItems`, che farebbe cascata sulla freccia: si
    // simula così un file con frecce orfane e zero forme, il caso del brief.
    state().dispatch((draft) => {
      const shapes = shapeDiagram(draft).model.shapes
      delete shapes[splitKey(a).key]
      delete shapes[splitKey(b).key]
    })
    expect(familyHasContent(state().doc, "shape")).toBe(false)
    const issues = canvasOps(state().doc).validate()
    expect(issues.some((i) => i.code === "shape-dangling-arrow")).toBe(true)
  })
})

describe("gli agganci (spec agganci §3)", () => {
  it("setEdgeAnchor scrive un capo, in una voce di annulla, e l'annulla torna automatico", () => {
    const { rel } = erConDueEntita()
    const recipe = canvasOps(state().doc).setEdgeAnchor(`er/${rel}`, "target", "n1")
    expect(recipe).not.toBeNull()
    state().dispatch(recipe!)
    expect(anchorsOf(erDiagram(state().doc).model.relationships[rel]!)).toEqual({ source: null, target: "n1" })
    state().undo()
    expect(erDiagram(state().doc).model.relationships[rel]!.anchors).toBeUndefined()
  })

  it("setEdgeAnchor con lo stesso aggancio o su un arco che non c'è non produce niente", () => {
    const { rel } = erConDueEntita()
    expect(canvasOps(state().doc).setEdgeAnchor(`er/${rel}`, "source", null)).toBeNull()
    expect(canvasOps(state().doc).setEdgeAnchor("er/manca", "source", "n1")).toBeNull()
  })

  it("addEdge con agganci li scrive sull'arco nuovo, nella stessa voce", () => {
    const { a, b } = erConDueEntita()
    const result = canvasOps(state().doc).addEdge(`er/${a}`, `er/${b}`, { source: "e2", target: "w2" })
    if (result?.type !== "created") throw new Error("atteso un arco nuovo")
    state().dispatch(result.recipe)
    expect(erDiagram(state().doc).model.relationships[splitKey(result.key).key]!.anchors).toEqual({ source: "e2", target: "w2" })
    state().undo()
    expect(erDiagram(state().doc).model.relationships[splitKey(result.key).key]).toBeUndefined()
  })

  it("la rinomina di un'entità lascia gli agganci sull'arco", () => {
    const { a, rel } = erConDueEntita()
    state().dispatch(canvasOps(state().doc).setEdgeAnchor(`er/${rel}`, "source", "s1")!)
    state().dispatch(renameEntity(a, "rinominata")!)
    const moved = Object.values(erDiagram(state().doc).model.relationships)
    expect(moved).toHaveLength(1)
    expect(moved[0]!.anchors).toEqual({ source: "s1", target: null })
  })

  it("canvasPorts riusa l'oggetto dei porti di un arco che non si è mosso", () => {
    const { rel } = erConDueEntita()
    const before = canvasPorts(state().doc).get(`er/${rel}`)
    expect(before).toBeDefined()
    const c = addEntity(erDiagram(state().doc).model.entities, { x: 2000, y: 2000 })
    state().dispatch(c.recipe)
    expect(canvasPorts(state().doc).get(`er/${rel}`)).toBe(before)
  })

  it("le linee delle note hanno i porti di autoPorts, fuori dal fascio", () => {
    const { a } = erConDueEntita()
    const note = canvasOps(state().doc).addNode({ x: 0, y: 300 }, "note")
    state().dispatch(note.recipe)
    const anchored = canvasOps(state().doc).addEdge(note.key, `er/${a}`)
    if (anchored?.type !== "created") throw new Error("attesa una nota ancorata")
    state().dispatch(anchored.recipe)
    const ops = canvasOps(state().doc)
    expect(canvasPorts(state().doc).get(note.key)).toEqual(autoPorts(ops.rectOf(note.key)!, ops.rectOf(`er/${a}`)!))
  })

  /** Un'entità e un nodo di flusso, con prefisso: fra loro nasce un `accesses` nel verso flusso → entità. */
  function entitaENodo() {
    const entity = canvasOps(state().doc).addNode({ x: 0, y: 0 }, "er")
    state().dispatch(entity.recipe)
    const node = canvasOps(state().doc).addNode({ x: 400, y: 0 }, "flow", "process")
    state().dispatch(node.recipe)
    return { entity: entity.key, node: node.key }
  }

  it("un collegamento creato al contrario scambia anche gli agganci", () => {
    const { entity, node } = entitaENodo()
    const r = canvasOps(state().doc).addEdge(entity, node, { source: "n1", target: "s1" })
    if (r?.type !== "created") throw new Error("atteso un collegamento nuovo")
    state().dispatch(r.recipe)
    const link = state().doc.diagram.links[linkId(r.key)!]!
    expect(link.source).toBe(node)
    expect(link.anchors).toEqual({ source: "s1", target: "n1" })
  })

  it("Collega verso un collegamento già presente lo seleziona e non gli cambia gli agganci", () => {
    const { entity, node } = entitaENodo()
    const first = canvasOps(state().doc).addEdge(node, entity)
    if (first?.type !== "created") throw new Error("atteso un collegamento nuovo")
    state().dispatch(first.recipe)
    expect(canvasOps(state().doc).addEdge(node, entity, { source: "n1", target: "s1" })).toEqual({ type: "existing", key: first.key })
    expect(state().doc.diagram.links[linkId(first.key)!]!.anchors).toBeUndefined()
  })
})

describe("canvasOps e le sequenze", () => {
  const msg = (id: string, from: string, to: string): Step => ({ kind: "message", id, from, to, text: id, line: "solid", head: "filled" })
  /** Tre partecipanti; `m1`, un blocco `k` con `m2` nella sezione `s1`, e `m3`. */
  const fixture = (): Sequence => ({
    title: "",
    autonumber: false,
    participants: ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase(), label: null, kind: "participant" as const })),
    steps: [msg("m1", "a", "b"), { kind: "block", id: "k", operator: "alt", sections: [{ id: "s1", condition: "", steps: [msg("m2", "b", "c")] }] }, msg("m3", "c", "a")],
  })
  const load = () => {
    const doc = createDocument("t", "t")
    doc.diagram.sequence.model.sequences["s"] = fixture()
    doc.diagram.sequence.view.nodes["s"] = { x: 100, y: 40, collapsed: false }
    state().load(doc)
  }
  const seqNow = () => state().doc.diagram.sequence.model.sequences["s"]!
  const add = (family: "er" | "note" | "sequence", at: { x: number; y: number }) => {
    const { key, recipe } = canvasOps(state().doc).addNode(at, family)
    state().dispatch(recipe)
    return key
  }
  const anchorOf = (note: string) => noteDiagram(state().doc).model.notes[splitKey(note).key]!.anchor
  const connect = (from: string, to: string) => {
    const r = canvasOps(state().doc).addEdge(from, to)
    if (r?.type === "created") state().dispatch(r.recipe)
    return r
  }

  it("lo strumento crea una sequenza senza aprire un editor; Disponi la mette in fila senza cambiarne l'interno", async () => {
    add("er", { x: 0, y: 0 })
    const created = canvasOps(state().doc).addNode({ x: 500, y: 500 }, "sequence")
    expect(created.edit).toBeNull()
    state().dispatch(created.recipe)
    const before = state().doc.diagram.sequence.model.sequences[splitKey(created.key).key]
    expect(before?.participants.map((p) => p.name)).toEqual(["A", "B"])
    const fila = async (g: LayoutGraph) => Object.fromEntries(g.nodes.map((n, i) => [n.id, { x: i * 200, y: 0 }]))
    state().dispatch((await layoutAll(state().doc, fila))!)
    expect(state().doc.diagram.sequence.model.sequences[splitKey(created.key).key]).toEqual(before)
    const ops = canvasOps(state().doc)
    expect(ops.rectOf(created.key)!.x).toBeGreaterThan(ops.rectOf(ops.nodeKeys().find((k) => k.startsWith("er/"))!)!.x)
  })

  it("i sotto-elementi non sono in nodeKeys", () => {
    load()
    expect(canvasOps(state().doc).nodeKeys()).toEqual(["sequence/s"])
  })

  it("Collega fra due intestazioni aggiunge un messaggio in fondo; dalla stessa intestazione, a sé stesso", () => {
    load()
    const r = connect("sequence/s/a", "sequence/s/c")
    expect(r?.type === "created" && r.key).toBe(`sequence/s/${seqNow().steps[3]!.id}`)
    expect(seqNow().steps[3]).toMatchObject({ kind: "message", from: "a", to: "c", text: "", line: "solid", head: "filled" })
    connect("sequence/s/b", "sequence/s/b")
    expect(seqNow().steps[4]).toMatchObject({ kind: "message", from: "b", to: "b" })
  })

  it("Collega fra un partecipante e un passo, o fra due sequenze, non crea niente", () => {
    load()
    const other = add("sequence", { x: 900, y: 0 })
    expect(canvasOps(state().doc).addEdge("sequence/s/a", "sequence/s/m1")).toBeNull()
    expect(canvasOps(state().doc).addEdge("sequence/s", other)).toBeNull()
  })

  it("Collega fra una sequenza e un'entità è rifiutato con l'avviso", () => {
    load()
    const e = add("er", { x: 900, y: 0 })
    expect(canvasOps(state().doc).addEdge("sequence/s", e)).toEqual({ type: "rejected", notice: "Non esiste un collegamento fra una sequenza e un'entità." })
  })

  it("una Nota si ancora a un partecipante, e la linea parte dalla sua intestazione", () => {
    load()
    const note = add("note", { x: 0, y: 600 })
    expect(connect(note, "sequence/s/b")?.type).toBe("created")
    expect(anchorOf(note)).toBe("sequence/s/b")
    const ops = canvasOps(state().doc)
    const head = ops.rectOf("sequence/s/b")!
    const l = sequenceLayout(seqNow())
    expect(head).toEqual({ ...l.columns.b!.head, x: 100 + l.columns.b!.head.x, y: 40 + l.columns.b!.head.y })
    const line = ops.allEdges().find((e) => e.key === note)!
    expect(line.target).toBe("sequence/s/b")
    const end = ops.portsOf([line], (k) => ops.rectOf(k)).get(note)!.target.point
    expect(end.x).toBeGreaterThanOrEqual(head.x)
    expect(end.x).toBeLessThanOrEqual(head.x + head.w)
    expect(end.y).toBeGreaterThanOrEqual(head.y)
    expect(end.y).toBeLessThanOrEqual(head.y + head.h)
  })

  it("eliminare il partecipante stacca la Nota e toglie i suoi messaggi; un annulla riporta tutto", () => {
    // Review Focus 1.
    load()
    const note = add("note", { x: 0, y: 600 })
    connect(note, "sequence/s/a")
    state().dispatch(canvasOps(state().doc).deleteItems(["sequence/s/a"], [])!)
    expect(anchorOf(note)).toBeNull()
    expect(seqNow().participants.map((p) => p.id)).toEqual(["b", "c"])
    expect(seqNow().steps.map((s) => s.id)).toEqual(["k"])
    state().undo()
    expect(anchorOf(note)).toBe("sequence/s/a")
    expect(seqNow()).toEqual(fixture())
  })

  it("eliminare la sequenza stacca le Note ancorate a lei e ai suoi partecipanti; un annulla riporta tutto", () => {
    // Review Focus 1.
    load()
    const onSeq = add("note", { x: 0, y: 600 })
    const onPart = add("note", { x: 300, y: 600 })
    connect(onSeq, "sequence/s")
    connect(onPart, "sequence/s/c")
    state().dispatch(canvasOps(state().doc).deleteItems(["sequence/s"], [])!)
    expect(canvasOps(state().doc).nodeKeys()).not.toContain("sequence/s")
    expect([anchorOf(onSeq), anchorOf(onPart)]).toEqual([null, null])
    state().undo()
    expect([anchorOf(onSeq), anchorOf(onPart)]).toEqual(["sequence/s", "sequence/s/c"])
    expect(seqNow()).toEqual(fixture())
  })

  it("eliminare passi e partecipanti insieme è un solo annulla", () => {
    load()
    const past = state().past.length
    state().dispatch(canvasOps(state().doc).deleteItems(["sequence/s/m1", "sequence/s/k", "sequence/s/c"], [])!)
    expect(seqNow().steps).toEqual([])
    expect(seqNow().participants.map((p) => p.id)).toEqual(["a", "b"])
    expect(state().past.length).toBe(past + 1)
  })

  it("commitDrag di un passo lo porta nel blocco, nello slot più vicino al rilascio", () => {
    // Review Focus 2.
    load()
    const l = sequenceLayout(seqNow())
    const row = l.rows.m3!
    const slot = l.slots.find((x) => x.container === "s1" && x.index === 1)!
    const dy = slot.y - (row.y + row.h / 2)
    state().dispatch(canvasOps(state().doc).commitDrag(["sequence/s/m3"], 0, dy)!)
    const block = seqNow().steps[1]
    expect(block?.kind === "block" && block.sections[0]!.steps.map((s) => s.id)).toEqual(["m2", "m3"])
    expect(seqNow().steps.map((s) => s.id)).toEqual(["m1", "k"])
  })

  it("commitDrag di un blocco non lo mette mai dentro sé stesso", () => {
    // Review Focus 2.
    load()
    const l = sequenceLayout(seqNow())
    const label = l.blocks.k!.label
    const dy = l.rows.m2!.y + l.rows.m2!.h - (label.y + label.h / 2)
    const recipe = canvasOps(state().doc).commitDrag(["sequence/s/k"], 0, dy)
    if (recipe) state().dispatch(recipe)
    expect(seqNow().steps.map((s) => s.id)).toContain("k")
  })

  it("commitDrag di un'intestazione riordina verso la colonna più vicina", () => {
    load()
    const l = sequenceLayout(seqNow())
    const dx = l.columns.c!.x - l.columns.a!.x - 10
    state().dispatch(canvasOps(state().doc).commitDrag(["sequence/s/a"], dx, 5)!)
    expect(seqNow().participants.map((p) => p.id)).toEqual(["b", "c", "a"])
    expect(state().doc.diagram.sequence.view.nodes["s"]).toEqual({ x: 100, y: 40, collapsed: false })
  })

  it("commitDrag della sola sequenza la sposta; con un sotto-elemento insieme, sposta solo la sequenza", () => {
    load()
    state().dispatch(canvasOps(state().doc).commitDrag(["sequence/s", "sequence/s/a"], 40, 20)!)
    expect(state().doc.diagram.sequence.view.nodes["s"]).toEqual({ x: 140, y: 60, collapsed: false })
    expect(seqNow()).toEqual(fixture())
  })

  it("duplicateNodes copia la sequenza e ignora i sotto-elementi", () => {
    load()
    const dup = canvasOps(state().doc).duplicateNodes(["sequence/s", "sequence/s/a"])
    expect(dup.keys).toHaveLength(1)
    state().dispatch(dup.recipe)
    expect(canvasOps(state().doc).nodeKeys()).toContain(dup.keys[0])
  })
})
