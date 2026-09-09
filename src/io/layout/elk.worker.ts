import ELK, { type ElkNode } from "elkjs/lib/elk-api.js"
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker"
import type { LayoutPositions } from "@/model/layout"
import type { LayoutRequest, LayoutResponse } from "./client"

/**
 * In un worker `self` non è `Window`: il tipo `DedicatedWorkerGlobalScope` sta in `lib.webworker`,
 * che questo progetto non carica (ha `lib` DOM, e mescolarle dà dichiarazioni duplicate). Qui si
 * dichiara il minimo che serve, che ombreggia il globale solo per questo modulo. Stessa scelta di
 * `io/ddl/parse.worker.ts`.
 */
declare const self: {
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null
  postMessage: (message: LayoutResponse) => void
}

/**
 * Le opzioni sono una decisione del progetto (ADR 0006), non un parametro di chi chiama: `layered`
 * perché è l'unico algoritmo misurato che non sovrappone i nodi e sta sotto i 320 ms a 200 tabelle,
 * `DOWN` perché dà metà dell'area di `RIGHT` e mette i padri in alto.
 */
const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
}

/**
 * `elk.bundled.js` non regge se eseguito già dentro un worker: il suo `elk-worker.min.js`
 * si auto-rileva come corpo di un worker (guarda `self`/`document`) e dentro un dedicated
 * worker s'installa da solo su `self.onmessage`, rubando il nostro protocollo, senza
 * esportare la classe `Worker` che `elk.bundled.js` si aspetterebbe di poter istanziare.
 * Qui invece si usa `elk-api.js` (nessun motore incluso) con una `workerFactory` che crea
 * un worker **annidato** da `elk-worker.min.js`: caricato come script a sé, la stessa
 * auto-rilevazione lo riconosce correttamente come corpo di worker, e la conversazione
 * ELK-worker/ELK-api resta tutta dentro il nostro worker, invisibile al thread principale.
 */
const elk = new ELK({ workerFactory: () => new ElkWorker() })

self.onmessage = (event) => {
  const { id, nodes, edges } = event.data
  const run = async (): Promise<LayoutResponse> => {
    try {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: OPTIONS,
        children: nodes.map((n) => ({ id: n.id, width: n.w, height: n.h })),
        edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      }
      const laid: ElkNode = await elk.layout(graph)
      const positions: LayoutPositions = {}
      for (const child of laid.children ?? []) {
        // ELK dichiara x e y opzionali: un nodo senza posizione non si inventa, si omette, e
        // `applyLayout` lascia dov'era quello che non riceve.
        if (child.x !== undefined && child.y !== undefined) positions[child.id] = { x: child.x, y: child.y }
      }
      return { id, ok: true, positions }
    } catch (e) {
      return { id, ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
  void run().then((response) => self.postMessage(response))
}
