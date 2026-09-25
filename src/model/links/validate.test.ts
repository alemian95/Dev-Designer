import { describe, expect, it } from "vitest"
import type { ClassAttribute, Stereotype } from "../class/schema"
import { createDocument, type DevDocument } from "../document"
import type { Attribute } from "../er/schema"
import { validateLinks } from "./validate"

const col = (name: string, type: string): Attribute => ({ name, type, primaryKey: false, foreignKey: false, nullable: false, unique: false })
const attr = (name: string, type: string, isStatic = false): ClassAttribute => ({ name, type, visibility: "public", isStatic })

/** Un'entità `ordini` e una classe `Ordine` (di serie `class`, salvo indicazione), collegate da «mappa su» con id `l1`. */
function documento(columns: Attribute[], attributes: ClassAttribute[], stereotype: Stereotype = "class"): DevDocument {
  const doc = createDocument("t", "t")
  doc.diagram.er.model.entities["ordini"] = { name: "ordini", attributes: columns }
  doc.diagram.class.model.classes["Ordine"] = { name: "Ordine", stereotype, attributes, methods: [] }
  doc.diagram.links["l1"] = { kind: "maps-to", source: "class/Ordine", target: "er/ordini" }
  return doc
}

describe("validateLinks", () => {
  it("un documento senza collegamenti non ha problemi", () => {
    expect(validateLinks(createDocument("x"))).toEqual([])
  })

  it("un attributo senza colonna è un avviso sul collegamento", () => {
    expect(validateLinks(documento([col("id", "bigint")], [attr("note", "string")]))).toEqual([
      { code: "link-attribute-missing", severity: "warning", message: "«Ordine.note» non ha una colonna in «ordini»", edge: "l1" },
    ])
  })

  it("created_at e createdAt sono lo stesso campo", () => {
    expect(validateLinks(documento([col("created_at", "timestamp")], [attr("createdAt", "Carbon")]))).toEqual([])
  })

  it("un attributo static non è una colonna", () => {
    expect(validateLinks(documento([], [attr("tabella", "string", true)]))).toEqual([])
  })

  it("tipi incompatibili sono un avviso con i due tipi", () => {
    expect(validateLinks(documento([col("totale", "numeric(10,2)")], [attr("totale", "string")]))).toEqual([
      {
        code: "link-type-mismatch",
        severity: "warning",
        message: "«Ordine.totale: string» non è compatibile con «ordini.totale numeric(10,2)»",
        edge: "l1",
      },
    ])
  })

  it("tinyint accetta un bool", () => {
    expect(validateLinks(documento([col("attivo", "tinyint(1)")], [attr("attivo", "bool")]))).toEqual([])
  })

  it("?int e int|null sono interi", () => {
    expect(validateLinks(documento([col("n", "int")], [attr("n", "?int")]))).toEqual([])
    expect(validateLinks(documento([col("n", "int")], [attr("n", "int|null")]))).toEqual([])
  })

  it("un tipo sconosciuto non avvisa", () => {
    expect(validateLinks(documento([col("stato", "enum('a','b')")], [attr("stato", "StatoOrdine")]))).toEqual([])
  })

  it("un tipo che si chiama constructor non avvisa", () => {
    // Review Focus 2: una tabella dei tipi su un oggetto letterale troverebbe `Object.prototype.constructor`.
    expect(validateLinks(documento([col("x", "varchar")], [attr("x", "constructor")]))).toEqual([])
    expect(validateLinks(documento([col("x", "toString")], [attr("x", "string")]))).toEqual([])
  })

  it("un collegamento pendente è un errore, senza avvisi sugli attributi", () => {
    const doc = documento([], [attr("note", "string")])
    delete doc.diagram.er.model.entities["ordini"]
    expect(validateLinks(doc)).toEqual([
      {
        code: "link-dangling",
        severity: "error",
        message: "Il collegamento «mappa su» fra «Ordine» e «ordini» punta a un elemento che non esiste più",
        edge: "l1",
      },
    ])
  })

  it("una classe interface collegata è un errore, senza avvisi sugli attributi", () => {
    // F1 (review finale): la regola «solo class e abstract» torna a valere anche dopo il collegamento.
    expect(validateLinks(documento([], [attr("note", "string")], "interface"))).toEqual([
      {
        code: "link-unmappable",
        severity: "error",
        message: "«Ordine»: Un'interfaccia non si mappa su una tabella.",
        edge: "l1",
      },
    ])
  })

  it("una classe enum collegata dà il messaggio dell'enum", () => {
    expect(validateLinks(documento([], [], "enum"))).toEqual([
      {
        code: "link-unmappable",
        severity: "error",
        message: "«Ordine»: Un enum non si mappa su una tabella.",
        edge: "l1",
      },
    ])
  })

  it("una classe abstract collegata non ha problemi", () => {
    expect(validateLinks(documento([], [], "abstract"))).toEqual([])
  })

  it("una classe con due «mappa su» è un errore sulla classe", () => {
    const doc = documento([], [])
    doc.diagram.er.model.entities["righe"] = { name: "righe", attributes: [] }
    doc.diagram.links["l2"] = { kind: "maps-to", source: "class/Ordine", target: "er/righe" }
    expect(validateLinks(doc)).toEqual([
      {
        code: "class-maps-multiple",
        severity: "error",
        message: "«Ordine» mappa su 2 tabelle: una classe si mappa su una tabella sola",
        node: "class/Ordine",
      },
    ])
  })
})

describe("validateLinks (collegamenti del flusso)", () => {
  /** L'entità `ordini`, la classe `Ordine` e un processo `p1`, con un accesso e un «chiama». */
  function flusso(): DevDocument {
    const doc = documento([], [])
    delete doc.diagram.links["l1"]
    const lane = doc.diagram.flow.model.lanes[0]!.id
    doc.diagram.flow.model.nodes["p1"] = { label: "Calcola totale", shape: "process", lane }
    doc.diagram.links["a1"] = { kind: "accesses", source: "flow/p1", target: "er/ordini", mode: "write" }
    doc.diagram.links["c1"] = { kind: "calls", source: "flow/p1", target: "class/Ordine" }
    return doc
  }

  it("un accesso e un «chiama» validi non hanno problemi", () => {
    expect(validateLinks(flusso())).toEqual([])
  })

  it("un accesso e un «chiama» non hanno le regole degli attributi", () => {
    // La classe ha un attributo senza colonna: con un «mappa su» sarebbe un avviso, qui no.
    const doc = flusso()
    doc.diagram.class.model.classes["Ordine"]!.attributes.push(attr("note", "string"))
    expect(validateLinks(doc)).toEqual([])
  })

  it("con il nodo di flusso eliminato sono pendenti, con «(nodo eliminato)» nel messaggio", () => {
    const doc = flusso()
    delete doc.diagram.flow.model.nodes["p1"]
    expect(validateLinks(doc)).toEqual([
      {
        code: "link-dangling",
        severity: "error",
        message: "Il collegamento «scrive» fra «(nodo eliminato)» e «ordini» punta a un elemento che non esiste più",
        edge: "a1",
      },
      {
        code: "link-dangling",
        severity: "error",
        message: "Il collegamento «chiama» fra «(nodo eliminato)» e «Ordine» punta a un elemento che non esiste più",
        edge: "c1",
      },
    ])
  })

  it("con la classe eliminata, il «chiama» è pendente e nomina il nodo con la sua etichetta", () => {
    const doc = flusso()
    delete doc.diagram.class.model.classes["Ordine"]
    expect(validateLinks(doc)).toEqual([
      {
        code: "link-dangling",
        severity: "error",
        message: "Il collegamento «chiama» fra «Calcola totale» e «Ordine» punta a un elemento che non esiste più",
        edge: "c1",
      },
    ])
  })
})
