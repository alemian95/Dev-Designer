/** 2×: nitido sui display a densità doppia senza chiedere niente a chi esporta. */
export const PNG_SCALE = 2

/**
 * Rasterizza l'SVG in un PNG, alle dimensioni che l'SVG dichiara per sé.
 *
 * Un `<img>` disegna l'SVG in un contesto isolato che **non ha i font della pagina** né accede a
 * risorse esterne: è la ragione per cui `buildSvg` incorpora il woff2 in base64. Un `data:` URI
 * dentro l'SVG invece passa, e il blob URL è same-origin, quindi il canvas non risulta contaminato.
 */
export async function svgToPng(svg: string, scale = PNG_SCALE): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("l'SVG non è rasterizzabile"))
      img.src = url
    })

    // La misura si legge dall'immagine caricata: l'SVG porta già width e height, non serve ripassarle.
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("contesto 2d non disponibile")
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG non generato"))), "image/png")
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
