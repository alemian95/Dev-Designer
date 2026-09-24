/**
 * End-to-end del canvas unificato: un'entità, una classe e un nodo di flusso nello stesso documento.
 * Prova quello che senza un browser vero non esiste: che le chiavi del DOM portino la famiglia, che
 * Collega fra un'entità e un nodo di flusso non crei niente e lo dica, mentre dentro una famiglia
 * collega, che il documento misto sopravviva a un ricaricamento, che Disponi metta le famiglie in
 * fila senza sovrapposizioni, e che l'export testo offra i formati di tutte e tre.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/misto.mjs`. `HEADLESS=0` per vedere.
 */
import { expectMenu, expectNodes, expectText, isMainModule, nodeRects, overlappingPairs, pickFromMenu, signature, startEnv } from "./helpers.mjs"

/** Centro in coordinate schermo del primo nodo la cui chiave inizia con `prefix`. */
async function centerOf(page, prefix, index = 0) {
  const rect = (await nodeRects(page)).filter((r) => r.id.startsWith(prefix))[index]
  if (!rect) throw new Error(`nessun nodo ${prefix}…[${index}]`)
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
}

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

    await step("Nuovo documento: il canvas è vuoto", async () => {
      await pickFromMenu(page, page.getByRole("menuitem", { name: "Nuovo documento" }))
      await expectNodes(page, 0)
    })

    const canvas = await page.locator("svg.dd-canvas").boundingBox()
    /** Crea un nodo con la scorciatoia e chiude l'editor che la creazione apre da sé. */
    async function create(key, x, y, n) {
      await page.keyboard.press(key)
      await page.mouse.click(canvas.x + x, canvas.y + y)
      await expectNodes(page, n)
      await page.keyboard.press("Escape")
      // Solo gli editor sul canvas: il pannello proprietà ha altri campi con `aria-label`, e restano.
      await page.waitForFunction(() => !document.querySelector('[aria-label="Nome entità"], [aria-label="Nome classe"], [aria-label="Testo del nodo"]'))
    }

    await step("un'entità, una classe e un processo sullo stesso canvas", async () => {
      await create("e", 200, 320, 1)
      await create("c", 650, 320, 2)
      // Il processo finisce nella banda della prima corsia (y 0–160 nel mondo): sta sopra gli altri due.
      await create("2", 400, 60, 3)
      const ids = (await nodeRects(page)).map((r) => r.id.split("/")[0]).sort()
      if (ids.join(",") !== "class,er,flow") throw new Error(`famiglie inattese: ${ids.join(",")}`)
    })

    await step("Collega fra un'entità e un nodo di flusso non crea niente, e lo dice", async () => {
      await page.keyboard.press("r")
      await drag(page, await centerOf(page, "er/"), await centerOf(page, "flow/"))
      await expectText(page, "[data-notice-bar]", "Non esiste un collegamento fra un'entità e un nodo di flusso.")
      if ((await page.locator("[data-edge-id]").count()) !== 0) throw new Error("è nato un arco fra due famiglie senza tipo")
      await page.keyboard.press("Escape")
    })

    await step("una seconda entità, e Collega fra le due crea una relazione ER", async () => {
      await create("e", 200, 560, 4)
      await page.keyboard.press("r")
      await drag(page, await centerOf(page, "er/", 0), await centerOf(page, "er/", 1))
      await page.waitForSelector('[data-edge-id^="er/"]')
    })

    await step("ricarica: i quattro nodi e la relazione ci sono ancora", async () => {
      await page.waitForTimeout(800) // oltre il debounce dell'autosave (400 ms)
      await page.reload()
      await page.waitForSelector("[data-canvas]")
      await expectNodes(page, 4)
      await page.waitForSelector('[data-edge-id^="er/"]')
    })

    await step("Disponi: le famiglie in fila da sinistra a destra, nessuna sovrapposizione", async () => {
      const before = await signature(page)
      await page.getByRole("button", { name: "Disponi" }).click()
      await page.waitForFunction((b) => {
        const now = [...document.querySelectorAll("[data-node-id]")].map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`).sort().join("|")
        return now !== b
      }, before, { timeout: 15000 })
      const rects = await nodeRects(page)
      const overlaps = overlappingPairs(rects)
      if (overlaps.length > 0) throw new Error(`nodi sovrapposti: ${overlaps.join(", ")}`)
      const of = (p) => rects.filter((r) => r.id.startsWith(p))
      const right = (rs) => Math.max(...rs.map((r) => r.x + r.w))
      const left = (rs) => Math.min(...rs.map((r) => r.x))
      if (!(right(of("er/")) < left(of("class/")))) throw new Error("il blocco ER non sta a sinistra delle classi")
      if (!(right(of("class/")) < left(of("flow/")))) throw new Error("il blocco delle classi non sta a sinistra del flusso")
    })

    await step("Esporta testo offre i formati delle tre famiglie", async () => {
      // Non `pickFromMenu`: la voce apre un dialog modale che tiene `body` bloccato finché resta
      // aperto (stesso motivo di `class.mjs` ed `export-testo.mjs`), e la seconda attesa di
      // `pickFromMenu` — menu richiuso **e** `body` sbloccato — non si avvera mai in quel caso.
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: "Esporta testo…" }).click()
      await page.waitForSelector("[data-text-export-dialog]")
      for (const name of ["PostgreSQL", "MySQL", "Mermaid ER", "Mermaid classi", "Mermaid flowchart"]) {
        if ((await page.getByRole("radio", { name, exact: true }).count()) !== 1) throw new Error(`manca il formato ${name}`)
      }
      await page.getByRole("radio", { name: "Mermaid classi", exact: true }).click()
      await page.waitForFunction(() => document.querySelector("[data-export-preview]")?.textContent.startsWith("classDiagram"))
      await page.keyboard.press("Escape")
      await page.waitForSelector("[data-text-export-dialog]", { state: "detached" })
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (misto):", e)
  }
  console.log(failed ? "\ne2e misto: FAIL" : "\ne2e misto: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/misto.mjs` esegue solo questo scenario. */
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
