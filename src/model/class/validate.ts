import type { Issue } from "../issue"
import type { ClassMethod, ClassModel, ClassRelation } from "./schema"

/** Firma di un metodo per il confronto di duplicati: nome e *tipi* dei
 *  parametri, non i nomi. Un overload con parametri di tipo diverso è legale
 *  (§8); i nomi dei parametri non contano ai fini della firma. */
function methodSignature(m: ClassMethod): string {
  return `${m.name}(${m.parameters.map((p) => p.type).join(",")})`
}

/** Le relazioni su cui un ciclo è un difetto: generalizzazione e
 *  realizzazione. Le altre quattro (associazione, composizione, aggregazione,
 *  dipendenza) possono formare cicli senza problemi, come le FK nell'ER. */
function isHierarchyRelation(kind: ClassRelation["kind"]): boolean {
  return kind === "generalization" || kind === "realization"
}

/** Trova i cicli nel sottografo di generalizzazione/realizzazione con una DFS
 *  a tre stati (bianco/grigio/nero): un arco verso un nodo grigio è un ciclo,
 *  un arco verso un nodo nero è un nodo già chiuso per un'altra via (legittimo
 *  in un diamante). Un solo issue per ciclo trovato, non uno per arco. */
function findGeneralizationCycles(model: ClassModel): string[][] {
  const children = new Map<string, string[]>()
  for (const rel of Object.values(model.relations)) {
    if (!isHierarchyRelation(rel.kind)) continue
    if (!(rel.source.class in model.classes) || !(rel.target.class in model.classes)) continue
    const list = children.get(rel.source.class) ?? []
    list.push(rel.target.class)
    children.set(rel.source.class, list)
  }

  const color = new Map<string, "gray" | "black">()
  const cycles: string[][] = []
  const stack: string[] = []

  function visit(node: string): void {
    color.set(node, "gray")
    stack.push(node)
    for (const next of children.get(node) ?? []) {
      const state = color.get(next)
      if (state === "gray") {
        const start = stack.indexOf(next)
        cycles.push(stack.slice(start))
      } else if (state !== "black") {
        visit(next)
      }
    }
    stack.pop()
    color.set(node, "black")
  }

  for (const name of Object.keys(model.classes)) {
    if (!color.has(name)) visit(name)
  }

  return cycles
}

/** Validazione live del modello class diagram. Funzione pura: nessun accesso allo store. */
export function validateClass(model: ClassModel): Issue[] {
  const issues: Issue[] = []
  const byLowerName = new Map<string, string>()

  for (const [key, node] of Object.entries(model.classes)) {
    const lower = key.toLowerCase()
    const clash = byLowerName.get(lower)
    if (clash) {
      issues.push({ code: "class-name-clash", severity: "warning", node: key, message: `"${key}" e "${clash}" differiscono solo per maiuscole` })
    } else {
      byLowerName.set(lower, key)
    }

    const seenAttributes = new Set<string>()
    for (const a of node.attributes) {
      if (seenAttributes.has(a.name)) {
        issues.push({ code: "duplicate-member", severity: "error", node: key, message: `attributo "${a.name}" duplicato in "${key}"` })
      }
      seenAttributes.add(a.name)
    }

    const seenMethods = new Set<string>()
    for (const m of node.methods) {
      const signature = methodSignature(m)
      if (seenMethods.has(signature)) {
        issues.push({ code: "duplicate-member", severity: "error", node: key, message: `metodo "${m.name}" duplicato in "${key}"` })
      }
      seenMethods.add(signature)

      if (m.isAbstract && node.stereotype === "class") {
        issues.push({ code: "abstract-method-in-concrete-class", severity: "warning", node: key, message: `"${key}.${m.name}" è astratto ma "${key}" non lo è` })
      }
    }
  }

  for (const [key, rel] of Object.entries(model.relations)) {
    for (const end of [rel.source, rel.target]) {
      if (!(end.class in model.classes)) {
        issues.push({ code: "dangling-relation", severity: "error", edge: key, message: `relazione "${key}": classe "${end.class}" inesistente` })
      }
    }
  }

  for (const cycle of findGeneralizationCycles(model)) {
    issues.push({ code: "generalization-cycle", severity: "error", message: `ciclo di generalizzazione: ${cycle.join(" -> ")} -> ${cycle[0]}` })
  }

  return issues
}
