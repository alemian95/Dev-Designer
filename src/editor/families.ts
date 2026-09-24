import { FAMILIES, type Family } from "@/model/family"
import { parseSelId, type SelectionKind, type SessionState } from "./session-store"

/**
 * Chiave con prefisso di famiglia: `er/utenti`, `class/Ordine`, `flow/n3`. È la sola forma di
 * chiave che canvas, selezione, editing e `dom-registry` conoscono. I moduli di famiglia (comandi,
 * `DiagramOps`, validatori, emettitori, pannelli) lavorano senza prefisso: lo aggiunge `CanvasOps`
 * all'andata e lo toglie al ritorno. Nessun altro file costruisce o spezza chiavi a mano.
 */
export function qualify(family: Family, key: string): string {
  return `${family}/${key}`
}

/**
 * Si taglia al **primo** `/`: il nome di famiglia non ne contiene mai, quindi una chiave interna
 * con `/` resta intatta. Una chiave senza famiglia valida è un difetto dell'app e si segnala con
 * un'eccezione, invece di finire assegnata a una famiglia a caso.
 */
export function splitKey(qualified: string): { family: Family; key: string } {
  const i = qualified.indexOf("/")
  const family = i < 0 ? "" : qualified.slice(0, i)
  if (!(FAMILIES as readonly string[]).includes(family)) throw new Error(`chiave senza famiglia: ${qualified}`)
  return { family: family as Family, key: qualified.slice(i + 1) }
}

/** Le chiavi selezionate di un tipo che appartengono a una famiglia, senza prefisso: servono ai pannelli di famiglia. */
export function familySelectedKeys(selection: ReadonlySet<string>, kind: SelectionKind, family: Family): string[] {
  return [...selection].flatMap((id) => {
    const sel = parseSelId(id)
    if (sel.kind !== kind) return []
    const split = splitKey(sel.key)
    return split.family === family ? [split.key] : []
  })
}

type Editing = NonNullable<SessionState["editing"]>

/** L'editing in corso, senza prefisso, se riguarda questa famiglia; altrimenti `null`. */
export function editingIn(editing: SessionState["editing"], family: Family): { key: string; target: Editing["target"] } | null {
  if (!editing) return null
  const split = splitKey(editing.key)
  return split.family === family ? { key: split.key, target: editing.target } : null
}
