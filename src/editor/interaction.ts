import type { Point, Rect } from "./geometry"
import { selId, selectedKeys, type Tool } from "./session-store"

export type Hit = { kind: "node"; key: string } | { kind: "edge"; key: string } | { kind: "canvas" }

/** Stato della macchina: uno solo alla volta sul root SVG (spec §4.3). */
export type Mode =
  | { type: "idle" }
  | { type: "pan"; last: Point }
  | { type: "drag"; keys: string[]; start: Point; moved: boolean }
  | { type: "marquee"; start: Point; additive: boolean }
  | { type: "connect"; source: string }

export const IDLE: Mode = { type: "idle" }

export interface PointerInfo {
  screen: Point
  world: Point
  button: 0 | 1 | 2
  shift: boolean
  alt: boolean
  hit: Hit
}

export type InteractionEvent =
  | { type: "down"; info: PointerInfo; spaceHeld: boolean }
  | { type: "move"; info: PointerInfo }
  | { type: "up"; info: PointerInfo }
  | { type: "cancel" }

/** Gli effetti sono dati: li esegue l'hook della UI. Il reducer resta puro e testabile. */
export type Effect =
  | { type: "select"; ids: string[] }
  | { type: "pan-by"; dx: number; dy: number }
  | { type: "preview-drag"; keys: string[]; dx: number; dy: number }
  | { type: "commit-drag"; keys: string[]; dx: number; dy: number }
  | { type: "preview-marquee"; rect: Rect | null }
  | { type: "commit-marquee"; rect: Rect; additive: boolean }
  | { type: "preview-connect"; source: string; to: Point | null }
  | { type: "commit-connect"; source: string; target: string }
  | { type: "create-node"; at: Point }

export interface Context {
  tool: Tool
  selection: ReadonlySet<string>
}

export interface Step { mode: Mode; effects: Effect[] }

const MARQUEE_MIN = 3

function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

export function reduce(mode: Mode, event: InteractionEvent, ctx: Context): Step {
  switch (event.type) {
    case "down":
      return onDown(event.info, event.spaceHeld, ctx)
    case "move":
      return onMove(mode, event.info)
    case "up":
      return onUp(mode, event.info)
    case "cancel":
      return onCancel(mode)
  }
}

function onDown(info: PointerInfo, spaceHeld: boolean, ctx: Context): Step {
  if (info.button === 1 || spaceHeld) return { mode: { type: "pan", last: info.screen }, effects: [] }
  if (info.button !== 0) return { mode: IDLE, effects: [] }

  if (ctx.tool === "node") {
    if (info.hit.kind === "canvas") return { mode: IDLE, effects: [{ type: "create-node", at: info.world }] }
  }
  if (ctx.tool === "edge") {
    if (info.hit.kind === "node") {
      return { mode: { type: "connect", source: info.hit.key }, effects: [{ type: "preview-connect", source: info.hit.key, to: info.world }] }
    }
    return { mode: IDLE, effects: [] }
  }

  switch (info.hit.kind) {
    case "node": {
      const id = selId("node", info.hit.key)
      if (ctx.selection.has(id)) {
        if (info.shift) return { mode: IDLE, effects: [{ type: "select", ids: [...ctx.selection].filter((s) => s !== id) }] }
        return { mode: { type: "drag", keys: selectedKeys(ctx.selection, "node"), start: info.world, moved: false }, effects: [] }
      }
      const ids = info.shift ? [...ctx.selection, id] : [id]
      return {
        mode: { type: "drag", keys: selectedKeys(new Set(ids), "node"), start: info.world, moved: false },
        effects: [{ type: "select", ids }],
      }
    }
    case "edge": {
      const id = selId("edge", info.hit.key)
      const ids = info.shift
        ? ctx.selection.has(id) ? [...ctx.selection].filter((s) => s !== id) : [...ctx.selection, id]
        : [id]
      return { mode: IDLE, effects: [{ type: "select", ids }] }
    }
    case "canvas":
      return {
        mode: { type: "marquee", start: info.world, additive: info.shift },
        effects: info.shift ? [] : [{ type: "select", ids: [] }],
      }
  }
}

function onMove(mode: Mode, info: PointerInfo): Step {
  switch (mode.type) {
    case "idle":
      return { mode, effects: [] }
    case "pan":
      return {
        mode: { type: "pan", last: info.screen },
        effects: [{ type: "pan-by", dx: info.screen.x - mode.last.x, dy: info.screen.y - mode.last.y }],
      }
    case "drag": {
      const dx = info.world.x - mode.start.x
      const dy = info.world.y - mode.start.y
      return { mode: { ...mode, moved: true }, effects: [{ type: "preview-drag", keys: mode.keys, dx, dy }] }
    }
    case "marquee":
      return { mode, effects: [{ type: "preview-marquee", rect: normalizeRect(mode.start, info.world) }] }
    case "connect":
      return { mode, effects: [{ type: "preview-connect", source: mode.source, to: info.world }] }
  }
}

function onUp(mode: Mode, info: PointerInfo): Step {
  switch (mode.type) {
    case "idle":
    case "pan":
      return { mode: IDLE, effects: [] }
    case "drag": {
      if (!mode.moved) return { mode: IDLE, effects: [] }
      const dx = info.world.x - mode.start.x
      const dy = info.world.y - mode.start.y
      return { mode: IDLE, effects: [{ type: "commit-drag", keys: mode.keys, dx, dy }] }
    }
    case "marquee": {
      const rect = normalizeRect(mode.start, info.world)
      const effects: Effect[] = [{ type: "preview-marquee", rect: null }]
      if (rect.w >= MARQUEE_MIN || rect.h >= MARQUEE_MIN) effects.push({ type: "commit-marquee", rect, additive: mode.additive })
      return { mode: IDLE, effects }
    }
    case "connect": {
      const effects: Effect[] = [{ type: "preview-connect", source: mode.source, to: null }]
      if (info.hit.kind === "node") effects.push({ type: "commit-connect", source: mode.source, target: info.hit.key })
      return { mode: IDLE, effects }
    }
  }
}

function onCancel(mode: Mode): Step {
  switch (mode.type) {
    case "drag":
      return { mode: IDLE, effects: [{ type: "preview-drag", keys: mode.keys, dx: 0, dy: 0 }] }
    case "marquee":
      return { mode: IDLE, effects: [{ type: "preview-marquee", rect: null }] }
    case "connect":
      return { mode: IDLE, effects: [{ type: "preview-connect", source: mode.source, to: null }] }
    default:
      return { mode: IDLE, effects: [] }
  }
}
