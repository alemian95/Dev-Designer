import { describe, expect, it } from "vitest"
import { MermaidSyntaxError } from "./common"
import { STATE_VALID } from "./state-fixtures"
import { parseState } from "./state-parse"

const state = (body: string) => parseState(`stateDiagram-v2\n  ${body}\n`)
const transitions = (body: string) => state(body).ast.transitions.map(({ source, target, label }) => ({ source, target, label }))
const mentions = (body: string) => state(body).ast.mentions.map(({ id, description, kind }) => ({ id, description, kind }))
const messages = (text: string) => parseState(text).warnings.map((w) => w.message)
const syntaxError = (text: string): { message: string; at: number } => {
  try {
    parseState(text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { message: e.message, at: e.at }
    throw e
  }
  throw new Error("nessun errore")
}

describe("parseState: intestazione", () => {
  it("accetta stateDiagram e stateDiagram-v2, maiuscole e minuscole indifferenti", () => {
    for (const header of ["stateDiagram", "stateDiagram-v2", "STATEDIAGRAM-V2", "statediagram"]) {
      expect(parseState(`${header}\n  A --> B\n`).ast.transitions).toHaveLength(1)
    }
  })

  it("rifiuta un testo senza intestazione o con un'altra parola", () => {
    expect(syntaxError("A --> B").message).toBe("Il testo non comincia con stateDiagram")
    expect(syntaxError("flowchart LR\n  A --> B").message).toBe("Il testo non comincia con stateDiagram")
    expect(syntaxError("").message).toBe("Il testo non comincia con stateDiagram")
  })
})

describe("parseState: stati e transizioni", () => {
  it("non vuole terminatori fra le istruzioni, nemmeno dopo l'intestazione", () => {
    expect(transitions("A --> B C --> D")).toHaveLength(2)
    expect(parseState("stateDiagram-v2 A --> B").ast.transitions).toHaveLength(1)
  })

  it("legge [*] come estremità null", () => {
    expect(transitions("[*] --> A\n  A --> [*]")).toEqual([
      { source: null, target: "A", label: "" },
      { source: "A", target: null, label: "" },
    ])
  })

  it("prende come id qualunque carattere tranne :, spazio, - e {", () => {
    expect(transitions("a.b --> Città")).toEqual([{ source: "a.b", target: "Città", label: "" }])
    expect(transitions("A --> B;")).toEqual([{ source: "A", target: "B;", label: "" }])
    const text = "stateDiagram-v2\n  a-b --> c\n"
    expect(syntaxError(text).at).toBe(text.indexOf("-b"))
  })

  it("legge l'etichetta fino a fine riga, ; # %% e : singoli compresi", () => {
    expect(transitions("A --> B : x; y")).toEqual([{ source: "A", target: "B", label: "x; y" }])
    expect(mentions("A --> B : x; y").map((m) => m.id)).toEqual(["A", "B"])
    expect(transitions("A --> B : a # b %% c")[0]!.label).toBe("a # b %% c")
    expect(transitions("A --> B : a:b")[0]!.label).toBe("a:b")
    expect(syntaxError("stateDiagram-v2\n  A --> B : a::b\n").message).toBe('"::" in un\'etichetta')
    expect(transitions("A --> B : #59; #quot;x#quot;<br>y")[0]!.label).toBe('; "x"\ny')
  })

  it("salta i commenti a metà riga quando aprono un token", () => {
    expect(transitions("A --> B %% coda")).toEqual([{ source: "A", target: "B", label: "" }])
    expect(mentions("A%%x --> B")).toEqual([{ id: "A", description: null, kind: null }])
    expect(transitions("A --> B # coda --> C\n  C --> D")).toEqual([
      { source: "A", target: "B", label: "" },
      { source: "C", target: "D", label: "" },
    ])
  })

  it("dà una menzione per descrizione, e nessuna per state L : descr", () => {
    expect(mentions("A : prima\n  A : seconda")).toEqual([
      { id: "A", description: "prima", kind: null },
      { id: "A", description: "seconda", kind: null },
    ])
    expect(mentions('state "Lungo nome" as L')).toEqual([{ id: "L", description: "Lungo nome", kind: null }])
    expect(mentions("state L : descr")).toEqual([])
  })

  it("legge fork, join e choice", () => {
    expect(mentions("state f <<fork>>\n  state j [[join]]\n  state c <<choice>>").map((m) => m.kind)).toEqual(["fork", "join", "choice"])
  })

  it("mette tutto alla radice, regione 0, offset nel testo originale", () => {
    const text = "---\ntitle: T\n---\nstateDiagram-v2\n  A --> B\n"
    const { ast } = parseState(text)
    expect(ast.mentions.map(({ container, region, at }) => ({ container, region, at }))).toEqual([
      { container: null, region: 0, at: text.indexOf("A") },
      { container: null, region: 0, at: text.indexOf("B") },
    ])
    expect(ast.transitions[0]).toMatchObject({ container: null, region: 0, at: text.indexOf("A") })
    expect(ast.composites).toEqual([])
    expect(ast.notes).toEqual([])
  })
})

describe("parseState: come il lexer di Mermaid", () => {
  it("legge le parole chiave senza badare a maiuscole e minuscole", () => {
    const lower = parseState("stateDiagram-v2\n  direction lr\n")
    expect(lower.ast).toMatchObject({ direction: "LR", mentions: [] })
    expect(lower.warnings).toEqual([])
    expect(mentions('State "X" as L')).toEqual([{ id: "L", description: "X", kind: null }])
    expect(mentions("state f <<Fork>>")).toEqual([{ id: "f", description: null, kind: "fork" }])
  })

  it("accetta l'alias senza spazio prima di as", () => {
    expect(mentions('state "X"as L')).toEqual([{ id: "L", description: "X", kind: null }])
  })

  it("separa il genere attaccato all'id", () => {
    expect(mentions("state f<<fork>>")).toEqual([{ id: "f", description: null, kind: "fork" }])
    expect(mentions("state j[[join]]")).toEqual([{ id: "j", description: null, kind: "join" }])
  })
})

describe("parseState: righe ignorate e avvisi", () => {
  it("ignora senza avviso hide empty description, scale, front-matter e direttive", () => {
    const text = "---\ntitle: T\n---\n%%{init: {'theme': 'dark'}}%%\nstateDiagram-v2\n  direction LR\n  hide empty description\n  scale 350 width\n  A --> B\n"
    const { ast, warnings } = parseState(text)
    expect(warnings).toEqual([])
    expect(ast.mentions.map((m) => m.id)).toEqual(["A", "B"])
  })

  it("scarta stili e interazioni con un avviso solo, e :::classe fuori dall'id", () => {
    const text = "stateDiagram-v2\n  direction LR\n  A:::rosso --> B\n  classDef rosso fill:#f00\n  class B rosso\n  style A fill:#0f0\n  click A \"https://example.com\"\n"
    expect(messages(text)).toEqual(["Stili e interazioni scartati (classDef, class, :::, style, click), il diagramma usa i suoi (righe 3, 4, 5, 6, 7)"])
    expect(parseState(text).ast.transitions[0]).toMatchObject({ source: "A", target: "B" })
  })

  it("scarta titolo e descrizione di accessibilità", () => {
    const text = "stateDiagram-v2\n  direction LR\n  accTitle: T\n  accDescr: D\n  accDescr {\n    lunga\n  }\n  A --> B\n"
    expect(messages(text)).toEqual(["Titolo e descrizione di accessibilità scartati (righe 3, 4, 5)"])
    expect(parseState(text).ast.mentions.map((m) => m.id)).toEqual(["A", "B"])
  })

  it("avvisa una volta se la direzione finale della radice non è LR, anche se manca", () => {
    const warning = "Direzione ignorata: il flusso si dispone da sinistra a destra"
    expect(messages("stateDiagram-v2\n  A --> B\n")).toEqual([`${warning} (riga 1)`])
    expect(messages("stateDiagram-v2\n  direction LR\n  direction TB\n")).toEqual([`${warning} (riga 3)`])
    expect(messages("stateDiagram-v2\n  direction TB\n  direction LR\n")).toEqual([])
    expect(parseState("stateDiagram-v2\n  direction RL\n").ast.direction).toBe("RL")
    expect(parseState("stateDiagram-v2\n").ast.direction).toBe("TB")
  })
})

describe("parseState: stati composti", () => {
  const places = (body: string) => state(body).ast.mentions.map(({ id, container, region }) => ({ id, container, region }))

  it("apre un composto con state C { … }, alias compreso, e ci mette le menzioni", () => {
    const text = 'stateDiagram-v2\n  state C {\n    A\n  }\n  state "Alias" as D {\n    B\n  }\n  E\n'
    const { ast } = parseState(text)
    expect(ast.composites).toEqual([
      { id: "C", alias: null, regions: 1, container: null, region: 0, at: text.indexOf("state C") },
      { id: "D", alias: "Alias", regions: 1, container: null, region: 0, at: text.indexOf('state "Alias"') },
    ])
    expect(ast.mentions.map(({ id, container }) => ({ id, container }))).toEqual([
      { id: "A", container: "C" },
      { id: "B", container: "D" },
      { id: "E", container: null },
    ])
  })

  it("legge i composti su una riga e annidati, con il genitore come container", () => {
    const { ast } = state("state P { state Q { X --> Y } }\n  state R{\n  Z\n  }")
    expect(ast.composites.map(({ id, container, region }) => ({ id, container, region }))).toEqual([
      { id: "P", container: null, region: 0 },
      { id: "Q", container: "P", region: 0 },
      { id: "R", container: null, region: 0 },
    ])
    expect(ast.transitions[0]).toMatchObject({ source: "X", target: "Y", container: "Q", region: 0 })
    expect(places("state P { state Q { X } }").map((m) => m.container)).toEqual(["Q"])
  })

  it("conta le regioni separate da --, e alla chiusura torna al posto di prima", () => {
    const { ast } = state("state P {\n    A\n    --\n    B\n    --\n    state Q { C }\n  }\n  D")
    expect(ast.composites.map(({ id, regions, container, region }) => ({ id, regions, container, region }))).toEqual([
      { id: "P", regions: 3, container: null, region: 0 },
      { id: "Q", regions: 1, container: "P", region: 2 },
    ])
    expect(ast.mentions.map(({ id, container, region }) => ({ id, container, region }))).toEqual([
      { id: "A", container: "P", region: 0 },
      { id: "B", container: "P", region: 1 },
      { id: "C", container: "Q", region: 0 },
      { id: "D", container: null, region: 0 },
    ])
  })

  it("non cambia la direzione della radice con una direction dentro un composto", () => {
    const text = "stateDiagram-v2\n  direction LR\n  state C {\n    direction TB\n    A\n  }\n"
    expect(parseState(text).ast.direction).toBe("LR")
    expect(messages(text)).toEqual([])
  })

  it("dà gli errori di Mermaid: -- alla radice, nome di più parole, graffa non chiusa", () => {
    const dash = "stateDiagram-v2\n  A\n  --\n  B\n"
    expect(syntaxError(dash)).toEqual({ message: '"--" fuori da uno stato composto', at: dash.indexOf("--") })
    const words = "stateDiagram-v2\n  state Due parole {\n  }\n"
    expect(syntaxError(words)).toEqual({ message: "Il nome di uno stato composto è una parola sola", at: words.indexOf("Due") })
    const open = "stateDiagram-v2\n  state P {\n    state Q {\n      A\n    }\n"
    expect(syntaxError(open)).toEqual({ message: 'Stato composto senza "}"', at: open.indexOf("state P") })
  })

  it("legge } come uno stato fuori dai composti, e come chiusura dentro", () => {
    expect(transitions("A --> }")).toEqual([{ source: "A", target: "}", label: "" }])
    expect(syntaxError("stateDiagram-v2\n  state C {\n    A --> }\n  }\n").message).toBe("Stato atteso dopo «-->»")
  })
})

describe("parseState: fixture valide", () => {
  it.each(Object.entries(STATE_VALID))("analizza %s senza errori", (_, text) => {
    expect(() => parseState(text)).not.toThrow()
  })
})
