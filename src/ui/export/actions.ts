import fontUrl from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { download } from "@/io/file"
import { svgToPng } from "./png"
import { buildSvg } from "./svg"

/**
 * I colori che il canvas usa davvero, più `--background` per il fondo: nell'app lo dipinge il div
 * attorno all'svg, nell'export deve stare dentro il file. Fuori dall'app `var()` non risolve niente.
 */
const COLOR_VARS = ["--background", "--border", "--card", "--foreground", "--muted", "--muted-foreground", "--primary"]

/** Non è un colore: si copia così com'è. */
const FONT_VAR = "--font-mono"

/** Famiglia dichiarata da `--font-mono`: l'`@font-face` incorporato deve chiamarsi così. */
const FONT_FAMILY = "JetBrains Mono Variable"

/**
 * Valori delle variabili nel tema **chiaro**, qualunque sia il tema attivo.
 *
 * Le immagini finiscono in README, PR e documenti, che hanno fondo chiaro. Se il tema scuro è
 * attivo la classe si toglie per la lettura e si rimette subito: `getComputedStyle` forza un
 * ricalcolo sincrono degli stili e non si cede mai al loop degli eventi, quindi nessun frame
 * viene dipinto nel mezzo e non si vede alcuno sfarfallio.
 */
function readLightVars(): Record<string, string> {
  const root = document.documentElement
  const wasDark = root.classList.contains("dark")
  if (wasDark) root.classList.remove("dark")
  try {
    const style = getComputedStyle(root)
    const toSrgb = srgbConverter()
    const vars: Record<string, string> = { [FONT_VAR]: style.getPropertyValue(FONT_VAR).trim() }
    for (const name of COLOR_VARS) vars[name] = toSrgb(style.getPropertyValue(name).trim())
    return vars
  } finally {
    if (wasDark) root.classList.add("dark")
  }
}

/**
 * Converte un colore CSS in sRGB dipingendolo su un canvas 1×1 e rileggendo il pixel.
 *
 * Il tema è scritto in `oklch()`, che Chrome disegna ma Inkscape e Illustrator non capiscono: un
 * SVG con `oklch` lì si apre senza colori. Il canvas fa la conversione senza librerie —
 * `getComputedStyle` non la fa, e nemmeno il getter di `fillStyle`, verificati entrambi.
 *
 * Sotto opacità 1 la rilettura non-premoltiplicata arrotonda di qualche unità: irrilevante su un
 * bordo al 10%, che è l'unico caso nel tema.
 */
function srgbConverter(): (value: string) => string {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return (value) => value

  const hex = (n: number) => n.toString(16).padStart(2, "0")
  return (value) => {
    ctx.clearRect(0, 0, 1, 1)
    // Un valore non valido lascia fillStyle al precedente: è anche il modo di accorgersene.
    ctx.fillStyle = "#000000"
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const [r = 0, g = 0, b = 0, a = 255] = ctx.getImageData(0, 0, 1, 1).data
    return a === 255 ? `#${hex(r)}${hex(g)}${hex(b)}` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
  }
}

let fontFacePromise: Promise<string | undefined> | undefined

/**
 * `@font-face` col woff2 latin in base64 (~40 KB, ~54 KB codificato).
 *
 * Serve a due cose diverse: rende l'SVG leggibile su macchine senza il font, e rende possibile il
 * PNG, che altrimenti si rasterizzerebbe con un monospace qualsiasi — e le scatole sono
 * dimensionate su `CHAR_W = FONT_SIZE * 0.6`, cioè sull'avanzamento di questo font.
 *
 * Si scarica una volta sola. Se non si riesce, si esporta senza: meglio un file col font sbagliato
 * che nessun file.
 */
function loadFontFace(): Promise<string | undefined> {
  fontFacePromise ??= (async () => {
    try {
      const blob = await fetch(fontUrl).then((r) => r.blob())
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error("font non leggibile"))
        reader.readAsDataURL(blob)
      })
      return `@font-face{font-family:'${FONT_FAMILY}';font-style:normal;font-weight:100 800;src:url(${dataUrl}) format('woff2')}`
    } catch {
      return undefined
    }
  })()
  return fontFacePromise
}

/** `/` in un nome di documento troncherebbe il nome del file scaricato. */
function fileName(extension: string): string {
  const name = documentStore.getState().doc.name.trim() || "diagramma"
  return `${name.replaceAll(/[\\/:*?"<>|]/g, "-")}.${extension}`
}

async function currentSvg(): Promise<string | null> {
  return buildSvg(erDiagram(documentStore.getState().doc), { vars: readLightVars(), fontFace: await loadFontFace() })
}

/** Esporta il diagramma come SVG. Non fa nulla se non c'è nessuna entità. */
export async function exportSvg(): Promise<void> {
  const svg = await currentSvg()
  if (svg) download(fileName("svg"), svg, "image/svg+xml")
}

/** Esporta il diagramma come PNG a 2×. Non fa nulla se non c'è nessuna entità. */
export async function exportPng(): Promise<void> {
  const svg = await currentSvg()
  if (svg) download(fileName("png"), await svgToPng(svg), "image/png")
}
