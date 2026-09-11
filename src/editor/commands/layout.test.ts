import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument, type Attribute } from "@/model/er/schema"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import { HEADER_H, ROW_H } from "../geometry"
import { layoutGraph } from "./layout"

const state = () => documentStore.getState()
const er = () => erDiagram(state().doc)
const attr = (name: string, over: Partial<Attribute> = {}): Attribute => ({
  name,
  type: "int",
  primaryKey: false,
  foreignKey: false,
  nullable: false,
  unique: false,
  ...over,
})

describe("layout automatico", () => {
  beforeEach(() => {
    const doc = createErDocument("t", "t")
    doc.diagram.model.entities.cliente = {
      name: "cliente",
      attributes: [attr("id", { primaryKey: true }), attr("etichetta")],
    }
    doc.diagram.view.nodes.cliente = { x: 0, y: 0, collapsed: false }
    doc.diagram.model.entities.ordine = {
      name: "ordine",
      attributes: [attr("id", { primaryKey: true }), attr("cliente_id", { foreignKey: true })],
    }
    doc.diagram.view.nodes.ordine = { x: 500, y: 500, collapsed: false }
    // `source` è la figlia (lato della foreign key), `target` il padre referenziato.
    doc.diagram.model.relationships.ordine_cliente = {
      source: { entity: "ordine", attributes: ["cliente_id"], cardinality: "many" },
      target: { entity: "cliente", attributes: ["id"], cardinality: "one" },
      identifying: false,
    }
    documentStore.getState().load(doc)
  })

  describe("layoutGraph", () => {
    it("un nodo per entità, con l'ingombro che ha sul canvas", () => {
      const { nodes } = layoutGraph(er())
      expect(nodes.map((n) => n.id).sort()).toEqual(["cliente", "ordine"])
      // Due attributi: header + due righe + il margine sotto l'ultima.
      expect(nodes.every((n) => n.h === HEADER_H + 2 * ROW_H + 6)).toBe(true)
      expect(nodes.every((n) => n.w >= 160)).toBe(true)
    })

    it("un nodo collassato è alto quanto il suo solo header", () => {
      documentStore.getState().dispatch((draft) => {
        erDiagram(draft).view.nodes.cliente.collapsed = true
      })
      const node = layoutGraph(er()).nodes.find((n) => n.id === "cliente")
      expect(node?.h).toBe(HEADER_H)
    })

    it("inverte gli archi: il padre è la sorgente, così con direction DOWN sta sopra", () => {
      // Nel modello l'arco va ordine → cliente; nel grafo deve andare cliente → ordine.
      expect(layoutGraph(er()).edges).toEqual([{ id: "ordine_cliente", source: "cliente", target: "ordine" }])
    })

    it("un'entità senza nodo nella view non entra nel grafo", () => {
      documentStore.getState().dispatch((draft) => {
        erDiagram(draft).model.entities.fantasma = { name: "fantasma", attributes: [attr("id")] }
      })
      expect(layoutGraph(er()).nodes.map((n) => n.id)).not.toContain("fantasma")
    })

    it("salta la relazione con un estremo che non è nel diagramma", () => {
      documentStore.getState().dispatch((draft) => {
        erDiagram(draft).model.relationships.rotta = {
          source: { entity: "ordine", attributes: ["x"], cardinality: "many" },
          target: { entity: "assente", attributes: ["id"], cardinality: "one" },
          identifying: false,
        }
      })
      expect(layoutGraph(er()).edges.map((e) => e.id)).toEqual(["ordine_cliente"])
    })

    it("una foreign key su se stessa produce un arco con i due estremi uguali", () => {
      documentStore.getState().dispatch((draft) => {
        erDiagram(draft).model.relationships.gerarchia = {
          source: { entity: "cliente", attributes: ["padre_id"], cardinality: "many" },
          target: { entity: "cliente", attributes: ["id"], cardinality: "zero-or-one" },
          identifying: false,
        }
      })
      const edge = layoutGraph(er()).edges.find((e) => e.id === "gerarchia")
      expect(edge).toEqual({ id: "gerarchia", source: "cliente", target: "cliente" })
    })
  })
})
