// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { sessionStore } from "@/editor/session-store"
import { createDocument } from "@/model/document"
import { SequenceEditor } from "./SequenceEditor"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const seq = () => documentStore.getState().doc.diagram.sequence.model.sequences["s"]!

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.sequence.model.sequences["s"] = {
    title: "Ordine",
    autonumber: false,
    participants: [
      { id: "a", name: "A", label: null, kind: "participant" },
      { id: "b", name: "B", label: "Server", kind: "participant" },
    ],
    steps: [
      { kind: "message", id: "m", from: "a", to: "b", text: "ciao", line: "solid", head: "filled" },
      { kind: "block", id: "k", operator: "loop", sections: [{ id: "s1", condition: "", steps: [] }] },
    ],
  }
  doc.diagram.sequence.view.nodes["s"] = { x: 0, y: 0, collapsed: false }
  documentStore.getState().load(doc)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(<SequenceEditor />))
})

afterEach(() => {
  act(() => {
    sessionStore.getState().setEditing(null)
    root.unmount()
  })
  container.remove()
})

/** Apre l'editor su `key`, scrive `value` e conferma col blur; torna l'etichetta accessibile dell'editor. */
function edit(key: string, value: string): string | null {
  act(() => sessionStore.getState().setEditing({ key, target: "body" }))
  const area = container.querySelector("textarea")
  if (!area) return null
  const label = area.getAttribute("aria-label")
  act(() => {
    area.value = value
    area.blur()
  })
  return label
}

describe("SequenceEditor", () => {
  it("modifica titolo, testo del messaggio e condizione dall'etichetta del blocco", () => {
    expect(edit("sequence/s", "Pagamento")).toBe("Titolo della sequenza")
    expect(edit("sequence/s/m", "paga")).toBe("Testo del messaggio")
    expect(edit("sequence/s/k", "ogni giorno")).toBe("Condizione della sezione")
    expect(seq().title).toBe("Pagamento")
    expect(seq().steps[0]).toMatchObject({ text: "paga" })
    expect(seq().steps[1]).toMatchObject({ sections: [{ condition: "ogni giorno" }] })
    expect(sessionStore.getState().editing).toBeNull()
  })

  it("su un partecipante modifica l'etichetta se c'è, altrimenti il nome; un nome già usato non passa", () => {
    expect(edit("sequence/s/b", "")).toBe("Etichetta del partecipante")
    expect(seq().participants[1]!.label).toBeNull()
    expect(edit("sequence/s/a", "Cliente")).toBe("Nome del partecipante")
    expect(seq().participants[0]!.name).toBe("Cliente")
    edit("sequence/s/a", "B")
    expect(seq().participants[0]!.name).toBe("Cliente")
  })

  it("nel titolo e nel nome un a capo diventa uno spazio", () => {
    edit("sequence/s", "Ordine\ndi prova")
    edit("sequence/s/a", "Cli\r\nente")
    expect(seq().title).toBe("Ordine di prova")
    expect(seq().participants[0]!.name).toBe("Cli ente")
  })
})
