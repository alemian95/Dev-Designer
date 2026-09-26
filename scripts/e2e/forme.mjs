/**
 * End-to-end delle forme generiche (spec 3b §11): Rettangolo (`Q`) ed Ellisse (`O`) nascono col testo
 * aperto; Collega fra le due crea una freccia; dal pannello si cambiano punte e tratteggio e la si
 * inverte; la maniglia allarga il rettangolo e ⌘Z lo riporta com'era; una nota si ancora al
 * rettangolo; «Disponi» tiene freccia e nota; Collega fra una forma e un'entità è rifiutato.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/forme.mjs`. `HEADLESS=0` per vedere.
 */
import { expectText, isMainModule, startEnv } from "./helpers.mjs"

const SHAPE = '[data-node-id^="shape/"]'
const ARROW = '[data-edge-id^="shape/"]'
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

/** Un punto schermo **sulla** freccia, a metà della sua lunghezza: il centro del riquadro di una linea a gomito cade nel vuoto. */
async function pointOnArrow(page) {
  return page.evaluate((sel) => {
    const path = document.querySelector(`${sel} [data-edge-hit]`)
    const p = path.getPointAtLength(path.getTotalLength() / 2)
    const m = path.getScreenCTM()
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
  }, ARROW)
}

/** L'attributo `d` di un path della freccia. */
const arrowPath = (page, part) => page.locator(`${ARROW} [data-edge-${part}]`).getAttribute("d")

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

  const shapeEditor = page.locator('[aria-label="Testo della forma"]')
  const rettangolo = page.locator(SHAPE, { hasText: "API Gateway" })
  const ellisse = page.locator(SHAPE, { hasText: "Ordini" })

  /** Scrive nell'editor della forma appena aperto e lo chiude. */
  async function write(text) {
    await shapeEditor.waitFor()
    await shapeEditor.fill(text)
    await shapeEditor.blur()
    await shapeEditor.waitFor({ state: "detached" })
  }

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")
    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("Rettangolo (Q) ed Ellisse (O) nascono con il testo aperto", async () => {
      await page.keyboard.press("q")
      await page.mouse.click(canvas.x + 200, canvas.y + 150)
      await write("API Gateway")
      await page.keyboard.press("o")
      await page.mouse.click(canvas.x + 650, canvas.y + 150)
      await write("Ordini")
      await expectText(page, SHAPE, "API Gateway")
      await expectText(page, SHAPE, "Ordini")
    })

    await step("Collega dal rettangolo all'ellisse crea una freccia con la punta alla fine", async () => {
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(rettangolo)), center(await boxOf(ellisse)))
      await page.waitForSelector(ARROW)
      if ((await arrowPath(page, "source")) !== "") throw new Error("la freccia nuova ha una punta anche all'inizio")
      if (!(await arrowPath(page, "target"))) throw new Error("la freccia nuova non ha la punta alla fine")
    })

    await step("dal pannello: punte, tratteggio e «Inverti»", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      const p = await pointOnArrow(page)
      await page.mouse.click(p.x, p.y)
      await page.selectOption("#arrow-head", "both")
      await page.waitForFunction((sel) => document.querySelector(`${sel} [data-edge-source]`)?.getAttribute("d") !== "", ARROW)
      await page.check("#arrow-dashed")
      await page.waitForFunction((sel) => document.querySelector(`${sel} [data-edge-line]`)?.getAttribute("stroke-dasharray") === "6 4", ARROW)
      const before = await arrowPath(page, "line")
      await page.getByRole("button", { name: "Inverti" }).click()
      await page.waitForFunction(([sel, d]) => document.querySelector(`${sel} [data-edge-line]`)?.getAttribute("d") !== d, [ARROW, before])
      await page.selectOption("#arrow-head", "none")
      await page.waitForFunction((sel) => document.querySelector(`${sel} [data-edge-target]`)?.getAttribute("d") === "", ARROW)
    })

    await step("la maniglia allarga il rettangolo, e ⌘Z lo riporta com'era", async () => {
      await page.keyboard.press("Escape")
      const c = center(await boxOf(rettangolo))
      await page.mouse.click(c.x, c.y)
      const handle = page.locator('[data-resize^="shape/"]')
      await handle.waitFor()
      const before = await boxOf(rettangolo)
      await drag(page, center(await boxOf(handle)), { x: before.x + before.w + 120, y: before.y + before.h + 60 })
      await page.waitForFunction(
        ([sel, w]) => [...document.querySelectorAll(sel)].some((el) => el.textContent.includes("API Gateway") && el.getBoundingClientRect().width > w + 50),
        [SHAPE, before.w],
      )
      await page.keyboard.press("ControlOrMeta+z")
      await page.waitForFunction(
        ([sel, w]) => [...document.querySelectorAll(sel)].some((el) => el.textContent.includes("API Gateway") && Math.abs(el.getBoundingClientRect().width - w) < 2),
        [SHAPE, before.w],
      )
    })

    await step("una nota si ancora al rettangolo", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("n")
      await page.mouse.click(canvas.x + 200, canvas.y + 450)
      const noteEditor = page.locator('[aria-label="Testo della nota"]')
      await noteEditor.waitFor()
      await noteEditor.fill("da rivedere")
      await noteEditor.blur()
      await noteEditor.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(page.locator(NOTE))), center(await boxOf(rettangolo)))
      await page.waitForSelector('[data-edge-id^="note/"]')
      await expectText(page, "body", "Ancorata a:")
    })

    await step("«Disponi» tiene la freccia fra le forme e la nota accanto al rettangolo", async () => {
      await page.keyboard.press("Escape")
      const gap = async () => {
        const n = await boxOf(page.locator(NOTE))
        const r = await boxOf(rettangolo)
        return { x: Math.round(n.x - r.x), y: Math.round(n.y - r.y) }
      }
      const before = await gap()
      const spread = async () => (await boxOf(ellisse)).x - (await boxOf(rettangolo)).x
      const spreadBefore = await spread()
      await page.getByRole("button", { name: "Disponi" }).click()
      // Le due forme stanno fianco a fianco; con la freccia come arco dall'alto in basso, Disponi le
      // mette una sopra l'altra, e la distanza orizzontale fra loro crolla. Non si aspetta che si muova
      // una forma in particolare: l'origine del blocco la decide l'impacchettamento. Il worker di
      // elkjs nasce alla prima richiesta, come in `layout.mjs`.
      await page.waitForFunction(
        ([sel, d0]) => {
          const x = (text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text))?.getBoundingClientRect().x
          const d = x("Ordini") - x("API Gateway")
          return Math.abs(d - d0) > 50
        },
        [SHAPE, spreadBefore],
        { timeout: 30_000 },
      )
      if ((await page.locator(ARROW).count()) !== 1) throw new Error("la freccia è sparita con Disponi")
      const after = await gap()
      if (Math.abs(after.x - before.x) > 2 || Math.abs(after.y - before.y) > 2) {
        throw new Error(`la nota non ha seguito il rettangolo: scarto prima ${JSON.stringify(before)}, dopo ${JSON.stringify(after)}`)
      }
    })

    await step("con lo strumento Testo, un clic dentro il rettangolo crea una forma nuova invece di selezionarlo", async () => {
      await page.keyboard.press("Escape")
      const before = await page.locator(SHAPE).count()
      const box = await boxOf(rettangolo)
      await page.keyboard.press("t")
      await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
      await write("Zona interna")
      await page.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n, [SHAPE, before])
      const after = await page.locator(SHAPE).count()
      if (after !== before + 1) throw new Error(`atteso ${before + 1} forme dopo il clic, trovate ${after}`)
    })

    await step("Collega fra una forma e un'entità è rifiutato con l'avviso", async () => {
      await page.keyboard.press("e")
      // `canvas.x + 750`, non `+ 900` come nel brief: a `+ 900` il rettangolo dell'entità (largo
      // ~160px, centrato sul clic) sconfina oltre il bordo destro del canvas (923px di larghezza a
      // 1280×900) e finisce sotto il pannello proprietà. `elementFromPoint` sul rilascio del
      // trascinamento prende allora il pannello, non il nodo: `hit.kind` non è mai "node" e
      // `commit-connect` non scatta — niente avviso, niente collegamento, ma anche nessun errore.
      await page.mouse.click(canvas.x + 750, canvas.y + 650)
      await page.keyboard.press("Escape") // chiude l'editor del nome
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(rettangolo)), center(await boxOf(page.locator('[data-node-id^="er/"]'))))
      await expectText(page, "[data-notice-bar]", "Non esiste un collegamento fra una forma e un'entità.")
      if ((await page.locator('[data-edge-id^="link/"]').count()) !== 0) throw new Error("è nato un collegamento fra una forma e un'entità")
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (forme):", e)
  }
  console.log(failed ? "\ne2e forme: FAIL" : "\ne2e forme: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/forme.mjs` esegue solo questo scenario. */
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
