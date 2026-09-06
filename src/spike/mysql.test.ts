/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs"
import { expect, test } from "vitest"
import { Parser } from "node-sql-parser/build/mysql"

// Il dump reale è il caso da superare; il sintetico a 200 tabelle è la misura di scala del criterio go/no-go.
const REAL = "spike/fixtures/mysql.sql"
const files = [REAL, "spike/fixtures/mysql.synthetic.sql"].filter(existsSync)
// `test.each([])` non registrerebbe nulla e passerebbe in silenzio: il throw in collezione è il guard.
if (files.length === 0) throw new Error("nessuna fixture: esegui node scripts/gen-mysql-dump.mjs")

// ponytail: split su ";" a fine riga; regge su dump --no-data, non su INSERT con ";" nelle stringhe
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("/*!") && !s.startsWith("/*M!"))
}

test.each(files)("node-sql-parser parsa %s statement per statement", (file) => {
  const sql = readFileSync(file, "utf8")
  const parser = new Parser()
  const statements = splitStatements(sql)

  const t0 = performance.now()
  let ok = 0
  const failed: string[] = []
  for (const s of statements) {
    try {
      parser.astify(s, { database: "MySQL" })
      ok++
    } catch (err) {
      failed.push(`${s.slice(0, 100).replace(/\s+/g, " ")} → ${String(err).slice(0, 120)}`)
    }
  }
  const ms = Math.round(performance.now() - t0)
  console.log({ file, statements: statements.length, ok, failed: failed.length, ms })
  console.log(failed.slice(0, 15).join("\n"))

  const create = statements.find((s) => /^CREATE TABLE/i.test(s))
  if (create && file === REAL) {
    const ast = parser.astify(create, { database: "MySQL" })
    console.log(JSON.stringify(ast, null, 1).slice(0, 4000))
  }

  const creates = statements.filter((s) => /^CREATE TABLE/i.test(s)).length
  expect(ok).toBeGreaterThan(0)
  expect(creates).toBeGreaterThan(0)
})
