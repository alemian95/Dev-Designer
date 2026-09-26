import { describe, expect, it } from "vitest"
import type { FlowModel, FlowShape } from "@/model/flow/schema"
import { validateFlow } from "./validate"

const n = (shape: FlowShape) => ({ label: "x", shape, lane: null })
const e = (source: string, target: string, label = "") => ({ source, target, label })

const model = (over: Partial<FlowModel>): FlowModel => ({ pools: {}, nodes: {}, edges: {}, ...over })

/** terminale → processo → terminale: il flusso minimo che non deve produrre niente. */
const sano = model({
  nodes: { s: n("terminal"), p: n("process"), t: n("terminal") },
  edges: { e1: e("s", "p"), e2: e("p", "t") },
})

describe("validateFlow", () => {
  it("un modello corretto non ha issue", () => {
    expect(validateFlow(sano)).toEqual([])
  })

  it("senza nessun terminale tace sulla raggiungibilità invece di gridare su ogni nodo", () => {
    const m = model({ nodes: { a: n("process"), b: n("process") }, edges: { e1: e("a", "b") } })
    const issues = validateFlow(m)
    expect(issues.filter((i) => i.code === "flow-unreachable")).toEqual([])
    expect(issues).toContainEqual(expect.objectContaining({ code: "flow-no-terminal", severity: "warning" }))
  })

  it("un terminale senza uscite è la fine del flusso, non un vicolo cieco", () => {
    expect(validateFlow(sano).filter((i) => i.code === "flow-dead-end")).toEqual([])
  })

  it("un arco con il target inesistente è flow-dangling-edge", () => {
    const m = model({ nodes: { s: n("terminal") }, edges: { e1: e("s", "fantasma") } })
    const issues = validateFlow(m)
    expect(issues).toContainEqual(expect.objectContaining({ code: "flow-dangling-edge", severity: "error", edge: "e1" }))
  })

  it("un arco con la sorgente inesistente è anch'esso flow-dangling-edge (non solo il target)", () => {
    const m = model({ nodes: { s: n("terminal") }, edges: { e1: e("fantasma", "s") } })
    const issues = validateFlow(m)
    expect(issues).toContainEqual(expect.objectContaining({ code: "flow-dangling-edge", severity: "error", edge: "e1" }))
  })

  it("una decisione con una sola uscita è flow-decision-arity", () => {
    const m = model({ nodes: { d: n("decision"), a: n("process") }, edges: { e1: e("d", "a") } })
    const issues = validateFlow(m)
    expect(issues).toContainEqual(expect.objectContaining({ code: "flow-decision-arity", severity: "error", node: "d" }))
  })

  it("l'arità conta solo le uscite: una decisione con un'uscita e un ingresso resta flow-decision-arity", () => {
    // Il conteggio ingenuo di tutti gli archi toccati (in + out = 2) non scatterebbe: l'arità è
    // solo sulle uscite, e qui ne ha una sola.
    const m = model({
      nodes: { s: n("terminal"), d: n("decision"), a: n("process") },
      edges: { e1: e("s", "d"), e2: e("d", "a") },
    })
    const issues = validateFlow(m)
    expect(issues).toContainEqual(expect.objectContaining({ code: "flow-decision-arity", node: "d" }))
  })

  it("una decisione con due uscite non ha issue di arità", () => {
    const m = model({
      nodes: { d: n("decision"), a: n("process"), b: n("process") },
      edges: { e1: e("d", "a"), e2: e("d", "b") },
    })
    expect(validateFlow(m).filter((i) => i.code === "flow-decision-arity")).toEqual([])
  })

  it("un processo senza archi in uscita è flow-dead-end", () => {
    const m = model({ nodes: { p: n("process") }, edges: {} })
    const issues = validateFlow(m)
    expect(issues).toContainEqual(expect.objectContaining({ code: "flow-dead-end", severity: "warning", node: "p" }))
  })

  it("due nodi collegati fra loro ma non raggiungibili dal terminale sono entrambi flow-unreachable", () => {
    const m = model({
      nodes: { s: n("terminal"), t: n("terminal"), a: n("process"), b: n("process") },
      edges: { e1: e("s", "t"), e2: e("a", "b"), e3: e("b", "a") },
    })
    const issues = validateFlow(m)
    const unreachable = issues.filter((i) => i.code === "flow-unreachable")
    expect(unreachable).toHaveLength(2)
    expect(unreachable.map((i) => i.node).sort()).toEqual(["a", "b"])
  })

  it("un nodo raggiungibile solo seguendo un arco all'indietro resta flow-unreachable (il grafo è diretto)", () => {
    // Se la raggiungibilità trattasse gli archi come non orientati, "y" risulterebbe raggiunto
    // tramite "x" (collegato a "s") anche se nessun arco esce mai verso "y".
    const m = model({
      nodes: { s: n("terminal"), x: n("process"), y: n("process") },
      edges: { e1: e("s", "x"), e2: e("y", "x") },
    })
    const issues = validateFlow(m)
    expect(issues).toContainEqual(expect.objectContaining({ code: "flow-unreachable", node: "y" }))
  })

  it("un arco in uscita da una decisione senza etichetta è flow-branch-unlabeled", () => {
    const m = model({
      nodes: { d: n("decision"), a: n("process"), b: n("process") },
      edges: { e1: e("d", "a", ""), e2: e("d", "b", "si") },
    })
    const issues = validateFlow(m)
    expect(issues.filter((i) => i.code === "flow-branch-unlabeled")).toEqual([
      expect.objectContaining({ code: "flow-branch-unlabeled", severity: "warning", edge: "e1" }),
    ])
  })

  it("un arco con label vuota che non esce da una decisione non è flow-branch-unlabeled", () => {
    const m = model({ nodes: { s: n("terminal"), p: n("process") }, edges: { e1: e("s", "p") } })
    expect(validateFlow(m).filter((i) => i.code === "flow-branch-unlabeled")).toEqual([])
  })

  it("un terminale che è solo target di un arco (nessun ingresso) non fa scattare flow-no-terminal: il terminale c'è", () => {
    const m = model({ nodes: { a: n("process"), s: n("terminal") }, edges: { e1: e("a", "s") } })
    const issues = validateFlow(m)
    expect(issues.filter((i) => i.code === "flow-no-terminal")).toEqual([])
  })
})
