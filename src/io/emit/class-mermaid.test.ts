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

describe("emitClassMermaid: navigabilità", () => {
  it("l'associazione navigabile esce con -->, quella nuda con --", () => {
    const rel = (navigable?: boolean) => ({
      classes: { A: { name: "A", stereotype: "class" as const, attributes: [], methods: [] }, B: { name: "B", stereotype: "class" as const, attributes: [], methods: [] } },
      relations: { r: { kind: "association" as const, ...(navigable === undefined ? {} : { navigable }), source: { class: "A", multiplicity: "", role: "" }, target: { class: "B", multiplicity: "", role: "" } } },
      notes: {},
    })
    expect(emitClassMermaid(rel(true)).text).toContain("A --> B")
    expect(emitClassMermaid(rel(false)).text).toContain("A -- B")
    expect(emitClassMermaid(rel()).text).toContain("A -- B")
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

describe("note", () => {
  const modello = (notes: Record<string, { text: string }>) => ({ classes: {}, relations: {}, notes })

  it("una nota diventa una riga note, fuori da qualunque blocco class", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "da rivedere" } }))
    expect(text).toContain('note "da rivedere"')
    expect(text).not.toContain("class {")
  })

  it("gli a capo veri diventano <br>, non un backslash-n visibile (misurato su mermaid@11)", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "prima\nseconda" } }))
    expect(text).toContain('note "prima<br>seconda"')
    // Una riga sola nell'output: l'a capo vero romperebbe la sintassi.
    expect(text.split("\n").filter((l) => l.includes("note ")).length).toBe(1)
  })

  it("le virgolette doppie diventano l'entità #quot;, misurata dentro una note: rende la virgoletta vera", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: 'il campo "id"' } }))
    expect(text).toContain(`note "il campo #quot;id#quot;"`)
  })

  it("`<`, `>` e `&` grezzi si escapano con le entità di Mermaid, o l'HTML viene interpretato e il testo si perde", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "se a<b allora <b>grassetto</b>" } }))
    expect(text).toContain('note "se a#lt;b allora #lt;b#gt;grassetto#lt;/b#gt;"')
  })

  it("l'utente scrive una propria entità (&lt;): l'& si escapa per primo, così non viene decodificata due volte", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "Tizio & Caio, &lt;" } }))
    // Se l'& non fosse il primo a essere escapato, questo testo uscirebbe identico a un `<` vero
    // e verrebbe interpretato come tale da Mermaid — invece deve restare `&lt;` letterale.
    expect(text).toContain('note "Tizio #amp; Caio, #amp;lt;"')
  })

  it("una nota con newline e `<` letterale: l'ordine conta, il <br> emesso deve sopravvivere alla propria escape di `<`", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "riga1 <b>\nriga2" } }))
    // Se la sostituzione dell'a capo girasse prima dell'escape di `<`, il `<br>` risulterebbe
    // a sua volta escapato in `#lt;br#gt;` invece di restare un vero a capo per Mermaid.
    expect(text).toContain('note "riga1 #lt;b#gt;<br>riga2"')
  })

  it("una nota con newline, virgoletta, `<` e `&` tutti insieme: l'escape sopravvive esatto", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: 'riga1 & "cit" <b>\nriga2' } }))
    expect(text).toContain('note "riga1 #amp; #quot;cit#quot; #lt;b#gt;<br>riga2"')
  })

  it("una nota vuota non produce nessuna riga", () => {
    const { text } = emitClassMermaid(modello({ "n-1": { text: "" } }))
    expect(text).not.toContain("note ")
  })
})

describe("tipi che Mermaid non porta com'è", () => {
  const conTipo = (type: string) => ({
    classes: { A: { name: "A", stereotype: "class" as const, attributes: [{ name: "campo", type, visibility: "public" as const, isStatic: false }], methods: [] } },
    relations: {},
    notes: {},
  })

  it("i generici passano alle tilde, che è la sintassi che Mermaid interpreta", () => {
    expect(emitClassMermaid(conTipo("List<Ordine>")).text).toContain("+List~Ordine~ campo")
  })

  it("anche con la virgola: misurato su mermaid@11, contro quel che dice la doc", () => {
    expect(emitClassMermaid(conTipo("Map<string, int>")).text).toContain("+Map~string, int~ campo")
  })

  it("un generico annidato traduce tutte le coppie, non solo la più esterna", () => {
    expect(emitClassMermaid(conTipo("Map<string, List<int>>")).text).toContain("+Map~string, List~int~~ campo")
  })

  it("un generico annidato non è rappresentabile in Mermaid: resta in forma a tilde, ma con un avviso aggregato", () => {
    // Misurato su mermaid@11: `Map~string, List~int~~` rende `Map<string, List<int~>`, testo mangled.
    // Nessuna codifica lo risolve — è un limite di Mermaid — quindi si avvisa invece di far finta di niente.
    const { text, warnings } = emitClassMermaid(conTipo("Map<string, List<int>>"))
    expect(text).toContain("+Map~string, List~int~~ campo")
    expect(warnings.join(" ")).toContain("A.campo")
    expect(warnings.join(" ")).toMatch(/annidat/i)
  })

  it("un generico piatto non allarma: rende corretto in Mermaid", () => {
    expect(emitClassMermaid(conTipo("Map<string, int>")).warnings).toEqual([])
  })

  it("il `>` di `=>` non è una parentesi angolare e non si tocca", () => {
    // È il quinto difetto del Task 8 del piano precedente: il parser gestisce `(int) => void`
    // apposta, e una sostituzione cieca lo trasformerebbe in `(int) =~ void`.
    const { text } = emitClassMermaid(conTipo("(int) => void"))
    expect(text).toContain("=>")
    expect(text).not.toContain("=~")
  })

  it("un tipo con angolari sbilanciate esce com'era, con un avviso", () => {
    const { text, warnings } = emitClassMermaid(conTipo("List<Ordine"))
    expect(text).toContain("List<Ordine")
    expect(warnings.join(" ")).toContain("A.campo")
    expect(warnings.join(" ")).toContain("sbilanciate")
  })

  it("le graffe si rimuovono: una sola fa fallire il parsing dell'intero diagramma", () => {
    const { text, warnings } = emitClassMermaid(conTipo("string {readOnly}"))
    expect(text).toContain("+string campo")
    // Nota: non `expect(text).not.toContain("{")` sull'intero testo — il blocco `class A {` lo
    // contiene sempre, per sintassi Mermaid. Qui si verifica che sia la riga del membro a non
    // portarsi dietro la graffa, che è quanto il test vuole davvero controllare.
    expect(text.split("\n").find((l) => l.includes("campo"))).not.toContain("{")
    expect(warnings.join(" ")).toContain("A.campo")
    expect(warnings.join(" ")).toContain("graffe")
  })

  it("una graffa spaiata si rimuove dalla graffa in poi", () => {
    expect(emitClassMermaid(conTipo("string {read")).text).toContain("+string campo")
  })

  it("gli avvisi sono aggregati, non uno per membro", () => {
    const modello = conTipo("string {readOnly}")
    modello.classes.A.attributes.push({ name: "altro", type: "int {x}", visibility: "public", isStatic: false })
    expect(emitClassMermaid(modello).warnings.filter((w) => w.includes("graffe"))).toHaveLength(1)
  })

  it("`= valore` passa senza avviso: Mermaid lo rende letteralmente", () => {
    const { text, warnings } = emitClassMermaid(conTipo("decimal = 0"))
    expect(text).toContain("+decimal = 0 campo")
    expect(warnings).toEqual([])
  })

  it("angolari sbilanciate e graffe nello stesso tipo: la graffa si toglie comunque, in entrambi gli avvisi", () => {
    // La graffa è quella fatale (rompe il parsing dell'intero diagramma): va rimossa anche quando
    // la traduzione dei generici fallisce, non solo quando riesce.
    const { text, warnings } = emitClassMermaid(conTipo("List<Foo {x}"))
    expect(text).toContain("+List<Foo campo")
    expect(text.split("\n").find((l) => l.includes("campo"))).not.toContain("{")
    expect(warnings.join(" ")).toContain("sbilanciate")
    expect(warnings.join(" ")).toContain("graffe")
    expect(warnings.filter((w) => w.includes("A.campo"))).toHaveLength(2)
  })

  it("il tipo passa anche da parametro e ritorno di un metodo, non solo dagli attributi", () => {
    const modello: ClassModel = {
      classes: {
        A: {
          name: "A",
          stereotype: "class",
          attributes: [],
          methods: [{
            name: "salva",
            type: "Map<string, int>",
            visibility: "public",
            isStatic: false,
            isAbstract: false,
            parameters: [{ name: "x", type: "List<Ordine>" }],
          }],
        },
      },
      relations: {},
      notes: {},
    }
    const { text, warnings } = emitClassMermaid(modello)
    expect(text).toContain("+salva(List~Ordine~ x) Map~string, int~")
    expect(warnings).toEqual([])
  })
})
