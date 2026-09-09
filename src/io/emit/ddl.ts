import type { Dialect } from "@/io/ddl/schema"
import type { Attribute, Entity, ErModel, Relationship } from "@/model/document"
import type { EmitResult } from "./result"
import { DIALECT_LABEL, foreignTypes } from "./sql-types"

/**
 * Tipo emesso quando l'attributo non ne ha uno. È l'**unico** posto in cui questo emettitore
 * inventa, e lo fa perché l'alternativa è una colonna senza tipo, cioè un file che non gira.
 * Il caso è raggiungibile: `AttributeSchema.type` è `z.string()` senza minimo.
 */
const FALLBACK_TYPE = "text"

/**
 * Cita e sfugge un identificatore. Il valore dentro i delimitatori va **sempre** sfuggito: il nome
 * di una relazione lo digita l'utente e può contenere qualunque cosa. È la lezione dell'export SVG,
 * dove un valore infilato grezzo dentro un delimitatore produceva un file malformato solo in
 * produzione, applicata prima invece che dopo.
 */
function quote(dialect: Dialect, name: string): string {
  return dialect === "postgres" ? `"${name.replaceAll('"', '""')}"` : `\`${name.replaceAll("`", "``")}\``
}

/**
 * Nome qualificato. Schema e nome si leggono dai campi dell'entità, **non** spezzando `entityKey`
 * sul primo punto: il punto è ammesso anche dentro un nome, e `map.ts` documenta già perché quella
 * scorciatoia è sbagliata.
 */
const qualified = (dialect: Dialect, e: Entity): string =>
  e.schema ? `${quote(dialect, e.schema)}.${quote(dialect, e.name)}` : quote(dialect, e.name)

const columns = (dialect: Dialect, names: readonly string[]): string =>
  names.map((n) => quote(dialect, n)).join(", ")

function column(dialect: Dialect, a: Attribute): string {
  const parts = [quote(dialect, a.name), a.type.trim() || FALLBACK_TYPE]
  if (!a.nullable) parts.push("NOT NULL")
  // UNIQUE anche su una colonna della PRIMARY KEY: ridondante ma fedele al modello, e una
  // diramazione in meno. Il round-trip lo pretende, altrimenti il flag si perderebbe alla riparse.
  if (a.unique) parts.push("UNIQUE")
  return `  ${parts.join(" ")}`
}

/** `PRIMARY KEY` come vincolo di tabella: regge la chiave composta senza un secondo percorso. */
function createTable(dialect: Dialect, e: Entity): string {
  const lines = e.attributes.map((a) => column(dialect, a))
  const pk = e.attributes.filter((a) => a.primaryKey).map((a) => a.name)
  if (pk.length > 0) lines.push(`  PRIMARY KEY (${columns(dialect, pk)})`)
  return `CREATE TABLE ${qualified(dialect, e)} (\n${lines.join(",\n")}\n);`
}

/**
 * Nome del vincolo: quello della relazione se c'è, altrimenti la convenzione di Postgres.
 * I nomi si deduplicano perché MySQL li pretende unici per **database**, non per tabella: due
 * tabelle con la stessa colonna FK verso la stessa destinazione collidono.
 */
function constraintName(rel: Relationship, child: Entity, used: Set<string>, warnings: string[]): string {
  const base = rel.name?.trim() || `${child.name}_${rel.source.attributes.join("_")}_fkey`
  let name = base
  for (let i = 2; used.has(name); i++) name = `${base}_${i}`
  if (name !== base) warnings.push(`il nome di vincolo "${base}" era già usato: emesso come "${name}"`)
  used.add(name)
  return name
}

/**
 * Serializza il modello come DDL del dialetto scelto.
 *
 * Strutturale per necessità, non per pigrizia: il modello non contiene DEFAULT, CHECK, indici,
 * ON DELETE, AUTO_INCREMENT né UNIQUE su più colonne, quindi un dump che entra ed esce non è
 * identico all'originale. È una proprietà del modello, e l'intestazione del file lo dice.
 */
export function emitDdl(model: ErModel, dialect: Dialect): EmitResult {
  const warnings: string[] = []
  const out: string[] = [
    `-- Dev Designer — export ${DIALECT_LABEL[dialect]}`,
    "-- Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più colonne:",
    "-- questo DDL descrive tabelle, colonne, chiavi e riferimenti.",
    "",
  ]
  const keys = Object.keys(model.entities).sort()

  // Senza, il DDL non gira su un database vuoto. In MySQL SCHEMA è sinonimo di DATABASE.
  const schemas = [...new Set(keys.map((k) => model.entities[k]!.schema).filter((s) => s !== undefined))].sort()
  if (schemas.length > 0) {
    for (const s of schemas) out.push(`CREATE SCHEMA IF NOT EXISTS ${quote(dialect, s)};`)
    out.push("")
  }

  const withoutColumns: string[] = []
  const withoutType: string[] = []
  for (const key of keys) {
    const e = model.entities[key]!
    for (const a of e.attributes) if (!a.type.trim()) withoutType.push(`${key}.${a.name}`)
    if (e.attributes.length === 0) {
      // `CREATE TABLE x ()` non è valido in nessuno dei due dialetti: un file che non gira è
      // peggio di un file con un commento al posto di una tabella.
      withoutColumns.push(key)
      out.push(`-- tabella ${qualified(dialect, e)}: nessuna colonna definita nel diagramma`, "")
      continue
    }
    out.push(createTable(dialect, e), "")
  }

  const used = new Set<string>()
  let handDrawn = 0
  const withoutPk = new Set<string>()
  for (const key of Object.keys(model.relationships).sort()) {
    const rel = model.relationships[key]!
    const child = model.entities[rel.source.entity]
    const parent = model.entities[rel.target.entity]
    if (!child || !parent) {
      warnings.push(`relazione "${key}" saltata: un estremo non è nel diagramma`)
      continue
    }
    if (rel.source.attributes.length === 0 || rel.target.attributes.length === 0) {
      // Relazione disegnata a mano (ADR 0003): non ha colonne, quindi non esiste una FOREIGN KEY
      // da scrivere. Il commento resta dov'è utile, cioè nel file che un dev finisce a mano.
      handDrawn++
      out.push(`-- relazione ${qualified(dialect, child)} → ${qualified(dialect, parent)}: colonne non definite nel diagramma`, "")
      continue
    }
    if (!parent.attributes.some((a) => a.primaryKey)) withoutPk.add(rel.target.entity)
    out.push(
      `ALTER TABLE ${qualified(dialect, child)}\n  ADD CONSTRAINT ${quote(dialect, constraintName(rel, child, used, warnings))}` +
        ` FOREIGN KEY (${columns(dialect, rel.source.attributes)})` +
        ` REFERENCES ${qualified(dialect, parent)} (${columns(dialect, rel.target.attributes)});`,
      "",
    )
  }

  const foreign = foreignTypes(keys.flatMap((k) => model.entities[k]!.attributes.map((a) => a.type)), dialect)
  if (foreign.length > 0) {
    warnings.push(`${foreign.length} tipi non appartengono a ${DIALECT_LABEL[dialect]}: ${foreign.join(", ")}`)
  }
  if (withoutType.length > 0) {
    warnings.push(`${withoutType.length} colonne senza tipo sono state emesse come ${FALLBACK_TYPE}: ${withoutType.join(", ")}`)
  }
  if (withoutColumns.length > 0) {
    warnings.push(`${withoutColumns.length} entità senza colonne non producono una tabella: ${withoutColumns.join(", ")}`)
  }
  if (handDrawn > 0) {
    warnings.push(`${handDrawn} relazioni disegnate a mano non hanno colonne: nessuna FOREIGN KEY emessa, solo un commento`)
  }
  if (withoutPk.size > 0) {
    warnings.push(
      `${withoutPk.size} entità referenziate non hanno PRIMARY KEY: in MySQL l'ALTER TABLE fallirà (${[...withoutPk].sort().join(", ")})`,
    )
  }

  return { text: `${out.join("\n").trimEnd()}\n`, warnings }
}
