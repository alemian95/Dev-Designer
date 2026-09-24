import { produce } from "immer"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createDocument, type DevDocument } from "@/model/document"
import type { Entity } from "@/model/er/schema"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { qualify } from "@/editor/families"
import { addFlowNode } from "@/editor/flow/commands"
import { LANE_PAD } from "@/editor/flow/layout"
import { flowDiagram } from "@/editor/flow-access"
import { HEADER_H, MIN_W } from "@/editor/geometry"
import type { InteractionEvent, PointerInfo } from "@/editor/interaction"
import { selId, sessionStore } from "@/editor/session-store"
import { IDENTITY } from "@/editor/viewport"
import { documentSession } from "@/io/document-session"
import { registerEdge, registerNode } from "./dom-registry"
import { createInteractionRunner } from "./interaction-runner"

/**
 * Le scritture dell'anteprima passano tutte dal registro di `dom-registry`, che è una mappa da
 * chiave a elemento: registrando finti elementi si vede **esattamente cosa l'anteprima ha toccato**,
 * senza un DOM e senza spiare le funzioni. È la stessa giuntura che usa il canvas vero.
 */
function fintoNodo(scritture: string[], key: string) {
  return { setAttribute: (_n: string, v: string) => scritture.push(`${key}:${v}`) } as unknown as SVGGElement
}

/** `setEdgeGeometry` cerca i propri figli con `querySelector`: contarne le chiamate dice se l'arco è stato toccato. */
function fintoArco(tocchi: Map<string, number>, key: string) {
  return {
    querySelector: () => {
      tocchi.set(key, (tocchi.get(key) ?? 0) + 1)
      return null
    },
  } as unknown as SVGGElement
}

const entita = (name: string): Entity => ({ name, attributes: [] })

/** Un'entità senza attributi è larga MIN_W e alta quanto il solo header: rettangoli prevedibili. */
const W = MIN_W
const H = HEADER_H

/**
 * Quattro entità e tre relazioni, in un'inquadratura 800×600 alla scala 1. Con uno spostamento di
 * 900 unità verso l'alto:
 *
 * - `dentro` (y=100) è in vista e finisce a −800: **esce**;
 * - `entra` (y=1000) è fuori e finisce a 100: **entra**;
 * - `lontana` (y=2000) finisce a 1100 e `lontanissima` (y=3000) a 2100: non si vedono mai.
 *
 * I tre archi coprono i tre casi del criterio:
 *
 * - `attraversa` (dentro–entra): a fine drag **entrambi** gli estremi sono lontani
 *   dall'inquadratura, ma il segmento la taglia in mezzo. È il caso per cui il criterio è
 *   l'ingombro dell'arco e non i suoi estremi.
 * - `unCapoDentro` (entra–lontana): un estremo solo è in vista, e tanto basta.
 * - `sottoTutto` (lontana–lontanissima): resta tutto sotto lo schermo.
 */
function documento(): DevDocument {
  const doc = createDocument("t", "t")
  const m = doc.diagram.er.model
  const v = doc.diagram.er.view
  for (const [key, y] of [["dentro", 100], ["entra", 1000], ["lontana", 2000], ["lontanissima", 3000]] as const) {
    m.entities[key] = entita(key)
    v.nodes[key] = { x: 100, y, collapsed: false }
  }
  const arco = (source: string, target: string) => ({
    source: { entity: source, attributes: [], cardinality: "many" as const },
    target: { entity: target, attributes: [], cardinality: "one" as const },
    identifying: false,
  })
  m.relationships["attraversa"] = arco("dentro", "entra")
  m.relationships["unCapoDentro"] = arco("entra", "lontana")
  m.relationships["sottoTutto"] = arco("lontana", "lontanissima")
  return doc
}

const CHIAVI = ["dentro", "entra", "lontana", "lontanissima"] as const
const ARCHI = ["attraversa", "unCapoDentro", "sottoTutto"] as const

const info = (over: Partial<PointerInfo>): PointerInfo => ({
  screen: { x: 0, y: 0 }, world: { x: 0, y: 0 }, button: 0, shift: false, alt: false, hit: { kind: "canvas" }, ...over,
})
const giu = (i: Partial<PointerInfo>): InteractionEvent => ({ type: "down", info: info(i), spaceHeld: false })
const muovi = (i: Partial<PointerInfo>): InteractionEvent => ({ type: "move", info: info(i) })
const su = (i: Partial<PointerInfo>): InteractionEvent => ({ type: "up", info: info(i) })

let scritture: string[]
let tocchi: Map<string, number>

beforeEach(() => {
  scritture = []
  tocchi = new Map()
  documentStore.getState().load(documento())
  sessionStore.getState().setViewport(IDENTITY)
  sessionStore.getState().setCanvasSize({ w: 800, h: 600 })
  sessionStore.getState().setSelection(CHIAVI.map((k) => selId("node", qualify("er", k))))
  for (const k of CHIAVI) registerNode(qualify("er", k), fintoNodo(scritture, qualify("er", k)))
  for (const k of ARCHI) registerEdge(qualify("er", k), fintoArco(tocchi, qualify("er", k)))
})

afterEach(() => {
  for (const k of CHIAVI) registerNode(qualify("er", k), null)
  for (const k of ARCHI) registerEdge(qualify("er", k), null)
  sessionStore.getState().setSelection([])
})

/** Presa sull'header di `dentro`, un solo spostamento di 900 unità verso l'alto, rilascio. */
function trascina(runner = createInteractionRunner()) {
  const partenza = { x: 100 + W / 2, y: 100 + H / 2 }
  runner.step(giu({ world: partenza, hit: { kind: "node", key: qualify("er", "dentro") } }))
  runner.step(muovi({ world: { x: partenza.x, y: partenza.y - 900 } }))
  return runner
}

describe("l'anteprima del drag scrive solo ciò che si vede", () => {
  it("un nodo che entra nell'inquadratura viene scritto, uno che ne esce no", () => {
    trascina()
    const toccati = new Set(scritture.map((s) => s.split(":")[0]))
    // `entra` arriva a y=100: dentro l'inquadratura, e senza questa scrittura resterebbe invisibile
    // proprio nel momento in cui l'utente se lo aspetta davanti.
    expect(toccati.has(qualify("er", "entra"))).toBe(true)
    // `dentro` finisce a −800 e `lontana` a 1100: nessuno dei due si vede.
    expect(toccati.has(qualify("er", "dentro"))).toBe(false)
    expect(toccati.has(qualify("er", "lontana"))).toBe(false)
    expect(scritture).toContain(`${qualify("er", "entra")}:translate(100 100)`)
  })

  it("un arco che attraversa l'inquadratura si aggiorna anche con entrambi i nodi fuori", () => {
    trascina()
    // `attraversa` va da y=−800 a y=100: i suoi estremi sono uno sopra e uno dentro lo schermo, e
    // il segmento lo taglia. Il criterio è l'ingombro dell'arco, non i suoi estremi.
    expect(tocchi.get(qualify("er", "attraversa")) ?? 0).toBeGreaterThan(0)
    expect(tocchi.get(qualify("er", "unCapoDentro")) ?? 0).toBeGreaterThan(0)
    // `sottoTutto` resta interamente sotto l'inquadratura, con entrambi gli estremi.
    expect(tocchi.get(qualify("er", "sottoTutto")) ?? 0).toBe(0)
  })

  it("il DOM saltato è un'anteprima, non lo stato: al rilascio si muovono tutti", () => {
    const runner = trascina()
    runner.step(su({ world: { x: 100 + W / 2, y: 100 + H / 2 - 900 } }))
    const nodi = erDiagram(documentStore.getState().doc).view.nodes
    // `dentro` non è mai stato scritto sul DOM dopo essere uscito, e il suo modello è giusto lo stesso.
    expect(nodi["dentro"]).toMatchObject({ x: 100, y: -800 })
    expect(nodi["entra"]).toMatchObject({ x: 100, y: 100 })
    expect(nodi["lontana"]).toMatchObject({ x: 100, y: 1100 })
    expect(nodi["lontanissima"]).toMatchObject({ x: 100, y: 2100 })
  })
})

describe("un comando al rilascio", () => {
  it("nessun comando durante il drag, esattamente uno al rilascio", () => {
    const prima = documentStore.getState().past.length
    const runner = createInteractionRunner()
    const partenza = { x: 100 + W / 2, y: 100 + H / 2 }
    runner.step(giu({ world: partenza, hit: { kind: "node", key: qualify("er", "dentro") } }))
    for (let i = 1; i <= 5; i++) runner.step(muovi({ world: { x: partenza.x, y: partenza.y - i * 20 } }))
    // Cinque `pointermove` e nessuna voce di storia: è l'invariante dello spike — il documento
    // riceve un comando solo, al rilascio, non uno per movimento.
    expect(documentStore.getState().past.length).toBe(prima)
    runner.step(su({ world: { x: partenza.x, y: partenza.y - 100 } }))
    expect(documentStore.getState().past.length).toBe(prima + 1)
  })

  it("un drag annullato non lascia nessun comando", () => {
    const prima = documentStore.getState().past.length
    const runner = trascina()
    runner.step({ type: "cancel" })
    expect(documentStore.getState().past.length).toBe(prima)
  })

  it("una presa senza movimento non produce comando: nulla da annullare", () => {
    const prima = documentStore.getState().past.length
    const runner = createInteractionRunner()
    const partenza = { x: 100 + W / 2, y: 100 + H / 2 }
    runner.step(giu({ world: partenza, hit: { kind: "node", key: qualify("er", "dentro") } }))
    runner.step(su({ world: partenza }))
    expect(documentStore.getState().past.length).toBe(prima)
  })

  it("busy() distingue un'interazione in corso dal riposo", () => {
    // L'hook lo usa per non costruire un `PointerInfo` a ogni `pointermove` quando non c'è nulla in
    // corso: costerebbe un `getBoundingClientRect`, cioè uno stile e un layout forzati.
    const runner = createInteractionRunner()
    expect(runner.busy()).toBe(false)
    runner.step(giu({ world: { x: 100, y: 100 }, hit: { kind: "node", key: qualify("er", "dentro") } }))
    expect(runner.busy()).toBe(true)
    runner.step(su({ world: { x: 100, y: 100 } }))
    expect(runner.busy()).toBe(false)
  })

  it("lo snapshot del drag non sopravvive al drag: due prese di seguito partono da dove sono", () => {
    // `dragTargets` è uno snapshot delle posizioni alla presa. Se sopravvivesse al rilascio, il
    // secondo drag partirebbe dalle posizioni del primo e il nodo salterebbe indietro.
    const runner = createInteractionRunner()
    const primo = { x: 100 + W / 2, y: 100 + H / 2 }
    runner.step(giu({ world: primo, hit: { kind: "node", key: qualify("er", "dentro") } }))
    runner.step(muovi({ world: { x: primo.x, y: primo.y + 200 } }))
    runner.step(su({ world: { x: primo.x, y: primo.y + 200 } }))

    scritture.length = 0
    const secondo = { x: 100 + W / 2, y: 300 + H / 2 }
    runner.step(giu({ world: secondo, hit: { kind: "node", key: qualify("er", "dentro") } }))
    runner.step(muovi({ world: { x: secondo.x, y: secondo.y + 100 } }))
    expect(scritture).toContain(`${qualify("er", "dentro")}:translate(100 400)`)
  })
})

/** Un elemento finto che tiene l'ultimo valore scritto per ogni attributo, non solo la sequenza
 *  delle scritture: qui serve sapere **cosa mostra il DOM adesso**, dopo il rilascio, non se un
 *  certo valore è passato di lì durante il gesto. */
function fintoNodoStato(): { el: SVGGElement; attrs: Record<string, string> } {
  const attrs: Record<string, string> = {}
  const el = { setAttribute: (n: string, v: string) => (attrs[n] = v) } as unknown as SVGGElement
  return { el, attrs }
}

describe("il rilascio del flowchart", () => {
  afterEach(() => {
    sessionStore.getState().setSelection([])
  })

  it("un nodo riallineato esattamente dov'era non lascia il DOM fermo all'anteprima", () => {
    // Una sola corsia (`emptyFlowDiagram`, via `createDocument`), banda [0, 160): un nodo in prima riga, a
    // `y = LANE_PAD`, è dove lo metterebbe `placeInLanes` — lo scenario del revisore.
    const base = createDocument("t", "t")
    const laneId = base.diagram.flow.model.lanes[0]!.id
    const added = addFlowNode({ x: 100, y: LANE_PAD }, "process", laneId)
    const doc = produce(base, added.recipe)
    documentStore.getState().load(doc)
    sessionStore.getState().setViewport(IDENTITY)
    sessionStore.getState().setCanvasSize({ w: 800, h: 600 })
    sessionStore.getState().setSelection([selId("node", qualify("flow", added.key))])
    const { el, attrs } = fintoNodoStato()
    registerNode(qualify("flow", added.key), el)

    const runner = createInteractionRunner()
    const partenza = { x: 100 + 30, y: LANE_PAD + 20 }
    runner.step(giu({ world: partenza, hit: { kind: "node", key: qualify("flow", added.key) } }))
    // -60: resta dentro l'inquadratura (previewDrag scrive solo ciò che si vede), ma il centro del
    // nodo (a -20) è comunque fuori dalla banda [0, 160) — basta perché scatti il riallineamento.
    runner.step(muovi({ world: { x: partenza.x, y: partenza.y - 60 } }))
    // Anteprima: il nodo è scritto sopra la sua banda, fermo alla posizione del puntatore.
    expect(attrs.transform).toBe("translate(100 -40)")
    runner.step(su({ world: { x: partenza.x, y: partenza.y - 60 } }))

    // Il riallineamento (Task 8, regola 4) lo riporta esattamente dov'era: il modello non cambia.
    const modello = flowDiagram(documentStore.getState().doc)
    expect(modello.view.nodes[added.key]).toMatchObject({ x: 100, y: LANE_PAD })
    // E il DOM deve dirlo altrettanto. Senza `resetDragTargets`, la recipe non produce patch (il
    // nodo torna dov'era), la dispatch non fa nulla, e qui resterebbe la scrittura dell'ultima
    // anteprima (`translate(100 -40)`, l'asserzione di sopra) invece della posizione di partenza.
    expect(attrs.transform).toBe(`translate(100 ${LANE_PAD})`)

    registerNode(qualify("flow", added.key), null)
  })

  it("il cablaggio: il rilascio in un'altra corsia passa da commitDrag, non da moveNodes", () => {
    const base = createDocument("t", "t")
    const l1 = base.diagram.flow.model.lanes[0]!.id
    const l2 = crypto.randomUUID()
    let doc = produce(base, (d) => {
      const f = d.diagram.flow
      f.model.lanes.push({ id: l2, name: "Seconda" })
      f.view.lanes = { [l1]: { y: 0, h: 100 }, [l2]: { y: 100, h: 100 } }
    })
    const added = addFlowNode({ x: 100, y: 20 }, "process", l1)
    doc = produce(doc, added.recipe)
    documentStore.getState().load(doc)
    sessionStore.getState().setViewport(IDENTITY)
    sessionStore.getState().setCanvasSize({ w: 800, h: 600 })
    sessionStore.getState().setSelection([selId("node", qualify("flow", added.key))])
    registerNode(qualify("flow", added.key), fintoNodo(scritture, qualify("flow", added.key)))

    const runner = createInteractionRunner()
    const partenza = { x: 130, y: 40 }
    runner.step(giu({ world: partenza, hit: { kind: "node", key: qualify("flow", added.key) } }))
    runner.step(muovi({ world: { x: partenza.x, y: partenza.y + 100 } }))
    runner.step(su({ world: { x: partenza.x, y: partenza.y + 100 } }))

    // `moveNodes` (commands/view.ts) non scrive mai `model.nodes[key].lane`: se il cablaggio in
    // `canvas-ops.ts` (`o.commitDrag ? o.commitDrag(...) : moveNodes(...)`, per famiglia) tornasse
    // sempre a `moveNodes`, questa asserzione fallirebbe da sola, mentre il resto della suite —
    // scritta per l'ER — resterebbe verde.
    expect(flowDiagram(documentStore.getState().doc).model.nodes[added.key]!.lane).toBe(l2)

    registerNode(qualify("flow", added.key), null)
  })
})

describe("Collega fra famiglie", () => {
  /** Un'entità `ordini` e un'interfaccia `Pagabile`, lontane fra loro. */
  function documentoMisto(): DevDocument {
    const doc = createDocument("m", "m")
    doc.diagram.er.model.entities["ordini"] = entita("ordini")
    doc.diagram.er.view.nodes["ordini"] = { x: 0, y: 0, collapsed: false }
    for (const [name, stereotype] of [["Ordine", "class"], ["Pagabile", "interface"]] as const) {
      doc.diagram.class.model.classes[name] = { name, stereotype, attributes: [], methods: [] }
      doc.diagram.class.view.nodes[name] = { x: 400, y: name === "Ordine" ? 0 : 300, collapsed: false }
    }
    return doc
  }

  /** Il gesto Collega da `source` a `target`, con lo strumento attivo. */
  function collega(source: string, target: string) {
    sessionStore.getState().setTool("edge")
    const runner = createInteractionRunner()
    runner.step(giu({ hit: { kind: "node", key: source } }))
    runner.step(muovi({ world: { x: 10, y: 10 } }))
    runner.step(su({ hit: { kind: "node", key: target } }))
  }

  beforeEach(() => {
    documentStore.getState().load(documentoMisto())
    documentSession.getState().patch({ notice: null })
  })

  afterEach(() => {
    sessionStore.getState().setTool("select")
    documentSession.getState().patch({ notice: null })
  })

  it("un rifiuto mostra l'avviso, non crea niente e lascia lo strumento attivo", () => {
    collega(qualify("class", "Pagabile"), qualify("er", "ordini"))
    expect(documentSession.getState().notice).toBe("Un'interfaccia non si mappa su una tabella.")
    expect(documentStore.getState().doc.diagram.links).toEqual({})
    expect(sessionStore.getState().tool).toBe("edge")
  })

  it("un collegamento nuovo si crea e si seleziona", () => {
    collega(qualify("class", "Ordine"), qualify("er", "ordini"))
    const [id] = Object.keys(documentStore.getState().doc.diagram.links)
    expect([...sessionStore.getState().selection]).toEqual([selId("edge", `link/${id}`)])
    expect(sessionStore.getState().tool).toBe("select")
  })

  it("un collegamento già presente si seleziona, senza un passo di annulla in più", () => {
    collega(qualify("class", "Ordine"), qualify("er", "ordini"))
    const past = documentStore.getState().past.length
    sessionStore.getState().setSelection([])
    collega(qualify("er", "ordini"), qualify("class", "Ordine"))
    const [id] = Object.keys(documentStore.getState().doc.diagram.links)
    expect(documentStore.getState().past.length).toBe(past)
    expect([...sessionStore.getState().selection]).toEqual([selId("edge", `link/${id}`)])
  })
})
