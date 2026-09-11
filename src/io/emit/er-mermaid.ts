import type { Cardinality, ErModel } from "@/model/er/schema"
import type { EmitResult } from "./result"

/**
 * Una «parola» che Mermaid accetta nuda dentro un blocco entità: la regola `ATTRIBUTE_WORD` della
 * grammatica (`erDiagram.jison`), non la pagina di documentazione, che omette la virgola e il
 * punto. Lo spazio non c'è, e sono i tipi con spazio il caso che conta.
 */
const PLAIN_WORD = /^[*A-Za-z_\u00C0-\uFFFF][A-Za-z0-9\-_[\]().,\u00C0-\uFFFF*]*$/

/** Caratteri che un nome di entità citato non ammette (`ENTITY_NAME` nella grammatica). */
const ILLEGAL_IN_NAME = /["%\r\n\v\b\\]/g

/** Il marcatore sta accanto all'entità che descrive: due forme per i due lati della riga. */
const LEFT: Record<Cardinality, string> = { one: "||", "zero-or-one": "|o", many: "}|", "zero-or-many": "}o" }
const RIGHT: Record<Cardinality, string> = { one: "||", "zero-or-one": "o|", many: "|{", "zero-or-many": "o{" }

/**
 * Le occorrenze raccolte durante l'emissione, riunite in un avviso per categoria alla fine:
 * [result.ts](./result.ts) vuole avvisi aggregati, e ognuna di queste categorie scala col numero
 * di entità, attributi o relazioni del diagramma.
 *
 * `illegalNames` è una Map e non una lista perché `entityName` è chiamata sia per la riga di
 * relazione sia per il blocco: la stessa entità arriverebbe due volte.
 */
type Found = {
  skipped: string[]
  illegalNames: Map<string, string>
  backticks: string[]
  quotedLabels: string[]
}

/**
 * Tipo o nome di attributo. Fra backtick solo quando serve: sempre backtick sarebbe una
 * diramazione in meno, ma renderebbe brutta l'uscita normale, e qui l'uscita **è** il prodotto.
 *
 * Un backtick dentro il valore si rimuove: nello stato `block_bq` il lexer accetta `[^`]+` e non
 * esiste modo di sfuggirlo. Un valore vuoto diventa `_`: in Mermaid il tipo è solo un'etichetta e
 * non produce SQL non valido come nel DDL, quindi il fallback è diverso di proposito.
 */
function word(value: string, what: string, found: Found): string {
  const trimmed = value.trim()
  const clean = trimmed.replaceAll("`", "")
  if (clean !== trimmed) found.backticks.push(what)
  if (clean === "") return "_"
  return PLAIN_WORD.test(clean) ? clean : `\`${clean}\``
}

/**
 * Nome di entità, sempre citato: citare sempre evita di decidere caso per caso e fa passare
 * `pub.utenti` con il punto. I caratteri che la forma citata non ammette diventano `_`.
 */
function entityName(key: string, found: Found): string {
  const clean = key.replaceAll(ILLEGAL_IN_NAME, "_")
  if (clean !== key) found.illegalNames.set(key, clean)
  return `"${clean}"`
}

/**
 * Serializza il modello come `erDiagram`.
 *
 * La nullabilità non viene emessa: Mermaid ER ha solo PK/FK/UK, e il `?` sul tipo che la
 * documentazione cita non compare in `ATTRIBUTE_WORD`. `NOT NULL` vive nel DDL.
 */
export function emitMermaid(model: ErModel): EmitResult {
  const found: Found = { skipped: [], illegalNames: new Map(), backticks: [], quotedLabels: [] }
  const out = ["erDiagram"]

  for (const key of Object.keys(model.relationships).sort()) {
    const rel = model.relationships[key]!
    if (!(rel.source.entity in model.entities) || !(rel.target.entity in model.entities)) {
      found.skipped.push(key)
      continue
    }
    // Il padre (`target`, il lato referenziato) a sinistra e il figlio (`source`, il lato della FK)
    // a destra: è il verso in cui la riga si legge.
    const line = rel.identifying ? "--" : ".."
    const rawLabel = rel.name ?? ""
    const label = rawLabel.replaceAll('"', "")
    if (label !== rawLabel) found.quotedLabels.push(key)
    out.push(
      `  ${entityName(rel.target.entity, found)} ${LEFT[rel.target.cardinality]}${line}${RIGHT[rel.source.cardinality]}` +
        ` ${entityName(rel.source.entity, found)} : "${label}"`,
    )
  }

  for (const key of Object.keys(model.entities).sort()) {
    const e = model.entities[key]!
    out.push(`  ${entityName(key, found)} {`)
    for (const a of e.attributes) {
      const keyFlags: string[] = []
      if (a.primaryKey) keyFlags.push("PK")
      if (a.foreignKey) keyFlags.push("FK")
      if (a.unique) keyFlags.push("UK")
      const type = word(a.type, `il tipo di ${key}.${a.name}`, found)
      const name = word(a.name, `il nome di ${key}.${a.name}`, found)
      out.push(`    ${type} ${name}${keyFlags.length > 0 ? ` ${keyFlags.join(",")}` : ""}`)
    }
    out.push("  }")
  }

  const warnings: string[] = []
  if (found.skipped.length > 0) {
    warnings.push(`${found.skipped.length} relazioni saltate, un estremo non è nel diagramma: ${found.skipped.join(", ")}`)
  }
  if (found.illegalNames.size > 0) {
    const list = [...found.illegalNames].map(([raw, clean]) => `"${raw}" → "${clean}"`).join(", ")
    warnings.push(`${found.illegalNames.size} nomi di entità contengono caratteri che Mermaid non ammette: ${list}`)
  }
  if (found.backticks.length > 0) {
    warnings.push(
      `${found.backticks.length} valori avevano backtick, rimossi perché Mermaid non li sa sfuggire: ${found.backticks.join(", ")}`,
    )
  }
  if (found.quotedLabels.length > 0) {
    warnings.push(
      `${found.quotedLabels.length} etichette di relazione avevano virgolette, rimosse perché Mermaid non le sa sfuggire nell'etichetta:` +
        ` ${found.quotedLabels.join(", ")}`,
    )
  }
  return { text: `${out.join("\n")}\n`, warnings }
}
