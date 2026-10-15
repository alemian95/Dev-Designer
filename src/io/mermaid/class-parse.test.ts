import { describe, expect, it } from "vitest"
import { MermaidSyntaxError } from "./common"
import { CLASS_VALID } from "./class-fixtures"
import { decodeGenerics, parseClass, type ClassAstRelation } from "./class-parse"

const relation = (line: string): ClassAstRelation => parseClass(`classDiagram\n  ${line}\n`).ast.relations[0]!
const members = (body: string) => parseClass(`classDiagram\n  class A {\n${body}\n  }\n`).ast.classes[0]!.members
const syntaxError = (text: string): { message: string; at: number } => {
  try {
    parseClass(text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { message: e.message, at: e.at }
    throw e
  }
  throw new Error("nessun errore")
}

describe("decodeGenerics", () => {
  it("riporta fra <> i generici piatti e annidati", () => {
    expect(decodeGenerics("List~int~")).toBe("List<int>")
    expect(decodeGenerics("Map~string, int~")).toBe("Map<string, int>")
    expect(decodeGenerics("Map~string, List~int~~")).toBe("Map<string, List<int>>")
    expect(decodeGenerics("List~Map~string, List~int~~~ x")).toBe("List<Map<string, List<int>>> x")
    expect(decodeGenerics("Func~(int) => void~")).toBe("Func<(int) => void>")
  })

  it("lascia stare il testo senza tilde e rifiuta le tilde che non si chiudono", () => {
    expect(decodeGenerics("double precision")).toBe("double precision")
    expect(decodeGenerics("List~int")).toBeNull()
    expect(decodeGenerics("int~")).toBeNull()
  })
})

describe("parseClass: relazioni", () => {
  it("legge teste, linea e lati come sono scritti", () => {
    expect(relation("A <|-- B")).toMatchObject({ left: "A", leftHead: "extension", dotted: false, rightHead: null, right: "B" })
    expect(relation("C ..|> D")).toMatchObject({ leftHead: null, dotted: true, rightHead: "extension" })
    expect(relation("E *-- F")).toMatchObject({ leftHead: "composition" })
    expect(relation("G --o H")).toMatchObject({ rightHead: "aggregation", right: "H" })
    expect(relation("I --> J")).toMatchObject({ rightHead: "dependency" })
    expect(relation("U <-- V")).toMatchObject({ leftHead: "dependency" })
    expect(relation("M -- N")).toMatchObject({ leftHead: null, rightHead: null, dotted: false })
    expect(relation("Q <|--|> R")).toMatchObject({ leftHead: "extension", rightHead: "extension" })
    expect(relation("S ()-- T")).toMatchObject({ leftHead: "lollipop" })
  })

  it("legge molteplicità ed etichetta, anche senza spazi", () => {
    expect(relation('Cliente "1" --> "0..*" Ordine : effettua')).toMatchObject({
      left: "Cliente", leftMultiplicity: "1", rightMultiplicity: "0..*", right: "Ordine", label: "effettua",
    })
    expect(relation('Ordine"1"*--"1..*"Riga')).toMatchObject({ leftMultiplicity: "1", leftHead: "composition", right: "Riga", label: null })
    expect(relation("A --> B : due parole")).toMatchObject({ label: "due parole" })
  })

  it("non scambia per una testa la o iniziale di un nome, né per una linea il trattino di un nome", () => {
    expect(relation("order -- B")).toMatchObject({ left: "order", leftHead: null })
    expect(relation("A <|-- order")).toMatchObject({ rightHead: null, right: "order" })
    expect(relation("A-->B")).toMatchObject({ left: "A", rightHead: "dependency", right: "B" })
    expect(relation("a.b --> c-d")).toMatchObject({ left: "a.b", right: "c-d" })
    expect(relation("Città --> Paese")).toMatchObject({ left: "Città", right: "Paese" })
  })

  it("toglie i backtick e registra il generico di un estremo come dichiarazione", () => {
    const { ast } = parseClass("classDiagram\n  `Ordine Web` <|-- Square~Shape~\n")
    expect(ast.relations[0]).toMatchObject({ left: "Ordine Web", right: "Square" })
    expect(ast.classes).toMatchObject([{ id: "Square", generic: "Shape" }])
  })
})

describe("parseClass: membri", () => {
  it("spezza attributi e metodi, con visibilità e classificatori", () => {
    expect(members(`    -int id\n    +totale: double\n    #List~Riga~ righe$\n    ~stato\n    +y*`)).toMatchObject([
      { kind: "attribute", visibility: "-", name: "id", type: "int", isStatic: false },
      { kind: "attribute", visibility: "+", name: "totale", type: "double" },
      { kind: "attribute", visibility: "#", name: "righe", type: "List<Riga>", isStatic: true },
      { kind: "attribute", visibility: "~", name: "stato", type: "" },
      { kind: "attribute", name: "y", isAbstract: true },
    ])
    expect(members(`    +aggiungi(Riga r, quantita: int, x) bool\n    +conta()$ int\n    +calcola(Map~string, List~int~~ pesi) double$*\n    Ordine()`)).toMatchObject([
      { kind: "method", name: "aggiungi", returnType: "bool", parameters: [{ name: "r", type: "Riga" }, { name: "quantita", type: "int" }, { name: "x", type: "" }] },
      { kind: "method", name: "conta", returnType: "int", isStatic: true, isAbstract: false },
      { kind: "method", name: "calcola", parameters: [{ name: "pesi", type: "Map<string, List<int>>" }], returnType: "double", isStatic: true, isAbstract: true },
      { kind: "method", visibility: "", name: "Ordine", parameters: [], returnType: "" },
    ])
  })

  it("chiude la lista dei parametri sulla parentesi giusta, anche con un tipo funzione nel ritorno", () => {
    expect(members(`    +get() Func~(int) => void~\n    +on(Func~(int) => void~ f) Func~(int) => void~`)).toMatchObject([
      { kind: "method", name: "get", parameters: [], returnType: "Func<(int) => void>" },
      { kind: "method", name: "on", parameters: [{ name: "f", type: "Func<(int) => void>" }], returnType: "Func<(int) => void>" },
    ])
  })

  it("non spezza un tipo sul :: né sulla freccia di un tipo funzione", () => {
    expect(members(`    std::string nome\n    +on(Func~(int) => void~ f, int n)`)).toMatchObject([
      { name: "nome", type: "std::string" },
      { parameters: [{ name: "f", type: "Func<(int) => void>" }, { name: "n", type: "int" }] },
    ])
  })

  it("legge i membri in riga, le annotazioni ovunque e il blocco su una riga sola", () => {
    const { ast } = parseClass(CLASS_VALID.basic!)
    expect(ast.classes.map((c) => [c.id, c.members.map((m) => m.name)])).toEqual([
      ["Animal", ["age"]], ["Animal", ["isMammal"]], ["Duck", ["beakColor", "swim"]],
    ])
    const annotated = parseClass(CLASS_VALID.annotations!).ast.classes
    expect(annotated.map((c) => [c.id, c.annotations])).toEqual([
      ["Forma", ["interface"]], ["Colore", ["enumeration"]], ["Servizio", ["Service"]], ["Servizio", ["abstract"]],
    ])
    expect(parseClass("classDiagram\n  class A { +x }\n  class B {}\n").ast.classes.map((c) => c.members.length)).toEqual([1, 0])
  })

  it("segnala un generico a tilde sbilanciato e tiene il tipo com'è", () => {
    const { ast, warnings } = parseClass("classDiagram\n  class A {\n    +List~int x\n  }\n")
    expect(ast.classes[0]!.members[0]).toMatchObject({ name: "x", type: "List~int" })
    expect(warnings.map((w) => w.message)).toEqual(["Generici a tilde sbilanciati, il tipo resta com'è: List~int x (riga 3)"])
  })
})

describe("parseClass: note, etichette e scarti", () => {
  it("decodifica le note e distingue libere e ancorate", () => {
    expect(parseClass(CLASS_VALID.notes!).ast.notes).toMatchObject([
      { text: "libera", target: null },
      { text: 'uno\ndue <tre> & "quattro"', target: "A" },
      { text: "pendente", target: "Fantasma" },
    ])
  })

  it("appiattisce i namespace e scarta stili, interazioni, direzione e accessibilità con un avviso per categoria", () => {
    const { ast, warnings } = parseClass(CLASS_VALID.namespaceAndStyle!)
    expect(ast.classes.map((c) => [c.id, c.generic, c.label])).toEqual([
      ["Cliente", null, null], ["Ordine Web", null, null], ["Square", "Shape", "Quadrato"],
    ])
    expect(warnings.map((w) => w.message)).toEqual([
      "Direzione ignorata: il diagramma delle classi si dispone dall'alto in basso (riga 6)",
      "Namespace appiattiti: le classi entrano, i riquadri no (riga 7)",
      "Stili scartati (style, classDef, cssClass, :::), il diagramma usa i suoi (righe 11, 13, 14, 15)",
      "Interazioni scartate (click, callback, link) (riga 16)",
      "Titolo e descrizione di accessibilità scartati (righe 17, 18)",
    ])
  })

  it("ignora un nome da solo, come Mermaid", () => {
    expect(parseClass("classDiagram\n  A\n").ast).toEqual({ classes: [], relations: [], notes: [] })
  })

  it("legge i fine riga di Windows", () => {
    expect(parseClass("classDiagram\r\n  A --> B\r\n  class C {\r\n    +x\r\n  }\r\n").ast.classes[0]!.members).toMatchObject([{ name: "x" }])
  })
})

describe("parseClass: errori strutturali", () => {
  it("indica l'offset del problema", () => {
    expect(syntaxError("erDiagram\n")).toEqual({ message: "Il testo non comincia con classDiagram", at: 0 })
    expect(syntaxError("classDiagram\n  class A {\n    +x\n")).toEqual({ message: "Blocco «{» senza «}»", at: 23 })
    expect(syntaxError("classDiagram\n  class A {\n    +f() {x}\n  }\n")).toMatchObject({ message: "«{» dentro il blocco di una classe" })
    expect(syntaxError("classDiagram\n  namespace N {\n    class A\n")).toEqual({ message: "Namespace senza «}»", at: 15 })
    expect(syntaxError("classDiagram\n  }\n")).toEqual({ message: "«}» senza un blocco aperto", at: 15 })
    expect(syntaxError("classDiagram\n  A --> B C --> D\n")).toEqual({ message: "Riga non riconosciuta: «A --> B C --> D»", at: 15 })
  })

  it("resta lineare su un testo grande", () => {
    const lines = ["classDiagram"]
    for (let i = 0; i < 5000; i++) {
      lines.push(`  C${i} "1" <|-- "*" C${i + 1} : r`, `  class C${i} {`, "    +Map~string, List~int~~ cache$", "    +find(int id, nome: string) bool", "  }")
    }
    const started = performance.now()
    const { ast } = parseClass(lines.join("\n"))
    expect(ast.relations).toHaveLength(5000)
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it("rifiuta in fretta una riga lunga che non si legge", () => {
    const started = performance.now()
    expect(syntaxError(`classDiagram\n  ${"A".repeat(20000)} ? B\n`).message).toMatch(/^Riga non riconosciuta/)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
