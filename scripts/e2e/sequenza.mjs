/**
 * End-to-end della famiglia sequence (spec §10): lo strumento Sequenza (`S`) crea una sequenza con
 * «A», «B» e un messaggio; Collega fra le due intestazioni aggiunge un messaggio; il trascinamento
 * dell'intestazione di «B» prima di «A» riordina le colonne e ⌘Z lo ripristina; il pannello cambia
 * la punta del messaggio; una Nota ancorata a un partecipante si stacca quando questo è eliminato;
 * l'export testo «Mermaid sequenze» propone `.mmd`, e `.md` con due sequenze.
 * L'import Mermaid è in `import-mermaid.mjs`.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/sequenza.mjs`. `HEADLESS=0` per vedere.
 */
import { expectMenu, expectText, isMainModule, startEnv } from "./helpers.mjs"

const SEQUENCE = '[data-node-id^="sequence/"]'
const NOTE = '[data-node-id^="note/"]'

/** Rettangolo schermo di un locator. */
async function boxOf(locator) {
  const box = await locator.first().boundingBox()
  if (!box) throw new Error("elemento senza riquadro")
  return { x: box.x, y: box.y, w: box.width, h: box.height }
}

/** Trascina con eventi veri da `from` a `to`. */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** L'intestazione di un partecipante: il gruppo che ha il nome come testo diretto. */
const head = (page, name) => page.locator(`${SEQUENCE}:has(> [data-sequence-text])`).filter({ hasText: new RegExp(`^${name}$`) })

/** I nomi dei partecipanti, da sinistra a destra. */
const columns = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-node-id^="sequence/"] > text[data-sequence-text]')]
      .filter((t) => t.parentElement.querySelector(":scope > rect, :scope > circle, :scope > g"))
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
      .map((t) => t.textContent),
  )

/** Le righe dei messaggi (un solo `data-node-id` con tre segmenti, senza testo diretto). */
const messageCount = (page) => page.locator(`${SEQUENCE}:has(> path)`).count()

/** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
export async function run(browser, base) {
  const pageErrors = []
  let failed = false

  async function step(name, body) {
    process.stdout.write(`• ${name}… `)
    await body()
    pageErrors.push(...(await page.evaluate(() => window.__rejections.splice(0))))
    if (pageErrors.length > 0) throw new Error(`errori nella pagina: ${pageErrors.splice(0).join(" | ")}`)
    process.stdout.write("ok\n")
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on("pageerror", (e) => pageErrors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()))
  await page.addInitScript(() => {
    window.__rejections = []
    addEventListener("unhandledrejection", (e) => window.__rejections.push(String(e.reason?.stack ?? e.reason)))
  })

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")
    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("lo strumento Sequenza (S) crea una sequenza con «A», «B» e un messaggio", async () => {
      await page.keyboard.press("s")
      await page.mouse.click(canvas.x + 80, canvas.y + 80)
      await page.waitForSelector("[data-lifeline]", { state: "attached" })
      await page.keyboard.press("Escape")
      const names = await columns(page)
      if (names.join() !== "A,B") throw new Error(`attesi i partecipanti A,B, trovati ${names}`)
      if ((await messageCount(page)) !== 1) throw new Error("atteso un messaggio")
    })

    await step("Collega fra le due intestazioni aggiunge un messaggio", async () => {
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(head(page, "B"))), center(await boxOf(head(page, "A"))))
      await page.waitForFunction((sel) => document.querySelectorAll(`${sel}:has(> path)`).length === 2, SEQUENCE)
    })

    await step("trascinare l'intestazione di «B» prima di «A» riordina le colonne, e ⌘Z le ripristina", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      const a = await boxOf(head(page, "A"))
      const b = await boxOf(head(page, "B"))
      await drag(page, center(b), { x: a.x - 10, y: center(b).y })
      await page.waitForFunction(() => document.querySelector("[data-lifeline]") !== null)
      await expectColumns(page, "B,A")
      await page.keyboard.press("ControlOrMeta+z")
      await expectColumns(page, "A,B")
    })

    await step("il pannello cambia la punta del messaggio", async () => {
      await page.keyboard.press("Escape")
      const row = page.locator(`${SEQUENCE}:has(> path)`).first()
      const before = await row.innerHTML()
      const r = await boxOf(row)
      await page.mouse.click(r.x + 20, r.y + 4)
      await page.selectOption("#message-head", "cross")
      await page.waitForFunction(([sel, html]) => document.querySelector(`${sel}:has(> path)`)?.innerHTML !== html, [SEQUENCE, before])
    })

    await step("una Nota ancorata a un partecipante si stacca quando lo si elimina", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("n")
      await page.mouse.click(canvas.x + 80, canvas.y + 450)
      const noteEditor = page.locator('[aria-label="Testo della nota"]')
      await noteEditor.waitFor()
      await noteEditor.fill("da rivedere")
      await noteEditor.blur()
      await noteEditor.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(page.locator(NOTE))), center(await boxOf(head(page, "B"))))
      await page.waitForSelector('[data-edge-id^="note/"]')
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      const n = center(await boxOf(page.locator(NOTE)))
      await page.mouse.click(n.x, n.y)
      await expectText(page, "body", "Ancorata a:")
      await page.keyboard.press("Escape")
      const h = center(await boxOf(head(page, "B")))
      await page.mouse.click(h.x, h.y)
      await page.keyboard.press("Delete")
      await page.waitForFunction(() => document.querySelectorAll('[data-edge-id^="note/"]').length === 0)
      await expectColumns(page, "A")
      if ((await page.locator(NOTE).count()) !== 1) throw new Error("la nota è sparita con il partecipante")
    })

    await step("export testo: «Mermaid sequenze» con una sequenza propone .mmd, con due .md", async () => {
      await openExport(page)
      await expectText(page, "[data-export-preview]", "sequenceDiagram")
      if (!(await downloadName(page)).endsWith(".mmd")) throw new Error("con una sequenza attesa l'estensione .mmd")
      await page.keyboard.press("Escape")
      await page.waitForSelector("[data-text-export-dialog]", { state: "detached" })
      await page.keyboard.press("s")
      await page.mouse.click(canvas.x + 500, canvas.y + 80)
      await page.waitForFunction((sel) => new Set([...document.querySelectorAll(sel)].map((e) => e.getAttribute("data-node-id").split("/")[1])).size === 2, SEQUENCE)
      await page.keyboard.press("Escape")
      await openExport(page)
      if (!(await downloadName(page)).endsWith(".md")) throw new Error("con due sequenze attesa l'estensione .md")
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (sequenza):", e)
  }
  console.log(failed ? "\ne2e sequenza: FAIL" : "\ne2e sequenza: PASS")
  return !failed
}

async function expectColumns(page, expected) {
  await page.waitForFunction(
    ([sel, want]) =>
      [...document.querySelectorAll(`${sel} > text[data-sequence-text]`)]
        .filter((t) => t.parentElement.querySelector(":scope > rect, :scope > circle, :scope > g"))
        .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
        .map((t) => t.textContent)
        .join() === want,
    [SEQUENCE, expected],
  )
}

/** Apre «Esporta testo…» sul formato delle sequenze (l'unico, o il primo con questo nome). */
async function openExport(page) {
  await expectMenu(page, "closed")
  await page.locator("[data-document-menu]").click()
  await expectMenu(page, "open")
  await page.getByRole("menuitem", { name: "Esporta testo…" }).click()
  await page.waitForSelector("[data-text-export-dialog]")
}

/** Il nome del file che «Scarica» propone. */
async function downloadName(page) {
  const download = page.waitForEvent("download", { timeout: 30_000 })
  await page.getByRole("button", { name: "Scarica" }).click()
  return (await download).suggestedFilename()
}

/** Guardia di esecuzione diretta: `node scripts/e2e/sequenza.mjs` esegue solo questo scenario. */
if (isMainModule(import.meta.url)) {
  let ok = false
  let preview, browser
  try {
    let base
    ;({ preview, browser, base } = await startEnv())
    ok = await run(browser, base)
  } catch (e) {
    console.error("\nFALLITO:", e)
  } finally {
    await browser?.close()
    preview?.kill()
  }
  process.exit(ok ? 0 : 1)
}
