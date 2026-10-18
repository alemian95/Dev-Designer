import { MermaidSyntaxError } from "./common"
import { detectFormat, formatList, MERMAID_FORMATS, type FragmentByFamily, type ImportFamily, type MermaidFormatEntry } from "./formats"

/** Un esito riuscito della famiglia `F`: il suo frammento, e nessun altro. */
export type MermaidReadyOf<F extends ImportFamily> = { ok: true; kind: F; fragment: FragmentByFamily[F] }

export type MermaidReady = { [F in ImportFamily]: MermaidReadyOf<F> }[ImportFamily]

export type MermaidAnalysis =
  | MermaidReady
  /** `at` è l'offset nel testo analizzato, quando l'errore ne ha uno. */
  | { ok: false; message: string; at: number | null }

const ready = <F extends ImportFamily>(entry: MermaidFormatEntry<F>, text: string): MermaidReadyOf<F> =>
  ({ ok: true, kind: entry.family, fragment: entry.analyse(text) })

/** Ogni voce del registro, con la sua famiglia: `ready` si applica a una voce alla volta, non all'unione. */
type AnyFormatEntry = { [F in ImportFamily]: MermaidFormatEntry<F> }[ImportFamily]

function readyOf(entry: AnyFormatEntry, text: string): MermaidReady {
  switch (entry.family) {
    case "er": return ready(entry, text)
    case "class": return ready(entry, text)
    case "flow": return ready(entry, text)
  }
}

/**
 * Dal testo di un blocco al frammento da importare: rilevamento, parse e map, sincroni (spec §3.2).
 * Un errore strutturale non lancia: torna come esito.
 */
export function analyseMermaid(text: string): MermaidAnalysis {
  const format = detectFormat(text)
  if (format === null) return { ok: false, message: "Il testo è vuoto.", at: null }
  if (typeof format === "object") return { ok: false, message: `«${format.unknown}» non si importa: solo ${formatList("e", (f) => f)}.`, at: null }
  try {
    return readyOf(MERMAID_FORMATS[format], text)
  } catch (e) {
    if (e instanceof MermaidSyntaxError) return { ok: false, message: e.message, at: e.at }
    throw e
  }
}
