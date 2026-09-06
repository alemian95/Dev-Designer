export type Entity = { id: string; name: string; attrs: string[] }
export type Pos = { x: number; y: number }

export function makeEntities(n: number): Entity[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `table_${i}`,
    attrs: Array.from({ length: 8 + (i % 8) }, (_, j) => `col_${j}: varchar(255)`),
  }))
}

export function gridPositions(n: number): Record<string, Pos> {
  const cols = Math.ceil(Math.sqrt(n))
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `t${i}`,
      { x: (i % cols) * 280, y: Math.floor(i / cols) * 380 },
    ]),
  )
}
