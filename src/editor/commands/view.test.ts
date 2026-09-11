import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument } from "@/model/er/schema"
import type { LayoutPositions } from "@/model/layout"
import { documentStore } from "../document-store"
import { applyLayout, diagramView, moveNodes, setCollapsed } from "./view"

const state = () => documentStore.getState()
const view = () => diagramView(state().doc)

/** Un documento ER con due nodi in posizioni note. I nomi sono inventati. */
function docConDueNodi() {
  const doc = createErDocument("prova")
  doc.diagram.model.entities["cliente"] = { name: "cliente", attributes: [] }
  doc.diagram.model.entities["ordine"] = { name: "ordine", attributes: [] }
  doc.diagram.view.nodes["cliente"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.view.nodes["ordine"] = { x: 100, y: 0, collapsed: false }
  return doc
}

describe("moveNodes condiviso", () => {
  it("sposta e snappa senza sapere che tipo di diagramma sia", () => {
    const doc = docConDueNodi()
    moveNodes(["cliente"], 13, 27)!(doc)
    expect(doc.diagram.view.nodes["cliente"]).toEqual({ x: 10, y: 30, collapsed: false })
    expect(doc.diagram.view.nodes["ordine"]!.x).toBe(100)
  })

  it("uno spostamento nullo non produce recipe", () => {
    expect(moveNodes(["cliente"], 0, 0)).toBeNull()
  })

  describe("con documentStore", () => {
    // Spostato da er.test.ts. Il vecchio test univa in un solo `it` il controllo "spostamento
    // nullo → null" (chiamata diretta) e questo dispatch: il primo è già coperto sopra, sulla
    // stessa via (chiamata diretta alla recipe, senza store) — tenerlo anche qui sarebbe debito,
    // non copertura. Questo `it` prova invece l'integrazione con dispatch/patch, che i test diretti
    // sopra non toccano.
    beforeEach(() => {
      state().load(docConDueNodi())
    })

    it("un dispatch sposta più chiavi insieme, ciascuna con il suo snap", () => {
      state().dispatch(moveNodes(["cliente", "ordine"], 23, -7)!)
      expect(view().nodes["cliente"]).toMatchObject({ x: 20, y: -10 })
      expect(view().nodes["ordine"]).toMatchObject({ x: 120, y: -10 })
    })
  })
})

describe("setCollapsed condiviso", () => {
  // Spostato da er.test.ts, senza equivalente diretto fra i test nuovi: qui l'unica via è il
  // dispatch tramite documentStore.
  beforeEach(() => {
    state().load(docConDueNodi())
  })

  it("un dispatch imposta collapsed sul nodo", () => {
    state().dispatch(setCollapsed("cliente", true))
    expect(view().nodes["cliente"]?.collapsed).toBe(true)
  })
})

describe("applyLayout condiviso", () => {
  it("trasla dal minimo e ignora le posizioni di nodi che non esistono", () => {
    const doc = docConDueNodi()
    applyLayout({ cliente: { x: 500, y: 500 }, ordine: { x: 600, y: 500 }, fantasma: { x: 0, y: 0 } })(doc)
    expect(doc.diagram.view.nodes["cliente"]).toEqual({ x: 40, y: 40, collapsed: false })
    expect(doc.diagram.view.nodes["ordine"]).toEqual({ x: 140, y: 40, collapsed: false })
    expect(doc.diagram.view.nodes["fantasma"]).toBeUndefined()
  })

  describe("con documentStore", () => {
    // I cinque test seguenti vengono da layout.test.ts: provano l'integrazione con dispatch, patch
    // e undo, che il test diretto sopra non copre. Nessuno duplica un'asserzione già fatta sulla
    // stessa via, quindi restano tutti.
    const positions: LayoutPositions = { cliente: { x: 12.4, y: 7 }, ordine: { x: 212.4, y: 207 } }

    beforeEach(() => {
      state().load(docConDueNodi())
    })

    it("trasla a (40, 40) e allinea alla griglia da 10", () => {
      expect(state().dispatch(applyLayout(positions))).toBe(true)
      expect(view().nodes["cliente"]).toEqual({ x: 40, y: 40, collapsed: false })
      expect(view().nodes["ordine"]).toEqual({ x: 240, y: 240, collapsed: false })
    })

    it("una sola voce di undo per tutto il layout", () => {
      state().dispatch(applyLayout(positions))
      expect(state().past).toHaveLength(1)
      state().undo()
      expect(view().nodes["cliente"]).toEqual({ x: 0, y: 0, collapsed: false })
      expect(view().nodes["ordine"]).toEqual({ x: 100, y: 0, collapsed: false })
    })

    it("riapplicare le stesse posizioni non produce una voce di undo fantasma", () => {
      state().dispatch(applyLayout(positions))
      expect(state().dispatch(applyLayout(positions))).toBe(false)
      expect(state().past).toHaveLength(1)
    })

    it("ignora una chiave che nel frattempo non esiste più, senza toccare le altre", () => {
      const withGhost: LayoutPositions = { ...positions, sparita: { x: 999, y: 999 } }
      expect(state().dispatch(applyLayout(withGhost))).toBe(true)
      expect(view().nodes["sparita"]).toBeUndefined()
      expect(view().nodes["cliente"]).toEqual({ x: 40, y: 40, collapsed: false })
    })

    it("nessuna posizione applicabile: nessuna modifica", () => {
      expect(state().dispatch(applyLayout({ sparita: { x: 1, y: 2 } }))).toBe(false)
    })
  })
})
