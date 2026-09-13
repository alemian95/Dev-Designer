import { useEffect, useRef, type ReactNode } from "react"
import { sessionStore } from "@/editor/session-store"
import { transformAttr } from "@/editor/viewport"

/**
 * Quanto si aspetta, dall'ultimo cambio di scala, prima di considerare finito il gesto e rimettere
 * i corpi. Una rotella vera manda tacche ogni poche decine di millisecondi, un pinch molto più
 * spesso: 120 ms tiene insieme il gesto senza far restare i corpi via dopo che è finito.
 */
const ZOOM_IDLE_MS = 120

/** Il transform del viewport si applica dal DOM, fuori dal render: pan e zoom non ri-renderizzano l'albero. */
export function ViewportGroup({ children }: { children: ReactNode }) {
  const ref = useRef<SVGGElement>(null)
  useEffect(() => {
    const g = ref.current
    if (!g) return
    const apply = () => g.setAttribute("transform", transformAttr(sessionStore.getState().viewport))
    apply()

    /**
     * **Livello di dettaglio mentre la scala cambia** (`data-zooming`, la regola sta in
     * `index.css`). Misurato: il costo di uno zoom è tutto layout del testo, ed è **per glifo** —
     * 3.900 `<text>` svuotati del contenuto costano 207 ms di layout contro i 2.082 degli stessi
     * elementi pieni. Un cambio di scala rifà il layout di ogni glifo del documento, anche dei
     * nodi fuori dall'inquadratura, che alla scala 1 sono 292 su 300.
     *
     * Nessuna scorciatoia più economica esiste, ed è stato misurato anziché supposto: applicare la
     * scala come transform CSS invece che come attributo SVG non cambia nulla (25,2 contro 25,3 ms
     * di p95), e nemmeno `text-rendering`, `font-kerning`, `shape-rendering` o `contain`. L'unica
     * leva è togliere i glifi dal layout.
     *
     * **Dal secondo cambio in poi, non dal primo.** Un cambio isolato — «Adatta», mod+0, una
     * tacca sola — costa un frame caro e basta, e far sparire i corpi per 120 ms sarebbe un
     * lampeggio senza contropartita. Il gesto si riconosce da due cambi ravvicinati.
     */
    let lastChange = 0
    let idle: ReturnType<typeof setTimeout> | null = null
    const restore = () => {
      idle = null
      g.removeAttribute("data-zooming")
    }

    const unsubscribe = sessionStore.subscribe((s, prev) => {
      if (s.viewport === prev.viewport) return
      apply()
      if (s.viewport.scale === prev.viewport.scale) return
      const now = performance.now()
      const gesture = now - lastChange < ZOOM_IDLE_MS
      lastChange = now
      if (!gesture) return
      g.setAttribute("data-zooming", "")
      if (idle) clearTimeout(idle)
      idle = setTimeout(restore, ZOOM_IDLE_MS)
    })

    return () => {
      unsubscribe()
      if (idle) clearTimeout(idle)
    }
  }, [])
  return <g ref={ref} data-viewport>{children}</g>
}
