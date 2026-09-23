import { expect } from "vitest"
import type { FlowDiagram } from "@/model/flow/schema"
import { flowNodeSize, laneAt } from "./geometry"

/**
 * L'invariante di corsia (brief della correzione finale, C1/C2): dopo un comando che tocca nodi o
 * corsie, ogni nodo — nota esclusa, come già `validateFlow` la esclude dalle regole del flusso
 * (`model/flow/validate.ts`) — con una voce in `view.nodes` deve avere il centro dentro la banda
 * della propria corsia. Un'unica asserzione riusabile invece di ripeterla in ogni test: è il
 * cuore di questa correzione, va richiamata dopo ogni comando che può romperla.
 *
 * Vive qui e non dentro `commands.test.ts` perché anche `kinds/flow.test.ts` (C1) la usa: un file
 * di test che ne importasse un altro rieseguirebbe tutti i suoi `describe` una seconda volta — un
 * modulo pianura, non un file `*.test.ts`, evita il doppione.
 */
export function expectLaneInvariant(d: FlowDiagram): void {
  for (const [key, node] of Object.entries(d.model.nodes)) {
    if (node.shape === "note") continue
    const view = d.view.nodes[key]
    if (!view) continue
    const centerY = view.y + flowNodeSize(node).h / 2
    expect(laneAt(d, centerY), `nodo ${key} fuori dalla banda della sua corsia`).toBe(node.lane)
  }
}
