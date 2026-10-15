/**
 * End-to-end dell'import Mermaid ER: incolla → analizza → importa → re-importa senza duplicare →
 * annulla. Copre quello che i test unitari non vedono: la voce di menu, l'incollata vera, la
 * disposizione col worker di ELK sulla build di produzione e il selettore dei blocchi di un `.md`.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/import-mermaid.mjs`.
 * `HEADLESS=0` per vedere il browser.
 */
import { expectMenu, expectNodes, expectText, isMainModule, startEnv } from "./helpers.mjs"

const ER = `erDiagram
  CLIENTE ||--o{ ORDINE : effettua
  ORDINE ||--|{ RIGA : contiene
  CLIENTE {
    bigint id PK
    string email UK
  }
  style CLIENTE fill:#f9f
`

const MARKDOWN = "# Note\n\n```mermaid\nclassDiagram\n  A\n```\n\n```mermaid\n" + ER + "```\n"

/** Apre «Importa Mermaid…» e aspetta il dialog, per la stessa ragione di `openImportDialog` in import.mjs. */
async function openDialog(page) {
  await expectMenu(page, "closed")
  await page.locator("[data-document-menu]").click()
  await expectMenu(page, "open")
  await page.getByRole("menuitem", { name: /Importa Mermaid/ }).click()
  await page.waitForSelector("[data-import-mermaid-dialog]")
}

async function paste(page, text) {
  await page.locator('[aria-label="Mermaid"]').click()
  await page.evaluate((value) => {
    const area = document.querySelector('[aria-label="Mermaid"]')
    const data = new DataTransfer()
    data.setData("text", value)
    area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

async function closeDialog(page) {
  await page.getByRole("button", { name: "Chiudi" }).click()
  await page.waitForSelector("[data-import-mermaid-dialog]", { state: "detached" })
}

const edgeCount = (page) => page.evaluate(() => document.querySelectorAll("[data-edge-id]").length)

/** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
export async function run(browser, base) {
  const pageErrors = []
  let failed = false

  async function step(name, body) {
    process.stdout.write(`• ${name}… `)
    await body()
    if (pageErrors.length > 0) throw new Error(`errori nella pagina: ${pageErrors.splice(0).join(" | ")}`)
    process.stdout.write("ok\n")
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on("pageerror", (e) => pageErrors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()))

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("analizza l'erDiagram incollato, con l'avviso sugli stili", async () => {
      await openDialog(page)
      await paste(page, ER)
      await expectText(page, "[data-import-summary]", "3 entità, 2 relazioni")
      await expectText(page, "[data-import-warnings]", "1 avvisi")
    })

    await step("importa tre entità e due relazioni, disposte da ELK", async () => {
      await page.getByRole("button", { name: /^Importa 3 entità$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await closeDialog(page)
      await expectNodes(page, 3)
      const edges = await edgeCount(page)
      if (edges !== 2) throw new Error(`attese 2 relazioni, trovate ${edges}`)
    })

    await step("il re-import dello stesso testo non duplica niente", async () => {
      await openDialog(page)
      await paste(page, ER)
      await expectText(page, "[data-import-mermaid-dialog]", "identica, saltata")
      // `RIGA` e `ORDINE` non hanno attributi nel testo e lo sono anche nel documento: tutte e tre identiche.
      await page.getByRole("checkbox").first().click()
      await page.getByRole("button", { name: /^Importa 1 entità$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await closeDialog(page)
      await expectNodes(page, 3)
      const edges = await edgeCount(page)
      if (edges !== 2) throw new Error(`attese 2 relazioni, trovate ${edges}`)
    })

    await step("annulla con ⌘Z il re-import e poi l'import", async () => {
      await page.keyboard.press("ControlOrMeta+z")
      await page.keyboard.press("ControlOrMeta+z")
      await expectNodes(page, 0)
    })

    await step("in un .md sceglie il blocco ER e spiega quello che non si importa", async () => {
      await openDialog(page)
      await paste(page, MARKDOWN)
      await expectText(page, "[data-import-error]", "Per ora si importa solo erDiagram")
      await page.locator("[data-import-blocks]").getByText("Blocco 2 · ER").click()
      await expectText(page, "[data-import-summary]", "3 entità")
      await closeDialog(page)
    })

    await step("un errore di sintassi indica la riga", async () => {
      await openDialog(page)
      await paste(page, "erDiagram\n  A {\n    int id\n")
      await expectText(page, "[data-import-error]", "Riga 2: Blocco «{» senza «}»")
      await closeDialog(page)
    })
  } catch (e) {
    failed = true
    console.error("\nFALLITO:", e)
  } finally {
    await context.close()
  }
  return !failed
}

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
