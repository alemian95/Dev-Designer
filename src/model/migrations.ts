import { SCHEMA_VERSION } from "./shared"

type RawDocument = Record<string, unknown>
export type Migration = (raw: RawDocument) => RawDocument

/**
 * 1 → 2: il class diagram guadagna `model.notes`, obbligatorio. Tocca **solo** i diagrammi di
 * tipo `class`: un ER non ha un `ClassModel` e aggiungergli il campo gli farebbe fallire lo schema.
 */
const addClassNotes: Migration = (raw) => {
  const diagram = raw.diagram
  if (diagram === null || typeof diagram !== "object") return raw
  const d = diagram as Record<string, unknown>
  if (d.type !== "class") return raw
  const model = d.model
  if (model === null || typeof model !== "object") return raw
  return { ...raw, diagram: { ...d, model: { ...(model as Record<string, unknown>), notes: {} } } }
}

/**
 * Tabella delle migrazioni indicizzata per versione di partenza:
 * `migrations.get(v)` porta un documento dalla versione v alla v+1.
 */
const migrations: ReadonlyMap<number, Migration> = new Map([[1, addClassNotes]])

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

/**
 * Porta un documento grezzo (già JSON.parse) alla SCHEMA_VERSION corrente. Non valida: lo fa zod dopo.
 *
 * Non muta l'input, ma quando non c'è nessuna migrazione da applicare **restituisce l'input stesso**,
 * non una copia. Nessuna copia difensiva: l'unico chiamante (`parseDocument`) gli passa un oggetto
 * appena uscito da `JSON.parse`, che non condivide con nessuno, e ne consegna il risultato a zod, che
 * copia — chi mette le mani sul documento vede la copia di zod, mai questo alias. Un chiamante nuovo
 * che volesse mutare il risultato deve copiarselo.
 */
export function migrateDocument(raw: unknown): MigrateResult {
  return runMigrations(raw, migrations, SCHEMA_VERSION)
}
