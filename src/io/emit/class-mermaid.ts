import type {
  ClassAttribute, ClassEnd, ClassMethod, ClassModel, ClassNode, ClassRelation, RelationKind, Stereotype, Visibility,
} from "@/model/class/schema"
import type { EmitResult } from "./result"

/** Simbolo di visibilità davanti al membro. Stessa tabella di `members.ts`, non esportata da lì:
 *  quattro righe duplicate qui pesano meno di un'astrazione condivisa fra emettitore e parser. */
const SYMBOL_BY_VISIBILITY: Record<Visibility, string> = {
  public: "+", private: "-", protected: "#", package: "~",
}

/**
 * Annotazione di stereotipo, con la maiuscola iniziale: gli esempi della documentazione corrente
 * di Mermaid la scrivono così (`<<Interface>>`, `<<Abstract>>`, `<<Enumeration>>`), anche se la
 * grammatica accetta qualunque testo verbatim. `class` non compare: nessuna riga per il caso comune.
 */
const STEREOTYPE_ANNOTATION: Partial<Record<Stereotype, string>> = {
  interface: "Interface",
  abstract: "Abstract",
  enum: "Enumeration",
}

/**
 * Il token Mermaid per ciascun `kind`, e chi va a sinistra: §9 della spec è normativa qui. Non è
 * sempre il `target` (il padre) — realizzazione e dipendenza vogliono il `source` a sinistra — ed è
 * la parte che si sbaglia più facilmente: i test hanno molteplicità asimmetriche apposta per prenderlo.
 */
const RELATION_TOKEN: Record<RelationKind, string> = {
  generalization: "<|--",
  realization: "..|>",
  composition: "*--",
  aggregation: "o--",
  dependency: "..>",
  association: "--",
}

/** I `kind` che mettono il `target` (il padre/tutto) a sinistra; gli altri tre mettono il `source`. */
const TARGET_LEFT = new Set<RelationKind>(["generalization", "composition", "aggregation"])

/** Nome sicuro per un identificatore Mermaid nudo (classe o riferimento a classe in una relazione). */
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Sanifica un nome per l'uso nudo in `classDiagram`, registrando la coppia (grezzo → pulito) in
 * `renamed` solo se è cambiato: `renamed` è una Map perché lo stesso nome di classe può comparire
 * sia nel blocco sia in una o più relazioni, e non va contato due volte.
 */
function safeName(raw: string, renamed: Map<string, string>): string {
  if (SAFE_NAME.test(raw)) return raw
  let clean = raw.replaceAll(/[^A-Za-z0-9_]/g, "_")
  if (!/^[A-Za-z_]/.test(clean)) clean = `_${clean}`
  renamed.set(raw, clean)
  return clean
}

/** `tipo nome`, con lo spazio solo quando il tipo c'è: è la forma comune a campi e parametri. */
function typeAndName(type: string, name: string): string {
  return type ? `${type} ${name}` : name
}

/** Riga di un attributo: il tipo precede il nome, il classificatore statico segue il nome. */
function attributeLine(a: ClassAttribute): string {
  const classifier = a.isStatic ? "$" : ""
  return `${SYMBOL_BY_VISIBILITY[a.visibility]}${typeAndName(a.type, a.name)}${classifier}`
}

/**
 * Riga di un metodo: i parametri come `tipo nome` (Mermaid non li documenta, li rende come testo
 * dentro le parentesi — coerenza coi campi), il tipo di ritorno dopo le parentesi separato da uno
 * spazio, e i classificatori `$`/`*` in coda, dopo il tipo di ritorno.
 */
function methodLine(m: ClassMethod): string {
  const params = m.parameters.map((p) => typeAndName(p.type, p.name)).join(", ")
  const classifier = `${m.isStatic ? "$" : ""}${m.isAbstract ? "*" : ""}`
  const returnPart = m.type ? ` ${m.type}` : ""
  return `${SYMBOL_BY_VISIBILITY[m.visibility]}${m.name}(${params})${returnPart}${classifier}`
}

/** `"molteplicità"` fra apici, o stringa vuota: il chiamante la scarta filtrando i falsy, così una
 *  molteplicità vuota non lascia una coppia di apici vuoti né uno spazio in più sulla riga. */
function quotedMultiplicity(m: string): string {
  return m ? `"${m}"` : ""
}

/**
 * La riga di una relazione. Il lato sinistro/destro dipende dal `kind` (`TARGET_LEFT`), non è
 * sempre `target`/`source`: è la tabella normativa di §9. L'etichetta va in coda dopo i due punti.
 */
function relationLine(rel: ClassRelation, renamed: Map<string, string>): string {
  const left: ClassEnd = TARGET_LEFT.has(rel.kind) ? rel.target : rel.source
  const right: ClassEnd = TARGET_LEFT.has(rel.kind) ? rel.source : rel.target
  // `-->` solo quando il modello registra la navigabilità. Finché non la registrava, `--` era la
  // scelta corretta perché `-->` avrebbe affermato un verso che nessuno aveva dichiarato (§5 della
  // spec di ampiezza, che completa il Ruling 16 invece di contraddirlo).
  const token = rel.kind === "association" && rel.navigable ? "-->" : RELATION_TOKEN[rel.kind]
  const parts = [
    safeName(left.class, renamed),
    quotedMultiplicity(left.multiplicity),
    token,
    quotedMultiplicity(right.multiplicity),
    safeName(right.class, renamed),
  ].filter(Boolean)
  const label = rel.name ? ` : ${rel.name}` : ""
  return `  ${parts.join(" ")}${label}`
}

/**
 * Testo di una nota dentro `note "…"`. Due sostituzioni, entrambe deterministiche: l'a capo vero
 * romperebbe la riga, la virgoletta doppia chiuderebbe la stringa. L'entità `#quot;` che Mermaid
 * documenta altrove **non è stata misurata dentro una `note`** (§4 della spec): finché non lo è,
 * non si emette una sintassi sperata.
 */
function noteText(text: string): string {
  return text.replaceAll('"', "'").replaceAll("\n", "\\n")
}

/** Il blocco `class Nome { ... }`: stereotipo (se annotato) poi attributi poi metodi. */
function classBlock(node: ClassNode, name: string): string[] {
  const lines = [`  class ${name} {`]
  const annotation = STEREOTYPE_ANNOTATION[node.stereotype]
  if (annotation) lines.push(`    <<${annotation}>>`)
  for (const a of node.attributes) lines.push(`    ${attributeLine(a)}`)
  for (const m of node.methods) lines.push(`    ${methodLine(m)}`)
  lines.push("  }")
  return lines
}

/**
 * Serializza il modello come `classDiagram`.
 *
 * La navigabilità si emette come freccia solo quando il modello la registra: `rel.navigable` è
 * `true` per un'associazione che il diagramma dichiara esplicitamente navigabile, ed esce `-->`;
 * altrimenti (campo assente o `false`) esce `--` (link solido, senza direzione) — vedi §9 della
 * spec per il perché.
 */
export function emitClassMermaid(model: ClassModel): EmitResult {
  const renamed = new Map<string, string>()
  const out = ["classDiagram"]

  for (const key of Object.keys(model.relations).sort()) {
    out.push(relationLine(model.relations[key]!, renamed))
  }

  for (const key of Object.keys(model.classes).sort()) {
    out.push(...classBlock(model.classes[key]!, safeName(key, renamed)))
  }

  for (const key of Object.keys(model.notes).sort()) {
    const text = model.notes[key]!.text
    // Una nota vuota non ha niente da dire: `note ""` è rumore nel file emesso.
    if (text !== "") out.push(`  note "${noteText(text)}"`)
  }

  const warnings: string[] = []
  if (renamed.size > 0) {
    const list = [...renamed].map(([raw, clean]) => `"${raw}" → "${clean}"`).join(", ")
    warnings.push(`${renamed.size} nomi sono stati cambiati perché Mermaid non li accetta nudi: ${list}`)
  }

  return { text: `${out.join("\n")}\n`, warnings }
}
