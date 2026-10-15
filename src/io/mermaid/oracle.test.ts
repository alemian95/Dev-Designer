// @vitest-environment jsdom
import mermaid from "mermaid"
import { describe, expect, it } from "vitest"
import { emitMermaid } from "@/io/emit/er-mermaid"
import type { ErModel } from "@/model/er/schema"
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
