import { describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import type { LayoutGraph } from "@/model/layout"
import { documentStore } from "./document-store"
import { canvasOps } from "./kinds/canvas-ops"
import { LAYOUT_FAMILY_GAP, LAYOUT_MARGIN, layoutAll, packBlocks } from "./layout-pack"

const node = (id: string, w = 100, h = 50) => ({ id, w, h })

describe("packBlocks", () => {
  it("il primo blocco parte dal margine, qualunque sia l'origine di ELK", () => {
    const out = packBlocks([{ family: "er", nodes: [node("a"), node("b")], positions: { a: { x: 12, y: 30 }, b: { x: 212, y: 130 } } }])
    expect(out.get("er")).toEqual({ a: { x: LAYOUT_MARGIN, y: LAYOUT_MARGIN }, b: { x: LAYOUT_MARGIN + 200, y: LAYOUT_MARGIN + 100 } })
  })

  it("i blocchi stanno in fila da sinistra a destra, separati dal margine fra famiglie, allineati in alto", () => {
    const out = packBlocks([
      { family: "er", nodes: [node("a", 100)], positions: { a: { x: 0, y: 0 } } },
      { family: "flow", nodes: [node("n", 80)], positions: { n: { x: 500, y: 90 } } },
    ])
    expect(out.get("flow")).toEqual({ n: { x: LAYOUT_MARGIN + 100 + LAYOUT_FAMILY_GAP, y: LAYOUT_MARGIN } })
  })

  it("la larghezza di un blocco è l'ingombro reale dei nodi, non la sola posizione", () => {
    const out = packBlocks([
      { family: "er", nodes: [node("a", 100), node("b", 300)], positions: { a: { x: 0, y: 0 }, b: { x: 50, y: 200 } } },
      { family: "class", nodes: [node("c")], positions: { c: { x: 0, y: 0 } } },
    ])
    // Il blocco ER va da 0 a 350 (b parte a 50 ed è largo 300).
    expect(out.get("class")!.c!.x).toBe(LAYOUT_MARGIN + 350 + LAYOUT_FAMILY_GAP)
  })
})

function misto() {
  documentStore.getState().load(createDocument("t", "t"))
  for (const [family, variant, x] of [["er", undefined, 0], ["er", undefined, 300], ["flow", "process", 0], ["flow", "process", 300]] as const) {
    const { recipe } = canvasOps(documentStore.getState().doc).addNode({ x, y: 40 }, family, variant)
    documentStore.getState().dispatch(recipe)
  }
  return documentStore.getState().doc
}

/** Un motore finto che mette i nodi in fila a passo 200: deterministico, senza worker. */
const fila = async (g: LayoutGraph) => Object.fromEntries(g.nodes.map((n, i) => [n.id, { x: i * 200, y: 0 }]))

describe("layoutAll", () => {
  it("dispone ogni famiglia e mette i blocchi in fila, in una sola recipe", async () => {
    const doc = misto()
    const recipe = await layoutAll(doc, fila)
    expect(recipe).not.toBeNull()
    const past = documentStore.getState().past.length
    documentStore.getState().dispatch(recipe!)
    expect(documentStore.getState().past.length).toBe(past + 1)
    const ops = canvasOps(documentStore.getState().doc)
    const er = ops.nodeKeys().filter((k) => k.startsWith("er/")).map((k) => ops.rectOf(k)!)
    const flow = ops.nodeKeys().filter((k) => k.startsWith("flow/")).map((k) => ops.rectOf(k)!)
    const erRight = Math.max(...er.map((r) => r.x + r.w))
    expect(Math.min(...flow.map((r) => r.x))).toBeGreaterThan(erRight)
  })

  it("un fallimento non applica niente", async () => {
    const doc = misto()
    let calls = 0
    const failsOnSecond = async (g: LayoutGraph) => {
      calls++
      if (calls === 2) throw new Error("worker giù")
      return fila(g)
    }
    await expect(layoutAll(doc, failsOnSecond)).rejects.toThrow("worker giù")
  })
})
