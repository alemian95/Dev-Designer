import { splitKey, type Family } from "@/model/family"
import { parseSelId, type SelectionKind, type SessionState } from "./session-store"

// `qualify` e `splitKey` stanno nel modello (lo schema dei collegamenti legge il prefisso): qui si
// ri-esportano, così canvas, pannelli e comandi continuano a importarli da un posto solo.
export { qualify, splitKey } from "@/model/family"

const LINK_PREFIX = "link/"

/**
 * Chiave sul canvas di un collegamento fra famiglie: `link/<uuid>`. `link` non è una famiglia ma un
 * namespace a parte, quindi `splitKey` continua a rifiutarla. Queste due funzioni sono le sole che
 * costruiscono o riconoscono una chiave di collegamento.
 */
export function linkKey(id: string): string {
  return `${LINK_PREFIX}${id}`
}

/** L'id del collegamento, se `key` è una chiave di collegamento; altrimenti `null`. */
export function linkId(key: string): string | null {
  return key.startsWith(LINK_PREFIX) ? key.slice(LINK_PREFIX.length) : null
}

/** Le chiavi selezionate di un tipo che appartengono a una famiglia, senza prefisso: servono ai pannelli di famiglia. */
export function familySelectedKeys(selection: ReadonlySet<string>, kind: SelectionKind, family: Family): string[] {
  return [...selection].flatMap((id) => {
    const sel = parseSelId(id)
    if (sel.kind !== kind) return []
    // Un collegamento non appartiene a nessuna famiglia: nessun pannello di famiglia lo vede.
    if (linkId(sel.key) !== null) return []
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
