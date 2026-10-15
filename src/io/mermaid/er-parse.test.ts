import { describe, expect, it } from "vitest"
import { MermaidSyntaxError } from "./common"
import { ER_VALID } from "./er-fixtures"
import { parseEr } from "./er-parse"

const syntaxErrorAt = (text: string): number => {
  try {
    parseEr(text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return e.at
    throw e
  }
  throw new Error("nessun errore")
}

describe("parseEr", () => {
  it("legge relazioni ed entità con gli attributi", () => {
    const { ast, warnings } = parseEr(ER_VALID.basic!)
    expect(warnings).toEqual([])
    expect(ast.relationships).toEqual([
      { left: "CUSTOMER", leftCard: "ONLY_ONE", right: "ORDER", rightCard: "ZERO_OR_MORE", identifying: true, label: "places", at: 12 },
    ])
    expect(ast.entities).toHaveLength(1)
    expect(ast.entities[0]).toMatchObject({ id: "CUSTOMER", alias: null })
    expect(ast.entities[0]!.attributes.map(({ type, name, keys }) => ({ type, name, keys }))).toEqual([
      { type: "string", name: "name", keys: ["PK"] },
      { type: "int", name: "age", keys: [] },
    ])
  })

  it("legge le cardinalità a parole e le linee «to» e «optionally to»", () => {
    const [a, c] = parseEr(ER_VALID.words!).ast.relationships
    expect(a).toMatchObject({ leftCard: "ONLY_ONE", rightCard: "ZERO_OR_MORE", identifying: true, label: "ha" })
    expect(c).toMatchObject({ leftCard: "ONE_OR_MORE", rightCard: "ZERO_OR_MORE", identifying: false, label: "x" })
  })

  it("legge le cardinalità a simboli e le linee tratteggiate", () => {
    const rels = parseEr(ER_VALID.symbols!).ast.relationships
    expect(rels.map((r) => [r.leftCard, r.identifying, r.rightCard])).toEqual([
      ["ZERO_OR_ONE", false, "ZERO_OR_ONE"],
      ["ONE_OR_MORE", true, "ONE_OR_MORE"],
      ["ONLY_ONE", false, "ZERO_OR_MORE"],
      ["ONLY_ONE", true, "ZERO_OR_MORE"],
    ])
  })

  it("legge nomi citati, chiavi multiple e commenti", () => {
    const [entity] = parseEr(ER_VALID.keysAndComments!).ast.entities
    expect(entity!.id).toBe("pub.utenti")
    expect(entity!.attributes.map(({ type, name, keys, comment }) => ({ type, name, keys, comment }))).toEqual([
      { type: "bigint", name: "id", keys: ["PK"], comment: "chiave" },
      { type: "bigint", name: "gruppo_id", keys: ["FK"], comment: null },
      { type: "varchar(255)", name: "email", keys: ["UK"], comment: null },
      { type: "int", name: "a", keys: ["PK", "FK"], comment: null },
    ])
  })

  it("legge tipi fra backtick, tipi con tilde e il ? del tipo", () => {
    const { ast } = parseEr("erDiagram\n  A {\n    `double precision` x\n    List~int~ ys\n    int? z\n  }\n")
    expect(ast.entities[0]!.attributes.map((a) => [a.type, a.name])).toEqual([["double precision", "x"], ["List~int~", "ys"], ["int?", "z"]])
  })

  it("accetta un blocco su una riga sola e un blocco vuoto", () => {
    const { ast } = parseEr("erDiagram\n  A { int id PK }\n  B {}\n")
    expect(ast.entities.map((e) => [e.id, e.attributes.length])).toEqual([["A", 1], ["B", 0]])
  })

  it("segnala alias, stili e direzione, e ignora front-matter e commenti", () => {
    const { ast, warnings } = parseEr(ER_VALID.aliasAndStyle!)
    expect(ast.entities[0]).toMatchObject({ id: "p", alias: "Persona" })
    expect(ast.relationships[0]).toMatchObject({ left: "p", right: "q", label: null })
    expect(warnings.map((w) => w.message)).toEqual([
      "Direzione ignorata: il diagramma ER si dispone dall'alto in basso (riga 6)",
      "Stili scartati (style, classDef, class, :::), il diagramma usa i suoi (righe 11, 12)",
    ])
  })

  it("appiattisce i subgraph con un avviso", () => {
    const { ast, warnings } = parseEr("erDiagram\n  subgraph S [Titolo]\n    A ||--o{ B : x\n  end\n")
    expect(ast.relationships).toHaveLength(1)
    expect(warnings.map((w) => w.message)).toEqual(["Subgraph appiattiti: le entità entrano, i riquadri no (riga 2)"])
  })

  it("non chiude il blocco su una } dentro un commento", () => {
    const { ast } = parseEr('erDiagram\n  A {\n    int id PK "chiude }"\n    string nome\n  }\n')
    expect(ast.entities[0]!.attributes.map((a) => [a.name, a.comment])).toEqual([["id", "chiude }"], ["nome", null]])
  })

  it("legge un testo con gli a capo di Windows", () => {
    const { ast } = parseEr("erDiagram\r\n  A ||--o{ B : ha\r\n  A {\r\n    int id PK\r\n  }\r\n")
    expect(ast.relationships[0]).toMatchObject({ left: "A", right: "B", label: "ha" })
    expect(ast.entities[0]!.attributes.map((a) => a.name)).toEqual(["id"])
  })

  it("accetta nomi non ASCII senza virgolette e un attributo che si chiama come una chiave", () => {
    const { ast } = parseEr("erDiagram\n  Città ||--o{ Società : ospita\n  Città {\n    int pk PK\n  }\n")
    expect(ast.relationships[0]).toMatchObject({ left: "Città", right: "Società" })
    expect(ast.entities[0]!.attributes[0]).toMatchObject({ name: "pk", keys: ["PK"] })
  })

  it("rifiuta due istruzioni sulla stessa riga invece di leggerne mezza", () => {
    expect(syntaxErrorAt("erDiagram\n  A ||--o{ B : x C ||--|| D : y\n")).toBe(12)
  })

  it("lancia un errore con l'offset sui guasti strutturali", () => {
    const unclosed = "erDiagram\n  A {\n    int id\n"
    expect(syntaxErrorAt(unclosed)).toBe(unclosed.indexOf("{"))
    expect(syntaxErrorAt("erDiagram\n  A ||--x B : y\n")).toBe(12)
    expect(syntaxErrorAt("erDiagram\n  end\n")).toBe(12)
    expect(syntaxErrorAt("erDiagram\n  subgraph S\n  A\n")).toBe(12)
    expect(syntaxErrorAt("classDiagram\n")).toBe(0)
  })

  it("resta lineare su un testo grande", () => {
    const lines = ["erDiagram"]
    for (let i = 0; i < 5000; i++) {
      lines.push(`  E${i} ||--o{ E${i + 1} : r`, `  E${i} {`, "    int id PK", "    varchar(255) nome", "  }")
    }
    const started = performance.now()
    const { ast } = parseEr(lines.join("\n"))
    expect(ast.relationships).toHaveLength(5000)
    // Un'espressione regolare che torna indietro in modo esponenziale sfora di ordini di grandezza.
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
