import { detect, MermaidSyntaxError } from "./common"
import { mapEr, type ErFragment } from "./er-map"
import { parseEr } from "./er-parse"

export type MermaidAnalysis =
  | { ok: true; kind: "er"; fragment: ErFragment }
  /** `at` è l'offset nel testo analizzato, quando l'errore ne ha uno. */
  | { ok: false; message: string; at: number | null }

/**
 * Dal testo di un blocco al frammento da importare: rilevamento, parse e map, sincroni (spec §3.2).
 * Gli avvisi del parser precedono quelli del map. Un errore strutturale non lancia: torna come esito.
 */
export function analyseMermaid(text: string): MermaidAnalysis {
  const kind = detect(text)
  if (kind === null) return { ok: false, message: "Il testo è vuoto.", at: null }
  if (typeof kind === "object") return { ok: false, message: `«${kind.unknown}» non si importa: solo erDiagram, classDiagram e flowchart.`, at: null }
  // ponytail: classi e flowchart hanno i loro piani; finché non arrivano, qui si fermano con un messaggio.
  if (kind !== "er") return { ok: false, message: "Per ora si importa solo erDiagram: classDiagram e flowchart arriveranno.", at: null }
  try {
    const { ast, warnings } = parseEr(text)
    const fragment = mapEr(ast, text)
    return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { ok: false, message: e.message, at: e.at }
    throw e
  }
}
