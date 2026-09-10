import { beforeEach, describe, expect, it } from "vitest"
import { createErDocument, type Attribute } from "@/model/er/schema"
import { documentStore } from "../document-store"
import { erDiagram } from "../er-access"
import {
  addAttribute,
  addEntity,
  addRelationship,
  deleteItems,
  duplicateEntities,
  moveAttribute,
  removeAttribute,
  renameEntity,
  uniqueKey,
  updateAttribute,
  updateRelationship,
} from "./er"

const state = () => documentStore.getState()
const er = () => erDiagram(state().doc)
const attr = (name: string, over: Partial<Attribute> = {}): Attribute => ({
  name,
  type: "int",
  primaryKey: false,
  foreignKey: false,
  nullable: false,
  unique: false,
  ...over,
})

describe("comandi ER", () => {
  beforeEach(() => {
    const doc = createErDocument("t", "t")
    doc.diagram.model.entities.users = {
      name: "users",
      attributes: [attr("id", { primaryKey: true }), attr("email")],
    }
    doc.diagram.view.nodes.users = { x: 0, y: 0, collapsed: false }
    doc.diagram.model.entities.posts = {
      name: "posts",
      attributes: [attr("id", { primaryKey: true }), attr("user_id", { foreignKey: true })],
    }
    doc.diagram.view.nodes.posts = { x: 300, y: 0, collapsed: false }
    doc.diagram.model.relationships.posts_users = {
      source: { entity: "posts", attributes: ["user_id"], cardinality: "many" },
      target: { entity: "users", attributes: ["id"], cardinality: "one" },
      identifying: false,
    }
    state().load(doc)
  })

  it("uniqueKey aggiunge un suffisso numerico", () => {
    expect(uniqueKey({ a: 1 }, "b")).toBe("b")
    expect(uniqueKey({ a: 1, a_2: 1 }, "a")).toBe("a_3")
  })

  it("addEntity crea entità e view con posizione snappata e un attributo id PK", () => {
    const { key, recipe } = addEntity(er().model.entities, { x: 13, y: 27 })
    state().dispatch(recipe)
    expect(key).toBe("entity")
    expect(er().view.nodes.entity).toEqual({ x: 10, y: 30, collapsed: false })
    expect(er().model.entities.entity?.attributes[0]).toMatchObject({ name: "id", primaryKey: true })
  })

  it("renameEntity rinomina chiave, view e relazioni", () => {
    state().dispatch(renameEntity("users", "accounts")!)
    expect(er().model.entities.accounts?.name).toBe("accounts")
    expect(er().model.entities.users).toBeUndefined()
    expect(er().view.nodes.accounts).toBeDefined()
    expect(er().model.relationships.posts_users?.target.entity).toBe("accounts")
  })

  it("renameEntity con schema cambia la chiave in schema.nome", () => {
    state().dispatch(renameEntity("users", "users", "auth")!)
    expect(er().model.entities["auth.users"]).toMatchObject({ name: "users", schema: "auth" })
  })

  it("renameEntity con nome identico non produce patch e non tocca lo schema", () => {
    // Su un'entità senza schema, assegnare `schema = undefined` creerebbe una chiave assente nel
    // base: Immer la conterebbe come modifica e la rinomina a vuoto entrerebbe nella pila undo.
    expect(state().dispatch(renameEntity("users", "users")!)).toBe(false)
    expect(state().past).toHaveLength(0)
    expect("schema" in er().model.entities.users!).toBe(false)
    // Anche con spazi attorno al nome: il trim riporta al valore corrente.
    expect(state().dispatch(renameEntity("users", "  users  ")!)).toBe(false)
  })

  it("renameEntity rifiuta nome vuoto e collisione", () => {
    expect(renameEntity("users", "  ")).toBeNull()
    expect(state().dispatch(renameEntity("users", "posts")!)).toBe(false)
  })

  it("attributi: add con nome unico, update, move, remove", () => {
    state().dispatch(addAttribute("users"))
    state().dispatch(addAttribute("users"))
    expect(er().model.entities.users?.attributes.map((a) => a.name)).toEqual([
      "id",
      "email",
      "attribute",
      "attribute_2",
    ])
    state().dispatch(updateAttribute("users", 1, { name: "mail", nullable: true })!)
    expect(er().model.entities.users?.attributes[1]).toMatchObject({ name: "mail", nullable: true })
    expect(updateAttribute("users", 1, { name: " " })).toBeNull()
    state().dispatch(moveAttribute("users", 3, 0)!)
    expect(er().model.entities.users?.attributes[0]?.name).toBe("attribute_2")
    state().dispatch(removeAttribute("users", 0))
    expect(er().model.entities.users?.attributes).toHaveLength(3)
  })

  it("removeAttribute pota il nome dalle relazioni che lo citavano", () => {
    // `posts.user_id` è l'attributo da cui `posts_users` deriva.
    expect(er().model.entities.posts?.attributes[1]?.name).toBe("user_id")

    state().dispatch(removeAttribute("posts", 1))

    // Senza la potatura resterebbe un riferimento a un attributo inesistente, che `validateEr`
    // segnala come `dangling-relationship` di gravità error.
    expect(er().model.relationships.posts_users?.source.attributes).toEqual([])
    // Conseguenza voluta: svuotare l'estremo rende la relazione «disegnata a mano» (ADR 0003), e un
    // re-import del DDL non la poterà più. È preferibile a un riferimento pendente, e cancellare la
    // relazione di nascosto sarebbe peggio di entrambi.
    expect(er().model.relationships.posts_users?.target.attributes).toEqual(["id"])
  })

  it("removeAttribute distingue gli attributi omonimi di entità diverse", () => {
    // `posts.id` e `users.id` hanno lo stesso nome: potare per nome senza guardare l'entità
    // svuoterebbe anche l'estremo che punta a `users.id`.
    expect(er().model.entities.posts?.attributes[0]?.name).toBe("id")

    state().dispatch(removeAttribute("posts", 0))

    expect(er().model.relationships.posts_users?.target.attributes).toEqual(["id"])
    expect(er().model.relationships.posts_users?.source.attributes).toEqual(["user_id"])
  })

  it("addRelationship con chiave derivata e default many→one", () => {
    const { key, recipe } = addRelationship(er().model.relationships, "posts", "users")
    state().dispatch(recipe)
    expect(key).toBe("posts_users_2")
    expect(er().model.relationships[key]).toEqual({
      source: { entity: "posts", attributes: [], cardinality: "many" },
      target: { entity: "users", attributes: [], cardinality: "one" },
      identifying: false,
    })
  })

  it("updateRelationship", () => {
    state().dispatch(
      updateRelationship("posts_users", (r) => {
        r.identifying = true
        r.name = "scrive"
      }),
    )
    expect(er().model.relationships.posts_users).toMatchObject({ identifying: true, name: "scrive" })
  })

  it("deleteItems rimuove entità, view e relazioni collegate", () => {
    expect(deleteItems([], [])).toBeNull()
    state().dispatch(deleteItems(["users"], [])!)
    expect(er().model.entities.users).toBeUndefined()
    expect(er().view.nodes.users).toBeUndefined()
    expect(er().model.relationships.posts_users).toBeUndefined()
  })

  it("duplicateEntities copia con nome _copy, offset e senza relazioni", () => {
    const { keys, recipe } = duplicateEntities(er().model, ["users"])
    state().dispatch(recipe)
    expect(keys).toEqual(["users_copy"])
    expect(er().model.entities.users_copy?.attributes).toEqual(er().model.entities.users?.attributes)
    expect(er().view.nodes.users_copy).toEqual({ x: 20, y: 20, collapsed: false })
    expect(Object.keys(er().model.relationships)).toEqual(["posts_users"])
  })
})
