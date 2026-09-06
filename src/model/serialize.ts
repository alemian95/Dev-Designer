import { DocumentSchema, type DevDocument } from "./document"
import { migrateDocument } from "./migrations"

export type ParseResult = { ok: true; document: DevDocument } | { ok: false; error: string }

/** Replacer di JSON.stringify: ordina alfabeticamente le chiavi di ogni oggetto, così il diff in git è leggibile. */
function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value
  const obj = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]))
}

export function toJson(doc: DevDocument): string {
  return JSON.stringify(doc, sortKeys, 2) + "\n"
}

/** Il file da disco è un confine di fiducia: JSON → migrazione → validazione zod. */
export function parseDocument(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `JSON non valido: ${(e as Error).message}` }
  }
  const migrated = migrateDocument(raw)
  if (!migrated.ok) return migrated
  const result = DocumentSchema.safeParse(migrated.value)
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  }
  return { ok: true, document: result.data }
}
