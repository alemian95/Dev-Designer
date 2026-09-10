import { uniqueKey } from "@/editor/commands/er"
import type { Members } from "@/model/class/members"
import type { ClassDiagram, ClassModel, ClassNode, ClassRelation, Stereotype } from "@/model/class/schema"
import type { Recipe } from "../document-store"
import { classDiagram } from "../class-access"
import { snap, type Point } from "../geometry"
import type { LayoutEdge, LayoutGraph, LayoutNode } from "@/model/layout"
import { classSize } from "./geometry"

const DUPLICATE_OFFSET = 20

export function addClass(classes: Record<string, unknown>, at: Point): { key: string; recipe: Recipe } {
  const key = uniqueKey(classes, "class")
  return {
    key,
    recipe: (draft) => {
      const d = classDiagram(draft)
      d.model.classes[key] = { name: key, stereotype: "class", attributes: [], methods: [] }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

/**
 * Rinomina: qui la chiave **è** il nome (nessuna chiave composta come nell'ER), quindi
 * rinominare vuol dire ricreare la voce sotto un'altra chiave in `model.classes`, spostare
 * la view e riscrivere ogni estremo di relazione che nominava la vecchia chiave. `null` è
 * riservato al nome vuoto: una collisione si vede solo dentro la recipe, che esce senza
 * scrivere (dispatch torna `false`), esattamente come fa `renameEntity` (`commands/er.ts`).
 */
export function renameClass(key: string, name: string): Recipe | null {
  const newName = name.trim()
  if (!newName) return null
  return (draft) => {
    const d = classDiagram(draft)
    const cls = d.model.classes[key]
    if (!cls) return
    if (newName === key) {
      // Assegnare comunque produrrebbe una patch anche a valore identico: si scrive solo se cambia
      // davvero, o riaprire e richiudere un editor di nome lascerebbe una voce di undo fantasma.
      if (cls.name !== newName) cls.name = newName
      return
    }
    if (newName in d.model.classes) return
    const moved: ClassNode = { ...cls, name: newName }
    delete d.model.classes[key]
    d.model.classes[newName] = moved
    const view = d.view.nodes[key]
    if (view) {
      delete d.view.nodes[key]
      d.view.nodes[newName] = { ...view }
    }
    for (const rel of Object.values(d.model.relations)) {
      if (rel.source.class === key) rel.source.class = newName
      if (rel.target.class === key) rel.target.class = newName
    }
  }
}

export function setStereotype(key: string, stereotype: Stereotype): Recipe {
  return (draft) => {
    const cls = classDiagram(draft).model.classes[key]
    if (!cls) return
    if (cls.stereotype !== stereotype) cls.stereotype = stereotype
  }
}

/** Confronto strutturale: gli array di membri sono dati semplici (primitive + oggetti piatti),
 *  nessun ciclo, quindi il giro per JSON è corretto e più leggibile di un confronto scritto a mano. */
function membersEqual(a: Members, b: Members): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function setMembers(key: string, members: Members): Recipe {
  return (draft) => {
    const cls = classDiagram(draft).model.classes[key]
    if (!cls) return
    // Assegnare comunque produrrebbe una patch anche a contenuto identico, perché il nuovo array
    // non è la stessa referenza di quello nel draft: riaprire la textarea senza cambiare nulla
    // lascerebbe una voce di undo fantasma.
    if (membersEqual({ attributes: cls.attributes, methods: cls.methods }, members)) return
    cls.attributes = members.attributes
    cls.methods = members.methods
  }
}

export function addRelation(
  relations: Record<string, unknown>,
  source: string,
  target: string,
): { key: string; recipe: Recipe } {
  const key = uniqueKey(relations, `${source}_${target}`)
  return {
    key,
    recipe: (draft) => {
      classDiagram(draft).model.relations[key] = {
        kind: "association",
        source: { class: source, multiplicity: "", role: "" },
        target: { class: target, multiplicity: "", role: "" },
      }
    },
  }
}

export function updateRelation(key: string, mutate: (r: ClassRelation) => void): Recipe {
  return (draft) => {
    const rel = classDiagram(draft).model.relations[key]
    if (rel) mutate(rel)
  }
}

export function deleteClassItems(classKeys: readonly string[], relationKeys: readonly string[]): Recipe | null {
  if (classKeys.length === 0 && relationKeys.length === 0) return null
  const classes = new Set(classKeys)
  return (draft) => {
    const d = classDiagram(draft)
    for (const key of relationKeys) delete d.model.relations[key]
    for (const [key, rel] of Object.entries(d.model.relations)) {
      if (classes.has(rel.source.class) || classes.has(rel.target.class)) delete d.model.relations[key]
    }
    for (const key of classKeys) {
      delete d.model.classes[key]
      delete d.view.nodes[key]
    }
  }
}

/** Copia le classi con suffisso `_2`/`_3` di `uniqueKey`; le relazioni non si duplicano. */
export function duplicateClasses(model: ClassModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const taken: Record<string, true> = Object.fromEntries(Object.keys(model.classes).map((k) => [k, true]))
  const plan: { from: string; to: string }[] = []
  for (const from of keys) {
    if (!(from in model.classes)) continue
    const to = uniqueKey(taken, from)
    taken[to] = true
    plan.push({ from, to })
  }
  return {
    keys: plan.map((p) => p.to),
    recipe: (draft) => {
      const d = classDiagram(draft)
      for (const { from, to } of plan) {
        const cls = d.model.classes[from]
        const view = d.view.nodes[from]
        if (!cls) continue
        d.model.classes[to] = {
          ...cls,
          name: to,
          attributes: cls.attributes.map((a) => ({ ...a })),
          methods: cls.methods.map((m) => ({ ...m })),
        }
        d.view.nodes[to] = {
          x: (view?.x ?? 0) + DUPLICATE_OFFSET,
          y: (view?.y ?? 0) + DUPLICATE_OFFSET,
          collapsed: view?.collapsed ?? false,
        }
      }
    },
  }
}

/**
 * Traduce il diagramma di classi nel grafo da disporre. Stessa logica di `layoutGraph` per
 * l'ER (`commands/layout.ts`): le classi senza nodo nella view sono escluse, e le relazioni
 * con un estremo fuori dal grafo sono saltate — a ELK un arco senza uno dei due estremi fa
 * rifiutare l'intero grafo.
 */
export function classLayoutGraph(diagram: ClassDiagram): LayoutGraph {
  const nodes: LayoutNode[] = []
  for (const [key, cls] of Object.entries(diagram.model.classes)) {
    const view = diagram.view.nodes[key]
    if (view) nodes.push({ id: key, ...classSize(cls, view.collapsed) })
  }

  const present = new Set(nodes.map((n) => n.id))
  const edges: LayoutEdge[] = []
  for (const [key, rel] of Object.entries(diagram.model.relations)) {
    // Invertito rispetto al modello, esattamente come per l'ER: qui `source` è il figlio
    // (sottoclasse, implementatore, parte, dipendente) e `target` il padre. Con
    // `direction: DOWN` ELK mette la sorgente del grafo in alto, e la convenzione «padri in
    // alto» (ADR 0006) vuole i target in alto — quindi la sorgente del grafo è il `target` del modello.
    const source = rel.target.class
    const target = rel.source.class
    if (present.has(source) && present.has(target)) edges.push({ id: key, source, target })
  }

  return { nodes, edges }
}
