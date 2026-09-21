import { describe, expect, it } from "vitest"
import { fillMissingRefColumns, spans, splitStatements, stripExecutableComments, stripPsqlMeta } from "./sql-text"

/**
 * Serve solo al test di scalabilità qui sotto. Dichiarato invece di aggiungere `"node"` ai `types`
 * del tsconfig: l'app è per il browser, e portare tutti i tipi di node in ogni file per una sola
 * chiamata in un test è un cambio di superficie che non si ripaga. Si dichiara ciò che si usa, come
 * `file-system-access.d.ts` fa per l'API dei file.
 */
declare const process: { cpuUsage(): { user: number; system: number } }

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
  it("toglie i meta-comandi di pg_dump 18 sostituendoli con spazi, non cancellandoli", () => {
    const sql = "\\restrict abc\ncreate table t ();\n\\unrestrict abc\n"
    const r = stripPsqlMeta(sql)
    expect(r.sql).toBe(`${" ".repeat("\\restrict abc".length)}\ncreate table t ();\n${" ".repeat("\\unrestrict abc".length)}\n`)
    expect(r.removed).toEqual(["\\restrict abc", "\\unrestrict abc"])
    // La lunghezza si conserva: è ciò che rende gli offset di `libpg-query` calcolati su `r.sql`
    // validi anche sul testo originale, carattere per carattere.
    expect(r.sql.length).toBe(sql.length)
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
   *
   * A 200/400 tabelle, però, le misure assolute sono ~2 ms: con un timer a bassa risoluzione o una CI
   * carica il rumore può avvicinarsi alla misura stessa, rendendo il rapporto instabile pur restando
   * la funzione lineare. Si usano quindi 800/1600 tabelle, dove le misure stanno comodamente in decine
   * di millisecondi (qui: ~13 ms e ~22 ms, rapporto ~1.7) invece che in poche unità.
   *
   * Uscire dal rumore non basta a uscire dalla **contesa**: con `performance.now()` e una misura sola
   * per dimensione, tre suite in parallelo sulla stessa macchina facevano fallire questo test in tutte
   * e tre, pur restando la funzione lineare — se la preemption cade dentro la misura grande e non
   * dentro quella piccola, il rapporto salta. Il minimo di più giri non bastava: con quattro suite la
   * CPU resta satura per tutta la durata, e nessun giro esce pulito.
   *
   * Si misura quindi il **tempo CPU** (`process.cpuUsage()`) invece del tempo trascorso: quando lo
   * scheduler toglie la CPU a questo processo, il wall clock avanza e il tempo CPU no, che è
   * esattamente la differenza fra «quanto lavoro ha fatto» e «quanto ha aspettato». Il minimo di tre
   * giri resta, per il caso in cui un GC cada dentro una misura. Provato con quattro suite in
   * parallelo: prima due su quattro fallivano, ora nessuna.
   *
   * Vale solo perché questo file gira in ambiente node e Vitest mette ogni file di test nel proprio
   * processo: `cpuUsage()` è del processo, e con i worker in thread conterebbe anche il lavoro degli
   * altri file.
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

    const small = genMysqlLike(800)
    const big = genMysqlLike(1600)

    // Tempo CPU del processo, in millisecondi: `cpuUsage()` conta microsecondi di user + system.
    const cpuMs = (): number => {
      const u = process.cpuUsage()
      return (u.user + u.system) / 1000
    }

    // Il minimo di tre giri, e su tempo CPU: vedi il docblock qui sopra.
    const fastest = (sql: string): { ms: number; out: string[] } => {
      let ms = Infinity
      let out: string[] = []
      for (let i = 0; i < 3; i++) {
        const t0 = cpuMs()
        out = splitStatements(sql)
        ms = Math.min(ms, cpuMs() - t0)
      }
      return { ms, out }
    }

    const { ms: msSmall, out: rSmall } = fastest(small)
    const { ms: msBig, out: rBig } = fastest(big)

    // La prestazione non deve aver cambiato la semantica: stesso numero di statement, stesso
    // contenuto. `big` è `small` con altre 800 tabelle in coda, quindi i primi 800 statement dei due
    // input devono coincidere esattamente.
    expect(rSmall).toHaveLength(800)
    expect(rBig).toHaveLength(1600)
    expect(rBig.slice(0, 800)).toEqual(rSmall)
    expect(rSmall[0]).toContain("CREATE TABLE `tbl_0`")
    expect(rSmall[799]).toContain("CREATE TABLE `tbl_799`")
    expect(rBig[1599]).toContain("CREATE TABLE `tbl_1599`")

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

describe("fillMissingRefColumns", () => {
  it("aggiunge la lista segnaposto alla REFERENCES in linea che non ce l'ha", () => {
    expect(fillMissingRefColumns("create table a (b_id int references b)")).toBe(
      "create table a (b_id int references b (`__dd_unspecified__`))",
    )
  })

  it("vale anche per il vincolo di tabella e per il nome qualificato dallo schema", () => {
    expect(fillMissingRefColumns("create table a (foreign key (b_id) references `db`.`b`)")).toBe(
      "create table a (foreign key (b_id) references `db`.`b` (`__dd_unspecified__`))",
    )
  })

  it("la lista va dov'\u00e8 la sua clausola, non in coda: ON DELETE resta dopo", () => {
    expect(fillMissingRefColumns("foreign key (b_id) references b on delete cascade,")).toBe(
      "foreign key (b_id) references b (`__dd_unspecified__`) on delete cascade,",
    )
  })

  it("lascia intatta la REFERENCES che la lista ce l'ha gi\u00e0", () => {
    const sql = "create table a (b_id int references b (id), c_id int references `c` (`id`))"
    expect(fillMissingRefColumns(sql)).toBe(sql)
  })

  it("non tocca la parola references fuori dal codice", () => {
    const string = "insert into t values ('references b')"
    expect(fillMissingRefColumns(string)).toBe(string)
    const comment = "-- references b\ncreate table a ()"
    expect(fillMissingRefColumns(comment)).toBe(comment)
  })
})
