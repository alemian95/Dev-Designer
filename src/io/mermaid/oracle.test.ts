// @vitest-environment jsdom
import mermaid from "mermaid"
import { describe, expect, it } from "vitest"
import { emitClassMermaid } from "@/io/emit/class-mermaid"
import { emitMermaid } from "@/io/emit/er-mermaid"
import type { ClassModel } from "@/model/class/schema"
import type { ErModel } from "@/model/er/schema"
import { CLASS_VALID } from "./class-fixtures"
import { parseClass } from "./class-parse"
import { ER_VALID } from "./er-fixtures"
import { parseEr } from "./er-parse"

/**
 * Mermaid stesso come oracolo (spec §8): ciò che il nostro parser accetta come valido lo deve
 * accettare anche `mermaid.parse()`, e ciò che l'export produce lo deve leggere Mermaid. `mermaid`
 * è solo una devDependency: non entra nel bundle.
 */
const mermaidAccepts = async (text: string): Promise<boolean> => (await mermaid.parse(text, { suppressErrors: true })) !== false

describe("oracolo Mermaid: erDiagram", () => {
  it.each(Object.entries(ER_VALID))("la fixture %s piace a entrambi i parser", async (_, text) => {
    expect(() => parseEr(text)).not.toThrow()
    expect(await mermaidAccepts(text)).toBe(true)
  })

  it("l'export ER è Mermaid valido", async () => {
    const model: ErModel = {
      entities: {
        "pub.a": { schema: "pub", name: "a", attributes: [{ name: "id", type: "double precision", primaryKey: true, foreignKey: false, nullable: false, unique: false }] },
        b: { name: "b", attributes: [] },
      },
      relationships: {
        r: { name: "ha", source: { entity: "b", attributes: [], cardinality: "many" }, target: { entity: "pub.a", attributes: [], cardinality: "zero-or-one" }, identifying: true },
      },
    }
    expect(await mermaidAccepts(emitMermaid(model).text)).toBe(true)
  })
})

describe("oracolo Mermaid: classDiagram", () => {
  it.each(Object.entries(CLASS_VALID))("la fixture %s piace a entrambi i parser", async (_, text) => {
    expect(() => parseClass(text)).not.toThrow()
    expect(await mermaidAccepts(text)).toBe(true)
  })

  it("l'export delle classi è Mermaid valido, generici annidati e note comprese", async () => {
    const model: ClassModel = {
      classes: {
        Ordine: {
          name: "Ordine",
          stereotype: "abstract",
          attributes: [{ name: "pesi", type: "Map<string, List<int>>", visibility: "private", isStatic: true }],
          methods: [{ name: "totale", type: "double", visibility: "public", isStatic: false, isAbstract: true, parameters: [{ name: "x", type: "int" }] }],
        },
        Riga: { name: "Riga", stereotype: "class", attributes: [], methods: [] },
      },
      relations: {
        r: { kind: "composition", source: { class: "Riga", multiplicity: "1..*", role: "" }, target: { class: "Ordine", multiplicity: "1", role: "" } },
      },
    }
    const notes = { n: { text: "a < b & \"c\"\nd", anchor: "class/Ordine" } }
    expect(await mermaidAccepts(emitClassMermaid(model, notes).text)).toBe(true)
  })
})
