import { describe, expect, it } from "vitest"
import type { Attribute, Cardinality, Entity, ErModel } from "@/model/document"
import { emitMermaid } from "./mermaid"

const attr = (name: string, type: string, p: Partial<Attribute> = {}): Attribute => ({
  name, type, primaryKey: false, foreignKey: false, nullable: true, unique: false, ...p,
})

const entity = (name: string, attributes: Attribute[], schema?: string): Entity => ({
  name, ...(schema ? { schema } : {}), attributes,
})

function model(): ErModel {
  return {
    entities: {
      "pub.utenti": entity("utenti", [
        attr("id", "integer", { primaryKey: true, nullable: false }),
        attr("email", "varchar(255)", { nullable: false, unique: true }),
        attr("saldo", "double precision"),
      ], "pub"),
      ordini: entity("ordini", [attr("utente_id", "integer", { foreignKey: true })]),
    },
    relationships: {
      r1: {
        source: { entity: "ordini", attributes: ["utente_id"], cardinality: "zero-or-many" },
        target: { entity: "pub.utenti", attributes: ["id"], cardinality: "zero-or-one" },
        identifying: false,
      },
    },
  }
}

describe("emitMermaid", () => {
  it("emette l'erDiagram con relazioni, blocchi e chiavi", () => {
    expect(emitMermaid(model()).text).toBe(`erDiagram
  "pub.utenti" |o..o{ "ordini" : ""
  "ordini" {
    integer utente_id FK
  }
  "pub.utenti" {
    integer id PK
    varchar(255) email UK
    \`double precision\` saldo
  }
`)
  })

  it("mette fra backtick solo i tipi che contengono uno spazio", () => {
    // `double precision` e `bigint(20) unsigned` sono le forme con spazio che arrivano davvero
    // dagli adapter (asserite in pg.test.ts e mysql.test.ts). `numeric(10,2)` no: la virgola e le
    // parentesi sono ammesse da ATTRIBUTE_WORD, la documentazione in prosa dice altro.
    const m: ErModel = {
      entities: { t: entity("t", [attr("a", "numeric(10,2)"), attr("b", "bigint(20) unsigned"), attr("c", "text[]")]) },
      relationships: {},
    }
    const { text } = emitMermaid(m)
    expect(text).toContain("    numeric(10,2) a")
    expect(text).toContain("    `bigint(20) unsigned` b")
    expect(text).toContain("    text[] c")
  })

  it("cita sempre il nome dell'entità, così il punto passa", () => {
    expect(emitMermaid(model()).text).toContain('"pub.utenti" {')
  })

  it("sostituisce i caratteri che un nome citato non ammette, e lo dice", () => {
    const m: ErModel = { entities: { 'a"b%c': entity('a"b%c', [attr("x", "int")]) }, relationships: {} }
    const { text, warnings } = emitMermaid(m)
    expect(text).toContain('"a_b_c" {')
    expect(warnings).toContain('il nome "a"b%c" contiene caratteri che Mermaid non ammette: emesso come "a_b_c"')
  })

  it("rimuove i backtick dal tipo: dentro block_bq non c'è modo di sfuggirli", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "int`x y")]) }, relationships: {} }
    const { text, warnings } = emitMermaid(m)
    expect(text).toContain("    `intx y` a")
    expect(warnings).toContain("il tipo di t.a: i backtick sono stati rimossi, Mermaid non li sa sfuggire")
  })

  it("emette `_` per il tipo vuoto: in Mermaid è un'etichetta, non SQL", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "  ")]) }, relationships: {} }
    expect(emitMermaid(m).text).toContain("    _ a")
  })

  it("combina le chiavi con la virgola", () => {
    const m: ErModel = {
      entities: { t: entity("t", [attr("a", "int", { primaryKey: true, foreignKey: true, unique: true })]) },
      relationships: {},
    }
    expect(emitMermaid(m).text).toContain("    int a PK,FK,UK")
  })

  it.each<[Cardinality, Cardinality, string]>([
    ["one", "one", "||--||"],
    ["zero-or-one", "zero-or-many", "|o--o{"],
    ["many", "zero-or-one", "}|--o|"],
    ["zero-or-many", "many", "}o--|{"],
  ])("il marcatore sta accanto all'entità che descrive: %s/%s → %s", (target, source, atteso) => {
    const m: ErModel = {
      entities: { p: entity("p", [attr("id", "int")]), c: entity("c", [attr("p_id", "int")]) },
      relationships: {
        r: {
          source: { entity: "c", attributes: ["p_id"], cardinality: source },
          target: { entity: "p", attributes: ["id"], cardinality: target },
          identifying: true,
        },
      },
    }
    expect(emitMermaid(m).text).toContain(`  "p" ${atteso} "c" : ""`)
  })

  it("identifying continuo, non identifying tratteggiato", () => {
    const m = model()
    expect(emitMermaid(m).text).toContain("|o..o{")
    m.relationships["r1"]!.identifying = true
    expect(emitMermaid(m).text).toContain("|o--o{")
  })

  it("l'etichetta è il nome della relazione, sempre citata", () => {
    const m = model()
    m.relationships["r1"]!.name = "appartiene a"
    expect(emitMermaid(m).text).toContain(' : "appartiene a"')
  })

  it("l'entità senza attributi produce un blocco vuoto, che Mermaid disegna", () => {
    const m: ErModel = { entities: { vuota: entity("vuota", []) }, relationships: {} }
    expect(emitMermaid(m).text).toBe('erDiagram\n  "vuota" {\n  }\n')
  })

  it("salta la relazione con un estremo fuori dal diagramma", () => {
    const m = model()
    m.relationships["r1"]!.target.entity = "inesistente"
    const { text, warnings } = emitMermaid(m)
    expect(text).not.toContain("|o..o{")
    expect(warnings).toContain('relazione "r1" saltata: un estremo non è nel diagramma')
  })
})
