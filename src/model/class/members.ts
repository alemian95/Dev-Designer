import type { ClassAttribute, ClassMethod, Parameter, Visibility } from "./schema"

export interface Members {
  attributes: ClassAttribute[]
  methods: ClassMethod[]
}

export type ParseResult =
  | { ok: true; value: Members }
  | { ok: false; line: number; message: string }

const VISIBILITY_BY_SYMBOL: Record<string, Visibility> = {
  "+": "public",
  "-": "private",
  "#": "protected",
  "~": "package",
}

const SYMBOL_BY_VISIBILITY: Record<Visibility, string> = {
  public: "+",
  private: "-",
  protected: "#",
  package: "~",
}

/** Errore per una singola riga, con `line` 1-based per poterlo dire all'utente. */
function fail(line: number, message: string): ParseResult {
  return { ok: false, line, message }
}

/**
 * Trova la `)` che chiude la `(` in posizione `open`, contando le parentesi
 * invece di cercare l'ultima: un tipo di parametro come `(int) => void`
 * rompe un `lastIndexOf(")")`. Torna -1 se non bilanciate.
 */
function findClosingParen(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++
    else if (text[i] === ")") {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Le parentesi tonde da sole: contano per il loro contatore di profondità. */
const PAREN_BRACKETS: ReadonlyArray<readonly [string, string]> = [["(", ")"]]

/** Le parentesi angolari da sole: contano per il loro contatore di profondità. */
const ANGLE_BRACKETS: ReadonlyArray<readonly [string, string]> = [["<", ">"]]

/** Tonde, angolari, quadre e graffe insieme: quelle che contano per il tipo di un attributo. */
const TYPE_BRACKETS: ReadonlyArray<readonly [string, string]> = [
  ...PAREN_BRACKETS,
  ...ANGLE_BRACKETS,
  ["[", "]"],
  ["{", "}"],
]

/**
 * +1/-1/0 di profondità per il carattere in posizione `i` di `text`, secondo
 * le coppie in `pairs`. Un '>' preceduto da '=' è la freccia di un tipo
 * funzione (`(int) => void`), non la chiusura di un generico: non conta.
 * Una primitiva, due usi: la usano sia `splitTopLevel` (dividere per
 * virgola, un contatore per coppia) sia `lastTopLevelColon` (trovare il ':'
 * di tipo, un contatore unico) — stessa scansione a livello zero, bracket
 * diversi.
 */
function depthDelta(text: string, i: number, pairs: readonly (readonly [string, string])[]): number {
  const c = text[i]
  for (const [open, close] of pairs) {
    if (c === open) return 1
    if (c === close) return c === ">" && text[i - 1] === "=" ? 0 : -1
  }
  return 0
}

/**
 * Divide `inside` per virgola al livello zero di parentesi tonde e di
 * parentesi angolari, con **contatori separati** per i due tipi: è quello
 * che fa passare `Map<K, V>` come un solo parametro invece di due. Una `(` o
 * una `<` mai richiusa non deve far sparire in silenzio i parametri
 * successivi dentro il tipo del primo: se a fine stringa un contatore non è
 * tornato a zero, è un errore con la sua riga.
 */
function splitTopLevel(inside: string, line: number): string[] | ParseResult {
  if (inside.trim() === "") return []
  const parts: string[] = []
  let depthParen = 0
  let depthAngle = 0
  let start = 0
  for (let i = 0; i < inside.length; i++) {
    depthParen += depthDelta(inside, i, PAREN_BRACKETS)
    depthAngle += depthDelta(inside, i, ANGLE_BRACKETS)
    if (inside[i] === "," && depthParen === 0 && depthAngle === 0) {
      parts.push(inside.slice(start, i))
      start = i + 1
    }
  }
  if (depthParen !== 0 || depthAngle !== 0) {
    return fail(line, `parentesi non bilanciate nei parametri: "${inside}"`)
  }
  parts.push(inside.slice(start))
  return parts
}

/**
 * L'indice dell'ultimo ':' al livello zero di parentesi — tonde, angolari,
 * quadre e graffe — o -1 se non ce n'è uno a livello zero. Regola 4 della §5
 * della spec: il tipo di un attributo è ciò che segue quel ':', non
 * l'ultimo in assoluto — altrimenti `+ x: { a: int }` e `+ m: Map<K, V>` si
 * spezzano nel punto sbagliato.
 */
function lastTopLevelColon(text: string): number {
  let depth = 0
  let last = -1
  for (let i = 0; i < text.length; i++) {
    depth += depthDelta(text, i, TYPE_BRACKETS)
    if (text[i] === ":" && depth === 0) last = i
  }
  return last
}

/**
 * Il nome non può contenere un carattere strutturale: altrimenti un `)`
 * estraneo prima della `(` finisce silenziosamente nel nome (`+ f)(x: int)`
 * → nome `"f)"`, nessun errore) invece di essere rifiutato con la sua riga.
 */
function validateMemberName(name: string, line: number): ParseResult | null {
  const structural = name.match(/[(){}<>:,]/)
  if (structural) return fail(line, `nome non valido, contiene "${structural[0]}": "${name}"`)
  return null
}

function parseParameter(text: string, line: number): Parameter | ParseResult {
  const colon = text.indexOf(":")
  if (colon === -1) {
    const name = text.trim()
    if (name === "") return fail(line, `nome di parametro vuoto`)
    return { name, type: "" }
  }
  const name = text.slice(0, colon).trim()
  const type = text.slice(colon + 1).trim()
  if (name === "") return fail(line, `nome di parametro vuoto`)
  return { name, type }
}

function isParseResult<T>(v: T | ParseResult): v is ParseResult {
  return typeof v === "object" && v !== null && "ok" in v
}

/** Testo → membri. `line` nell'errore è 1-based, per dirlo all'utente. */
export function parseMembers(text: string): ParseResult {
  const attributes: ClassAttribute[] = []
  const methods: ClassMethod[] = []
  const lines = text.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    let rest = lines[i]!.trim()
    if (rest === "") continue

    // Visibilità: un carattere fra +-#~, altrimenti public.
    let visibility: Visibility = "public"
    if (rest[0]! in VISIBILITY_BY_SYMBOL) {
      visibility = VISIBILITY_BY_SYMBOL[rest[0]!]!
      rest = rest.slice(1).trim()
    }

    // Modificatori fra graffe, in qualsiasi ordine.
    let isStatic = false
    let isAbstract = false
    while (rest.startsWith("{")) {
      const close = rest.indexOf("}")
      if (close === -1) return fail(lineNumber, `modificatore senza chiusura: "${rest}"`)
      const modifier = rest.slice(1, close).trim()
      if (modifier === "static") isStatic = true
      else if (modifier === "abstract") isAbstract = true
      else return fail(lineNumber, `modificatore sconosciuto: "${modifier}"`)
      rest = rest.slice(close + 1).trim()
    }

    const openParen = rest.indexOf("(")

    if (openParen === -1) {
      // Attributo: il tipo è ciò che segue l'ultimo ':' al livello zero di parentesi.
      if (isAbstract) return fail(lineNumber, `un attributo non può essere abstract`)
      const colon = lastTopLevelColon(rest)
      const name = (colon === -1 ? rest : rest.slice(0, colon)).trim()
      const type = colon === -1 ? "" : rest.slice(colon + 1).trim()
      if (name === "") return fail(lineNumber, `nome di attributo vuoto`)
      const invalid = validateMemberName(name, lineNumber)
      if (invalid) return invalid
      attributes.push({ name, type, visibility, isStatic })
      continue
    }

    // Metodo: trova la ')' che chiude contando le parentesi.
    const closeParen = findClosingParen(rest, openParen)
    if (closeParen === -1) return fail(lineNumber, `parentesi non bilanciate: "${rest}"`)

    const name = rest.slice(0, openParen).trim()
    if (name === "") return fail(lineNumber, `nome di metodo vuoto`)
    const invalidName = validateMemberName(name, lineNumber)
    if (invalidName) return invalidName

    const inside = rest.slice(openParen + 1, closeParen)
    const split = splitTopLevel(inside, lineNumber)
    if (isParseResult(split)) return split
    const parameters: Parameter[] = []
    for (const raw of split) {
      const parsed = parseParameter(raw, lineNumber)
      if (isParseResult(parsed)) return parsed
      parameters.push(parsed)
    }

    const afterParen = rest.slice(closeParen + 1).trim()
    let type = ""
    if (afterParen.startsWith(":")) type = afterParen.slice(1).trim()

    methods.push({ name, type, visibility, isStatic, isAbstract, parameters })
  }

  return { ok: true, value: { attributes, methods } }
}

/** Il pezzo `{static} {abstract}`, ciascuno col proprio spazio davanti; stringa vuota se nessuno. */
function modifiersText(isStatic: boolean, isAbstract: boolean): string {
  let out = ""
  if (isStatic) out += " {static}"
  if (isAbstract) out += " {abstract}"
  return out
}

function parametersText(parameters: readonly Parameter[]): string {
  return parameters.map((p) => `${p.name}${p.type ? ": " + p.type : ""}`).join(", ")
}

/** Membri → forma canonica per la textarea: `+ id: int`, spazio singolo. */
export function memberText(m: Members): string {
  const attributeLines = m.attributes.map(
    (a) => `${SYMBOL_BY_VISIBILITY[a.visibility]}${modifiersText(a.isStatic, false)} ${a.name}${a.type ? ": " + a.type : ""}`,
  )
  const methodLines = m.methods.map(
    (fn) =>
      `${SYMBOL_BY_VISIBILITY[fn.visibility]}${modifiersText(fn.isStatic, fn.isAbstract)} ${fn.name}(${parametersText(fn.parameters)})${fn.type ? ": " + fn.type : ""}`,
  )
  return [...attributeLines, ...methodLines].join("\n")
}

/** Membri → righe rese sul nodo, colonne allineate con spazi: il font è monospace. */
export function memberLines(m: Members): string[] {
  const attributeNames = m.attributes.map(
    (a) => `${SYMBOL_BY_VISIBILITY[a.visibility]}${modifiersText(a.isStatic, false)} ${a.name}`,
  )
  const methodNames = m.methods.map(
    (fn) =>
      `${SYMBOL_BY_VISIBILITY[fn.visibility]}${modifiersText(fn.isStatic, fn.isAbstract)} ${fn.name}(${parametersText(fn.parameters)})`,
  )
  const nameW = Math.max(0, ...attributeNames.map((n) => n.length), ...methodNames.map((n) => n.length))

  const attributeLines = m.attributes.map((a, i) =>
    a.type ? `${attributeNames[i]!.padEnd(nameW)}: ${a.type}` : attributeNames[i]!,
  )
  const methodLines = m.methods.map((fn, i) =>
    fn.type ? `${methodNames[i]!.padEnd(nameW)}: ${fn.type}` : methodNames[i]!,
  )
  return [...attributeLines, ...methodLines]
}
