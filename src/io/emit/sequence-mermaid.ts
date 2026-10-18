import { splitKey } from "@/model/family"
import type { Note } from "@/model/note/schema"
import { INVALID_NAME, splitSequenceKey, type Head, type Line, type Operator, type Participant, type Sequence, type SequenceModel, type Step } from "@/model/sequence/schema"
import type { EmitResult } from "./result"

/** Le 10 frecce classiche (spec §8.1), per linea e punta. */
const ARROWS: Record<Line, Record<Head, string>> = {
  solid: { none: "->", filled: "->>", cross: "-x", open: "-)", double: "<<->>" },
  dashed: { none: "-->", filled: "-->>", cross: "--x", open: "--)", double: "<<-->>" },
}

/** La parola che apre le sezioni dopo la prima. */
const SECTION_KEYWORD: Partial<Record<Operator, string>> = { alt: "else", par: "and", critical: "option" }

/**
 * Mermaid 12.2.0 (sonda su `mermaid.parse`) rifiuta un nome che comincia con una di queste parole,
 * senza distinguere maiuscole, quando la parola non è seguita da un carattere di parola: `end`, `end-user`
 * e `Note Service` no, `Backend` e `end_x` sì.
 */
const KEYWORD_START = /^(?:end|loop|alt|else|opt|par_over|par|and|critical|option|break|rect|box|note|participant|actor|activate|deactivate|create|destroy|autonumber|title)(?!\w)/i
/** Queste quattro sono nomi ammessi da sole, ma non seguite da un carattere che non è di parola (`link x`). */
const SOFT_KEYWORD_START = /^(?:links?|properties|details)\W/i
/** `-x`, `-)`, `->`, `--` dentro un nome, o un `-` in coda, si leggono come l'inizio di una freccia (`user-x`, `a-xylophone`: sonda). */
const ARROW_LIKE = /-(?:[x)>-]|$)/i

const isValidName = (name: string): boolean =>
  name !== "" && !INVALID_NAME.test(name) && !KEYWORD_START.test(name) && !SOFT_KEYWORD_START.test(name) && !ARROW_LIKE.test(name)

/**
 * `#` e `;` in un solo passaggio: in sequenza `#35;` perderebbe il suo `;` (`#35#59;`). Poi gli a capo.
 * Niente virgolette (spec §8.1).
 */
const escapeText = (text: string): string => text.replace(/[#;]/g, (c) => (c === "#" ? "#35;" : "#59;")).replaceAll("\n", "<br>")

/** `keyword testo`, o la sola parola chiave se il testo è vuoto. */
const withText = (keyword: string, text: string): string => (text === "" ? keyword : `${keyword} ${escapeText(text)}`)

/** Il testo di una sequenza e quanti nomi non validi sono stati sostituiti: gli avvisi li compone chi chiama. */
function render(seq: Sequence): { text: string; renamed: number } {
  const used = new Set(seq.participants.map((p) => p.name))
  const emitted = new Map<string, string>()
  let renamed = 0
  let nextSafe = 0
  const declare = (p: Participant): string => {
    const ownName = isValidName(p.name)
    let name = p.name
    if (!ownName) {
      renamed += 1
      do nextSafe += 1
      while (used.has(`p${nextSafe}`))
      name = `p${nextSafe}`
      used.add(name)
    }
    emitted.set(p.id, name)
    const label = ownName ? p.label : (p.label ?? p.name)
    return `${p.kind} ${name}${label === null || label === "" ? "" : ` as ${escapeText(label)}`}`
  }

  const out = ["sequenceDiagram"]
  if (seq.title !== "") out.push(withText("title", seq.title))
  if (seq.autonumber) out.push("autonumber")
  for (const p of seq.participants) out.push(`  ${declare(p)}`)

  // Un riferimento pendente lo segnala già il validatore: qui il passo si scarta.
  const steps = (list: readonly Step[], indent: string) => {
    for (const step of list) {
      switch (step.kind) {
        case "message": {
          const from = emitted.get(step.from)
          const to = emitted.get(step.to)
          if (from === undefined || to === undefined) break
          out.push(`${indent}${from}${ARROWS[step.line][step.head]}${to}:${step.text === "" ? "" : ` ${escapeText(step.text)}`}`)
          break
        }
        case "note": {
          const names = step.participants.map((id) => emitted.get(id))
          if (names.some((n) => n === undefined)) break
          const where = step.placement === "over" ? "over" : `${step.placement} of`
          out.push(`${indent}Note ${where} ${names.join(",")}:${step.text === "" ? "" : ` ${escapeText(step.text)}`}`)
          break
        }
        case "block":
          step.sections.forEach((section, i) => {
            out.push(`${indent}${withText(i === 0 ? step.operator : (SECTION_KEYWORD[step.operator] ?? step.operator), section.condition)}`)
            steps(section.steps, `${indent}  `)
          })
          out.push(`${indent}end`)
          break
      }
    }
  }
  steps(seq.steps, "  ")
  return { text: `${out.join("\n")}\n`, renamed }
}

const renamedWarning = (n: number): string[] =>
  n === 0 ? [] : [
    n === 1
      ? "1 nome di partecipante non valido per Mermaid è uscito come id sicuro (p1, p2…), con l'etichetta che c'era o, in mancanza, il nome."
      : `${n} nomi di partecipante non validi per Mermaid sono usciti come id sicuri (p1, p2…), con l'etichetta che c'era o, in mancanza, il nome.`,
  ]

const droppedNotesWarning = (n: number): string[] =>
  n === 0 ? [] : [
    n === 1
      ? "1 nota ancorata a una sequenza non è uscita: i sequenceDiagram di Mermaid non hanno note libere."
      : `${n} note ancorate a una sequenza non sono uscite: i sequenceDiagram di Mermaid non hanno note libere.`,
  ]

/** Le Note ancorate a una sequenza, o a un suo partecipante; con `seqKey` solo a quella sequenza. */
function anchoredCount(notes: Readonly<Record<string, Note>>, seqKey?: string): number {
  return Object.values(notes).filter((n) => {
    if (n.anchor === null) return false
    const { family, key } = splitKey(n.anchor)
    return family === "sequence" && (seqKey === undefined || splitSequenceKey(key)?.sequence === seqKey)
  }).length
}

/** Una sola sequenza come `sequenceDiagram` (spec §8.1). */
export function emitSequenceMermaid(seq: Sequence, seqKey: string, notes: Readonly<Record<string, Note>> = {}): EmitResult {
  const { text, renamed } = render(seq)
  return { text, warnings: [...renamedWarning(renamed), ...droppedNotesWarning(anchoredCount(notes, seqKey))] }
}

/**
 * Tutte le sequenze del modello (spec §8.2): una sola esce come `.mmd`; più di una come `.md`, un
 * blocco ```mermaid per sequenza preceduto da `## <titolo>` o `## Sequenza N`, nell'ordine delle chiavi.
 */
export function emitSequences(model: SequenceModel, notes: Readonly<Record<string, Note>> = {}): EmitResult & { extension: "mmd" | "md" } {
  const entries = Object.values(model.sequences)
  const rendered = entries.map(render)
  const renamed = rendered.reduce((sum, r) => sum + r.renamed, 0)
  const warnings = [...renamedWarning(renamed), ...droppedNotesWarning(anchoredCount(notes))]
  if (rendered.length <= 1) return { text: rendered[0]?.text ?? "", warnings, extension: "mmd" }
  const blocks = rendered.map((r, i) => {
    const title = entries[i]!.title.replaceAll("\n", " ")
    return `## ${title === "" ? `Sequenza ${i + 1}` : title}\n\n\`\`\`mermaid\n${r.text}\`\`\`\n`
  })
  return { text: blocks.join("\n"), warnings, extension: "md" }
}
