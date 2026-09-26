import type { Issue } from "../issue"
import type { ShapeModel } from "./schema"

/** I problemi delle forme: solo la freccia pendente (spec 3b §9). `edge` è la chiave della freccia, senza prefisso. */
export function validateShapes(model: ShapeModel): Issue[] {
  return Object.entries(model.arrows).flatMap(([key, arrow]): Issue[] =>
    arrow.source in model.shapes && arrow.target in model.shapes
      ? []
      : [{ code: "shape-dangling-arrow", severity: "error", edge: key, message: "La freccia collega una forma che non c'è." }],
  )
}
