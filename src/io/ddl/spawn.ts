import type { ParseWorker } from "./parse-client"
import ParseWorkerConstructor from "./parse.worker?worker"

/**
 * Vive in un file suo perché `?worker` è una trasformazione di Vite: importarlo da `parse-client.ts`
 * lo tirerebbe dentro i test, che girano in Node dove `Worker` non esiste.
 *
 * Il cast è necessario perché le firme sovraccariche di `Worker.addEventListener` (generiche su
 * `WorkerEventMap`) non sono assegnabili alla forma ristretta di `ParseWorker`: un `Worker` vero la
 * soddisfa a runtime, ma TypeScript non lo può verificare per via degli overload. Si casta una volta
 * sola qui, non si allarga `ParseWorker`.
 */
export const spawnParseWorker = (): ParseWorker => new ParseWorkerConstructor() as unknown as ParseWorker
