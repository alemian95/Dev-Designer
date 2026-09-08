import { describe, expect, it } from "vitest"
import synthetic from "../../../spike/fixtures/postgres.synthetic.sql?raw"
import { parsePostgres } from "./pg"

const find = (r: Awaited<ReturnType<typeof parsePostgres>>, name: string) => r.tables.find((t) => t.name === name)!

describe("parsePostgres", () => {
  it("legge i tipi nella grafia in cui si scrivono, non nei nomi interni", async () => {
    const r = await parsePostgres(`CREATE TABLE t (
      a bigint, b integer, c smallint, d boolean, e character varying(255),
      f numeric(10,2), g timestamp with time zone, h text, i text[], j double precision
    );`)
    expect(find(r, "t").columns.map((c) => c.type)).toEqual([
      "bigint", "integer", "smallint", "boolean", "varchar(255)",
      "numeric(10,2)", "timestamptz", "text", "text[]", "double precision",
    ])
  })

  it("NOT NULL si legge dai constraint della colonna, non da is_not_null", async () => {
    const r = await parsePostgres("CREATE TABLE t (a int NOT NULL, b int);")
    expect(find(r, "t").columns.map((c) => c.nullable)).toEqual([false, true])
  })

  it("lo schema qualificato finisce nel campo schema", async () => {
    const r = await parsePostgres("CREATE TABLE app.t (a int);")
    expect(find(r, "t").schema).toBe("app")
  })

  it("PRIMARY KEY, UNIQUE e FOREIGN KEY aggiunti con ALTER TABLE arrivano sulla tabella", async () => {
    const r = await parsePostgres(`
      CREATE TABLE app.parent (id bigint);
      CREATE TABLE app.child (id bigint, parent_id bigint, code text);
      ALTER TABLE ONLY app.child ADD CONSTRAINT child_pkey PRIMARY KEY (id);
      ALTER TABLE ONLY app.child ADD CONSTRAINT child_code_key UNIQUE (code);
      ALTER TABLE ONLY app.child ADD CONSTRAINT child_fk FOREIGN KEY (parent_id) REFERENCES app.parent(id);
    `)
    const child = find(r, "child")
    expect(child.primaryKey).toEqual(["id"])
    expect(child.unique).toEqual([["code"]])
    expect(child.foreignKeys).toEqual([
      { name: "child_fk", columns: ["parent_id"], refSchema: "app", refTable: "parent", refColumns: ["id"] },
    ])
  })

  it("ALTER COLUMN SET NOT NULL cambia la colonna già raccolta", async () => {
    const r = await parsePostgres("CREATE TABLE t (a int); ALTER TABLE ONLY t ALTER COLUMN a SET NOT NULL;")
    expect(find(r, "t").columns[0].nullable).toBe(false)
  })

  it("un REFERENCES scritto sulla colonna riempie columns col nome della colonna", async () => {
    const r = await parsePostgres("CREATE TABLE t (parent_id bigint REFERENCES other(id));")
    expect(find(r, "t").foreignKeys[0].columns).toEqual(["parent_id"])
  })

  it("REFERENCES senza lista di colonne referenziate lascia refColumns vuoto (si risolve altrove, sulla PK del target)", async () => {
    const r = await parsePostgres("CREATE TABLE t (id bigint primary key, parent_id bigint, FOREIGN KEY (parent_id) REFERENCES parent);")
    expect(find(r, "t").foreignKeys).toEqual([{ columns: ["parent_id"], refTable: "parent", refColumns: [] }])
  })

  it("i vincoli in linea nel CREATE TABLE si leggono come quelli aggiunti dopo", async () => {
    const r = await parsePostgres("CREATE TABLE t (id int PRIMARY KEY, code text UNIQUE, UNIQUE (id, code));")
    expect(find(r, "t").primaryKey).toEqual(["id"])
    expect(find(r, "t").unique).toEqual([["code"], ["id", "code"]])
  })

  it("un ALTER su una tabella sconosciuta è un avviso, non un errore", async () => {
    const r = await parsePostgres("ALTER TABLE ONLY assente ADD CONSTRAINT x PRIMARY KEY (id);")
    expect(r.tables).toEqual([])
    expect(r.warnings.some((w) => w.message.includes("assente"))).toBe(true)
  })

  it("i meta-comandi di pg_dump 18 non fanno fallire il parse", async () => {
    const r = await parsePostgres("\\restrict abc\nCREATE TABLE t (a int);\n\\unrestrict abc\n")
    expect(find(r, "t").columns).toHaveLength(1)
  })

  it("uno statement non riconosciuto non fa perdere gli altri, e diventa un avviso con la posizione", async () => {
    const r = await parsePostgres("CREATE TABLE ok (a int); NOT SQL AT ALL; CREATE TABLE altra (b int);")
    expect(r.tables.map((t) => t.name)).toEqual(["ok", "altra"])
    expect(r.warnings.some((w) => w.at !== undefined)).toBe(true)
  })

  it("conta per tipo gli statement che non usa", async () => {
    const r = await parsePostgres("CREATE TABLE t (a int); CREATE INDEX i ON t (a); CREATE SEQUENCE s;")
    expect(r.skipped).toMatchObject({ IndexStmt: 1, CreateSeqStmt: 1 })
  })

  it("digerisce la fixture sintetica da 200 tabelle con le sue 199 foreign key", async () => {
    const r = await parsePostgres(synthetic)
    expect(r.tables).toHaveLength(200)
    expect(r.tables.every((t) => t.schema === "app")).toBe(true)
    expect(r.tables.flatMap((t) => t.foreignKeys)).toHaveLength(199)
    expect(r.tables.every((t) => t.primaryKey.length === 1)).toBe(true)
    const t1 = find(r, "table_1")
    expect(t1.columns[0]).toEqual({ name: "id", type: "bigint", nullable: false })
    expect(t1.columns.find((c) => c.name === "col_1")).toEqual({ name: "col_1", type: "varchar(255)", nullable: true })
  })
})
