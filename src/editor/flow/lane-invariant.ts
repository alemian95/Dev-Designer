import { expect } from "vitest"
import type { FlowDiagram } from "@/model/flow/schema"
import { flowNodeSize, laneAt } from "./geometry"

/**
 * L'invariante di corsia: dopo un comando che tocca nodi, pool o corsie, ogni nodo **con una corsia**
 * e una voce in `view.nodes` ha il centro dentro la propria corsia. Un nodo libero non ha una corsia
 * da rispettare, e può anche stare sotto un pool senza farne parte (spec 2b §10).
 *
 * Vive qui e non dentro un file di test perché la usano più file di test: un file di test che ne
 * importasse un altro rieseguirebbe tutti i suoi `describe` una seconda volta.
 */
export function expectLaneInvariant(d: FlowDiagram): void {
  for (const [key, node] of Object.entries(d.model.nodes)) {
    if (node.lane === null) continue
    const view = d.view.nodes[key]
    if (!view) continue
    const { w, h } = flowNodeSize(node)
    expect(laneAt(d, { x: view.x + w / 2, y: view.y + h / 2 }), `nodo ${key} fuori dalla sua corsia`).toBe(node.lane)
  }
}
