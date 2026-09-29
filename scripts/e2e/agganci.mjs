/**
 * End-to-end degli agganci degli archi: due archi da sorgenti diverse arrivano in due punti del
 * bersaglio; Collega parte da un aggancio e finisce su un aggancio; un capo trascinato sul corpo del
 * nodo torna automatico, e ⌘Z lo riporta al punto di prima.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/agganci.mjs`. `HEADLESS=0` per vedere.
 */
import { isMainModule, startEnv } from "./helpers.mjs"

const SHAPE = '[data-node-id^="shape/"]'
const ARROW = '[data-edge-id^="shape/"]'

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
async function pointOnArrow(page, index = 0) {
  return page.evaluate(([sel, i]) => {
    const path = document.querySelectorAll(`${sel} [data-edge-hit]`)[i]
    const p = path.getPointAtLength(path.getTotalLength() / 2)
    const m = path.getScreenCTM()
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
  }, [ARROW, index])
}

/** L'attributo `d` della linea dell'`index`-esimo arco. */
const linePath = (page, index) => page.locator(`${ARROW} [data-edge-line]`).nth(index).getAttribute("d")

/** I numeri di un `d`, a coppie (x, y): il primo e l'ultimo punto del tracciato. */
function endpoints(d) {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number)
  return { first: { x: n[0], y: n[1] }, last: { x: n.at(-2), y: n.at(-1) } }
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

  const shapeEditor = page.locator('[aria-label="Testo della forma"]')
  const alfa = page.locator(SHAPE, { hasText: "Alfa" })
  const beta = page.locator(SHAPE, { hasText: "Beta" })
  const gamma = page.locator(SHAPE, { hasText: "Gamma" })

  /** Crea un rettangolo (`Q`) in `(x, y)` del canvas e ne scrive il testo. */
  async function rect(canvas, x, y, text) {
    await page.keyboard.press("q")
    await page.mouse.click(canvas.x + x, canvas.y + y)
    await shapeEditor.waitFor()
    await shapeEditor.fill(text)
    await shapeEditor.blur()
    await shapeEditor.waitFor({ state: "detached" })
  }

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")
    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("due nodi da sorgenti diverse arrivano in due punti del bersaglio", async () => {
      await rect(canvas, 200, 150, "Alfa")
      await rect(canvas, 650, 150, "Beta")
      await rect(canvas, 425, 450, "Gamma")
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(alfa)), center(await boxOf(gamma)))
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 1, ARROW)
      await page.keyboard.press("r")
      await drag(page, center(await boxOf(beta)), center(await boxOf(gamma)))
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 2, ARROW)
      
      const a = endpoints(await linePath(page, 0)).last
      const b = endpoints(await linePath(page, 1)).last
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1) throw new Error(`i due archi arrivano nello stesso punto: ${JSON.stringify(a)}`)
    })

    await step("Collega da un aggancio a un aggancio", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      const from = await boxOf(alfa)
      await alfa.hover()
      const start = page.locator('[data-anchor="e2"]')
      await start.waitFor()
      const startPoint = center(await boxOf(start))
      await page.mouse.move(startPoint.x, startPoint.y)
      await page.mouse.down()
      // Il bersaglio mostra i suoi agganci solo quando il puntatore gli passa sopra, durante il gesto.
      const body = center(await boxOf(beta))
      await page.mouse.move(body.x, body.y, { steps: 8 })
      // `w1`, non il `w2` di mezzo: Alfa e Beta sono alla stessa altezza, e tornato automatico il capo
      // cadrebbe proprio in `w2`, lasciando il `d` identico e il passo 3 senza nulla da osservare.
      const end = page.locator('[data-anchor="w1"]')
      await end.waitFor()
      const target = center(await boxOf(end))
      await page.mouse.move(target.x, target.y, { steps: 4 })
      await page.mouse.up()
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 3, ARROW)
      const third = endpoints(await linePath(page, 2))
      // Il `d` è in coordinate del mondo, il riquadro in pixel dello schermo: l'arco del passo 1 esce
      // dal mezzo del lato basso di Alfa, quindi il bordo destro sta mezza larghezza più in là.
      const right = endpoints(await linePath(page, 0)).first.x + from.w / 2
      if (Math.abs(third.first.x - right) > 1.5) {
        throw new Error(`il nuovo arco non parte dal lato destro (x ${third.first.x}, bordo ${right})`)
      }
    })

    await step("spostare un capo sul corpo lo rimette automatico, ⌘Z lo riporta", async () => {
      await page.keyboard.press("Escape")
      const p = await pointOnArrow(page, 2)
      await page.mouse.click(p.x, p.y)
      await page.locator("[data-edge-end]").nth(1).waitFor()
      if ((await page.locator("[data-edge-end]").count()) !== 2) throw new Error("attese due maniglie sull'arco selezionato")
      const before = await linePath(page, 2)
      await drag(page, center(await boxOf(page.locator('[data-edge-end="target"]'))), center(await boxOf(beta)))
      await page.waitForFunction(([sel, d]) => document.querySelectorAll(`${sel} [data-edge-line]`)[2]?.getAttribute("d") !== d, [ARROW, before])
      await page.keyboard.press("ControlOrMeta+z")
      await page.waitForFunction(([sel, d]) => document.querySelectorAll(`${sel} [data-edge-line]`)[2]?.getAttribute("d") === d, [ARROW, before])
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (agganci):", e)
  }
  console.log(failed ? "\ne2e agganci: FAIL" : "\ne2e agganci: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/agganci.mjs` esegue solo questo scenario. */
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
