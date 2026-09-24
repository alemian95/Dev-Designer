import { openArrowPath } from "../class/geometry"
import { pathFromPoints, routeEdge, type EdgeGeometry } from "../edge-routing"
import type { Rect } from "../geometry"

/**
 * Lo stesso instradamento ortogonale degli archi, con scarto 0: fra gli stessi due nodi non esistono
 * due collegamenti (`connectAcross` seleziona quello che c'è), quindi non serve un fascio. Freccia
 * aperta verso il target, nessun marker sul source, etichetta a metà del primo segmento come nel
 * flowchart. Mai un cappio: i due estremi sono di famiglie diverse.
 */
export function linkGeometry(source: Rect, target: Rect): EdgeGeometry {
  const route = routeEdge(source, target, false)
  const pts = route.points
  const p0 = pts[0]!
  const p1 = pts[1]!
  return {
    d: pathFromPoints(pts),
    sourceMarker: "",
    targetMarker: openArrowPath(pts[pts.length - 1]!, route.targetDir),
    label: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
  }
}
