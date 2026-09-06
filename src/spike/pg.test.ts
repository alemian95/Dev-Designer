/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs"
import { expect, test } from "vitest"
import { loadModule, parse } from "libpg-query"

// Il dump reale è il caso da superare; il sintetico a 200 tabelle è la misura di scala del criterio go/no-go.
const files = ["spike/fixtures/postgres.sql", "spike/fixtures/postgres.synthetic.sql"].filter(existsSync)

test("libpg-query parsa il dump intero", async () => {
  if (files.length === 0) throw new Error("nessuna fixture: esegui node scripts/gen-pg-dump.mjs")

  // `libpg-query` avvia l'istanziazione del WASM già all'import: questa attesa non la misura, serve
  // solo a tenere fuori dai parse qui sotto il costo di init (~12 ms misurati a parte in Node).
  await loadModule()

  for (const file of files) {
    const raw = readFileSync(file, "utf8")
    // pg_dump emette i meta-comandi psql `\restrict` / `\unrestrict`: non sono SQL e libpg-query li rifiuta.
    const skipped = raw.split("\n").filter((l) => l.startsWith("\\")).length
    const sql = raw
      .split("\n")
      .filter((l) => !l.startsWith("\\"))
      .join("\n")

    const t0 = performance.now()
    const result = await parse(sql)
    const ms = Math.round(performance.now() - t0)

    const kinds = new Map<string, number>()
    for (const s of result.stmts) {
      const kind = Object.keys(s.stmt ?? {})[0] ?? "?"
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    }
    console.log({ file, bytes: sql.length, skipped, ms, stmts: result.stmts.length, kinds: Object.fromEntries(kinds) })

    expect(kinds.get("CreateStmt") ?? 0).toBeGreaterThan(0)
    expect(kinds.get("AlterTableStmt") ?? 0).toBeGreaterThan(0)
  }
})
