import type { LayoutEdge, LayoutNode, LayoutPositions } from "@/model/layout"

export interface LayoutRequest {
  id: number
  nodes: LayoutNode[]
  edges: LayoutEdge[]
}

export type LayoutResponse =
  | { id: number; ok: true; positions: LayoutPositions }
  | { id: number; ok: false; message: string }

/**
 * Il sottoinsieme di `Worker` che serve; un `Worker` vero lo soddisfa, e i test iniettano un finto.
 * Stessa forma di `ParseWorker` in `io/ddl/parse-client.ts`, per la stessa ragione: il worker non
 * esiste in Node, dove girano i test.
 */
export interface LayoutWorker {
  postMessage: (message: LayoutRequest) => void
  terminate: () => void
  addEventListener: (type: "message" | "error" | "messageerror", listener: (event: never) => void) => void
}

export interface LayoutEngine {
  /**
   * Una `layout` chiamata mentre la precedente non si è risolta **abbandona quest'ultima**: la
   * rigetta e termina il worker. Chi chiama non deve aspettarsi una risposta utile da ogni
   * richiesta avviata, solo dall'ultima.
   */
  layout: (nodes: LayoutNode[], edges: LayoutEdge[]) => Promise<LayoutPositions>
}

/** 10 s: il massimo misurato è 157 ms su 200 tabelle con `layered DOWN` (ADR 0006), quindi il margine è sessanta volte. */
export const LAYOUT_TIMEOUT_MS = 10_000

interface Pending {
  id: number
  resolve: (positions: LayoutPositions) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Crea il worker al primo layout e lo tiene per i successivi: avviare elkjs (465 kB gzip) costa, e
 * un layout si ripete.
 *
 * Più semplice di `createParser`, che serve un dialog: qui c'è **al più una richiesta in volo**,
 * perché la nuova abbandona la precedente, quindi basta una variabile invece di una mappa. Non
 * esiste `dispose`: il motore vive quanto l'app, non quanto una finestra.
 */
export function createLayoutEngine(spawn: () => LayoutWorker, timeoutMs: number = LAYOUT_TIMEOUT_MS): LayoutEngine {
  let worker: LayoutWorker | null = null
  let nextId = 1
  let pending: Pending | null = null

  const fail = (message: string): void => {
    if (!pending) return
    clearTimeout(pending.timer)
    pending.reject(new Error(message))
    pending = null
  }

  /**
   * Un worker che ha fallito, che è stato abbandonato o che non ha risposto è inutilizzabile:
   * resta bloccato sul calcolo di prima. Si termina, e il prossimo layout ne fa nascere uno pulito.
   */
  const discard = (message: string): void => {
    fail(message)
    worker?.terminate()
    worker = null
  }

  const settle = (event: MessageEvent<LayoutResponse>): void => {
    // Risposta di una richiesta scaduta o abbandonata: si scarta senza far niente.
    if (pending?.id !== event.data.id) return
    const p = pending
    pending = null
    clearTimeout(p.timer)
    if (event.data.ok) p.resolve(event.data.positions)
    else p.reject(new Error(event.data.message))
  }

  const ensure = (): LayoutWorker => {
    if (worker) return worker
    const w = spawn()
    w.addEventListener("message", settle as (event: never) => void)
    w.addEventListener("error", (() => discard("il motore di layout non è stato caricato")) as (event: never) => void)
    // `messageerror` è un singolo messaggio non deserializzabile, non il worker: resta valido.
    w.addEventListener("messageerror", (() => fail("risposta del motore di layout illeggibile")) as (event: never) => void)
    worker = w
    return w
  }

  return {
    layout: (nodes, edges) =>
      new Promise<LayoutPositions>((resolve, reject) => {
        // Due layout di seguito produrrebbero due voci di undo per un gesto che l'utente ha inteso
        // come uno: il primo si abbandona.
        if (pending) discard("layout abbandonato: superato da uno più recente")
        const id = nextId++
        const timer = setTimeout(() => discard("il motore di layout non ha risposto in tempo"), timeoutMs)
        pending = { id, resolve, reject, timer }
        ensure().postMessage({ id, nodes, edges })
      }),
  }
}
