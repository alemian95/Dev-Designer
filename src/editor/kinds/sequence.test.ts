import { describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import type { Sequence } from "@/model/sequence/schema"
import { autoPorts } from "../ports"
import { sequenceLayout } from "../sequence/layout"
import { familyOps } from "./ops"

const seq = (title: string): Sequence => ({
  title,
  autonumber: false,
  participants: [
    { id: "a", name: "A", label: null, kind: "participant" },
    { id: "b", name: "B", label: null, kind: "participant" },
  ],
  steps: [{ kind: "message", id: "m", from: "a", to: "b", text: "ciao", line: "solid", head: "filled" }],
})

/** Due sequenze e nessun arco: una sequenza disegna i messaggi dentro di sé, come le note non hanno archi propri. */
function docDueSequenze(): DevDocument {
  const doc = createDocument("prova")
  const d = doc.diagram.sequence
  d.model.sequences["s1"] = seq("uno")
  d.model.sequences["s2"] = seq("due")
  d.view.nodes["s1"] = { x: 0, y: 0, collapsed: false }
  d.view.nodes["s2"] = { x: 600, y: 0, collapsed: false }
  return doc
}

// Il sottoinsieme di `verificaContrattoOps` che vale per una famiglia senza archi e, per ora, senza comandi.
describe("DiagramOps: sequence", () => {
  const ops = () => familyOps(docDueSequenze(), "sequence")

  it("nodeKeys elenca solo le sequenze, non i loro sotto-elementi", () => {
    expect(ops().nodeKeys().sort()).toEqual(["s1", "s2"])
  })

  it("nodeKeys salta una view senza sequenza", () => {
    const doc = docDueSequenze()
    doc.diagram.sequence.view.nodes["orfana"] = { x: 0, y: 0, collapsed: false }
    expect(familyOps(doc, "sequence").nodeKeys()).not.toContain("orfana")
  })

  it("rectOf dà la sequenza e i suoi sotto-elementi; null per una chiave inesistente", () => {
    const l = sequenceLayout(seq("due"))
    expect(ops().rectOf("s2")).toEqual({ x: 600, y: 0, w: l.width, h: l.height })
    expect(ops().rectOf("s2/b")).toEqual({ ...l.columns.b!.head, x: l.columns.b!.head.x + 600 })
    expect(ops().rectOf("inesistente")).toBeNull()
    expect(ops().rectOf("s2/fantasma")).toBeNull()
  })

  it("rectOf con `at` usa la posizione data e non quella della view", () => {
    const fermo = ops().rectOf("s1")!
    const spostato = ops().rectOf("s1", { x: fermo.x + 70, y: fermo.y })!
    expect(spostato.x).toBe(fermo.x + 70)
    expect(spostato.w).toBe(fermo.w)
  })

  it("nessun arco: edgesTouching vuoto, edgeGeometry null", () => {
    const o = ops()
    expect(o.edgesTouching(new Set(["s1", "s2"]))).toHaveLength(0)
    expect(o.edgeGeometry("m", autoPorts(o.rectOf("s1")!, o.rectOf("s2")!))).toBeNull()
  })

  it("layoutGraph dà un nodo per sequenza, con la dimensione del layout, e nessun arco", () => {
    const graph = ops().layoutGraph()
    const l = sequenceLayout(seq("uno"))
    expect(graph.direction).toBe("DOWN")
    expect(graph.edges).toHaveLength(0)
    expect(graph.nodes).toContainEqual({ id: "s1", w: l.width, h: l.height })
    expect(graph.nodes).toHaveLength(2)
  })

  it("validate torna un array", () => {
    expect(Array.isArray(ops().validate())).toBe(true)
  })
})
