import { describe, expect, it } from "vitest"
import type { ClassDiagram } from "@/model/class/schema"
import { createDocument, type DevDocument, type Diagram } from "@/model/document"
import type { ErDiagram } from "@/model/er/schema"
import type { Family } from "@/model/family"
import type { FlowDiagram } from "@/model/flow/schema"
import { buildSvg, EXPORT_PADDING } from "./svg"

/** `buildSvg` vuole un documento intero: i fixture sotto sono la parte di una famiglia, e qui si
 *  mettono al loro posto in un documento nuovo, con le altre due parti vuote. */
function docOf<F extends Family>(family: F, part: Diagram[F]): DevDocument {
  const doc = createDocument("export", "export")
  return { ...doc, diagram: { ...doc.diagram, [family]: part } }
}

/** Diagramma minimo: due entità distanti, una relazione fra loro. */
function diagram(): ErDiagram {
  return {
    model: {
      entities: {
        utenti: { name: "utenti", attributes: [{ name: "id", type: "int", primaryKey: true, foreignKey: false, nullable: false, unique: false }] },
        ordini: { name: "ordini", attributes: [{ name: "utente_id", type: "int", primaryKey: false, nullable: false, unique: false, foreignKey: true }] },
      },
      relationships: {
        ordini_utenti: {
          source: { entity: "ordini", attributes: ["utente_id"], cardinality: "many" },
          target: { entity: "utenti", attributes: ["id"], cardinality: "one" },
          identifying: false,
        },
      },
    },
    view: {
      nodes: {
        utenti: { x: 100, y: 200, collapsed: false },
        ordini: { x: 500, y: 600, collapsed: false },
      },
    },
  } as ErDiagram
}

const vars = {
  "--background": "#ffffff",
  "--border": "#e4e4e7",
  "--card": "#ffffff",
  "--foreground": "#09090b",
  "--muted": "#f4f4f5",
  "--muted-foreground": "#71717a",
  "--primary": "#18181b",
  // Le doppie non sono un capriccio: è la forma in cui il CSS minificato restituisce il valore
  // in produzione, ed è quella che rompeva l'SVG infilata grezza in un attributo.
  "--font-mono": '"JetBrains Mono Variable", monospace',
}

describe("buildSvg", () => {
  it("inquadra tutte le entità con il padding, non il viewport", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    const [x, y, w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]

    // L'entità più in alto a sinistra è a (100, 200): il viewBox parte prima, del padding.
    expect(x).toBe(100 - EXPORT_PADDING)
    expect(y).toBe(200 - EXPORT_PADDING)
    // E arriva oltre l'angolo in basso a destra dell'entità più lontana.
    expect(x + w).toBeGreaterThan(500)
    expect(y + h).toBeGreaterThan(600)
  })

  it("due relazioni fra le stesse entità escono separate, come sul canvas", () => {
    // La geometria del fascio dipende da *tutte* le relazioni: l'export la ricalcola per conto suo
    // e deve arrivare alla stessa mappa, altrimenti il file scaricato mostrerebbe un diagramma
    // diverso da quello che l'utente ha davanti.
    const d = diagram()
    d.model.relationships["seconda"] = {
      source: { entity: "ordini", attributes: ["utente_id"], cardinality: "one" },
      target: { entity: "utenti", attributes: ["id"], cardinality: "one" },
      identifying: true,
    }
    const svg = buildSvg(docOf("er", d), { vars })!
    const lines = [...svg.matchAll(/data-edge-line="true" d="([^"]+)"/g)].map((m) => m[1])
    expect(lines).toHaveLength(2)
    expect(lines[0]).not.toBe(lines[1])
  })

  it("dichiara larghezza e altezza coerenti col viewBox", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    const [, , w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    expect(svg).toContain(`width="${w}"`)
    expect(svg).toContain(`height="${h}"`)
  })

  it("dipinge un fondo opaco che copre tutto il viewBox", () => {
    // Senza fondo il PNG esce trasparente, e il testo del tema chiaro è illeggibile
    // su una pagina scura: la scelta del tema chiaro perderebbe senso.
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    const [x, y, w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    const bg = /<rect data-background[^>]*>/.exec(svg)?.[0]
    expect(bg).toBeDefined()
    expect(bg).toContain(`x="${x}"`)
    expect(bg).toContain(`y="${y}"`)
    expect(bg).toContain(`width="${w}"`)
    expect(bg).toContain(`height="${h}"`)
    expect(bg).toContain(`fill="${vars["--background"]}"`)
  })

  it("risolve le variabili CSS in valori letterali", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    expect(svg).not.toContain("var(--")
    expect(svg).toContain("#ffffff")
    expect(svg).toContain("#e4e4e7")
  })

  it("non esporta griglia, overlay e riquadro di selezione", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    expect(svg).not.toContain("data-canvas")
    expect(svg).not.toContain("data-marquee")
    expect(svg).not.toContain("dd-grid")
  })

  it("non evidenzia nulla come selezionato", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    // Il bordo di selezione è --primary a spessore 2: nessuno dei due deve comparire sui nodi.
    expect(svg).not.toContain('stroke-width="2"')
    expect(svg).toContain(vars["--border"])
  })

  it("disegna entità e relazioni", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    expect(svg).toContain('data-node-id="er/utenti"')
    expect(svg).toContain('data-node-id="er/ordini"')
    expect(svg).toContain('data-edge-id="er/ordini_utenti"')
  })

  it("incorpora il font quando gli viene dato", () => {
    const fontFace = "@font-face{font-family:'JetBrains Mono Variable';src:url(data:font/woff2;base64,AAAA)}"
    const svg = buildSvg(docOf("er", diagram()), { vars, fontFace })!
    expect(svg).toContain(fontFace)
    expect(svg).toContain("<style>")
  })

  it("resta valido senza font, senza lasciare uno style vuoto a metà", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    expect(svg).not.toContain("@font-face")
    expect(svg).toContain("<svg")
  })

  it("dichiara il namespace SVG, altrimenti il file non si apre da solo", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it("sfugge le virgolette dei valori sostituiti, o l'SVG è malformato", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars })!
    expect(svg).toContain('font-family="&quot;JetBrains Mono Variable&quot;, monospace"')
    // Nessun attributo può contenere una doppia virgoletta grezza: chiuderebbe l'attributo e il
    // file non si aprirebbe né si rasterizzerebbe. Si controlla ogni valore fra virgolette.
    for (const [, value] of svg.matchAll(/="([^"]*)"/g)) expect(value).not.toContain('"')
    expect(svg).not.toMatch(/=""[^ >]/)
  })

  it("sfugge anche & e < in un valore, non solo le virgolette", () => {
    const svg = buildSvg(docOf("er", diagram()), { vars: { ...vars, "--card": 'a&b<c"d' } })!
    expect(svg).toContain('fill="a&amp;b&lt;c&quot;d"')
  })

  it("restituisce null su un diagramma senza entità: non c'è niente da esportare", () => {
    const empty = { model: { entities: {}, relationships: {} }, view: { nodes: {} } } as ErDiagram
    expect(buildSvg(docOf("er", empty), { vars })).toBeNull()
  })

  it("salta le relazioni con un estremo mancante invece di rompersi", () => {
    const d = diagram()
    d.model.relationships["rotta"] = {
      source: { entity: "ordini", attributes: [], cardinality: "many" },
      target: { entity: "inesistente", attributes: [], cardinality: "one" },
      identifying: false,
    }
    const svg = buildSvg(docOf("er", d), { vars })!
    expect(svg).toContain('data-edge-id="er/ordini_utenti"')
    expect(svg).not.toContain('data-edge-id="er/rotta"')
  })

  it("include un'entità collassata nei bounds con la sua altezza ridotta", () => {
    const d = diagram()
    d.view.nodes["ordini"]!.collapsed = true
    const collassato = buildSvg(docOf("er", d), { vars })!
    const aperto = buildSvg(docOf("er", diagram()), { vars })!
    const hOf = (svg: string) => Number(/viewBox="[^ ]+ [^ ]+ [^ ]+ ([^"]+)"/.exec(svg)![1])
    expect(hOf(collassato)).toBeLessThan(hOf(aperto))
  })
})

/** Diagramma minimo di classi: due classi distanti, una generalizzazione fra loro. Nomi inventati. */
function classDiagram(): ClassDiagram {
  return {
    model: {
      classes: {
        Cliente: {
          name: "Cliente",
          stereotype: "class",
          attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }],
          methods: [],
        },
        Persona: {
          name: "Persona",
          stereotype: "abstract",
          attributes: [{ name: "nome", type: "string", visibility: "protected", isStatic: false }],
          methods: [],
        },
      },
      relations: {
        cliente_persona: {
          kind: "generalization",
          source: { class: "Cliente", multiplicity: "", role: "" },
          target: { class: "Persona", multiplicity: "", role: "" },
        },
      },
    },
    view: {
      nodes: {
        Cliente: { x: 100, y: 200, collapsed: false },
        Persona: { x: 500, y: 600, collapsed: false },
      },
    },
  } as ClassDiagram
}

// Stessa batteria di `buildSvg` sopra, sul modello di classi: `buildClassSvg` non aveva nessun
// test prima di questo (i 18 casi ER erano gli unici), e un export rotto ci sarebbe passato
// attraverso senza che nessuno se ne accorgesse — la scena e2e delle classi non esporta immagini.
describe("buildSvg (class diagram)", () => {
  it("inquadra tutte le classi con il padding, non il viewport", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    const [x, y, w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    expect(x).toBe(100 - EXPORT_PADDING)
    expect(y).toBe(200 - EXPORT_PADDING)
    expect(x + w).toBeGreaterThan(500)
    expect(y + h).toBeGreaterThan(600)
  })

  it("due relazioni fra le stesse entità escono separate, come sul canvas", () => {
    // La geometria del fascio dipende da *tutte* le relazioni: l'export la ricalcola per conto suo
    // e deve arrivare alla stessa mappa, altrimenti il file scaricato mostrerebbe un diagramma
    // diverso da quello che l'utente ha davanti.
    const d = diagram()
    d.model.relationships["seconda"] = {
      source: { entity: "ordini", attributes: ["utente_id"], cardinality: "one" },
      target: { entity: "utenti", attributes: ["id"], cardinality: "one" },
      identifying: true,
    }
    const svg = buildSvg(docOf("er", d), { vars })!
    const lines = [...svg.matchAll(/data-edge-line="true" d="([^"]+)"/g)].map((m) => m[1])
    expect(lines).toHaveLength(2)
    expect(lines[0]).not.toBe(lines[1])
  })

  it("dichiara larghezza e altezza coerenti col viewBox", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    const [, , w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    expect(svg).toContain(`width="${w}"`)
    expect(svg).toContain(`height="${h}"`)
  })

  it("dipinge un fondo opaco che copre tutto il viewBox", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    const [x, y, w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    const bg = /<rect data-background[^>]*>/.exec(svg)?.[0]
    expect(bg).toBeDefined()
    expect(bg).toContain(`x="${x}"`)
    expect(bg).toContain(`y="${y}"`)
    expect(bg).toContain(`width="${w}"`)
    expect(bg).toContain(`height="${h}"`)
    expect(bg).toContain(`fill="${vars["--background"]}"`)
  })

  it("porta nell'export molteplicità e ruolo dei capi", () => {
    // L'export monta la stessa vista del canvas, ma è l'immagine che esce dall'app: se il ruolo
    // si vedesse solo a schermo e non qui, la perdita sarebbe silenziosa.
    const d = classDiagram()
    d.model.relations.cliente_persona!.source = { class: "Cliente", multiplicity: "0..*", role: "sottoposti" }
    const svg = buildSvg(docOf("class", d), { vars })!
    expect(svg).toContain(">0..* sottoposti<")
  })

  it("risolve le variabili CSS in valori letterali", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    expect(svg).not.toContain("var(--")
    expect(svg).toContain("#ffffff")
    expect(svg).toContain("#e4e4e7")
  })

  it("non esporta griglia, overlay e riquadro di selezione", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    expect(svg).not.toContain("data-canvas")
    expect(svg).not.toContain("data-marquee")
    expect(svg).not.toContain("dd-grid")
  })

  it("non evidenzia nulla come selezionato", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    expect(svg).not.toContain('stroke-width="2"')
    expect(svg).toContain(vars["--border"])
  })

  it("disegna classi e relazioni", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    expect(svg).toContain('data-node-id="class/Cliente"')
    expect(svg).toContain('data-node-id="class/Persona"')
    expect(svg).toContain('data-edge-id="class/cliente_persona"')
  })

  it("incorpora il font quando gli viene dato", () => {
    const fontFace = "@font-face{font-family:'JetBrains Mono Variable';src:url(data:font/woff2;base64,AAAA)}"
    const svg = buildSvg(docOf("class", classDiagram()), { vars, fontFace })!
    expect(svg).toContain(fontFace)
    expect(svg).toContain("<style>")
  })

  it("resta valido senza font, senza lasciare uno style vuoto a metà", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    expect(svg).not.toContain("@font-face")
    expect(svg).toContain("<svg")
  })

  it("dichiara il namespace SVG, altrimenti il file non si apre da solo", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it("sfugge le virgolette dei valori sostituiti, o l'SVG è malformato", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars })!
    expect(svg).toContain('font-family="&quot;JetBrains Mono Variable&quot;, monospace"')
    for (const [, value] of svg.matchAll(/="([^"]*)"/g)) expect(value).not.toContain('"')
    expect(svg).not.toMatch(/=""[^ >]/)
  })

  it("sfugge anche & e < in un valore, non solo le virgolette", () => {
    const svg = buildSvg(docOf("class", classDiagram()), { vars: { ...vars, "--card": 'a&b<c"d' } })!
    expect(svg).toContain('fill="a&amp;b&lt;c&quot;d"')
  })

  it("restituisce null su un diagramma senza classi: non c'è niente da esportare", () => {
    const empty = { model: { classes: {}, relations: {} }, view: { nodes: {} } } as ClassDiagram
    expect(buildSvg(docOf("class", empty), { vars })).toBeNull()
  })

  it("salta le relazioni con un estremo mancante invece di rompersi", () => {
    const d = classDiagram()
    d.model.relations["rotta"] = {
      kind: "association",
      source: { class: "Cliente", multiplicity: "", role: "" },
      target: { class: "inesistente", multiplicity: "", role: "" },
    }
    const svg = buildSvg(docOf("class", d), { vars })!
    expect(svg).toContain('data-edge-id="class/cliente_persona"')
    expect(svg).not.toContain('data-edge-id="class/rotta"')
  })

  it("include una classe collassata nei bounds con la sua altezza ridotta", () => {
    const d = classDiagram()
    d.view.nodes["Persona"]!.collapsed = true
    const collassato = buildSvg(docOf("class", d), { vars })!
    const aperto = buildSvg(docOf("class", classDiagram()), { vars })!
    const hOf = (svg: string) => Number(/viewBox="[^ ]+ [^ ]+ [^ ]+ ([^"]+)"/.exec(svg)![1])
    expect(hOf(collassato)).toBeLessThan(hOf(aperto))
  })

})

/**
 * Un pool «Processo» con due corsie: «Cliente» con un nodo, «Backoffice» **vuota** e più alta di
 * quanto un nodo giustificherebbe (440 contro i 160 minimi): una corsia vuota o più alta dei suoi
 * nodi non deve uscire tagliata dall'export.
 */
function flowDiagramWithPool(): FlowDiagram {
  return {
    model: {
      pools: { p1: { name: "Processo", lanes: [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Backoffice" }] } },
      nodes: { n1: { label: "Inizio", shape: "terminal", lane: "l1" } },
      edges: {},
    },
    view: {
      nodes: { n1: { x: 100, y: 20, collapsed: false } },
      pools: { p1: { x: 0, y: 0, w: 672 } },
      lanes: { l1: { h: 160 }, l2: { h: 440 } },
    },
  }
}

describe("buildSvg (flowchart)", () => {
  it("l'SVG di un flowchart contiene il pool, le corsie e i loro nomi", () => {
    const svg = buildSvg(docOf("flow", flowDiagramWithPool()), { vars, fontFace: "" })!
    expect(svg).toContain('data-layer="pools"')
    expect(svg).toContain("Processo")
    expect(svg).toContain("Cliente")
  })

  it("i pool stanno prima dei nodi nel documento, così restano sotto", () => {
    const svg = buildSvg(docOf("flow", flowDiagramWithPool()), { vars, fontFace: "" })!
    expect(svg.indexOf('data-layer="pools"')).toBeLessThan(svg.indexOf('data-layer="nodes"'))
  })

  it("la larghezza delle bande nell'export è quella salvata nel pool, meno la striscia", () => {
    const svg = buildSvg(docOf("flow", flowDiagramWithPool()), { vars, fontFace: "" })!
    expect(svg).toContain('width="640"')
  })

  it("una corsia vuota o più alta dei suoi nodi non esce tagliata dal viewBox", () => {
    const svg = buildSvg(docOf("flow", flowDiagramWithPool()), { vars, fontFace: "" })!
    const [, y, , h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    expect(y + h).toBeGreaterThanOrEqual(160 + 440)
  })

  it("un pool senza nodi si esporta: è contenuto", () => {
    const d = flowDiagramWithPool()
    d.model.nodes = {}
    d.view.nodes = {}
    expect(buildSvg(docOf("flow", d), { vars, fontFace: "" })).not.toBeNull()
  })

  it("un documento nuovo non ha niente da esportare", () => {
    expect(buildSvg(createDocument("vuoto", "vuoto"), { vars })).toBeNull()
  })
})

describe("collegamenti nell'export", () => {
  /** Il diagramma ER di prova, una classe `Ordine` e un collegamento verso `ordini`. */
  function conCollegamento(target = "er/ordini"): DevDocument {
    const doc = docOf("er", diagram())
    return {
      ...doc,
      diagram: {
        ...doc.diagram,
        class: {
          model: { classes: { Ordine: { name: "Ordine", stereotype: "class", attributes: [], methods: [] } }, relations: {} },
          view: { nodes: { Ordine: { x: 900, y: 200, collapsed: false } } },
        },
        links: { l1: { kind: "maps-to", source: "class/Ordine", target } },
      },
    }
  }

  it("i collegamenti stanno fra gli archi di famiglia e i nodi", () => {
    const svg = buildSvg(conCollegamento(), { vars })!
    const edges = svg.indexOf('data-layer="edges"')
    const links = svg.indexOf('data-layer="links"')
    const nodes = svg.indexOf('data-layer="nodes"')
    expect(edges).toBeGreaterThan(-1)
    expect(links).toBeGreaterThan(edges)
    expect(nodes).toBeGreaterThan(links)
    expect(svg).toContain('data-edge-id="link/l1"')
  })

  it("un collegamento pendente non si disegna", () => {
    expect(buildSvg(conCollegamento("er/fantasma"), { vars })!).not.toContain('data-edge-id="link/l1"')
  })
})

describe("buildSvg e le note", () => {
  it("esporta la nota e la sua linea verso l'entità", () => {
    const doc = createDocument("export", "export")
    doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: [] }
    doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
    doc.diagram.note.model.notes["n1"] = { text: "da rivedere", anchor: "er/ordini" }
    doc.diagram.note.view.nodes["n1"] = { x: 400, y: 0, collapsed: false }
    const svg = buildSvg(doc, { vars })!
    expect(svg).toContain('data-node-id="note/n1"')
    expect(svg).toContain(">da rivedere<")
    expect(svg).toContain('data-edge-id="note/n1"')
  })

  it("un'àncora pendente non disegna la linea, ma la nota sì", () => {
    const doc = createDocument("export", "export")
    doc.diagram.note.model.notes["n1"] = { text: "sola", anchor: "er/fantasma" }
    doc.diagram.note.view.nodes["n1"] = { x: 0, y: 0, collapsed: false }
    const svg = buildSvg(doc, { vars })!
    expect(svg).toContain('data-node-id="note/n1"')
    expect(svg).not.toContain('data-edge-id="note/n1"')
  })
})

describe("buildSvg e le forme (spec 3b)", () => {
  it("le forme escono sotto tutto, prima di archi e nodi delle altre famiglie; un testo vuoto non esce e non allarga il file", () => {
    const doc = docOf("er", diagram())
    doc.diagram.shape.model.shapes = { z: { kind: "rect", label: "zona" }, t: { kind: "text", label: "" } }
    doc.diagram.shape.view.nodes = {
      z: { x: 0, y: 0, collapsed: false, w: 800, h: 800 },
      t: { x: 5000, y: 5000, collapsed: false, w: null, h: null },
    }
    const svg = buildSvg(doc, { vars: {} })!
    const zona = svg.indexOf('data-node-id="shape/z"')
    expect(zona).toBeGreaterThan(-1)
    expect(zona).toBeLessThan(svg.indexOf('data-layer="edges"'))
    expect(zona).toBeLessThan(svg.indexOf('data-node-id="er/utenti"'))
    expect(svg).not.toContain('data-node-id="shape/t"')
    // Il testo vuoto a (5000, 5000) non conta nei limiti: il file finisce ben prima.
    const width = Number(/width="([\d.]+)"/.exec(svg)![1])
    expect(width).toBeLessThan(5000)
  })
})
