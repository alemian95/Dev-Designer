/**
 * End-to-end della nota unica (spec 3a §11): lo strumento «Nota» (`N`) crea una nota e ne apre il
 * testo da sé; Collega la ancora a un'entità, poi a un nodo di flusso, poi a un pool, e la linea
 * tratteggiata la segue mentre l'elemento si sposta; Canc sulla linea la stacca, «Stacca» nel
 * pannello pure, ed eliminare l'elemento la stacca da sola; «Disponi» la tiene accanto alla sua
 * entità; un file della versione 6 con una nota di classe e una di flusso le ritrova al loro posto.
 *
 * La pagina si apre su `${base}?fallback=1`, come `pool.mjs`: l'ultimo passo carica un file
 * dall'`#upload-input`, e Playwright non pilota i dialoghi nativi della File System Access API.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/note.mjs`. `HEADLESS=0` per vedere.
 */
import { expectNodes, expectText, isMainModule, startEnv } from "./helpers.mjs"

const NOTE = '[data-node-id^="note/"]'
const LINE = '[data-edge-id^="note/"]'

/** Rettangolo schermo del primo elemento che risponde al selettore. */
async function rectOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`nessun elemento per ${selector}`)
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

/** L'attributo `d` della linea di ancoraggio: cambia quando la linea si ridisegna. */
const lineD = (page) => page.locator(`${LINE} [data-edge-line]`).getAttribute("d")

/**
 * Un punto schermo **sulla** linea di ancoraggio, a metà della sua lunghezza. Il centro del suo
 * riquadro non basta: una linea a gomito ha il centro del riquadro nel vuoto, e il clic non la prende.
 */
async function pointOnLine(page) {
  return page.evaluate((sel) => {
    const path = document.querySelector(`${sel} [data-edge-hit]`)
    const p = path.getPointAtLength(path.getTotalLength() / 2)
    const m = path.getScreenCTM()
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
  }, LINE)
}

/** Un documento della versione 6: una classe con una nota ancorata, e un processo con una nota di flusso collegata. */
const V6 = {
  schemaVersion: 6,
  id: "v6",
  name: "vecchio",
  diagram: {
    er: { model: { entities: {}, relationships: {} }, view: { nodes: {} } },
    class: {
      model: {
        classes: { Ordine: { name: "Ordine", stereotype: "class", attributes: [], methods: [] } },
        relations: { r1: { kind: "note-link", source: { class: "n1", multiplicity: "", role: "" }, target: { class: "Ordine", multiplicity: "", role: "" } } },
        notes: { n1: { text: "nota di classe" } },
      },
      view: { nodes: { Ordine: { x: 40, y: 40, collapsed: false }, n1: { x: 40, y: 200, collapsed: false } } },
    },
    flow: {
      model: {
        pools: {},
        nodes: { a: { label: "Ordina", shape: "process", lane: null }, f: { label: "nota di flusso", shape: "note", lane: null } },
        edges: { e1: { source: "f", target: "a", label: "" } },
      },
      view: { nodes: { a: { x: 500, y: 40, collapsed: false }, f: { x: 500, y: 200, collapsed: false } }, pools: {}, lanes: {} },
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

  const noteEditor = page.locator('[aria-label="Testo della nota"]')

  try {
    await page.goto(BASE)
    await page.waitForSelector("[data-canvas]")
    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("strumento «Nota» (N): nasce una nota libera e il suo testo si apre da sé", async () => {
      await page.keyboard.press("n")
      await page.mouse.click(canvas.x + 200, canvas.y + 400)
      await noteEditor.waitFor()
      await noteEditor.fill("da verificare")
      await noteEditor.blur()
      await noteEditor.waitFor({ state: "detached" })
      await expectText(page, NOTE, "da verificare")
      await page.locator(NOTE).first().click()
      await expectText(page, "body", "Libera")
    })

    await step("Collega nota → entità: la linea compare e il pannello dice a cosa è ancorata", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("e")
      await page.mouse.click(canvas.x + 200, canvas.y + 80)
      await page.keyboard.press("Escape") // chiude l'editor del nome
      await page.keyboard.press("r")
      await drag(page, center(await rectOf(page, NOTE)), center(await rectOf(page, '[data-node-id^="er/"]')))
      await page.waitForSelector(LINE)
      await expectText(page, "body", "Ancorata a:")
    })

    await step("la linea segue l'entità mentre la si trascina", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      const before = await lineD(page)
      const entity = await rectOf(page, '[data-node-id^="er/"]')
      await drag(page, { x: entity.x + 20, y: entity.y + 10 }, { x: entity.x + 320, y: entity.y + 10 })
      await page.waitForFunction(
        ([sel, d]) => document.querySelector(`${sel} [data-edge-line]`)?.getAttribute("d") !== d,
        [LINE, before],
      )
    })

    await step("Canc sulla linea stacca la nota, che resta", async () => {
      const pt = await pointOnLine(page)
      await page.mouse.click(pt.x, pt.y)
      await page.keyboard.press("Delete")
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, LINE)
      if ((await page.locator(NOTE).count()) !== 1) throw new Error("la nota è sparita con la sua linea")
    })

    await step("si ancora a un nodo di flusso, e «Stacca» nel pannello la libera", async () => {
      await page.keyboard.press("2")
      await page.mouse.click(canvas.x + 700, canvas.y + 80)
      const nodeText = page.locator('[aria-label="Testo del nodo"]')
      await nodeText.waitFor()
      await nodeText.fill("Ordina")
      await nodeText.blur()
      await page.keyboard.press("r")
      await drag(page, center(await rectOf(page, NOTE)), center(await rectOf(page, '[data-node-id^="flow/"]:not([data-pool])')))
      await page.waitForSelector(LINE)
      await expectText(page, "body", "Ancorata a: Ordina")
      await page.getByRole("button", { name: "Stacca" }).click()
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, LINE)
      await expectText(page, "body", "Libera")
    })

    await step("si ancora a un pool, ed eliminare il pool la stacca da sola", async () => {
      await page.keyboard.press("Escape")
      await page.keyboard.press("p")
      await page.mouse.click(canvas.x + 300, canvas.y + 600)
      await page.waitForSelector("[data-pool]")
      await page.keyboard.press("r")
      const header = await rectOf(page, "[data-pool-header]")
      await drag(page, center(await rectOf(page, NOTE)), { x: header.x + header.w / 2, y: header.y + 20 })
      await page.waitForSelector(LINE)
      await page.keyboard.press("Escape")
      await page.keyboard.press("v")
      // `header.h - 20`, non `+ 20` come l'ancoraggio appena fatto: la nota trascinata lì sopra
      // copre la testa dell'intestazione, e un clic in quel punto selezionerebbe lei, non il pool.
      await page.mouse.click(header.x + header.w / 2, header.y + header.h - 20)
      await page.keyboard.press("Delete")
      await page.waitForFunction(() => document.querySelectorAll("[data-pool]").length === 0)
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, LINE)
      if ((await page.locator(NOTE).count()) !== 1) throw new Error("la nota è sparita con il pool")
    })

    await step("«Disponi»: la nota ancorata resta accanto alla sua entità", async () => {
      await page.keyboard.press("r")
      await drag(page, center(await rectOf(page, NOTE)), center(await rectOf(page, '[data-node-id^="er/"]')))
      await page.waitForSelector(LINE)
      await page.keyboard.press("Escape")
      const gap = async () => {
        const n = await rectOf(page, NOTE)
        const e = await rectOf(page, '[data-node-id^="er/"]')
        return { x: Math.round(n.x - e.x), y: Math.round(n.y - e.y) }
      }
      const before = await gap()
      const entityBefore = await rectOf(page, '[data-node-id^="er/"]')
      await page.getByRole("button", { name: "Disponi" }).click()
      // Stessa attesa di `layout.mjs`: il worker di elkjs nasce alla prima richiesta.
      await page.waitForFunction(
        (x0) => Math.abs(document.querySelector('[data-node-id^="er/"]').getBoundingClientRect().x - x0) > 1,
        entityBefore.x,
        { timeout: 30_000 },
      )
      const after = await gap()
      if (Math.abs(after.x - before.x) > 2 || Math.abs(after.y - before.y) > 2) {
        throw new Error(`la nota non ha seguito l'entità: scarto prima ${JSON.stringify(before)}, dopo ${JSON.stringify(after)}`)
      }
    })

    await step("un file v6 caricato ha le note di classe e di flusso al loro posto, ancorate", async () => {
      await page.locator("#upload-input").setInputFiles({ name: "vecchio.dd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(V6)) })
      await expectText(page, NOTE, "nota di classe")
      await expectText(page, NOTE, "nota di flusso")
      await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 2, LINE)
      // La classe, il processo e le due note: la nota di flusso non è più un nodo del flusso.
      await expectNodes(page, 4)
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (note):", e)
  }
  console.log(failed ? "\ne2e note: FAIL" : "\ne2e note: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/note.mjs` esegue solo questo scenario. */
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
