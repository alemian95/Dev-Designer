import type { ParseWarning } from "@/io/ddl/schema"
import { aggregate, decodeEntities, MermaidSyntaxError, stripNoise, type Finding } from "./common"

/** I cinque gettoni di cardinalità della grammatica (`erDiagram.jison`), qualunque forma li scriva. */
export type ErCardinalityToken = "ZERO_OR_ONE" | "ZERO_OR_MORE" | "ONE_OR_MORE" | "ONLY_ONE" | "MD_PARENT"

export type ErKeyToken = "PK" | "FK" | "UK"

export interface ErAstAttribute {
  type: string
  name: string
  keys: ErKeyToken[]
  comment: string | null
  at: number
}

/** Una dichiarazione di entità: un blocco, o il nome da solo. La stessa entità può comparire più volte. */
export interface ErAstEntity {
  id: string
  alias: string | null
  attributes: ErAstAttribute[]
  at: number
}

/** Una riga di relazione così come è scritta: `left` è l'entità a sinistra, `leftCard` il marcatore accanto a lei. */
export interface ErAstRelationship {
  left: string
  leftCard: ErCardinalityToken
  right: string
  rightCard: ErCardinalityToken
  identifying: boolean
  label: string | null
  at: number
}

export interface ErAst {
  entities: ErAstEntity[]
  relationships: ErAstRelationship[]
}

export interface ErParseResult {
  ast: ErAst
  warnings: ParseWarning[]
}

type ErSyntaxCategory = "style" | "direction" | "accessibility" | "title" | "subgraph"

const MESSAGES: Record<ErSyntaxCategory, string> = {
  style: "Stili scartati (style, classDef, class, :::), il diagramma usa i suoi",
  direction: "Direzione ignorata: il diagramma ER si dispone dall'alto in basso",
  accessibility: "Titolo e descrizione di accessibilità scartati",
  title: "Titolo scartato",
  subgraph: "Subgraph appiattiti: le entità entrano, i riquadri no",
}

/** Le forme di cardinalità del lexer di `mermaid@12.2`, dalla più lunga: l'alternanza prova nell'ordine. */
const CARDINALITY: readonly [string, ErCardinalityToken][] = [
  ["one or zero", "ZERO_OR_ONE"], ["one or more", "ONE_OR_MORE"], ["one or many", "ONE_OR_MORE"],
  ["zero or one", "ZERO_OR_ONE"], ["zero or more", "ZERO_OR_MORE"], ["zero or many", "ZERO_OR_MORE"],
  ["only one", "ONLY_ONE"], ["many(0)", "ZERO_OR_MORE"], ["many(1)", "ONE_OR_MORE"], ["many", "ZERO_OR_MORE"],
  ["one", "ONLY_ONE"], ["1+", "ONE_OR_MORE"], ["0+", "ZERO_OR_MORE"], ["1", "ONLY_ONE"],
  ["|o", "ZERO_OR_ONE"], ["o|", "ZERO_OR_ONE"], ["}o", "ZERO_OR_MORE"], ["o{", "ZERO_OR_MORE"],
  ["}|", "ONE_OR_MORE"], ["|{", "ONE_OR_MORE"], ["||", "ONLY_ONE"], ["u", "MD_PARENT"],
]
const CARD_BY_FORM = new Map(CARDINALITY.map(([form, token]) => [form, token]))

/** Il tipo di linea: `--` e `to` identificanti, gli altri no. «optionally to» prima di «to». */
const LINE_FORMS: readonly [string, boolean][] = [["--", true], ["..", false], [".-", false], ["-.", false], ["optionally to", false], ["to", true]]
const LINE_BY_FORM = new Map(LINE_FORMS)

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const CARD = `(${CARDINALITY.map(([f]) => escape(f)).join("|")})`
const LINE = `(${LINE_FORMS.map(([f]) => escape(f)).join("|")})`
/** Nome di entità: citato, o la regola `UNICODE_TEXT` del lexer (lettere, cifre, `_`, `-`, `*`, `.`). */
const NAME = `("[^"\\n]+"|[\\w.*\\-\\u0080-\\uFFFF]+)`
const STYLE = `(:::[\\w,\\-]+)?`

const RELATIONSHIP_HEAD = `^${NAME}\\s*${STYLE}\\s*${CARD}\\s*${LINE}\\s*${CARD}\\s*${NAME}\\s*${STYLE}`
/** L'etichetta è un solo gettone, come `role` nella grammatica: fra virgolette, o una parola. */
const RELATIONSHIP = new RegExp(`${RELATIONSHIP_HEAD}\\s*(?::\\s*("[^"]*"|[^\\s"]+))?\\s*$`, "i")
const LOOKS_LIKE_RELATIONSHIP = new RegExp(RELATIONSHIP_HEAD, "i")
const ENTITY = new RegExp(`^${NAME}\\s*(?:\\[\\s*${NAME}\\s*\\])?\\s*${STYLE}\\s*$`)

const unquote = (s: string): string => (s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s.slice(1, -1) : s)

/** I gettoni del contenuto di un blocco: le regole `<block>` del lexer, nello stesso ordine. */
type BlockToken =
  | { kind: "key"; value: ErKeyToken; raw: string; at: number }
  | { kind: "word"; value: string; at: number }
  | { kind: "comment"; value: string; at: number }
  | { kind: "comma" | "question"; at: number }

const BLOCK_RULES: readonly [RegExp, (m: string, at: number) => BlockToken][] = [
  [/^(PK|FK|UK)\b/i, (m, at) => ({ kind: "key", value: m.toUpperCase() as ErKeyToken, raw: m, at })],
  [/^[^\s]*~[^\n]*~[^\s]*/, (m, at) => ({ kind: "word", value: m, at })],
  [/^[*A-Za-z_À-￿][A-Za-z0-9\-_[\]().,À-￿*]*/, (m, at) => ({ kind: "word", value: m, at })],
  [/^`[^`]+`/, (m, at) => ({ kind: "word", value: m.slice(1, -1), at })],
  [/^"[^"]*"/, (m, at) => ({ kind: "comment", value: m.slice(1, -1), at })],
  [/^,/, (_, at) => ({ kind: "comma", at })],
  [/^\?/, (_, at) => ({ kind: "question", at })],
]

/** La `}` che chiude il blocco aperto in `open`, saltando quelle dentro un commento fra virgolette. -1 se manca. */
function closingBrace(text: string, open: number): number {
  let quoted = false
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted
    else if (text[i] === "}" && !quoted) return i
  }
  return -1
}

function blockTokens(body: string, base: number): BlockToken[] {
  const out: BlockToken[] = []
  let i = 0
  while (i < body.length) {
    const ws = /^\s+/.exec(body.slice(i))
    if (ws) {
      i += ws[0].length
      continue
    }
    const rest = body.slice(i)
    const rule = BLOCK_RULES.find(([re]) => re.test(rest))
    if (!rule) throw new MermaidSyntaxError(`Carattere inatteso «${rest[0]}» nel blocco dell'entità`, base + i)
    const m = rule[0].exec(rest)![0]
    out.push(rule[1](m, base + i))
    i += m.length
  }
  return out
}

/** `tipo nome [PK, FK, UK] ["commento"]`, ripetuto: gli a capo nel blocco non contano, come nel lexer. */
function attributes(body: string, base: number): ErAstAttribute[] {
  const tokens = blockTokens(body, base)
  const out: ErAstAttribute[] = []
  let i = 0
  const word = (what: string): { value: string; at: number } => {
    const t = tokens[i]
    // Un nome di attributo che si chiama come una chiave (`int pk`) è legittimo: qui serve una parola.
    if (t?.kind === "word") {
      i++
      return { value: t.value, at: t.at }
    }
    if (t?.kind === "key" && what === "il nome") {
      i++
      return { value: t.raw, at: t.at }
    }
    throw new MermaidSyntaxError(`Manca ${what} dell'attributo`, t?.at ?? base + body.length)
  }
  while (i < tokens.length) {
    const type = word("il tipo")
    let typeText = type.value
    if (tokens[i]?.kind === "question") {
      typeText += "?"
      i++
    }
    const name = word("il nome")
    const keys: ErKeyToken[] = []
    while (tokens[i]?.kind === "key") {
      keys.push((tokens[i] as { value: ErKeyToken }).value)
      i++
      if (tokens[i]?.kind === "comma" && tokens[i + 1]?.kind === "key") i++
    }
    let comment: string | null = null
    if (tokens[i]?.kind === "comment") {
      comment = (tokens[i] as { value: string }).value
      i++
    }
    out.push({ type: typeText, name: name.value, keys, comment, at: type.at })
  }
  return out
}

/**
 * Legge un `erDiagram` nell'AST della famiglia (spec §3.3): fedele al testo, nessuna regola di
 * dominio. Gli avvisi sono i soli costrutti sintattici scartati; un errore strutturale lancia
 * `MermaidSyntaxError` con l'offset.
 *
 * ponytail: una istruzione per riga fuori dai blocchi, mentre la grammatica ne ammette più d'una
 * sulla stessa riga. Nessuno lo scrive e l'export non lo produce; se un file reale lo fa, serve un
 * tokenizzatore vero al posto delle espressioni regolari per riga.
 */
export function parseEr(input: string): ErParseResult {
  const text = stripNoise(input)
  const findings: Finding<ErSyntaxCategory>[] = []
  const ast: ErAst = { entities: [], relationships: [] }
  const subgraphs: number[] = []
  let seenHeader = false
  let i = 0

  while (i < text.length) {
    const end = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i)
    const raw = text.slice(i, end)
    const lead = raw.length - raw.trimStart().length
    const at = i + lead
    const line = raw.trim()
    let next = end + 1

    if (line === "") {
      i = next
      continue
    }
    if (!seenHeader) {
      if (!/^erDiagram\b/i.test(line)) throw new MermaidSyntaxError("Il testo non comincia con erDiagram", at)
      seenHeader = true
      i = next
      continue
    }

    const brace = line.indexOf("{")
    // Un `{` fuori dalle virgolette apre un blocco, salvo che sia il marcatore `o{`/`|{` di una relazione.
    const opensBlock = brace !== -1 && !LOOKS_LIKE_RELATIONSHIP.test(line) && !/^accDescr\s*\{/i.test(line)

    if (/^(style|classDef|class)\b/i.test(line)) findings.push({ category: "style", at })
    else if (/^direction\s+\w+/i.test(line)) findings.push({ category: "direction", at })
    else if (/^acc(Title|Descr)\s*:/i.test(line)) findings.push({ category: "accessibility", at })
    else if (/^accDescr\s*\{/i.test(line)) {
      const close = text.indexOf("}", i + lead)
      if (close === -1) throw new MermaidSyntaxError("Descrizione di accessibilità senza «}»", at)
      findings.push({ category: "accessibility", at })
      next = text.indexOf("\n", close) === -1 ? text.length : text.indexOf("\n", close) + 1
    } else if (/^title\b/i.test(line)) findings.push({ category: "title", at })
    else if (/^subgraph\b/i.test(line)) {
      subgraphs.push(at)
      findings.push({ category: "subgraph", at })
    } else if (/^end$/i.test(line)) {
      if (subgraphs.pop() === undefined) throw new MermaidSyntaxError("«end» senza un subgraph aperto", at)
    } else if (opensBlock) {
      const open = i + lead + brace
      const close = closingBrace(text, open)
      if (close === -1) throw new MermaidSyntaxError("Blocco «{» senza «}»", open)
      const header = ENTITY.exec(text.slice(i + lead, open).trim())
      if (!header) throw new MermaidSyntaxError("Nome di entità non valido prima di «{»", at)
      if (header[3]) findings.push({ category: "style", at })
      const after = text.indexOf("\n", close) === -1 ? text.length : text.indexOf("\n", close)
      if (text.slice(close + 1, after).trim() !== "") throw new MermaidSyntaxError("Testo dopo «}» sulla stessa riga", close + 1)
      ast.entities.push({
        id: unquote(header[1]!),
        alias: header[2] ? unquote(header[2]) : null,
        attributes: attributes(text.slice(open + 1, close), open + 1).map((a) => ({ ...a, comment: a.comment && decodeEntities(a.comment) })),
        at,
      })
      next = after + 1
    } else {
      const rel = RELATIONSHIP.exec(line)
      const entity = rel ? null : ENTITY.exec(line)
      if (rel) {
        if (rel[2] || rel[7]) findings.push({ category: "style", at })
        const label = rel[8] === undefined ? null : decodeEntities(unquote(rel[8]))
        ast.relationships.push({
          left: unquote(rel[1]!),
          leftCard: CARD_BY_FORM.get(rel[3]!.toLowerCase())!,
          identifying: LINE_BY_FORM.get(rel[4]!.toLowerCase())!,
          rightCard: CARD_BY_FORM.get(rel[5]!.toLowerCase())!,
          right: unquote(rel[6]!),
          label: label === "" ? null : label,
          at,
        })
      } else if (entity) {
        if (entity[3]) findings.push({ category: "style", at })
        ast.entities.push({ id: unquote(entity[1]!), alias: entity[2] ? unquote(entity[2]) : null, attributes: [], at })
      } else if (LOOKS_LIKE_RELATIONSHIP.test(line)) {
        throw new MermaidSyntaxError("Testo in più dopo la relazione: un'etichetta con spazi va fra virgolette, e va un'istruzione per riga", at)
      } else {
        throw new MermaidSyntaxError(`Riga non riconosciuta: «${line}»`, at)
      }
    }
    i = next
  }

  if (!seenHeader) throw new MermaidSyntaxError("Il testo non comincia con erDiagram", 0)
  if (subgraphs.length > 0) throw new MermaidSyntaxError("Subgraph senza «end»", subgraphs[subgraphs.length - 1]!)
  return { ast, warnings: aggregate(findings, text, MESSAGES) }
}
