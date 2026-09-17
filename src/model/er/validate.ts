import type { Issue } from "../issue"
import type { ErModel } from "./schema"

/**
 * Le chiavi raggruppate per forma minuscola. Un gruppo con più di una chiave è una collisione, e
 * il gruppo intero serve al messaggio: con tre nomi che collidono, citarne uno solo nasconde il terzo.
 */
function groupByLowerKey(entities: ErModel["entities"]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const key of Object.keys(entities)) {
    const group = groups.get(key.toLowerCase())
    if (group) group.push(key)
    else groups.set(key.toLowerCase(), [key])
  }
  return groups
}

/** Validazione live del modello ER. Funzione pura: nessun accesso allo store. */
export function validateEr(model: ErModel): Issue[] {
  const issues: Issue[] = []
  const clashes = groupByLowerKey(model.entities)

  for (const [key, entity] of Object.entries(model.entities)) {
    // Ogni entità del gruppo prende il suo issue, la prima compresa: il pannello evidenzia il nodo
    // dell'issue, e lasciar fuori la prima la rendeva l'unica non raggiungibile dal pannello.
    const others = (clashes.get(key.toLowerCase()) ?? []).filter((k) => k !== key)
    if (others.length > 0) {
      const list = others.map((k) => `"${k}"`).join(", ")
      issues.push({ code: "entity-name-clash", severity: "warning", node: key, message: `"${key}" differisce solo per maiuscole da ${list}` })
    }

    if (!entity.attributes.some((a) => a.primaryKey)) {
      issues.push({ code: "entity-without-pk", severity: "warning", node: key, message: `"${key}" non ha una primary key` })
    }

    const seen = new Set<string>()
    for (const a of entity.attributes) {
      if (seen.has(a.name)) {
        issues.push({ code: "duplicate-attribute", severity: "error", node: key, message: `attributo "${a.name}" duplicato in "${key}"` })
      }
      seen.add(a.name)
    }

    // Per attributo e non per entità: con due FK verso tabelle diverse e una sola relazione, il
    // controllo a livello di entità taceva sulla seconda.
    const outgoing = Object.values(model.relationships).filter((r) => r.source.entity === key)
    // Una relazione disegnata a mano non nomina colonne (ADR 0003): copre l'entità, non un
    // attributo in particolare. Pretendere che nomini la FK segnalerebbe ogni arco tracciato a mano.
    const drawnByHand = outgoing.some((r) => r.source.attributes.length === 0)
    for (const a of entity.attributes) {
      if (!a.foreignKey || drawnByHand) continue
      if (outgoing.some((r) => r.source.attributes.includes(a.name))) continue
      issues.push({ code: "fk-without-relationship", severity: "warning", node: key, message: `"${key}.${a.name}" è FK ma nessuna relazione la collega` })
    }
  }

  for (const [key, rel] of Object.entries(model.relationships)) {
    for (const end of [rel.source, rel.target]) {
      const entity = model.entities[end.entity]
      if (!entity) {
        issues.push({ code: "dangling-relationship", severity: "error", edge: key, message: `relazione "${key}": entità "${end.entity}" inesistente` })
        continue
      }
      for (const name of end.attributes) {
        if (!entity.attributes.some((a) => a.name === name)) {
          issues.push({ code: "dangling-relationship", severity: "error", edge: key, message: `relazione "${key}": attributo "${end.entity}.${name}" inesistente` })
        }
      }
    }
  }

  return issues
}
