import type { LayoutWorker } from "./client"
import LayoutWorkerConstructor from "./elk.worker?worker"

/**
 * Vive in un file suo perché `?worker` è una trasformazione di Vite: importarlo da `client.ts` lo
 * tirerebbe dentro i test, che girano in Node dove `Worker` non esiste. Stessa ragione, e stesso
 * cast, di `io/ddl/spawn.ts`: le firme sovraccariche di `Worker.addEventListener` non sono
 * assegnabili alla forma ristretta di `LayoutWorker`, che un `Worker` vero soddisfa a runtime.
 */
export const spawnLayoutWorker = (): LayoutWorker => new LayoutWorkerConstructor() as unknown as LayoutWorker
