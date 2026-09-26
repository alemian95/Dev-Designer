import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ShapeNodeView } from "./Shape"
import { ArrowEdgeView } from "./ShapeArrow"

const view = { x: 10, y: 20, collapsed: false, w: null, h: null }
const html = (kind: "rect" | "ellipse" | "text", label: string) =>
  renderToStaticMarkup(<ShapeNodeView id="shape/a" shape={{ kind, label }} view={view} selected={false} />)

describe("ShapeNodeView", () => {
  it("il rettangolo e l'ellisse hanno la loro figura e il testo", () => {
    expect(html("rect", "API")).toContain("<rect")
    expect(html("rect", "API")).toContain("API")
    expect(html("ellipse", "DB")).toContain("<ellipse")
  })

  it("un testo vuoto mostra il segnaposto in grigio", () => {
    const out = html("text", "")
    expect(out).toContain("Testo")
    expect(out).toContain("var(--muted-foreground)")
    expect(out).not.toContain("<ellipse")
  })
})

describe("ArrowEdgeView", () => {
  const a = { x: 0, y: 0, w: 100, h: 40 }
  const b = { x: 300, y: 0, w: 100, h: 40 }
  const arrow = (dashed: boolean) =>
    renderToStaticMarkup(<ArrowEdgeView arrowKey="f" arrow={{ source: "a", target: "b", head: "end", dashed }} source={a} target={b} selected={false} offset={0} />)

  it("la linea è tratteggiata solo se dashed", () => {
    expect(arrow(true)).toContain('stroke-dasharray="6 4"')
    expect(arrow(false)).not.toContain("stroke-dasharray")
  })

  it("si registra con la chiave con prefisso", () => {
    expect(arrow(false)).toContain('data-edge-id="shape/f"')
  })
})
