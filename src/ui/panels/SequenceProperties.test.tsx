// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { documentStore } from "@/editor/document-store"
import { qualify } from "@/editor/families"
import { selId, sessionStore } from "@/editor/session-store"
import { sequenceDiagram } from "@/editor/sequence-access"
import { createDocument } from "@/model/document"
import type { Sequence } from "@/model/sequence/schema"
import { SequenceProperties } from "./SequenceProperties"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const seq = (): Sequence => sequenceDiagram(documentStore.getState().doc).model.sequences["s"]!

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.sequence.model.sequences["s"] = {
    title: "T",
    autonumber: false,
    participants: [
      { id: "a", name: "A", label: null, kind: "participant" },
      { id: "b", name: "B", label: null, kind: "participant" },
    ],
    steps: [
      { kind: "message", id: "m", from: "a", to: "b", text: "ciao", line: "solid", head: "filled" },
      { kind: "note", id: "n", placement: "over", participants: ["a"], text: "x" },
      { kind: "block", id: "k", operator: "alt", sections: [{ id: "c1", condition: "", steps: [] }, { id: "c2", condition: "", steps: [] }] },
    ],
  }
  doc.diagram.sequence.view.nodes["s"] = { x: 0, y: 0, collapsed: false }
  documentStore.getState().load(doc)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const select = (kind: "node" | "edge", key: string) => {
  act(() => sessionStore.getState().setSelection([selId(kind, qualify("sequence", key))]))
  act(() => root.render(<SequenceProperties />))
}
const field = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === text)!
const change = (el: HTMLSelectElement | HTMLInputElement, value: string) =>
  act(() => {
    el.value = value
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
  })
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  act(() => el.focus())
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
  act(() => el.blur())
}

describe("pannello della sequenza", () => {
  it("titolo, numerazione e «+ partecipante»", () => {
    select("node", "s")
    type(field("sequence-title"), "Nuovo")
    expect(seq().title).toBe("Nuovo")
    act(() => field("sequence-autonumber").click())
    expect(seq().autonumber).toBe(true)
    act(() => button("+ partecipante").click())
    expect(seq().participants).toHaveLength(3)
  })
})

describe("pannello del partecipante", () => {
  it("nome, etichetta e tipo", () => {
    select("node", "s/a")
    type(field("participant-name"), "Client")
    expect(seq().participants[0]?.name).toBe("Client")
    type(field("participant-label"), "Il client")
    expect(seq().participants[0]?.label).toBe("Il client")
    change(field("participant-kind"), "actor")
    expect(seq().participants[0]?.kind).toBe("actor")
  })

  it("un nome duplicato è rifiutato con un messaggio e non scrive", () => {
    select("node", "s/a")
    type(field("participant-name"), "B")
    expect(seq().participants[0]?.name).toBe("A")
    expect(container.textContent).toContain("C'è già un partecipante con questo nome.")
    expect(field<HTMLInputElement>("participant-name").value).toBe("A")
  })

  it("un nome vuoto o che Mermaid non accetta è rifiutato", () => {
    select("node", "s/a")
    type(field("participant-name"), "  ")
    expect(container.textContent).toContain("Il nome non può essere vuoto.")
    type(field("participant-name"), "a:b")
    expect(container.textContent).toContain("Mermaid non accetta questo nome per un partecipante.")
    type(field("participant-name"), "Note Service")
    expect(container.textContent).toContain("Mermaid non accetta questo nome per un partecipante.")
    expect(seq().participants[0]?.name).toBe("A")
  })
})

describe("pannello del messaggio", () => {
  it("testo, tratto, punta, mittente e destinatario, anche selezionato come arco", () => {
    select("edge", "s/m")
    type(field("message-text"), "addio")
    change(field("message-line"), "dashed")
    change(field("message-head"), "cross")
    change(field("message-from"), "b")
    change(field("message-to"), "a")
    expect(seq().steps[0]).toMatchObject({ text: "addio", line: "dashed", head: "cross", from: "b", to: "a" })
  })

  it("«+ messaggio dopo», «+ nota dopo», «Avvolgi in blocco» ed «Elimina»", () => {
    select("edge", "s/m")
    act(() => button("+ messaggio dopo").click())
    expect(seq().steps.map((s) => s.kind)).toEqual(["message", "message", "note", "block"])
    act(() => button("+ nota dopo").click())
    expect(seq().steps.map((s) => s.kind)).toEqual(["message", "note", "message", "note", "block"])
    act(() => button("Avvolgi in blocco").click())
    expect(seq().steps[0]).toMatchObject({ kind: "block", operator: "loop", sections: [{ steps: [{ id: "m" }] }] })
    select("edge", "s/m")
    act(() => button("Elimina").click())
    expect(JSON.stringify(seq().steps)).not.toContain('"id":"m"')
    expect(sessionStore.getState().selection.size).toBe(0)
  })
})

describe("pannello della nota di sequenza", () => {
  it("testo, posizione e secondo partecipante", () => {
    select("node", "s/n")
    type(field("note-step-text"), "y")
    change(field("note-step-placement"), "right")
    expect(seq().steps[1]).toMatchObject({ text: "y", placement: "right", participants: ["a"] })
    change(field("note-step-placement"), "over")
    change(field("note-step-second"), "b")
    expect(seq().steps[1]).toMatchObject({ placement: "over", participants: ["a", "b"] })
  })
})

describe("pannello del blocco", () => {
  it("operatore, condizioni e sezioni", () => {
    select("node", "s/k")
    type(container.querySelectorAll<HTMLInputElement>("input.section-condition")[1]!, "else")
    expect((seq().steps[2] as { sections: { condition: string }[] }).sections[1]?.condition).toBe("else")
    act(() => button("+ sezione").click())
    act(() => button("− sezione").click())
    expect((seq().steps[2] as { sections: unknown[] }).sections).toHaveLength(2)
    change(field("block-operator"), "loop")
    expect(seq().steps[2]).toMatchObject({ operator: "loop", sections: [{ id: "c1" }] })
    expect(button("+ sezione").disabled).toBe(true)
    expect(button("− sezione").disabled).toBe(true)
  })
})
