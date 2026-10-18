import type { ParseWarning } from "@/io/ddl/schema"
import { aggregate, decodeEntities, MermaidSyntaxError, stripFrontMatter, type Finding } from "./common"

/** Un'estremità di transizione: l'id di uno stato, o `null` per `[*]`. */
export type StateAstEnd = string | null

/** Dove sta una menzione: il composto più interno aperto (`null` = radice) e la regione dentro di lui, da 0. */
export interface StateAstPlace {
  container: string | null
  region: number
}

export interface StateAstMention extends StateAstPlace {
  id: string
  /** Una descrizione data da questa menzione: alias di `state "X" as id`, o `id : testo`. */
  description: string | null
  kind: "choice" | "fork" | "join" | null
  at: number
}

export interface StateAstTransition extends StateAstPlace {
  source: StateAstEnd
  target: StateAstEnd
  label: string
  at: number
}

export interface StateAstComposite extends StateAstPlace {
  id: string
  alias: string | null
  regions: number
  at: number
}

export interface StateAstNote {
  target: string | null
  text: string
  at: number
}

export interface StateAst {
  /** L'ultima `direction` della radice, `TB` se manca. */
  direction: string
  mentions: StateAstMention[]
  transitions: StateAstTransition[]
  composites: StateAstComposite[]
  notes: StateAstNote[]
}

export interface StateParseResult {
  ast: StateAst
  warnings: ParseWarning[]
}

type StateSyntaxCategory = "style" | "accessibility" | "direction"

const MESSAGES: Record<StateSyntaxCategory, string> = {
  style: "Stili e interazioni scartati (classDef, class, :::, style, click), il diagramma usa i suoi",
  accessibility: "Titolo e descrizione di accessibilità scartati",
  direction: "Direzione ignorata: il flusso si dispone da sinistra a destra",
}

const HEADER = /stateDiagram(?:-v2)?(?=\s|$)/iy
/** Spazi, a capo e commenti `%%`/`#` che aprono un token: il commento va fino a fine riga. */
const GAP = /(?:\s|(?:%%|#)[^\n]*)*/y
/** La regola `[^:\n\s\-\{]+` del lexer, che si ferma anche a `%%`: dopo un id il `%%` apre un commento. */
const ID = /(?:(?!%%)[^:\s\-{])+/uy
const END = /\[\*\]/y
const ARROW = /[ \t]*-->[ \t]*/y
const STYLE_CLASS = /:::[\w-]+/y
/** `:` e il resto della riga: l'etichetta di una transizione o la descrizione di uno stato. */
const COLON = /[ \t]*:([^\n]*)/y
const KIND_TOKEN = String.raw`<<(choice|fork|join)>>|\[\[(choice|fork|join)\]\]`
const KIND = new RegExp(String.raw`[ \t]*(?:${KIND_TOKEN})`, "iy")
/** L'id dopo `state`: si ferma anche al genere attaccato (`state f<<fork>>`), che Mermaid separa. */
const STATE_ID = new RegExp(String.raw`(?:(?!%%|${KIND_TOKEN})[^:\s\-{])+`, "iuy")
const ALIAS = /"([^"]*)"\s*as\s+/iy
const DIRECTION = /direction\s+(TB|BT|RL|LR)(?=\s|$)/iy
const STYLE_LINE = /(?:classDef|class|style|click)[ \t][^\n]*/iy
const ACC_LINE = /acc(?:Title|Descr)\s*:[^\n]*/iy
const ACC_BLOCK = /accDescr\s*\{[^}]*\}/iy
/** Righe che non cambiano il db di Mermaid: si saltano senza avviso. */
const IGNORED_LINE = /(?:hide empty description|scale\s)[^\n]*/iy
const STATE = /state\s+/iy
const OPEN = /[ \t]*\{/y
/** Altro testo fra l'id e una `{` sulla stessa riga: un nome di composto con più parole. */
const MORE_WORDS = /[^\n:{}]*\{/y
/** `--` separa le regioni; `-->` a inizio istruzione resta un errore. */
const DIVIDER = /--(?!>)/y

const toKind = (s: string | undefined): StateAstMention["kind"] => (s === "choice" || s === "fork" || s === "join" ? s : null)

const BR = /<br\s*\/?>/gi

/** Entità e `<br>` di un testo, come nel flowchart. */
const decode = (raw: string): string => decodeEntities(raw).replace(BR, "\n")

/**
 * Legge uno `stateDiagram`/`stateDiagram-v2` nell'AST (spec §4): uno scanner a posizione, perché il
 * lexer di Mermaid non vuole terminatori e il `;` è un carattere qualunque. Niente `stripNoise`: un
 * `%%` dentro un'etichetta è testo. Le parole chiave valgono solo all'inizio di un'istruzione.
 */
export function parseState(input: string): StateParseResult {
  const text = stripFrontMatter(input).replace(/\r/g, " ")
  const findings: Finding<StateSyntaxCategory>[] = []
  const ast: StateAst = { direction: "TB", mentions: [], transitions: [], composites: [], notes: [] }
  const place: StateAstPlace = { container: null, region: 0 }
  /**
   * I composti aperti: il posto da riprendere alla `}`, le regioni di questa apertura e dove cominciano
   * le sue menzioni, transizioni e figli, per accodarne le regioni se il composto è riaperto.
   */
  const open: { composite: StateAstComposite; outer: StateAstPlace; regions: number; from: [number, number, number] }[] = []
  /** Alla `}`: una riapertura con `--` accoda le sue regioni a quelle del composto, come i divider di Mermaid. */
  const close = () => {
    const { composite, outer, regions, from } = open.pop()!
    const reopened = ast.composites.indexOf(composite) < from[2]
    if (!reopened) composite.regions = regions
    else if (regions > 1) {
      const items = [...ast.mentions.slice(from[0]), ...ast.transitions.slice(from[1]), ...ast.composites.slice(from[2])]
      for (const item of items) if (item.container === composite.id) item.region += composite.regions
      composite.regions += regions
    }
    Object.assign(place, outer)
  }
  let pos = 0

  /** Consuma `re` a `pos`: il match, o `null` senza muoversi. */
  const take = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = pos
    const m = re.exec(text)
    if (m) pos = re.lastIndex
    return m
  }
  const unexpected = (): MermaidSyntaxError => new MermaidSyntaxError(`Testo inatteso: «${/\S*/y.exec(text.slice(pos))![0]}»`, pos)
  const mention = (id: string, at: number, description: string | null = null, kind: StateAstMention["kind"] = null) => {
    ast.mentions.push({ ...place, id, description, kind, at })
  }

  /** `[*]`, o un id con l'eventuale `:::classe`; `undefined` se a `pos` non c'è nessuno dei due. */
  const end = (): { id: StateAstEnd; at: number } | undefined => {
    const at = pos
    // Dentro un composto una `}` a inizio token lo chiude, come `STRUCT_STOP` nel lexer.
    if (open.length > 0 && text[pos] === "}") return undefined
    if (take(END)) return { id: null, at }
    const id = take(ID)
    if (!id) return undefined
    const classAt = pos
    if (take(STYLE_CLASS)) findings.push({ category: "style", at: classAt })
    return { id: id[0], at }
  }

  /** Il testo dopo `:`, già decodificato, o `null` se non c'è. `::` è un errore anche per Mermaid. */
  const colon = (): string | null => {
    const m = take(COLON)
    if (!m) return null
    const twice = m[1]!.indexOf("::")
    if (twice !== -1) throw new MermaidSyntaxError('"::" in un\'etichetta', pos - m[1]!.length + twice)
    return decode(m[1]!.trim())
  }

  /** `state "X" as L [: d]`, `state L [<<genere>>] [: d]`, o l'apertura di un composto `state [ "X" as ] C {`. */
  const stateStatement = (statementAt: number) => {
    const alias = take(ALIAS)
    if (!alias && text[pos] === '"') throw new MermaidSyntaxError("Virgolette senza chiusura o senza «as»", pos)
    const at = pos
    const id = take(STATE_ID)
    if (!id) throw new MermaidSyntaxError("Stato atteso dopo «state»", pos)
    if (take(OPEN)) {
      const from: [number, number, number] = [ast.mentions.length, ast.transitions.length, ast.composites.length]
      // Un composto riaperto è lo stesso, come in Mermaid: vale il posto della prima apertura.
      let composite = ast.composites.find((c) => c.id === id[0])
      if (!composite) {
        composite = { ...place, id: id[0], alias: alias ? decode(alias[1]!) : null, regions: 1, at: statementAt }
        ast.composites.push(composite)
      }
      open.push({ composite, outer: { ...place }, regions: 1, from })
      Object.assign(place, { container: id[0], region: 0 })
      return
    }
    MORE_WORDS.lastIndex = pos
    if (MORE_WORDS.test(text)) throw new MermaidSyntaxError("Il nome di uno stato composto è una parola sola", at)
    const kind = take(KIND)
    const description = colon()
    if (alias) {
      mention(id[0], at, decode(alias[1]!))
      if (description !== null) mention(id[0], at, description)
    } else if (description === null) mention(id[0], at, null, toKind((kind?.[1] ?? kind?.[2])?.toLowerCase()))
    // `state L : descr` senza alias: Mermaid perde la descrizione e non crea lo stato.
  }

  /** `A`, `A : d` o `A --> B [: etichetta]`, con `[*]` al posto di uno stato. */
  const transitionOrMention = () => {
    const source = end()
    if (!source) throw unexpected()
    if (!take(ARROW)) {
      const description = colon()
      // Un `[*]` da solo non nomina nessuno stato.
      if (source.id !== null) mention(source.id, source.at, description)
      return
    }
    const target = end()
    if (!target) throw new MermaidSyntaxError("Stato atteso dopo «-->»", pos)
    if (source.id !== null) mention(source.id, source.at)
    if (target.id !== null) mention(target.id, target.at)
    ast.transitions.push({ ...place, source: source.id, target: target.id, label: colon() ?? "", at: source.at })
  }

  take(GAP)
  let directionAt = pos
  if (!take(HEADER)) throw new MermaidSyntaxError("Il testo non comincia con stateDiagram", pos)
  for (take(GAP); pos < text.length; take(GAP)) {
    const at = pos
    let m: RegExpExecArray | null
    if (open.length > 0 && text[pos] === "}") {
      pos++
      close()
    } else if (take(DIVIDER)) {
      const top = open[open.length - 1]
      if (!top) throw new MermaidSyntaxError('"--" fuori da uno stato composto', at)
      top.regions++
      place.region++
    } else if ((m = take(DIRECTION))) {
      // Dentro un composto la `direction` non cambia quella globale, come in Mermaid.
      if (place.container === null) {
        ast.direction = m[1]!.toUpperCase()
        directionAt = at
      }
    } else if (take(STYLE_LINE)) findings.push({ category: "style", at })
    else if (take(ACC_LINE) || take(ACC_BLOCK)) findings.push({ category: "accessibility", at })
    else if (/accDescr\s*\{/iy.test(text.slice(at))) throw new MermaidSyntaxError("«accDescr {» senza «}»", at)
    else if (take(IGNORED_LINE)) continue
    else if (take(STATE)) stateStatement(at)
    else transitionOrMention()
  }
  if (open.length > 0) throw new MermaidSyntaxError('Stato composto senza "}"', open[open.length - 1]!.composite.at)
  if (ast.direction !== "LR") findings.push({ category: "direction", at: directionAt })
  return { ast, warnings: aggregate(findings, text, MESSAGES) }
}
