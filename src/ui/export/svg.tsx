import { renderToStaticMarkup } from "react-dom/server"
import { entityRect, rectsBounds, FONT_SIZE, type Rect } from "@/editor/er-geometry"
import type { ErDiagram } from "@/model/document"
import { EntityNodeView } from "@/ui/canvas/EntityNode"
import { RelationshipEdgeView } from "@/ui/canvas/RelationshipEdge"

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
 * Serializza il diagramma come SVG autoconsistente.
 *
 * Ri-renderizza il modello con le stesse viste del canvas invece di clonare il DOM: griglia,
 * overlay e bordi di selezione non ci sono perché non vengono disegnati, non perché siano stati
 * spenti dopo. Un renderer solo, due uscite, nessuna deriva fra ciò che si vede e ciò che si esporta.
 *
 * `null` se non c'è nessuna entità: non c'è niente da esportare.
 */
export function buildSvg(diagram: ErDiagram, { vars, fontFace }: BuildSvgOptions): string | null {
  const { entities, relationships } = diagram.model
  const { nodes } = diagram.view

  const rects = new Map<string, Rect>()
  for (const [key, entity] of Object.entries(entities)) {
    const view = nodes[key]
    if (view) rects.set(key, entityRect(entity, view))
  }

  const bounds = rectsBounds([...rects.values()])
  if (!bounds) return null

  const x = bounds.x - EXPORT_PADDING
  const y = bounds.y - EXPORT_PADDING
  const w = bounds.w + 2 * EXPORT_PADDING
  const h = bounds.h + 2 * EXPORT_PADDING

  // Gli archi sotto i nodi, come nel canvas. Il fondo sotto tutto: nell'app lo dipinge il div
  // attorno all'svg, quindi qui va aggiunto, altrimenti il PNG esce trasparente e il testo del
  // tema chiaro diventa illeggibile su una pagina scura.
  const body = renderToStaticMarkup(
    <>
      <rect data-background x={x} y={y} width={w} height={h} fill="var(--background)" />
      <g data-layer="edges">
        {Object.entries(relationships).map(([key, relationship]) => {
          const source = rects.get(relationship.source.entity)
          const target = rects.get(relationship.target.entity)
          if (!source || !target) return null
          return <RelationshipEdgeView key={key} edgeKey={key} relationship={relationship} source={source} target={target} selected={false} />
        })}
      </g>
      <g data-layer="nodes">
        {Object.entries(entities).map(([key, entity]) => {
          const view = nodes[key]
          if (!view) return null
          return <EntityNodeView key={key} nodeKey={key} entity={entity} view={view} selected={false} />
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
