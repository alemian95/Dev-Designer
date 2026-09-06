import { SCHEMA_VERSION } from "./document"

type RawDocument = Record<string, unknown>
type Migration = (raw: RawDocument) => RawDocument

/** migrations[v] porta un documento dalla versione v alla v+1. Oggi vuota: la versione 1 è la prima. */
const migrations: readonly Migration[] = []

export type MigrateResult = { ok: true; value: unknown } | { ok: false; error: string }

/** Porta un documento grezzo (già JSON.parse) alla SCHEMA_VERSION corrente. Non valida: lo fa zod dopo. */
export function migrateDocument(raw: unknown): MigrateResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "il documento deve essere un oggetto JSON" }
  }
  let doc = raw as RawDocument
  const version = doc.schemaVersion
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "schemaVersion mancante o non valida" }
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: `schemaVersion ${version} più recente di quella supportata (${SCHEMA_VERSION})` }
  }
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = migrations[v]
    if (!step) return { ok: false, error: `manca la migrazione dalla versione ${v}` }
    doc = { ...step(doc), schemaVersion: v + 1 }
  }
  return { ok: true, value: doc }
}
