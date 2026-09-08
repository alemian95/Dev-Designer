import type { DdlParseResult, Dialect } from "./schema"

export interface ParseRequest {
  id: number
  dialect: Dialect
  ddl: string
}

export type ParseResponse =
  | { id: number; ok: true; result: DdlParseResult }
  | { id: number; ok: false; message: string }

/**
 * Il sottoinsieme di `Worker` che serve; un `Worker` vero lo soddisfa, e i test iniettano un finto.
 * Stessa forma di `LockRequester` in `lock.ts`, per la stessa ragione: il worker non esiste in Node.
 */
export interface ParseWorker {
  postMessage: (message: ParseRequest) => void
  terminate: () => void
  addEventListener: (type: "message" | "error" | "messageerror", listener: (event: never) => void) => void
}

/** Si chiama `DdlParser` e non `Parser` perché `Parser` è la classe di `node-sql-parser`. */
export interface DdlParser {
  /**
   * Chiamare `parse` mentre una `parse` precedente non si è ancora risolta **abbandona
   * quest'ultima**: il worker che la stava calcolando viene terminato e la sua promessa
   * rigettata, invece di lasciarlo proseguire su un dump che non serve più a nessuno. Chi
   * chiama non deve quindi assumere che tutte le `parse` avviate arrivino a una risposta
   * utile — solo l'ultima lo fa.
   */
  parse: (ddl: string, dialect: Dialect) => Promise<DdlParseResult>
  /** Termina il worker e rigetta le analisi in corso: chiudere il dialog annulla davvero. */
  dispose: () => void
}

/** 30 s: 200 tabelle costano 136 ms misurati, quindi il margine è tre ordini di grandezza. */
export const PARSE_TIMEOUT_MS = 30_000

interface Pending {
  resolve: (result: DdlParseResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Crea il worker alla prima analisi e lo tiene per le successive. Ogni promessa ha un timeout, e un
 * fallimento del worker le rigetta tutte: senza questo un `.wasm` che non carica lascia il dialog
 * bloccato senza messaggio. Una `parse` chiamata mentre la precedente è ancora in volo abbandona
 * quest'ultima (la rigetta e termina il worker): proseguirla sarebbe lavoro sprecato su un dump
 * che chi chiama non aspetta più, dato che nell'uso reale (il dialog di import) solo l'ultima
 * analisi richiesta interessa.
 */
export function createParser(spawn: () => ParseWorker, timeoutMs: number = PARSE_TIMEOUT_MS): DdlParser {
  let worker: ParseWorker | null = null
  let nextId = 1
  const pending = new Map<number, Pending>()

  const failAll = (message: string): void => {
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(message))
    }
    pending.clear()
  }

  const settle = (event: MessageEvent<ParseResponse>): void => {
    const p = pending.get(event.data.id)
    // Risposta di un'analisi scaduta o già abbandonata (vedi sotto): si scarta senza far niente.
    if (!p) return
    pending.delete(event.data.id)
    clearTimeout(p.timer)
    if (event.data.ok) p.resolve(event.data.result)
    else p.reject(new Error(event.data.message))
  }

  const ensure = (): ParseWorker => {
    if (worker) return worker
    const w = spawn()
    w.addEventListener("message", settle as (event: never) => void)
    // Dopo `error` il worker è morto (es. il `.wasm` non è caricato): si azzera il riferimento
    // *dopo* aver rigettato le richieste in corso, così la prossima `parse()` ne fa nascere uno nuovo.
    w.addEventListener(
      "error",
      (() => {
        failAll("il parser non è stato caricato")
        worker = null
      }) as (event: never) => void,
    )
    // `messageerror`: un singolo messaggio non deserializzabile, non il worker nel suo complesso —
    // resta valido e serve le analisi successive.
    w.addEventListener("messageerror", (() => failAll("risposta del parser illeggibile")) as (event: never) => void)
    worker = w
    return w
  }

  return {
    parse: (ddl, dialect) =>
      new Promise<DdlParseResult>((resolve, reject) => {
        // Una parse ancora pendente viene abbandonata: il suo risultato non serve più a nessuno
        // (chi chiama ne ha appena richiesta un'altra), e lasciarla finire sprecherebbe il worker
        // sul dump sbagliato. Terminarlo interrompe davvero il calcolo in corso, non solo la promessa.
        if (pending.size > 0) {
          failAll("analisi abbandonata: superata da una più recente")
          worker?.terminate()
          worker = null
        }
        const id = nextId++
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error("il parser non ha risposto in tempo"))
          // Il worker che non ha risposto in tempo resta bloccato sull'analisi abbandonata: va
          // trattato come inutilizzabile esattamente come nel percorso `error` sopra, altrimenti
          // le richieste successive si accodano a un worker che non risponderà mai (misurato:
          // 4,5 s invece dei ~50 ms normali). Le altre richieste eventualmente ancora in corso
          // sullo stesso worker non possono più essere servite — il worker sta per morire — quindi
          // si rigettano qui con un messaggio esplicito: lasciarle appese per sempre sarebbe peggio.
          failAll("il parser non ha risposto in tempo: il worker è stato terminato e rimpiazzato")
          worker?.terminate()
          worker = null
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        ensure().postMessage({ id, dialect, ddl })
      }),
    dispose: () => {
      failAll("analisi annullata")
      worker?.terminate()
      worker = null
    },
  }
}
