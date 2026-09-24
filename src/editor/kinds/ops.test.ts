import { produce } from "immer"
import { describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import type { Family } from "@/model/family"
import { familyOps } from "./ops"

/** Contratto che ogni famiglia deve rispettare: le `DiagramOps` della famiglia data, sul documento
 *  che la funzione costruisce con due nodi e un arco in quella famiglia. */
export function verificaContrattoOps(family: Family, docConDueNodiEUnArco: () => DevDocument) {
  describe(`DiagramOps: ${family}`, () => {
    it("nodeKeys elenca solo i nodi presenti nella view", () => {
      const ops = familyOps(docConDueNodiEUnArco(), family)
      expect(ops.nodeKeys().sort()).toHaveLength(2)
    })

    it("rectOf torna null per una chiave inesistente", () => {
      expect(familyOps(docConDueNodiEUnArco(), family).rectOf("inesistente")).toBeNull()
    })

    it("rectOf con `at` usa la posizione data e non quella della view", () => {
      const ops = familyOps(docConDueNodiEUnArco(), family)
      const key = ops.nodeKeys()[0]!
      const fermo = ops.rectOf(key)!
      const spostato = ops.rectOf(key, { x: fermo.x + 70, y: fermo.y })!
      expect(spostato.x).toBe(fermo.x + 70)
      expect(spostato.w).toBe(fermo.w)
    })

    it("edgesTouching trova l'arco da uno solo dei due estremi", () => {
      const ops = familyOps(docConDueNodiEUnArco(), family)
      const [primo] = ops.nodeKeys()
      expect(ops.edgesTouching(new Set([primo!]))).toHaveLength(1)
    })

    it("edgesTouching non trova nulla per una chiave che non esiste", () => {
      expect(familyOps(docConDueNodiEUnArco(), family).edgesTouching(new Set(["inesistente"]))).toHaveLength(0)
    })

    it("edgeGeometry torna null per una chiave d'arco inesistente, un d non vuoto per una valida", () => {
      const ops = familyOps(docConDueNodiEUnArco(), family)
      const [a] = ops.nodeKeys()
      const [arco] = ops.edgesTouching(new Set([a!]))
      const rectA = ops.rectOf(arco!.source)!
      const rectB = ops.rectOf(arco!.target)!
      expect(ops.edgeGeometry("inesistente", rectA, rectB)).toBeNull()
      const geo = ops.edgeGeometry(arco!.key, rectA, rectB)
      expect(geo).not.toBeNull()
      expect(geo!.d.length).toBeGreaterThan(0)
    })

    it("addNode produce una chiave nuova e un recipe che la crea", () => {
      const doc = docConDueNodiEUnArco()
      const { key, recipe } = familyOps(doc, family).addNode({ x: 40, y: 40 })
      recipe(doc)
      expect(familyOps(doc, family).nodeKeys()).toContain(key)
    })

    it("addEdge collega due nodi esistenti", () => {
      const doc = docConDueNodiEUnArco()
      const ops = familyOps(doc, family)
      const [a, b] = ops.nodeKeys()
      // Non-null: né `a` né `b` sono note in questo documento, quindi `addEdge` non torna mai null qui.
      const { recipe } = ops.addEdge(a!, b!)!
      recipe(doc)
      expect(familyOps(doc, family).edgesTouching(new Set([a!]))).toHaveLength(2)
    })

    it("deleteItems torna null quando non c'è niente da cancellare", () => {
      expect(familyOps(docConDueNodiEUnArco(), family).deleteItems([], [])).toBeNull()
    })

    it("cancellare un nodo porta via gli archi che lo toccavano", () => {
      const doc = docConDueNodiEUnArco()
      const [a] = familyOps(doc, family).nodeKeys()
      familyOps(doc, family).deleteItems([a!], [])!(doc)
      const dopo = familyOps(doc, family)
      expect(dopo.nodeKeys()).toHaveLength(1)
      expect(dopo.edgesTouching(new Set(dopo.nodeKeys()))).toHaveLength(0)
    })

    it("duplicateNodes torna chiavi nuove e non tocca gli originali", () => {
      const doc = docConDueNodiEUnArco()
      const prima = familyOps(doc, family).nodeKeys()
      const { keys, recipe } = familyOps(doc, family).duplicateNodes([prima[0]!])
      recipe(doc)
      expect(keys).toHaveLength(1)
      expect(prima.every((k) => familyOps(doc, family).nodeKeys().includes(k))).toBe(true)
    })

    it("layoutGraph esclude i nodi senza view e gli archi con un estremo mancante", () => {
      const graph = familyOps(docConDueNodiEUnArco(), family).layoutGraph()
      expect(graph.nodes).toHaveLength(2)
      expect(graph.edges).toHaveLength(1)
      expect(graph.nodes.every((n) => n.w > 0 && n.h > 0)).toBe(true)
    })

    it("validate torna un array, vuoto o no, e mai undefined", () => {
      expect(Array.isArray(familyOps(docConDueNodiEUnArco(), family).validate())).toBe(true)
    })
  })
}

/** Documento ER con due entità e una relazione fra loro. Nomi inventati. */
function docEr(): DevDocument {
  const doc = createDocument("prova")
  const d = doc.diagram.er
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

/** Documento classe con due classi e una generalizzazione. Nomi inventati. */
function docClass(): DevDocument {
  const doc = createDocument("prova")
  doc.diagram.class.model.classes["Cliente"] = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
  doc.diagram.class.model.classes["Persona"] = { name: "Persona", stereotype: "abstract", attributes: [], methods: [] }
  doc.diagram.class.view.nodes["Cliente"] = { x: 0, y: 100, collapsed: false }
  doc.diagram.class.view.nodes["Persona"] = { x: 0, y: 0, collapsed: false }
  doc.diagram.class.model.relations["r1"] = {
    kind: "generalization",
    source: { class: "Cliente", multiplicity: "", role: "" },
    target: { class: "Persona", multiplicity: "", role: "" },
  }
  return doc
}

verificaContrattoOps("class", docClass)

describe("classOps e le note", () => {
  /** Documento con una classe e una nota, entrambe con una view. Nomi inventati. */
  function docConNota() {
    const doc = createDocument("Prova", "doc-1")
    doc.diagram.class.model.classes.Cliente = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }
    doc.diagram.class.view.nodes.Cliente = { x: 0, y: 0, collapsed: false }
    doc.diagram.class.model.notes["n-1"] = { text: "promemoria" }
    doc.diagram.class.view.nodes["n-1"] = { x: 300, y: 0, collapsed: false }
    return doc
  }

  it("nodeKeys elenca classi e note insieme: leggono entrambe da view.nodes", () => {
    expect(familyOps(docConNota(), "class").nodeKeys().sort()).toEqual(["Cliente", "n-1"])
  })

  it("rectOf risolve una chiave di nota, non solo una di classe", () => {
    const ops = familyOps(docConNota(), "class")
    expect(ops.rectOf("n-1")).not.toBeNull()
    expect(ops.rectOf("n-1")!.x).toBe(300)
    expect(ops.rectOf("assente")).toBeNull()
  })

  it("rectOf su una nota rispetta `at`, che serve all'anteprima del drag", () => {
    expect(familyOps(docConNota(), "class").rectOf("n-1", { x: 10, y: 20 })!.x).toBe(10)
  })

  it("edgesTouching non trova niente per una nota: non ha archi", () => {
    expect(familyOps(docConNota(), "class").edgesTouching(new Set(["n-1"]))).toEqual([])
  })

  it("addNode con la variante \"note\" produce una chiave nuova e un recipe che la crea", () => {
    const doc = docConNota()
    const { key, recipe, edit } = familyOps(doc, "class").addNode({ x: 40, y: 40 }, "note")
    recipe(doc)
    const ops = familyOps(doc, "class")
    expect(ops.nodeKeys()).toContain(key)
    expect(doc.diagram.class.model.notes[key]).toBeDefined()
    expect(edit).toBe("body")
  })

  it("layoutGraph include la nota libera insieme alla classe", () => {
    const g = familyOps(docConNota(), "class").layoutGraph()
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["Cliente", "n-1"])
  })

  it("addEdge ancora la nota alla classe in entrambi i sensi di trascinamento; nota→nota resta null", () => {
    // Nota + classe non è più un no-op (spec note ancorate §4): produce un `note-link`.
    // Resta senza effetto solo nota→nota, l'unico caso che continua a non avere senso.
    const doc = docConNota()
    const ops = familyOps(doc, "class")
    expect(ops.addEdge("n-1", "n-1")).toBeNull()

    const dallaNota = ops.addEdge("n-1", "Cliente")!
    dallaNota.recipe(doc)
    expect(doc.diagram.class.model.relations[dallaNota.key]).toMatchObject({ kind: "note-link" })

    const doc2 = docConNota()
    const dallaClasse = familyOps(doc2, "class").addEdge("Cliente", "n-1")!
    dallaClasse.recipe(doc2)
    expect(doc2.diagram.class.model.relations[dallaClasse.key]).toMatchObject({ kind: "note-link" })

    // Il caso classe→classe resta l'unico che produce un'associazione.
    const doc3 = docConNota()
    doc3.diagram.class.model.classes.Altra = { name: "Altra", stereotype: "class", attributes: [], methods: [] }
    doc3.diagram.class.view.nodes.Altra = { x: 500, y: 0, collapsed: false }
    const result = familyOps(doc3, "class").addEdge("Cliente", "Altra")
    expect(result).not.toBeNull()
  })

  it("deleteItems separa le chiavi di nota da quelle di classe: cancella entrambe", () => {
    const doc = docConNota()
    const recipe = familyOps(doc, "class").deleteItems(["Cliente", "n-1"], [])
    expect(recipe).not.toBeNull()
    recipe!(doc)
    expect(familyOps(doc, "class").nodeKeys()).toEqual([])
    // `nodeKeys` da sola non basterebbe: una divisione sbagliata (come la riga provvisoria
    // del Task 3) svuota comunque `view.nodes`, ma lascia la nota orfana in `model.notes`.
    expect(doc.diagram.class.model.notes["n-1"]).toBeUndefined()
    expect(doc.diagram.class.model.classes.Cliente).toBeUndefined()
  })
})

describe("classOps e gli stereotipi", () => {
  it.each([
    [undefined, "class"],
    ["interface", "interface"],
    ["enum", "enum"],
  ] as const)("addNode con variante %s crea una classe %s e apre l'editor del nome", (variant, stereotype) => {
    const doc = createDocument("Prova", "doc-1")
    const { key, recipe, edit } = familyOps(doc, "class").addNode({ x: 0, y: 0 }, variant)
    const next = produce(doc, recipe)
    expect(key).toBe(stereotype)
    expect(next.diagram.class.model.classes[key]?.stereotype).toBe(stereotype)
    expect(edit).toBe("name")
  })
})
