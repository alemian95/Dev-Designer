import type { DevDocument } from "@/model/document"
import type { Family } from "@/model/family"
import { unmappableNotice } from "@/model/links/mappable"
import { linkRule, type AccessMode, type Link, type LinkKind } from "@/model/links/schema"
import { classDiagram } from "../class-access"
import type { Recipe } from "../document-store"
import { linkKey, qualify, splitKey } from "../families"
import { familyOps } from "../kinds/ops"
import { retargetAnchors } from "../note/anchor"

/** L'esito del gesto Collega fra due famiglie diverse (spec 4a §4). Le chiavi sono `link/<uuid>`. */
export type ConnectResult =
  | { type: "created"; key: string; recipe: Recipe }
  | { type: "existing"; key: string }
  | { type: "rejected"; notice: string }

/** Come si nomina un nodo di ogni famiglia nell'avviso di rifiuto. */
const FAMILY_NOUN: Record<Family, string> = { er: "un'entità", class: "una classe", flow: "un nodo di flusso", note: "una nota" }

/**
 * Il motivo per cui gli estremi non ammettono il tipo, o `null` se lo ammettono. `source` e `target`
 * sono già nel verso del tipo. Solo «mappa su» ha una regola: una classe si mappa solo se è `class` o
 * `abstract`, e la regola vive nel modello (`unmappableNotice`), la stessa fonte dell'errore
 * `link-unmappable` di `validateLinks`.
 */
function refusal(doc: DevDocument, kind: LinkKind, source: string): string | null {
  if (kind !== "maps-to") return null
  const cls = classDiagram(doc).model.classes[splitKey(source).key]
  return cls ? unmappableNotice(cls.stereotype) : null
}

/** Il collegamento che nasce dal gesto: un accesso nasce in lettura, e il modo si cambia dal pannello. */
function newLink(kind: LinkKind, source: string, target: string): Link {
  return kind === "accesses" ? { kind, source, target, mode: "read" } : { kind, source, target }
}

/**
 * Collega due nodi di famiglie diverse. La direzione si normalizza sul verso del tipo, qualunque sia
 * il verso del trascinamento. Un collegamento già presente fra gli stessi due nodi non si duplica: si
 * seleziona. Una classe con «mappa su» verso due entità diverse invece si può creare, e la segnala la
 * validazione (`class-maps-multiple`): un errore visibile è più chiaro di un gesto rifiutato.
 */
export function connectAcross(doc: DevDocument, from: string, to: string): ConnectResult {
  const a = splitKey(from).family
  const b = splitKey(to).family
  const rule = linkRule(a, b)
  if (!rule) return { type: "rejected", notice: `Non esiste un collegamento fra ${FAMILY_NOUN[a]} e ${FAMILY_NOUN[b]}.` }
  const [source, target] = rule.reversed ? [to, from] : [from, to]
  const refused = refusal(doc, rule.kind, source)
  if (refused) return { type: "rejected", notice: refused }
  const existing = Object.entries(doc.diagram.links).find(
    ([, l]) => l.kind === rule.kind && l.source === source && l.target === target,
  )
  if (existing) return { type: "existing", key: linkKey(existing[0]) }
  const id = crypto.randomUUID()
  return {
    type: "created",
    key: linkKey(id),
    recipe: (draft) => {
      draft.diagram.links[id] = newLink(rule.kind, source, target)
    },
  }
}

/** Gli estremi che nominano `oldKey` passano a `newKey`. Chiavi con prefisso. */
export function retargetLinks(oldKey: string, newKey: string): Recipe {
  return (draft) => {
    for (const link of Object.values(draft.diagram.links)) {
      if (link.source === oldKey) link.source = newKey
      if (link.target === oldKey) link.target = newKey
    }
  }
}

/**
 * La rinomina `rename`, e i collegamenti e le àncore delle note che la seguono, in una recipe sola:
 * un passo di annulla, e nessuno stato intermedio. Chiavi **senza** prefisso, quelle dei comandi di
 * famiglia.
 *
 * Collegamenti e àncore si spostano solo se la rinomina ha davvero tolto il nodo `oldKey`.
 * `renameEntity` e `renameClass` rispondono a una collisione con una recipe che non scrive niente:
 * senza la guardia, una collisione li sposterebbe sul nodo che esiste già.
 */
export function followRename(rename: Recipe, family: Family, oldKey: string, newKey: string): Recipe {
  const has = (doc: DevDocument, key: string) => familyOps(doc, family).nodeKeys().includes(key)
  return (draft) => {
    const had = has(draft, oldKey)
    rename(draft)
    if (had && !has(draft, oldKey)) {
      retargetLinks(qualify(family, oldKey), qualify(family, newKey))(draft)
      retargetAnchors(qualify(family, oldKey), qualify(family, newKey))(draft)
    }
  }
}

/** Elimina i collegamenti dati; un id che non c'è non scrive niente. */
export function deleteLinks(ids: readonly string[]): Recipe {
  return (draft) => {
    for (const id of ids) delete draft.diagram.links[id]
  }
}

/**
 * Il modo di un accesso (spec 4b §6). Su un id che non c'è o su un collegamento di un altro tipo non
 * scrive niente; con lo stesso modo nemmeno, perché Immer non registra un'assegnazione che non cambia
 * il valore, e `dispatch` non aggiunge un passo di annulla.
 */
export function setLinkMode(id: string, mode: AccessMode): Recipe {
  return (draft) => {
    const link = draft.diagram.links[id]
    if (link?.kind === "accesses") link.mode = mode
  }
}

/** I collegamenti con almeno un estremo fra `keys` (chiavi con prefisso), con il loro id. */
export function linksTouching(links: Readonly<Record<string, Link>>, keys: ReadonlySet<string>): [string, Link][] {
  return Object.entries(links).filter(([, l]) => keys.has(l.source) || keys.has(l.target))
}
