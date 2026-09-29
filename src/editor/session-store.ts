import { createStore } from "zustand/vanilla"
import type { Family } from "@/model/family"
import type { Size } from "./geometry"
import type { EditTarget } from "./kinds/ops"
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
  /** Famiglia dello strumento nodo attivo: sceglie dove `addNode` crea il nodo. `null` per Seleziona e Collega. */
  family: Family | null
  /** Variante dello strumento corrente: la forma, per le famiglie che ne hanno più d'una. Opaca qui. */
  variant: string | null
  /**
   * `name`/`body` sono `EditTarget`, ciò che `addNode` può aprire (`kinds/ops.ts`) — una creazione
   * di nodo non apre mai l'etichetta di un arco. `label` è il terzo caso, sempre abbinato alla
   * chiave di un **arco**: il doppio click su un arco di flowchart lo apre (spec §8), non lo apre
   * mai `addNode`. Riesporta `EditTarget` invece di ridichiarare il literal `"name" | "body"`, che
   * altrimenti divergerebbe da quello — due rappresentazioni dello stesso tipo (violazione SSOT).
   */
  editing: { key: string; target: EditTarget | "label" } | null
  canvasSize: Size
  /**
   * Il nodo che mostra i suoi punti di aggancio (spec agganci §6), con prefisso, o `null`. Uno solo
   * alla volta: quello sotto il puntatore, il bersaglio di Collega, o il nodo del capo che si sposta.
   */
  anchorsFor: string | null
  setAnchorsFor: (key: string | null) => void
  /**
   * Un drag di nodi è in corso: l'anteprima sposta il DOM ma non il documento, quindi agganci e
   * maniglie dei capi (calcolati dal documento) resterebbero fermi al posto vecchio. Il layer si nasconde.
   */
  dragging: boolean
  setDragging: (dragging: boolean) => void
  setViewport: (viewport: Viewport) => void
  setSelection: (ids: Iterable<string>) => void
  setTool: (tool: Tool, family?: Family | null, variant?: string | null) => void
  setEditing: (editing: { key: string; target: EditTarget | "label" } | null) => void
  setCanvasSize: (size: Size) => void
}

export const sessionStore = createStore<SessionState>()((set) => ({
  viewport: IDENTITY,
  selection: new Set<string>(),
  tool: "select",
  family: null,
  variant: null,
  editing: null,
  canvasSize: { w: 0, h: 0 },
  anchorsFor: null,
  setAnchorsFor: (anchorsFor) => set({ anchorsFor }),
  dragging: false,
  setDragging: (dragging) => set({ dragging }),
  setViewport: (viewport) => set({ viewport }),
  setSelection: (ids) => set({ selection: new Set(ids) }),
  setTool: (tool, family = null, variant = null) => set({ tool, family, variant }),
  setEditing: (editing) => set({ editing }),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
}))
