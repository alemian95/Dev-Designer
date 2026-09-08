/**
 * End-to-end dell'import DDL: copre apri il dialog → incolla un DDL → analizza → importa → due
 * entità e una relazione sul canvas → annulla → canvas vuoto. E il re-import, che non deve
 * duplicare la relazione. Copre anche il ramo MySQL: un dump con nomi inventati, rilevato da solo
 * (mai passato dal toggle a mano), che produce a sua volta tabelle e una relazione — è il ramo che
 * nessun test unitario esercita (nessuno importa `parse.worker.ts` né `spawn.ts`), e la sua interop
 * `node-sql-parser` dentro un module worker sotto Vite era stata verificata solo a mano, una volta.
 *
 * Il server statico e il browser sono avviati una sola volta da `scripts/e2e/run.mjs` e condivisi
 * con lo scenario della persistenza: questa funzione apre solo il proprio contesto (IndexedDB
 * isolato dagli altri scenari) e non tocca né l'uno né l'altro.
 *
 * Uso: `pnpm e2e` esegue questo scenario insieme a quello della persistenza. Per lanciarlo da solo
 * (dopo `pnpm build`): `node scripts/e2e/import.mjs`. `HEADLESS=0` per vedere il browser.
 */
import { expectMenu, expectNodes, expectText, isMainModule, startEnv } from "./helpers.mjs"

const DDL = `CREATE TABLE parent (id bigint PRIMARY KEY);
CREATE TABLE child (id bigint PRIMARY KEY, parent_id bigint NOT NULL REFERENCES parent(id));`

/**
 * Dump MySQL con nomi inventati (mai un frammento delle fixture reali dell'utente, git-ignored):
 * backtick, `ENGINE=` e `AUTO_INCREMENT` bastano a farlo rilevare come MySQL da `detect.ts` senza
 * bisogno del toggle manuale (verificato: la testa del testo segna 3 indizi MySQL contro 0 Postgres).
 * Due tabelle e una FOREIGN KEY: il minimo che produce sia un'entità sia una relazione da verificare
 * sul canvas vero.
 */
const MYSQL_DDL = `CREATE TABLE \`zorble\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
CREATE TABLE \`fluvian\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`zorble_id\` bigint unsigned NOT NULL,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fluvian_zorble_fk\` FOREIGN KEY (\`zorble_id\`) REFERENCES \`zorble\` (\`id\`)
) ENGINE=InnoDB;`

/**
 * Apre il menu documento e sceglie "Importa DDL…". Non si usa `pickFromMenu`: quella voce non
 * richiude il menu su uno stato "sbloccato" come le altre, perché apre subito il dialog di import,
 * che ha il proprio overlay Radix e tiene `body` con `pointer-events: none` finché resta aperto —
 * l'attesa di `pickFromMenu` su quel blocco non finirebbe mai. Si aspetta invece direttamente la
 * comparsa del dialog, che è la vera conferma che la voce ha fatto il suo effetto.
 */
async function openImportDialog(page) {
  await expectMenu(page, "closed")
  await page.locator("[data-document-menu]").click()
  await expectMenu(page, "open")
  await page.getByRole("menuitem", { name: /Importa DDL/ }).click()
  await page.waitForSelector("[data-import-dialog]")
}

/** Esegue lo scenario in un proprio contesto del browser condiviso. Restituisce `true` se tutti i passi passano. */
export async function run(browser, base) {
  /** Errori della pagina raccolti dai listener: si controllano alla fine di ogni passo, perché lanciare dentro un listener non arriva al try/catch. */
  const pageErrors = []
  let failed = false

  async function step(name, body) {
    process.stdout.write(`• ${name}… `)
    await body()
    if (pageErrors.length > 0) throw new Error(`errori nella pagina: ${pageErrors.splice(0).join(" | ")}`)
    process.stdout.write("ok\n")
  }

  /** Incolla il DDL nel textarea con un vero evento di incollata, così parte l'analisi automatica. */
  async function paste(page, ddl) {
    await page.locator('[aria-label="DDL"]').click()
    await page.evaluate((text) => {
      const area = document.querySelector('[aria-label="DDL"]')
      const data = new DataTransfer()
      data.setData("text", text)
      area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    }, ddl)
    await page.waitForSelector("[data-import-summary]", { timeout: 30_000 })
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on("pageerror", (e) => pageErrors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()))

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("apre il dialog di import e analizza il DDL incollato", async () => {
      await openImportDialog(page)
      await paste(page, DDL)
      await expectText(page, "[data-import-summary]", "2 tabelle")
    })

    await step("importa e trova due entità e una relazione", async () => {
      await page.getByRole("button", { name: /^Importa 2 tabelle$/ }).click()
      await expectNodes(page, 2)
    })

    await step("annulla con ⌘Z e il canvas torna vuoto", async () => {
      await page.getByRole("button", { name: "Chiudi" }).click()
      await page.waitForSelector("[data-import-dialog]", { state: "detached" })
      await page.keyboard.press("ControlOrMeta+z")
      await expectNodes(page, 0)
    })

    await step("il re-import non duplica la relazione", async () => {
      for (let i = 0; i < 2; i++) {
        await openImportDialog(page)
        await paste(page, DDL)
        await page.getByRole("button", { name: /^Importa 2 tabelle$/ }).click()
        await page.waitForSelector("[data-import-dialog] strong")
        await page.getByRole("button", { name: "Chiudi" }).click()
        await page.waitForSelector("[data-import-dialog]", { state: "detached" })
      }
      // Nel canvas vero la relazione è un `<g data-edge-id>` (`src/ui/canvas/RelationshipEdge.tsx`):
      // non esiste un `data-relationship-id` separato, quindi si conta quello.
      const edges = await page.evaluate(() => document.querySelectorAll("[data-edge-id]").length)
      if (edges !== 1) throw new Error(`attesa una relazione, trovate ${edges}`)
    })

    // Il dialog non si chiude da sé dopo un import: l'ultimo passo lo ha già richiuso lui stesso col
    // pulsante "Chiudi", quindi si riparte da "dialog chiuso", lo stato che `openImportDialog` richiede.
    await step("apre il dialog e incolla un dump MySQL: il dialetto si rileva da solo", async () => {
      await openImportDialog(page)
      await paste(page, MYSQL_DDL)
      await expectText(page, "[data-import-summary]", "2 tabelle")
      // Non si è mai toccato il toggle: se questo segna "MySQL" è `detectDialect` ad averlo scelto.
      const checked = await page.getByRole("radio", { name: "MySQL" }).getAttribute("aria-checked")
      if (checked !== "true") throw new Error(`dialetto rilevato non è MySQL (aria-checked=${checked})`)
    })

    await step("importa il dump MySQL: due entità e una relazione in più sul canvas", async () => {
      await page.getByRole("button", { name: /^Importa 2 tabelle$/ }).click()
      // Le due tabelle precedenti (parent, child) restano: 2 + 2 di questo import.
      await expectNodes(page, 4)
      const edges = await page.evaluate(() => document.querySelectorAll("[data-edge-id]").length)
      if (edges !== 2) throw new Error(`attese 2 relazioni dopo l'import MySQL, trovate ${edges}`)
      await page.getByRole("button", { name: "Chiudi" }).click()
      await page.waitForSelector("[data-import-dialog]", { state: "detached" })
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (import):", e)
  }
  console.log(failed ? "\ne2e import: FAIL" : "\ne2e import: PASS")
  return !failed
}

/**
 * Guardia di esecuzione diretta: `node scripts/e2e/import.mjs` esegue solo questo scenario, avviando
 * server e browser con `startEnv` (la stessa funzione di `run.mjs`) invece di richiedere l'altro
 * scenario per forza.
 */
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
