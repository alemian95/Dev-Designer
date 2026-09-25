import type { DevDocument } from "@/model/document"
import { POOL_HEADER_W } from "@/model/flow/schema"

/**
 * Per i test: aggiunge al documento il pool `p1` «Pool 1», con le corsie date (nome uguale all'id)
 * alte `h` ciascuna. Il **corpo** delle corsie parte da x = 0 e y = 0 ed è largo 640: la striscia
 * sta a sinistra, fra −POOL_HEADER_W e 0. Con una corsia sola alta 160 riproduce la banda unica dei
 * documenti di prima del 2b, [0, 640) × [0, 160), su cui sono scritti i numeri di molti test.
 *
 * Scrive sul documento che riceve — un documento appena creato, o una bozza di Immer — e lo
 * restituisce. È un modulo e non un file `*.test.ts` per la stessa ragione di `lane-invariant.ts`.
 */
export function withPool<T extends DevDocument>(doc: T, lanes: readonly string[] = ["l1"], h = 160): T {
  const flow = doc.diagram.flow
  flow.model.pools["p1"] = { name: "Pool 1", lanes: lanes.map((id) => ({ id, name: id })) }
  flow.view.pools["p1"] = { x: -POOL_HEADER_W, y: 0, w: 640 + POOL_HEADER_W }
  for (const id of lanes) flow.view.lanes[id] = { h }
  return doc
}
