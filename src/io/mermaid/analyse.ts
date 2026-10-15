import { mapClass, type ClassFragment } from "./class-map"
import { parseClass } from "./class-parse"
import { detect, MermaidSyntaxError, type MermaidKind } from "./common"
import { mapEr, type ErFragment } from "./er-map"
import { parseEr } from "./er-parse"
import { mapFlow, type FlowFragment } from "./flow-map"
import { parseFlow } from "./flow-parse"

export type MermaidAnalysis =
  | { ok: true; kind: "er"; fragment: ErFragment }
  | { ok: true; kind: "class"; fragment: ClassFragment }
  | { ok: true; kind: "flow"; fragment: FlowFragment }
  /** `at` è l'offset nel testo analizzato, quando l'errore ne ha uno. */
  | { ok: false; message: string; at: number | null }

/** Parse e map della famiglia: gli avvisi del parser precedono quelli del map. */
function analyseKind(kind: MermaidKind, text: string): MermaidAnalysis {
  if (kind === "er") {
    const { ast, warnings } = parseEr(text)
    const fragment = mapEr(ast, text)
    return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
  }
  if (kind === "class") {
    const { ast, warnings } = parseClass(text)
    const fragment = mapClass(ast, text)
    return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
  }
  const { ast, warnings } = parseFlow(text)
  const fragment = mapFlow(ast, text)
  return { ok: true, kind, fragment: { ...fragment, warnings: [...warnings, ...fragment.warnings] } }
}

/**
 * Dal testo di un blocco al frammento da importare: rilevamento, parse e map, sincroni (spec §3.2).
 * Un errore strutturale non lancia: torna come esito.
 */
export function analyseMermaid(text: string): MermaidAnalysis {
  const kind = detect(text)
  if (kind === null) return { ok: false, message: "Il testo è vuoto.", at: null }
  if (typeof kind === "object") return { ok: false, message: `«${kind.unknown}» non si importa: solo erDiagram, classDiagram e flowchart.`, at: null }
  try {
    return analyseKind(kind, text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { ok: false, message: e.message, at: e.at }
    throw e
  }
}
