import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { entitySize } from "@/editor/er/geometry"
import { HEADER_H, MIN_W } from "@/editor/geometry"
import type { Entity, Relationship } from "@/model/er/schema"
import { EntityNodeView } from "./EntityNode"
import { RelationshipEdgeView } from "./RelationshipEdge"

const entity: Entity = {
  name: "users",
  schema: "auth",
  attributes: [
    { name: "id", type: "bigint", primaryKey: true, foreignKey: false, nullable: false, unique: false },
    { name: "email", type: "varchar(255)", primaryKey: false, foreignKey: false, nullable: false, unique: true },
  ],
}

describe("EntityNodeView", () => {
  it("disegna header, titolo qualificato e una riga per attributo", () => {
    const html = renderToStaticMarkup(<EntityNodeView nodeKey="auth.users" entity={entity} view={{ x: 10, y: 20, collapsed: false }} selected={false} />)
    expect(html).toContain('data-node-id="auth.users"')
    expect(html).toContain('transform="translate(10 20)"')
    expect(html).toContain(">auth.users<")
    expect(html).toContain("PK id     bigint")
    expect(html).toContain(`width="${entitySize(entity, false).w}"`)
  })

  it("collassata: solo header, larghezza minima, bordo primario se selezionata", () => {
    const html = renderToStaticMarkup(<EntityNodeView nodeKey="auth.users" entity={entity} view={{ x: 0, y: 0, collapsed: true }} selected />)
    expect(html).toContain(`width="${MIN_W}" height="${HEADER_H}"`)
    expect(html).not.toContain("PK id")
    expect(html).toContain('stroke="var(--primary)"')
  })
})

describe("RelationshipEdgeView", () => {
  const rel: Relationship = {
    name: "scrive",
    source: { entity: "a", attributes: [], cardinality: "many" },
    target: { entity: "b", attributes: [], cardinality: "zero-or-one" },
    identifying: false,
  }
  it("disegna linea tratteggiata, marker ed etichetta", () => {
    const html = renderToStaticMarkup(<RelationshipEdgeView edgeKey="r" relationship={rel} source={{ x: 0, y: 0, w: 100, h: 50 }} target={{ x: 300, y: 0, w: 100, h: 50 }} selected={false} />)
    expect(html).toContain('data-edge-id="r"')
    expect(html).toContain('stroke-dasharray="6 4"')
    expect(html).toContain("data-edge-source")
    expect(html).toContain(">scrive<")
  })
  it("identificante: linea continua", () => {
    const html = renderToStaticMarkup(<RelationshipEdgeView edgeKey="r" relationship={{ ...rel, identifying: true }} source={{ x: 0, y: 0, w: 100, h: 50 }} target={{ x: 300, y: 0, w: 100, h: 50 }} selected={false} />)
    expect(html).not.toContain("stroke-dasharray")
  })
})
