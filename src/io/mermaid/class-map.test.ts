import { describe, expect, it } from "vitest"
import { CLASS_VALID } from "./class-fixtures"
import { mapClass, type ClassFragment } from "./class-map"
import { parseClass } from "./class-parse"

const map = (text: string): ClassFragment => mapClass(parseClass(text).ast, text)
const one = (line: string) => map(`classDiagram\n  ${line}\n`).relations[0]
const warnings = (text: string): string[] => map(text).warnings.map((w) => w.message)

describe("mapClass: relazioni", () => {
  it("mette il lato con la testa nel target e ne ricava la specie (spec §4.2)", () => {
    expect(one("A <|-- B")).toMatchObject({ kind: "generalization", source: { class: "B" }, target: { class: "A" } })
    expect(one("B --|> A")).toMatchObject({ kind: "generalization", source: { class: "B" }, target: { class: "A" } })
    expect(one("C ..|> D")).toMatchObject({ kind: "realization", source: { class: "C" }, target: { class: "D" } })
    expect(one("E *-- F")).toMatchObject({ kind: "composition", source: { class: "F" }, target: { class: "E" } })
    expect(one("E ..* F")).toMatchObject({ kind: "composition", target: { class: "F" } })
    expect(one("G --o H")).toMatchObject({ kind: "aggregation", target: { class: "H" } })
    expect(one("I --> J")).toEqual({ kind: "association", navigable: true, source: { class: "I", multiplicity: "", role: "" }, target: { class: "J", multiplicity: "", role: "" } })
    expect(one("U <-- V")).toMatchObject({ kind: "association", navigable: true, source: { class: "V" }, target: { class: "U" } })
    expect(one("K ..> L")).toMatchObject({ kind: "dependency", source: { class: "K" }, target: { class: "L" } })
    expect(one("M -- N")).toEqual({ kind: "association", source: { class: "M", multiplicity: "", role: "" }, target: { class: "N", multiplicity: "", role: "" } })
  })

  it("porta la molteplicità al capo vicino e l'etichetta nel nome", () => {
    expect(one('Ordine "1" *-- "1..*" Riga : contiene')).toEqual({
      kind: "composition",
      name: "contiene",
      source: { class: "Riga", multiplicity: "1..*", role: "" },
      target: { class: "Ordine", multiplicity: "1", role: "" },
    })
  })

  it("scarta due teste e lollipop, e avvisa sulla linea tratteggiata nuda", () => {
    const fragment = map(CLASS_VALID.relations!)
    expect(fragment.relations).toHaveLength(9)
    expect(fragment.classes).toHaveProperty("S")
    expect(fragment.warnings.map((w) => w.message)).toEqual([
      "Linee tratteggiate senza testa lette come associazioni (riga 9)",
      "Relazioni con due teste scartate (riga 10)",
      "Interfacce lollipop scartate (riga 11)",
    ])
  })
})

describe("mapClass: classi e membri", () => {
  it("unisce blocchi e righe in ordine, e crea vuote le classi delle sole relazioni", () => {
    const { classes } = map(CLASS_VALID.basic!)
    expect(classes.Animal).toEqual({
      name: "Animal",
      stereotype: "class",
      attributes: [{ name: "age", type: "int", visibility: "public", isStatic: false }],
      methods: [{ name: "isMammal", type: "bool", visibility: "public", isStatic: false, isAbstract: false, parameters: [] }],
    })
    expect(classes.Duck!.attributes.map((a) => a.name)).toEqual(["beakColor"])
    expect(map("classDiagram\n  A --> B\n").classes.B).toEqual({ name: "B", stereotype: "class", attributes: [], methods: [] })
  })

  it("legge visibilità, statici, astratti e generici dei membri", () => {
    const ordine = map(CLASS_VALID.members!).classes.Ordine!
    expect(ordine.stereotype).toBe("abstract")
    expect(ordine.attributes).toEqual([
      { name: "id", type: "int", visibility: "private", isStatic: false },
      { name: "totale", type: "double", visibility: "public", isStatic: false },
      { name: "righe", type: "List<Riga>", visibility: "protected", isStatic: true },
      { name: "stato", type: "", visibility: "package", isStatic: false },
    ])
    expect(ordine.methods.map((m) => [m.name, m.type, m.isStatic, m.isAbstract, m.parameters])).toEqual([
      ["Ordine", "", false, false, [{ name: "id", type: "int" }]],
      ["aggiungi", "bool", false, false, [{ name: "r", type: "Riga" }, { name: "quantita", type: "int" }]],
      ["conta", "int", true, false, []],
      ["calcola", "double", false, true, [{ name: "pesi", type: "Map<string, List<int>>" }]],
    ])
  })

  it("riconosce gli stereotipi senza badare alle maiuscole, e avvisa sugli altri", () => {
    const fragment = map(CLASS_VALID.annotations!)
    expect(Object.values(fragment.classes).map((c) => [c.name, c.stereotype])).toEqual([
      ["Forma", "interface"], ["Colore", "enum"], ["Servizio", "class"],
    ])
    expect(fragment.classes.Colore!.attributes.map((a) => [a.name, a.type])).toEqual([["ROSSO", ""], ["VERDE", ""]])
    expect(fragment.warnings.map((w) => w.message)).toEqual([
      "Stereotipi sconosciuti, letti come classe: Servizio «Service» (riga 10)",
      "Più stereotipi sulla stessa classe, si tiene il primo: Servizio (riga 10)",
    ])
  })

  it("tiene il primo attributo omonimo e il primo metodo con la stessa firma, ma gli overload restano", () => {
    const text = "classDiagram\n  class A {\n    +int x\n    +string x\n    +f(int a)\n    +f(int b) bool\n    +f(string a)\n    +y*\n  }\n"
    const a = map(text).classes.A!
    expect(a.attributes.map((x) => [x.name, x.type])).toEqual([["x", "int"], ["y", ""]])
    expect(a.methods.map((m) => m.parameters.map((p) => p.type))).toEqual([["int"], ["string"]])
    expect(warnings(text)).toEqual([
      "Attributi ripetuti nella stessa classe, si tiene il primo: A.x (riga 4)",
      "Metodi con la stessa firma nella stessa classe, si tiene il primo: A.f(int) (riga 6)",
      "«*» su un attributo scartato: solo i metodi sono astratti: A.y (riga 8)",
    ])
  })

  it("scarta etichetta e parametro generico delle classi, con un avviso", () => {
    const fragment = map(CLASS_VALID.namespaceAndStyle!)
    expect(Object.keys(fragment.classes)).toEqual(["Cliente", "Ordine Web", "Square"])
    expect(fragment.warnings.map((w) => w.message)).toEqual([
      "Etichette delle classi scartate, il nome resta l'id: Square (riga 11)",
      "Parametri generici delle classi scartati: Square~Shape~ (riga 11)",
    ])
  })
})

describe("mapClass: note", () => {
  it("ancora le note alle classi del frammento, e libera quelle su una classe che non c'è", () => {
    const fragment = map(CLASS_VALID.notes!)
    expect(fragment.notes).toEqual([
      { text: "libera", anchor: null },
      { text: 'uno\ndue <tre> & "quattro"', anchor: "class/A" },
      { text: "pendente", anchor: null },
    ])
    expect(fragment.warnings.map((w) => w.message)).toEqual(["Note su una classe che non c'è, diventate libere: Fantasma (riga 5)"])
  })
})
