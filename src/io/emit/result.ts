/**
 * Uscita comune ai tre emettitori.
 *
 * Gli avvisi sono **aggregati** — «3 tipi non appartengono a MySQL: …» e non una riga per colonna:
 * su un dump da 80 tabelle una riga per colonna è illeggibile.
 */
export interface EmitResult {
  text: string
  warnings: string[]
}
