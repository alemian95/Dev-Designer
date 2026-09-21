import type { Entity, ErDiagram, Relationship } from "@/model/er/schema"
import type { Recipe } from "../document-store"
import { erDiagram } from "../er-access"
import { entityRect, entitySize } from "../er/geometry"
import { rectsBounds, snap, type Point, type Rect } from "../geometry"
import { uniqueKey } from "./er"

/** Spazio fra le celle della griglia e fra l'import e ciò che c'è già. */
const GUTTER = 40

/**
 * Posizioni per le sole entità nuove: griglia deterministica di `ceil(√n)` colonne, larghe quanto
 * l'entità più larga del lotto — le colonne restano allineate — ma **impacchettate in verticale**:
 * ogni colonna riprende sotto l'ultima entità che ci è finita, non a un passo fisso. Un passo fisso
 * pari all'entità più alta è ciò che fa un lotto reale: su uno schema da 240 tabelle con mediana di
 * 7 attributi, una sola tabella da 42 alzava tutte e quindici le righe a 998 px e dava una tela da
 * 15038 px piena al 12,8 %. Impacchettata è 4718 px e piena al 41 %.
 *
 * L'origine sta sotto tutto ciò che è già sul canvas, così un import non copre mai il lavoro
 * esistente. Non è auto layout: è una disposizione leggibile e trascinabile.
 */
export function placeNew(entities: Record<string, Entity>, diagram: ErDiagram): Record<string, Point> {
  const fresh = Object.entries(entities).filter(([key]) => !(key in diagram.view.nodes))
  if (fresh.length === 0) return {}

  const sizes = fresh.map(([, entity]) => entitySize(entity, false))
  const cellW = snap(Math.max(...sizes.map((s) => s.w)) + GUTTER)
  const cols = Math.ceil(Math.sqrt(fresh.length))

  const existing: Rect[] = Object.entries(diagram.view.nodes)
    .map(([key, view]) => {
      const entity = diagram.model.entities[key]
      return entity ? entityRect(entity, view) : null
    })
    .filter((r): r is Rect => r !== null)
  const bounds = rectsBounds(existing)
  const originX = snap(bounds ? bounds.x : GUTTER)
  const originY = snap(bounds ? bounds.y + bounds.h + GUTTER : GUTTER)

  const out: Record<string, Point> = {}
  // Quota corrente di ogni colonna, in ordine di lettura: l'entità i-esima si appoggia sotto quella
  // che l'ha preceduta nella sua colonna.
  const colY = new Array<number>(cols).fill(originY)
  fresh.forEach(([key], i) => {
    const col = i % cols
    const y = colY[col] ?? originY
    out[key] = { x: snap(originX + col * cellW), y: snap(y) }
    colY[col] = y + (sizes[i]?.h ?? 0) + GUTTER
  })
  return out
}

/**
 * Innesta le entità e le relazioni importate nel documento aperto, in un solo comando: un ⌘Z annulla
 * tutto l'import. Una tabella che c'è già viene sostituita e tiene la posizione.
 */
export function importEr(entities: Record<string, Entity>, relationships: readonly Relationship[]): Recipe {
  return (draft) => {
    const d = erDiagram(draft)
    // Prima delle mutazioni: le posizioni si calcolano sui bounds di ciò che c'è ora.
    const positions = placeNew(entities, d)

    for (const [key, entity] of Object.entries(entities)) {
      d.model.entities[key] = entity
      // Chi c'era tiene il suo nodo, quindi la posizione che l'utente le ha dato sopravvive.
      // `placeNew` copre esattamente le chiavi nuove: leggere la posizione prima di scrivere il nodo
      // fa dire al tipo ciò che prima si sapeva soltanto leggendo le due funzioni insieme.
      const pos = positions[key]
      if (pos && !(key in d.view.nodes)) d.view.nodes[key] = { ...pos, collapsed: false }
    }

    // Via le relazioni derivate da una FK delle tabelle in arrivo, altrimenti il re-import le duplica.
    // `source.attributes` vuoto è il marcatore delle relazioni disegnate a mano: quelle sopravvivono.
    for (const [key, rel] of Object.entries(d.model.relationships)) {
      if (rel.source.entity in entities && rel.source.attributes.length > 0) delete d.model.relationships[key]
    }

    // Le chiavi si assegnano qui, dopo la potatura: prima collidevano con relazioni che stanno per sparire.
    for (const rel of relationships) {
      d.model.relationships[uniqueKey(d.model.relationships, `${rel.source.entity}_${rel.target.entity}`)] = rel
    }
  }
}
