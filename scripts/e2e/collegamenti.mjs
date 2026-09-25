/**
 * End-to-end dei collegamenti fra famiglie (spec 4a §9): una classe «mappa su» un'entità. Prova quello
 * che senza un browser vero non esiste: il gesto Collega fra due famiglie, il pannello Problemi che si
 * aggiorna, il collegamento che resta attaccato a una rinomina e sopravvive a un ricaricamento, Canc
 * che lo elimina, e l'avviso quando il gesto viene rifiutato. Poi i collegamenti del flusso (spec 4b
 * §9): un processo che legge l'entità, il modo cambiato dal pannello, un «chiama» verso la classe, e
 * il rifiuto di una nota del flusso.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/collegamenti.mjs`. `HEADLESS=0` per vedere.
 */
import { expectNodes, expectText, isMainModule, nodeRects, pickFromMenu, startEnv } from "./helpers.mjs"

/** Centro in coordinate schermo del nodo con questa chiave esatta. */
async function centerOfId(page, id) {
  const rect = (await nodeRects(page)).find((r) => r.id === id)
  if (!rect) throw new Error(`nessun nodo ${id}`)
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

/** Centro in coordinate schermo del nodo di flusso che mostra `text`. */
async function centerOfFlow(page, text) {
  const id = await page.evaluate((t) => [...document.querySelectorAll('[data-node-id^="flow/"]')].find((g) => g.textContent.includes(t))?.getAttribute("data-node-id"), text)
  if (!id) throw new Error(`nessun nodo di flusso con «${text}»`)
  return centerOfId(page, id)
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
}

const LINK = '[data-edge-id^="link/"]'

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
    const entityName = page.locator('[aria-label="Nome entità"]')
    const className = page.locator('[aria-label="Nome classe"]')
    const members = page.locator('[aria-label="Membri della classe"]')
    const nodeText = page.locator('[aria-label="Testo del nodo"]')

    await step("un'entità ordini con la colonna totale", async () => {
      await page.keyboard.press("e")
      await page.mouse.click(canvas.x + 200, canvas.y + 320)
      await entityName.waitFor()
      await entityName.fill("ordini")
      await entityName.press("Enter")
      await expectNodes(page, 1)
      // La creazione seleziona l'entità: il pannello proprietà è il suo.
      await page.getByRole("button", { name: "Aggiungi" }).click()
      const name = page.getByLabel("Nome attributo").last()
      await name.fill("totale")
      await name.press("Enter")
      const type = page.getByLabel("Tipo").last()
      await type.fill("numeric")
      await type.press("Enter")
      await expectText(page, '[data-node-id="er/ordini"]', "totale")
    })

    await step("una classe Ordine con totale e note", async () => {
      await page.keyboard.press("c")
      await page.mouse.click(canvas.x + 650, canvas.y + 320)
      await className.waitFor()
      await className.fill("Ordine")
      await className.press("Enter")
      await className.waitFor({ state: "detached" })
      const at = await centerOfId(page, "class/Ordine")
      await page.mouse.dblclick(at.x, at.y)
      await members.waitFor()
      await members.fill("+ totale: float\n+ note: string")
      await members.blur()
      await members.waitFor({ state: "detached" })
      await expectText(page, '[data-node-id="class/Ordine"]', "note")
    })

    await step("Collega classe → entità: nasce «mappa su», e Problemi segnala note", async () => {
      await page.keyboard.press("r")
      await drag(page, await centerOfId(page, "class/Ordine"), await centerOfId(page, "er/ordini"))
      await page.waitForSelector(LINK)
      await expectText(page, LINK, "mappa su")
      await expectText(page, "button", "«Ordine.note» non ha una colonna in «ordini»")
      // `totale` ha la sua colonna, con un tipo compatibile: nessun avviso su di lui.
      const onTotale = await page.getByText("Ordine.totale").count()
      if (onTotale !== 0) throw new Error("un avviso su Ordine.totale, che ha la sua colonna")
    })

    await step("rinomina dell'entità: il collegamento resta attaccato", async () => {
      const at = await centerOfId(page, "er/ordini")
      await page.mouse.click(at.x, at.y)
      const name = page.locator("#entity-name")
      await name.fill("righe")
      await name.press("Enter")
      await page.waitForSelector('[data-node-id="er/righe"]')
      if ((await page.locator(LINK).count()) !== 1) throw new Error("il collegamento non c'è più dopo la rinomina")
      await expectText(page, "button", "«Ordine.note» non ha una colonna in «righe»")
    })

    await step("ricarica: il collegamento c'è ancora", async () => {
      await page.waitForTimeout(800) // oltre il debounce dell'autosave (400 ms)
      await page.reload()
      await page.waitForSelector("[data-canvas]")
      await expectNodes(page, 2)
      await page.waitForSelector(LINK)
    })

    await step("Canc elimina il collegamento selezionato", async () => {
      // Il clic sul problema seleziona il suo obiettivo, cioè il collegamento.
      await page.getByRole("button", { name: /«Ordine\.note» non ha una colonna/ }).click()
      await page.keyboard.press("Delete")
      await page.waitForSelector(LINK, { state: "detached" })
    })

    await step("Collega fra un'interfaccia e l'entità: avviso, e nessun collegamento", async () => {
      await page.keyboard.press("i")
      await page.mouse.click(canvas.x + 650, canvas.y + 600)
      await className.waitFor()
      await className.press("Escape")
      await className.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, await centerOfId(page, "class/interface"), await centerOfId(page, "er/righe"))
      await expectText(page, "[data-notice-bar]", "Un'interfaccia non si mappa su una tabella.")
      if ((await page.locator(LINK).count()) !== 0) throw new Error("è nato un collegamento da un'interfaccia")
      await page.keyboard.press("Escape")
    })

    await step("un processo collegato all'entità: nasce «legge»", async () => {
      // `2` è il processo (spec flowchart §11); la prima corsia sta in alto (y 0–160 nel mondo).
      await page.keyboard.press("2")
      await page.mouse.click(canvas.x + 400, canvas.y + 60)
      await nodeText.waitFor()
      await nodeText.fill("Calcola totale")
      await nodeText.blur()
      await nodeText.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, await centerOfFlow(page, "Calcola totale"), await centerOfId(page, "er/righe"))
      await expectText(page, LINK, "legge")
      if ((await page.locator(LINK).count()) !== 1) throw new Error("atteso un solo collegamento")
    })

    await step("dal pannello il modo diventa «Scrive», e l'etichetta segue", async () => {
      // Appena creato, il collegamento è selezionato e il pannello è il suo.
      await page.locator("#link-mode").selectOption("write")
      await expectText(page, LINK, "scrive")
      // Toglie il focus dal <select>: altrimenti il prossimo `r` funzionerebbe solo perché
      // `isTypingTarget` non esclude SELECT, non perché la scorciatoia è pensata per il canvas.
      await page.locator("#link-mode").blur()
    })

    await step("lo stesso processo collegato alla classe: nasce «chiama»", async () => {
      await page.keyboard.press("r")
      await drag(page, await centerOfFlow(page, "Calcola totale"), await centerOfId(page, "class/Ordine"))
      await expectText(page, LINK, "chiama")
      if ((await page.locator(LINK).count()) !== 2) throw new Error("attesi due collegamenti")
    })

    await step("una nota del flusso verso l'entità: avviso, e nessun collegamento nuovo", async () => {
      await page.keyboard.press("6")
      // `700`, non `900`: a `900` il nodo (con l'etichetta) sconfina oltre il bordo destro del
      // canvas, nel pannello proprietà — il clic e il trascinamento successivo cadono lì e non
      // sul canvas.
      await page.mouse.click(canvas.x + 700, canvas.y + 60)
      await nodeText.waitFor()
      await nodeText.fill("promemoria")
      await nodeText.blur()
      await nodeText.waitFor({ state: "detached" })
      await page.keyboard.press("r")
      await drag(page, await centerOfFlow(page, "promemoria"), await centerOfId(page, "er/righe"))
      await expectText(page, "[data-notice-bar]", "Una nota non legge né scrive una tabella.")
      if ((await page.locator(LINK).count()) !== 2) throw new Error("è nato un collegamento da una nota")
      await page.keyboard.press("Escape")
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (collegamenti):", e)
  }
  console.log(failed ? "\ne2e collegamenti: FAIL" : "\ne2e collegamenti: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/collegamenti.mjs` esegue solo questo scenario. */
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
