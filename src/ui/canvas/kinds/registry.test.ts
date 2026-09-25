import { Box, ListOrdered, Square, SquareDashed, StickyNote } from "lucide-react"
import { describe, expect, it } from "vitest"
import { FAMILIES } from "@/model/family"
import { FlowShapeSchema } from "@/model/flow/schema"
import { canvasTools, LINK_TOOL, toolId, viewFor } from "./registry"

/**
 * Fissa il dispatch del registro: la revisione del Task 6 ha lasciato una voce ⚠️ perché nessun
 * test unitario copriva `viewFor`, e la lacuna diventa portante esattamente quando arriva un
 * secondo tipo di diagramma (questo task). Senza questo test, un futuro terzo tipo potrebbe
 * rompere silenziosamente il dispatch dei due esistenti — es. `viewFor` che torna la stessa vista
 * per due tipi diversi, o `tools` scambiati fra loro.
 */
describe("viewFor", () => {
  it("torna viste distinte per ER e per classi, coi tools giusti", () => {
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
    expect(er.tools).toEqual([{ label: "Entità", key: "e", Icon: Square, tool: "node", family: "er" }])
    expect(cls.tools).toEqual([
      { label: "Classe", key: "c", Icon: Box, tool: "node", family: "class" },
      { label: "Interfaccia", key: "i", Icon: SquareDashed, tool: "node", family: "class", variant: "interface" },
      { label: "Enum", key: "u", Icon: ListOrdered, tool: "node", family: "class", variant: "enum" },
      { label: "Nota di classe", key: "n", Icon: StickyNote, tool: "node", family: "class", variant: "note" },
    ])
  })
})

describe("terzo strumento", () => {
  it("la vista delle classi dichiara la variante nota, quella ER no", () => {
    expect(viewFor("class").tools.some((t) => t.variant === "note")).toBe(true)
    expect(viewFor("er").tools.some((t) => t.variant === "note")).toBe(false)
  })

  it("le scorciatoie degli strumenti sono distinte", () => {
    const keys = viewFor("class").tools.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    // `v` è riservata a «Seleziona» in `use-keyboard-shortcuts.ts`.
    expect(keys).not.toContain("v")
  })
})

describe("flowchart", () => {
  it("il flowchart dichiara sei forme più il pool, tutti con chiave distinta, tutti nella famiglia flow", () => {
    const view = viewFor("flow")
    expect(view.tools).toHaveLength(7)
    const keys = view.tools.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(view.tools.every((t) => t.family === "flow")).toBe(true)
  })

  /**
   * `every((t) => t.variant)` controllava solo che la stringa non fosse vuota, non che fosse una
   * delle sei forme vere: un refuso in `flow.tsx` (es. `"decison"`) avrebbe compilato — `variant`
   * è una stringa opaca per la giuntura, la interpreta solo `flowOps.addNode` (spec §3) — passato
   * lint e questo test, e prodotto un nodo con `shapePath` fuori dallo switch esaustivo, cioè
   * `undefined`: invisibile, e respinto da `FlowShapeSchema` al primo salvataggio. L'insieme delle
   * varianti deve coincidere esattamente con le forme dello schema, non solo essere non vuoto.
   */
  it("le sei varianti di forma sono esattamente quelle di FlowShapeSchema, il pool a parte", () => {
    const view = viewFor("flow")
    // Il pool (spec 2b §5) è una variante dello strumento nodo ma non una forma: non appartiene a
    // `FlowShapeSchema`, quindi va escluso da questo confronto.
    const shapeVariants = view.tools.filter((t) => t.tool === "node" && t.variant !== "pool").map((t) => t.variant)
    expect(new Set(shapeVariants)).toEqual(new Set(FlowShapeSchema.options))
  })

  it("la nota del flusso ha un'etichetta sua, distinta da quella delle classi", () => {
    const note = viewFor("flow").tools.find((t) => t.variant === "note")
    expect(note?.label).toBe("Nota di flusso")
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
  })
})

describe("canvasTools", () => {
  it("mette gli strumenti delle famiglie nell'ordine dato, poi Collega", () => {
    const tools = canvasTools(["er", "flow"])
    expect(tools[0]!.label).toBe("Entità")
    expect(tools.at(-1)).toBe(LINK_TOOL)
    expect(tools.filter((t) => t.tool === "edge")).toEqual([LINK_TOOL])
  })

  it("su tutte le famiglie tasti, etichette e id sono unici", () => {
    const tools = canvasTools(FAMILIES)
    const unique = (xs: string[]) => new Set(xs).size === xs.length
    expect(unique(tools.map((t) => t.key))).toBe(true)
    expect(unique(tools.map((t) => t.label))).toBe(true)
    expect(unique(tools.map(toolId))).toBe(true)
    // «v» è Seleziona, che non sta in `canvasTools`: nessuno strumento può rubarla.
    expect(tools.some((t) => t.key === "v")).toBe(false)
  })
})

describe("toolId", () => {
  it("distingue due note di famiglie diverse", () => {
    expect(toolId({ tool: "node", family: "class", variant: "note" })).toBe("node:class:note")
    expect(toolId({ tool: "node", family: "flow", variant: "note" })).toBe("node:flow:note")
    expect(toolId({ tool: "select", family: null })).toBe("select")
    expect(toolId(LINK_TOOL)).toBe("edge")
  })
})
