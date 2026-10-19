/**
 * Spessore della maniglia di ridimensionamento di un pool e delle sue corsie, in unità di mondo:
 * abbastanza da prenderla col puntatore, non da coprire i nodi (spec 2b §5). Le maniglie agli spigoli
 * dei nodi sono in pixel dello schermo, come gli agganci (`ResizeHandlesLayer.tsx`).
 */
export const HANDLE = 8
