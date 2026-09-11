/**
 * End-to-end della persistenza (spec §7): `?fallback=1` perché Playwright non pilota i dialoghi
 * nativi della File System Access API. Copre: disegna → autosave → ricarica → ritrova; salva
 * (download) → nuovo → carica il file → ritrova; seconda scheda in sola lettura → prendi il
 * controllo.
 *
 * Il server statico e il browser sono avviati una sola volta da `scripts/e2e/run.mjs` e condivisi
 * con lo scenario dell'import: questa funzione apre solo il proprio contesto (IndexedDB isolato
 * dagli altri scenari) e non tocca né l'uno né l'altro.
 *
 * Uso: `pnpm e2e` esegue questo scenario insieme a quello dell'import. Per lanciarlo da solo (dopo
 * `pnpm build`): `node scripts/e2e/persistenza.mjs`. `HEADLESS=0` per vedere il browser.
 */
import { readFile } from "node:fs/promises"
import { expectMenu, expectNodes, expectText, isMainModule, pickFromMenu, startEnv } from "./helpers.mjs"

const ENTITY = "utenti"

/** Esegue lo scenario in un proprio contesto del browser condiviso. Restituisce `true` se tutti i passi passano. */
export async function run(browser, base) {
  const BASE = `${base}?fallback=1`
  /** Errori della pagina raccolti dai listener: si controllano alla fine di ogni passo, perché lanciare dentro un listener non arriva al try/catch. */
  const pageErrors = []
  let failed = false

  async function step(name, fn) {
    process.stdout.write(`• ${name} … `)
    await fn()
    if (pageErrors.length > 0) throw new Error(`durante "${name}": ${pageErrors.splice(0).join(" | ")}`)
    console.log("ok")
  }

  function watch(p) {
    p.on("pageerror", (err) => pageErrors.push(`errore nella pagina: ${err.message}`))
    p.on("console", (msg) => { if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`) })
  }

  async function expectDirty(p, dirty) {
    const sel = '[data-document-menu] [aria-label="Modifiche non salvate"]'
    await p.waitForSelector(sel, { state: dirty ? "attached" : "detached", timeout: 5000 })
  }

  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  watch(page)

  try {
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
      // "Nuovo" (Task 13) è un sottomenu, non più una voce diretta: `pickFromMenu` chiude tutto
      // dopo un solo click, quindi qui si apre a mano e si sceglie il tipo nel sottomenu.
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: "Nuovo" }).click()
      await page.getByRole("menuitem", { name: "Diagramma ER" }).click()
      await expectMenu(page, "closed")
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

    await context.close()
  } catch (e) {
    failed = true
    // Non solo `e.message`: il "call log" di Playwright dice quale locator ha aspettato invano,
    // e senza quello un timeout non si diagnostica.
    console.error("\nFALLITO (persistenza):", e)
  }
  console.log(failed ? "\ne2e persistenza: FAIL" : "\ne2e persistenza: PASS")
  return !failed
}

/**
 * Guardia di esecuzione diretta: `node scripts/e2e/persistenza.mjs` esegue solo questo scenario,
 * avviando server e browser con `startEnv` (la stessa funzione di `run.mjs`) invece di richiedere
 * l'altro scenario per forza.
 */
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
