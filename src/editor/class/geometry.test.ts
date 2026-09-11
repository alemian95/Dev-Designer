import { describe, expect, it } from "vitest"
import { memberLines } from "@/model/class/members"
import type { ClassNode, ClassRelation } from "@/model/class/schema"
import { CHAR_W, GRID, HEADER_H, MIN_W, PAD_X, ROW_H, type Rect } from "../geometry"
import { DOWN, LEFT, RIGHT, UP } from "../edge-routing"
import { classEdgeGeometry, classSize, isDashed, isFilled, STEREO_H, umlMarkerPath } from "./geometry"

// Annotazione esplicita `ClassNode` sulle fixture, non `as const`: il brief le
// scriveva `as const`, ma un `ClassNode` ha array mutabili e `as const` li
// rende `readonly`, cosa che `tsc -b` rifiuta. L'annotazione dà la stessa
// tipizzazione stretta dei letterali senza quel conflitto.
const vuota: ClassNode = { name: "Cliente", stereotype: "class", attributes: [], methods: [] }

describe("classSize", () => {
  it("una classe senza membri è alta come il solo header", () => {
    expect(classSize(vuota, false)).toEqual({ w: MIN_W, h: HEADER_H })
  })

  it("uno scomparto vuoto non occupa spazio", () => {
    const soloAttributi: ClassNode = { ...vuota, attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }] }
    expect(classSize(soloAttributi, false).h).toBe(HEADER_H + ROW_H + 6)
  })

  it("due scomparti pieni sommano due volte il margine", () => {
    const piena: ClassNode = {
      ...vuota,
      attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }],
      methods: [{ name: "salva", type: "void", visibility: "public", isStatic: false, isAbstract: false, parameters: [] }],
    }
    // Il margine di 6 px sta sotto ogni scomparto che ha righe, quindi due volte.
    expect(classSize(piena, false).h).toBe(HEADER_H + ROW_H + 6 + ROW_H + 6)
  })

  it("interface ed enum aggiungono la riga dello stereotipo, class e abstract no", () => {
    expect(classSize({ ...vuota, stereotype: "interface" }, false).h).toBe(HEADER_H + STEREO_H)
    expect(classSize({ ...vuota, stereotype: "abstract" }, false).h).toBe(HEADER_H)
  })

  it("collassata: solo header, e lo stereotipo resta perché è nell'header", () => {
    const piena: ClassNode = { ...vuota, stereotype: "interface", attributes: [{ name: "id", type: "int", visibility: "public", isStatic: false }] }
    expect(classSize(piena, true).h).toBe(HEADER_H + STEREO_H)
  })

  it("la larghezza cresce col membro più lungo e resta multipla di GRID", () => {
    const lungo: ClassNode = {
      ...vuota,
      attributes: [{ name: "unAttributoDalNomeMoltoLungo", type: "Dictionary<string, int>", visibility: "public", isStatic: false }],
    }
    const w = classSize(lungo, false).w
    expect(w).toBeGreaterThan(MIN_W)
    expect(w % GRID).toBe(0)
    // Il nome della classe è corto: la larghezza viene dal membro, non dall'header.
    expect(w).toBeGreaterThan(classSize(vuota, false).w)
  })

  it("combacia con la riga più lunga che il renderer produce davvero: due scomparti allineati separatamente, non uno solo", () => {
    // Stessa coppia di membri della revisione: un attributo dal nome corto e
    // un metodo dal nome lungo. `ClassNodeView` (ui/canvas/ClassNode.tsx)
    // allinea i due punti dentro ciascun scomparto con due chiamate separate
    // a `memberLines`, non una sola sull'intera classe — altrimenti il nome
    // lungo del metodo farebbe slittare la colonna dei due punti anche fra
    // gli attributi, che non lo vedono mai renderizzato.
    const node: ClassNode = {
      ...vuota,
      attributes: [{ name: "x", type: "int", visibility: "public", isStatic: false }],
      methods: [
        { name: "unMetodoDalNomeLungo", type: "", visibility: "public", isStatic: false, isAbstract: false, parameters: [] },
      ],
    }
    const attrLines = memberLines({ attributes: node.attributes, methods: [] })
    const methodLines = memberLines({ attributes: [], methods: node.methods })
    const renderedChars = Math.max(node.name.length, ...attrLines.map((l) => l.length), ...methodLines.map((l) => l.length))
    const expectedW = Math.max(MIN_W, Math.ceil((renderedChars * CHAR_W + 2 * PAD_X) / GRID) * GRID)

    expect(classSize(node, false).w).toBe(expectedW)

    // La misura a passata unica (quella che il difetto usava) sovrastima:
    // la colonna dei due punti del metodo lungo si trascina anche sull'attributo,
    // e la riga combinata più lunga eccede quella che va davvero sullo schermo.
    const combinedChars = Math.max(node.name.length, ...memberLines(node).map((l) => l.length))
    expect(combinedChars).toBeGreaterThan(renderedChars)
  })
})

describe("punte e linee", () => {
  it("solo realizzazione e dipendenza sono tratteggiate", () => {
    // `as const`: senza, l'array letterale è `string[]` e non tipizza contro
    // il parametro `RelationKind` di `isDashed` (stesso genere di difetto
    // delle fixture di `classSize` sopra: letterali senza contesto di tipo).
    expect((["realization", "dependency"] as const).every(isDashed)).toBe(true)
    expect((["association", "generalization", "composition", "aggregation"] as const).some(isDashed)).toBe(false)
  })

  it("solo la composizione ha la punta piena", () => {
    expect(isFilled("composition")).toBe(true)
    expect(isFilled("aggregation")).toBe(false)
  })

  it("l'associazione non disegna punta", () => {
    expect(umlMarkerPath({ x: 0, y: 0 }, UP, "association")).toBe("")
  })

  it("generalizzazione e realizzazione condividono il triangolo", () => {
    const a = umlMarkerPath({ x: 10, y: 10 }, UP, "generalization")
    expect(umlMarkerPath({ x: 10, y: 10 }, UP, "realization")).toBe(a)
  })

  it("il path parte dal punto dato, in tutte e quattro le direzioni", () => {
    for (const dir of [UP, DOWN, LEFT, RIGHT]) {
      expect(umlMarkerPath({ x: 40, y: 50 }, dir, "generalization")).toContain("40")
    }
  })
})

describe("classEdgeGeometry", () => {
  const source: Rect = { x: 0, y: 0, w: 100, h: 60 }
  const target: Rect = { x: 240, y: 0, w: 100, h: 60 }
  const relazione: ClassRelation = {
    kind: "association",
    source: { class: "A", multiplicity: "", role: "" },
    target: { class: "B", multiplicity: "", role: "" },
  }

  it("il marker cade sempre sul target: sourceMarker resta vuoto, contratto di umlMarkerPath", () => {
    const geo = classEdgeGeometry(source, target, { ...relazione, kind: "composition" })
    expect(geo.sourceMarker).toBe("")
    expect(geo.targetMarker.length).toBeGreaterThan(0)
  })

  it("sourceEnd/targetEnd assenti quando entrambe le molteplicità sono vuote", () => {
    const geo = classEdgeGeometry(source, target, relazione)
    expect(geo.sourceEnd).toBeUndefined()
    expect(geo.targetEnd).toBeUndefined()
  })

  it("sourceEnd/targetEnd presenti quando almeno una molteplicità c'è, anche se asimmetrica", () => {
    const asimmetrica: ClassRelation = { ...relazione, source: { ...relazione.source, multiplicity: "1" } }
    const geo = classEdgeGeometry(source, target, asimmetrica)
    expect(geo.sourceEnd).toBeDefined()
    expect(geo.targetEnd).toBeDefined()
  })
})
