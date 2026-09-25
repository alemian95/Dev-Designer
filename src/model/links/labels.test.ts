import { describe, expect, it } from "vitest"
import { createDocument } from "../document"
import { parseDocument, toJson } from "../serialize"
import { ACCESS_MODE_LABEL, LINK_TITLE, endName, linkLabel } from "./labels"

describe("etichette dei collegamenti", () => {
  it("sul canvas: il tipo, e per l'accesso il modo", () => {
    expect(linkLabel({ kind: "maps-to", source: "class/A", target: "er/a" })).toBe("mappa su")
    expect(linkLabel({ kind: "calls", source: "flow/n1", target: "class/A" })).toBe("chiama")
    expect(linkLabel({ kind: "accesses", source: "flow/n1", target: "er/a", mode: "read" })).toBe("legge")
    expect(linkLabel({ kind: "accesses", source: "flow/n1", target: "er/a", mode: "write" })).toBe("scrive")
    expect(linkLabel({ kind: "accesses", source: "flow/n1", target: "er/a", mode: "read-write" })).toBe("legge e scrive")
  })

  it("titoli del pannello e voci della select del modo", () => {
    expect(LINK_TITLE).toEqual({ "maps-to": "Mappa su", accesses: "Accesso", calls: "Chiama" })
    expect(ACCESS_MODE_LABEL).toEqual({ read: "Legge", write: "Scrive", "read-write": "Legge e scrive" })
  })
})

describe("endName", () => {
  /** Un'entità, una classe e tre nodi di flusso: con etichetta, su due righe, senza etichetta. */
  function documento() {
    const doc = createDocument("t", "t")
    doc.diagram.flow.model.nodes["n1"] = { label: "Calcola totale", shape: "process", lane: null }
    doc.diagram.flow.model.nodes["n2"] = { label: "Calcola\n  totale", shape: "process", lane: null }
    doc.diagram.flow.model.nodes["n3"] = { label: "  ", shape: "process", lane: null }
    return doc
  }

  it("entità e classi: il nome, cioè la chiave senza prefisso", () => {
    expect(endName(documento(), "er/ordini")).toBe("ordini")
    expect(endName(documento(), "class/Ordine")).toBe("Ordine")
  })

  it("nodo di flusso: l'etichetta, con a capo e spazi compattati", () => {
    // Review Focus 2.
    expect(endName(documento(), "flow/n1")).toBe("Calcola totale")
    expect(endName(documento(), "flow/n2")).toBe("Calcola totale")
  })

  it("nodo senza etichetta, e nodo che non esiste più", () => {
    expect(endName(documento(), "flow/n3")).toBe("(senza etichetta)")
    expect(endName(documento(), "flow/fantasma")).toBe("(nodo eliminato)")
  })
})

describe("persistenza del modo", () => {
  it("un accesso in scrittura torna uguale dal file", () => {
    // Review Focus 1.
    const doc = createDocument("t", "t")
    doc.diagram.links["l1"] = { kind: "accesses", source: "flow/n1", target: "er/ordini", mode: "write" }
    const r = parseDocument(toJson(doc))
    expect(r.ok && r.document.diagram.links["l1"]).toEqual({ kind: "accesses", source: "flow/n1", target: "er/ordini", mode: "write" })
  })
})
