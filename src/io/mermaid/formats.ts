import type { ParseWarning } from "@/io/ddl/schema"
import { mapClass, type ClassFragment } from "./class-map"
import { parseClass } from "./class-parse"
import { stripNoise } from "./common"
import { mapEr, type ErFragment } from "./er-map"
import { parseEr } from "./er-parse"
import { mapFlow, type FlowFragment } from "./flow-map"
import { parseFlow } from "./flow-parse"

/** Il frammento che ogni famiglia di import produce: una famiglia nuova è una riga qui. */
export interface FragmentByFamily {
  er: ErFragment
  class: ClassFragment
  flow: FlowFragment
}

export type ImportFamily = keyof FragmentByFamily

/** Un formato Mermaid: le parole che lo aprono, come si chiama all'utente e come si legge. */
export interface MermaidFormatEntry<F extends ImportFamily> {
  /** Le possibili prime parole del testo, in minuscolo o no: il confronto non distingue. */
  keywords: readonly string[]
  /** Il nome nel selettore dei blocchi. */
  label: string
  /** Il formato con l'articolo, per la descrizione del dialog. */
  named: string
  family: F
  /** Parse e map: gli avvisi del parser precedono quelli del map. */
  analyse(text: string): FragmentByFamily[F]
}

/** Lega `analyse` alla `family` della voce: il frammento di un'altra famiglia non compila. */
const format = <F extends ImportFamily>(entry: MermaidFormatEntry<F>): MermaidFormatEntry<F> => entry

const withWarnings = <T extends { warnings: ParseWarning[] }>(parsed: ParseWarning[], fragment: T): T =>
  ({ ...fragment, warnings: [...parsed, ...fragment.warnings] })

export const MERMAID_FORMATS = {
  erDiagram: format({
    keywords: ["erDiagram"], label: "ER", named: "un erDiagram", family: "er",
    analyse(text) {
      const { ast, warnings } = parseEr(text)
      return withWarnings(warnings, mapEr(ast, text))
    },
  }),
  classDiagram: format({
    keywords: ["classDiagram"], label: "classi", named: "un classDiagram", family: "class",
    analyse(text) {
      const { ast, warnings } = parseClass(text)
      return withWarnings(warnings, mapClass(ast, text))
    },
  }),
  flowchart: format({
    keywords: ["flowchart", "graph"], label: "flowchart", named: "un flowchart", family: "flow",
    analyse(text) {
      const { ast, warnings } = parseFlow(text)
      return withWarnings(warnings, mapFlow(ast, text))
    },
  }),
}

export type MermaidFormat = keyof typeof MERMAID_FORMATS

const FORMAT_IDS = Object.keys(MERMAID_FORMATS).filter((id): id is MermaidFormat => id in MERMAID_FORMATS)

/** Il formato del testo, dalla prima parola utile; la parola stessa se non è nota; `null` se il testo è vuoto. */
export function detectFormat(text: string): MermaidFormat | { unknown: string } | null {
  const word = stripNoise(text).match(/\S+/)?.[0]
  if (word === undefined) return null
  const lower = word.toLowerCase()
  const found = FORMAT_IDS.find((id) => MERMAID_FORMATS[id].keywords.some((k) => k.toLowerCase() === lower))
  return found ?? { unknown: word }
}

/** I formati in un elenco italiano, `a, b e c`, scelti da `pick`. */
export function formatList(conjunction: "e" | "o", pick: (f: MermaidFormat) => string): string {
  const items = FORMAT_IDS.map(pick)
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`
}
