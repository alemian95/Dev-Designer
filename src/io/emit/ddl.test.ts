import { describe, expect, it } from "vitest"
import type { Attribute, Entity, ErModel, Relationship } from "@/model/document"
import { emitDdl } from "./ddl"

const attr = (name: string, type: string, p: Partial<Attribute> = {}): Attribute => ({
  name, type, primaryKey: false, foreignKey: false, nullable: true, unique: false, ...p,
})

const entity = (name: string, attributes: Attribute[], schema?: string): Entity => ({
  name, ...(schema ? { schema } : {}), attributes,
})

/** Due entità e una relazione: `ordini.utente_id` → `pub.utenti.id`. */
function model(): ErModel {
  const utenti = entity("utenti", [
    attr("id", "integer", { primaryKey: true, nullable: false }),
    attr("email", "varchar(255)", { nullable: false, unique: true }),
  ], "pub")
  const ordini = entity("ordini", [
    attr("id", "integer", { primaryKey: true, nullable: false }),
    attr("utente_id", "integer", { foreignKey: true }),
  ])
  const rel: Relationship = {
    source: { entity: "ordini", attributes: ["utente_id"], cardinality: "zero-or-many" },
    target: { entity: "pub.utenti", attributes: ["id"], cardinality: "zero-or-one" },
    identifying: false,
  }
  return { entities: { "pub.utenti": utenti, ordini }, relationships: { r1: rel } }
}

describe("emitDdl", () => {
  it("emette schemi, tabelle in ordine alfabetico e FK in ALTER TABLE separati", () => {
    const { text } = emitDdl(model(), "postgres")
    expect(text).toBe(`-- Dev Designer — export PostgreSQL
-- Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più colonne:
-- questo DDL descrive tabelle, colonne, chiavi e riferimenti.

CREATE SCHEMA IF NOT EXISTS "pub";

CREATE TABLE "ordini" (
  "id" integer NOT NULL,
  "utente_id" integer,
  PRIMARY KEY ("id")
);

CREATE TABLE "pub"."utenti" (
  "id" integer NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  PRIMARY KEY ("id")
);

ALTER TABLE "ordini"
  ADD CONSTRAINT "ordini_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "pub"."utenti" ("id");
`)
  })

  it("MySQL cambia solo il carattere di citazione", () => {
    const { text } = emitDdl(model(), "mysql")
    expect(text).toContain("CREATE SCHEMA IF NOT EXISTS `pub`;")
    expect(text).toContain("CREATE TABLE `pub`.`utenti` (")
    expect(text).toContain("REFERENCES `pub`.`utenti` (`id`);")
    expect(text).not.toContain('"')
  })

  it("non emette CREATE SCHEMA se nessuna entità ha uno schema", () => {
    const m = model()
    delete m.entities["pub.utenti"]
    delete m.relationships["r1"]
    const { text } = emitDdl(m, "postgres")
    expect(text).not.toContain("CREATE SCHEMA")
  })

  it("sfugge il carattere di citazione dentro i nomi, in entrambi i dialetti", () => {
    // Il nome di una relazione lo digita l'utente: può contenere qualunque cosa. Senza
    // sfuggimento il DDL è malformato — lo stesso difetto dell'export SVG in produzione.
    const m: ErModel = {
      entities: { 'a"b': entity('a"b', [attr('c"d', "int")]) },
      relationships: {
        r: {
          name: 'v"k',
          source: { entity: 'a"b', attributes: ['c"d'], cardinality: "zero-or-many" },
          target: { entity: 'a"b', attributes: ['c"d'], cardinality: "one" },
          identifying: false,
        },
      },
    }
    const pg = emitDdl(m, "postgres").text
    expect(pg).toContain('CREATE TABLE "a""b" (')
    expect(pg).toContain('ADD CONSTRAINT "v""k"')
    const my = emitDdl({ entities: { "a`b": entity("a`b", [attr("c`d", "int")]) }, relationships: {} }, "mysql").text
    expect(my).toContain("CREATE TABLE `a``b` (")
  })

  it("emette la chiave composta come vincolo di tabella", () => {
    const m: ErModel = {
      entities: {
        t: entity("t", [
          attr("a", "int", { primaryKey: true, nullable: false }),
          attr("b", "int", { primaryKey: true, nullable: false }),
        ]),
      },
      relationships: {},
    }
    expect(emitDdl(m, "postgres").text).toContain('  PRIMARY KEY ("a", "b")')
  })

  it("commenta l'entità senza colonne invece di emettere un CREATE TABLE non valido", () => {
    const m: ErModel = { entities: { vuota: entity("vuota", []) }, relationships: {} }
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).toContain('-- tabella "vuota": nessuna colonna definita nel diagramma')
    expect(text).not.toContain("CREATE TABLE")
    expect(warnings).toContain("1 entità senza colonne non producono una tabella: vuota")
  })

  it("commenta la relazione disegnata a mano invece di inventare una FOREIGN KEY", () => {
    const m = model()
    m.relationships["r1"]!.source.attributes = []
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).toContain('-- relazione "ordini" → "pub"."utenti": colonne non definite nel diagramma')
    expect(text).not.toContain("ADD CONSTRAINT")
    expect(warnings).toContain("1 relazioni disegnate a mano non hanno colonne: nessuna FOREIGN KEY emessa, solo un commento")
  })

  it("avvisa quando l'entità referenziata non ha PRIMARY KEY", () => {
    const m = model()
    m.entities["pub.utenti"]!.attributes[0]!.primaryKey = false
    const { warnings } = emitDdl(m, "postgres")
    expect(warnings.some((w) => w.includes("non hanno PRIMARY KEY") && w.includes("pub.utenti"))).toBe(true)
  })

  it("salta la relazione con un estremo fuori dal diagramma", () => {
    const m = model()
    m.relationships["r1"]!.target.entity = "inesistente"
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).not.toContain("ADD CONSTRAINT")
    expect(warnings).toContain("1 relazioni saltate, un estremo non è nel diagramma: r1")
  })

  it("emette il tipo vuoto come text e lo dice", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "   ")]) }, relationships: {} }
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).toContain('  "a" text')
    expect(warnings).toContain("1 colonne senza tipo sono state emesse come text: t.a")
  })

  it("deduplica i nomi di vincolo: MySQL li vuole unici per database", () => {
    const rel = (child: string): Relationship => ({
      source: { entity: child, attributes: ["p_id"], cardinality: "zero-or-many" },
      target: { entity: "p", attributes: ["id"], cardinality: "one" },
      identifying: false,
    })
    const childEntity = (name: string) => entity(name, [attr("p_id", "int")])
    const m: ErModel = {
      entities: {
        p: entity("p", [attr("id", "int", { primaryKey: true, nullable: false })]),
        c1: childEntity("c1"),
        c2: childEntity("c2"),
      },
      // Due relazioni con lo stesso nome esplicito: la seconda deve essere rinominata.
      relationships: { a: { ...rel("c1"), name: "fk_condiviso" }, b: { ...rel("c2"), name: "fk_condiviso" } },
    }
    const { text, warnings } = emitDdl(m, "postgres")
    expect(text).toContain('ADD CONSTRAINT "fk_condiviso"')
    expect(text).toContain('ADD CONSTRAINT "fk_condiviso_2"')
    expect(warnings).toContain('1 nomi di vincolo erano già usati: "fk_condiviso" → "fk_condiviso_2"')
  })

  it("avvisa sui tipi estranei al dialetto senza tradurli", () => {
    const m: ErModel = { entities: { t: entity("t", [attr("a", "jsonb"), attr("b", "timestamptz")]) }, relationships: {} }
    const { text, warnings } = emitDdl(m, "mysql")
    expect(text).toContain("`a` jsonb")
    expect(warnings).toContain("2 tipi non appartengono a MySQL: jsonb, timestamptz")
    expect(emitDdl(m, "postgres").warnings).toEqual([])
  })

  it("è deterministico: due chiamate danno la stessa stringa", () => {
    expect(emitDdl(model(), "postgres").text).toBe(emitDdl(model(), "postgres").text)
  })

  it("ordina le relazioni per chiave alfabetica, non per ordine di inserimento", () => {
    // Le chiavi sono inserite fuori ordine (z prima di a): se qualcuno rompesse il
    // `.sort()` su `Object.keys(model.relationships)`, gli ALTER TABLE comparirebbero
    // nell'ordine di inserimento (fk_z prima di fk_a) e questo test lo direbbe.
    const rel = (child: string): Relationship => ({
      source: { entity: child, attributes: ["p_id"], cardinality: "zero-or-many" },
      target: { entity: "p", attributes: ["id"], cardinality: "one" },
      identifying: false,
    })
    const childEntity = (name: string) => entity(name, [attr("p_id", "int")])
    const m: ErModel = {
      entities: {
        p: entity("p", [attr("id", "int", { primaryKey: true, nullable: false })]),
        c1: childEntity("c1"),
        c2: childEntity("c2"),
      },
      relationships: { z: { ...rel("c2"), name: "fk_z" }, a: { ...rel("c1"), name: "fk_a" } },
    }
    const { text } = emitDdl(m, "postgres")
    expect(text.indexOf('ADD CONSTRAINT "fk_a"')).toBeLessThan(text.indexOf('ADD CONSTRAINT "fk_z"'))
  })

  it("non sopprime UNIQUE sulla colonna PRIMARY KEY: il round-trip del Task 4 lo richiede", () => {
    // Chiarimento esplicito del brief: UNIQUE e PRIMARY KEY non si escludono a vicenda.
    // È l'ottimizzazione che un futuro lettore sarebbe tentato di "correggere" come ridondante.
    const m: ErModel = {
      entities: { t: entity("t", [attr("id", "int", { primaryKey: true, nullable: false, unique: true })]) },
      relationships: {},
    }
    const { text } = emitDdl(m, "postgres")
    expect(text).toContain('  "id" int NOT NULL UNIQUE')
  })
})
