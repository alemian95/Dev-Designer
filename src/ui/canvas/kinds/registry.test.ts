import { Box, Spline, Square } from "lucide-react"
import { describe, expect, it } from "vitest"
import { viewFor } from "./registry"

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
    expect(er.tools).toEqual({
      node: { label: "Entità", key: "e", Icon: Square },
      edge: { label: "Relazione", key: "r", Icon: Spline },
    })
    expect(cls.tools).toEqual({
      node: { label: "Classe", key: "c", Icon: Box },
      edge: { label: "Relazione", key: "r", Icon: Spline },
    })
    expect(er.textFormats).toEqual(["postgres", "mysql", "mermaid"])
    expect(cls.textFormats).toEqual(["class-mermaid"])
  })
})
