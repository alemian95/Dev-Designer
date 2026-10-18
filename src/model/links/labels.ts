import type { DevDocument } from "../document"
import { splitKey } from "../family"
import { splitSequenceKey } from "../sequence/schema"
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

/** Una sequenza si nomina col titolo; un suo partecipante (`<seq>/<pid>`) con l'etichetta o il nome. */
function sequenceEndName(doc: DevDocument, key: string): string {
  const parts = splitSequenceKey(key)
  const sequence = parts && doc.diagram.sequence.model.sequences[parts.sequence]
  if (!parts || !sequence) return "(sequenza eliminata)"
  if (parts.participant === null) return oneLine(sequence.title, "(sequenza senza titolo)")
  const participant = sequence.participants.find((p) => p.id === parts.participant)
  return participant ? oneLine(participant.label ?? "", participant.name) : "(partecipante eliminato)"
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
  if (family === "sequence") return sequenceEndName(doc, bare)
  if (family !== "flow") return bare
  const pool = doc.diagram.flow.model.pools[bare]
  if (pool) return pool.name === "" ? "(senza nome)" : pool.name
  const node = doc.diagram.flow.model.nodes[bare]
  if (!node) return "(nodo eliminato)"
  return oneLine(node.label, "(senza etichetta)")
}
