import * as z from "zod"
import { Identifier, NodeViewSchema } from "../shared"

/** Le cinque forme della notazione più la nota. La nota è una forma e non una specie: a
 *  differenza di quella del class diagram non si àncora a niente, è un riquadro con del testo. */
export const FlowShapeSchema = z.enum(["terminal", "process", "decision", "io", "subprocess", "note"])
export type FlowShape = z.infer<typeof FlowShapeSchema>

export const LaneSchema = z.object({ id: Identifier, name: z.string() })
export type Lane = z.infer<typeof LaneSchema>

/**
 * Un pool: un riquadro con un nome e le sue corsie (spec 2b §3). Le corsie sono un **array**: il loro
 * ordine dall'alto in basso è l'informazione, e l'array è il posto dove vive senza poter divergere da
 * nient'altro. Almeno una: un pool senza corsie non contiene niente.
 */
export const PoolSchema = z.object({ name: z.string(), lanes: z.array(LaneSchema).min(1) })
export type Pool = z.infer<typeof PoolSchema>

export const FlowNodeSchema = z.object({
  label: z.string(),
  shape: FlowShapeSchema,
  /** `id` di una `Lane` di qualche pool, o `null` per un nodo libero (spec 2b §3). Un id e non un
   *  indice: cancellare una corsia non rinumera le altre. */
  lane: Identifier.nullable(),
})
export type FlowNode = z.infer<typeof FlowNodeSchema>

/** `label` è sempre una stringa, vuota quando non c'è: un solo modo di dire «nessuna etichetta». */
export const FlowEdgeSchema = z.object({ source: Identifier, target: Identifier, label: z.string() })
export type FlowEdge = z.infer<typeof FlowEdgeSchema>

/** Gli id delle corsie di tutti i pool: la base dei due controlli qui sotto. */
function laneIds(pools: Readonly<Record<string, Pool>>): string[] {
  return Object.values(pools).flatMap((p) => p.lanes.map((l) => l.id))
}

/**
 * I pool sono un `Record` per id (uuid) e non un array: la loro posizione è libera e il loro ordine
 * non significa niente (spec 2b §3). Un flowchart senza pool è il caso normale: i nodi sono liberi.
 */
export const FlowModelSchema = z
  .object({
    pools: z.record(z.string(), PoolSchema),
    nodes: z.record(z.string(), FlowNodeSchema),
    edges: z.record(z.string(), FlowEdgeSchema),
  })
  .refine(
    (m) => {
      const ids = laneIds(m.pools)
      return new Set(ids).size === ids.length
    },
    { message: "gli id delle corsie devono essere unici in tutto il documento", path: ["pools"] },
  )
  .refine(
    (m) => {
      const ids = new Set(laneIds(m.pools))
      return Object.values(m.nodes).every((n) => n.lane === null || ids.has(n.lane))
    },
    { message: "la corsia di un nodo deve esistere in qualche pool", path: ["nodes"] },
  )
export type FlowModel = z.infer<typeof FlowModelSchema>

/** Posizione e larghezza di un pool, striscia di intestazione compresa: salvate, non ricavate dai
 *  nodi (spec 2b §3). L'altezza è la somma delle altezze delle sue corsie. */
export const PoolViewSchema = z.object({ x: z.number(), y: z.number(), w: z.number() })
export type PoolView = z.infer<typeof PoolViewSchema>

/** L'altezza di una corsia. La `y` non si salva: la ricava `laneRects` (`editor/flow/geometry.ts`)
 *  impilando le corsie del pool, così un pool non può avere buchi né sovrapposizioni. */
export const LaneViewSchema = z.object({ h: z.number() })
export type LaneView = z.infer<typeof LaneViewSchema>

export const FlowViewSchema = z.object({
  nodes: z.record(z.string(), NodeViewSchema),
  pools: z.record(z.string(), PoolViewSchema),
  lanes: z.record(z.string(), LaneViewSchema),
})
export type FlowView = z.infer<typeof FlowViewSchema>

export const FlowDiagramSchema = z.object({
  model: FlowModelSchema,
  view: FlowViewSchema,
})
export type FlowDiagram = z.infer<typeof FlowDiagramSchema>

/**
 * Altezza minima di una corsia, e altezza di una appena creata: contiene qualunque forma con
 * un'etichetta di due righe, rombo compreso. Sta nel modello e non nel layout perché la usano i
 * comandi, il layout e la migrazione, e due costanti con lo stesso valore divergono il giorno che
 * qualcuno ne cambia una.
 */
export const LANE_MIN_H = 160

/** Larghezza di un pool appena creato, e minima quando lo si ridimensiona: prende il posto della
 *  larghezza minima delle bande di prima del 2b. */
export const POOL_MIN_W = 640

/** La striscia a sinistra del pool, con il nome ruotato come in BPMN. `PoolView.w` la comprende. */
export const POOL_HEADER_W = 32

/** Margine orizzontale fra i nodi e il bordo delle corsie: lo usano la migrazione 5 → 6 e Disponi
 *  (spec 2b §4, §6). Nel modello perché la migrazione non può importare l'editor. */
export const LANE_MARGIN = 40

/**
 * Il primo nome «`<prefisso>` N» libero: fonte unica per «Pool N» (fra i pool del documento) e per
 * «Corsia N» (fra le corsie di un pool). `N` non è `existing.length + 1` da solo: dopo che una
 * cancellazione ne toglie uno di mezzo quel conteggio ripete un nome già in uso, quindi si cerca il
 * primo numero non ancora preso fra i nomi correnti.
 */
export function nextName(prefix: string, existing: readonly { name: string }[]): string {
  const used = new Set(existing.map((e) => e.name))
  let n = existing.length + 1
  while (used.has(`${prefix} ${n}`)) n++
  return `${prefix} ${n}`
}

/** Una parte di flusso vuota: nessun pool, quindi nessuna banda (spec 2b §1). */
export function emptyFlowDiagram(): FlowDiagram {
  return { model: { pools: {}, nodes: {}, edges: {} }, view: { nodes: {}, pools: {}, lanes: {} } }
}
