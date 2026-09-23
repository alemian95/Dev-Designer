import * as z from "zod"
import { Identifier, NodeViewSchema, SCHEMA_VERSION } from "../shared"
import type { DevDocument } from "../document"

/** Le cinque forme della notazione più la nota. La nota è una forma e non una specie: a
 *  differenza di quella del class diagram non si àncora a niente, è un riquadro con del testo. */
export const FlowShapeSchema = z.enum(["terminal", "process", "decision", "io", "subprocess", "note"])
export type FlowShape = z.infer<typeof FlowShapeSchema>

export const LaneSchema = z.object({ id: Identifier, name: z.string() })
export type Lane = z.infer<typeof LaneSchema>

export const FlowNodeSchema = z.object({
  label: z.string(),
  shape: FlowShapeSchema,
  /** `id` di una `Lane`, non un indice: cancellare una corsia non rinumera le altre. */
  lane: Identifier,
})
export type FlowNode = z.infer<typeof FlowNodeSchema>

/** `label` è sempre una stringa, vuota quando non c'è: un solo modo di dire «nessuna etichetta». */
export const FlowEdgeSchema = z.object({ source: Identifier, target: Identifier, label: z.string() })
export type FlowEdge = z.infer<typeof FlowEdgeSchema>

/**
 * Le corsie sono un **array** e non un `Record` come entità e classi: là la chiave è un nome
 * naturale e l'ordine non significa nulla, qui l'ordine è l'informazione, e l'array è il posto
 * dove vive senza poter divergere da nient'altro.
 */
export const FlowModelSchema = z
  .object({
    lanes: z.array(LaneSchema).min(1),
    nodes: z.record(z.string(), FlowNodeSchema),
    edges: z.record(z.string(), FlowEdgeSchema),
  })
  .refine((m) => Object.values(m.nodes).every((n) => m.lanes.some((l) => l.id === n.lane)), {
    message: "ogni nodo deve appartenere a una corsia esistente",
    path: ["nodes"],
  })
export type FlowModel = z.infer<typeof FlowModelSchema>

/** La banda di una corsia: posizionata come un nodo, non derivata dai nodi (spec §5). */
export const LaneViewSchema = z.object({ y: z.number(), h: z.number() })
export type LaneView = z.infer<typeof LaneViewSchema>

export const FlowViewSchema = z.object({
  nodes: z.record(z.string(), NodeViewSchema),
  lanes: z.record(z.string(), LaneViewSchema),
})
export type FlowView = z.infer<typeof FlowViewSchema>

export const FlowDiagramSchema = z.object({
  type: z.literal("flow"),
  model: FlowModelSchema,
  view: FlowViewSchema,
})
export type FlowDiagram = z.infer<typeof FlowDiagramSchema>

export type FlowDocument = DevDocument & { diagram: FlowDiagram }

/**
 * Altezza minima di una corsia, e altezza di una appena creata: contiene qualunque forma con
 * un'etichetta di due righe, rombo compreso. Sta nel modello e non nel layout perché la usano
 * entrambi — `createFlowDocument` qui e `placeInLanes` in `editor/flow/layout.ts` — e due costanti
 * con lo stesso valore divergono il giorno che qualcuno ne cambia una.
 */
export const LANE_MIN_H = 160

/**
 * Prossimo nome di corsia libero, «Corsia N»: fonte unica per la prima corsia di un documento
 * nuovo (`createFlowDocument`, qui sotto) e per chi ne aggiunge una dal pannello
 * (`FlowLanesPanel`, `ui/panels/FlowProperties.tsx`) — prima erano due formule scritte a parte,
 * che avrebbero potuto divergere (violazione SSOT).
 *
 * `N` non è `existing.length + 1` da solo: dopo che una cancellazione toglie una corsia di mezzo
 * quel conteggio ripete un nome già in uso (es. resta «Corsia 2», se ne aggiunge un'altra e il
 * conteggio ridà «Corsia 2») — quindi si cerca il primo numero non ancora preso fra i nomi
 * correnti.
 */
export function nextLaneName(existing: readonly { name: string }[]): string {
  const used = new Set(existing.map((l) => l.name))
  let n = existing.length + 1
  while (used.has(`Corsia ${n}`)) n++
  return `Corsia ${n}`
}

export function createFlowDocument(name: string, id: string = crypto.randomUUID()): FlowDocument {
  const laneId = crypto.randomUUID()
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    diagram: {
      type: "flow",
      model: { lanes: [{ id: laneId, name: nextLaneName([]) }], nodes: {}, edges: {} },
      view: { nodes: {}, lanes: { [laneId]: { y: 0, h: LANE_MIN_H } } },
    },
  }
}
