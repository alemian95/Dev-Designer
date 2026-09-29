import { openArrowPath } from "../class/geometry"
import { pathFromPoints, routePorts, type EdgeGeometry } from "../edge-routing"
import type { EdgePorts } from "../ports"

/**
 * Lo stesso instradamento ortogonale degli archi, dai porti: il collegamento partecipa al fascio per
 * lato (`assignPorts`) insieme agli archi di famiglia. Freccia
 * aperta verso il target, nessun marker sul source, etichetta a metà del primo segmento come nel
 * flowchart. Mai un cappio: i due estremi sono di famiglie diverse.
 */
export function linkGeometry(ports: EdgePorts): EdgeGeometry {
  const route = routePorts(ports)
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
