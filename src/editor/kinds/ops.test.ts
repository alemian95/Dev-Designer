import { describe, expect, it } from "vitest"
import type { DevDocument } from "@/model/document"
import { createErDocument } from "@/model/er/schema"
import { opsFor } from "./ops"

/** Contratto che ogni tipo di diagramma deve rispettare. Il Task 11 richiama
 *  questa funzione con un documento di classi. */
export function verificaContrattoOps(nome: string, docConDueNodiEUnArco: () => DevDocument) {
  describe(`DiagramOps: ${nome}`, () => {
    it("nodeKeys elenca solo i nodi presenti nella view", () => {
      const ops = opsFor(docConDueNodiEUnArco())
      expect(ops.nodeKeys().sort()).toHaveLength(2)
    })

    it("rectOf torna null per una chiave inesistente", () => {
      expect(opsFor(docConDueNodiEUnArco()).rectOf("inesistente")).toBeNull()
    })

    it("rectOf con `at` usa la posizione data e non quella della view", () => {
      const ops = opsFor(docConDueNodiEUnArco())
      const key = ops.nodeKeys()[0]!
      const fermo = ops.rectOf(key)!
      const spostato = ops.rectOf(key, { x: fermo.x + 70, y: fermo.y })!
      expect(spostato.x).toBe(fermo.x + 70)
      expect(spostato.w).toBe(fermo.w)
    })

    it("edgesTouching trova l'arco da uno solo dei due estremi", () => {
      const ops = opsFor(docConDueNodiEUnArco())
      const [primo] = ops.nodeKeys()
      expect(ops.edgesTouching(new Set([primo!]))).toHaveLength(1)
    })

    it("edgesTouching non trova nulla per una chiave che non esiste", () => {
      expect(opsFor(docConDueNodiEUnArco()).edgesTouching(new Set(["inesistente"]))).toHaveLength(0)
    })

    it("addNode produce una chiave nuova e un recipe che la crea", () => {
      const doc = docConDueNodiEUnArco()
      const { key, recipe } = opsFor(doc).addNode({ x: 40, y: 40 })
      recipe(doc)
      expect(opsFor(doc).nodeKeys()).toContain(key)
    })

    it("addEdge collega due nodi esistenti", () => {
      const doc = docConDueNodiEUnArco()
      const ops = opsFor(doc)
      const [a, b] = ops.nodeKeys()
      const { recipe } = ops.addEdge(a!, b!)
      recipe(doc)
      expect(opsFor(doc).edgesTouching(new Set([a!]))).toHaveLength(2)
    })

    it("deleteItems torna null quando non c'è niente da cancellare", () => {
      expect(opsFor(docConDueNodiEUnArco()).deleteItems([], [])).toBeNull()
    })

    it("cancellare un nodo porta via gli archi che lo toccavano", () => {
      const doc = docConDueNodiEUnArco()
      const [a] = opsFor(doc).nodeKeys()
      opsFor(doc).deleteItems([a!], [])!(doc)
      const dopo = opsFor(doc)
      expect(dopo.nodeKeys()).toHaveLength(1)
      expect(dopo.edgesTouching(new Set(dopo.nodeKeys()))).toHaveLength(0)
    })

    it("duplicateNodes torna chiavi nuove e non tocca gli originali", () => {
      const doc = docConDueNodiEUnArco()
      const prima = opsFor(doc).nodeKeys()
      const { keys, recipe } = opsFor(doc).duplicateNodes([prima[0]!])
      recipe(doc)
      expect(keys).toHaveLength(1)
      expect(prima.every((k) => opsFor(doc).nodeKeys().includes(k))).toBe(true)
    })

    it("layoutGraph esclude i nodi senza view e gli archi con un estremo mancante", () => {
      const graph = opsFor(docConDueNodiEUnArco()).layoutGraph()
      expect(graph.nodes).toHaveLength(2)
      expect(graph.edges).toHaveLength(1)
      expect(graph.nodes.every((n) => n.w > 0 && n.h > 0)).toBe(true)
    })

    it("validate torna un array, vuoto o no, e mai undefined", () => {
      expect(Array.isArray(opsFor(docConDueNodiEUnArco()).validate())).toBe(true)
    })
  })
}

/** Documento ER con due entità e una relazione fra loro. Nomi inventati. */
function docEr(): DevDocument {
  const doc = createErDocument("prova")
  const d = doc.diagram
  const pk = { type: "int", primaryKey: true, foreignKey: false, nullable: false, unique: false }
  d.model.entities["cliente"] = { name: "cliente", attributes: [{ name: "id", ...pk }] }
  d.model.entities["ordine"] = {
    name: "ordine",
    attributes: [
      { name: "id", ...pk },
      { name: "cliente_id", type: "int", primaryKey: false, foreignKey: true, nullable: false, unique: false },
    ],
  }
  d.model.relationships["ordine_cliente"] = {
    source: { entity: "ordine", attributes: ["cliente_id"], cardinality: "many" },
    target: { entity: "cliente", attributes: ["id"], cardinality: "one" },
    identifying: false,
  }
  d.view.nodes["cliente"] = { x: 0, y: 0, collapsed: false }
  d.view.nodes["ordine"] = { x: 200, y: 0, collapsed: false }
  return doc
}

verificaContrattoOps("er", docEr)
