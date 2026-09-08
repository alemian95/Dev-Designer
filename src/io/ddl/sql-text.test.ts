import { describe, expect, it } from "vitest"
import { spans, splitStatements, stripExecutableComments, stripPsqlMeta } from "./sql-text"

/** Aiuto di lettura: i soli tratti di codice, concatenati. */
const codeOf = (sql: string) => spans(sql).filter((s) => s.code).map((s) => sql.slice(s.start, s.end)).join("")

describe("spans", () => {
  it("tutto codice quando non ci sono literal", () => {
    expect(codeOf("select 1")).toBe("select 1")
  })

  it("una stringa non è codice, e l'apice raddoppiato non la chiude", () => {
    expect(codeOf("insert values ('a''b'), (1)")).toBe("insert values (), (1)")
  })

  it("l'apice sfuggito col backslash non chiude la stringa", () => {
    expect(codeOf("values ('a\\'b') x")).toBe("values () x")
  })

  it("gli identificatori quotati e i backtick non sono codice", () => {
    expect(codeOf('create table "a;b" ()')).toBe("create table  ()")
    expect(codeOf("create table `a;b` ()")).toBe("create table  ()")
  })

  it("i commenti di riga, in entrambe le grafie, non sono codice", () => {
    expect(codeOf("a -- ; commento\nb")).toBe("a \nb")
    expect(codeOf("a # ; commento\nb")).toBe("a \nb")
  })

  it("i commenti a blocchi non sono codice e si annidano come in Postgres", () => {
    expect(codeOf("a /* ; /* dentro */ ancora */ b")).toBe("a  b")
  })

  it("il dollar-quote di Postgres non è codice, con e senza tag", () => {
    expect(codeOf("do $$ begin ; end $$; x")).toBe("do ; x")
    expect(codeOf("do $fn$ ; $fn$; x")).toBe("do ; x")
  })

  it("un dollaro che non apre un tag resta codice", () => {
    expect(codeOf("select a$1")).toBe("select a$1")
  })
})

describe("stripPsqlMeta", () => {
  it("toglie i meta-comandi di pg_dump 18 e li riporta", () => {
    const r = stripPsqlMeta("\\restrict abc\ncreate table t ();\n\\unrestrict abc\n")
    expect(r.sql).toBe("\ncreate table t ();\n\n")
    expect(r.removed).toEqual(["\\restrict abc", "\\unrestrict abc"])
  })

  it("non tocca un backslash a inizio riga dentro una stringa", () => {
    const sql = "insert values ('riga1\n\\restrict finto');\n"
    expect(stripPsqlMeta(sql).sql).toBe(sql)
    expect(stripPsqlMeta(sql).removed).toEqual([])
  })

  it("non tocca una riga che inizia per backslash ma non è un meta-comando noto", () => {
    const sql = "\\pippo qualcosa\nselect 1;\n"
    expect(stripPsqlMeta(sql).sql).toBe(sql)
  })
})

describe("splitStatements", () => {
  it("spezza sul punto e virgola e scarta i tratti vuoti", () => {
    expect(splitStatements("create table a ();\ncreate table b ();\n")).toEqual([
      "create table a ()",
      "create table b ()",
    ])
  })

  it("non spezza sul punto e virgola dentro una stringa", () => {
    expect(splitStatements("insert into t values ('a;b');\nselect 1;")).toEqual([
      "insert into t values ('a;b')",
      "select 1",
    ])
  })

  it("non spezza sul punto e virgola dentro un commento", () => {
    expect(splitStatements("select 1 -- ;\n;\nselect 2;")).toEqual(["select 1 -- ;\n", "select 2"])
  })

  it("onora DELIMITER e non emette la direttiva come statement", () => {
    const sql = "DELIMITER ;;\ncreate trigger t begin insert; end;;\nDELIMITER ;\nselect 1;"
    expect(splitStatements(sql)).toEqual([
      "create trigger t begin insert; end",
      "select 1",
    ])
  })

  it("l'ultimo statement senza punto e virgola finale non si perde", () => {
    expect(splitStatements("select 1")).toEqual(["select 1"])
  })
})

describe("stripExecutableComments", () => {
  it("spoglia il commento eseguibile e restituisce l'SQL dentro", () => {
    expect(stripExecutableComments("/*!40101 SET NAMES utf8mb4 */")).toBe("SET NAMES utf8mb4")
  })

  it("spoglia anche la variante MariaDB", () => {
    expect(stripExecutableComments("/*M!100001 SET x = 1 */")).toBe("SET x = 1")
  })

  it("scarta il marcatore sandbox di MariaDB, che non è SQL", () => {
    expect(stripExecutableComments("/*M!999999\\- enable the sandbox mode */")).toBeNull()
  })

  it("lascia intatto un chunk che non è un commento eseguibile", () => {
    expect(stripExecutableComments("create table t ()")).toBe("create table t ()")
  })
})
