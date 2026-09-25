import { describe, expect, it } from "vitest"
import { IDLE, reduce, type Context, type Hit, type InteractionEvent, type Mode, type PointerInfo } from "./interaction"
import { selId } from "./session-store"

const info = (over: Partial<PointerInfo>): PointerInfo => ({
  screen: { x: 0, y: 0 }, world: { x: 0, y: 0 }, button: 0, shift: false, alt: false, hit: { kind: "canvas" }, ...over,
})
const ctx = (over: Partial<Context> = {}): Context => ({ tool: "select", selection: new Set(), ...over })
const down = (i: Partial<PointerInfo>, spaceHeld = false): InteractionEvent => ({ type: "down", info: info(i), spaceHeld })
const move = (i: Partial<PointerInfo>): InteractionEvent => ({ type: "move", info: info(i) })
const up = (i: Partial<PointerInfo>): InteractionEvent => ({ type: "up", info: info(i) })

function run(events: InteractionEvent[], c: Context = ctx()) {
  let mode: Mode = IDLE
  const effects = []
  for (const e of events) {
    const r = reduce(mode, e, c)
    mode = r.mode
    effects.push(...r.effects)
  }
  return { mode, effects }
}

describe("reduce", () => {
  it("tasto centrale o spazio: pan", () => {
    const r = run([down({ button: 1, screen: { x: 10, y: 10 } }), move({ screen: { x: 15, y: 12 } }), up({})])
    expect(r.effects).toEqual([{ type: "pan-by", dx: 5, dy: 2 }])
    expect(r.mode).toEqual(IDLE)
    expect(run([down({}, true)]).mode.type).toBe("pan")
  })

  it("click su nodo lo seleziona e avvia il drag; il rilascio senza movimento non committa", () => {
    const r = run([down({ hit: { kind: "node", key: "a" }, world: { x: 5, y: 5 } }), up({ world: { x: 5, y: 5 } })])
    expect(r.effects).toEqual([{ type: "select", ids: [selId("node", "a")] }])
  })

  it("drag di un nodo: anteprima a ogni move, un solo commit al rilascio", () => {
    const r = run([
      down({ hit: { kind: "node", key: "a" }, world: { x: 0, y: 0 } }),
      move({ world: { x: 10, y: 5 } }),
      move({ world: { x: 30, y: 15 } }),
      up({ world: { x: 30, y: 15 } }),
    ])
    expect(r.effects).toEqual([
      { type: "select", ids: [selId("node", "a")] },
      { type: "preview-drag", keys: ["a"], dx: 10, dy: 5 },
      { type: "preview-drag", keys: ["a"], dx: 30, dy: 15 },
      { type: "commit-drag", keys: ["a"], dx: 30, dy: 15 },
    ])
  })

  it("drag di un nodo già selezionato trascina tutta la selezione senza riselezionare", () => {
    const selection = new Set([selId("node", "a"), selId("node", "b"), selId("edge", "r")])
    const r = run([down({ hit: { kind: "node", key: "a" } }), move({ world: { x: 1, y: 0 } })], ctx({ selection }))
    expect(r.effects).toEqual([{ type: "preview-drag", keys: ["a", "b"], dx: 1, dy: 0 }])
  })

  it("shift+click aggiunge o toglie dalla selezione", () => {
    const selection = new Set([selId("node", "a")])
    expect(run([down({ hit: { kind: "node", key: "b" }, shift: true })], ctx({ selection })).effects[0])
      .toEqual({ type: "select", ids: [selId("node", "a"), selId("node", "b")] })
    const r = run([down({ hit: { kind: "node", key: "a" }, shift: true })], ctx({ selection }))
    expect(r.effects).toEqual([{ type: "select", ids: [] }])
    expect(r.mode).toEqual(IDLE)
  })

  it("click su arco lo seleziona", () => {
    expect(run([down({ hit: { kind: "edge", key: "r" } })]).effects).toEqual([{ type: "select", ids: [selId("edge", "r")] }])
  })

  it("marquee sul canvas: svuota la selezione, anteprima, commit con rettangolo normalizzato", () => {
    const r = run([down({ world: { x: 100, y: 100 } }), move({ world: { x: 40, y: 130 } }), up({ world: { x: 40, y: 130 } })])
    expect(r.effects).toEqual([
      { type: "select", ids: [] },
      { type: "preview-marquee", rect: { x: 40, y: 100, w: 60, h: 30 } },
      { type: "preview-marquee", rect: null },
      { type: "commit-marquee", rect: { x: 40, y: 100, w: 60, h: 30 }, additive: false },
    ])
  })

  it("shift+click su un arco lo aggiunge, un secondo shift+click lo toglie", () => {
    const id = selId("edge", "r")
    const altro = selId("node", "a")
    expect(run([down({ hit: { kind: "edge", key: "r" }, shift: true })], ctx({ selection: new Set([altro]) })).effects)
      .toEqual([{ type: "select", ids: [altro, id] }])
    expect(run([down({ hit: { kind: "edge", key: "r" }, shift: true })], ctx({ selection: new Set([altro, id]) })).effects)
      .toEqual([{ type: "select", ids: [altro] }])
  })

  it("shift+drag sul vuoto: marquee additivo, e la selezione non si svuota alla presa", () => {
    const r = run(
      [down({ world: { x: 0, y: 0 }, shift: true }), move({ world: { x: 50, y: 50 } }), up({ world: { x: 50, y: 50 } })],
      ctx({ selection: new Set([selId("node", "a")]) }),
    )
    expect(r.effects.filter((e) => e.type === "select")).toEqual([])
    expect(r.effects.at(-1)).toEqual({ type: "commit-marquee", rect: { x: 0, y: 0, w: 50, h: 50 }, additive: true })
  })

  it("marquee minuscolo è un click a vuoto: nessun commit", () => {
    const r = run([down({ world: { x: 0, y: 0 } }), up({ world: { x: 1, y: 1 } })])
    expect(r.effects.filter((e) => e.type === "commit-marquee")).toEqual([])
  })

  it("la soglia del marquee è 3, e basta un lato a superarla", () => {
    const commits = (to: { x: number; y: number }) =>
      run([down({ world: { x: 0, y: 0 } }), up({ world: to })]).effects.filter((e) => e.type === "commit-marquee")
    expect(commits({ x: 2, y: 2 })).toEqual([])
    expect(commits({ x: 3, y: 0 })).toHaveLength(1)
    expect(commits({ x: 0, y: 3 })).toHaveLength(1)
  })

  it("tool node: click sul canvas crea il nodo", () => {
    const r = run([down({ world: { x: 12, y: 8 } })], ctx({ tool: "node", family: "er" }))
    expect(r.effects).toEqual([{ type: "create-node", at: { x: 12, y: 8 }, family: "er", variant: undefined }])
    expect(r.mode).toEqual(IDLE)
  })

  it("tool edge: da nodo a nodo committa la connessione", () => {
    const r = run([
      down({ hit: { kind: "node", key: "a" }, world: { x: 0, y: 0 } }),
      move({ world: { x: 50, y: 50 } }),
      up({ hit: { kind: "node", key: "b" }, world: { x: 50, y: 50 } }),
    ], ctx({ tool: "edge" }))
    expect(r.effects).toEqual([
      { type: "preview-connect", source: "a", to: { x: 0, y: 0 } },
      { type: "preview-connect", source: "a", to: { x: 50, y: 50 } },
      { type: "preview-connect", source: "a", to: null },
      { type: "commit-connect", source: "a", target: "b" },
    ])
  })

  it("tool edge rilasciato sul canvas: solo pulizia dell'anteprima", () => {
    const r = run([down({ hit: { kind: "node", key: "a" } }), up({})], ctx({ tool: "edge" }))
    expect(r.effects.at(-1)).toEqual({ type: "preview-connect", source: "a", to: null })
  })

  it("cancel durante il drag riporta i nodi a zero", () => {
    const r = run([down({ hit: { kind: "node", key: "a" } }), move({ world: { x: 9, y: 9 } }), { type: "cancel" }])
    expect(r.effects.at(-1)).toEqual({ type: "preview-drag", keys: ["a"], dx: 0, dy: 0 })
    expect(r.mode).toEqual(IDLE)
  })

  it("una maniglia di ridimensionamento: seleziona il pool, anteprima a ogni move, un solo commit", () => {
    const hit: Hit = { kind: "resize", key: "flow/p1", lane: null }
    const r = run([down({ hit, world: { x: 100, y: 0 } }), move({ world: { x: 150, y: 10 } }), up({ world: { x: 160, y: 10 } })])
    expect(r.effects).toEqual([
      { type: "select", ids: [selId("node", "flow/p1")] },
      { type: "preview-resize", key: "flow/p1", lane: null, dx: 50, dy: 10 },
      { type: "clear-resize" },
      { type: "commit-resize", key: "flow/p1", lane: null, dx: 60, dy: 10 },
    ])
    expect(r.mode).toEqual(IDLE)
  })

  it("una maniglia rilasciata senza movimento non committa, e Escape annulla", () => {
    const hit: Hit = { kind: "resize", key: "flow/p1", lane: "l1" }
    expect(run([down({ hit }), up({})]).effects).toEqual([{ type: "select", ids: [selId("node", "flow/p1")] }, { type: "clear-resize" }])
    const cancel = run([down({ hit }), move({ world: { x: 0, y: 30 } }), { type: "cancel" }])
    expect(cancel.effects.at(-1)).toEqual({ type: "clear-resize" })
    expect(cancel.mode).toEqual(IDLE)
  })
})

describe("strumento nodo con variante", () => {
  const info = (hit: Hit): PointerInfo => ({
    screen: { x: 0, y: 0 },
    world: { x: 10, y: 20 },
    button: 0,
    shift: false,
    alt: false,
    hit,
  })

  it("porta la variante nell'effetto di creazione", () => {
    const step = reduce(
      IDLE,
      { type: "down", info: info({ kind: "canvas" }), spaceHeld: false },
      { tool: "node", family: "flow", variant: "decision", selection: new Set() },
    )
    expect(step.effects).toEqual([{ type: "create-node", at: { x: 10, y: 20 }, family: "flow", variant: "decision" }])
  })

  it("senza variante l'effetto non la porta", () => {
    const step = reduce(
      IDLE,
      { type: "down", info: info({ kind: "canvas" }), spaceHeld: false },
      { tool: "node", family: "er", selection: new Set() },
    )
    expect(step.effects).toEqual([{ type: "create-node", at: { x: 10, y: 20 }, family: "er", variant: undefined }])
  })

  it("senza famiglia lo strumento nodo non crea niente", () => {
    const step = reduce(IDLE, down({ hit: { kind: "canvas" }, world: { x: 10, y: 20 } }), ctx({ tool: "node", family: null }))
    expect(step.effects.some((e) => e.type === "create-node")).toBe(false)
  })
})
