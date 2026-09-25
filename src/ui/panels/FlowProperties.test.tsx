// @vitest-environment jsdom
//
// Serve un DOM vero, non `renderToStaticMarkup`: il punto da provare è cosa succede al *valore*
// di un campo HTML quando lo si modifica — un `<input>` a una riga tronca gli a capo alla
// sanitizzazione del browser (verificato: jsdom la implementa anche lui), una `textarea` no. Una
// stringa costruita a mano non lo mostrerebbe.
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { addFlowNode, setNodeLabel } from "@/editor/flow/commands"
import { withPool } from "@/editor/flow/pool-fixture"
import { selId, sessionStore } from "@/editor/session-store"
import { FlowProperties, PoolLanes } from "./FlowProperties"

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
  documentStore.getState().load(createDocument("t", "t"))
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
    const { key, recipe } = addFlowNode({ x: 0, y: 0 }, "process", null)
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

describe("FlowNodeProperties: corsia", () => {
  function nodoSelezionato(lane: string | null): string {
    documentStore.getState().load(withPool(createDocument("t", "t"), ["l1", "l2"]))
    const { key, recipe } = addFlowNode({ x: 0, y: 0 }, "process", lane)
    documentStore.getState().dispatch(recipe)
    sessionStore.getState().setSelection([selId("node", qualify("flow", key))])
    act(() => root.render(<FlowProperties />))
    return key
  }

  it("la select ha «Nessuna» in testa e le corsie raggruppate per pool", () => {
    nodoSelezionato(null)
    const select = container.querySelector<HTMLSelectElement>("#flow-node-lane")!
    expect(select.value).toBe("")
    expect(select.options[0]!.textContent).toBe("Nessuna")
    const group = select.querySelector("optgroup")!
    expect(group.label).toBe("Pool 1")
    expect([...group.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["l1", "l2"])
  })

  it("scegliere una corsia ci porta il nodo, e «Nessuna» lo libera", () => {
    const key = nodoSelezionato(null)
    const select = container.querySelector<HTMLSelectElement>("#flow-node-lane")!
    act(() => {
      select.value = "l2"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(flowDiagram(documentStore.getState().doc).model.nodes[key]!.lane).toBe("l2")
    act(() => {
      select.value = ""
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(flowDiagram(documentStore.getState().doc).model.nodes[key]!.lane).toBeNull()
  })
})

describe("PoolLanes", () => {
  it("«Aggiungi» mette in fondo al pool una corsia con il primo nome libero", () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    act(() => root.render(<PoolLanes poolId="p1" />))
    const aggiungi = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Aggiungi"))!
    act(() => aggiungi.click())
    expect(flowDiagram(documentStore.getState().doc).model.pools["p1"]!.lanes.map((l) => l.name)).toEqual(["l1", "Corsia 2"])
  })

  it("l'ultima corsia di un pool non si elimina", () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    act(() => root.render(<PoolLanes poolId="p1" />))
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Elimina corsia l1"]')!.disabled).toBe(true)
  })
})

describe("pannello del pool", () => {
  it("con un pool selezionato mostra il nome, modificabile, e le sue corsie", () => {
    documentStore.getState().load(withPool(createDocument("t", "t")))
    sessionStore.getState().setSelection([selId("node", qualify("flow", "p1"))])
    act(() => root.render(<FlowProperties />))
    const nome = container.querySelector<HTMLInputElement>("#pool-name")!
    expect(nome.value).toBe("Pool 1")
    expect(container.textContent).toContain("Corsie")
    act(() => editAndBlur(nome, "Ordini"))
    expect(flowDiagram(documentStore.getState().doc).model.pools["p1"]!.name).toBe("Ordini")
  })
})
