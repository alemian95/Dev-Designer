import type { DevDocument } from "../document"
import { splitKey } from "../family"
import type { Issue } from "../issue"
import { unmappableNotice } from "./mappable"
import { typesCompatible } from "./types"

/** Nome di attributo o di colonna nella forma di confronto: `createdAt`, `created_at` e `CreatedAt` coincidono. */
const normalize = (name: string): string => name.toLowerCase().replaceAll("_", "")

/**
 * I problemi dei collegamenti fra famiglie. Legge il documento intero: servono le due famiglie e i
 * collegamenti. Oggi il solo tipo è «mappa su» (classe → entità); il 4b aggiungerà i suoi.
 *
 * **Obiettivi dei problemi.** `edge` è l'id del collegamento **senza** il namespace `link/`, che
 * aggiunge `CanvasOps.validate`, come fa con il prefisso delle famiglie. `node` è la chiave con
 * prefisso della classe, perché è la forma in cui il collegamento la conserva.
 */
export function validateLinks(doc: DevDocument): Issue[] {
  const { links, class: classPart, er } = doc.diagram
  const issues: Issue[] = []
  const bySource = new Map<string, number>()
  for (const [id, link] of Object.entries(links)) {
    const s = splitKey(link.source)
    const t = splitKey(link.target)
    const cls = classPart.model.classes[s.key]
    const entity = er.model.entities[t.key]
    if (!cls || !entity) {
      // Manca uno dei due lati da confrontare: niente avvisi sugli attributi.
      issues.push({
        code: "link-dangling",
        severity: "error",
        message: `Il collegamento «mappa su» fra «${s.key}» e «${t.key}» punta a un elemento che non esiste più`,
        edge: id,
      })
      continue
    }
    bySource.set(link.source, (bySource.get(link.source) ?? 0) + 1)
    // La regola «solo class e abstract» (F1, review finale): una classe collegata che non si mappa su
    // una tabella è un errore sul collegamento, e per quel collegamento non ha senso confrontare gli
    // attributi — come per il pendente, poco sopra.
    const notice = unmappableNotice(cls.stereotype)
    if (notice) {
      issues.push({ code: "link-unmappable", severity: "error", message: `«${s.key}»: ${notice}`, edge: id })
      continue
    }
    for (const attribute of cls.attributes) {
      if (attribute.isStatic) continue
      const column = entity.attributes.find((c) => normalize(c.name) === normalize(attribute.name))
      if (!column) {
        issues.push({
          code: "link-attribute-missing",
          severity: "warning",
          message: `«${s.key}.${attribute.name}» non ha una colonna in «${t.key}»`,
          edge: id,
        })
      } else if (!typesCompatible(attribute.type, column.type)) {
        issues.push({
          code: "link-type-mismatch",
          severity: "warning",
          message: `«${s.key}.${attribute.name}: ${attribute.type}» non è compatibile con «${t.key}.${column.name} ${column.type}»`,
          edge: id,
        })
      }
    }
  }
  for (const [source, count] of bySource) {
    if (count < 2) continue
    issues.push({
      code: "class-maps-multiple",
      severity: "error",
      message: `«${splitKey(source).key}» mappa su ${count} tabelle: una classe si mappa su una tabella sola`,
      node: source,
    })
  }
  return issues
}
