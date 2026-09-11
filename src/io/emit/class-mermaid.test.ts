import { describe, expect, it } from "vitest"
import type { ClassModel, ClassNode, ClassRelation, RelationKind, Stereotype } from "@/model/class/schema"
import { parseMembers } from "@/model/class/members"
import { emitClassMermaid } from "./class-mermaid"

/** Padre e figlio con molteplicità DIVERSE fra i due lati: con molteplicità
 *  uguali il test passerebbe anche a lati invertiti, che è il difetto che
 *  questi casi esistono per prendere. */
const relazione = (kind: RelationKind): ClassRelation => ({
  kind,
  source: { class: "Figlio", multiplicity: "0..*", role: "" },
  target: { class: "Padre", multiplicity: "1", role: "" },
})

/** Una classe minima, senza membri: basta ad esistere come estremo di relazione o come blocco. */
function classe(name: string, stereotype: Stereotype = "class"): ClassNode {
  return { name, stereotype, attributes: [], methods: [] }
}

/** Un modello con Figlio e Padre già definiti e un'unica relazione fra loro. */
function modello(relazione: ClassRelation): ClassModel {
  return {
    classes: { Figlio: classe("Figlio"), Padre: classe("Padre") },
    relations: { r: relazione },
    notes: {},
  }
}

/** Un modello con una sola classe dal nome anomalo, nessuna relazione. */
function modelloCon(nome: string): ClassModel {
  return { classes: { [nome]: classe(nome) }, relations: {}, notes: {} }
}

/**
 * Il testo dei membri passa dal parser vero del Task 8, non da membri costruiti a mano: così
 * questi test provano la catena `parseMembers` → `emitClassMermaid`, non solo l'emettitore.
 */
function emitten(text: string): string {
  const parsed = parseMembers(text)
  if (!parsed.ok) throw new Error(`parseMembers fallito a riga ${parsed.line}: ${parsed.message}`)
  const model: ClassModel = {
    classes: { C: { name: "C", stereotype: "class", attributes: parsed.value.attributes, methods: parsed.value.methods } },
    relations: {},
    notes: {},
  }
  return emitClassMermaid(model).text
}

describe("emitClassMermaid: i sei tipi e i loro lati", () => {
  it("generalizzazione: il padre a sinistra, con la sua molteplicità", () => {
    const { text } = emitClassMermaid(modello(relazione("generalization")))
    expect(text).toContain('Padre "1" <|-- "0..*" Figlio')
  })

  it("realizzazione: l'implementatore a sinistra", () => {
    expect(emitClassMermaid(modello(relazione("realization"))).text)
      .toContain('Figlio "0..*" ..|> "1" Padre')
  })

  it("composizione: il tutto a sinistra", () => {
    expect(emitClassMermaid(modello(relazione("composition"))).text)
      .toContain('Padre "1" *-- "0..*" Figlio')
  })

  it("aggregazione: il tutto a sinistra", () => {
    expect(emitClassMermaid(modello(relazione("aggregation"))).text)
      .toContain('Padre "1" o-- "0..*" Figlio')
  })

  it("dipendenza: il dipendente a sinistra", () => {
    expect(emitClassMermaid(modello(relazione("dependency"))).text)
      .toContain('Figlio "0..*" ..> "1" Padre')
  })

  it("associazione: source a sinistra, link solido", () => {
    expect(emitClassMermaid(modello(relazione("association"))).text)
      .toContain('Figlio "0..*" -- "1" Padre')
  })

  it("molteplicità vuote non producono apici vuoti", () => {
    const senza = { ...relazione("association"), source: { class: "A", multiplicity: "", role: "" }, target: { class: "B", multiplicity: "", role: "" } }
    expect(emitClassMermaid(modello(senza)).text).not.toContain('""')
  })

  it("il nome della relazione va in coda dopo i due punti", () => {
    const conNome: ClassRelation = { ...relazione("generalization"), name: "possiede" }
    expect(emitClassMermaid(modello(conNome)).text).toContain('Padre "1" <|-- "0..*" Figlio : possiede')
  })
})

describe("emitClassMermaid: i membri", () => {
  it("il tipo precede il nome nei campi", () => {
    expect(emitten("+ id: int")).toContain("+int id")
  })
  it("un attributo senza tipo esce col solo nome", () => {
    expect(emitten("IN_CORSO")).toContain("+IN_CORSO")
  })
  it("il tipo di ritorno segue le parentesi separato da spazio", () => {
    expect(emitten("+ salva(x: int): void")).toContain("+salva(int x) void")
  })
  it("statico e astratto sono classificatori in coda", () => {
    expect(emitten("+ {static} conta(): int")).toContain("+conta() int$")
    expect(emitten("+ {abstract} render(): string")).toContain("+render() string*")
  })
  it("un campo statico porta il dollaro dopo il nome", () => {
    expect(emitten("+ {static} n: int")).toContain("+int n$")
  })
  it("un costruttore non emette tipo di ritorno", () => {
    expect(emitten("+ Persona(nome: string)")).toContain("+Persona(string nome)")
  })
  it("enum diventa enumeration, class non emette annotazione", () => {
    const m: ClassModel = {
      classes: { E: classe("E", "enum"), C: classe("C", "class") },
      relations: {},
      notes: {},
    }
    const { text } = emitClassMermaid(m)
    expect(text).toContain("<<Enumeration>>")
    expect(text).not.toMatch(/<<Class>>/i)
  })
})

describe("emitClassMermaid: nomi che Mermaid non prende nudi", () => {
  it("un nome con spazi viene sanificato e produce un avviso aggregato", () => {
    const { text, warnings } = emitClassMermaid(modelloCon("Ordine Cliente"))
    expect(text).not.toContain("Ordine Cliente")
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/1 nom/i)
  })
})
