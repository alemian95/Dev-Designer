/**
 * End-to-end della persistenza (spec §7): build di produzione servita da `vite preview`, Chrome di
 * sistema headless, `?fallback=1` perché Playwright non pilota i dialoghi nativi della File System
 * Access API. Copre: disegna → autosave → ricarica → ritrova; salva (download) → nuovo → carica il
 * file → ritrova; seconda scheda in sola lettura → prendi il controllo.
 *
 * Uso: `pnpm e2e`. `HEADLESS=0` per vedere il browser.
 */
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { chromium } from "playwright"

const PORT = 4174
const BASE = `http://localhost:${PORT}/?fallback=1`
const ENTITY = "utenti"

const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
/** Errori della pagina raccolti dai listener: si controllano alla fine di ogni passo, perché lanciare dentro un listener non arriva al try/catch. */
const pageErrors = []
let failed = false
try {
  await waitFor(BASE)
  const browser = await launch()
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  watch(page)

  await step("disegna un'entità e la nomina", async () => {
    await page.goto(BASE)
    await page.waitForSelector("[data-canvas]")
    await page.keyboard.press("e")
    // Non `[data-canvas]`: è il rect di sfondo della griglia, largo 100 000px e centrato sull'origine
    // del mondo — il suo boundingBox esce dal viewport e il click cade fuori schermo. L'elemento
    // clippato alla vista è l'<svg> che lo contiene (stesso locator di `scripts/perf/fps.mjs`).
    const canvas = await page.locator("svg.dd-canvas").boundingBox()
    await page.mouse.click(canvas.x + 300, canvas.y + 200)
    const input = page.locator('[aria-label="Nome entità"]')
    await input.waitFor()
    await input.fill(ENTITY)
    await input.press("Enter")
    await expectNodes(page, 1)
    await expectText(page, "[data-node-id]", ENTITY)
    await expectDirty(page, true)
  })

  await step("dopo il ricaricamento l'entità è ancora lì", async () => {
    await page.waitForTimeout(800) // oltre il debounce dell'autosave (400 ms)
    await page.reload()
    await page.waitForSelector("[data-canvas]")
    await expectNodes(page, 1)
    await expectText(page, "[data-node-id]", ENTITY)
    await expectDirty(page, true)
  })

  let saved
  await step("salva scarica un .dd.json valido e spegne il pallino", async () => {
    const download = page.waitForEvent("download")
    // Il nome accessibile della voce include la scorciatoia ("Salva ⌘S"): `/^Salva$/` non la trova
    // mai e resta in attesa finché scade. "Salva con nome…" inizia allo stesso modo, quindi si separa
    // per esclusione invece che per prefisso.
    await pickFromMenu(page, page.getByRole("menuitem").filter({ hasText: "Salva" }).filter({ hasNotText: "con nome" }))
    const d = await download
    if (!d.suggestedFilename().endsWith(".dd.json")) throw new Error(`nome inatteso: ${d.suggestedFilename()}`)
    saved = await readFile(await d.path(), "utf8")
    const parsed = JSON.parse(saved)
    if (!parsed.diagram?.model?.entities?.[ENTITY]) throw new Error("il file non contiene l'entità")
    await expectDirty(page, false)
  })

  await step("nuovo documento: canvas vuoto", async () => {
    await pickFromMenu(page, page.getByRole("menuitem", { name: "Nuovo" }))
    await expectNodes(page, 0)
  })

  await step("caricare il file salvato ritrova l'entità", async () => {
    await page.locator("#upload-input").setInputFiles({ name: `${ENTITY}.dd.json`, mimeType: "application/json", buffer: Buffer.from(saved) })
    await expectNodes(page, 1)
    await expectText(page, "[data-node-id]", ENTITY)
    await expectDirty(page, false)
  })

  await step("un file non valido non carica niente e avvisa", async () => {
    await page.locator("#upload-input").setInputFiles({ name: "rotto.dd.json", mimeType: "application/json", buffer: Buffer.from("{}") })
    await page.waitForSelector("[data-notice-bar]")
    await expectText(page, "[data-notice-bar]", "File non valido")
    // Il confine di fiducia non è solo "non carica": niente deve essere cambiato. Il conteggio dei
    // nodi da solo non lo dice — un nodo sostituito o rinominato passerebbe inosservato.
    await expectNodes(page, 1)
    await expectText(page, "[data-node-id]", ENTITY)
    await expectDirty(page, false)
  })

  await step("una seconda scheda apre in sola lettura e può prendere il controllo", async () => {
    const second = await context.newPage()
    watch(second)
    await second.goto(BASE)
    await second.waitForSelector("[data-canvas]")
    await second.waitForSelector("[data-take-control]")
    await expectNodes(second, 1)
    await second.locator("[data-take-control]").click()
    await second.waitForSelector("[data-take-control]", { state: "detached" })
    await page.waitForSelector("[data-take-control]")
    await second.close()
  })

  await browser.close()
} catch (e) {
  failed = true
  // Non solo `e.message`: il "call log" di Playwright dice quale locator ha aspettato invano,
  // e senza quello un timeout non si diagnostica.
  console.error("\nFALLITO:", e)
} finally {
  preview.kill()
}
process.exitCode = failed ? 1 : 0
console.log(failed ? "\ne2e persistenza: FAIL" : "\ne2e persistenza: PASS")

// ————— infrastruttura —————

async function step(name, fn) {
  process.stdout.write(`• ${name} … `)
  await fn()
  if (pageErrors.length > 0) throw new Error(`durante "${name}": ${pageErrors.splice(0).join(" | ")}`)
  console.log("ok")
}

function watch(page) {
  page.on("pageerror", (err) => pageErrors.push(`errore nella pagina: ${err.message}`))
  page.on("console", (msg) => { if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`) })
}

async function launch() {
  const headless = process.env.HEADLESS !== "0"
  try {
    return await chromium.launch({ channel: "chrome", headless })
  } catch {
    console.warn("Chrome di sistema non trovato: uso il Chromium di Playwright (pnpm exec playwright install chromium)")
    return chromium.launch({ headless })
  }
}

async function waitFor(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch { /* il server non è ancora su */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`vite preview non risponde su ${url}`)
}

async function expectNodes(page, n) {
  await page.waitForFunction((n) => document.querySelectorAll("[data-node-id]").length === n, n, { timeout: 5000 })
}

async function expectText(page, selector, text) {
  await page.waitForFunction(([s, t]) => [...document.querySelectorAll(s)].some((el) => el.textContent.includes(t)), [selector, text], { timeout: 5000 })
}

async function expectDirty(page, dirty) {
  const sel = '[data-document-menu] [aria-label="Modifiche non salvate"]'
  await page.waitForSelector(sel, { state: dirty ? "attached" : "detached", timeout: 5000 })
}

/**
 * Aspetta che il menu documento sia davvero aperto o davvero chiuso. Il `data-state` del trigger
 * non basta: torna "closed" mentre Radix sta ancora smontando il pannello e mentre `body` ha
 * ancora `pointer-events: none`, e un click che cade in quella finestra si perde.
 */
async function expectMenu(page, state) {
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
async function pickFromMenu(page, item) {
  await expectMenu(page, "closed")
  await page.locator("[data-document-menu]").click()
  await expectMenu(page, "open")
  await item.click()
  await expectMenu(page, "closed")
}
