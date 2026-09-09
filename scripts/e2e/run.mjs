/**
 * Punto d'ingresso di `pnpm e2e`: avvia una sola volta il server statico (`vite preview`, sulla
 * build già fatta) e una sola istanza di browser, poi esegue in sequenza — mai in parallelo, perché
 * l'e2e della persistenza esercita il lock fra schede e IndexedDB sulla stessa origine, e due
 * scenari concorrenti se li disturberebbero a vicenda — gli scenari della persistenza, dell'import
 * e dell'export. Ognuno apre il proprio contesto di browser, cosa che isola l'IndexedDB fra loro
 * senza pagare due volte il costo fisso di build, server e avvio del browser (avvio condiviso con
 * `helpers.mjs#startEnv`, la stessa funzione usata dalla guardia di esecuzione diretta di ciascuno
 * scenario). Per lanciare un solo scenario in isolamento, dopo `pnpm build`:
 * `node scripts/e2e/import.mjs`, `node scripts/e2e/persistenza.mjs` o `node scripts/e2e/export.mjs`.
 *
 * Uso: `pnpm e2e`. `HEADLESS=0` per vedere il browser.
 */
import { run as runExport } from "./export.mjs"
import { startEnv } from "./helpers.mjs"
import { run as runImport } from "./import.mjs"
import { run as runPersistenza } from "./persistenza.mjs"

let ok = false
let preview, browser
try {
  let base
  ;({ preview, browser, base } = await startEnv())
  const persistenzaOk = await runPersistenza(browser, base)
  const importOk = await runImport(browser, base)
  const exportOk = await runExport(browser, base)
  ok = persistenzaOk && importOk && exportOk
} catch (e) {
  console.error("\nFALLITO:", e)
} finally {
  await browser?.close()
  preview?.kill()
}
process.exit(ok ? 0 : 1)
