import { describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import type { LayoutGraph } from "@/model/layout"
import { documentStore } from "./document-store"
import { qualify, splitKey } from "./families"
import { flowDiagram } from "./flow-access"
import { expectLaneInvariant } from "./flow/lane-invariant"
import { withPool } from "./flow/pool-fixture"
import { GRID, rectsIntersect } from "./geometry"
import { canvasOps } from "./kinds/canvas-ops"
import { LAYOUT_FAMILY_GAP, LAYOUT_MARGIN, layoutAll, nodesBounds, packBlocks } from "./layout-pack"
import { setNoteText } from "./note/commands"

const node = (id: string, w = 100, h = 50) => ({ id, w, h })
const rect = (x: number, y: number, w: number, h = 50) => ({ x, y, w, h })

describe("packBlocks", () => {
  it("il primo blocco parte dal margine, qualunque sia l'origine di ELK", () => {
    const out = packBlocks([{ family: "er", bounds: rect(12, 30, 300, 150) }])
    expect(out.get("er")).toEqual({ x: LAYOUT_MARGIN - 12, y: LAYOUT_MARGIN - 30 })
  })

  it("i blocchi stanno in fila da sinistra a destra, separati dal margine fra famiglie, allineati in alto", () => {
    const out = packBlocks([
      { family: "er", bounds: rect(0, 0, 100) },
      { family: "flow", bounds: rect(500, 90, 80) },
    ])
    expect(out.get("flow")).toEqual({ x: LAYOUT_MARGIN + 100 + LAYOUT_FAMILY_GAP - 500, y: LAYOUT_MARGIN - 90 })
  })

  it("un blocco vuoto non occupa posto e non si trasla", () => {
    const out = packBlocks([
      { family: "er", bounds: null },
      { family: "class", bounds: rect(0, 0, 100) },
    ])
    expect(out.has("er")).toBe(false)
    expect(out.get("class")).toEqual({ x: LAYOUT_MARGIN, y: LAYOUT_MARGIN })
  })
})

describe("nodesBounds", () => {
  it("la larghezza di un blocco è l'ingombro reale dei nodi, non la sola posizione", () => {
    // b parte a 50 ed è largo 300: il blocco va da 0 a 350.
    expect(nodesBounds([node("a", 100), node("b", 300)], { a: { x: 0, y: 0 }, b: { x: 50, y: 200 } })).toEqual(rect(0, 0, 350, 250))
  })

  it("i nodi senza posizione non contano, e senza nodi non c'è blocco", () => {
    expect(nodesBounds([node("a")], {})).toBeNull()
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

  /** ER e flusso, con un pool nell'angolo in cui l'ER finirà: lo strumento di forma dato crea il resto. */
  function erEPool(conNodo: boolean) {
    documentStore.getState().load(createDocument("t", "t"))
    const add = (at: { x: number; y: number }, family: "er" | "flow", variant?: string) => {
      const { recipe } = canvasOps(documentStore.getState().doc).addNode(at, family, variant)
      documentStore.getState().dispatch(recipe)
    }
    add({ x: 0, y: 0 }, "er")
    add({ x: 300, y: 0 }, "er")
    add({ x: 0, y: 0 }, "flow", "pool")
    if (conNodo) add({ x: 100, y: 40 }, "flow", "process")
    return documentStore.getState().doc
  }

  /** I rettangoli dopo Disponi: le entità ER e i pool. */
  async function disponi(doc: ReturnType<typeof erEPool>) {
    documentStore.getState().dispatch((await layoutAll(doc, fila))!)
    const ops = canvasOps(documentStore.getState().doc)
    const er = ops.nodeKeys().filter((k) => k.startsWith("er/")).map((k) => ops.rectOf(k)!)
    const pools = ops.frameKeys().map((k) => ops.rectOf(k)!)
    return { er, pools, erRight: Math.max(...er.map((r) => r.x + r.w)) }
  }

  it("un pool vuoto conta come blocco del flusso: sta dopo l'ER, a LAYOUT_FAMILY_GAP, senza sovrapporsi", async () => {
    const { er, pools, erRight } = await disponi(erEPool(false))
    expect(pools).toHaveLength(1)
    const pool = pools[0]!
    expect(er.some((r) => rectsIntersect(r, pool))).toBe(false)
    expect(pool.x - erRight).toBe(LAYOUT_FAMILY_GAP)
    expect(pool.y).toBe(LAYOUT_MARGIN)
  })

  it("il blocco del flusso si misura dal bordo del pool, non dai suoi nodi", async () => {
    const { pools, erRight } = await disponi(erEPool(true))
    const pool = pools[0]!
    expect(pool.x - erRight).toBe(LAYOUT_FAMILY_GAP)
    expect(pool.y).toBe(LAYOUT_MARGIN)
    // Il nodo resta nella sua corsia: la traslazione vale per nodi e pool insieme.
    expectLaneInvariant(flowDiagram(documentStore.getState().doc))
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

describe("layoutAll e le note (spec 3a §6)", () => {
  function conNota() {
    documentStore.getState().load(createDocument("t", "t"))
    const add = (family: "er" | "note", at: { x: number; y: number }) => {
      const { key, recipe } = canvasOps(documentStore.getState().doc).addNode(at, family)
      documentStore.getState().dispatch(recipe)
      return key
    }
    const a = add("er", { x: 500, y: 500 })
    const b = add("er", { x: 900, y: 500 })
    const nota = add("note", { x: 520, y: 700 })
    const connect = canvasOps(documentStore.getState().doc).addEdge(nota, a)
    if (connect?.type === "created") documentStore.getState().dispatch(connect.recipe)
    const libera = add("note", { x: 2000, y: 2000 })
    return { a, b, nota, libera }
  }

  it("la nota ancorata segue la sua entità con lo stesso scarto", async () => {
    const { a, nota } = conNota()
    const before = canvasOps(documentStore.getState().doc)
    const offset = { x: before.rectOf(nota)!.x - before.rectOf(a)!.x, y: before.rectOf(nota)!.y - before.rectOf(a)!.y }
    const recipe = await layoutAll(documentStore.getState().doc, fila)
    documentStore.getState().dispatch(recipe!)
    const after = canvasOps(documentStore.getState().doc)
    expect(after.rectOf(nota)!.x - after.rectOf(a)!.x).toBe(offset.x)
    expect(after.rectOf(nota)!.y - after.rectOf(a)!.y).toBe(offset.y)
    // L'entità si è spostata davvero: altrimenti il test passerebbe anche senza il passo delle note.
    expect(after.rectOf(a)!.x).not.toBe(before.rectOf(a)!.x)
  })

  it("la nota libera fa l'ultimo blocco, dopo l'ER, e tutto è un solo passo di annulla", async () => {
    const { b, libera } = conNota()
    const past = documentStore.getState().past.length
    const recipe = await layoutAll(documentStore.getState().doc, fila)
    documentStore.getState().dispatch(recipe!)
    const ops = canvasOps(documentStore.getState().doc)
    expect(ops.rectOf(libera)!.x).toBe(ops.rectOf(b)!.x + ops.rectOf(b)!.w + LAYOUT_FAMILY_GAP)
    expect(documentStore.getState().past.length).toBe(past + 1)
  })

  it("con sole note ancorate e nessuna libera, le note seguono lo stesso", async () => {
    const { a, nota, libera } = conNota()
    documentStore.getState().dispatch(canvasOps(documentStore.getState().doc).deleteItems([libera], [])!)
    const recipe = await layoutAll(documentStore.getState().doc, fila)
    documentStore.getState().dispatch(recipe!)
    const ops = canvasOps(documentStore.getState().doc)
    expect(ops.rectOf(nota)!.x - ops.rectOf(a)!.x).toBe(20)
  })
})

describe("layoutAll e le note: l'ingombro della nota ancorata non sconfina (F1)", () => {
  it("una nota ancorata a destra dell'entità più a destra del blocco ER non cade nel blocco della famiglia successiva", async () => {
    documentStore.getState().load(createDocument("t", "t"))
    const add = (family: "er" | "class" | "note", at: { x: number; y: number }) => {
      const { key, recipe } = canvasOps(documentStore.getState().doc).addNode(at, family)
      documentStore.getState().dispatch(recipe)
      return key
    }
    add("er", { x: 0, y: 0 })
    const b = add("er", { x: 300, y: 0 })
    // Una classe, la famiglia che «Disponi» impacchetta subito dopo l'ER.
    add("class", { x: 0, y: 0 })
    const bRect = canvasOps(documentStore.getState().doc).rectOf(b)!
    const nota = add("note", { x: bRect.x + bRect.w + 10, y: bRect.y })
    // Un testo abbastanza lungo da sporgere oltre il bordo del blocco ER: senza F1 la nota
    // cadrebbe nel blocco della classe, il prossimo in fila (spec 3a §10, DT-29).
    documentStore.getState().dispatch(setNoteText(splitKey(nota).key, "una nota abbastanza lunga da sporgere parecchio"))
    const link = canvasOps(documentStore.getState().doc).addEdge(nota, b)
    if (link?.type === "created") documentStore.getState().dispatch(link.recipe)

    const recipe = await layoutAll(documentStore.getState().doc, fila)
    documentStore.getState().dispatch(recipe!)

    const ops = canvasOps(documentStore.getState().doc)
    const notaRect = ops.rectOf(nota)!
    const classRects = ops
      .nodeKeys()
      .filter((k) => splitKey(k).family === "class")
      .map((k) => ops.rectOf(k)!)
    expect(classRects.some((r) => rectsIntersect(r, notaRect))).toBe(false)
  })
})

describe("layoutAll e le note: lo scarto resta esatto anche fuori griglia (F7)", () => {
  it("una nota ancorata a un pool tiene lo scarto esatto anche se il pool esce dalla griglia dopo Disponi", async () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    const add = (family: "er" | "flow" | "note", at: { x: number; y: number }, variant?: string) => {
      const { key, recipe } = canvasOps(documentStore.getState().doc).addNode(at, family, variant)
      documentStore.getState().dispatch(recipe)
      return key
    }
    // Due entità con un passo dispari (137, non multiplo della griglia): il blocco ER che precede il
    // flusso in Disponi finisce con una larghezza fuori griglia, e la trascina sul pool che segue
    // (`packBlocks`) — esattamente il caso che la review sospettava per `applyFlowLayout` (DT, «Correzione
    // finale del flowchart»).
    add("er", { x: 0, y: 0 })
    add("er", { x: 400, y: 0 })
    // Un solo nodo nella corsia: il pool resta comunque il punto più a sinistra del suo blocco.
    add("flow", { x: 100, y: 40 }, "process")
    const nota = add("note", { x: -400, y: 0 })
    const link = canvasOps(documentStore.getState().doc).addEdge(nota, qualify("flow", "p1"))
    if (link?.type === "created") documentStore.getState().dispatch(link.recipe)

    const before = canvasOps(documentStore.getState().doc)
    const scarto = {
      x: before.rectOf(nota)!.x - before.rectOf(qualify("flow", "p1"))!.x,
      y: before.rectOf(nota)!.y - before.rectOf(qualify("flow", "p1"))!.y,
    }
    // Un passo dispari anche qui: solo il grafo ER lo vede (più di un nodo), il flusso con un nodo
    // solo non chiama mai il motore.
    const fuoriGriglia = async (g: LayoutGraph) => Object.fromEntries(g.nodes.map((n, i) => [n.id, { x: i * 137, y: 0 }]))
    const recipe = await layoutAll(documentStore.getState().doc, fuoriGriglia)
    documentStore.getState().dispatch(recipe!)

    const after = canvasOps(documentStore.getState().doc)
    const pool = after.rectOf(qualify("flow", "p1"))!
    // Il pool è davvero fuori griglia: altrimenti il test passerebbe anche con lo `snap` di troppo.
    expect(pool.x % GRID).not.toBe(0)
    expect(after.rectOf(nota)!.x - pool.x).toBe(scarto.x)
    expect(after.rectOf(nota)!.y - pool.y).toBe(scarto.y)
  })
})
