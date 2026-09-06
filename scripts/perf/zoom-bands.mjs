/**
 * Diagnostica di supporto alla misura FPS: p95 del tempo di frame durante lo zoom, banda di scala per
 * banda di scala, accanto al numero di entità davvero dentro l'inquadratura. Risponde a una domanda
 * sola: il costo dello zoom dipende da quante entità si vedono (e allora il culling del viewport lo
 * risolve) o dal numero di elementi nel DOM (e allora no)?
 *
 * Uso: `pnpm build` e poi `node scripts/perf/zoom-bands.mjs [N]`. Non è la misura del criterio:
 * quella è `pnpm perf`.
 */
import { spawn } from "node:child_process"
import { chromium } from "playwright"

const N = Number(process.argv[2] ?? 300)
const PORT = 4173
const URL = `http://localhost:${PORT}/?stress=${N}`
/** deltaY per tacca: fattore exp(0,02), cioè ~35 tacche per dimezzare la scala. */
const STEP = 2
const BANDS = [[1, 0.5], [0.5, 0.25], [0.25, 0.125], [0.125, 0.1]]

const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" })
try {
  await waitFor(URL)
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-size=1400,1000", "--window-position=0,0"] })
  const page = await browser.newPage({ viewport: null })
  await page.goto(URL)
  await page.waitForFunction((n) => document.querySelectorAll("[data-node-id]").length === n, N)
  await page.evaluate(() => {
    window.__frames = []
    const loop = (t) => { window.__frames.push(t); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
  })
  await page.waitForTimeout(500)

  const box = await page.locator("svg.dd-canvas").boundingBox()
  const scale = async () => +(await page.evaluate(() => document.querySelector("[data-viewport]").getAttribute("transform"))).match(/scale\(([\d.]+)\)/)[1]
  const wheel = async (ticks, dir) => { for (let i = 0; i < ticks; i++) await page.mouse.wheel(0, dir * STEP) }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.down("Control")
  await wheel(35, +1) // riscaldamento: una discesa e una risalita prima di misurare
  await wheel(35, -1)
  await page.waitForTimeout(300)

  console.log(`N=${N} · zoom per bande di scala (2 andate e ritorni per banda, ${STEP} di deltaY per tacca)`)
  console.log("| banda | tacche | frame | p95 ms | max ms | entità in vista |\n|---|---|---|---|---|---|")
  for (const [from, to] of BANDS) {
    let s = await scale()
    while (s > from * 1.01) { await page.mouse.wheel(0, STEP); s = await scale() }
    while (s < from * 0.99) { await page.mouse.wheel(0, -STEP); s = await scale() }
    await page.waitForTimeout(300)
    const ticks = Math.round(Math.log(from / to) / (STEP / 100))
    await page.evaluate(() => { window.__frames = [] })
    for (let r = 0; r < 2; r++) { await wheel(ticks, +1); await wheel(ticks, -1) }
    const frames = await page.evaluate(() => window.__frames)
    const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b)
    const p95 = gaps[Math.floor(gaps.length * 0.95)] ?? 0
    await wheel(ticks, +1)
    const inView = await entitiesInView(page)
    await wheel(ticks, -1)
    console.log(`| ${from} → ${to} | ${ticks} | ${frames.length} | ${p95.toFixed(1)} | ${(gaps.at(-1) ?? 0).toFixed(1)} | ${inView} |`)
  }
  await page.keyboard.up("Control")
  await browser.close()
} finally {
  preview.kill()
}

function entitiesInView(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("svg.dd-canvas").getBoundingClientRect()
    return [...document.querySelectorAll("[data-node-id]")].filter((g) => {
      const r = g.getBoundingClientRect()
      return r.right > svg.left && r.left < svg.right && r.bottom > svg.top && r.top < svg.bottom
    }).length
  })
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
