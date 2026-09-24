// @vitest-environment jsdom
//
// Serve un DOM vero, non `renderToStaticMarkup`: il punto da provare è cosa succede al *valore*
// di un campo HTML quando lo si modifica — un `<input>` a una riga tronca gli a capo alla
// sanitizzazione del browser (verificato: jsdom la implementa anche lui), una `textarea` no. Una
// stringa costruita a mano non lo mostrerebbe.
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { addFlowNode, setNodeLabel } from "@/editor/flow/commands"
import { selId, sessionStore } from "@/editor/session-store"
import { createFlowDocument } from "@/model/flow/schema"
import { FlowProperties } from "./FlowProperties"

// Senza questo, React avvisa che l'ambiente "non supporta act(...)" e non garantisce che gli
// aggiornamenti sincroni dentro `act()` siano già applicati quando la prossima riga li legge.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement

/**
 * Simula una modifica reale del campo, non un'assegnazione diretta di `.value`: il setter
 * nativo (preso dal prototipo, non dall'istanza) bypassa il tracking che React installa sui
 * controllati, `input` fa scattare `onChange`, `blur` fa scattare il commit — esattamente la
 * sequenza «digita, esci dal campo» che il bug descrive.
 */
function editAndBlur(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // `.focus()`/`.blur()` nativi, non un `Event("blur")` fabbricato a mano: `blur` non risale il
  // DOM di suo, e senza un fuoco vero da togliere React non lo intercetta — verificato che un
  // `dispatchEvent` diretto lascia il gestore muto, mentre il ciclo fuoco/sfoco vero lo raggiunge.
  el.focus()
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.blur()
}

beforeEach(() => {
  documentStore.getState().load(createFlowDocument("t", "t"))
  sessionStore.getState().setSelection([])
  sessionStore.getState().setEditing(null)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("FlowNodeProperties: campo etichetta", () => {
  it("un'etichetta multiriga modificata dal pannello conserva gli a capo", () => {
    const lane = flowDiagram(documentStore.getState().doc).model.lanes[0]!.id
    const { key, recipe } = addFlowNode({ x: 0, y: 0 }, "process", lane)
    documentStore.getState().dispatch(recipe)
    documentStore.getState().dispatch(setNodeLabel(key, "verifica\nordine"))
    sessionStore.getState().setSelection([selId("node", qualify("flow", key))])

    act(() => root.render(<FlowProperties />))
    const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>("#flow-node-label")
    if (!field) throw new Error("campo etichetta non trovato")
    act(() => editAndBlur(field, "verifica\nordine!"))

    expect(flowDiagram(documentStore.getState().doc).model.nodes[key]?.label).toBe("verifica\nordine!")
  })
})
