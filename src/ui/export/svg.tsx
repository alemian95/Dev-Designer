import { renderToStaticMarkup } from "react-dom/server"
import { classDiagram } from "@/editor/class-access"
import { edgeOffsets } from "@/editor/edge-routing"
import { erDiagram } from "@/editor/er-access"
import { qualify } from "@/editor/families"
import { flowDiagram } from "@/editor/flow-access"
import { poolIds, poolRect } from "@/editor/flow/geometry"
import { FONT_SIZE, rectsBounds, type Rect } from "@/editor/geometry"
import { canvasOps } from "@/editor/kinds/canvas-ops"
import { familyOps } from "@/editor/kinds/ops"
import type { DevDocument } from "@/model/document"
import { FAMILIES, type Family } from "@/model/family"
import type { NodeView as NodeViewModel } from "@/model/shared"
import { LinkEdgeView } from "@/ui/canvas/LinkEdge"
import { PoolsLayerView } from "@/ui/canvas/PoolsLayer"
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

/** I nodi grezzi di una famiglia: vedi la nota sopra `buildSvg`. */
function nodeModelsOf(doc: DevDocument, family: Family): Record<string, unknown> {
  switch (family) {
    case "er":
      return erDiagram(doc).model.entities
    case "class":
      return { ...classDiagram(doc).model.classes, ...classDiagram(doc).model.notes }
    case "flow":
      return flowDiagram(doc).model.nodes
  }
}

/** Gli archi grezzi di una famiglia, stessa ragione di `nodeModelsOf`. */
function edgeModelsOf(doc: DevDocument, family: Family): Record<string, unknown> {
  switch (family) {
    case "er":
      return erDiagram(doc).model.relationships
    case "class":
      return classDiagram(doc).model.relations
    case "flow":
      return flowDiagram(doc).model.edges
  }
}

/** Le view dei nodi di una famiglia: la forma è la stessa per tutte (`NodeViewSchema`). */
function viewNodesOf(doc: DevDocument, family: Family): Record<string, NodeViewModel> {
  switch (family) {
    case "er":
      return erDiagram(doc).view.nodes
    case "class":
      return classDiagram(doc).view.nodes
    case "flow":
      return flowDiagram(doc).view.nodes
  }
}

/**
 * Serializza il documento come SVG autoconsistente. Scorre le famiglie del documento nello stesso
 * ordine del canvas: le corsie sotto tutto, poi tutti gli archi, poi i collegamenti fra famiglie,
 * poi tutti i nodi.
 *
 * Una sezione per famiglia: `nodeKeys`/`rectOf`/`edgesTouching`/`edgeGeometry` di `DiagramOps`
 * (`@/editor/kinds/ops.ts`) danno chiavi, geometria e bounds senza sapere se il modello si chiama
 * `entities`/`classes`/`nodes` o `relationships`/`relations`/`edges`; `NodeView`/`EdgeView` di
 * `DiagramView` (`@/ui/canvas/kinds`) sono le stesse viste pure che il canvas monta, guidate
 * dalle prop e non dallo store — `renderToStaticMarkup` costruisce l'albero fuori dal DOM di
 * React, in un contesto senza store da cui i layer sottoscritti potrebbero leggere.
 *
 * Resta un solo punto dove i nomi dei campi del modello contano — `nodeModelsOf`/`edgeModelsOf`
 * qui sopra — perché `DiagramOps` non espone i record grezzi (non è il suo lavoro: geometria e
 * comandi, non lettura del modello). `view.nodes` invece è già uniforme fra le famiglie
 * (`NodeViewSchema` condiviso, `model/shared.ts`), quindi non serve distinguerlo.
 *
 * I pool sono l'unica parte del flowchart che non passa da `DiagramOps`/`DiagramView`: sono un
 * layer che solo il flowchart ha, disegnato con la stessa `PoolsLayerView` del canvas, così il
 * pool è identico nell'app e nell'export.
 *
 * `null` se non c'è nessun nodo con una view: non c'è niente da esportare.
 */
export function buildSvg(doc: DevDocument, { vars, fontFace }: BuildSvgOptions): string | null {
  // Una sezione per famiglia: chiavi, rettangoli e archi restano senza prefisso, perché le viste
  // pure di ogni famiglia li vogliono così (e il prefisso nei `data-*-id` lo mettono loro).
  const sections = FAMILIES.map((family) => {
    const ops = familyOps(doc, family)
    const keys = ops.nodeKeys()
    const rects = new Map<string, Rect>()
    for (const key of keys) {
      const rect = ops.rectOf(key)
      if (rect) rects.set(key, rect)
    }
    const edges = ops.edgesTouching(new Set(keys))
    return {
      family,
      ops,
      keys,
      rects,
      edges,
      offsets: edgeOffsets(edges),
      view: viewFor(family),
      nodeModels: nodeModelsOf(doc, family),
      edgeModels: edgeModelsOf(doc, family),
      viewNodes: viewNodesOf(doc, family),
    }
  })

  const flow = flowDiagram(doc)
  // I pool sono contenuto anche senza nodi (spec 2b §6): entrano nei limiti dell'export.
  const poolRects = poolIds(flow).flatMap((id) => poolRect(flow, id) ?? [])

  const bounds = rectsBounds([...sections.flatMap((s) => [...s.rects.values()]), ...poolRects])
  if (!bounds) return null

  const x = bounds.x - EXPORT_PADDING
  const y = bounds.y - EXPORT_PADDING
  const w = bounds.w + 2 * EXPORT_PADDING
  const h = bounds.h + 2 * EXPORT_PADDING

  // Gli estremi dei collegamenti sono chiavi con prefisso, di famiglie diverse: li risolve `CanvasOps`.
  const allOps = canvasOps(doc)

  // I pool sotto tutto, come nel canvas (`Canvas.tsx`: `PoolsLayer` monta prima dei layer di
  // famiglia). Poi tutti gli archi sotto tutti i nodi. Il fondo sotto tutto: nell'app lo dipinge il
  // div attorno all'svg, quindi qui va aggiunto, altrimenti il PNG esce trasparente e il testo del
  // tema chiaro diventa illeggibile su una pagina scura.
  const body = renderToStaticMarkup(
    <>
      <rect data-background x={x} y={y} width={w} height={h} fill="var(--background)" />
      {poolRects.length > 0 && <PoolsLayerView part={flow} />}
      <g data-layer="edges">
        {sections.flatMap((s) =>
          s.edges.map((edge) => {
            const source = s.rects.get(edge.source)
            const target = s.rects.get(edge.target)
            const relation = s.edgeModels[edge.key]
            // `edgeGeometry` verifica che l'arco esista davvero nel modello (torna null altrimenti,
            // stessa guardia di `relation` qui sotto): la vista ricalcola comunque la propria
            // geometria dalle prop, come già fa nel canvas.
            if (!source || !target || !relation || !s.ops.edgeGeometry(edge.key, source, target)) return null
            return (
              <s.view.EdgeView
                key={qualify(s.family, edge.key)}
                edgeKey={edge.key}
                relation={relation}
                source={source}
                target={target}
                selected={false}
                offset={s.offsets.get(edge.key) ?? 0}
              />
            )
          }),
        )}
      </g>
      <g data-layer="links">
        {Object.entries(doc.diagram.links).map(([id, link]) => {
          const source = allOps.rectOf(link.source)
          const target = allOps.rectOf(link.target)
          // Un collegamento pendente non si disegna, come sul canvas.
          if (!source || !target) return null
          return <LinkEdgeView key={id} id={id} link={link} source={source} target={target} selected={false} />
        })}
      </g>
      <g data-layer="nodes">
        {sections.flatMap((s) =>
          s.keys.map((key) => {
            const rect = s.rects.get(key)
            const view = s.viewNodes[key]
            const node = s.nodeModels[key]
            if (!rect || !view || !node) return null
            return <s.view.NodeView key={qualify(s.family, key)} nodeKey={key} node={node} view={view} selected={false} />
          }),
        )}
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
