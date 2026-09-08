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

  /**
   * `inCode` era quadratico: cercava in tutta la lista di tratti a ogni carattere, e la lista cresce
   * col testo (i backtick di un `mysqldump` vero ne producono a migliaia). Una misura di tempo assoluto
   * è fragile su una macchina condivisa, quindi qui si verifica la *scalabilità*: il tempo su un input
   * doppio non deve superare ~3 volte quello sull'input singolo. Con la vecchia implementazione
   * quadratica il rapporto misurato è ~3.9 (200 tabelle: 483 ms, 400 tabelle: 1864 ms); con la versione
   * a cursore è ~1.2 (200: 6 ms, 400: 8 ms). La soglia è tenuta larga (3, a metà tra i due regimi)
   * apposta per non rendere il test instabile su una macchina più lenta o più carica.
   */
  it("il tempo raddoppiando l'input non è quadratico (non più di ~3x, non ~4x)", () => {
    // Genera N CREATE TABLE con identificatori backtick-quoted, come un vero dump MySQL: è la grafia
    // che fa crescere il numero di tratti di `spans()` e che rendeva `inCode` costoso.
    const genMysqlLike = (n: number): string => {
      const parts: string[] = []
      for (let i = 0; i < n; i++) {
        const cols = Array.from({ length: 12 }, (_, c) => `  \`col_${c}\` varchar(255) DEFAULT NULL`).join(",\n")
        parts.push(`CREATE TABLE \`tbl_${i}\` (\n\`id\` bigint unsigned NOT NULL,\n${cols},\n  PRIMARY KEY (\`id\`)\n) ENGINE=InnoDB;`)
      }
      return parts.join("\n")
    }

    const small = genMysqlLike(200)
    const big = genMysqlLike(400)

    const t0 = performance.now()
    const rSmall = splitStatements(small)
    const t1 = performance.now()
    const rBig = splitStatements(big)
    const t2 = performance.now()
    const msSmall = t1 - t0
    const msBig = t2 - t1

    // La prestazione non deve aver cambiato la semantica: stesso numero di statement, stesso
    // contenuto. `big` è `small` con altre 200 tabelle in coda, quindi i primi 200 statement dei due
    // input devono coincidere esattamente.
    expect(rSmall).toHaveLength(200)
    expect(rBig).toHaveLength(400)
    expect(rBig.slice(0, 200)).toEqual(rSmall)
    expect(rSmall[0]).toContain("CREATE TABLE `tbl_0`")
    expect(rSmall[199]).toContain("CREATE TABLE `tbl_199`")
    expect(rBig[399]).toContain("CREATE TABLE `tbl_399`")

    expect(msBig).toBeLessThanOrEqual(msSmall * 3)
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
