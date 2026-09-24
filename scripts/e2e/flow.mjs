/**
 * End-to-end del flowchart: crea un flowchart, aggiunge una seconda corsia, tre nodi di forme
 * diverse, collega due nodi e scrive l'etichetta sull'arco col doppio click, dispone, trascina un
 * nodo nell'altra corsia con eventi veri, annulla con un solo ⌘Z e esporta in Mermaid.
 *
 * Copre le tre cose che senza un browser vero non esistono, tutte specifiche a questo tipo di
 * diagramma (spec §5, §6):
 *
 * 1. **«Disponi»** è il solo passo che prova che **elkjs si carica davvero**: i test unitari usano
 *    un worker finto, quindi un bundle che non si risolve passerebbe tutta la suite e fallirebbe
 *    solo qui. Si asserisce che ogni nodo stia dentro la banda della sua corsia e che nessuna
 *    coppia di nodi si sovrapponga — le stesse due cose che `layout.mjs` verifica per ER e class,
 *    più il contenimento nella banda, che è specifico delle corsie.
 * 2. Il **trascinamento fra corsie con eventi veri** (`mouse.move`/`down`/`up`, non un dispatch
 *    sintetico): nessun test unitario apre una `pointerdown` vera sul DOM, e il cambio di corsia al
 *    rilascio (`moveFlowNodes`, spec §6) è cablato sul gesto del mouse, non su un evento sintetico.
 * 3. **Un solo ⌘Z** dopo il trascinamento: prova che posizione e corsia sono un passo unico e non
 *    due (spec §6, «il comando scrive posizione e corsia insieme»). È il passo che vale più di
 *    tutti — le due asserzioni contano insieme: non basta che il nodo torni al suo posto, se la
 *    banda che lo contiene visivamente è ancora quella sbagliata è comunque il difetto che questo
 *    passo esiste per impedire. Si legge quindi sia la firma delle posizioni (`signature`, la
 *    stessa di `layout.mjs`) sia la banda che contiene il nodo, non solo una delle due.
 *
 * Le corsie non hanno un `data-lane-id` sul loro rettangolo (spec §5: «le bande non sono nodi»,
 * nessun attributo di hit-test): la banda che contiene un nodo si legge quindi dal DOM come la
 * userebbe l'occhio, confrontando il rettangolo del nodo (`getBoundingClientRect`) con quello della
 * banda, nello stesso ordine documentale di `model.lanes` — la stessa idea di `rectByName` sotto,
 * che cerca il nodo per il suo testo invece che per un id generato.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/flow.mjs`. `HEADLESS=0` per vedere.
 */
import { expectMenu, expectNodes, expectText, isMainModule, nodeRects, overlappingPairs, signature, startEnv } from "./helpers.mjs"

/** Rettangolo del nodo il cui testo contiene `label`, in coordinate schermo. Un nodo di flowchart
 *  disegna la sua forma con un solo `<path>` (`FlowNodeView`), non un `<rect>` come entità e
 *  classi — a differenza di `rectByName` in `class.mjs`, qui si legge sempre `path`. */
async function rectByLabel(page, label) {
  return page.evaluate((label) => {
    const groups = [...document.querySelectorAll("[data-node-id]")]
    const g = groups.find((el) => el.textContent.includes(label))
    if (!g) return null
    const r = g.querySelector("path").getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, label)
}

/** Rettangoli schermo delle bande delle corsie, nell'ordine documentale — quello di `model.lanes`
 *  (`LanesLayerView` le monta in quell'ordine, una `<rect>` per corsia). */
async function laneBandRects(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-layer="lanes"] rect')].map((r) => {
      const rect = r.getBoundingClientRect()
      return { y: rect.y, h: rect.height }
    }),
  )
}

/** Vero se il rettangolo del nodo sta interamente dentro la banda, con un margine di un pixel per
 *  gli arrotondamenti del rendering. */
function withinBand(rect, band, eps = 1) {
  return !!rect && !!band && rect.y >= band.y - eps && rect.y + rect.h <= band.y + band.h + eps
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

  const nodeTextEditor = page.locator('[aria-label="Testo del nodo"]')
  const edgeLabelEditor = page.locator('[aria-label="Etichetta arco"]')

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("«Nuovo ▸ Flowchart»: il canvas è vuoto e c'è una corsia sola", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: "Nuovo" }).click()
      await page.getByRole("menuitem", { name: "Flowchart" }).click()
      await expectMenu(page, "closed")
      await expectNodes(page, 0)
      await page.waitForFunction(() => document.querySelectorAll('[data-layer="lanes"] rect').length === 1)
    })

    await step("aggiungi una seconda corsia dal pannello", async () => {
      // Con selezione vuota il pannello proprietà è già `FlowLanesPanel` (`PropertiesPanel.tsx`):
      // nessun click per raggiungerlo, il pulsante «Aggiungi» è già a schermo.
      await page.getByRole("button", { name: "Aggiungi" }).click()
      await page.waitForFunction(() => document.querySelectorAll('[data-layer="lanes"] rect').length === 2)
    })

    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("tre nodi di forme diverse: terminale e processo nella prima corsia, decisione nella seconda", async () => {
      // La creazione apre già l'editor del testo (spec §7, stesso editor della nota di classe):
      // si scrive lì, non con un doppio click separato.
      await page.getByRole("radio", { name: "Terminale" }).click()
      await page.mouse.click(canvas.x + 150, canvas.y + 20)
      await expectNodes(page, 1)
      await nodeTextEditor.waitFor()
      await nodeTextEditor.fill("Inizio")
      await nodeTextEditor.blur()
      await nodeTextEditor.waitFor({ state: "detached" })

      // `exact`: "Processo" senza vincolo combacerebbe anche con "Sottoprocesso" (substring match
      // di default di Playwright su `name`).
      await page.getByRole("radio", { name: "Processo", exact: true }).click()
      await page.mouse.click(canvas.x + 450, canvas.y + 20)
      await expectNodes(page, 2)
      await nodeTextEditor.waitFor()
      await nodeTextEditor.fill("Processo A")
      await nodeTextEditor.blur()
      await nodeTextEditor.waitFor({ state: "detached" })

      await page.getByRole("radio", { name: "Decisione" }).click()
      await page.mouse.click(canvas.x + 150, canvas.y + 180)
      await expectNodes(page, 3)
      await nodeTextEditor.waitFor()
      await nodeTextEditor.fill("Decisione")
      await nodeTextEditor.blur()
      await nodeTextEditor.waitFor({ state: "detached" })

      // Sanità delle coordinate di piazzamento, prima ancora di «Disponi»: il terminale e il
      // processo sono nati dentro la prima banda, la decisione dentro la seconda — `laneAt`
      // (`editor/flow/geometry.ts`) decide la corsia dalla y del click, non da uno strumento a
      // parte, quindi è già verificabile qui.
      const [band0, band1] = await laneBandRects(page)
      const inizio = await rectByLabel(page, "Inizio")
      const processo = await rectByLabel(page, "Processo A")
      const decisione = await rectByLabel(page, "Decisione")
      if (!withinBand(inizio, band0)) throw new Error("«Inizio» non è nato nella prima corsia")
      if (!withinBand(processo, band0)) throw new Error("«Processo A» non è nato nella prima corsia")
      if (!withinBand(decisione, band1)) throw new Error("«Decisione» non è nata nella seconda corsia")
    })

    await step("collega Inizio a Processo A e scrivi l'etichetta sull'arco col doppio click", async () => {
      await page.getByRole("radio", { name: "Collega" }).click()
      const inizio = await rectByLabel(page, "Inizio")
      const processo = await rectByLabel(page, "Processo A")
      await page.mouse.move(inizio.x + inizio.w / 2, inizio.y + inizio.h / 2)
      await page.mouse.down()
      await page.mouse.move(processo.x + processo.w / 2, processo.y + processo.h / 2, { steps: 5 })
      await page.mouse.up()
      await page.waitForSelector("[data-edge-id]")

      const edgeBox = await page.locator("[data-edge-id]").boundingBox()
      await page.mouse.dblclick(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2)
      await edgeLabelEditor.waitFor()
      await edgeLabelEditor.fill("avanti")
      await edgeLabelEditor.press("Enter")
      await edgeLabelEditor.waitFor({ state: "detached" })

      await expectText(page, "[data-edge-label]", "avanti")
    })

    let beforeLayout
    await step("Disponi: ogni nodo sta nella banda della sua corsia, nessuna coppia si sovrappone", async () => {
      beforeLayout = await signature(page)
      await page.getByRole("button", { name: "Disponi" }).click()
      // Il worker nasce alla prima richiesta e elkjs pesa ~1,5 MB: l'attesa è generosa di proposito
      // (stessa soglia di `layout.mjs`/`class.mjs`) — è questo il passo che prova che il worker si
      // risolve davvero, non un finto della suite unitaria.
      await page.waitForFunction((before) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now !== before
      }, beforeLayout, { timeout: 30_000 })

      const [band0, band1] = await laneBandRects(page)
      const inizio = await rectByLabel(page, "Inizio")
      const processo = await rectByLabel(page, "Processo A")
      const decisione = await rectByLabel(page, "Decisione")
      if (!withinBand(inizio, band0)) throw new Error("«Inizio» non è dentro la banda della prima corsia dopo Disponi")
      if (!withinBand(processo, band0)) throw new Error("«Processo A» non è dentro la banda della prima corsia dopo Disponi")
      if (!withinBand(decisione, band1)) throw new Error("«Decisione» non è dentro la banda della seconda corsia dopo Disponi")

      const overlapping = overlappingPairs(await nodeRects(page))
      if (overlapping.length > 0) throw new Error(`nodi sovrapposti dopo il layout: ${overlapping.join(", ")}`)
    })

    let beforeDrag
    await step("trascina «Decisione» nella prima corsia con eventi veri e verifica che ci resti", async () => {
      beforeDrag = await signature(page)
      const [band0] = await laneBandRects(page)
      const decisione = await rectByLabel(page, "Decisione")
      const fromX = decisione.x + decisione.w / 2
      const fromY = decisione.y + decisione.h / 2
      const toY = band0.y + band0.h / 2

      await page.mouse.move(fromX, fromY)
      await page.mouse.down()
      await page.mouse.move(fromX, toY, { steps: 8 })
      await page.mouse.up()

      // Il rilascio scrive posizione e corsia in un solo passo (`moveFlowNodes`, spec §6): si
      // aspetta che la firma cambi prima di leggere il rettangolo, altrimenti si legge il DOM
      // ancora nella posizione di partenza.
      await page.waitForFunction((before) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now !== before
      }, beforeDrag, { timeout: 5000 })

      const [band0After] = await laneBandRects(page)
      const decisioneAfter = await rectByLabel(page, "Decisione")
      if (!withinBand(decisioneAfter, band0After)) throw new Error("«Decisione» non è rimasta nella prima corsia dopo il trascinamento")
    })

    await step("un solo ⌘Z: «Decisione» torna nella corsia di prima e dov'era", async () => {
      await page.keyboard.press("Meta+z")
      // Posizione: la stessa firma di prima del trascinamento, su **tutti** i nodi — non solo
      // «Decisione» — perché un ⌘Z che ne toccasse un altro sarebbe comunque un passo di undo
      // rotto anche se «Decisione» tornasse al suo posto per caso.
      await page.waitForFunction((expected) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now === expected
      }, beforeDrag, { timeout: 10_000 })

      // Corsia: la banda che contiene «Decisione» adesso è di nuovo la seconda, non la prima — è
      // l'asserzione che un ⌘Z che rimettesse solo la posizione (senza la corsia) lascerebbe
      // rotta, perché la y tornerebbe quella di prima ma il modello penserebbe ancora che il nodo
      // sia nella prima corsia; qui si legge la banda vera, non il campo del modello.
      const [band0, band1] = await laneBandRects(page)
      const decisione = await rectByLabel(page, "Decisione")
      if (withinBand(decisione, band0)) throw new Error("«Decisione» è rimasta nella prima corsia dopo ⌘Z")
      if (!withinBand(decisione, band1)) throw new Error("«Decisione» non è tornata nella seconda corsia dopo ⌘Z")
    })

    await step("«Esporta testo…»: subgraph, un rombo e l'etichetta sull'arco", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      await page.getByRole("menuitem", { name: "Esporta testo…" }).click()
      await page.waitForSelector("[data-text-export-dialog]")
      const text = await page.locator("[data-export-preview]").textContent()

      await page.getByRole("button", { name: "Copia" }).click()
      const clipboard = await page.evaluate(() => navigator.clipboard.readText())
      if (clipboard !== text) throw new Error("gli appunti non contengono il testo mostrato nell'anteprima")

      if (!text.includes("flowchart LR")) throw new Error(`manca l'intestazione flowchart LR:\n${text}`)
      if (!text.includes("subgraph")) throw new Error(`manca la subgraph di corsia:\n${text}`)
      if (!/\{"[^"]*"\}/.test(text)) throw new Error(`manca il rombo della decisione:\n${text}`)
      if (!text.includes('|"avanti"|')) throw new Error(`manca l'etichetta sull'arco:\n${text}`)
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (flow):", e)
  }
  console.log(failed ? "\ne2e flow: FAIL" : "\ne2e flow: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/flow.mjs` esegue solo questo scenario. */
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
