/**
 * Misura FPS a frame dipinti: build di produzione servita da `vite preview`, Chrome di sistema
 * visibile, eventi mouse reali via CDP. Per scenario: FPS medio, p95 e massimo del tempo di frame
 * (rAF-to-rAF, quindi layout e paint inclusi).
 *
 * Uso: `pnpm perf [N]` (default 300 entità). `HEADLESS=1` solo per diagnosi: headless non dipinge
 * sullo schermo e i numeri non valgono come misura.
 */
import { spawn } from "node:child_process"
import { chromium } from "playwright"

const N = Number(process.argv[2] ?? 300)
const PORT = 4173
const URL = `http://localhost:${PORT}/?stress=${N}`
const W = 1400
const H = 900
/** Criterio del piano: p95 del tempo di frame ≤ 20 ms (≥ 50 FPS) a 300 entità. */
const THRESHOLD_MS = 20
const WHEEL_STEP = 8
const WHEEL_TICKS = 30
const DRAG_STEPS = 120

const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
try {
  await waitFor(URL)
  const browser = await launch()
  const page = await browser.newPage({ viewport: null })
  // Un'eccezione dentro un listener dell'app spegne l'interazione senza dirlo: qui deve vedersi.
  page.on("pageerror", (err) => console.error(`ERRORE nella pagina: ${err.message}`))
  page.on("console", (msg) => msg.type() === "error" && console.error(`CONSOLE error: ${msg.text()}`))
  await page.goto(URL)
  await page.waitForSelector("[data-node-id]")
  await page.waitForFunction((n) => document.querySelectorAll("[data-node-id]").length === n, N)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Performance.enable")
  const env = await fitWindow(cdp, page)
  await startFrameLoop(page)

  const canvas = await canvasBox(page)
  const baseline = await measure(page, cdp, async (p) => { await p.waitForTimeout(1500) })
  console.log(`Ambiente: viewport ${env.w}×${env.h} CSS px · devicePixelRatio ${env.dpr} · ${env.ua}`)
  console.log(`Riposo (nessuna interazione): ${baseline.frames} frame, p95 ${baseline.p95} ms, avg ${baseline.fpsAvg} FPS — è il pavimento imposto dal display.`)
  // Una finestra coperta o minimizzata fa strozzare i rAF da Chrome: i numeri che seguirebbero non varrebbero nulla.
  if (baseline.p95 > THRESHOLD_MS) console.warn("ATTENZIONE: a riposo i frame sono già lenti. La finestra di Chrome è coperta o l'FPS è strozzato: misura non valida.\n")
  else console.log("")

  // Giro di riscaldamento non misurato: il primo drag paga il JIT e la prima resa di ogni layer.
  for (const s of scenarios(canvas)) await runScenario(page, cdp, s, false)

  const results = {}
  const notes = {}
  const cost = {}
  for (const s of scenarios(canvas)) {
    const { stats, note, metrics } = await runScenario(page, cdp, s, true)
    results[s.name] = stats
    notes[s.name] = note
    cost[s.name] = metrics
  }

  console.table(results)
  console.log(`\n| Scenario | FPS medio | p95 ms/frame | max ms/frame |\n|---|---|---|---|`)
  for (const [name, r] of Object.entries(results)) console.log(`| ${name} | ${r.fpsAvg} | ${r.p95} | ${r.max} |`)
  const worst = Math.max(...Object.values(results).map((r) => r.p95))
  // Senza questo lo script esce 0 anche su FAIL, quindi in una pipeline passerebbe sempre: il
  // criterio sarebbe scritto e misurato, e nessuno lo farebbe rispettare.
  if (worst > THRESHOLD_MS) process.exitCode = 1
  console.log(`\nN=${N} · p95 peggiore ${worst} ms → ${worst <= THRESHOLD_MS ? "PASS" : "FAIL"} (criterio p95 ≤ ${THRESHOLD_MS} ms)`)
  console.log(`\nVerdetto per scenario (p95 ≤ ${THRESHOLD_MS} ms):`)
  for (const [name, r] of Object.entries(results)) console.log(`  ${name.padEnd(11)} p95 ${String(r.p95).padStart(5)} ms → ${r.p95 <= THRESHOLD_MS ? "PASS" : "FAIL"}`)
  console.log("\nProva che lo scenario ha fatto quello che dichiara:")
  for (const [name, note] of Object.entries(notes)) console.log(`  ${name.padEnd(11)} ${note}`)
  console.log("\nDove va il tempo, dal profiler di Chrome (ms sull'intero scenario):")
  console.log(`| Scenario | durata | script | stile | layout |\n|---|---|---|---|---|`)
  for (const [name, m] of Object.entries(cost)) console.log(`| ${name} | ${m.task} | ${m.script} | ${m.style} | ${m.layout} |`)

  await browser.close()
} finally {
  preview.kill()
}

// ————— infrastruttura —————

async function launch() {
  const headless = process.env.HEADLESS === "1"
  const args = [`--window-size=${W},${H + 120}`, "--window-position=0,0"]
  try {
    return await chromium.launch({ channel: "chrome", headless, args })
  } catch {
    console.warn("Chrome di sistema non trovato: uso il Chromium di Playwright (pnpm exec playwright install chromium)")
    return chromium.launch({ headless, args })
  }
}

async function waitFor(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch { /* server non ancora pronto */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`vite preview non risponde su ${url}`)
}

/**
 * Niente `Emulation.setDeviceMetricsOverride`: si ridimensiona la finestra vera, così la pagina è
 * dipinta sul display alla sua densità nativa. Ritorna il viewport davvero ottenuto.
 */
async function fitWindow(cdp, page) {
  const inner = () => page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent }))
  let got = await inner()
  try {
    const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget")
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { width: bounds.width + (W - got.w), height: bounds.height + (H - got.h) },
    })
    await page.waitForTimeout(300)
    got = await inner()
  } catch (err) {
    console.warn(`Ridimensionamento della finestra non riuscito (${err.message}): misuro sul viewport reale.`)
  }
  return { ...got, ua: got.ua.match(/Chrome\/[\d.]+/)?.[0] ?? got.ua }
}

/** Un solo rAF loop per tutta la sessione: `__frames` raccoglie i timestamp dei frame. */
async function startFrameLoop(page) {
  await page.evaluate(() => {
    window.__frames = []
    const loop = (t) => { window.__frames.push(t); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
  })
  await page.waitForTimeout(500)
}

async function metricsSnapshot(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics")
  const get = (name) => metrics.find((m) => m.name === name)?.value ?? 0
  return { task: get("TaskDuration"), script: get("ScriptDuration"), style: get("RecalcStyleDuration"), layout: get("LayoutDuration") }
}

/** Azzera i frame, esegue lo scenario, ricava le statistiche dai timestamp raccolti nella pagina. */
async function measure(page, cdp, scenario) {
  await page.evaluate(() => { window.__frames = [] })
  const before = await metricsSnapshot(cdp)
  const note = await scenario(page)
  const after = await metricsSnapshot(cdp)
  const frames = await page.evaluate(() => window.__frames)
  const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b)
  const span = frames.length > 1 ? frames.at(-1) - frames[0] : 0
  const p95 = gaps[Math.floor(gaps.length * 0.95)] ?? 0
  const ms = (v) => +v.toFixed(1)
  return {
    frames: frames.length,
    ms: ms(span),
    fpsAvg: +(gaps.length / (span / 1000)).toFixed(1),
    p95: ms(p95),
    max: ms(gaps.at(-1) ?? 0),
    note,
    metrics: {
      task: ms((after.task - before.task) * 1000),
      script: ms((after.script - before.script) * 1000),
      style: ms((after.style - before.style) * 1000),
      layout: ms((after.layout - before.layout) * 1000),
    },
  }
}

/**
 * Ogni tanto la pagina ignora del tutto il pointerdown e lo scenario non parte (causa non chiarita:
 * succede solo dentro questa automazione). Le verifiche dello scenario lo intercettano e qui si
 * ritenta una volta sola, dichiarandolo: un numero ottenuto al secondo tentativo non deve sembrare
 * uguale agli altri.
 */
async function runScenario(page, cdp, scenario, keep) {
  for (let attempt = 1; ; attempt++) {
    await resetScene(page)
    try {
      if (scenario.prepare) await scenario.prepare(page)
      await page.waitForTimeout(200)
      const { note, metrics, ...stats } = await measure(page, cdp, scenario.run)
      if (scenario.after) await scenario.after(page)
      return keep ? { stats, note: attempt > 1 ? `${note} [ripetuto ${attempt}×]` : note, metrics } : {}
    } catch (err) {
      if (attempt >= 2) throw err
      // Niente `after`: gli scenari falliscono prima di modificare il documento, non c'è nulla da annullare.
      console.warn(`Scenario ${scenario.name} non partito (${err.message}): lo ripeto.`)
    }
  }
}

/** Vista reimpostata (mod+0) e selezione vuota (Esc) prima di ogni scenario: scenari indipendenti. */
async function resetScene(page) {
  await page.keyboard.press("Escape")
  await page.keyboard.press("ControlOrMeta+0")
  await page.waitForTimeout(150)
}

async function canvasBox(page) {
  const box = await page.locator("svg.dd-canvas").boundingBox()
  if (!box) throw new Error("canvas non trovato")
  return box
}

function at(box, x, y) {
  return { x: box.x + x, y: box.y + y }
}

async function headerCenter(page, key) {
  const box = await page.locator(`[data-node-id="${key}"] [data-node-header]`).first().boundingBox()
  if (!box) throw new Error(`entità ${key} non visibile`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function nodeTransform(page, key) {
  return page.evaluate((k) => document.querySelector(`[data-node-id="${k}"]`)?.getAttribute("transform"), key)
}

function viewportTransform(page) {
  return page.evaluate(() => document.querySelector("[data-viewport]")?.getAttribute("transform"))
}

/** I nodi selezionati sono gli unici con il bordo a 2 px (`EntityNodeView`). */
function selectedCount(page) {
  return page.evaluate(() => document.querySelectorAll('[data-node-id] > rect[stroke-width="2"]').length)
}

function undo(page) {
  return page.keyboard.press("ControlOrMeta+z")
}

// ————— scenari —————

/**
 * Il puntatore viene portato sul punto di partenza nella preparazione, non nello scenario misurato:
 * fra il `move` e il `down` deve passare una pausa, altrimenti il down può arrivare prima che la
 * pagina abbia processato il move e l'interazione non parte affatto (misura silenziosamente falsa).
 * Ogni scenario verifica di aver fatto quello che dichiara e altrimenti solleva: meglio niente numeri
 * che numeri di un'interazione mai avvenuta.
 */
function scenarios(box) {
  const ctx = { start: null, before: null }

  const aimAtHeader = async (page) => {
    ctx.before = await nodeTransform(page, "t0")
    ctx.start = await headerCenter(page, "t0")
    await page.mouse.move(ctx.start.x, ctx.start.y)
  }
  const dragHeader = async (page) => {
    await page.mouse.down()
    await page.mouse.move(ctx.start.x + 300, ctx.start.y + 200, { steps: DRAG_STEPS })
    await page.mouse.up()
    const after = await nodeTransform(page, "t0")
    if (after === ctx.before) throw new Error(`drag non riuscito: t0 fermo su ${after}`)
    return `t0 ${ctx.before} → ${after}`
  }
  const aimAtCenter = async (page) => {
    ctx.before = await viewportTransform(page)
    ctx.start = at(box, box.width / 2, box.height / 2)
    await page.mouse.move(ctx.start.x, ctx.start.y)
  }

  return [
    {
      name: "drag",
      prepare: aimAtHeader,
      run: dragHeader,
      after: undo,
    },
    {
      name: "dragAll",
      prepare: aimAtHeader,
      run: async (page) => {
        await page.keyboard.press("ControlOrMeta+a")
        const selected = await selectedCount(page)
        if (selected !== N) throw new Error(`mod+A ha selezionato ${selected} entità su ${N}`)
        return `${selected} entità selezionate · ${await dragHeader(page)}`
      },
      after: undo,
    },
    {
      name: "pan",
      prepare: aimAtCenter,
      run: async (page) => {
        await page.mouse.down({ button: "middle" })
        await page.mouse.move(ctx.start.x - 400, ctx.start.y - 300, { steps: DRAG_STEPS })
        await page.mouse.up({ button: "middle" })
        const after = await viewportTransform(page)
        if (after === ctx.before) throw new Error(`pan non riuscito: viewport fermo su ${after}`)
        return `viewport ${ctx.before} → ${after}`
      },
    },
    {
      name: "marquee",
      prepare: async (page) => {
        await nudgeView(page, box)
        ctx.start = at(box, 20, 20)
        const onEntity = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-node-id]"), ctx.start)
        if (onEntity) throw new Error("il marquee partirebbe sopra un'entità, non sul vuoto")
        await page.mouse.move(ctx.start.x, ctx.start.y)
      },
      run: async (page) => {
        await page.mouse.down()
        await page.mouse.move(box.x + box.width - 40, box.y + box.height - 40, { steps: DRAG_STEPS })
        await page.mouse.up()
        const selected = await selectedCount(page)
        if (selected === 0) throw new Error("marquee non riuscito: nessuna entità selezionata")
        return `${selected} entità selezionate su ${N} (solo quelle nell'inquadratura)`
      },
    },
    { name: "zoom", prepare: aimAtCenter, run: zoom },
    {
      // Sesto scenario, in più rispetto ai cinque del criterio: il marquee a scala 1 seleziona solo
      // le entità inquadrate (una decina), mentre il caso peggiore atteso dallo spike è la selezione
      // di tutte insieme. Si misura da vista rimpicciolita, con tutto il diagramma dentro.
      name: "marqueeAll",
      prepare: async (page) => {
        await page.keyboard.press("f") // fit: tutto il diagramma inquadrato, con margine
        ctx.start = at(box, 10, 10)
        const onEntity = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-node-id]"), ctx.start)
        if (onEntity) throw new Error("il marquee partirebbe sopra un'entità, non sul vuoto")
        await page.mouse.move(ctx.start.x, ctx.start.y)
      },
      run: async (page) => {
        await page.mouse.down()
        await page.mouse.move(box.x + box.width - 40, box.y + box.height - 40, { steps: DRAG_STEPS })
        await page.mouse.up()
        const selected = await selectedCount(page)
        // Oltre le ~400 entità il fit sbatte sulla scala minima (0,1) e il diagramma non ci sta tutto.
        if (selected < N / 2) throw new Error(`marquee totale non riuscito: ${selected} entità selezionate su ${N}`)
        return `${selected} entità selezionate su ${N}${selected < N ? " (il resto è fuori: fit fermo alla scala minima)" : " (tutte)"}`
      },
    },
  ]
}

/** Sposta la vista così l'angolo in alto a sinistra del canvas resta vuoto: lì parte il marquee. */
async function nudgeView(page, box, delta = 120) {
  const from = at(box, box.width / 2, box.height / 2)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: "middle" })
  await page.mouse.move(from.x + delta, from.y + delta, { steps: 10 })
  await page.mouse.up({ button: "middle" })
}

/**
 * Zoom con ctrl+rotella attorno al centro del canvas: 30 tacche indietro (fino al minimo, tutto il
 * diagramma in vista) e 30 avanti. `WHEEL_STEP` è piccolo apposta, così ogni tacca cambia davvero la
 * scala: con tacche grandi lo zoom sbatte sui limiti 0,1/4 e le tacche restanti non ridisegnano nulla.
 */
async function zoom(page) {
  const scale = async () => +(await viewportTransform(page)).match(/scale\(([\d.]+)\)/)[1]
  await page.keyboard.down("Control")
  const from = await scale()
  for (let i = 0; i < WHEEL_TICKS; i++) await page.mouse.wheel(0, WHEEL_STEP)
  const out = await scale()
  for (let i = 0; i < WHEEL_TICKS; i++) await page.mouse.wheel(0, -WHEEL_STEP)
  const back = await scale()
  await page.keyboard.up("Control")
  if (out >= from) throw new Error(`zoom non riuscito: scala ${from} → ${out}`)
  const nodes = await page.evaluate(() => document.querySelectorAll("[data-node-id]").length)
  return `scala ${from} → ${out.toFixed(2)} → ${back.toFixed(2)} · ${nodes} nodi nel DOM`
}
