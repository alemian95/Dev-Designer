import { LANE_MARGIN, LANE_MIN_H, POOL_HEADER_W, POOL_MIN_W, type FlowNode } from "./flow/schema"
import { flowNodeSize } from "./flow/size"
import { SCHEMA_VERSION } from "./shared"

type RawDocument = Record<string, unknown>
export type Migration = (raw: RawDocument) => RawDocument

/**
 * 1 → 2: il class diagram guadagna `model.notes`, obbligatorio. Tocca **solo** i diagrammi di
 * tipo `class`: un ER non ha un `ClassModel` e aggiungergli il campo gli farebbe fallire lo schema.
 */
const addClassNotes: Migration = (raw) => {
  const diagram = raw.diagram
  if (diagram === null || typeof diagram !== "object") return raw
  const d = diagram as Record<string, unknown>
  if (d.type !== "class") return raw
  const model = d.model
  if (model === null || typeof model !== "object") return raw
  return { ...raw, diagram: { ...d, model: { ...(model as Record<string, unknown>), notes: {} } } }
}

/** L'id della corsia che la migrazione dà a una parte di flusso vuota: fisso, perché la migrazione è pura. */
const MIGRATED_LANE_ID = "corsia-1"

/**
 * 2 → 3: il diagramma di un tipo diventa la parte della sua famiglia, e le altre due nascono vuote.
 * Le parti vuote sono letterali e non chiamate a `createDocument`: la migrazione descrive il formato
 * della versione 3, e non deve cambiare se in futuro cambia il default di un documento nuovo.
 * Un `type` sconosciuto passa com'è, e il rifiuto lo dà lo schema.
 */
const unifyDiagram: Migration = (raw) => {
  const diagram = raw.diagram
  if (diagram === null || typeof diagram !== "object") return raw
  const { type, ...part } = diagram as Record<string, unknown>
  if (type !== "er" && type !== "class" && type !== "flow") return raw
  const parts: Record<string, unknown> = {
    er: { model: { entities: {}, relationships: {} }, view: { nodes: {} } },
    class: { model: { classes: {}, relations: {}, notes: {} }, view: { nodes: {} } },
    flow: {
      model: { lanes: [{ id: MIGRATED_LANE_ID, name: "Corsia 1" }], nodes: {}, edges: {} },
      view: { nodes: {}, lanes: { [MIGRATED_LANE_ID]: { y: 0, h: 160 } } },
    },
  }
  parts[type] = part
  return { ...raw, diagram: parts }
}

/** 3 → 4: il documento guadagna la parte dei collegamenti fra famiglie, vuota (spec 4a §3). */
const addLinks: Migration = (raw) => {
  const diagram = raw.diagram
  if (diagram === null || typeof diagram !== "object") return raw
  return { ...raw, diagram: { ...(diagram as Record<string, unknown>), links: {} } }
}

/**
 * 4 → 5: nessun cambiamento di forma. I tipi del flusso (spec 4b §3) allargano quello che un file può
 * contenere, e un file v4 è già un v5 valido. La versione sale perché un'app ferma alla 4 rifiuti un
 * file con i tipi nuovi dicendo che è più recente, invece che con un errore di schema.
 */
const sameShape: Migration = (raw) => raw

/** Il pool in cui la migrazione 5 → 6 raccoglie le corsie di un file v5: id fisso, perché la migrazione è pura. */
const MIGRATED_POOL_ID = "pool-1"

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v)

/**
 * L'estensione orizzontale delle bande di un file v5, come la calcolava `laneBandExtent` prima del
 * 2b: l'ingombro dei nodi più `LANE_MARGIN` per lato, con la larghezza minima delle bande (640, oggi
 * `POOL_MIN_W`). Serve solo qui: dal 2b la larghezza di un pool è un dato.
 */
function v5BandExtent(nodes: Record<string, FlowNode>, views: Record<string, { x: number }>): { x: number; w: number } {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (const [key, node] of Object.entries(nodes)) {
    const view = views[key]
    if (!view) continue
    minX = Math.min(minX, view.x)
    maxX = Math.max(maxX, view.x + flowNodeSize(node).w)
  }
  if (minX > maxX) return { x: -LANE_MARGIN, w: POOL_MIN_W }
  return { x: minX - LANE_MARGIN, w: Math.max(POOL_MIN_W, maxX - minX + 2 * LANE_MARGIN) }
}

/**
 * 5 → 6: le corsie entrano in un pool (spec 2b §4).
 *
 * - Una parte di flusso **senza nodi** perde le corsie: erano quella che `lanes.min(1)` imponeva.
 * - Una parte **con nodi** raccoglie le corsie nel pool `pool-1` «Pool 1», nello stesso ordine e con
 *   le stesse altezze. La `y` del pool è quella della prima banda; `x` e `w` sono quelle che le bande
 *   avevano, più la striscia a sinistra. Le bande del v5 sono impilate senza buchi (`restackLanes`),
 *   quindi ricavare la `y` dalle altezze dà le stesse bande. I nodi non si muovono.
 */
const lanesIntoPool: Migration = (raw) => {
  const diagram = raw.diagram
  if (!isObj(diagram) || !isObj(diagram.flow)) return raw
  const flow = diagram.flow
  if (!isObj(flow.model) || !isObj(flow.view)) return raw
  const { lanes, ...model } = flow.model
  const { lanes: bands, ...view } = flow.view
  const nodes = (isObj(model.nodes) ? model.nodes : {}) as Record<string, FlowNode>
  const nodeViews = (isObj(view.nodes) ? view.nodes : {}) as Record<string, { x: number }>
  const laneList = (Array.isArray(lanes) ? lanes : []) as { id: string; name: string }[]
  const bandMap = (isObj(bands) ? bands : {}) as Record<string, { y: number; h: number } | undefined>
  const pools: Obj = {}
  const poolViews: Obj = {}
  const laneViews: Obj = {}
  const first = laneList[0]
  if (Object.keys(nodes).length > 0 && first) {
    const extent = v5BandExtent(nodes, nodeViews)
    pools[MIGRATED_POOL_ID] = { name: "Pool 1", lanes: laneList }
    poolViews[MIGRATED_POOL_ID] = { x: extent.x - POOL_HEADER_W, y: bandMap[first.id]?.y ?? 0, w: extent.w + POOL_HEADER_W }
    for (const lane of laneList) laneViews[lane.id] = { h: bandMap[lane.id]?.h ?? LANE_MIN_H }
  }
  return {
    ...raw,
    diagram: { ...diagram, flow: { ...flow, model: { ...model, pools }, view: { ...view, pools: poolViews, lanes: laneViews } } },
  }
}

/** Il primo id libero fra le note già travasate: una nota di flusso che collide con una di classe prende un suffisso. */
function freeNoteId(key: string, taken: Obj): string {
  if (!(key in taken)) return key
  let n = 2
  while (`${key}_${n}` in taken) n++
  return `${key}_${n}`
}

/**
 * 6 → 7: le note diventano una famiglia (spec 3a §4).
 *
 * 1. **Le note di classe** tengono id, testo e posizione. L'àncora è la classe del loro `note-link`
 *    (il primo in ordine di chiave, se un file scritto a mano ne ha più d'uno). I `note-link`
 *    spariscono dalle relazioni.
 * 2. **Le note di flusso** (nodi con forma `note`) diventano note con l'etichetta come testo e la
 *    stessa posizione. L'àncora è l'altro capo del primo arco che le tocca, in ordine di id, purché
 *    non sia un'altra nota. Tutti gli archi che toccano una nota spariscono; l'appartenenza alla
 *    corsia si perde con il nodo. Gli archi in più non lasciano traccia: una migrazione non ha modo
 *    di avvisare (spec 3a §10).
 * 3. **Un id in conflitto** con una nota di classe fa prendere alla nota di flusso il primo suffisso
 *    libero: succede solo con file scritti a mano, gli id generati sono uuid.
 */
const notesIntoFamily: Migration = (raw) => {
  const diagram = raw.diagram
  if (!isObj(diagram)) return raw
  const notes: Obj = {}
  const views: Obj = {}
  let classPart = diagram.class
  let flowPart = diagram.flow

  if (isObj(classPart) && isObj(classPart.model) && isObj(classPart.view)) {
    const { notes: classNotes, ...model } = classPart.model
    const relations = isObj(model.relations) ? model.relations : {}
    const classViews = isObj(classPart.view.nodes) ? classPart.view.nodes : {}
    const anchorOf = new Map<string, string>()
    const keptRelations: Obj = {}
    for (const key of Object.keys(relations).sort()) {
      const rel = relations[key]
      if (!isObj(rel) || rel.kind !== "note-link") {
        keptRelations[key] = rel
        continue
      }
      const note = isObj(rel.source) ? rel.source.class : undefined
      const cls = isObj(rel.target) ? rel.target.class : undefined
      if (typeof note === "string" && typeof cls === "string" && !anchorOf.has(note)) anchorOf.set(note, cls)
    }
    const keptViews: Obj = { ...classViews }
    for (const [key, note] of Object.entries(isObj(classNotes) ? classNotes : {})) {
      const cls = anchorOf.get(key)
      notes[key] = { text: isObj(note) && typeof note.text === "string" ? note.text : "", anchor: cls === undefined ? null : `class/${cls}` }
      if (classViews[key] !== undefined) views[key] = classViews[key]
      delete keptViews[key]
    }
    classPart = { ...classPart, model: { ...model, relations: keptRelations }, view: { ...classPart.view, nodes: keptViews } }
  }

  if (isObj(flowPart) && isObj(flowPart.model) && isObj(flowPart.view)) {
    const nodes = isObj(flowPart.model.nodes) ? flowPart.model.nodes : {}
    const edges = isObj(flowPart.model.edges) ? flowPart.model.edges : {}
    const flowViews = isObj(flowPart.view.nodes) ? flowPart.view.nodes : {}
    const isNote = (key: unknown): key is string => typeof key === "string" && isObj(nodes[key]) && (nodes[key] as Obj).shape === "note"
    const anchorOf = new Map<string, string>()
    const keptEdges: Obj = {}
    for (const key of Object.keys(edges).sort()) {
      const edge = edges[key]
      const source = isObj(edge) ? edge.source : undefined
      const target = isObj(edge) ? edge.target : undefined
      if (!isNote(source) && !isNote(target)) {
        keptEdges[key] = edge
        continue
      }
      if (isNote(source) && !isNote(target) && typeof target === "string" && !anchorOf.has(source)) anchorOf.set(source, target)
      if (isNote(target) && !isNote(source) && typeof source === "string" && !anchorOf.has(target)) anchorOf.set(target, source)
    }
    const keptNodes: Obj = {}
    const keptViews: Obj = {}
    for (const key of Object.keys(nodes).sort()) {
      if (!isNote(key)) {
        keptNodes[key] = nodes[key]
        if (flowViews[key] !== undefined) keptViews[key] = flowViews[key]
        continue
      }
      const node = nodes[key] as Obj
      const id = freeNoteId(key, notes)
      const other = anchorOf.get(key)
      notes[id] = { text: typeof node.label === "string" ? node.label : "", anchor: other === undefined ? null : `flow/${other}` }
      if (flowViews[key] !== undefined) views[id] = flowViews[key]
    }
    flowPart = {
      ...flowPart,
      model: { ...flowPart.model, nodes: keptNodes, edges: keptEdges },
      view: { ...flowPart.view, nodes: keptViews },
    }
  }

  return { ...raw, diagram: { ...diagram, class: classPart, flow: flowPart, note: { model: { notes }, view: { nodes: views } } } }
}

/**
 * 7 → 8: il documento guadagna la parte delle forme, vuota (spec 3b §4). Il letterale, e non
 * `emptyShapeDiagram()`, per la stessa ragione di `unifyDiagram`: la migrazione descrive il formato
 * della versione 8, e non deve cambiare se in futuro cambia il default di un documento nuovo.
 */
const addShapes: Migration = (raw) => {
  const diagram = raw.diagram
  if (!isObj(diagram)) return raw
  return { ...raw, diagram: { ...diagram, shape: { model: { shapes: {}, arrows: {} }, view: { nodes: {} } } } }
}

/**
 * Tabella delle migrazioni indicizzata per versione di partenza:
 * `migrations.get(v)` porta un documento dalla versione v alla v+1.
 */
const migrations: ReadonlyMap<number, Migration> = new Map([
  [1, addClassNotes],
  [2, unifyDiagram],
  [3, addLinks],
  [4, sameShape],
  [5, lanesIntoPool],
  [6, notesIntoFamily],
  [7, addShapes],
])

export type MigrateResult = { ok: true; value: unknown } | { ok: false; error: string }

/** Applica in sequenza gli step (chiave = versione di partenza) fino a `target`. Non valida: lo fa zod dopo. */
export function runMigrations(
  raw: unknown,
  steps: ReadonlyMap<number, Migration>,
  target: number,
): MigrateResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "il documento deve essere un oggetto JSON" }
  }
  let doc = raw as RawDocument
  const version = doc.schemaVersion
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "schemaVersion mancante o non valida" }
  }
  if (version > target) {
    return { ok: false, error: `schemaVersion ${version} più recente di quella supportata (${target})` }
  }
  for (let v = version; v < target; v++) {
    const step = steps.get(v)
    if (!step) return { ok: false, error: `manca la migrazione dalla versione ${v}` }
    // Una migrazione presuppone la forma del file alla propria versione, ma non è lei a
    // validarla (lo fa zod dopo l'ultimo passo): un file corrotto o scritto a mano può avere una
    // forma diversa da quella attesa e far esplodere lo step (es. un nodo senza `label`). Un
    // errore qui è un file non valido, non un bug di questa funzione: si racconta come tale
    // invece di risalire come eccezione non gestita fino a chi ha chiamato `parseDocument`.
    try {
      doc = { ...step(doc), schemaVersion: v + 1 }
    } catch (e) {
      return { ok: false, error: `migrazione dalla versione ${v} fallita: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  return { ok: true, value: doc }
}

/**
 * Porta un documento grezzo (già JSON.parse) alla SCHEMA_VERSION corrente. Non valida: lo fa zod dopo.
 *
 * Non muta l'input, ma quando non c'è nessuna migrazione da applicare **restituisce l'input stesso**,
 * non una copia. Nessuna copia difensiva: l'unico chiamante (`parseDocument`) gli passa un oggetto
 * appena uscito da `JSON.parse`, che non condivide con nessuno, e ne consegna il risultato a zod, che
 * copia — chi mette le mani sul documento vede la copia di zod, mai questo alias. Un chiamante nuovo
 * che volesse mutare il risultato deve copiarselo.
 */
export function migrateDocument(raw: unknown): MigrateResult {
  return runMigrations(raw, migrations, SCHEMA_VERSION)
}
