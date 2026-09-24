import type { Stereotype } from "../class/schema"

/** Gli stereotipi che non si persistono in una tabella. `class` e `abstract` possono avere «mappa su». */
const UNMAPPABLE: Partial<Record<Stereotype, string>> = {
  interface: "Un'interfaccia non si mappa su una tabella.",
  enum: "Un enum non si mappa su una tabella.",
}

/**
 * Il motivo per cui una classe con questo stereotipo non si mappa su una tabella, o `null` se lo
 * ammette. Unica fonte della regola «solo `class` e `abstract`»: il gesto Collega (`connectAcross`)
 * la usa per l'avviso di rifiuto, `validateLinks` per l'errore `link-unmappable` su un collegamento
 * che esiste già (spec 4a, review finale F1).
 */
export function unmappableNotice(stereotype: Stereotype): string | null {
  return UNMAPPABLE[stereotype] ?? null
}
