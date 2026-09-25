import { LANE_MIN_H, type FlowDiagram, type FlowModel, type FlowShape } from "@/model/flow/schema"
import type { LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import { flowDiagram } from "../flow-access"
import { snap, type Point } from "../geometry"
import { flowNodeSize, laneAt, laneRect, poolLaneRects } from "./geometry"
import { keepInSpan, placeInLanes } from "./layout"

const DUPLICATE_OFFSET = 20

/**
 * Nuovo nodo vuoto, nella corsia data o libero con `null`. La chiave è un uuid e non un nome unico
 * come `uniqueKey` (er.ts): un nodo di flowchart non ha un nome che la identifichi.
 */
export function addFlowNode(at: Point, shape: FlowShape, lane: string | null): { key: string; recipe: Recipe } {
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
 * Sposta i nodi come `moveNodes` (`commands/view.ts`) — stesso `snap`, stessa regola «niente si
 * muove» con `dx` e `dy` entrambi zero — e poi decide la corsia dal **centro** di ognuno: la corsia
 * in cui cade, o `null` se cade fuori da ogni pool o sulla striscia (spec 2b §5). Posizione e
 * corsia stanno nella stessa recipe: un solo passo di annulla. Un nodo non viene più trattenuto in
 * una banda: uscire da un pool lo libera.
 */
export function moveFlowNodes(keys: readonly string[], dx: number, dy: number): Recipe | null {
  if (dx === 0 && dy === 0) return null
  return (draft) => {
    const d = flowDiagram(draft)
    for (const key of keys) {
      const node = d.model.nodes[key]
      const view = d.view.nodes[key]
      if (!node || !view) continue
      view.x = snap(view.x + dx)
      view.y = snap(view.y + dy)
      const { w, h } = flowNodeSize(node)
      node.lane = laneAt(d, { x: view.x + w / 2, y: view.y + h / 2 })
    }
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

/**
 * Riporta un nodo dentro la sua corsia, su entrambi gli assi, con `keepInSpan`: l'unico punto dei
 * comandi che lo fa, usato dove un comando può lasciare un nodo a cavallo del bordo (un cambio di
 * forma che lo allarga, una copia spostata dall'offset, una corsia cancellata). Un nodo libero non
 * ha niente in cui rientrare.
 */
function keepInLane(d: FlowDiagram, key: string): void {
  const node = d.model.nodes[key]
  const view = d.view.nodes[key]
  if (!node || !view || node.lane === null) return
  const rect = laneRect(d, node.lane)
  if (!rect) return
  const { w, h } = flowNodeSize(node)
  view.x = keepInSpan(rect.x, rect.w, w, view.x)
  view.y = keepInSpan(rect.y, rect.h, h, view.y)
}

/**
 * Cambia la forma di un nodo. Una `decision` è circa il doppio del rettangolo omologo
 * (`DECISION_FACTOR`): il cambio può allargare il nodo abbastanza da farlo uscire dalla corsia,
 * quindi rientra con `keepInLane`.
 */
export function setNodeShape(key: string, shape: FlowShape): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const node = d.model.nodes[key]
    if (!node || node.shape === shape) return
    node.shape = shape
    keepInLane(d, key)
  }
}

/**
 * Cambia la corsia di un nodo dal pannello — l'alternativa da tastiera al trascinamento (spec 2b §7).
 * Con `null` il nodo diventa libero e resta dov'è. Con una corsia ci entra: la `y` al centro della
 * corsia, e la `x` solo se il nodo sta fuori dalla corsia in orizzontale — per esempio quando passa
 * da libero, o da un altro pool. Entrambe rientrano nei margini con `keepInSpan`.
 */
export function setNodeLane(key: string, laneId: string | null): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const node = d.model.nodes[key]
    const view = d.view.nodes[key]
    if (!node || !view || node.lane === laneId) return
    if (laneId === null) {
      node.lane = null
      return
    }
    const rect = laneRect(d, laneId)
    if (!rect) return
    node.lane = laneId
    const { w, h } = flowNodeSize(node)
    view.y = keepInSpan(rect.y, rect.h, h, rect.y + rect.h / 2 - h / 2)
    view.x = keepInSpan(rect.x, rect.w, w, view.x)
  }
}

/**
 * Scarta gli spazi ai margini: è una regola di dominio, non solo cosmetica — un'etichetta di soli
 * spazi non è "vuota" per `===` (`model/flow/validate.ts`, `flow-branch-unlabeled` confronta
 * `edge.label === ""`) e zittirebbe l'avviso in silenzio.
 */
export function setEdgeLabel(key: string, label: string): Recipe {
  return (draft) => {
    const edge = flowDiagram(draft).model.edges[key]
    const trimmed = label.trim()
    if (edge && edge.label !== trimmed) edge.label = trimmed
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

/**
 * Copia i nodi con un uuid nuovo ciascuno, nella stessa corsia dell'originale (o liberi, come lui);
 * gli archi non si duplicano. `DUPLICATE_OFFSET` può spingere la copia oltre il bordo della corsia,
 * quindi rientra con `keepInLane`.
 */
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
        keepInLane(d, to)
      }
    },
  }
}

/**
 * Esegue `mutate` sulle corsie del pool e poi trasla i nodi di ogni corsia di quanto è cambiata la
 * sua `y`. La `y` di una corsia non è un dato ma una conseguenza dell'ordine e delle altezze
 * (`laneRects`): quando una corsia sale o scende perché un'altra è stata spostata, cancellata o
 * ridimensionata, i suoi nodi la seguono dello stesso `delta`, senza essere riallineati né ricentrati
 * — la disposizione dentro la corsia è dell'utente. Senza questo resterebbero fermi, disegnati nella
 * corsia sbagliata, e il primo drag riscriverebbe la loro corsia su quella sbagliata.
 */
function keepNodesWithLanes(d: FlowDiagram, poolId: string, mutate: () => void): void {
  const before = new Map(poolLaneRects(d, poolId).map((r) => [r.id, r.y]))
  mutate()
  for (const rect of poolLaneRects(d, poolId)) {
    const old = before.get(rect.id)
    if (old === undefined || old === rect.y) continue
    for (const [key, node] of Object.entries(d.model.nodes)) {
      if (node.lane !== rect.id) continue
      const view = d.view.nodes[key]
      if (view) view.y = snap(view.y + rect.y - old)
    }
  }
}

/** Nuova corsia in fondo al pool, alta il minimo: le corsie sopra non si muovono, e nemmeno i loro nodi. */
export function addLane(poolId: string, name: string): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const pool = d.model.pools[poolId]
    if (!pool) return
    const id = crypto.randomUUID()
    pool.lanes.push({ id, name })
    d.view.lanes[id] = { h: LANE_MIN_H }
  }
}

export function renameLane(id: string, name: string): Recipe {
  return (draft) => {
    for (const pool of Object.values(flowDiagram(draft).model.pools)) {
      const lane = pool.lanes.find((l) => l.id === id)
      if (lane && lane.name !== name) lane.name = name
    }
  }
}

/**
 * Cancella una corsia spostando i suoi nodi in `moveTo`, che deve stare **nello stesso pool**:
 * l'ultima corsia di un pool non si cancella — si cancella il pool (spec 2b §5).
 *
 * Le guardie stanno fuori dalla recipe perché così il chiamante scopre «non si può» *prima* di
 * dispatchare, e può disabilitare il controllo nella UI. Le corsie sotto quella cancellata salgono con
 * i loro nodi (`keepNodesWithLanes`); i nodi spostati rientrano in `moveTo` con `keepInLane`, e
 * possono sovrapporsi a quelli che c'erano già — «Disponi» li risistema.
 */
export function deleteLane(model: FlowModel, id: string, moveTo: string): Recipe | null {
  if (id === moveTo) return null
  const entry = Object.entries(model.pools).find(([, pool]) => pool.lanes.some((l) => l.id === id))
  if (!entry) return null
  const [poolId, pool] = entry
  if (pool.lanes.length <= 1) return null
  if (!pool.lanes.some((l) => l.id === moveTo)) return null
  return (draft) => {
    const d = flowDiagram(draft)
    keepNodesWithLanes(d, poolId, () => {
      // ponytail: `!` non copre un'incognita — il pool l'ha trovato la guardia qui sopra, sullo stesso stato.
      const lanes = d.model.pools[poolId]!.lanes
      lanes.splice(
        lanes.findIndex((l) => l.id === id),
        1,
      )
      delete d.view.lanes[id]
    })
    for (const [key, node] of Object.entries(d.model.nodes)) {
      if (node.lane !== id) continue
      node.lane = moveTo
      keepInLane(d, key)
    }
  }
}

/** Sposta una corsia dentro il suo pool; le corsie che cambiano posto portano con sé i loro nodi. */
export function moveLane(poolId: string, from: number, to: number): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const lanes = d.model.pools[poolId]?.lanes
    if (!lanes || from === to || from < 0 || to < 0 || from >= lanes.length || to >= lanes.length) return
    keepNodesWithLanes(d, poolId, () => {
      const [item] = lanes.splice(from, 1)
      // ponytail: `!` non copre un'incognita — i bound sono controllati sopra, come fa
      // `moveAttribute` (commands/er.ts) per lo stesso motivo.
      lanes.splice(to, 0, item!)
    })
  }
}

/**
 * Posizioni, pool e altezze delle corsie in **una sola** recipe: più dispatch darebbero più passi di
 * undo per un gesto solo. `placeInLanes` è la funzione pura che fa il lavoro; qui si scrive il
 * risultato nel documento.
 */
export function applyFlowLayout(positions: LayoutPositions): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const placed = placeInLanes(d, positions)
    for (const [key, p] of Object.entries(placed.positions)) {
      const view = d.view.nodes[key]
      if (view) {
        view.x = p.x
        view.y = p.y
      }
    }
    d.view.pools = placed.pools
    d.view.lanes = placed.lanes
  }
}
