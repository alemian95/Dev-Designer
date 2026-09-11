import { describe, expect, it } from "vitest"
import { memberLines } from "@/model/class/members"
import type { ClassNode, ClassRelation } from "@/model/class/schema"
import { CHAR_W, GRID, HEADER_H, MIN_W, PAD_X, ROW_H, type Rect } from "../geometry"
import { DOWN, LEFT, RIGHT, UP } from "../edge-routing"
import { classEdgeGeometry, classSize, endLabel, isDashed, isFilled, notePath, noteSize, STEREO_H, umlMarkerPath } from "./geometry"

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

  it("sourceEnd/targetEnd presenti anche quando c'è solo il ruolo e nessuna molteplicità", () => {
    // Il ruolo si rende nella stessa etichetta della molteplicità: un capo che ha solo il ruolo
    // ha comunque qualcosa da mostrare, e prima di questo caso non riceveva nessun punto.
    const soloRuolo: ClassRelation = { ...relazione, target: { ...relazione.target, role: "titolare" } }
    const geo = classEdgeGeometry(source, target, soloRuolo)
    expect(geo.sourceEnd).toBeDefined()
    expect(geo.targetEnd).toBeDefined()
  })

  it("l'etichetta del target cade oltre il marker, non dentro", () => {
    // Il rombo è il marker più lungo (16) e l'apice tocca il bordo del target: un'etichetta a 14
    // dal bordo finiva dentro il rombo e usciva mangiata. I due rettangoli sono alla stessa
    // altezza, quindi l'arco è orizzontale e la distanza è tutta sulla x.
    const conMolt: ClassRelation = { ...relazione, kind: "composition", target: { ...relazione.target, multiplicity: "0..*" } }
    const geo = classEdgeGeometry(source, target, conMolt)
    expect(target.x - geo.targetEnd!.x).toBeGreaterThan(16)
  })

  it("un'etichetta lunga non rientra nel nodo a cui appartiene", () => {
    // Il testo è centrato sul proprio punto: con una sola cifra ci sta, ma molteplicità e ruolo
    // insieme sono lunghi, e centrati a poca distanza dal bordo rientrano nel rettangolo e ne
    // escono tagliati. Lo scarto lungo l'arco deve quindi contare anche la semilarghezza.
    const lunga = "0..* ordini"
    const conRuolo: ClassRelation = { ...relazione, kind: "composition", target: { class: "B", multiplicity: "0..*", role: "ordini" } }
    const geo = classEdgeGeometry(source, target, conRuolo)
    const semiLarghezza = (lunga.length * 11 * 0.6) / 2
    // Il bordo del testo più vicino al target, non il suo centro: deve stare oltre il rombo (16).
    expect(target.x - (geo.targetEnd!.x + semiLarghezza)).toBeGreaterThan(16)
  })

  it("su un arco orizzontale i capi vanno sotto la linea, il nome resta sopra", () => {
    // Sono tre etichette sullo stesso arco. `ClassEdgeView` mette il nome sopra la linea
    // (`label.y - 6`), quindi i capi vanno dall'altra parte: altrimenti condividono la stessa
    // fascia di pixel e su due nodi vicini si sovrappongono.
    const conTutto: ClassRelation = {
      ...relazione,
      name: "effettua",
      source: { class: "A", multiplicity: "0..*", role: "ordini" },
      target: { class: "B", multiplicity: "1", role: "titolare" },
    }
    const geo = classEdgeGeometry(source, target, conTutto)
    // I due rettangoli sono alla stessa altezza: la linea corre a y = 30.
    expect(geo.sourceEnd!.y).toBeGreaterThan(30)
    expect(geo.targetEnd!.y).toBeGreaterThan(30)
    expect(geo.label.y - 6).toBeLessThan(30)
  })

  it("su un arco verticale l'etichetta si sposta di lato quanto basta a non attraversare la linea", () => {
    // Il testo è centrato sul proprio punto (`textAnchor="middle"`), quindi lo scarto laterale
    // deve superare la sua semilarghezza, che con un font monospace è nota: la linea passa per
    // il centro del lato inferiore del source.
    const sopra: Rect = { x: 0, y: 0, w: 100, h: 60 }
    const sotto: Rect = { x: 0, y: 300, w: 100, h: 60 }
    const molteplicita = "1..*"
    const conMolt: ClassRelation = { ...relazione, source: { ...relazione.source, multiplicity: molteplicita } }
    const geo = classEdgeGeometry(sopra, sotto, conMolt)
    const semiLarghezza = (molteplicita.length * 11 * 0.6) / 2
    expect(Math.abs(geo.sourceEnd!.x - 50)).toBeGreaterThan(semiLarghezza)
  })
})

describe("endLabel", () => {
  const capo = (multiplicity: string, role: string) => ({ class: "Cliente", multiplicity, role })

  it("unisce molteplicità e ruolo in un testo solo", () => {
    expect(endLabel(capo("0..*", "ordini"))).toBe("0..* ordini")
  })

  it("con una sola delle due metà non lascia spazi in più", () => {
    expect(endLabel(capo("0..*", ""))).toBe("0..*")
    expect(endLabel(capo("", "ordini"))).toBe("ordini")
  })

  it("vuota quando il capo non ha né molteplicità né ruolo: è la condizione che usa chi la chiama", () => {
    expect(endLabel(capo("", ""))).toBe("")
  })
})

describe("noteSize", () => {
  it("larghezza dalla riga più lunga, altezza dal numero di righe", () => {
    const corta = noteSize({ text: "ok" })
    const lunga = noteSize({ text: "una riga molto più lunga della precedente" })
    expect(lunga.w).toBeGreaterThan(corta.w)
    expect(noteSize({ text: "a\nb\nc" }).h).toBeGreaterThan(noteSize({ text: "a" }).h)
  })

  it("una nota vuota ha comunque una dimensione cliccabile", () => {
    const { w, h } = noteSize({ text: "" })
    expect(w).toBeGreaterThanOrEqual(MIN_W / 2)
    expect(h).toBeGreaterThan(0)
  })

  it("la larghezza è arrotondata alla griglia, come le classi", () => {
    expect(noteSize({ text: "abcdefghijklmnopqrstuvwxyz" }).w % GRID).toBe(0)
  })
})

describe("notePath", () => {
  it("il corpo salta l'angolo in alto a destra e la piega lo chiude", () => {
    const { body, fold } = notePath(200, 80)
    // Path esatti e non solo "non lancia": la piega è la geometria più delicata del diff,
    // e il renderer (task successivo) deve riprodurla identica — un vertice spostato o
    // mancante deve far fallire il test, non passare inosservato.
    expect(body).toBe("M0 0 L188 0 L200 12 L200 80 L0 80 Z")
    expect(fold).toBe("M188 0 L200 12 L188 12 Z")
  })
})
