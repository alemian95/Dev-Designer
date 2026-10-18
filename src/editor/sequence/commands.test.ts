import { beforeEach, describe, expect, it } from "vitest"
import { createDocument } from "@/model/document"
import type { Sequence, Step } from "@/model/sequence/schema"
import type { Recipe } from "../document-store"
import { documentStore } from "../document-store"
import { sequenceDiagram } from "../sequence-access"
import {
  addMessage, addNoteStep, addParticipant, addSection, addSequence, deleteParticipant, deleteSequences, deleteSteps, dropTarget,
  duplicateSequences, moveParticipant, moveStep, removeSection, renameParticipant, setAutonumber, setCondition, setOperator,
  setParticipantKind, setParticipantLabel, setSequenceTitle, setStep, wrapInBlock,
} from "./commands"
import { ROOT, sequenceLayout } from "./layout"
import { descendants, locate, sectionsOf, stepAt } from "./tree"

const state = () => documentStore.getState()
const part = () => sequenceDiagram(state().doc)
const model = () => part().model
const s = () => model().sequences["s"]!
const ids = (steps: Step[]) => steps.map((x) => x.id)
const section = (id: string) => sectionsOf(s()).get(id)!.section

const msg = (id: string, from: string, to: string): Step => ({ kind: "message", id, from, to, text: "", line: "solid", head: "filled" })

/**
 * Tre partecipanti e un `alt` con tre sezioni: la prima contiene un `loop` annidato con una nota,
 * l'ultima è vuota.
 */
function fixture(): Sequence {
  return {
    title: "t",
    autonumber: false,
    participants: [
      { id: "a", name: "A", label: null, kind: "participant" },
      { id: "b", name: "B", label: null, kind: "participant" },
      { id: "c", name: "C", label: null, kind: "participant" },
    ],
    steps: [
      msg("m1", "a", "b"),
      {
        kind: "block", id: "k", operator: "alt", sections: [
          { id: "s1", condition: "ok", steps: [msg("m2", "b", "c"), {
            kind: "block", id: "k2", operator: "loop", sections: [
              { id: "s3", condition: "", steps: [{ kind: "note", id: "n1", placement: "over", participants: ["c"], text: "" }] },
            ],
          }] },
          { id: "s2", condition: "ko", steps: [msg("m4", "a", "b")] },
          { id: "s4", condition: "", steps: [] },
        ],
      },
      msg("m3", "c", "a"),
    ],
  }
}

beforeEach(() => {
  const doc = createDocument("t", "t")
  doc.diagram.sequence.model.sequences = { s: fixture() }
  doc.diagram.sequence.view.nodes = { s: { x: 0, y: 0, collapsed: false } }
  state().load(doc)
})

describe("tree", () => {
  it("locate trova un passo anche annidato, stepAt lo restituisce, descendants elenca passi e sezioni dentro", () => {
    expect(locate(s(), "m3")).toEqual({ container: ROOT, index: 2 })
    expect(locate(s(), "n1")).toEqual({ container: "s3", index: 0 })
    expect(locate(s(), "x")).toBeNull()
    expect(stepAt(s(), "k2")?.kind).toBe("block")
    expect(descendants(stepAt(s(), "k")!).sort()).toEqual(["k2", "m2", "m4", "n1", "s1", "s2", "s3", "s4"])
    expect(descendants(stepAt(s(), "m1")!)).toEqual([])
    expect(sectionsOf(s()).get("s3")?.block.id).toBe("k2")
  })
})

describe("comandi della sequenza", () => {
  it("addSequence crea A, B e un messaggio A→B vuoto, con la view sulla griglia", () => {
    const { key, recipe } = addSequence({ x: 13, y: 27 })
    state().dispatch(recipe)
    const created = model().sequences[key]!
    const [a, b] = created.participants
    expect(created.participants.map((p) => [p.name, p.label, p.kind])).toEqual([["A", null, "participant"], ["B", null, "participant"]])
    expect(created.steps).toEqual([{ kind: "message", id: created.steps[0]!.id, from: a!.id, to: b!.id, text: "", line: "solid", head: "filled" }])
    expect([created.title, created.autonumber]).toEqual(["", false])
    expect(part().view.nodes[key]).toEqual({ x: 10, y: 30, collapsed: false })
  })

  it("deleteSequences toglie modello e view", () => {
    state().dispatch(deleteSequences(["s"]))
    expect(model().sequences).toEqual({})
    expect(part().view.nodes).toEqual({})
  })

  it("duplicateSequences copia con uuid nuovi ovunque, riferimenti rimappati e lo scarto di sempre", () => {
    const dup = duplicateSequences(model(), ["s", "assente"])
    state().dispatch(dup.recipe)
    expect(dup.keys).toHaveLength(1)
    const copy = model().sequences[dup.keys[0]!]!
    expect(part().view.nodes[dup.keys[0]!]).toEqual({ x: 20, y: 20, collapsed: false })
    expect(copy.participants.map((p) => p.name)).toEqual(["A", "B", "C"])
    const old = new Set(["a", "b", "c", "m1", "m2", "m3", "m4", "n1", "k", "k2", "s1", "s2", "s3", "s4"])
    const pids = copy.participants.map((p) => p.id)
    expect(pids.some((id) => old.has(id))).toBe(false)
    expect(ids(copy.steps).some((id) => old.has(id))).toBe(false)
    expect([...sectionsOf(copy).keys()].some((id) => old.has(id))).toBe(false)
    const first = copy.steps[0]
    expect(first?.kind === "message" && [first.from, first.to]).toEqual([pids[0], pids[1]])
    expect(sectionsOf(copy).size).toBe(4)
  })

  it("setSequenceTitle e setAutonumber non scrivono niente se il valore non cambia", () => {
    expect(state().dispatch(setSequenceTitle("s", "t"))).toBe(false)
    expect(state().dispatch(setSequenceTitle("s", "Login"))).toBe(true)
    expect(state().dispatch(setAutonumber("s", false))).toBe(false)
    expect(state().dispatch(setAutonumber("s", true))).toBe(true)
    expect([s().title, s().autonumber]).toEqual(["Login", true])
  })
})

describe("comandi dei partecipanti", () => {
  it("addParticipant mette un «P<n>» libero dopo quello dato, o in coda con null", () => {
    const after = addParticipant("s", "a")
    state().dispatch(after.recipe)
    expect(s().participants.map((p) => p.name)).toEqual(["A", "P4", "B", "C"])
    expect(s().participants[1]).toEqual({ id: after.key, name: "P4", label: null, kind: "participant" })
    state().dispatch(addParticipant("s", null).recipe)
    expect(s().participants.map((p) => p.name).at(-1)).toBe("P5")
  })

  it("renameParticipant rifiuta il vuoto, un duplicato e i caratteri di INVALID_NAME; altrimenti scrive il nome ripulito", () => {
    expect(renameParticipant(model(), "s", "a", "  ")).toBeNull()
    expect(renameParticipant(model(), "s", "a", "B")).toBeNull()
    expect(renameParticipant(model(), "s", "a", "x:y")).toBeNull()
    expect(renameParticipant(model(), "s", "a", "a(b)")).toBeNull()
    expect(state().dispatch(renameParticipant(model(), "s", "a", "A")!)).toBe(false)
    state().dispatch(renameParticipant(model(), "s", "a", " Utente web ")!)
    expect(s().participants[0]!.name).toBe("Utente web")
  })

  it("setParticipantLabel e setParticipantKind scrivono solo se cambia", () => {
    expect(state().dispatch(setParticipantLabel("s", "a", null))).toBe(false)
    expect(state().dispatch(setParticipantLabel("s", "a", "Utente"))).toBe(true)
    expect(state().dispatch(setParticipantKind("s", "a", "participant"))).toBe(false)
    expect(state().dispatch(setParticipantKind("s", "a", "actor"))).toBe(true)
    expect(s().participants[0]).toMatchObject({ label: "Utente", kind: "actor" })
  })

  it("moveParticipant riordina; verso la sua posizione non scrive niente", () => {
    expect(state().dispatch(moveParticipant("s", "a", 0))).toBe(false)
    state().dispatch(moveParticipant("s", "a", 2))
    expect(s().participants.map((p) => p.id)).toEqual(["b", "c", "a"])
  })

  it("deleteParticipant toglie anche messaggi e note che lo coinvolgono, dentro i blocchi annidati", () => {
    state().dispatch(deleteParticipant("s", "c"))
    expect(s().participants.map((p) => p.id)).toEqual(["a", "b"])
    expect(ids(s().steps)).toEqual(["m1", "k"])
    expect(ids(section("s1").steps)).toEqual(["k2"])
    expect(section("s3").steps).toEqual([])
    state().undo()
    expect(s()).toEqual(fixture())
  })
})

describe("comandi dei passi", () => {
  it("addMessage inserisce un messaggio vuoto nel punto dato, anche in una sezione vuota", () => {
    const { key, recipe } = addMessage("s", "b", "a", { container: "s4", index: 0 })
    state().dispatch(recipe)
    expect(section("s4").steps).toEqual([{ kind: "message", id: key, from: "b", to: "a", text: "", line: "solid", head: "filled" }])
  })

  it("addNoteStep mette una nota sul mittente dopo il passo, o sul primo partecipante dopo un blocco", () => {
    const afterMessage = addNoteStep("s", "m2")
    state().dispatch(afterMessage.recipe)
    expect(section("s1").steps[1]).toEqual({ kind: "note", id: afterMessage.key, placement: "over", participants: ["b"], text: "" })
    const afterBlock = addNoteStep("s", "k")
    state().dispatch(afterBlock.recipe)
    expect(s().steps[2]).toMatchObject({ id: afterBlock.key, participants: ["a"] })
  })

  it("setStep applica la patch e, se non cambia niente, non scrive", () => {
    expect(state().dispatch(setStep("s", "m1", { text: "" }))).toBe(false)
    expect(state().dispatch(setStep("s", "m1", { text: "login", line: "dashed" }))).toBe(true)
    expect(s().steps[0]).toMatchObject({ text: "login", line: "dashed", head: "filled" })
    expect(state().dispatch(setStep("s", "n1", { participants: ["c"] }))).toBe(false)
    state().dispatch(setStep("s", "n1", { participants: ["b", "c"] }))
    expect(section("s3").steps[0]).toMatchObject({ participants: ["b", "c"] })
  })

  it("moveStep porta un passo dentro una sezione vuota", () => {
    state().dispatch(moveStep(model(), "s", "m1", { container: "s4", index: 0 })!)
    expect(ids(s().steps)).toEqual(["k", "m3"])
    expect(ids(section("s4").steps)).toEqual(["m1"])
  })

  it("moveStep porta un passo fuori da un blocco annidato", () => {
    state().dispatch(moveStep(model(), "s", "n1", { container: ROOT, index: 3 })!)
    expect(section("s3").steps).toEqual([])
    expect(ids(s().steps)).toEqual(["m1", "k", "m3", "n1"])
  })

  it("moveStep in avanti nello stesso contenitore corregge l'indice degli slot calcolati prima", () => {
    // Lo slot 2 è quello fra `k` e `m3`: dopo aver tolto `m1`, `m1` deve cadere proprio lì.
    state().dispatch(moveStep(model(), "s", "m1", { container: ROOT, index: 2 })!)
    expect(ids(s().steps)).toEqual(["k", "m1", "m3"])
    state().dispatch(moveStep(model(), "s", "m3", { container: ROOT, index: 0 })!)
    expect(ids(s().steps)).toEqual(["m3", "k", "m1"])
    // Gli slot subito prima e subito dopo il passo lo lasciano dov'è.
    expect(state().dispatch(moveStep(model(), "s", "m3", { container: ROOT, index: 1 })!)).toBe(false)
  })

  it("moveStep dentro sé stesso restituisce null", () => {
    expect(moveStep(model(), "s", "k", { container: "s1", index: 0 })).toBeNull()
    expect(moveStep(model(), "s", "k", { container: "s3", index: 0 })).toBeNull()
  })

  it("deleteSteps toglie i passi dati, anche annidati", () => {
    state().dispatch(deleteSteps("s", ["m1", "n1"]))
    expect(ids(s().steps)).toEqual(["k", "m3"])
    expect(section("s3").steps).toEqual([])
  })

  it("dropTarget prende lo slot più vicino a y, fuori dal passo escluso e dai suoi discendenti", () => {
    const layout = sequenceLayout(s())
    const inner = layout.slots.find((x) => x.container === "s3" && x.index === 0)!
    expect(dropTarget(s(), layout, inner.y, "m1")).toEqual({ container: "s3", index: 0 })
    const target = dropTarget(s(), layout, inner.y, "k")
    expect(descendants(stepAt(s(), "k")!)).not.toContain(target.container)
    expect(target.container).toBe(ROOT)
  })
})

describe("comandi dei blocchi", () => {
  it("wrapInBlock avvolge passi contigui in un blocco con una sezione", () => {
    const { key, recipe } = wrapInBlock("s", ["k", "m1"], "opt")
    state().dispatch(recipe)
    expect(ids(s().steps)).toEqual([key, "m3"])
    const block = s().steps[0]!
    expect(block.kind === "block" && [block.operator, block.sections.length, ids(block.sections[0]!.steps)]).toEqual(["opt", 1, ["m1", "k"]])
  })

  it("wrapInBlock lancia un errore con passi non contigui o di contenitori diversi, e il documento resta com'è", () => {
    const before = state().doc
    expect(() => state().dispatch(wrapInBlock("s", ["m1", "m3"], "opt").recipe)).toThrow()
    expect(() => state().dispatch(wrapInBlock("s", ["m1", "m2"], "opt").recipe)).toThrow()
    expect(state().doc).toBe(before)
    expect(state().past).toEqual([])
  })

  it("setOperator da alt con più sezioni a loop fonde le sezioni nella prima", () => {
    expect(state().dispatch(setOperator("s", "k", "alt"))).toBe(false)
    state().dispatch(setOperator("s", "k", "loop"))
    const block = stepAt(s(), "k")!
    expect(block.kind === "block" && block.sections.map((x) => [x.id, x.condition, ids(x.steps)])).toEqual([["s1", "ok", ["m2", "k2", "m4"]]])
    state().dispatch(setOperator("s", "k", "par"))
    expect(stepAt(s(), "k")).toMatchObject({ operator: "par" })
  })

  it("addSection e removeSection restituiscono null dove l'operatore non lo permette", () => {
    expect(addSection(model(), "s", "k2")).toBeNull()
    expect(removeSection(model(), "s", "s3")).toBeNull()
    state().dispatch(addSection(model(), "s", "k")!)
    const block = stepAt(s(), "k")!
    expect(block.kind === "block" && block.sections.length).toBe(4)
    state().dispatch(removeSection(model(), "s", "s2")!)
    expect([...sectionsOf(s()).keys()].includes("s2")).toBe(false)
    expect(locate(s(), "m4")).toBeNull()
  })

  it("removeSection restituisce null sull'ultima sezione di un blocco a più sezioni", () => {
    const doc = createDocument("t", "t")
    doc.diagram.sequence.model.sequences = { s: { ...fixture(), steps: [{ kind: "block", id: "p", operator: "par", sections: [{ id: "only", condition: "", steps: [] }] }] } }
    state().load(doc)
    expect(removeSection(model(), "s", "only")).toBeNull()
  })

  it("setCondition scrive solo se cambia", () => {
    expect(state().dispatch(setCondition("s", "s1", "ok"))).toBe(false)
    state().dispatch(setCondition("s", "s1", "valido"))
    expect(section("s1").condition).toBe("valido")
  })
})

describe("un gesto, un annulla", () => {
  const recipes: [string, () => Recipe][] = [
    ["addSequence", () => addSequence({ x: 0, y: 0 }).recipe],
    ["deleteSequences", () => deleteSequences(["s"])],
    ["duplicateSequences", () => duplicateSequences(model(), ["s"]).recipe],
    ["setSequenceTitle", () => setSequenceTitle("s", "x")],
    ["setAutonumber", () => setAutonumber("s", true)],
    ["addParticipant", () => addParticipant("s", null).recipe],
    ["renameParticipant", () => renameParticipant(model(), "s", "a", "Z")!],
    ["setParticipantLabel", () => setParticipantLabel("s", "a", "x")],
    ["setParticipantKind", () => setParticipantKind("s", "a", "actor")],
    ["moveParticipant", () => moveParticipant("s", "a", 2)],
    ["deleteParticipant", () => deleteParticipant("s", "c")],
    ["addMessage", () => addMessage("s", "a", "b", { container: "s3", index: 1 }).recipe],
    ["addNoteStep", () => addNoteStep("s", "m1").recipe],
    ["setStep", () => setStep("s", "m2", { text: "x" })],
    ["moveStep", () => moveStep(model(), "s", "n1", { container: ROOT, index: 0 })!],
    ["deleteSteps", () => deleteSteps("s", ["k"])],
    ["wrapInBlock", () => wrapInBlock("s", ["m2", "k2"], "loop").recipe],
    ["setOperator", () => setOperator("s", "k", "opt")],
    ["addSection", () => addSection(model(), "s", "k")!],
    ["removeSection", () => removeSection(model(), "s", "s1")!],
    ["setCondition", () => setCondition("s", "s4", "x")],
  ]

  it.each(recipes)("%s si annulla con un solo undo", (_name, make) => {
    const before = state().doc
    expect(state().dispatch(make())).toBe(true)
    state().undo()
    expect(state().doc).toEqual(before)
    expect(state().past).toEqual([])
  })
})
