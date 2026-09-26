/**
 * Le famiglie di elementi che un documento contiene. L'ordine è quello canonico, e tutto ciò che
 * le scorre lo rispetta: layer del canvas, blocchi del layout, formati di export, validazione.
 */
export const FAMILIES = ["er", "class", "flow", "note"] as const
export type Family = (typeof FAMILIES)[number]

/**
 * Chiave con prefisso di famiglia: `er/utenti`, `class/Ordine`, `flow/n3`, `note/…`. È la sola forma di
 * chiave che canvas, selezione, editing e `dom-registry` conoscono, ed è quella con cui un
 * collegamento fra famiglie conserva i suoi estremi. I moduli di famiglia (comandi, `DiagramOps`,
 * validatori, emettitori, pannelli) lavorano senza prefisso: lo aggiunge `CanvasOps` all'andata e
 * lo toglie al ritorno. Sta nel modello perché lo schema dei collegamenti lo legge; `editor/families.ts`
 * lo ri-esporta. Nessun altro file costruisce o spezza chiavi a mano.
 */
export function qualify(family: Family, key: string): string {
  return `${family}/${key}`
}

/**
 * `true` se `qualified` è una chiave non vuota di `family`. Non lancia, a differenza di `splitKey`:
 * serve allo schema, che davanti a un file con gli estremi sbagliati deve rifiutarlo, non esplodere.
 */
export function inFamily(qualified: string, family: Family): boolean {
  const prefix = qualify(family, "")
  return qualified.startsWith(prefix) && qualified.length > prefix.length
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
