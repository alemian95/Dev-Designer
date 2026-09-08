import { describe, expect, it } from "vitest"
import pgSynthetic from "../../../spike/fixtures/postgres.synthetic.sql?raw"
import mysqlSynthetic from "../../../spike/fixtures/mysql.synthetic.sql?raw"
import { detectDialect } from "./detect"

describe("detectDialect", () => {
  it("riconosce l'intestazione di pg_dump", () => {
    expect(detectDialect("-- PostgreSQL database dump\nSET standard_conforming_strings = on;")).toBe("postgres")
  })

  it("riconosce l'intestazione di mysqldump", () => {
    expect(detectDialect("-- MySQL dump 10.19\n/*!40101 SET NAMES utf8 */;")).toBe("mysql")
  })

  it("riconosce i commenti eseguibili MariaDB", () => {
    expect(detectDialect("/*M!999999\\- enable the sandbox mode */")).toBe("mysql")
  })

  it("riconosce i backtick e ENGINE= come MySQL", () => {
    expect(detectDialect("CREATE TABLE `t` (`id` int) ENGINE=InnoDB;")).toBe("mysql")
  })

  it("riconosce i meta-comandi psql e il cast :: come Postgres", () => {
    expect(detectDialect("\\restrict abc\nSELECT 1::int;")).toBe("postgres")
  })

  it("in assenza di indizi ripiega su postgres", () => {
    expect(detectDialect("CREATE TABLE t (id integer);")).toBe("postgres")
  })

  it("azzecca le due fixture sintetiche", () => {
    expect(detectDialect(pgSynthetic)).toBe("postgres")
    expect(detectDialect(mysqlSynthetic)).toBe("mysql")
  })
})
