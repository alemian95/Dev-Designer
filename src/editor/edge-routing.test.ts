import { describe, expect, it } from "vitest"
import type { Relationship } from "@/model/er/schema"
import { BUNDLE_GAP, crowsFootPath, edgeGeometry, edgeOffsets, filledArrowPath, LEFT, pathFromPoints, RIGHT, routeEdge } from "./edge-routing"

const rel: Relationship = {
  source: { entity: "a", attributes: [], cardinality: "many" },
  target: { entity: "b", attributes: [], cardinality: "one" },
  identifying: false,
}

describe("routeEdge", () => {
  it("entità affiancate: esce da destra, entra da sinistra, due pieghe", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 100, w: 100, h: 50 }, false)
    expect(r.sourceDir).toEqual({ x: 1, y: 0 })
    expect(r.targetDir).toEqual({ x: -1, y: 0 })
    expect(r.points).toEqual([{ x: 100, y: 25 }, { x: 200, y: 25 }, { x: 200, y: 125 }, { x: 300, y: 125 }])
  })

  it("stessa altezza: segmento dritto", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 }, false)
    expect(r.points).toHaveLength(2)
  })

  it("entità impilate: esce dal basso, entra dall'alto", () => {
    const r = routeEdge({ x: 0, y: 0, w: 100, h: 50 }, { x: 20, y: 300, w: 100, h: 50 }, false)
    expect(r.sourceDir).toEqual({ x: 0, y: 1 })
    expect(r.targetDir).toEqual({ x: 0, y: -1 })
    expect(r.points[0]).toEqual({ x: 50, y: 50 })
  })

  it("relazione su se stessa: anello a destra e rientro dall'alto", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 }
    const r = routeEdge(a, a, true)
    expect(r.points).toHaveLength(5)
    expect(r.targetDir).toEqual({ x: 0, y: -1 })
  })

  it("il cappio non attacca al centro dei lati, dove attaccano tutti gli altri archi", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 }
    const r = routeEdge(a, a, true)
    const primo = r.points[0]!
    const ultimo = r.points[r.points.length - 1]!
    // Ogni altro arco che tocca questo nodo attacca al centro del lato — (100, 25) a destra,
    // (50, 0) in alto, come mostrano i tre casi qui sopra. Un cappio che partisse da lì
    // finirebbe esattamente sotto la punta di quell'arco.
    expect(primo).not.toEqual({ x: 100, y: 25 })
    expect(ultimo).not.toEqual({ x: 50, y: 0 })
    // Resta comunque sul lato destro e su quello superiore: sono i lati che `sourceDir` e
    // `targetDir` dichiarano, e il marker vi si appoggia.
    expect(primo.x).toBe(100)
    expect(ultimo.y).toBe(0)
  })
})

describe("routeEdge da sinistra a destra", () => {
  it("esce a destra della sorgente ed entra a sinistra del bersaglio", () => {
    const a = { x: 0, y: 0, w: 100, h: 60 }
    const b = { x: 300, y: 0, w: 100, h: 60 }
    const route = routeEdge(a, b, false)
    expect(route.sourceDir).toEqual(RIGHT)
    expect(route.targetDir).toEqual(LEFT)
  })

  it("un arco all'indietro esce comunque con un percorso ortogonale valido", () => {
    const a = { x: 300, y: 0, w: 100, h: 60 }
    const b = { x: 0, y: 0, w: 100, h: 60 }
    const route = routeEdge(a, b, false)
    expect(route.points.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < route.points.length; i++) {
      const p = route.points[i - 1]!, q = route.points[i]!
      expect(p.x === q.x || p.y === q.y).toBe(true)
    }
  })
})

describe("crowsFootPath", () => {
  it("one: una sola barra", () => {
    expect(crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "one")).toBe("M12 -6 L12 6")
  })
  it("many: tre linee più la barra", () => {
    const d = crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "many")
    expect(d.split("M")).toHaveLength(5)
  })
  it("zero-or-one: barra più cerchio", () => {
    expect(crowsFootPath({ x: 0, y: 0 }, { x: 1, y: 0 }, "zero-or-one")).toContain("a4 4 0 1 0 8 0")
  })
})

describe("edgeGeometry", () => {
  it("produce path, marker ed etichetta", () => {
    const g = edgeGeometry({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 }, rel)
    expect(g.d).toBe(pathFromPoints([{ x: 100, y: 25 }, { x: 300, y: 25 }]))
    expect(g.label).toEqual({ x: 200, y: 25 })
    expect(g.sourceMarker).toContain("M")
    expect(g.targetMarker).toBe("M288 31 L288 19")
  })
})

describe("edgeOffsets", () => {
  const ends = (...triples: [string, string, string][]) =>
    triples.map(([key, source, target]) => ({ key, source, target }))

  it("un arco solo nel proprio fascio non si sposta di un pixel", () => {
    const o = edgeOffsets(ends(["e1", "a", "b"], ["e2", "b", "c"]))
    expect(o.get("e1")).toBe(0)
    expect(o.get("e2")).toBe(0)
  })

  it("due archi fra la stessa coppia si aprono simmetrici attorno all'asse", () => {
    const o = edgeOffsets(ends(["e1", "a", "b"], ["e2", "a", "b"]))
    expect(o.get("e1")).toBe(-BUNDLE_GAP / 2)
    expect(o.get("e2")).toBe(BUNDLE_GAP / 2)
    // simmetrici: l'insieme resta centrato dov'era il singolo arco
    expect(o.get("e1")! + o.get("e2")!).toBe(0)
  })

  it("il fascio non è orientato: a→b e b→a sono lo stesso", () => {
    const o = edgeOffsets(ends(["e1", "a", "b"], ["e2", "b", "a"]))
    expect(o.get("e1")).not.toBe(o.get("e2"))
  })

  it("tre archi: quello di mezzo resta al centro", () => {
    const o = edgeOffsets(ends(["e1", "a", "b"], ["e2", "a", "b"], ["e3", "a", "b"]))
    expect([o.get("e1"), o.get("e2"), o.get("e3")]).toEqual([-BUNDLE_GAP, 0, BUNDLE_GAP])
  })

  it("i cappi crescono verso l'esterno invece di aprirsi simmetrici", () => {
    // Un cappio ha un solo nodo: non c'è un lato opposto su cui bilanciarsi, e due scarti opposti
    // darebbero due anelli della stessa dimensione, cioè di nuovo sovrapposti.
    const o = edgeOffsets(ends(["l1", "a", "a"], ["l2", "a", "a"]))
    expect(o.get("l1")).toBe(0)
    expect(o.get("l2")).toBe(BUNDLE_GAP)
  })

  it("una coppia con più archi non tocca gli scarti delle altre coppie", () => {
    const o = edgeOffsets(ends(["e1", "a", "b"], ["e2", "a", "b"], ["solo", "c", "d"]))
    expect(o.get("solo")).toBe(0)
  })
})

describe("routeEdge con lo scarto del fascio", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 }
  const b = { x: 300, y: 0, w: 100, h: 100 }

  it("senza scarto attacca al centro del lato, come prima", () => {
    expect(routeEdge(a, b, false, 0).points).toEqual(routeEdge(a, b, false).points)
  })

  it("due archi della stessa coppia non condividono più nessun punto", () => {
    const uno = routeEdge(a, b, false, -BUNDLE_GAP / 2).points
    const due = routeEdge(a, b, false, BUNDLE_GAP / 2).points
    expect(uno[0]).not.toEqual(due[0])
    expect(uno[uno.length - 1]).not.toEqual(due[due.length - 1])
  })

  it("su archi verticali lo scarto va di lato, non lungo l'arco", () => {
    const sotto = { x: 0, y: 300, w: 100, h: 100 }
    const r = routeEdge(a, sotto, false, BUNDLE_GAP)
    expect(r.sourceDir).toEqual({ x: 0, y: 1 })
    expect(r.points[0]).toEqual({ x: 50 + BUNDLE_GAP, y: 100 })
  })

  it("il fascio sopravvive anche su un nodo alto quanto il solo header", () => {
    // Il caso che il rientro sbagliato schiacciava: un'entità senza attributi è alta HEADER_H, e
    // con un rientro pari a BUNDLE_GAP la banda utile si chiudeva a zero: archi di nuovo identici.
    const basso = { x: 0, y: 0, w: 160, h: 28 }
    const uno = routeEdge(basso, { x: 400, y: 0, w: 160, h: 28 }, false, -BUNDLE_GAP / 2)
    const due = routeEdge(basso, { x: 400, y: 0, w: 160, h: 28 }, false, BUNDLE_GAP / 2)
    expect(uno.points[0]).not.toEqual(due.points[0])
  })

  it("l'attacco resta sul lato anche con uno scarto più grande del nodo", () => {
    // Meglio due archi che ripartono dallo stesso punto e divergono subito, che due archi che
    // partono dal vuoto accanto al nodo.
    const basso = { x: 0, y: 0, w: 100, h: 20 }
    const r = routeEdge(basso, { x: 300, y: 0, w: 100, h: 20 }, false, 500)
    expect(r.points[0]!.y).toBeGreaterThanOrEqual(basso.y)
    expect(r.points[0]!.y).toBeLessThanOrEqual(basso.y + basso.h)
  })

  it("due cappi sullo stesso nodo non condividono né anello né attacchi", () => {
    const uno = routeEdge(a, a, true, 0).points
    const due = routeEdge(a, a, true, BUNDLE_GAP).points
    expect(uno[0]).not.toEqual(due[0])
    expect(uno[4]).not.toEqual(due[4])
    // l'anello esterno sta davvero più in fuori
    expect(due[1]!.x).toBeGreaterThan(uno[1]!.x)
  })
})

describe("filledArrowPath", () => {
  it("la cima sta nel punto dato e la base si apre lungo la direzione", () => {
    expect(filledArrowPath({ x: 100, y: 50 }, { x: 1, y: 0 })).toBe("M100 50 L110 45 L110 55 Z")
  })
})

describe("l'auto-relazione la dichiara il chiamante", () => {
  it("due nodi diversi con lo stesso rettangolo non diventano un cappio", () => {
    // Raggiungibile con lo snap: due entità uguali trascinate sulla stessa cella della griglia
    // hanno rettangoli identici. Prima `routeEdge` li confrontava per valore e disegnava un cappio.
    const stesso = { x: 40, y: 40, w: 160, h: 80 }
    const fra = routeEdge(stesso, stesso, false)
    const cappio = routeEdge(stesso, stesso, true)
    expect(cappio.points).toHaveLength(5)
    expect(fra.points).not.toHaveLength(5)
  })

  it("edgeGeometry prende il cappio dal modello, non dai rettangoli", () => {
    const stesso = { x: 0, y: 0, w: 100, h: 50 }
    const suSe: Relationship = { ...rel, target: { ...rel.target, entity: "a" } }
    expect(edgeGeometry(stesso, stesso, rel).d).not.toBe(edgeGeometry(stesso, stesso, suSe).d)
  })
})
