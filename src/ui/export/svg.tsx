import { renderToStaticMarkup } from "react-dom/server"
import { opsFor } from "@/editor/kinds/ops"
import { edgeOffsets } from "@/editor/edge-routing"
import { FONT_SIZE, rectsBounds, type Rect } from "@/editor/geometry"
import { laneBandExtent } from "@/editor/flow/geometry"
import type { Diagram } from "@/model/document"
import { SCHEMA_VERSION } from "@/model/shared"
import { LanesLayerView } from "@/ui/canvas/LanesLayer"
import { viewFor } from "@/ui/canvas/kinds/registry"

/**
 * Margine attorno al contenuto, in unità mondo. I bounds vengono dai rettangoli delle entità:
 * il padding copre quello che sporge fuori, cioè la pancia delle auto-relazioni e le etichette
 * sui percorsi. Senza DOM non c'è `getBBox()` sui path, quindi è una costante e non un calcolo.
 */
export const EXPORT_PADDING = 60

export interface BuildSvgOptions {
  /** Le variabili CSS del canvas già risolte in valori letterali: fuori dall'app `var()` non esiste. */
  vars: Record<string, string>
  /** Regola `@font-face` col woff2 in base64. Assente: il file usa il monospace di chi lo apre. */
  fontFace?: string
}

/**
 * `opsFor` vuole un `DevDocument` intero, ma `erOps`/`classOps` (`@/editor/kinds/*.ts`) leggono
 * solo `.diagram`: nessuno dei due tocca `id`, `name` o `schemaVersion`. L'export non ha né gli
 * serve un documento intero: bastano segnaposto per i tre campi che `opsFor` non guarda.
 */
function opsForDiagram(diagram: Diagram) {
  return opsFor({ schemaVersion: SCHEMA_VERSION, id: "export", name: "export", diagram })
}

/** I nodi grezzi del modello, con nomi di campo diversi per tipo: vedi la nota sopra `buildSvg`. */
function nodeModelsOf(diagram: Diagram): Record<string, unknown> {
  switch (diagram.type) {
    case "er":
      return diagram.model.entities
    case "class":
      return { ...diagram.model.classes, ...diagram.model.notes }
    case "flow":
      return diagram.model.nodes
  }
}

/** Gli archi grezzi del modello, stessa ragione di `nodeModelsOf`. */
function edgeModelsOf(diagram: Diagram): Record<string, unknown> {
  switch (diagram.type) {
    case "er":
      return diagram.model.relationships
    case "class":
      return diagram.model.relations
    case "flow":
      return diagram.model.edges
  }
}

/**
 * Serializza il diagramma come SVG autoconsistente. Un renderer solo per entrambi i tipi di
 * diagramma, sopra la giuntura: `nodeKeys`/`rectOf`/`edgesTouching`/`edgeGeometry` di
 * `DiagramOps` (`@/editor/kinds/ops.ts`) danno chiavi, geometria e bounds senza sapere se il
 * modello si chiama `entities`/`classes` o `relationships`/`relations`; `NodeView`/`EdgeView` di
 * `DiagramView` (`@/ui/canvas/kinds`) sono le stesse viste pure che il canvas monta, guidate
 * dalle prop e non dallo store — `renderToStaticMarkup` costruisce l'albero fuori dal DOM di
 * React, in un contesto senza store da cui i layer sottoscritti potrebbero leggere.
 *
 * Resta un solo punto dove i nomi dei campi del modello contano — `nodeModelsOf`/`edgeModelsOf`
 * qui sopra — perché `DiagramOps` non espone i record grezzi (non è il suo lavoro: geometria e
 * comandi, non lettura del modello). `diagram.view.nodes` invece è già uniforme fra i due tipi
 * (`NodeViewSchema` condiviso, `model/shared.ts`), quindi non serve distinguerlo.
 *
 * Le corsie sono l'unica parte del flowchart che non passa da `DiagramOps`/`DiagramView`: sono un
 * terzo layer che solo il flowchart ha (spec §5), disegnato con `LanesLayerView` pura
 * (`@/ui/canvas/LanesLayer.tsx`) — la stessa che il canvas monta, così è garantito che la banda
 * sia identica nell'app e nell'export (Task 11). La sua estensione orizzontale viene da
 * `laneBandExtent` (`@/editor/flow/geometry.ts`), lo stesso calcolo che fa `LanesLayer`: un solo
 * punto, non due copie della formula che potrebbero divergere.
 *
 * `null` se non c'è nessun nodo con una view: non c'è niente da esportare.
 */
export function buildSvg(diagram: Diagram, { vars, fontFace }: BuildSvgOptions): string | null {
  const ops = opsForDiagram(diagram)
  const { NodeView, EdgeView } = viewFor(diagram.type)
  const nodeModels = nodeModelsOf(diagram)
  const edgeModels = edgeModelsOf(diagram)

  const keys = ops.nodeKeys()
  const rects = new Map<string, Rect>()
  for (const key of keys) {
    const rect = ops.rectOf(key)
    if (rect) rects.set(key, rect)
  }

  // Gli stessi estremi che il canvas dà a `edgeOffsets` dal proprio layer: l'export deve disegnare
  // il fascio dov'è sullo schermo, non ricentrarlo perché lo calcola per conto proprio.
  const edges = ops.edgesTouching(new Set(keys))
  const offsets = edgeOffsets(edges)

  // Le bande delle corsie entrano nei bounds insieme ai nodi: una corsia più alta dei suoi nodi, o
  // vuota, non deve uscire tagliata dal viewBox (spec §10).
  const laneRects: Rect[] = []
  const laneExtent = diagram.type === "flow" ? laneBandExtent(diagram) : null
  if (diagram.type === "flow" && laneExtent) {
    for (const lane of diagram.model.lanes) {
      const band = diagram.view.lanes[lane.id]
      if (band) laneRects.push({ x: laneExtent.x, y: band.y, w: laneExtent.w, h: band.h })
    }
  }

  const bounds = rectsBounds([...rects.values(), ...laneRects])
  if (!bounds) return null

  const x = bounds.x - EXPORT_PADDING
  const y = bounds.y - EXPORT_PADDING
  const w = bounds.w + 2 * EXPORT_PADDING
  const h = bounds.h + 2 * EXPORT_PADDING

  // Le corsie sotto tutto, come nel canvas (`Canvas.tsx`: `LanesLayer` monta prima di
  // `EdgesLayer`/`NodesLayer`). Poi gli archi sotto i nodi. Il fondo sotto tutto: nell'app lo
  // dipinge il div attorno all'svg, quindi qui va aggiunto, altrimenti il PNG esce trasparente e
  // il testo del tema chiaro diventa illeggibile su una pagina scura.
  const body = renderToStaticMarkup(
    <>
      <rect data-background x={x} y={y} width={w} height={h} fill="var(--background)" />
      {diagram.type === "flow" && laneExtent && (
        <LanesLayerView lanes={diagram.model.lanes} bands={diagram.view.lanes} x={laneExtent.x} w={laneExtent.w} />
      )}
      <g data-layer="edges">
        {edges.map((edge) => {
          const source = rects.get(edge.source)
          const target = rects.get(edge.target)
          const relation = edgeModels[edge.key]
          // `edgeGeometry` verifica che l'arco esista davvero nel modello (torna null altrimenti,
          // stessa guardia di `relation` qui sotto): la vista ricalcola comunque la propria
          // geometria dalle prop, come già fa nel canvas.
          if (!source || !target || !relation || !ops.edgeGeometry(edge.key, source, target)) return null
          return <EdgeView key={edge.key} edgeKey={edge.key} relation={relation} source={source} target={target} selected={false} offset={offsets.get(edge.key) ?? 0} />
        })}
      </g>
      <g data-layer="nodes">
        {keys.map((key) => {
          const rect = rects.get(key)
          const view = diagram.view.nodes[key]
          const node = nodeModels[key]
          if (!rect || !view || !node) return null
          return <NodeView key={key} nodeKey={key} node={node} view={view} selected={false} />
        })}
      </g>
    </>,
  )

  const style = fontFace ? `<style>${fontFace}</style>` : ""
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"` +
    ` font-family="var(--font-mono)" font-size="${FONT_SIZE}">${style}${body}</svg>`

  return resolveVars(svg, vars)
}

/**
 * Sostituisce ogni `var(--x)` col valore letterale. Quello che manca resta com'è, visibile.
 *
 * I valori vanno **sempre** dentro un attributo, quindi vanno sfuggiti: `--font-mono` in
 * produzione arriva come `"JetBrains Mono Variable", monospace` — con le doppie, perché è così
 * che il CSS minificato normalizza il quoting — e infilato grezzo chiuderebbe l'attributo,
 * rendendo l'SVG malformato e impossibile da aprire o rasterizzare.
 */
function resolveVars(svg: string, vars: Record<string, string>): string {
  let out = svg
  for (const [name, value] of Object.entries(vars)) {
    out = out.replaceAll(`var(${name})`, xmlAttr(value))
  }
  return out
}

function xmlAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}
