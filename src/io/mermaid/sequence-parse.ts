import type { ParseWarning } from "@/io/ddl/schema"
import { aggregate, decodeEntities, MermaidSyntaxError, stripFrontMatter, type Finding } from "./common"

export interface SequenceAstParticipant {
  name: string
  label: string | null
  kind: "participant" | "actor"
  at: number
}

export type SequenceAstStep =
  /** `arrow` è la freccia come è scritta, mezze frecce comprese: la traduce il map. */
  | { kind: "message"; from: string; to: string; text: string; arrow: string; at: number }
  | { kind: "note"; placement: "left" | "right" | "over"; participants: string[]; text: string; at: number }
  | { kind: "block"; operator: string; sections: { condition: string; steps: SequenceAstStep[]; at: number }[]; at: number }

export interface SequenceAst {
  title: string | null
  autonumber: boolean
  /** Ordine di prima comparsa, ridichiarazione già risolta. */
  participants: SequenceAstParticipant[]
  steps: SequenceAstStep[]
}

export interface SequenceParseResult {
  ast: SequenceAst
  warnings: ParseWarning[]
}

type SequenceAstBlock = Extract<SequenceAstStep, { kind: "block" }>
type SequenceAstSection = SequenceAstBlock["sections"][number]

type SequenceSyntaxCategory =
  | "activation" | "rect" | "box" | "lifecycle" | "config" | "actorData" | "accessibility" | "wrap" | "central" | "parOver" | "autonumber"

const MESSAGES: Record<SequenceSyntaxCategory, string> = {
  activation: "Attivazioni scartate (activate, deactivate, +/-), i messaggi restano",
  rect: "Riquadri colorati (rect) scartati, i passi restano",
  box: "Gruppi di partecipanti (box) scartati, i partecipanti restano",
  lifecycle: "Creazione e distruzione (create, destroy) scartate, il partecipante c'è per tutta la sequenza",
  config: "Configurazione dei partecipanti (@{…}) scartata, restano nome ed etichetta",
  actorData: "Link e proprietà dei partecipanti scartati (link, links, properties, details)",
  accessibility: "Titolo e descrizione di accessibilità scartati",
  wrap: "A capo automatico (wrap:, nowrap:) scartato, il testo resta",
  central: "Connessioni centrali (()) scartate, i messaggi restano",
  parOver: "Blocchi par_over letti come par",
  autonumber: "Numerazione semplificata (autonumber con inizio, passo o off): si numera da 1 a passo 1",
}

/**
 * Mermaid protegge le entità `#nome;` prima del lexer (`encodeEntities`): il loro `#` non apre un
 * commento e il loro `;` non chiude un'istruzione. Qui `#` e `;` diventano due caratteri privati,
 * della stessa lunghezza, così gli offset non si spostano.
 */
const protect = (s: string): string => s.replace(/#(\w+);/g, "$1")
const restore = (s: string): string => s.replace(//g, "#").replace(//g, ";")

const BR = /<br\s*\/?>/gi
/** Entità e `<br>` di un testo, come nel flowchart. */
const decode = (raw: string): string => decodeEntities(restore(raw)).replace(BR, "\n")

const HEADER = /sequenceDiagram\b/iy
/** Spazi, `;` (che chiude l'istruzione) e commenti: `#` e `%` all'inizio di un token vanno a fine riga. */
const GAP = /(?:\s|;|#[^\n]*|%(?!\{)[^\n]*)*/y
const SPACES = /[ \t]*/y
/** La regola ACTOR del lexer, alla lettera: spazi e `-` interni sì, ma si ferma prima di ogni freccia. */
const ACTOR = /[^/\\+()<\->:\n,;]+(?:(?!-x|--x|-\)|--\)|-\|\\|-\\|-\/|-\/\/|-\|\/|\/\|-|\\\|-|\/\/-|\\\\-|\/\|-|--\|\\|--|\(\))-*[^+<\->:\n,;]+)*/iy
/** Le frecce nell'ordine del lexer, che prende la prima regola che combacia. */
const ARROWS = [
  "->>", "<<->>", "-->>", "<<-->>", "->", "-->", "-x", "--x", "-)", "--)",
  "--|\\", "--|/", "--\\\\", "--//", "/|--", "\\|--", "//--", "\\\\--",
  "-|\\", "-|/", "-\\\\", "-//", "/|-", "\\|-", "//-", "\\\\-",
]
const ARROW = new RegExp(ARROWS.map((a) => a.replace(/[\\|()]/g, "\\$&")).join("|"), "iy")
const CENTRAL = /\(\)/y
const MODIFIER = /[+-]|\(\)/y
/** Il testo dopo `:`: arriva fino a `#`, `;` o fine riga, e il resto è commento. */
const COLON = /[ \t]*:([^#\n;]*)/y
/** Il resto della riga dopo una parola chiave (condizione, colore, nome del box). */
const REST = /[ \t]*([^#\n;]*)/y
/** Il prefisso che `parseMessage` toglie dal testo, maiuscole comprese come in Mermaid. */
const WRAP = /^:?(?:no)?wrap:/

const KEYWORD =
  /(participant|actor|create|destroy|box|loop|rect|opt|alt|else|par_over|par|and|critical|option|break|end|note|activate|deactivate|autonumber)\b/iy
const TITLE = /title:?[ \t]([^#\n;]*)/iy
const ACC_LINE = /acc(?:Title|Descr)\s*:[^\n]*/iy
const ACC_BLOCK = /accDescr\s*\{[^}]*\}/iy
const ACC_OPEN = /accDescr\s*\{/iy
const ACTOR_DATA = /(?:links|link|properties|details)(?=[ \t]+[^/\\+()<>:\n,;\s-])/iy
const PLACEMENT = /\s*(left of|right of|over)\b\s*/iy
const PAIR = /[ \t]*,[ \t]*/y
const AUTONUMBER_ARGS = /(?:[ \t]+(off\b|[\d.]+(?:[ \t]+[\d.]+)?))?/iy
const CREATED_KIND = /[ \t]*(participant|actor)\b/iy

/** Il nome in una dichiarazione (stato ID del lexer): con `@{…}`, prima di `as`, o fino a fine istruzione. */
const CONFIG_NAME = /([^<>:\n,;@\s]+)\s*@\{([^}]*)\}/y
const ALIAS_NAME = /([^<>:\n,;@\s]+)(?=\s+as\s)/iy
const AS = /\s+as(?=\s)[ \t]*([^#\n;]*)/iy
const PLAIN_NAME = /[^<>:\n,;@]+(?=\s*[\n;#]|$)/y

/** Le sezioni che un operatore ammette oltre la prima. */
const SECTION_OF: Readonly<Record<string, string>> = { else: "alt", and: "par", option: "critical" }

/** Un campo piatto di `@{…}`. ponytail: niente YAML annidato; se servisse, un parser vero. */
const configField = (config: string, key: string): string | undefined => {
  const m = new RegExp(String.raw`["']?${key}["']?\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,}\n]+))`).exec(config)
  return (m?.[1] ?? m?.[2] ?? m?.[3])?.trim()
}

/** Un blocco, un `rect` o un `box` aperto. `steps` è dove vanno i passi: per `rect` e `box` quelli di fuori. */
interface Frame {
  keyword: string
  at: number
  steps: SequenceAstStep[]
  block: SequenceAstBlock | null
}

/**
 * Legge un `sequenceDiagram` nell'AST (spec §5): uno scanner a posizione sulle regole del lexer di
 * `mermaid@12.2`. Niente `stripNoise`: `%` e `#` aprono un commento solo all'inizio di un token, e
 * dentro il testo dopo `:` il `%` resta. Tiene lo stato di attivazioni, `create` e `box` per dare gli
 * stessi errori del db di Mermaid.
 */
export function parseSequence(input: string): SequenceParseResult {
  const text = protect(stripFrontMatter(input).replace(/\r/g, " "))
  const findings: Finding<SequenceSyntaxCategory>[] = []
  const ast: SequenceAst = { title: null, autonumber: false, participants: [], steps: [] }
  const byName = new Map<string, SequenceAstParticipant>()
  const open: Frame[] = []
  /** Attivazioni aperte per partecipante, come `activationCount` nel db. */
  const active = new Map<string, number>()
  /** Il box di chi è dichiarato dentro un box, per offset del box. */
  const boxOf = new Map<string, number>()
  /** L'ultimo `create`: il messaggio successivo deve andare a lui. */
  let created: { name: string; at: number } | null = null
  let numbered = false
  let pos = 0

  /** Consuma `re` a `pos`: il match, o `null` senza muoversi. */
  const take = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = pos
    const m = re.exec(text)
    if (m) pos = re.lastIndex
    return m
  }
  const unexpected = (): MermaidSyntaxError => new MermaidSyntaxError(`Testo inatteso: «${restore(/\S*/y.exec(text.slice(pos))![0])}»`, pos)
  const steps = (): SequenceAstStep[] => open.at(-1)?.steps ?? ast.steps

  /** Il testo come lo prepara `parseMessage`: ripulito, senza `wrap:`/`nowrap:`, decodificato. */
  const message = (raw: string, at: number): string => {
    const trimmed = raw.trim()
    const unwrapped = trimmed.replace(WRAP, "")
    if (unwrapped !== trimmed) findings.push({ category: "wrap", at })
    return decode(unwrapped.trim())
  }

  const add = (participant: SequenceAstParticipant) => {
    byName.set(participant.name, participant)
    ast.participants.push(participant)
  }
  /** Un partecipante non dichiarato nasce `participant` dove compare la prima volta. */
  const mention = (name: string, at: number) => {
    if (!byName.has(name)) add({ name, label: null, kind: "participant", at })
  }

  /** Come `addActor`: senza etichetta non tocca un partecipante che c'è già, con l'etichetta lo riscrive. */
  const declare = (name: string, at: number, kind: SequenceAstParticipant["kind"], label: string | undefined, statementAt: number) => {
    const box = open.findLast((f) => f.keyword === "box")?.at
    if (box !== undefined) {
      const previous = boxOf.get(name)
      if (previous !== undefined && previous !== box) throw new MermaidSyntaxError(`${name} sta già in un altro box`, statementAt)
      boxOf.set(name, box)
    }
    const participant = byName.get(name)
    if (!participant) add({ name, label: label ?? null, kind, at })
    else if (label !== undefined) Object.assign(participant, { label, kind })
  }

  const deactivate = (name: string, at: number) => {
    const count = active.get(name) ?? 0
    if (count < 1) throw new MermaidSyntaxError(`«deactivate» di ${name}, che non è attivo`, at)
    active.set(name, count - 1)
  }

  /** Il nome dopo `activate`, `deactivate` o `destroy`. */
  const plainName = (): string => {
    take(SPACES)
    const m = take(PLAIN_NAME)
    if (!m) throw new MermaidSyntaxError("Nome di partecipante non valido", pos)
    return restore(m[0].trim())
  }

  /** `participant|actor Nome [@{…}] [as Etichetta]`; restituisce il nome. */
  const participantStatement = (keyword: string, statementAt: number): string => {
    let kind: SequenceAstParticipant["kind"] = keyword === "actor" ? "actor" : "participant"
    let label: string | undefined
    take(SPACES)
    const at = pos
    let m: RegExpExecArray | null
    let name: string
    if ((m = take(CONFIG_NAME))) {
      findings.push({ category: "config", at: statementAt })
      name = m[1]!
      const type = configField(m[2]!, "type")
      if (type !== undefined) kind = type === "actor" ? "actor" : "participant"
      const alias = configField(m[2]!, "alias")
      if (alias !== undefined) label = decode(alias)
      const as = take(AS)
      if (as) label = message(as[1]!, statementAt)
    } else if ((m = take(ALIAS_NAME))) {
      name = m[1]!
      label = message(take(AS)![1]!, statementAt)
    } else if ((m = take(PLAIN_NAME))) name = m[0].trim()
    else throw new MermaidSyntaxError("Nome di partecipante non valido", pos)
    name = restore(name)
    declare(name, at, kind, label, statementAt)
    return name
  }

  /** `Note left of|right of A: t` o `Note over A[,B]: t`. */
  const noteStatement = (at: number) => {
    const placement = take(PLACEMENT)
    if (!placement) throw new MermaidSyntaxError("«left of», «right of» o «over» attesi dopo «note»", pos)
    const where = placement[1]!.toLowerCase()
    const names: { name: string; at: number }[] = []
    do {
      const nameAt = pos
      const name = take(ACTOR)
      if (!name) throw new MermaidSyntaxError("Partecipante atteso nella nota", pos)
      names.push({ name: restore(name[0].trim()), at: nameAt })
    } while (where === "over" && names.length < 2 && take(PAIR))
    const colon = take(COLON)
    if (!colon) throw new MermaidSyntaxError("Nota senza «:»", at)
    for (const n of names) mention(n.name, n.at)
    const side = where === "left of" ? "left" : where === "right of" ? "right" : "over"
    steps().push({ kind: "note", placement: side, participants: names.map((n) => n.name), text: message(colon[1]!, at), at })
  }

  /** `A[()]<freccia>[+|-|()]B: testo`. */
  const signal = (at: number) => {
    const from = take(ACTOR)
    if (!from) throw unexpected()
    const fromName = restore(from[0].trim())
    if (take(CENTRAL)) findings.push({ category: "central", at })
    take(SPACES)
    const arrow = take(ARROW)
    if (!arrow) throw new MermaidSyntaxError(`Freccia attesa dopo «${fromName}»`, pos)
    const modifier = take(MODIFIER)?.[0]
    take(SPACES)
    const toAt = pos
    const to = take(ACTOR)
    if (!to) throw new MermaidSyntaxError("Partecipante atteso dopo la freccia", pos)
    const toName = restore(to[0].trim())
    const colon = take(COLON)
    if (!colon) throw new MermaidSyntaxError("Messaggio senza «:»", at)
    mention(fromName, at)
    mention(toName, toAt)
    if (created) {
      if (toName !== created.name) throw new MermaidSyntaxError(`Dopo «create ${created.name}» il messaggio successivo deve andare a ${created.name}`, created.at)
      created = null
    }
    steps().push({ kind: "message", from: fromName, to: toName, text: message(colon[1]!, at), arrow: arrow[0], at })
    if (modifier === "()") findings.push({ category: "central", at })
    else if (modifier !== undefined) findings.push({ category: "activation", at })
    if (modifier === "+") active.set(toName, (active.get(toName) ?? 0) + 1)
    if (modifier === "-") deactivate(fromName, at)
  }

  const openBlock = (keyword: string, at: number) => {
    const operator = keyword === "par_over" ? "par" : keyword
    if (keyword === "par_over") findings.push({ category: "parOver", at })
    const section: SequenceAstSection = { condition: message(take(REST)![1]!, at), steps: [], at }
    const block: SequenceAstBlock = { kind: "block", operator, sections: [section], at }
    steps().push(block)
    open.push({ keyword: operator, at, steps: section.steps, block })
  }

  const openSection = (keyword: string, at: number) => {
    const owner = SECTION_OF[keyword]!
    const top = open.at(-1)
    if (!top?.block || top.keyword !== owner) throw new MermaidSyntaxError(`«${keyword}» fuori da un blocco «${owner}»`, at)
    const section: SequenceAstSection = { condition: message(take(REST)![1]!, at), steps: [], at }
    top.block.sections.push(section)
    top.steps = section.steps
  }

  const keywordStatement = (keyword: string, at: number) => {
    switch (keyword) {
      case "participant":
      case "actor":
        participantStatement(keyword, at)
        return
      case "create": {
        const kind = take(CREATED_KIND)
        if (!kind) throw new MermaidSyntaxError("«participant» o «actor» attesi dopo «create»", pos)
        findings.push({ category: "lifecycle", at })
        created = { name: participantStatement(kind[1]!.toLowerCase(), at), at }
        return
      }
      case "destroy":
        plainName()
        findings.push({ category: "lifecycle", at })
        return
      case "activate": {
        const name = plainName()
        active.set(name, (active.get(name) ?? 0) + 1)
        findings.push({ category: "activation", at })
        return
      }
      case "deactivate":
        deactivate(plainName(), at)
        findings.push({ category: "activation", at })
        return
      case "note":
        noteStatement(at)
        return
      case "autonumber": {
        const args = take(AUTONUMBER_ARGS)![1]
        if (args !== undefined) findings.push({ category: "autonumber", at })
        if (!numbered) ast.autonumber = args?.toLowerCase() !== "off"
        numbered = true
        return
      }
      case "rect":
      case "box":
        take(REST)
        findings.push({ category: keyword === "rect" ? "rect" : "box", at })
        open.push({ keyword, at, steps: steps(), block: null })
        return
      case "else":
      case "and":
      case "option":
        openSection(keyword, at)
        return
      case "end":
        if (!open.pop()) throw new MermaidSyntaxError("«end» senza un blocco aperto", at)
        return
      default:
        openBlock(keyword, at)
    }
  }

  take(GAP)
  if (!take(HEADER)) throw new MermaidSyntaxError("Il testo non comincia con sequenceDiagram", pos)
  for (take(GAP); pos < text.length; take(GAP)) {
    const at = pos
    let m: RegExpExecArray | null
    if ((m = take(TITLE))) ast.title = decode(m[1]!.trim())
    else if (take(ACC_LINE) || take(ACC_BLOCK)) findings.push({ category: "accessibility", at })
    else if (take(ACC_OPEN)) throw new MermaidSyntaxError("«accDescr {» senza «}»", at)
    else if (take(ACTOR_DATA)) {
      take(SPACES)
      const nameAt = pos
      const name = take(ACTOR)
      if (!name || !take(COLON)) throw new MermaidSyntaxError("Partecipante e «:» attesi", at)
      mention(restore(name[0].trim()), nameAt)
      findings.push({ category: "actorData", at })
    } else if ((m = take(KEYWORD))) keywordStatement(m[1]!.toLowerCase(), at)
    else signal(at)
  }
  const top = open.at(-1)
  if (top) throw new MermaidSyntaxError(`Blocco «${top.keyword}» senza «end»`, top.at)
  return { ast, warnings: aggregate(findings, text, MESSAGES) }
}
