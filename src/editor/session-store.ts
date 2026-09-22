import { createStore } from "zustand/vanilla"
import type { Size } from "./geometry"
import { IDENTITY, type Viewport } from "./viewport"

export type Tool = "select" | "node" | "edge"
export type SelectionKind = "node" | "edge"

/** Gli id di selezione hanno un prefisso di tipo: nodi e archi possono avere la stessa chiave. */
export const selId = (kind: SelectionKind, key: string): string => `${kind}:${key}`

export function parseSelId(id: string): { kind: SelectionKind; key: string } {
  const i = id.indexOf(":")
  return { kind: id.slice(0, i) as SelectionKind, key: id.slice(i + 1) }
}

export function selectedKeys(selection: ReadonlySet<string>, kind: SelectionKind): string[] {
  return [...selection].map(parseSelId).filter((s) => s.kind === kind).map((s) => s.key)
}

/** Stato transitorio: non entra nell'undo né nel file (spec §4.2). */
export interface SessionState {
  viewport: Viewport
  selection: ReadonlySet<string>
  tool: Tool
  /** Variante dello strumento corrente: la forma, per i tipi che ne hanno più d'una. Opaca qui. */
  variant: string | null
  /** `name` = rinomina inline dell'header; `body` = editor dei membri (solo classi). */
  editing: { key: string; target: "name" | "body" } | null
  canvasSize: Size
  setViewport: (viewport: Viewport) => void
  setSelection: (ids: Iterable<string>) => void
  setTool: (tool: Tool, variant?: string | null) => void
  setEditing: (editing: { key: string; target: "name" | "body" } | null) => void
  setCanvasSize: (size: Size) => void
}

export const sessionStore = createStore<SessionState>()((set) => ({
  viewport: IDENTITY,
  selection: new Set<string>(),
  tool: "select",
  variant: null,
  editing: null,
  canvasSize: { w: 0, h: 0 },
  setViewport: (viewport) => set({ viewport }),
  setSelection: (ids) => set({ selection: new Set(ids) }),
  setTool: (tool, variant = null) => set({ tool, variant }),
  setEditing: (editing) => set({ editing }),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
}))
