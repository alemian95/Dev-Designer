import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { documentStore, type Recipe } from "@/editor/document-store"
import { familySelectedKeys, qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { addLane, deleteLane, moveLane, renameLane, renamePool, setEdgeLabel, setNodeLabel, setNodeLane, setNodeShape } from "@/editor/flow/commands"
import { poolIds } from "@/editor/flow/geometry"
import { sessionStore } from "@/editor/session-store"
import { FlowShapeSchema, nextName, type FlowModel, type Lane } from "@/model/flow/schema"
import { FLOW_SHAPE_LABEL, FLOW_SHAPES } from "@/ui/flow-shapes"
import { CommitInput } from "@/ui/panels/CommitInput"
import { CommitTextarea } from "@/ui/panels/CommitTextarea"

const dispatch = (recipe: Recipe | null) => {
  if (recipe) documentStore.getState().dispatch(recipe)
}

function FlowNodeProperties({ nodeKey: key }: { nodeKey: string }) {
  const node = useStore(documentStore, (s) => flowDiagram(s.doc).model.nodes[key])
  const flow = useStore(documentStore, (s) => flowDiagram(s.doc))
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
        {/* Alternativa da tastiera al trascinamento (spec 2b §7): «Nessuna» libera il nodo dove sta,
         *  una corsia ce lo porta. Le corsie sono raggruppate per pool, nell'ordine di disegno. */}
        <select
          id="flow-node-lane"
          value={node.lane ?? ""}
          onChange={(e) => dispatch(setNodeLane(key, e.target.value === "" ? null : e.target.value))}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Nessuna</option>
          {poolIds(flow).map((id) => {
            // `poolIds` viene dalle chiavi di `model.pools`: il pool c'è.
            const pool = flow.model.pools[id]!
            return (
              <optgroup key={id} label={pool.name}>
                {pool.lanes.map((lane) => (
                  <option key={lane.id} value={lane.id}>
                    {lane.name}
                  </option>
                ))}
              </optgroup>
            )
          })}
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

/** Il pannello di un pool selezionato (spec 2b §7): il nome, e sotto le sue corsie. */
function PoolProperties({ poolId }: { poolId: string }) {
  const pool = useStore(documentStore, (s) => flowDiagram(s.doc).model.pools[poolId])
  if (!pool) return null
  return (
    <div className="flex flex-col">
      <div className="grid gap-1 p-3 pb-0">
        <Label htmlFor="pool-name">Nome</Label>
        <CommitInput key={pool.name} id="pool-name" value={pool.name} onCommit={(name) => dispatch(renamePool(poolId, name))} />
      </div>
      <PoolLanes poolId={poolId} />
    </div>
  )
}

/**
 * Corpo del pannello proprietà per il flowchart quando la selezione è esattamente un nodo o
 * esattamente un arco — stessa forma di `ClassProperties`/`kinds/er.tsx`: la cornice
 * (`PropertiesPanel`) garantisce che sia l'uno o l'altro, qui basta distinguere quale.
 *
 * Nodi e pool condividono lo spazio di chiavi di selezione: una chiave selezionata si distingue
 * guardando in quale dei due record del modello compare, come fa `ClassProperties` per classi e note.
 */
export function FlowProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const nodes = familySelectedKeys(selection, "node", "flow")
  const key = nodes.length === 1 ? nodes[0]! : undefined
  const isPool = useStore(documentStore, (s) => key !== undefined && key in flowDiagram(s.doc).model.pools)
  if (key !== undefined) return isPool ? <PoolProperties key={key} poolId={key} /> : <FlowNodeProperties key={key} nodeKey={key} />
  const edges = familySelectedKeys(selection, "edge", "flow")
  return <FlowEdgeProperties key={edges[0]} edgeKey={edges[0]!} />
}

function nodeCountByLane(nodes: Readonly<Record<string, { lane: string | null }>>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of Object.values(nodes)) {
    if (node.lane !== null) counts.set(node.lane, (counts.get(node.lane) ?? 0) + 1)
  }
  return counts
}

/**
 * Riga di una corsia: nome, ordine, elimina. **L'eliminazione dell'ultima corsia del pool è
 * disabilitata** — lo decide `deleteLane` stesso (`canDelete`), non una copia della regola qui (SSOT).
 *
 * **Una corsia con dentro dei nodi chiede in quale spostarli** prima di eliminarla: il click su
 * «elimina» apre un select inline con le altre corsie dello stesso pool. Una corsia vuota si elimina
 * subito.
 */
function LaneRow({ model, poolId, lane, index, nodeCount }: { model: FlowModel; poolId: string; lane: Lane; index: number; nodeCount: number }) {
  const lanes = model.pools[poolId]?.lanes ?? []
  const others = lanes.filter((l) => l.id !== lane.id)
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
          <Button variant="ghost" size="icon" className="size-6" disabled={index === 0} aria-label={`Sposta su ${lane.name}`} onClick={() => dispatch(moveLane(poolId, index, index - 1))}><ArrowUp /></Button>
          <Button variant="ghost" size="icon" className="size-6" disabled={index === lanes.length - 1} aria-label={`Sposta giù ${lane.name}`} onClick={() => dispatch(moveLane(poolId, index, index + 1))}><ArrowDown /></Button>
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
 * Le corsie di un pool (spec 2b §7): rinomina, aggiungi, elimina e ordine — l'unico posto della UI che
 * gestisce le corsie come oggetti a sé. La monta il pannello del pool, sotto il nome.
 */
export function PoolLanes({ poolId }: { poolId: string }) {
  const model = useStore(documentStore, (s) => flowDiagram(s.doc).model)
  const pool = model.pools[poolId]
  if (!pool) return null
  const counts = nodeCountByLane(model.nodes)
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        {/* Titolo di sezione, non un'etichetta di campo: un `<Label>` senza `htmlFor` non è associato a
         *  nessun controllo. `IssuesPanel.tsx` titola il proprio pannello con un `<h2>` per lo stesso motivo. */}
        <h2 className="text-xs font-semibold uppercase text-muted-foreground">Corsie</h2>
        <Button variant="outline" size="sm" onClick={() => dispatch(addLane(poolId, nextName("Corsia", pool.lanes)))}><Plus /> Aggiungi</Button>
      </div>
      <ul className="flex flex-col gap-2">
        {pool.lanes.map((lane, index) => (
          <LaneRow key={lane.id} model={model} poolId={poolId} lane={lane} index={index} nodeCount={counts.get(lane.id) ?? 0} />
        ))}
      </ul>
    </div>
  )
}
