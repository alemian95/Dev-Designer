import type { ErModel } from "./schema"

export type IssueCode =
  | "entity-without-pk"
  | "duplicate-attribute"
  | "fk-without-relationship"
  | "dangling-relationship"
  | "entity-name-clash"

export type IssueSeverity = "error" | "warning"

export interface Issue {
  code: IssueCode
  severity: IssueSeverity
  message: string
  /** Chiave dell'entità coinvolta, se c'è. */
  entity?: string
  /** Chiave della relazione coinvolta, se c'è. */
  relationship?: string
}

/** Validazione live del modello ER. Funzione pura: nessun accesso allo store. */
export function validateEr(model: ErModel): Issue[] {
  const issues: Issue[] = []
  const byLowerKey = new Map<string, string>()

  for (const [key, entity] of Object.entries(model.entities)) {
    const lower = key.toLowerCase()
    const clash = byLowerKey.get(lower)
    if (clash) {
      issues.push({ code: "entity-name-clash", severity: "warning", entity: key, message: `"${key}" e "${clash}" differiscono solo per maiuscole` })
    } else {
      byLowerKey.set(lower, key)
    }

    if (!entity.attributes.some((a) => a.primaryKey)) {
      issues.push({ code: "entity-without-pk", severity: "warning", entity: key, message: `"${key}" non ha una primary key` })
    }

    const seen = new Set<string>()
    for (const a of entity.attributes) {
      if (seen.has(a.name)) {
        issues.push({ code: "duplicate-attribute", severity: "error", entity: key, message: `attributo "${a.name}" duplicato in "${key}"` })
      }
      seen.add(a.name)
    }

    const hasOutgoing = Object.values(model.relationships).some((r) => r.source.entity === key)
    for (const a of entity.attributes) {
      if (a.foreignKey && !hasOutgoing) {
        issues.push({ code: "fk-without-relationship", severity: "warning", entity: key, message: `"${key}.${a.name}" è FK ma nessuna relazione parte da "${key}"` })
      }
    }
  }

  for (const [key, rel] of Object.entries(model.relationships)) {
    for (const end of [rel.source, rel.target]) {
      const entity = model.entities[end.entity]
      if (!entity) {
        issues.push({ code: "dangling-relationship", severity: "error", relationship: key, message: `relazione "${key}": entità "${end.entity}" inesistente` })
        continue
      }
      for (const name of end.attributes) {
        if (!entity.attributes.some((a) => a.name === name)) {
          issues.push({ code: "dangling-relationship", severity: "error", relationship: key, message: `relazione "${key}": attributo "${end.entity}.${name}" inesistente` })
        }
      }
    }
  }

  return issues
}
