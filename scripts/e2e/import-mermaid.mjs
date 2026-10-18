/**
 * End-to-end dell'import Mermaid, ER, classi, flowchart e state: incolla → analizza → importa → re-importa senza
 * duplicare → annulla. Copre quello che i test unitari non vedono: la voce di menu, l'incollata vera, la
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

const CLASSES = `classDiagram
  Forma <|.. Quadrato
  Disegno "1" *-- "0..*" Forma : contiene
  class Forma {
    <<interface>>
    +area() double
  }
  class Quadrato {
    -Map~string, List~int~~ cache
  }
  note for Quadrato "lato #gt; 0"
  direction LR
`

const FLOW = `flowchart TD
  inizio([Inizio]) --> a
  subgraph p [Ufficio]
    a[Raccogli] --> b{Completo?}
    subgraph c [Contabilità]
      b -->|sì| d[[Registra]]
    end
  end
  b -.-> a
`

const STATE = `stateDiagram-v2
    [*] --> Ingested: Scraping / Polling completato
    Ingested --> Deduplicated: Check impronta / URL univoco
    Ingested --> Discarded: Duplicato esatto già catalogato
    Deduplicated --> Clustered: Raggruppato con topic correlati
    Clustered --> Enriched: Classificazione, Scoring e Tagging LLM
    Enriched --> SelectedForDraft: Scelto per inclusione in articolo
    SelectedForDraft --> Drafted: Bozza generata con successo
    Drafted --> Published: Revisione umana e approvazione
    Drafted --> Archived: Notizia superata o non pubblicata
    Discarded --> [*]
    Published --> [*]
    Archived --> [*]
    Published --> Distribuzione
    state Distribuzione {
        [*] --> Newsletter
        Newsletter --> Social
        Social --> [*]
    }
    Distribuzione --> [*]
    note right of Drafted : Revisione umana obbligatoria
`

const SEQUENCE = `sequenceDiagram
    autonumber
    actor Redattore
    participant Orchestrator as Redazione Orchestrator
    participant Storage as Database / Knowledge Base
    participant LLM as LLM Engine (Prompting)
    Redattore->>Orchestrator: Richiesta generazione articolo (es. Formato: Newsletter, Topic: Ultimi 3 giorni)
    Orchestrator->>Storage: Query NewsCluster (ImpactScore >= 4, Stato: Unprocessed)
    Storage-->>Orchestrator: Ritorna lista cluster con rispettivi RawItems e fonti
    Orchestrator->>Orchestrator: Compone contesto & prompt con linee guida editoriali e fonti
    Orchestrator->>LLM: Invia prompt (Sintesi, Analisi comparativa, TL#59;DR, Richiesta citazioni)
    LLM-->>Orchestrator: Ritorna testo strutturato (Headline, TL#59;DR, Sezioni, Fonti referenziate)
    Orchestrator->>Orchestrator: Valida link e integra metadati citazioni
    Orchestrator->>Storage: Salva ArticleDraft (Stato: DRAFT)
    Orchestrator-->>Redattore: Presenta bozza formattata in Markdown per revisione
    Redattore->>Orchestrator: Approva / Modifica bozza
    Orchestrator->>Storage: Aggiorna stato in APPROVED
`

const MARKDOWN = "# Note\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```mermaid\n" + ER + "```\n"
const MARKDOWN_STATE = "```mermaid\nflowchart LR\n  A --> B\n```\n\n```mermaid\n" + STATE + "```\n"

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
const classEdgeCount = (page) => page.evaluate(() => document.querySelectorAll('[data-edge-id^="class/"]').length)
const flowEdgeCount = (page) => page.evaluate(() => document.querySelectorAll('[data-edge-id^="flow/"]').length)
const poolCount = (page) => page.evaluate(() => document.querySelectorAll("[data-pool]").length)
const noteCount = (page) => page.evaluate(() => document.querySelectorAll("[data-note-fold]").length)

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

    await step("in un .md analizza il primo blocco, un flowchart, e passa al blocco ER", async () => {
      await openDialog(page)
      await paste(page, MARKDOWN)
      await expectText(page, "[data-import-summary]", "2 nodi, 1 archi, 0 pool")
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

    await step("analizza il classDiagram incollato, con l'avviso sulla direzione", async () => {
      await openDialog(page)
      await paste(page, CLASSES)
      await expectText(page, "[data-import-summary]", "3 classi, 2 relazioni, 1 note")
      await expectText(page, "[data-import-warnings]", "1 avvisi")
    })

    await step("importa tre classi, due relazioni e la nota ancorata", async () => {
      await page.getByRole("button", { name: /^Importa 3 classi$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await expectText(page, "[data-import-mermaid-dialog]", "con 1 note")
      await closeDialog(page)
      await expectNodes(page, 4)
      const edges = await classEdgeCount(page)
      if (edges !== 2) throw new Error(`attese 2 relazioni, trovate ${edges}`)
    })

    await step("il re-import delle classi non duplica relazioni né note", async () => {
      await openDialog(page)
      await paste(page, CLASSES)
      await expectText(page, "[data-import-mermaid-dialog]", "identica, saltata")
      await page.getByRole("checkbox").first().click()
      await page.getByRole("button", { name: /^Importa 1 classi$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await closeDialog(page)
      await expectNodes(page, 4)
      const edges = await classEdgeCount(page)
      if (edges !== 2) throw new Error(`attese 2 relazioni, trovate ${edges}`)
    })

    await step("una classe presente nominata solo in una relazione non si svuota", async () => {
      await openDialog(page)
      await paste(page, "classDiagram\n  Forma <-- Pennello\n")
      await expectText(page, "[data-import-mermaid-dialog]", "identica, saltata")
      await page.getByRole("button", { name: /^Importa 1 classi$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await closeDialog(page)
      await expectNodes(page, 5)
      await expectText(page, '[data-node-id="class/Forma"]', "area")
    })

    await step("annulla con ⌘Z gli import delle classi", async () => {
      await page.keyboard.press("ControlOrMeta+z")
      await page.keyboard.press("ControlOrMeta+z")
      await page.keyboard.press("ControlOrMeta+z")
      await expectNodes(page, 0)
    })

    await step("analizza il flowchart incollato, senza caselle e con gli avvisi su direzione e stile", async () => {
      await openDialog(page)
      await paste(page, FLOW)
      await expectText(page, "[data-import-summary]", "4 nodi, 4 archi, 1 pool")
      await expectText(page, "[data-import-warnings]", "2 avvisi")
      const boxes = await page.getByRole("checkbox").count()
      if (boxes !== 0) throw new Error(`il flowchart non ha caselle, trovate ${boxes}`)
    })

    await step("importa il flowchart intero, con il pool e le sue corsie, disposto da ELK", async () => {
      await page.getByRole("button", { name: /^Importa 4 nodi$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await expectText(page, "[data-import-mermaid-dialog]", "con 1 pool")
      await closeDialog(page)
      await expectNodes(page, 4)
      const edges = await flowEdgeCount(page)
      if (edges !== 4) throw new Error(`attesi 4 archi, trovati ${edges}`)
      if ((await poolCount(page)) !== 1) throw new Error("atteso 1 pool")
    })

    await step("il re-import del flowchart lo aggiunge di nuovo, e due ⌘Z lo tolgono", async () => {
      await openDialog(page)
      await paste(page, FLOW)
      await page.getByRole("button", { name: /^Importa 4 nodi$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await closeDialog(page)
      await expectNodes(page, 8)
      if ((await poolCount(page)) !== 2) throw new Error("attesi 2 pool")
      await page.keyboard.press("ControlOrMeta+z")
      await page.keyboard.press("ControlOrMeta+z")
      await expectNodes(page, 0)
      if ((await poolCount(page)) !== 0) throw new Error("attesi 0 pool")
    })

    await step("analizza lo stateDiagram incollato, senza caselle, con il composto e la nota", async () => {
      await openDialog(page)
      await paste(page, STATE)
      await expectText(page, "[data-import-summary]", "15 nodi, 17 archi, 1 pool, 1 note")
      const boxes = await page.getByRole("checkbox").count()
      if (boxes !== 0) throw new Error(`lo state non ha caselle, trovate ${boxes}`)
    })

    await step("importa lo state con il pool del composto e la nota, e ⌘Z lo toglie", async () => {
      await page.getByRole("button", { name: /^Importa 15 nodi$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await closeDialog(page)
      await expectNodes(page, 16)
      if ((await poolCount(page)) !== 1) throw new Error("atteso 1 pool")
      if ((await noteCount(page)) !== 1) throw new Error("attesa 1 nota")
      await page.keyboard.press("ControlOrMeta+z")
      await expectNodes(page, 0)
      if ((await poolCount(page)) !== 0) throw new Error("attesi 0 pool")
    })

    await step("in un .md con un flowchart e uno state passa al blocco state e lo rianalizza", async () => {
      await openDialog(page)
      await paste(page, MARKDOWN_STATE)
      await expectText(page, "[data-import-blocks]", "Blocco 1 · flowchart")
      await expectText(page, "[data-import-summary]", "2 nodi, 1 archi, 0 pool")
      await page.locator("[data-import-blocks]").getByText("Blocco 2 · state").click()
      await expectText(page, "[data-import-summary]", "15 nodi, 17 archi, 1 pool, 1 note")
      await closeDialog(page)
    })

    await step("analizza la sequenza del redattore incollata, senza caselle", async () => {
      await openDialog(page)
      await paste(page, SEQUENCE)
      await expectText(page, "[data-import-summary]", "4 partecipanti, 11 messaggi, 0 blocchi")
      const boxes = await page.getByRole("checkbox").count()
      if (boxes !== 0) throw new Error(`la sequenza non ha caselle, trovate ${boxes}`)
    })

    await step("importa la sequenza con i suoi partecipanti, e ⌘Z la toglie", async () => {
      await page.getByRole("button", { name: /^Importa 1 sequenza$/ }).click()
      await page.waitForSelector("[data-import-mermaid-dialog] strong")
      await expectText(page, "[data-import-mermaid-dialog]", "4 partecipanti e 11 messaggi")
      await closeDialog(page)
      await page.waitForSelector('[data-node-id^="sequence/"]')
      const lifelines = await page.locator("[data-lifeline]").count()
      if (lifelines !== 4) throw new Error(`attese 4 linee di vita, trovate ${lifelines}`)
      await page.keyboard.press("ControlOrMeta+z")
      await page.waitForSelector('[data-node-id^="sequence/"]', { state: "detached" })
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
