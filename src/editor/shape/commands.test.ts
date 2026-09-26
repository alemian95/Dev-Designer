import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { documentStore } from "../document-store"
import { shapeDiagram } from "../shape-access"
import { addArrow, addShape, deleteShapeItems, duplicateShapes, invertArrow, resizeShape, setArrowDashed, setArrowHead, setShapeLabel, shapeLayoutGraph } from "./commands"

const state = () => documentStore.getState()
const part = () => shapeDiagram(state().doc)
const at = (x: number, y: number, w: number | null = null, h: number | null = null) => ({ x, y, collapsed: false, w, h })

/** Tre forme: `a` → `b` con una freccia, e `c` collegata a `a`. */
function tre(): void {
  const doc = createDocument("t", "t")
  doc.diagram.shape.model.shapes = { a: { kind: "rect", label: "A" }, b: { kind: "ellipse", label: "B" }, c: { kind: "text", label: "C" } }
  doc.diagram.shape.model.arrows = {
    ab: { source: "a", target: "b", head: "end", dashed: false },
    ca: { source: "c", target: "a", head: "both", dashed: true },
  }
  doc.diagram.shape.view.nodes = { a: at(0, 0, 300, null), b: at(400, 0), c: at(0, 300) }
  state().load(doc)
}

beforeEach(() => state().load(createDocument("t", "t")))

describe("comandi delle forme", () => {
  it("addShape crea la forma col tipo dato, l'etichetta vuota e la view sulla griglia senza misura scelta", () => {
    const { key, recipe } = addShape({ x: 13, y: 27 }, "ellipse")
    state().dispatch(recipe)
    expect(part().model.shapes[key]).toEqual({ kind: "ellipse", label: "" })
    expect(part().view.nodes[key]).toEqual({ x: 10, y: 30, collapsed: false, w: null, h: null })
  })

  it("setShapeLabel con la stessa etichetta non aggiunge una voce di annulla", () => {
    tre()
    expect(state().dispatch(setShapeLabel("a", "A"))).toBe(false)
    expect(state().dispatch(setShapeLabel("a", "API"))).toBe(true)
    expect(part().model.shapes["a"]!.label).toBe("API")
  })

  it("eliminare una forma elimina le frecce che la toccano, e un solo annulla le riporta", () => {
    tre()
    state().dispatch(deleteShapeItems(["a"], [])!)
    expect(part().model.shapes["a"]).toBeUndefined()
    expect(part().model.arrows).toEqual({})
    state().undo()
    expect(Object.keys(part().model.arrows).sort()).toEqual(["ab", "ca"])
  })

  it("eliminare una freccia la toglie e lascia le forme", () => {
    tre()
    state().dispatch(deleteShapeItems([], ["ab"])!)
    expect(Object.keys(part().model.arrows)).toEqual(["ca"])
    expect(Object.keys(part().model.shapes).sort()).toEqual(["a", "b", "c"])
  })

  it("duplicare copia le frecce fra forme copiate, non quelle verso una forma non copiata", () => {
    tre()
    const dup = duplicateShapes(part().model, ["a", "b"])
    state().dispatch(dup.recipe)
    const [a2, b2] = dup.keys
    expect(part().view.nodes[a2!]).toEqual(at(20, 20, 300, null))
    const copiate = Object.values(part().model.arrows).filter((arrow) => dup.keys.includes(arrow.source) || dup.keys.includes(arrow.target))
    expect(copiate).toEqual([{ source: a2, target: b2, head: "end", dashed: false }])
  })

  it("il grafo del layout ha le misure vere e le frecce come archi", () => {
    tre()
    const graph = shapeLayoutGraph(part())
    expect(graph.nodes.find((n) => n.id === "a")).toEqual({ id: "a", w: 300, h: 40 })
    expect(graph.edges).toEqual([{ id: "ab", source: "a", target: "b" }, { id: "ca", source: "c", target: "a" }])
    expect(graph.direction).toBe("DOWN")
  })
})

describe("comandi delle frecce", () => {
  it("addArrow crea una freccia con la punta alla fine; verso sé stessa o verso una forma che non c'è, niente", () => {
    tre()
    const created = addArrow(part().model, "b", "c")!
    state().dispatch(created.recipe)
    expect(part().model.arrows[created.key]).toEqual({ source: "b", target: "c", head: "end", dashed: false })
    expect(addArrow(part().model, "a", "a")).toBeNull()
    expect(addArrow(part().model, "a", "sparita")).toBeNull()
  })

  it("punte e tratteggio si scrivono solo se cambiano; invertire scambia i capi", () => {
    tre()
    expect(state().dispatch(setArrowHead("ab", "end"))).toBe(false)
    expect(state().dispatch(setArrowHead("ab", "both"))).toBe(true)
    expect(state().dispatch(setArrowDashed("ab", false))).toBe(false)
    expect(state().dispatch(setArrowDashed("ab", true))).toBe(true)
    state().dispatch(invertArrow("ab"))
    expect(part().model.arrows["ab"]).toEqual({ source: "b", target: "a", head: "both", dashed: true })
  })
})

describe("resizeShape", () => {
  it("scrive la misura scelta, e la stessa misura non aggiunge una voce di annulla", () => {
    tre()
    expect(state().dispatch(resizeShape("b", 200, 120))).toBe(true)
    expect(part().view.nodes["b"]).toMatchObject({ w: 200, h: 120 })
    expect(state().dispatch(resizeShape("b", 200, 120))).toBe(false)
  })
})
