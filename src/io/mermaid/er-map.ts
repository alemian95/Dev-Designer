import type { ParseWarning } from "@/io/ddl/schema"
import { entityKey, type Attribute, type Cardinality, type Entity, type Relationship } from "@/model/er/schema"
import { aggregate, type Finding } from "./common"
import type { ErAst, ErCardinalityToken } from "./er-parse"

export interface ErFragment {
  entities: Record<string, Entity>
  relationships: Relationship[]
  warnings: ParseWarning[]
}

type ErMapCategory = "alias" | "comment" | "duplicate" | "mdParent"

const MESSAGES: Record<ErMapCategory, string> = {
  alias: "Alias delle entità scartati, il nome resta l'id",
  comment: "Commenti degli attributi scartati",
  duplicate: "Attributi ripetuti nella stessa entità, si tiene il primo",
  mdParent: "Cardinalità «u» (genitore master-detail) letta come «esattamente uno»",
}

/** I gettoni della grammatica sui quattro valori del modello (spec §4.1). `MD_PARENT` non ha un equivalente. */
const CARDINALITY: Record<ErCardinalityToken, Cardinality> = {
  ZERO_OR_ONE: "zero-or-one",
  ZERO_OR_MORE: "zero-or-many",
  ONE_OR_MORE: "many",
  ONLY_ONE: "one",
  MD_PARENT: "one",
}

/** `pub.utenti` → schema `pub`, nome `utenti`: si spezza sul **primo** punto (spec §4.1). */
function splitName(id: string): Pick<Entity, "name" | "schema"> {
  const dot = id.indexOf(".")
  if (dot <= 0 || dot === id.length - 1) return { name: id }
  return { schema: id.slice(0, dot), name: id.slice(dot + 1) }
}

/**
 * Applica all'AST le regole della spec §4.1 e restituisce un frammento del modello ER. Non vede il
 * documento: sostituzione, chiavi delle relazioni e posizioni le decide il comando di import.
 * `text` serve solo a dire le righe negli avvisi.
 */
export function mapEr(ast: ErAst, text: string): ErFragment {
  const findings: Finding<ErMapCategory>[] = []
  const entities: Record<string, Entity> = {}

  const ensure = (id: string): string => {
    const parts = splitName(id)
    const key = entityKey(parts)
    entities[key] ??= { ...parts, attributes: [] }
    return key
  }

  for (const decl of ast.entities) {
    const key = ensure(decl.id)
    if (decl.alias !== null) findings.push({ category: "alias", at: decl.at, subject: decl.id })
    const entity = entities[key]!
    for (const a of decl.attributes) {
      if (a.comment !== null) findings.push({ category: "comment", at: a.at, subject: `${key}.${a.name}` })
      if (entity.attributes.some((b) => b.name === a.name)) {
        findings.push({ category: "duplicate", at: a.at, subject: `${key}.${a.name}` })
        continue
      }
      const primaryKey = a.keys.includes("PK")
      const attribute: Attribute = {
        name: a.name,
        type: a.type,
        primaryKey,
        foreignKey: a.keys.includes("FK"),
        // Mermaid non esprime la nullabilità: si legge come una colonna SQL senza NOT NULL (spec §4.1).
        nullable: !primaryKey,
        unique: a.keys.includes("UK"),
      }
      entity.attributes.push(attribute)
    }
  }

  const relationships = ast.relationships.map((r): Relationship => {
    if (r.leftCard === "MD_PARENT" || r.rightCard === "MD_PARENT") findings.push({ category: "mdParent", at: r.at })
    // Sinistra = padre (`target`), destra = figlio (`source`), sempre: è il verso dell'export (spec §4.1).
    const target = ensure(r.left)
    const source = ensure(r.right)
    return {
      ...(r.label === null ? {} : { name: r.label }),
      source: { entity: source, attributes: [], cardinality: CARDINALITY[r.rightCard] },
      target: { entity: target, attributes: [], cardinality: CARDINALITY[r.leftCard] },
      identifying: r.identifying,
    }
  })

  return { entities, relationships, warnings: aggregate(findings, text, MESSAGES) }
}
