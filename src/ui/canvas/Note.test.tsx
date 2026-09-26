import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { NoteView } from "./Note"

describe("NoteView", () => {
  const nota = { text: "prima\nseconda" }

  it("disegna corpo e piega, e una riga di testo per riga di nota", () => {
    const html = renderToStaticMarkup(<NoteView id="note/n-1" note={nota} view={{ x: 10, y: 20, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="note/n-1"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain("data-note-fold")
    expect(html).toContain(">prima<")
    expect(html).toContain(">seconda<")
  })

  it("una nota vuota non produce righe di testo ma esiste come nodo", () => {
    const html = renderToStaticMarkup(<NoteView id="note/n-1" note={{ text: "" }} view={{ x: 0, y: 0, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="note/n-1"')
    expect(html).not.toContain("<text")
  })

  it("la selezione cambia il contorno", () => {
    const sel = renderToStaticMarkup(<NoteView id="note/n-1" note={nota} view={{ x: 0, y: 0, collapsed: false }} selected={true} />)
    expect(sel).toContain("var(--primary)")
  })
})
