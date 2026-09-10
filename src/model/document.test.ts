import { describe, expect, it } from "vitest"
import { DocumentSchema } from "./document"
import { SCHEMA_VERSION } from "./shared"
import { createErDocument, entityKey, ErModelSchema } from "./er/schema"

describe("document schema", () => {
  it("un documento ER nuovo è valido", () => {
    const doc = createErDocument("Prova", "doc-1")
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(DocumentSchema.safeParse(doc).success).toBe(true)
  })

  it("entityKey usa schema.nome quando c'è lo schema", () => {
    expect(entityKey({ name: "orders" })).toBe("orders")
    expect(entityKey({ name: "orders", schema: "sales" })).toBe("sales.orders")
  })

  it("rifiuta un'entità la cui chiave non corrisponde a schema.nome", () => {
    const model = {
      entities: { wrong: { name: "orders", attributes: [] } },
      relationships: {},
    }
    expect(ErModelSchema.safeParse(model).success).toBe(false)
  })

  it("rifiuta un tipo di diagramma sconosciuto", () => {
    const doc = { ...createErDocument("x", "id"), diagram: { type: "mindmap" } }
    expect(DocumentSchema.safeParse(doc).success).toBe(false)
  })
})
