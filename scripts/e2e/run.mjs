/**
 * Punto d'ingresso di `pnpm e2e`: avvia una sola volta il server statico (`vite preview`, sulla
 * build già fatta) e una sola istanza di browser, poi esegue in sequenza — mai in parallelo, perché
 * l'e2e della persistenza esercita il lock fra schede e IndexedDB sulla stessa origine, e due
 * scenari concorrenti se li disturberebbero a vicenda — lo scenario della persistenza e quello
 * dell'import. Ognuno apre il proprio contesto di browser, cosa che isola l'IndexedDB fra i due
 * senza pagare due volte il costo fisso di build, server e avvio del browser.
 *
 * Uso: `pnpm e2e`. `HEADLESS=0` per vedere il browser.
 */
import { spawn } from "node:child_process"
import { launch, waitFor } from "./helpers.mjs"
import { run as runImport } from "./import.mjs"
import { run as runPersistenza } from "./persistenza.mjs"

const PORT = 4174
const BASE = `http://localhost:${PORT}/`

const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
let ok = false
try {
  await waitFor(BASE)
  const browser = await launch()
  const persistenzaOk = await runPersistenza(browser, BASE)
  const importOk = await runImport(browser, BASE)
  await browser.close()
  ok = persistenzaOk && importOk
} catch (e) {
  console.error("\nFALLITO:", e)
} finally {
  preview.kill()
}
process.exit(ok ? 0 : 1)
