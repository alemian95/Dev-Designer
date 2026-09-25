import { beforeEach, describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import { renameClass } from "../class/commands"
import { renameEntity } from "../commands/er"
import { documentStore } from "../document-store"
import { connectAcross, deleteLinks, followRename, linksTouching, retargetLinks, setLinkMode } from "./commands"

const state = () => documentStore.getState()
const links = () => state().doc.diagram.links

/** Un'entità `ordini`, una seconda entità `clienti`, una classe, un'interfaccia, un enum, una nota di classe, un processo `p1`, e una nota di flusso `f1`. */
function documento(): DevDocument {
  const doc = createDocument("t", "t")
  // Un oggetto nuovo per nodo: una view condivisa fra due chiavi diventerebbe un alias nel documento.
  const at = () => ({ x: 0, y: 0, collapsed: false })
  for (const name of ["ordini", "clienti"]) {
    doc.diagram.er.model.entities[name] = { name, attributes: [] }
    doc.diagram.er.view.nodes[name] = at()
  }
  for (const [name, stereotype] of [["Ordine", "class"], ["Pagabile", "interface"], ["Stato", "enum"]] as const) {
    doc.diagram.class.model.classes[name] = { name, stereotype, attributes: [], methods: [] }
    doc.diagram.class.view.nodes[name] = at()
  }
  doc.diagram.class.model.notes["n1"] = { text: "" }
  doc.diagram.class.view.nodes["n1"] = at()
  const lane = doc.diagram.flow.model.lanes[0]!.id
  doc.diagram.flow.model.nodes["p1"] = { label: "Calcola totale", shape: "process", lane }
  doc.diagram.flow.view.nodes["p1"] = at()
  doc.diagram.flow.model.nodes["f1"] = { label: "promemoria", shape: "note", lane }
  doc.diagram.flow.view.nodes["f1"] = at()
  return doc
}

beforeEach(() => state().load(documento()))

describe("connectAcross", () => {
  it("classe → entità crea «mappa su» da classe a entità", () => {
    const r = connectAcross(state().doc, "class/Ordine", "er/ordini")
    if (r.type !== "created") throw new Error(`atteso created, arrivato ${r.type}`)
    expect(r.key.startsWith("link/")).toBe(true)
    state().dispatch(r.recipe)
    expect(Object.values(links())).toEqual([{ kind: "maps-to", source: "class/Ordine", target: "er/ordini" }])
  })

  it("entità → classe dà lo stesso collegamento, nel verso del tipo", () => {
    const r = connectAcross(state().doc, "er/ordini", "class/Ordine")
    if (r.type !== "created") throw new Error(`atteso created, arrivato ${r.type}`)
    state().dispatch(r.recipe)
    expect(Object.values(links())).toEqual([{ kind: "maps-to", source: "class/Ordine", target: "er/ordini" }])
  })

  it("nodo → entità ed entità → nodo creano lo stesso accesso, in lettura", () => {
    for (const [from, to] of [["flow/p1", "er/ordini"], ["er/ordini", "flow/p1"]] as const) {
      state().load(documento())
      const r = connectAcross(state().doc, from, to)
      if (r.type !== "created") throw new Error(`atteso created, arrivato ${r.type}`)
      state().dispatch(r.recipe)
      expect(Object.values(links())).toEqual([{ kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read" }])
    }
  })

  it("nodo → classe e classe → nodo creano lo stesso «chiama», anche verso un'interfaccia", () => {
    for (const [from, to] of [["flow/p1", "class/Pagabile"], ["class/Pagabile", "flow/p1"]] as const) {
      state().load(documento())
      const r = connectAcross(state().doc, from, to)
      if (r.type !== "created") throw new Error(`atteso created, arrivato ${r.type}`)
      state().dispatch(r.recipe)
      expect(Object.values(links())).toEqual([{ kind: "calls", source: "flow/p1", target: "class/Pagabile" }])
    }
  })

  it("un'interfaccia, un enum e una nota non si mappano su una tabella", () => {
    expect(connectAcross(state().doc, "class/Pagabile", "er/ordini")).toEqual({ type: "rejected", notice: "Un'interfaccia non si mappa su una tabella." })
    expect(connectAcross(state().doc, "er/ordini", "class/Stato")).toEqual({ type: "rejected", notice: "Un enum non si mappa su una tabella." })
    expect(connectAcross(state().doc, "class/n1", "er/ordini")).toEqual({ type: "rejected", notice: "Una nota non si mappa su una tabella." })
  })

  it("un secondo gesto fra gli stessi nodi seleziona quello che c'è", () => {
    const first = connectAcross(state().doc, "class/Ordine", "er/ordini")
    if (first.type !== "created") throw new Error("atteso created")
    state().dispatch(first.recipe)
    expect(connectAcross(state().doc, "er/ordini", "class/Ordine")).toEqual({ type: "existing", key: first.key })
  })

  it("verso un'altra entità nasce un secondo collegamento: il problema lo dice la validazione", () => {
    for (const target of ["er/ordini", "er/clienti"]) {
      const r = connectAcross(state().doc, "class/Ordine", target)
      if (r.type !== "created") throw new Error("atteso created")
      state().dispatch(r.recipe)
    }
    expect(Object.keys(links())).toHaveLength(2)
  })

  it("le note non leggono, non scrivono, non chiamano e non si chiamano", () => {
    expect(connectAcross(state().doc, "flow/f1", "er/ordini")).toEqual({ type: "rejected", notice: "Una nota non legge né scrive una tabella." })
    expect(connectAcross(state().doc, "er/ordini", "flow/f1")).toEqual({ type: "rejected", notice: "Una nota non legge né scrive una tabella." })
    expect(connectAcross(state().doc, "flow/f1", "class/Ordine")).toEqual({ type: "rejected", notice: "Una nota non chiama una classe." })
    expect(connectAcross(state().doc, "class/n1", "flow/p1")).toEqual({ type: "rejected", notice: "Una nota non si chiama." })
  })

  it("dopo il cambio di modo un secondo gesto seleziona l'accesso che c'è", () => {
    // Review Focus 5: il confronto ignora il modo.
    const first = connectAcross(state().doc, "flow/p1", "er/ordini")
    if (first.type !== "created") throw new Error("atteso created")
    state().dispatch(first.recipe)
    const id = Object.keys(links())[0]!
    state().dispatch(setLinkMode(id, "write"))
    expect(connectAcross(state().doc, "er/ordini", "flow/p1")).toEqual({ type: "existing", key: first.key })
  })
})

/** Mette nel documento un collegamento `l1` da `class/Ordine` a `er/ordini`. */
function collega() {
  state().dispatch((draft) => {
    draft.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
  })
}

describe("retargetLinks e followRename", () => {
  it("retargetLinks sposta gli estremi che nominano la chiave vecchia", () => {
    collega()
    state().dispatch(retargetLinks("er/ordini", "er/righe"))
    expect(links()["l1"]!.target).toBe("er/righe")
  })

  it("la rinomina porta con sé il collegamento, in un solo passo di annulla", () => {
    collega()
    const past = state().past.length
    expect(state().dispatch(followRename(renameEntity("ordini", "righe")!, "er", "ordini", "righe"))).toBe(true)
    expect(links()["l1"]!.target).toBe("er/righe")
    expect(state().past.length).toBe(past + 1)
    state().undo()
    expect(links()["l1"]!.target).toBe("er/ordini")
  })

  it("una rinomina che collide non sposta niente", () => {
    // Review Focus 1: `renameEntity` su un nome già preso è una recipe che non scrive.
    collega()
    expect(state().dispatch(followRename(renameEntity("ordini", "clienti")!, "er", "ordini", "clienti"))).toBe(false)
    expect(links()["l1"]!.target).toBe("er/ordini")
  })
})

describe("deleteLinks e linksTouching", () => {
  it("deleteLinks toglie solo i collegamenti dati", () => {
    collega()
    state().dispatch(deleteLinks(["l1"]))
    expect(links()).toEqual({})
  })

  it("linksTouching dà i collegamenti con un estremo fra le chiavi", () => {
    collega()
    expect(linksTouching(links(), new Set(["er/ordini"]))).toEqual([["l1", links()["l1"]]])
    expect(linksTouching(links(), new Set(["er/clienti"]))).toEqual([])
  })
})

describe("setLinkMode", () => {
  /** Un accesso `a1` in lettura e un «mappa su» `m1`. */
  function accessi() {
    state().dispatch((draft) => {
      draft.diagram.links["a1"] = { kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read" }
      draft.diagram.links["m1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
    })
  }

  it("cambia il modo, e l'annulla lo riporta indietro", () => {
    accessi()
    expect(state().dispatch(setLinkMode("a1", "read-write"))).toBe(true)
    expect(links()["a1"]).toEqual({ kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read-write" })
    state().undo()
    expect(links()["a1"]).toEqual({ kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "read" })
  })

  it("lo stesso modo, un id che non c'è o un collegamento di un altro tipo non scrivono niente", () => {
    // Review Focus 4: su un «mappa su» non deve comparire un campo `mode`.
    accessi()
    expect(state().dispatch(setLinkMode("a1", "read"))).toBe(false)
    expect(state().dispatch(setLinkMode("fantasma", "write"))).toBe(false)
    expect(state().dispatch(setLinkMode("m1", "write"))).toBe(false)
    expect(links()["m1"]).toEqual({ kind: "maps-to", source: "class/Ordine", target: "er/ordini" })
  })
})

describe("coerenza dei collegamenti del flusso", () => {
  it("rinominare una classe sposta il target di un «chiama»", () => {
    // Review Focus 3: nel 4a la classe rinominata era solo `source`.
    state().dispatch((draft) => {
      draft.diagram.links["c1"] = { kind: "calls", source: "flow/p1", target: "class/Ordine" }
    })
    state().dispatch(followRename(renameClass("Ordine", "Fattura")!, "class", "Ordine", "Fattura"))
    expect(links()["c1"]!.target).toBe("class/Fattura")
  })

  it("rinominare un'entità sposta il target di un accesso", () => {
    state().dispatch((draft) => {
      draft.diagram.links["a1"] = { kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "write" }
    })
    state().dispatch(followRename(renameEntity("ordini", "righe")!, "er", "ordini", "righe"))
    expect(links()["a1"]).toEqual({ kind: "accesses", source: "flow/p1", target: "er/righe", mode: "write" })
  })
})
