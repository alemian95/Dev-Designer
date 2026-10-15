import type { ParseWarning } from "@/io/ddl/schema"
import { aggregate, decodeEntities, MermaidSyntaxError, stripNoise, type Finding } from "./common"

/** Le teste della grammatica (`relationType` in `classDiagram.jison`), con un nome invece del numero. */
export type ClassHead = "extension" | "composition" | "aggregation" | "dependency" | "lollipop"

export type ClassAstVisibility = "+" | "-" | "#" | "~" | ""

export interface ClassAstParameter {
  name: string
  type: string
}

/** Un membro già spezzato: i generici a tilde sono già tornati fra `<>`. */
export type ClassAstMember =
  | { kind: "attribute"; visibility: ClassAstVisibility; name: string; type: string; isStatic: boolean; isAbstract: boolean; at: number }
  | {
      kind: "method"
      visibility: ClassAstVisibility
      name: string
      parameters: ClassAstParameter[]
      returnType: string
      isStatic: boolean
      isAbstract: boolean
      at: number
    }

/**
 * Una dichiarazione che tocca una classe: un blocco, `class X`, `X : membro`, `<<a>> X`, o un nome
 * con un generico in una relazione. La stessa classe può comparire più volte.
 */
export interface ClassAstClass {
  id: string
  /** Il parametro di `Square~Shape~`, senza tilde. */
  generic: string | null
  /** L'etichetta di `class A["…"]`. */
  label: string | null
  annotations: string[]
  members: ClassAstMember[]
  at: number
}

/** Una riga di relazione così come è scritta: `left` e `right` sono i lati del testo, non i ruoli del modello. */
export interface ClassAstRelation {
  left: string
  leftMultiplicity: string | null
  leftHead: ClassHead | null
  dotted: boolean
  rightHead: ClassHead | null
  rightMultiplicity: string | null
  right: string
  label: string | null
  at: number
}

export interface ClassAstNote {
  text: string
  /** La classe di `note for X`; `null` per una nota libera. */
  target: string | null
  at: number
}

export interface ClassAst {
  classes: ClassAstClass[]
  relations: ClassAstRelation[]
  notes: ClassAstNote[]
}

export interface ClassParseResult {
  ast: ClassAst
  warnings: ParseWarning[]
}

type ClassSyntaxCategory = "style" | "interaction" | "direction" | "accessibility" | "namespace" | "generics"

const MESSAGES: Record<ClassSyntaxCategory, string> = {
  style: "Stili scartati (style, classDef, cssClass, :::), il diagramma usa i suoi",
  interaction: "Interazioni scartate (click, callback, link)",
  direction: "Direzione ignorata: il diagramma delle classi si dispone dall'alto in basso",
  accessibility: "Titolo e descrizione di accessibilità scartati",
  namespace: "Namespace appiattiti: le classi entrano, i riquadri no",
  generics: "Generici a tilde sbilanciati, il tipo resta com'è",
}

/** Un carattere di nome: le regole `ALPHA`, `NUM` e `UNICODE_TEXT` del lexer. */
const NAME_CHAR = "[\\w\\u0080-\\uFFFF]"
/**
 * Nome di classe: fra backtick, o la regola `className` (`alphaNumToken`, `MINUS`, `DOT`). Un `-`
 * o un `.` seguito da un altro è già la linea di una relazione (`A--B`, `A..B`), non il nome.
 */
const NAME = `(\`[^\`]+\`|(?:${NAME_CHAR}|-(?![-.])|\\.(?![.-]))+)`
const GENERIC = "(?:~([^~\\n]*)~)?"
/** Le teste del lexer. La `o` vale come testa solo se non comincia un nome (`A -- order`). */
const HEAD = `(<\\||\\|>|\\*|o(?!${NAME_CHAR})|<|>|\\(\\))`
const MULTIPLICITY = '(?:"([^"]*)")?'

const RELATION = new RegExp(
  `^${NAME}${GENERIC}\\s*${MULTIPLICITY}\\s*${HEAD}?(--|\\.\\.)${HEAD}?\\s*${MULTIPLICITY}\\s*${NAME}${GENERIC}\\s*(?::(.*))?$`,
)
const CLASS_HEADER = new RegExp(
  `^class\\s+${NAME}${GENERIC}\\s*(?:\\[\\s*"([^"]*)"\\s*\\])?\\s*(?::::([\\w-]+)|<<\\s*([^>\\s]+)\\s*>>)?\\s*(\\{.*)?$`,
)
const MEMBER_LINE = new RegExp(`^${NAME}${GENERIC}\\s*:(.*)$`)
const ANNOTATION_STATEMENT = new RegExp(`^<<\\s*([^>\\s]+)\\s*>>\\s*${NAME}${GENERIC}$`)
const NOTE_FOR = new RegExp(`^note\\s+for\\s+${NAME}${GENERIC}\\s+"([^"]*)"$`)
const NOTE = /^note\s+"([^"]*)"$/
const NAMESPACE = new RegExp(`^namespace\\s+${NAME}\\s*(?:\\[\\s*"[^"]*"\\s*\\])?\\s*\\{$`)

const HEAD_BY_TOKEN: Record<string, ClassHead> = {
  "<|": "extension", "|>": "extension", "*": "composition", o: "aggregation", "<": "dependency", ">": "dependency", "()": "lollipop",
}

const unquote = (s: string): string => (s.startsWith("`") && s.endsWith("`") && s.length >= 2 ? s.slice(1, -1) : s)

/** `true` se `~` in `i` apre un generico: segue un carattere di nome e precede l'inizio di un tipo. */
const opensGeneric = (text: string, i: number): boolean =>
  i > 0 && /[\w\u0080-￿]/.test(text[i - 1]!) && /[\w\u0080-￿([]/.test(text[i + 1] ?? "")

/**
 * I generici a tilde tornano fra `<>` (spec §4.2, §11). Una `~` dopo un nome e prima di un tipo
 * apre, ogni altra chiude: `Map~string, List~int~~` → `Map<string, List<int>>`. Mermaid stesso non
 * lo sa fare (`parseGenericTypes` rende `Map<string, List<int~>`): la regola è nostra, ed è
 * l'inversa di `genericsToTildes` dell'export. `null` se le tilde non si chiudono.
 */
export function decodeGenerics(text: string): string | null {
  let depth = 0
  let out = ""
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "~") {
      out += text[i]
      continue
    }
    if (opensGeneric(text, i)) {
      depth++
      out += "<"
    } else {
      if (depth === 0) return null
      depth--
      out += ">"
    }
  }
  return depth === 0 ? out : null
}

/**
 * Le virgole al livello zero di tonde e angolari: `Map<K, V> m, int n` sono due parametri. Il `>`
 * di `=>` e `->` non chiude niente, come in `members.ts`.
 */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "(" || c === "<") depth++
    else if (c === ")" || (c === ">" && text[i - 1] !== "=" && text[i - 1] !== "-")) depth--
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter((p) => p !== "")
}

/** La `)` che chiude la `(` in `open`, contando le tonde: un ritorno `Func~(int) => void~` ne ha altre. -1 se manca. */
function closingParen(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++
    else if (text[i] === ")" && --depth === 0) return i
  }
  return -1
}

/** `nome: tipo`, `tipo nome` o `nome`. Il `::` di `std::string` non è il separatore. */
function nameAndType(text: string): { name: string; type: string } {
  const colon = /^([^\s:]+)\s*:(?!:)\s*(.+)$/.exec(text)
  if (colon) return { name: colon[1]!, type: colon[2]!.trim() }
  const space = text.search(/\s\S+$/)
  if (space === -1) return { name: text, type: "" }
  return { name: text.slice(space).trim(), type: text.slice(0, space).trim() }
}

/**
 * Un membro (`ClassMember` di Mermaid): metodo se ha le parentesi, attributo altrimenti. La
 * visibilità è il primo carattere; `$` e `*` sono i classificatori, dopo la `)` o in coda.
 */
function parseMember(raw: string, at: number, findings: Finding<ClassSyntaxCategory>[]): ClassAstMember {
  const generics = (s: string): string => {
    const decoded = decodeGenerics(s)
    if (decoded === null) findings.push({ category: "generics", at, subject: s })
    return decoded ?? s
  }
  const visibility = (/^[+\-#~]/.exec(raw)?.[0] ?? "") as ClassAstVisibility
  const body = raw.slice(visibility.length).trim()
  const open = body.indexOf("(")
  const close = open === -1 ? -1 : closingParen(body, open)
  if (open !== -1 && close > open) {
    const after = body.slice(close + 1).trim()
    const classifiers = (/^[$*]*/.exec(after)?.[0] ?? "") + (/[$*]*$/.exec(after)?.[0] ?? "")
    const returnType = after.replace(/^[$*]+/, "").replace(/[$*]+$/, "").trim()
    return {
      kind: "method",
      visibility,
      name: body.slice(0, open).trim(),
      parameters: splitTopLevel(generics(body.slice(open + 1, close))).map(nameAndType),
      returnType: generics(returnType),
      isStatic: classifiers.includes("$"),
      isAbstract: classifiers.includes("*"),
      at,
    }
  }
  const classifiers = /[$*]*$/.exec(body)![0]
  const { name, type } = nameAndType(generics(body.slice(0, body.length - classifiers.length).trim()))
  return { kind: "attribute", visibility, name, type, isStatic: classifiers.includes("$"), isAbstract: classifiers.includes("*"), at }
}

/** Il contenuto di un blocco o di `X : …`: un'annotazione `<<…>>` o un membro. */
function addMember(decl: ClassAstClass, raw: string, at: number, findings: Finding<ClassSyntaxCategory>[]): void {
  const text = raw.trim()
  if (text === "") return
  const annotation = /^<<\s*(.+?)\s*>>$/.exec(text)
  if (annotation) decl.annotations.push(annotation[1]!)
  else decl.members.push(parseMember(text, at, findings))
}

const declaration = (id: string, generic: string | undefined, at: number): ClassAstClass => ({
  id: unquote(id), generic: generic ?? null, label: null, annotations: [], members: [], at,
})

const noteText = (s: string): string => decodeEntities(s.replace(/<br\s*\/?>/gi, "\n"))

/**
 * Legge un `classDiagram` nell'AST della famiglia (spec §3.3): fedele al testo, nessuna regola di
 * dominio. Gli avvisi sono i soli costrutti sintattici scartati; un errore strutturale lancia
 * `MermaidSyntaxError` con l'offset.
 *
 * ponytail: una istruzione per riga fuori dai blocchi, e una nota su una riga sola, come per l'ER.
 * La grammatica ammette una stringa di nota su più righe; l'export usa `<br>` e non la produce.
 */
export function parseClass(input: string): ClassParseResult {
  const text = stripNoise(input).replace(/\r/g, " ")
  const findings: Finding<ClassSyntaxCategory>[] = []
  const ast: ClassAst = { classes: [], relations: [], notes: [] }
  const namespaces: number[] = []
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
      if (!/^classDiagram(-v2)?$/.test(line)) throw new MermaidSyntaxError("Il testo non comincia con classDiagram", at)
      seenHeader = true
      i = next
      continue
    }

    let m: RegExpExecArray | null
    if (/^(style|classDef|cssClass)\b/.test(line)) findings.push({ category: "style", at })
    else if (/^(click|callback|link)\b/.test(line)) findings.push({ category: "interaction", at })
    else if (/^direction\s+(TB|BT|RL|LR)$/.test(line)) findings.push({ category: "direction", at })
    else if (/^acc(Title|Descr)\s*:/.test(line)) findings.push({ category: "accessibility", at })
    else if (/^accDescr\s*\{/.test(line)) {
      const close = text.indexOf("}", at)
      if (close === -1) throw new MermaidSyntaxError("Descrizione di accessibilità senza «}»", at)
      findings.push({ category: "accessibility", at })
      next = text.indexOf("\n", close) === -1 ? text.length : text.indexOf("\n", close) + 1
    } else if (/^namespace\b/.test(line)) {
      if (!NAMESPACE.test(line)) throw new MermaidSyntaxError("Namespace non valido: va «namespace Nome {»", at)
      namespaces.push(at)
      findings.push({ category: "namespace", at })
    } else if (line === "}") {
      if (namespaces.pop() === undefined) throw new MermaidSyntaxError("«}» senza un blocco aperto", at)
    } else if ((m = CLASS_HEADER.exec(line))) {
      const decl = declaration(m[1]!, m[2], at)
      if (m[3] !== undefined) decl.label = decodeEntities(m[3])
      if (m[4] !== undefined) findings.push({ category: "style", at })
      if (m[5] !== undefined) decl.annotations.push(m[5])
      if (m[6] !== undefined) {
        const open = at + line.length - m[6].length
        const close = text.indexOf("}", open)
        if (close === -1) throw new MermaidSyntaxError("Blocco «{» senza «}»", open)
        const inner = text.indexOf("{", open + 1)
        if (inner !== -1 && inner < close) throw new MermaidSyntaxError("«{» dentro il blocco di una classe", inner)
        const after = text.indexOf("\n", close) === -1 ? text.length : text.indexOf("\n", close)
        if (text.slice(close + 1, after).trim() !== "") throw new MermaidSyntaxError("Testo dopo «}» sulla stessa riga", close + 1)
        let offset = open + 1
        for (const member of text.slice(open + 1, close).split("\n")) {
          addMember(decl, member, offset + member.length - member.trimStart().length, findings)
          offset += member.length + 1
        }
        next = after + 1
      }
      ast.classes.push(decl)
    } else if ((m = RELATION.exec(line))) {
      const label = m[10] === undefined ? null : decodeEntities(m[10].trim())
      ast.relations.push({
        left: unquote(m[1]!),
        leftMultiplicity: m[3] === undefined ? null : decodeEntities(m[3]),
        leftHead: m[4] === undefined ? null : HEAD_BY_TOKEN[m[4]]!,
        dotted: m[5] === "..",
        rightHead: m[6] === undefined ? null : HEAD_BY_TOKEN[m[6]]!,
        rightMultiplicity: m[7] === undefined ? null : decodeEntities(m[7]),
        right: unquote(m[8]!),
        label: label === "" ? null : label,
        at,
      })
      // Un nome con il generico in una relazione è anche una dichiarazione: l'avviso lo dà il map.
      if (m[2] !== undefined) ast.classes.push(declaration(m[1]!, m[2], at))
      if (m[9] !== undefined) ast.classes.push(declaration(m[8]!, m[9], at))
    } else if ((m = NOTE_FOR.exec(line))) {
      ast.notes.push({ text: noteText(m[3]!), target: unquote(m[1]!), at })
    } else if ((m = NOTE.exec(line))) {
      ast.notes.push({ text: noteText(m[1]!), target: null, at })
    } else if ((m = ANNOTATION_STATEMENT.exec(line))) {
      const decl = declaration(m[2]!, m[3], at)
      decl.annotations.push(m[1]!)
      ast.classes.push(decl)
    } else if ((m = MEMBER_LINE.exec(line))) {
      const decl = declaration(m[1]!, m[2], at)
      addMember(decl, m[3]!, at, findings)
      ast.classes.push(decl)
    } else if (new RegExp(`^${NAME}${GENERIC}$`).test(line)) {
      // Un nome da solo è una `memberStatement` senza effetto: Mermaid non crea la classe, e nemmeno noi.
    } else {
      throw new MermaidSyntaxError(`Riga non riconosciuta: «${line}»`, at)
    }
    i = next
  }

  if (!seenHeader) throw new MermaidSyntaxError("Il testo non comincia con classDiagram", 0)
  if (namespaces.length > 0) throw new MermaidSyntaxError("Namespace senza «}»", namespaces[namespaces.length - 1]!)
  return { ast, warnings: aggregate(findings, text, MESSAGES) }
}
