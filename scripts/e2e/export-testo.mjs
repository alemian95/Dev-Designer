/**
 * End-to-end dell'export testo: importa un DDL → apre il dialog → controlla i tre formati →
 * copia negli appunti → scarica.
 *
 * Copre quello che nessun test unitario può provare: che il dialog si apra dalla voce di menu
 * senza litigare col menu che si chiude, che la clipboard riceva davvero il testo, e che il
 * download arrivi — sulla build di produzione, che è dove l'export SVG si era rotto mentre ogni
 * test unitario passava.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/export-testo.mjs`.
 * `HEADLESS=0` per vedere il browser.
 */
import { readFile } from "node:fs/promises"
import { expectMenu, expectNodes, isMainModule, startEnv } from "./helpers.mjs"

const DDL = `CREATE TABLE mittente (id bigint PRIMARY KEY, etichetta text NOT NULL);
CREATE TABLE recapito (id bigint PRIMARY KEY, mittente_id bigint NOT NULL REFERENCES mittente(id));`

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

  // La clipboard va concessa: senza il permesso `writeText` rigetta e il dialog mostrerebbe
  // l'avviso di fallimento invece di copiare.
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

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("importa un DDL: due entità e una relazione da esportare", async () => {
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
      await page.getByRole("button", { name: /^Importa 2 tabelle$/ }).click()
      await expectNodes(page, 2)
      await page.getByRole("button", { name: "Chiudi" }).click()
      await page.waitForSelector("[data-import-dialog]", { state: "detached" })
    })

    const testi = {}
    await step("apre il dialog e produce i tre formati, diversi fra loro", async () => {
      // Non `pickFromMenu`: quella funzione aspetta che il menu torni "chiuso" nel senso di
      // "pointer-events sbloccati", ma qui la voce apre un dialog modale che tiene body bloccato di
      // proposito finché resta aperto — esattamente come "Importa DDL" in import.mjs, che per lo
      // stesso motivo non lo usa.
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: "Esporta testo…" }).click()
      await page.waitForSelector("[data-text-export-dialog]")
      const anteprima = page.locator("[data-export-preview]")

      // PostgreSQL è il formato iniziale.
      testi.postgres = await anteprima.textContent()
      // Il confronto è contro il testo **corrente**, non contro il primo: confrontando sempre con
      // quello di PostgreSQL la seconda attesa passerebbe subito, perché l'anteprima mostra già
      // MySQL, e si registrerebbe il testo sbagliato sotto la chiave `mermaid`.
      let precedente = testi.postgres
      for (const formato of ["MySQL", "Mermaid"]) {
        // ToggleGroupItem ha ruolo `radio`, non `button`.
        await page.getByRole("radio", { name: formato }).click()
        await page.waitForFunction(
          (p) => document.querySelector("[data-export-preview]").textContent !== p,
          precedente,
        )
        precedente = await anteprima.textContent()
        testi[formato.toLowerCase()] = precedente
      }

      if (!testi.postgres.includes('CREATE TABLE "mittente"')) throw new Error("il DDL Postgres non cita gli identificatori")
      if (!testi.mysql.includes("CREATE TABLE `mittente`")) throw new Error("il DDL MySQL non usa i backtick")
      if (!testi.mermaid.startsWith("erDiagram")) throw new Error("il Mermaid non inizia con erDiagram")
      if (testi.postgres === testi.mysql) throw new Error("i due dialetti producono lo stesso testo")
      if (!testi.postgres.includes("ADD CONSTRAINT")) throw new Error("manca la FOREIGN KEY in ALTER TABLE")
    })

    await step("copia negli appunti il formato mostrato", async () => {
      await page.getByRole("button", { name: "Copia" }).click()
      const appunti = await page.evaluate(() => navigator.clipboard.readText())
      if (appunti !== testi.mermaid) {
        throw new Error(`gli appunti non contengono il Mermaid mostrato (${appunti.slice(0, 60)}…)`)
      }
    })

    await step("scarica il file con l'estensione del formato", async () => {
      const download = page.waitForEvent("download", { timeout: 30_000 })
      await page.getByRole("button", { name: "Scarica" }).click()
      const d = await download
      if (!d.suggestedFilename().endsWith(".mmd")) throw new Error(`nome inatteso: ${d.suggestedFilename()}`)
      const contenuto = await readFile(await d.path(), "utf8")
      if (contenuto !== testi.mermaid) throw new Error("il file scaricato non è il testo mostrato")
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (export testo):", e)
  }
  console.log(failed ? "\ne2e export testo: FAIL" : "\ne2e export testo: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/export-testo.mjs` esegue solo questo scenario. */
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
