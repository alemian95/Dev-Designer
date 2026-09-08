import { afterEach, describe, expect, it, vi } from "vitest"
import { createParser, type ParseRequest, type ParseResponse, type ParseWorker } from "./parse-client"
import type { DdlParseResult } from "./schema"

const EMPTY: DdlParseResult = { tables: [], warnings: [], skipped: {} }

/** Worker finto: registra le richieste e lascia al test il momento in cui rispondere. */
class FakeWorker implements ParseWorker {
  sent: ParseRequest[] = []
  terminated = false
  private listeners = new Map<string, Array<(e: unknown) => void>>()

  postMessage(message: ParseRequest): void {
    this.sent.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  addEventListener(type: string, listener: (e: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener as (e: unknown) => void])
  }

  emit(type: string, event: unknown): void {
    for (const l of this.listeners.get(type) ?? []) l(event)
  }

  reply(response: ParseResponse): void {
    this.emit("message", { data: response })
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("createParser", () => {
  it("risolve con il risultato del worker", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("create table t ()", "postgres")
    expect(w.sent[0]).toMatchObject({ id: 1, dialect: "postgres", ddl: "create table t ()" })
    w.reply({ id: 1, ok: true, result: EMPTY })
    await expect(pending).resolves.toEqual(EMPTY)
  })

  it("rigetta col messaggio quando il worker riporta un errore", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "mysql")
    w.reply({ id: 1, ok: false, message: "parser esploso" })
    await expect(pending).rejects.toThrow("parser esploso")
  })

  it("un errore di caricamento del worker rigetta invece di lasciare la promessa appesa", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "postgres")
    w.emit("error", new Event("error"))
    await expect(pending).rejects.toThrow(/caricato/)
  })

  it("un messaggio illeggibile rigetta", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "postgres")
    w.emit("messageerror", new Event("messageerror"))
    await expect(pending).rejects.toThrow(/illeggibile/)
  })

  it("senza risposta va in timeout", async () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    const parser = createParser(() => w, 1000)
    const pending = parser.parse("x", "postgres")
    vi.advanceTimersByTime(1000)
    await expect(pending).rejects.toThrow(/in tempo/)
  })

  it("una risposta con id ignoto viene scartata e non rompe niente", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "postgres")
    w.reply({ id: 999, ok: true, result: EMPTY })
    w.reply({ id: 1, ok: true, result: EMPTY })
    await expect(pending).resolves.toEqual(EMPTY)
  })

  it("il worker si crea una volta sola e serve più analisi in sequenza", async () => {
    let spawns = 0
    const w = new FakeWorker()
    const parser = createParser(() => {
      spawns++
      return w
    })
    const a = parser.parse("a", "postgres")
    w.reply({ id: 1, ok: true, result: EMPTY })
    await expect(a).resolves.toEqual(EMPTY)
    const b = parser.parse("b", "mysql")
    w.reply({ id: 2, ok: true, result: EMPTY })
    await expect(b).resolves.toEqual(EMPTY)
    expect(spawns).toBe(1)
    expect(w.sent.map((s) => s.id)).toEqual([1, 2])
  })

  it("una parse chiamata mentre la precedente è ancora in volo la abbandona e ne fa nascere una nuova", async () => {
    let spawns = 0
    const workers: FakeWorker[] = []
    const parser = createParser(() => {
      spawns++
      const w = new FakeWorker()
      workers.push(w)
      return w
    })
    // Es. il dialog: si incolla un dump grosso (stale), poi uno piccolo prima che il primo risponda.
    const stale = parser.parse("dump grosso", "postgres")
    const fresh = parser.parse("dump piccolo", "postgres")
    await expect(stale).rejects.toThrow(/abbandonata/)
    expect(workers[0].terminated).toBe(true)
    expect(spawns).toBe(2)
    workers[1].reply({ id: 2, ok: true, result: EMPTY })
    await expect(fresh).resolves.toEqual(EMPTY)
    // La risposta tardiva della parse abbandonata, se mai arrivasse, non farebbe niente.
    workers[0].reply({ id: 1, ok: true, result: EMPTY })
  })

  it("dopo un errore di caricamento la parse successiva fa nascere un nuovo worker", async () => {
    let spawns = 0
    const workers: FakeWorker[] = []
    const parser = createParser(() => {
      spawns++
      const w = new FakeWorker()
      workers.push(w)
      return w
    })
    const first = parser.parse("x", "postgres")
    workers[0].emit("error", new Event("error"))
    await expect(first).rejects.toThrow(/caricato/)
    expect(spawns).toBe(1)

    const second = parser.parse("y", "postgres")
    expect(spawns).toBe(2)
    workers[1].reply({ id: 2, ok: true, result: EMPTY })
    await expect(second).resolves.toEqual(EMPTY)
  })

  it("dopo un timeout il worker viene terminato e la parse successiva ne fa nascere uno nuovo", async () => {
    vi.useFakeTimers()
    let spawns = 0
    const workers: FakeWorker[] = []
    const parser = createParser(() => {
      spawns++
      const w = new FakeWorker()
      workers.push(w)
      return w
    }, 1000)

    const first = parser.parse("x", "postgres")
    vi.advanceTimersByTime(1000)
    await expect(first).rejects.toThrow(/in tempo/)
    expect(spawns).toBe(1)
    expect(workers[0].terminated).toBe(true)

    vi.useRealTimers()
    const second = parser.parse("y", "postgres")
    expect(spawns).toBe(2)
    workers[1].reply({ id: 2, ok: true, result: EMPTY })
    await expect(second).resolves.toEqual(EMPTY)
  })

  it("il timeout di una parse non tocca quella successiva, che gira su un worker nuovo", async () => {
    vi.useFakeTimers()
    const workers: FakeWorker[] = []
    const parser = createParser(() => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    }, 1000)

    // `abandoned` viene già rigettata subito (non dal timeout) perché `next` la abbandona.
    const abandoned = parser.parse("a", "postgres")
    vi.advanceTimersByTime(500)
    const next = parser.parse("b", "postgres")
    await expect(abandoned).rejects.toThrow(/abbandonata/)
    expect(workers[0].terminated).toBe(true)

    // Il timeout di `abandoned`, se scattasse comunque, non deve toccare `next`: il suo timer
    // riparte da zero sul worker nuovo.
    vi.advanceTimersByTime(1000)
    await expect(next).rejects.toThrow(/in tempo/)
    expect(workers[1].terminated).toBe(true)
  })

  it("dispose termina il worker e rigetta le analisi in corso", async () => {
    const w = new FakeWorker()
    const parser = createParser(() => w)
    const pending = parser.parse("x", "postgres")
    parser.dispose()
    expect(w.terminated).toBe(true)
    await expect(pending).rejects.toThrow(/annullata/)
  })
})
