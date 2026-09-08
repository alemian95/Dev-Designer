/**
 * Aiuti puri sul browser condivisi fra gli script e2e: lanciare Chrome, aspettare che il server sia
 * su, e le due attese sudate sul menu Radix. `step`, `watch` e la contabilità degli errori restano
 * in ciascuno script perché sono legati al suo esito, non al browser.
 */
import { chromium } from "playwright"

export async function launch() {
  const headless = process.env.HEADLESS !== "0"
  try {
    return await chromium.launch({ channel: "chrome", headless })
  } catch {
    console.warn("Chrome di sistema non trovato: uso il Chromium di Playwright (pnpm exec playwright install chromium)")
    return chromium.launch({ headless })
  }
}

export async function waitFor(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch { /* il server non è ancora su */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`vite preview non risponde su ${url}`)
}

export async function expectNodes(page, n) {
  await page.waitForFunction((n) => document.querySelectorAll("[data-node-id]").length === n, n, { timeout: 5000 })
}

export async function expectText(page, selector, text) {
  await page.waitForFunction(([s, t]) => [...document.querySelectorAll(s)].some((el) => el.textContent.includes(t)), [selector, text], { timeout: 5000 })
}

/**
 * Aspetta che il menu documento sia davvero aperto o davvero chiuso. Il `data-state` del trigger
 * non basta: torna "closed" mentre Radix sta ancora smontando il pannello e mentre `body` ha
 * ancora `pointer-events: none`, e un click che cade in quella finestra si perde.
 */
export async function expectMenu(page, state) {
  await page.waitForFunction((s) => {
    const open = document.querySelector("[data-document-menu]")?.dataset.state === "open"
    const panels = document.querySelectorAll('[role="menu"]').length
    const blocked = getComputedStyle(document.body).pointerEvents === "none"
    return s === "open" ? open && panels === 1 : !open && panels === 0 && !blocked
  }, state, { timeout: 5000 })
}

/**
 * Apre il menu documento e clicca una voce. Le due attese non sono decorative: cliccare il trigger
 * mentre il menu precedente si sta ancora chiudendo lo richiude, e il click cade su una voce che
 * si stacca dal DOM sotto le mani di Playwright ("element is not stable" e poi "detached").
 */
export async function pickFromMenu(page, item) {
  await expectMenu(page, "closed")
  await page.locator("[data-document-menu]").click()
  await expectMenu(page, "open")
  await item.click()
  await expectMenu(page, "closed")
}
