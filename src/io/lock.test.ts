import { afterEach, describe, expect, it, vi } from "vitest"
import { takeOver, tryOwn, type LockDeps, type LockRequester, type Ownership } from "./lock"

/** Emula navigator.locks: esclusivo, coda FIFO, ifAvailable, abort via signal. */
class FakeLocks implements LockRequester {
  private held = new Set<string>()
  private queues = new Map<string, Array<() => void>>()

  async request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<unknown>): Promise<unknown> {
    if (this.held.has(name)) {
      if (options.ifAvailable) return callback(null)
      await new Promise<void>((resolve, reject) => {
        const queue = this.queues.get(name) ?? []
        queue.push(resolve)
        this.queues.set(name, queue)
        options.signal?.addEventListener("abort", () => {
          this.queues.set(name, queue.filter((r) => r !== resolve))
          reject(options.signal!.reason)
        })
      })
    }
    this.held.add(name)
    try {
      return await callback({ name, mode: "exclusive" })
    } finally {
      this.held.delete(name)
      this.queues.get(name)?.shift()?.()
    }
  }
}

let channelName = 0
const deps = (locks: LockRequester, name = `lock-test-${++channelName}`): LockDeps => ({
  locks,
  openChannel: () => new BroadcastChannel(name),
})

const owned: Ownership[] = []
afterEach(() => {
  // I BroadcastChannel di Node tengono vivo il processo: ogni proprietà va rilasciata.
  for (const o of owned.splice(0)) o.release()
})

describe("tryOwn", () => {
  it("la prima scheda ottiene la proprietà, la seconda no", async () => {
    const locks = new FakeLocks()
    const a = await tryOwn("d1", async () => {}, deps(locks))
    expect(a).not.toBeNull()
    owned.push(a!)
    expect(await tryOwn("d1", async () => {}, deps(locks))).toBeNull()
  })

  it("documenti diversi hanno lock diversi", async () => {
    const locks = new FakeLocks()
    const a = await tryOwn("d1", async () => {}, deps(locks))
    const b = await tryOwn("d2", async () => {}, deps(locks))
    owned.push(a!, b!)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
  })

  it("release libera il lock e risolve lost", async () => {
    const locks = new FakeLocks()
    const a = (await tryOwn("d1", async () => {}, deps(locks)))!
    a.release()
    await a.lost
    const again = await tryOwn("d1", async () => {}, deps(locks))
    expect(again).not.toBeNull()
    owned.push(again!)
  })
})

describe("takeOver", () => {
  it("la proprietaria cede dopo onCede, la richiedente ottiene la proprietà", async () => {
    const locks = new FakeLocks()
    const name = `lock-test-${++channelName}`
    const cedeA = vi.fn(async () => {})
    const a = (await tryOwn("d1", cedeA, deps(locks, name)))!
    const b = await takeOver("d1", async () => {}, deps(locks, name))
    expect(b).not.toBeNull()
    owned.push(b!)
    expect(cedeA).toHaveBeenCalledTimes(1)
    await a.lost // la proprietaria ha perso il lock
    expect(await tryOwn("d1", async () => {}, deps(locks, name))).toBeNull() // lo tiene b
  })

  it("onCede viene atteso prima del rilascio", async () => {
    const locks = new FakeLocks()
    const name = `lock-test-${++channelName}`
    const order: string[] = []
    const a = (await tryOwn("d1", async () => { await new Promise((r) => setTimeout(r, 20)); order.push("cede") }, deps(locks, name)))!
    void a.lost.then(() => order.push("lost"))
    const b = await takeOver("d1", async () => {}, deps(locks, name))
    owned.push(b!)
    await a.lost
    expect(order).toEqual(["cede", "lost"])
  })

  it("un onCede che fallisce non blocca la cessione", async () => {
    const locks = new FakeLocks()
    const name = `lock-test-${++channelName}`
    const a = (await tryOwn("d1", async () => { throw new Error("quota esaurita") }, deps(locks, name)))!
    const b = await takeOver("d1", async () => {}, deps(locks, name))
    expect(b).not.toBeNull()
    owned.push(b!)
    await a.lost // il lock è stato rilasciato nonostante l'errore
  })

  it("senza una proprietaria che risponde va in timeout e ritorna null", async () => {
    const locks = new FakeLocks()
    // La proprietaria ascolta su un altro canale: la richiesta non la raggiunge.
    const a = (await tryOwn("d1", async () => {}, deps(locks, "altro-canale")))!
    owned.push(a)
    const b = await takeOver("d1", async () => {}, deps(locks, "canale-richiedente"), 50)
    expect(b).toBeNull()
  })
})
