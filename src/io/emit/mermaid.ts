import type { Cardinality, ErModel } from "@/model/document"
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
 * Tipo o nome di attributo. Fra backtick solo quando serve: sempre backtick sarebbe una
 * diramazione in meno, ma renderebbe brutta l'uscita normale, e qui l'uscita **è** il prodotto.
 *
 * Un backtick dentro il valore si rimuove: nello stato `block_bq` il lexer accetta `[^`]+` e non
 * esiste modo di sfuggirlo. Un valore vuoto diventa `_`: in Mermaid il tipo è solo un'etichetta e
 * non produce SQL non valido come nel DDL, quindi il fallback è diverso di proposito.
 */
function word(value: string, what: string, warnings: string[]): string {
  const trimmed = value.trim()
  const clean = trimmed.replaceAll("`", "")
  if (clean !== trimmed) warnings.push(`${what}: i backtick sono stati rimossi, Mermaid non li sa sfuggire`)
  if (clean === "") return "_"
  return PLAIN_WORD.test(clean) ? clean : `\`${clean}\``
}

/**
 * Nome di entità, sempre citato: citare sempre evita di decidere caso per caso e fa passare
 * `pub.utenti` con il punto. I caratteri che la forma citata non ammette diventano `_`.
 */
function entityName(key: string, warnings: string[]): string {
  const clean = key.replaceAll(ILLEGAL_IN_NAME, "_")
  if (clean !== key) warnings.push(`il nome "${key}" contiene caratteri che Mermaid non ammette: emesso come "${clean}"`)
  return `"${clean}"`
}

/**
 * Serializza il modello come `erDiagram`.
 *
 * La nullabilità non viene emessa: Mermaid ER ha solo PK/FK/UK, e il `?` sul tipo che la
 * documentazione cita non compare in `ATTRIBUTE_WORD`. `NOT NULL` vive nel DDL.
 */
export function emitMermaid(model: ErModel): EmitResult {
  const warnings: string[] = []
  const out = ["erDiagram"]

  for (const key of Object.keys(model.relationships).sort()) {
    const rel = model.relationships[key]!
    if (!(rel.source.entity in model.entities) || !(rel.target.entity in model.entities)) {
      warnings.push(`relazione "${key}" saltata: un estremo non è nel diagramma`)
      continue
    }
    // Il padre (`target`, il lato referenziato) a sinistra e il figlio (`source`, il lato della FK)
    // a destra: è il verso in cui la riga si legge.
    const linea = rel.identifying ? "--" : ".."
    const etichetta = (rel.name ?? "").replaceAll('"', "")
    out.push(
      `  ${entityName(rel.target.entity, warnings)} ${LEFT[rel.target.cardinality]}${linea}${RIGHT[rel.source.cardinality]}` +
        ` ${entityName(rel.source.entity, warnings)} : "${etichetta}"`,
    )
  }

  for (const key of Object.keys(model.entities).sort()) {
    const e = model.entities[key]!
    out.push(`  ${entityName(key, warnings)} {`)
    for (const a of e.attributes) {
      const chiavi: string[] = []
      if (a.primaryKey) chiavi.push("PK")
      if (a.foreignKey) chiavi.push("FK")
      if (a.unique) chiavi.push("UK")
      const tipo = word(a.type, `il tipo di ${key}.${a.name}`, warnings)
      const nome = word(a.name, `il nome di ${key}.${a.name}`, warnings)
      out.push(`    ${tipo} ${nome}${chiavi.length > 0 ? ` ${chiavi.join(",")}` : ""}`)
    }
    out.push("  }")
  }

  // `entityName` è chiamata sia per la relazione sia per il blocco: lo stesso avviso arriverebbe due volte.
  return { text: `${out.join("\n")}\n`, warnings: [...new Set(warnings)] }
}
