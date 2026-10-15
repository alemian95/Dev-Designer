import { describe, expect, it } from "vitest"
import { emitClassMermaid } from "@/io/emit/class-mermaid"
import type { ClassModel } from "@/model/class/schema"
import type { Note } from "@/model/note/schema"
import { mapClass } from "./class-map"
import { parseClass } from "./class-parse"

/**
 * Un modello con solo ciò che Mermaid porta (spec §8): ruoli vuoti, nomi che Mermaid accetta nudi.
 * Le sei specie, la navigabilità e molteplicità asimmetriche prendono un verso sbagliato; il
 * generico annidato prende la decodifica delle tilde (spec §11). Il round-trip deve restituirlo identico.
 */
const MODEL: ClassModel = {
  classes: {
    Forma: { name: "Forma", stereotype: "interface", attributes: [], methods: [{ name: "area", type: "double", visibility: "public", isStatic: false, isAbstract: true, parameters: [] }] },
    Quadrato: {
      name: "Quadrato",
      stereotype: "class",
      attributes: [
        { name: "lato", type: "double", visibility: "private", isStatic: false },
        { name: "cache", type: "Map<string, List<int>>", visibility: "protected", isStatic: true },
      ],
      methods: [
        { name: "Quadrato", type: "", visibility: "public", isStatic: false, isAbstract: false, parameters: [{ name: "lato", type: "double" }] },
        { name: "scala", type: "Quadrato", visibility: "package", isStatic: true, isAbstract: false, parameters: [{ name: "f", type: "double" }, { name: "pesi", type: "Map<K, V>" }] },
      ],
    },
    Base: { name: "Base", stereotype: "abstract", attributes: [], methods: [] },
    Colore: { name: "Colore", stereotype: "enum", attributes: [{ name: "ROSSO", type: "", visibility: "public", isStatic: false }], methods: [] },
    Disegno: { name: "Disegno", stereotype: "class", attributes: [], methods: [] },
  },
  relations: {
    r1: { kind: "realization", source: { class: "Quadrato", multiplicity: "", role: "" }, target: { class: "Forma", multiplicity: "", role: "" } },
    r2: { kind: "generalization", source: { class: "Quadrato", multiplicity: "", role: "" }, target: { class: "Base", multiplicity: "", role: "" } },
    r3: { kind: "composition", name: "contiene", source: { class: "Forma", multiplicity: "0..*", role: "" }, target: { class: "Disegno", multiplicity: "1", role: "" } },
    r4: { kind: "aggregation", source: { class: "Colore", multiplicity: "1", role: "" }, target: { class: "Disegno", multiplicity: "*", role: "" } },
    r5: { kind: "dependency", source: { class: "Disegno", multiplicity: "", role: "" }, target: { class: "Colore", multiplicity: "", role: "" } },
    r6: { kind: "association", navigable: true, source: { class: "Base", multiplicity: "1", role: "" }, target: { class: "Colore", multiplicity: "2", role: "" } },
    r7: { kind: "association", source: { class: "Forma", multiplicity: "", role: "" }, target: { class: "Colore", multiplicity: "", role: "" } },
  },
}

const NOTES: Record<string, Note> = {
  a: { text: "libera", anchor: null },
  b: { text: 'a < b & "c"\nriga due', anchor: "class/Quadrato" },
}

describe("round-trip classi", () => {
  it("modello → emitClassMermaid → parseClass → mapClass restituisce il modello e le note", () => {
    const { text, warnings } = emitClassMermaid(MODEL, NOTES)
    // L'unico avviso dell'export è il generico annidato, che l'import sa rileggere.
    expect(warnings).toHaveLength(1)
    const parsed = parseClass(text)
    expect(parsed.warnings).toEqual([])
    const fragment = mapClass(parsed.ast, text)
    expect(fragment.warnings).toEqual([])
    expect(fragment.classes).toEqual(MODEL.classes)
    expect(fragment.relations).toEqual(Object.values(MODEL.relations))
    expect(fragment.notes).toEqual(Object.values(NOTES))
  })
})
