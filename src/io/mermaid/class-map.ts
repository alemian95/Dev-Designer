import type { ParseWarning } from "@/io/ddl/schema"
import type { ClassEnd, ClassNode, ClassRelation, Stereotype, Visibility } from "@/model/class/schema"
import type { Note } from "@/model/note/schema"
import { aggregate, type Finding } from "./common"
import type { ClassAst, ClassAstRelation, ClassAstVisibility, ClassHead } from "./class-parse"

export interface ClassFragment {
  classes: Record<string, ClassNode>
  relations: ClassRelation[]
  /** Le note libere e quelle ancorate a una classe del frammento (`class/Nome`). Le chiavi le dà il comando. */
  notes: Note[]
  warnings: ParseWarning[]
}

type ClassMapCategory =
  | "label" | "generic" | "stereotype" | "annotations" | "abstractAttribute" | "duplicateAttribute" | "duplicateMethod"
  | "dotted" | "twoHeads" | "lollipop" | "danglingNote"

const MESSAGES: Record<ClassMapCategory, string> = {
  label: "Etichette delle classi scartate, il nome resta l'id",
  generic: "Parametri generici delle classi scartati",
  stereotype: "Stereotipi sconosciuti, letti come classe",
  annotations: "Più stereotipi sulla stessa classe, si tiene il primo",
  abstractAttribute: "«*» su un attributo scartato: solo i metodi sono astratti",
  duplicateAttribute: "Attributi ripetuti nella stessa classe, si tiene il primo",
  duplicateMethod: "Metodi con la stessa firma nella stessa classe, si tiene il primo",
  dotted: "Linee tratteggiate senza testa lette come associazioni",
  twoHeads: "Relazioni con due teste scartate",
  lollipop: "Interfacce lollipop scartate",
  danglingNote: "Note su una classe che non c'è, diventate libere",
}

const VISIBILITY: Record<ClassAstVisibility, Visibility> = { "+": "public", "-": "private", "#": "protected", "~": "package", "": "public" }

/** Gli stereotipi noti, senza distinzione fra maiuscole e minuscole (spec §4.2). */
const STEREOTYPE: Readonly<Record<string, Stereotype>> = {
  interface: "interface", abstract: "abstract", enumeration: "enum", enum: "enum",
}

/** La specie dalla testa e dalla linea (spec §4.2). `dependency` con la linea piena è un'associazione navigabile. */
function kindOf(head: ClassHead | null, dotted: boolean): Pick<ClassRelation, "kind" | "navigable"> {
  switch (head) {
    case "extension": return { kind: dotted ? "realization" : "generalization" }
    case "composition": return { kind: "composition" }
    case "aggregation": return { kind: "aggregation" }
    case "dependency": return dotted ? { kind: "dependency" } : { kind: "association", navigable: true }
    default: return { kind: "association" }
  }
}

/** La firma che distingue gli overload (spec §4.2): nome e tipi dei parametri. */
const signature = (m: { name: string; parameters: readonly { type: string }[] }): string => `${m.name}(${m.parameters.map((p) => p.type).join(",")})`

/**
 * Applica all'AST le regole della spec §4.2 e restituisce un frammento del modello delle classi,
 * con le note. Non vede il documento: sostituzione, chiavi e posizioni le decide il comando di
 * import. `text` serve solo a dire le righe negli avvisi.
 */
export function mapClass(ast: ClassAst, text: string): ClassFragment {
  const findings: Finding<ClassMapCategory>[] = []
  const classes: Record<string, ClassNode> = {}
  const annotations = new Map<string, string[]>()

  const ensure = (id: string): ClassNode => (classes[id] ??= { name: id, stereotype: "class", attributes: [], methods: [] })

  for (const decl of ast.classes) {
    const cls = ensure(decl.id)
    if (decl.label !== null) findings.push({ category: "label", at: decl.at, subject: decl.id })
    if (decl.generic !== null) findings.push({ category: "generic", at: decl.at, subject: `${decl.id}~${decl.generic}~` })
    for (const a of decl.annotations) annotations.set(decl.id, [...(annotations.get(decl.id) ?? []), a])
    for (const m of decl.members) {
      const subject = `${decl.id}.${m.name}`
      if (m.kind === "attribute") {
        if (m.isAbstract) findings.push({ category: "abstractAttribute", at: m.at, subject })
        if (cls.attributes.some((a) => a.name === m.name)) {
          findings.push({ category: "duplicateAttribute", at: m.at, subject })
          continue
        }
        cls.attributes.push({ name: m.name, type: m.type, visibility: VISIBILITY[m.visibility], isStatic: m.isStatic })
      } else {
        const sig = signature(m)
        if (cls.methods.some((x) => signature(x) === sig)) {
          findings.push({ category: "duplicateMethod", at: m.at, subject: `${decl.id}.${sig}` })
          continue
        }
        cls.methods.push({
          name: m.name, type: m.returnType, visibility: VISIBILITY[m.visibility], isStatic: m.isStatic, isAbstract: m.isAbstract,
          parameters: m.parameters.map((p) => ({ name: p.name, type: p.type })),
        })
      }
    }
  }

  for (const [id, list] of annotations) {
    const at = ast.classes.find((c) => c.id === id)!.at
    const stereotype = STEREOTYPE[list[0]!.toLowerCase()]
    if (stereotype === undefined) findings.push({ category: "stereotype", at, subject: `${id} «${list[0]}»` })
    if (list.length > 1) findings.push({ category: "annotations", at, subject: id })
    classes[id]!.stereotype = stereotype ?? "class"
  }

  const relations = ast.relations.flatMap((r: ClassAstRelation): ClassRelation[] => {
    ensure(r.left)
    ensure(r.right)
    if (r.leftHead === "lollipop" || r.rightHead === "lollipop") {
      findings.push({ category: "lollipop", at: r.at })
      return []
    }
    if (r.leftHead !== null && r.rightHead !== null) {
      findings.push({ category: "twoHeads", at: r.at })
      return []
    }
    if (r.leftHead === null && r.rightHead === null && r.dotted) findings.push({ category: "dotted", at: r.at })
    const left: ClassEnd = { class: r.left, multiplicity: r.leftMultiplicity ?? "", role: "" }
    const right: ClassEnd = { class: r.right, multiplicity: r.rightMultiplicity ?? "", role: "" }
    // Il lato con la testa è il `target`, comunque sia scritta la riga; senza teste, il verso del testo.
    const [source, target] = r.leftHead !== null ? [right, left] : [left, right]
    return [{ ...kindOf(r.leftHead ?? r.rightHead, r.dotted), ...(r.label === null ? {} : { name: r.label }), source, target }]
  })

  const notes = ast.notes.map((n): Note => {
    if (n.target === null) return { text: n.text, anchor: null }
    if (n.target in classes) return { text: n.text, anchor: `class/${n.target}` }
    findings.push({ category: "danglingNote", at: n.at, subject: n.target })
    return { text: n.text, anchor: null }
  })

  return { classes, relations, notes, warnings: aggregate(findings, text, MESSAGES) }
}
