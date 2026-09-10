/**
 * End-to-end dell'auto layout: importa un DDL → sposta un nodo dove il layout non lo metterebbe →
 * clicca Disponi → verifica il risultato → annulla.
 *
 * È il solo collaudo che prova che **elkjs si carica davvero**: i test unitari usano un worker
 * finto, quindi un bundle UMD che non si risolve nel worker passerebbe tutta la suite e fallirebbe
 * solo qui. Le tre asserzioni sono quelle che un layout rotto sbaglia: le posizioni cambiano,
 * nessuna coppia di nodi si sovrappone, e un ⌘Z rimette esattamente quelle di prima.
 *
 * L'asserzione sulle sovrapposizioni non è di routine: nello spike dell'ADR 0006 è quella che ha
 * smascherato `stress`, che su area e incroci sembrava il vincitore e impilava le scatole.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/layout.mjs`. `HEADLESS=0` per vedere.
 */
import { expectMenu, expectNodes, isMainModule, startEnv } from "./helpers.mjs"

const DDL = `CREATE TABLE mittente (id bigint PRIMARY KEY, etichetta text NOT NULL);
CREATE TABLE recapito (id bigint PRIMARY KEY, mittente_id bigint NOT NULL REFERENCES mittente(id));
CREATE TABLE nota (id bigint PRIMARY KEY, recapito_id bigint NOT NULL REFERENCES recapito(id));`

/** Firma delle posizioni letta dal DOM: chiave e attributo `transform`, ordinati. */
async function signature(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-node-id]")]
      .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
      .sort()
      .join("|"),
  )
}

/**
 * Rettangoli dei nodi in coordinate schermo, letti da `getBoundingClientRect` sul `<rect>`.
 *
 * Niente parsing del `transform`: il suo formato è un dettaglio del renderer, e sbagliare la
 * regex darebbe un test che passa senza verificare niente. Lo zoom è una trasformazione uniforme,
 * quindi due nodi si sovrappongono sullo schermo se e solo se si sovrappongono nel mondo — e dopo
 * il layout la vista si adatta, quindi sono tutti dentro il viewport.
 */
async function rects(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-node-id]")].map((g) => {
      const r = g.querySelector("rect").getBoundingClientRect()
      return { id: g.getAttribute("data-node-id"), x: r.x, y: r.y, w: r.width, h: r.height }
    }),
  )
}

/** Le coppie di nodi che si sovrappongono. Vuoto è l'unico risultato accettabile. */
function overlappingPairs(rects) {
  const out = []
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`${a.id}/${b.id}`)
    }
  return out
}

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

    await step("importa un DDL: tre entità e due relazioni da disporre", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: /Importa DDL/ }).click()
      await page.waitForSelector("[data-import-dialog]")
      await page.locator('[aria-label="DDL"]').click()
      await page.evaluate((text) => {
        const area = document.querySelector('[aria-label="DDL"]')
        const data = new DataTransfer()
        data.setData("text", text)
        area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
      }, DDL)
      await page.waitForSelector("[data-import-summary]", { timeout: 30_000 })
      await page.getByRole("button", { name: /^Importa 3 tabelle$/ }).click()
      await expectNodes(page, 3)
      await page.getByRole("button", { name: "Chiudi" }).click()
      await page.waitForSelector("[data-import-dialog]", { state: "detached" })
    })

    let before
    await step("sposta un nodo dove il layout non lo metterebbe", async () => {
      // Trascinare è già coperto da altre scene: qui serve solo una posizione di partenza che il
      // layout dovrà cambiare, e la griglia dell'import non la fornisce da sé.
      const box = await page.locator("[data-node-id]").first().boundingBox()
      await page.mouse.move(box.x + 20, box.y + 10)
      await page.mouse.down()
      await page.mouse.move(box.x + 620, box.y + 410, { steps: 8 })
      await page.mouse.up()
      before = await signature(page)
    })

    await step("Disponi: le posizioni cambiano e nessun nodo si sovrappone", async () => {
      await page.getByRole("button", { name: "Disponi" }).click()
      // Il worker nasce alla prima richiesta e elkjs pesa ~1,5 MB: l'attesa è generosa di proposito.
      await page.waitForFunction((before) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now !== before
      }, before, { timeout: 30_000 })

      const overlapping = overlappingPairs(await rects(page))
      if (overlapping.length > 0) throw new Error(`nodi sovrapposti dopo il layout: ${overlapping.join(", ")}`)
    })

    await step("un solo ⌘Z rimette tutte le posizioni di prima", async () => {
      await page.keyboard.press("Meta+z")
      await page.waitForFunction((expected) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now === expected
      }, before, { timeout: 10_000 })
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (layout):", e)
  }
  console.log(failed ? "\ne2e layout: FAIL" : "\ne2e layout: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/layout.mjs` esegue solo questo scenario. */
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
