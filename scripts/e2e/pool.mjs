/**
 * End-to-end dei pool (spec 2b §9): un processo libero, un pool creato con `P`, il processo che
 * prende la corsia trascinato dentro e torna libero trascinato fuori, il pool spostato
 * dall'intestazione che porta con sé il nodo che contiene, Canc sul pool che lo elimina lasciando
 * il nodo libero, e un file della versione 5 caricato che ritrova le sue corsie in un pool «Pool 1».
 *
 * La pagina si apre su `${base}?fallback=1`, come `persistenza.mjs`: l'ultimo passo carica un file
 * dall'`#upload-input`, e Playwright non pilota i dialoghi nativi della File System Access API.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/pool.mjs`. `HEADLESS=0` per vedere.
 */
import { expectNodes, expectText, isMainModule, startEnv } from "./helpers.mjs"

/** Rettangolo schermo del nodo di flusso che mostra `label` (il suo `<path>`), escluso ogni pool. */
async function rectByLabel(page, label) {
  return page.evaluate((label) => {
    const g = [...document.querySelectorAll('[data-node-id^="flow/"]:not([data-pool])')].find((el) => el.textContent.includes(label))
    if (!g) return null
    const r = g.querySelector("path").getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, label)
}

/** Rettangolo schermo della prima banda di corsia del primo pool. */
async function firstBand(page) {
  return page.evaluate(() => {
    const r = document.querySelector('[data-layer="pools"] [data-pool] > g > rect')?.getBoundingClientRect()
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
  })
}

/** Trascina con eventi veri dal centro di `from` a `to`. */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** Un documento della versione 5: due corsie e un nodo, com'erano prima del 2b. */
const V5 = {
  schemaVersion: 5,
  id: "v5",
  name: "vecchio",
  diagram: {
    er: { model: { entities: {}, relationships: {} }, view: { nodes: {} } },
    class: { model: { classes: {}, relations: {}, notes: {} }, view: { nodes: {} } },
    flow: {
      model: { lanes: [{ id: "l1", name: "Cliente" }, { id: "l2", name: "Negozio" }], nodes: { n1: { label: "Ordina", shape: "process", lane: "l1" } }, edges: {} },
      view: { nodes: { n1: { x: 100, y: 20, collapsed: false } }, lanes: { l1: { y: 0, h: 160 }, l2: { y: 160, h: 160 } } },
    },
    links: {},
  },
}

/** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
export async function run(browser, base) {
  const BASE = `${base}?fallback=1`
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

  const nodeText = page.locator('[aria-label="Testo del nodo"]')

  try {
    await page.goto(BASE)
    await page.waitForSelector("[data-canvas]")
    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("un processo libero, e nessuna banda sul canvas", async () => {
      await page.keyboard.press("2")
      await page.mouse.click(canvas.x + 100, canvas.y + 400)
      await nodeText.waitFor()
      await nodeText.fill("Verifica")
      await nodeText.blur()
      await nodeText.waitFor({ state: "detached" })
      await expectNodes(page, 1)
      if ((await page.locator("[data-pool]").count()) !== 0) throw new Error("c'è un pool che nessuno ha creato")
    })

    await step("un pool con P; il processo trascinato dentro prende la corsia, e fuori torna libero", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("p")
      await page.mouse.click(canvas.x + 300, canvas.y + 40)
      await page.waitForSelector("[data-pool]")
      const band = await firstBand(page)
      await drag(page, center(await rectByLabel(page, "Verifica")), center(band))
      await page.waitForFunction(() => document.querySelector("#flow-node-lane")?.value !== "")
      await drag(page, center(await rectByLabel(page, "Verifica")), { x: canvas.x + 100, y: canvas.y + 400 })
      await page.waitForFunction(() => document.querySelector("#flow-node-lane")?.value === "")
    })

    await step("il pool spostato dall'intestazione porta con sé il nodo che contiene", async () => {
      await drag(page, center(await rectByLabel(page, "Verifica")), center(await firstBand(page)))
      await page.waitForFunction(() => document.querySelector("#flow-node-lane")?.value !== "")
      const before = await rectByLabel(page, "Verifica")
      const header = await page.locator("[data-pool-header]").boundingBox()
      await drag(page, { x: header.x + header.width / 2, y: header.y + 20 }, { x: header.x + header.width / 2 + 200, y: header.y + 20 })
      await page.waitForFunction((x0) => {
        const g = [...document.querySelectorAll('[data-node-id^="flow/"]:not([data-pool])')].find((el) => el.textContent.includes("Verifica"))
        return g && Math.abs(g.querySelector("path").getBoundingClientRect().x - (x0 + 200)) < 2
      }, before.x)
    })

    await step("Canc sul pool: il pool sparisce e il nodo resta", async () => {
      const header = await page.locator("[data-pool-header]").boundingBox()
      await page.mouse.click(header.x + header.width / 2, header.y + 20)
      await page.keyboard.press("Delete")
      await page.waitForFunction(() => document.querySelectorAll("[data-pool]").length === 0)
      await expectNodes(page, 1)
    })

    await step("un file v5 caricato ha un pool «Pool 1» con le corsie di prima", async () => {
      await page.locator("#upload-input").setInputFiles({ name: "vecchio.dd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(V5)) })
      await expectText(page, "[data-pool]", "Pool 1")
      await expectText(page, "[data-pool]", "Cliente")
      await expectText(page, "[data-pool]", "Negozio")
      await expectNodes(page, 1)
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (pool):", e)
  }
  console.log(failed ? "\ne2e pool: FAIL" : "\ne2e pool: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/pool.mjs` esegue solo questo scenario. */
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
