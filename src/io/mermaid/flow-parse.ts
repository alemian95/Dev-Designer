import type { ParseWarning } from "@/io/ddl/schema"
import { aggregate, decodeEntities, MermaidSyntaxError, stripNoise, type Finding } from "./common"

/** Un testo di nodo, di arco o di subgraph, già decodificato. `markdown` se era fra `` "` `` e `` `" ``. */
export interface FlowAstText {
  text: string
  markdown: boolean
}

/**
 * Una menzione di nodo, in una dichiarazione o in un arco: lo stesso id può comparire più volte.
 * `shape` è il tipo come lo scrive `flowDb` (`square`, `round`, `lean_right`…, o il nome di
 * `@{ shape: … }`), `null` se la menzione non ne dà uno. `subgraph` è il subgraph aperto più interno.
 */
export interface FlowAstNode {
  id: string
  text: FlowAstText | null
  shape: string | null
  subgraph: string | null
  at: number
}

export type FlowAstHead = "point" | "open" | "circle" | "cross"
export type FlowAstStroke = "normal" | "thick" | "dotted" | "invisible"

/** Un arco già espanso da catene e `&`: uno per coppia di estremi. */
export interface FlowAstEdge {
  source: string
  target: string
  head: FlowAstHead
  /** Testa anche dal lato della sorgente (`<-->`, `o--o`, `x--x`). */
  double: boolean
  stroke: FlowAstStroke
  label: FlowAstText | null
  at: number
}

/** Un subgraph, nell'ordine in cui si chiude: è l'ordine in cui `flowDb` assegna i nodi. */
export interface FlowAstSubgraph {
  id: string
  title: FlowAstText | null
  parent: string | null
  at: number
}

export interface FlowAst {
  /** La direzione dell'intestazione, `TB` se manca. */
  direction: string
  nodes: FlowAstNode[]
  edges: FlowAstEdge[]
  subgraphs: FlowAstSubgraph[]
}

export interface FlowParseResult {
  ast: FlowAst
  warnings: ParseWarning[]
}

type FlowSyntaxCategory = "style" | "interaction" | "direction" | "accessibility" | "edgeId" | "nodeData"

const MESSAGES: Record<FlowSyntaxCategory, string> = {
  style: "Stili scartati (style, linkStyle, classDef, class, :::), il diagramma usa i suoi",
  interaction: "Interazioni scartate (click)",
  direction: "Direzione ignorata: il flusso si dispone da sinistra a destra",
  accessibility: "Titolo e descrizione di accessibilità scartati",
  edgeId: "Id e animazioni degli archi scartati",
  nodeData: "Attributi dei nodi scartati (icon, img, pos, w, h…), restano forma ed etichetta",
}

/**
 * Le forme fra parentesi del lexer di `mermaid@12.2`, con il tipo che `flowDb` dà al nodo: le aperture
 * più lunghe prima, perché l'alternanza prova nell'ordine. `[/` e `[\` hanno due chiusure ciascuna.
 */
const BRACKETS: readonly [open: string, closers: Readonly<Record<string, string>>][] = [
  ["(((", { ")))": "doublecircle" }],
  ["((", { "))": "circle" }],
  ["([", { "])": "stadium" }],
  ["(-", { "-)": "ellipse" }],
  ["[[", { "]]": "subroutine" }],
  ["[(", { ")]": "cylinder" }],
  ["[/", { "/]": "lean_right", "\\]": "trapezoid" }],
  ["[\\", { "\\]": "lean_left", "/]": "inv_trapezoid" }],
  ["{{", { "}}": "hexagon" }],
  ["(", { ")": "round" }],
  ["[", { "]": "square" }],
  ["{", { "}": "diamond" }],
  [">", { "]": "odd" }],
]

/**
 * Id di nodo: la regola `NODE_STRING` del lexer, senza `"`. Un `-` seguito da `-`, `>` o `.` è già
 * una freccia (`A-->B`, `A-.->B`), non il nome. Il `&` attaccato fa parte del nome, come in Mermaid
 * (`A&B` è un nodo solo): separa i nodi solo dopo uno spazio (`A & B`).
 */
const ID = /(?:[\p{L}\p{N}_!#$%&'*+.?\\/`]|-(?![->.]))+/uy

/**
 * Le frecce del lexer, nell'ordine delle sue regole: per ogni tratto la freccia intera, poi l'inizio
 * di quella con il testo in mezzo (`-- testo -->`). La prima che combacia vince, come in jison.
 */
const LINKS: readonly { full: RegExp; start: RegExp | null; end: RegExp | null }[] = [
  { full: /\s*[xo<]?--+[-xo>]\s*/y, start: /\s*[xo<]?--\s*/y, end: /\s*[xo<]?--+[-xo>]\s*/y },
  { full: /\s*[xo<]?==+[=xo>]\s*/y, start: /\s*[xo<]?==\s*/y, end: /\s*[xo<]?==+[=xo>]\s*/y },
  { full: /\s*[xo<]?-?\.+-[xo>]?\s*/y, start: /\s*[xo<]?-\.\s*/y, end: /\s*[xo<]?-?\.+-[xo>]?\s*/y },
  { full: /\s*~~~+\s*/y, start: null, end: null },
]
const LINK_ID = /\s*([^\s"&@]+)@(?=[^{"])/y
const SPACES = /\s*/y
const AMP = /\s*&\s*/y
const STYLE_CLASS = /:::[\w-]+/y

type Link = Pick<FlowAstEdge, "head" | "double" | "stroke" | "label"> & { id: string | null }

/** Una regex sticky a `pos`: il match, o `null`. */
function stick(re: RegExp, s: string, pos: number): RegExpExecArray | null {
  re.lastIndex = pos
  return re.exec(s)
}

const BR = /<br\s*\/?>/gi

/** Entità e `<br>` di un testo (spec §4.3). */
const decode = (raw: string): string => decodeEntities(raw).replace(BR, "\n")

/** Un testo fra virgolette o fra `` "` `` e `` `" ``, già letto fino alla `"` di chiusura. */
function quoted(inner: string): FlowAstText {
  const markdown = inner.length >= 2 && inner.startsWith("`") && inner.endsWith("`")
  return { text: decode(markdown ? inner.slice(1, -1) : inner), markdown }
}

/** `"…"` a partire da `pos` (spazi ammessi prima): il testo e la posizione dopo la `"`, o `null`. */
function readQuoted(s: string, pos: number, base: number): { text: FlowAstText; end: number } | null {
  const start = stick(SPACES, s, pos)![0].length + pos
  if (s[start] !== '"') return null
  const close = s.indexOf('"', start + 1)
  if (close === -1) throw new MermaidSyntaxError("Virgolette senza chiusura", base + start)
  return { text: quoted(s.slice(start + 1, close)), end: close + 1 }
}

/**
 * Le dichiarazioni del testo: una per riga o separate da `;`, ma un `;` o un a capo fra virgolette o
 * dentro parentesi non separano (`A["x; y"]`, un `@{ … }` su più righe).
 */
function statements(text: string): { s: string; at: number }[] {
  const out: { s: string; at: number }[] = []
  let start = 0
  // `[` e `(` si chiudono sulla riga; `{` no, perché `@{ … }` e `accDescr { … }` vanno su più righe.
  let brackets = 0
  let braces = 0
  let quote = false
  const push = (end: number) => {
    const raw = text.slice(start, end)
    const lead = raw.length - raw.trimStart().length
    if (raw.trim() !== "") out.push({ s: raw.trim(), at: start + lead })
    start = end + 1
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '"') quote = !quote
    else if (quote) continue
    else if (c === "[" || c === "(") brackets++
    else if ((c === "]" || c === ")") && brackets > 0) brackets--
    else if (c === "{") braces++
    else if (c === "}" && braces > 0) braces--
    else if (c === "\n" && braces === 0) {
      brackets = 0
      push(i)
    } else if (c === ";" && braces === 0 && brackets === 0) push(i)
  }
  if (quote) throw new MermaidSyntaxError("Virgolette senza chiusura", text.lastIndexOf('"'))
  push(text.length)
  return out
}

/** Testa e tratto di una freccia, con la regola di `destructLink` di `flowDb`. `null` se illeggibile. */
function destruct(end: string, start: string | null): Pick<Link, "head" | "double" | "stroke"> | null {
  const e = end.trim()
  const last = e.slice(-1)
  const head: FlowAstHead = last === ">" ? "point" : last === "o" ? "circle" : last === "x" ? "cross" : "open"
  const opener = { point: "<", circle: "o", cross: "x", open: "" }[head]
  const line = e.startsWith("~") ? "~" : e.replace(/^[xo<]/, "")
  const stroke: FlowAstStroke = line.startsWith("~") ? "invisible" : line.includes(".") ? "dotted" : line.startsWith("=") ? "thick" : "normal"
  if (start === null) return { head, double: opener !== "" && e.startsWith(opener), stroke }
  const s = start.trim()
  const startHead = s[0] === "<" ? "point" : s[0] === "x" ? "cross" : s[0] === "o" ? "circle" : "open"
  const startStroke = s.includes(".") ? "dotted" : s.includes("=") ? "thick" : "normal"
  if (startStroke !== stroke || (startHead !== "open" && startHead !== head)) return null
  return { head, double: startHead !== "open", stroke }
}

/**
 * Legge un `flowchart`/`graph` nell'AST della famiglia (spec §3.3): fedele al testo, nessuna regola
 * di dominio. Le catene e i `&` si espandono qui, un arco per coppia di estremi, come in `flowDb`.
 * Gli avvisi sono i soli costrutti sintattici scartati; un errore strutturale lancia
 * `MermaidSyntaxError` con l'offset.
 */
export function parseFlow(input: string): FlowParseResult {
  const text = stripNoise(input).replace(/\r/g, " ")
  const findings: Finding<FlowSyntaxCategory>[] = []
  const ast: FlowAst = { direction: "TB", nodes: [], edges: [], subgraphs: [] }
  /**
   * I subgraph aperti. Un id assente (titolo con spazi) diventa `subGraphN` alla chiusura, con N il
   * numero di subgraph già chiusi, come `subCount` di `flowDb`: per questo si tengono le menzioni e i
   * figli da aggiornare.
   */
  const open: { sg: FlowAstSubgraph; auto: boolean; alias: boolean; members: FlowAstNode[]; children: FlowAstSubgraph[] }[] = []
  const edgeIds = new Set<string>()
  let seenHeader = false

  const current = () => open[open.length - 1]?.sg.id ?? null
  const direction = (value: string, at: number) => {
    if (!/^(LR|>)$/.test(value)) findings.push({ category: "direction", at })
  }

  /** `id`, la forma fra parentesi, `:::classe` e `@{ … }`, a partire da `pos`. */
  const node = (s: string, pos: number, base: number): { node: FlowAstNode | null; end: number } => {
    pos += stick(SPACES, s, pos)![0].length
    const id = stick(ID, s, pos)
    if (!id) throw new MermaidSyntaxError(`Nodo atteso, trovato «${s.slice(pos, pos + 10)}»`, base + pos)
    const mention: FlowAstNode = { id: id[0], text: null, shape: null, subgraph: current(), at: base + pos }
    open[open.length - 1]?.members.push(mention)
    let i = pos + id[0].length
    const bracket = BRACKETS.find(([o]) => s.startsWith(o, i))
    if (bracket) {
      const [o, closers] = bracket
      const q = readQuoted(s, i + o.length, base)
      const from = q ? q.end : i + o.length
      const found = Object.keys(closers)
        .map((c) => [c, s.indexOf(c, from)] as const)
        .filter(([, at]) => at !== -1 && (q === null || s.slice(from, at).trim() === ""))
        .sort((a, b) => a[1] - b[1])[0]
      if (!found) throw new MermaidSyntaxError(`Forma «${o}» senza chiusura`, base + i)
      const [closer, at] = found
      mention.text = q ? q.text : { text: decode(s.slice(from, at).trim()), markdown: false }
      mention.shape = closers[closer]!
      i = at + closer.length
    }
    if (stick(STYLE_CLASS, s, i)) {
      findings.push({ category: "style", at: base + i })
      i = STYLE_CLASS.lastIndex
    }
    const data = stick(/\s*@\{/y, s, i)
    if (data) {
      const close = s.indexOf("}", i + data[0].length)
      if (close === -1) throw new MermaidSyntaxError("«@{» senza «}»", base + i)
      const body = s.slice(i + data[0].length, close)
      i = close + 1
      if (edgeIds.has(mention.id)) {
        findings.push({ category: "edgeId", at: base + pos })
        return { node: null, end: i }
      }
      for (const [, key, value] of body.matchAll(/(\w+)\s*:\s*("[^"]*"|[^,\n]*)/g)) {
        const v = value!.trim().replace(/^"(.*)"$/s, "$1")
        if (key === "shape") mention.shape = v
        else if (key === "label") mention.text = { text: decode(v), markdown: false }
        else findings.push({ category: "nodeData", at: base + pos })
      }
    }
    return { node: mention, end: i }
  }

  /** Nodi separati da `&`. */
  const group = (s: string, pos: number, base: number): { nodes: FlowAstNode[]; end: number } => {
    const nodes: FlowAstNode[] = []
    let i = pos
    for (;;) {
      const n = node(s, i, base)
      if (n.node) nodes.push(n.node)
      i = n.end
      const amp = stick(AMP, s, i)
      if (!amp) return { nodes, end: i }
      i = AMP.lastIndex
    }
  }

  /** Una freccia a partire da `pos`, con l'eventuale id davanti e il testo: in mezzo o fra `|`. */
  const link = (s: string, pos: number, base: number): { link: Link; end: number } | null => {
    let i = pos
    let id: string | null = null
    const named = stick(LINK_ID, s, i)
    if (named) {
      id = named[1]!
      i = LINK_ID.lastIndex
    }
    for (const { full, start, end } of LINKS) {
      const f = stick(full, s, i)
      if (f) {
        const kind = destruct(f[0], null)!
        let label: FlowAstText | null = null
        let after = full.lastIndex
        const pipe = stick(/\s*\|/y, s, after)
        if (pipe) {
          const from = after + pipe[0].length
          const q = readQuoted(s, from, base)
          const close = s.indexOf("|", q ? q.end : from)
          if (close === -1 || (q && s.slice(q.end, close).trim() !== "")) throw new MermaidSyntaxError("Etichetta «|» senza chiusura", base + after)
          label = q ? q.text : { text: decode(s.slice(from, close).trim()), markdown: false }
          after = close + 1
        }
        return { link: { ...kind, label, id }, end: after }
      }
      const st = start && stick(start, s, i)
      if (st) {
        const from = start.lastIndex
        const q = readQuoted(s, from, base)
        let j = q ? q.end : from
        let closing: RegExpExecArray | null = null
        for (; j < s.length; j++) if ((closing = stick(end!, s, j))) break
        if (!closing) throw new MermaidSyntaxError("Freccia con testo senza chiusura", base + i)
        const kind = destruct(closing[0], st[0])
        if (!kind) throw new MermaidSyntaxError("Freccia illeggibile: i due capi non si accordano", base + i)
        const label = q ? q.text : { text: decode(s.slice(from, j).trim()), markdown: false }
        return { link: { ...kind, label, id }, end: end!.lastIndex }
      }
    }
    if (named) throw new MermaidSyntaxError("Id di arco senza la freccia", base + pos)
    return null
  }

  /** Nodi e archi di una dichiarazione: `A --> B & C -->|t| D`. */
  const vertexStatement = (s: string, base: number) => {
    let prev = group(s, 0, base)
    ast.nodes.push(...prev.nodes)
    let i = prev.end
    for (;;) {
      const l = link(s, i, base)
      if (!l) break
      const next = group(s, l.end, base)
      ast.nodes.push(...next.nodes)
      if (l.link.id !== null) {
        edgeIds.add(l.link.id)
        findings.push({ category: "edgeId", at: base + i })
      }
      for (const from of prev.nodes) {
        for (const to of next.nodes) {
          const { head, double, stroke, label } = l.link
          ast.edges.push({ source: from.id, target: to.id, head, double, stroke, label, at: base })
        }
      }
      prev = next
      i = next.end
    }
    if (s.slice(i).trim() !== "") throw new MermaidSyntaxError(`Testo inatteso: «${s.slice(i).trim()}»`, base + i)
  }

  for (const { s, at } of statements(text)) {
    if (!seenHeader) {
      const header = /^(?:graph|flowchart|flowchart-elk)(?:\s+(\S+))?$/i.exec(s)
      if (!header) throw new MermaidSyntaxError("Il testo non comincia con flowchart o graph", at)
      if (header[1] !== undefined) ast.direction = header[1].toUpperCase()
      direction(ast.direction, at)
      seenHeader = true
      continue
    }
    let m: RegExpExecArray | null
    if (/^(style|linkStyle|classDef|class)\s/.test(s)) findings.push({ category: "style", at })
    else if (/^click\s/.test(s)) findings.push({ category: "interaction", at })
    else if ((m = /^direction\s+(\S+)$/.exec(s))) direction(m[1]!, at)
    else if (/^acc(Title|Descr)\s*[:{]/.test(s)) findings.push({ category: "accessibility", at })
    else if (s === "end") {
      const closing = open.pop()
      if (!closing) throw new MermaidSyntaxError("«end» senza un subgraph aperto", at)
      if (closing.alias) continue
      const { sg, auto, members, children } = closing
      if (auto) {
        sg.id = `subGraph${ast.subgraphs.length}`
        for (const m of members) if (m.subgraph === "") m.subgraph = sg.id
        for (const c of children) c.parent = sg.id
      }
      sg.parent = current()
      open[open.length - 1]?.children.push(sg)
      ast.subgraphs.push(sg)
    } else if ((m = /^subgraph(?:\s+(.*))?$/.exec(s))) {
      const rest = (m[1] ?? "").trim()
      const titled = /^([^\s["]+)\s*\[(.*)\]$/s.exec(rest)
      let id: string
      let title: FlowAstText | null
      if (titled) {
        const inner = titled[2]!.trim()
        id = titled[1]!
        title = /^".*"$/s.test(inner) ? quoted(inner.slice(1, -1)) : { text: decode(inner), markdown: false }
      } else {
        title = rest === "" ? null : /^".*"$/s.test(rest) ? quoted(rest.slice(1, -1)) : { text: decode(rest), markdown: false }
        id = title === null || /\s/.test(title.text) ? "" : title.text
      }
      // Mermaid appiattisce un subgraph riaperto dentro sé stesso: senza l'alias il suo genitore sarebbe sé stesso e `chain` nella mappa non finirebbe
      const same = id === "" ? undefined : open.find((o) => o.sg.id === id)
      if (same) open.push({ sg: same.sg, auto: false, alias: true, members: [], children: [] })
      else open.push({ sg: { id, title, parent: null, at }, auto: id === "", alias: false, members: [], children: [] })
    } else vertexStatement(s, at)
  }

  if (!seenHeader) throw new MermaidSyntaxError("Il testo non comincia con flowchart o graph", 0)
  if (open.length > 0) throw new MermaidSyntaxError("Subgraph senza «end»", open[open.length - 1]!.sg.at)
  return { ast, warnings: aggregate(findings, text, MESSAGES) }
}
