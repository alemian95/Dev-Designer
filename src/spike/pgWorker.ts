import { parse } from "libpg-query"

self.onmessage = async (ev: MessageEvent<string>) => {
  // pg_dump emette i meta-comandi psql `\restrict` / `\unrestrict`: non sono SQL e libpg-query li rifiuta.
  const sql = ev.data
    .split("\n")
    .filter((l) => !l.startsWith("\\"))
    .join("\n")
  const t0 = performance.now()
  try {
    const result = await parse(sql)
    postMessage({ ms: Math.round(performance.now() - t0), stmts: result.stmts.length })
  } catch (err) {
    postMessage({ error: String(err) })
  }
}
