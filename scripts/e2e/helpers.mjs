/**
 * Aiuti puri sul browser condivisi fra gli script e2e: lanciare Chrome, aspettare che il server sia
 * su, avviare l'ambiente completo (server + browser) e le due attese sudate sul menu Radix. `step`,
 * `watch` e la contabilità degli errori restano in ciascuno script perché sono legati al suo esito,
 * non al browser.
 */
import { spawn } from "node:child_process"
import { existsSync, realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

export const PORT = 4174
export const BASE = `http://localhost:${PORT}/`

export async function launch() {
  const headless = process.env.HEADLESS !== "0"
  try {
    return await chromium.launch({ channel: "chrome", headless })
  } catch {
    console.warn("Chrome di sistema non trovato: uso il Chromium di Playwright (pnpm exec playwright install chromium)")
    return chromium.launch({ headless })
  }
}

export async function waitFor(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch { /* il server non è ancora su */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`vite preview non risponde su ${url}`)
}

/**
 * Avvia il server statico su `dist/` e il browser: un solo posto per questa coppia di passi, usato
 * sia da `run.mjs` (che esegue entrambi gli scenari) sia dalla guardia di esecuzione diretta di
 * ciascuno scenario (che ne esegue uno solo) — per non finire con due modi diversi di avviare le
 * stesse cose. Non fa la build: come `run.mjs`, presuppone che `dist/` esista già e lo dice chiaro
 * se manca, invece di lasciar fallire `vite preview` con un errore oscuro. Il chiamante è
 * responsabile di chiudere sia `preview` sia `browser`, anche in caso di fallimento.
 */
export async function startEnv() {
  if (!existsSync(new URL("../../dist/index.html", import.meta.url))) {
    throw new Error("dist/ non trovata: lancia prima `pnpm build`")
  }
  const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
  try {
    await waitFor(BASE)
  } catch (e) {
    preview.kill()
    throw e
  }
  const browser = await launch()
  return { preview, browser, base: BASE }
}

/**
 * Vero se il modulo con questo `import.meta.url` è stato lanciato direttamente da CLI (`node
 * scripts/e2e/import.mjs`), falso se è stato importato da un altro modulo (es. `run.mjs`). Usato
 * dalle guardie di esecuzione diretta di `import.mjs` e `persistenza.mjs`: un solo posto per questo
 * confronto invece di due copie della stessa logica.
 *
 * Il confronto naïve `import.meta.url === \`file://${process.argv[1]}\`` è stato verificato e non
 * regge sempre: su questa stessa macchina `/tmp` è un link simbolico a `/private/tmp`, quindi un
 * file lanciato da lì ha `import.meta.url` con il percorso già risolto dal loader di Node mentre
 * `process.argv[1]` resta quello passato in CLI, non risolto — non combaciano. Nemmeno
 * `path.resolve()` li riconcilia: normalizza il percorso ma non segue i link simbolici. Si
 * confrontano invece i percorsi risolti con `fs.realpathSync`, che i link li segue davvero:
 * verificato che combacia sia per l'invocazione diretta sia passando per un link simbolico.
 */
export function isMainModule(moduleUrl) {
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(process.argv[1] ?? "")
  } catch {
    return false
  }
}

export async function expectNodes(page, n) {
  await page.waitForFunction((n) => document.querySelectorAll("[data-node-id]").length === n, n, { timeout: 5000 })
}

export async function expectText(page, selector, text) {
  await page.waitForFunction(([s, t]) => [...document.querySelectorAll(s)].some((el) => el.textContent.includes(t)), [selector, text], { timeout: 5000 })
}

/**
 * Aspetta che il menu documento sia davvero aperto o davvero chiuso. Il `data-state` del trigger
 * non basta: torna "closed" mentre Radix sta ancora smontando il pannello e mentre `body` ha
 * ancora `pointer-events: none`, e un click che cade in quella finestra si perde.
 */
export async function expectMenu(page, state) {
  await page.waitForFunction((s) => {
    const open = document.querySelector("[data-document-menu]")?.dataset.state === "open"
    const panels = document.querySelectorAll('[role="menu"]').length
    const blocked = getComputedStyle(document.body).pointerEvents === "none"
    return s === "open" ? open && panels === 1 : !open && panels === 0 && !blocked
  }, state, { timeout: 5000 })
}

/**
 * Apre il menu documento e clicca una voce. Le due attese non sono decorative: cliccare il trigger
 * mentre il menu precedente si sta ancora chiudendo lo richiude, e il click cade su una voce che
 * si stacca dal DOM sotto le mani di Playwright ("element is not stable" e poi "detached").
 */
export async function pickFromMenu(page, item) {
  await expectMenu(page, "closed")
  await page.locator("[data-document-menu]").click()
  await expectMenu(page, "open")
  await item.click()
  await expectMenu(page, "closed")
}

/**
 * Firma delle posizioni letta dal DOM: chiave e attributo `transform`, ordinati.
 * Serve a aspettare che «Disponi» o altre operazioni di layout abbiano davvero
 * cambiato le posizioni dei nodi.
 */
export async function signature(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-node-id]")]
      .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
      .sort()
      .join("|"),
  )
}
