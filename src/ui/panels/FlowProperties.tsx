import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { addLane, deleteLane, moveLane, renameLane, setEdgeLabel, setNodeLabel, setNodeLane, setNodeShape } from "@/editor/flow/commands"
import { sessionStore } from "@/editor/session-store"
import { FlowShapeSchema, nextLaneName, type FlowModel } from "@/model/flow/schema"
import { FLOW_SHAPE_LABEL, FLOW_SHAPES } from "@/ui/flow-shapes"
import { CommitInput } from "@/ui/panels/CommitInput"
import { CommitTextarea } from "@/ui/panels/CommitTextarea"

const dispatch = (recipe: Recipe | null) => {
  if (recipe) documentStore.getState().dispatch(recipe)
}

function FlowNodeProperties({ nodeKey: key }: { nodeKey: string }) {
  const node = useStore(documentStore, (s) => flowDiagram(s.doc).model.nodes[key])
  const lanes = useStore(documentStore, useShallow((s) => flowDiagram(s.doc).model.lanes))
  // Come `NoteProperties` (`ClassProperties.tsx`): finché il doppio click ha aperto `FlowNodeEditor`
  // su *questo* nodo, il campo qui va in sola lettura — l'editor sul canvas è quello che l'utente
  // sta guardando, due campi modificabili per lo stesso dato divergerebbero.
  const editingHere = useStore(sessionStore, (s) => s.editing?.key === qualify("flow", key) && s.editing.target === "body")
  if (!node) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-1">
        <Label htmlFor="flow-node-label">Etichetta</Label>
        {/* `CommitTextarea`, non `CommitInput`: l'etichetta di un nodo è multiriga per costruzione
         *  (`FlowNode.tsx` la spezza su `\n`, `flowNodeSize` la misura su quelle righe). Un
         *  `<input>` a una riga sanitizza gli a capo fuori dal valore appena l'utente lo tocca —
         *  perdita silenziosa di dati, non solo estetica. Stessa forma di `NoteProperties`. */}
        <CommitTextarea
          id="flow-node-label"
          key={node.label}
          value={node.label}
          readOnly={editingHere}
          onCommit={(text) => dispatch(setNodeLabel(key, text))}
          className="min-h-16 resize-none rounded-md border bg-background p-2 text-sm read-only:opacity-50"
        />
        {editingHere && <p className="text-xs text-muted-foreground">Modifica in corso sul canvas.</p>}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="flow-node-shape">Forma</Label>
        {/* La forma resta modificabile dopo la creazione: è così che si corregge un processo che
         *  doveva essere una decisione, senza doverlo ridisegnare (spec §11). */}
        <select
          id="flow-node-shape"
          value={node.shape}
          onChange={(e) => dispatch(setNodeShape(key, FlowShapeSchema.parse(e.target.value)))}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {FLOW_SHAPES.map((shape) => <option key={shape} value={shape}>{FLOW_SHAPE_LABEL[shape]}</option>)}
        </select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="flow-node-lane">Corsia</Label>
        {/* Alternativa da tastiera al trascinamento fra corsie (spec §11): stesso dato di
         *  `node.lane`, un'altra via per scriverlo. */}
        <select
          id="flow-node-lane"
          value={node.lane}
          onChange={(e) => dispatch(setNodeLane(key, e.target.value))}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {lanes.map((lane) => <option key={lane.id} value={lane.id}>{lane.name}</option>)}
        </select>
      </div>
    </div>
  )
}

function FlowEdgeProperties({ edgeKey: key }: { edgeKey: string }) {
  const edge = useStore(documentStore, (s) => flowDiagram(s.doc).model.edges[key])
  if (!edge) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-1">
        <Label htmlFor="flow-edge-label">Etichetta</Label>
        <CommitInput key={edge.label} id="flow-edge-label" value={edge.label} onCommit={(label) => dispatch(setEdgeLabel(key, label))} />
      </div>
    </div>
  )
}

/**
 * Corpo del pannello proprietà per il flowchart quando la selezione è esattamente un nodo o
 * esattamente un arco — stessa forma di `ClassProperties`/`kinds/er.tsx`: la cornice
 * (`PropertiesPanel`) garantisce che sia l'uno o l'altro, qui basta distinguere quale.
 * Il terzo caso, nessuna selezione, non passa da qui: è `FlowLanesPanel`, montato da
 * `PropertiesPanel` quando il flusso ha nodi — un nodo o un arco da passare qui non c'è.
 */
export function FlowProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const nodes = familySelectedKeys(selection, "node", "flow")
  if (nodes.length === 1) return <FlowNodeProperties key={nodes[0]} nodeKey={nodes[0]!} />
  const edges = familySelectedKeys(selection, "edge", "flow")
  return <FlowEdgeProperties key={edges[0]} edgeKey={edges[0]!} />
}

function nodeCountByLane(nodes: Readonly<Record<string, { lane: string }>>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of Object.values(nodes)) counts.set(node.lane, (counts.get(node.lane) ?? 0) + 1)
  return counts
}

/**
 * Riga di una corsia: nome, ordine, elimina. **L'eliminazione dell'ultima corsia è disabilitata**
 * — si usa `deleteLane` stesso per deciderlo (`canDelete`), non se ne reimplementa la regola qui
 * (SSOT): una `moveTo` candidata qualunque, la prima corsia diversa da questa, e se anche con
 * quella `deleteLane` torna `null` non c'è nessuna eliminazione possibile.
 *
 * **Una corsia con dentro dei nodi chiede in quale spostarli** prima di eliminarla (spec §11): il
 * click su «elimina» apre un select inline invece di dispatchare subito. Una corsia vuota non ha
 * niente da spostare e si elimina subito, nella prima corsia diversa da questa.
 */
function LaneRow({ model, lane, index, nodeCount }: { model: FlowModel; lane: FlowModel["lanes"][number]; index: number; nodeCount: number }) {
  const others = model.lanes.filter((l) => l.id !== lane.id)
  const firstOther = others[0]
  const canDelete = firstOther !== undefined && deleteLane(model, lane.id, firstOther.id) !== null
  const [moveTo, setMoveTo] = useState<string | null>(null)

  const startDelete = () => {
    if (!canDelete || !firstOther) return
    if (nodeCount === 0) {
      dispatch(deleteLane(model, lane.id, firstOther.id))
      return
    }
    setMoveTo(firstOther.id)
  }
  const confirmDelete = () => {
    if (moveTo) dispatch(deleteLane(model, lane.id, moveTo))
    setMoveTo(null)
  }

  return (
    <li className="flex flex-col gap-1 rounded border p-2">
      <div className="flex items-center gap-1">
        <CommitInput key={lane.name} value={lane.name} aria-label={`Nome corsia ${index + 1}`} onCommit={(name) => dispatch(renameLane(lane.id, name))} className="h-7 text-xs" />
        <span className="ml-auto flex">
          <Button variant="ghost" size="icon" className="size-6" disabled={index === 0} aria-label={`Sposta su ${lane.name}`} onClick={() => dispatch(moveLane(index, index - 1))}><ArrowUp /></Button>
          <Button variant="ghost" size="icon" className="size-6" disabled={index === model.lanes.length - 1} aria-label={`Sposta giù ${lane.name}`} onClick={() => dispatch(moveLane(index, index + 1))}><ArrowDown /></Button>
          <Button variant="ghost" size="icon" className="size-6" disabled={!canDelete} aria-label={`Elimina corsia ${lane.name}`} onClick={startDelete}><Trash2 /></Button>
        </span>
      </div>
      {moveTo !== null && (
        <div className="flex items-center gap-1 text-xs">
          <span>Sposta {nodeCount} {nodeCount === 1 ? "nodo" : "nodi"} in</span>
          <select aria-label="Corsia di destinazione" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-6 rounded border bg-background px-1 text-xs">
            {others.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <Button size="xs" onClick={confirmDelete}>Elimina</Button>
          <Button size="xs" variant="ghost" onClick={() => setMoveTo(null)}>Annulla</Button>
        </div>
      )}
    </li>
  )
}


/**
 * Corpo del pannello proprietà per il flowchart **senza selezione** (spec §11): l'elenco delle
 * corsie, con rinomina, aggiungi, elimina e ordine — l'unico posto della UI che gestisce le
 * corsie come oggetti a sé, a differenza del pannello del nodo (sopra) che ne cambia solo
 * l'appartenenza di un nodo.
 */
export function FlowLanesPanel() {
  const model = useStore(documentStore, useShallow((s) => flowDiagram(s.doc).model))
  const counts = nodeCountByLane(model.nodes)
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        {/* Titolo di sezione, non un'etichetta di campo: `<Label>` di Radix è un `<label>` HTML e
         *  senza `htmlFor` non è associato a nessun controllo. `IssuesPanel.tsx` titola il proprio
         *  pannello con un `<h2>` per lo stesso motivo — stessa forma qui. */}
        <h2 className="text-xs font-semibold uppercase text-muted-foreground">Corsie</h2>
        <Button variant="outline" size="sm" onClick={() => dispatch(addLane(nextLaneName(model.lanes)))}><Plus /> Aggiungi</Button>
      </div>
      <ul className="flex flex-col gap-2">
        {model.lanes.map((lane, index) => (
          <LaneRow key={lane.id} model={model} lane={lane} index={index} nodeCount={counts.get(lane.id) ?? 0} />
        ))}
      </ul>
    </div>
  )
}
