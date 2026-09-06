import { useEffect, useRef, type ReactNode } from "react"
import { sessionStore } from "@/editor/session-store"
import { transformAttr } from "@/editor/viewport"

/** Il transform del viewport si applica dal DOM, fuori dal render: pan e zoom non ri-renderizzano l'albero. */
export function ViewportGroup({ children }: { children: ReactNode }) {
  const ref = useRef<SVGGElement>(null)
  useEffect(() => {
    const apply = () => ref.current?.setAttribute("transform", transformAttr(sessionStore.getState().viewport))
    apply()
    return sessionStore.subscribe((s, prev) => {
      if (s.viewport !== prev.viewport) apply()
    })
  }, [])
  return <g ref={ref} data-viewport>{children}</g>
}
