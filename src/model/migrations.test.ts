import { describe, expect, it } from "vitest"
import { createDocument } from "./document"
import { LANE_MARGIN, POOL_HEADER_W, POOL_MIN_W } from "./flow/schema"
import { migrateDocument } from "./migrations"
import { parseDocument, toJson } from "./serialize"

describe("migrazione 1 → 2", () => {
  const v1Class = {
    schemaVersion: 1,
    id: "a",
    name: "Prova",
    diagram: { type: "class", model: { classes: {}, relations: {} }, view: { nodes: {} } },
  }
  const v1Er = {
    schemaVersion: 1,
    id: "b",
    name: "Prova",
    diagram: { type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } },
  }

  // Le migrazioni si concatenano: un v1 arriva alla versione corrente passando anche dalla 2 → 3,
  // quindi il diagramma di classi migrato si legge nella sua parte, `diagram.class`.
  it("un diagramma di classi v1 arriva alla versione corrente con le note nella loro famiglia, vuote", () => {
    const out = migrateDocument(v1Class)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(7)
    expect((doc.diagram as { note: unknown }).note).toEqual({ model: { notes: {} }, view: { nodes: {} } })
    expect((doc.diagram as { class: { model: Record<string, unknown> } }).class.model).toEqual({ classes: {}, relations: {} })
  })

  it("non tocca il modello di un ER, che non ha notes nel suo schema", () => {
    const out = migrateDocument(v1Er)
    expect(out.ok).toBe(true)
    const doc = (out as { ok: true; value: Record<string, unknown> }).value
    expect(doc.schemaVersion).toBe(7)
    expect((doc.diagram as { er: { model: Record<string, unknown> } }).er.model).toEqual({ entities: {}, relationships: {} })
  })

  it("non muta l'input: le migrazioni copiano, non scrivono sull'originale", () => {
    const before = structuredClone(v1Class)
    migrateDocument(v1Class)
    expect(v1Class).toEqual(before)
  })

  it("un documento già alla versione corrente (7) passa senza toccare niente", () => {
    const v3 = createDocument("Prova", "a")
    expect(migrateDocument(v3)).toEqual({ ok: true, value: v3 })
  })
})

/** Un documento v2 com'era su disco: un tipo solo. */
const v2 = (diagram: unknown) => JSON.stringify({ schemaVersion: 2, id: "d1", name: "vecchio", diagram })

describe("migrazione 2 → 3", () => {
  it("un ER v2 diventa la parte er, con le altre due vuote", () => {
    const r = parseDocument(v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(7)
    expect(r.document.diagram.class.model.classes).toEqual({})
    expect(r.document.diagram.flow.model.pools).toEqual({})
  })

  it("un class diagram v2 conserva le sue classi", () => {
    const cls = { name: "Ordine", stereotype: "class", attributes: [], methods: [] }
    const r = parseDocument(v2({ type: "class", model: { classes: { Ordine: cls }, relations: {}, notes: {} }, view: { nodes: { Ordine: { x: 0, y: 0, collapsed: false } } } }))
    expect(r.ok && Object.keys(r.document.diagram.class.model.classes)).toEqual(["Ordine"])
  })

  it("un flowchart v2 conserva corsie e nodi", () => {
    const flow = {
      type: "flow",
      model: { lanes: [{ id: "l1", name: "A" }], nodes: { n1: { label: "x", shape: "process", lane: "l1" } }, edges: {} },
      view: { nodes: { n1: { x: 0, y: 0, collapsed: false } }, lanes: { l1: { y: 0, h: 160 } } },
    }
    const r = parseDocument(v2(flow))
    expect(r.ok && r.document.diagram.flow.model.pools["pool-1"]!.lanes.map((l) => l.name)).toEqual(["A"])
    expect(r.ok && Object.keys(r.document.diagram.er.model.entities)).toEqual([])
  })

  it("la migrazione è pura: due esecuzioni danno lo stesso documento", () => {
    const text = v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } })
    expect(parseDocument(text)).toEqual(parseDocument(text))
  })
})

/** Un documento v3 com'era su disco: le tre famiglie, senza la parte dei collegamenti. */
function v3Text(): string {
  const doc = JSON.parse(toJson(createDocument("Prova", "v3doc"))) as { schemaVersion: number; diagram: Record<string, unknown> }
  delete doc.diagram.links
  return JSON.stringify({ ...doc, schemaVersion: 3 })
}

describe("migrazione 3 → 4", () => {
  it("un documento v3 prende la parte dei collegamenti, vuota", () => {
    const r = parseDocument(v3Text())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(7)
    expect(r.document.diagram.links).toEqual({})
  })

  it("un documento v2 arriva alla 7 passando dalla 3", () => {
    const r = parseDocument(v2({ type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } }))
    expect(r.ok && r.document.diagram.links).toEqual({})
  })
})

describe("migrazione 4 → 5", () => {
  it("un documento v4 con un «mappa su» passa intatto, alla versione 7", () => {
    const doc = JSON.parse(toJson(createDocument("Prova", "v4doc"))) as { schemaVersion: number; diagram: { links: Record<string, unknown> } }
    doc.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
    const r = parseDocument(JSON.stringify({ ...doc, schemaVersion: 4 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(7)
    expect(r.document.diagram.links).toEqual({ l1: { kind: "maps-to", source: "class/Ordine", target: "er/ordini" } })
  })
})

describe("migrazione 5 → 6", () => {
  /** Un documento v5 con la parte di flusso data. */
  function v5(flow: unknown): string {
    const doc = JSON.parse(toJson(createDocument("Prova", "v5doc"))) as { diagram: Record<string, unknown> }
    return JSON.stringify({ ...doc, schemaVersion: 5, diagram: { ...doc.diagram, flow } })
  }
  const lanes = [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Negozio" }]
  const bands = { l1: { y: 0, h: 160 }, l2: { y: 160, h: 240 } }

  it("un flusso senza nodi perde le corsie, e non nasce nessun pool", () => {
    const r = parseDocument(v5({ model: { lanes, nodes: {}, edges: {} }, view: { nodes: {}, lanes: bands } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.schemaVersion).toBe(7)
    expect(r.document.diagram.flow.model.pools).toEqual({})
    expect(r.document.diagram.flow.view.pools).toEqual({})
    expect(r.document.diagram.flow.view.lanes).toEqual({})
  })

  it("un flusso con nodi mette le corsie in «Pool 1», con le stesse altezze, e i nodi restano dove sono", () => {
    const nodes = { n1: { label: "Ordina", shape: "process", lane: "l1" }, n2: { label: "Spedisce", shape: "process", lane: "l2" } }
    const views = { n1: { x: 100, y: 20, collapsed: false }, n2: { x: 400, y: 200, collapsed: false } }
    const r = parseDocument(v5({ model: { lanes, nodes, edges: {} }, view: { nodes: views, lanes: bands } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const flow = r.document.diagram.flow
    expect(flow.model.pools).toEqual({ "pool-1": { name: "Pool 1", lanes } })
    expect(flow.view.lanes).toEqual({ l1: { h: 160 }, l2: { h: 240 } })
    expect(flow.model.nodes).toEqual(nodes)
    expect(flow.view.nodes).toEqual(views)
    // Ingombro dei nodi 100–490 («Spedisce» è largo 90): più 40 per lato fa 470, sotto il minimo di
    // 640. Il corpo delle bande resta dov'era, la striscia si aggiunge a sinistra.
    expect(flow.view.pools["pool-1"]).toEqual({ x: 100 - LANE_MARGIN - POOL_HEADER_W, y: 0, w: POOL_MIN_W + POOL_HEADER_W })
  })

  it("un pool e un nodo libero tornano uguali dal file", () => {
    // Review Focus 5.
    const doc = createDocument("t", "t")
    doc.diagram.flow.model.pools["p1"] = { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] }
    doc.diagram.flow.view.pools["p1"] = { x: 10, y: 20, w: 700 }
    doc.diagram.flow.view.lanes["l1"] = { h: 200 }
    doc.diagram.flow.model.nodes["n1"] = { label: "libero", shape: "process", lane: null }
    doc.diagram.flow.view.nodes["n1"] = { x: 900, y: 0, collapsed: false }
    const r = parseDocument(toJson(doc))
    expect(r.ok && r.document.diagram.flow).toEqual(doc.diagram.flow)
  })

  it("un nodo senza label non fa esplodere la migrazione: il file è segnalato non valido, non lanciato", () => {
    const nodes = { n1: { shape: "process", lane: "l1" } }
    const views = { n1: { x: 0, y: 0, collapsed: false } }
    expect(() => parseDocument(v5({ model: { lanes, nodes, edges: {} }, view: { nodes: views, lanes: bands } }))).not.toThrow()
    const r = parseDocument(v5({ model: { lanes, nodes, edges: {} }, view: { nodes: views, lanes: bands } }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain("migrazione dalla versione 5 fallita")
  })
})

describe("migrazione 6 → 7", () => {
  /** Un documento v6 con le parti di classe e di flusso date, senza la parte delle note. */
  function v6(parts: { class?: unknown; flow?: unknown }): string {
    const doc = JSON.parse(toJson(createDocument("Prova", "v6doc"))) as { diagram: Record<string, unknown> }
    delete doc.diagram.note
    return JSON.stringify({ ...doc, schemaVersion: 6, diagram: { ...doc.diagram, ...parts } })
  }
  const at = (x: number, y: number) => ({ x, y, collapsed: false })
  const end = (c: string) => ({ class: c, multiplicity: "", role: "" })
  const ordine = { name: "Ordine", stereotype: "class", attributes: [], methods: [] }
  const flow = (nodes: Record<string, unknown>, edges: Record<string, unknown>, views: Record<string, unknown>, pools: Record<string, unknown> = {}, poolViews: Record<string, unknown> = {}, lanes: Record<string, unknown> = {}) => ({
    model: { pools, nodes, edges },
    view: { nodes: views, pools: poolViews, lanes },
  })

  it("una nota di classe ancorata diventa una nota con l'àncora, e il note-link sparisce", () => {
    const r = parseDocument(v6({
      class: {
        model: {
          classes: { Ordine: ordine },
          relations: { r1: { kind: "note-link", source: end("n1"), target: end("Ordine") } },
          notes: { n1: { text: "da rivedere" }, n2: { text: "legenda" } },
        },
        view: { nodes: { Ordine: at(0, 0), n1: at(300, 0), n2: at(300, 200) } },
      },
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { class: cls, note } = r.document.diagram
    expect(note.model.notes).toEqual({ n1: { text: "da rivedere", anchor: "class/Ordine" }, n2: { text: "legenda", anchor: null } })
    expect(note.view.nodes).toEqual({ n1: at(300, 0), n2: at(300, 200) })
    expect(cls.model.relations).toEqual({})
    expect(cls.view.nodes).toEqual({ Ordine: at(0, 0) })
  })

  it("con due note-link per la stessa nota vale il primo in ordine di chiave", () => {
    const r = parseDocument(v6({
      class: {
        model: {
          classes: { Ordine: ordine, Riga: { ...ordine, name: "Riga" } },
          relations: {
            b: { kind: "note-link", source: end("n1"), target: end("Riga") },
            a: { kind: "note-link", source: end("n1"), target: end("Ordine") },
          },
          notes: { n1: { text: "" } },
        },
        view: { nodes: { Ordine: at(0, 0), Riga: at(300, 0), n1: at(0, 300) } },
      },
    }))
    expect(r.ok && r.document.diagram.note.model.notes["n1"]!.anchor).toBe("class/Ordine")
  })

  it("una nota di flusso prende l'àncora dal primo arco, e gli archi che la toccano spariscono", () => {
    const r = parseDocument(v6({
      flow: flow(
        {
          a: { label: "Ordina", shape: "process", lane: null },
          b: { label: "Spedisce", shape: "process", lane: null },
          f: { label: "promemoria", shape: "note", lane: null },
        },
        {
          e2: { source: "f", target: "b", label: "" },
          e1: { source: "a", target: "f", label: "" },
          e3: { source: "a", target: "b", label: "" },
        },
        { a: at(0, 0), b: at(300, 0), f: at(0, 200) },
      ),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { flow: part, note } = r.document.diagram
    expect(note.model.notes).toEqual({ f: { text: "promemoria", anchor: "flow/a" } })
    expect(note.view.nodes).toEqual({ f: at(0, 200) })
    expect(Object.keys(part.model.nodes).sort()).toEqual(["a", "b"])
    expect(part.model.edges).toEqual({ e3: { source: "a", target: "b", label: "" } })
    expect(part.view.nodes).toEqual({ a: at(0, 0), b: at(300, 0) })
  })

  it("una nota di flusso senza archi, o collegata solo a un'altra nota, resta libera", () => {
    const r = parseDocument(v6({
      flow: flow(
        { f: { label: "uno", shape: "note", lane: null }, g: { label: "due", shape: "note", lane: null } },
        { e1: { source: "f", target: "g", label: "" } },
        { f: at(0, 0), g: at(300, 0) },
      ),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.diagram.note.model.notes).toEqual({ f: { text: "uno", anchor: null }, g: { text: "due", anchor: null } })
    expect(r.document.diagram.flow.model.edges).toEqual({})
  })

  it("una nota di flusso in una corsia si ancora al nodo nel pool, e il pool resta valido", () => {
    // Review Focus 5. Un secondo nodo `b` e un arco vero `e2: a → b` (F7 della review finale dello
    // step 3a): l'arco della nota (`e1`) sparisce con la migrazione, l'altro resta.
    const r = parseDocument(v6({
      flow: flow(
        {
          a: { label: "Ordina", shape: "process", lane: "l1" },
          b: { label: "Spedisci", shape: "process", lane: "l1" },
          f: { label: "attenzione", shape: "note", lane: "l1" },
        },
        { e1: { source: "f", target: "a", label: "" }, e2: { source: "a", target: "b", label: "" } },
        { a: at(100, 20), b: at(500, 20), f: at(300, 20) },
        { p1: { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] } },
        { p1: { x: -32, y: 0, w: 672 } },
        { l1: { h: 160 } },
      ),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.diagram.note.model.notes).toEqual({ f: { text: "attenzione", anchor: "flow/a" } })
    expect(r.document.diagram.flow.model.pools["p1"]).toEqual({ name: "Processo", lanes: [{ id: "l1", name: "Cliente" }] })
    expect(r.document.diagram.flow.model.nodes).toEqual({
      a: { label: "Ordina", shape: "process", lane: "l1" },
      b: { label: "Spedisci", shape: "process", lane: "l1" },
    })
    expect(r.document.diagram.flow.model.edges).toEqual({ e2: { source: "a", target: "b", label: "" } })
  })

  it("una nota di flusso con lo stesso id di una nota di classe prende un suffisso", () => {
    const r = parseDocument(v6({
      class: { model: { classes: {}, relations: {}, notes: { x: { text: "di classe" } } }, view: { nodes: { x: at(0, 0) } } },
      flow: flow({ x: { label: "di flusso", shape: "note", lane: null } }, {}, { x: at(0, 300) }),
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.document.diagram.note.model.notes).toEqual({ x: { text: "di classe", anchor: null }, x_2: { text: "di flusso", anchor: null } })
    expect(r.document.diagram.note.view.nodes).toEqual({ x: at(0, 0), x_2: at(0, 300) })
  })

  it("un documento v7 con una nota ancorata e una libera torna uguale dal file", () => {
    const doc = createDocument("t", "t")
    doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
    doc.diagram.er.view.nodes["ordini"] = at(0, 0)
    doc.diagram.note.model.notes["a"] = { text: "ancorata", anchor: "er/ordini" }
    doc.diagram.note.view.nodes["a"] = at(300, 0)
    doc.diagram.note.model.notes["l"] = { text: "libera", anchor: null }
    doc.diagram.note.view.nodes["l"] = at(300, 200)
    const r = parseDocument(toJson(doc))
    expect(r.ok && r.document.diagram.note).toEqual(doc.diagram.note)
  })
})
