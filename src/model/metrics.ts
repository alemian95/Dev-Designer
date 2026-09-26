/**
 * Le metriche del testo: convenzioni pure, senza nessuna misura nel DOM. Stanno nel modello perché
 * la migrazione 5 → 6 (spec 2b §4) deve calcolare la larghezza dei nodi di flusso, e `src/model` non
 * importa `src/editor`. `editor/geometry.ts` le riesporta, e i chiamanti le importano da lì.
 */
export const FONT_SIZE = 13
/** JetBrains Mono ha avanzamento 600/1000 em: larghezza carattere = 0,6 × font size. Nessuna misura nel DOM. */
export const CHAR_W = FONT_SIZE * 0.6
export const ROW_H = 22
export const PAD_X = 10
export const GRID = 10

/**
 * Dimensione minima di un nodo appena creato, con etichetta vuota: deve restare afferrabile, non
 * sparire in un punto. La usano il nodo di flowchart (`model/flow/size.ts`) e la forma rettangolo/
 * ellisse (`editor/shape/geometry.ts`, spec 3b §5, esplicitamente «gli stessi di un nodo di
 * flusso»): un'unica definizione condivisa, non due copie che potrebbero divergere.
 */
export const MIN_NODE_W = 60
export const MIN_NODE_H = 40
