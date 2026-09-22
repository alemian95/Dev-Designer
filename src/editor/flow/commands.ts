import { LANE_MIN_H, type FlowModel, type FlowShape } from "@/model/flow/schema"
import type { Recipe } from "../document-store"
import { flowDiagram } from "../flow-access"
import { snap, type Point } from "../geometry"

const DUPLICATE_OFFSET = 20

/**
 * Nuovo nodo vuoto. La chiave è un uuid e non un nome unico come `uniqueKey` (er.ts): un nodo di
 * flowchart non ha un nome che la identifichi, solo un'etichetta libera che cambia a ogni battitura.
 */
export function addFlowNode(at: Point, shape: FlowShape, lane: string): { key: string; recipe: Recipe } {
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      const d = flowDiagram(draft)
      d.model.nodes[key] = { label: "", shape, lane }
      d.view.nodes[key] = { x: snap(at.x), y: snap(at.y), collapsed: false }
    },
  }
}

/**
 * `null` solo quando un estremo non esiste. Due archi fra la stessa coppia sono ammessi di
 * proposito: sono i due rami di una decisione ("sì"/"no"), non un doppione da respingere come fa
 * `addNoteLink` (class/commands.ts) per due note identiche.
 */
export function addFlowEdge(model: FlowModel, source: string, target: string): { key: string; recipe: Recipe } | null {
  if (!(source in model.nodes) || !(target in model.nodes)) return null
  const key = crypto.randomUUID()
  return {
    key,
    recipe: (draft) => {
      flowDiagram(draft).model.edges[key] = { source, target, label: "" }
    },
  }
}

export function setNodeLabel(key: string, label: string): Recipe {
  return (draft) => {
    const node = flowDiagram(draft).model.nodes[key]
    // Si scrive solo se cambia davvero: riaprire e richiudere l'editor di testo senza toccare
    // nulla lascerebbe altrimenti una voce di undo fantasma.
    if (node && node.label !== label) node.label = label
  }
}

export function setNodeShape(key: string, shape: FlowShape): Recipe {
  return (draft) => {
    const node = flowDiagram(draft).model.nodes[key]
    if (node && node.shape !== shape) node.shape = shape
  }
}

export function setEdgeLabel(key: string, label: string): Recipe {
  return (draft) => {
    const edge = flowDiagram(draft).model.edges[key]
    if (edge && edge.label !== label) edge.label = label
  }
}

export function deleteFlowItems(nodeKeys: readonly string[], edgeKeys: readonly string[]): Recipe | null {
  if (nodeKeys.length === 0 && edgeKeys.length === 0) return null
  const nodes = new Set(nodeKeys)
  return (draft) => {
    const d = flowDiagram(draft)
    for (const key of edgeKeys) delete d.model.edges[key]
    for (const [key, edge] of Object.entries(d.model.edges)) {
      if (nodes.has(edge.source) || nodes.has(edge.target)) delete d.model.edges[key]
    }
    for (const key of nodeKeys) {
      delete d.model.nodes[key]
      delete d.view.nodes[key]
    }
  }
}

/** Copia i nodi con un uuid nuovo ciascuno e li lascia nella stessa corsia; gli archi non si duplicano. */
export function duplicateFlowNodes(model: FlowModel, keys: readonly string[]): { keys: string[]; recipe: Recipe } {
  const plan = keys.filter((k) => k in model.nodes).map((from) => ({ from, to: crypto.randomUUID() }))
  return {
    keys: plan.map((p) => p.to),
    recipe: (draft) => {
      const d = flowDiagram(draft)
      for (const { from, to } of plan) {
        const node = d.model.nodes[from]
        const view = d.view.nodes[from]
        if (!node) continue
        d.model.nodes[to] = { ...node }
        d.view.nodes[to] = {
          x: (view?.x ?? 0) + DUPLICATE_OFFSET,
          y: (view?.y ?? 0) + DUPLICATE_OFFSET,
          collapsed: view?.collapsed ?? false,
        }
      }
    },
  }
}

/** Nuova corsia in coda, sotto l'ultima: `y` è la somma delle altezze esistenti, `h` è il minimo. */
export function addLane(name: string): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const id = crypto.randomUUID()
    const y = Object.values(d.view.lanes).reduce((sum, band) => sum + band.h, 0)
    d.model.lanes.push({ id, name })
    d.view.lanes[id] = { y, h: LANE_MIN_H }
  }
}

export function renameLane(id: string, name: string): Recipe {
  return (draft) => {
    const lane = flowDiagram(draft).model.lanes.find((l) => l.id === id)
    if (lane && lane.name !== name) lane.name = name
  }
}

/**
 * Cancella una corsia spostando i suoi nodi in `moveTo`, così l'invariante "ogni nodo ha una
 * corsia esistente" (`model/flow/schema.ts`) non si rompe mai. `null` quando `id === moveTo`: è il
 * solo modo — senza vedere il modello — di riconoscere sia il tentativo insensato di spostare i
 * nodi nella corsia che sta per sparire, sia il caso dell'ultima corsia rimasta, dove `moveTo` non
 * può che essere `id` perché non esiste nessun'altra corsia a cui puntare.
 */
export function deleteLane(id: string, moveTo: string): Recipe | null {
  if (id === moveTo) return null
  return (draft) => {
    const d = flowDiagram(draft)
    if (d.model.lanes.length <= 1) return
    const idx = d.model.lanes.findIndex((l) => l.id === id)
    if (idx < 0) return
    if (!d.model.lanes.some((l) => l.id === moveTo)) return
    d.model.lanes.splice(idx, 1)
    delete d.view.lanes[id]
    for (const node of Object.values(d.model.nodes)) {
      if (node.lane === id) node.lane = moveTo
    }
  }
}

export function moveLane(from: number, to: number): Recipe {
  return (draft) => {
    const lanes = flowDiagram(draft).model.lanes
    if (from === to || from < 0 || to < 0 || from >= lanes.length || to >= lanes.length) return
    const [item] = lanes.splice(from, 1)
    lanes.splice(to, 0, item!)
  }
}
