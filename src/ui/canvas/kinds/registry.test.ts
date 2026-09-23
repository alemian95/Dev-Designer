import { Box, Spline, Square, StickyNote } from "lucide-react"
import { describe, expect, it } from "vitest"
import { FlowShapeSchema } from "@/model/flow/schema"
import { toolId, viewFor } from "./registry"

/**
 * Fissa il dispatch del registro: la revisione del Task 6 ha lasciato una voce ⚠️ perché nessun
 * test unitario copriva `viewFor`/`useDiagramView`, e la lacuna diventa portante esattamente
 * quando arriva un secondo tipo di diagramma (questo task). Senza questo test, un futuro terzo
 * tipo potrebbe rompere silenziosamente il dispatch dei due esistenti — es. `viewFor` che torna
 * la stessa vista per due tipi diversi, o `tools`/`textFormats` scambiati fra loro.
 *
 * Solo `viewFor`, non `useDiagramView`: l'hook è un `useStore` sottile sopra `viewFor`, e
 * verificato che `react-dom/server` non è la sede giusta per provarlo — durante `renderToStaticMarkup`
 * (nessuna finestra, quindi un render SSR) `useSyncExternalStore` legge `getInitialState()`, non lo
 * stato corrente dopo un `.load()`: il test tornerebbe sempre lo stesso tipo, qualunque documento si
 * carichi prima, e passerebbe anche se il dispatch dell'hook fosse rotto. È la stessa ragione per
 * cui `render.test.tsx` testa solo viste pure guidate dalle prop, mai componenti agganciati allo store.
 */
describe("viewFor", () => {
  it("torna viste distinte per ER e per classi, coi tools e i textFormats giusti", () => {
    const er = viewFor("er")
    const cls = viewFor("class")
    // Due object literal distinti lo sono per costruzione: l'asserzione che conta è che il dispatch
    // cabli componenti diversi, non solo un contenitore diverso attorno agli stessi.
    expect(er.NodesLayer).not.toBe(cls.NodesLayer)
    expect(er.Properties).not.toBe(cls.Properties)
    // `NodeView`/`EdgeView`: le viste pure che `buildSvg` (@/ui/export/svg.tsx) monta senza
    // store. Stessa ragione delle due sopra: un terzo tipo futuro non deve poter far tornare a
    // `viewFor` la vista sbagliata qui, silenziosamente.
    expect(er.NodeView).not.toBe(cls.NodeView)
    expect(er.EdgeView).not.toBe(cls.EdgeView)
    expect(er.tools).toEqual([
      { label: "Entità", key: "e", Icon: Square, tool: "node" },
      { label: "Relazione", key: "r", Icon: Spline, tool: "edge" },
    ])
    expect(cls.tools).toEqual([
      { label: "Classe", key: "c", Icon: Box, tool: "node" },
      { label: "Relazione", key: "r", Icon: Spline, tool: "edge" },
      { label: "Nota", key: "n", Icon: StickyNote, tool: "node", variant: "note" },
    ])
    expect(er.textFormats).toEqual(["postgres", "mysql", "mermaid"])
    expect(cls.textFormats).toEqual(["class-mermaid"])
  })
})

describe("terzo strumento", () => {
  it("la vista delle classi dichiara la variante nota, quella ER no", () => {
    expect(viewFor("class").tools.some((t) => t.variant === "note")).toBe(true)
    expect(viewFor("er").tools.some((t) => t.variant === "note")).toBe(false)
  })

  it("le scorciatoie dei tre strumenti sono distinte", () => {
    const keys = viewFor("class").tools.map((t) => t.key)
    expect(new Set(keys).size).toBe(3)
    // `v` è riservata a «Seleziona» in `use-keyboard-shortcuts.ts`.
    expect(keys).not.toContain("v")
  })
})

describe("flowchart", () => {
  it("il flowchart dichiara sette strumenti, tutti con chiave distinta", () => {
    const view = viewFor("flow")
    expect(view.tools).toHaveLength(7)
    const keys = view.tools.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  /**
   * `every((t) => t.variant)` controllava solo che la stringa non fosse vuota, non che fosse una
   * delle sei forme vere: un refuso in `flow.tsx` (es. `"decison"`) avrebbe compilato — `variant`
   * è una stringa opaca per la giuntura, la interpreta solo `flowOps.addNode` (spec §3) — passato
   * lint e questo test, e prodotto un nodo con `shapePath` fuori dallo switch esaustivo, cioè
   * `undefined`: invisibile, e respinto da `FlowShapeSchema` al primo salvataggio. L'insieme delle
   * varianti deve coincidere esattamente con le forme dello schema, non solo essere non vuoto.
   */
  it("le sei varianti del nodo sono esattamente le forme di FlowShapeSchema, l'arco non ne ha una", () => {
    const view = viewFor("flow")
    const nodeVariants = view.tools.filter((t) => t.tool === "node").map((t) => t.variant)
    expect(new Set(nodeVariants)).toEqual(new Set(FlowShapeSchema.options))
    expect(view.tools.filter((t) => t.tool === "edge")).toHaveLength(1)
  })

  /**
   * Nessun test fissava la mappa tasto → forma della spec §11 (i tasti derivano dall'ordine di
   * `FlowShapeSchema`, non scritti a mano in `kinds/flow.tsx`): un refuso nell'ordine dell'enum,
   * o un `i + 1` diventato `i`, sarebbe passato zitto finché qualcuno non avesse premuto `4` e
   * trovato la forma sbagliata. La mappa qui è scritta a mano, dalla tabella della spec — non
   * derivata da `FLOW_SHAPES`, altrimenti il test e l'implementazione condividerebbero lo stesso
   * errore possibile.
   */
  it("la mappa tasto → forma è esattamente quella della spec §11", () => {
    const view = viewFor("flow")
    const byKey = new Map(view.tools.map((t) => [t.key, t.variant]))
    expect(byKey.get("1")).toBe("terminal")
    expect(byKey.get("2")).toBe("process")
    expect(byKey.get("3")).toBe("decision")
    expect(byKey.get("4")).toBe("io")
    expect(byKey.get("5")).toBe("subprocess")
    expect(byKey.get("6")).toBe("note")
    expect(view.tools.find((t) => t.key === "r")).toMatchObject({ tool: "edge" })
  })
})

describe("toolId", () => {
  it("compone tool e variant quando c'è una variante", () => {
    expect(toolId({ tool: "node", variant: "note" })).toBe("node:note")
  })

  it("torna solo il tool quando non c'è variante", () => {
    expect(toolId({ tool: "node" })).toBe("node")
    expect(toolId({ tool: "edge" })).toBe("edge")
  })
})
