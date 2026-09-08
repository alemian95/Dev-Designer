import { entityKey, type Attribute, type Cardinality, type Entity, type ErModel, type Relationship } from "@/model/document"
import type { SqlColumn, SqlForeignKey, SqlTable } from "./schema"

export interface MapInput {
  /** Solo le tabelle scelte nel dialog. */
  tables: SqlTable[]
  /** Il modello corrente: serve a risolvere i riferimenti verso entità già sul canvas. */
  model: ErModel
}

export interface MapOutput {
  /** Chiave = entityKey, come impone il refine di ErModelSchema. */
  entities: Record<string, Entity>
  /** Lista, non record: le chiavi si assegnano nella recipe, dopo la potatura. */
  relationships: Relationship[]
  warnings: string[]
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length > 0 && a.length === b.length && a.every((x) => b.includes(x))

function attribute(table: SqlTable, column: SqlColumn, fkColumns: ReadonlySet<string>): Attribute {
  const primaryKey = table.primaryKey.includes(column.name)
  return {
    name: column.name,
    type: column.type,
    primaryKey,
    foreignKey: fkColumns.has(column.name),
    // La PRIMARY KEY implica NOT NULL in entrambi i dialetti, anche dove il DDL non lo scrive.
    nullable: column.nullable && !primaryKey,
    // Un UNIQUE su più colonne non è rappresentabile sull'attributo: non marca nessuna delle sue colonne.
    unique: table.unique.some((u) => u.length === 1 && u[0] === column.name),
  }
}

/** Il nome senza schema, per risolvere i riferimenti che non lo qualificano. */
const bareName = (key: string): string => (key.includes(".") ? key.slice(key.indexOf(".") + 1) : key)

export function mapToEr({ tables, model }: MapInput): MapOutput {
  const warnings: string[] = []
  const entities: Record<string, Entity> = {}
  for (const t of tables) {
    const fkColumns = new Set(t.foreignKeys.flatMap((f) => f.columns))
    const entity: Entity = {
      name: t.name,
      ...(t.schema ? { schema: t.schema } : {}),
      attributes: t.columns.map((c) => attribute(t, c, fkColumns)),
    }
    entities[entityKey(entity)] = entity
  }

  // Le entità già sul canvas contano quanto quelle in arrivo: una FK può puntare a una di quelle.
  const known = new Set([...Object.keys(entities), ...Object.keys(model.entities)])
  const byBareName = new Map<string, string[]>()
  for (const key of known) {
    const bare = bareName(key)
    byBareName.set(bare, [...(byBareName.get(bare) ?? []), key])
  }

  const resolve = (fk: SqlForeignKey, from: string): string | null => {
    if (fk.refSchema) {
      const key = `${fk.refSchema}.${fk.refTable}`
      if (known.has(key)) return key
      warnings.push(`relazione saltata: ${from} punta a "${key}", che non è nel diagramma`)
      return null
    }
    const matches = byBareName.get(fk.refTable) ?? []
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) {
      warnings.push(`relazione saltata: il riferimento a "${fk.refTable}" da ${from} è ambiguo, corrisponde a ${matches.join(" e ")}`)
      return null
    }
    warnings.push(`relazione saltata: ${from} punta a "${fk.refTable}", che non è nel diagramma`)
    return null
  }

  const relationships: Relationship[] = []
  let compositeUnique = 0
  for (const t of tables) {
    compositeUnique += t.unique.filter((u) => u.length > 1).length
    const sourceKey = entityKey({ name: t.name, schema: t.schema })
    const nullableOf = new Map(t.columns.map((c) => [c.name, c.nullable]))
    for (const fk of t.foreignKeys) {
      // Una FK senza colonne sul lato figlio è un DDL malformato (richiederebbe una FOREIGN KEY ()
      // con lista vuota, sintatticamente non valida): il caso è irraggiungibile in pratica, ma va
      // scartato esplicitamente per non produrre una relazione con attributes: [], indistinguibile
      // da una disegnata a mano (vedi RelationshipEndSchema.attributes). Il comando di import si fida
      // di quell'invariante per potare solo le relazioni derivate da FK al re-import.
      if (fk.columns.length === 0) {
        const label = fk.name ? `"${fk.name}"` : `su ${sourceKey}`
        warnings.push(`relazione saltata: la chiave esterna ${label} non specifica colonne`)
        continue
      }
      const targetKey = resolve(fk, `${sourceKey}(${fk.columns.join(", ")})`)
      if (!targetKey) continue

      // REFERENCES senza lista di colonne è sintassi SQL standard e valida: significa "la PRIMARY
      // KEY della tabella referenziata". Si risolve qui e non nell'adapter perché qui la tabella
      // target è già nota e la sua primaryKey a portata di mano, e la correzione vale così per
      // entrambi i dialetti in un colpo solo.
      let refColumns = fk.refColumns
      if (refColumns.length === 0) {
        const targetPk = (entities[targetKey] ?? model.entities[targetKey])?.attributes.filter((a) => a.primaryKey).map((a) => a.name) ?? []
        if (targetPk.length === 0) {
          const label = fk.name ? `"${fk.name}"` : `su ${sourceKey}`
          warnings.push(`relazione saltata: la chiave esterna ${label} non indica le colonne referenziate e "${targetKey}" non ha una PRIMARY KEY`)
          continue
        }
        refColumns = targetPk
      }

      // Colonna sconosciuta: prudenza, la si tratta come nullabile.
      const optional = fk.columns.some((c) => nullableOf.get(c) ?? true)
      // Se le colonne della FK sono la PK o un UNIQUE del figlio, per ogni padre c'è al più un figlio.
      const oneToOne = sameSet(fk.columns, t.primaryKey) || t.unique.some((u) => sameSet(u, fk.columns))
      const source: Cardinality = oneToOne ? "zero-or-one" : "zero-or-many"
      const target: Cardinality = optional ? "zero-or-one" : "one"
      relationships.push({
        ...(fk.name ? { name: fk.name } : {}),
        source: { entity: sourceKey, attributes: fk.columns, cardinality: source },
        target: { entity: targetKey, attributes: refColumns, cardinality: target },
        identifying: t.primaryKey.length > 0 && fk.columns.every((c) => t.primaryKey.includes(c)),
      })
    }
  }

  if (compositeUnique > 0) {
    warnings.push(`${compositeUnique} vincoli UNIQUE su più colonne non sono rappresentabili nel modello e sono stati ignorati`)
  }

  return { entities, relationships, warnings }
}
