import "fake-indexeddb/auto"
import { describe, expect, it } from "vitest"
import { createDocumentDb, RECENT_LIMIT, type DocumentRecord } from "./db"

// Un database per test: l'isolamento sta nel nome, non in un reset globale.
let n = 0
const fresh = () => createDocumentDb(`test-${++n}`)

const rec = (id: string, updatedAt: number, over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id, name: id, json: "{}", fileName: null, handle: null, updatedAt, savedToFileAt: null, ...over,
})

describe("createDocumentDb", () => {
  it("scrive e rilegge un record", async () => {
    const db = fresh()
    await db.put(rec("a", 1, { json: '{"x":1}' }))
    expect(await db.get("a")).toMatchObject({ id: "a", json: '{"x":1}', updatedAt: 1 })
  })

  it("get di un id assente è undefined", async () => {
    expect(await fresh().get("nope")).toBeUndefined()
  })

  it("put sullo stesso id sovrascrive", async () => {
    const db = fresh()
    await db.put(rec("a", 1))
    await db.put(rec("a", 2, { name: "rinominato" }))
    expect(await db.get("a")).toMatchObject({ name: "rinominato", updatedAt: 2 })
    expect(await db.listRecent()).toHaveLength(1)
  })

  it("i recenti sono ordinati dal più recente e non portano il json", async () => {
    const db = fresh()
    await db.put(rec("a", 1))
    await db.put(rec("b", 3))
    await db.put(rec("c", 2))
    const recent = await db.listRecent()
    expect(recent.map((r) => r.id)).toEqual(["b", "c", "a"])
    expect(recent[0]).not.toHaveProperty("json")
  })

  it("la potatura tiene solo RECENT_LIMIT record, i più recenti", async () => {
    const db = fresh()
    const total = RECENT_LIMIT + 5
    for (let i = 0; i < total; i++) await db.put(rec(`d${i}`, i))
    expect(await db.listRecent()).toHaveLength(RECENT_LIMIT)
    expect(await db.get("d0")).toBeUndefined()
    expect(await db.get("d4")).toBeUndefined()
    expect(await db.get("d5")).toBeDefined()
    expect(await db.get(`d${total - 1}`)).toBeDefined()
  })

  it("remove elimina il record", async () => {
    const db = fresh()
    await db.put(rec("a", 1))
    await db.remove("a")
    expect(await db.get("a")).toBeUndefined()
  })

  it("lastOpenedId è null finché non viene impostato", async () => {
    const db = fresh()
    expect(await db.getLastOpenedId()).toBeNull()
    await db.setLastOpenedId("a")
    expect(await db.getLastOpenedId()).toBe("a")
    await db.setLastOpenedId("b")
    expect(await db.getLastOpenedId()).toBe("b")
  })
})
