import type { ParseWarning } from "@/io/ddl/schema"

/** Le famiglie che l'import sa leggere, col nome che ha la prima parola del testo Mermaid. */
export type MermaidKind = "er" | "class" | "flow"

/** Un blocco da importare e il punto del testo originale in cui comincia: serve a dire la riga giusta. */
export interface MermaidBlock {
  text: string
  offset: number
}

/**
 * Errore strutturale: il testo non si importa per niente (spec §3.3). `at` è l'offset nel testo
 * dato al parser, da cui `lineOf` ricava la riga da mostrare.
 */
export class MermaidSyntaxError extends Error {
  readonly at: number

  constructor(message: string, at: number) {
    super(message)
    this.name = "MermaidSyntaxError"
    this.at = at
  }
}

const FENCE = /^```mermaid[^\n]*\n([\s\S]*?)^```/gm

/** I blocchi ```mermaid di un markdown; il testo intero se non ce n'è nessuno. */
export function blocks(text: string): MermaidBlock[] {
  const found = [...text.matchAll(FENCE)].map((m) => ({ text: m[1]!, offset: m.index + m[0].indexOf("\n") + 1 }))
  return found.length > 0 ? found : [{ text, offset: 0 }]
}

/** Sostituisce ogni carattere che non è un a capo con uno spazio: gli offset restano quelli del testo originale. */
const blank = (s: string): string => s.replace(/[^\n]/g, " ")

/**
 * Toglie front-matter (`---` … `---` in testa) e commenti `%%` fino a fine riga, direttive `%%{…}%%`
 * comprese, senza spostare nessun offset (stessa garanzia di `stripPsqlMeta` nel DDL). Si ignorano
 * senza avviso (spec §3.3). Un `%%` dentro una stringa fra virgolette non è un commento.
 */
export function stripNoise(text: string): string {
  let out = text.replace(/^---\n[\s\S]*?\n---[^\n]*/, blank)
  out = out.replace(/"[^"\n]*"|%%[^\n]*/g, (m) => (m.startsWith("%%") ? blank(m) : m))
  return out
}

/** La famiglia del testo, dalla prima parola utile; la parola stessa se non è una delle tre; `null` se il testo è vuoto. */
export function detect(text: string): MermaidKind | { unknown: string } | null {
  const word = stripNoise(text).match(/\S+/)?.[0]
  if (word === undefined) return null
  const lower = word.toLowerCase()
  if (lower === "erdiagram") return "er"
  if (lower === "classdiagram") return "class"
  if (lower === "flowchart" || lower === "graph") return "flow"
  return { unknown: word }
}

/** Riga 1-based dell'offset `at`. */
export function lineOf(text: string, at: number): number {
  let line = 1
  for (let i = 0; i < at && i < text.length; i++) if (text[i] === "\n") line++
  return line
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"' }

/** Decodifica le entità Mermaid `#nome;` e `#123;`; le sconosciute restano com'erano. */
export function decodeEntities(text: string): string {
  return text.replace(/#(\w+);/g, (m, code: string) => {
    if (/^\d+$/.test(code)) return String.fromCodePoint(Number(code))
    return NAMED[code] ?? m
  })
}

/** Un'occorrenza da segnalare: la categoria la sceglie chi la trova, `at` dice dove. */
export interface Finding<C extends string> {
  category: C
  at: number
  /** Il nome di ciò che si è perso, quando serve all'utente per ritrovarlo. */
  subject?: string
}

/**
 * Un avviso per categoria, non uno per occorrenza (gli export fanno lo stesso, `emit/result.ts`): il
 * messaggio porta le righe e, se ci sono, i nomi; `at` è la prima occorrenza.
 */
export function aggregate<C extends string>(
  findings: readonly Finding<C>[], text: string, messages: Readonly<Record<C, string>>,
): ParseWarning[] {
  const byCategory = new Map<C, Finding<C>[]>()
  for (const f of findings) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f])
  return [...byCategory].map(([category, list]) => {
    const lines = [...new Set(list.map((f) => lineOf(text, f.at)))].join(", ")
    const subjects = [...new Set(list.flatMap((f) => (f.subject ? [f.subject] : [])))]
    const what = subjects.length > 0 ? `: ${subjects.join(", ")}` : ""
    return { message: `${messages[category]}${what} (${lines.includes(",") ? "righe" : "riga"} ${lines})`, at: list[0]!.at }
  })
}
