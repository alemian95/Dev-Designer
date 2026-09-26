import type { DevDocument } from "../document"
import { splitKey } from "../family"
import type { AccessMode, Link, LinkKind } from "./schema"

/**
 * Le parole dei collegamenti, in un posto solo: le leggono il canvas, il pannello e i messaggi di
 * validazione, che stanno nel modello (spec 4b §3). Il titolo del pannello non dipende dal modo, così
 * non cambia mentre lo si modifica.
 */
export const LINK_TITLE: Readonly<Record<LinkKind, string>> = { "maps-to": "Mappa su", accesses: "Accesso", calls: "Chiama" }

/** Le voci della select del modo, nel pannello. */
export const ACCESS_MODE_LABEL: Readonly<Record<AccessMode, string>> = { read: "Legge", write: "Scrive", "read-write": "Legge e scrive" }

/** L'etichetta sul canvas e nei messaggi: il tipo, e per l'accesso il suo modo. Sempre in minuscolo. */
export function linkLabel(link: Link): string {
  return (link.kind === "accesses" ? ACCESS_MODE_LABEL[link.mode] : LINK_TITLE[link.kind]).toLowerCase()
}

/** Un'etichetta su una riga, o `empty` se non resta niente. */
function oneLine(label: string, empty: string): string {
  const line = label.replace(/\s+/g, " ").trim()
  return line === "" ? empty : line
}

/**
 * Il nome leggibile di un estremo o di un'àncora, per i messaggi e per i pannelli. Entità e classi
 * hanno per chiave il nome; un nodo di flusso e una forma hanno per chiave un uuid, quindi si mostra
 * la loro etichetta, su una riga; un pool, anche lui con un uuid, si mostra col suo nome.
 */
export function endName(doc: DevDocument, key: string): string {
  const { family, key: bare } = splitKey(key)
  if (family === "shape") {
    const shape = doc.diagram.shape.model.shapes[bare]
    return shape ? oneLine(shape.label, "(senza testo)") : "(forma eliminata)"
  }
  if (family !== "flow") return bare
  const pool = doc.diagram.flow.model.pools[bare]
  if (pool) return pool.name === "" ? "(senza nome)" : pool.name
  const node = doc.diagram.flow.model.nodes[bare]
  if (!node) return "(nodo eliminato)"
  return oneLine(node.label, "(senza etichetta)")
}
