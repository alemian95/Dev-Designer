/**
 * Nome base di un tipo SQL, **solo** per il confronto con insiemi di nomi: il tipo emesso resta
 * sempre la stringa del modello, intatta. Sta nel modello perché lo usano sia gli avvisi dell'export
 * (`io/emit/sql-types.ts`) sia la validazione dei collegamenti (`model/links/types.ts`).
 *
 * Non si tronca al primo spazio perché i tipi a più parole esistono e sono quelli che contano:
 * `double precision` arriva così dall'adapter Postgres, `bigint(20) unsigned` da quello MySQL.
 *
 * Un letterale con una parentesi chiusa dentro — `enum('a)b')` — confonde il taglio delle
 * parentesi. Il risultato non corrisponde a nessun insieme e quindi non produce alcun avviso:
 * fallire in silenzio è il modo giusto di sbagliare, qui.
 */
export function baseType(type: string): string {
  return type
    .toLowerCase()
    .replaceAll(/\([^)]*\)/g, " ")
    .replaceAll("[]", " ")
    .replaceAll(/\b(?:unsigned|zerofill)\b/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
}
