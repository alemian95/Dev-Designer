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
 * Un worker unico per i due dialetti, con l'adapter caricato da un `import()` dinamico. Ma quell'
 * `import()` **non** tiene i due parser in chunk separati: il formato di default dei worker in Vite è
 * `iife`, che disabilita il code splitting. Verificato su `dist/` dopo `pnpm build`: c'è un solo
 * `parse.worker-*.js` (332 KB) che contiene sia `create_definitions` (node-sql-parser) sia il
 * riferimento a `libpg-query.wasm`, senza alcun `import(` residuo — chi importa Postgres scarica
 * comunque tutto `node-sql-parser`, e viceversa. Ciò che resta davvero pigro è il `.wasm` di
 * libpg-query (~1,1 MB): non è incorporato nel chunk, si carica solo alla prima parse, ed è lui il
 * peso grosso da non scaricare a vuoto.
 * `worker.format: "es"` (in `vite.config.ts`) renderebbe vero lo splitting fra i due parser, ma non si
 * tocca qui: è l'unica leva che governa l'interop di `node-sql-parser` (UMD/CJS) dentro un module
 * worker, verificata a mano una volta sola ed è l'unico punto fragile di questa catena che funziona.
 * Due worker separati avrebbero comunque raddoppiato protocollo e protezione (`onerror`, timeout,
 * `terminate`) senza risolvere questo.
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
