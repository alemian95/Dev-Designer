import { describe, expect, it } from "vitest"
import { memberLines, memberText, parseMembers, type Members } from "./members"

/** Le dieci righe della tabella §5 della spec, tutte insieme. */
const TESTO = [
  "+ id: int",
  "- nome: string",
  "# creatoIl: DateTime",
  "~ interno: bool",
  "titolo: string",
  "IN_CORSO",
  "+ salva(x: int, y: string): void",
  "+ {static} conta(): int",
  "+ {abstract} render(): string",
  "+ Persona(nome: string)",
].join("\n")

function parsa(text: string): Members {
  const r = parseMembers(text)
  if (!r.ok) throw new Error(`atteso ok, ricevuto errore a riga ${r.line}: ${r.message}`)
  return r.value
}

describe("parseMembers", () => {
  it("legge visibilità, tipo e modificatori dalle dieci forme", () => {
    const m = parsa(TESTO)
    expect(m.attributes).toEqual([
      { name: "id", type: "int", visibility: "public", isStatic: false },
      { name: "nome", type: "string", visibility: "private", isStatic: false },
      { name: "creatoIl", type: "DateTime", visibility: "protected", isStatic: false },
      { name: "interno", type: "bool", visibility: "package", isStatic: false },
      { name: "titolo", type: "string", visibility: "public", isStatic: false },
      { name: "IN_CORSO", type: "", visibility: "public", isStatic: false },
    ])
    expect(m.methods).toEqual([
      { name: "salva", type: "void", visibility: "public", isStatic: false, isAbstract: false,
        parameters: [{ name: "x", type: "int" }, { name: "y", type: "string" }] },
      { name: "conta", type: "int", visibility: "public", isStatic: true, isAbstract: false, parameters: [] },
      { name: "render", type: "string", visibility: "public", isStatic: false, isAbstract: true, parameters: [] },
      { name: "Persona", type: "", visibility: "public", isStatic: false, isAbstract: false,
        parameters: [{ name: "nome", type: "string" }] },
    ])
  })

  it("le righe vuote si saltano senza diventare membri", () => {
    expect(parsa("+ a: int\n\n\n- b: int").attributes).toHaveLength(2)
  })

  it("i modificatori si accettano in qualsiasi ordine", () => {
    const uno = parsa("+ {static} {abstract} f(): void").methods[0]!
    const due = parsa("+ {abstract} {static} f(): void").methods[0]!
    expect(uno).toEqual(due)
  })

  it("un tipo con parentesi nei parametri non confonde il tipo di ritorno", () => {
    const m = parsa("+ trova(f: Map<K, V>): List<T>").methods[0]!
    expect(m.type).toBe("List<T>")
    expect(m.parameters).toEqual([{ name: "f", type: "Map<K, V>" }])
  })

  it("rifiuta le parentesi non bilanciate dicendo quale riga", () => {
    const r = parseMembers("+ a: int\n+ salva(x: int")
    expect(r).toMatchObject({ ok: false, line: 2 })
    expect(r.ok === false && r.message).toMatch(/parentesi/i)
  })

  it("rifiuta un modificatore che non esiste", () => {
    expect(parseMembers("+ {virtual} f(): void")).toMatchObject({ ok: false, line: 1 })
  })

  it("rifiuta un nome vuoto", () => {
    expect(parseMembers("+ : int")).toMatchObject({ ok: false, line: 1 })
  })

  it("rifiuta {abstract} su un attributo: il modello non ha dove metterlo", () => {
    const r = parseMembers("+ {abstract} x: int")
    expect(r).toMatchObject({ ok: false, line: 1 })
    expect(r.ok === false && r.message).toMatch(/attributo/i)
  })

  it("rifiuta un ')' estraneo prima della '(' del metodo, invece di metterlo nel nome", () => {
    const r = parseMembers("+ f)(x: int): void")
    expect(r).toMatchObject({ ok: false, line: 1 })
    expect(r.ok === false && r.message).toMatch(/nome/i)
  })

  it("rifiuta un ')' estraneo nel nome di un attributo senza parentesi", () => {
    const r = parseMembers("+ x): int")
    expect(r).toMatchObject({ ok: false, line: 1 })
    expect(r.ok === false && r.message).toMatch(/nome/i)
  })

  it("rifiuta un '<' mai richiuso nei parametri, invece di far sparire il parametro dopo", () => {
    const r = parseMembers("+ f(x: Map<K, y: int): void")
    expect(r).toMatchObject({ ok: false, line: 1 })
    expect(r.ok === false && r.message).toMatch(/parentesi/i)
  })

  it("il tipo di un attributo si divide sull'ultimo ':' fuori dalle parentesi angolari", () => {
    const m = parsa("+ a: Map<K: V>")
    expect(m.attributes[0]).toEqual({ name: "a", type: "Map<K: V>", visibility: "public", isStatic: false })
  })

  it("il tipo di un attributo si divide sull'ultimo ':' fuori dalle parentesi graffe", () => {
    const m = parsa("+ x: { a: int }")
    expect(m.attributes[0]).toEqual({ name: "x", type: "{ a: int }", visibility: "public", isStatic: false })
  })

  it("un tipo di parametro a funzione con parentesi tonde non rompe il conteggio", () => {
    const m = parsa("+ f(cb: (int) => void): void")
    expect(m.methods[0]!.parameters).toEqual([{ name: "cb", type: "(int) => void" }])
    expect(m.methods[0]!.type).toBe("void")
  })
})

describe("round trip", () => {
  it("parseMembers(memberText(m)) è m", () => {
    const m = parsa(TESTO)
    expect(parsa(memberText(m))).toEqual(m)
  })

  it("memberText produce la forma canonica, non quella allineata", () => {
    expect(memberText(parsa("+   id   :   int"))).toBe("+ id: int")
  })

  it("memberText porta lo spazio dietro il modificatore, non attaccato al simbolo", () => {
    expect(memberText(parsa("+ {static} conta(): int"))).toBe("+ {static} conta(): int")
  })

  it("la forma canonica ordina i modificatori static poi abstract, qualunque sia l'ordine in ingresso", () => {
    expect(memberText(parsa("+ {abstract} {static} f(): void"))).toBe("+ {static} {abstract} f(): void")
  })
})

describe("memberLines", () => {
  it("allinea i nomi con spazi, perché il font è monospace", () => {
    const righe = memberLines(parsa("+ id: int\n- descrizione: string"))
    expect(righe[0]!.text.indexOf("int")).toBe(righe[1]!.text.indexOf("string"))
  })

  it("un tipo vuoto non lascia due punti pendenti", () => {
    expect(memberLines(parsa("IN_CORSO"))[0]!.text).not.toContain(":")
  })
})

describe("memberLines e lo statico", () => {
  const attributo = (name: string, isStatic: boolean) => ({ name, type: "int", visibility: "public" as const, isStatic })

  it("la riga resa non contiene più {static}: al suo posto il nome va sottolineato", () => {
    const [riga] = memberLines({ attributes: [attributo("contatore", true)], methods: [] })
    expect(riga!.text).not.toContain("{static}")
    expect(riga!.underline).not.toBeNull()
  })

  it("gli estremi del sottolineato ritagliano esattamente il nome", () => {
    const [riga] = memberLines({ attributes: [attributo("contatore", true)], methods: [] })
    const { from, to } = riga!.underline!
    expect(riga!.text.slice(from, to)).toBe("contatore")
  })

  it("un membro non statico non ha sottolineato", () => {
    const [riga] = memberLines({ attributes: [attributo("id", false)], methods: [] })
    expect(riga!.underline).toBeNull()
  })

  it("{abstract} resta nel testo: è notazione UML legittima", () => {
    const metodo = { name: "render", type: "string", visibility: "public" as const, isStatic: false, isAbstract: true, parameters: [] }
    const [riga] = memberLines({ attributes: [], methods: [metodo] })
    expect(riga!.text).toContain("{abstract}")
  })

  it("memberText non cambia: {static} resta nella sintassi che il parser rilegge", () => {
    const testo = memberText({ attributes: [attributo("contatore", true)], methods: [] })
    expect(testo).toContain("{static}")
    const round = parseMembers(testo)
    expect(round.ok && round.value.attributes[0]!.isStatic).toBe(true)
  })

  it("le colonne restano allineate sulle righe rese, non su quelle canoniche", () => {
    const righe = memberLines({ attributes: [attributo("a", true), attributo("bbbbbb", false)], methods: [] })
    const colonne = righe.map((r) => r.text.indexOf(":"))
    expect(new Set(colonne).size).toBe(1)
  })
})
