import { SCHEMA_VERSION } from "./document"

type RawDocument = Record<string, unknown>
export type Migration = (raw: RawDocument) => RawDocument

/**
 * Tabella delle migrazioni indicizzata per versione di partenza:
 * `migrations.get(v)` porta un documento dalla versione v alla v+1.
 * Oggi vuota: la versione 1 è la prima.
 */
const migrations: ReadonlyMap<number, Migration> = new Map()

export type MigrateResult = { ok: true; value: unknown } | { ok: false; error: string }

/** Applica in sequenza gli step (chiave = versione di partenza) fino a `target`. Non valida: lo fa zod dopo. */
export function runMigrations(
  raw: unknown,
  steps: ReadonlyMap<number, Migration>,
  target: number,
): MigrateResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "il documento deve essere un oggetto JSON" }
  }
  let doc = raw as RawDocument
  const version = doc.schemaVersion
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "schemaVersion mancante o non valida" }
  }
  if (version > target) {
    return { ok: false, error: `schemaVersion ${version} più recente di quella supportata (${target})` }
  }
  for (let v = version; v < target; v++) {
    const step = steps.get(v)
    if (!step) return { ok: false, error: `manca la migrazione dalla versione ${v}` }
    doc = { ...step(doc), schemaVersion: v + 1 }
  }
  return { ok: true, value: doc }
}

/** Porta un documento grezzo (già JSON.parse) alla SCHEMA_VERSION corrente. Non valida: lo fa zod dopo. */
export function migrateDocument(raw: unknown): MigrateResult {
  return runMigrations(raw, migrations, SCHEMA_VERSION)
}
