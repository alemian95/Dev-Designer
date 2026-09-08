import type { ParseRequest, ParseResponse } from "./parse-client"

/**
 * In un worker `self` non è `Window`: il tipo `DedicatedWorkerGlobalScope` sta in `lib.webworker`, che
 * questo progetto non carica (ha `lib` DOM, e mescolarle dà dichiarazioni duplicate). Qui si dichiara
 * il minimo che serve, che ombreggia il globale solo per questo modulo.
 */
declare const self: {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null
  postMessage: (message: ParseResponse) => void
}

/**
 * Un worker unico per i due dialetti: `import()` dinamico tiene i due parser in chunk separati, quindi
 * chi importa Postgres non scarica `node-sql-parser` e viceversa. Due worker separati avrebbero
 * raddoppiato protocollo e protezione senza guadagnare questa proprietà, che viene dall'`import()`.
 */
self.onmessage = (event) => {
  const { id, dialect, ddl } = event.data
  const run = async (): Promise<ParseResponse> => {
    try {
      const result =
        dialect === "postgres"
          ? await (await import("./pg")).parsePostgres(ddl)
          : (await import("./mysql")).parseMysql(ddl)
      return { id, ok: true, result }
    } catch (e) {
      return { id, ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
  void run().then((response) => self.postMessage(response))
}
