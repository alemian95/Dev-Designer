import { describe, expect, it } from "vitest"
import { ClassRelationSchema } from "./class/schema"
import { RelationshipSchema } from "./er/schema"
import { FlowEdgeSchema } from "./flow/schema"
import { LinkSchema } from "./links/schema"
import { AUTO_ANCHORS, anchorsOf, writeAnchors, type EdgeAnchors } from "./shared"
import { ArrowSchema } from "./shape/schema"

const anchors: EdgeAnchors = { source: "n1", target: null }

describe("anchorsOf", () => {
  it("un arco senza campo ha due capi automatici", () => {
    expect(anchorsOf({})).toEqual({ source: null, target: null })
  })

  it("un arco con il campo lo restituisce", () => {
    expect(anchorsOf({ anchors })).toEqual(anchors)
  })
})

describe("writeAnchors", () => {
  it("scrive la coppia", () => {
    const edge: { anchors?: EdgeAnchors } = {}
    writeAnchors(edge, anchors)
    expect(edge.anchors).toEqual(anchors)
  })

  it("due capi automatici tolgono il campo: il file resta com'era prima degli agganci", () => {
    const edge: { anchors?: EdgeAnchors } = { anchors }
    writeAnchors(edge, AUTO_ANCHORS)
    expect("anchors" in edge).toBe(false)
  })
})

describe("gli schemi degli archi conservano gli agganci", () => {
  const cases: [string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }, Record<string, unknown>][] = [
    ["relazione ER", RelationshipSchema, {
      source: { entity: "a", attributes: [], cardinality: "many" },
      target: { entity: "b", attributes: [], cardinality: "one" },
      identifying: false,
    }],
    ["relazione di classe", ClassRelationSchema, {
      kind: "association",
      source: { class: "A", multiplicity: "", role: "" },
      target: { class: "B", multiplicity: "", role: "" },
    }],
    ["arco di flusso", FlowEdgeSchema, { source: "a", target: "b", label: "" }],
    ["freccia", ArrowSchema, { source: "a", target: "b", head: "end", dashed: false }],
    ["collegamento", LinkSchema, { kind: "accesses", source: "flow/a", target: "er/b", mode: "read" }],
  ]

  for (const [name, schema, edge] of cases) {
    it(`${name}: senza campo è valido, con il campo lo conserva, con un aggancio sconosciuto no`, () => {
      expect(schema.safeParse(edge).success).toBe(true)
      const parsed = schema.safeParse({ ...edge, anchors })
      expect(parsed.success).toBe(true)
      expect((parsed.data as { anchors?: EdgeAnchors }).anchors).toEqual(anchors)
      expect(schema.safeParse({ ...edge, anchors: { source: "centro", target: null } }).success).toBe(false)
    })
  }
})
