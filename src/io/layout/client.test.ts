import { afterEach, describe, expect, it, vi } from "vitest"
import type { LayoutEdge, LayoutNode } from "@/model/layout"
import { createLayoutEngine, type LayoutRequest, type LayoutResponse, type LayoutWorker } from "./client"

const NODES: LayoutNode[] = [{ id: "a", w: 160, h: 50 }, { id: "b", w: 160, h: 50 }]
const EDGES: LayoutEdge[] = [{ id: "e", source: "a", target: "b" }]
const POSIZIONI = { a: { x: 0, y: 0 }, b: { x: 0, y: 110 } }

/** Worker finto: registra le richieste e lascia al test il momento in cui rispondere. */
class FakeWorker implements LayoutWorker {
  sent: LayoutRequest[] = []
  terminated = false
  private listeners = new Map<string, Array<(e: unknown) => void>>()

  postMessage(message: LayoutRequest): void {
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

  reply(response: LayoutResponse): void {
    this.emit("message", { data: response })
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("createLayoutEngine", () => {
  it("risolve con le posizioni del worker", async () => {
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w)
    const pending = engine.layout(NODES, EDGES)
    expect(w.sent[0]).toMatchObject({ id: 1, nodes: NODES, edges: EDGES })
    w.reply({ id: 1, ok: true, positions: POSIZIONI })
    await expect(pending).resolves.toEqual(POSIZIONI)
  })

  it("rigetta col messaggio quando il worker riporta un errore", async () => {
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w)
    const pending = engine.layout(NODES, EDGES)
    w.reply({ id: 1, ok: false, message: "grafo rifiutato" })
    await expect(pending).rejects.toThrow("grafo rifiutato")
  })

  it("un errore di caricamento rigetta invece di lasciare la promessa appesa", async () => {
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w)
    const pending = engine.layout(NODES, EDGES)
    w.emit("error", new Event("error"))
    await expect(pending).rejects.toThrow(/non è stato caricato/)
  })

  it("il worker che non risponde in tempo viene terminato e la promessa rigettata", async () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w, 1000)
    const pending = engine.layout(NODES, EDGES)
    vi.advanceTimersByTime(1000)
    await expect(pending).rejects.toThrow(/non ha risposto in tempo/)
    expect(w.terminated).toBe(true)
  })

  it("una seconda richiesta abbandona la prima: una voce di undo per gesto, non due", async () => {
    const workers: FakeWorker[] = []
    const engine = createLayoutEngine(() => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    })
    const primo = engine.layout(NODES, EDGES)
    const secondo = engine.layout(NODES, [])
    await expect(primo).rejects.toThrow(/abbandonato/)
    expect(workers[0].terminated).toBe(true)
    // Il worker abbandonato è inutilizzabile: la seconda richiesta ne ha fatto nascere uno pulito.
    expect(workers).toHaveLength(2)
    workers[1].reply({ id: 2, ok: true, positions: POSIZIONI })
    await expect(secondo).resolves.toEqual(POSIZIONI)
  })

  it("scarta la risposta in ritardo di una richiesta abbandonata", async () => {
    const w = new FakeWorker()
    const engine = createLayoutEngine(() => w)
    const pending = engine.layout(NODES, EDGES)
    w.reply({ id: 1, ok: true, positions: POSIZIONI })
    await expect(pending).resolves.toEqual(POSIZIONI)
    // Nessuna richiesta in volo: una risposta che arriva ora non deve far esplodere niente.
    expect(() => w.reply({ id: 1, ok: true, positions: POSIZIONI })).not.toThrow()
  })

  it("riusa il worker fra due layout consecutivi", async () => {
    const workers: FakeWorker[] = []
    const engine = createLayoutEngine(() => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    })
    const primo = engine.layout(NODES, EDGES)
    workers[0].reply({ id: 1, ok: true, positions: POSIZIONI })
    await primo
    const secondo = engine.layout(NODES, EDGES)
    workers[0].reply({ id: 2, ok: true, positions: POSIZIONI })
    await secondo
    // Avviare elkjs costa: il worker si tiene finché non fallisce.
    expect(workers).toHaveLength(1)
  })
})
