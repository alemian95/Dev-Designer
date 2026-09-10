import { describe, expect, it } from "vitest"
import type { Attribute, Cardinality, Entity, ErModel } from "@/model/er/schema"
import { emitMermaid } from "./er-mermaid"

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
    expect(warnings).toContain('1 nomi di entità contengono caratteri che Mermaid non ammette: "a"b%c" → "a_b_c"')
  })

  it("rimuove i backtick dal tipo: dentro block_bq non c'è modo di sfuggirli", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "int`x y")]) }, relationships: {} }
    const { text, warnings } = emitMermaid(m)
    expect(text).toContain("    `intx y` a")
    expect(warnings).toContain("1 valori avevano backtick, rimossi perché Mermaid non li sa sfuggire: il tipo di t.a")
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
  ])("il marcatore sta accanto all'entità che descrive: %s/%s → %s", (target, source, expected) => {
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
    expect(emitMermaid(m).text).toContain(`  "p" ${expected} "c" : ""`)
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

  it("salta la relazione con un estremo fuori dal diagramma (target mancante)", () => {
    const m = model()
    m.relationships["r1"]!.target.entity = "inesistente"
    const { text, warnings } = emitMermaid(m)
    expect(text).not.toContain("|o..o{")
    expect(warnings).toContain("1 relazioni saltate, un estremo non è nel diagramma: r1")
  })

  it("salta la relazione con un estremo fuori dal diagramma (source mancante)", () => {
    // La condizione nel codice è un OR simmetrico su source e target: il test sopra copre
    // solo un ramo, questo copre l'altro.
    const m = model()
    m.relationships["r1"]!.source.entity = "inesistente"
    const { text, warnings } = emitMermaid(m)
    expect(text).not.toContain("|o..o{")
    expect(warnings).toContain("1 relazioni saltate, un estremo non è nel diagramma: r1")
  })

  it("ordina le relazioni per chiave alfabetica, non per ordine di inserimento", () => {
    // Le chiavi sono inserite fuori ordine (z prima di a) e i figli sono scelti così che
    // l'ordine alfabetico delle entità non coincida con quello atteso delle relazioni: se
    // qualcuno rompesse il `.sort()` su `Object.keys(model.relationships)`, le righe di
    // relazione comparirebbero nell'ordine di inserimento (prima "ac", poi "zc") e questo
    // test lo direbbe.
    const m: ErModel = {
      entities: {
        p: entity("p", [attr("id", "int")]),
        ac: entity("ac", [attr("p_id", "int")]),
        zc: entity("zc", [attr("p_id", "int")]),
      },
      relationships: {
        z: {
          source: { entity: "ac", attributes: ["p_id"], cardinality: "zero-or-many" },
          target: { entity: "p", attributes: ["id"], cardinality: "one" },
          identifying: false,
        },
        a: {
          source: { entity: "zc", attributes: ["p_id"], cardinality: "zero-or-many" },
          target: { entity: "p", attributes: ["id"], cardinality: "one" },
          identifying: false,
        },
      },
    }
    const { text } = emitMermaid(m)
    expect(text.indexOf('"zc"')).toBeLessThan(text.indexOf('"ac"'))
  })

  it("una relazione disegnata a mano (estremi senza attributi) emette comunque la riga di cardinalità", () => {
    // Caso degenere della spec §8 e dell'ADR 0003: `attributes: []` marca una relazione
    // disegnata a mano. A differenza del DDL (dove diventa un commento perché una FOREIGN KEY
    // senza colonne non si può scrivere), in Mermaid la riga si emette comunque: la relazione
    // non ha bisogno delle colonne per essere disegnata.
    const m: ErModel = {
      entities: { p: entity("p", [attr("id", "int")]), c: entity("c", [attr("nome", "text")]) },
      relationships: {
        r: {
          source: { entity: "c", attributes: [], cardinality: "zero-or-many" },
          target: { entity: "p", attributes: [], cardinality: "one" },
          identifying: false,
        },
      },
    }
    expect(emitMermaid(m).text).toContain('  "p" ||..o{ "c" : ""')
  })

  it("avvisa quando l'etichetta della relazione contiene virgolette, che vengono rimosse", () => {
    const m = model()
    m.relationships["r1"]!.name = 'il "migliore"'
    const { text, warnings } = emitMermaid(m)
    expect(text).toContain(' : "il migliore"')
    expect(warnings).toContain(
      "1 etichette di relazione avevano virgolette, rimosse perché Mermaid non le sa sfuggire nell'etichetta: r1",
    )
  })
  it("aggrega gli avvisi per categoria: un diagramma con tre nomi anomali ne produce uno solo", () => {
    // È il contratto di result.ts: su un diagramma grande una riga per occorrenza è illeggibile,
    // ed è il caso in cui questo emettitore sbagliava. Tre entità dal nome illegale, tre attributi
    // col backtick e due relazioni saltate devono dare tre avvisi in tutto, non otto.
    const m: ErModel = {
      entities: {
        'a"1': entity('a"1', [attr("x", "int`a")]),
        'a"2': entity('a"2', [attr("x", "int`b")]),
        'a"3': entity('a"3', [attr("x", "int`c")]),
      },
      relationships: {
        r1: {
          source: { entity: "assente", attributes: ["x"], cardinality: "one" },
          target: { entity: 'a"1', attributes: ["x"], cardinality: "one" },
          identifying: false,
        },
        r2: {
          source: { entity: "assente", attributes: ["x"], cardinality: "one" },
          target: { entity: 'a"2', attributes: ["x"], cardinality: "one" },
          identifying: false,
        },
      },
    }
    const { warnings } = emitMermaid(m)
    expect(warnings).toHaveLength(3)
    expect(warnings).toContain("2 relazioni saltate, un estremo non è nel diagramma: r1, r2")
    expect(warnings).toContain('3 nomi di entità contengono caratteri che Mermaid non ammette: "a"1" → "a_1", "a"2" → "a_2", "a"3" → "a_3"')
    expect(warnings).toContain(
      "3 valori avevano backtick, rimossi perché Mermaid non li sa sfuggire: il tipo di a\"1.x, il tipo di a\"2.x, il tipo di a\"3.x",
    )
  })
})
