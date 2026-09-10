import { describe, expect, it } from "vitest"
import type { Attribute, ErModel } from "./schema"
import { validateEr } from "./validate"

const attr = (name: string, over: Partial<Attribute> = {}): Attribute => ({
  name, type: "int", primaryKey: false, foreignKey: false, nullable: false, unique: false, ...over,
})

const model = (over: Partial<ErModel>): ErModel => ({ entities: {}, relationships: {}, ...over })

describe("validateEr", () => {
  it("un modello corretto non ha issue", () => {
    const m = model({
      entities: {
        users: { name: "users", attributes: [attr("id", { primaryKey: true })] },
        posts: { name: "posts", attributes: [attr("id", { primaryKey: true }), attr("user_id", { foreignKey: true })] },
      },
      relationships: {
        posts_users: {
          source: { entity: "posts", attributes: ["user_id"], cardinality: "many" },
          target: { entity: "users", attributes: ["id"], cardinality: "one" },
          identifying: false,
        },
      },
    })
    expect(validateEr(m)).toEqual([])
  })

  it("segnala entità senza PK", () => {
    const issues = validateEr(model({ entities: { t: { name: "t", attributes: [attr("a")] } } }))
    expect(issues).toContainEqual(expect.objectContaining({ code: "entity-without-pk", node: "t", severity: "warning" }))
  })

  it("segnala attributi duplicati come errore", () => {
    const issues = validateEr(model({ entities: { t: { name: "t", attributes: [attr("a", { primaryKey: true }), attr("a")] } } }))
    expect(issues).toContainEqual(expect.objectContaining({ code: "duplicate-attribute", node: "t", severity: "error" }))
  })

  it("segnala FK senza relazione in uscita", () => {
    const issues = validateEr(model({ entities: { t: { name: "t", attributes: [attr("id", { primaryKey: true }), attr("x_id", { foreignKey: true })] } } }))
    expect(issues).toContainEqual(expect.objectContaining({ code: "fk-without-relationship", node: "t" }))
  })

  it("segnala relazioni verso entità o attributi inesistenti", () => {
    const issues = validateEr(model({
      entities: { a: { name: "a", attributes: [attr("id", { primaryKey: true })] } },
      relationships: {
        r: {
          source: { entity: "a", attributes: ["missing"], cardinality: "many" },
          target: { entity: "ghost", attributes: [], cardinality: "one" },
          identifying: false,
        },
      },
    }))
    const dangling = issues.filter((i) => i.code === "dangling-relationship" && i.edge === "r")
    expect(dangling).toHaveLength(2)
  })

  it("segnala nomi che differiscono solo per maiuscole", () => {
    const issues = validateEr(model({
      entities: {
        User: { name: "User", attributes: [attr("id", { primaryKey: true })] },
        user: { name: "user", attributes: [attr("id", { primaryKey: true })] },
      },
    }))
    expect(issues).toContainEqual(expect.objectContaining({ code: "entity-name-clash" }))
  })
})
