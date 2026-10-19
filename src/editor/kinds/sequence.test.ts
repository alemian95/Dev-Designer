import { produce } from "immer"
import { describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import type { Sequence } from "@/model/sequence/schema"
import { snap } from "../geometry"
import { autoPorts } from "../ports"
import { noteSheet, sequenceLayout } from "../sequence/layout"
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

// Il sottoinsieme di `verificaContrattoOps` che vale per una famiglia senza archi; i comandi sul canvas sono in `canvas-ops.test.ts`.
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

  it("rectOf di un sotto-elemento con `at`: `at` è l'origine della sequenza, non del sotto-elemento", () => {
    const testa = sequenceLayout(seq("uno")).columns.b!.head
    expect(ops().rectOf("s1/b", { x: 1000, y: 300 })).toEqual({ ...testa, x: 1000 + testa.x, y: 300 + testa.y })
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

  it("deleteItems torna null quando non c'è niente da cancellare", () => {
    expect(ops().deleteItems([], [])).toBeNull()
  })

  it("layoutGraph esclude una sequenza senza view", () => {
    const doc = docDueSequenze()
    delete doc.diagram.sequence.view.nodes["s2"]
    expect(familyOps(doc, "sequence").layoutGraph().nodes.map((n) => n.id)).toEqual(["s1"])
  })

  it("validate segnala un riferimento pendente", () => {
    const doc = docDueSequenze()
    doc.diagram.sequence.model.sequences["s1"]!.steps.push({ kind: "message", id: "x", from: "a", to: "fantasma", text: "", line: "solid", head: "filled" })
    expect(familyOps(doc, "sequence").validate().map((i) => i.code)).toContain("sequence-dangling-participant")
  })
})

describe("sequenceOps.resize", () => {
  const conNota = (placement: "over" | "right"): DevDocument => {
    const doc = docDueSequenze()
    doc.diagram.sequence.model.sequences["s1"]!.steps.push({ kind: "note", id: "n", placement, participants: ["a"], text: "nota" })
    return doc
  }
  const stepOf = (doc: DevDocument) => {
    const step = doc.diagram.sequence.model.sequences["s1"]!.steps.find((x) => x.id === "n")
    if (step?.kind !== "note") throw new Error("nota mancante")
    return step
  }
  const resize = (doc: DevDocument, key: string, handle: string | null, dx: number, dy: number) => {
    const r = familyOps(doc, "sequence").resize?.(key, handle, dx, dy) ?? null
    return r && { rect: r.rect, after: produce(doc, r.recipe) }
  }

  it("la cornice si allarga da uno spigolo, e torna automatica riportata al contenuto", () => {
    const doc = docDueSequenze()
    const { width, height } = sequenceLayout(doc.diagram.sequence.model.sequences["s1"]!)
    const r = resize(doc, "s1", "se", 200, 100)!
    expect(r.after.diagram.sequence.view.nodes["s1"]).toMatchObject({ w: snap(width + 200), h: snap(height + 100) })
    const back = resize(r.after, "s1", "se", -500, -500)!
    expect(back.after.diagram.sequence.view.nodes["s1"]).toMatchObject({ w: null, h: null })
  })

  it("un partecipante si allarga solo in larghezza, e la colonna dopo si sposta", () => {
    const doc = docDueSequenze()
    const before = sequenceLayout(doc.diagram.sequence.model.sequences["s1"]!)
    const r = resize(doc, "s1/a", "se", 100, 300)!
    const p = r.after.diagram.sequence.model.sequences["s1"]!.participants[0]!
    expect(p.w).toBe(snap(before.columns.a!.w + 100))
    expect(r.rect.h).toBe(before.columns.a!.head.h)
    expect(sequenceLayout(r.after.diagram.sequence.model.sequences["s1"]!).columns.b!.x).toBe(before.columns.b!.x + snap(before.columns.a!.w + 100) - before.columns.a!.w)
  })

  it("un messaggio si allarga solo in altezza", () => {
    const doc = docDueSequenze()
    const before = sequenceLayout(doc.diagram.sequence.model.sequences["s1"]!)
    const r = resize(doc, "s1/m", "se", 300, 40)!
    const m = r.after.diagram.sequence.model.sequences["s1"]!.steps[0]!
    expect(m).toMatchObject({ h: snap(before.rows.m!.h + 40) })
    expect(m).not.toHaveProperty("w")
  })

  it("una nota si allarga in larghezza e in altezza, anche quella a destra della linea di vita", () => {
    for (const placement of ["over", "right"] as const) {
      const doc = conNota(placement)
      const r = resize(doc, "s1/n", "se", 100, 40)!
      const l = sequenceLayout(r.after.diagram.sequence.model.sequences["s1"]!)
      const before = sequenceLayout(doc.diagram.sequence.model.sequences["s1"]!)
      expect(l.rows.n!.h).toBe(snap(before.rows.n!.h + 40))
      // Il foglio è largo quanto la maniglia lo ha portato, allineato alla griglia.
      expect(noteSheet(l, stepOf(r.after))!.w).toBe(snap(noteSheet(before, stepOf(doc))!.w + 100))
    }
  })

  it("un blocco, o una maniglia che non è uno spigolo, non si ridimensionano", () => {
    const doc = docDueSequenze()
    doc.diagram.sequence.model.sequences["s1"]!.steps.push({ kind: "block", id: "k", operator: "opt", sections: [{ id: "x", condition: "", steps: [] }] })
    expect(resize(doc, "s1/k", "se", 10, 10)).toBeNull()
    expect(resize(doc, "s1/a", null, 10, 10)).toBeNull()
  })
})
