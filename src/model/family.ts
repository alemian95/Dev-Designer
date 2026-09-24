/**
 * Le famiglie di elementi che un documento contiene. L'ordine è quello canonico, e tutto ciò che
 * le scorre lo rispetta: layer del canvas, blocchi del layout, formati di export, validazione.
 */
export const FAMILIES = ["er", "class", "flow"] as const
export type Family = (typeof FAMILIES)[number]
