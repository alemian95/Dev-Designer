import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument } from "@/model/er/schema"
import { addEntity, addRelationship, removeAttribute } from "../commands/er"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { canvasOps, familyHasContent } from "./canvas-ops"

const state = () => documentStore.getState()

/**
 * Due entità e una relazione, create coi comandi veri. Le chiavi le sceglie `addEntity`. Passa da
 * `erDiagram` e non da `doc.diagram.model`: così il file resta valido anche dopo il Task 5, dove
 * l'accessor legge la parte `er`.
 */
function erConDueEntita() {
  state().load(createErDocument("t", "t"))
  const a = addEntity(erDiagram(state().doc).model.entities, { x: 0, y: 0 })
  state().dispatch(a.recipe)
  const b = addEntity(erDiagram(state().doc).model.entities, { x: 300, y: 0 })
  state().dispatch(b.recipe)
  const rel = addRelationship(erDiagram(state().doc).model.relationships, a.key, b.key)
  state().dispatch(rel.recipe)
  return { a: a.key, b: b.key, rel: rel.key }
}

beforeEach(() => state().load(createErDocument("t", "t")))

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

  it("addEdge fra due nodi della stessa famiglia collega, fra famiglie diverse no", () => {
    const { a, b } = erConDueEntita()
    const ops = canvasOps(state().doc)
    const r = ops.addEdge(`er/${a}`, `er/${b}`)
    expect(r?.key.startsWith("er/")).toBe(true)
    // Nella fase A non esiste un secondo nodo di un'altra famiglia; basta la chiave per il rifiuto,
    // che avviene prima di interrogare la famiglia.
    expect(ops.addEdge(`er/${a}`, "flow/n1")).toBeNull()
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
})

describe("familyHasContent", () => {
  it("è vero quando la famiglia ha almeno un nodo", () => {
    expect(familyHasContent(state().doc, "er")).toBe(false)
    erConDueEntita()
    expect(familyHasContent(state().doc, "er")).toBe(true)
  })
})
