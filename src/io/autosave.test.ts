import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createErDocument } from "@/model/er/schema"
import { addEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { startAutosave, AUTOSAVE_DELAY_MS, type Autosave } from "./autosave"
import type { DocumentDb, DocumentRecord } from "./db"
import { documentSession } from "./document-session"

function fakeDb(): DocumentDb & { records: DocumentRecord[] } {
  const records: DocumentRecord[] = []
  return {
    records,
    put: vi.fn(async (r: DocumentRecord) => { records.push(r) }),
    get: async () => undefined,
    remove: async () => {},
    listRecent: async () => [],
    getLastOpenedId: async () => null,
    setLastOpenedId: async () => {},
  }
}

const command = () => {
  const { recipe } = addEntity(erDiagram(documentStore.getState().doc).model.entities, { x: 0, y: 0 })
  documentStore.getState().dispatch(recipe)
}

let autosave: Autosave | null = null

beforeEach(() => {
  vi.useFakeTimers()
  documentStore.getState().load(createErDocument("t", "doc-1"))
  documentSession.getState().patch({ docId: "doc-1", fileName: "t.dd.json", handle: null, dirty: false, readOnly: false, lastSavedAt: 100, persistence: "ok", notice: null })
})

afterEach(() => {
  autosave?.stop()
  autosave = null
  vi.useRealTimers()
})

describe("startAutosave", () => {
  it("un comando sporca il documento e scrive dopo il debounce", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db, now: () => 500 })
    command()
    expect(documentSession.getState().dirty).toBe(true)
    expect(db.put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).toHaveBeenCalledTimes(1)
    const rec = db.records[0]
    expect(rec).toMatchObject({ id: "doc-1", name: "t", fileName: "t.dd.json", updatedAt: 500, savedToFileAt: 100 })
    expect(rec.json).toContain('"entity"')
  })

  it("comandi ravvicinati producono una scrittura sola", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2)
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2)
    expect(db.put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2)
    expect(db.put).toHaveBeenCalledTimes(1)
  })

  it("load non è un comando: non sporca e non scrive", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    documentStore.getState().load(createErDocument("altro", "doc-2"))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(documentSession.getState().dirty).toBe(false)
    expect(db.put).not.toHaveBeenCalled()
  })

  it("undo e redo sono comandi", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    documentStore.getState().undo()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).toHaveBeenCalledTimes(2)
  })

  it("flush scrive subito e annulla il timer", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    command()
    await autosave.flush()
    expect(db.put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).toHaveBeenCalledTimes(1)
  })

  it("flush senza modifiche non scrive", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    await autosave.flush()
    expect(db.put).not.toHaveBeenCalled()
  })

  it("in sola lettura non scrive", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    documentSession.getState().patch({ readOnly: true })
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).not.toHaveBeenCalled()
  })

  it("se la scrittura fallisce, avvisa una volta e smette", async () => {
    const db = fakeDb()
    db.put = vi.fn(async () => { throw new DOMException("quota", "QuotaExceededError") })
    autosave = startAutosave({ db })
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    const s = documentSession.getState()
    expect(s.persistence).toBe("unavailable")
    expect(s.notice).toContain("quota")
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).toHaveBeenCalledTimes(1)
  })

  it("stop disiscrive", async () => {
    const db = fakeDb()
    autosave = startAutosave({ db })
    autosave.stop()
    autosave = null
    command()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(db.put).not.toHaveBeenCalled()
  })
})
