import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { canvasPorts } from "@/editor/kinds/canvas-ops"
import type { EdgePorts } from "@/editor/ports"

/**
 * I porti di un arco di qualunque famiglia, dalla chiave con prefisso, dalla fonte unica
 * (`canvasPorts`). Per identità: `canvasPorts` riusa l'oggetto quando i numeri non cambiano, quindi
 * l'arco si ridisegna solo quando si muove davvero. `null`: l'arco non si disegna (un estremo manca).
 */
export function useEdgePorts(key: string): EdgePorts | null {
  return useStore(documentStore, (s) => canvasPorts(s.doc).get(key) ?? null)
}
