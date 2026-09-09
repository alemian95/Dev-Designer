/**
 * End-to-end dell'export immagini: importa un DDL → seleziona un'entità → esporta SVG → esporta PNG →
 * copia il PNG negli appunti.
 *
 * Copre le tre cose che nessun test unitario può provare, perché non esistono senza un browser vero:
 * il woff2 scaricato e incorporato come `data:` URI, i colori del tema letti con `getComputedStyle`
 * e convertiti in sRGB dipingendo un canvas, e la rasterizzazione dell'SVG dentro un `<img>` — che
 * avviene in un contesto isolato senza i font della pagina, la ragione per cui il font va incorporato.
 *
 * Il tema si porta a scuro **prima** di esportare: è l'unico modo di verificare che l'export esca
 * comunque in chiaro invece di limitarsi a copiare il tema attivo.
 *
 * Il server statico e il browser sono avviati una sola volta da `scripts/e2e/run.mjs` e condivisi con
 * gli altri scenari: questa funzione apre solo il proprio contesto e non tocca gli altri.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/export.mjs`. `HEADLESS=0` per vedere.
 */
import { readFile } from "node:fs/promises"
import { expectNodes, expectMenu, isMainModule, pickFromMenu, startEnv } from "./helpers.mjs"

const DDL = `CREATE TABLE mittente (id bigint PRIMARY KEY, etichetta text NOT NULL);
CREATE TABLE recapito (id bigint PRIMARY KEY, mittente_id bigint NOT NULL REFERENCES mittente(id));`

/** Larghezza e altezza dall'IHDR di un PNG: 4 byte big-endian ciascuna, subito dopo la firma e il nome del chunk. */
function pngSize(buffer) {
  const firma = buffer.subarray(0, 8).toString("hex")
  if (firma !== "89504e470d0a1a0a") throw new Error(`non è un PNG (firma ${firma})`)
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) }
}

/** Esegue lo scenario in un proprio contesto del browser condiviso. `true` se tutti i passi passano. */
export async function run(browser, base) {
  const pageErrors = []
  let failed = false

  async function step(name, body) {
    process.stdout.write(`• ${name}… `)
    await body()
    // L'export è invocato con `void` dal menu: un suo rigetto non diventa un `pageerror`, e senza
    // questa raccolta un fallimento si presenterebbe come un timeout muto sull'evento di download.
    pageErrors.push(...(await page.evaluate(() => window.__rejections.splice(0))))
    if (pageErrors.length > 0) throw new Error(`errori nella pagina: ${pageErrors.splice(0).join(" | ")}`)
    process.stdout.write("ok\n")
  }

  // I permessi degli appunti servono al passo della copia: la scrittura senza permesso fallirebbe,
  // e la rilettura che la verifica non è nemmeno possibile senza `clipboard-read`.
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

    await step("seleziona un'entità e passa al tema scuro", async () => {
      await page.locator("[data-node-id]").first().click()
      // La selezione è viva: il bordo del nodo passa a spessore 2. È la premessa del controllo
      // sull'export, che deve ignorarla — se questo non fosse vero il controllo non proverebbe niente.
      const spessore = await page.evaluate(() => document.querySelector("[data-node-id] rect").getAttribute("stroke-width"))
      if (spessore !== "2") throw new Error(`l'entità non risulta selezionata (stroke-width=${spessore})`)
      await page.getByRole("button", { name: "Tema scuro" }).click()
      await page.waitForFunction(() => document.documentElement.classList.contains("dark"))
    })

    let svg
    let atteso
    await step("esporta un SVG autoconsistente, in chiaro e senza la selezione", async () => {
      const download = page.waitForEvent("download", { timeout: 30_000 })
      await pickFromMenu(page, page.getByRole("menuitem", { name: "Esporta SVG" }))
      const d = await download
      if (!d.suggestedFilename().endsWith(".svg")) throw new Error(`nome inatteso: ${d.suggestedFilename()}`)
      svg = await readFile(await d.path(), "utf8")

      if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) throw new Error("manca il namespace SVG")
      if (!svg.includes("@font-face") || !svg.includes("data:font/woff2;base64,")) throw new Error("il woff2 non è incorporato")
      if (svg.includes("var(--")) throw new Error("variabili CSS non risolte nell'SVG")
      if (svg.includes("oklch")) throw new Error("colori oklch non convertiti: Inkscape e Illustrator non li capiscono")

      // Il tema attivo è scuro: il fondo deve essere comunque chiaro, o la scelta del tema non esiste.
      const fondo = /<rect data-background[^>]*fill="#([0-9a-f]{6})"/.exec(svg)
      if (!fondo) throw new Error("manca il fondo opaco: il PNG uscirebbe trasparente")
      const canali = [0, 2, 4].map((i) => parseInt(fondo[1].slice(i, i + 2), 16))
      if (canali.some((c) => c < 200)) throw new Error(`fondo non chiaro: #${fondo[1]}`)

      // L'asserzione che conta più di tutte: il file **si apre**. Un SVG con un attributo malformato
      // supera ogni controllo sul contenuto qui sopra e poi non si apre né si rasterizza, ed è
      // esattamente il difetto che questo passo ha scoperto (le doppie virgolette di --font-mono
      // in produzione, dove il CSS minificato le normalizza così).
      const parseError = await page.evaluate((testo) => {
        const doc = new DOMParser().parseFromString(testo, "image/svg+xml")
        return doc.querySelector("parsererror")?.textContent?.slice(0, 200) ?? null
      }, svg)
      if (parseError) throw new Error(`SVG malformato: ${parseError}`)

      if (svg.includes('stroke-width="2"')) throw new Error("la selezione è finita nell'export")
      const nodi = (svg.match(/data-node-id=/g) ?? []).length
      const archi = (svg.match(/data-edge-id=/g) ?? []).length
      if (nodi !== 2 || archi !== 1) throw new Error(`attese 2 entità e 1 relazione, trovate ${nodi} e ${archi}`)
    })

    await step("esporta un PNG opaco a 2× le dimensioni dell'SVG", async () => {
      const download = page.waitForEvent("download", { timeout: 30_000 })
      await pickFromMenu(page, page.getByRole("menuitem", { name: "Esporta PNG" }))
      const d = await download
      if (!d.suggestedFilename().endsWith(".png")) throw new Error(`nome inatteso: ${d.suggestedFilename()}`)
      const { w, h } = pngSize(await readFile(await d.path()))

      // Le misure si confrontano con quelle che l'SVG dichiara per sé: è la catena intera, non una
      // costante scritta due volte.
      atteso = { w: Number(/ width="(\d+)"/.exec(svg)[1]) * 2, h: Number(/ height="(\d+)"/.exec(svg)[1]) * 2 }
      if (w !== atteso.w || h !== atteso.h) throw new Error(`PNG ${w}×${h}, atteso ${atteso.w}×${atteso.h}`)
    })

    await step("copia negli appunti lo stesso PNG, senza scaricare niente", async () => {
      await pickFromMenu(page, page.getByRole("menuitem", { name: "Copia PNG" }))

      // La scrittura parte col click e finisce dopo: si riprova finché l'immagine non c'è. Non con
      // `waitForFunction`, che sul valore nullo del predicato asincrono qui restituiva null invece
      // di riprovare. Tornano solo i primi 24 byte, quanti bastano all'IHDR: il PNG intero
      // passerebbe per JSON byte per byte.
      let bytes = null
      for (let i = 0; i < 60 && !bytes; i++) {
        if (i > 0) await page.waitForTimeout(250)
        bytes = await page.evaluate(async () => {
          const item = (await navigator.clipboard.read()).find((i) => i.types.includes("image/png"))
          if (!item) return null
          const blob = await item.getType("image/png")
          return [...new Uint8Array(await blob.arrayBuffer()).slice(0, 24)]
        })
      }
      if (!bytes) throw new Error("nessuna immagine negli appunti dopo 15 s")

      const { w, h } = pngSize(Buffer.from(bytes))
      if (w !== atteso.w || h !== atteso.h) throw new Error(`PNG negli appunti ${w}×${h}, atteso ${atteso.w}×${atteso.h}`)
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (export):", e)
  }
  console.log(failed ? "\ne2e export: FAIL" : "\ne2e export: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/export.mjs` esegue solo questo scenario. */
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
