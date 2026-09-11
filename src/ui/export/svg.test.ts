import { describe, expect, it } from "vitest"
import type { ClassDiagram } from "@/model/class/schema"
import type { ErDiagram } from "@/model/er/schema"
import { buildSvg, EXPORT_PADDING } from "./svg"

/** Diagramma minimo: due entità distanti, una relazione fra loro. */
function diagram(): ErDiagram {
  return {
    type: "er",
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
    const svg = buildSvg(diagram(), { vars })!
    const [x, y, w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]

    // L'entità più in alto a sinistra è a (100, 200): il viewBox parte prima, del padding.
    expect(x).toBe(100 - EXPORT_PADDING)
    expect(y).toBe(200 - EXPORT_PADDING)
    // E arriva oltre l'angolo in basso a destra dell'entità più lontana.
    expect(x + w).toBeGreaterThan(500)
    expect(y + h).toBeGreaterThan(600)
  })

  it("dichiara larghezza e altezza coerenti col viewBox", () => {
    const svg = buildSvg(diagram(), { vars })!
    const [, , w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    expect(svg).toContain(`width="${w}"`)
    expect(svg).toContain(`height="${h}"`)
  })

  it("dipinge un fondo opaco che copre tutto il viewBox", () => {
    // Senza fondo il PNG esce trasparente, e il testo del tema chiaro è illeggibile
    // su una pagina scura: la scelta del tema chiaro perderebbe senso.
    const svg = buildSvg(diagram(), { vars })!
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
    const svg = buildSvg(diagram(), { vars })!
    expect(svg).not.toContain("var(--")
    expect(svg).toContain("#ffffff")
    expect(svg).toContain("#e4e4e7")
  })

  it("non esporta griglia, overlay e riquadro di selezione", () => {
    const svg = buildSvg(diagram(), { vars })!
    expect(svg).not.toContain("data-canvas")
    expect(svg).not.toContain("data-marquee")
    expect(svg).not.toContain("dd-grid")
  })

  it("non evidenzia nulla come selezionato", () => {
    const svg = buildSvg(diagram(), { vars })!
    // Il bordo di selezione è --primary a spessore 2: nessuno dei due deve comparire sui nodi.
    expect(svg).not.toContain('stroke-width="2"')
    expect(svg).toContain(vars["--border"])
  })

  it("disegna entità e relazioni", () => {
    const svg = buildSvg(diagram(), { vars })!
    expect(svg).toContain('data-node-id="utenti"')
    expect(svg).toContain('data-node-id="ordini"')
    expect(svg).toContain('data-edge-id="ordini_utenti"')
  })

  it("incorpora il font quando gli viene dato", () => {
    const fontFace = "@font-face{font-family:'JetBrains Mono Variable';src:url(data:font/woff2;base64,AAAA)}"
    const svg = buildSvg(diagram(), { vars, fontFace })!
    expect(svg).toContain(fontFace)
    expect(svg).toContain("<style>")
  })

  it("resta valido senza font, senza lasciare uno style vuoto a metà", () => {
    const svg = buildSvg(diagram(), { vars })!
    expect(svg).not.toContain("@font-face")
    expect(svg).toContain("<svg")
  })

  it("dichiara il namespace SVG, altrimenti il file non si apre da solo", () => {
    const svg = buildSvg(diagram(), { vars })!
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it("sfugge le virgolette dei valori sostituiti, o l'SVG è malformato", () => {
    const svg = buildSvg(diagram(), { vars })!
    expect(svg).toContain('font-family="&quot;JetBrains Mono Variable&quot;, monospace"')
    // Nessun attributo può contenere una doppia virgoletta grezza: chiuderebbe l'attributo e il
    // file non si aprirebbe né si rasterizzerebbe. Si controlla ogni valore fra virgolette.
    for (const [, value] of svg.matchAll(/="([^"]*)"/g)) expect(value).not.toContain('"')
    expect(svg).not.toMatch(/=""[^ >]/)
  })

  it("sfugge anche & e < in un valore, non solo le virgolette", () => {
    const svg = buildSvg(diagram(), { vars: { ...vars, "--card": 'a&b<c"d' } })!
    expect(svg).toContain('fill="a&amp;b&lt;c&quot;d"')
  })

  it("restituisce null su un diagramma senza entità: non c'è niente da esportare", () => {
    const empty = { type: "er", model: { entities: {}, relationships: {} }, view: { nodes: {} } } as ErDiagram
    expect(buildSvg(empty, { vars })).toBeNull()
  })

  it("salta le relazioni con un estremo mancante invece di rompersi", () => {
    const d = diagram()
    d.model.relationships["rotta"] = {
      source: { entity: "ordini", attributes: [], cardinality: "many" },
      target: { entity: "inesistente", attributes: [], cardinality: "one" },
      identifying: false,
    }
    const svg = buildSvg(d, { vars })!
    expect(svg).toContain('data-edge-id="ordini_utenti"')
    expect(svg).not.toContain('data-edge-id="rotta"')
  })

  it("include un'entità collassata nei bounds con la sua altezza ridotta", () => {
    const d = diagram()
    d.view.nodes["ordini"]!.collapsed = true
    const collassato = buildSvg(d, { vars })!
    const aperto = buildSvg(diagram(), { vars })!
    const hOf = (svg: string) => Number(/viewBox="[^ ]+ [^ ]+ [^ ]+ ([^"]+)"/.exec(svg)![1])
    expect(hOf(collassato)).toBeLessThan(hOf(aperto))
  })
})

/** Diagramma minimo di classi: due classi distanti, una generalizzazione fra loro. Nomi inventati. */
function classDiagram(): ClassDiagram {
  return {
    type: "class",
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
      notes: {},
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
    const svg = buildSvg(classDiagram(), { vars })!
    const [x, y, w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    expect(x).toBe(100 - EXPORT_PADDING)
    expect(y).toBe(200 - EXPORT_PADDING)
    expect(x + w).toBeGreaterThan(500)
    expect(y + h).toBeGreaterThan(600)
  })

  it("dichiara larghezza e altezza coerenti col viewBox", () => {
    const svg = buildSvg(classDiagram(), { vars })!
    const [, , w, h] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [number, number, number, number]
    expect(svg).toContain(`width="${w}"`)
    expect(svg).toContain(`height="${h}"`)
  })

  it("dipinge un fondo opaco che copre tutto il viewBox", () => {
    const svg = buildSvg(classDiagram(), { vars })!
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
    const svg = buildSvg(d, { vars })!
    expect(svg).toContain(">0..* sottoposti<")
  })

  it("risolve le variabili CSS in valori letterali", () => {
    const svg = buildSvg(classDiagram(), { vars })!
    expect(svg).not.toContain("var(--")
    expect(svg).toContain("#ffffff")
    expect(svg).toContain("#e4e4e7")
  })

  it("non esporta griglia, overlay e riquadro di selezione", () => {
    const svg = buildSvg(classDiagram(), { vars })!
    expect(svg).not.toContain("data-canvas")
    expect(svg).not.toContain("data-marquee")
    expect(svg).not.toContain("dd-grid")
  })

  it("non evidenzia nulla come selezionato", () => {
    const svg = buildSvg(classDiagram(), { vars })!
    expect(svg).not.toContain('stroke-width="2"')
    expect(svg).toContain(vars["--border"])
  })

  it("disegna classi e relazioni", () => {
    const svg = buildSvg(classDiagram(), { vars })!
    expect(svg).toContain('data-node-id="Cliente"')
    expect(svg).toContain('data-node-id="Persona"')
    expect(svg).toContain('data-edge-id="cliente_persona"')
  })

  it("incorpora il font quando gli viene dato", () => {
    const fontFace = "@font-face{font-family:'JetBrains Mono Variable';src:url(data:font/woff2;base64,AAAA)}"
    const svg = buildSvg(classDiagram(), { vars, fontFace })!
    expect(svg).toContain(fontFace)
    expect(svg).toContain("<style>")
  })

  it("resta valido senza font, senza lasciare uno style vuoto a metà", () => {
    const svg = buildSvg(classDiagram(), { vars })!
    expect(svg).not.toContain("@font-face")
    expect(svg).toContain("<svg")
  })

  it("dichiara il namespace SVG, altrimenti il file non si apre da solo", () => {
    const svg = buildSvg(classDiagram(), { vars })!
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it("sfugge le virgolette dei valori sostituiti, o l'SVG è malformato", () => {
    const svg = buildSvg(classDiagram(), { vars })!
    expect(svg).toContain('font-family="&quot;JetBrains Mono Variable&quot;, monospace"')
    for (const [, value] of svg.matchAll(/="([^"]*)"/g)) expect(value).not.toContain('"')
    expect(svg).not.toMatch(/=""[^ >]/)
  })

  it("sfugge anche & e < in un valore, non solo le virgolette", () => {
    const svg = buildSvg(classDiagram(), { vars: { ...vars, "--card": 'a&b<c"d' } })!
    expect(svg).toContain('fill="a&amp;b&lt;c&quot;d"')
  })

  it("restituisce null su un diagramma senza classi: non c'è niente da esportare", () => {
    const empty = { type: "class", model: { classes: {}, relations: {}, notes: {} }, view: { nodes: {} } } as ClassDiagram
    expect(buildSvg(empty, { vars })).toBeNull()
  })

  it("salta le relazioni con un estremo mancante invece di rompersi", () => {
    const d = classDiagram()
    d.model.relations["rotta"] = {
      kind: "association",
      source: { class: "Cliente", multiplicity: "", role: "" },
      target: { class: "inesistente", multiplicity: "", role: "" },
    }
    const svg = buildSvg(d, { vars })!
    expect(svg).toContain('data-edge-id="cliente_persona"')
    expect(svg).not.toContain('data-edge-id="rotta"')
  })

  it("include una classe collassata nei bounds con la sua altezza ridotta", () => {
    const d = classDiagram()
    d.view.nodes["Persona"]!.collapsed = true
    const collassato = buildSvg(d, { vars })!
    const aperto = buildSvg(classDiagram(), { vars })!
    const hOf = (svg: string) => Number(/viewBox="[^ ]+ [^ ]+ [^ ]+ ([^"]+)"/.exec(svg)![1])
    expect(hOf(collassato)).toBeLessThan(hOf(aperto))
  })

  it("esporta anche le note, che sono nodi come le classi", () => {
    const d = classDiagram()
    d.model.notes = { "n-1": { text: "da rivedere" } }
    d.view.nodes["n-1"] = { x: 700, y: 700, collapsed: false }
    const svg = buildSvg(d, { vars })!
    expect(svg).toContain('data-node-id="n-1"')
    expect(svg).toContain(">da rivedere<")
  })
})
