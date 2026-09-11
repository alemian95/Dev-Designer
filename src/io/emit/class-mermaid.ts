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

/**
 * Traduce le parentesi angolari di un generico nelle tilde che Mermaid interpreta. Senza questa
 * traduzione `List<Ordine>` **rende `List`**: il parametro sparisce, in silenzio — misurato su
 * `mermaid@11`, §3 della spec di ampiezza. Nessun caso speciale per la virgola: la stessa misura
 * mostra che `Map~string, int~` funziona, contro quel che dice la documentazione.
 *
 * Il `>` preceduto da `=` o `-` resta com'è: `(int) => void` è un tipo legale nella nostra
 * sintassi, e sostituirlo produrrebbe `(int) =~ void`.
 *
 * Torna `null` se il risultato non è bilanciato — tilde in numero dispari: meglio il tipo
 * originale e un avviso che una sintassi a metà.
 */
function genericsToTildes(type: string): string | null {
  const out = type.replace(/</g, "~").replace(/(?<![=-])>/g, "~")
  const tildes = (out.match(/~/g) ?? []).length
  return tildes % 2 === 0 ? out : null
}

/** Rimuove ogni gruppo `{…}` graffe comprese, e la graffa spaiata con tutto ciò che la segue. */
function stripBraces(type: string): string {
  return type.replace(/\{[^}]*\}/g, "").replace(/[{}].*$/, "").replace(/\s+/g, " ").trim()
}

/**
 * Vero se il tipo ha un generico annidato: una `<` che si apre mentre un'altra è già aperta, come
 * in `Map<string, List<int>>`. Nessuna codifica lo risolve — non è un problema di escaping ma un
 * limite di Mermaid, misurato su `mermaid@11` (§3 della spec di ampiezza): la doppia tilde che ne
 * risulta (`Map~string, List~int~~`) rende `Map<string, List<int~>`, testo mangled. Un generico
 * piatto come `Map<string, int>` ha profondità massima 1 e non deve allarmare: rende corretto.
 *
 * Stessa esclusione di `genericsToTildes` per il `>` di `=>`/`->`, così la profondità non scende
 * per un token che non è mai stato un `<` di apertura.
 */
function hasNestedGenerics(type: string): boolean {
  let depth = 0
  for (let i = 0; i < type.length; i++) {
    const ch = type[i]
    if (ch === "<") {
      depth++
      if (depth >= 2) return true
    } else if (ch === ">" && type[i - 1] !== "=" && type[i - 1] !== "-") {
      depth = Math.max(0, depth - 1)
    }
  }
  return false
}

/**
 * Traduce il tipo di un membro per l'emissione, registrando in `unbalanced`/`braced`/`nested` il
 * nome completo (`Classe.membro`) di ogni membro coinvolto: sono le liste da cui
 * `emitClassMermaid` costruisce i tre avvisi aggregati, uno per tipo di problema e non uno per
 * membro.
 *
 * `stripBraces` gira **sempre**, angolari bilanciate o no: la graffa è quella che rompe l'intero
 * parsing Mermaid, quindi va eliminata anche quando la traduzione dei generici fallisce — un tipo
 * può comparire in entrambi gli avvisi, non è un bug ma un'informazione in più per chi legge.
 *
 * `nested` si valuta solo quando le tilde sono bilanciate: un tipo con angolari sbilanciate esce
 * già com'era (l'altro avviso lo copre), annidato o no non cambia cosa viene emesso.
 */
function emittableType(
  type: string, qualifiedName: string, unbalanced: string[], braced: string[], nested: string[],
): string {
  if (type.includes("{")) braced.push(qualifiedName)
  const tildes = genericsToTildes(type)
  if (tildes === null) {
    unbalanced.push(qualifiedName)
    return stripBraces(type)
  }
  if (hasNestedGenerics(type)) nested.push(qualifiedName)
  return stripBraces(tildes)
}

/** Riga di un attributo: il tipo precede il nome, il classificatore statico segue il nome. */
function attributeLine(a: ClassAttribute, className: string, unbalanced: string[], braced: string[], nested: string[]): string {
  const classifier = a.isStatic ? "$" : ""
  const type = emittableType(a.type, `${className}.${a.name}`, unbalanced, braced, nested)
  return `${SYMBOL_BY_VISIBILITY[a.visibility]}${typeAndName(type, a.name)}${classifier}`
}

/**
 * Riga di un metodo: i parametri come `tipo nome` (Mermaid non li documenta, li rende come testo
 * dentro le parentesi — coerenza coi campi), il tipo di ritorno dopo le parentesi separato da uno
 * spazio, e i classificatori `$`/`*` in coda, dopo il tipo di ritorno.
 */
function methodLine(m: ClassMethod, className: string, unbalanced: string[], braced: string[], nested: string[]): string {
  const qualified = `${className}.${m.name}`
  const params = m.parameters
    .map((p) => typeAndName(emittableType(p.type, qualified, unbalanced, braced, nested), p.name))
    .join(", ")
  const classifier = `${m.isStatic ? "$" : ""}${m.isAbstract ? "*" : ""}`
  const returnType = emittableType(m.type, qualified, unbalanced, braced, nested)
  const returnPart = returnType ? ` ${returnType}` : ""
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
 * Testo di una nota dentro `note "…"`. Le entità sono quelle di Mermaid, tutte misurate su
 * `mermaid@11` (§3/§4 della spec di ampiezza): senza di loro `<`, `>` e `"` grezzi vengono
 * interpretati come HTML e perdono testo dell'utente (`<b>grassetto</b>` diventa grassetto vero,
 * i tag spariscono), e la virgoletta doppia chiuderebbe la stringa Mermaid.
 *
 * **L'ordine conta, due volte:**
 * 1. `&` va escapato per primo. Se un utente scrive già `&lt;` come testo letterale e si escapasse
 *    prima `<`, l'output sarebbe indistinguibile da un `<` vero appena escapato — Mermaid
 *    decodificherebbe la sua stessa entità e il testo dell'utente ne uscirebbe alterato.
 *    Escapando `&` per primo, `&lt;` diventa `#amp;lt;`, che rende `&lt;` letterale: esatto.
 * 2. L'a capo vero diventa `<br>` **dopo** le altre sostituzioni, non prima: il tag `<br>` che
 *    emettiamo noi non deve subire la nostra stessa escape di `<`/`>`, altrimenti uscirebbe
 *    `#lt;br#gt;` e non andrebbe più a capo. `\n` letterale (la vecchia scelta) è scartato: reso
 *    da mermaid@11 come backslash-n visibile, non come a capo.
 */
function noteText(text: string): string {
  return text
    .replaceAll("&", "#amp;")
    .replaceAll("<", "#lt;")
    .replaceAll(">", "#gt;")
    .replaceAll('"', "#quot;")
    .replaceAll("\n", "<br>")
}

/**
 * Il blocco `class Nome { ... }`: stereotipo (se annotato) poi attributi poi metodi. `node.name`
 * (il nome grezzo del modello, non `name` già sanificato) qualifica i membri negli avvisi: è quello
 * che l'utente riconosce nel proprio diagramma.
 */
function classBlock(node: ClassNode, name: string, unbalanced: string[], braced: string[], nested: string[]): string[] {
  const lines = [`  class ${name} {`]
  const annotation = STEREOTYPE_ANNOTATION[node.stereotype]
  if (annotation) lines.push(`    <<${annotation}>>`)
  for (const a of node.attributes) lines.push(`    ${attributeLine(a, node.name, unbalanced, braced, nested)}`)
  for (const m of node.methods) lines.push(`    ${methodLine(m, node.name, unbalanced, braced, nested)}`)
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
  const unbalanced: string[] = []
  const braced: string[] = []
  const nested: string[] = []
  const out = ["classDiagram"]

  for (const key of Object.keys(model.relations).sort()) {
    out.push(relationLine(model.relations[key]!, renamed))
  }

  for (const key of Object.keys(model.classes).sort()) {
    const node = model.classes[key]!
    out.push(...classBlock(node, safeName(key, renamed), unbalanced, braced, nested))
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
  if (unbalanced.length > 0) {
    warnings.push(`${unbalanced.length} tipi hanno parentesi angolari sbilanciate e sono usciti com'erano: ${unbalanced.join(", ")}`)
  }
  if (braced.length > 0) {
    warnings.push(`${braced.length} tipi contenevano graffe, rimosse perché fanno fallire il parsing dell'intero diagramma: ${braced.join(", ")}`)
  }
  if (nested.length > 0) {
    warnings.push(`${nested.length} tipi hanno generici annidati, non rappresentabili in Mermaid: restano nella forma a tilde ma potrebbero rendere in modo scorretto: ${nested.join(", ")}`)
  }

  return { text: `${out.join("\n")}\n`, warnings }
}
