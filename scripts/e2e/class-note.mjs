/**
 * End-to-end della nota nel class diagram: strumento «Nota», un click che crea il nodo e apre da sé
 * la sua textarea, un testo su due righe che ne cambia la geometria, un trascinamento con
 * annullamento, un export testo che la mostra come riga `note "…"`.
 *
 * Copre i tre comportamenti che senza un browser vero non esistono, specifici a questo nodo:
 *
 * 1. La `textarea` della nota (`NoteEditor.tsx`) prende il fuoco da sé alla creazione e commette sul
 *    blur, cambiando davvero la geometria del nodo (`noteSize`, `class/geometry.ts`) — nessun test
 *    unitario apre una textarea vera né misura un `getBoundingClientRect` dopo un blur.
 * 2. Il trascinamento di un nodo che **non è una classe** passa dallo stesso `rectOf` del seam fra i
 *    due tipi di nodo (`classOps.rectOf`, `kinds/class.ts`): è l'unico posto in cui si vede che
 *    `rectOf` risolve anche le chiavi di nota, non solo quelle di classe.
 * 3. L'annullamento di un trascinamento di nota: un solo ⌘Z la rimette esattamente dov'era,
 *    esercitando lo stesso comando (`moveNodes`) delle classi ma su un nodo senza `model.classes`.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/class-note.mjs`. `HEADLESS=0` per vedere.
 */
import { expectMenu, expectNodes, isMainModule, signature, startEnv } from "./helpers.mjs"

const NOTE_LINE_1 = "Verificare col cliente"
const NOTE_LINE_2 = "prima del rilascio"

/**
 * Rettangolo del nodo con questa chiave, in coordinate schermo — stesso approccio di
 * `class.mjs#rectByName`, ma per chiave e non per nome: una nota appena creata non ha ancora un
 * testo da cercare, e il suo corpo è un `<path>` (l'angolo piegato), non un `<rect>` come una
 * classe — da qui il selettore `rect, path`, il primo che matcha.
 */
async function rectByKey(page, key) {
  return page.evaluate((key) => {
    const g = document.querySelector(`[data-node-id="${key}"]`)
    if (!g) return null
    const r = g.querySelector("rect, path").getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, key)
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

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  })
  const page = await context.newPage()
  page.on("pageerror", (e) => pageErrors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()))
  await page.addInitScript(() => {
    window.__rejections = []
    addEventListener("unhandledrejection", (e) => window.__rejections.push(String(e.reason?.stack ?? e.reason)))
  })

  const noteEditor = page.locator('[aria-label="Testo della nota"]')

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("«Nuovo ▸ Class diagram»: il canvas è vuoto", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      // Sottomenu (Task 13): come in `class.mjs`, si apre a mano e si sceglie il tipo nel sottomenu,
      // perché `pickFromMenu` chiuderebbe tutto dopo un solo click.
      await page.getByRole("menuitem", { name: "Nuovo" }).click()
      await page.getByRole("menuitem", { name: "Class diagram" }).click()
      await expectMenu(page, "closed")
      await expectNodes(page, 0)
    })

    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    let key
    let beforeTextRect
    await step("strumento «Nota», un click: nasce un nodo e la textarea si apre da sé", async () => {
      await page.getByRole("radio", { name: "Nota" }).click()
      await page.mouse.click(canvas.x + 300, canvas.y + 200)
      await expectNodes(page, 1)
      key = await page.locator("[data-node-id]").first().getAttribute("data-node-id")
      // Nessun doppio click: `create-note` apre già l'editor (`use-canvas-interaction.ts`), a
      // differenza della nota di rinomina in `class.mjs` questo è l'unico modo in cui una nota si
      // apre, non ne esiste un secondo via doppio click sul corpo appena creato.
      await noteEditor.waitFor()
      beforeTextRect = await rectByKey(page, key)
    })

    await step("un testo su due righe commesso col blur: compare sul nodo e la geometria cambia", async () => {
      await noteEditor.fill(`${NOTE_LINE_1}\n${NOTE_LINE_2}`)
      await noteEditor.blur()
      await noteEditor.waitFor({ state: "detached" })

      const afterTextRect = await rectByKey(page, key)
      const bodyText = await page.evaluate((key) => document.querySelector(`[data-node-id="${key}"]`)?.textContent ?? "", key)
      if (!bodyText.includes(NOTE_LINE_1) || !bodyText.includes(NOTE_LINE_2)) {
        throw new Error(`il nodo non mostra il testo della nota: ${bodyText}`)
      }
      // Una riga in più (`noteSize`, `class/geometry.ts`) fa crescere l'altezza: stessa idea di
      // `class.mjs` per i membri, ma qui il prima è una nota vuota (una riga) e il dopo due righe.
      if (!(afterTextRect.h > beforeTextRect.h)) {
        throw new Error(`l'altezza non è cresciuta: prima ${beforeTextRect.h}, dopo ${afterTextRect.h}`)
      }
    })

    await step("si trascina la nota: si sposta, e un ⌘Z la rimette dov'era", async () => {
      const beforeDrag = await signature(page)
      const rect = await rectByKey(page, key)
      await page.mouse.move(rect.x + 20, rect.y + 10)
      await page.mouse.down()
      await page.mouse.move(rect.x + 320, rect.y + 220, { steps: 8 })
      await page.mouse.up()
      await page.waitForFunction((before) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now !== before
      }, beforeDrag, { timeout: 5000 })

      await page.keyboard.press("Meta+z")
      await page.waitForFunction((expected) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now === expected
      }, beforeDrag, { timeout: 5000 })
    })

    await step('«Esporta testo…»: la nota compare come riga `note "…"`', async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      // Non `pickFromMenu`: la voce apre un dialog modale che tiene `body` bloccato finché resta
      // aperto, esattamente come "Esporta testo…" in `class.mjs`.
      await page.getByRole("menuitem", { name: "Esporta testo…" }).click()
      await page.waitForSelector("[data-text-export-dialog]")
      const text = await page.locator("[data-export-preview]").textContent()

      // `noteText` (`io/emit/class-mermaid.ts`) sostituisce l'a capo vero con `\n` letterale: la
      // riga attesa lo riflette, non un a capo vero dentro la stringa.
      const expectedLine = `note "${NOTE_LINE_1}\\n${NOTE_LINE_2}"`
      if (!text.includes(expectedLine)) {
        throw new Error(`la nota non compare nell'export come atteso:\n${text}\n(attesa la riga: ${expectedLine})`)
      }

      await page.getByRole("button", { name: "Copia" }).click()
      const clipboard = await page.evaluate(() => navigator.clipboard.readText())
      if (clipboard !== text) throw new Error("gli appunti non contengono il testo mostrato nell'anteprima")
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (class-note):", e)
  }
  console.log(failed ? "\ne2e class-note: FAIL" : "\ne2e class-note: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/class-note.mjs` esegue solo questo scenario. */
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
