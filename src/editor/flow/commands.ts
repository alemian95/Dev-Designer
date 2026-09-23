import { LANE_MIN_H, type FlowDiagram, type FlowModel, type FlowShape } from "@/model/flow/schema"
import type { LayoutPositions } from "@/model/layout"
import type { Recipe } from "../document-store"
import { flowDiagram } from "../flow-access"
import { snap, type Point } from "../geometry"
import { flowNodeSize, laneAt } from "./geometry"
import { LANE_PAD, placeInLanes } from "./layout"

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
 * Sposta i nodi come `moveNodes` (`commands/view.ts`) — stesso `snap`, stesso invariante "niente
 * si muove" quando `dx`/`dy` sono entrambi zero — e in più guarda dove cade il **centro** di
 * ognuno dopo lo spostamento: se `laneAt` torna una banda diversa da quella di partenza, la scrive
 * nella stessa recipe, così posizione e corsia sono un solo passo di undo (spec §6).
 *
 * Se il centro cade fuori da ogni banda — sopra la prima o sotto l'ultima — la corsia di partenza
 * non si tocca: la scrive `laneAt` solo quando trova una banda, quindi qui basta non chiamarla.
 * La `y` però deve rientrare nella banda di partenza lo stesso, agganciata al bordo più vicino con
 * `LANE_PAD` di margine (`flow/layout.ts`, lo stesso usato per impilare le righe di `placeInLanes`
 * — un solo valore, non due che potrebbero divergere): un nodo fuori da ogni banda è uno stato che
 * il modello non ammette (il refine di `FlowModelSchema`), non un caso da sistemare a valle.
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

      const size = flowNodeSize(node)
      const centerY = view.y + size.h / 2
      const lane = laneAt(d, centerY)
      if (lane !== null) {
        node.lane = lane
        continue
      }

      // Fuori da ogni banda: `node.lane` non è cambiato in questo giro, quindi è ancora la corsia
      // di partenza — e per l'invariante dello schema esiste sempre in `model.lanes`. Se manca la
      // sua banda in `view.lanes` (non dovrebbe: le due mappe sono tenute allineate da
      // `restackLanes`) non c'è nulla a cui agganciare la y, quindi si lascia dov'è.
      const band = d.view.lanes[node.lane]
      if (!band) continue
      view.y = centerY < band.y ? snap(band.y + LANE_PAD) : snap(band.y + band.h - LANE_PAD - size.h)
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

/**
 * Ricalcola la `y` di ogni banda impilandole nell'ordine di `model.lanes`. La `y` non è un dato:
 * è una conseguenza dell'ordine dell'array e delle altezze, e tenerla per conto suo l'ha già fatta
 * divergere tre volte (una banda nuova sopra una esistente dopo una cancellazione, e l'ordine
 * sullo schermo diverso da quello dell'array dopo uno spostamento). Qui è calcolata in un posto
 * solo, e i tre comandi che toccano l'ordine o l'insieme delle corsie la richiamano.
 *
 * L'altezza **resta un dato**, non derivato: il layout del Task 5 può allargare una corsia per
 * farci stare le righe, e questa funzione la preserva leggendola da `view.lanes` invece di
 * riazzerarla al minimo.
 */
function restackLanes(d: FlowDiagram): void {
  let y = 0
  for (const lane of d.model.lanes) {
    const h = d.view.lanes[lane.id]?.h ?? LANE_MIN_H
    d.view.lanes[lane.id] = { y, h }
    y += h
  }
}

/** Nuova corsia in coda, sotto l'ultima: la `y` la assegna `restackLanes`, non un calcolo qui. */
export function addLane(name: string): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    d.model.lanes.push({ id: crypto.randomUUID(), name })
    restackLanes(d)
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
 * corsia esistente" (`model/flow/schema.ts`) non si rompe mai. Il predicato vero è **l'ultima
 * corsia**, non `id === moveTo`: quest'ultimo è solo il caso degenere in cui spostare i nodi
 * nella corsia che sta per sparire non avrebbe senso in ogni caso.
 *
 * Le tre guardie stanno qui e non dentro la recipe: non per evitare una voce di undo fantasma —
 * `document-store.ts` scarta già le recipe che non producono patch — ma perché così il chiamante
 * scopre "non si può" *prima* di dispatchare, e può disabilitare il controllo nella UI invece di
 * offrire un'azione che non fa niente. Per deciderle serve leggere il modello, esattamente come
 * fanno già `addFlowEdge` e `duplicateFlowNodes` — un comando che legge il modello lo riceve, non
 * lo indovina.
 */
export function deleteLane(model: FlowModel, id: string, moveTo: string): Recipe | null {
  if (model.lanes.length <= 1) return null
  if (id === moveTo) return null
  if (!model.lanes.some((l) => l.id === id)) return null
  if (!model.lanes.some((l) => l.id === moveTo)) return null
  return (draft) => {
    const d = flowDiagram(draft)
    d.model.lanes.splice(
      d.model.lanes.findIndex((l) => l.id === id),
      1,
    )
    delete d.view.lanes[id]
    for (const node of Object.values(d.model.nodes)) {
      if (node.lane === id) node.lane = moveTo
    }
    restackLanes(d)
  }
}

export function moveLane(from: number, to: number): Recipe {
  return (draft) => {
    const d = flowDiagram(draft)
    const lanes = d.model.lanes
    if (from === to || from < 0 || to < 0 || from >= lanes.length || to >= lanes.length) return
    const [item] = lanes.splice(from, 1)
    // ponytail: `!` non copre un'incognita — i bound sono controllati due righe sopra, come fa
    // `moveAttribute` (commands/er.ts:129) per lo stesso motivo.
    lanes.splice(to, 0, item!)
    restackLanes(d)
  }
}

/**
 * Posizioni e bande in **una sola** recipe: due dispatch darebbero due passi di undo per un
 * gesto solo (spec §5). `placeInLanes` è la funzione pura che fa il lavoro; qui si scrive il
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
    d.view.lanes = placed.lanes
  }
}
