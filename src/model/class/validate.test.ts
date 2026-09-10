import { describe, expect, it } from "vitest"
import { validateClass } from "./validate"
import type { ClassMethod, ClassModel, ClassNode, ClassRelation } from "./schema"

const classe = (name: string, extra: Partial<ClassNode> = {}): ClassNode =>
  ({ name, stereotype: "class", attributes: [], methods: [], ...extra })

/** Un modello con le classi date e le relazioni date. Nomi inventati.
 *  La chiave di una classe è il suo nome (§4); le relazioni prendono chiavi
 *  progressive, che nessuna regola guarda. */
function modello(classi: ClassNode[], relazioni: ClassRelation[] = []): ClassModel {
  return {
    classes: Object.fromEntries(classi.map((c) => [c.name, c])),
    relations: Object.fromEntries(relazioni.map((r, i) => [`r${i}`, r])),
  }
}

const end = (c: string) => ({ class: c, multiplicity: "", role: "" })
const gen = (figlio: string, padre: string): ClassRelation =>
  ({ kind: "generalization", source: end(figlio), target: end(padre) })
const real = (figlio: string, padre: string): ClassRelation =>
  ({ kind: "realization", source: end(figlio), target: end(padre) })

describe("validateClass", () => {
  it("un modello vuoto non ha problemi", () => {
    expect(validateClass(modello([]))).toEqual([])
  })

  it("due classi che differiscono solo per maiuscole: avviso", () => {
    const issues = validateClass(modello([classe("Cliente"), classe("cliente")]))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: "class-name-clash", severity: "warning" })
  })

  it("attributo duplicato: errore", () => {
    const c = classe("Cliente", { attributes: [
      { name: "id", type: "int", visibility: "public", isStatic: false },
      { name: "id", type: "string", visibility: "public", isStatic: false },
    ] })
    expect(validateClass(modello([c]))[0]).toMatchObject({ code: "duplicate-member", severity: "error", node: "Cliente" })
  })

  it("due metodi con lo stesso nome ma parametri diversi sono un overload legale", () => {
    const c = classe("Cliente", { methods: [
      { name: "trova", type: "void", visibility: "public", isStatic: false, isAbstract: false, parameters: [{ name: "a", type: "int" }] },
      { name: "trova", type: "void", visibility: "public", isStatic: false, isAbstract: false, parameters: [{ name: "a", type: "string" }] },
    ] })
    expect(validateClass(modello([c]))).toEqual([])
  })

  it("due metodi con nome e tipi dei parametri identici: errore", () => {
    // I nomi dei parametri differiscono, i tipi no: non è un overload, è un duplicato.
    // Se il confronto guardasse anche i nomi, questo caso passerebbe per buono.
    const c = classe("Cliente", { methods: [
      { name: "trova", type: "void", visibility: "public", isStatic: false, isAbstract: false, parameters: [{ name: "a", type: "int" }] },
      { name: "trova", type: "void", visibility: "public", isStatic: false, isAbstract: false, parameters: [{ name: "b", type: "int" }] },
    ] })
    expect(validateClass(modello([c]))[0]).toMatchObject({ code: "duplicate-member", severity: "error", node: "Cliente" })
  })

  it("una relazione verso una classe inesistente: errore", () => {
    const issues = validateClass(modello([classe("Cliente")], [gen("Cliente", "Fantasma")]))
    expect(issues[0]).toMatchObject({ code: "dangling-relation", severity: "error" })
  })

  it("un ciclo di generalizzazione di due: errore", () => {
    const issues = validateClass(modello([classe("A"), classe("B")], [gen("A", "B"), gen("B", "A")]))
    expect(issues.filter((i) => i.code === "generalization-cycle")).toHaveLength(1)
  })

  it("un ciclo di generalizzazione di tre: errore, e uno solo", () => {
    const m = modello([classe("A"), classe("B"), classe("C")], [gen("A", "B"), gen("B", "C"), gen("C", "A")])
    expect(validateClass(m).filter((i) => i.code === "generalization-cycle")).toHaveLength(1)
  })

  it("una gerarchia a diamante non è un ciclo", () => {
    const m = modello([classe("A"), classe("B"), classe("C"), classe("D")],
      [gen("B", "A"), gen("C", "A"), gen("D", "B"), gen("D", "C")])
    expect(validateClass(m).filter((i) => i.code === "generalization-cycle")).toHaveLength(0)
  })

  it("un ciclo di generalizzazione punta a una classe del ciclo, per essere navigabile dal pannello", () => {
    // IssuesPanel seleziona cliccando su issue.node/issue.edge (src/ui/panels/IssuesPanel.tsx):
    // senza uno dei due, il click su questo issue non porta l'utente da nessuna parte.
    const issues = validateClass(modello([classe("A"), classe("B")], [gen("A", "B"), gen("B", "A")]))
    const cycle = issues.find((i) => i.code === "generalization-cycle")
    expect(cycle).toMatchObject({ node: "A" })
  })

  it("una classe che eredita da sé stessa: ciclo di lunghezza uno", () => {
    const issues = validateClass(modello([classe("A")], [gen("A", "A")]))
    expect(issues.filter((i) => i.code === "generalization-cycle")).toHaveLength(1)
  })

  it("due cicli disgiunti nello stesso modello: due issue, non una", () => {
    const m = modello([classe("A"), classe("B"), classe("C"), classe("D")],
      [gen("A", "B"), gen("B", "A"), gen("C", "D"), gen("D", "C")])
    expect(validateClass(m).filter((i) => i.code === "generalization-cycle")).toHaveLength(2)
  })

  it("un ciclo misto generalization/realization è rilevato come qualunque altro ciclo", () => {
    const m = modello([classe("A"), classe("B")], [gen("A", "B"), real("B", "A")])
    expect(validateClass(m).filter((i) => i.code === "generalization-cycle")).toHaveLength(1)
  })

  it("un metodo abstract in una classe concreta: avviso", () => {
    const c = classe("Cliente", { methods: [
      { name: "f", type: "void", visibility: "public", isStatic: false, isAbstract: true, parameters: [] },
    ] })
    expect(validateClass(modello([c]))[0]).toMatchObject({ code: "abstract-method-in-concrete-class", severity: "warning" })
  })

  it("lo stesso metodo in una classe abstract o interface non è un problema", () => {
    const f: ClassMethod = { name: "f", type: "void", visibility: "public", isStatic: false, isAbstract: true, parameters: [] }
    // `toEqual([])` e non un filtro sul codice: qui non deve scattare nessuna regola.
    expect(validateClass(modello([classe("A", { stereotype: "abstract", methods: [f] })]))).toEqual([])
    expect(validateClass(modello([classe("B", { stereotype: "interface", methods: [f] })]))).toEqual([])
  })
})
