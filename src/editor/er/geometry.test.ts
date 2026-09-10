import { describe, expect, it } from "vitest"
import type { Attribute, Entity } from "@/model/er/schema"
import { CHAR_W, HEADER_H, MIN_W, PAD_X, ROW_H } from "../geometry"
import { attributeLines, entityRect, entitySize } from "./geometry"

const attr = (name: string, type: string, over: Partial<Attribute> = {}): Attribute => ({
  name, type, primaryKey: false, foreignKey: false, nullable: false, unique: false, ...over,
})

describe("attributeLines", () => {
  it("allinea marker, nome e tipo in colonne", () => {
    const lines = attributeLines([attr("id", "bigint", { primaryKey: true }), attr("customer_id", "int", { foreignKey: true, nullable: true }), attr("email", "varchar(255)", { unique: true })])
    expect(lines).toEqual([
      "PK id           bigint",
      "FK customer_id  int?",
      "   email        varchar(255) U",
    ])
  })
})

describe("entitySize", () => {
  const entity: Entity = { name: "t", attributes: [attr("id", "int", { primaryKey: true }), attr("name", "varchar(255)")] }

  it("collassata: solo l'header, larghezza minima", () => {
    expect(entitySize(entity, true)).toEqual({ w: MIN_W, h: HEADER_H })
  })

  it("espansa: una riga per attributo, larghezza dal testo più lungo arrotondata alla griglia", () => {
    const longest = Math.max(...attributeLines(entity.attributes).map((l) => l.length))
    const { w, h } = entitySize(entity, false)
    expect(h).toBe(HEADER_H + 2 * ROW_H + 6)
    expect(w).toBeGreaterThanOrEqual(longest * CHAR_W + 2 * PAD_X)
    expect(w % 10).toBe(0)
  })

  it("entityRect combina view e dimensioni", () => {
    expect(entityRect(entity, { x: 10, y: 20, collapsed: true })).toEqual({ x: 10, y: 20, w: MIN_W, h: HEADER_H })
  })
})
