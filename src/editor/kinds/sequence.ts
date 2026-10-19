import type { DevDocument } from "@/model/document"
import { splitSequenceKey, type Sequence } from "@/model/sequence/schema"
import { validateSequences } from "@/model/sequence/validate"
import { moveNodes } from "../commands/view"
import type { Recipe } from "../document-store"
import {
  addMessage, addSequence, deleteParticipant, deleteSequences, deleteSteps, duplicateSequences, moveParticipant, moveStep, stepDrop,
} from "../sequence/commands"
import { sequenceRect, subRect } from "../sequence/geometry"
import { ROOT, sequenceLayout } from "../sequence/layout"
import { sequenceDiagram } from "../sequence-access"
import type { DiagramOps } from "./ops"

/** Più recipe in una: un gesto, un solo annulla. `null` se non ce n'è nessuna. */
function combine(recipes: readonly (Recipe | null)[]): Recipe | null {
  const present = recipes.filter((r): r is Recipe => r !== null)
  if (present.length === 0) return null
  return (draft) => present.forEach((recipe) => recipe(draft))
}

/** L'indice della colonna il cui centro è più vicino a quello di `pid` spostato di `dx`. */
function nearestColumn(seq: Sequence, pid: string, dx: number): number | null {
  const l = sequenceLayout(seq)
  const from = l.columns[pid]
  if (!from) return null
  const x = from.x + dx
  const distances = seq.participants.map((p) => Math.abs((l.columns[p.id]?.x ?? Infinity) - x))
  return distances.indexOf(Math.min(...distances))
}

/**
 * `DiagramOps` per le sequenze. La chiave `<seq>/<sub>` (un partecipante, un passo, un blocco) è un
 * nodo per selezione, drag, `rectOf` e àncore, ma non sta in `nodeKeys`: niente selezione a riquadro,
 * niente Disponi. Un messaggio non è un arco di canvas: niente archi.
 */
export function sequenceOps(doc: DevDocument): DiagramOps {
  const diagram = () => sequenceDiagram(doc)
  const nodeKeys = () => Object.keys(diagram().view.nodes).filter((key) => diagram().model.sequences[key])

  /** Il gesto su un solo sotto-elemento: riordina il partecipante o sposta il passo. */
  const dragSub = (seqKey: string, sub: string, dx: number, dy: number): Recipe | null => {
    const seq = diagram().model.sequences[seqKey]
    if (!seq) return null
    if (seq.participants.some((p) => p.id === sub)) {
      const index = nearestColumn(seq, sub, dx)
      return index === null ? null : moveParticipant(seqKey, sub, index)
    }
    const slot = stepDrop(seq, sub, dy)
    return slot && moveStep(diagram().model, seqKey, sub, slot)
  }

  return {
    nodeKeys,

    // `<seq>` è la sequenza, `<seq>/<sub>` un suo sotto-elemento. `at` è sempre l'origine della
    // sequenza, anche per un sotto-elemento: il sotto-elemento si sposta con lei.
    rectOf: (key, at) => {
      const parts = splitSequenceKey(key)
      const seq = parts && diagram().model.sequences[parts.sequence]
      const view = parts && diagram().view.nodes[parts.sequence]
      if (!parts || !seq || !view) return null
      const origin = at ?? view
      return parts.participant === null ? sequenceRect(seq, { ...view, ...origin }) : subRect(seq, origin, parts.participant)
    },

    edgesTouching: () => [],
    edgeGeometry: () => null,

    refuseNode: () => null,

    addNode: (at) => ({ ...addSequence(at), edit: null }),

    // Collega fra due intestazioni della stessa sequenza: un messaggio in fondo, anche a sé stesso.
    addEdge: (source, target) => {
      const a = splitSequenceKey(source)
      const b = splitSequenceKey(target)
      const seq = a && diagram().model.sequences[a.sequence]
      const from = seq?.participants.find((p) => p.id === a?.participant)
      const to = seq?.participants.find((p) => p.id === b?.participant)
      if (!a || !b || !seq || !from || !to || a.sequence !== b.sequence) return null
      const created = addMessage(a.sequence, from.id, to.id, { container: ROOT, index: seq.steps.length })
      return { key: `${a.sequence}/${created.key}`, recipe: created.recipe }
    },

    // Con almeno una sequenza fra le chiavi si spostano solo le sequenze; un sotto-elemento da solo
    // si riordina. ponytail: più sotto-elementi insieme non fanno niente; servirà se il pannello
    // permetterà di trascinarne una selezione.
    commitDrag: (keys, dx, dy) => {
      const sequences = keys.filter((k) => splitSequenceKey(k)?.participant === null)
      if (sequences.length > 0) return moveNodes("sequence", sequences, dx, dy)
      const parts = keys.length === 1 && keys[0] !== undefined ? splitSequenceKey(keys[0]) : null
      return parts?.participant ? dragSub(parts.sequence, parts.participant, dx, dy) : null
    },

    // Le chiavi degli archi sono comprese: Collega seleziona il messaggio appena creato come arco.
    deleteItems: (nodeKeys, edgeKeys) =>
      combine(
        [...nodeKeys, ...edgeKeys].map((key) => {
          const parts = splitSequenceKey(key)
          const seq = parts && diagram().model.sequences[parts.sequence]
          if (!parts || !seq) return null
          if (parts.participant === null) return deleteSequences([parts.sequence])
          const pid = parts.participant
          return seq.participants.some((p) => p.id === pid) ? deleteParticipant(parts.sequence, pid) : deleteSteps(parts.sequence, [pid])
        }),
      ),

    duplicateNodes: (keys) => duplicateSequences(diagram().model, keys.filter((k) => splitSequenceKey(k)?.participant === null)),

    // L'interno non passa da ELK (spec §4.3): ogni sequenza è un blocco della misura che il contenuto le dà.
    layoutGraph: () => ({
      nodes: nodeKeys().flatMap((id) => {
        const seq = diagram().model.sequences[id]
        if (!seq) return []
        const { width, height } = sequenceLayout(seq, diagram().view.nodes[id])
        return [{ id, w: width, h: height }]
      }),
      edges: [],
      direction: "DOWN",
    }),

    validate: () => validateSequences(diagram().model),
  }
}
