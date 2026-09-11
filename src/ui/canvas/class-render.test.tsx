import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { classSize } from "@/editor/class/geometry"
import { HEADER_H } from "@/editor/geometry"
import type { ClassNode, ClassRelation, RelationKind } from "@/model/class/schema"
import { ClassNodeView } from "./ClassNode"
import { ClassEdgeView } from "./ClassEdge"

const cliente: ClassNode = {
  name: "Cliente", stereotype: "class",
  attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }],
  methods: [{ name: "salva", type: "void", visibility: "private", isStatic: false, isAbstract: false, parameters: [] }],
}

/** Una relazione fra due classi. `sourceMult` e `targetMult` sono comodità del
 *  test: nel modello vivono dentro i due estremi. */
function relazione(
  kind: RelationKind,
  over: { name?: string; sourceMult?: string; targetMult?: string } = {},
): ClassRelation {
  return {
    kind,
    ...(over.name === undefined ? {} : { name: over.name }),
    source: { class: "Cliente", multiplicity: over.sourceMult ?? "", role: "" },
    target: { class: "Persona", multiplicity: over.targetMult ?? "", role: "" },
  }
}

describe("ClassNodeView", () => {
  it("disegna header, nome e i due scomparti", () => {
    const html = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={cliente} view={{ x: 10, y: 20, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="Cliente"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain(">Cliente<")
    expect(html).toContain("+ id: int")
    expect(html).toContain("- salva(): void")
    expect(html).toContain(`height="${classSize(cliente, false).h}"`)
  })

  it("uno scomparto vuoto non produce il suo separatore", () => {
    const senzaMetodi = { ...cliente, methods: [] }
    const html = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={senzaMetodi} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    // Un separatore per scomparto presente: header→attributi, e nient'altro.
    expect((html.match(/data-compartment-rule/g) ?? [])).toHaveLength(1)
  })

  it("interface mostra la riga dello stereotipo, class no", () => {
    const i = renderToStaticMarkup(<ClassNodeView nodeKey="S" node={{ ...cliente, stereotype: "interface" }} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(i).toContain("«interface»")
    expect(renderToStaticMarkup(<ClassNodeView nodeKey="C" node={cliente} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)).not.toContain("«")
  })

  it("abstract mette il nome in corsivo invece di una riga in più", () => {
    const html = renderToStaticMarkup(<ClassNodeView nodeKey="P" node={{ ...cliente, stereotype: "abstract" }} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(html).toContain("italic")
    expect(html).not.toContain("«")
  })

  it("collassata: solo header, nessuna riga di membro", () => {
    const html = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={cliente} view={{ x: 0, y: 0, collapsed: true }} selected />)
    expect(html).not.toContain("+ id: int")
    expect(html).toContain(`height="${HEADER_H}"`)
  })

  /**
   * `data-node-header` è incondizionato, come in `EntityNode`: il renderer non decide più da solo
   * se il doppio click rinomina o modifica i membri, quella scelta è di `use-canvas-interaction.ts`
   * (a partire dal modello — una classe senza membri risolve sempre a "body", anche quando il click
   * cade sull'header). Il contratto che il renderer garantisce è solo che l'header porta sempre
   * l'attributo: con membri, senza, e collassata.
   */
  it("data-node-header è sempre presente sull'header, con o senza membri", () => {
    const conMembri = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={cliente} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(conMembri).toContain("data-node-header")
    const senzaMembri = { ...cliente, attributes: [], methods: [] }
    const vuota = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={senzaMembri} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(vuota).toContain("data-node-header")
    const collassata = renderToStaticMarkup(<ClassNodeView nodeKey="Cliente" node={cliente} view={{ x: 0, y: 0, collapsed: true }} selected={false} />)
    expect(collassata).toContain("data-node-header")
  })
})

describe("ClassEdgeView", () => {
  const rects = { source: { x: 0, y: 200, w: 160, h: 40 }, target: { x: 0, y: 0, w: 160, h: 40 } }

  it("realizzazione e dipendenza sono tratteggiate, le altre no", () => {
    for (const kind of ["realization", "dependency"] as const) {
      expect(renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione(kind)} {...rects} selected={false} />)).toContain("stroke-dasharray")
    }
    expect(renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione("generalization")} {...rects} selected={false} />)).not.toContain("stroke-dasharray")
  })

  it("la composizione ha la punta piena, l'aggregazione vuota", () => {
    // Il fill cade sul marker del target: è lì che UML distingue i due rombi, e
    // se `isFilled` fosse cablato al contrario questi due sarebbero scambiati.
    const punta = (kind: RelationKind) => {
      const html = renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione(kind)} {...rects} selected={false} />)
      return html.slice(html.indexOf("data-edge-target"))
    }
    expect(punta("composition")).toContain('fill="var(--muted-foreground)"')
    expect(punta("aggregation")).toContain('fill="none"')
    // La generalizzazione ha il triangolo vuoto: solo la composizione è piena.
    expect(punta("generalization")).toContain('fill="none"')
  })

  it("le molteplicità compaiono solo quando non sono vuote", () => {
    expect(renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione("association")} {...rects} selected={false} />))
      .not.toContain("data-edge-source-label")
    const conMolt = relazione("association", { sourceMult: "0..*", targetMult: "1" })
    const html = renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={conMolt} {...rects} selected={false} />)
    expect(html).toContain("data-edge-source-label")
    expect(html).toContain(">0..*<")
  })

  it("l'etichetta del nome compare solo se il nome c'è", () => {
    // Come RelationshipEdgeView: il testo sta dentro un `&&`, quindi senza nome
    // l'elemento non esiste — non è un elemento vuoto da nascondere.
    expect(renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione("association")} {...rects} selected={false} />))
      .not.toContain("data-edge-label")
    const con = renderToStaticMarkup(<ClassEdgeView edgeKey="r" relation={relazione("association", { name: "possiede" })} {...rects} selected={false} />)
    expect(con).toContain("data-edge-label")
    expect(con).toContain(">possiede<")
  })
})
