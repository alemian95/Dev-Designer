import { describe, expect, it } from "vitest"
import synthetic from "../../../spike/fixtures/mysql.synthetic.sql?raw"
import { parseMysql } from "./mysql"

const find = (r: ReturnType<typeof parseMysql>, name: string) => r.tables.find((t) => t.name === name)!

describe("parseMysql", () => {
  it("ricompone i tipi con lunghezza, scala e modificatori, in minuscolo", () => {
    const r = parseMysql("CREATE TABLE `t` (`a` bigint(20) unsigned, `b` varchar(255), `c` decimal(10,2), `d` longtext);")
    expect(find(r, "t").columns.map((c) => c.type)).toEqual([
      "bigint(20) unsigned", "varchar(255)", "decimal(10,2)", "longtext",
    ])
  })

  it("l'assenza di nullable vuol dire nullabile", () => {
    const r = parseMysql("CREATE TABLE `t` (`a` int NOT NULL, `b` int DEFAULT NULL);")
    expect(find(r, "t").columns.map((c) => c.nullable)).toEqual([false, true])
  })

  it("PRIMARY KEY, UNIQUE KEY e FOREIGN KEY dentro il CREATE TABLE", () => {
    const r = parseMysql(`CREATE TABLE \`child\` (
      \`id\` bigint unsigned NOT NULL,
      \`code\` varchar(255) NOT NULL,
      \`parent_id\` bigint unsigned DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`child_code_unique\` (\`code\`),
      KEY \`child_parent_index\` (\`parent_id\`),
      CONSTRAINT \`child_fk\` FOREIGN KEY (\`parent_id\`) REFERENCES \`parent\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB;`)
    const child = find(r, "child")
    expect(child.primaryKey).toEqual(["id"])
    expect(child.unique).toEqual([["code"]])
    expect(child.foreignKeys).toEqual([
      { name: "child_fk", columns: ["parent_id"], refTable: "parent", refColumns: ["id"] },
    ])
  })

  it("riconosce tutte e tre le grafie di UNIQUE emesse da node-sql-parser", () => {
    // `node-sql-parser` emette `constraint_type` diverso a seconda della sintassi scritta nel DDL:
    // "unique key" per `UNIQUE KEY`, "unique" per `UNIQUE` nudo, "unique index" per `UNIQUE INDEX`.
    const r = parseMysql(`CREATE TABLE \`t\` (
      \`a\` int,
      \`b\` int,
      \`c\` int,
      UNIQUE KEY \`t_a_unique\` (\`a\`),
      UNIQUE (\`b\`),
      UNIQUE INDEX \`t_c_uidx\` (\`c\`)
    );`)
    const t = find(r, "t")
    expect(t.unique).toEqual([["a"], ["b"], ["c"]])
    expect(r.warnings).toEqual([])
    expect(r.skipped).toEqual({})
  })

  it("riconosce l'UNIQUE scritto in linea sulla colonna, in entrambe le grafie", () => {
    // A differenza del vincolo di tabella, quando UNIQUE è scritto in linea sulla colonna
    // `node-sql-parser` non produce un elemento a parte con `resource: "constraint"`: mette il
    // flag direttamente sull'elemento colonna (`resource: "column"`), come `unique` o `unique key".
    const r = parseMysql(`CREATE TABLE \`t\` (
      \`a\` int UNIQUE,
      \`b\` int UNIQUE KEY,
      \`c\` int
    );`)
    const t = find(r, "t")
    expect(t.unique).toEqual([["a"], ["b"]])
  })

  it("la PRIMARY KEY spegne nullable anche senza NOT NULL scritto", () => {
    const r = parseMysql("CREATE TABLE `t` (`id` int, PRIMARY KEY (`id`));")
    expect(find(r, "t").columns[0].nullable).toBe(false)
  })

  it("una tabella senza PRIMARY KEY ha primaryKey vuoto e non è un errore", () => {
    const r = parseMysql("CREATE TABLE `t` (`a` int);")
    expect(find(r, "t").primaryKey).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it("un CHECK json_valid non rompe niente", () => {
    const r = parseMysql("CREATE TABLE `t` (`note` longtext DEFAULT NULL CHECK (json_valid(`note`)));")
    expect(find(r, "t").columns).toHaveLength(1)
  })

  it("il marcatore sandbox di MariaDB non produce un avviso", () => {
    const r = parseMysql("/*M!999999\\- enable the sandbox mode */;\nCREATE TABLE `t` (`a` int);")
    expect(find(r, "t").columns).toHaveLength(1)
    expect(r.warnings).toEqual([])
  })

  it("i commenti eseguibili si spogliano invece di essere scartati", () => {
    // `SET NAMES utf8mb4` (senza `=`) non è riconosciuto dalla grammatica di node-sql-parser@5.4.0:
    // la prova che il contenuto è stato spogliato (non scartato) e passato al parser è che produce
    // un avviso di "statement non riconosciuto", non che sparisce senza lasciare traccia.
    const r = parseMysql("/*!40101 SET NAMES utf8mb4 */;\nCREATE TABLE `t` (`a` int);")
    expect(find(r, "t").columns).toHaveLength(1)
    expect(r.warnings).toHaveLength(1)
  })

  it("ALTER TABLE ADD CONSTRAINT fuori dal CREATE TABLE arriva sulla tabella", () => {
    const r = parseMysql("CREATE TABLE `t` (`id` int, `p` int);\nALTER TABLE `t` ADD CONSTRAINT `t_fk` FOREIGN KEY (`p`) REFERENCES `o` (`id`);")
    expect(find(r, "t").foreignKeys[0].refTable).toBe("o")
  })

  it("ALTER TABLE ADD PRIMARY KEY fuori dal CREATE TABLE spegne nullable come quella in linea", () => {
    const r = parseMysql("CREATE TABLE `t` (`id` int, `name` varchar(255));\nALTER TABLE `t` ADD PRIMARY KEY (`id`);")
    const t = find(r, "t")
    expect(t.primaryKey).toEqual(["id"])
    expect(t.columns.find((c) => c.name === "id")?.nullable).toBe(false)
  })

  it("un chunk non parsabile è un avviso e non fa perdere il resto", () => {
    const r = parseMysql("CREATE TABLE `ok` (`a` int);\nSET NAMES utf8mb4;\nCREATE TABLE `altra` (`b` int);")
    expect(r.tables.map((t) => t.name)).toEqual(["ok", "altra"])
    expect(r.warnings).toHaveLength(1)
  })

  it("USE stabilisce lo schema corrente: due tabelle omonime in database diversi restano distinte", () => {
    // Tipico di `mysqldump --databases`: ogni CREATE TABLE non è qualificato, ma è preceduto da un
    // USE che ne fissa il database. Indicizzare per solo nome nudo fonde le due `clienti` in una.
    const r = parseMysql(
      "USE `primo`;\nCREATE TABLE `clienti` (`id` int, `nome` varchar(255));\n" +
        "USE `secondo`;\nCREATE TABLE `clienti` (`id` int, `email` varchar(255));",
    )
    expect(r.tables).toHaveLength(2)
    const primo = r.tables.find((t) => t.schema === "primo" && t.name === "clienti")
    const secondo = r.tables.find((t) => t.schema === "secondo" && t.name === "clienti")
    expect(primo?.columns.map((c) => c.name)).toEqual(["id", "nome"])
    expect(secondo?.columns.map((c) => c.name)).toEqual(["id", "email"])
    expect(r.warnings).toEqual([])
    expect(r.skipped["use:undefined"]).toBeUndefined()
  })

  it("digerisce la fixture sintetica da 200 tabelle con le sue 199 foreign key", () => {
    const r = parseMysql(synthetic)
    expect(r.tables).toHaveLength(200)
    expect(r.tables.flatMap((t) => t.foreignKeys)).toHaveLength(199)
    const t1 = find(r, "table_1")
    expect(t1.primaryKey).toEqual(["id"])
    expect(t1.unique).toEqual([["col_0"]])
    expect(t1.columns.find((c) => c.name === "col_1")).toEqual({ name: "col_1", type: "varchar(255)", nullable: true })
    expect(t1.columns.find((c) => c.name === "id")).toEqual({ name: "id", type: "bigint unsigned", nullable: false })
  })
})
