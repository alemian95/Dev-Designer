/**
 * Lato (o spessore) della maniglia di ridimensionamento, in unità di mondo: abbastanza da prenderla
 * col puntatore, non da coprire i nodi. La stessa per un pool (`PoolsLayer.tsx`) e per una forma
 * (`Shape.tsx`, spec 2b §5, 3b §5): un'unica definizione condivisa nella UI, non due copie.
 */
export const HANDLE = 8
