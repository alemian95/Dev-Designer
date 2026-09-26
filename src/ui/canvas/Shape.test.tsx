import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ShapeNodeView } from "./Shape"

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
