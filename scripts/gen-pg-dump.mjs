// Genera uno schema in stile `pg_dump --schema-only`: CREATE TABLE, poi FK con ALTER TABLE ADD CONSTRAINT.
import { writeFileSync, mkdirSync } from "node:fs"

const N = Number(process.argv[2] ?? 200)
const out = []
out.push("SET statement_timeout = 0;", "SET client_encoding = 'UTF8';", "CREATE SCHEMA app;", "")
for (let i = 0; i < N; i++) {
  out.push(`CREATE TABLE app.table_${i} (`)
  out.push(`    id bigint NOT NULL,`)
  for (let j = 0; j < 10; j++) out.push(`    col_${j} character varying(255)${j % 3 ? "" : " NOT NULL"},`)
  if (i > 0) out.push(`    table_${i - 1}_id bigint,`)
  out.push(`    created_at timestamp with time zone DEFAULT now() NOT NULL`)
  out.push(`);`, "")
  out.push(`COMMENT ON TABLE app.table_${i} IS 'tabella ${i}';`, "")
}
for (let i = 0; i < N; i++) {
  out.push(`ALTER TABLE ONLY app.table_${i} ADD CONSTRAINT table_${i}_pkey PRIMARY KEY (id);`)
  if (i > 0)
    out.push(
      `ALTER TABLE ONLY app.table_${i} ADD CONSTRAINT table_${i}_parent_fkey FOREIGN KEY (table_${i - 1}_id) REFERENCES app.table_${i - 1}(id);`,
    )
}
mkdirSync("spike/fixtures", { recursive: true })
writeFileSync("spike/fixtures/postgres.synthetic.sql", out.join("\n") + "\n")
console.log(`scritto spike/fixtures/postgres.synthetic.sql con ${N} tabelle`)
