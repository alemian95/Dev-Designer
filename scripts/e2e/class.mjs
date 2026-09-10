/**
 * End-to-end del class diagram: crea due classi, le nomina, dà membri a una, rifiuta un testo
 * malformato, collega le due con una generalizzazione, dispone e esporta in Mermaid.
 *
 * Copre le tre cose che senza un browser vero non esistono, tutte specifiche a questo tipo di
 * diagramma:
 *
 * 1. La `textarea` dei membri (`MembersEditor.tsx`) prende il fuoco, commette sul blur e cambia
 *    davvero la geometria del nodo — nessun test unitario apre una textarea vera né misura un
 *    `getBoundingClientRect` dopo un blur.
 * 2. Il rifiuto di un testo non valido **lascia la textarea aperta col testo intatto** (Task 13):
 *    è il comportamento opposto a un blur normale, ed è facile scrivere un test che passa anche se
 *    l'editor si richiude perdendo il testo — il difetto che questo comportamento esiste per
 *    impedire. Si asserisce quindi sia l'avviso sia la persistenza del testo, non solo l'avviso.
 * 3. L'ordine dei lati nell'export Mermaid (`emitClassMermaid`, §9 della spec) e l'inversione degli
 *    archi nel grafo di layout (`classLayoutGraph`, ADR 0006): il worker di ELK nei test unitari è
 *    finto, quindi un'inversione saltata non fallisce altrove che qui, e la tabella dei sei lati non
 *    mette tutti i tipi di relazione dalla stessa parte — è la generalizzazione a mettere il padre
 *    (`target` del modello) a sinistra, ed è quella che questa scena verifica.
 *
 * Nota sulla rinomina (passo 3 del brief): un nodo appena creato con lo strumento classe
 * apre già da sé l'editor del nome (lo stesso `create-node` che l'ER usa per le entità), e finché
 * la classe non ha nemmeno un membro il doppio click — su qualunque punto del suo rettangolo, che
 * coincide con l'header — apre sempre il corpo, mai il nome: è `classEditTarget` in
 * `use-canvas-interaction.ts`, deliberato perché una classe vuota non ha pixel di "corpo" distinti
 * dall'header e deve restare raggiungibile per il suo primo membro. Verificato interattivamente
 * prima di scrivere questa scena: un doppio click sull'header di una classe ancora vuota apre la
 * `textarea`, non l'input del nome. La rinomina usa quindi l'editor che la creazione apre da sé,
 * non un doppio click separato — stesso componente (`ClassNameEditor`/`NameInput`), stesso commit.
 *
 * Uso: `pnpm e2e`. Da solo (dopo `pnpm build`): `node scripts/e2e/class.mjs`. `HEADLESS=0` per vedere.
 */
import { expectMenu, expectNodes, isMainModule, startEnv } from "./helpers.mjs"

/** Rettangolo del nodo il cui testo contiene `name`, in coordinate schermo — stesso approccio di
 *  `layout.mjs#rects`: niente parsing del `transform`, che è un dettaglio del renderer. */
async function rectByName(page, name) {
  return page.evaluate((name) => {
    const groups = [...document.querySelectorAll("[data-node-id]")]
    const g = groups.find((el) => el.textContent.includes(name))
    if (!g) return null
    const r = g.querySelector("rect").getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, name)
}

/** Firma delle posizioni lette dal DOM, per aspettare che «Disponi» abbia davvero fatto qualcosa. */
async function signature(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-node-id]")]
      .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
      .sort()
      .join("|"),
  )
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

  const nameInput = page.locator('[aria-label="Nome classe"]')
  const membersEditor = page.locator('[aria-label="Membri della classe"]')

  try {
    await page.goto(base)
    await page.waitForSelector("[data-canvas]")

    await step("«Nuovo ▸ Class diagram»: il canvas è vuoto", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      // Sottomenu (Task 13): `pickFromMenu` chiude tutto dopo un solo click, quindi qui — come in
      // `persistenza.mjs` — si apre a mano e si sceglie il tipo nel sottomenu.
      await page.getByRole("menuitem", { name: "Nuovo" }).click()
      await page.getByRole("menuitem", { name: "Class diagram" }).click()
      await expectMenu(page, "closed")
      await expectNodes(page, 0)
    })

    const canvas = await page.locator("svg.dd-canvas").boundingBox()

    await step("strumento classe, due click: due nodi, il primo rinominato Persona", async () => {
      // Primo nodo. La creazione apre già l'editor del nome (vedi nota in testa al file): si scrive
      // il nome lì, non con un doppio click separato — su una classe ancora senza membri il doppio
      // click aprirebbe comunque il corpo, mai il nome.
      await page.getByRole("radio", { name: "Classe" }).click()
      await page.mouse.click(canvas.x + 250, canvas.y + 150)
      await expectNodes(page, 1)
      await nameInput.waitFor()
      await nameInput.fill("Persona")
      await nameInput.press("Enter")
      await nameInput.waitFor({ state: "detached" })

      // Secondo nodo: resta col nome di default, verrà rinominato Cliente più avanti.
      await page.getByRole("radio", { name: "Classe" }).click()
      await page.mouse.click(canvas.x + 650, canvas.y + 150)
      await expectNodes(page, 2)
      await nameInput.waitFor()
      await nameInput.press("Escape")
      await nameInput.waitFor({ state: "detached" })
    })

    let beforeMembersRect
    await step("doppio click sul corpo: la textarea compare e i membri cambiano la geometria", async () => {
      beforeMembersRect = await rectByName(page, "Persona")
      await page.mouse.dblclick(beforeMembersRect.x + beforeMembersRect.w / 2, beforeMembersRect.y + beforeMembersRect.h / 2)
      await membersEditor.waitFor()
      await membersEditor.fill("+ id: int\n- nome: string\n+ {abstract} saluta(): string")
      await membersEditor.blur()
      await membersEditor.waitFor({ state: "detached" })

      const afterRect = await rectByName(page, "Persona")
      // `memberLines` allinea i due punti su una colonna comune (`members.ts`): il nome più corto
      // ("id") prende spazi di riempimento prima del tipo, quindi non è mai letteralmente
      // "+ id: int" nel DOM — una spaziatura variabile fra il nome e i due punti.
      const bodyText = await page.evaluate(() => {
        const g = [...document.querySelectorAll("[data-node-id]")].find((el) => el.textContent.includes("Persona"))
        return g?.textContent ?? ""
      })
      if (!/\+\s*id\s*:\s*int/.test(bodyText)) throw new Error(`il nodo non mostra l'attributo "id": ${bodyText}`)
      if (!(afterRect.h > beforeMembersRect.h)) throw new Error(`l'altezza non è cresciuta: prima ${beforeMembersRect.h}, dopo ${afterRect.h}`)
    })

    await step("un testo non valido lascia la textarea aperta, col testo intatto, e avvisa", async () => {
      const rect = await rectByName(page, "Persona")
      await page.mouse.dblclick(rect.x + rect.w / 2, rect.y + rect.h - 5)
      await membersEditor.waitFor()
      const invalid = "+ salva(x: int"
      await membersEditor.fill(invalid)
      await membersEditor.blur()

      await page.waitForSelector("[data-notice-bar]")
      // Le due asserzioni che contano insieme: non basta che l'avviso compaia, se l'editor si è
      // richiuso perdendo il testo è comunque il difetto che il Task 13 doveva impedire.
      if (!(await membersEditor.isVisible())) throw new Error("la textarea si è chiusa: il testo scritto andrebbe perso")
      const value = await membersEditor.inputValue()
      if (value !== invalid) throw new Error(`la textarea non contiene più quello che l'utente aveva scritto: "${value}"`)

      // Il fix (commit ba467a2) rimanda il fuoco alla textarea dopo il rifiuto, ma solo al prossimo
      // `requestAnimationFrame` — apposta, per lasciar vincere un eventuale refocus del browser
      // (vedi il commento in `MembersEditor.tsx`) — quindi si aspetta, non si legge subito.
      await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA", { timeout: 2000 })

      // Si scarta il testo non valido con Escape, tornando ai membri validi di prima: non è
      // un'asserzione del brief, serve solo a lasciare il documento pulito per i passi successivi.
      await page.keyboard.press("Escape")
      await membersEditor.waitFor({ state: "detached" })
    })

    await step("rinomina la seconda in Cliente, la collega alla prima con una generalizzazione", async () => {
      // Rinomina dal pannello proprietà, non con un doppio click sull'header: il secondo nodo non
      // riceve mai membri in questa scena, resta quindi "emptyExpanded" per sempre — e un doppio
      // click su una classe senza membri apre sempre il corpo, mai il nome (stessa ragione della
      // nota in testa al file). `ClassProperties.tsx` espone lo stesso comando di rinomina
      // (`renameClassWithNotice`) attraverso un `<input>` sempre raggiungibile qualunque sia lo
      // stato del nodo — a differenza dell'editor inline sul canvas.
      const clienteRect = await rectByName(page, "class") // il secondo nodo ha ancora il nome di default ("class")
      await page.mouse.click(clienteRect.x + clienteRect.w / 2, clienteRect.y + clienteRect.h / 2)
      const panelName = page.locator("#class-name")
      await panelName.waitFor()
      await panelName.fill("Cliente")
      await panelName.press("Enter")
      await page.waitForFunction(() => [...document.querySelectorAll("[data-node-id]")].some((g) => g.textContent.includes("Cliente")))

      // Collega Cliente (source, il figlio) a Persona (target, il padre): con lo strumento
      // relazione il down apre la connessione sul primo nodo toccato e l'up la commette sul
      // secondo — `addRelation(source, target)` in `class/commands.ts`. È l'ordine che conta per il
      // passo 8: la generalizzazione mette il `target` (il padre) a sinistra nell'export.
      await page.getByRole("radio", { name: "Relazione" }).click()
      const personaRect = await rectByName(page, "Persona")
      const clienteRect2 = await rectByName(page, "Cliente")
      await page.mouse.move(clienteRect2.x + clienteRect2.w / 2, clienteRect2.y + clienteRect2.h / 2)
      await page.mouse.down()
      await page.mouse.move(personaRect.x + personaRect.w / 2, personaRect.y + personaRect.h / 2, { steps: 5 })
      await page.mouse.up()
      await page.waitForSelector("[data-edge-id]")

      // La relazione appena creata è già selezionata (`commit-connect` lo fa): il pannello mostra
      // subito le sue proprietà, tipo compreso.
      const kind = page.getByLabel("Tipo")
      await kind.waitFor()
      await kind.selectOption("generalization")
    })

    await step("Disponi: il padre (Persona) ha y minore del figlio (Cliente)", async () => {
      const before = await signature(page)
      await page.getByRole("button", { name: "Disponi" }).click()
      // Il worker nasce alla prima richiesta e elkjs pesa ~1,5 MB: l'attesa è generosa di proposito
      // (stessa soglia di `layout.mjs`).
      await page.waitForFunction((before) => {
        const now = [...document.querySelectorAll("[data-node-id]")]
          .map((g) => `${g.getAttribute("data-node-id")}@${g.getAttribute("transform")}`)
          .sort()
          .join("|")
        return now !== before
      }, before, { timeout: 30_000 })

      const persona = await rectByName(page, "Persona")
      const cliente = await rectByName(page, "Cliente")
      // ADR 0006: i padri stanno sopra. `classLayoutGraph` inverte gli archi rispetto al modello
      // proprio per ottenere questo — nessun test unitario lo mostra, perché lì il worker di ELK è
      // finto: se l'inversione salta, questo è il solo posto che se ne accorge.
      if (!(persona.y < cliente.y)) throw new Error(`Persona (y=${persona.y}) non è sopra Cliente (y=${cliente.y})`)
    })

    await step("«Esporta testo…»: Persona compare prima di <|--, Cliente dopo", async () => {
      await expectMenu(page, "closed")
      await page.locator("[data-document-menu]").click()
      await expectMenu(page, "open")
      // Non `pickFromMenu`: la voce apre un dialog modale che tiene `body` bloccato finché resta
      // aperto, esattamente come "Esporta testo…" in `export-testo.mjs`.
      await page.getByRole("menuitem", { name: "Esporta testo…" }).click()
      await page.waitForSelector("[data-text-export-dialog]")
      const text = await page.locator("[data-export-preview]").textContent()

      await page.getByRole("button", { name: "Copia" }).click()
      const clipboard = await page.evaluate(() => navigator.clipboard.readText())
      if (clipboard !== text) throw new Error("gli appunti non contengono il testo mostrato nell'anteprima")

      // È l'asserzione che prende le frecce invertite: la generalizzazione mette il `target`
      // (il padre, Persona) a sinistra di `<|--` e il `source` (il figlio, Cliente) a destra
      // (`RELATION_TOKEN`/`TARGET_LEFT` in `io/emit/class-mermaid.ts`, §9 della spec).
      const iPersona = clipboard.indexOf("Persona")
      const iArrow = clipboard.indexOf("<|--")
      const iCliente = clipboard.indexOf("Cliente", iArrow)
      if (iPersona < 0 || iArrow < 0 || iCliente < 0 || !(iPersona < iArrow && iArrow < iCliente)) {
        throw new Error(`ordine dei lati sbagliato nell'export:\n${clipboard}`)
      }
    })

    await context.close()
  } catch (e) {
    failed = true
    console.error("\nFALLITO (class):", e)
  }
  console.log(failed ? "\ne2e class: FAIL" : "\ne2e class: PASS")
  return !failed
}

/** Guardia di esecuzione diretta: `node scripts/e2e/class.mjs` esegue solo questo scenario. */
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
